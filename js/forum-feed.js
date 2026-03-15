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

  const commentNamePool = ['matt', 'derek', 'sarah', 'alex', 'jason', 'mia', 'tyler', 'josh', 'noah', 'emma', 'ash', 'luke', 'nina', 'ella', 'brad', 'zoe'];
  const commentFitnessHandles = ['ironmike', 'benchbeast', 'squatdad', 'platepusher', 'cutmode', 'bulkseason', 'latlover', 'barpath', 'repfiend', 'chalkhands'];
  const commentUnderscoreHandles = ['jay_train', 'lifter_matt', 'sarah_lifts', 'alex_cuts', 'bench_ben', 'plates_n_prep', 'coach_jay', 'derek_rows'];
  const commentCasualHandles = ['bro_lifts', 'gymrat', 'late_night_lifter', 'mealguy', 'cardiohater', 'legdaypain', 'preworkoutbrain', 'restdayvibes'];

  const shortCommentReactions = [
    'same thing happened to me lol',
    'this is actually solid',
    'id keep it simple',
    'you are overthinking it',
    'good post honestly',
    'yeah that helped me too',
    'bulgarian split squats should be illegal',
    'this makes way more sense',
    'same here 😭',
    'i learned that the hard way'
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

  function getAgeMinutes(item, index) {
    if (Number.isFinite(Number(item.ageMinutes))) return Number(item.ageMinutes);
    if (Number.isFinite(Number(item.ageHours))) return Math.round(Number(item.ageHours) * 60);
    return Math.max(1, (index + 1) * 45);
  }

  function formatAge(minutes) {
    const value = Math.max(0, Number(minutes || 0));
    if (value < 3) return 'just now';
    if (value < 60) return `${Math.max(1, Math.round(value))}m ago`;
    if (value < 1440) {
      const hours = Math.round(value / 60);
      return `${hours}h ago`;
    }
    if (value < 2880) return 'yesterday';
    const days = Math.round(value / 1440);
    return `${days} days ago`;
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
    const minutes = Number(item.ageMinutes || 0);
    const timeMatch = state.time === 'all'
      || (state.time === 'today' && minutes <= 1440)
      || (state.time === 'week' && minutes <= 10080);

    return scopeMatch && timeMatch;
  }

  function sortedPosts(items) {
    const list = items.slice();
    if (state.sort === 'new') {
      return list.sort((a, b) => Number(a.ageMinutes || 0) - Number(b.ageMinutes || 0));
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

  function buildUsername(random) {
    const roll = random();
    if (roll < 0.3) return pickFrom(commentNamePool, random);
    if (roll < 0.6) return `${pickFrom(commentNamePool, random)}${pickFrom(['21', '24', '27', '31', '88', '92'], random)}`;
    if (roll < 0.8) return pickFrom(commentFitnessHandles, random);
    if (roll < 0.9) return pickFrom(commentUnderscoreHandles, random);
    return pickFrom(commentCasualHandles, random);
  }

  function addImperfection(text, random) {
    let value = String(text || '');
    if (random() < 0.08) value = value.toLowerCase();
    if (random() < 0.06) value += ` ${pickFrom(['lol', '😭', 'tbh', 'ngl'], random)}`;
    if (random() < 0.05) value = value.replace(/bench/i, 'benhc').replace(/about/i, 'abt');
    if (random() < 0.1) value = value.replace(/\byou are\b/i, 'youre').replace(/\bgoing to\b/i, 'gonna');
    return value;
  }

  function getCategoryPool(item) {
    return categoryCommentPools[item.category] || categoryCommentPools.training;
  }

  function buildCommentBody(item, random, mode) {
    const pool = getCategoryPool(item);
    const topic = pickFrom(pool.topics, random);
    const observation = pickFrom(pool.observations, random);
    const suggestion = pickFrom(pool.suggestions, random);
    const experience = [
      `i had the same issue last year. ${suggestion}. helped a lot.`,
      `same thing happened to me. once i fixed ${topic}, progress picked back up.`,
      `for me it was literally ${topic}. ${suggestion}.`
    ];
    const supportive = [
      `good post honestly`,
      `this is way more common than people admit`,
      `youre probably closer than you think`
    ];
    const curious = [
      `how many hard sets were you doing`,
      `were you eating enough when this started`,
      `did you change anything else at the same time`
    ];
    const joking = [
      `bulgarian split squats are still the villain somehow`,
      `this is why leg day has trust issues`,
      `the gym gods love making the obvious fix annoying`
    ];
    const disagree = [
      `idk i kinda disagree. ${suggestion} would be the last thing id change.`,
      `not sure i buy that. ${observation} but i wouldnt jump to more work.`,
      `depends on volume honestly. i would not assume ${topic} is the whole issue.`
    ];
    const advice = [
      `${observation}. id ${suggestion}.`,
      `my guess is ${topic}. id ${suggestion}.`,
      `the post makes sense. id just ${suggestion}.`
    ];
    const paragraph = [
      `i went through almost this exact thing. on paper my training looked fine, but the weak spot was always ${topic}. once i stopped changing everything every week and just focused on one clean adjustment, progress started looking normal again.`,
      `this feels like one of those problems that looks random in the moment but is obvious when you zoom out. ${observation}. if it were me i would ${suggestion}, leave it alone for two weeks, and see if the trend changes before rewriting the whole plan.`
    ];

    let base = '';
    if (mode === 'disagree') base = pickFrom(disagree, random);
    else if (mode === 'reply') base = pickFrom([...supportive, ...curious], random);
    else {
      const roll = random();
      if (roll < 0.4) base = pickFrom(shortCommentReactions, random);
      else if (roll < 0.62) base = pickFrom(experience, random);
      else if (roll < 0.78) base = pickFrom(advice, random);
      else if (roll < 0.9) base = pickFrom([...supportive, ...curious, ...joking], random);
      else base = pickFrom(paragraph, random);
    }
    return addImperfection(base, random);
  }

  function generateComments(item) {
    if (commentCache.has(item.id)) return commentCache.get(item.id);

    const total = Math.max(0, Number(item.comments || 0));
    const random = seededValue(item.id);
    const replyIndex = total >= 4 && random() < 0.72 ? Math.min(total - 1, 2 + Math.floor(random() * Math.max(1, total - 2))) : -1;
    const replyParentIndex = replyIndex > 1 ? Math.max(0, replyIndex - 1) : -1;
    const disagreeIndex = total >= 3 && random() < 0.36 ? 1 : -1;
    const comments = Array.from({ length: total }, (_, index) => {
      const baseMinutes = Math.max(1, Number(item.ageMinutes || 120));
      const ageMinutes = Math.max(1, Math.round(baseMinutes * (0.08 + random() * 0.82)));
      let score = 0;
      if (index === 0) score = Math.round(5 + random() * 20);
      else {
        const tierRoll = random();
        if (tierRoll < 0.3) score = Math.round(random() * 3);
        else if (tierRoll < 0.82) score = Math.round(1 + random() * 11);
        else score = Math.round(5 + random() * 20);
      }

      const mode = index === disagreeIndex ? 'disagree' : index === replyIndex ? 'reply' : 'base';
      const lengthRoll = random();
      let body = buildCommentBody(item, random, mode);
      if (lengthRoll < 0.4) {
        body = pickFrom(shortCommentReactions, random);
      } else if (lengthRoll > 0.95) {
        body = `${buildCommentBody(item, random, mode)} ${buildCommentBody(item, random, 'reply')}`;
      }

      return {
        id: `${item.id}-comment-${index + 1}`,
        parentId: index === replyIndex && replyParentIndex >= 0 ? `${item.id}-comment-${replyParentIndex + 1}` : null,
        author: buildUsername(random),
        ageLabel: formatAge(ageMinutes),
        score,
        body
      };
    });

    commentCache.set(item.id, comments);
    return comments;
  }

  function buildCommentMarkup(comment) {
    return `
      <article class="forum-comment${comment.parentId ? ' is-reply' : ''}" data-comment-id="${escapeHtml(comment.id)}">
        <div class="forum-comment-meta">
          <strong class="forum-comment-author">u/${escapeHtml(comment.author)}</strong>
          <span>&bull;</span>
          <span>${escapeHtml(comment.ageLabel)}</span>
        </div>
        <p class="forum-comment-body">${escapeHtml(comment.body)}</p>
        <div class="forum-comment-footer">
          <span class="forum-comment-votes">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 13 5-5 5 5"></path></svg>
            <span>${escapeHtml(formatCompactNumber(comment.score))}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 11 5 5 5-5"></path></svg>
          </span>
        </div>
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
    const author = escapeHtml(item.author || 'communitystarter');
    const ageLabel = escapeHtml(formatAge(item.ageMinutes));
    const mediaMarkup = item.imageUrl
      ? `
        <a class="forum-post-media" href="forum-search.html">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.imageAlt || item.title)}" loading="lazy">
        </a>`
      : '';
    const signalsMarkup = `
      <div class="forum-post-signals">
        <span>${escapeHtml(formatCompactNumber(item.viewCount || 0))} views</span>
        <span>&bull;</span>
        <span>${escapeHtml(formatCompactNumber(item.comments))} comments</span>
        <span>&bull;</span>
        <span>${escapeHtml(formatCompactNumber(item.saveCount || 0))} saves</span>
      </div>`;

    return `
      <article class="forum-post" data-post-id="${escapeHtml(item.id)}" data-scope="${escapeHtml(item.scope)}" data-category="${escapeHtml(item.category)}" data-minutes="${escapeHtml(item.ageMinutes)}" data-score="${escapeHtml(item.score)}" data-comments="${escapeHtml(item.comments)}">
        <div class="forum-post-head">
          <div class="forum-post-meta">
            <span class="forum-post-avatar"><img src="${escapeHtml(avatarUrl)}" alt="${community} avatar" loading="lazy"></span>
            <span class="forum-post-meta-main">
              <strong>u/${author}</strong>
              <span>&bull;</span>
              <span>${community}</span>
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
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2Z"></path></svg>
            <span>${escapeHtml(formatCompactNumber(item.saveCount || 0))}</span>
          </span>
        </div>
        ${signalsMarkup}
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
        ageMinutes: getAgeMinutes(item, index)
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
