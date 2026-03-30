(function () {
  const sectionsRoot = document.getElementById('explore-sections');
  const emptyState = document.getElementById('explore-empty-state');
  const searchInput = document.getElementById('explore-search-input');
  const topicButtons = Array.from(document.querySelectorAll('[data-explore-topic]'));

  if (!sectionsRoot || !emptyState || !searchInput) return;

  const sectionDefinitions = [
    {
      title: 'Recommended for you',
      copy: 'Good entry points if you want high-signal discussion without needing a huge member count.',
      items: [
        { slug: 'strength-base', name: 'Strength Base', visitors: '18K weekly visitors', image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=180&q=80', copy: 'Programming-first conversations for lifters trying to build a better base before chasing fancy methods.', topics: ['training', 'habits'] },
        { slug: 'macro-kitchen', name: 'Macro Kitchen', visitors: '12K weekly visitors', image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=180&q=80', copy: 'High-protein meals, easier prep systems, and recipe ideas that do not wreck adherence.', topics: ['nutrition', 'recipes', 'fat-loss'] },
        { slug: 'recovery-reset', name: 'Recovery Reset', visitors: '9.4K weekly visitors', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=180&q=80', copy: 'Sleep, soreness management, mobility, and the boring recovery habits that actually keep progress moving.', topics: ['recovery', 'mindset'] },
        { slug: 'cut-phase-club', name: 'Cut Phase Club', visitors: '7.8K weekly visitors', image: 'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=180&q=80', copy: 'Deficit strategy, hunger control, and keeping muscle while leaning out without turning the process into chaos.', topics: ['fat-loss', 'habits'] },
        { slug: 'form-check-lab', name: 'Form Check Lab', visitors: '6.1K weekly visitors', image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=180&q=80', copy: 'Technique breakdowns, movement tweaks, and lift discussions that keep training cleaner and safer.', topics: ['training', 'recovery'] },
        { slug: 'consistency-wins', name: 'Consistency Wins', visitors: '5.3K weekly visitors', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=180&q=80', copy: 'A lane for staying steady when motivation dips and the real job becomes repeating useful days.', topics: ['mindset', 'habits'] }
      ]
    },
    {
      title: 'Most active on RiseForIt',
      copy: 'The broadest conversations right now, useful if you want faster replies and more varied perspectives.',
      items: [
        { slug: 'gym-floor', name: 'Gym Floor', visitors: '24K weekly visitors', image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=180&q=80', copy: 'The broad front page lane for lifting, routines, equipment, and everyday training questions.', topics: ['training'] },
        { slug: 'lean-plate', name: 'Lean Plate', visitors: '19K weekly visitors', image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=180&q=80', copy: 'Calorie control, satiety, food swaps, and simple meal structures that actually survive a busy week.', topics: ['nutrition', 'fat-loss'] },
        { slug: 'sleep-reset', name: 'Sleep & Reset', visitors: '15K weekly visitors', image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=180&q=80', copy: 'Recovery systems, bedtime routines, and getting back on track after training stress starts stacking up.', topics: ['recovery', 'habits'] },
        { slug: 'strength-women', name: 'Strength Women', visitors: '11K weekly visitors', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=180&q=80', copy: 'Women-led training conversations focused on performance, confidence, and building a stronger baseline.', topics: ['training', 'mindset'] },
        { slug: 'appetite-control', name: 'Appetite Control', visitors: '8.6K weekly visitors', image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=180&q=80', copy: 'Hunger management, meal volume, fiber, and other practical fixes when the deficit starts fighting back.', topics: ['fat-loss', 'nutrition'] },
        { slug: 'prep-once-eat-easy', name: 'Prep Once Eat Easy', visitors: '7.2K weekly visitors', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=180&q=80', copy: 'Batch cooking, grocery structure, and repeatable meal systems for people who do not want to freestyle nutrition daily.', topics: ['recipes', 'habits', 'nutrition'] }
      ]
    },
    {
      title: 'Best starting points',
      copy: 'Smaller lanes organized around specific needs, useful if you want less noise and more direct relevance.',
      items: [
        { slug: 'beginner-barbell', name: 'Beginner Barbell', visitors: '6.5K weekly visitors', image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=180&q=80', copy: 'Simple entry point for people learning barbell basics without getting lost in advanced-program noise.', topics: ['training'] },
        { slug: 'protein-pantry', name: 'Protein Pantry', visitors: '5.9K weekly visitors', image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=180&q=80', copy: 'Snack ideas, grocery staples, and easy protein upgrades for people trying to stop under-eating by accident.', topics: ['nutrition', 'recipes'] },
        { slug: 'reset-week', name: 'Reset Week', visitors: '4.8K weekly visitors', image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=180&q=80', copy: 'For when the plan slipped, the schedule got messy, and the next job is rebuilding rhythm instead of chasing perfection.', topics: ['mindset', 'recovery', 'habits'] },
        { slug: 'deficit-without-drama', name: 'Deficit Without Drama', visitors: '4.1K weekly visitors', image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=180&q=80', copy: 'A calmer place for building a sustainable deficit without overcompensating into restriction and rebound.', topics: ['fat-loss', 'nutrition'] },
        { slug: 'garage-sessions', name: 'Garage Sessions', visitors: '3.7K weekly visitors', image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=180&q=80', copy: 'Training around limited equipment, home setups, and getting useful work done without a perfect gym environment.', topics: ['training', 'habits'] },
        { slug: 'deload-dialogues', name: 'Deload Dialogues', visitors: '3.2K weekly visitors', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=180&q=80', copy: 'Conversations for people who know they should back off for a week but still need help doing it intelligently.', topics: ['recovery', 'mindset'] }
      ]
    }
  ];

  let activeTopic = 'all';
  let activeQuery = '';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function titleCase(value) {
    return String(value || '')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function cardMatches(item) {
    const matchesTopic = activeTopic === 'all' || item.topics.includes(activeTopic);
    if (!matchesTopic) return false;
    if (!activeQuery) return true;
    const haystack = `${item.name} ${item.copy} ${item.visitors} ${item.topics.join(' ')}`.toLowerCase();
    return haystack.includes(activeQuery);
  }

  function getCommunityHref(item) {
    const params = new URLSearchParams({
      community: item.slug,
      name: item.name,
      image: item.image,
      copy: item.copy
    });
    return `forum-community-room.html?${params.toString()}`;
  }

  async function ensureSignedInOrPrompt(targetHref) {
    let signedIn = false;
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      signedIn = Boolean(response.ok && data?.user);
    } catch {
      signedIn = Boolean(window.localStorage && localStorage.getItem('ode_auth_user_hint_v1'));
    }

    if (signedIn) {
      window.location.href = targetHref;
      return;
    }

    try {
      sessionStorage.setItem('ode_auth_return_to', targetHref);
    } catch {
      // ignore
    }

    if (typeof window.odeOpenAuthModal === 'function') {
      window.odeOpenAuthModal('login');
    } else {
      window.location.href = targetHref;
    }
  }

  function createCard(item) {
    const card = document.createElement('article');
    card.className = 'forum-explore-card';
    card.dataset.hiddenByMore = 'false';
    card.innerHTML = `
      <div class="forum-card-top">
        <div class="forum-card-identity">
          <div class="forum-card-avatar"><img src="${escapeHtml(item.image)}" alt=""></div>
          <div class="forum-card-name">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.visitors)}</span>
          </div>
        </div>
        <a class="forum-card-join" href="${escapeHtml(getCommunityHref(item))}" data-community-join="${escapeHtml(item.slug)}">Join</a>
      </div>
      <p class="forum-card-copy">${escapeHtml(item.copy)}</p>
      <div class="forum-card-tags">${item.topics.slice(0, 2).map((topic) => `<span class="forum-card-tag">${escapeHtml(titleCase(topic))}</span>`).join('')}</div>
    `;
    return card;
  }

  function createSection(section) {
    const wrapper = document.createElement('section');
    wrapper.className = 'forum-section';
    wrapper.dataset.exploreSection = 'true';

    const head = document.createElement('div');
    head.className = 'forum-section-head';
    head.innerHTML = `<div><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.copy)}</p></div>`;

    const grid = document.createElement('div');
    grid.className = 'forum-community-grid';

    section.items.forEach((item, index) => {
      const card = createCard(item);
      if (index >= 3) {
        card.hidden = true;
        card.dataset.hiddenByMore = 'true';
      }
      grid.appendChild(card);
    });

    const footer = document.createElement('div');
    footer.className = 'forum-show-more-wrap';
    footer.innerHTML = '<button class="forum-show-more" type="button" data-explore-more>Show more</button>';

    wrapper.append(head, grid, footer);
    return wrapper;
  }

  function renderSections() {
    sectionsRoot.innerHTML = '';
    sectionDefinitions.forEach((section) => {
      sectionsRoot.appendChild(createSection(section));
    });
  }

  function applyFilters() {
    const sections = Array.from(sectionsRoot.querySelectorAll('[data-explore-section]'));
    let visibleSections = 0;

    sections.forEach((section) => {
      const cards = Array.from(section.querySelectorAll('.forum-explore-card'));
      const matchedCards = cards.filter((card, index) => {
        const item = sectionDefinitions[sections.indexOf(section)].items[index];
        const matches = cardMatches(item);
        card.dataset.matchesFilter = matches ? 'true' : 'false';
        card.hidden = !matches || (card.dataset.hiddenByMore === 'true');
        return matches;
      });

      const hiddenMatched = cards.filter((card) => card.dataset.matchesFilter === 'true' && card.dataset.hiddenByMore === 'true');
      const button = section.querySelector('[data-explore-more]');
      if (button) button.hidden = hiddenMatched.length === 0;

      section.hidden = matchedCards.length === 0;
      if (!section.hidden) visibleSections += 1;
    });

    emptyState.hidden = visibleSections > 0;
  }

  function bindSectionButtons() {
    sectionsRoot.querySelectorAll('[data-explore-more]').forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.closest('[data-explore-section]');
        if (!section) return;
        section.querySelectorAll('.forum-explore-card').forEach((card) => {
          if (card.dataset.matchesFilter === 'true') {
            card.dataset.hiddenByMore = 'false';
            card.hidden = false;
          }
        });
        button.hidden = true;
      });
    });
  }

  function bindJoinButtons() {
    sectionsRoot.querySelectorAll('[data-community-join]').forEach((link) => {
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        const href = link.getAttribute('href');
        if (!href) return;
        await ensureSignedInOrPrompt(href);
      });
    });
  }

  function refreshView() {
    renderSections();
    applyFilters();
    bindSectionButtons();
    bindJoinButtons();
  }

  topicButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = String(button.getAttribute('data-explore-topic') || 'all').trim().toLowerCase() || 'all';
      topicButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      refreshView();
    });
  });

  searchInput.addEventListener('input', () => {
    activeQuery = String(searchInput.value || '').trim().toLowerCase();
    refreshView();
  });

  refreshView();
}());
