(function () {
  const feed = document.getElementById('forum-feed');
  const filterControls = Array.from(document.querySelectorAll('.forum-filter-control'));

  if (!feed || !filterControls.length) return;

  const avatarByCategory = {
    training: 'https://images.unsplash.com/photo-1704223524532-c5b4e8490297?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=120&h=120',
    nutrition: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120',
    recovery: 'https://images.unsplash.com/photo-1547852355-61348aeea17c?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120',
    cutting: 'https://images.unsplash.com/photo-1508170754725-6e9a5cfbcabf?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=120&h=120',
    bulking: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120',
    supplements: 'https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120',
    lifestyle: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120'
  };

  const state = {
    sort: 'best',
    scope: 'all',
    time: 'all'
  };

  let posts = [];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCompactNumber(value) {
    const number = Number(value || 0);
    if (number >= 1000) {
      const compact = Math.round(number / 100) / 10;
      return `${compact % 1 === 0 ? compact.toFixed(0) : compact}K`;
    }
    return String(number);
  }

  function getAgeHours(item, index) {
    if (Number.isFinite(Number(item.ageHours))) return Number(item.ageHours);
    return index + 1;
  }

  function formatAge(hours) {
    const value = Math.max(1, Number(hours || 1));
    if (value < 24) return `${value} hr. ago`;
    if (value < 168) {
      const days = Math.round(value / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    if (value < 720) {
      const weeks = Math.round(value / 168);
      return `${weeks} wk. ago`;
    }
    const months = Math.round(value / 720);
    return `${months} mo. ago`;
  }

  function bestScore(item) {
    return Number(item.score || 0) + Number(item.comments || 0) * 2;
  }

  function closeMenus() {
    filterControls.forEach((control) => {
      control.classList.remove('is-open');
      const trigger = control.querySelector('.forum-filter-pill');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function postMatches(item) {
    const scopeMatch = state.scope === 'all' || item.scope === state.scope;
    const hours = Number(item.ageHours || 0);
    const timeMatch = state.time === 'all'
      || (state.time === 'today' && hours <= 24)
      || (state.time === 'week' && hours <= 168);

    return scopeMatch && timeMatch;
  }

  function sortedPosts(items) {
    const list = items.slice();
    if (state.sort === 'new') {
      return list.sort((a, b) => Number(a.ageHours || 0) - Number(b.ageHours || 0));
    }
    if (state.sort === 'discussed') {
      return list.sort((a, b) => Number(b.comments || 0) - Number(a.comments || 0));
    }
    return list.sort((a, b) => bestScore(b) - bestScore(a));
  }

  function assignAnchorIds() {
    const articles = Array.from(feed.querySelectorAll('.forum-post'));
    articles.forEach((article) => article.removeAttribute('id'));

    const featured = articles[0];
    if (featured) featured.id = 'featured-post';

    const recovery = articles.find((article) => article.dataset.scope === 'recovery' && article !== featured);
    if (recovery) recovery.id = 'recovery-post';

    const cutting = articles.find((article) => article.dataset.category === 'cutting' && article !== featured && article !== recovery);
    if (cutting) cutting.id = 'cutting-post';

    const meal = articles.find((article) => article.dataset.category === 'nutrition' && article !== featured && article !== recovery && article !== cutting);
    if (meal) meal.id = 'meal-post';
  }

  function buildPostMarkup(item, index) {
    const titleTag = index === 0 ? 'h1' : 'h2';
    const avatarUrl = item.imageUrl || avatarByCategory[item.category] || avatarByCategory.training;
    const title = escapeHtml(item.title);
    const body = escapeHtml(item.body);
    const community = escapeHtml(item.community);
    const ageLabel = escapeHtml(formatAge(item.ageHours));
    const mediaMarkup = item.imageUrl
      ? `
        <a class="forum-post-media" href="forum-search.html">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.imageAlt || item.title)}" loading="lazy">
        </a>`
      : '';

    return `
      <article class="forum-post" data-post-id="${escapeHtml(item.id)}" data-scope="${escapeHtml(item.scope)}" data-category="${escapeHtml(item.category)}" data-hours="${escapeHtml(item.ageHours)}" data-score="${escapeHtml(item.score)}" data-comments="${escapeHtml(item.comments)}">
        <div class="forum-post-head">
          <div class="forum-post-meta">
            <span class="forum-post-avatar"><img src="${escapeHtml(avatarUrl)}" alt="${community} avatar" loading="lazy"></span>
            <span class="forum-post-meta-main">
              <strong>${community}</strong>
              <span>&bull;</span>
              <span>${ageLabel}</span>
            </span>
          </div>
          <div class="forum-post-actions">
            <a class="forum-join" href="forum-search.html">Join</a>
            <span class="forum-menu-dot">...</span>
          </div>
        </div>

        <${titleTag} class="forum-post-title">${title}</${titleTag}>
        <p class="forum-post-copy">${body}</p>
        ${mediaMarkup}
        <div class="forum-post-stats">
          <span class="forum-post-stat-pill is-vote">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 13 5-5 5 5"></path></svg>
            <span>${escapeHtml(formatCompactNumber(item.score))}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 11 5 5 5-5"></path></svg>
          </span>
          <span class="forum-post-stat-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5c0 4.1-3.8 7.5-8.5 7.5H8l-4 3v-7c0-4.7 3.8-8.5 8.5-8.5h.5c4.4 0 8 3.1 8 7Z"></path></svg>
            <span>${escapeHtml(formatCompactNumber(item.comments))}</span>
          </span>
          <span class="forum-post-stat-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 6 6-6 6"></path><path d="M20 11H9.5C7 11 5 13 5 15.5V19"></path></svg>
          </span>
        </div>
      </article>`;
  }

  function renderPosts() {
    const visible = sortedPosts(posts.filter(postMatches));

    if (!visible.length) {
      feed.innerHTML = '<div class="forum-empty-state">No posts match that filter yet.</div>';
      return;
    }

    feed.innerHTML = visible.map((item, index) => buildPostMarkup(item, index)).join('');
    assignAnchorIds();
  }

  function wireFilters() {
    filterControls.forEach((control) => {
      const filterName = control.dataset.filter;
      const trigger = control.querySelector('.forum-filter-pill');
      const label = control.querySelector('.forum-filter-label');
      const options = Array.from(control.querySelectorAll('.forum-filter-option'));

      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = !control.classList.contains('is-open');
        closeMenus();
        if (willOpen) {
          control.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          state[filterName] = option.dataset.value;
          label.textContent = option.textContent.trim();
          options.forEach((item) => item.classList.remove('is-active'));
          option.classList.add('is-active');
          closeMenus();
          renderPosts();
        });
      });
    });

    document.addEventListener('click', closeMenus);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenus();
    });
  }

  async function loadPosts() {
    feed.innerHTML = '<div class="forum-empty-state">Loading forum posts...</div>';

    try {
      const response = await fetch('/data/forum-posts.json', {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Forum feed failed with ${response.status}`);
      }

      const payload = await response.json();
      posts = (Array.isArray(payload.items) ? payload.items : []).map((item, index) => ({
        ...item,
        ageHours: getAgeHours(item, index)
      }));

      renderPosts();
    } catch (error) {
      feed.innerHTML = '<div class="forum-empty-state">Unable to load the forum feed right now.</div>';
    }
  }

  wireFilters();
  loadPosts();
}());
