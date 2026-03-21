(function () {
  const root = document.getElementById('forum-room-root');
  if (!root) return;

  const communities = {
    'strength-base': {
      name: 'Strength Base',
      image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=180&q=80',
      description: 'Programming-first conversations for lifters trying to build a better base before chasing fancy methods.',
      members: ['Marco Lift', 'Dana Pull', 'Owen Squat', 'Kay Bench', 'Lena Rows'],
      messages: [
        ['Marco Lift', 'Pinned a 4-day base split that keeps progression simple without overfilling the week.', '5 min ago'],
        ['Dana Pull', 'If your compounds keep stalling, post the last three weeks of sets before you add more volume.', '18 min ago'],
        ['Owen Squat', 'Best thread this morning is on when to hold steady instead of changing the whole plan.', '32 min ago']
      ]
    },
    'macro-kitchen': {
      name: 'Macro Kitchen',
      image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=180&q=80',
      description: 'High-protein meals, easier prep systems, and recipe ideas that do not wreck adherence.',
      members: ['Tia Prep', 'Miles Macro', 'Chef Noor', 'Rae Protein', 'Sam Batch'],
      messages: [
        ['Tia Prep', 'Dropped a 5-lunch rotation that stays around 45g protein without needing a ton of ingredients.', '7 min ago'],
        ['Miles Macro', 'The easy win this week is swapping one random snack for a predictable protein anchor.', '21 min ago'],
        ['Chef Noor', 'Posted a grocery template for people trying to eat cleaner without full meal prep on Sunday.', '41 min ago']
      ]
    },
    'recovery-reset': {
      name: 'Recovery Reset',
      image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=180&q=80',
      description: 'Sleep, soreness management, mobility, and the boring recovery habits that actually keep progress moving.',
      members: ['Ava Sleep', 'Ben Deload', 'Milo Mobility', 'Nia Reset', 'Theo Calm'],
      messages: [
        ['Ava Sleep', 'If your sleep slipped all week, pull one training variable down before you blame motivation.', '3 min ago'],
        ['Ben Deload', 'The top post right now is a good reminder that deloads are supposed to feel easier.', '16 min ago'],
        ['Milo Mobility', 'Shared a 10-minute reset flow for lifters who keep getting pinned up through the hips and t-spine.', '35 min ago']
      ]
    },
    'cut-phase-club': {
      name: 'Cut Phase Club',
      image: 'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=180&q=80',
      description: 'Deficit strategy, hunger control, and keeping muscle while leaning out without turning the process into chaos.',
      members: ['Elle Cut', 'Nate Scale', 'Omar Deficit', 'Jules Lean', 'Pia Fiber'],
      messages: [
        ['Elle Cut', 'The best thread today is on keeping protein steady before trying more aggressive calorie cuts.', '6 min ago'],
        ['Nate Scale', 'If hunger is spiking every night, check meal timing and food volume before lowering calories again.', '19 min ago'],
        ['Omar Deficit', 'Pinned a checklist for people who think the cut is failing when really adherence just got messy.', '44 min ago']
      ]
    },
    'form-check-lab': {
      name: 'Form Check Lab',
      image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=180&q=80',
      description: 'Technique breakdowns, movement tweaks, and lift discussions that keep training cleaner and safer.',
      members: ['Coach Eli', 'Marta Hinge', 'Paul Press', 'Jess Tempo', 'Rico Brace'],
      messages: [
        ['Coach Eli', 'Uploaded a breakdown on losing position out of the hole versus just not bracing hard enough.', '4 min ago'],
        ['Marta Hinge', 'If your RDL feels all lower back, slow the eccentric and post a side angle before changing the lift.', '24 min ago'],
        ['Paul Press', 'Bench thread of the day is on when elbow flare is actually the issue and when it is scap setup.', '39 min ago']
      ]
    },
    'consistency-wins': {
      name: 'Consistency Wins',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=180&q=80',
      description: 'A lane for staying steady when motivation dips and the real job becomes repeating useful days.',
      members: ['Nora Daily', 'Cam Steady', 'Iris Repeat', 'Moe Habit', 'Jae Focus'],
      messages: [
        ['Nora Daily', 'The thread getting the most replies is just people posting the smallest useful win they kept today.', '8 min ago'],
        ['Cam Steady', 'Consistency usually breaks at the schedule level before it breaks at the motivation level.', '17 min ago'],
        ['Iris Repeat', 'Dropped a template for getting back on plan after a messy week without doing something dramatic.', '29 min ago']
      ]
    }
  };

  const fallbackCommunity = {
    name: 'STRYVE Community',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=180&q=80',
    description: 'General discussion, active members, and the latest forum messages.',
    members: ['Ari', 'Lena', 'Theo', 'Jade', 'Marco'],
    messages: [
      ['Ari', 'Welcome in. Use this room like an active forum thread with people currently around.', '12 min ago'],
      ['Lena', 'Post what you are working on and someone will usually point you toward the right lane.', '26 min ago']
    ]
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCommunity() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('community') || '';
    const seeded = communities[slug];
    if (seeded) return { slug, data: seeded };
    return {
      slug,
      data: {
        ...fallbackCommunity,
        name: params.get('name') || fallbackCommunity.name,
        image: params.get('image') || fallbackCommunity.image,
        description: params.get('copy') || fallbackCommunity.description
      }
    };
  }

  function getRoomStorageKey(slug) {
    return `ode_forum_room_${slug || 'general'}_messages_v1`;
  }

  function readUserHint() {
    try {
      const raw = localStorage.getItem('ode_auth_user_hint_v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.user || null;
    } catch {
      return null;
    }
  }

  async function getSignedInUser() {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.user) return data.user;
    } catch {
      // ignore
    }
    return readUserHint();
  }

  function loadSavedMessages(slug) {
    try {
      const raw = localStorage.getItem(getRoomStorageKey(slug));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveMessages(slug, messages) {
    try {
      localStorage.setItem(getRoomStorageKey(slug), JSON.stringify(messages));
    } catch {
      // ignore
    }
  }

  function renderGate(targetHref) {
    root.innerHTML = `
      <section class="forum-room-gate">
        <h1>Sign in to join this room</h1>
        <p>You need to be signed in before you can enter community chat rooms and view the latest discussion.</p>
        <button type="button" id="forum-room-signin">Sign in</button>
      </section>
    `;
    const button = document.getElementById('forum-room-signin');
    button?.addEventListener('click', () => {
      try {
        sessionStorage.setItem('ode_auth_return_to', targetHref);
      } catch {
        // ignore
      }
      if (typeof window.odeOpenAuthModal === 'function') window.odeOpenAuthModal('login');
    });
  }

  function renderRoom(user, slug, community) {
    let savedMessages = loadSavedMessages(slug);
    const allMessages = [
      ...community.messages.map(([author, copy, time]) => ({ author, copy, time })),
      ...savedMessages
    ];

    root.innerHTML = `
      <section class="forum-room-shell">
        <div class="forum-room-topbar">
          <a class="forum-room-back" href="forum-explore.html"><span>&larr;</span>Back to Explore</a>
        </div>
        <div class="forum-room-layout">
          <section class="forum-room-main">
            <div class="forum-room-header">
              <div class="forum-room-avatar"><img src="${escapeHtml(community.image)}" alt=""></div>
              <div class="forum-room-title">
                <h1>${escapeHtml(community.name)}</h1>
                <p>${escapeHtml(community.description)}</p>
              </div>
            </div>
            <div class="forum-room-feed" id="forum-room-feed">
              ${allMessages.map((message) => `
                <article class="forum-message">
                  <div class="forum-message-head">
                    <span class="forum-message-user">${escapeHtml(message.author)}</span>
                    <span class="forum-message-time">${escapeHtml(message.time)}</span>
                  </div>
                  <p class="forum-message-copy">${escapeHtml(message.copy)}</p>
                </article>
              `).join('')}
            </div>
            <div class="forum-room-compose">
              <textarea id="forum-room-input" placeholder="Jump in. Ask a question, reply to the latest thread, or drop what you are working on."></textarea>
              <div class="forum-room-compose-row">
                <span class="forum-room-compose-note">Posting as ${escapeHtml(user.displayName || user.username || 'You')}.</span>
                <button class="forum-room-send" id="forum-room-send" type="button">Send message</button>
              </div>
            </div>
          </section>
          <aside class="forum-room-side">
            <div class="forum-side-block">
              <h2>Active now</h2>
              <div class="forum-member-list">
                ${community.members.map((member) => `
                  <div class="forum-member">
                    <div class="forum-member-avatar">${escapeHtml(member.slice(0, 2).toUpperCase())}</div>
                    <div><strong>${escapeHtml(member)}</strong><span>In the room now</span></div>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="forum-side-block">
              <h2>Room rhythm</h2>
              <p class="forum-room-compose-note">Most rooms behave like fast-moving forum threads: active members, recent conversation, and quick replies when the topic is specific.</p>
            </div>
          </aside>
        </div>
      </section>
    `;

    const input = document.getElementById('forum-room-input');
    const send = document.getElementById('forum-room-send');
    const feed = document.getElementById('forum-room-feed');

    function submitMessage() {
      const copy = String(input?.value || '').trim();
      if (!copy || !feed) return;
      const entry = {
        author: user.displayName || user.username || 'You',
        copy,
        time: 'Just now'
      };
      const nextSaved = [...savedMessages, entry];
      saveMessages(slug, nextSaved);
      savedMessages = nextSaved;
      const article = document.createElement('article');
      article.className = 'forum-message';
      article.innerHTML = `
        <div class="forum-message-head">
          <span class="forum-message-user">${escapeHtml(entry.author)}</span>
          <span class="forum-message-time">${escapeHtml(entry.time)}</span>
        </div>
        <p class="forum-message-copy">${escapeHtml(entry.copy)}</p>
      `;
      feed.appendChild(article);
      input.value = '';
    }

    send?.addEventListener('click', submitMessage);
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitMessage();
      }
    });
  }

  async function init() {
    const { slug, data } = getCommunity();
    const targetHref = `forum-community-room.html?community=${encodeURIComponent(slug)}`;
    const user = await getSignedInUser();
    if (!user) {
      renderGate(targetHref);
      return;
    }
    renderRoom(user, slug, data);
  }

  init();
}());
