/* escapeHtml */
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

  function clearBuilderAutosave() {
    if (!editorState.autosaveTimer) return;
    window.clearTimeout(editorState.autosaveTimer);
    editorState.autosaveTimer = 0;
  }

  function isBuilderPageEmpty(page) {
    const draft = page?.draftContent && typeof page.draftContent === 'object' ? page.draftContent : {};
    const mode = String(page?.mode || draft.mode || '').trim();
    const blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
    const customCode = draft.customCode && typeof draft.customCode === 'object' ? draft.customCode : {};
    if (!mode) return true;
    if (mode === 'custom_code') {
      return !String(customCode.html || customCode.css || customCode.javascript || '').trim()
        && !(Array.isArray(customCode.iframes) && customCode.iframes.length)
        && !(Array.isArray(customCode.embedScripts) && customCode.embedScripts.length);
    }
    if (mode === 'drag_drop') return blocks.length === 0;
    const theme = draft.theme && typeof draft.theme === 'object' ? draft.theme : {};
    return !String(theme.headline || theme.subheadline || theme.body || '').trim() && blocks.length === 0;
  }

  function normalizeBuilderPageShape(raw, fallback = {}) {
    const page = raw && typeof raw === 'object' ? cloneJson(raw) : {};
    page.id = String(page.id || fallback.id || '').trim() || '';
    page.siteSlug = sanitizeHandle(page.siteSlug || fallback.siteSlug || page.publicHandle || page.username || '');
    page.pageSlug = slugify(page.pageSlug || fallback.pageSlug || '');
    page.pageName = String(page.pageName || fallback.pageName || 'Home').trim() || 'Home';
    page.navLabel = String(page.navLabel || fallback.navLabel || page.pageName || 'Home').trim() || 'Home';
    page.navOrder = Number.isFinite(Number(page.navOrder ?? fallback.navOrder)) ? Math.max(0, Math.floor(Number(page.navOrder ?? fallback.navOrder))) : 0;
    page.mode = String(page.mode || fallback.mode || '').trim().toLowerCase();
    page.isHome = page.isHome === true || (!page.pageSlug && fallback.isHome !== false);
    page.isPublished = page.isPublished === true;
    page.draftContent = page.draftContent && typeof page.draftContent === 'object' ? page.draftContent : {};
    page.draftContent.mode = String(page.draftContent.mode || page.mode || '').trim().toLowerCase();
    page.draftContent.templateKey = String(page.draftContent.templateKey || 'general_trainer').trim().toLowerCase();
    page.draftContent.theme = page.draftContent.theme && typeof page.draftContent.theme === 'object' ? page.draftContent.theme : {};
    page.draftContent.blocks = Array.isArray(page.draftContent.blocks) ? page.draftContent.blocks : [];
    page.draftContent.forms = Array.isArray(page.draftContent.forms) ? page.draftContent.forms : [];
    page.draftContent.automations = page.draftContent.automations && typeof page.draftContent.automations === 'object'
      ? page.draftContent.automations
      : { nodes: [], edges: [] };
    page.draftContent.customCode = page.draftContent.customCode && typeof page.draftContent.customCode === 'object'
      ? page.draftContent.customCode
      : { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
    page.publishedContent = page.publishedContent && typeof page.publishedContent === 'object' ? page.publishedContent : {};
    page.publicPath = String(page.publicPath || '').trim();
    return page;
  }

  function createBlankTrainerPage(trainer, overrides = {}) {
    const handle = sanitizeHandle(trainer?.publicHandle || trainer?.username || trainer?.displayName || 'coach');
    return normalizeBuilderPageShape({
      id: '',
      siteSlug: handle,
      pageSlug: '',
      pageName: 'Home',
      navLabel: 'Home',
      mode: '',
      isHome: true,
      isPublished: false,
      draftContent: {
        mode: '',
        templateKey: 'general_trainer',
        theme: {
          headline: String(trainer?.heroHeadline || '').trim(),
          subheadline: String(trainer?.heroSubheadline || '').trim(),
          body: String(trainer?.brandPositioning || '').trim(),
          ctaLabel: 'Book a consult',
          accentColor: String(trainer?.accentColor || '#1d9bf0').trim() || '#1d9bf0',
          backgroundColor: '#ffffff',
          textColor: '#101828'
        },
        blocks: [],
        forms: [],
        automations: { nodes: [], edges: [] },
        customCode: { html: '', css: '', javascript: '', iframes: [], embedScripts: [] }
      },
      ...cloneJson(overrides || {})
    });
  }

  function buildStarterTemplateTheme(trainer, page = {}) {
    const fullName = String(trainer?.fullName || trainer?.displayName || 'Coach').trim() || 'Coach';
    const pageName = String(page?.pageName || 'Home').trim() || 'Home';
    return {
      headline: String(trainer?.heroHeadline || `${fullName} coaching built for real life`).trim(),
      subheadline: String(trainer?.heroSubheadline || 'Training, accountability, and nutrition support that fits your actual schedule.').trim(),
      body: String(trainer?.brandPositioning || `Use ${pageName} to explain your offer, show proof, and move the right clients to the next step.`).trim(),
      ctaLabel: 'Book a consult',
      accentColor: String(trainer?.accentColor || '#1d9bf0').trim() || '#1d9bf0',
      backgroundColor: '#ffffff',
      textColor: '#101828'
    };
  }

  function buildStarterDragDropBlocks(trainer, page = {}) {
    const fullName = String(trainer?.fullName || trainer?.displayName || 'Coach').trim() || 'Coach';
    const pageName = String(page?.pageName || 'Home').trim() || 'Home';
    return [
      {
        id: `block-${Date.now()}-hero`,
        type: 'hero',
        label: 'hero',
        content: {
          kicker: 'Start here',
          headline: `${fullName} coaching`,
          body: `Use ${pageName} to explain the outcome, the process, and who this is best for.`,
          ctaLabel: 'Apply now',
          ctaHref: '#lead-form',
          items: ['Training plan', 'Nutrition support', 'Weekly check-ins'],
          itemsText: 'Training plan\nNutrition support\nWeekly check-ins',
          embedHtml: '',
          mediaUrl: ''
        },
        style: {
          backgroundColor: '#ffffff',
          textColor: '#101828',
          borderColor: '#d0d5dd',
          padding: '24px',
          borderRadius: '22px',
          textAlign: 'left'
        },
        layout: { columns: 1, gap: '16px' },
        mobile: { stack: true }
      },
      {
        id: `block-${Date.now()}-services`,
        type: 'services',
        label: 'services',
        content: {
          kicker: 'What is included',
          headline: 'What clients get',
          body: 'Replace these bullets with your actual service stack.',
          ctaLabel: '',
          ctaHref: '',
          items: ['Customized programming', 'Habit coaching', 'Video form review'],
          itemsText: 'Customized programming\nHabit coaching\nVideo form review',
          embedHtml: '',
          mediaUrl: ''
        },
        style: {
          backgroundColor: '#f8fafc',
          textColor: '#101828',
          borderColor: '#e2e8f0',
          padding: '24px',
          borderRadius: '22px',
          textAlign: 'left'
        },
        layout: { columns: 3, gap: '16px' },
        mobile: { stack: true }
      },
      {
        id: `block-${Date.now()}-cta`,
        type: 'cta',
        label: 'cta',
        content: {
          kicker: 'Next step',
          headline: 'Book a consult',
          body: 'Tell prospects exactly what happens after they submit.',
          ctaLabel: 'Start application',
          ctaHref: '#lead-form',
          items: [],
          itemsText: '',
          embedHtml: '',
          mediaUrl: ''
        },
        style: {
          backgroundColor: '#101828',
          textColor: '#ffffff',
          borderColor: '#101828',
          padding: '24px',
          borderRadius: '22px',
          textAlign: 'left'
        },
        layout: { columns: 1, gap: '16px' },
        mobile: { stack: true }
      }
    ];
  }

  function buildStarterCustomCode(trainer, page = {}) {
    const fullName = String(trainer?.fullName || trainer?.displayName || 'Coach').trim() || 'Coach';
    const pageName = String(page?.pageName || 'Custom page').trim() || 'Custom page';
    return {
      html: `<section class="coach-custom-hero"><p class="eyebrow">${fullName}</p><h1>${pageName}</h1><p>Replace this starter markup with your own HTML, embeds, VSL, or booking experience.</p><a class="coach-custom-cta" href="#lead-form">Start here</a></section>`,
      css: '.coach-custom-hero{padding:48px 24px;border-radius:24px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#fff;text-align:left}.coach-custom-hero .eyebrow{letter-spacing:.12em;text-transform:uppercase;font-size:.75rem;opacity:.75}.coach-custom-hero h1{margin:12px 0;font-size:clamp(2rem,5vw,3.5rem)}.coach-custom-cta{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:999px;background:#fff;color:#0f172a;text-decoration:none;font-weight:700}',
      javascript: 'document.querySelectorAll(".coach-custom-cta").forEach((node) => node.addEventListener("click", () => console.info("coach_custom_cta_clicked")));',
      iframes: [],
      embedScripts: []
    };
  }

  function applyStarterContentForMode(draft, trainer, mode) {
    if (!draft || !mode) return;
    draft.mode = mode;
    draft.draftContent = draft.draftContent || {};
    draft.draftContent.mode = mode;
    if (mode === 'template') {
      draft.draftContent.templateKey = String(draft.draftContent.templateKey || 'general_trainer').trim().toLowerCase() || 'general_trainer';
      draft.draftContent.theme = buildStarterTemplateTheme(trainer, draft);
      draft.draftContent.blocks = [];
      draft.draftContent.customCode = { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
      return;
    }
    if (mode === 'drag_drop') {
      draft.draftContent.blocks = buildStarterDragDropBlocks(trainer, draft);
      draft.draftContent.customCode = { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
      return;
    }
    if (mode === 'custom_code') {
      draft.draftContent.customCode = buildStarterCustomCode(trainer, draft);
      draft.draftContent.blocks = [];
    }
  }

  function currentRenderedPage() {
    if (pageState.currentTrainerPage) return pageState.currentTrainerPage;
    return pageState.publicPagePayload?.page || null;
  }

  function activeBuilderDraftContent(page, { publicView = false } = {}) {
    const src = publicView
      ? (page?.publishedContent && typeof page.publishedContent === 'object'
        ? page.publishedContent
        : page?.draftContent && typeof page.draftContent === 'object'
          ? page.draftContent
          : {})
      : (page?.draftContent && typeof page.draftContent === 'object'
        ? page.draftContent
        : page?.publishedContent && typeof page.publishedContent === 'object'
          ? page.publishedContent
          : {});
    return src;
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

  function ensureHeadTag(selector, tagName, attrs = {}) {
    let node = document.querySelector(selector);
    if (!node) {
      node = document.createElement(tagName);
      Object.entries(attrs || {}).forEach(([key, value]) => {
        if (value != null) node.setAttribute(key, String(value));
      });
      document.head.appendChild(node);
    }
    return node;
  }

  function applyTrainerPageSeo({
    title = INITIAL_DOCUMENT_TITLE,
    description = INITIAL_META_DESCRIPTION,
    canonicalHref = INITIAL_CANONICAL_HREF,
    noIndex = false
  } = {}) {
    document.title = String(title || '').trim() || INITIAL_DOCUMENT_TITLE;
    const metaDescription = ensureHeadTag('meta[name="description"]', 'meta', { name: 'description' });
    metaDescription.setAttribute('content', String(description || '').trim());
    const canonical = ensureHeadTag('link[rel="canonical"]', 'link', { rel: 'canonical' });
    canonical.setAttribute('href', String(canonicalHref || window.location.href).trim() || window.location.href);
    const robots = ensureHeadTag('meta[name="robots"]', 'meta', { name: 'robots' });
    robots.setAttribute('content', noIndex ? 'noindex, nofollow' : 'index, follow');
  }

  async function loadTrainerPagesForViewer() {
    const viewer = window.__trainerProfileViewer || null;
    if (!viewer?.id || !canEditTrainerPage(pageState.trainer, pageState.view)) {
      pageState.trainerPages = [];
      return [];
    }
    const resp = await api('/api/auth/trainer/pages');
    if (!resp.ok || !resp.json?.ok || !Array.isArray(resp.json?.pages)) {
      pageState.trainerPages = [];
      return [];
    }
    pageState.trainerPages = resp.json.pages.map((page) => normalizeBuilderPageShape(page, {
      siteSlug: sanitizeHandle(pageState.trainer?.publicHandle || pageState.trainer?.username || '')
    }));
    return pageState.trainerPages;
  }

  async function loadPublicTrainerPage(siteSlug, pageSlug = '') {
    const params = new URLSearchParams();
    params.set('siteSlug', String(siteSlug || '').trim());
    if (pageSlug) params.set('pageSlug', String(pageSlug || '').trim());
    const resp = await api(`/api/coach/pages/public?${params.toString()}`);
    if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
      pageState.publicPagePayload = null;
      return null;
    }
    pageState.publicPagePayload = {
      ...resp.json,
      page: normalizeBuilderPageShape(resp.json.page)
    };
    return pageState.publicPagePayload;
  }

  async function loadCurrentBuilderVersions(pageId = pageState.currentTrainerPage?.id) {
    const targetId = String(pageId || '').trim();
    if (!targetId) {
      editorState.versions = [];
      return [];
    }
    editorState.versionLoading = true;
    syncBuilderToolbarState();
    try {
      const resp = await api(`/api/auth/trainer/page/versions?pageId=${encodeURIComponent(targetId)}&limit=25`);
      const versions = resp.ok && resp.json?.ok && Array.isArray(resp.json?.versions)
        ? resp.json.versions
        : [];
      editorState.versions = versions;
      return versions;
    } finally {
      editorState.versionLoading = false;
      syncBuilderToolbarState();
    }
  }

  function builderPagePath(page) {
    const siteSlug = sanitizeHandle(page?.siteSlug || pageState.trainer?.publicHandle || pageState.trainer?.username || '');
    const pageSlug = slugify(page?.pageSlug || '');
    return pageSlug ? `/coach/${siteSlug}/${pageSlug}` : `/coach/${siteSlug}`;
  }

  function pushBuilderHistory(snapshot) {
    const next = normalizeBuilderPageShape(snapshot || editorState.draft || createBlankTrainerPage(pageState.trainer));
    const last = editorState.historyPast.length ? editorState.historyPast[editorState.historyPast.length - 1] : null;
    const nextText = JSON.stringify(next);
    if (last && JSON.stringify(last) === nextText) return;
    editorState.historyPast.push(cloneJson(next));
    if (editorState.historyPast.length > 60) editorState.historyPast = editorState.historyPast.slice(-60);
    editorState.historyFuture = [];
  }

  function applyBuilderSnapshot(snapshot) {
    const next = normalizeBuilderPageShape(snapshot || createBlankTrainerPage(pageState.trainer));
    editorState.draft = cloneJson(next);
    pageState.currentTrainerPage = cloneJson(next);
    editorState.dirty = JSON.stringify(editorState.draft || {}) !== JSON.stringify(editorState.original || {});
    renderCurrentProfile();
  }

  function stepBuilderHistory(direction) {
    if (direction === 'undo') {
      if (editorState.historyPast.length <= 1) return;
      const current = editorState.historyPast.pop();
      if (current) editorState.historyFuture.unshift(cloneJson(current));
      const prev = editorState.historyPast[editorState.historyPast.length - 1];
      if (prev) applyBuilderSnapshot(prev);
      return;
    }
    if (direction === 'redo') {
      if (!editorState.historyFuture.length) return;
      const next = editorState.historyFuture.shift();
      if (!next) return;
      editorState.historyPast.push(cloneJson(next));
      applyBuilderSnapshot(next);
    }
  }

  function syncBuilderToolbarState() {
    const note = $('#trainer-profile-builder-note');
    if (note) {
      note.textContent = editorState.saving
        ? 'Saving...'
        : (editorState.dirty ? 'Unsaved changes' : 'Saved');
      note.classList.toggle('is-dirty', Boolean(editorState.dirty));
    }
    const undoBtn = $('#trainer-page-undo');
    const redoBtn = $('#trainer-page-redo');
    if (undoBtn) undoBtn.disabled = editorState.historyPast.length <= 1;
    if (redoBtn) redoBtn.disabled = editorState.historyFuture.length === 0;
    const currentId = String(pageState.currentTrainerPage?.id || editorState.draft?.id || '').trim();
    const orderedPages = builderNavigationPages();
    const currentIndex = orderedPages.findIndex((page) => String(page?.id || '').trim() === currentId);
    const moveUpBtn = $('#trainer-page-move-up');
    const moveDownBtn = $('#trainer-page-move-down');
    if (moveUpBtn) moveUpBtn.disabled = currentIndex <= 0;
    if (moveDownBtn) moveDownBtn.disabled = currentIndex < 0 || currentIndex >= (orderedPages.length - 1);
  }

  function queueBuilderAutosave() {
    if (!editorState.enabled || !editorState.dirty) return;
    clearBuilderAutosave();
    editorState.autosaveTimer = window.setTimeout(() => {
      editorState.autosaveTimer = 0;
      void persistBuilderPage({ autosave: true });
    }, TRAINER_PAGE_AUTOSAVE_MS);
  }

  async function persistBuilderPage({ autosave = false, exitEdit = false } = {}) {
    if (!editorState.draft || editorState.saving) return null;
    const draft = normalizeBuilderPageShape(editorState.draft, {
      siteSlug: sanitizeHandle(pageState.trainer?.publicHandle || pageState.trainer?.username || '')
    });
    if (!draft.mode) return null;
    editorState.saving = true;
    syncBuilderToolbarState();
    try {
      const resp = await api('/api/auth/trainer/pages', {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          autosave
        })
      });
      if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
        throw new Error(resp.json?.error || 'Could not save page draft.');
      }
      pageState.trainerPages = Array.isArray(resp.json?.pages)
        ? resp.json.pages.map((page) => normalizeBuilderPageShape(page))
        : pageState.trainerPages;
      pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
      editorState.original = cloneJson(pageState.currentTrainerPage);
      editorState.draft = cloneJson(pageState.currentTrainerPage);
      editorState.dirty = false;
      pushBuilderHistory(editorState.draft);
      if (exitEdit) editorState.enabled = false;
      if (!autosave) {
        const nextPath = builderPagePath(pageState.currentTrainerPage);
        try { history.replaceState({}, '', nextPath); } catch {}
      }
      renderCurrentProfile();
      return pageState.currentTrainerPage;
    } catch (err) {
      if (!autosave) window.alert(err?.message || 'Could not save trainer page.');
      return null;
    } finally {
      editorState.saving = false;
      syncBuilderToolbarState();
    }
  }

  async function publishCurrentBuilderPage() {
    const page = pageState.currentTrainerPage || editorState.original || null;
    if (!page?.id) {
      const saved = await persistBuilderPage({ autosave: false, exitEdit: false });
      if (!saved?.id) return;
    }
    const targetId = String((pageState.currentTrainerPage || editorState.original || {}).id || '').trim();
    const resp = await api('/api/auth/trainer/page/publish', {
      method: 'POST',
      body: JSON.stringify({ pageId: targetId })
    });
    if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
      window.alert(resp.json?.error || 'Could not publish page.');
      return;
    }
    pageState.trainerPages = Array.isArray(resp.json?.pages)
      ? resp.json.pages.map((item) => normalizeBuilderPageShape(item))
      : pageState.trainerPages;
    pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
    editorState.original = cloneJson(pageState.currentTrainerPage);
    editorState.draft = cloneJson(pageState.currentTrainerPage);
    renderCurrentProfile();
  }

  async function unpublishCurrentBuilderPage() {
    const targetId = String((pageState.currentTrainerPage || {}).id || '').trim();
    if (!targetId) return;
    const resp = await api('/api/auth/trainer/page/unpublish', {
      method: 'POST',
      body: JSON.stringify({ pageId: targetId })
    });
    if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
      window.alert(resp.json?.error || 'Could not unpublish page.');
      return;
    }
    pageState.trainerPages = Array.isArray(resp.json?.pages)
      ? resp.json.pages.map((item) => normalizeBuilderPageShape(item))
      : pageState.trainerPages;
    pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
    editorState.original = cloneJson(pageState.currentTrainerPage);
    editorState.draft = cloneJson(pageState.currentTrainerPage);
    renderCurrentProfile();
  }

  async function restoreBuilderVersion(versionId) {
    const targetId = String(versionId || '').trim();
    if (!targetId) return;
    const okay = window.confirm('Restore this saved version? Your current draft will be replaced.');
    if (!okay) return;
    editorState.saving = true;
    syncBuilderToolbarState();
    try {
      const resp = await api('/api/auth/trainer/page/version/restore', {
        method: 'POST',
        body: JSON.stringify({ versionId: targetId })
      });
      if (!resp.ok || !resp.json?.ok || !resp.json?.page) {
        window.alert(resp.json?.error || 'Could not restore version.');
        return;
      }
      pageState.trainerPages = Array.isArray(resp.json?.pages)
        ? resp.json.pages.map((page) => normalizeBuilderPageShape(page))
        : pageState.trainerPages;
      pageState.currentTrainerPage = normalizeBuilderPageShape(resp.json.page);
      editorState.original = cloneJson(pageState.currentTrainerPage);
      editorState.draft = cloneJson(pageState.currentTrainerPage);
      editorState.dirty = false;
      editorState.historyPast = [cloneJson(pageState.currentTrainerPage)];
      editorState.historyFuture = [];
      editorState.versions = Array.isArray(resp.json?.versions) ? resp.json.versions : editorState.versions;
      renderCurrentProfile();
    } finally {
      editorState.saving = false;
      syncBuilderToolbarState();
    }
  }

  function openBuilderEditor(page = null) {
    const target = normalizeBuilderPageShape(page || pageState.currentTrainerPage || createBlankTrainerPage(pageState.trainer));
    pageState.currentTrainerPage = cloneJson(target);
    editorState.enabled = true;
    editorState.openSection = 'builder';
    editorState.previewMode = false;
    editorState.previewDevice = 'desktop';
    editorState.draft = cloneJson(target);
    editorState.original = cloneJson(target);
    editorState.dirty = false;
    editorState.historyPast = [cloneJson(target)];
    editorState.historyFuture = [];
    document.body.classList.add('trainer-profile-editing');
    void loadCurrentBuilderVersions(target.id);
    renderCurrentProfile();
  }

  function updateBuilderDraft(mutator) {
    if (!editorState.draft || typeof mutator !== 'function') return;
    const next = cloneJson(editorState.draft);
    mutator(next);
    editorState.draft = normalizeBuilderPageShape(next, editorState.original || pageState.currentTrainerPage || {});
    pageState.currentTrainerPage = cloneJson(editorState.draft);
    editorState.dirty = JSON.stringify(editorState.draft || {}) !== JSON.stringify(editorState.original || {});
    pushBuilderHistory(editorState.draft);
    syncBuilderToolbarState();
    queueBuilderAutosave();
    renderCurrentProfile();
  }

  function moveCurrentBuilderPage(offset = 0) {
    const currentId = String(pageState.currentTrainerPage?.id || editorState.draft?.id || '').trim();
    if (!currentId) return;
    const orderedPages = builderNavigationPages();
    const currentIndex = orderedPages.findIndex((page) => String(page?.id || '').trim() === currentId);
    if (currentIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(orderedPages.length - 1, currentIndex + Math.round(Number(offset) || 0)));
    if (targetIndex === currentIndex) return;
    updateBuilderDraft((draft) => {
      draft.navOrder = targetIndex;
    });
  }

  function builderTheme(page, { publicView = false } = {}) {
    const theme = activeBuilderDraftContent(page, { publicView })?.theme;
    return theme && typeof theme === 'object' ? theme : {};
  }

  function safeStyleToken(raw, fallback = '') {
    const value = String(raw || '').trim();
    if (!value) return fallback;
    return value.replace(/[;"'<>]/g, '').slice(0, 120);
  }

  function builderBlockCardStyle(block) {
    const style = block?.style && typeof block.style === 'object' ? block.style : {};
    const parts = [];
    const backgroundColor = safeStyleToken(style.backgroundColor);
    const textColor = safeStyleToken(style.textColor);
    const borderColor = safeStyleToken(style.borderColor);
    const borderRadius = safeStyleToken(style.borderRadius);
    const padding = safeStyleToken(style.padding);
    const textAlign = safeStyleToken(style.textAlign);
    if (backgroundColor) parts.push(`background:${backgroundColor}`);
    if (textColor) parts.push(`color:${textColor}`);
    if (borderColor) parts.push(`border:1px solid ${borderColor}`);
    if (borderRadius) parts.push(`border-radius:${borderRadius}`);
    if (padding) parts.push(`padding:${padding}`);
    if (textAlign) parts.push(`text-align:${textAlign}`);
    return parts.join(';');
  }

  function builderBlockColumnsStyle(block) {
    const layout = block?.layout && typeof block.layout === 'object' ? block.layout : {};
    const columns = Math.max(1, Math.min(4, Number(layout.columns) || 1));
    const gap = safeStyleToken(layout.gap || '16px', '16px');
    return `display:grid;grid-template-columns:repeat(${columns}, minmax(0, 1fr));gap:${gap};`;
  }

  function builderBlockItems(content) {
    if (Array.isArray(content?.items) && content.items.length) {
      return content.items.map((item) => String(item || '').trim()).filter(Boolean);
    }
    return String(content?.itemsText || '')
      .split(/\n|,/)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function renderBuilderBlock(block) {
    const safe = block && typeof block === 'object' ? block : {};
    const type = String(safe.type || '').trim().toLowerCase();
    const content = safe.content && typeof safe.content === 'object' ? safe.content : {};
    const cardStyle = builderBlockCardStyle(safe);
    const items = builderBlockItems(content);
    const mediaUrl = String(content.mediaUrl || content.src || content.videoUrl || '').trim();
    const ctaLabel = String(content.ctaLabel || '').trim();
    const ctaHref = String(content.ctaHref || '').trim();
    const ctaClass = type === 'hero' ? 'trainer-profile-editor-btn primary' : 'trainer-profile-editor-btn';
    const ctaAttrs = ctaLabel
      ? `class="${ctaClass}" href="${escapeHtml(ctaHref || '#')}" data-public-builder-cta="1" data-public-builder-cta-target="${escapeHtml(ctaHref || '#')}"`
      : '';
    const title = String(content.headline || content.title || safe.label || type || 'Block').trim() || 'Block';
    const kicker = String(content.kicker || '').trim();
    const body = String(content.body || content.text || content.description || '').trim();
    if (type === 'hero') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-hero" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Hero')}</div>
          <h2 class="trainer-profile-section-title">${escapeHtml(title || 'Hero headline')}</h2>
          <p class="trainer-profile-body">${escapeHtml(body || 'Supporting copy')}</p>
          ${ctaLabel ? `<div class="trainer-profile-editor-actions" style="margin-top:14px;"><a ${ctaAttrs}>${escapeHtml(ctaLabel)}</a></div>` : ''}
        </section>
      `;
    }
    if (type === 'image') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-image" style="${escapeHtml(cardStyle)}">
          ${mediaUrl ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(String(content.alt || 'Page image').trim() || 'Page image')}">` : '<div class="trainer-profile-muted">Image block</div>'}
        </section>
      `;
    }
    if (type === 'gallery') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-gallery" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Gallery')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            ${items.length ? items.map((item, index) => `<div class="trainer-profile-note">${escapeHtml(item || `Image ${index + 1}`)}</div>`).join('') : '<div class="trainer-profile-muted">Add gallery image URLs or labels.</div>'}
          </div>
        </section>
      `;
    }
    if (type === 'video_vsl' || type === 'vsl_form') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-video" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Video')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <p class="trainer-profile-body">${escapeHtml(body || 'Video sales letter section')}</p>
          ${mediaUrl ? `<div class="trainer-profile-note">${escapeHtml(mediaUrl)}</div>` : ''}
          ${type === 'vsl_form' ? '<div class="trainer-profile-note">Pair this with one of the page forms below.</div>' : ''}
        </section>
      `;
    }
    if (type === 'form') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-form" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">Form</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title || 'Lead form')}</h3>
          <p class="trainer-profile-body">${escapeHtml(body || 'Collect a lead from this page.')}</p>
        </section>
      `;
    }
    if (type === 'columns') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-columns" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Columns')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div style="${escapeHtml(builderBlockColumnsStyle(safe))}">
            ${(items.length ? items : ['Column one', 'Column two']).map((item) => `<div class="trainer-profile-note">${escapeHtml(item)}</div>`).join('')}
          </div>
        </section>
      `;
    }
    if (type === 'spacer') {
      const spacerHeight = safeStyleToken(safe?.style?.minHeight || '40px', '40px');
      return `<section class="trainer-profile-builder-block type-spacer" style="min-height:${escapeHtml(spacerHeight)};"></section>`;
    }
    if (type === 'custom_embed') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-custom-embed" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Embed')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div class="trainer-profile-note">${escapeHtml(String(content.embedHtml || body || 'Custom embed code preview').trim() || 'Custom embed code preview')}</div>
        </section>
      `;
    }
    return `
      <section class="trainer-profile-card trainer-profile-builder-block type-generic" style="${escapeHtml(cardStyle)}">
        <div class="trainer-profile-section-kicker">${escapeHtml(kicker || type || 'Block')}</div>
        <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
        <div class="trainer-profile-body">${escapeHtml(body || 'Custom content block')}</div>
        ${items.length ? `<div style="margin-top:12px;display:grid;gap:8px;">${items.map((item) => `<div class="trainer-profile-note">${escapeHtml(item)}</div>`).join('')}</div>` : ''}
        ${ctaLabel ? `<div class="trainer-profile-editor-actions" style="margin-top:14px;"><a ${ctaAttrs}>${escapeHtml(ctaLabel)}</a></div>` : ''}
        ${mediaUrl && type !== 'image' ? `<div class="trainer-profile-note" style="margin-top:12px;">${escapeHtml(mediaUrl)}</div>` : ''}
      </section>
    `;
  }

  function renderTemplatePage(page, { publicView = false } = {}) {
    const theme = builderTheme(page, { publicView });
    const draft = activeBuilderDraftContent(page, { publicView });
    const templateLabel = BUILDER_TEMPLATE_OPTIONS.find((entry) => entry[0] === String(draft.templateKey || '').trim())?.[1] || 'Template';
    return `
      <section class="trainer-profile-hero trainer-profile-sales-hero">
        <article class="trainer-profile-card trainer-profile-hero-card trainer-profile-offer-card">
          <div class="trainer-profile-kicker">${escapeHtml(templateLabel)}</div>
          <h1 class="trainer-profile-offer-title">${escapeHtml(String(theme.headline || page.pageName || 'Coach page').trim() || 'Coach page')}</h1>
          <p class="trainer-profile-offer-sub">${escapeHtml(String(theme.subheadline || '').trim() || 'This published page is being served from the trainer page builder.')}</p>
          <div class="trainer-profile-microcopy">${escapeHtml(String(theme.body || '').trim() || 'Edit this template inside the existing Edit page flow.')}</div>
        </article>
      </section>
    `;
  }

  function renderDragDropPage(page, { publicView = false } = {}) {
    const blocks = Array.isArray(activeBuilderDraftContent(page, { publicView })?.blocks) ? activeBuilderDraftContent(page, { publicView }).blocks : [];
    if (!blocks.length) {
      return '<section class="trainer-profile-card"><div class="trainer-profile-muted">No blocks yet. Open Edit page to add sections.</div></section>';
    }
    return blocks.map((block) => renderBuilderBlock(block)).join('');
  }

  function renderCustomCodePreview(page, { publicView = false } = {}) {
    const code = activeBuilderDraftContent(page, { publicView })?.customCode || {};
    const html = String(code.html || '').trim();
    const css = String(code.css || '').trim();
    const javascript = String(code.javascript || '').trim();
    const iframeMarkup = (Array.isArray(code.iframes) ? code.iframes : []).map((entry) => {
      if (typeof entry === 'string') {
        const src = String(entry || '').trim();
        return src ? `<iframe src="${escapeHtml(src)}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;min-height:320px;border:0;"></iframe>` : '';
      }
      const raw = entry && typeof entry === 'object' ? entry : {};
      const htmlValue = String(raw.html || '').trim();
      if (htmlValue) return htmlValue;
      const src = String(raw.src || raw.url || '').trim();
      return src ? `<iframe src="${escapeHtml(src)}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;min-height:320px;border:0;"></iframe>` : '';
    }).filter(Boolean).join('\n');
    const embedScriptMarkup = (Array.isArray(code.embedScripts) ? code.embedScripts : []).map((entry) => {
      if (typeof entry === 'string') {
        const src = String(entry || '').trim();
        return src ? `<script src="${escapeHtml(src)}"><\/script>` : '';
      }
      const raw = entry && typeof entry === 'object' ? entry : {};
      const htmlValue = String(raw.html || '').trim();
      if (htmlValue) return htmlValue.replace(/<\/script/gi, '<\\/script');
      const src = String(raw.src || raw.url || '').trim();
      return src ? `<script src="${escapeHtml(src)}"><\/script>` : '';
    }).filter(Boolean).join('\n');
    const srcdoc = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action https: mailto:; img-src data: https:; media-src data: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; frame-src data: https:; font-src data: https:;">
        <style>body{margin:0;font-family:Georgia,serif;padding:24px;background:#fff;color:#111827;}${css}</style>
      </head>
      <body>
        ${html || '<div>No custom code yet.</div>'}
        ${iframeMarkup}
        ${embedScriptMarkup}
        <script>${javascript.replace(/<\/script/gi, '<\\/script')}<\/script>
      </body>
      </html>
    `.trim();
    return `
      <section class="trainer-profile-card trainer-profile-builder-custom-code">
        <iframe
          title="Custom page preview"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          allow="fullscreen; clipboard-read *; clipboard-write *"
          referrerpolicy="no-referrer"
          srcdoc="${escapeHtml(srcdoc)}"
          style="width:100%;min-height:560px;border:0;border-radius:22px;background:#fff;"
        ></iframe>
      </section>
    `;
  }

  function renderActiveBuilderPage(page, { publicView = false } = {}) {
    const mode = String(page?.mode || activeBuilderDraftContent(page, { publicView })?.mode || '').trim().toLowerCase();
    if (!mode) {
      return '<section class="trainer-profile-card"><div class="trainer-profile-muted">This page is blank. Choose Template, Drag-and-drop, or Custom code to start building it.</div></section>';
    }
    if (mode === 'custom_code') return renderCustomCodePreview(page, { publicView });
    if (mode === 'drag_drop') return renderDragDropPage(page, { publicView });
    return renderTemplatePage(page, { publicView });
  }

  function builderNavigationPages() {
    const source = pageState.publicPagePayload?.navigation?.length
      ? pageState.publicPagePayload.navigation
      : (Array.isArray(pageState.trainerPages) ? pageState.trainerPages : []);
    return source.slice().sort((a, b) => {
      const left = Number.isFinite(Number(a?.navOrder)) ? Number(a.navOrder) : 0;
      const right = Number.isFinite(Number(b?.navOrder)) ? Number(b.navOrder) : 0;
      if (left !== right) return left - right;
      return String(a?.pageName || '').localeCompare(String(b?.pageName || ''));
    }).map((page) => ({
      id: page.id,
      siteSlug: page.siteSlug || '',
      pageSlug: page.pageSlug || '',
      pageName: page.pageName || 'Page',
      navLabel: page.navLabel || page.pageName || 'Page',
      navOrder: Number.isFinite(Number(page?.navOrder)) ? Number(page.navOrder) : 0,
      isHome: page.isHome === true,
      publicPath: builderPagePath(page),
      isPublished: page.isPublished === true
    }));
  }

  function renderBuilderNavigation(page, { publicView = false } = {}) {
    const items = builderNavigationPages();
    if (!items.length) return '';
    const currentPath = builderPagePath(page);
    return `
      <nav class="trainer-profile-card trainer-profile-builder-nav" aria-label="Coach site navigation">
        <div class="trainer-profile-chip-row trainer-profile-detail-chip-row trainer-profile-simple-chips">
          ${items.map((item) => `
            <a
              class="trainer-profile-chip${item.publicPath === currentPath ? '' : ' soft'}"
              href="${escapeHtml(item.publicPath || '#')}"
              ${publicView || item.isPublished ? '' : 'data-builder-draft-link="1"'}
            >${escapeHtml(item.navLabel || item.pageName || 'Page')}</a>
          `).join('')}
        </div>
      </nav>
    `;
  }

  function buildPublicLeadFormField(field, formId, fieldIndex) {
    const safe = field && typeof field === 'object' ? field : {};
    const fieldType = String(safe.type || 'text').trim().toLowerCase();
    const fieldId = String(safe.id || safe.name || `field-${fieldIndex + 1}`).trim() || `field-${fieldIndex + 1}`;
    const fieldName = String(safe.name || fieldId).trim() || fieldId;
    const label = String(safe.label || fieldName).trim() || fieldName;
    const placeholder = String(safe.placeholder || '').trim();
    const required = safe.required === true ? ' required' : '';
    const inputId = `trainer-public-form-${formId}-${fieldId}-${fieldIndex}`;
    const options = Array.isArray(safe.options) ? safe.options.filter(Boolean) : [];
    const acceptList = Array.isArray(safe.accept) ? safe.accept.filter(Boolean) : [];
    const acceptAttr = acceptList.length ? ` accept="${escapeHtml(acceptList.join(','))}"` : '';
    const allowMultiple = safe?.meta?.multiple === true ? ' multiple' : '';

    if (fieldType === 'textarea' || fieldType === 'long_text') {
      return `
        <label class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <textarea id="${escapeHtml(inputId)}" name="${escapeHtml(fieldName)}" placeholder="${escapeHtml(placeholder)}"${required}></textarea>
        </label>
      `;
    }
    if (fieldType === 'dropdown' || fieldType === 'select') {
      return `
        <label class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <select id="${escapeHtml(inputId)}" name="${escapeHtml(fieldName)}"${required}>
            <option value="">Select</option>
            ${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
          </select>
        </label>
      `;
    }
    if (fieldType === 'radio') {
      return `
        <fieldset class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <div class="trainer-profile-editor-pill-grid">
            ${options.map((option, optionIndex) => `
              <label class="trainer-profile-editor-pill">
                <input
                  type="radio"
                  name="${escapeHtml(fieldName)}"
                  value="${escapeHtml(option)}"
                  ${safe.required === true && optionIndex === 0 ? 'required' : ''}
                >
                <span>${escapeHtml(option)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
      `;
    }
    if (fieldType === 'checkbox') {
      return `
        <fieldset class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <div class="trainer-profile-editor-pill-grid">
            ${options.map((option) => `
              <label class="trainer-profile-editor-pill">
                <input type="checkbox" name="${escapeHtml(fieldName)}" value="${escapeHtml(option)}">
                <span>${escapeHtml(option)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
      `;
    }
    if (fieldType === 'file' || fieldType === 'photo' || fieldType === 'upload') {
      const resolvedAccept = fieldType === 'photo' && !acceptAttr ? ' accept="image/*"' : acceptAttr;
      return `
        <label class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <input id="${escapeHtml(inputId)}" type="file" name="${escapeHtml(fieldName)}"${required}${resolvedAccept}${allowMultiple}>
        </label>
      `;
    }
    const inputType = ['email', 'tel', 'number', 'date'].includes(fieldType) ? fieldType : 'text';
    return `
      <label class="trainer-profile-editor-field">
        <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
        <input id="${escapeHtml(inputId)}" type="${escapeHtml(inputType)}" name="${escapeHtml(fieldName)}" placeholder="${escapeHtml(placeholder)}"${required}>
      </label>
    `;
  }

  function renderPublicLeadForm(form, page) {
    const safeForm = form && typeof form === 'object' ? form : {};
    const formId = String(safeForm.id || `form-${Date.now()}`).trim() || 'lead-form';
    const fields = Array.isArray(safeForm.fields) && safeForm.fields.length
      ? safeForm.fields
      : [
          { id: 'name', name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Your name' },
          { id: 'email', name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' },
          { id: 'goal', name: 'goal', label: 'Goal', type: 'textarea', required: false, placeholder: 'What are you working toward?' }
        ];
    return `
      <form class="trainer-profile-card trainer-profile-builder-public-form" data-public-trainer-form="${escapeHtml(formId)}">
        <div class="trainer-profile-section-kicker">Contact</div>
        <h3 class="trainer-profile-section-title">${escapeHtml(String(safeForm.name || 'Apply for coaching').trim() || 'Apply for coaching')}</h3>
        <div class="trainer-profile-editor-grid two">
          ${fields.map((field, fieldIndex) => buildPublicLeadFormField(field, formId, fieldIndex)).join('')}
        </div>
        <input type="hidden" name="siteSlug" value="${escapeHtml(String(page?.siteSlug || '').trim())}">
        <input type="hidden" name="pageSlug" value="${escapeHtml(String(page?.pageSlug || '').trim())}">
        <input type="hidden" name="pageName" value="${escapeHtml(String(page?.pageName || '').trim())}">
        <input type="hidden" name="formId" value="${escapeHtml(formId)}">
        <div class="trainer-profile-editor-actions" style="margin-top:16px;">
          <button type="submit" class="trainer-profile-editor-btn primary">${escapeHtml(String(safeForm.submitLabel || 'Submit').trim() || 'Submit')}</button>
          <div class="trainer-profile-note" data-public-form-status="${escapeHtml(formId)}"></div>
        </div>
      </form>
    `;
  }

  function renderBuilderFormEditor(page) {
    const forms = Array.isArray(activeBuilderDraftContent(page)?.forms) ? activeBuilderDraftContent(page).forms : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Forms</div>
        <h3 class="trainer-profile-section-title">Lead capture</h3>
        ${forms.length ? forms.map((form, formIndex) => `
          <div class="trainer-profile-editor-block" style="margin-bottom:16px;">
            <div class="trainer-profile-editor-grid two">
              <label class="trainer-profile-editor-field">
                <span>Form name</span>
                <input type="text" data-builder-form-name="${formIndex}" value="${escapeHtml(String(form?.name || '').trim())}" placeholder="Qualification form">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Submit label</span>
                <input type="text" data-builder-form-submit="${formIndex}" value="${escapeHtml(String(form?.submitLabel || '').trim())}" placeholder="Apply now">
              </label>
            </div>
            <div class="trainer-profile-editor-actions" style="justify-content:space-between;margin:12px 0;">
              <button type="button" class="trainer-profile-editor-btn" data-builder-form-add-field="${formIndex}">Add field</button>
              <button type="button" class="trainer-profile-editor-btn" data-builder-form-remove="${formIndex}">Remove form</button>
            </div>
            ${(Array.isArray(form?.fields) ? form.fields : []).map((field, fieldIndex) => `
              <div class="trainer-profile-editor-grid three" style="margin-bottom:12px;">
                <label class="trainer-profile-editor-field">
                  <span>Label</span>
                  <input type="text" data-builder-form-field-label="${formIndex}:${fieldIndex}" value="${escapeHtml(String(field?.label || '').trim())}" placeholder="Question label">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Key</span>
                  <input type="text" data-builder-form-field-name="${formIndex}:${fieldIndex}" value="${escapeHtml(String(field?.name || '').trim())}" placeholder="field_key">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Type</span>
                  <select data-builder-form-field-type="${formIndex}:${fieldIndex}">
                    ${['text', 'email', 'tel', 'number', 'date', 'textarea', 'long_text', 'dropdown', 'radio', 'checkbox', 'file', 'photo', 'upload'].map((type) => `<option value="${type}"${String(field?.type || '').trim() === type ? ' selected' : ''}>${type}</option>`).join('')}
                  </select>
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Placeholder</span>
                  <input type="text" data-builder-form-field-placeholder="${formIndex}:${fieldIndex}" value="${escapeHtml(String(field?.placeholder || '').trim())}" placeholder="Placeholder">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Options</span>
                  <input type="text" data-builder-form-field-options="${formIndex}:${fieldIndex}" value="${escapeHtml((Array.isArray(field?.options) ? field.options : []).join(', '))}" placeholder="Option A, Option B">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Accepted files</span>
                  <input type="text" data-builder-form-field-accept="${formIndex}:${fieldIndex}" value="${escapeHtml((Array.isArray(field?.accept) ? field.accept : []).join(', '))}" placeholder="image/*,application/pdf">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Required</span>
                  <select data-builder-form-field-required="${formIndex}:${fieldIndex}">
                    <option value="false"${field?.required === true ? '' : ' selected'}>Optional</option>
                    <option value="true"${field?.required === true ? ' selected' : ''}>Required</option>
                  </select>
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Allow multiple</span>
                  <select data-builder-form-field-multiple="${formIndex}:${fieldIndex}">
                    <option value="false"${field?.meta?.multiple === true ? '' : ' selected'}>Single</option>
                    <option value="true"${field?.meta?.multiple === true ? ' selected' : ''}>Multiple</option>
                  </select>
                </label>
              </div>
              <div class="trainer-profile-editor-actions" style="margin-top:-4px;margin-bottom:12px;">
                <button type="button" class="trainer-profile-editor-btn" data-builder-form-field-remove="${formIndex}:${fieldIndex}">Remove field</button>
              </div>
            `).join('')}
          </div>
        `).join('') : '<div class="trainer-profile-muted">No forms yet. Add one for lead capture.</div>'}
        <div class="trainer-profile-editor-actions">
          <button type="button" class="trainer-profile-editor-btn primary" id="trainer-page-add-form">Add form</button>
        </div>
      </section>
    `;
  }

  function renderBuilderAutomationEditor(page) {
    const automations = activeBuilderDraftContent(page)?.automations || { nodes: [], edges: [] };
    const nodes = Array.isArray(automations.nodes) ? automations.nodes : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Automation</div>
        <h3 class="trainer-profile-section-title">Flow nodes</h3>
        ${nodes.length ? nodes.map((node, index) => `
          <div class="trainer-profile-editor-grid three" style="margin-bottom:12px;">
            <label class="trainer-profile-editor-field">
              <span>Node type</span>
              <select data-builder-node-type="${index}">
                ${['form_submitted', 'button_clicked', 'page_viewed', 'field_condition', 'if_else', 'add_tag', 'create_update_lead', 'assign_offer', 'change_stage', 'redirect', 'notify_trainer', 'email', 'wait_delay', 'webhook', 'google_sheets', 'google_calendar'].map((type) => `<option value="${type}"${String(node?.type || '').trim() === type ? ' selected' : ''}>${type}</option>`).join('')}
              </select>
            </label>
            <label class="trainer-profile-editor-field">
              <span>Label</span>
              <input type="text" data-builder-node-label="${index}" value="${escapeHtml(String(node?.config?.label || '').trim())}" placeholder="Action label">
            </label>
            <label class="trainer-profile-editor-field">
              <span>Target / value</span>
              <input type="text" data-builder-node-target="${index}" value="${escapeHtml(String(node?.config?.target || '').trim())}" placeholder="Value">
            </label>
          </div>
          <div class="trainer-profile-editor-actions" style="margin-top:-4px;margin-bottom:12px;">
            <button type="button" class="trainer-profile-editor-btn" data-builder-node-remove="${index}">Remove node</button>
          </div>
        `).join('') : '<div class="trainer-profile-muted">No automation nodes yet.</div>'}
        <div class="trainer-profile-editor-actions">
          <button type="button" class="trainer-profile-editor-btn" id="trainer-page-add-node">Add automation node</button>
        </div>
      </section>
    `;
  }

  function renderBuilderModeChooser(page) {
    const mode = String(page?.mode || activeBuilderDraftContent(page)?.mode || '').trim().toLowerCase();
    const options = [
      ['template', 'Template', 'Use a guided trainer page template.'],
      ['drag_drop', 'Drag-and-drop', 'Build sections block by block.'],
      ['custom_code', 'Custom code/embed', 'Control the page with sandboxed HTML, CSS, JS, and embeds.']
    ];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Page mode</div>
        <h2 class="trainer-profile-section-title">Choose how this page is built</h2>
        <div class="trainer-profile-editor-pill-grid">
          ${options.map(([value, label, copy]) => `
            <button type="button" class="trainer-profile-editor-pill${mode === value ? ' is-active' : ''}" data-builder-mode="${value}">
              <span style="display:block;font-weight:900;">${escapeHtml(label)}</span>
              <span style="display:block;font-size:0.78rem;line-height:1.45;margin-top:4px;">${escapeHtml(copy)}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderBuilderMetaEditor(page) {
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Page settings</div>
        <h2 class="trainer-profile-section-title">Identity and routing</h2>
        <form id="trainer-page-meta-form" class="trainer-profile-editor-grid two">
          <label class="trainer-profile-editor-field">
            <span>Page name</span>
            <input id="trainer-page-name" type="text" value="${escapeHtml(String(page?.pageName || '').trim())}" placeholder="Home">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Navigation label</span>
            <input id="trainer-page-nav-label" type="text" value="${escapeHtml(String(page?.navLabel || '').trim())}" placeholder="Home">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Coach slug</span>
            <input id="trainer-page-site-slug" type="text" value="${escapeHtml(String(page?.siteSlug || '').trim())}" placeholder="coach-name">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Page slug</span>
            <input id="trainer-page-slug" type="text" value="${escapeHtml(String(page?.pageSlug || '').trim())}" placeholder="leave blank for home page">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Home page</span>
            <select id="trainer-page-is-home">
              <option value="false"${page?.isHome ? '' : ' selected'}>No</option>
              <option value="true"${page?.isHome ? ' selected' : ''}>Yes</option>
            </select>
          </label>
          <div class="trainer-profile-editor-field">
            <span>Public URL</span>
            <div class="trainer-profile-note">${escapeHtml(builderPagePath(page))}</div>
          </div>
        </form>
      </section>
    `;
  }

  function renderBuilderTemplateEditor(page) {
    const draft = activeBuilderDraftContent(page);
    const theme = builderTheme(page);
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Template editor</div>
        <h2 class="trainer-profile-section-title">Template content</h2>
        <form id="trainer-page-template-form" class="trainer-profile-editor-grid two">
          <label class="trainer-profile-editor-field">
            <span>Template</span>
            <select id="trainer-page-template-key">
              ${BUILDER_TEMPLATE_OPTIONS.map(([value, label]) => `<option value="${value}"${String(draft?.templateKey || '').trim() === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
          </label>
          <label class="trainer-profile-editor-field">
            <span>CTA label</span>
            <input id="trainer-page-template-cta" type="text" value="${escapeHtml(String(theme?.ctaLabel || '').trim())}" placeholder="Book a consult">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Headline</span>
            <input id="trainer-page-template-headline" type="text" value="${escapeHtml(String(theme?.headline || '').trim())}" placeholder="Coach page headline">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Subheadline</span>
            <input id="trainer-page-template-subheadline" type="text" value="${escapeHtml(String(theme?.subheadline || '').trim())}" placeholder="Supporting line">
          </label>
          <label class="trainer-profile-editor-field" style="grid-column:1 / -1;">
            <span>Body</span>
            <textarea id="trainer-page-template-body" placeholder="Longer supporting copy">${escapeHtml(String(theme?.body || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>Accent color</span>
            <input id="trainer-page-template-accent" type="text" value="${escapeHtml(String(theme?.accentColor || '').trim())}" placeholder="#1d9bf0">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Background color</span>
            <input id="trainer-page-template-bg" type="text" value="${escapeHtml(String(theme?.backgroundColor || '').trim())}" placeholder="#ffffff">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Text color</span>
            <input id="trainer-page-template-text" type="text" value="${escapeHtml(String(theme?.textColor || '').trim())}" placeholder="#111827">
          </label>
        </form>
      </section>
    `;
  }

  function renderBuilderBlocksEditor(page) {
    const blocks = Array.isArray(activeBuilderDraftContent(page)?.blocks) ? activeBuilderDraftContent(page).blocks : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Blocks</div>
        <h2 class="trainer-profile-section-title">Drag-and-drop content</h2>
        <div class="trainer-profile-editor-actions" style="justify-content:flex-start;margin-bottom:16px;">
          <select id="trainer-page-block-type" class="trainer-profile-edit-action" style="width:auto;padding:0 14px;font-size:0.82rem;">
            ${BUILDER_BLOCK_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
          </select>
          <button type="button" class="trainer-profile-editor-btn" id="trainer-page-add-block">Add block</button>
        </div>
        ${blocks.length ? blocks.map((block, index) => `
          <div class="trainer-profile-editor-block" style="margin-bottom:16px;">
            <div class="trainer-profile-editor-actions" style="justify-content:space-between;margin-bottom:12px;">
              <div class="trainer-profile-note">${escapeHtml(String(block?.type || '').trim() || 'block')}</div>
              <div class="trainer-profile-editor-actions">
                <button type="button" class="trainer-profile-editor-btn" data-builder-block-move="${index}:-1">Move earlier</button>
                <button type="button" class="trainer-profile-editor-btn" data-builder-block-move="${index}:1">Move later</button>
                <button type="button" class="trainer-profile-editor-btn" data-builder-block-remove="${index}">Remove block</button>
              </div>
            </div>
            <div class="trainer-profile-editor-grid three">
              <label class="trainer-profile-editor-field">
                <span>Label</span>
                <input type="text" data-builder-block-field="label" data-builder-block-index="${index}" value="${escapeHtml(String(block?.label || '').trim())}" placeholder="Block label">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Kicker</span>
                <input type="text" data-builder-block-field="kicker" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.kicker || '').trim())}" placeholder="Kicker">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Headline</span>
                <input type="text" data-builder-block-field="headline" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.headline || '').trim())}" placeholder="Headline">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Body</span>
                <input type="text" data-builder-block-field="body" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.body || block?.content?.text || '').trim())}" placeholder="Body">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Media / URL</span>
                <input type="text" data-builder-block-field="mediaUrl" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.mediaUrl || block?.content?.src || block?.content?.videoUrl || '').trim())}" placeholder="Image, video, or embed URL">
              </label>
              <label class="trainer-profile-editor-field">
                <span>CTA label</span>
                <input type="text" data-builder-block-field="ctaLabel" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.ctaLabel || '').trim())}" placeholder="Call to action">
              </label>
              <label class="trainer-profile-editor-field">
                <span>CTA URL</span>
                <input type="text" data-builder-block-field="ctaHref" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.ctaHref || '').trim())}" placeholder="/coach/slug/page or https://">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Items / list</span>
                <textarea data-builder-block-field="itemsText" data-builder-block-index="${index}" placeholder="One item per line">${escapeHtml((Array.isArray(block?.content?.items) ? block.content.items : []).join('\n') || String(block?.content?.itemsText || '').trim())}</textarea>
              </label>
              <label class="trainer-profile-editor-field">
                <span>Embed HTML</span>
                <textarea data-builder-block-field="embedHtml" data-builder-block-index="${index}" placeholder="<iframe ...>">${escapeHtml(String(block?.content?.embedHtml || '').trim())}</textarea>
              </label>
            </div>
            <div class="trainer-profile-editor-grid three" style="margin-top:12px;">
              <label class="trainer-profile-editor-field">
                <span>Background</span>
                <input type="text" data-builder-block-style="backgroundColor" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.backgroundColor || '').trim())}" placeholder="#ffffff">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Text color</span>
                <input type="text" data-builder-block-style="textColor" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.textColor || '').trim())}" placeholder="#111827">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Border color</span>
                <input type="text" data-builder-block-style="borderColor" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.borderColor || '').trim())}" placeholder="#d0d5dd">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Padding</span>
                <input type="text" data-builder-block-style="padding" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.padding || '').trim())}" placeholder="24px">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Border radius</span>
                <input type="text" data-builder-block-style="borderRadius" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.borderRadius || '').trim())}" placeholder="24px">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Align</span>
                <select data-builder-block-style="textAlign" data-builder-block-index="${index}">
                  ${['left', 'center', 'right'].map((value) => `<option value="${value}"${String(block?.style?.textAlign || '').trim() === value ? ' selected' : ''}>${value}</option>`).join('')}
                </select>
              </label>
              <label class="trainer-profile-editor-field">
                <span>Columns</span>
                <select data-builder-block-layout="columns" data-builder-block-index="${index}">
                  ${[1, 2, 3, 4].map((value) => `<option value="${value}"${Number(block?.layout?.columns || 1) === value ? ' selected' : ''}>${value}</option>`).join('')}
                </select>
              </label>
              <label class="trainer-profile-editor-field">
                <span>Gap</span>
                <input type="text" data-builder-block-layout="gap" data-builder-block-index="${index}" value="${escapeHtml(String(block?.layout?.gap || '').trim())}" placeholder="16px">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Mobile layout</span>
                <select data-builder-block-mobile="stack" data-builder-block-index="${index}">
                  <option value="true"${String(block?.mobile?.stack ?? 'true') === 'true' ? ' selected' : ''}>Stack</option>
                  <option value="false"${String(block?.mobile?.stack ?? 'true') === 'false' ? ' selected' : ''}>Keep columns</option>
                </select>
              </label>
            </div>
          </div>
        `).join('') : '<div class="trainer-profile-muted">No blocks yet.</div>'}
      </section>
    `;
  }

  function renderBuilderCustomCodeEditor(page) {
    const code = activeBuilderDraftContent(page)?.customCode || {};
    const iframeValue = (Array.isArray(code?.iframes) ? code.iframes : [])
      .map((entry) => (typeof entry === 'string'
        ? String(entry || '').trim()
        : String(entry?.html || entry?.src || entry?.url || '').trim()))
      .filter(Boolean)
      .join('\n');
    const embedScriptValue = (Array.isArray(code?.embedScripts) ? code.embedScripts : [])
      .map((entry) => (typeof entry === 'string'
        ? String(entry || '').trim()
        : String(entry?.html || entry?.src || entry?.url || '').trim()))
      .filter(Boolean)
      .join('\n');
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Custom code</div>
        <h2 class="trainer-profile-section-title">Sandboxed page code</h2>
        <form id="trainer-page-code-form" class="trainer-profile-editor-grid">
          <label class="trainer-profile-editor-field">
            <span>HTML / embeds</span>
            <textarea id="trainer-page-code-html" placeholder="<section>...</section>">${escapeHtml(String(code?.html || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>CSS</span>
            <textarea id="trainer-page-code-css" placeholder="body { ... }">${escapeHtml(String(code?.css || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>JavaScript</span>
            <textarea id="trainer-page-code-js" placeholder="console.log('ready')">${escapeHtml(String(code?.javascript || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>Iframes</span>
            <textarea id="trainer-page-code-iframes" placeholder="https://example.com/embed or full &lt;iframe&gt; markup, one per line">${escapeHtml(iframeValue)}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>Embed scripts</span>
            <textarea id="trainer-page-code-embeds" placeholder="https://example.com/widget.js or full &lt;script&gt; markup, one per line">${escapeHtml(embedScriptValue)}</textarea>
          </label>
        </form>
      </section>
    `;
  }

  function renderBuilderVersionHistory() {
    const versions = Array.isArray(editorState.versions) ? editorState.versions : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Versions</div>
        <h2 class="trainer-profile-section-title">Draft and publish history</h2>
        <div class="trainer-profile-muted" style="margin-bottom:12px;">Manual saves, autosaves, publishes, and restores are stored here for this page.</div>
        ${editorState.versionLoading ? '<div class="trainer-profile-muted">Loading versions...</div>' : ''}
        ${!editorState.versionLoading && versions.length ? `
          <div class="account-trainer-list account-trainer-list-compact" data-page-version-list="1">
            ${versions.map((version) => `
              <div class="account-trainer-list-item">
                <strong>${escapeHtml(String(version?.versionKind || 'manual_save').replaceAll('_', ' '))}</strong>
                <div class="account-trainer-muted">${escapeHtml(formatShortDate(version?.createdAt) || 'Recently')}</div>
                <button type="button" class="trainer-profile-editor-btn" data-builder-version-restore="${escapeHtml(String(version?.id || '').trim())}">Restore</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${!editorState.versionLoading && !versions.length ? '<div class="trainer-profile-muted">No saved versions yet.</div>' : ''}
      </section>
    `;
  }

  function renderBuilderEditorShell(page) {
    const mode = String(page?.mode || activeBuilderDraftContent(page)?.mode || '').trim().toLowerCase();
    return `
      ${renderBuilderNavigation(page)}
      ${renderBuilderMetaEditor(page)}
      ${renderBuilderModeChooser(page)}
      ${mode === 'template' ? renderBuilderTemplateEditor(page) : ''}
      ${mode === 'drag_drop' ? renderBuilderBlocksEditor(page) : ''}
      ${mode === 'custom_code' ? renderBuilderCustomCodeEditor(page) : ''}
      ${renderBuilderFormEditor(page)}
      ${renderBuilderAutomationEditor(page)}
      ${renderBuilderVersionHistory()}
    `;
  }

  function renderBuilderPublicShell(page, trainer, { publicView = false } = {}) {
    const title = String(page?.pageName || trainer?.fullName || trainer?.displayName || 'Coach page').trim() || 'Coach page';
    const subtitle = String(page?.seo?.description || trainer?.brandPositioning || '').trim();
    const forms = Array.isArray(activeBuilderDraftContent(page, { publicView })?.forms) ? activeBuilderDraftContent(page, { publicView }).forms : [];
    return `
      ${renderBuilderNavigation(page, { publicView })}
      <section class="trainer-profile-hero trainer-profile-sales-hero">
        <article class="trainer-profile-card trainer-profile-hero-card trainer-profile-offer-card">
          <div class="trainer-profile-kicker">${escapeHtml(String(trainer?.fullName || trainer?.displayName || 'Coach').trim() || 'Coach')}</div>
          <h1 class="trainer-profile-offer-title">${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="trainer-profile-offer-sub">${escapeHtml(subtitle)}</p>` : ''}
          <div class="trainer-profile-microcopy">${escapeHtml(builderPagePath(page))}</div>
        </article>
      </section>
      <section class="trainer-profile-main-column">
        ${renderActiveBuilderPage(page, { publicView })}
        ${forms.map((form) => renderPublicLeadForm(form, page)).join('')}
      </section>
    `;
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
    const pageSelect = $('#trainer-page-select');
    if (pageSelect) {
      pageSelect.onchange = () => {
        const nextId = String(pageSelect.value || '').trim();
      const nextPage = pageState.trainerPages.find((page) => String(page.id || '').trim() === nextId) || null;
      if (!nextPage) return;
      pageState.currentTrainerPage = cloneJson(nextPage);
      editorState.original = cloneJson(nextPage);
      editorState.draft = cloneJson(nextPage);
      editorState.dirty = false;
      void loadCurrentBuilderVersions(nextPage.id);
      renderCurrentProfile();
    };
  }
    const newPageBtn = $('#trainer-page-new');
    if (newPageBtn) {
      newPageBtn.onclick = () => {
        const count = Array.isArray(pageState.trainerPages) ? pageState.trainerPages.length : 0;
        if (count >= 5) {
          window.alert('You already have 5 trainer pages.');
          return;
        }
        openBuilderEditor(createBlankTrainerPage(pageState.trainer, {
          pageName: `Page ${count + 1}`,
          navLabel: `Page ${count + 1}`,
          navOrder: count,
          pageSlug: count === 0 ? '' : `page-${count + 1}`,
          isHome: count === 0
        }));
      };
    }
    const moveUpBtn = $('#trainer-page-move-up');
    if (moveUpBtn) moveUpBtn.onclick = () => moveCurrentBuilderPage(-1);
    const moveDownBtn = $('#trainer-page-move-down');
    if (moveDownBtn) moveDownBtn.onclick = () => moveCurrentBuilderPage(1);
    const undoBtn = $('#trainer-page-undo');
    if (undoBtn) undoBtn.onclick = () => stepBuilderHistory('undo');
    const redoBtn = $('#trainer-page-redo');
    if (redoBtn) redoBtn.onclick = () => stepBuilderHistory('redo');
    const previewBtn = $('#trainer-page-preview');
    if (previewBtn) {
      previewBtn.onclick = () => {
        editorState.previewMode = !editorState.previewMode;
        renderCurrentProfile();
      };
    }
    document.querySelectorAll('[data-trainer-preview-device]').forEach((button) => {
      button.onclick = () => {
        editorState.previewDevice = String(button.getAttribute('data-trainer-preview-device') || 'desktop').trim();
        renderCurrentProfile();
      };
    });
    const publishBtn = $('#trainer-page-publish');
    if (publishBtn) publishBtn.onclick = () => { void publishCurrentBuilderPage(); };
    const unpublishBtn = $('#trainer-page-unpublish');
    if (unpublishBtn) unpublishBtn.onclick = () => { void unpublishCurrentBuilderPage(); };
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
        if (!pageState.currentTrainerPage && (Array.isArray(pageState.trainerPages) && pageState.trainerPages.length)) {
          pageState.currentTrainerPage = cloneJson(pageState.trainerPages[0]);
        }
        if (pageState.currentTrainerPage || !pageState.view) {
          if (editorState.enabled) {
            void persistBuilderPage({ autosave: false, exitEdit: true });
            return;
          }
          openBuilderEditor(pageState.currentTrainerPage || createBlankTrainerPage(pageState.trainer));
          return;
        }
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
        if (pageState.currentTrainerPage || editorState.openSection === 'builder') {
          void persistBuilderPage({ autosave: false, exitEdit: false });
          return;
        }
        savePageEdits();
      };
    }
    const builderMetaForm = $('#trainer-page-meta-form');
    if (builderMetaForm) {
      builderMetaForm.oninput = () => {
        updateBuilderDraft((draft) => {
          draft.pageName = String($('#trainer-page-name')?.value || draft.pageName || 'Home').trim() || 'Home';
          draft.navLabel = String($('#trainer-page-nav-label')?.value || draft.navLabel || draft.pageName || 'Home').trim() || draft.pageName || 'Home';
          draft.siteSlug = sanitizeHandle($('#trainer-page-site-slug')?.value || draft.siteSlug || pageState.trainer?.publicHandle || pageState.trainer?.username || '');
          draft.pageSlug = slugify($('#trainer-page-slug')?.value || '');
          draft.isHome = Boolean($('#trainer-page-is-home')?.checked) || !draft.pageSlug;
        });
      };
    }
    const modeButtons = document.querySelectorAll('[data-builder-mode]');
    modeButtons.forEach((button) => {
      button.onclick = () => {
        const mode = String(button.getAttribute('data-builder-mode') || '').trim();
        updateBuilderDraft((draft) => {
          const previousMode = String(draft.mode || draft.draftContent?.mode || '').trim().toLowerCase();
          const shouldSeedStarter = !previousMode || isBuilderPageEmpty(draft);
          if (shouldSeedStarter) {
            applyStarterContentForMode(draft, pageState.trainer, mode);
            return;
          }
          draft.mode = mode;
          draft.draftContent = draft.draftContent || {};
          draft.draftContent.mode = mode;
          if (mode === 'drag_drop' && !Array.isArray(draft.draftContent.blocks)) draft.draftContent.blocks = [];
          if (mode === 'custom_code' && !draft.draftContent.customCode) {
            draft.draftContent.customCode = { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
          }
        });
      };
    });
    const templateForm = $('#trainer-page-template-form');
    if (templateForm) {
      templateForm.oninput = () => {
        updateBuilderDraft((draft) => {
          draft.mode = 'template';
          draft.draftContent.mode = 'template';
          draft.draftContent.templateKey = String($('#trainer-page-template-key')?.value || 'general_trainer').trim();
          draft.draftContent.theme = draft.draftContent.theme || {};
          draft.draftContent.theme.headline = String($('#trainer-page-template-headline')?.value || '').trim();
          draft.draftContent.theme.subheadline = String($('#trainer-page-template-subheadline')?.value || '').trim();
          draft.draftContent.theme.body = String($('#trainer-page-template-body')?.value || '').trim();
          draft.draftContent.theme.ctaLabel = String($('#trainer-page-template-cta')?.value || '').trim();
          draft.draftContent.theme.accentColor = String($('#trainer-page-template-accent')?.value || '').trim();
          draft.draftContent.theme.backgroundColor = String($('#trainer-page-template-bg')?.value || '').trim();
          draft.draftContent.theme.textColor = String($('#trainer-page-template-text')?.value || '').trim();
        });
      };
    }
    const addBlockBtn = $('#trainer-page-add-block');
    if (addBlockBtn) {
      addBlockBtn.onclick = () => {
        const blockType = String($('#trainer-page-block-type')?.value || 'text').trim();
        updateBuilderDraft((draft) => {
          draft.mode = 'drag_drop';
          draft.draftContent.mode = 'drag_drop';
          draft.draftContent.blocks = Array.isArray(draft.draftContent.blocks) ? draft.draftContent.blocks : [];
          draft.draftContent.blocks.push({
            id: `block-${Date.now()}`,
            type: blockType,
            label: blockType.replace(/_/g, ' '),
            content: {
              kicker: '',
              headline: 'New block headline',
              body: 'Block copy',
              text: 'Block copy',
              mediaUrl: '',
              ctaLabel: '',
              ctaHref: '',
              items: [],
              itemsText: '',
              embedHtml: ''
            },
            style: {
              backgroundColor: '',
              textColor: '',
              borderColor: '',
              padding: '',
              borderRadius: '',
              textAlign: 'left'
            },
            layout: {
              columns: blockType === 'columns' ? 2 : 1,
              gap: '16px'
            },
            mobile: {
              stack: true
            }
          });
        });
      };
    }
    document.querySelectorAll('[data-builder-block-field]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-block-index'));
        const field = String(input.getAttribute('data-builder-block-field') || '').trim();
        if (!Number.isInteger(index) || !field) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          const block = blocks[index];
          if (!block) return;
          if (field === 'label') {
            block.label = String(input.value || '').trim();
            return;
          }
          block.content = block.content || {};
          if (field === 'itemsText') {
            block.content.itemsText = String(input.value || '').trim();
            block.content.items = String(input.value || '').split('\n').map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12);
            return;
          }
          if (field === 'mediaUrl') {
            block.content.mediaUrl = String(input.value || '').trim();
            if (block.type === 'image') block.content.src = block.content.mediaUrl;
            if (block.type === 'video_vsl' || block.type === 'vsl_form') block.content.videoUrl = block.content.mediaUrl;
            return;
          }
          block.content[field] = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-block-style]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-block-index'));
        const field = String(input.getAttribute('data-builder-block-style') || '').trim();
        if (!Number.isInteger(index) || !field) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          const block = blocks[index];
          if (!block) return;
          block.style = block.style || {};
          block.style[field] = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-block-layout]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-block-index'));
        const field = String(input.getAttribute('data-builder-block-layout') || '').trim();
        if (!Number.isInteger(index) || !field) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          const block = blocks[index];
          if (!block) return;
          block.layout = block.layout || {};
          block.layout[field] = field === 'columns'
            ? Math.max(1, Math.min(4, Number(input.value) || 1))
            : String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-block-mobile]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-block-index'));
        const field = String(input.getAttribute('data-builder-block-mobile') || '').trim();
        if (!Number.isInteger(index) || !field) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          const block = blocks[index];
          if (!block) return;
          block.mobile = block.mobile || {};
          block.mobile[field] = String(input.value || '').trim() === 'true';
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-block-move]').forEach((button) => {
      button.onclick = () => {
        const [indexRaw, offsetRaw] = String(button.getAttribute('data-builder-block-move') || '').split(':');
        const index = Number(indexRaw);
        const offset = Number(offsetRaw);
        if (!Number.isInteger(index) || !Number.isInteger(offset)) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks.slice() : [];
          if (index < 0 || index >= blocks.length) return;
          const targetIndex = Math.max(0, Math.min(blocks.length - 1, index + offset));
          if (targetIndex === index) return;
          const [moved] = blocks.splice(index, 1);
          blocks.splice(targetIndex, 0, moved);
          draft.draftContent.blocks = blocks;
        });
      };
    });
    document.querySelectorAll('[data-builder-block-remove]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.getAttribute('data-builder-block-remove'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          draft.draftContent.blocks = blocks.filter((_, blockIndex) => blockIndex !== index);
        });
      };
    });
    const customCodeForm = $('#trainer-page-code-form');
    if (customCodeForm) {
      customCodeForm.oninput = () => {
        updateBuilderDraft((draft) => {
          const parseCustomCodeEntries = (raw, tagName) => String(raw || '')
            .split(/\r?\n/)
            .map((line) => String(line || '').trim())
            .filter(Boolean)
            .map((line) => {
              if (line.startsWith(`<${tagName}`)) return { html: line };
              return { src: line };
            });
          draft.mode = 'custom_code';
          draft.draftContent.mode = 'custom_code';
          draft.draftContent.customCode = draft.draftContent.customCode || {};
          draft.draftContent.customCode.html = String($('#trainer-page-code-html')?.value || '').trim();
          draft.draftContent.customCode.css = String($('#trainer-page-code-css')?.value || '').trim();
          draft.draftContent.customCode.javascript = String($('#trainer-page-code-js')?.value || '').trim();
          draft.draftContent.customCode.iframes = parseCustomCodeEntries($('#trainer-page-code-iframes')?.value || '', 'iframe');
          draft.draftContent.customCode.embedScripts = parseCustomCodeEntries($('#trainer-page-code-embeds')?.value || '', 'script');
        });
      };
    }
    const addFormBtn = $('#trainer-page-add-form');
    if (addFormBtn) {
      addFormBtn.onclick = () => {
        updateBuilderDraft((draft) => {
          draft.draftContent = draft.draftContent || {};
          draft.draftContent.forms = Array.isArray(draft.draftContent.forms) ? draft.draftContent.forms : [];
          draft.draftContent.forms.push({
            id: `form-${Date.now()}`,
            name: `Form ${draft.draftContent.forms.length + 1}`,
            submitLabel: 'Submit',
            successMode: 'message',
            successTarget: '',
            fields: [
              { id: 'name', name: 'name', label: 'Name', type: 'text', required: true, options: [] },
              { id: 'email', name: 'email', label: 'Email', type: 'email', required: true, options: [] }
            ]
          });
        });
      };
    }
    document.querySelectorAll('[data-builder-form-name]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-form-name'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const form = forms[index];
          if (!form) return;
          form.name = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-form-submit]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-form-submit'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const form = forms[index];
          if (!form) return;
          form.submitLabel = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-form-remove]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.getAttribute('data-builder-form-remove'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          draft.draftContent.forms = forms.filter((_, formIndex) => formIndex !== index);
        });
      };
    });
    document.querySelectorAll('[data-builder-form-add-field]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.getAttribute('data-builder-form-add-field'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const form = forms[index];
          if (!form) return;
          form.fields = Array.isArray(form.fields) ? form.fields : [];
          form.fields.push({
            id: `field-${Date.now()}`,
            name: `field_${form.fields.length + 1}`,
            label: 'New question',
            type: 'text',
            required: false,
            options: []
          });
        });
      };
    });
    document.querySelectorAll('[data-builder-form-field-label], [data-builder-form-field-name], [data-builder-form-field-type], [data-builder-form-field-placeholder], [data-builder-form-field-options], [data-builder-form-field-accept], [data-builder-form-field-required], [data-builder-form-field-multiple]').forEach((input) => {
      const attr = Array.from(input.attributes).find((attribute) => attribute.name.startsWith('data-builder-form-field-'));
      if (!attr) return;
      const fieldKey = attr.name.replace('data-builder-form-field-', '');
      const sync = () => {
        const [formIndexRaw, fieldIndexRaw] = String(input.getAttribute(attr.name) || '').split(':');
        const formIndex = Number(formIndexRaw);
        const fieldIndex = Number(fieldIndexRaw);
        if (!Number.isInteger(formIndex) || !Number.isInteger(fieldIndex)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const field = forms[formIndex]?.fields?.[fieldIndex];
          if (!field) return;
          if (fieldKey === 'label') field.label = String(input.value || '').trim();
          if (fieldKey === 'name') field.name = String(input.value || '').trim();
          if (fieldKey === 'type') field.type = String(input.value || '').trim();
          if (fieldKey === 'placeholder') field.placeholder = String(input.value || '').trim();
          if (fieldKey === 'options') field.options = uniqueList(String(input.value || '').trim(), 20);
          if (fieldKey === 'accept') field.accept = uniqueList(String(input.value || '').trim(), 10);
          if (fieldKey === 'required') field.required = String(input.value || '').trim() === 'true';
          if (fieldKey === 'multiple') {
            field.meta = field.meta && typeof field.meta === 'object' ? field.meta : {};
            field.meta.multiple = String(input.value || '').trim() === 'true';
          }
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-form-field-remove]').forEach((button) => {
      button.onclick = () => {
        const [formIndexRaw, fieldIndexRaw] = String(button.getAttribute('data-builder-form-field-remove') || '').split(':');
        const formIndex = Number(formIndexRaw);
        const fieldIndex = Number(fieldIndexRaw);
        if (!Number.isInteger(formIndex) || !Number.isInteger(fieldIndex)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const form = forms[formIndex];
          if (!form) return;
          form.fields = (Array.isArray(form.fields) ? form.fields : []).filter((_, index) => index !== fieldIndex);
        });
      };
    });
    const addNodeBtn = $('#trainer-page-add-node');
    if (addNodeBtn) {
      addNodeBtn.onclick = () => {
        updateBuilderDraft((draft) => {
          draft.draftContent = draft.draftContent || {};
          draft.draftContent.automations = draft.draftContent.automations || { nodes: [], edges: [] };
          draft.draftContent.automations.nodes = Array.isArray(draft.draftContent.automations.nodes) ? draft.draftContent.automations.nodes : [];
          draft.draftContent.automations.nodes.push({
            id: `node-${Date.now()}`,
            type: 'form_submitted',
            config: { label: 'Form submitted', target: '' },
            position: {}
          });
        });
      };
    }
    document.querySelectorAll('[data-builder-node-type], [data-builder-node-label], [data-builder-node-target]').forEach((input) => {
      const attr = Array.from(input.attributes).find((attribute) => attribute.name.startsWith('data-builder-node-'));
      if (!attr) return;
      const fieldKey = attr.name.replace('data-builder-node-', '');
      const sync = () => {
        const index = Number(input.getAttribute(attr.name));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const nodes = Array.isArray(draft.draftContent?.automations?.nodes) ? draft.draftContent.automations.nodes : [];
          const node = nodes[index];
          if (!node) return;
          node.config = node.config || {};
          if (fieldKey === 'type') node.type = String(input.value || '').trim();
          if (fieldKey === 'label') node.config.label = String(input.value || '').trim();
          if (fieldKey === 'target') node.config.target = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-node-remove]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.getAttribute('data-builder-node-remove'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const nodes = Array.isArray(draft.draftContent?.automations?.nodes) ? draft.draftContent.automations.nodes : [];
          draft.draftContent.automations.nodes = nodes.filter((_, nodeIndex) => nodeIndex !== index);
        });
      };
    });
    document.querySelectorAll('[data-builder-draft-link]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (!canEditTrainerPage(pageState.trainer, pageState.view)) return;
        event.preventDefault();
        const href = String(link.getAttribute('href') || '').trim();
        const match = href.match(/^\/coach\/([^/]+)(?:\/([^/]+))?$/i);
        const pageSlug = String(match?.[2] || '').trim();
        const nextPage = (Array.isArray(pageState.trainerPages) ? pageState.trainerPages : []).find((page) => String(page.pageSlug || '').trim() === pageSlug) || null;
        if (!nextPage) return;
        pageState.currentTrainerPage = cloneJson(nextPage);
        editorState.original = cloneJson(nextPage);
        editorState.draft = cloneJson(nextPage);
        void loadCurrentBuilderVersions(nextPage.id);
        renderCurrentProfile();
      });
    });
    document.querySelectorAll('[data-builder-version-restore]').forEach((button) => {
      button.onclick = () => {
        const versionId = String(button.getAttribute('data-builder-version-restore') || '').trim();
        if (!versionId) return;
        void restoreBuilderVersion(versionId);
      };
    });
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
    bindPublicLeadForms();
    bindPublicPageAutomation();
    syncBuilderToolbarState();
  }

  function renderPageEditToolbar(trainer, view) {
    const statusEl = $('#trainer-profile-status');
    if (!statusEl) return;
    document.body.classList.toggle('trainer-profile-editing', Boolean(editorState.enabled));
    if (!canEditTrainerPage(trainer, view)) {
      statusEl.innerHTML = '';
      return;
    }
    const currentPage = pageState.currentTrainerPage || null;
    const pageOptions = Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [];
    if (!editorState.enabled) {
      statusEl.innerHTML = `
        <div class="trainer-profile-edit-toolbar">
          ${pageOptions.length ? `
            <select id="trainer-page-select" class="trainer-profile-edit-action">
              ${pageOptions.map((page) => `<option value="${escapeHtml(page.id || '')}"${currentPage?.id === page.id ? ' selected' : ''}>${escapeHtml(page.pageName || 'Page')}</option>`).join('')}
            </select>
          ` : ''}
          <button type="button" class="trainer-profile-edit-action" id="trainer-page-new">New page</button>
          <button type="button" class="trainer-profile-edit-toggle" id="trainer-profile-edit-toggle">Edit page</button>
        </div>
      `;
      return;
    }
    statusEl.innerHTML = `
      <div class="trainer-profile-edit-toolbar is-active">
        ${pageOptions.length ? `
          <select id="trainer-page-select" class="trainer-profile-edit-action">
            ${pageOptions.map((page) => `<option value="${escapeHtml(page.id || '')}"${currentPage?.id === page.id ? ' selected' : ''}>${escapeHtml(page.pageName || 'Page')}</option>`).join('')}
          </select>
        ` : ''}
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-new">New page</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-move-up">Move earlier</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-move-down">Move later</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-undo">Undo</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-redo">Redo</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-preview">${editorState.previewMode ? 'Hide preview' : 'Preview'}</button>
        <button type="button" class="trainer-profile-edit-action" data-trainer-preview-device="desktop">Desktop</button>
        <button type="button" class="trainer-profile-edit-action" data-trainer-preview-device="mobile">Mobile</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-profile-edit-save">Save</button>
        <button type="button" class="trainer-profile-edit-action confirm" id="trainer-page-publish">Publish</button>
        ${currentPage?.isPublished ? '<button type="button" class="trainer-profile-edit-action danger" id="trainer-page-unpublish">Unpublish</button>' : ''}
        <span class="trainer-profile-edit-note${editorState.dirty ? ' is-dirty' : ''}" id="trainer-profile-builder-note">${editorState.dirty ? 'Unsaved changes' : 'Editing page'}</span>
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

/* cloneJson */
function cloneJson(raw) {
    if (raw == null) return raw;
    try {
      return JSON.parse(JSON.stringify(raw));
    } catch {
      return raw;
    }
  }

/* sanitizeHandle */
function sanitizeHandle(raw) {
    return String(raw || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/[^a-z0-9_.-]/gi, '')
      .toLowerCase();
  }

/* slugify */
function slugify(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

/* normalizeBuilderPageShape */
function normalizeBuilderPageShape(raw, fallback = {}

/* createBlankTrainerPage */
function createBlankTrainerPage(trainer, overrides = {}

/* buildStarterTemplateTheme */
function buildStarterTemplateTheme(trainer, page = {}

/* buildStarterDragDropBlocks */
function buildStarterDragDropBlocks(trainer, page = {}

/* buildStarterCustomCode */
function buildStarterCustomCode(trainer, page = {}

/* applyStarterContentForMode */
function applyStarterContentForMode(draft, trainer, mode) {
    if (!draft || !mode) return;
    draft.mode = mode;
    draft.draftContent = draft.draftContent || {};
    draft.draftContent.mode = mode;
    if (mode === 'template') {
      draft.draftContent.templateKey = String(draft.draftContent.templateKey || 'general_trainer').trim().toLowerCase() || 'general_trainer';
      draft.draftContent.theme = buildStarterTemplateTheme(trainer, draft);
      draft.draftContent.blocks = [];
      draft.draftContent.customCode = { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
      return;
    }
    if (mode === 'drag_drop') {
      draft.draftContent.blocks = buildStarterDragDropBlocks(trainer, draft);
      draft.draftContent.customCode = { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
      return;
    }
    if (mode === 'custom_code') {
      draft.draftContent.customCode = buildStarterCustomCode(trainer, draft);
      draft.draftContent.blocks = [];
    }
  }

/* activeBuilderDraftContent */
function activeBuilderDraftContent(page, { publicView = false }

/* safeStyleToken */
function safeStyleToken(raw, fallback = '') {
    const value = String(raw || '').trim();
    if (!value) return fallback;
    return value.replace(/[;"'<>]/g, '').slice(0, 120);
  }

  function builderBlockCardStyle(block) {
    const style = block?.style && typeof block.style === 'object' ? block.style : {};
    const parts = [];
    const backgroundColor = safeStyleToken(style.backgroundColor);
    const textColor = safeStyleToken(style.textColor);
    const borderColor = safeStyleToken(style.borderColor);
    const borderRadius = safeStyleToken(style.borderRadius);
    const padding = safeStyleToken(style.padding);
    const textAlign = safeStyleToken(style.textAlign);
    if (backgroundColor) parts.push(`background:${backgroundColor}`);
    if (textColor) parts.push(`color:${textColor}`);
    if (borderColor) parts.push(`border:1px solid ${borderColor}`);
    if (borderRadius) parts.push(`border-radius:${borderRadius}`);
    if (padding) parts.push(`padding:${padding}`);
    if (textAlign) parts.push(`text-align:${textAlign}`);
    return parts.join(';');
  }

  function builderBlockColumnsStyle(block) {
    const layout = block?.layout && typeof block.layout === 'object' ? block.layout : {};
    const columns = Math.max(1, Math.min(4, Number(layout.columns) || 1));
    const gap = safeStyleToken(layout.gap || '16px', '16px');
    return `display:grid;grid-template-columns:repeat(${columns}, minmax(0, 1fr));gap:${gap};`;
  }

  function builderBlockItems(content) {
    if (Array.isArray(content?.items) && content.items.length) {
      return content.items.map((item) => String(item || '').trim()).filter(Boolean);
    }
    return String(content?.itemsText || '')
      .split(/\n|,/)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function renderBuilderBlock(block) {
    const safe = block && typeof block === 'object' ? block : {};
    const type = String(safe.type || '').trim().toLowerCase();
    const content = safe.content && typeof safe.content === 'object' ? safe.content : {};
    const cardStyle = builderBlockCardStyle(safe);
    const items = builderBlockItems(content);
    const mediaUrl = String(content.mediaUrl || content.src || content.videoUrl || '').trim();
    const ctaLabel = String(content.ctaLabel || '').trim();
    const ctaHref = String(content.ctaHref || '').trim();
    const ctaClass = type === 'hero' ? 'trainer-profile-editor-btn primary' : 'trainer-profile-editor-btn';
    const ctaAttrs = ctaLabel
      ? `class="${ctaClass}" href="${escapeHtml(ctaHref || '#')}" data-public-builder-cta="1" data-public-builder-cta-target="${escapeHtml(ctaHref || '#')}"`
      : '';
    const title = String(content.headline || content.title || safe.label || type || 'Block').trim() || 'Block';
    const kicker = String(content.kicker || '').trim();
    const body = String(content.body || content.text || content.description || '').trim();
    if (type === 'hero') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-hero" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Hero')}</div>
          <h2 class="trainer-profile-section-title">${escapeHtml(title || 'Hero headline')}</h2>
          <p class="trainer-profile-body">${escapeHtml(body || 'Supporting copy')}</p>
          ${ctaLabel ? `<div class="trainer-profile-editor-actions" style="margin-top:14px;"><a ${ctaAttrs}>${escapeHtml(ctaLabel)}</a></div>` : ''}
        </section>
      `;
    }
    if (type === 'image') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-image" style="${escapeHtml(cardStyle)}">
          ${mediaUrl ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(String(content.alt || 'Page image').trim() || 'Page image')}">` : '<div class="trainer-profile-muted">Image block</div>'}
        </section>
      `;
    }
    if (type === 'gallery') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-gallery" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Gallery')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            ${items.length ? items.map((item, index) => `<div class="trainer-profile-note">${escapeHtml(item || `Image ${index + 1}`)}</div>`).join('') : '<div class="trainer-profile-muted">Add gallery image URLs or labels.</div>'}
          </div>
        </section>
      `;
    }
    if (type === 'video_vsl' || type === 'vsl_form') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-video" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Video')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <p class="trainer-profile-body">${escapeHtml(body || 'Video sales letter section')}</p>
          ${mediaUrl ? `<div class="trainer-profile-note">${escapeHtml(mediaUrl)}</div>` : ''}
          ${type === 'vsl_form' ? '<div class="trainer-profile-note">Pair this with one of the page forms below.</div>' : ''}
        </section>
      `;
    }
    if (type === 'form') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-form" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">Form</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title || 'Lead form')}</h3>
          <p class="trainer-profile-body">${escapeHtml(body || 'Collect a lead from this page.')}</p>
        </section>
      `;
    }
    if (type === 'columns') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-columns" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Columns')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div style="${escapeHtml(builderBlockColumnsStyle(safe))}">
            ${(items.length ? items : ['Column one', 'Column two']).map((item) => `<div class="trainer-profile-note">${escapeHtml(item)}</div>`).join('')}
          </div>
        </section>
      `;
    }
    if (type === 'spacer') {
      const spacerHeight = safeStyleToken(safe?.style?.minHeight || '40px', '40px');
      return `<section class="trainer-profile-builder-block type-spacer" style="min-height:${escapeHtml(spacerHeight)};"></section>`;
    }
    if (type === 'custom_embed') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-custom-embed" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Embed')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div class="trainer-profile-note">${escapeHtml(String(content.embedHtml || body || 'Custom embed code preview').trim() || 'Custom embed code preview')}</div>
        </section>
      `;
    }
    return `
      <section class="trainer-profile-card trainer-profile-builder-block type-generic" style="${escapeHtml(cardStyle)}">
        <div class="trainer-profile-section-kicker">${escapeHtml(kicker || type || 'Block')}</div>
        <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
        <div class="trainer-profile-body">${escapeHtml(body || 'Custom content block')}</div>
        ${items.length ? `<div style="margin-top:12px;display:grid;gap:8px;">${items.map((item) => `<div class="trainer-profile-note">${escapeHtml(item)}</div>`).join('')}</div>` : ''}
        ${ctaLabel ? `<div class="trainer-profile-editor-actions" style="margin-top:14px;"><a ${ctaAttrs}>${escapeHtml(ctaLabel)}</a></div>` : ''}
        ${mediaUrl && type !== 'image' ? `<div class="trainer-profile-note" style="margin-top:12px;">${escapeHtml(mediaUrl)}</div>` : ''}
      </section>
    `;
  }

  function renderTemplatePage(page, { publicView = false } = {}) {
    const theme = builderTheme(page, { publicView });
    const draft = activeBuilderDraftContent(page, { publicView });
    const templateLabel = BUILDER_TEMPLATE_OPTIONS.find((entry) => entry[0] === String(draft.templateKey || '').trim())?.[1] || 'Template';
    return `
      <section class="trainer-profile-hero trainer-profile-sales-hero">
        <article class="trainer-profile-card trainer-profile-hero-card trainer-profile-offer-card">
          <div class="trainer-profile-kicker">${escapeHtml(templateLabel)}</div>
          <h1 class="trainer-profile-offer-title">${escapeHtml(String(theme.headline || page.pageName || 'Coach page').trim() || 'Coach page')}</h1>
          <p class="trainer-profile-offer-sub">${escapeHtml(String(theme.subheadline || '').trim() || 'This published page is being served from the trainer page builder.')}</p>
          <div class="trainer-profile-microcopy">${escapeHtml(String(theme.body || '').trim() || 'Edit this template inside the existing Edit page flow.')}</div>
        </article>
      </section>
    `;
  }

  function renderDragDropPage(page, { publicView = false } = {}) {
    const blocks = Array.isArray(activeBuilderDraftContent(page, { publicView })?.blocks) ? activeBuilderDraftContent(page, { publicView }).blocks : [];
    if (!blocks.length) {
      return '<section class="trainer-profile-card"><div class="trainer-profile-muted">No blocks yet. Open Edit page to add sections.</div></section>';
    }
    return blocks.map((block) => renderBuilderBlock(block)).join('');
  }

  function renderCustomCodePreview(page, { publicView = false } = {}) {
    const code = activeBuilderDraftContent(page, { publicView })?.customCode || {};
    const html = String(code.html || '').trim();
    const css = String(code.css || '').trim();
    const javascript = String(code.javascript || '').trim();
    const iframeMarkup = (Array.isArray(code.iframes) ? code.iframes : []).map((entry) => {
      if (typeof entry === 'string') {
        const src = String(entry || '').trim();
        return src ? `<iframe src="${escapeHtml(src)}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;min-height:320px;border:0;"></iframe>` : '';
      }
      const raw = entry && typeof entry === 'object' ? entry : {};
      const htmlValue = String(raw.html || '').trim();
      if (htmlValue) return htmlValue;
      const src = String(raw.src || raw.url || '').trim();
      return src ? `<iframe src="${escapeHtml(src)}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;min-height:320px;border:0;"></iframe>` : '';
    }).filter(Boolean).join('\n');
    const embedScriptMarkup = (Array.isArray(code.embedScripts) ? code.embedScripts : []).map((entry) => {
      if (typeof entry === 'string') {
        const src = String(entry || '').trim();
        return src ? `<script src="${escapeHtml(src)}"><\/script>` : '';
      }
      const raw = entry && typeof entry === 'object' ? entry : {};
      const htmlValue = String(raw.html || '').trim();
      if (htmlValue) return htmlValue.replace(/<\/script/gi, '<\\/script');
      const src = String(raw.src || raw.url || '').trim();
      return src ? `<script src="${escapeHtml(src)}"><\/script>` : '';
    }).filter(Boolean).join('\n');
    const srcdoc = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action https: mailto:; img-src data: https:; media-src data: https:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; frame-src data: https:; font-src data: https:;">
        <style>body{margin:0;font-family:Georgia,serif;padding:24px;background:#fff;color:#111827;}${css}</style>
      </head>
      <body>
        ${html || '<div>No custom code yet.</div>'}
        ${iframeMarkup}
        ${embedScriptMarkup}
        <script>${javascript.replace(/<\/script/gi, '<\\/script')}<\/script>
      </body>
      </html>
    `.trim();
    return `
      <section class="trainer-profile-card trainer-profile-builder-custom-code">
        <iframe
          title="Custom page preview"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          allow="fullscreen; clipboard-read *; clipboard-write *"
          referrerpolicy="no-referrer"
          srcdoc="${escapeHtml(srcdoc)}"
          style="width:100%;min-height:560px;border:0;border-radius:22px;background:#fff;"
        ></iframe>
      </section>
    `;
  }

  function renderActiveBuilderPage(page, { publicView = false } = {}) {
    const mode = String(page?.mode || activeBuilderDraftContent(page, { publicView })?.mode || '').trim().toLowerCase();
    if (!mode) {
      return '<section class="trainer-profile-card"><div class="trainer-profile-muted">This page is blank. Choose Template, Drag-and-drop, or Custom code to start building it.</div></section>';
    }
    if (mode === 'custom_code') return renderCustomCodePreview(page, { publicView });
    if (mode === 'drag_drop') return renderDragDropPage(page, { publicView });
    return renderTemplatePage(page, { publicView });
  }

  function builderNavigationPages() {
    const source = pageState.publicPagePayload?.navigation?.length
      ? pageState.publicPagePayload.navigation
      : (Array.isArray(pageState.trainerPages) ? pageState.trainerPages : []);
    return source.slice().sort((a, b) => {
      const left = Number.isFinite(Number(a?.navOrder)) ? Number(a.navOrder) : 0;
      const right = Number.isFinite(Number(b?.navOrder)) ? Number(b.navOrder) : 0;
      if (left !== right) return left - right;
      return String(a?.pageName || '').localeCompare(String(b?.pageName || ''));
    }).map((page) => ({
      id: page.id,
      siteSlug: page.siteSlug || '',
      pageSlug: page.pageSlug || '',
      pageName: page.pageName || 'Page',
      navLabel: page.navLabel || page.pageName || 'Page',
      navOrder: Number.isFinite(Number(page?.navOrder)) ? Number(page.navOrder) : 0,
      isHome: page.isHome === true,
      publicPath: builderPagePath(page),
      isPublished: page.isPublished === true
    }));
  }

  function renderBuilderNavigation(page, { publicView = false } = {}) {
    const items = builderNavigationPages();
    if (!items.length) return '';
    const currentPath = builderPagePath(page);
    return `
      <nav class="trainer-profile-card trainer-profile-builder-nav" aria-label="Coach site navigation">
        <div class="trainer-profile-chip-row trainer-profile-detail-chip-row trainer-profile-simple-chips">
          ${items.map((item) => `
            <a
              class="trainer-profile-chip${item.publicPath === currentPath ? '' : ' soft'}"
              href="${escapeHtml(item.publicPath || '#')}"
              ${publicView || item.isPublished ? '' : 'data-builder-draft-link="1"'}
            >${escapeHtml(item.navLabel || item.pageName || 'Page')}</a>
          `).join('')}
        </div>
      </nav>
    `;
  }

  function buildPublicLeadFormField(field, formId, fieldIndex) {
    const safe = field && typeof field === 'object' ? field : {};
    const fieldType = String(safe.type || 'text').trim().toLowerCase();
    const fieldId = String(safe.id || safe.name || `field-${fieldIndex + 1}`).trim() || `field-${fieldIndex + 1}`;
    const fieldName = String(safe.name || fieldId).trim() || fieldId;
    const label = String(safe.label || fieldName).trim() || fieldName;
    const placeholder = String(safe.placeholder || '').trim();
    const required = safe.required === true ? ' required' : '';
    const inputId = `trainer-public-form-${formId}-${fieldId}-${fieldIndex}`;
    const options = Array.isArray(safe.options) ? safe.options.filter(Boolean) : [];
    const acceptList = Array.isArray(safe.accept) ? safe.accept.filter(Boolean) : [];
    const acceptAttr = acceptList.length ? ` accept="${escapeHtml(acceptList.join(','))}"` : '';
    const allowMultiple = safe?.meta?.multiple === true ? ' multiple' : '';

    if (fieldType === 'textarea' || fieldType === 'long_text') {
      return `
        <label class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <textarea id="${escapeHtml(inputId)}" name="${escapeHtml(fieldName)}" placeholder="${escapeHtml(placeholder)}"${required}></textarea>
        </label>
      `;
    }
    if (fieldType === 'dropdown' || fieldType === 'select') {
      return `
        <label class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <select id="${escapeHtml(inputId)}" name="${escapeHtml(fieldName)}"${required}>
            <option value="">Select</option>
            ${options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
          </select>
        </label>
      `;
    }
    if (fieldType === 'radio') {
      return `
        <fieldset class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <div class="trainer-profile-editor-pill-grid">
            ${options.map((option, optionIndex) => `
              <label class="trainer-profile-editor-pill">
                <input
                  type="radio"
                  name="${escapeHtml(fieldName)}"
                  value="${escapeHtml(option)}"
                  ${safe.required === true && optionIndex === 0 ? 'required' : ''}
                >
                <span>${escapeHtml(option)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
      `;
    }
    if (fieldType === 'checkbox') {
      return `
        <fieldset class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <div class="trainer-profile-editor-pill-grid">
            ${options.map((option) => `
              <label class="trainer-profile-editor-pill">
                <input type="checkbox" name="${escapeHtml(fieldName)}" value="${escapeHtml(option)}">
                <span>${escapeHtml(option)}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
      `;
    }
    if (fieldType === 'file' || fieldType === 'photo' || fieldType === 'upload') {
      const resolvedAccept = fieldType === 'photo' && !acceptAttr ? ' accept="image/*"' : acceptAttr;
      return `
        <label class="trainer-profile-editor-field">
          <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
          <input id="${escapeHtml(inputId)}" type="file" name="${escapeHtml(fieldName)}"${required}${resolvedAccept}${allowMultiple}>
        </label>
      `;
    }
    const inputType = ['email', 'tel', 'number', 'date'].includes(fieldType) ? fieldType : 'text';
    return `
      <label class="trainer-profile-editor-field">
        <span>${escapeHtml(label)}${safe.required === true ? ' *' : ''}</span>
        <input id="${escapeHtml(inputId)}" type="${escapeHtml(inputType)}" name="${escapeHtml(fieldName)}" placeholder="${escapeHtml(placeholder)}"${required}>
      </label>
    `;
  }

  function renderPublicLeadForm(form, page) {
    const safeForm = form && typeof form === 'object' ? form : {};
    const formId = String(safeForm.id || `form-${Date.now()}`).trim() || 'lead-form';
    const fields = Array.isArray(safeForm.fields) && safeForm.fields.length
      ? safeForm.fields
      : [
          { id: 'name', name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Your name' },
          { id: 'email', name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' },
          { id: 'goal', name: 'goal', label: 'Goal', type: 'textarea', required: false, placeholder: 'What are you working toward?' }
        ];
    return `
      <form class="trainer-profile-card trainer-profile-builder-public-form" data-public-trainer-form="${escapeHtml(formId)}">
        <div class="trainer-profile-section-kicker">Contact</div>
        <h3 class="trainer-profile-section-title">${escapeHtml(String(safeForm.name || 'Apply for coaching').trim() || 'Apply for coaching')}</h3>
        <div class="trainer-profile-editor-grid two">
          ${fields.map((field, fieldIndex) => buildPublicLeadFormField(field, formId, fieldIndex)).join('')}
        </div>
        <input type="hidden" name="siteSlug" value="${escapeHtml(String(page?.siteSlug || '').trim())}">
        <input type="hidden" name="pageSlug" value="${escapeHtml(String(page?.pageSlug || '').trim())}">
        <input type="hidden" name="pageName" value="${escapeHtml(String(page?.pageName || '').trim())}">
        <input type="hidden" name="formId" value="${escapeHtml(formId)}">
        <div class="trainer-profile-editor-actions" style="margin-top:16px;">
          <button type="submit" class="trainer-profile-editor-btn primary">${escapeHtml(String(safeForm.submitLabel || 'Submit').trim() || 'Submit')}</button>
          <div class="trainer-profile-note" data-public-form-status="${escapeHtml(formId)}"></div>
        </div>
      </form>
    `;
  }

  function renderBuilderFormEditor(page) {
    const forms = Array.isArray(activeBuilderDraftContent(page)?.forms) ? activeBuilderDraftContent(page).forms : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Forms</div>
        <h3 class="trainer-profile-section-title">Lead capture</h3>
        ${forms.length ? forms.map((form, formIndex) => `
          <div class="trainer-profile-editor-block" style="margin-bottom:16px;">
            <div class="trainer-profile-editor-grid two">
              <label class="trainer-profile-editor-field">
                <span>Form name</span>
                <input type="text" data-builder-form-name="${formIndex}" value="${escapeHtml(String(form?.name || '').trim())}" placeholder="Qualification form">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Submit label</span>
                <input type="text" data-builder-form-submit="${formIndex}" value="${escapeHtml(String(form?.submitLabel || '').trim())}" placeholder="Apply now">
              </label>
            </div>
            <div class="trainer-profile-editor-actions" style="justify-content:space-between;margin:12px 0;">
              <button type="button" class="trainer-profile-editor-btn" data-builder-form-add-field="${formIndex}">Add field</button>
              <button type="button" class="trainer-profile-editor-btn" data-builder-form-remove="${formIndex}">Remove form</button>
            </div>
            ${(Array.isArray(form?.fields) ? form.fields : []).map((field, fieldIndex) => `
              <div class="trainer-profile-editor-grid three" style="margin-bottom:12px;">
                <label class="trainer-profile-editor-field">
                  <span>Label</span>
                  <input type="text" data-builder-form-field-label="${formIndex}:${fieldIndex}" value="${escapeHtml(String(field?.label || '').trim())}" placeholder="Question label">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Key</span>
                  <input type="text" data-builder-form-field-name="${formIndex}:${fieldIndex}" value="${escapeHtml(String(field?.name || '').trim())}" placeholder="field_key">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Type</span>
                  <select data-builder-form-field-type="${formIndex}:${fieldIndex}">
                    ${['text', 'email', 'tel', 'number', 'date', 'textarea', 'long_text', 'dropdown', 'radio', 'checkbox', 'file', 'photo', 'upload'].map((type) => `<option value="${type}"${String(field?.type || '').trim() === type ? ' selected' : ''}>${type}</option>`).join('')}
                  </select>
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Placeholder</span>
                  <input type="text" data-builder-form-field-placeholder="${formIndex}:${fieldIndex}" value="${escapeHtml(String(field?.placeholder || '').trim())}" placeholder="Placeholder">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Options</span>
                  <input type="text" data-builder-form-field-options="${formIndex}:${fieldIndex}" value="${escapeHtml((Array.isArray(field?.options) ? field.options : []).join(', '))}" placeholder="Option A, Option B">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Accepted files</span>
                  <input type="text" data-builder-form-field-accept="${formIndex}:${fieldIndex}" value="${escapeHtml((Array.isArray(field?.accept) ? field.accept : []).join(', '))}" placeholder="image/*,application/pdf">
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Required</span>
                  <select data-builder-form-field-required="${formIndex}:${fieldIndex}">
                    <option value="false"${field?.required === true ? '' : ' selected'}>Optional</option>
                    <option value="true"${field?.required === true ? ' selected' : ''}>Required</option>
                  </select>
                </label>
                <label class="trainer-profile-editor-field">
                  <span>Allow multiple</span>
                  <select data-builder-form-field-multiple="${formIndex}:${fieldIndex}">
                    <option value="false"${field?.meta?.multiple === true ? '' : ' selected'}>Single</option>
                    <option value="true"${field?.meta?.multiple === true ? ' selected' : ''}>Multiple</option>
                  </select>
                </label>
              </div>
              <div class="trainer-profile-editor-actions" style="margin-top:-4px;margin-bottom:12px;">
                <button type="button" class="trainer-profile-editor-btn" data-builder-form-field-remove="${formIndex}:${fieldIndex}">Remove field</button>
              </div>
            `).join('')}
          </div>
        `).join('') : '<div class="trainer-profile-muted">No forms yet. Add one for lead capture.</div>'}
        <div class="trainer-profile-editor-actions">
          <button type="button" class="trainer-profile-editor-btn primary" id="trainer-page-add-form">Add form</button>
        </div>
      </section>
    `;
  }

  function renderBuilderAutomationEditor(page) {
    const automations = activeBuilderDraftContent(page)?.automations || { nodes: [], edges: [] };
    const nodes = Array.isArray(automations.nodes) ? automations.nodes : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Automation</div>
        <h3 class="trainer-profile-section-title">Flow nodes</h3>
        ${nodes.length ? nodes.map((node, index) => `
          <div class="trainer-profile-editor-grid three" style="margin-bottom:12px;">
            <label class="trainer-profile-editor-field">
              <span>Node type</span>
              <select data-builder-node-type="${index}">
                ${['form_submitted', 'button_clicked', 'page_viewed', 'field_condition', 'if_else', 'add_tag', 'create_update_lead', 'assign_offer', 'change_stage', 'redirect', 'notify_trainer', 'email', 'wait_delay', 'webhook', 'google_sheets', 'google_calendar'].map((type) => `<option value="${type}"${String(node?.type || '').trim() === type ? ' selected' : ''}>${type}</option>`).join('')}
              </select>
            </label>
            <label class="trainer-profile-editor-field">
              <span>Label</span>
              <input type="text" data-builder-node-label="${index}" value="${escapeHtml(String(node?.config?.label || '').trim())}" placeholder="Action label">
            </label>
            <label class="trainer-profile-editor-field">
              <span>Target / value</span>
              <input type="text" data-builder-node-target="${index}" value="${escapeHtml(String(node?.config?.target || '').trim())}" placeholder="Value">
            </label>
          </div>
          <div class="trainer-profile-editor-actions" style="margin-top:-4px;margin-bottom:12px;">
            <button type="button" class="trainer-profile-editor-btn" data-builder-node-remove="${index}">Remove node</button>
          </div>
        `).join('') : '<div class="trainer-profile-muted">No automation nodes yet.</div>'}
        <div class="trainer-profile-editor-actions">
          <button type="button" class="trainer-profile-editor-btn" id="trainer-page-add-node">Add automation node</button>
        </div>
      </section>
    `;
  }

  function renderBuilderModeChooser(page) {
    const mode = String(page?.mode || activeBuilderDraftContent(page)?.mode || '').trim().toLowerCase();
    const options = [
      ['template', 'Template', 'Use a guided trainer page template.'],
      ['drag_drop', 'Drag-and-drop', 'Build sections block by block.'],
      ['custom_code', 'Custom code/embed', 'Control the page with sandboxed HTML, CSS, JS, and embeds.']
    ];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Page mode</div>
        <h2 class="trainer-profile-section-title">Choose how this page is built</h2>
        <div class="trainer-profile-editor-pill-grid">
          ${options.map(([value, label, copy]) => `
            <button type="button" class="trainer-profile-editor-pill${mode === value ? ' is-active' : ''}" data-builder-mode="${value}">
              <span style="display:block;font-weight:900;">${escapeHtml(label)}</span>
              <span style="display:block;font-size:0.78rem;line-height:1.45;margin-top:4px;">${escapeHtml(copy)}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderBuilderMetaEditor(page) {
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Page settings</div>
        <h2 class="trainer-profile-section-title">Identity and routing</h2>
        <form id="trainer-page-meta-form" class="trainer-profile-editor-grid two">
          <label class="trainer-profile-editor-field">
            <span>Page name</span>
            <input id="trainer-page-name" type="text" value="${escapeHtml(String(page?.pageName || '').trim())}" placeholder="Home">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Navigation label</span>
            <input id="trainer-page-nav-label" type="text" value="${escapeHtml(String(page?.navLabel || '').trim())}" placeholder="Home">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Coach slug</span>
            <input id="trainer-page-site-slug" type="text" value="${escapeHtml(String(page?.siteSlug || '').trim())}" placeholder="coach-name">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Page slug</span>
            <input id="trainer-page-slug" type="text" value="${escapeHtml(String(page?.pageSlug || '').trim())}" placeholder="leave blank for home page">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Home page</span>
            <select id="trainer-page-is-home">
              <option value="false"${page?.isHome ? '' : ' selected'}>No</option>
              <option value="true"${page?.isHome ? ' selected' : ''}>Yes</option>
            </select>
          </label>
          <div class="trainer-profile-editor-field">
            <span>Public URL</span>
            <div class="trainer-profile-note">${escapeHtml(builderPagePath(page))}</div>
          </div>
        </form>
      </section>
    `;
  }

  function renderBuilderTemplateEditor(page) {
    const draft = activeBuilderDraftContent(page);
    const theme = builderTheme(page);
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Template editor</div>
        <h2 class="trainer-profile-section-title">Template content</h2>
        <form id="trainer-page-template-form" class="trainer-profile-editor-grid two">
          <label class="trainer-profile-editor-field">
            <span>Template</span>
            <select id="trainer-page-template-key">
              ${BUILDER_TEMPLATE_OPTIONS.map(([value, label]) => `<option value="${value}"${String(draft?.templateKey || '').trim() === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
          </label>
          <label class="trainer-profile-editor-field">
            <span>CTA label</span>
            <input id="trainer-page-template-cta" type="text" value="${escapeHtml(String(theme?.ctaLabel || '').trim())}" placeholder="Book a consult">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Headline</span>
            <input id="trainer-page-template-headline" type="text" value="${escapeHtml(String(theme?.headline || '').trim())}" placeholder="Coach page headline">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Subheadline</span>
            <input id="trainer-page-template-subheadline" type="text" value="${escapeHtml(String(theme?.subheadline || '').trim())}" placeholder="Supporting line">
          </label>
          <label class="trainer-profile-editor-field" style="grid-column:1 / -1;">
            <span>Body</span>
            <textarea id="trainer-page-template-body" placeholder="Longer supporting copy">${escapeHtml(String(theme?.body || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>Accent color</span>
            <input id="trainer-page-template-accent" type="text" value="${escapeHtml(String(theme?.accentColor || '').trim())}" placeholder="#1d9bf0">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Background color</span>
            <input id="trainer-page-template-bg" type="text" value="${escapeHtml(String(theme?.backgroundColor || '').trim())}" placeholder="#ffffff">
          </label>
          <label class="trainer-profile-editor-field">
            <span>Text color</span>
            <input id="trainer-page-template-text" type="text" value="${escapeHtml(String(theme?.textColor || '').trim())}" placeholder="#111827">
          </label>
        </form>
      </section>
    `;
  }

  function renderBuilderBlocksEditor(page) {
    const blocks = Array.isArray(activeBuilderDraftContent(page)?.blocks) ? activeBuilderDraftContent(page).blocks : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Blocks</div>
        <h2 class="trainer-profile-section-title">Drag-and-drop content</h2>
        <div class="trainer-profile-editor-actions" style="justify-content:flex-start;margin-bottom:16px;">
          <select id="trainer-page-block-type" class="trainer-profile-edit-action" style="width:auto;padding:0 14px;font-size:0.82rem;">
            ${BUILDER_BLOCK_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}
          </select>
          <button type="button" class="trainer-profile-editor-btn" id="trainer-page-add-block">Add block</button>
        </div>
        ${blocks.length ? blocks.map((block, index) => `
          <div class="trainer-profile-editor-block" style="margin-bottom:16px;">
            <div class="trainer-profile-editor-actions" style="justify-content:space-between;margin-bottom:12px;">
              <div class="trainer-profile-note">${escapeHtml(String(block?.type || '').trim() || 'block')}</div>
              <div class="trainer-profile-editor-actions">
                <button type="button" class="trainer-profile-editor-btn" data-builder-block-move="${index}:-1">Move earlier</button>
                <button type="button" class="trainer-profile-editor-btn" data-builder-block-move="${index}:1">Move later</button>
                <button type="button" class="trainer-profile-editor-btn" data-builder-block-remove="${index}">Remove block</button>
              </div>
            </div>
            <div class="trainer-profile-editor-grid three">
              <label class="trainer-profile-editor-field">
                <span>Label</span>
                <input type="text" data-builder-block-field="label" data-builder-block-index="${index}" value="${escapeHtml(String(block?.label || '').trim())}" placeholder="Block label">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Kicker</span>
                <input type="text" data-builder-block-field="kicker" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.kicker || '').trim())}" placeholder="Kicker">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Headline</span>
                <input type="text" data-builder-block-field="headline" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.headline || '').trim())}" placeholder="Headline">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Body</span>
                <input type="text" data-builder-block-field="body" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.body || block?.content?.text || '').trim())}" placeholder="Body">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Media / URL</span>
                <input type="text" data-builder-block-field="mediaUrl" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.mediaUrl || block?.content?.src || block?.content?.videoUrl || '').trim())}" placeholder="Image, video, or embed URL">
              </label>
              <label class="trainer-profile-editor-field">
                <span>CTA label</span>
                <input type="text" data-builder-block-field="ctaLabel" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.ctaLabel || '').trim())}" placeholder="Call to action">
              </label>
              <label class="trainer-profile-editor-field">
                <span>CTA URL</span>
                <input type="text" data-builder-block-field="ctaHref" data-builder-block-index="${index}" value="${escapeHtml(String(block?.content?.ctaHref || '').trim())}" placeholder="/coach/slug/page or https://">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Items / list</span>
                <textarea data-builder-block-field="itemsText" data-builder-block-index="${index}" placeholder="One item per line">${escapeHtml((Array.isArray(block?.content?.items) ? block.content.items : []).join('\n') || String(block?.content?.itemsText || '').trim())}</textarea>
              </label>
              <label class="trainer-profile-editor-field">
                <span>Embed HTML</span>
                <textarea data-builder-block-field="embedHtml" data-builder-block-index="${index}" placeholder="<iframe ...>">${escapeHtml(String(block?.content?.embedHtml || '').trim())}</textarea>
              </label>
            </div>
            <div class="trainer-profile-editor-grid three" style="margin-top:12px;">
              <label class="trainer-profile-editor-field">
                <span>Background</span>
                <input type="text" data-builder-block-style="backgroundColor" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.backgroundColor || '').trim())}" placeholder="#ffffff">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Text color</span>
                <input type="text" data-builder-block-style="textColor" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.textColor || '').trim())}" placeholder="#111827">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Border color</span>
                <input type="text" data-builder-block-style="borderColor" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.borderColor || '').trim())}" placeholder="#d0d5dd">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Padding</span>
                <input type="text" data-builder-block-style="padding" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.padding || '').trim())}" placeholder="24px">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Border radius</span>
                <input type="text" data-builder-block-style="borderRadius" data-builder-block-index="${index}" value="${escapeHtml(String(block?.style?.borderRadius || '').trim())}" placeholder="24px">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Align</span>
                <select data-builder-block-style="textAlign" data-builder-block-index="${index}">
                  ${['left', 'center', 'right'].map((value) => `<option value="${value}"${String(block?.style?.textAlign || '').trim() === value ? ' selected' : ''}>${value}</option>`).join('')}
                </select>
              </label>
              <label class="trainer-profile-editor-field">
                <span>Columns</span>
                <select data-builder-block-layout="columns" data-builder-block-index="${index}">
                  ${[1, 2, 3, 4].map((value) => `<option value="${value}"${Number(block?.layout?.columns || 1) === value ? ' selected' : ''}>${value}</option>`).join('')}
                </select>
              </label>
              <label class="trainer-profile-editor-field">
                <span>Gap</span>
                <input type="text" data-builder-block-layout="gap" data-builder-block-index="${index}" value="${escapeHtml(String(block?.layout?.gap || '').trim())}" placeholder="16px">
              </label>
              <label class="trainer-profile-editor-field">
                <span>Mobile layout</span>
                <select data-builder-block-mobile="stack" data-builder-block-index="${index}">
                  <option value="true"${String(block?.mobile?.stack ?? 'true') === 'true' ? ' selected' : ''}>Stack</option>
                  <option value="false"${String(block?.mobile?.stack ?? 'true') === 'false' ? ' selected' : ''}>Keep columns</option>
                </select>
              </label>
            </div>
          </div>
        `).join('') : '<div class="trainer-profile-muted">No blocks yet.</div>'}
      </section>
    `;
  }

  function renderBuilderCustomCodeEditor(page) {
    const code = activeBuilderDraftContent(page)?.customCode || {};
    const iframeValue = (Array.isArray(code?.iframes) ? code.iframes : [])
      .map((entry) => (typeof entry === 'string'
        ? String(entry || '').trim()
        : String(entry?.html || entry?.src || entry?.url || '').trim()))
      .filter(Boolean)
      .join('\n');
    const embedScriptValue = (Array.isArray(code?.embedScripts) ? code.embedScripts : [])
      .map((entry) => (typeof entry === 'string'
        ? String(entry || '').trim()
        : String(entry?.html || entry?.src || entry?.url || '').trim()))
      .filter(Boolean)
      .join('\n');
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Custom code</div>
        <h2 class="trainer-profile-section-title">Sandboxed page code</h2>
        <form id="trainer-page-code-form" class="trainer-profile-editor-grid">
          <label class="trainer-profile-editor-field">
            <span>HTML / embeds</span>
            <textarea id="trainer-page-code-html" placeholder="<section>...</section>">${escapeHtml(String(code?.html || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>CSS</span>
            <textarea id="trainer-page-code-css" placeholder="body { ... }">${escapeHtml(String(code?.css || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>JavaScript</span>
            <textarea id="trainer-page-code-js" placeholder="console.log('ready')">${escapeHtml(String(code?.javascript || '').trim())}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>Iframes</span>
            <textarea id="trainer-page-code-iframes" placeholder="https://example.com/embed or full &lt;iframe&gt; markup, one per line">${escapeHtml(iframeValue)}</textarea>
          </label>
          <label class="trainer-profile-editor-field">
            <span>Embed scripts</span>
            <textarea id="trainer-page-code-embeds" placeholder="https://example.com/widget.js or full &lt;script&gt; markup, one per line">${escapeHtml(embedScriptValue)}</textarea>
          </label>
        </form>
      </section>
    `;
  }

  function renderBuilderVersionHistory() {
    const versions = Array.isArray(editorState.versions) ? editorState.versions : [];
    return `
      <section class="trainer-profile-card">
        <div class="trainer-profile-section-kicker">Versions</div>
        <h2 class="trainer-profile-section-title">Draft and publish history</h2>
        <div class="trainer-profile-muted" style="margin-bottom:12px;">Manual saves, autosaves, publishes, and restores are stored here for this page.</div>
        ${editorState.versionLoading ? '<div class="trainer-profile-muted">Loading versions...</div>' : ''}
        ${!editorState.versionLoading && versions.length ? `
          <div class="account-trainer-list account-trainer-list-compact" data-page-version-list="1">
            ${versions.map((version) => `
              <div class="account-trainer-list-item">
                <strong>${escapeHtml(String(version?.versionKind || 'manual_save').replaceAll('_', ' '))}</strong>
                <div class="account-trainer-muted">${escapeHtml(formatShortDate(version?.createdAt) || 'Recently')}</div>
                <button type="button" class="trainer-profile-editor-btn" data-builder-version-restore="${escapeHtml(String(version?.id || '').trim())}">Restore</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${!editorState.versionLoading && !versions.length ? '<div class="trainer-profile-muted">No saved versions yet.</div>' : ''}
      </section>
    `;
  }

  function renderBuilderEditorShell(page) {
    const mode = String(page?.mode || activeBuilderDraftContent(page)?.mode || '').trim().toLowerCase();
    return `
      ${renderBuilderNavigation(page)}
      ${renderBuilderMetaEditor(page)}
      ${renderBuilderModeChooser(page)}
      ${mode === 'template' ? renderBuilderTemplateEditor(page) : ''}
      ${mode === 'drag_drop' ? renderBuilderBlocksEditor(page) : ''}
      ${mode === 'custom_code' ? renderBuilderCustomCodeEditor(page) : ''}
      ${renderBuilderFormEditor(page)}
      ${renderBuilderAutomationEditor(page)}
      ${renderBuilderVersionHistory()}
    `;
  }

  function renderBuilderPublicShell(page, trainer, { publicView = false } = {}) {
    const title = String(page?.pageName || trainer?.fullName || trainer?.displayName || 'Coach page').trim() || 'Coach page';
    const subtitle = String(page?.seo?.description || trainer?.brandPositioning || '').trim();
    const forms = Array.isArray(activeBuilderDraftContent(page, { publicView })?.forms) ? activeBuilderDraftContent(page, { publicView }).forms : [];
    return `
      ${renderBuilderNavigation(page, { publicView })}
      <section class="trainer-profile-hero trainer-profile-sales-hero">
        <article class="trainer-profile-card trainer-profile-hero-card trainer-profile-offer-card">
          <div class="trainer-profile-kicker">${escapeHtml(String(trainer?.fullName || trainer?.displayName || 'Coach').trim() || 'Coach')}</div>
          <h1 class="trainer-profile-offer-title">${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="trainer-profile-offer-sub">${escapeHtml(subtitle)}</p>` : ''}
          <div class="trainer-profile-microcopy">${escapeHtml(builderPagePath(page))}</div>
        </article>
      </section>
      <section class="trainer-profile-main-column">
        ${renderActiveBuilderPage(page, { publicView })}
        ${forms.map((form) => renderPublicLeadForm(form, page)).join('')}
      </section>
    `;
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
    const pageSelect = $('#trainer-page-select');
    if (pageSelect) {
      pageSelect.onchange = () => {
        const nextId = String(pageSelect.value || '').trim();
      const nextPage = pageState.trainerPages.find((page) => String(page.id || '').trim() === nextId) || null;
      if (!nextPage) return;
      pageState.currentTrainerPage = cloneJson(nextPage);
      editorState.original = cloneJson(nextPage);
      editorState.draft = cloneJson(nextPage);
      editorState.dirty = false;
      void loadCurrentBuilderVersions(nextPage.id);
      renderCurrentProfile();
    };
  }
    const newPageBtn = $('#trainer-page-new');
    if (newPageBtn) {
      newPageBtn.onclick = () => {
        const count = Array.isArray(pageState.trainerPages) ? pageState.trainerPages.length : 0;
        if (count >= 5) {
          window.alert('You already have 5 trainer pages.');
          return;
        }
        openBuilderEditor(createBlankTrainerPage(pageState.trainer, {
          pageName: `Page ${count + 1}`,
          navLabel: `Page ${count + 1}`,
          navOrder: count,
          pageSlug: count === 0 ? '' : `page-${count + 1}`,
          isHome: count === 0
        }));
      };
    }
    const moveUpBtn = $('#trainer-page-move-up');
    if (moveUpBtn) moveUpBtn.onclick = () => moveCurrentBuilderPage(-1);
    const moveDownBtn = $('#trainer-page-move-down');
    if (moveDownBtn) moveDownBtn.onclick = () => moveCurrentBuilderPage(1);
    const undoBtn = $('#trainer-page-undo');
    if (undoBtn) undoBtn.onclick = () => stepBuilderHistory('undo');
    const redoBtn = $('#trainer-page-redo');
    if (redoBtn) redoBtn.onclick = () => stepBuilderHistory('redo');
    const previewBtn = $('#trainer-page-preview');
    if (previewBtn) {
      previewBtn.onclick = () => {
        editorState.previewMode = !editorState.previewMode;
        renderCurrentProfile();
      };
    }
    document.querySelectorAll('[data-trainer-preview-device]').forEach((button) => {
      button.onclick = () => {
        editorState.previewDevice = String(button.getAttribute('data-trainer-preview-device') || 'desktop').trim();
        renderCurrentProfile();
      };
    });
    const publishBtn = $('#trainer-page-publish');
    if (publishBtn) publishBtn.onclick = () => { void publishCurrentBuilderPage(); };
    const unpublishBtn = $('#trainer-page-unpublish');
    if (unpublishBtn) unpublishBtn.onclick = () => { void unpublishCurrentBuilderPage(); };
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
        if (!pageState.currentTrainerPage && (Array.isArray(pageState.trainerPages) && pageState.trainerPages.length)) {
          pageState.currentTrainerPage = cloneJson(pageState.trainerPages[0]);
        }
        if (pageState.currentTrainerPage || !pageState.view) {
          if (editorState.enabled) {
            void persistBuilderPage({ autosave: false, exitEdit: true });
            return;
          }
          openBuilderEditor(pageState.currentTrainerPage || createBlankTrainerPage(pageState.trainer));
          return;
        }
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
        if (pageState.currentTrainerPage || editorState.openSection === 'builder') {
          void persistBuilderPage({ autosave: false, exitEdit: false });
          return;
        }
        savePageEdits();
      };
    }
    const builderMetaForm = $('#trainer-page-meta-form');
    if (builderMetaForm) {
      builderMetaForm.oninput = () => {
        updateBuilderDraft((draft) => {
          draft.pageName = String($('#trainer-page-name')?.value || draft.pageName || 'Home').trim() || 'Home';
          draft.navLabel = String($('#trainer-page-nav-label')?.value || draft.navLabel || draft.pageName || 'Home').trim() || draft.pageName || 'Home';
          draft.siteSlug = sanitizeHandle($('#trainer-page-site-slug')?.value || draft.siteSlug || pageState.trainer?.publicHandle || pageState.trainer?.username || '');
          draft.pageSlug = slugify($('#trainer-page-slug')?.value || '');
          draft.isHome = Boolean($('#trainer-page-is-home')?.checked) || !draft.pageSlug;
        });
      };
    }
    const modeButtons = document.querySelectorAll('[data-builder-mode]');
    modeButtons.forEach((button) => {
      button.onclick = () => {
        const mode = String(button.getAttribute('data-builder-mode') || '').trim();
        updateBuilderDraft((draft) => {
          const previousMode = String(draft.mode || draft.draftContent?.mode || '').trim().toLowerCase();
          const shouldSeedStarter = !previousMode || isBuilderPageEmpty(draft);
          if (shouldSeedStarter) {
            applyStarterContentForMode(draft, pageState.trainer, mode);
            return;
          }
          draft.mode = mode;
          draft.draftContent = draft.draftContent || {};
          draft.draftContent.mode = mode;
          if (mode === 'drag_drop' && !Array.isArray(draft.draftContent.blocks)) draft.draftContent.blocks = [];
          if (mode === 'custom_code' && !draft.draftContent.customCode) {
            draft.draftContent.customCode = { html: '', css: '', javascript: '', iframes: [], embedScripts: [] };
          }
        });
      };
    });
    const templateForm = $('#trainer-page-template-form');
    if (templateForm) {
      templateForm.oninput = () => {
        updateBuilderDraft((draft) => {
          draft.mode = 'template';
          draft.draftContent.mode = 'template';
          draft.draftContent.templateKey = String($('#trainer-page-template-key')?.value || 'general_trainer').trim();
          draft.draftContent.theme = draft.draftContent.theme || {};
          draft.draftContent.theme.headline = String($('#trainer-page-template-headline')?.value || '').trim();
          draft.draftContent.theme.subheadline = String($('#trainer-page-template-subheadline')?.value || '').trim();
          draft.draftContent.theme.body = String($('#trainer-page-template-body')?.value || '').trim();
          draft.draftContent.theme.ctaLabel = String($('#trainer-page-template-cta')?.value || '').trim();
          draft.draftContent.theme.accentColor = String($('#trainer-page-template-accent')?.value || '').trim();
          draft.draftContent.theme.backgroundColor = String($('#trainer-page-template-bg')?.value || '').trim();
          draft.draftContent.theme.textColor = String($('#trainer-page-template-text')?.value || '').trim();
        });
      };
    }
    const addBlockBtn = $('#trainer-page-add-block');
    if (addBlockBtn) {
      addBlockBtn.onclick = () => {
        const blockType = String($('#trainer-page-block-type')?.value || 'text').trim();
        updateBuilderDraft((draft) => {
          draft.mode = 'drag_drop';
          draft.draftContent.mode = 'drag_drop';
          draft.draftContent.blocks = Array.isArray(draft.draftContent.blocks) ? draft.draftContent.blocks : [];
          draft.draftContent.blocks.push({
            id: `block-${Date.now()}`,
            type: blockType,
            label: blockType.replace(/_/g, ' '),
            content: {
              kicker: '',
              headline: 'New block headline',
              body: 'Block copy',
              text: 'Block copy',
              mediaUrl: '',
              ctaLabel: '',
              ctaHref: '',
              items: [],
              itemsText: '',
              embedHtml: ''
            },
            style: {
              backgroundColor: '',
              textColor: '',
              borderColor: '',
              padding: '',
              borderRadius: '',
              textAlign: 'left'
            },
            layout: {
              columns: blockType === 'columns' ? 2 : 1,
              gap: '16px'
            },
            mobile: {
              stack: true
            }
          });
        });
      };
    }
    document.querySelectorAll('[data-builder-block-field]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-block-index'));
        const field = String(input.getAttribute('data-builder-block-field') || '').trim();
        if (!Number.isInteger(index) || !field) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          const block = blocks[index];
          if (!block) return;
          if (field === 'label') {
            block.label = String(input.value || '').trim();
            return;
          }
          block.content = block.content || {};
          if (field === 'itemsText') {
            block.content.itemsText = String(input.value || '').trim();
            block.content.items = String(input.value || '').split('\n').map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12);
            return;
          }
          if (field === 'mediaUrl') {
            block.content.mediaUrl = String(input.value || '').trim();
            if (block.type === 'image') block.content.src = block.content.mediaUrl;
            if (block.type === 'video_vsl' || block.type === 'vsl_form') block.content.videoUrl = block.content.mediaUrl;
            return;
          }
          block.content[field] = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-block-style]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-block-index'));
        const field = String(input.getAttribute('data-builder-block-style') || '').trim();
        if (!Number.isInteger(index) || !field) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          const block = blocks[index];
          if (!block) return;
          block.style = block.style || {};
          block.style[field] = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-block-layout]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-block-index'));
        const field = String(input.getAttribute('data-builder-block-layout') || '').trim();
        if (!Number.isInteger(index) || !field) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          const block = blocks[index];
          if (!block) return;
          block.layout = block.layout || {};
          block.layout[field] = field === 'columns'
            ? Math.max(1, Math.min(4, Number(input.value) || 1))
            : String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-block-mobile]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-block-index'));
        const field = String(input.getAttribute('data-builder-block-mobile') || '').trim();
        if (!Number.isInteger(index) || !field) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          const block = blocks[index];
          if (!block) return;
          block.mobile = block.mobile || {};
          block.mobile[field] = String(input.value || '').trim() === 'true';
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-block-move]').forEach((button) => {
      button.onclick = () => {
        const [indexRaw, offsetRaw] = String(button.getAttribute('data-builder-block-move') || '').split(':');
        const index = Number(indexRaw);
        const offset = Number(offsetRaw);
        if (!Number.isInteger(index) || !Number.isInteger(offset)) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks.slice() : [];
          if (index < 0 || index >= blocks.length) return;
          const targetIndex = Math.max(0, Math.min(blocks.length - 1, index + offset));
          if (targetIndex === index) return;
          const [moved] = blocks.splice(index, 1);
          blocks.splice(targetIndex, 0, moved);
          draft.draftContent.blocks = blocks;
        });
      };
    });
    document.querySelectorAll('[data-builder-block-remove]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.getAttribute('data-builder-block-remove'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const blocks = Array.isArray(draft.draftContent?.blocks) ? draft.draftContent.blocks : [];
          draft.draftContent.blocks = blocks.filter((_, blockIndex) => blockIndex !== index);
        });
      };
    });
    const customCodeForm = $('#trainer-page-code-form');
    if (customCodeForm) {
      customCodeForm.oninput = () => {
        updateBuilderDraft((draft) => {
          const parseCustomCodeEntries = (raw, tagName) => String(raw || '')
            .split(/\r?\n/)
            .map((line) => String(line || '').trim())
            .filter(Boolean)
            .map((line) => {
              if (line.startsWith(`<${tagName}`)) return { html: line };
              return { src: line };
            });
          draft.mode = 'custom_code';
          draft.draftContent.mode = 'custom_code';
          draft.draftContent.customCode = draft.draftContent.customCode || {};
          draft.draftContent.customCode.html = String($('#trainer-page-code-html')?.value || '').trim();
          draft.draftContent.customCode.css = String($('#trainer-page-code-css')?.value || '').trim();
          draft.draftContent.customCode.javascript = String($('#trainer-page-code-js')?.value || '').trim();
          draft.draftContent.customCode.iframes = parseCustomCodeEntries($('#trainer-page-code-iframes')?.value || '', 'iframe');
          draft.draftContent.customCode.embedScripts = parseCustomCodeEntries($('#trainer-page-code-embeds')?.value || '', 'script');
        });
      };
    }
    const addFormBtn = $('#trainer-page-add-form');
    if (addFormBtn) {
      addFormBtn.onclick = () => {
        updateBuilderDraft((draft) => {
          draft.draftContent = draft.draftContent || {};
          draft.draftContent.forms = Array.isArray(draft.draftContent.forms) ? draft.draftContent.forms : [];
          draft.draftContent.forms.push({
            id: `form-${Date.now()}`,
            name: `Form ${draft.draftContent.forms.length + 1}`,
            submitLabel: 'Submit',
            successMode: 'message',
            successTarget: '',
            fields: [
              { id: 'name', name: 'name', label: 'Name', type: 'text', required: true, options: [] },
              { id: 'email', name: 'email', label: 'Email', type: 'email', required: true, options: [] }
            ]
          });
        });
      };
    }
    document.querySelectorAll('[data-builder-form-name]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-form-name'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const form = forms[index];
          if (!form) return;
          form.name = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-form-submit]').forEach((input) => {
      const sync = () => {
        const index = Number(input.getAttribute('data-builder-form-submit'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const form = forms[index];
          if (!form) return;
          form.submitLabel = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-form-remove]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.getAttribute('data-builder-form-remove'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          draft.draftContent.forms = forms.filter((_, formIndex) => formIndex !== index);
        });
      };
    });
    document.querySelectorAll('[data-builder-form-add-field]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.getAttribute('data-builder-form-add-field'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const form = forms[index];
          if (!form) return;
          form.fields = Array.isArray(form.fields) ? form.fields : [];
          form.fields.push({
            id: `field-${Date.now()}`,
            name: `field_${form.fields.length + 1}`,
            label: 'New question',
            type: 'text',
            required: false,
            options: []
          });
        });
      };
    });
    document.querySelectorAll('[data-builder-form-field-label], [data-builder-form-field-name], [data-builder-form-field-type], [data-builder-form-field-placeholder], [data-builder-form-field-options], [data-builder-form-field-accept], [data-builder-form-field-required], [data-builder-form-field-multiple]').forEach((input) => {
      const attr = Array.from(input.attributes).find((attribute) => attribute.name.startsWith('data-builder-form-field-'));
      if (!attr) return;
      const fieldKey = attr.name.replace('data-builder-form-field-', '');
      const sync = () => {
        const [formIndexRaw, fieldIndexRaw] = String(input.getAttribute(attr.name) || '').split(':');
        const formIndex = Number(formIndexRaw);
        const fieldIndex = Number(fieldIndexRaw);
        if (!Number.isInteger(formIndex) || !Number.isInteger(fieldIndex)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const field = forms[formIndex]?.fields?.[fieldIndex];
          if (!field) return;
          if (fieldKey === 'label') field.label = String(input.value || '').trim();
          if (fieldKey === 'name') field.name = String(input.value || '').trim();
          if (fieldKey === 'type') field.type = String(input.value || '').trim();
          if (fieldKey === 'placeholder') field.placeholder = String(input.value || '').trim();
          if (fieldKey === 'options') field.options = uniqueList(String(input.value || '').trim(), 20);
          if (fieldKey === 'accept') field.accept = uniqueList(String(input.value || '').trim(), 10);
          if (fieldKey === 'required') field.required = String(input.value || '').trim() === 'true';
          if (fieldKey === 'multiple') {
            field.meta = field.meta && typeof field.meta === 'object' ? field.meta : {};
            field.meta.multiple = String(input.value || '').trim() === 'true';
          }
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-form-field-remove]').forEach((button) => {
      button.onclick = () => {
        const [formIndexRaw, fieldIndexRaw] = String(button.getAttribute('data-builder-form-field-remove') || '').split(':');
        const formIndex = Number(formIndexRaw);
        const fieldIndex = Number(fieldIndexRaw);
        if (!Number.isInteger(formIndex) || !Number.isInteger(fieldIndex)) return;
        updateBuilderDraft((draft) => {
          const forms = Array.isArray(draft.draftContent?.forms) ? draft.draftContent.forms : [];
          const form = forms[formIndex];
          if (!form) return;
          form.fields = (Array.isArray(form.fields) ? form.fields : []).filter((_, index) => index !== fieldIndex);
        });
      };
    });
    const addNodeBtn = $('#trainer-page-add-node');
    if (addNodeBtn) {
      addNodeBtn.onclick = () => {
        updateBuilderDraft((draft) => {
          draft.draftContent = draft.draftContent || {};
          draft.draftContent.automations = draft.draftContent.automations || { nodes: [], edges: [] };
          draft.draftContent.automations.nodes = Array.isArray(draft.draftContent.automations.nodes) ? draft.draftContent.automations.nodes : [];
          draft.draftContent.automations.nodes.push({
            id: `node-${Date.now()}`,
            type: 'form_submitted',
            config: { label: 'Form submitted', target: '' },
            position: {}
          });
        });
      };
    }
    document.querySelectorAll('[data-builder-node-type], [data-builder-node-label], [data-builder-node-target]').forEach((input) => {
      const attr = Array.from(input.attributes).find((attribute) => attribute.name.startsWith('data-builder-node-'));
      if (!attr) return;
      const fieldKey = attr.name.replace('data-builder-node-', '');
      const sync = () => {
        const index = Number(input.getAttribute(attr.name));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const nodes = Array.isArray(draft.draftContent?.automations?.nodes) ? draft.draftContent.automations.nodes : [];
          const node = nodes[index];
          if (!node) return;
          node.config = node.config || {};
          if (fieldKey === 'type') node.type = String(input.value || '').trim();
          if (fieldKey === 'label') node.config.label = String(input.value || '').trim();
          if (fieldKey === 'target') node.config.target = String(input.value || '').trim();
        });
      };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
    });
    document.querySelectorAll('[data-builder-node-remove]').forEach((button) => {
      button.onclick = () => {
        const index = Number(button.getAttribute('data-builder-node-remove'));
        if (!Number.isInteger(index)) return;
        updateBuilderDraft((draft) => {
          const nodes = Array.isArray(draft.draftContent?.automations?.nodes) ? draft.draftContent.automations.nodes : [];
          draft.draftContent.automations.nodes = nodes.filter((_, nodeIndex) => nodeIndex !== index);
        });
      };
    });
    document.querySelectorAll('[data-builder-draft-link]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (!canEditTrainerPage(pageState.trainer, pageState.view)) return;
        event.preventDefault();
        const href = String(link.getAttribute('href') || '').trim();
        const match = href.match(/^\/coach\/([^/]+)(?:\/([^/]+))?$/i);
        const pageSlug = String(match?.[2] || '').trim();
        const nextPage = (Array.isArray(pageState.trainerPages) ? pageState.trainerPages : []).find((page) => String(page.pageSlug || '').trim() === pageSlug) || null;
        if (!nextPage) return;
        pageState.currentTrainerPage = cloneJson(nextPage);
        editorState.original = cloneJson(nextPage);
        editorState.draft = cloneJson(nextPage);
        void loadCurrentBuilderVersions(nextPage.id);
        renderCurrentProfile();
      });
    });
    document.querySelectorAll('[data-builder-version-restore]').forEach((button) => {
      button.onclick = () => {
        const versionId = String(button.getAttribute('data-builder-version-restore') || '').trim();
        if (!versionId) return;
        void restoreBuilderVersion(versionId);
      };
    });
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
    bindPublicLeadForms();
    bindPublicPageAutomation();
    syncBuilderToolbarState();
  }

  function renderPageEditToolbar(trainer, view) {
    const statusEl = $('#trainer-profile-status');
    if (!statusEl) return;
    document.body.classList.toggle('trainer-profile-editing', Boolean(editorState.enabled));
    if (!canEditTrainerPage(trainer, view)) {
      statusEl.innerHTML = '';
      return;
    }
    const currentPage = pageState.currentTrainerPage || null;
    const pageOptions = Array.isArray(pageState.trainerPages) ? pageState.trainerPages : [];
    if (!editorState.enabled) {
      statusEl.innerHTML = `
        <div class="trainer-profile-edit-toolbar">
          ${pageOptions.length ? `
            <select id="trainer-page-select" class="trainer-profile-edit-action">
              ${pageOptions.map((page) => `<option value="${escapeHtml(page.id || '')}"${currentPage?.id === page.id ? ' selected' : ''}>${escapeHtml(page.pageName || 'Page')}</option>`).join('')}
            </select>
          ` : ''}
          <button type="button" class="trainer-profile-edit-action" id="trainer-page-new">New page</button>
          <button type="button" class="trainer-profile-edit-toggle" id="trainer-profile-edit-toggle">Edit page</button>
        </div>
      `;
      return;
    }
    statusEl.innerHTML = `
      <div class="trainer-profile-edit-toolbar is-active">
        ${pageOptions.length ? `
          <select id="trainer-page-select" class="trainer-profile-edit-action">
            ${pageOptions.map((page) => `<option value="${escapeHtml(page.id || '')}"${currentPage?.id === page.id ? ' selected' : ''}>${escapeHtml(page.pageName || 'Page')}</option>`).join('')}
          </select>
        ` : ''}
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-new">New page</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-move-up">Move earlier</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-move-down">Move later</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-undo">Undo</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-redo">Redo</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-page-preview">${editorState.previewMode ? 'Hide preview' : 'Preview'}</button>
        <button type="button" class="trainer-profile-edit-action" data-trainer-preview-device="desktop">Desktop</button>
        <button type="button" class="trainer-profile-edit-action" data-trainer-preview-device="mobile">Mobile</button>
        <button type="button" class="trainer-profile-edit-action" id="trainer-profile-edit-save">Save</button>
        <button type="button" class="trainer-profile-edit-action confirm" id="trainer-page-publish">Publish</button>
        ${currentPage?.isPublished ? '<button type="button" class="trainer-profile-edit-action danger" id="trainer-page-unpublish">Unpublish</button>' : ''}
        <span class="trainer-profile-edit-note${editorState.dirty ? ' is-dirty' : ''}" id="trainer-profile-builder-note">${editorState.dirty ? 'Unsaved changes' : 'Editing page'}</span>
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

/* builderBlockCardStyle */
function builderBlockCardStyle(block) {
    const style = block?.style && typeof block.style === 'object' ? block.style : {};
    const parts = [];
    const backgroundColor = safeStyleToken(style.backgroundColor);
    const textColor = safeStyleToken(style.textColor);
    const borderColor = safeStyleToken(style.borderColor);
    const borderRadius = safeStyleToken(style.borderRadius);
    const padding = safeStyleToken(style.padding);
    const textAlign = safeStyleToken(style.textAlign);
    if (backgroundColor) parts.push(`background:${backgroundColor}`);
    if (textColor) parts.push(`color:${textColor}`);
    if (borderColor) parts.push(`border:1px solid ${borderColor}`);
    if (borderRadius) parts.push(`border-radius:${borderRadius}`);
    if (padding) parts.push(`padding:${padding}`);
    if (textAlign) parts.push(`text-align:${textAlign}`);
    return parts.join(';');
  }

/* builderBlockColumnsStyle */
function builderBlockColumnsStyle(block) {
    const layout = block?.layout && typeof block.layout === 'object' ? block.layout : {};
    const columns = Math.max(1, Math.min(4, Number(layout.columns) || 1));
    const gap = safeStyleToken(layout.gap || '16px', '16px');
    return `display:grid;grid-template-columns:repeat(${columns}, minmax(0, 1fr));gap:${gap};`;
  }

/* builderBlockItems */
function builderBlockItems(content) {
    if (Array.isArray(content?.items) && content.items.length) {
      return content.items.map((item) => String(item || '').trim()).filter(Boolean);
    }
    return String(content?.itemsText || '')
      .split(/\n|,/)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }

/* renderBuilderBlock */
function renderBuilderBlock(block) {
    const safe = block && typeof block === 'object' ? block : {};
    const type = String(safe.type || '').trim().toLowerCase();
    const content = safe.content && typeof safe.content === 'object' ? safe.content : {};
    const cardStyle = builderBlockCardStyle(safe);
    const items = builderBlockItems(content);
    const mediaUrl = String(content.mediaUrl || content.src || content.videoUrl || '').trim();
    const ctaLabel = String(content.ctaLabel || '').trim();
    const ctaHref = String(content.ctaHref || '').trim();
    const ctaClass = type === 'hero' ? 'trainer-profile-editor-btn primary' : 'trainer-profile-editor-btn';
    const ctaAttrs = ctaLabel
      ? `class="${ctaClass}" href="${escapeHtml(ctaHref || '#')}" data-public-builder-cta="1" data-public-builder-cta-target="${escapeHtml(ctaHref || '#')}"`
      : '';
    const title = String(content.headline || content.title || safe.label || type || 'Block').trim() || 'Block';
    const kicker = String(content.kicker || '').trim();
    const body = String(content.body || content.text || content.description || '').trim();
    if (type === 'hero') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-hero" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Hero')}</div>
          <h2 class="trainer-profile-section-title">${escapeHtml(title || 'Hero headline')}</h2>
          <p class="trainer-profile-body">${escapeHtml(body || 'Supporting copy')}</p>
          ${ctaLabel ? `<div class="trainer-profile-editor-actions" style="margin-top:14px;"><a ${ctaAttrs}>${escapeHtml(ctaLabel)}</a></div>` : ''}
        </section>
      `;
    }
    if (type === 'image') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-image" style="${escapeHtml(cardStyle)}">
          ${mediaUrl ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(String(content.alt || 'Page image').trim() || 'Page image')}">` : '<div class="trainer-profile-muted">Image block</div>'}
        </section>
      `;
    }
    if (type === 'gallery') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-gallery" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Gallery')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            ${items.length ? items.map((item, index) => `<div class="trainer-profile-note">${escapeHtml(item || `Image ${index + 1}`)}</div>`).join('') : '<div class="trainer-profile-muted">Add gallery image URLs or labels.</div>'}
          </div>
        </section>
      `;
    }
    if (type === 'video_vsl' || type === 'vsl_form') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-video" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Video')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <p class="trainer-profile-body">${escapeHtml(body || 'Video sales letter section')}</p>
          ${mediaUrl ? `<div class="trainer-profile-note">${escapeHtml(mediaUrl)}</div>` : ''}
          ${type === 'vsl_form' ? '<div class="trainer-profile-note">Pair this with one of the page forms below.</div>' : ''}
        </section>
      `;
    }
    if (type === 'form') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-form" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">Form</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title || 'Lead form')}</h3>
          <p class="trainer-profile-body">${escapeHtml(body || 'Collect a lead from this page.')}</p>
        </section>
      `;
    }
    if (type === 'columns') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-columns" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Columns')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div style="${escapeHtml(builderBlockColumnsStyle(safe))}">
            ${(items.length ? items : ['Column one', 'Column two']).map((item) => `<div class="trainer-profile-note">${escapeHtml(item)}</div>`).join('')}
          </div>
        </section>
      `;
    }
    if (type === 'spacer') {
      const spacerHeight = safeStyleToken(safe?.style?.minHeight || '40px', '40px');
      return `<section class="trainer-profile-builder-block type-spacer" style="min-height:${escapeHtml(spacerHeight)};"></section>`;
    }
    if (type === 'custom_embed') {
      return `
        <section class="trainer-profile-card trainer-profile-builder-block type-custom-embed" style="${escapeHtml(cardStyle)}">
          <div class="trainer-profile-section-kicker">${escapeHtml(kicker || 'Embed')}</div>
          <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
          <div class="trainer-profile-note">${escapeHtml(String(content.embedHtml || body || 'Custom embed code preview').trim() || 'Custom embed code preview')}</div>
        </section>
      `;
    }
    return `
      <section class="trainer-profile-card trainer-profile-builder-block type-generic" style="${escapeHtml(cardStyle)}">
        <div class="trainer-profile-section-kicker">${escapeHtml(kicker || type || 'Block')}</div>
        <h3 class="trainer-profile-section-title">${escapeHtml(title)}</h3>
        <div class="trainer-profile-body">${escapeHtml(body || 'Custom content block')}</div>
        ${items.length ? `<div style="margin-top:12px;display:grid;gap:8px;">${items.map((item) => `<div class="trainer-profile-note">${escapeHtml(item)}</div>`).join('')}</div>` : ''}
        ${ctaLabel ? `<div class="trainer-profile-editor-actions" style="margin-top:14px;"><a ${ctaAttrs}>${escapeHtml(ctaLabel)}</a></div>` : ''}
        ${mediaUrl && type !== 'image' ? `<div class="trainer-profile-note" style="margin-top:12px;">${escapeHtml(mediaUrl)}</div>` : ''}
      </section>
    `;
  }

/* builderTheme */
function builderTheme(page, { publicView = false }

/* renderTemplatePage */
function renderTemplatePage(page, { publicView = false }

/* renderDragDropPage */
function renderDragDropPage(page, { publicView = false }

/* renderCustomCodePreview */
function renderCustomCodePreview(page, { publicView = false }

/* renderActiveBuilderPage */
function renderActiveBuilderPage(page, { publicView = false }