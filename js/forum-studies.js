(function () {
  const feed = document.getElementById('studies-feed');
  const status = document.getElementById('studies-feed-status');
  const searchInput = document.getElementById('studies-search-input');
  const topicButtons = Array.from(document.querySelectorAll('[data-studies-topic]'));

  if (!feed || !status || !searchInput) return;

  let activeTopic = 'all';
  let debounceTimer = null;
  let localDataset = null;
  let apiMode = 'unknown';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function titleCaseTopic(value) {
    return String(value || '')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function tokenize(input) {
    return String(input || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function renderEmpty(message) {
    feed.innerHTML = `<div class="forum-empty-state">${escapeHtml(message)}</div>`;
  }

  function scoreStudy(item, tokens, topic) {
    const title = String(item?.title || '').toLowerCase();
    const summary = String(item?.summary || '').toLowerCase();
    const journal = String(item?.journal || '').toLowerCase();
    const studyType = String(item?.studyType || item?.evidenceType || '').toLowerCase();
    const tags = Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag || '').toLowerCase()) : [];

    if (topic && topic !== 'all' && !tags.includes(topic)) return -1;

    if (!tokens.length) {
      let base = 1;
      if (studyType.includes('meta-analysis')) base += 8;
      else if (studyType.includes('systematic review')) base += 7;
      else if (studyType.includes('randomized')) base += 5;
      return base;
    }

    let score = 0;
    tokens.forEach((token) => {
      if (title.includes(token)) score += 8;
      if (summary.includes(token)) score += 4;
      if (journal.includes(token)) score += 2;
      if (studyType.includes(token)) score += 3;
      if (tags.some((tag) => tag.includes(token))) score += 6;
    });
    return score;
  }

  function searchLocalStudies(items, { query, topic, limit }) {
    const tokens = tokenize(query);
    const ranked = (Array.isArray(items) ? items : [])
      .map((item) => ({ item, score: scoreStudy(item, tokens, topic) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aDate = String(a.item?.publicationDate || a.item?.year || '');
        const bDate = String(b.item?.publicationDate || b.item?.year || '');
        return bDate.localeCompare(aDate);
      });

    return {
      total: ranked.length,
      items: ranked.slice(0, limit).map((entry) => entry.item)
    };
  }

  async function loadLocalDataset() {
    if (localDataset) return localDataset;
    const response = await fetch('/data/studies.json', {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Local dataset failed with ${response.status}`);
    localDataset = await response.json();
    return localDataset;
  }

  function renderStudies(items) {
    if (!Array.isArray(items) || items.length === 0) {
      renderEmpty('No studies matched that search yet. Try a broader term like protein, creatine, hypertrophy, fat loss, or recovery.');
      return;
    }

    feed.innerHTML = items.map((item) => {
      const title = escapeHtml(item.title);
      const summary = escapeHtml(item.summary || '');
      const sourceUrl = escapeHtml(item.sourceUrl || '#');
      const journal = escapeHtml(item.journal || 'Peer-reviewed source');
      const year = escapeHtml(item.year || 'Recent');
      const evidenceType = escapeHtml(item.evidenceType || item.studyType || 'Study');
      const tags = Array.isArray(item.tags) ? item.tags.slice(0, 4) : [];
      const authorLabel = Array.isArray(item.authors) && item.authors.length
        ? escapeHtml(item.authors.slice(0, 2).join(', '))
        : 'Authors listed on source';
      const citationText = Number.isFinite(Number(item.citations)) && Number(item.citations) > 0
        ? `${Number(item.citations)} citations`
        : 'Citation count unavailable';

      return `
        <article class="forum-post">
          <div class="forum-post-head">
            <div class="forum-post-meta">
              <span>${escapeHtml(item.source || 'PubMed')}</span>
              <span>${evidenceType}</span>
              <span>${year}</span>
            </div>
            <div class="forum-post-actions">
              <a class="forum-join" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Read abstract</a>
              <span class="forum-menu-dot">...</span>
            </div>
          </div>
          <h2 class="forum-post-title">${title}</h2>
          <p class="forum-post-copy">${summary}</p>
          <div class="forum-post-stats">
            <span>${journal}</span>
            <span>${authorLabel}</span>
            <span>${escapeHtml(citationText)}</span>
          </div>
          <div class="forum-study-links">
            ${tags.map((tag) => `<a class="forum-study-link" href="#" data-studies-tag="${escapeHtml(tag)}">${escapeHtml(titleCaseTopic(tag))}</a>`).join('')}
            <a class="forum-study-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">View study</a>
          </div>
        </article>
      `;
    }).join('');

    feed.querySelectorAll('[data-studies-tag]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const tag = String(link.getAttribute('data-studies-tag') || 'all').trim().toLowerCase();
        activeTopic = tag || 'all';
        topicButtons.forEach((btn) => {
          btn.classList.toggle('is-active', String(btn.getAttribute('data-studies-topic') || '') === activeTopic);
        });
        runSearch();
      });
    });
  }

  async function runSearch() {
    const params = new URLSearchParams();
    const q = String(searchInput.value || '').trim();
    if (q) params.set('q', q);
    if (activeTopic && activeTopic !== 'all') params.set('topic', activeTopic);
    params.set('limit', '18');

    status.textContent = 'Loading studies...';

    try {
      let payload;

      try {
        if (apiMode === 'disabled') throw new Error('API disabled');
        const response = await fetch(`/api/studies/search?${params.toString()}`, {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
          if (response.status === 404) apiMode = 'disabled';
          throw new Error(`API failed with ${response.status}`);
        }
        apiMode = 'enabled';
        payload = await response.json();
      } catch {
        const dataset = await loadLocalDataset();
        const result = searchLocalStudies(dataset.items || [], {
          query: q,
          topic: activeTopic,
          limit: 18
        });
        payload = {
          total: result.total,
          items: result.items,
          generatedAt: dataset.generatedAt || null,
          fallback: true
        };
      }

      renderStudies(payload.items || []);
      const total = Number(payload.total || 0);
      const querySuffix = q ? ` for "${q}"` : '';
      const topicSuffix = activeTopic && activeTopic !== 'all' ? ` in ${titleCaseTopic(activeTopic)}` : '';
      const sourceSuffix = payload.fallback
        ? 'Loaded from local cached dataset.'
        : 'Served by the local studies API.';
      status.textContent = `${total} studies found${querySuffix}${topicSuffix}. ${sourceSuffix}`;
    } catch (error) {
      status.textContent = 'Unable to load the study database right now.';
      renderEmpty('The study dataset is unavailable right now. Refresh later or run the local study refresh script to rebuild the cache.');
    }
  }

  topicButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = String(button.getAttribute('data-studies-topic') || 'all').trim().toLowerCase() || 'all';
      topicButtons.forEach((btn) => btn.classList.toggle('is-active', btn === button));
      runSearch();
    });
  });

  searchInput.addEventListener('input', () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(runSearch, 220);
  });

  runSearch();
}());
