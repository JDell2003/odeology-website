(() => {
  const $ = (sel) => document.querySelector(sel);
  const COACH_BADGE_OPTIONS = [
    'Builder',
    'Advanced',
    'Fat Loss',
    'Muscle Gain',
    'Strength',
    'Lifestyle',
    'Accountability',
    'Nutrition',
    'Form Fixes',
    'Athletes'
  ];
  const SPECIALTY_CLIENT_OPTIONS = [
    'Fat loss',
    'Muscle gain',
    'Body recomposition',
    'Busy professionals',
    'Beginners',
    'Strength',
    'Athletes',
    'Lifestyle',
    'Wedding prep',
    'Postpartum'
  ];
  const SOCIAL_LINK_DEFS = [
    {
      key: 'instagramUrl',
      type: 'instagram',
      label: 'Instagram',
      placeholder: 'https://instagram.com/you',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect><circle cx="12" cy="12" r="4.1"></circle><circle cx="17.3" cy="6.9" r="1.1"></circle></svg>'
    },
    {
      key: 'tiktokUrl',
      type: 'tiktok',
      label: 'TikTok',
      placeholder: 'https://tiktok.com/@you',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5c.7 2 2.1 3.2 4 3.6v2.7c-1.6-.1-2.9-.6-4-1.5v5.9a5.1 5.1 0 1 1-5.1-5.1c.4 0 .8 0 1.2.1v2.8a2.5 2.5 0 1 0 1.3 2.2V4.5Z"></path></svg>'
    },
    {
      key: 'linkedinUrl',
      type: 'linkedin',
      label: 'LinkedIn',
      placeholder: 'https://linkedin.com/in/you',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 8.5A1.7 1.7 0 1 1 6.7 5a1.7 1.7 0 0 1 0 3.5ZM5.3 10h2.8v8.7H5.3Zm4.5 0h2.7v1.2h.1c.4-.7 1.3-1.5 2.8-1.5 3 0 3.6 2 3.6 4.5v4.5h-2.8v-4c0-1 0-2.2-1.4-2.2s-1.6 1-1.6 2.1v4.1H9.8Z"></path></svg>'
    },
    {
      key: 'youtubeUrl',
      type: 'youtube',
      label: 'YouTube',
      placeholder: 'https://youtube.com/@you',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8.5a2.8 2.8 0 0 0-2-2c-1.8-.5-9-.5-9-.5s-7.2 0-9 .5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 0 12a29 29 0 0 0 1 3.5 2.8 2.8 0 0 0 2 2c1.8.5 9 .5 9 .5s7.2 0 9-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 24 12a29 29 0 0 0-1-3.5ZM9.5 15.5v-7l6 3.5Z"></path></svg>'
    },
    {
      key: 'websiteUrl',
      type: 'website',
      label: 'Website',
      placeholder: 'https://your-site.com',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm5.9 8h-3.1a14.6 14.6 0 0 0-1-4.2A7 7 0 0 1 17.9 11ZM12 5.1c.8 1 1.6 3 1.9 5.9h-3.8C10.4 8.1 11.2 6.1 12 5.1ZM5.1 13h3.1a14.6 14.6 0 0 0 1 4.2A7 7 0 0 1 5.1 13Zm3.1-2H5.1a7 7 0 0 1 4.1-4.2A14.6 14.6 0 0 0 8.2 11Zm3.8 7.9c-.8-1-1.6-3-1.9-5.9h3.8c-.3 2.9-1.1 4.9-1.9 5.9Zm1.8-1.7a14.6 14.6 0 0 0 1-4.2h3.1a7 7 0 0 1-4.1 4.2Z"></path></svg>'
    }
  ];
  const MAX_EDIT_RESULTS = 4;
  const DEMO_TRAINER_STORAGE_KEY = 'trainer-profile-demo-averystone-v3';
  const LEGACY_DEMO_TRAINER_STORAGE_KEYS = [
    'trainer-profile-demo-averystone-v2',
    'trainer-profile-demo-averystone'
  ];
  const pageState = {
    trainer: null,
    view: ''
  };
  const editorState = {
    enabled: false,
    dirty: false,
    saving: false,
    openSection: '',
    original: null,
    draft: null
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

  function normalizeText(raw) {
    return String(raw || '').trim().toLowerCase();
  }

  function cloneJson(raw) {
    if (raw == null) return raw;
    try {
      return JSON.parse(JSON.stringify(raw));
    } catch {
      return raw;
    }
  }

  function readDemoTrainerOverride() {
    try {
      LEGACY_DEMO_TRAINER_STORAGE_KEYS.forEach((key) => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });
      const raw = localStorage.getItem(DEMO_TRAINER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeDemoTrainerOverride(trainer) {
    try {
      localStorage.setItem(DEMO_TRAINER_STORAGE_KEY, JSON.stringify(trainer || {}));
    } catch {
      // ignore storage failures
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
  }

  async function prepareTrainerPhotoDataUrl(file) {
    if (!file) return '';
    if (window.odeAvatarCropper?.cropToSquare) {
      const cropped = await window.odeAvatarCropper.cropToSquare(file, { size: 320, quality: 0.78 }).catch(() => null);
      return String(cropped || '');
    }
    return await readFileAsDataUrl(file).catch(() => '');
  }

  function setUploadPreview(previewEl, value, emptyLabel = 'Add image') {
    if (!previewEl) return;
    const src = String(value || '').trim();
    previewEl.innerHTML = '';
    if (!src) {
      previewEl.innerHTML = `<span>${escapeHtml(emptyLabel)}</span>`;
      return;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    previewEl.appendChild(img);
  }

  function uniqueList(values, max = 12) {
    const items = [];
    (Array.isArray(values) ? values : [values]).forEach((value) => {
      String(value || '')
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => {
          if (!items.some((entry) => normalizeText(entry) === normalizeText(item))) {
            items.push(item);
          }
        });
    });
    return items.slice(0, max);
  }

  function listToText(values) {
    return (Array.isArray(values) ? values : []).filter(Boolean).join('\n');
  }

  function sanitizeHandle(raw) {
    return String(raw || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/[^a-z0-9_.-]/gi, '')
      .toLowerCase();
  }

  function slugify(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function trainerLocationParts(trainer) {
    return {
      city: String(trainer?.city || trainer?.location?.city || '').trim(),
      state: String(trainer?.state || trainer?.location?.state || trainer?.stateCode || trainer?.location?.stateCode || '').trim(),
      zipCode: String(trainer?.zipCode || trainer?.location?.zipCode || '').trim()
    };
  }

  function buildLocationText(trainer) {
    const { city, state, zipCode } = trainerLocationParts(trainer);
    const cityState = [city, state].filter(Boolean).join(', ');
    return cityState || zipCode || 'Location shared after the first call';
  }

  function buildModeText(trainer) {
    const modes = [];
    if (trainer?.offer?.onlineCoaching) modes.push('Remote coaching');
    if (trainer?.offer?.inPersonTraining) modes.push('In-person sessions');
    return modes.join(' + ') || 'Remote coaching';
  }

  function buildSocialHref(type, handle) {
    const clean = String(handle || '').trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;
    const normalized = clean.replace(/^@+/, '');
    if (type === 'website') return /^https?:\/\//i.test(clean) ? clean : '';
    if (type === 'youtube') {
      if (/^https?:\/\//i.test(clean)) return clean;
      return `https://youtube.com/${encodeURIComponent(normalized)}`;
    }
    if (type === 'instagram') return `https://instagram.com/${encodeURIComponent(normalized)}`;
    if (type === 'tiktok') return `https://www.tiktok.com/@${encodeURIComponent(normalized)}`;
    if (type === 'linkedin') {
      return `https://www.linkedin.com/in/${encodeURIComponent(normalized)}`;
    }
    return '';
  }

  function formatMoney(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return '';
    return `$${Math.round(value)}`;
  }

  function resolveYearsLabel(trainer) {
    const explicit = Number(
      trainer?.yearsExperience
      || trainer?.yearsCoaching
      || trainer?.experienceYears
      || 0
    );
    if (Number.isFinite(explicit) && explicit > 0) return `${Math.round(explicit)} years coaching`;
    const level = normalizeText(trainer?.experienceLevel);
    if (level.includes('advanced')) return '7+ years coaching';
    if (level.includes('intermediate')) return '4+ years coaching';
    return '3+ years coaching';
  }

  function resolvePriceRangeLabel(trainer) {
    const preset = String(trainer?.priceRangeLabel || trainer?.offer?.priceRangeLabel || '').trim();
    if (preset) return preset;
    const min = Number(
      trainer?.priceRangeMin
      ?? trainer?.offer?.priceRangeMin
      ?? trainer?.offer?.monthlyCoachingPrice
    );
    const max = Number(trainer?.priceRangeMax ?? trainer?.offer?.priceRangeMax);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
      return `${formatMoney(min)}-${formatMoney(max)}/month`;
    }
    if (Number.isFinite(min) && min > 0) {
      return `From ${formatMoney(min)}/month`;
    }
    return 'Custom pricing';
  }

  function resolveBio(trainer) {
    const bio = String(trainer?.bio || trainer?.trainerBio || '').trim();
    if (bio) return bio;
    const summary = String(trainer?.brandPositioning || '').trim();
    const differentiator = String(trainer?.differentiator || '').trim();
    if (summary && differentiator) return `${summary} ${differentiator}`;
    return summary || differentiator || 'Trainer bio coming soon.';
  }

  function resolveContactEmail(trainer) {
    return String(trainer?.email || trainer?.contactEmail || '').trim();
  }

  function resolveCoachingFormatValue(trainer) {
    const explicit = String(trainer?.coachingFormat || '').trim();
    if (explicit) return explicit;
    const online = trainer?.offer?.onlineCoaching !== false;
    const inPerson = Boolean(trainer?.offer?.inPersonTraining);
    if (online && inPerson) return 'remote_and_in_person';
    if (inPerson && !online) return 'in_person_only';
    return 'remote_only';
  }

  function applyCoachingFormatValue(trainer, value) {
    const next = String(value || '').trim() || 'remote_only';
    trainer.coachingFormat = next;
    trainer.offer = trainer.offer || {};
    trainer.offer.onlineCoaching = next !== 'in_person_only';
    trainer.offer.inPersonTraining = next !== 'remote_only';
  }

  function canEditTrainerPage(trainer, view = '') {
    if (String(view || '').trim().toLowerCase() === 'results') return false;
    const viewer = window.__trainerProfileViewer || null;
    if (!viewer?.id) return false;
    if (trainer?.id && String(viewer.id) === String(trainer.id)) return true;
    if (trainer?.isDemoLayout && (viewer?.isOwner || viewer?.isTech || viewer?.trainer?.active)) return true;
    const viewerHandle = sanitizeHandle(viewer?.publicHandle || viewer?.username || '');
    const trainerHandle = sanitizeHandle(trainer?.publicHandle || trainer?.username || '');
    return Boolean(viewerHandle && trainerHandle && viewerHandle === trainerHandle);
  }

  function buildEditButton(sectionKey, label) {
    if (!(canEditTrainerPage(pageState.trainer, pageState.view) && editorState.enabled)) return '';
    if (editorState.openSection === sectionKey) return '';
    return `
      <button
        type="button"
        class="trainer-profile-edit-btn"
        data-trainer-edit="${escapeHtml(sectionKey)}"
        aria-label="${escapeHtml(label)}"
        title="${escapeHtml(label)}"
      >
        <span aria-hidden="true">&#9998;</span>
      </button>
    `;
  }

  function buildSectionEditActions(sectionKey) {
    if (!(editorState.enabled && editorState.openSection === sectionKey)) return '';
    return `
      <div class="trainer-profile-section-actions">
        <button type="button" class="trainer-profile-edit-action danger" data-trainer-section-cancel="${escapeHtml(sectionKey)}" aria-label="Discard edits">&#10005;</button>
        <button type="button" class="trainer-profile-edit-action confirm" data-trainer-section-save="${escapeHtml(sectionKey)}" aria-label="Save edits">&#10003;</button>
      </div>
    `;
  }

  function buildEditableText(sectionKey, fieldKey, value, className = '', tag = 'div', options = {}) {
    const safeValue = String(value || '');
    const placeholder = String(options.placeholder || '').trim();
    const maxWords = Number(options.maxWords || 0);
    const maxChars = Number(options.maxChars || 0);
    if (!(editorState.enabled && editorState.openSection === sectionKey)) {
      return `<${tag} class="${className}">${escapeHtml(safeValue || placeholder).replace(/\n/g, '<br>')}</${tag}>`;
    }
    return `
      <${tag}
        class="${className} trainer-profile-inline-editable"
        contenteditable="plaintext-only"
        spellcheck="false"
        data-inline-section="${escapeHtml(sectionKey)}"
        data-inline-field="${escapeHtml(fieldKey)}"
        data-inline-placeholder="${escapeHtml(placeholder)}"
        ${maxWords > 0 ? `data-inline-max-words="${escapeHtml(maxWords)}"` : ''}
        ${maxChars > 0 ? `data-inline-max-chars="${escapeHtml(maxChars)}"` : ''}
      >${escapeHtml(safeValue)}</${tag}>
    `;
  }

  function trimToWordLimit(raw, maxWords) {
    const text = String(raw || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
    const limit = Number(maxWords || 0);
    if (!limit || limit < 1 || !text) return text;
    const tokens = text.match(/\S+|\s+/g) || [];
    let words = 0;
    let out = '';
    for (const token of tokens) {
      if (/\S/.test(token)) {
        words += 1;
        if (words > limit) break;
      }
      out += token;
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function getEditablePlainText(el) {
    if (!el) return '';
    const raw = typeof el.innerText === 'string' && el.innerText
      ? el.innerText
      : String(el.textContent || '');
    return String(raw)
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function trimToCharacterLimit(raw, maxChars) {
    const text = String(raw || '');
    const limit = Number(maxChars || 0);
    if (!limit || limit < 1 || text.length <= limit) return text;
    return text.slice(0, limit).trimEnd();
  }

  function applyInlineTextSection(sectionKey) {
    const draft = editorState.draft;
    if (!draft || !sectionKey) return;
    document.querySelectorAll(`[data-inline-section="${sectionKey}"][data-inline-field]`).forEach((el) => {
      const field = String(el.getAttribute('data-inline-field') || '').trim();
      const maxWords = Number(el.getAttribute('data-inline-max-words') || 0);
      const maxChars = Number(el.getAttribute('data-inline-max-chars') || 0);
      const current = getEditablePlainText(el);
      const next = trimToCharacterLimit(trimToWordLimit(current, maxWords), maxChars);
      if (current !== next) {
        el.innerText = next;
      }
      if (sectionKey === 'offer') {
        if (field === 'topSectionLabel') draft.topSectionLabel = next;
        if (field === 'heroHeadline') draft.heroHeadline = next;
        if (field === 'heroSubheadline') draft.heroSubheadline = next;
      }
      if (sectionKey === 'identity') {
        if (field === 'fullName') {
          draft.fullName = next;
          draft.displayName = next || draft.displayName || '';
        }
        if (field === 'publicHandle') draft.publicHandle = sanitizeHandle(next);
        if (field === 'brandPositioning') draft.brandPositioning = next;
        if (field === 'city') draft.city = next;
        if (field === 'state') draft.state = next;
        if (field === 'monthlyPrice') {
          draft.priceRangeLabel = next;
          draft.offer = draft.offer || {};
          draft.offer.priceRangeLabel = next;
          const num = Number(next.replace(/[^0-9.]/g, ''));
          draft.offer.monthlyCoachingPrice = Number.isFinite(num) && num > 0 ? Math.round(num) : null;
        }
        if (field === 'yearsCoaching') {
          const num = Number(next.replace(/[^0-9]/g, ''));
          draft.yearsCoaching = Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
        }
        if (field === 'activeClients') {
          const num = Number(next.replace(/[^0-9]/g, ''));
          draft.activeClients = Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
        }
      }
    });
  }

  function buildIdentityPhotoControl(trainer, fullName) {
    const src = trainer?.photoDataUrl || 'assets/images/placeholders/profile-placeholder.jpg';
    const isInlineDataImage = /^data:image\//i.test(String(src || '').trim());
    const editing = editorState.enabled && editorState.openSection === 'identity';
    return `
      <div class="trainer-profile-avatar${editing ? ' is-editing' : ''}">
        <img${isInlineDataImage ? ' data-trainer-avatar="1"' : ` src="${escapeHtml(src)}"`} alt="${escapeHtml(fullName)}">
        ${editing ? `
          <label class="trainer-profile-photo-swap">
            <span>Change photo</span>
            <input type="file" accept="image/*" data-inline-photo="identity">
          </label>
        ` : ''}
      </div>
    `;
  }

  function syncInlineEditablePlaceholderState(el) {
    if (!el) return;
    const text = String(el.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) {
      el.removeAttribute('data-empty');
    } else {
      el.setAttribute('data-empty', 'true');
    }
  }

  function bindChipComposers(root, syncDraft) {
    root.querySelectorAll('[data-chip-composer]').forEach((composer) => {
      const hidden = composer.querySelector('[data-field]');
      const input = composer.querySelector('[data-chip-input]');
      const list = composer.querySelector('[data-chip-list]');
      if (!hidden || !input || !list) return;

      const readTags = () => uniqueList(hidden.value || '', 8);
      const writeTags = (tags) => {
        const next = uniqueList(tags || [], 8);
        hidden.value = next.join(', ');
        list.innerHTML = next.map((tag) => `
          <button type="button" class="trainer-profile-editor-tag" data-chip-value="${escapeHtml(tag)}">
            <span>${escapeHtml(tag)}</span>
            <span aria-hidden="true">&times;</span>
          </button>
        `).join('');
      };

      list.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-chip-value]');
        if (!button) return;
        const value = String(button.getAttribute('data-chip-value') || '').trim();
        writeTags(readTags().filter((tag) => tag !== value));
        syncDraft();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = String(input.value || '').trim().replace(/\s+/g, ' ');
        if (!value) return;
        writeTags([...readTags(), value]);
        input.value = '';
        syncDraft();
      });
    });
  }

  function buildAvailabilityInlineEditor(trainer) {
    const availability = trainer?.availability || {};
    const selectedDays = new Set((Array.isArray(availability.daysAvailable) ? availability.daysAvailable : []).map((day) => String(day || '').trim()));
    const slots = Array.isArray(availability.timeSlotsAvailable) ? availability.timeSlotsAvailable : [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const slotMap = new Map();
    slots.forEach((slot) => {
      const text = String(slot || '').trim();
      const match = text.match(/^([A-Za-z]{3,9})\s+(.+)$/);
      if (!match) return;
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdayToIndex(match[1]) ?? -1];
      if (!dayName) return;
      slotMap.set(dayName, match[2].trim());
    });
    const toEditorParts = (raw) => {
      const text = String(raw || '').trim();
      const parts = text.split('-').map((item) => String(item || '').trim());
      const parsePart = (value) => {
        const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
        return {
          time: match ? `${match[1]}${match[2] ? `:${match[2]}` : ''}` : '',
          meridiem: match ? String(match[3] || '').toUpperCase() : 'PM'
        };
      };
      const start = parsePart(parts[0] || '');
      const end = parsePart(parts[1] || '');
      return {
        startTime: start.time || '11',
        startMeridiem: start.meridiem || 'AM',
        endTime: end.time || '1',
        endMeridiem: end.meridiem || 'PM'
      };
    };
    return `
      <div class="trainer-profile-availability-editor" data-inline-availability-editor>
        <div class="trainer-profile-availability-head">Edit availability</div>
        <div class="trainer-profile-availability-days">
          ${days.map((day) => `
            <label class="trainer-profile-availability-pill${selectedDays.has(day) ? ' is-active' : ''}">
              <input type="checkbox" data-availability-day value="${escapeHtml(day)}" ${selectedDays.has(day) ? 'checked' : ''}>
              <span>${escapeHtml(day.slice(0, 3))}</span>
            </label>
          `).join('')}
        </div>
        <div class="trainer-profile-availability-window-grid">
          ${days.filter((day) => selectedDays.has(day)).map((day) => {
            const parts = toEditorParts(slotMap.get(day) || '');
            return `
              <div class="trainer-profile-availability-window-card">
                <span>${escapeHtml(day)}</span>
                <div class="trainer-profile-availability-time-row">
                  <input type="text" inputmode="numeric" data-inline-availability-start="${escapeHtml(day)}" value="${escapeHtml(parts.startTime)}" placeholder="11">
                  <select data-inline-availability-start-meridiem="${escapeHtml(day)}">
                    <option value="AM"${parts.startMeridiem === 'AM' ? ' selected' : ''}>AM</option>
                    <option value="PM"${parts.startMeridiem === 'PM' ? ' selected' : ''}>PM</option>
                  </select>
                  <span class="trainer-profile-availability-time-sep">to</span>
                  <input type="text" inputmode="numeric" data-inline-availability-end="${escapeHtml(day)}" value="${escapeHtml(parts.endTime)}" placeholder="1">
                  <select data-inline-availability-end-meridiem="${escapeHtml(day)}">
                    <option value="AM"${parts.endMeridiem === 'AM' ? ' selected' : ''}>AM</option>
                    <option value="PM"${parts.endMeridiem === 'PM' ? ' selected' : ''}>PM</option>
                  </select>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <label class="trainer-profile-availability-field">
          <span>Gap between appointments</span>
          <input type="number" min="0" max="120" step="5" data-inline-availability-gap value="${escapeHtml(trainer?.bufferMinutes || 15)}" placeholder="15">
        </label>
        <label class="trainer-profile-availability-field">
          <span>Urgency line</span>
          <input type="text" data-inline-availability-urgency value="${escapeHtml(trainer?.bookingUrgency || '')}" placeholder="14 consult windows are open right now.">
        </label>
      </div>
    `;
  }

  function buildTrainerSavePayload(trainer, viewer) {
    const specialtyClients = uniqueList(trainer?.specialtyClients || [], 12);
    const specialtyClientsCustom = uniqueList(trainer?.specialtyClientsCustom || [], 8);
    const includedItems = uniqueList(trainer?.includedItems || [], 16);
    const includedItemsCustom = uniqueList(trainer?.includedItemsCustom || [], 10);
    const results = (Array.isArray(trainer?.transformations) ? trainer.transformations : [])
      .map((item) => ({
        person: String(item?.person || '').trim(),
        result: String(item?.result || '').trim(),
        timeline: String(item?.timeline || '').trim(),
        copy: String(item?.copy || '').trim(),
        beforeImage: String(item?.beforeImage || '').trim(),
        afterImage: String(item?.afterImage || '').trim()
      }))
      .filter((item) => item.person || item.result || item.timeline || item.copy || item.beforeImage || item.afterImage);

    return {
      fullName: String(trainer?.fullName || trainer?.displayName || viewer?.displayName || viewer?.username || '').trim(),
      email: resolveContactEmail(trainer) || String(viewer?.email || '').trim(),
      displayName: String(trainer?.displayName || trainer?.fullName || viewer?.displayName || '').trim(),
      managerCode: String(trainer?.managerCode || trainer?.meta?.managerCode || viewer?.manager?.managerCode || '').trim(),
      workspaceId: String(trainer?.workspaceId || trainer?.meta?.workspaceId || viewer?.manager?.workspaceId || '').trim(),
      locationId: String(trainer?.locationId || trainer?.meta?.locationId || viewer?.manager?.locationId || '').trim(),
      publicHandle: sanitizeHandle(trainer?.publicHandle || trainer?.username || viewer?.username || ''),
      photoDataUrl: String(trainer?.photoDataUrl || '').trim(),
      coachBadgeType: uniqueList(trainer?.coachBadgeType || [], 2),
      coachCustomTags: uniqueList(trainer?.coachCustomTags || [], 6),
      brandPositioning: String(trainer?.brandPositioning || '').trim(),
      topSectionLabel: String(trainer?.topSectionLabel || '').trim(),
      heroHeadline: String(trainer?.heroHeadline || '').trim(),
      heroSubheadline: String(trainer?.heroSubheadline || '').trim(),
      city: String(trainer?.city || '').trim(),
      state: String(trainer?.state || '').trim(),
      coachingFormat: resolveCoachingFormatValue(trainer),
      priceRangeLabel: String(trainer?.priceRangeLabel || trainer?.offer?.priceRangeLabel || '').trim(),
      monthlyCoachingPrice: Number.isFinite(Number(trainer?.offer?.monthlyCoachingPrice))
        ? Number(trainer.offer.monthlyCoachingPrice)
        : '',
      startingPrice: Number.isFinite(Number(trainer?.offer?.monthlyCoachingPrice))
        ? Number(trainer.offer.monthlyCoachingPrice)
        : '',
      yearsCoaching: Number.isFinite(Number(trainer?.yearsCoaching)) ? Number(trainer.yearsCoaching) : '',
      activeClients: Number.isFinite(Number(trainer?.activeClients)) ? Number(trainer.activeClients) : '',
      bookingEnabled: trainer?.bookingEnabled !== false,
      consultationLength: Number.isFinite(Number(trainer?.consultationLengthMinutes)) ? Number(trainer.consultationLengthMinutes) : 45,
      dateRangeDays: Number.isFinite(Number(trainer?.dateRangeDays)) ? Number(trainer.dateRangeDays) : 14,
      maxConsultsPerDay: Number.isFinite(Number(trainer?.maxConsultsPerDay)) ? Number(trainer.maxConsultsPerDay) : 4,
      bufferMinutes: Number.isFinite(Number(trainer?.bufferMinutes)) ? Number(trainer.bufferMinutes) : 15,
      bookingNoticeHours: Number.isFinite(Number(trainer?.bookingNoticeHours)) ? Number(trainer.bookingNoticeHours) : 12,
      bookingApprovalMode: String(trainer?.bookingApprovalMode || '').trim() || 'manual',
      bookingCtaText: String(trainer?.bookingCtaText || 'Find out if this is a fit in 15 minutes.').trim(),
      bookingUrgency: String(trainer?.bookingUrgency || '').trim(),
      daysAvailable: Array.isArray(trainer?.availability?.daysAvailable) ? trainer.availability.daysAvailable : [],
      dayWindows: trainer?.availability?.dayWindows && typeof trainer.availability.dayWindows === 'object'
        ? trainer.availability.dayWindows
        : {},
      timeSlotsAvailable: Array.isArray(trainer?.availability?.timeSlotsAvailable) ? trainer.availability.timeSlotsAvailable : [],
      timeZone: String(trainer?.availability?.timeZone || '').trim(),
      results,
      specialtyClients,
      specialtyClientsCustom,
      clientTypes: String(trainer?.clientTypes || [...specialtyClients, ...specialtyClientsCustom].join(', ')).trim(),
      includedItems,
      includedItemsCustom,
      coachingIncludes: String(trainer?.offer?.included || [...includedItems, ...includedItemsCustom].join(', ')).trim(),
      coachBio: String(trainer?.bio || '').trim(),
      coachingPhilosophy: String(trainer?.coachingPhilosophy || trainer?.differentiator || '').trim(),
      differentiator: String(trainer?.differentiator || trainer?.coachingPhilosophy || '').trim(),
      idealClient: String(trainer?.idealClient || '').trim(),
      instagramUrl: String(trainer?.instagramUrl || '').trim(),
      tiktokUrl: String(trainer?.tiktokUrl || '').trim(),
      linkedinUrl: String(trainer?.linkedinUrl || '').trim(),
      youtubeUrl: String(trainer?.youtubeUrl || '').trim(),
      websiteUrl: String(trainer?.websiteUrl || '').trim(),
      accentColor: String(trainer?.accentColor || '').trim(),
      showPricePublic: trainer?.showPricePublic !== false,
      showClientsPublic: trainer?.showClientsPublic !== false,
      showYearsPublic: trainer?.showYearsPublic !== false,
      showBookingPublic: trainer?.showBookingPublic !== false,
      showResultsPublic: trainer?.showResultsPublic !== false
    };
  }

  function summarizePitch(raw, maxLength = 132) {
    const text = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text;
    if (firstSentence.length <= maxLength) return firstSentence;
    return `${firstSentence.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
  }

  function shortenLine(raw, maxLength = 96) {
    const text = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
  }

  function resolveGalleryImages(trainer) {
    const custom = Array.isArray(trainer?.galleryImages) ? trainer.galleryImages : [];
    const normalized = custom
      .map((item, index) => {
        if (typeof item === 'string') {
          return { src: item, alt: `${trainer?.fullName || trainer?.displayName || 'Trainer'} photo ${index + 1}`, position: 'center center' };
        }
        if (item && typeof item === 'object' && item.src) {
          return {
            src: String(item.src),
            alt: String(item.alt || `${trainer?.fullName || trainer?.displayName || 'Trainer'} photo ${index + 1}`),
            position: String(item.position || 'center center')
          };
        }
        return null;
      })
      .filter(Boolean);
    if (normalized.length >= 3) return normalized.slice(0, 3);
    return [
      { src: 'assets/images/trainers/trainer-rowing-coach.jpg', alt: 'Trainer coaching a rowing session', position: 'center center' },
      { src: 'assets/images/trainers/trainer-floor-coach.jpg', alt: 'Trainer guiding a floor session', position: 'center 22%' },
      { src: 'assets/images/trainers/trainer-stepup-coach.jpg', alt: 'Trainer helping a client train', position: 'center 34%' }
    ];
  }

  function resolveTransformations(trainer) {
    const custom = Array.isArray(trainer?.transformations) ? trainer.transformations : [];
    const normalized = custom
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        return {
          image: String(item.image || '').trim(),
          beforeImage: String(item.beforeImage || item.imageBefore || '').trim(),
          afterImage: String(item.afterImage || item.imageAfter || item.image || '').trim(),
          label: String(item.label || 'Client transformation').trim(),
          result: String(item.result || '').trim(),
          timeline: String(item.timeline || '').trim(),
          copy: String(item.copy || '').trim(),
          quote: String(item.quote || '').trim(),
          person: String(item.person || '').trim()
        };
      })
      .filter((item) => item && (item.afterImage || item.image) && item.result);
    if (normalized.length) return normalized.slice(0, 6);
    return [];
  }

  function bindResultsToggle() {
    const btn = $('#trainer-results-toggle');
    const hiddenCards = Array.from(document.querySelectorAll('[data-more-result]'));
    if (!btn || !hiddenCards.length) return;
    let expanded = false;
    const sync = () => {
      hiddenCards.forEach((card) => card.classList.toggle('is-hidden', !expanded));
      btn.textContent = expanded ? 'Show Less' : 'Show More';
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    };
    btn.addEventListener('click', () => {
      expanded = !expanded;
      sync();
    });
    sync();
  }

  function buildResultCards(proofCases, { showAll = false } = {}) {
    return proofCases.map((item, index) => `
      <article class="trainer-profile-result-card${!showAll && index > 1 ? ' is-hidden' : ''}"${!showAll && index > 1 ? ' data-more-result="1"' : ''}>
        <div class="trainer-profile-result-visuals">
          <div class="trainer-profile-result-photo before">
            <img src="${escapeHtml(item.beforeImage || item.image)}" alt="${escapeHtml(item.person || item.label || 'Client result')} before">
            <span class="trainer-profile-result-tag">Before</span>
          </div>
          <div class="trainer-profile-result-photo after">
            <img src="${escapeHtml(item.afterImage || item.image)}" alt="${escapeHtml(item.person || item.label || 'Client result')} after">
            <span class="trainer-profile-result-tag">After</span>
          </div>
        </div>
        <div class="trainer-profile-result-copy">
          <div class="trainer-profile-result-topline">${escapeHtml(item.person || `Client ${index + 1}`)}</div>
          <div class="trainer-profile-result-metric">${escapeHtml(item.result)}</div>
          <div class="trainer-profile-result-timeline">${escapeHtml(item.timeline || 'Coaching block')}</div>
          <div class="trainer-profile-result-note">${escapeHtml(item.copy || item.quote || 'Visible progress from a simpler system.')}</div>
        </div>
      </article>
    `).join('');
  }

  function buildInlineResultsEditor(proofCases, { showAll = false } = {}) {
    const items = (Array.isArray(proofCases) ? proofCases : []).slice(0, MAX_EDIT_RESULTS);
    while (items.length < 2) items.push({ person: '', result: '', timeline: '', copy: '', beforeImage: '', afterImage: '' });
    return `
      <div class="trainer-profile-results-head">
        <div>
          <div class="trainer-profile-section-kicker">Client results</div>
          <h2 class="trainer-profile-section-title">Before and after</h2>
          <div class="trainer-profile-section-sub">Click the text to edit it. Change photos directly on each image.</div>
        </div>
      </div>
      <div class="trainer-profile-results-grid${showAll ? ' trainer-profile-results-grid-full' : ''}">
        ${items.map((item, index) => `
          <article class="trainer-profile-result-card trainer-profile-result-card-editing${!showAll && index > 1 ? ' is-hidden' : ''}" data-result-row="${index}"${!showAll && index > 1 ? ' data-more-result="1"' : ''}>
            <div class="trainer-profile-result-visuals">
              <div class="trainer-profile-result-photo before">
                <img src="${escapeHtml(item.beforeImage || item.image || '')}" alt="${escapeHtml(item.person || item.label || 'Client result')} before" data-result-photo-preview="beforeImage">
                <span class="trainer-profile-result-tag">Before</span>
                <input type="hidden" data-field="beforeImage" value="${escapeHtml(item.beforeImage || item.image || '')}">
                <label class="trainer-profile-result-photo-swap">
                  <span>Change picture</span>
                  <input type="file" accept="image/*" data-result-photo-input="beforeImage">
                </label>
              </div>
              <div class="trainer-profile-result-photo after">
                <img src="${escapeHtml(item.afterImage || item.image || '')}" alt="${escapeHtml(item.person || item.label || 'Client result')} after" data-result-photo-preview="afterImage">
                <span class="trainer-profile-result-tag">After</span>
                <input type="hidden" data-field="afterImage" value="${escapeHtml(item.afterImage || item.image || '')}">
                <label class="trainer-profile-result-photo-swap">
                  <span>Change picture</span>
                  <input type="file" accept="image/*" data-result-photo-input="afterImage">
                </label>
              </div>
            </div>
            <div class="trainer-profile-result-copy">
              <div class="trainer-profile-result-topline trainer-profile-inline-editable" contenteditable="plaintext-only" spellcheck="false" data-result-inline-field="person" data-inline-placeholder="Client type">${escapeHtml(item.person || '')}</div>
              <div class="trainer-profile-result-metric trainer-profile-inline-editable" contenteditable="plaintext-only" spellcheck="false" data-result-inline-field="result" data-inline-placeholder="Result headline">${escapeHtml(item.result || '')}</div>
              <div class="trainer-profile-result-timeline trainer-profile-inline-editable" contenteditable="plaintext-only" spellcheck="false" data-result-inline-field="timeline" data-inline-placeholder="Timeline">${escapeHtml(item.timeline || '')}</div>
              <div class="trainer-profile-result-note trainer-profile-inline-editable" contenteditable="plaintext-only" spellcheck="false" data-result-inline-field="copy" data-inline-placeholder="Result note">${escapeHtml(item.copy || item.quote || '')}</div>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function buildInlineIncludedEditor(trainer) {
    const items = resolveIncludedItems(trainer).slice(0, 16);
    return `
      <div class="trainer-profile-section-kicker">What you get</div>
      <h2 class="trainer-profile-section-title">Inside coaching</h2>
      <div class="trainer-profile-grid trainer-profile-get-grid trainer-profile-check-list trainer-profile-check-list-editing" data-included-list>
        ${items.map((item) => `
          <div class="trainer-profile-check-item" data-included-row>
            <span class="trainer-profile-check-mark"></span>
            <div class="trainer-profile-inline-editable trainer-profile-check-item-editable" contenteditable="plaintext-only" spellcheck="false" data-included-inline-field="item" data-inline-placeholder="Coaching item">${escapeHtml(item || '')}</div>
          </div>
        `).join('')}
        <div class="trainer-profile-check-item trainer-profile-check-item-new">
          <span class="trainer-profile-check-mark"></span>
          <input type="text" class="trainer-profile-check-item-input" data-included-add-input placeholder="Add another coaching item">
        </div>
      </div>
    `;
  }

  function buildResultsSection(proofCases, trainerKey, { showAll = false } = {}) {
    const resultsAction = showAll
      ? `<a class="trainer-profile-results-toggle" href="trainer-profile.html?trainer=${encodeURIComponent(trainerKey)}">Back to profile</a>`
      : (proofCases.length > 2
        ? `<a class="trainer-profile-results-toggle" href="trainer-profile.html?trainer=${encodeURIComponent(trainerKey)}&view=results">Show More</a>`
        : '');
    const isInlineEditing = !showAll && editorState.enabled && editorState.openSection === 'results';
    const inlineEditor = isInlineEditing
      ? `<div class="trainer-profile-results-editor trainer-profile-inline-editor" data-inline-edit-section="results">${buildInlineResultsEditor(proofCases, { showAll })}</div>`
      : '';
    return `
      <section class="trainer-profile-card trainer-profile-results-strip${showAll ? ' trainer-profile-results-strip-full' : ''}${showAll ? '' : ' trainer-profile-edit-target'}">
        ${showAll ? '' : buildEditButton('results', 'Edit client results')}
        ${showAll ? '' : buildSectionEditActions('results')}
        ${inlineEditor}
        ${isInlineEditing ? '' : `
        <div class="trainer-profile-results-head">
          <div>
            <div class="trainer-profile-section-kicker">Client results</div>
            <h2 class="trainer-profile-section-title">Before and after</h2>
            <div class="trainer-profile-section-sub">Quick proof that the coaching gets visible results.</div>
          </div>
          ${resultsAction}
        </div>
        <div class="trainer-profile-results-grid${showAll ? ' trainer-profile-results-grid-full' : ''}">
          ${buildResultCards(proofCases, { showAll })}
        </div>
        `}
      </section>
    `;
  }

  function resolveHeroHeadline(trainer) {
    const explicit = String(trainer?.heroHeadline || '').trim();
    if (explicit) return explicit;
    return 'I help busy people get leaner, stronger, and more confident with a clear plan that fits real life.';
  }

  function renderCurrentProfile() {
    renderProfile(editorState.enabled ? editorState.draft : pageState.trainer, pageState.view);
  }

  function bindRenderedImages(trainer) {
    document.querySelectorAll('img[data-trainer-avatar]').forEach((img) => {
      const src = String(trainer?.photoDataUrl || '').trim();
      if (!src) return;
      img.onerror = () => {
        img.removeAttribute('src');
      };
      img.src = src;
    });
  }

  function getEditorBackdrop() {
    return $('#trainer-profile-editor-backdrop');
  }

  function closeEditorModal() {
    const backdrop = getEditorBackdrop();
    if (!backdrop) return;
    backdrop.classList.add('is-hidden');
    backdrop.setAttribute('hidden', 'hidden');
    editorState.openSection = '';
  }

  function buildIdentityEditor(trainer) {
    const selectedBadges = uniqueList(trainer?.coachBadgeType || [], 2);
    return `
      <div class="trainer-profile-editor-grid two">
        <label class="trainer-profile-editor-field">
          <span>Coach name</span>
          <input type="text" data-field="fullName" value="${escapeHtml(trainer?.fullName || '')}" placeholder="Coach name">
        </label>
        <label class="trainer-profile-editor-field">
          <span>Public handle</span>
          <input type="text" data-field="publicHandle" value="@${escapeHtml(sanitizeHandle(trainer?.publicHandle || trainer?.username || ''))}" placeholder="@coachhandle">
        </label>
      </div>
      <label class="trainer-profile-editor-field">
        <span>Coach summary</span>
        <textarea data-field="brandPositioning" rows="4" placeholder="Short one-line coaching summary">${escapeHtml(trainer?.brandPositioning || '')}</textarea>
      </label>
      <div class="trainer-profile-editor-grid two">
        <label class="trainer-profile-editor-field">
          <span>City</span>
          <input type="text" data-field="city" value="${escapeHtml(trainer?.city || '')}" placeholder="Miami">
        </label>
        <label class="trainer-profile-editor-field">
          <span>State</span>
          <input type="text" data-field="state" value="${escapeHtml(trainer?.state || '')}" placeholder="Florida">
        </label>
      </div>
      <div class="trainer-profile-editor-grid three">
        <label class="trainer-profile-editor-field">
          <span>Starting price</span>
          <input type="number" min="0" step="1" data-field="monthlyPrice" value="${escapeHtml(trainer?.offer?.monthlyCoachingPrice || '')}" placeholder="275">
        </label>
        <label class="trainer-profile-editor-field">
          <span>Years coaching</span>
          <input type="number" min="0" step="1" data-field="yearsCoaching" value="${escapeHtml(trainer?.yearsCoaching || '')}" placeholder="7">
        </label>
        <label class="trainer-profile-editor-field">
          <span>Active clients</span>
          <input type="number" min="0" step="1" data-field="activeClients" value="${escapeHtml(trainer?.activeClients || '')}" placeholder="12">
        </label>
      </div>
      <div class="trainer-profile-editor-block">
        <div class="trainer-profile-editor-label">Coach badges</div>
        <div class="trainer-profile-editor-help" id="trainer-profile-editor-badge-note">Pick up to 2 badges.</div>
        <div class="trainer-profile-editor-pill-grid">
          ${COACH_BADGE_OPTIONS.map((option) => `
            <label class="trainer-profile-editor-pill${selectedBadges.includes(option) ? ' is-active' : ''}">
              <input type="checkbox" data-badge-option value="${escapeHtml(option)}" ${selectedBadges.includes(option) ? 'checked' : ''}>
              <span>${escapeHtml(option)}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <label class="trainer-profile-editor-field">
        <span>Custom tags</span>
        <input type="text" data-field="coachCustomTags" value="${escapeHtml((Array.isArray(trainer?.coachCustomTags) ? trainer.coachCustomTags : []).join(', '))}" placeholder="Comma separated">
      </label>
      <div class="trainer-profile-editor-grid two">
        <div class="trainer-profile-editor-block" data-image-wrapper>
          <div class="trainer-profile-editor-label">Profile photo</div>
          <input type="hidden" data-field="photoDataUrl" value="${escapeHtml(trainer?.photoDataUrl || '')}">
          <label class="trainer-profile-editor-upload">
            <span>Upload from device</span>
            <input type="file" accept="image/*" data-image-upload>
          </label>
          <div class="trainer-profile-editor-image-preview" data-preview-empty="Coach photo"></div>
        </div>
        <div class="trainer-profile-editor-grid">
          <label class="trainer-profile-editor-field">
            <span>Instagram</span>
            <input type="text" data-field="instagramUrl" value="${escapeHtml(trainer?.instagramUrl || trainer?.instagramHandle || '')}" placeholder="https://instagram.com/you">
          </label>
          <label class="trainer-profile-editor-field">
            <span>TikTok</span>
            <input type="text" data-field="tiktokUrl" value="${escapeHtml(trainer?.tiktokUrl || trainer?.tiktokHandle || '')}" placeholder="https://www.tiktok.com/@you">
          </label>
          <label class="trainer-profile-editor-field">
            <span>LinkedIn</span>
            <input type="text" data-field="linkedinUrl" value="${escapeHtml(trainer?.linkedinUrl || '')}" placeholder="https://linkedin.com/in/you">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Website</span>
            <input type="text" data-field="websiteUrl" value="${escapeHtml(trainer?.websiteUrl || '')}" placeholder="https://your-site.com">
          </label>
        </div>
      </div>
    `;
  }

  function buildOfferEditor(trainer) {
    return `
      <label class="trainer-profile-editor-field">
        <span>Top label</span>
        <input type="text" data-field="topSectionLabel" value="${escapeHtml(trainer?.topSectionLabel || '')}" placeholder="1:1 coaching for busy people who want real physique progress">
      </label>
      <label class="trainer-profile-editor-field">
        <span>Hero headline</span>
        <textarea data-field="heroHeadline" rows="4" placeholder="Main promise">${escapeHtml(trainer?.heroHeadline || '')}</textarea>
      </label>
      <label class="trainer-profile-editor-field">
        <span>Supporting line</span>
        <textarea data-field="heroSubheadline" rows="4" placeholder="Short line under the hero">${escapeHtml(trainer?.heroSubheadline || '')}</textarea>
      </label>
    `;
  }

  function buildSpecialtyEditor(trainer) {
    const selected = resolveSpecialtyClients(trainer);
    const selectedSet = new Set(selected.map((item) => String(item || '').trim().toLowerCase()));
    const customTags = uniqueList([
      ...(Array.isArray(trainer?.specialtyClientsCustom) ? trainer.specialtyClientsCustom : []),
      ...selected.filter((item) => !SPECIALTY_CLIENT_OPTIONS.some((option) => option.toLowerCase() === String(item || '').trim().toLowerCase()))
    ], 8);
    return `
      <div class="trainer-profile-editor-block">
        <div class="trainer-profile-editor-label">Best with</div>
        <div class="trainer-profile-editor-pill-grid">
          ${SPECIALTY_CLIENT_OPTIONS.map((option) => `
            <label class="trainer-profile-editor-pill${selectedSet.has(option.toLowerCase()) ? ' is-active' : ''}">
              <input type="checkbox" data-specialty-option value="${escapeHtml(option)}" ${selectedSet.has(option.toLowerCase()) ? 'checked' : ''}>
              <span>${escapeHtml(option)}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="trainer-profile-editor-block" data-chip-composer="specialtyClientsCustom">
        <div class="trainer-profile-editor-label">Extra specialty tags</div>
        <div class="trainer-profile-editor-help">Type 1 or 2 words and press Enter to add a tag.</div>
        <input type="hidden" data-field="specialtyClientsCustom" value="${escapeHtml(customTags.join(', '))}">
        <div class="trainer-profile-editor-tag-list" data-chip-list>
          ${customTags.map((tag) => `
            <button type="button" class="trainer-profile-editor-tag" data-chip-value="${escapeHtml(tag)}">
              <span>${escapeHtml(tag)}</span>
              <span aria-hidden="true">&times;</span>
            </button>
          `).join('')}
        </div>
        <input type="text" class="trainer-profile-editor-chip-input" data-chip-input placeholder="Type a tag and press Enter">
      </div>
    `;
  }

  function buildIncludedEditor(trainer) {
    return `
      <label class="trainer-profile-editor-field">
        <span>Inside coaching</span>
        <textarea data-field="includedItems" rows="7" placeholder="One item per line">${escapeHtml(listToText(trainer?.includedItems || []))}</textarea>
      </label>
      <label class="trainer-profile-editor-field">
        <span>Extra included items</span>
        <input type="text" data-field="includedItemsCustom" value="${escapeHtml((Array.isArray(trainer?.includedItemsCustom) ? trainer.includedItemsCustom : []).join(', '))}" placeholder="Comma separated">
      </label>
    `;
  }

  function buildSnapshotEditor(trainer) {
    const formatValue = resolveCoachingFormatValue(trainer);
    const bioValue = resolveBio(trainer);
    return `
      <label class="trainer-profile-editor-field">
        <span>Coach perspective</span>
        <textarea data-field="bio" rows="7" placeholder="How you coach and what you believe in">${escapeHtml(bioValue || '')}</textarea>
      </label>
      <label class="trainer-profile-editor-field">
        <span>Ideal client</span>
        <textarea data-field="idealClient" rows="4" placeholder="Who you work best with">${escapeHtml(trainer?.idealClient || '')}</textarea>
      </label>
      <label class="trainer-profile-editor-field">
        <span>Coaching format</span>
        <select data-field="coachingFormat">
          <option value="remote_only"${formatValue === 'remote_only' ? ' selected' : ''}>Remote only</option>
          <option value="in_person_only"${formatValue === 'in_person_only' ? ' selected' : ''}>In-person only</option>
          <option value="remote_and_in_person"${formatValue === 'remote_and_in_person' ? ' selected' : ''}>Remote + in-person</option>
        </select>
      </label>
    `;
  }

  function buildResultsEditor(trainer) {
    const items = (Array.isArray(trainer?.transformations) ? trainer.transformations : [])
      .slice(0, MAX_EDIT_RESULTS);
    while (items.length < 2) items.push({ person: '', result: '', timeline: '', copy: '', beforeImage: '', afterImage: '' });
    return `
      <div class="trainer-profile-editor-help">Use up to ${MAX_EDIT_RESULTS} before/after results. Leave any blank one empty.</div>
      <div class="trainer-profile-editor-result-stack">
        ${items.map((item, index) => `
          <div class="trainer-profile-editor-result-card" data-result-row="${index}">
            <div class="trainer-profile-editor-result-head">Result ${index + 1}</div>
            <div class="trainer-profile-result-visuals trainer-profile-editor-result-visuals">
              <div class="trainer-profile-editor-block trainer-profile-editor-result-photo-block" data-image-wrapper>
                <input type="hidden" data-field="beforeImage" value="${escapeHtml(item?.beforeImage || '')}">
                <label class="trainer-profile-editor-upload">
                  <span>Replace before photo</span>
                  <input type="file" accept="image/*" data-image-upload>
                </label>
                <div class="trainer-profile-editor-image-preview trainer-profile-result-photo before" data-preview-empty="Before photo"></div>
              </div>
              <div class="trainer-profile-editor-block trainer-profile-editor-result-photo-block" data-image-wrapper>
                <input type="hidden" data-field="afterImage" value="${escapeHtml(item?.afterImage || '')}">
                <label class="trainer-profile-editor-upload">
                  <span>Replace after photo</span>
                  <input type="file" accept="image/*" data-image-upload>
                </label>
                <div class="trainer-profile-editor-image-preview trainer-profile-result-photo after" data-preview-empty="After photo"></div>
              </div>
            </div>
            <div class="trainer-profile-editor-grid two">
              <label class="trainer-profile-editor-field">
                <span>Client type</span>
                <input type="text" data-field="person" value="${escapeHtml(item?.person || '')}" placeholder="Busy professional">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Result</span>
                <input type="text" data-field="result" value="${escapeHtml(item?.result || '')}" placeholder="-12 lb in 10 weeks">
              </label>
            </div>
            <div class="trainer-profile-editor-grid two">
              <label class="trainer-profile-editor-field">
                <span>Timeline</span>
                <input type="text" data-field="timeline" value="${escapeHtml(item?.timeline || '')}" placeholder="10 weeks">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Result note</span>
                <textarea data-field="copy" rows="3" placeholder="Stronger, leaner, and more consistent.">${escapeHtml(item?.copy || '')}</textarea>
              </label>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function buildEditorSection(sectionKey, trainer) {
    if (sectionKey === 'offer') {
      return {
        title: 'Edit hero',
        subtitle: 'Update the top promise and supporting copy.',
        body: buildOfferEditor(trainer)
      };
    }
    if (sectionKey === 'identity') {
      return {
        title: 'Edit coach profile',
        subtitle: 'Update the visible coach details, tags, and social links.',
        body: buildIdentityEditor(trainer)
      };
    }
    if (sectionKey === 'specialty') {
      return {
        title: 'Edit specialty clients',
        subtitle: 'Choose the client goals you want this page to sell.',
        body: buildSpecialtyEditor(trainer)
      };
    }
    if (sectionKey === 'included') {
      return {
        title: 'Edit inside coaching',
        subtitle: 'Update what the client gets when they work with you.',
        body: buildIncludedEditor(trainer)
      };
    }
    if (sectionKey === 'snapshot') {
      return {
        title: 'Edit coach snapshot',
        subtitle: 'Update the coach perspective and who this is best for.',
        body: buildSnapshotEditor(trainer)
      };
    }
    if (sectionKey === 'results') {
      return {
        title: 'Edit client results',
        subtitle: 'Update the before and after proof on your page.',
        body: buildResultsEditor(trainer)
      };
    }
    return null;
  }

  function syncEditPills(root, selector, max, noteSelector) {
    const inputs = Array.from(root.querySelectorAll(selector));
    const noteEl = noteSelector ? root.querySelector(noteSelector) : null;
    const sync = () => {
      const checked = inputs.filter((input) => input.checked);
      inputs.forEach((input) => {
        const pill = input.closest('.trainer-profile-editor-pill');
        if (pill) pill.classList.toggle('is-active', input.checked);
        input.disabled = !input.checked && checked.length >= max;
      });
      if (noteEl) {
        noteEl.textContent = checked.length >= max
          ? `${max} of ${max} badges selected.`
          : `Pick up to ${max} badges.`;
      }
    };
    inputs.forEach((input) => input.addEventListener('change', sync));
    sync();
  }

  function bindEditorUploads(root) {
    root.querySelectorAll('[data-image-wrapper]').forEach((wrapper) => {
      const hidden = wrapper.querySelector('input[type="hidden"][data-field]');
      const preview = wrapper.querySelector('.trainer-profile-editor-image-preview');
      const emptyLabel = preview?.getAttribute('data-preview-empty') || 'Add image';
      setUploadPreview(preview, hidden?.value || '', emptyLabel);
      const upload = wrapper.querySelector('input[type="file"][data-image-upload]');
      upload?.addEventListener('change', async () => {
        const file = upload.files && upload.files[0];
        const field = String(hidden?.getAttribute('data-field') || '').trim();
        const value = !file
          ? ''
          : field === 'photoDataUrl'
            ? await prepareTrainerPhotoDataUrl(file)
            : await readFileAsDataUrl(file).catch(() => '');
        upload.value = '';
        if (hidden) hidden.value = value;
        setUploadPreview(preview, value, emptyLabel);
      });
    });
  }

  function applyEditorSection(sectionKey, root) {
    const draft = editorState.draft;
    if (!draft) return;
    if (sectionKey === 'offer') {
      draft.topSectionLabel = String(root.querySelector('[data-field="topSectionLabel"]')?.value || '').trim();
      draft.heroHeadline = String(root.querySelector('[data-field="heroHeadline"]')?.value || '').trim();
      draft.heroSubheadline = String(root.querySelector('[data-field="heroSubheadline"]')?.value || '').trim();
      return;
    }
    if (sectionKey === 'identity') {
      draft.fullName = String(root.querySelector('[data-field="fullName"]')?.value || '').trim();
      draft.displayName = draft.fullName || draft.displayName || '';
      draft.publicHandle = sanitizeHandle(root.querySelector('[data-field="publicHandle"]')?.value || '');
      draft.brandPositioning = String(root.querySelector('[data-field="brandPositioning"]')?.value || '').trim();
      draft.city = String(root.querySelector('[data-field="city"]')?.value || '').trim();
      draft.state = String(root.querySelector('[data-field="state"]')?.value || '').trim();
      const nextPrice = Number(root.querySelector('[data-field="monthlyPrice"]')?.value || '');
      draft.offer = draft.offer || {};
      draft.offer.monthlyCoachingPrice = Number.isFinite(nextPrice) && nextPrice > 0 ? Math.round(nextPrice) : null;
      const nextYears = Number(root.querySelector('[data-field="yearsCoaching"]')?.value || '');
      draft.yearsCoaching = Number.isFinite(nextYears) && nextYears >= 0 ? Math.round(nextYears) : null;
      const nextClients = Number(root.querySelector('[data-field="activeClients"]')?.value || '');
      draft.activeClients = Number.isFinite(nextClients) && nextClients >= 0 ? Math.round(nextClients) : null;
      draft.coachBadgeType = Array.from(root.querySelectorAll('[data-badge-option]:checked')).map((input) => String(input.value || '').trim()).slice(0, 2);
      draft.coachCustomTags = uniqueList(root.querySelector('[data-field="coachCustomTags"]')?.value || '', 6);
      draft.photoDataUrl = String(root.querySelector('[data-field="photoDataUrl"]')?.value || '').trim();
      draft.instagramUrl = String(root.querySelector('[data-field="instagramUrl"]')?.value || '').trim();
      draft.tiktokUrl = String(root.querySelector('[data-field="tiktokUrl"]')?.value || '').trim();
      draft.linkedinUrl = String(root.querySelector('[data-field="linkedinUrl"]')?.value || '').trim();
      draft.websiteUrl = String(root.querySelector('[data-field="websiteUrl"]')?.value || '').trim();
      return;
    }
    if (sectionKey === 'specialty') {
      draft.specialtyClients = Array.from(root.querySelectorAll('[data-specialty-option]:checked'))
        .map((input) => String(input.value || '').trim())
        .filter(Boolean)
        .slice(0, 12);
      draft.specialtyClientsCustom = uniqueList(root.querySelector('[data-field="specialtyClientsCustom"]')?.value || '', 8);
      draft.clientTypes = [...draft.specialtyClients, ...draft.specialtyClientsCustom].join(', ');
      return;
    }
    if (sectionKey === 'included') {
      draft.includedItems = Array.from(root.querySelectorAll('[data-included-row] [data-included-inline-field="item"]'))
        .map((el) => String(el.textContent || '').replace(/\u00a0/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 16);
      draft.includedItemsCustom = [];
      draft.offer = draft.offer || {};
      draft.offer.included = draft.includedItems.join(', ');
      return;
    }
    if (sectionKey === 'snapshot') {
      draft.bio = String(root.querySelector('[data-field="bio"]')?.value || '').trim();
      draft.idealClient = String(root.querySelector('[data-field="idealClient"]')?.value || '').trim();
      applyCoachingFormatValue(draft, root.querySelector('[data-field="coachingFormat"]')?.value || 'remote_only');
      return;
    }
    if (sectionKey === 'results') {
      const rows = Array.from(root.querySelectorAll('[data-result-row]')).map((row) => ({
        person: String(row.querySelector('[data-result-inline-field="person"]')?.textContent || '').replace(/\u00a0/g, ' ').trim(),
        result: String(row.querySelector('[data-result-inline-field="result"]')?.textContent || '').replace(/\u00a0/g, ' ').trim(),
        timeline: String(row.querySelector('[data-result-inline-field="timeline"]')?.textContent || '').replace(/\u00a0/g, ' ').trim(),
        copy: String(row.querySelector('[data-result-inline-field="copy"]')?.textContent || '').replace(/\u00a0/g, ' ').trim(),
        beforeImage: String(row.querySelector('[data-field="beforeImage"]')?.value || '').trim(),
        afterImage: String(row.querySelector('[data-field="afterImage"]')?.value || '').trim()
      })).filter((item) => item.person || item.result || item.timeline || item.copy || item.beforeImage || item.afterImage);
      draft.transformations = rows;
    }
  }

  function syncToolbarDirtyState() {
    const note = $('#trainer-profile-status .trainer-profile-edit-note');
    if (!note) return;
    note.textContent = editorState.dirty ? 'Unsaved changes' : 'Editing page';
    note.classList.toggle('is-dirty', Boolean(editorState.dirty));
  }

  function bindInlineEditorInputs() {
    document.querySelectorAll('[data-inline-edit-section]').forEach((root) => {
      const sectionKey = String(root.getAttribute('data-inline-edit-section') || '').trim();
      if (!sectionKey) return;
      bindEditorUploads(root);
      if (sectionKey === 'identity') {
        syncEditPills(root, '[data-badge-option]', 2, '#trainer-profile-editor-badge-note');
      }
      const syncDraft = () => {
        applyEditorSection(sectionKey, root);
        editorState.dirty = true;
        syncToolbarDirtyState();
      };
      bindChipComposers(root, syncDraft);
      root.querySelectorAll('[data-result-inline-field]').forEach((el) => {
        syncInlineEditablePlaceholderState(el);
        const syncResultText = () => {
          syncInlineEditablePlaceholderState(el);
          syncDraft();
        };
        el.addEventListener('input', syncResultText);
        el.addEventListener('blur', syncResultText);
      });
      root.querySelectorAll('[data-result-photo-input]').forEach((input) => {
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          const row = input.closest('[data-result-row]');
          const field = String(input.getAttribute('data-result-photo-input') || '').trim();
          const hidden = row?.querySelector(`[data-field="${field}"]`);
          const preview = row?.querySelector(`[data-result-photo-preview="${field}"]`);
          const value = file ? await readFileAsDataUrl(file).catch(() => '') : '';
          input.value = '';
          if (hidden) hidden.value = value;
          if (preview && value) preview.src = value;
          syncDraft();
        });
      });
      root.querySelectorAll('[data-included-inline-field]').forEach((el) => {
        syncInlineEditablePlaceholderState(el);
        const syncIncludedText = () => {
          syncInlineEditablePlaceholderState(el);
          syncDraft();
        };
        el.addEventListener('input', syncIncludedText);
        el.addEventListener('blur', syncIncludedText);
      });
      root.querySelectorAll('[data-included-add-input]').forEach((input) => {
        input.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const value = String(input.value || '').trim().replace(/\s+/g, ' ');
          if (!value) return;
          const list = root.querySelector('[data-included-list]');
          const addRow = input.closest('.trainer-profile-check-item-new');
          if (!list || !addRow) return;
          const row = document.createElement('div');
          row.className = 'trainer-profile-check-item';
          row.setAttribute('data-included-row', '');
          row.innerHTML = `
            <span class="trainer-profile-check-mark"></span>
            <div class="trainer-profile-inline-editable trainer-profile-check-item-editable" contenteditable="plaintext-only" spellcheck="false" data-included-inline-field="item" data-inline-placeholder="Coaching item">${escapeHtml(value)}</div>
          `;
          list.insertBefore(row, addRow);
          const editable = row.querySelector('[data-included-inline-field="item"]');
          if (editable) {
            syncInlineEditablePlaceholderState(editable);
            editable.addEventListener('input', () => {
              syncInlineEditablePlaceholderState(editable);
              syncDraft();
            });
            editable.addEventListener('blur', () => {
              syncInlineEditablePlaceholderState(editable);
              syncDraft();
            });
          }
          input.value = '';
          syncDraft();
        });
      });
      root.querySelectorAll('input:not([type="file"]), textarea, select').forEach((input) => {
        input.addEventListener('input', syncDraft);
        input.addEventListener('change', syncDraft);
      });
      root.querySelectorAll('[data-badge-option]').forEach((input) => {
        input.addEventListener('change', syncDraft);
      });
      root.querySelectorAll('[data-specialty-option]').forEach((input) => {
        input.addEventListener('change', () => {
          const pill = input.closest('.trainer-profile-editor-pill');
          if (pill) pill.classList.toggle('is-active', input.checked);
          syncDraft();
        });
      });
      root.querySelectorAll('input[type="file"][data-image-upload]').forEach((input) => {
        input.addEventListener('change', async () => {
          await Promise.resolve();
          syncDraft();
        });
      });
      root.querySelectorAll('[data-social-picker]').forEach((button) => {
        button.addEventListener('click', () => {
          const key = String(button.getAttribute('data-social-picker') || '').trim();
          const def = SOCIAL_LINK_DEFS.find((item) => item.key === key);
          const input = root.querySelector('[data-social-active-input]');
          const label = root.querySelector('[data-social-active-label]');
          const hidden = key ? root.querySelector(`[data-field="${key}"]`) : null;
          if (!key || !def || !input) return;
          root.querySelectorAll('[data-social-picker]').forEach((item) => {
            item.classList.toggle('is-active', item === button);
          });
          input.setAttribute('data-social-active-key', key);
          input.placeholder = def.placeholder;
          input.value = String(hidden?.value || '').trim();
          if (label) label.textContent = def.label;
          input.focus();
          input.select();
        });
      });
      root.querySelectorAll('[data-social-active-input]').forEach((input) => {
        const syncSocial = () => {
          const key = String(input.getAttribute('data-social-active-key') || '').trim();
          const hidden = key ? root.querySelector(`[data-field="${key}"]`) : null;
          const button = key ? root.querySelector(`[data-social-picker="${key}"]`) : null;
          const value = String(input.value || '').trim();
          if (hidden) hidden.value = value;
          if (button) button.classList.toggle('is-disabled', !value);
          syncDraft();
        };
        input.addEventListener('input', syncSocial);
        input.addEventListener('change', syncSocial);
      });
    });
    document.querySelectorAll('[data-social-editor]').forEach((root) => {
      root.querySelectorAll('[data-social-picker]').forEach((button) => {
        button.addEventListener('click', () => {
          const key = String(button.getAttribute('data-social-picker') || '').trim();
          const def = SOCIAL_LINK_DEFS.find((item) => item.key === key);
          const input = root.querySelector('[data-social-active-input]');
          const label = root.querySelector('[data-social-active-label]');
          const hidden = key ? root.querySelector(`[data-field="${key}"]`) : null;
          if (!key || !def || !input) return;
          root.querySelectorAll('[data-social-picker]').forEach((item) => {
            item.classList.toggle('is-active', item === button);
          });
          input.setAttribute('data-social-active-key', key);
          input.placeholder = def.placeholder;
          input.value = String(hidden?.value || '').trim();
          if (label) label.textContent = def.label;
          input.focus();
          input.select();
        });
      });
      root.querySelectorAll('[data-social-active-input]').forEach((input) => {
        const syncSocial = () => {
          const key = String(input.getAttribute('data-social-active-key') || '').trim();
          const hidden = key ? root.querySelector(`[data-field="${key}"]`) : null;
          const button = key ? root.querySelector(`[data-social-picker="${key}"]`) : null;
          const value = String(input.value || '').trim();
          if (hidden) hidden.value = value;
          if (button) button.classList.toggle('is-disabled', !value);
          editorState.dirty = true;
          syncToolbarDirtyState();
        };
        input.addEventListener('input', syncSocial);
        input.addEventListener('change', syncSocial);
      });
    });
    document.querySelectorAll('[data-inline-field]').forEach((el) => {
      const field = String(el.getAttribute('data-inline-field') || '').trim();
      const sectionKey = String(el.getAttribute('data-inline-section') || '').trim();
      const placeholder = String(el.getAttribute('data-inline-placeholder') || '').trim();
      const maxWords = Number(el.getAttribute('data-inline-max-words') || 0);
      const maxChars = Number(el.getAttribute('data-inline-max-chars') || 0);
      syncInlineEditablePlaceholderState(el);
      const sync = () => {
        const current = getEditablePlainText(el);
        const text = trimToCharacterLimit(trimToWordLimit(current, maxWords), maxChars);
        if (current !== text) {
          el.innerText = text;
        }
        const next = text || '';
        if (sectionKey === 'offer') {
          if (field === 'topSectionLabel') editorState.draft.topSectionLabel = next;
          if (field === 'heroHeadline') editorState.draft.heroHeadline = next;
          if (field === 'heroSubheadline') editorState.draft.heroSubheadline = next;
        }
        if (sectionKey === 'identity') {
          if (field === 'fullName') {
            editorState.draft.fullName = next;
            editorState.draft.displayName = next || editorState.draft.displayName || '';
          }
          if (field === 'publicHandle') editorState.draft.publicHandle = sanitizeHandle(next);
          if (field === 'brandPositioning') editorState.draft.brandPositioning = next;
          if (field === 'city') editorState.draft.city = next;
          if (field === 'state') editorState.draft.state = next;
          if (field === 'monthlyPrice') {
            editorState.draft.priceRangeLabel = next;
            editorState.draft.offer = editorState.draft.offer || {};
            editorState.draft.offer.priceRangeLabel = next;
            const num = Number(next.replace(/[^0-9.]/g, ''));
            editorState.draft.offer.monthlyCoachingPrice = Number.isFinite(num) && num > 0 ? Math.round(num) : null;
          }
          if (field === 'yearsCoaching') {
            const num = Number(next.replace(/[^0-9]/g, ''));
            editorState.draft.yearsCoaching = Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
          }
          if (field === 'activeClients') {
            const num = Number(next.replace(/[^0-9]/g, ''));
            editorState.draft.activeClients = Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
          }
        }
        if (sectionKey === 'snapshot') {
          if (field === 'bio') editorState.draft.bio = next;
          if (field === 'idealClient') editorState.draft.idealClient = next;
        }
        editorState.dirty = true;
        syncInlineEditablePlaceholderState(el);
        syncToolbarDirtyState();
      };
      el.addEventListener('input', sync);
      el.addEventListener('blur', () => {
        if (!getEditablePlainText(el) && placeholder) {
          el.innerText = '';
        }
        syncInlineEditablePlaceholderState(el);
        sync();
      });
    });
    document.querySelectorAll('input[type="file"][data-inline-photo="identity"]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        const value = file ? await prepareTrainerPhotoDataUrl(file) : '';
        input.value = '';
        if (!value || !editorState.draft) return;
        editorState.draft.photoDataUrl = value;
        editorState.dirty = true;
        syncToolbarDirtyState();
        renderCurrentProfile();
      });
    });
    document.querySelectorAll('[data-inline-availability-editor]').forEach((root) => {
      const sync = (shouldRerender = false) => {
        if (!editorState.draft) return;
        editorState.draft.availability = editorState.draft.availability || {};
        const daysAvailable = Array.from(root.querySelectorAll('[data-availability-day]:checked'))
          .map((input) => String(input.value || '').trim())
          .filter(Boolean);
        editorState.draft.availability.daysAvailable = daysAvailable;
        editorState.draft.availability.timeSlotsAvailable = daysAvailable.map((day) => {
          const shortDay = day.slice(0, 3);
          const start = String(root.querySelector(`[data-inline-availability-start="${day}"]`)?.value || '11').trim().toLowerCase();
          const startMer = String(root.querySelector(`[data-inline-availability-start-meridiem="${day}"]`)?.value || 'AM').trim().toLowerCase();
          const end = String(root.querySelector(`[data-inline-availability-end="${day}"]`)?.value || '1').trim().toLowerCase();
          const endMer = String(root.querySelector(`[data-inline-availability-end-meridiem="${day}"]`)?.value || 'PM').trim().toLowerCase();
          return `${shortDay} ${start}${startMer}-${end}${endMer}`;
        });
        const gap = Number(root.querySelector('[data-inline-availability-gap]')?.value || '');
        editorState.draft.bufferMinutes = Number.isFinite(gap) && gap >= 0 ? Math.round(gap) : 15;
        editorState.draft.bookingUrgency = String(root.querySelector('[data-inline-availability-urgency]')?.value || '').trim();
        root.querySelectorAll('.trainer-profile-availability-pill').forEach((pill) => {
          const input = pill.querySelector('[data-availability-day]');
          pill.classList.toggle('is-active', Boolean(input?.checked));
        });
        editorState.dirty = true;
        syncToolbarDirtyState();
        if (shouldRerender) renderCurrentProfile();
      };
      root.querySelectorAll('[data-availability-day]').forEach((input) => {
        input.addEventListener('input', () => sync(true));
        input.addEventListener('change', () => sync(true));
      });
      root.querySelectorAll('[data-inline-availability-start], [data-inline-availability-start-meridiem], [data-inline-availability-end], [data-inline-availability-end-meridiem], [data-inline-availability-gap], [data-inline-availability-urgency]').forEach((input) => {
        input.addEventListener('input', () => sync(false));
        input.addEventListener('change', () => sync(false));
      });
    });
  }

  function buildInlineEditSection(sectionKey, trainer, classes = '') {
    const config = buildEditorSection(sectionKey, trainer);
    if (!config) return '';
    return `
      <div class="trainer-profile-inline-editor ${classes}" data-inline-edit-section="${escapeHtml(sectionKey)}">
        <div class="trainer-profile-inline-editor-head">
          <div class="trainer-profile-inline-editor-kicker">${escapeHtml(config.title)}</div>
          <div class="trainer-profile-inline-editor-sub">${escapeHtml(config.subtitle)}</div>
        </div>
        <div class="trainer-profile-inline-editor-body">
          ${config.body}
        </div>
      </div>
    `;
  }

  async function savePageEdits() {
    if (!editorState.draft || editorState.saving) return;
    if (!editorState.dirty) {
      editorState.enabled = false;
      editorState.openSection = '';
      document.body.classList.remove('trainer-profile-editing');
      renderCurrentProfile();
      return;
    }
    editorState.saving = true;
    try {
      const viewer = window.__trainerProfileViewer || null;
      const isDemoLayoutSave = Boolean(
        pageState.trainer?.isDemoLayout
        && (!pageState.trainer?.id || String(pageState.trainer.id) !== String(viewer?.id || ''))
      );
      if (isDemoLayoutSave) {
        const savedDemo = {
          ...cloneJson(pageState.trainer || {}),
          ...cloneJson(editorState.draft),
          isDemoLayout: true
        };
        writeDemoTrainerOverride(savedDemo);
        pageState.trainer = savedDemo;
        editorState.original = cloneJson(savedDemo);
        editorState.draft = cloneJson(savedDemo);
        editorState.enabled = false;
        editorState.dirty = false;
        editorState.openSection = '';
        document.body.classList.remove('trainer-profile-editing');
        renderCurrentProfile();
        return;
      }
      const payload = buildTrainerSavePayload(editorState.draft, window.__trainerProfileViewer || null);
      const resp = await api('/api/auth/trainer/onboarding', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!resp.ok || !resp.json?.ok || !resp.json?.trainer) {
        throw new Error(resp.json?.error || 'Could not save the trainer page.');
      }
      const saved = {
        ...cloneJson(pageState.trainer || {}),
        ...cloneJson(resp.json.trainer),
        availability: {
          ...cloneJson(pageState.trainer?.availability || {}),
          ...cloneJson(resp.json.trainer?.availability || {})
        },
        offer: {
          ...cloneJson(pageState.trainer?.offer || {}),
          ...cloneJson(resp.json.trainer?.offer || {})
        }
      };
      pageState.trainer = saved;
      editorState.original = cloneJson(saved);
      editorState.draft = cloneJson(saved);
      editorState.enabled = false;
      editorState.dirty = false;
      editorState.openSection = '';
      document.body.classList.remove('trainer-profile-editing');
      const nextKey = saved?.publicHandle || saved?.username || slugify(saved?.fullName || '');
      if (nextKey) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('trainer', nextKey);
        history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
      }
      renderCurrentProfile();
    } catch (err) {
      window.alert(err?.message || 'Could not save the trainer page.');
    } finally {
      editorState.saving = false;
    }
  }

  function restoreSectionDraft(sectionKey) {
    if (!editorState.draft || !editorState.original) return;
    const original = cloneJson(editorState.original);
    if (sectionKey === 'offer') {
      editorState.draft.topSectionLabel = original.topSectionLabel || '';
      editorState.draft.heroHeadline = original.heroHeadline || '';
      editorState.draft.heroSubheadline = original.heroSubheadline || '';
      editorState.draft.availability = cloneJson(original.availability || {});
      editorState.draft.bufferMinutes = original.bufferMinutes;
      editorState.draft.bookingUrgency = original.bookingUrgency || '';
      return;
    }
    if (sectionKey === 'identity') {
      editorState.draft.fullName = original.fullName || '';
      editorState.draft.displayName = original.displayName || '';
      editorState.draft.publicHandle = original.publicHandle || '';
      editorState.draft.brandPositioning = original.brandPositioning || '';
      editorState.draft.city = original.city || '';
      editorState.draft.state = original.state || '';
      editorState.draft.yearsCoaching = original.yearsCoaching;
      editorState.draft.activeClients = original.activeClients;
      editorState.draft.photoDataUrl = original.photoDataUrl || '';
      editorState.draft.offer = {
        ...cloneJson(editorState.draft.offer || {}),
        ...cloneJson(original.offer || {})
      };
      return;
    }
    if (sectionKey === 'results') {
      editorState.draft.transformations = cloneJson(original.transformations || []);
      return;
    }
    if (sectionKey === 'specialty') {
      editorState.draft.specialtyClients = cloneJson(original.specialtyClients || []);
      editorState.draft.specialtyClientsCustom = cloneJson(original.specialtyClientsCustom || []);
      return;
    }
    if (sectionKey === 'included') {
      editorState.draft.includedItems = cloneJson(original.includedItems || []);
      editorState.draft.includedItemsCustom = cloneJson(original.includedItemsCustom || []);
      editorState.draft.offer = {
        ...cloneJson(editorState.draft.offer || {}),
        ...cloneJson(original.offer || {})
      };
      return;
    }
    if (sectionKey === 'snapshot') {
      editorState.draft.bio = original.bio || '';
      editorState.draft.idealClient = original.idealClient || '';
    }
  }

  function closeSectionEdits({ discard = false } = {}) {
    const sectionKey = String(editorState.openSection || '').trim();
    if (!sectionKey) return;
    if (discard) {
      restoreSectionDraft(sectionKey);
    } else {
      applyInlineTextSection(sectionKey);
      const root = document.querySelector(`[data-inline-edit-section="${sectionKey}"]`);
      if (root) applyEditorSection(sectionKey, root);
    }
    editorState.openSection = '';
    editorState.dirty = JSON.stringify(editorState.draft || {}) !== JSON.stringify(editorState.original || {});
    renderCurrentProfile();
  }

  function bindPageEditControls() {
    document.querySelectorAll('[data-trainer-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const sectionKey = String(button.getAttribute('data-trainer-edit') || '').trim();
        if (!sectionKey) return;
        editorState.openSection = sectionKey;
        renderCurrentProfile();
      });
    });
    const editBtn = $('#trainer-profile-edit-toggle');
    if (editBtn) {
      editBtn.onclick = () => {
        if (editorState.enabled) {
          savePageEdits();
          return;
        }
        editorState.enabled = true;
        editorState.dirty = false;
        editorState.draft = cloneJson(pageState.trainer);
        editorState.original = cloneJson(pageState.trainer);
        document.body.classList.add('trainer-profile-editing');
        renderCurrentProfile();
      };
    }
    const cancelBtn = $('#trainer-profile-edit-cancel');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        const okay = window.confirm('Change nothing and revert back to the original page?');
        if (!okay) return;
        editorState.enabled = false;
        editorState.dirty = false;
        editorState.openSection = '';
        editorState.draft = cloneJson(editorState.original || pageState.trainer);
        document.body.classList.remove('trainer-profile-editing');
        renderCurrentProfile();
      };
    }
    const saveBtn = $('#trainer-profile-edit-save');
    if (saveBtn) {
      saveBtn.onclick = () => {
        savePageEdits();
      };
    }
    document.querySelectorAll('[data-trainer-section-cancel]').forEach((button) => {
      button.onclick = () => {
        const okay = window.confirm('Discard changes for this section?');
        if (!okay) return;
        closeSectionEdits({ discard: true });
      };
    });
    document.querySelectorAll('[data-trainer-section-save]').forEach((button) => {
      button.onclick = () => {
        closeSectionEdits({ discard: false });
      };
    });
    bindInlineEditorInputs();
  }

  function renderPageEditToolbar(trainer, view) {
    const statusEl = $('#trainer-profile-status');
    if (!statusEl) return;
    document.body.classList.toggle('trainer-profile-editing', Boolean(editorState.enabled));
    if (!canEditTrainerPage(trainer, view)) {
      statusEl.innerHTML = '';
      return;
    }
    if (!editorState.enabled) {
      statusEl.innerHTML = `
        <div class="trainer-profile-edit-toolbar">
          <button type="button" class="trainer-profile-edit-toggle" id="trainer-profile-edit-toggle">Edit page</button>
        </div>
      `;
      return;
    }
    statusEl.innerHTML = `
      <div class="trainer-profile-edit-toolbar is-active">
        <span class="trainer-profile-edit-note${editorState.dirty ? ' is-dirty' : ''}">${editorState.dirty ? 'Unsaved changes' : 'Editing page'}</span>
        <button type="button" class="trainer-profile-edit-toggle" id="trainer-profile-edit-toggle">&#10003; Done editing</button>
      </div>
    `;
  }

  function resolveHeroSubheadline(trainer) {
    const explicit = String(trainer?.heroSubheadline || '').trim();
    if (explicit) return explicit;
    return '';
  }

  function resolveHowItWorks(trainer) {
    const explicit = Array.isArray(trainer?.howItWorks) ? trainer.howItWorks : [];
    const normalized = explicit
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        return {
          step: String(item.step || index + 1).trim(),
          title: String(item.title || '').trim(),
          copy: String(item.copy || '').trim()
        };
      })
      .filter((item) => item && item.title && item.copy);
    if (normalized.length) return normalized.slice(0, 3);
    return [
      {
        step: '01',
        title: 'Book your fit call',
        copy: 'Pick a consult slot and talk through goals, schedule, injuries, and what you actually want to change.'
      },
      {
        step: '02',
        title: 'Get a clear plan',
        copy: 'Training, nutrition direction, and accountability are built around your real week, not fantasy discipline.'
      },
      {
        step: '03',
        title: 'Progress without guessing',
        copy: 'You get check-ins, adjustments, and direct feedback so you keep moving forward instead of stalling out.'
      }
    ];
  }

  function resolveWhoItsFor(trainer) {
    const explicit = Array.isArray(trainer?.whoItsFor) ? trainer.whoItsFor : [];
    const normalized = explicit
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    if (normalized.length) return normalized.slice(0, 4);
    return [
      'Busy professionals who want a leaner, stronger look without making fitness their whole life.',
      'People who want structure, accountability, and a coach who gives direct answers fast.',
      'Clients who are done guessing and want a system they can actually follow consistently.',
      'Anyone who wants premium coaching without overcomplicating every meal and workout.'
    ];
  }

  function resolveWhoItsNotFor(trainer) {
    const explicit = Array.isArray(trainer?.whoItsNotFor) ? trainer.whoItsNotFor : [];
    const normalized = explicit.map((item) => String(item || '').trim()).filter(Boolean);
    if (normalized.length) return normalized.slice(0, 4);
    return [
      'People looking for a crash fix without consistency.',
      'Anyone who wants to ignore the plan and still expect elite results.',
      'Clients who want motivation only, not structure and accountability.'
    ];
  }

  function resolveSpecialtyClients(trainer) {
    const arraySource = Array.isArray(trainer?.specialtyClients)
      ? trainer.specialtyClients
      : Array.isArray(trainer?.clientTypes)
        ? trainer.clientTypes
        : null;
    const parts = arraySource
      ? arraySource.map((item) => String(item || '').trim()).filter(Boolean)
      : String(trainer?.clientTypes || trainer?.specialtyClients || '').trim()
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    if (parts.length) return parts.slice(0, 6);
    return ['Fat loss', 'Muscle gain', 'Body recomposition'];
  }

  function resolveIncludedItems(trainer) {
    const arraySource = Array.isArray(trainer?.includedItems)
      ? trainer.includedItems
      : Array.isArray(trainer?.offer?.included)
        ? trainer.offer.included
        : null;
    const parts = arraySource
      ? arraySource.map((item) => String(item || '').trim()).filter(Boolean)
      : String(trainer?.offer?.included || '').trim()
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    if (parts.length) return parts.slice(0, 6);
    return [
      'Custom training program',
      'Nutrition targets',
      'Weekly check-ins',
      'Form feedback',
      'Fast adjustments',
      'Direct support'
    ];
  }

  function resolveIdentityBadges(trainer, fallback = []) {
    const selected = uniqueList([
      ...(Array.isArray(trainer?.coachBadgeType) ? trainer.coachBadgeType : []),
      ...(Array.isArray(trainer?.coachCustomTags) ? trainer.coachCustomTags : [])
    ], 3);
    if (selected.length) return selected;
    return uniqueList(fallback, 3);
  }

  function formatPhoneDisplay(raw) {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return String(raw || '').trim();
  }

  function buildSocialBubble(type, href, label, icon) {
    const safeHref = String(href || '').trim() || '#';
    const disabled = safeHref === '#';
    return `
      <a
        class="trainer-profile-social-bubble ${escapeHtml(type)}${disabled ? ' is-disabled' : ''}"
        href="${escapeHtml(safeHref)}"
        ${disabled ? 'aria-disabled="true" tabindex="-1"' : 'target="_blank" rel="noopener"'}
        aria-label="${escapeHtml(label)}"
      >${icon}</a>
    `;
  }

  function buildIdentitySocialEditor(trainer) {
    const defs = SOCIAL_LINK_DEFS.map((def) => ({
      ...def,
      value: String(trainer?.[def.key] || '').trim()
    }));
    const active = defs.find((item) => item.value) || defs[0];
    return `
      <div class="trainer-profile-social-editor" data-social-editor>
        <div class="trainer-profile-social-editor-label">Social links</div>
        <div class="trainer-profile-social-row trainer-profile-social-row-editing">
          ${defs.map((item) => `
            <button
              type="button"
              class="trainer-profile-social-bubble ${escapeHtml(item.type)}${item.value ? '' : ' is-disabled'}${item.key === active.key ? ' is-active' : ''}"
              data-social-picker="${escapeHtml(item.key)}"
              aria-label="${escapeHtml(item.label)}"
            >${item.icon}</button>
          `).join('')}
        </div>
        ${defs.map((item) => `
          <input type="hidden" data-field="${escapeHtml(item.key)}" value="${escapeHtml(item.value)}">
        `).join('')}
        <div class="trainer-profile-social-editor-input">
          <div class="trainer-profile-social-editor-title" data-social-active-label>${escapeHtml(active.label)}</div>
          <input
            type="text"
            data-social-active-input
            data-social-active-key="${escapeHtml(active.key)}"
            value="${escapeHtml(active.value)}"
            placeholder="${escapeHtml(active.placeholder)}"
          >
        </div>
      </div>
    `;
  }

  function weekdayToIndex(raw) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return null;
    const map = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tues: 2,
      tuesday: 2,
      wed: 3,
      weds: 3,
      wednesday: 3,
      thu: 4,
      thur: 4,
      thurs: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6
    };
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  }

  function parseSlotDayIndex(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const match = text.match(/^([A-Za-z]{3,9})\b/);
    return match ? weekdayToIndex(match[1]) : null;
  }

  function stripSlotDayLabel(raw) {
    const text = String(raw || '').trim();
    const dayIndex = parseSlotDayIndex(text);
    if (dayIndex === null) return text;
    return text.replace(/^[A-Za-z]{3,9}\s+/, '').trim() || text;
  }

  function parseClockMinutes(raw) {
    const match = String(raw || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = String(match[3] || '').toLowerCase();
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'pm') hour += 12;
    return (hour * 60) + minute;
  }

  function formatClockMinutes(totalMinutes) {
    const safeMinutes = Math.max(0, Math.min(1439, Number(totalMinutes) || 0));
    const hour24 = Math.floor(safeMinutes / 60);
    const minute = safeMinutes % 60;
    const meridiem = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = (hour24 % 12) || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
  }

  function expandAvailabilityWindow(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    const dayIndex = parseSlotDayIndex(text);
    const body = stripSlotDayLabel(text);
    const parts = body.split(/\s*[-–]\s*/).map((part) => String(part || '').trim()).filter(Boolean);
    const startMinutes = parseClockMinutes(parts[0] || body);
    const endMinutes = parts.length > 1 ? parseClockMinutes(parts[1]) : null;

    if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && endMinutes > startMinutes) {
      const slots = [];
      const durationMinutes = 45;
      const stepMinutes = 60;
      for (let cursor = startMinutes; cursor + durationMinutes <= endMinutes; cursor += stepMinutes) {
        slots.push({
          dayIndex,
          timeLabel: `${formatClockMinutes(cursor)} - ${formatClockMinutes(cursor + durationMinutes)}`
        });
      }
      if (slots.length) return slots;
      return [{
        dayIndex,
        timeLabel: `${formatClockMinutes(startMinutes)} - ${formatClockMinutes(endMinutes)}`
      }];
    }

    if (Number.isFinite(startMinutes)) {
      return [{
        dayIndex,
        timeLabel: formatClockMinutes(startMinutes)
      }];
    }

    return [{
      dayIndex,
      timeLabel: body
    }];
  }

  function buildAvailabilityCalendar(trainer) {
    const rawSlots = Array.isArray(trainer?.availability?.timeSlotsAvailable) && trainer.availability.timeSlotsAvailable.length
      ? trainer.availability.timeSlotsAvailable.map((slot) => String(slot || '').trim()).filter(Boolean)
      : ['Flexible consult times'];
    const expandedSlots = rawSlots.flatMap((slot) => expandAvailabilityWindow(slot));
    const explicitDays = Array.isArray(trainer?.availability?.daysAvailable)
      ? trainer.availability.daysAvailable.map((day) => weekdayToIndex(day)).filter((day) => Number.isInteger(day))
      : [];
    const slotDays = expandedSlots
      .map((slot) => slot.dayIndex)
      .filter((day) => Number.isInteger(day));
    const allowedDays = Array.from(new Set(slotDays.length ? slotDays : explicitDays));
    const rangeDays = Math.max(1, Math.min(60, Number(trainer?.dateRangeDays || 14)));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(today);
    rangeEnd.setDate(today.getDate() + Math.max(0, rangeDays - 1));
    const gridEnd = new Date(rangeEnd);
    gridEnd.setDate(rangeEnd.getDate() + (6 - rangeEnd.getDay()));
    const days = [];

    for (let cursor = new Date(today); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
      const date = new Date(cursor);
      const dateKey = date.toISOString().slice(0, 10);
      const inRange = date >= today && date <= rangeEnd;
      const matchingSlots = expandedSlots.filter((slot) => slot.dayIndex === null || slot.dayIndex === date.getDay());
      const slots = (matchingSlots.length ? matchingSlots : (!slotDays.length ? expandedSlots : []))
        .map((slot) => {
          const timeLabel = String(slot.timeLabel || '').trim();
          const fullLabel = `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • ${timeLabel}`;
          return {
            value: fullLabel,
            timeLabel,
            fullLabel
          };
        });
      const isAvailable = Boolean(inRange && slots.length && (!allowedDays.length || allowedDays.includes(date.getDay())));
      days.push({
        key: dateKey,
        weekdayLabel: date.toLocaleDateString(undefined, { weekday: 'short' }),
        monthLabel: date.toLocaleDateString(undefined, { month: 'short' }),
        dayLabel: date.toLocaleDateString(undefined, { day: 'numeric' }),
        longLabel: date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
        slots: isAvailable ? slots : [],
        isAvailable,
        isMuted: false
      });
    }

    const availableDays = days.filter((item) => item.isAvailable);
    const firstAvailable = availableDays[0] || null;
    return {
      monthRangeLabel: `${today.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${rangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      firstAvailableKey: firstAvailable?.key || '',
      days: availableDays
    };
  }

  function buildBookingHref(trainer, slotLabel, viewerPhone) {
    const fullName = trainer?.fullName || trainer?.displayName || 'Trainer';
    const email = resolveContactEmail(trainer);
    if (email) {
      const body = [
        `Hi ${fullName},`,
        '',
        'I want to book an intro call.',
        slotLabel ? `Requested time: ${slotLabel}` : 'Requested time: flexible',
        viewerPhone ? `My account phone: ${viewerPhone}` : 'My account phone: not linked yet',
        '',
        'Can you send the next step?'
      ].join('\n');
      return `mailto:${email}?subject=${encodeURIComponent(`Intro call with ${fullName}`)}&body=${encodeURIComponent(body)}`;
    }
    const instagram = buildSocialHref('instagram', trainer?.instagramUrl || trainer?.instagramHandle);
    if (instagram) return instagram;
    const tiktok = buildSocialHref('tiktok', trainer?.tiktokUrl || trainer?.tiktokHandle);
    return tiktok || '#';
  }

  function resolveNextOpeningLabel(trainer) {
    const availabilityCalendar = buildAvailabilityCalendar(trainer);
    const firstDay = Array.isArray(availabilityCalendar.days) ? availabilityCalendar.days[0] : null;
    const firstSlot = firstDay?.slots?.[0] || null;
    if (firstDay && firstSlot) {
      return `${firstDay.longLabel} at ${firstSlot.timeLabel}`;
    }
    return 'Scheduling by request';
  }

  function buildTrainerReferralLink(trainer) {
    const explicit = String(trainer?.referralLink || '').trim();
    if (explicit) {
      if (/^https?:\/\//i.test(explicit)) return explicit;
      if (explicit.startsWith('/')) return `${window.location.origin}${explicit}`;
      return `${window.location.origin}/${explicit.replace(/^\/+/, '')}`;
    }
    const code = String(trainer?.referralCode || '').trim();
    if (!code) return window.location.href;
    return `${window.location.origin}/index.html?ref=${encodeURIComponent(code)}#signup`;
  }

  function buildAbsoluteAssetUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) return value;
    if (value.startsWith('/')) return `${window.location.origin}${value}`;
    return `${window.location.origin}/${value.replace(/^\/+/, '')}`;
  }

  function buildShareCoachMessage(trainer) {
    const fullName = trainer?.fullName || trainer?.displayName || 'This coach';
    const profileUrl = buildTrainerReferralLink(trainer);
    const nextOpening = resolveNextOpeningLabel(trainer);
    const coachingSummary = String(trainer?.brandPositioning || trainer?.heroHeadline || '').trim();
    const imageUrl = buildAbsoluteAssetUrl(trainer?.photoDataUrl || '');
    return [
      `Hey,`,
      ``,
      `I wanted to send over ${fullName}'s coaching profile because this looks like a strong fit.`,
      coachingSummary ? `What stands out: ${coachingSummary}` : '',
      `Next opening: ${nextOpening}.`,
      `Use this invite link if you want to check them out or sign up: ${profileUrl}`,
      imageUrl && !imageUrl.startsWith('data:') ? `Coach photo: ${imageUrl}` : '',
      ``,
      `If you want, I can help you compare this coach against a couple other options too.`
    ].filter(Boolean).join('\n');
  }

  function refreshShareCoachActions(trainer) {
    const textEl = $('#trainer-profile-share-text');
    const emailEl = $('#trainer-profile-share-email');
    const statusEl = $('#trainer-profile-share-status');
    if (!textEl || !emailEl) return;

    const fullName = trainer?.fullName || trainer?.displayName || 'Coach';
    const message = buildShareCoachMessage(trainer);
    const subject = `Coach profile: ${fullName}`;

    textEl.href = `sms:?&body=${encodeURIComponent(message)}`;
    emailEl.href = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    emailEl.target = '_blank';
    emailEl.rel = 'noopener noreferrer';
    if (statusEl) statusEl.textContent = '';
  }

  function bindShareCoachUi(trainer) {
    const toggle = $('#trainer-profile-share-toggle');
    const actions = $('#trainer-profile-share-actions');
    const textBtn = $('#trainer-profile-share-text');
    const emailBtn = $('#trainer-profile-share-email');
    const copyBtn = $('#trainer-profile-share-copy');
    const statusEl = $('#trainer-profile-share-status');
    if (!toggle || !actions) return;
    refreshShareCoachActions(trainer);
    toggle.onclick = () => {
      const isOpen = actions.classList.contains('is-open');
      actions.classList.toggle('is-open', !isOpen);
      if (statusEl) statusEl.textContent = '';
    };
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(buildShareCoachMessage(trainer));
          if (statusEl) statusEl.textContent = 'Coach share message copied.';
        } catch {
          if (statusEl) statusEl.textContent = 'Could not copy right now.';
        }
      };
    }
  }

  function demoTrainerFallback() {
    const base = {
      id: 'demo-trainer-layout',
      fullName: 'Avery Stone',
      username: 'averystone',
      displayName: 'Avery Stone',
      email: 'avery@stonecoaching.co',
      photoDataUrl: 'assets/images/placeholders/trainer-avery.jpg',
      topSectionLabel: 'Online + Miami coach',
      coachBadgeType: ['Fat Loss', 'Lifestyle'],
      coachCustomTags: ['Strength', 'Busy adults'],
      heroHeadline: 'I help busy adults lose fat, get stronger, and stay consistent without living in the gym.',
      heroSubheadline: 'Simple programming, realistic nutrition targets, and steady accountability that fits work and family life.',
      howItWorks: [
        {
          step: '01',
          title: 'Start with a quick consult',
          copy: 'We go over your goals, training background, schedule, and what is actually realistic for your life right now.'
        },
        {
          step: '02',
          title: 'Get a plan built around your week',
          copy: 'Your workouts, cardio targets, and nutrition guidelines are set up around your real routine, not an ideal one.'
        },
        {
          step: '03',
          title: 'Adjust as progress comes in',
          copy: 'Check-ins keep the process moving and the plan gets updated when stress, schedule, or results change.'
        }
      ],
      whoItsFor: [
        'Busy adults who want structure and accountability without spending hours in the gym.',
        'Clients who want to look leaner, stronger, and more athletic while still keeping training practical.',
        'People who already try hard but need a clearer system for food, training progression, and check-ins.',
        'Anyone who wants direct coaching instead of random workouts and guesswork.'
      ],
      whoItsNotFor: [
        'People looking for a one-time PDF with no coaching.',
        'Clients who do not want to check in or follow simple habits consistently.',
        'Anyone expecting a crash-diet style approach.'
      ],
      galleryImages: [
        { src: 'assets/images/trainers/trainer-rowing-coach.jpg', alt: 'Avery coaching a rowing session', position: 'center center' },
        { src: 'assets/images/trainers/trainer-floor-coach.jpg', alt: 'Avery coaching mobility work', position: 'center 22%' },
        { src: 'assets/images/trainers/trainer-stepup-coach.jpg', alt: 'Avery coaching a client on form', position: 'center 34%' }
      ],
      transformations: [
        {
          beforeImage: 'assets/images/trainers/client-before-02.jpg',
          afterImage: 'assets/images/trainers/client-after-03.jpg',
          label: 'Client transformation',
          result: '-11 lb in 10 weeks',
          timeline: '10 weeks',
          copy: 'Three training days, step goals, and tighter weekday nutrition cleaned up the whole routine.',
          quote: 'It finally felt simple enough to stick to.',
          person: 'Office professional'
        },
        {
          beforeImage: 'assets/images/trainers/client-before-01.jpg',
          afterImage: 'assets/images/trainers/client-after-02.jpg',
          label: 'Client transformation',
          result: 'Waist down 3 in',
          timeline: '8 weeks',
          copy: 'A simpler split, better meal structure, and weekly feedback kept momentum steady.',
          quote: 'The weekly check-ins kept me honest.',
          person: 'Hybrid client'
        },
        {
          beforeImage: 'assets/images/trainers/client-before-03.jpg',
          afterImage: 'assets/images/trainers/transformation-01.jpg',
          label: 'Client transformation',
          result: 'Leaner in 12 weeks',
          timeline: '12 weeks',
          copy: 'Training progressions plus consistent food habits made the physique change show up clearly.',
          quote: 'I looked and felt more put together fast.',
          person: 'Remote client'
        },
        {
          beforeImage: 'assets/images/trainers/client-before-04.jpg',
          afterImage: 'assets/images/trainers/transformation-02.jpg',
          label: 'Client transformation',
          result: 'Body fat down in 14 weeks',
          timeline: '14 weeks',
          copy: 'Better structure around lifting, cardio, and protein intake made the plan sustainable and productive.',
          quote: 'This was the first setup I could actually maintain.',
          person: 'Online client'
        }
      ],
      brandPositioning: 'Straightforward coaching for busy adults who want visible progress and a plan they can actually follow.',
      bio: 'Avery works with busy adults who want fat loss, better structure, and stronger training habits without making fitness the center of their whole life. Her coaching style is practical, direct, and focused on keeping the plan simple enough to execute week after week.',
      coachingPhilosophy: 'Keep the plan simple, train hard, recover well, and fix the habits that actually move progress.',
      specialtyClients: ['Fat loss', 'Body recomposition', 'Busy professionals'],
      specialtyClientsCustom: ['Lifestyle coaching', 'Remote coaching'],
      clientTypes: 'Fat loss, body recomposition, busy professionals',
      idealClient: 'Busy adults who want a leaner physique, better strength, and a routine they can keep up with year-round.',
      differentiator: 'Simple systems, realistic nutrition targets, weekly accountability, and fast adjustments when something stops working.',
      includedItems: [
        'Custom training program',
        'Weekly check-ins',
        'Program adjustments',
        'Nutrition guidance',
        'Form feedback',
        'Direct support'
      ],
      includedItemsCustom: ['Habit review'],
      offer: {
        onlineCoaching: true,
        inPersonTraining: true,
        monthlyCoachingPrice: 249,
        priceRangeMin: 249,
        priceRangeMax: 399,
        priceRangeLabel: 'From $249/month',
        included: 'Custom training program, weekly check-ins, program adjustments, nutrition guidance, form feedback, and direct support.'
      },
      availability: {
        daysAvailable: ['Monday', 'Wednesday', 'Friday'],
        timeSlotsAvailable: ['Mon 11am-1pm', 'Wed 6pm-8pm', 'Fri 12pm-3pm'],
        dayWindows: {
          Monday: [{ startHour: 11, startPeriod: 'AM', endHour: 1, endPeriod: 'PM' }],
          Wednesday: [{ startHour: 6, startPeriod: 'PM', endHour: 8, endPeriod: 'PM' }],
          Friday: [{ startHour: 12, startPeriod: 'PM', endHour: 3, endPeriod: 'PM' }]
        },
        timeZone: 'America/New_York'
      },
      bookingEnabled: true,
      consultationLengthMinutes: 15,
      dateRangeDays: 14,
      maxConsultsPerDay: 4,
      bufferMinutes: 15,
      bookingNoticeHours: 12,
      bookingApprovalMode: 'manual',
      bookingCtaText: 'Find out if this is a fit in 15 minutes.',
      bookingUrgency: 'A few consult spots are open this week.',
      city: 'Miami',
      state: 'Florida',
      zipCode: '33101',
      yearsExperience: 6,
      activeClients: 14,
      experienceLevel: 'Intermediate',
      instagramHandle: 'avery.builds',
      tiktokHandle: 'averybuilds',
      instagramUrl: 'https://instagram.com/avery.builds',
      tiktokUrl: 'https://tiktok.com/@averybuilds',
      accentColor: '#d89a3b',
      proof: {
        manualClientCount: 14,
        signupCount: 32,
        paidSignupCount: 11,
        currentMonthPaidCount: 4,
        tier: {
          name: 'Builder',
          nextAt: 20,
          remainingToNext: 6
        }
      },
      isDemoLayout: true
    };
    const override = readDemoTrainerOverride();
    return [{
      ...base,
      ...(override && typeof override === 'object' ? override : {}),
      isDemoLayout: true,
      id: 'demo-trainer-layout',
      username: 'averystone'
    }];
  }

  function readDirectoryCache() {
    try {
      const raw = sessionStorage.getItem('trainer-directory-cache');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function trainerMatchesKey(trainer, key) {
    if (!trainer || !key) return false;
    const candidateKeys = [
      trainer.id,
      trainer.username,
      trainer.publicHandle,
      trainer.displayName,
      trainer.fullName,
      slugify(trainer.username),
      slugify(trainer.displayName),
      slugify(trainer.fullName)
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => [value, normalizeText(value), slugify(value)])
      .flat();
    return candidateKeys.includes(key);
  }

  function findTrainerByParam(trainers, param) {
    const normalized = normalizeText(param);
    const slug = slugify(param);
    return trainers.find((trainer) => trainerMatchesKey(trainer, normalized) || trainerMatchesKey(trainer, slug)) || null;
  }

  function bindBooking(trainer, viewer) {
    const slotButtons = Array.from(document.querySelectorAll('[data-book-slot]'));
    const dateButtons = Array.from(document.querySelectorAll('[data-book-date]'));
    const heroTimeGroups = Array.from(document.querySelectorAll('[data-book-time-group]'));
    const requestBtn = $('#trainer-request-call-btn');
    const statusEl = $('#trainer-booking-status');
    const phoneValueEl = $('#trainer-booking-phone');
    const phoneNoteEl = $('#trainer-booking-phone-note');
    const viewerPhone = String(viewer?.phone || '').trim();
    const formattedPhone = formatPhoneDisplay(viewerPhone);
    let selectedSlot = '';
    let selectedDate = String(document.querySelector('[data-book-date].is-active')?.getAttribute('data-book-date') || '').trim()
      || String(dateButtons.find((button) => !button.disabled)?.getAttribute('data-book-date') || '').trim();

    const syncDatePicker = () => {
      dateButtons.forEach((button) => {
        const key = String(button.getAttribute('data-book-date') || '').trim();
        button.classList.toggle('is-active', key === selectedDate);
      });
      heroTimeGroups.forEach((group) => {
        const key = String(group.getAttribute('data-book-time-group') || '').trim();
        group.classList.toggle('is-hidden', Boolean(selectedDate) && key !== selectedDate);
      });
    };

    const sync = () => {
      syncDatePicker();
      if (phoneValueEl) phoneValueEl.textContent = formattedPhone || 'No phone linked to this account';
      if (phoneNoteEl) {
        phoneNoteEl.textContent = formattedPhone
          ? 'This request will use the phone number already linked to your account.'
          : 'Add a phone number to your account first so the coach knows where to follow up.';
      }
      if (requestBtn) {
        requestBtn.href = buildBookingHref(trainer, selectedSlot, formattedPhone);
        const ready = Boolean(selectedSlot && formattedPhone);
        requestBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');
        requestBtn.classList.toggle('ghost', !ready);
        requestBtn.classList.toggle('is-disabled', !ready);
        requestBtn.textContent = !selectedSlot
          ? 'Select a time'
          : (formattedPhone ? 'Confirm phone and send' : 'Add phone on account first');
      }
      if (statusEl) {
        statusEl.textContent = !selectedSlot
          ? 'Pick a slot first.'
          : (formattedPhone
            ? `Selected: ${selectedSlot}. Confirm your phone and send the request.`
            : 'This account does not have a phone number linked yet.');
      }
    };

    if (requestBtn) {
      requestBtn.addEventListener('click', (event) => {
        if (!selectedSlot || !formattedPhone) event.preventDefault();
      });
    }

    slotButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const next = String(button.getAttribute('data-book-slot') || '').trim();
        const nextDate = String(button.getAttribute('data-book-date-slot') || '').trim();
        if (nextDate) selectedDate = nextDate;
        selectedSlot = selectedSlot === next ? '' : next;
        slotButtons.forEach((item) => {
          const value = String(item.getAttribute('data-book-slot') || '').trim();
          item.classList.toggle('is-active', Boolean(selectedSlot) && value === selectedSlot);
        });
        sync();
      });
    });

    dateButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const next = String(button.getAttribute('data-book-date') || '').trim();
        if (!next) return;
        selectedDate = next;
        const stillVisible = slotButtons.some((item) => {
          const value = String(item.getAttribute('data-book-slot') || '').trim();
          const slotDate = String(item.getAttribute('data-book-date-slot') || '').trim();
          return Boolean(slotDate) && value === selectedSlot && slotDate === selectedDate;
        });
        if (!stillVisible) selectedSlot = '';
        slotButtons.forEach((item) => {
          const value = String(item.getAttribute('data-book-slot') || '').trim();
          item.classList.toggle('is-active', Boolean(selectedSlot) && value === selectedSlot);
        });
        sync();
      });
    });

    sync();
  }

  function renderProfile(trainer, view = '') {
    pageState.view = view;
    const fullName = trainer?.fullName || trainer?.displayName || 'Trainer';
    const username = trainer?.username || slugify(fullName) || 'trainer';
    const handle = trainer?.publicHandle || username;
    const trainerKey = handle || username;
    const avatarSrc = trainer?.photoDataUrl || 'assets/images/placeholders/profile-placeholder.jpg';
    const coachTags = [
      ...(Array.isArray(trainer?.coachBadgeType) ? trainer.coachBadgeType : []),
      ...(Array.isArray(trainer?.coachCustomTags) ? trainer.coachCustomTags : [])
    ].filter(Boolean);
    const tierName = coachTags[0] || trainer?.proof?.tier?.name || 'Trainer';
    const experienceLevel = coachTags[1] || trainer?.experienceLevel || 'Experienced';
    const reviewStatus = String(trainer?.reviewStatus || '').trim().toLowerCase();
    const reviewChip = reviewStatus === 'review'
      ? '<span class="trainer-profile-chip review">Review</span>'
      : '';
    const locationText = buildLocationText(trainer);
    const modeText = buildModeText(trainer);
    const proof = trainer?.proof || {};
    const bio = resolveBio(trainer);
    const explicitSummary = String(trainer?.brandPositioning || '').trim();
    const summaryPitch = trimToWordLimit(explicitSummary || bio, 75);
    const yearsLabel = resolveYearsLabel(trainer);
    const priceRangeLabel = resolvePriceRangeLabel(trainer);
    const heroHeadline = trimToWordLimit(resolveHeroHeadline(trainer), 27);
    const heroSubheadline = summarizePitch(resolveHeroSubheadline(trainer), 150);
    const topSectionLabel = String(trainer?.topSectionLabel || '1:1 coaching for busy people who want real physique progress').trim();
    const specialtyClients = resolveSpecialtyClients(trainer);
    const includedItems = resolveIncludedItems(trainer);
    const transformations = resolveTransformations(trainer);
    const proofCases = transformations.length ? transformations : [
      {
        beforeImage: 'assets/images/trainers/client-before-02.jpg',
        afterImage: 'assets/images/trainers/client-after-03.jpg',
        label: 'Client result',
        result: '-12 lb in 10 weeks',
        timeline: '10 weeks',
        copy: 'Dropped body fat, tightened waist, and got back into a routine that stuck.',
        quote: 'The structure finally made it easy to stay locked in.',
        person: 'Busy professional'
      },
      {
        beforeImage: 'assets/images/trainers/client-before-01.jpg',
        afterImage: 'assets/images/trainers/client-after-02.jpg',
        label: 'Client result',
        result: 'Waist down 3 in',
        timeline: '8 weeks',
        copy: 'Stronger, leaner, and more consistent.',
        quote: 'I stopped guessing and just followed the plan.',
        person: 'Hybrid client'
      },
      {
        beforeImage: 'assets/images/trainers/client-before-03.jpg',
        afterImage: 'assets/images/trainers/transformation-01.jpg',
        label: 'Client result',
        result: 'Leaner look in 12 weeks',
        timeline: '12 weeks',
        copy: 'Simpler food structure and weekly check-ins made adherence easy.',
        quote: 'I finally looked like I actually trained.',
        person: 'Remote client'
      },
      {
        beforeImage: 'assets/images/trainers/client-before-04.jpg',
        afterImage: 'assets/images/trainers/transformation-02.jpg',
        label: 'Client result',
        result: 'Body fat down',
        timeline: '14 weeks',
        copy: 'Consistent training plus tighter nutrition cleaned things up fast.',
        quote: 'This was the first plan I actually kept up with.',
        person: 'Online client'
      }
    ];
    const availabilityCalendar = buildAvailabilityCalendar(trainer);
    const consultSpotCount = availabilityCalendar.days.reduce((total, item) => total + (Array.isArray(item.slots) ? item.slots.length : 0), 0);
    const consultSpotCopy = String(trainer?.bookingUrgency || '').trim() || (consultSpotCount > 1
      ? `${consultSpotCount} consult windows are open right now.`
      : 'Next consult window is open right now.');
    const activeClientCount = Number.isFinite(Number(trainer?.activeClients))
      ? Number(trainer.activeClients)
      : Math.max(Number(proof.manualClientCount || 0), 1);
    const activeClientsLabel = `${Math.max(activeClientCount, 1)}+ active clients`;
    const instagramHref = buildSocialHref('instagram', trainer?.instagramUrl || trainer?.instagramHandle);
    const tiktokHref = buildSocialHref('tiktok', trainer?.tiktokUrl || trainer?.tiktokHandle);
    const linkedinHref = buildSocialHref('linkedin', trainer?.linkedinHandle || trainer?.linkedinUrl || '');
    const youtubeHref = buildSocialHref('youtube', trainer?.youtubeUrl || '');
    const websiteHref = buildSocialHref('website', trainer?.websiteUrl || '');
    const socialRow = [
      instagramHref ? buildSocialBubble(
        'instagram',
        instagramHref,
        `${fullName} on Instagram`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect><circle cx="12" cy="12" r="4.1"></circle><circle cx="17.3" cy="6.9" r="1.1"></circle></svg>'
      ) : '',
      tiktokHref ? buildSocialBubble(
        'tiktok',
        tiktokHref,
        `${fullName} on TikTok`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5c.7 2 2.1 3.2 4 3.6v2.7c-1.6-.1-2.9-.6-4-1.5v5.9a5.1 5.1 0 1 1-5.1-5.1c.4 0 .8 0 1.2.1v2.8a2.5 2.5 0 1 0 1.3 2.2V4.5Z"></path></svg>'
      ) : '',
      linkedinHref ? buildSocialBubble(
        'linkedin',
        linkedinHref,
        `${fullName} on LinkedIn`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 8.5A1.7 1.7 0 1 1 6.7 5a1.7 1.7 0 0 1 0 3.5ZM5.3 10h2.8v8.7H5.3Zm4.5 0h2.7v1.2h.1c.4-.7 1.3-1.5 2.8-1.5 3 0 3.6 2 3.6 4.5v4.5h-2.8v-4c0-1 0-2.2-1.4-2.2s-1.6 1-1.6 2.1v4.1H9.8Z"></path></svg>'
      ) : '',
      youtubeHref ? buildSocialBubble(
        'youtube',
        youtubeHref,
        `${fullName} on YouTube`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8.5a2.8 2.8 0 0 0-2-2c-1.8-.5-9-.5-9-.5s-7.2 0-9 .5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 0 12a29 29 0 0 0 1 3.5 2.8 2.8 0 0 0 2 2c1.8.5 9 .5 9 .5s7.2 0 9-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 24 12a29 29 0 0 0-1-3.5ZM9.5 15.5v-7l6 3.5Z"></path></svg>'
      ) : '',
      websiteHref ? buildSocialBubble(
        'website',
        websiteHref,
        `${fullName} website`,
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm5.9 8h-3.1a14.6 14.6 0 0 0-1-4.2A7 7 0 0 1 17.9 11ZM12 5.1c.8 1 1.6 3 1.9 5.9h-3.8C10.4 8.1 11.2 6.1 12 5.1ZM5.1 13h3.1a14.6 14.6 0 0 0 1 4.2A7 7 0 0 1 5.1 13Zm3.1-2H5.1a7 7 0 0 1 4.1-4.2A14.6 14.6 0 0 0 8.2 11Zm3.8 7.9c-.8-1-1.6-3-1.9-5.9h3.8c-.3 2.9-1.1 4.9-1.9 5.9Zm1.8-1.7a14.6 14.6 0 0 0 1-4.2h3.1a7 7 0 0 1-4.1 4.2Z"></path></svg>'
      ) : ''
    ].filter(Boolean).join('');
    document.title = view === 'results' ? `${fullName} - Client Results` : `${fullName} - Trainer Profile`;

    const heroEl = $('#trainer-profile-hero');
    const contentEl = $('#trainer-profile-content');
    const backEl = document.querySelector('.trainer-profile-back');
    renderPageEditToolbar(pageState.trainer, view);

    if (backEl) {
      if (view === 'results') {
        backEl.href = `trainer-profile.html?trainer=${encodeURIComponent(username)}`;
        backEl.textContent = 'Back to profile';
      } else {
        backEl.href = 'coaches.html';
        backEl.textContent = 'Back to coaches';
      }
    }
    const shareToggleEl = $('#trainer-profile-share-toggle');
    const shareActionsEl = $('#trainer-profile-share-actions');
    if (shareToggleEl && shareActionsEl) {
      if (view === 'results') {
        shareToggleEl.textContent = 'Share results';
      } else {
        shareToggleEl.textContent = 'Share coach';
      }
      shareActionsEl.classList.remove('is-open');
      bindShareCoachUi(trainer);
    }

    if (view === 'results') {
      if (heroEl) {
        heroEl.innerHTML = `
          <section class="trainer-profile-card trainer-profile-results-hero">
            <div class="trainer-profile-section-kicker">Client results</div>
            <h1 class="trainer-profile-results-page-title">${escapeHtml(fullName)} results</h1>
            <div class="trainer-profile-results-page-sub">Every before and after this coach wants to showcase in one place.</div>
          </section>
        `;
      }
      if (contentEl) {
        contentEl.innerHTML = buildResultsSection(proofCases, trainerKey, { showAll: true });
      }
      return;
    }

    if (heroEl) {
      const identityFacts = [
        locationText,
        modeText,
        trainer?.showPricePublic === false ? '' : priceRangeLabel
      ].filter(Boolean);
      const statBlocks = [
        trainer?.showYearsPublic === false ? '' : `
          <div class="trainer-profile-stat">
            <div class="trainer-profile-stat-label">Experience</div>
            <div class="trainer-profile-stat-value">${escapeHtml(yearsLabel)}</div>
          </div>
        `,
        trainer?.showClientsPublic === false ? '' : `
          <div class="trainer-profile-stat">
            <div class="trainer-profile-stat-label">Clients</div>
            <div class="trainer-profile-stat-value">${escapeHtml(activeClientsLabel)}</div>
          </div>
        `
      ].filter(Boolean).join('');
      const offerEditing = editorState.enabled && editorState.openSection === 'offer';
      const identityEditing = editorState.enabled && editorState.openSection === 'identity';
      const identityBadges = resolveIdentityBadges(trainer, [tierName, experienceLevel]);
      heroEl.innerHTML = `
        <section class="trainer-profile-hero trainer-profile-sales-hero">
          <article class="trainer-profile-card trainer-profile-hero-card trainer-profile-offer-card trainer-profile-edit-target">
            ${buildEditButton('offer', 'Edit hero')}
            ${buildSectionEditActions('offer')}
            <div class="trainer-profile-kicker-wrap${offerEditing ? ' is-inline-editing' : ''}">
              ${buildEditableText('offer', 'topSectionLabel', topSectionLabel, 'trainer-profile-kicker', 'div', { placeholder: 'Top label' })}
            </div>
            ${buildEditableText('offer', 'heroHeadline', heroHeadline, 'trainer-profile-offer-title', 'h1', { placeholder: 'Main headline', maxWords: 27 })}
            ${heroSubheadline || offerEditing ? buildEditableText('offer', 'heroSubheadline', heroSubheadline, 'trainer-profile-offer-sub', 'p', { placeholder: 'Supporting description' }) : ''}
            ${trainer?.showBookingPublic === false ? '' : `<div class="trainer-profile-inline-booking">
              <div class="trainer-profile-inline-booking-head">
                <div class="trainer-profile-inline-booking-label">Pick a date</div>
                <div class="trainer-profile-inline-booking-range">${escapeHtml(availabilityCalendar.monthRangeLabel)}</div>
              </div>
              <div class="trainer-profile-inline-calendar-scroll">
                <div class="trainer-profile-inline-calendar">
                  <div class="trainer-profile-inline-calendar-weekdays">
                    ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => `<span>${escapeHtml(label)}</span>`).join('')}
                  </div>
                  <div class="trainer-profile-inline-calendar-grid">
                    ${availabilityCalendar.days.map((item) => `
                      <button
                        type="button"
                        class="trainer-profile-calendar-cell${item.key === availabilityCalendar.firstAvailableKey ? ' is-active' : ''}${item.isAvailable ? '' : ' is-unavailable'}${item.isMuted ? ' is-muted' : ''}"
                        data-book-date="${escapeHtml(item.key)}"
                        ${item.isAvailable ? '' : 'disabled aria-disabled="true"'}
                      >
                        <span class="trainer-profile-calendar-cell-weekday">${escapeHtml(item.weekdayLabel)}</span>
                        <span class="trainer-profile-calendar-cell-day">${escapeHtml(item.dayLabel)}</span>
                        <span class="trainer-profile-calendar-cell-month">${escapeHtml(item.monthLabel)}</span>
                        <span class="trainer-profile-calendar-cell-note">${item.isAvailable ? `${item.slots.length} times` : 'Unavailable'}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              </div>
              <div class="trainer-profile-inline-booking-label">Pick a time</div>
              ${availabilityCalendar.days.filter((item) => item.isAvailable).map((item) => `
                <div class="trainer-profile-inline-time-panel${item.key === availabilityCalendar.firstAvailableKey ? '' : ' is-hidden'}" data-book-time-group="${escapeHtml(item.key)}">
                  <div class="trainer-profile-inline-time-title">${escapeHtml(item.longLabel)}</div>
                  <div class="trainer-profile-inline-time-row">
                    ${item.slots.map((slot) => `
                      <button
                        type="button"
                        class="trainer-profile-slot trainer-profile-slot-compact"
                        data-book-slot="${escapeHtml(slot.value)}"
                        data-book-date-slot="${escapeHtml(item.key)}"
                      >${escapeHtml(slot.timeLabel)}</button>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
              ${offerEditing ? buildAvailabilityInlineEditor(editorState.draft || trainer) : ''}
            </div>`}
            <div class="trainer-profile-microcopy">Find out if this is a fit in 15 minutes. ${escapeHtml(consultSpotCopy)}</div>
          </article>
          <article class="trainer-profile-card trainer-profile-hero-card trainer-profile-identity-card trainer-profile-edit-target">
            ${buildEditButton('identity', 'Edit coach profile')}
            ${buildSectionEditActions('identity')}
            <div class="trainer-profile-head-row">
              ${buildIdentityPhotoControl(trainer, fullName)}
              <div class="trainer-profile-copy">
                <div class="trainer-profile-eyebrow">Coach</div>
                ${buildEditableText('identity', 'fullName', fullName, 'trainer-profile-identity-name', 'h2', { placeholder: 'Trainer name' })}
                ${buildEditableText('identity', 'publicHandle', `@${handle}`, 'trainer-profile-handle', 'div', { placeholder: '@trainerhandle' })}
                <div class="trainer-profile-chip-row">
                  ${reviewChip}
                  ${identityBadges.map((item, index) => `
                    <span class="trainer-profile-chip${index === 0 ? '' : ' soft'}">${escapeHtml(item)}</span>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="trainer-profile-identity-quote">
              ${buildEditableText('identity', 'brandPositioning', summaryPitch, 'trainer-profile-summary trainer-profile-identity-summary', 'p', { placeholder: 'Short coaching summary', maxWords: 75, maxChars: 400 })}
            </div>
            <div class="trainer-profile-identity-facts">
              ${buildEditableText('identity', 'city', trainer?.city || '', 'trainer-profile-identity-fact-pill', 'span', { placeholder: 'City' })}
              ${buildEditableText('identity', 'state', trainer?.state || '', 'trainer-profile-identity-fact-pill', 'span', { placeholder: 'State' })}
              <span>${escapeHtml(modeText)}</span>
              ${trainer?.showPricePublic === false ? '' : buildEditableText('identity', 'monthlyPrice', priceRangeLabel, 'trainer-profile-identity-fact-pill', 'span', { placeholder: 'Starting price, e.g. $50/month or $150/week' })}
            </div>
            ${statBlocks ? `<div class="trainer-profile-stats trainer-profile-identity-stats">
              ${trainer?.showYearsPublic === false ? '' : `
                <div class="trainer-profile-stat">
                  <div class="trainer-profile-stat-label">Experience</div>
                  ${buildEditableText('identity', 'yearsCoaching', yearsLabel, 'trainer-profile-stat-value', 'div', { placeholder: 'Years coaching' })}
                </div>
              `}
              ${trainer?.showClientsPublic === false ? '' : `
                <div class="trainer-profile-stat">
                  <div class="trainer-profile-stat-label">Clients</div>
                  ${buildEditableText('identity', 'activeClients', activeClientsLabel, 'trainer-profile-stat-value', 'div', { placeholder: 'Active clients' })}
                </div>
              `}
            </div>` : ''}
            ${identityEditing
              ? buildIdentitySocialEditor(editorState.draft || trainer)
              : (socialRow ? `<div class="trainer-profile-social-row" aria-label="Coach social links">
              ${socialRow}
            </div>` : '')}
          </article>
        </section>
      `;
    }

    if (contentEl) {
      contentEl.innerHTML = `
        ${trainer?.showResultsPublic === false ? '' : buildResultsSection(proofCases, trainerKey)}

        <section class="trainer-profile-main-column">
            <article class="trainer-profile-card trainer-profile-story-sheet">
              <section class="trainer-profile-story-block trainer-profile-edit-target">
                ${buildEditButton('specialty', 'Edit specialty clients')}
                ${buildSectionEditActions('specialty')}
                ${editorState.enabled && editorState.openSection === 'specialty'
                  ? buildInlineEditSection('specialty', editorState.draft || trainer)
                  : `
                <div class="trainer-profile-section-kicker">Specialty clients</div>
                <h2 class="trainer-profile-section-title">Best with</h2>
                <div class="trainer-profile-chip-row trainer-profile-detail-chip-row trainer-profile-simple-chips">
                  ${specialtyClients.map((item) => `<span class="trainer-profile-chip soft">${escapeHtml(item)}</span>`).join('')}
                </div>
                `}
              </section>

              <section class="trainer-profile-story-block trainer-profile-edit-target">
                ${buildEditButton('included', 'Edit inside coaching')}
                ${buildSectionEditActions('included')}
                ${editorState.enabled && editorState.openSection === 'included'
                  ? buildInlineIncludedEditor(editorState.draft || trainer)
                  : `
                <div class="trainer-profile-section-kicker">What you get</div>
                <h2 class="trainer-profile-section-title">Inside coaching</h2>
                <div class="trainer-profile-grid trainer-profile-get-grid trainer-profile-check-list">
                  ${includedItems.map((item) => `
                    <div class="trainer-profile-check-item">
                      <span class="trainer-profile-check-mark"></span>
                      <span>${escapeHtml(item)}</span>
                    </div>
                  `).join('')}
                </div>
                `}
              </section>
            </article>

            <article class="trainer-profile-card trainer-profile-section trainer-profile-snapshot-card trainer-profile-edit-target">
              ${buildEditButton('snapshot', 'Edit coach snapshot')}
              ${buildSectionEditActions('snapshot')}
              ${editorState.enabled && editorState.openSection === 'snapshot'
                ? buildInlineEditSection('snapshot', editorState.draft || trainer)
                : `
              <div class="trainer-profile-snapshot-head">
                <div>
                  <h2 class="trainer-profile-section-title">About the coach</h2>
                </div>
                <div class="trainer-profile-snapshot-sub">How this coach works and who they work best with.</div>
              </div>
              <div class="trainer-profile-snapshot-pill-row">
                ${trainer?.showYearsPublic === false ? '' : `<span class="trainer-profile-snapshot-pill"><strong>Experience:</strong> ${escapeHtml(yearsLabel)}</span>`}
                ${trainer?.showPricePublic === false ? '' : `<span class="trainer-profile-snapshot-pill"><strong>Pricing:</strong> ${escapeHtml(priceRangeLabel)}</span>`}
                <span class="trainer-profile-snapshot-pill"><strong>Format:</strong> ${escapeHtml(modeText)}</span>
                <span class="trainer-profile-snapshot-pill trainer-profile-snapshot-pill-wide"><strong>Ideal client:</strong> ${escapeHtml(shortenLine(trainer?.idealClient || 'Busy professionals', 96))}</span>
              </div>
              `}
            </article>
          
        </section>
      `;
    }

    bindRenderedImages(trainer);
    bindPageEditControls();
    bindBooking(trainer, window.__trainerProfileViewer || null);
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const param = params.get('trainer') || '';
    const view = params.get('view') || '';
    const meResp = await api('/api/auth/me');
    window.__trainerProfileViewer = meResp.ok ? (meResp.json?.user || null) : null;

    let trainers = readDirectoryCache();
    const resp = await api('/api/auth/trainers');
    if (resp.ok && resp.json?.ok && Array.isArray(resp.json?.trainers) && resp.json.trainers.length) {
      trainers = resp.json.trainers;
      try {
        sessionStorage.setItem('trainer-directory-cache', JSON.stringify(trainers));
      } catch {}
    }
    if (!trainers.length) trainers = demoTrainerFallback();

    const selected = findTrainerByParam(trainers, param) || trainers[0] || demoTrainerFallback()[0];
    if (!selected) {
      const statusEl = $('#trainer-profile-status');
      if (statusEl) statusEl.textContent = 'Could not load that trainer profile.';
      return;
    }

    pageState.trainer = cloneJson(selected);
    pageState.view = view;
    editorState.original = cloneJson(selected);
    editorState.draft = cloneJson(selected);
    editorState.enabled = false;
    editorState.dirty = false;
    const viewerId = String(window.__trainerProfileViewer?.id || '').trim();
    const trainerId = String(selected?.id || '').trim();
    if (trainerId && (!viewerId || viewerId !== trainerId)) {
      api('/api/auth/trainer/profile-view', {
        method: 'POST',
        body: JSON.stringify({
          trainerUserId: trainerId,
          trainerHandle: selected?.username || selected?.publicHandle || ''
        })
      }).catch(() => null);
    }
    renderCurrentProfile();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
