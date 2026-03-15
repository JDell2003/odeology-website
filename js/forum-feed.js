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
  const openComments = new Set();
  const commentCache = new Map();

  const commentAuthors = [
    'setsandscience',
    'macrocheck',
    'deloaddiary',
    'plateprogress',
    'sleeplifts',
    'formfirstdaily',
    'repcounting',
    'proteinwindow',
    'calmcutter',
    'bulknotes',
    'recoveryreceipt',
    'gymratjournal',
    'mealprepplug',
    'hypertrophyday',
    'cardioandcoffee',
    'sorenessreport',
    'coachmodeon',
    'strengthreceipt',
    'restdaytruth',
    'routineaudit'
  ];

  const commentOpeners = [
    'Honestly',
    'Low key',
    'Not gonna lie',
    'From experience',
    'Real talk',
    'At this point',
    'If I were you',
    'For me',
    'The biggest shift',
    'The thing that helped most'
  ];

  const commentClosers = [
    'and that fixed it fast.',
    'and progress finally looked normal.',
    'and the difference was obvious in two weeks.',
    'and everything started feeling easier.',
    'and the scale finally made sense.',
    'and my training week stopped feeling random.',
    'and the photo updates looked better right away.',
    'and that ended the usual plateau.',
    'and recovery stopped falling apart.',
    'and the whole setup felt sustainable.'
  ];

  const categoryCommentPools = {
    training: {
      topics: ['exercise order', 'weekly volume', 'rep quality', 'range of motion', 'effort on last sets', 'upper body day structure'],
      observations: ['you are probably doing too much junk volume', 'the first exercise is carrying the whole session', 'your curls look better when they come after rows', 'the weekly split matters more than one perfect workout', 'the hard sets need to stay hard'],
      suggestions: ['trim one accessory and push the main lift harder', 'keep one curl pattern and progress it for four weeks', 'track the first working set instead of changing everything', 'put the hardest biceps work earlier in the session', 'stop adding sets when the reps are slowing down']
    },
    nutrition: {
      topics: ['meal prep', 'protein target', 'hunger management', 'food volume', 'weekday consistency', 'grocery choices'],
      observations: ['the meal looks lean enough but probably too light for the day', 'most people undercount sauces and snacks here', 'the food quality is solid but the portions decide everything', 'consistency usually matters more than perfect macros', 'the grocery setup is doing most of the work'],
      suggestions: ['build one repeatable breakfast and lunch first', 'keep protein the same and adjust carbs around training', 'add one higher volume side so hunger stays calm', 'pick foods you can actually repeat for ten days', 'weigh the high calorie extras once so you know the real numbers']
    },
    recovery: {
      topics: ['sleep debt', 'soreness', 'rest days', 'fatigue management', 'deload timing', 'stress load'],
      observations: ['the recovery issue usually shows up before the lift stalls', 'people call this a motivation problem when it is really fatigue', 'your body is probably carrying more stress than the plan assumes', 'the soreness is a sign the week is not balancing out', 'recovery habits matter more than another accessory day'],
      suggestions: ['pull one hard day back before adding more work', 'lock in sleep and steps for a full week first', 'use one lighter day to keep quality high', 'take the easy week before you feel forced into it', 'separate hard lower body work from your busiest day']
    },
    cutting: {
      topics: ['diet fatigue', 'adherence', 'food choice', 'satiety', 'step count', 'training energy'],
      observations: ['cutting gets messy when the plan is too aggressive on busy days', 'that usually happens when calories are low and activity is inconsistent', 'the hard part is not the deficit but repeating it cleanly', 'energy drops when food timing is all over the place', 'most stalls on a cut are routine problems first'],
      suggestions: ['keep calories steady for four days before making changes', 'move more carbs closer to training', 'build one fallback meal for the nights you are cooked', 'use a smaller deficit if the lifts are crashing', 'watch the weekends before slashing more food']
    },
    bulking: {
      topics: ['rate of gain', 'appetite', 'food quality', 'training push', 'meal frequency', 'bodyweight trend'],
      observations: ['most bulks go sideways when the surplus gets sloppy', 'the scale trend matters more than one heavy day of eating', 'you want enough food to perform without feeling wrecked', 'the extra calories should support better sessions', 'bulking works best when the routine is boring on purpose'],
      suggestions: ['raise intake in small steps instead of free styling weekends', 'anchor one liquid calorie meal if appetite is low', 'keep the same weigh in routine every morning', 'push performance markers before pushing more food', 'add one easy carb source you can repeat daily']
    },
    supplements: {
      topics: ['stack choice', 'dosage timing', 'routine simplicity', 'expectations', 'budget', 'consistency'],
      observations: ['most stacks are doing too much for too little return', 'consistency beats a longer supplement list', 'the basics cover more than people think', 'timing matters less than taking it daily', 'a clean routine is easier to judge'],
      suggestions: ['keep creatine and protein then audit the rest', 'drop anything you cannot explain in one sentence', 'run the basics for a month before adding more', 'spend the money on food and sleep if the budget is tight', 'separate what helps performance from what just sounds good']
    },
    lifestyle: {
      topics: ['schedule control', 'routine friction', 'travel weeks', 'consistency', 'work stress', 'daily habits'],
      observations: ['the plan usually breaks where the routine gets inconvenient', 'this reads like a schedule problem more than a willpower problem', 'small habits are carrying the big results here', 'consistency always looks boring from the outside', 'real life logistics matter more than the perfect template'],
      suggestions: ['reduce the setup time for the habit you keep missing', 'build a version of the plan for your busiest day', 'make the first action automatic and keep it short', 'stop waiting for the ideal week to start', 'set the routine around your real calendar instead of the perfect one']
    }
  };

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

  function seededValue(seed) {
    let hash = 2166136261;
    const source = String(seed || 'forum');
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return () => {
      hash += 0x6D2B79F5;
      let result = Math.imul(hash ^ (hash >>> 15), 1 | hash);
      result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickFrom(list, random) {
    return list[Math.floor(random() * list.length)];
  }

  function getCategoryPool(item) {
    return categoryCommentPools[item.category] || categoryCommentPools.training;
  }

  function buildCommentBody(item, index, random) {
    const pool = getCategoryPool(item);
    const opener = pickFrom(commentOpeners, random);
    const topic = pickFrom(pool.topics, random);
    const observation = pickFrom(pool.observations, random);
    const suggestion = pickFrom(pool.suggestions, random);
    const closer = pickFrom(commentClosers, random);
    const title = String(item.title || '').toLowerCase();

    if (title.includes('meal') || title.includes('prep') || title.includes('grocery')) {
      return `${opener}, the part that makes sense here is the ${topic}. ${observation}, so I would ${suggestion}, ${closer}`;
    }

    if (title.includes('sleep') || title.includes('recovery') || title.includes('rest')) {
      return `${opener}, this reads like a ${topic} issue. ${observation}, and I would ${suggestion}, ${closer}`;
    }

    if (title.includes('cut') || title.includes('deficit') || item.category === 'cutting') {
      return `${opener}, the weak spot is probably your ${topic}. ${observation}, so ${suggestion}, ${closer}`;
    }

    if (title.includes('bulk') || item.category === 'bulking') {
      return `${opener}, your ${topic} is what I would watch first. ${observation}, then ${suggestion}, ${closer}`;
    }

    if (item.category === 'training') {
      return `${opener}, this sounds like a ${topic} problem more than a motivation problem. ${observation}, so I would ${suggestion}, ${closer}`;
    }

    if (item.category === 'supplements') {
      return `${opener}, I would look at your ${topic} first. ${observation}, then ${suggestion}, ${closer}`;
    }

    return `${opener}, the main issue looks like ${topic}. ${observation}, so ${suggestion}, ${closer}`;
  }

  function generateComments(item) {
    if (commentCache.has(item.id)) return commentCache.get(item.id);

    const total = Math.max(0, Number(item.comments || 0));
    const random = seededValue(item.id);
    const comments = Array.from({ length: total }, (_, index) => {
      const ageHours = Math.max(1, Math.round(Number(item.ageHours || 1) + random() * 72 + index * 0.15));
      const score = Math.max(1, Math.round((total - index) * (0.55 + random() * 0.9)));
      return {
        id: `${item.id}-comment-${index + 1}`,
        author: pickFrom(commentAuthors, random),
        ageLabel: formatAge(ageHours),
        score,
        body: buildCommentBody(item, index, random)
      };
    });

    commentCache.set(item.id, comments);
    return comments;
  }

  function buildCommentMarkup(comment) {
    return `
      <article class="forum-comment" data-comment-id="${escapeHtml(comment.id)}">
        <div class="forum-comment-meta">
          <strong class="forum-comment-author">u/${escapeHtml(comment.author)}</strong>
          <span>&bull;</span>
          <span>${escapeHtml(comment.ageLabel)}</span>
          <span>&bull;</span>
          <span>${escapeHtml(formatCompactNumber(comment.score))} upvotes</span>
        </div>
        <p class="forum-comment-body">${escapeHtml(comment.body)}</p>
      </article>`;
  }

  function buildCommentsSection(item) {
    const isOpen = openComments.has(item.id);
    const commentsMarkup = isOpen
      ? generateComments(item).map((comment) => buildCommentMarkup(comment)).join('')
      : '';

    return `
      <section class="forum-post-comments${isOpen ? ' is-open' : ''}" id="comments-${escapeHtml(item.id)}" data-comments-for="${escapeHtml(item.id)}"${isOpen ? '' : ' hidden'}>
        <div class="forum-post-comments-header">
          <strong>${escapeHtml(formatCompactNumber(item.comments))} comments</strong>
        </div>
        <div class="forum-post-comments-list">
          ${commentsMarkup}
        </div>
      </section>`;
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
    const avatarUrl = avatarByCategory[item.category] || avatarByCategory.training;
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
        ${buildCommentsSection(item)}
        <div class="forum-post-stats">
          <span class="forum-post-stat-pill is-vote">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 13 5-5 5 5"></path></svg>
            <span>${escapeHtml(formatCompactNumber(item.score))}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 11 5 5 5-5"></path></svg>
          </span>
          <button class="forum-post-stat-pill is-comments" type="button" data-comment-toggle="${escapeHtml(item.id)}" aria-expanded="${openComments.has(item.id) ? 'true' : 'false'}" aria-controls="comments-${escapeHtml(item.id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5c0 4.1-3.8 7.5-8.5 7.5H8l-4 3v-7c0-4.7 3.8-8.5 8.5-8.5h.5c4.4 0 8 3.1 8 7Z"></path></svg>
            <span>${escapeHtml(formatCompactNumber(item.comments))}</span>
          </button>
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

  function wireCommentToggles() {
    feed.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-comment-toggle]');
      if (!trigger) return;

      const postId = trigger.getAttribute('data-comment-toggle');
      if (!postId) return;

      if (openComments.has(postId)) {
        openComments.delete(postId);
      } else {
        openComments.add(postId);
      }

      renderPosts();

      const refreshedPost = feed.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
      if (!refreshedPost) return;

      refreshedPost.scrollIntoView({
        block: 'nearest',
        behavior: 'auto'
      });
    });
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
  wireCommentToggles();
  loadPosts();
}());
