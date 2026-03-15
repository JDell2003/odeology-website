(function () {
  const feed = document.getElementById('studies-feed');
  const status = document.getElementById('studies-feed-status');
  const searchInput = document.getElementById('studies-search-input');
  const topicButtons = Array.from(document.querySelectorAll('[data-studies-topic]'));

  if (!feed || !status || !searchInput) return;

  let activeTopic = 'all';
  let debounceTimer = null;

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

  function renderEmpty(message) {
    feed.innerHTML = `<div class="forum-empty-state">${escapeHtml(message)}</div>`;
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

    status.textContent = 'Loading studies…';

    try {
      const response = await fetch(`/api/studies/search?${params.toString()}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`Failed with ${response.status}`);
      const payload = await response.json();
      renderStudies(payload.items || []);
      const total = Number(payload.total || 0);
      const querySuffix = q ? ` for "${q}"` : '';
      const topicSuffix = activeTopic && activeTopic !== 'all' ? ` in ${titleCaseTopic(activeTopic)}` : '';
      status.textContent = `${total} studies found${querySuffix}${topicSuffix}. Cached locally from public research sources.`;
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
