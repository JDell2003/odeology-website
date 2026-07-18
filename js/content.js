/* RiseForIt — Content Program engine (/content).
   No AI. Reads the fixed template library (content-templates.js), slots in the
   trainer's questionnaire variables, and drives a calendar + check-ins +
   compliance score. State persists to localStorage and syncs to the trainer's
   account profile (profile.content_program) so it follows them across devices. */
(function () {
  'use strict';

  var LIB = window.RiseContentTemplates || {};
  var LS_KEY = 'ode_content_program_v1';
  var root = document.getElementById('cp-root');
  var modalEl = document.getElementById('cp-modal');
  var toastEl = document.getElementById('cp-toast');
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---------- date helpers (local, midnight-anchored) ----------
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var p = String(s || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0, 0, 0, 0); return x; }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }

  // ---------- state ----------
  var state = null;
  function defaultState() {
    return {
      v: 1,
      setupDone: false,
      vars: {
        audience: '', outcome: '', core: '', support1: '', support2: '',
        mistakes: ['', '', ''], story: '', proofName: '', proofResult: '',
        objection: '', days: 3, postDays: [1, 3, 5], link: '', name: ''
      },
      appWeekday: 5,          // weekday that holds the free-app post (pinned)
      startDate: ymd(today()),
      overrides: {},          // { 'YYYY-MM-DD': { type, reason, mistakeIndex } }
      checkins: {},           // { 'YYYY-MM-DD': { posted, stories, reason } }
      storiesDone: {},        // { 'YYYY-MM-DD': [b,b,b,b,b] }
      editLog: [],            // { date, type, reason, at }
      reminderTime: '18:00',
      lastPack: 0             // last streak milestone that granted an idea pack
    };
  }
  function loadLocal() {
    try { var raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (raw && raw.vars) return raw; } catch (e) {}
    return null;
  }
  var saveTimer = 0;
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToProfile, 900);
  }
  function saveToProfile() {
    try {
      fetch('/api/profile', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { content_program: state } })
      }).catch(function () {});
    } catch (e) {}
  }
  function loadFromProfile() {
    return fetch('/api/profile', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var cp = j && j.profile && j.profile.profile && j.profile.profile.content_program;
        return (cp && cp.vars) ? cp : null;
      })
      .catch(function () { return null; });
  }

  // ---------- variable fill ----------
  function trainerName() {
    if (state.vars.name) return state.vars.name;
    try { var u = window.__odeCurrentUser; if (u && (u.displayName || u.username)) return (u.displayName || u.username); } catch (e) {}
    return 'your coach';
  }
  function fill(str, mistakeForCycle) {
    var v = state.vars;
    var map = {
      '{audience}': v.audience || 'the people you train',
      '{outcome}': v.outcome || 'reach their goal',
      '{core}': v.core || 'the fundamentals',
      '{support1}': v.support1 || '',
      '{support2}': v.support2 || '',
      '{mistake1}': v.mistakes[0] || 'the same old mistake',
      '{mistake2}': v.mistakes[1] || v.mistakes[0] || 'the same old mistake',
      '{mistake3}': v.mistakes[2] || v.mistakes[0] || 'the same old mistake',
      '{mistake}': mistakeForCycle || v.mistakes[0] || 'the same old mistake',
      '{story}': v.story || 'I found what actually works',
      '{proofName}': v.proofName || 'a client of mine',
      '{proofResult}': v.proofResult || 'a result they were proud of',
      '{objection}': v.objection || '',
      '{name}': trainerName(),
      '{link}': v.link || 'the link in my bio'
    };
    return String(str || '').replace(/\{[a-zA-Z0-9]+\}/g, function (m) { return (m in map) ? map[m] : m; });
  }
  function ctaText() { return fill(LIB.cta || ''); }

  // ---------- schedule / job for a date ----------
  // Base job (before overrides): app-weekday post-days = 'app'; other post-days
  // alternate win/mistake; non-post-days = 'stories'.
  function isPostDay(d) { return state.vars.postDays.indexOf(d.getDay()) !== -1; }
  function baseJob(d) {
    if (!isPostDay(d)) return 'stories';
    if (d.getDay() === state.appWeekday) return 'app';
    // count non-app post days from startDate up to (and incl.) d → alternate
    var start = parseYmd(state.startDate);
    if (d < start) start = d;
    var n = 0;
    for (var c = new Date(start); c <= d; c = addDays(c, 1)) {
      if (isPostDay(c) && c.getDay() !== state.appWeekday) n++;
    }
    return (n % 2 === 1) ? 'win' : 'mistake';
  }
  function jobFor(d) {
    var key = ymd(d);
    if (state.overrides[key] && state.overrides[key].type) return state.overrides[key].type;
    return baseJob(d);
  }

  // deterministic template index: how many of this job type have occurred from
  // startDate through the date (so each date maps to a stable template).
  function occurrenceIndex(d, type) {
    var start = parseYmd(state.startDate);
    if (d < start) return 0;
    var n = 0;
    for (var c = new Date(start); c <= d; c = addDays(c, 1)) { if (jobFor(c) === type) n++; }
    return Math.max(0, n - 1);
  }

  // ---------- script generation ----------
  function pick(arr, i) { return (arr && arr.length) ? arr[i % arr.length] : ''; }

  function scriptFor(d) {
    var type = jobFor(d);
    var key = ymd(d);
    if (type === 'rest') return { type: type, title: 'Rest', script: '', prompt: '', hookNote: '' };
    if (type === 'stories') return { type: type, title: 'Stories only', script: '', prompt: LIB.prompts && LIB.prompts.stories || '', hookNote: '' };

    var idx = occurrenceIndex(d, type);
    var cta = ctaText();

    if (type === 'win') {
      var body = fill(pick(LIB.win, idx));
      return { type: type, title: 'The win', script: body + '\n\n' + cta, prompt: LIB.prompts.win, hookNote: '' };
    }
    if (type === 'app') {
      var appBody = fill(pick(LIB.app, idx));
      return { type: type, title: 'Free-app post', script: appBody + '\n\n' + cta, prompt: LIB.prompts.app, hookNote: '' };
    }
    // mistake — cycle the trainer's mistakes, open with a group hook
    var mistakes = state.vars.mistakes.filter(function (m) { return String(m || '').trim(); });
    var mIndex = state.overrides[key] && typeof state.overrides[key].mistakeIndex === 'number'
      ? state.overrides[key].mistakeIndex
      : (idx % Math.max(1, mistakes.length));
    var mistake = mistakes[mIndex] || mistakes[0] || '';
    var hook = fill(pick(LIB.hooks, idx), mistake);
    var mBody = fill(pick(LIB.mistake, idx), mistake);
    return { type: type, title: 'The mistake', script: hook + '\n\n' + mBody + '\n\n' + cta, prompt: LIB.prompts.mistake, hookNote: LIB.prompts.hook };
  }

  function storiesFor(d) {
    var idx = daysBetween(state.startDate, ymd(d));
    if (idx < 0) idx = 0;
    var s = LIB.stories || {};
    var slots = [
      { slot: 'Lead — morning', line: fill(pick(s.lead_morning, idx)) },
      { slot: 'Lead + Relate — a thought', line: fill(pick(s.lead_thought, idx)) },
      { slot: 'Relate — progress', line: fill(pick(s.relate_progress, idx)) },
      { slot: 'Relate — right now', line: fill(pick(s.relate_now, idx)) },
      { slot: 'Attack — the ask', line: fill(pick(s.attack_ask, idx)) }
    ];
    return slots;
  }

  // ---------- compliance / streak ----------
  function assignedTasks(d) {
    // every day: stories task; posting days: + a post task
    var job = jobFor(d);
    var t = { post: (job === 'win' || job === 'mistake' || job === 'app'), stories: (job !== 'rest') };
    return t;
  }
  function dayCompletion(d) {
    var key = ymd(d);
    var a = assignedTasks(d);
    var ci = state.checkins[key] || {};
    var total = 0, done = 0;
    if (a.post) { total++; if (ci.posted) done++; }
    if (a.stories) { total++; done += (ci.stories === 'yes') ? 1 : (ci.stories === 'partial') ? 0.5 : 0; }
    return { total: total, done: done };
  }
  function compliancePct(windowDays) {
    var end = today();
    var start = addDays(end, -(windowDays - 1));
    var progStart = parseYmd(state.startDate);
    if (start < progStart) start = progStart;
    var total = 0, done = 0;
    for (var c = new Date(start); c <= end; c = addDays(c, 1)) {
      var r = dayCompletion(c); total += r.total; done += r.done;
    }
    if (total <= 0) return null;
    return Math.round((done / total) * 100);
  }
  function onProgramDay(d) {
    var a = assignedTasks(d); var ci = state.checkins[ymd(d)] || {};
    if (a.post && !ci.posted) return false;
    if (a.stories && (ci.stories === 'no' || ci.stories == null)) return false;
    return (a.post || a.stories);
  }
  function currentStreak() {
    var n = 0; var d = today();
    // allow today to be "not logged yet" — start the count from yesterday if today has no check-in
    if (!state.checkins[ymd(d)]) d = addDays(d, -1);
    while (d >= parseYmd(state.startDate)) {
      if (onProgramDay(d)) { n++; d = addDays(d, -1); } else break;
    }
    return n;
  }

  // ---------- UI helpers ----------
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }
  function copyText(txt, okMsg) {
    var done = function () { toast(okMsg || 'Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(function () { legacyCopy(txt); done(); });
    } else { legacyCopy(txt); done(); }
  }
  function legacyCopy(txt) {
    try { var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (e) {}
  }
  function openModal(node) { modalEl.innerHTML = ''; var card = el('div', 'cp-modal-card'); card.appendChild(node); modalEl.appendChild(card); modalEl.hidden = false; modalEl.onclick = function (e) { if (e.target === modalEl) closeModal(); }; }
  function closeModal() { modalEl.hidden = true; modalEl.innerHTML = ''; }

  // ================= QUESTIONNAIRE =================
  var AUDIENCE_CHIPS = ['men over 30', 'busy moms', 'beginners in their first year', 'guys who used to be athletes', 'women over 40', 'new lifters'];
  var CORE_CHIPS = ['eating enough protein', 'training with intent', 'strength before cardio', 'recovery and sleep', 'consistency over intensity'];

  function isSingularOrVague(text) {
    var t = String(text || '').trim().toLowerCase();
    if (!t) return true;
    if (/^(you|people|everyone|anyone|someone|clients?|person|him|her|them|me|i)$/.test(t)) return true;
    // must read as a plural group — require a plural-ish word or a group phrase
    var plural = /(s|men|women|folks|guys|moms|dads|people|lifters|athletes|beginners)\b/.test(t);
    var startsYou = /^you\b/.test(t);
    if (startsYou) return true;
    return !plural;
  }

  function renderQuestionnaire(existing) {
    var draft = existing ? JSON.parse(JSON.stringify(existing)) : defaultState().vars;
    if (!draft.mistakes) draft.mistakes = ['', '', ''];
    while (draft.mistakes.length < 3) draft.mistakes.push('');
    draft.link = draft.link || autoLink();

    root.innerHTML = '';
    root.appendChild(el('span', 'cp-kicker', 'Content Program'));
    root.appendChild(el('h1', 'cp-h1', 'Set up your program'));
    root.appendChild(el('p', 'cp-sub', 'Answer these once. Every post you get is built from your answers — no AI, just your words slotted into proven templates. You can edit all of it later.'));

    var steps = [];
    function addStep(builder) { steps.push(builder); }

    // audience
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'Who do you train?'));
      wrap.appendChild(el('p', 'cp-help', 'Say it the way you’d describe them out loud. It has to be a group (plural) — that’s what makes every hook work.'));
      var gb = el('div', 'cp-goodbad');
      gb.appendChild(el('div', 'cp-gb good', '<b>Good:</b> “men over 30 who used to be athletes”'));
      gb.appendChild(el('div', 'cp-gb bad', '<b>Bad:</b> “you” or “people who want to get fit”'));
      wrap.appendChild(gb);
      var chips = el('div', 'cp-chips');
      AUDIENCE_CHIPS.forEach(function (c) { var b = el('button', 'cp-chip', esc(c)); b.type = 'button'; b.onclick = function () { inp.value = c; err.textContent = ''; }; chips.appendChild(b); });
      wrap.appendChild(chips);
      var inp = el('input', 'cp-input'); inp.value = draft.audience || ''; inp.placeholder = 'e.g. men over 30'; inp.setAttribute('aria-label', 'Who do you train');
      wrap.appendChild(inp);
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      return {
        validate: function () { if (isSingularOrVague(inp.value)) { err.textContent = 'Make it a plural group — not “you”, “people”, or one person.'; return false; } return true; },
        save: function () { draft.audience = inp.value.trim(); }
      };
    });

    // outcome
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'What do they get from working with you? One line.'));
      wrap.appendChild(el('p', 'cp-help', 'The transformation, in their words.'));
      var inp = el('textarea', 'cp-textarea'); inp.value = draft.outcome || ''; inp.placeholder = 'e.g. lose 30 lbs without giving up food they like';
      wrap.appendChild(inp);
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      return { validate: function () { if (inp.value.trim().length < 4) { err.textContent = 'Give it a full line.'; return false; } return true; }, save: function () { draft.outcome = inp.value.trim(); } };
    });

    // core
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'What’s the ONE thing you want to be known for?'));
      wrap.appendChild(el('p', 'cp-help', 'Your angle. The thing you say when others won’t.'));
      var chips = el('div', 'cp-chips');
      CORE_CHIPS.forEach(function (c) { var b = el('button', 'cp-chip', esc(c)); b.type = 'button'; b.onclick = function () { inp.value = c; err.textContent = ''; }; chips.appendChild(b); });
      wrap.appendChild(chips);
      var inp = el('input', 'cp-input'); inp.value = draft.core || ''; inp.placeholder = 'e.g. eating enough protein';
      wrap.appendChild(inp);
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      return { validate: function () { if (inp.value.trim().length < 3) { err.textContent = 'Name your one thing.'; return false; } return true; }, save: function () { draft.core = inp.value.trim(); } };
    });

    // supports
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'Two things that back that up.'));
      wrap.appendChild(el('p', 'cp-help', 'The reasons your one thing is right.'));
      var i1 = el('input', 'cp-input'); i1.value = draft.support1 || ''; i1.placeholder = 'Backs it up #1';
      var f1 = el('div', 'cp-field'); f1.appendChild(i1); wrap.appendChild(f1);
      var i2 = el('input', 'cp-input'); i2.value = draft.support2 || ''; i2.placeholder = 'Backs it up #2';
      var f2 = el('div', 'cp-field'); f2.appendChild(i2); wrap.appendChild(f2);
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      return { validate: function () { if (!i1.value.trim() || !i2.value.trim()) { err.textContent = 'Both, please.'; return false; } return true; }, save: function () { draft.support1 = i1.value.trim(); draft.support2 = i2.value.trim(); } };
    });

    // mistakes x3
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'Name three things you constantly see them get wrong.'));
      wrap.appendChild(el('p', 'cp-help', 'All three — the system cycles these for weeks so it never repeats. One isn’t enough.'));
      var ins = [];
      for (var i = 0; i < 3; i++) {
        var f = el('div', 'cp-field'); var inp = el('input', 'cp-input'); inp.value = draft.mistakes[i] || ''; inp.placeholder = 'Mistake #' + (i + 1); f.appendChild(inp); wrap.appendChild(f); ins.push(inp);
      }
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      return { validate: function () { if (ins.some(function (x) { return !x.value.trim(); })) { err.textContent = 'All three are required.'; return false; } return true; }, save: function () { draft.mistakes = ins.map(function (x) { return x.value.trim(); }); } };
    });

    // story
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'What changed for you? One line.'));
      wrap.appendChild(el('p', 'cp-help', 'Your turning point — it shows up in your stories.'));
      var inp = el('textarea', 'cp-textarea'); inp.value = draft.story || ''; inp.placeholder = 'e.g. I stopped chasing motivation and built a system';
      wrap.appendChild(inp);
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      return { validate: function () { if (inp.value.trim().length < 4) { err.textContent = 'One honest line.'; return false; } return true; }, save: function () { draft.story = inp.value.trim(); } };
    });

    // proof
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'Name one person you’ve gotten a result for, and what it was.'));
      wrap.appendChild(el('p', 'cp-help', 'First name or initial is fine.'));
      var i1 = el('input', 'cp-input'); i1.value = draft.proofName || ''; i1.placeholder = 'Name / initial (e.g. “J.”)';
      var f1 = el('div', 'cp-field'); f1.appendChild(i1); wrap.appendChild(f1);
      var i2 = el('input', 'cp-input'); i2.value = draft.proofResult || ''; i2.placeholder = 'The result (e.g. down 24 lbs in 12 weeks)';
      var f2 = el('div', 'cp-field'); f2.appendChild(i2); wrap.appendChild(f2);
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      return { validate: function () { if (!i1.value.trim() || !i2.value.trim()) { err.textContent = 'Name and result.'; return false; } return true; }, save: function () { draft.proofName = i1.value.trim(); draft.proofResult = i2.value.trim(); } };
    });

    // objection
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'When someone doesn’t sign up, what’s usually the reason?'));
      wrap.appendChild(el('p', 'cp-help', 'The thing in their head that stops them.'));
      var inp = el('textarea', 'cp-textarea'); inp.value = draft.objection || ''; inp.placeholder = 'e.g. they think they don’t have time';
      wrap.appendChild(inp);
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      return { validate: function () { if (inp.value.trim().length < 3) { err.textContent = 'One line.'; return false; } return true; }, save: function () { draft.objection = inp.value.trim(); } };
    });

    // days + post_days
    addStep(function (wrap) {
      wrap.appendChild(el('p', 'cp-ask', 'How many days a week can you actually post?'));
      wrap.appendChild(el('p', 'cp-help', 'Start at 3 — you’ll add days later.'));
      var seg = el('div', 'cp-seg'); var chosen = draft.days || 3; var segBtns = {};
      [3, 4, 5].forEach(function (n) { var b = el('button', chosen === n ? 'on' : ''); b.type = 'button'; b.textContent = n; b.onclick = function () { chosen = n; Object.keys(segBtns).forEach(function (k) { segBtns[k].classList.toggle('on', +k === n); }); syncDayLimit(); }; seg.appendChild(b); segBtns[n] = b; });
      wrap.appendChild(seg);
      wrap.appendChild(el('p', 'cp-ask', 'Which days?')).style.marginTop = '14px';
      var picked = (draft.postDays && draft.postDays.length) ? draft.postDays.slice() : [1, 3, 5];
      var daySel = el('div', 'cp-daysel'); var dayBtns = [];
      for (var i = 0; i < 7; i++) (function (i) {
        var b = el('button', picked.indexOf(i) !== -1 ? 'cp-day on' : 'cp-day'); b.type = 'button'; b.textContent = DOW[i];
        b.onclick = function () { var at = picked.indexOf(i); if (at !== -1) picked.splice(at, 1); else picked.push(i); syncDayLimit(); render(); };
        daySel.appendChild(b); dayBtns.push(b);
      })(i);
      wrap.appendChild(daySel);
      var err = el('p', 'cp-err'); wrap.appendChild(err);
      function render() { for (var i = 0; i < 7; i++) dayBtns[i].classList.toggle('on', picked.indexOf(i) !== -1); }
      function syncDayLimit() { if (picked.length > chosen) picked = picked.slice(0, chosen); err.textContent = picked.length !== chosen ? ('Pick ' + chosen + ' day' + (chosen > 1 ? 's' : '') + ' (' + picked.length + ' selected).') : ''; render(); }
      syncDayLimit();
      return {
        validate: function () { if (picked.length !== chosen) { err.textContent = 'Pick exactly ' + chosen + ' days.'; return false; } return true; },
        save: function () { draft.days = chosen; picked.sort(function (a, b) { return a - b; }); draft.postDays = picked.slice(); }
      };
    });

    // render step-by-step
    var stepIndex = 0; var current = null;
    var stepWrap = el('div', 'cp-card cp-q');
    root.appendChild(stepWrap);
    var prog = el('div', 'cp-progress'); for (var i = 0; i < steps.length; i++) prog.appendChild(el('i')); root.insertBefore(prog, stepWrap);
    var nav = el('div', 'cp-copyrow'); nav.style.marginTop = '14px';
    var backBtn = el('button', 'cp-btn cp-btn-ghost', 'Back'); backBtn.type = 'button';
    var nextBtn = el('button', 'cp-btn cp-btn-primary', 'Next'); nextBtn.type = 'button';
    root.appendChild(nav);

    function drawStep() {
      stepWrap.innerHTML = ''; current = steps[stepIndex](stepWrap);
      for (var i = 0; i < steps.length; i++) prog.children[i].classList.toggle('on', i <= stepIndex);
      nav.innerHTML = ''; if (stepIndex > 0) nav.appendChild(backBtn);
      nextBtn.textContent = (stepIndex === steps.length - 1) ? 'Finish & generate' : 'Next';
      nav.appendChild(nextBtn);
      window.scrollTo(0, 0);
    }
    backBtn.onclick = function () { if (stepIndex > 0) { stepIndex--; drawStep(); } };
    nextBtn.onclick = function () {
      if (current && !current.validate()) return;
      if (current) current.save();
      if (stepIndex < steps.length - 1) { stepIndex++; drawStep(); }
      else finishSetup(draft);
    };
    drawStep();
  }

  function finishSetup(draftVars) {
    var fresh = !state.setupDone;
    if (fresh) { var base = defaultState(); base.reminderTime = state.reminderTime || base.reminderTime; state = base; }
    state.vars = draftVars;
    state.vars.name = trainerName();
    if (!state.vars.postDays.length) state.vars.postDays = [1, 3, 5];
    // app day = last selected post day (a sensible, movable default)
    if (state.vars.postDays.indexOf(state.appWeekday) === -1) state.appWeekday = state.vars.postDays[state.vars.postDays.length - 1];
    state.startDate = ymd(today());
    state.setupDone = true;
    persist();
    toast('Program ready');
    renderDashboard();
  }

  // ================= DASHBOARD =================
  function renderDashboard() {
    root.innerHTML = '';
    var head = el('div');
    head.appendChild(el('span', 'cp-kicker', 'Content Program'));
    var titleRow = el('div'); titleRow.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;';
    titleRow.appendChild(el('h1', 'cp-h1', 'Today'));
    var redo = el('button', 'cp-btn cp-btn-ghost sm', 'Redo my program'); redo.type = 'button'; redo.onclick = function () { renderQuestionnaire(state.vars); };
    titleRow.appendChild(redo);
    head.appendChild(titleRow);
    root.appendChild(head);

    renderTodayCard();
    renderStrip();
    renderCompliance();
    renderLinkRow();
    renderReminderRow();
  }

  function renderTodayCard() {
    var d = today(); var key = ymd(d);
    var s = scriptFor(d);
    var card = el('div', 'cp-today');
    var headEl = el('div', 'cp-today-head');
    headEl.appendChild(el('span', 'cp-today-date', DOW_FULL[d.getDay()] + ' · ' + (d.getMonth() + 1) + '/' + d.getDate()));
    headEl.appendChild(el('span', 'cp-jobtag ' + s.type, jobLabel(s.type)));
    card.appendChild(headEl);

    var body = el('div', 'cp-today-body');
    body.appendChild(el('h2', 'cp-jobtitle', s.title));

    if (s.type === 'stories') {
      body.appendChild(el('p', 'cp-sub', 'No feed post today — just your 5 stories. That’s where the trust is built.'));
    } else if (s.type === 'rest') {
      body.appendChild(el('p', 'cp-sub', 'Rest day. Still get your stories up if you can.'));
    } else {
      if (s.prompt) { var p = el('div', 'cp-prompt'); p.innerHTML = '<b>Why this post:</b> ' + esc(s.prompt); body.appendChild(p); }
      var script = el('div', 'cp-script'); script.textContent = s.script; body.appendChild(script);
      if (s.hookNote) body.appendChild(el('p', 'cp-hooknote', s.hookNote));

      var copyRow = el('div', 'cp-copyrow');
      var copyScript = el('button', 'cp-btn cp-btn-primary', 'Copy caption'); copyScript.type = 'button'; copyScript.onclick = function () { copyText(s.script, 'Caption copied'); };
      copyRow.appendChild(copyScript);
      body.appendChild(copyRow);

      // locked CTA box
      var ctaBox = el('div', 'cp-cta-box');
      ctaBox.appendChild(el('div', 'cp-label', 'Your locked CTA'));
      ctaBox.appendChild(el('p', 'cp-cta-text', esc(ctaText())));
      ctaBox.appendChild(el('p', 'cp-cta-why', (LIB.prompts && LIB.prompts.cta) || 'Same words every time. That’s what makes it stick.'));
      var copyCta = el('button', 'cp-btn cp-btn-ghost sm', 'Copy CTA'); copyCta.type = 'button'; copyCta.style.marginTop = '8px'; copyCta.onclick = function () { copyText(ctaText(), 'CTA copied'); };
      ctaBox.appendChild(copyCta);
      body.appendChild(ctaBox);
    }

    // stories checklist (always)
    body.appendChild(renderStories(d));

    // I posted / locked today
    var ci = state.checkins[key] || {};
    var posted = el('button', 'cp-btn cp-btn-primary cp-iposted', ci.posted ? '✓ Posted today' : 'I posted');
    posted.type = 'button';
    if (ci.posted) { posted.classList.remove('cp-btn-primary'); posted.classList.add('cp-btn-ghost'); }
    posted.onclick = function () { openCheckin(d); };
    body.appendChild(posted);
    body.appendChild(el('p', 'cp-hooknote', 'Today’s locked in. You can change future days.'));

    card.appendChild(body);
    root.appendChild(card);
  }

  function renderStories(d) {
    var key = ymd(d);
    var slots = storiesFor(d);
    var doneArr = state.storiesDone[key] || [false, false, false, false, false];
    var wrap = el('div', 'cp-stories');
    var count = doneArr.filter(Boolean).length;
    var titleRow = el('div'); titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:6px;';
    titleRow.appendChild(el('span', 'cp-label', 'Stories · ' + count + '/5'));
    var copyAll = el('button', 'cp-btn cp-btn-ghost sm', 'Copy all 5'); copyAll.type = 'button';
    copyAll.onclick = function () { copyText(slots.map(function (x, i) { return (i + 1) + '. ' + x.line; }).join('\n\n'), 'All 5 stories copied'); };
    titleRow.appendChild(copyAll);
    wrap.appendChild(titleRow);

    slots.forEach(function (slot, i) {
      var row = el('div', 'cp-story');
      row.appendChild(el('div', 'cp-story-n', String(i + 1)));
      var txt = el('div', 'cp-story-txt');
      txt.appendChild(el('div', 'cp-story-slot', esc(slot.slot)));
      txt.appendChild(el('div', 'cp-story-line', esc(slot.line)));
      var actions = el('div'); actions.style.cssText = 'display:flex;gap:6px;flex-direction:column;';
      var cp = el('button', 'cp-story-check', '⧉'); cp.type = 'button'; cp.title = 'Copy'; cp.setAttribute('aria-label', 'Copy story ' + (i + 1)); cp.style.fontSize = '0.9rem';
      cp.onclick = function () { copyText(slot.line, 'Story ' + (i + 1) + ' copied'); };
      var chk = el('button', 'cp-story-check' + (doneArr[i] ? ' done' : ''), doneArr[i] ? '✓' : ''); chk.type = 'button'; chk.setAttribute('aria-label', 'Mark story ' + (i + 1) + ' done');
      chk.onclick = function () { doneArr[i] = !doneArr[i]; state.storiesDone[key] = doneArr; persist(); renderDashboard(); };
      actions.appendChild(chk); actions.appendChild(cp);
      row.appendChild(txt); row.appendChild(actions);
      wrap.appendChild(row);
    });
    wrap.appendChild(el('p', 'cp-hooknote', (LIB.prompts && LIB.prompts.stories) || ''));
    return wrap;
  }

  function renderStrip() {
    root.appendChild(el('h3', 'cp-section-title', 'Next 14 days'));
    var strip = el('div', 'cp-strip');
    var start = today();
    for (var i = 0; i < 14; i++) {
      (function (i) {
        var d = addDays(start, i); var key = ymd(d); var job = jobFor(d);
        var cell = el('div', 'cp-day-cell' + (i === 0 ? ' today' : '') + (i > 0 ? ' editable' : ''));
        cell.appendChild(el('div', 'cp-dc-dow', DOW[d.getDay()]));
        cell.appendChild(el('div', 'cp-dc-date', String(d.getDate())));
        cell.appendChild(el('div', 'cp-dc-job ' + job, stripLabel(job)));
        // status dot
        var dotCls = 'upcoming';
        if (i === 0) { var r = dayCompletion(d); dotCls = (r.total > 0 && r.done >= r.total) ? 'done' : 'upcoming'; }
        cell.appendChild(el('div', 'cp-dc-dot ' + dotCls));
        if (i > 0) { cell.appendChild(el('div', 'cp-dc-pencil', '✎')); cell.onclick = function () { openEditDay(d); }; cell.setAttribute('role', 'button'); cell.tabIndex = 0; cell.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditDay(d); } }; }
        else { cell.onclick = function () { toast('Today’s locked in. You can change future days.'); }; }
        strip.appendChild(cell);
      })(i);
    }
    root.appendChild(strip);
  }

  function renderCompliance() {
    var p7 = compliancePct(7); var p30 = compliancePct(30);
    var streak = currentStreak();
    root.appendChild(el('h3', 'cp-section-title', 'Compliance'));
    var band = (p7 == null) ? 'amber' : (p7 >= 85 ? 'green' : p7 >= 60 ? 'amber' : 'red');
    var bandLabel = (p7 == null) ? 'No data yet' : (p7 >= 85 ? 'On program' : p7 >= 60 ? 'Slipping' : 'Off program');
    var card = el('div', 'cp-card cp-score ' + band);
    var row = el('div', 'cp-score-row');
    var main = el('div');
    main.appendChild(el('span', 'cp-score-num', (p7 == null ? '—' : p7 + '%')));
    main.appendChild(el('span', 'cp-band', bandLabel));
    row.appendChild(main);
    card.appendChild(row);
    card.appendChild(el('div', 'cp-score-30', '7-day · 30-day: ' + (p30 == null ? '—' : p30 + '%') + '  ·  Streak: ' + streak + ' day' + (streak === 1 ? '' : 's')));
    card.appendChild(el('p', 'cp-note', 'This is the same number you’d give a client who says they’re “kind of” following the plan.'));
    if (streak === 0 && Object.keys(state.checkins).length > 0) card.appendChild(el('p', 'cp-note', 'Streak reset. You’re one post from a new one.'));
    root.appendChild(card);

    // unlocks
    var milestone = streak >= 60 ? 60 : streak >= 30 ? 30 : 0;
    if (milestone && state.lastPack < milestone) {
      var u = el('div', 'cp-card cp-unlock');
      u.appendChild(el('div', 'cp-label', '⭐ ' + milestone + '-day streak'));
      u.appendChild(el('p', 'cp-sub', milestone === 30 ? 'On program a full month. Ready to add a posting day?' : 'Two months in. Add another day and take the next pack.'));
      var brow = el('div', 'cp-copyrow');
      if (state.vars.days < 5) { var bump = el('button', 'cp-btn cp-btn-primary', 'Add a posting day (→ ' + (state.vars.days + 1) + ')'); bump.type = 'button'; bump.onclick = function () { renderQuestionnaire(state.vars); }; brow.appendChild(bump); }
      var pack = el('button', 'cp-btn cp-btn-ghost', 'Get my 5-post idea pack'); pack.type = 'button'; pack.onclick = function () { state.lastPack = milestone; persist(); showIdeaPack(milestone); }; brow.appendChild(pack);
      u.appendChild(brow);
      root.appendChild(u);
    }
  }

  function renderLinkRow() {
    root.appendChild(el('h3', 'cp-section-title', 'Your landing page link'));
    var card = el('div', 'cp-card');
    var row = el('div', 'cp-linkrow');
    var inp = el('input', 'cp-input'); inp.value = state.vars.link || autoLink(); inp.setAttribute('aria-label', 'Landing page link');
    inp.onchange = function () { state.vars.link = inp.value.trim(); persist(); };
    var copy = el('button', 'cp-btn cp-btn-primary sm', 'Copy'); copy.type = 'button'; copy.onclick = function () { copyText(inp.value.trim(), 'Link copied'); };
    row.appendChild(inp); row.appendChild(copy);
    card.appendChild(row);
    root.appendChild(card);
  }

  function renderReminderRow() {
    root.appendChild(el('h3', 'cp-section-title', 'Daily reminder'));
    var card = el('div', 'cp-card');
    var row = el('div', 'cp-linkrow');
    var inp = el('input', 'cp-input'); inp.type = 'time'; inp.value = state.reminderTime || '18:00'; inp.setAttribute('aria-label', 'Reminder time');
    inp.onchange = function () { state.reminderTime = inp.value; persist(); scheduleReminder(); toast('Reminder set for ' + inp.value); };
    var test = el('button', 'cp-btn cp-btn-ghost sm', 'Enable'); test.type = 'button'; test.onclick = function () { enableNotifications(); };
    row.appendChild(inp); row.appendChild(test);
    card.appendChild(row);
    card.appendChild(el('p', 'cp-note', 'We’ll name the job: “Wednesday — mistake post. Tap for your script.” A web page can only remind you while it’s open, so keep RiseForIt pinned — full background reminders come with the installed app.'));
    root.appendChild(card);
  }

  // ---------- labels ----------
  function jobLabel(t) { return { win: 'Win', mistake: 'Mistake', app: 'Free app', rest: 'Rest', stories: 'Stories only' }[t] || t; }
  function stripLabel(t) { return { win: 'Win', mistake: 'Mistake', app: 'App', rest: 'Rest', stories: 'Stories' }[t] || t; }

  // ================= CHECK-IN =================
  function openCheckin(d) {
    var key = ymd(d); var ci = state.checkins[key] || {};
    var node = el('div');
    node.appendChild(el('h3', null, 'Today’s check-in'));
    node.appendChild(el('p', 'cp-sub', 'One tap. Be honest — this is your compliance score.'));

    node.appendChild(el('p', 'cp-ask', 'Did you post today?'));
    var postSeg = el('div', 'cp-seg'); var postVal = ci.posted === true ? 'yes' : (ci.posted === false ? 'no' : null);
    ['Yes', 'No'].forEach(function (lbl) { var b = el('button', (postVal === lbl.toLowerCase()) ? 'on' : ''); b.type = 'button'; b.textContent = lbl; b.onclick = function () { postVal = lbl.toLowerCase(); [].forEach.call(postSeg.children, function (c) { c.classList.toggle('on', c.textContent === lbl); }); }; postSeg.appendChild(b); });
    node.appendChild(postSeg);

    var storiesAsk = el('p', 'cp-ask', 'Did you get your stories up?'); storiesAsk.style.marginTop = '14px'; node.appendChild(storiesAsk);
    var stSeg = el('div', 'cp-seg'); var stVal = ci.stories || null;
    [['Yes', 'yes'], ['Partial', 'partial'], ['No', 'no']].forEach(function (pair) { var b = el('button', (stVal === pair[1]) ? 'on' : ''); b.type = 'button'; b.textContent = pair[0]; b.onclick = function () { stVal = pair[1]; [].forEach.call(stSeg.children, function (c) { c.classList.toggle('on', c.textContent === pair[0]); }); reasonWrap.style.display = needReason() ? 'block' : 'none'; }; stSeg.appendChild(b); });
    node.appendChild(stSeg);

    function needReason() { return postVal === 'no' || stVal === 'no'; }
    var reasonWrap = el('div'); reasonWrap.style.marginTop = '14px';
    reasonWrap.appendChild(el('p', 'cp-ask', 'What got in the way?'));
    var reasonSeg = el('div'); reasonSeg.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    var reasonVal = ci.reason || null;
    [['no time', 'no time'], ['didn’t know what to say', 'didnt know'], ['forgot', 'forgot'], ['didn’t feel like it', 'didnt feel']].forEach(function (pair) { var b = el('button', 'cp-chip'); b.type = 'button'; b.textContent = pair[0]; if (reasonVal === pair[1]) { b.classList.add('on'); b.style.cssText = 'background:var(--accent);border-color:var(--accent);color:#1c1206;'; } b.onclick = function () { reasonVal = pair[1]; [].forEach.call(reasonSeg.children, function (c) { c.style.cssText = ''; c.classList.remove('on'); }); b.style.cssText = 'background:var(--accent);border-color:var(--accent);color:#1c1206;'; }; reasonSeg.appendChild(b); });
    reasonWrap.appendChild(reasonSeg);
    reasonWrap.style.display = needReason() ? 'block' : 'none';
    node.appendChild(reasonWrap);

    var save = el('button', 'cp-btn cp-btn-primary', 'Save check-in'); save.type = 'button'; save.style.marginTop = '16px';
    save.onclick = function () {
      state.checkins[key] = { posted: postVal === 'yes', stories: stVal || 'no', reason: needReason() ? (reasonVal || '') : '' };
      persist(); closeModal(); toast('Logged'); renderDashboard();
    };
    node.appendChild(save);
    var cancel = el('button', 'cp-btn cp-btn-ghost', 'Cancel'); cancel.type = 'button'; cancel.style.marginTop = '8px'; cancel.onclick = closeModal; node.appendChild(cancel);
    openModal(node);
  }

  // ================= EDIT FUTURE DAY =================
  function openEditDay(d) {
    var key = ymd(d); var ov = state.overrides[key] || {}; var currentType = jobFor(d);
    var node = el('div');
    node.appendChild(el('h3', null, 'Edit ' + DOW_FULL[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate()));

    node.appendChild(el('p', 'cp-ask', 'What do you want this day to be?'));
    var typeSeg = el('div'); typeSeg.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    var chosenType = currentType === 'stories' ? 'stories' : currentType;
    var typeOptions = [['Win', 'win'], ['Mistake', 'mistake'], ['App', 'app'], ['Rest', 'rest']];
    var typeBtns = {};
    typeOptions.forEach(function (pair) {
      var b = el('button', 'cp-chip'); b.type = 'button'; b.textContent = pair[0];
      if (chosenType === pair[1]) markChip(b);
      b.onclick = function () { chosenType = pair[1]; Object.keys(typeBtns).forEach(function (k) { unmarkChip(typeBtns[k]); }); markChip(b); mistakeWrap.style.display = (chosenType === 'mistake') ? 'block' : 'none'; };
      typeSeg.appendChild(b); typeBtns[pair[1]] = b;
    });
    node.appendChild(typeSeg);

    // which mistake
    var mistakeWrap = el('div'); mistakeWrap.style.marginTop = '14px';
    mistakeWrap.appendChild(el('p', 'cp-ask', 'Which mistake?'));
    var mSeg = el('div'); mSeg.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    var mChosen = (typeof ov.mistakeIndex === 'number') ? ov.mistakeIndex : null;
    var mBtns = [];
    function drawMistakeBtns() {
      mSeg.innerHTML = ''; mBtns = [];
      state.vars.mistakes.forEach(function (m, i) { if (!String(m || '').trim()) return; var b = el('button', 'cp-chip'); b.type = 'button'; b.style.textAlign = 'left'; b.textContent = m; if (mChosen === i) markChip(b); b.onclick = function () { mChosen = i; mBtns.forEach(unmarkChip); markChip(b); }; mSeg.appendChild(b); mBtns.push(b); });
      var add = el('button', 'cp-btn cp-btn-ghost sm', '+ Add a new mistake'); add.type = 'button'; add.style.marginTop = '4px';
      add.onclick = function () {
        var inp = el('input', 'cp-input'); inp.placeholder = 'New mistake'; inp.style.marginTop = '6px';
        var go = el('button', 'cp-btn cp-btn-primary sm', 'Add'); go.type = 'button'; go.style.marginTop = '6px';
        go.onclick = function () { var val = inp.value.trim(); if (!val) return; state.vars.mistakes.push(val); mChosen = state.vars.mistakes.length - 1; persist(); drawMistakeBtns(); };
        mSeg.appendChild(inp); mSeg.appendChild(go);
      };
      mSeg.appendChild(add);
    }
    drawMistakeBtns();
    mistakeWrap.appendChild(mSeg);
    mistakeWrap.style.display = (chosenType === 'mistake') ? 'block' : 'none';
    node.appendChild(mistakeWrap);

    var whyAsk = el('p', 'cp-ask', 'Why are you changing it?'); whyAsk.style.marginTop = '14px'; node.appendChild(whyAsk);
    var why = el('input', 'cp-input'); why.placeholder = 'Short — required'; why.value = ov.reason || ''; node.appendChild(why);
    var err = el('p', 'cp-err'); node.appendChild(err);

    var save = el('button', 'cp-btn cp-btn-primary', 'Save this day'); save.type = 'button'; save.style.marginTop = '14px';
    save.onclick = function () {
      if (!why.value.trim()) { err.textContent = 'Tell me why — one line.'; return; }
      var override = { type: chosenType, reason: why.value.trim() };
      if (chosenType === 'mistake' && mChosen != null) override.mistakeIndex = mChosen;
      state.overrides[key] = override;
      state.editLog.push({ date: key, type: chosenType, reason: why.value.trim(), at: new Date().toISOString() });
      if (state.editLog.length > 200) state.editLog = state.editLog.slice(-200);
      persist(); closeModal(); toast('Day updated'); renderDashboard();
    };
    node.appendChild(save);

    // app-day guard
    if (baseJob(d) === 'app' && chosenType !== 'app') {
      // allow only "move", handled below; warn on any non-app choice
    }
    var moveApp = el('button', 'cp-btn cp-btn-ghost', 'Move the app day here'); moveApp.type = 'button'; moveApp.style.marginTop = '8px';
    moveApp.onclick = function () {
      if (state.vars.postDays.indexOf(d.getDay()) === -1) { state.vars.postDays.push(d.getDay()); state.vars.postDays.sort(function (a, b) { return a - b; }); if (state.vars.postDays.length > state.vars.days) state.vars.days = state.vars.postDays.length; }
      state.appWeekday = d.getDay();
      state.editLog.push({ date: key, type: 'move-app', reason: 'moved app day', at: new Date().toISOString() });
      persist(); closeModal(); toast('App day moved to ' + DOW_FULL[d.getDay()]); renderDashboard();
    };
    node.appendChild(moveApp);

    var cancel = el('button', 'cp-btn cp-btn-ghost', 'Cancel'); cancel.type = 'button'; cancel.style.marginTop = '8px'; cancel.onclick = closeModal; node.appendChild(cancel);

    // If they picked something other than App on the app weekday, block delete of app.
    var origSaveOnclick = save.onclick;
    save.onclick = function () {
      if (baseJob(d) === 'app' && chosenType !== 'app') { err.textContent = 'The app day stays. It’s how you get leads from people who aren’t ready to pay yet. Use “Move the app day” instead.'; return; }
      origSaveOnclick();
    };

    openModal(node);
  }
  function markChip(b) { b.classList.add('on'); b.style.cssText = (b.style.textAlign === 'left' ? 'text-align:left;' : '') + 'background:var(--accent);border-color:var(--accent);color:#1c1206;'; }
  function unmarkChip(b) { b.classList.remove('on'); b.style.cssText = (b.style.textAlign === 'left' ? 'text-align:left;' : ''); }

  // ================= IDEA PACK =================
  function showIdeaPack(milestone) {
    var node = el('div');
    node.appendChild(el('h3', null, milestone + '-day idea pack'));
    node.appendChild(el('p', 'cp-sub', '5 pre-filled posts from templates you haven’t used yet. Copy, film, bank them for a busy week.'));
    var used = [];
    var base = milestone; // offset into the arrays so it differs from daily rotation
    for (var i = 0; i < 5; i++) {
      var type = ['mistake', 'win', 'app', 'mistake', 'win'][i];
      var idx = base + i * 3;
      var script;
      if (type === 'win') script = fill(pick(LIB.win, idx)) + '\n\n' + ctaText();
      else if (type === 'app') script = fill(pick(LIB.app, idx)) + '\n\n' + ctaText();
      else { var mistakes = state.vars.mistakes.filter(function (m) { return String(m || '').trim(); }); var mk = mistakes[(idx) % Math.max(1, mistakes.length)]; script = fill(pick(LIB.hooks, idx), mk) + '\n\n' + fill(pick(LIB.mistake, idx), mk) + '\n\n' + ctaText(); }
      used.push({ type: type, script: script });
      var c = el('div', 'cp-card'); c.appendChild(el('div', 'cp-label', jobLabel(type)));
      var sc = el('div', 'cp-script'); sc.textContent = script; sc.style.marginTop = '8px'; c.appendChild(sc);
      (function (script) { var b = el('button', 'cp-btn cp-btn-ghost sm', 'Copy'); b.type = 'button'; b.style.marginTop = '8px'; b.onclick = function () { copyText(script, 'Copied'); }; c.appendChild(b); })(script);
      node.appendChild(c);
    }
    var done = el('button', 'cp-btn cp-btn-primary', 'Done'); done.type = 'button'; done.style.marginTop = '14px'; done.onclick = closeModal; node.appendChild(done);
    openModal(node);
  }

  // ================= reminders =================
  function enableNotifications() {
    if (!('Notification' in window)) { toast('This browser can’t do reminders'); return; }
    Notification.requestPermission().then(function (p) { if (p === 'granted') { toast('Reminders on'); scheduleReminder(); } else { toast('Reminders blocked in browser settings'); } });
  }
  var reminderTimer = 0;
  function scheduleReminder() {
    if (reminderTimer) clearTimeout(reminderTimer);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var t = String(state.reminderTime || '18:00').split(':'); var now = new Date();
    var fire = new Date(); fire.setHours(+t[0] || 18, +t[1] || 0, 0, 0);
    if (fire <= now) fire = addDays(fire, 1), fire.setHours(+t[0] || 18, +t[1] || 0, 0, 0);
    var ms = fire - now; if (ms > 2147483647) ms = 2147483647; // setTimeout cap
    reminderTimer = setTimeout(function () {
      var d = today(); var job = jobFor(d);
      var msg = (job === 'app') ? (DOW_FULL[d.getDay()] + ' — free-app post. Tap for your script.')
        : (job === 'stories' || job === 'rest') ? (DOW_FULL[d.getDay()] + ' — get your 5 stories up.')
          : (DOW_FULL[d.getDay()] + ' — ' + job + ' post. Tap for your script.');
      try { new Notification('RiseForIt', { body: msg }); } catch (e) {}
      scheduleReminder();
    }, ms);
  }
  function maybeEveningNudge() {
    var d = today(); var key = ymd(d);
    if (state.checkins[key]) return; // already logged
    if (new Date().getHours() < 17) return; // evening only
    // gentle in-page nudge (no permission needed)
    setTimeout(function () { toast('Evening check-in: did you post today?'); }, 1400);
  }

  // ---------- misc ----------
  function autoLink() {
    try {
      var u = window.__odeCurrentUser;
      var handle = u && (u.username || u.id);
      if (handle) return location.origin + '/coach/' + handle;
    } catch (e) {}
    return location.origin + '/coach';
  }

  // ================= boot =================
  function boot() {
    state = loadLocal() || defaultState();
    render();
    // reconcile with server profile (source of truth across devices)
    loadFromProfile().then(function (cp) {
      if (cp && cp.vars) {
        // prefer the record that has more recent activity (more checkins/edits)
        var serverWeight = Object.keys(cp.checkins || {}).length + (cp.editLog || []).length + (cp.setupDone ? 1 : 0);
        var localWeight = Object.keys(state.checkins || {}).length + (state.editLog || []).length + (state.setupDone ? 1 : 0);
        if (serverWeight >= localWeight) { state = Object.assign(defaultState(), cp); try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} render(); }
      }
    });
  }
  function render() { if (state.setupDone && state.vars && state.vars.audience) { renderDashboard(); maybeEveningNudge(); scheduleReminder(); } else { renderQuestionnaire(state.setupDone ? state.vars : null); } }

  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
