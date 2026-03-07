(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const GROUP_META = {
    chest: { label: 'Chest', order: 1 },
    back: { label: 'Back', order: 2 },
    shoulders: { label: 'Shoulders', order: 3 },
    arms: { label: 'Arms', order: 4 },
    legs: { label: 'Legs', order: 5 },
    core: { label: 'Core', order: 6 },
    full_body: { label: 'Full Body', order: 7 },
    other: { label: 'Other', order: 99 }
  };

  const MUSCLE_LABELS = {
    abdominals: 'Abs',
    abductors: 'Hip Abductors',
    adductors: 'Adductors',
    biceps: 'Biceps',
    calves: 'Calves',
    chest: 'Chest',
    forearms: 'Forearms',
    glutes: 'Glutes',
    hamstrings: 'Hamstrings',
    lats: 'Lats',
    lowerback: 'Lower Back',
    middleback: 'Mid Back',
    neck: 'Neck',
    obliques: 'Obliques',
    quadriceps: 'Quads',
    shoulders: 'Shoulders',
    traps: 'Traps',
    hipflexors: 'Hip Flexors',
    serratus: 'Serratus'
  };

  const IMAGE_PATH_ALIASES = [
    {
      match: /^Close-Grip_Bench_Press\//i,
      replace: 'Smith_Machine_Close-Grip_Bench_Press/'
    },
    {
      match: /^Overhead_Press\//i,
      replace: 'Barbell_Shoulder_Press/'
    }
  ];

  const state = {
    items: [],
    query: '',
    editingId: null,
    expandedId: null,
    canEdit: false,
    viewer: null
  };
  const MAX_UPLOAD_IMAGES = 2;
  const MAX_UPLOAD_BYTES = 900000;

  function escapeHtml(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toTitleCase(text) {
    return String(text || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function normalizeMuscleToken(raw) {
    return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function formatMuscleLabel(raw) {
    const token = normalizeMuscleToken(raw);
    if (!token) return 'Uncategorized';
    return MUSCLE_LABELS[token] || toTitleCase(raw);
  }

  function resolveGroupKey(primaryMuscleRaw) {
    const token = normalizeMuscleToken(primaryMuscleRaw);
    if (!token) return 'other';

    if (token.includes('chest') || token.includes('pect')) return 'chest';
    if (token.includes('lat') || token.includes('back') || token.includes('rhomboid') || token.includes('trap')) return 'back';
    if (token.includes('shoulder') || token.includes('delt')) return 'shoulders';
    if (token.includes('bicep') || token.includes('tricep') || token.includes('forearm') || token.includes('brach')) return 'arms';
    if (
      token.includes('quad') || token.includes('hamstring') || token.includes('glute') || token.includes('calf')
      || token.includes('adductor') || token.includes('abductor') || token.includes('hipflexor') || token.includes('leg')
    ) return 'legs';
    if (token.includes('abdominal') || token.includes('oblique') || token.includes('core') || token.includes('serratus')) return 'core';
    if (token.includes('fullbody') || token.includes('totalbody')) return 'full_body';

    return 'other';
  }

  function listPrimaryMuscles(item) {
    return Array.isArray(item?.primaryMuscles)
      ? item.primaryMuscles.filter(Boolean).map((m) => String(m).trim())
      : [];
  }

  function buildGroupedItems(items) {
    const groups = new Map();

    for (const item of items) {
      const primaryMuscles = listPrimaryMuscles(item);
      const primary = primaryMuscles[0] || '';
      const groupKey = resolveGroupKey(primary);
      const groupMeta = GROUP_META[groupKey] || GROUP_META.other;
      const subgroupKey = normalizeMuscleToken(primary) || 'uncategorized';
      const subgroupLabel = formatMuscleLabel(primary);

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: groupMeta.label,
          order: groupMeta.order,
          count: 0,
          subgroups: new Map()
        });
      }

      const group = groups.get(groupKey);
      group.count += 1;

      if (!group.subgroups.has(subgroupKey)) {
        group.subgroups.set(subgroupKey, {
          key: subgroupKey,
          label: subgroupLabel,
          count: 0,
          items: []
        });
      }

      const subgroup = group.subgroups.get(subgroupKey);
      subgroup.count += 1;
      subgroup.items.push(item);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        subgroups: Array.from(group.subgroups.values())
          .map((sub) => ({
            ...sub,
            items: sub.items
              .slice()
              .sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || '')))
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
      }))
      .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
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

  function setStatus(text, isError = false) {
    const el = $('#workout-db-status');
    if (!el) return;
    el.textContent = String(text || '');
    el.style.color = isError ? '#8f1d1d' : '#5f5f5f';
  }

  function setCountLabel(visibleCount, totalCount) {
    const el = $('#workout-db-count');
    if (!el) return;
    if (!Number.isFinite(visibleCount) || !Number.isFinite(totalCount)) {
      el.textContent = '';
      return;
    }
    el.textContent = visibleCount === totalCount
      ? `${totalCount} exercises`
      : `${visibleCount} of ${totalCount} exercises`;
  }

  function showEditor(open) {
    const editor = $('#workout-db-editor');
    if (!editor) return;
    editor.classList.toggle('hidden', !open);
  }

  function showAuthWarning(text) {
    const wrap = $('#workout-db-auth-warning');
    if (!wrap) return;
    if (!text) {
      wrap.style.display = 'none';
      wrap.textContent = '';
      return;
    }
    wrap.style.display = '';
    wrap.className = 'workout-db-auth';
    wrap.textContent = String(text);
  }

  function parseCsv(text) {
    return String(text || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function payloadFromForm() {
    return {
      name: $('#wdb-name')?.value || '',
      id: $('#wdb-id')?.value || '',
      category: $('#wdb-category')?.value || '',
      equipment: $('#wdb-equipment')?.value || '',
      mechanic: $('#wdb-mechanic')?.value || '',
      force: $('#wdb-force')?.value || '',
      level: $('#wdb-level')?.value || 'beginner',
      isStretch: $('#wdb-is-stretch')?.value || '',
      isIsometric: $('#wdb-is-isometric')?.value || '',
      targetRegion: $('#wdb-target-region')?.value || '',
      primaryMuscles: parseCsv($('#wdb-primary')?.value || ''),
      secondaryMuscles: parseCsv($('#wdb-secondary')?.value || ''),
      subMuscleGroups: parseCsv($('#wdb-submuscles')?.value || ''),
      instructions: String($('#wdb-instructions')?.value || '')
        .split(/\r?\n/g)
        .map((x) => x.trim())
        .filter(Boolean)
    };
  }

  function scrollPageTop() {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      window.scrollTo(0, 0);
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  function bytesToKb(bytes) {
    return `${Math.max(1, Math.round((Number(bytes) || 0) / 1000))}KB`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read file: ${file?.name || 'image'}`));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
  }

  async function collectSelectedImageUploads() {
    const input = $('#wdb-images-file');
    const files = Array.from(input?.files || []).slice(0, MAX_UPLOAD_IMAGES);
    if (!files.length) return { ok: true, items: [] };

    const uploads = [];
    for (const file of files) {
      const mime = String(file?.type || '').toLowerCase();
      if (!mime.startsWith('image/')) {
        return { ok: false, error: `Unsupported file type: ${file?.name || 'file'}` };
      }
      if (Number(file?.size || 0) > MAX_UPLOAD_BYTES) {
        return { ok: false, error: `${file?.name || 'Image'} is too large (${bytesToKb(file?.size)} > ${bytesToKb(MAX_UPLOAD_BYTES)})` };
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        uploads.push(dataUrl);
      } catch (err) {
        return { ok: false, error: err?.message || 'Could not process selected images' };
      }
    }

    return { ok: true, items: uploads };
  }

  function updateImageUploadMeta(item = null) {
    const meta = $('#wdb-images-meta');
    if (!meta) return;
    const input = $('#wdb-images-file');
    const selected = Array.from(input?.files || []);
    const selectedText = selected.length
      ? `Selected: ${selected.slice(0, MAX_UPLOAD_IMAGES).map((f) => f.name).join(', ')}`
      : 'No new files selected.';
    const existingCount = Array.isArray(item?.images) ? item.images.filter(Boolean).length : 0;
    const existingText = existingCount ? `Existing images: ${existingCount}.` : 'Existing images: 0.';
    meta.innerHTML = `<strong>${existingText}</strong> ${selectedText} Up to ${MAX_UPLOAD_IMAGES} images, max ${bytesToKb(MAX_UPLOAD_BYTES)} each.`;
  }

  function resetForm() {
    state.editingId = null;
    const title = $('#workout-db-form-title');
    const saveBtn = $('#workout-db-save-btn');
    const cancelBtn = $('#workout-db-cancel-edit');
    if (title) title.textContent = 'Add Workout';
    if (saveBtn) saveBtn.textContent = 'Save Workout';
    if (cancelBtn) cancelBtn.style.display = 'none';

    const fields = [
      'wdb-name',
      'wdb-id',
      'wdb-category',
      'wdb-equipment',
      'wdb-mechanic',
      'wdb-force',
      'wdb-level',
      'wdb-is-stretch',
      'wdb-is-isometric',
      'wdb-target-region',
      'wdb-primary',
      'wdb-secondary',
      'wdb-submuscles',
      'wdb-instructions'
    ];
    fields.forEach((id) => {
      const el = $(`#${id}`);
      if (!el) return;
      if (id === 'wdb-category') el.value = 'strength';
      else if (id === 'wdb-equipment') el.value = 'machine';
      else if (id === 'wdb-level') el.value = 'beginner';
      else if (id === 'wdb-is-stretch' || id === 'wdb-is-isometric') el.value = 'no';
      else el.value = '';
    });
    const uploadInput = $('#wdb-images-file');
    const replaceCheckbox = $('#wdb-images-replace');
    if (uploadInput) uploadInput.value = '';
    if (replaceCheckbox) replaceCheckbox.checked = false;
    updateImageUploadMeta(null);

    setStatus('');
  }

  function syncOwnerEditState() {
    const addBtn = $('#workout-db-open-add');
    const editor = $('#workout-db-editor');
    if (addBtn) addBtn.style.display = state.canEdit ? '' : 'none';

    if (!state.canEdit) {
      showEditor(false);
      resetForm();
      if (editor) editor.style.display = 'none';
    } else if (editor) {
      editor.style.display = '';
    }
  }

  function beginEdit(item) {
    if (!state.canEdit || !item) return;

    state.editingId = String(item.id || '');
    state.expandedId = state.editingId;

    $('#workout-db-form-title').textContent = `Edit: ${item.name || item.id}`;
    $('#workout-db-save-btn').textContent = 'Update Workout';
    $('#workout-db-cancel-edit').style.display = '';
    $('#wdb-name').value = String(item.name || '');
    $('#wdb-id').value = String(item.id || '');
    const categoryValue = String(item.category || 'strength');
    const categorySelect = $('#wdb-category');
    if (categorySelect) {
      const hasCategoryOption = Array.from(categorySelect.options || []).some((opt) => String(opt.value) === categoryValue);
      categorySelect.value = hasCategoryOption ? categoryValue : 'other';
    }
    $('#wdb-equipment').value = String(item.equipment || 'machine');
    $('#wdb-mechanic').value = String(item.mechanic || '');
    $('#wdb-force').value = String(item.force || '');
    $('#wdb-level').value = String(item.level || 'beginner');
    $('#wdb-is-stretch').value = item.isStretch === true ? 'yes' : (item.isStretch === false ? 'no' : '');
    $('#wdb-is-isometric').value = item.isIsometric === true ? 'yes' : (item.isIsometric === false ? 'no' : '');
    $('#wdb-target-region').value = String(item.targetRegion || '');
    $('#wdb-primary').value = Array.isArray(item.primaryMuscles) ? item.primaryMuscles.join(', ') : '';
    $('#wdb-secondary').value = Array.isArray(item.secondaryMuscles) ? item.secondaryMuscles.join(', ') : '';
    $('#wdb-submuscles').value = Array.isArray(item.subMuscleGroups) ? item.subMuscleGroups.join(', ') : '';
    $('#wdb-instructions').value = Array.isArray(item.instructions) ? item.instructions.join('\n') : '';
    const uploadInput = $('#wdb-images-file');
    const replaceCheckbox = $('#wdb-images-replace');
    if (uploadInput) uploadInput.value = '';
    if (replaceCheckbox) replaceCheckbox.checked = false;
    updateImageUploadMeta(item);

    setStatus('Editing existing workout.');
    showEditor(true);
    scrollPageTop();
  }

  function filteredItems() {
    const q = String(state.query || '').trim().toLowerCase();
    if (!q) return state.items.slice();

    return state.items.filter((it) => {
      const primary = listPrimaryMuscles(it);
      const groupLabel = GROUP_META[resolveGroupKey(primary[0])]?.label || 'Other';
      const text = [
        it?.name,
        it?.id,
        it?.category,
        it?.equipment,
        groupLabel,
        primary.join(' '),
        Array.isArray(it?.secondaryMuscles) ? it.secondaryMuscles.join(' ') : '',
        Array.isArray(it?.subMuscleGroups) ? it.subMuscleGroups.join(' ') : '',
        it?.targetRegion || '',
        String(it?.isStretch ?? ''),
        String(it?.isIsometric ?? '')
      ].join(' ').toLowerCase();
      return text.includes(q);
    });
  }

  function lineList(arr) {
    const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
    return list.length
      ? list.map((x) => `<div>${escapeHtml(x)}</div>`).join('')
      : '<span class="workout-db-muted">-</span>';
  }

  function asListHtml(arr) {
    const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
    if (!list.length) return '<span>-</span>';
    return `<ul>${list.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
  }

  function normalizeImagePath(rawPath) {
    let next = String(rawPath || '').trim();
    if (!next) return '';
    IMAGE_PATH_ALIASES.forEach((alias) => {
      if (alias.match.test(next)) next = next.replace(alias.match, alias.replace);
    });
    return next;
  }

  function encodeImagePath(rawPath) {
    return String(rawPath || '')
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  function buildImageCandidates(rawPath) {
    const normalized = normalizeImagePath(rawPath);
    if (!normalized) return [];
    if (/^https?:\/\//i.test(normalized)) return [normalized];
    const encoded = encodeImagePath(normalized);
    if (!encoded) return [];
    return [
      `/free-exercise-db/exercises/${encoded}`,
      `/exercise-db/exercises/${encoded}`
    ];
  }

  function buildPdfExerciseCard(it) {
    const id = String(it?.id || '');
    const name = String(it?.name || id || 'Exercise');
    const primary = listPrimaryMuscles(it);
    const secondary = Array.isArray(it?.secondaryMuscles) ? it.secondaryMuscles.filter(Boolean) : [];
    const subMuscles = Array.isArray(it?.subMuscleGroups) ? it.subMuscleGroups.filter(Boolean) : [];
    const instructions = Array.isArray(it?.instructions) ? it.instructions.filter(Boolean) : [];
    const images = Array.isArray(it?.images) ? it.images.filter(Boolean) : [];
    const stretchLabel = it?.isStretch === true ? 'Yes' : (it?.isStretch === false ? 'No' : '-');
    const isometricLabel = it?.isIsometric === true ? 'Yes' : (it?.isIsometric === false ? 'No' : '-');
    const targetRegionLabel = it?.targetRegion ? toTitleCase(String(it.targetRegion).replace(/_/g, ' ')) : '-';
    const imageHtml = images.length ? `
      <div class="img-grid">
        ${images.map((rawPath, idx) => {
          const candidates = buildImageCandidates(rawPath);
          const src = candidates[0] || String(rawPath || '');
          return `
            <figure>
              <img src="${escapeHtml(src)}" alt="${escapeHtml(`${name} image ${idx + 1}`)}">
              <figcaption>${escapeHtml(String(rawPath || ''))}</figcaption>
            </figure>
          `;
        }).join('')}
      </div>
    ` : '<div class="muted">No images</div>';

    return `
      <article class="card">
        <h2>${escapeHtml(name)}</h2>
        <div class="kv"><b>ID:</b> ${escapeHtml(id || '-')}</div>
        <div class="kv"><b>Category:</b> ${escapeHtml(String(it?.category || '-'))}</div>
        <div class="kv"><b>Equipment:</b> ${escapeHtml(String(it?.equipment || '-'))}</div>
        <div class="kv"><b>Mechanic:</b> ${escapeHtml(String(it?.mechanic || '-'))}</div>
        <div class="kv"><b>Force:</b> ${escapeHtml(String(it?.force || '-'))}</div>
        <div class="kv"><b>Level:</b> ${escapeHtml(String(it?.level || '-'))}</div>
        <div class="kv"><b>Is Stretch:</b> ${escapeHtml(stretchLabel)}</div>
        <div class="kv"><b>Is Isometric:</b> ${escapeHtml(isometricLabel)}</div>
        <div class="kv"><b>Target Region:</b> ${escapeHtml(targetRegionLabel)}</div>
        <div class="kv"><b>Primary Muscles:</b> ${asListHtml(primary)}</div>
        <div class="kv"><b>Secondary Muscles:</b> ${asListHtml(secondary)}</div>
        <div class="kv"><b>Sub Muscle Groups:</b> ${asListHtml(subMuscles)}</div>
        <div class="kv"><b>Instructions:</b> ${asListHtml(instructions)}</div>
        <div class="kv"><b>Images:</b></div>
        ${imageHtml}
      </article>
    `;
  }

  function openPdfView() {
    const rows = filteredItems();
    if (!rows.length) {
      setStatus('No workouts to export.', true);
      return;
    }
    const title = `Workout Database - ${rows.length} exercises`;
    const timestamp = new Date().toLocaleString();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #151515; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .meta { color: #555; margin-bottom: 14px; font-size: 13px; }
    .card { border: 1px solid #d9d9d9; border-radius: 10px; padding: 12px; margin: 0 0 12px; page-break-inside: avoid; }
    .card h2 { margin: 0 0 8px; font-size: 18px; }
    .kv { margin: 4px 0; font-size: 13px; line-height: 1.35; }
    .kv b { display: inline-block; min-width: 140px; color: #202020; }
    .kv ul { margin: 4px 0 0 18px; padding: 0; }
    .img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-top: 8px; }
    .img-grid img { width: 100%; border: 1px solid #d5d5d5; border-radius: 6px; object-fit: cover; aspect-ratio: 4/3; }
    .img-grid figcaption { font-size: 10px; color: #666; word-break: break-all; margin-top: 3px; }
    .muted { color: #666; font-size: 12px; }
    @media print {
      body { margin: 12px; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Generated: ${escapeHtml(timestamp)}</div>
  ${rows.map((it) => buildPdfExerciseCard(it)).join('')}
</body>
</html>`;

    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setStatus('Popup blocked. Allow popups to open PDF view.', true);
      return;
    }
    try {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.onload = () => {
        try {
          popup.print();
        } catch {
          // User can still use browser Print manually.
        }
      };
    } catch {
      try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        popup.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch {
        setStatus('Could not open PDF view. Please try again.', true);
        return;
      }
    }
    setStatus(`Opened PDF view (${rows.length} workouts).`);
  }

  function imageList(arr, exerciseName) {
    const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
    if (!list.length) return '<span class="workout-db-muted">-</span>';

    return `
      <div class="workout-db-image-grid">
        ${list.map((rawPath, idx) => {
          const candidates = buildImageCandidates(rawPath);
          const first = candidates[0] || '';
          const fallbacks = candidates.slice(1).join('|');
          const alt = `${exerciseName || 'Exercise'} image ${idx + 1}`;
          return `
            <figure class="workout-db-image-item">
              <img
                class="workout-db-image"
                loading="lazy"
                alt="${escapeHtml(alt)}"
                src="${escapeHtml(first)}"
                data-fallbacks="${escapeHtml(fallbacks)}"
              >
              <figcaption class="workout-db-image-path">${escapeHtml(rawPath)}</figcaption>
            </figure>
          `;
        }).join('')}
      </div>
    `;
  }

  function bindImageFallbacks(root) {
    const scope = root || document;
    scope.querySelectorAll('.workout-db-image[data-fallbacks]').forEach((img) => {
      if (img.dataset.bound === '1') return;
      img.dataset.bound = '1';
      img.addEventListener('error', () => {
        const queue = String(img.dataset.fallbacks || '')
          .split('|')
          .map((x) => x.trim())
          .filter(Boolean);
        if (queue.length) {
          const next = queue.shift();
          img.dataset.fallbacks = queue.join('|');
          img.src = next;
          return;
        }
        img.classList.add('is-broken');
        const wrap = img.closest('.workout-db-image-item');
        if (wrap) wrap.classList.add('is-broken');
      });
    });
  }

  function renderExerciseItem(it) {
    const id = String(it.id || '');
    const open = state.expandedId === id;
    const primary = Array.isArray(it.primaryMuscles) ? it.primaryMuscles.join(', ') : '';
    const secondary = Array.isArray(it.secondaryMuscles) ? it.secondaryMuscles.join(', ') : '';
    const subMuscles = Array.isArray(it.subMuscleGroups) ? it.subMuscleGroups.join(', ') : '';
    const instructions = Array.isArray(it.instructions) ? it.instructions : [];
    const images = Array.isArray(it.images) ? it.images : [];
    const stretchLabel = it?.isStretch === true ? 'Yes' : (it?.isStretch === false ? 'No' : '-');
    const isometricLabel = it?.isIsometric === true ? 'Yes' : (it?.isIsometric === false ? 'No' : '-');
    const targetRegionLabel = it?.targetRegion ? toTitleCase(String(it.targetRegion).replace(/_/g, ' ')) : '-';
    const actions = state.canEdit
      ? `
        <div class="workout-db-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-wdb-edit="${escapeHtml(id)}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm" data-wdb-delete="${escapeHtml(id)}">Delete</button>
        </div>
      `
      : '';

    return `
      <article class="workout-db-item ${open ? 'open' : ''}">
        <button type="button" class="workout-db-item-btn" data-wdb-toggle="${escapeHtml(id)}">
          <div>
            <div class="workout-db-item-title">${escapeHtml(it.name || id)}</div>
            <div class="workout-db-item-sub">${escapeHtml(primary || 'No primary muscle')} - ${escapeHtml(it.equipment || '-')}</div>
          </div>
          <span class="workout-db-item-chevron">&rsaquo;</span>
        </button>
        <div class="workout-db-item-body ${open ? '' : 'hidden'}" id="wdb-body-${escapeHtml(id)}">
          <div class="workout-db-kv"><b>ID:</b><code>${escapeHtml(id)}</code></div>
          <div class="workout-db-kv"><b>Category:</b>${escapeHtml(it.category || '-')}</div>
          <div class="workout-db-kv"><b>Equipment:</b>${escapeHtml(it.equipment || '-')}</div>
          <div class="workout-db-kv"><b>Mechanic:</b>${escapeHtml(it.mechanic || '-')}</div>
            <div class="workout-db-kv"><b>Force:</b>${escapeHtml(it.force || '-')}</div>
            <div class="workout-db-kv"><b>Level:</b>${escapeHtml(it.level || '-')}</div>
            <div class="workout-db-kv"><b>Is Stretch:</b>${escapeHtml(stretchLabel)}</div>
            <div class="workout-db-kv"><b>Is Isometric:</b>${escapeHtml(isometricLabel)}</div>
            <div class="workout-db-kv"><b>Target Region:</b>${escapeHtml(targetRegionLabel)}</div>
            <div class="workout-db-kv"><b>Primary Muscles:</b>${escapeHtml(primary || '-')}</div>
            <div class="workout-db-kv"><b>Secondary Muscles:</b>${escapeHtml(secondary || '-')}</div>
            <div class="workout-db-kv"><b>Sub Muscle Groups:</b>${escapeHtml(subMuscles || '-')}</div>
            <div class="workout-db-kv"><b>Instructions:</b>${lineList(instructions)}</div>
            <div class="workout-db-kv"><b>Images:</b>${imageList(images, it.name || id)}</div>
            ${actions}
        </div>
      </article>
    `;
  }

  function renderRows() {
    const body = $('#workout-db-rows');
    if (!body) return;

    const rows = filteredItems();
    setCountLabel(rows.length, state.items.length);

    if (!rows.length) {
      body.innerHTML = '<div class="workout-db-muted">No workouts found.</div>';
      return;
    }

    const grouped = buildGroupedItems(rows);

    body.innerHTML = grouped.map((group) => `
      <section class="workout-db-group">
        <div class="workout-db-group-head">
          <span>${escapeHtml(group.label)}</span>
          <span class="workout-db-group-count">${group.count} exercises</span>
        </div>
        ${group.subgroups.map((sub) => `
          <div class="workout-db-subgroup">
            <div class="workout-db-subgroup-head">
              <span>${escapeHtml(sub.label)}</span>
              <span class="workout-db-subgroup-count">${sub.count}</span>
            </div>
            ${sub.items.map((it) => renderExerciseItem(it)).join('')}
          </div>
        `).join('')}
      </section>
    `).join('');

    bindImageFallbacks(body);
  }

  async function loadItems() {
    const resp = await api('/api/training/workout-database?limit=2000');
    if (!resp.ok) {
      setStatus(resp.json?.error || 'Failed to load workouts', true);
      state.items = [];
      state.canEdit = false;
      renderRows();
      syncOwnerEditState();
      return;
    }

    state.items = Array.isArray(resp.json?.items) ? resp.json.items : [];
    state.canEdit = Boolean(resp.json?.canEdit);
    renderRows();
    syncOwnerEditState();

    if (!state.canEdit) {
      showAuthWarning('Read-only view. Owner account is required to add, edit, or delete workouts.');
    } else {
      showAuthWarning('');
    }
  }

  async function saveCurrentForm() {
    if (!state.canEdit) {
      setStatus('Owner access required to edit workouts.', true);
      return;
    }

    const payload = payloadFromForm();
    const uploads = await collectSelectedImageUploads();
    if (!uploads.ok) {
      setStatus(uploads.error || 'Image upload failed', true);
      return;
    }
    if (!payload.name.trim()) {
      setStatus('Name is required', true);
      return;
    }
    if (!payload.primaryMuscles.length) {
      setStatus('At least one primary muscle is required', true);
      return;
    }
    if (!payload.secondaryMuscles.length) {
      setStatus('At least one secondary muscle is required', true);
      return;
    }
    if (!payload.subMuscleGroups.length) {
      setStatus('At least one sub-muscle group is required', true);
      return;
    }
    if (!String(payload.targetRegion || '').trim()) {
      setStatus('Target region is required', true);
      return;
    }
    if (!String(payload.isStretch || '').trim()) {
      setStatus('Please classify stretch (Yes/No).', true);
      return;
    }
    if (!String(payload.isIsometric || '').trim()) {
      setStatus('Please classify isometric (Yes/No).', true);
      return;
    }
    if (!payload.instructions.length) {
      setStatus('At least one instruction line is required', true);
      return;
    }
    if (uploads.items.length) payload.imageUploads = uploads.items;
    const replaceImages = Boolean($('#wdb-images-replace')?.checked);
    if (replaceImages) payload.replaceImages = true;

    const isEdit = Boolean(state.editingId);
    const path = isEdit
      ? `/api/training/workout-database/${encodeURIComponent(state.editingId)}`
      : '/api/training/workout-database';
    const method = isEdit ? 'PATCH' : 'POST';

    setStatus(isEdit ? 'Updating workout...' : 'Adding workout...');
    const resp = await api(path, { method, body: JSON.stringify(payload) });
    if (!resp.ok) {
      setStatus(resp.json?.error || 'Save failed', true);
      return;
    }

    setStatus(isEdit ? 'Workout updated.' : 'Workout added.');
    showEditor(false);
    resetForm();
    await loadItems();
  }

  async function deleteItem(id) {
    if (!state.canEdit || !id) return;

    const target = state.items.find((x) => String(x.id) === String(id));
    const ok = window.confirm(`Delete "${target?.name || id}" from workout database?`);
    if (!ok) return;

    const resp = await api(`/api/training/workout-database/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!resp.ok) {
      setStatus(resp.json?.error || 'Delete failed', true);
      return;
    }

    setStatus('Workout deleted.');
    if (state.editingId === id) resetForm();
    await loadItems();
  }

  function bindEvents() {
    const addBtn = $('#workout-db-open-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (!state.canEdit) return;
        resetForm();
        showEditor(true);
        scrollPageTop();
      });
    }

    const pdfBtn = $('#workout-db-export-pdf');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', openPdfView);
    }

    const closeBtn = $('#workout-db-close-editor');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        showEditor(false);
        resetForm();
      });
    }

    const form = $('#workout-db-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCurrentForm();
      });
    }

    const resetBtn = $('#workout-db-form-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetForm);

    const cancelEdit = $('#workout-db-cancel-edit');
    if (cancelEdit) cancelEdit.addEventListener('click', resetForm);

    const search = $('#workout-db-search');
    if (search) {
      search.addEventListener('input', (e) => {
        state.query = String(e.target.value || '');
        renderRows();
      });
    }
    const uploadInput = $('#wdb-images-file');
    if (uploadInput) {
      uploadInput.addEventListener('change', () => updateImageUploadMeta(state.editingId
        ? state.items.find((it) => String(it.id) === String(state.editingId))
        : null));
    }

    const rowsWrap = $('#workout-db-rows');
    if (rowsWrap) {
      rowsWrap.addEventListener('click', (e) => {
        const toggleEl = e.target?.closest?.('[data-wdb-toggle]');
        if (toggleEl) {
          const toggleId = toggleEl.getAttribute('data-wdb-toggle');
          state.expandedId = state.expandedId === toggleId ? null : toggleId;
          renderRows();
          return;
        }

        if (!state.canEdit) return;

        const editEl = e.target?.closest?.('[data-wdb-edit]');
        if (editEl) {
          const editId = editEl.getAttribute('data-wdb-edit');
          const item = state.items.find((it) => String(it.id) === String(editId));
          beginEdit(item);
          renderRows();
          return;
        }

        const deleteEl = e.target?.closest?.('[data-wdb-delete]');
        if (deleteEl) {
          const delId = deleteEl.getAttribute('data-wdb-delete');
          deleteItem(delId);
        }
      });
    }
  }

  async function init() {
    const listWrap = $('#workout-db-list-wrap');
    if (listWrap) {
      listWrap.style.display = '';
      listWrap.classList.remove('hidden');
    }

    showEditor(false);
    resetForm();
    bindEvents();

    const me = await api('/api/auth/me');
    state.viewer = me.ok ? (me.json?.user || null) : null;

    await loadItems();
    updateImageUploadMeta(null);

    if (!state.viewer) {
      showAuthWarning('Signed out. You can browse workouts, but editing requires owner sign-in.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
