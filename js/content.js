/* RiseForIt — Content Program engine (/content). v4.
   No AI. Fixed templates (content-templates.js) + a questionnaire schema
   (content-config.js) with the trainer's answers slotted into {variables}.
   Mobile-first: one question per screen, sticky Next in the thumb zone. */
(function () {
  'use strict';

  var LIB = window.RiseContentTemplates || {};
  var CFG = window.RiseContentConfig || { questions: [], sections: {}, levels: [], dayZero: {}, paths: {} };
  var LS_KEY = 'ode_content_program_v2';
  var LS_OLD = 'ode_content_program_v1';
  var root = document.getElementById('cp-root');
  var modalEl = document.getElementById('cp-modal');
  var toastEl = document.getElementById('cp-toast');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---------- date helpers ----------
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var p = String(s || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0, 0, 0, 0); return x; }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }

  // ---------- state ----------
  var state = null;
  function defaultState() {
    return {
      v: 2, path: null, setupDone: false, answered: {},
      startDate: null, dayZeroDone: false, dzTasks: {},
      appWeekday: 5, overrides: {}, checkins: {}, storiesDone: {},
      editLog: [], postStats: {}, personalTakes: {}, reminderTime: '18:00', lastPack: 0, levelIdx: 0
    };
  }
  function loadLocal() {
    try { var raw = JSON.parse(localStorage.getItem(lsKey()) || 'null'); if (raw && raw.answered) return raw; } catch (e) {}
    try { var raw2 = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (raw2 && raw2.answered) return raw2; } catch (e) {}
    // migrate a v1 program if present
    try {
      var old = JSON.parse(localStorage.getItem(LS_OLD) || 'null');
      if (old && old.vars && old.setupDone) {
        var s = defaultState(); s.path = 'quick'; s.setupDone = true; s.dayZeroDone = true;
        s.startDate = old.startDate || ymd(today()); s.appWeekday = old.appWeekday != null ? old.appWeekday : 5;
        s.overrides = old.overrides || {}; s.checkins = old.checkins || {}; s.storiesDone = old.storiesDone || {}; s.editLog = old.editLog || [];
        s.answered = {
          audience: old.vars.audience, outcome: old.vars.outcome, core: old.vars.core,
          mistake1: (old.vars.mistakes || [])[0], mistake2: (old.vars.mistakes || [])[1], mistake3: (old.vars.mistakes || [])[2],
          turning_point: old.vars.story, has_proof: 'client', proofName: old.vars.proofName, proofResult: old.vars.proofResult,
          objection: old.vars.objection, days: { count: old.vars.days || 3, days: old.vars.postDays || [1, 3, 5] }
        };
        return s;
      }
    } catch (e) {}
    return null;
  }
  var saveTimer = 0;
  function lsKey() { try { var u = window.__odeCurrentUser; if (u && (u.id || u.username)) return LS_KEY + ':' + (u.id || u.username); } catch (e) {} return LS_KEY; }
  function persist() {
    state.updatedAt = Date.now();
    // Save every answer immediately to localStorage (user-keyed mirror + legacy
    // key), and debounce the server write so nothing is lost on a mid-flow reload.
    try { var s = JSON.stringify(state); localStorage.setItem(lsKey(), s); localStorage.setItem(LS_KEY, s); } catch (e) {}
    if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(saveToProfile, 400);
  }
  function saveToProfile() { try { fetch('/api/profile', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { content_program_v2: state } }) }).catch(function () {}); } catch (e) {} }
  function loadFromProfile() {
    return fetch('/api/profile', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { var cp = j && j.profile && j.profile.profile && j.profile.profile.content_program_v2; return (cp && cp.answered) ? cp : null; })
      .catch(function () { return null; });
  }

  // ---------- derived variables ----------
  function trainerName() { if (state.answered.name) return state.answered.name; try { var u = window.__odeCurrentUser; if (u && (u.displayName || u.username)) return (u.displayName || u.username); } catch (e) {} return 'your coach'; }
  function mistakesList() {
    var a = state.answered; var arr = [a.mistake1, a.mistake2, a.mistake3];
    (a.extraMistakes || []).forEach(function (m) { arr.push(m); });
    return arr.filter(function (m) { return String(m || '').trim(); });
  }
  // Volume comes from the LEVEL (135→3 posts, 225+→5), not the trainer. They
  // pick which days they're available; we take an even spread up to what the
  // level needs, capped at what they selected.
  // Reads the STORED level (refreshed by the dashboard) — never levelIndex()
  // live, or postDays↔levelIndex would recurse forever.
  function levelRequiredPosts() { var lv = CFG.levels[state.levelIdx || 0] || CFG.levels[0]; return (lv && lv.posts) || 3; }
  function availableDays() { var a = state.answered.days; if (a && a.days && a.days.length) return a.days.slice().sort(function (x, y) { return x - y; }); if (a && a.count) return (a.days || [1, 3, 5]); return [1, 3, 5]; }
  function daysCount() { return Math.min(levelRequiredPosts(), availableDays().length || 3); }
  function postDays() {
    var avail = availableDays(); var need = daysCount();
    if (avail.length <= need) return avail.slice();
    var out = []; for (var k = 0; k < need; k++) { out.push(avail[Math.round(k * (avail.length - 1) / (need - 1 || 1))]); }
    return out.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
  }
  function proofLead() {
    var a = state.answered;
    if (a.has_proof === 'self') return (a.old_belief ? 'I used to believe ' + a.old_belief + '.' : 'I’ve been exactly where you are.');
    return (a.proofName || 'A client') + ' believed ' + (a.proofBelief || 'they’d tried everything') + '.';
  }
  function proofResultLine() {
    var a = state.answered;
    if (a.has_proof === 'self') return 'Now? ' + (a.selfResult || 'I’m proof it works.');
    return 'The result: ' + (a.proofResult || 'a result they were proud of') + '.';
  }

  function fill(str, mistakeForCycle) {
    var a = state.answered; var m = mistakesList();
    var map = {
      '{audience}': a.audience || 'the people you train',
      '{outcome}': a.outcome || 'reach their goal',
      '{core}': a.core || 'the fundamentals',
      '{support1}': a.support1 || '', '{support2}': a.support2 || '',
      '{contrarian}': a.contrarian || (a.core ? (a.core + ' matters more than anything else') : 'the basics beat the fancy stuff'),
      '{mistake1}': m[0] || 'the same old mistake', '{mistake2}': m[1] || m[0] || 'the same old mistake', '{mistake3}': m[2] || m[0] || 'the same old mistake',
      '{mistake}': mistakeForCycle || m[0] || 'the same old mistake',
      '{story}': a.turning_point || 'I found what actually works',
      '{turning_point}': a.turning_point || 'I found what actually works',
      '{before}': a.before || 'stuck and frustrated', '{old_belief}': a.old_belief || 'I needed more willpower', '{why}': a.why || 'I don’t want anyone to waste the time I wasted',
      // both camelCase (questionnaire) and snake_case (library) proof slots
      '{proofName}': a.proofName || 'a client of mine', '{proof_name}': a.proofName || 'a client of mine',
      '{proofResult}': a.proofResult || 'a result they were proud of', '{proof_result}': a.proofResult || 'a result they were proud of',
      '{proof_belief}': a.proofBelief || 'they’d already tried everything',
      '{selfResult}': a.selfResult || 'I’m proof it works', '{own_result}': a.selfResult || 'I’m proof it works',
      '{proofLead}': proofLead(), '{proofResultLine}': proofResultLine(),
      '{objection}': a.objection || 'they don’t think they have time', '{objection2}': a.objection2 || '', '{fear}': a.fear || 'that this is just who they are now',
      '{catchphrase}': a.catchphrase || '', '{name}': trainerName(), '{link}': a.link || 'the link in my bio'
    };
    return String(str || '').replace(/\{[a-zA-Z0-9_]+\}/g, function (mm) { return (mm in map) ? map[mm] : mm; });
  }
  function ctaText() { var c = LIB.cta || {}; var vk = voiceKey(); return fill((c.voices && c.voices[vk]) || c.master || ''); }
  function autoLink() { try { var u = window.__odeCurrentUser; var h = u && (u.username || u.id); if (h) return location.origin + '/coach/' + h; } catch (e) {} return location.origin + '/coach'; }

  // Voice: questionnaire values → library voice keys (beats stay constant).
  function voiceKey() { return ({ direct: 'blunt', warm: 'warm', blunt: 'funny', technical: 'technical' })[state.answered.voice] || 'blunt'; }
  function hookLine(idx, mistakeForCycle) { var hs = LIB.hooks || []; if (!hs.length) return ''; var h = hs[idx % hs.length]; var pat = (h.voices && h.voices[voiceKey()]) || h.pattern; return fill(pat, mistakeForCycle); }
  function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
  function personalCount() { return Object.keys(state.personalTakes || {}).length; }

  // ---------- schedule / jobs — 4-week rotation, app day fixed ----------
  var ROTATION = [['win', 'mistake'], ['mistake', 'myth'], ['win', 'objection'], ['mistake', 'reframe']];
  function isPostDay(d) { return postDays().indexOf(d.getDay()) !== -1; }
  function baseJob(d) {
    if (!isPostDay(d)) return 'stories';
    if (d.getDay() === state.appWeekday) return 'app';
    var start = parseYmd(state.startDate || ymd(today())); if (d < start) return 'win';
    var week = Math.floor(daysBetween(ymd(start), ymd(d)) / 7);
    var blockStart = addDays(start, week * 7); var pos = 0;
    for (var c = new Date(blockStart); c <= d; c = addDays(c, 1)) { if (isPostDay(c) && c.getDay() !== state.appWeekday) pos++; }
    var row = ROTATION[week % ROTATION.length];
    return row[(Math.max(1, pos) - 1) % row.length] || 'mistake';
  }
  function jobFor(d) { var k = ymd(d); if (state.overrides[k] && state.overrides[k].type) return state.overrides[k].type; return baseJob(d); }
  function occurrenceIndex(d, type) { var start = parseYmd(state.startDate || ymd(today())); if (d < start) return 0; var n = 0; for (var c = new Date(start); c <= d; c = addDays(c, 1)) { if (jobFor(c) === type) n++; } return Math.max(0, n - 1); }
  function pick(arr, i) { return (arr && arr.length) ? arr[i % arr.length] : ''; }

  // Shared pools (myth/objection/mistake seeds) are rendered as PROMPTS, not
  // finished copy — so two trainers never post the same video. The trainer's
  // take is captured, saved to their personal pool keyed by topic, and reused.
  function sharedPool(type) {
    var pt = LIB.post_types || {};
    if (type === 'myth') return (pt.myth.library || []).map(function (x) { return { key: slugify(x.myth), topic: x.myth, why: 'It feels true — effort and tradition both point that way.', ref: x.truth + ' ' + x.kicker, prompt: 'Your take — what’s actually wrong with it? Say it your way.' }; });
    if (type === 'objection') return (pt.objection.library || []).map(function (x) { return { key: slugify(x.objection), topic: x.objection, why: 'People say it because it feels safe and true in the moment.', ref: x.counter, prompt: 'Your counter — how do you take it apart? Your words.' }; });
    if (type === 'mistake') return (pt.mistake.seeds || []).map(function (x) { return { key: slugify(x), topic: x, why: 'Effort feels like progress, so nobody questions it.', ref: '', prompt: 'Your take — name the fix in your words (don’t explain how to do it).' }; });
    return [];
  }
  function angleFor(type, idx) {
    var pool = sharedPool(type); if (!pool.length) return null;
    var takes = state.personalTakes || {};
    if (personalCount() >= 10) { var owned = pool.filter(function (p) { return takes[p.key]; }); if (owned.length) { var it = owned[idx % owned.length]; return { item: it, take: takes[it.key], needsTake: false }; } }
    var item = pool[idx % pool.length];
    return { item: item, take: takes[item.key] || null, needsTake: !takes[item.key] };
  }
  function savePersonalTake(key, text) { state.personalTakes = state.personalTakes || {}; state.personalTakes[key] = String(text || '').trim(); persist(); }

  // Returns a structured post: hook + angle (their take / prompt / proof) +
  // beats (t · job, never a word-for-word middle) + CTA.
  function scriptFor(d) {
    var type = jobFor(d);
    if (type === 'rest') return { type: type, title: 'Rest', beats: [] };
    if (type === 'stories') return { type: type, title: 'Stories only', beats: [], coachingNote: (LIB.stories_daily || {}).coaching_note || '' };
    var idx = occurrenceIndex(d, type); var pt = (LIB.post_types || {})[type] || {};
    var base = { type: type, title: pt.label || type, beats: (pt.beats || []).map(function (b) { return { t: b.t, job: fill(b.job) }; }), cta: ctaText(), coachingNote: pt.coaching_note || '', length: pt.length || '' };

    if (type === 'win') {
      if (state.answered.has_proof === 'self') { var nv = pt.no_client_variant || {}; base.title = nv.label || 'Your progress'; base.beats = (nv.beats || []).map(function (b) { return { t: b.t, job: fill(b.job) }; }); base.framing = nv.framing; base.hook = fill('What I used to believe that was wrong: {old_belief}.'); }
      else { base.hook = fill('When {proof_name} started, they were sure {proof_belief}.'); base.angle = { kind: 'proof', text: fill('{proof_name} — {proof_result}') }; }
      return base;
    }
    if (type === 'app') { base.hook = fill(pick(pt.hook_variants, idx)); return base; }
    if (type === 'reframe') { base.hook = fill(pick(pt.variants, idx)); return base; }

    // shared-pool types: mistake / myth / objection
    var a = angleFor(type, idx);
    if (type === 'mistake') { var mt = mistakesList(); base.hook = hookLine(idx, mt.length ? mt[idx % mt.length] : (a && a.item.topic)); }
    else if (type === 'myth') { base.hook = a ? ('Most people believe: “' + a.item.topic + '” — here’s why that’s wrong.') : hookLine(idx); }
    else { base.hook = a ? ('“' + a.item.topic + '”') : hookLine(idx); }
    if (a) { base.angle = { kind: a.needsTake ? 'prompt' : 'personal', topicKey: a.item.key, topic: a.item.topic, why: a.item.why, ref: a.item.ref, prompt: a.item.prompt, take: a.take }; base.needsTake = a.needsTake; }
    return base;
  }
  function storiesFor(d) {
    var idx = daysBetween(ymd(programStart()), ymd(d)); if (idx < 0) idx = 0;
    var slots = (LIB.stories_daily && LIB.stories_daily.slots) || [];
    return slots.map(function (s) { return { slot: s.type, line: fill(pick(s.examples, idx)) }; });
  }
  // Assemble a copyable filming plan (hook + take + beats + CTA) — never a
  // word-for-word caption; the middle is theirs to say.
  function filmingPlan(s) {
    var out = [];
    if (s.hook) out.push('HOOK: ' + s.hook);
    if (s.angle) { if (s.angle.kind === 'personal' || s.angle.kind === 'prompt') out.push('YOUR TAKE: ' + (s.angle.take || '[' + s.angle.topic + ' — say it your way]')); else if (s.angle.kind === 'proof') out.push('PROOF: ' + s.angle.text); }
    out.push(''); out.push('BEATS:');
    (s.beats || []).forEach(function (b) { out.push(b.t + ' — ' + b.job); });
    out.push(''); out.push('CTA: ' + s.cta);
    return out.join('\n');
  }
  function postsAvailable() { var pt = LIB.post_types || {}; return ((pt.mistake && pt.mistake.seeds) || []).length + ((pt.myth && pt.myth.library) || []).length + ((pt.objection && pt.objection.library) || []).length + ((pt.app && pt.app.hook_variants) || []).length; }

  // ---------- compliance / streak / level ----------
  function assignedTasks(d) { var job = jobFor(d); return { post: (job === 'win' || job === 'mistake' || job === 'app'), stories: (job !== 'rest') }; }
  function dayCompletion(d) { var a = assignedTasks(d); var ci = state.checkins[ymd(d)] || {}; var total = 0, done = 0; if (a.post) { total++; if (ci.posted) done++; } if (a.stories) { total++; done += (ci.stories === 'yes') ? 1 : (ci.stories === 'partial') ? 0.5 : 0; } return { total: total, done: done }; }
  function programStart() { return parseYmd(state.startDate || ymd(today())); }
  function compliancePct(win) { var end = today(); var start = addDays(end, -(win - 1)); if (start < programStart()) start = programStart(); var total = 0, done = 0; for (var c = new Date(start); c <= end; c = addDays(c, 1)) { var r = dayCompletion(c); total += r.total; done += r.done; } if (total <= 0) return null; return Math.round((done / total) * 100); }
  function onProgramDay(d) { var a = assignedTasks(d); var ci = state.checkins[ymd(d)] || {}; if (a.post && !ci.posted) return false; if (a.stories && (ci.stories === 'no' || ci.stories == null)) return false; return (a.post || a.stories); }
  function currentStreak() { var n = 0; var d = today(); if (!state.checkins[ymd(d)]) d = addDays(d, -1); while (d >= programStart()) { if (onProgramDay(d)) { n++; d = addDays(d, -1); } else break; } return n; }
  function onProgramDaysTotal() { var n = 0; var end = today(); for (var c = new Date(programStart()); c <= end; c = addDays(c, 1)) { if (onProgramDay(c)) n++; } return n; }
  function levelIndex() { var days = onProgramDaysTotal(); var lv = 0; for (var i = 0; i < CFG.levels.length; i++) { if (days >= CFG.levels[i].unlockDays) lv = i; } return lv; }

  // ---------- UI helpers ----------
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1900); }
  function copyText(txt, ok) { var done = function () { toast(ok || 'Copied'); }; if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done).catch(function () { legacyCopy(txt); done(); }); } else { legacyCopy(txt); done(); } }
  function legacyCopy(t) { try { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (e) {} }
  function openModal(node) { modalEl.innerHTML = ''; var card = el('div', 'cp-modal-card'); card.appendChild(node); modalEl.appendChild(card); modalEl.hidden = false; modalEl.onclick = function (e) { if (e.target === modalEl) closeModal(); }; }
  function closeModal() { modalEl.hidden = true; modalEl.innerHTML = ''; }

  // ================= PATH CHOOSER (full-bleed title screen) =================
  function renderPathChooser() {
    root.className = 'cp-wrap'; root.innerHTML = '';
    root.appendChild(el('div', 'cp-ambient'));
    var wrap = el('div', 'cp-pathwrap');
    var eyebrow = el('span', 'cp-seclabel cp-kicker', 'Content Program'); staggerRise(eyebrow, 0); wrap.appendChild(eyebrow);
    var h = el('h1', 'cp-h1', 'Two ways to start'); h.style.marginTop = '12px'; staggerRise(h, 1); wrap.appendChild(h);
    var sub = el('p', 'cp-sub', 'Same tool either way. Pick the one you’ll actually finish.'); staggerRise(sub, 2); wrap.appendChild(sub);

    // Detailed = the visual default (heavier, filled button). Quick = quiet.
    [CFG.paths.detailed, CFG.paths.quick].forEach(function (pth, i) {
      var opt = el('div', 'cp-pathopt ' + (pth.id === 'detailed' ? 'primary' : 'secondary')); staggerRise(opt, 3 + i);
      var hh = el('h3', null, esc(pth.name)); hh.appendChild(el('span', 'meta', pth.count + ' questions · ' + pth.mins)); opt.appendChild(hh);
      opt.appendChild(el('p', null, esc(pth.pitch)));
      var go = el('button', 'cp-btn ' + (pth.id === 'detailed' ? 'cp-btn-primary' : 'cp-btn-ghost'), pth.id === 'detailed' ? 'Start the detailed setup' : 'Start quick instead'); go.type = 'button'; go.style.marginTop = '12px';
      go.onclick = function () { state.path = pth.id; state.lastStepIndex = 0; persist(); startQuestionnaire(); };
      opt.appendChild(go); wrap.appendChild(opt);
    });
    var re = el('p', 'cp-reassure', 'You can switch later without losing anything.'); staggerRise(re, 5); wrap.appendChild(re);
    root.appendChild(wrap);
  }

  // ================= QUESTIONNAIRE (schema-driven) =================
  var flow = null; // { steps, i }
  function activeQuestions() {
    return CFG.questions.filter(function (q) { return state.path === 'detailed' || q.path === 'quick'; });
  }
  function showIfOk(q) { if (!q.showIf) return true; return Object.keys(q.showIf).every(function (k) { return state.answered[k] === q.showIf[k]; }); }
  function buildSteps() {
    var steps = []; var lastSection = null;
    activeQuestions().forEach(function (q) {
      if (q.section !== lastSection) { steps.push({ kind: 'intro', section: q.section }); lastSection = q.section; }
      steps.push({ kind: 'q', q: q });
      if (q.id === 'mistake3') steps.push({ kind: 'hookmoment' }); // 1.5: the "first hook" beat
    });
    return steps;
  }
  var pendingResume = false;
  function startQuestionnaire(opts) {
    opts = opts || {};
    flow = { steps: buildSteps(), i: 0 };
    if (opts.upgrade) { // detailed upgrade: land on first unanswered
      while (flow.i < flow.steps.length) { var st = flow.steps[flow.i]; if (st.kind === 'q' && showIfOk(st.q) && (state.answered[st.q.id] == null || state.answered[st.q.id] === '')) break; flow.i++; }
    } else if (opts.resume && typeof state.lastStepIndex === 'number') {
      flow.i = Math.min(Math.max(0, state.lastStepIndex), flow.steps.length - 1);
      while (flow.i > 0 && stepIsSkippable(flow.steps[flow.i])) flow.i--;
      pendingResume = flow.i > 0;
    }
    drawStep();
  }
  function resumeBannerNode() {
    var bar = el('div'); bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0 2px;padding:8px 12px;border-radius:10px;background:var(--accent-soft);border:1px solid rgba(197,141,79,.3);font-size:.82rem;font-weight:700;color:var(--ink);';
    bar.appendChild(el('span', null, 'Picked up where you left off.'));
    var actions = el('span'); actions.style.cssText = 'display:flex;gap:8px;';
    var over = el('button', null, 'Start over'); over.type = 'button'; over.style.cssText = 'background:none;border:0;color:var(--accent);font-weight:800;cursor:pointer;font-size:.82rem;'; over.onclick = function () { if (confirm('Start the questionnaire over? Your current answers will be cleared.')) { state.answered = {}; state.lastStepIndex = 0; persist(); renderPathChooser(); } };
    var x = el('button', null, '✕'); x.type = 'button'; x.style.cssText = 'background:none;border:0;color:var(--muted);cursor:pointer;font-size:.9rem;'; x.onclick = function () { bar.remove(); };
    actions.appendChild(over); actions.appendChild(x); bar.appendChild(actions);
    return bar;
  }
  function stepIsSkippable(st) { return st.kind === 'q' && !showIfOk(st.q); }
  function nextStep() { do { flow.i++; } while (flow.i < flow.steps.length && stepIsSkippable(flow.steps[flow.i])); if (flow.i >= flow.steps.length) return finishQuestionnaire(); drawStep(); }
  function prevStep() { do { flow.i--; } while (flow.i > 0 && stepIsSkippable(flow.steps[flow.i])); if (flow.i < 0) { flow.i = 0; return renderPathChooser(); } drawStep(); }
  function answerableProgress() { var qs = flow.steps.filter(function (s) { return s.kind === 'q' && showIfOk(s.q); }); var doneCount = 0; for (var j = 0; j <= flow.i && j < flow.steps.length; j++) { var s = flow.steps[j]; if (s.kind === 'q' && showIfOk(s.q)) doneCount++; } return { total: qs.length, done: Math.max(1, doneCount) }; }

  function drawStep() {
    state.lastStepIndex = flow.i; persist();
    root.className = 'cp-wrap flow'; root.innerHTML = '';
    var st = flow.steps[flow.i];
    if (st.kind === 'intro') { drawIntro(st.section); maybeShowResume(); return; }
    if (st.kind === 'hookmoment') { drawHookMoment(); return; }
    drawQuestion(st.q); maybeShowResume();
    window.scrollTo(0, 0);
  }
  function maybeShowResume() { if (pendingResume) { pendingResume = false; try { root.insertBefore(resumeBannerNode(), root.firstChild); } catch (e) {} } }

  // 1.5 — the "first hook" moment: assemble hook word-by-word from their answers.
  function drawHookMoment() {
    var screen = el('div', 'cp-screen');
    var top = el('div', 'cp-screen-top'); var bar = el('div', 'cp-flowbar');
    var back = el('button', 'cp-back', '‹ Back'); back.type = 'button'; back.onclick = prevStep; bar.appendChild(back);
    var prog = answerableProgress(); var barEl = el('div', 'cp-bar'); barEl.appendChild(el('i')); barEl.firstChild.style.width = Math.round(prog.done / prog.total * 100) + '%'; bar.appendChild(barEl);
    top.appendChild(bar); screen.appendChild(top);
    var body = el('div', 'cp-screen-body'); body.style.justifyContent = 'center';
    body.appendChild(el('span', 'cp-seclabel', 'Watch this'));
    body.appendChild(el('h2', 'cp-qh', 'Here’s your first hook.'));
    var m = mistakesList();
    var hook = fill(pick(LIB.hooks, 0), m[0]);
    var out = el('div', 'cp-script'); out.style.cssText = 'margin-top:16px;font-size:1.15rem;min-height:3.4em;'; body.appendChild(out);
    var words = hook.split(' '); var i = 0;
    function step() { if (i > words.length) return; out.textContent = words.slice(0, i).join(' '); i++; if (i <= words.length) setTimeout(step, reduced ? 0 : 60); }
    step();
    var note = el('p', 'cp-qsub'); note.style.marginTop = '14px'; note.textContent = 'You just wrote that. Every post you get works the same way.'; body.appendChild(note);
    screen.appendChild(body);
    var sticky = el('div', 'cp-sticky'); var go = el('button', 'cp-btn cp-btn-primary', 'Continue'); go.type = 'button'; go.onclick = nextStep; sticky.appendChild(go); screen.appendChild(sticky);
    root.appendChild(screen);
  }

  function staggerRise(node, order) { if (reduced) { node.style.opacity = '1'; return; } node.classList.add('cp-rise'); node.style.animationDelay = (order * 0.08) + 's'; }
  function drawIntro(section) {
    var sec = CFG.sections[section] || { title: '', body: '' };
    var screen = el('div', 'cp-screen');
    var top = el('div', 'cp-screen-top'); var bar = el('div', 'cp-flowbar');
    var back = el('button', 'cp-back', '‹ Back'); back.type = 'button'; back.onclick = prevStep; bar.appendChild(back);
    var prog = answerableProgress(); var barEl = el('div', 'cp-bar'); barEl.appendChild(el('i')); barEl.firstChild.style.width = Math.round((prog.done - 1) / prog.total * 100) + '%'; bar.appendChild(barEl);
    top.appendChild(bar); screen.appendChild(top);
    root.appendChild(el('div', 'cp-ambient'));
    var intro = el('div', 'cp-title');
    var eyebrow = el('span', 'cp-seclabel', 'What’s next'); var h = el('h2', null, esc(sec.title)); var p = el('p', null, esc(sec.body));
    staggerRise(eyebrow, 0); staggerRise(h, 1); staggerRise(p, 2);
    intro.appendChild(eyebrow); intro.appendChild(h); intro.appendChild(p);
    screen.appendChild(intro);
    var sticky = el('div', 'cp-sticky'); var go = el('button', 'cp-btn cp-btn-primary', 'Continue'); staggerRise(go, 3.25); go.type = 'button'; go.onclick = nextStep; sticky.appendChild(go); screen.appendChild(sticky);
    root.appendChild(screen);
  }

  function drawQuestion(q) {
    var screen = el('div', 'cp-screen');
    // top: back + progress
    var top = el('div', 'cp-screen-top'); var bar = el('div', 'cp-flowbar');
    var back = el('button', 'cp-back', '‹ Back'); back.type = 'button'; back.onclick = prevStep; bar.appendChild(back);
    var prog = answerableProgress(); var barEl = el('div', 'cp-bar'); barEl.appendChild(el('i')); barEl.firstChild.style.width = Math.round(prog.done / prog.total * 100) + '%'; bar.appendChild(barEl);
    var cnt = el('span'); cnt.style.cssText = 'font-size:.72rem;font-weight:800;color:var(--muted);'; cnt.textContent = prog.done + '/' + prog.total; bar.appendChild(cnt);
    top.appendChild(bar); screen.appendChild(top);

    var body = el('div', 'cp-screen-body');
    body.appendChild(el('span', 'cp-seclabel', (CFG.sections[q.section] || {}).title || ''));
    body.appendChild(el('h2', 'cp-qh', esc(q.label)));
    if (q.sub) body.appendChild(el('p', 'cp-qsub', esc(q.sub)));
    if (q.lesson) body.appendChild(el('div', 'cp-lesson', esc(q.lesson)));

    var getVal, setErr;
    var errEl = el('p', 'cp-err');

    if (q.type === 'choice') {
      var wrap = el('div', 'cp-choices'); var chosen = state.answered[q.id] || null; var btns = {};
      q.choices.forEach(function (c) { var b = el('button', 'cp-choice' + (chosen === c.v ? ' on' : '')); b.type = 'button'; b.textContent = c.label; b.onclick = function () { chosen = c.v; Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('on', k === c.v); }); errEl.textContent = ''; }; wrap.appendChild(b); btns[c.v] = b; });
      body.appendChild(wrap);
      getVal = function () { return chosen; };
    } else if (q.type === 'days') {
      var pickWrap = buildDaysPicker(); body.appendChild(pickWrap.node); getVal = pickWrap.get;
    } else {
      if (q.example) body.appendChild(el('p', 'cp-example', 'e.g. <b>' + esc(q.example) + '</b>'));
      var inWrap = el('div', 'cp-qinput');
      var input = q.type === 'textarea' ? el('textarea', 'cp-textarea') : el('input', 'cp-input');
      input.value = state.answered[q.id] || '';
      // 1.4 — write-friendly inputs
      input.spellcheck = true; input.setAttribute('autocorrect', 'on'); input.setAttribute('autocapitalize', 'sentences'); input.setAttribute('autocomplete', 'off');
      if (q.type !== 'textarea') { input.type = 'text'; input.inputMode = q.inputmode || 'text'; input.setAttribute('enterkeyhint', 'next'); input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next.click(); } }); }
      else { input.setAttribute('enterkeyhint', 'done'); }
      input.setAttribute('aria-label', q.label);
      input.addEventListener('focus', function () { setTimeout(function () { try { input.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); } catch (e) {} }, 150); });
      if (q.type === 'textarea') { var grow = function () { input.style.height = 'auto'; input.style.height = Math.min(260, input.scrollHeight) + 'px'; }; input.addEventListener('input', grow); setTimeout(grow, 0); }
      input.addEventListener('input', function () { errEl.textContent = ''; });
      inWrap.appendChild(input); body.appendChild(inWrap);
      // chips that fill the field
      if (q.chips && q.chips.length) { var cw = el('div', 'cp-chipwrap'); q.chips.forEach(function (c) { var b = el('button', 'cp-chip2', esc(c)); b.type = 'button'; b.onclick = function () { input.value = c; errEl.textContent = ''; input.focus(); }; cw.appendChild(b); }); body.appendChild(cw); }
      // 1.3 — Suggest for me: composed pool, 3 fresh chips at a time, cycling
      var pool = suggestPool(q);
      if (pool && pool.length) {
        var sgWrap = el('div', 'cp-suggest');
        var sb = el('button', 'cp-btn cp-btn-ghost sm', 'Suggest for me'); sb.type = 'button';
        var chipHost = el('div', 'cp-chipwrap'); chipHost.style.display = 'none';
        var more = el('button', null, 'Show me others'); more.type = 'button'; more.style.cssText = 'background:none;border:0;color:var(--accent);font-weight:700;font-size:.85rem;cursor:pointer;margin-top:6px;display:none;';
        sb.onclick = function () { sb.style.display = 'none'; chipHost.style.display = 'flex'; more.style.display = 'inline-block'; swapSuggestions(q, chipHost, input, errEl); };
        more.onclick = function () { swapSuggestions(q, chipHost, input, errEl); };
        sgWrap.appendChild(sb); sgWrap.appendChild(chipHost); sgWrap.appendChild(more); body.appendChild(sgWrap);
      }
      getVal = function () { return input.value.trim(); };
    }

    // why sheet
    if (q.why) { var wb = el('button', 'cp-why-open', 'Why we’re asking →'); wb.type = 'button'; wb.onclick = function () { openWhy(q); }; body.appendChild(wb); }
    body.appendChild(errEl);

    screen.appendChild(body);

    // sticky next
    var sticky = el('div', 'cp-sticky');
    var next = el('button', 'cp-btn cp-btn-primary', flow.i >= flow.steps.length - 1 ? 'Finish →' : 'Next'); next.type = 'button';
    next.onclick = function () {
      var val = getVal();
      if (q.required && (val == null || val === '' || (typeof val === 'object' && val.days && val.days.length === 0))) { errEl.textContent = (q.type === 'days') ? 'Pick at least one day.' : 'This one’s required.'; return; }
      if (q.validate === 'audience' && isSingularOrVague(val)) { errEl.textContent = 'Make it a plural group — not “you”, “people”, or one person.'; return; }
      state.answered[q.id] = val; persist(); nextStep();
    };
    sticky.appendChild(next); screen.appendChild(sticky);
    root.appendChild(screen);
  }

  // 1.6 — no volume selector. Just: which days can you post? (multi-select).
  function buildDaysPicker() {
    var picked = (state.answered.days && state.answered.days.days && state.answered.days.days.slice()) || [1, 3, 5];
    var node = el('div');
    var daySel = el('div', 'cp-daysel'); var dayBtns = [];
    for (var i = 0; i < 7; i++) (function (i) { var b = el('button', 'cp-day' + (picked.indexOf(i) !== -1 ? ' on' : '')); b.type = 'button'; b.textContent = DOW[i]; b.onclick = function () { var at = picked.indexOf(i); if (at !== -1) picked.splice(at, 1); else picked.push(i); draw(); }; daySel.appendChild(b); dayBtns.push(b); })(i);
    node.appendChild(daySel);
    var note = el('p', 'cp-note'); node.appendChild(note);
    function draw() { for (var i = 0; i < 7; i++) dayBtns[i].classList.toggle('on', picked.indexOf(i) !== -1); note.textContent = picked.length ? (picked.length + ' day' + (picked.length === 1 ? '' : 's') + ' selected. We’ll set your volume from your level — you don’t pick that.') : ''; }
    draw();
    return { node: node, get: function () { picked.sort(function (a, b) { return a - b; }); return { days: picked.slice() }; } };
  }

  function openWhy(q) { var node = el('div'); node.appendChild(el('h3', null, 'Why we’re asking')); node.appendChild(el('p', 'cp-sub', esc(q.why))); var c = el('button', 'cp-btn cp-btn-primary', 'Got it'); c.type = 'button'; c.style.marginTop = '14px'; c.onclick = closeModal; node.appendChild(c); openModal(node); }

  // 1.3 — Suggest for me: a composed pool per question (templates with the same
  // {variable} slots), cycled without repeating in a session, 3 at a time.
  var suggestShown = {}; // questionId -> array of indices already shown this session
  function suggestPool(q) {
    var raw = (CFG.suggestions && CFG.suggestions[q.id]) || null;
    if (!raw) return null;
    // hide entirely if it can only compose generic filler with no prior context
    var needs = (CFG.suggestNeeds && CFG.suggestNeeds[q.id]) || [];
    if (needs.some(function (k) { return !state.answered[k]; })) return null;
    return raw.map(function (t) { return fill(t); });
  }
  function swapSuggestions(q, host, input, errEl) {
    var pool = suggestPool(q); if (!pool || !pool.length) return;
    suggestShown[q.id] = suggestShown[q.id] || [];
    if (suggestShown[q.id].length >= pool.length) suggestShown[q.id] = []; // exhausted → reshuffle
    // fade old out
    var old = Array.prototype.slice.call(host.children);
    old.forEach(function (c) { c.style.transition = 'opacity .12s ease'; c.style.opacity = '0'; });
    setTimeout(function () {
      host.innerHTML = '';
      var picks = [];
      for (var n = 0; n < 3 && suggestShown[q.id].length < pool.length; n++) {
        var idx; var guard = 0;
        do { idx = Math.floor(Math.random() * pool.length); guard++; } while (suggestShown[q.id].indexOf(idx) !== -1 && guard < 40);
        if (suggestShown[q.id].indexOf(idx) !== -1) break;
        suggestShown[q.id].push(idx); picks.push(pool[idx]);
      }
      picks.forEach(function (txt, k) {
        var b = el('button', 'cp-chip2', esc(txt)); b.type = 'button'; b.style.cssText = 'opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease;transition-delay:' + (k * 0.04) + 's;text-align:left;';
        b.onclick = function () { input.value = txt; errEl.textContent = ''; input.focus(); };
        host.appendChild(b); setTimeout(function () { b.style.opacity = '1'; b.style.transform = 'none'; }, 20);
      });
    }, 120);
  }

  function isSingularOrVague(text) { var t = String(text || '').trim().toLowerCase(); if (!t) return true; if (/^(you|people|everyone|anyone|someone|clients?|person|him|her|them|me|i)$/.test(t)) return true; if (/^you\b/.test(t)) return true; var plural = /(s|men|women|folks|guys|moms|dads|people|lifters|athletes|beginners|workers)\b/.test(t); return !plural; }

  function finishQuestionnaire() {
    state.answered.name = trainerName(); state.answered.link = state.answered.link || autoLink();
    var pd = postDays(); if (pd.length) state.appWeekday = pd[pd.length - 1];
    state.setupDone = true; persist();
    renderResults();
  }
  // The reveal "why" line, composed from their Section 6 reality answers.
  function whyLine() {
    var a = state.answered; var bits = [];
    if (a.consistency === 'never') bits.push('you’re just starting to post');
    else if (a.consistency === 'onoff') bits.push('you’ve tried posting and stopped before');
    else if (a.consistency === 'regular') bits.push('you already post fairly regularly');
    if (a.time === '10') bits.push('you’ve got about an hour a week');
    else if (a.time === '20') bits.push('you’ve got a couple hours a week');
    else if (a.time === '30') bits.push('you can give it real time each day');
    if (a.camera === 'hate') bits.push('camera still feels rough');
    var lead = bits.length ? ('You told us ' + bits.join(', and ') + '.') : 'Based on what you told us.';
    return lead + ' This is what sticks.';
  }

  // ================= RESULTS + PLATE BADGE REVEAL =================
  function plateSvg(plates, opts) {
    opts = opts || {}; var W = opts.w || 92, H = opts.h || 56; var cx = W / 2, cy = H / 2;
    var ns = 'http://www.w3.org/2000/svg'; var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    // bar
    var bar = document.createElementNS(ns, 'rect'); bar.setAttribute('x', 6); bar.setAttribute('y', cy - 3); bar.setAttribute('width', W - 12); bar.setAttribute('height', 6); bar.setAttribute('rx', 3); bar.setAttribute('fill', '#8a7048'); svg.appendChild(bar);
    // plates from center out
    var plateW = 7, gap = 3.5; var maxPlates = 4;
    for (var i = 0; i < maxPlates; i++) {
      var on = i < plates;
      var h = H - 8 - i * 8;
      var xR = cx + 8 + i * (plateW + gap);
      var xL = cx - 8 - i * (plateW + gap) - plateW;
      [xR, xL].forEach(function (x) {
        var p = document.createElementNS(ns, 'rect'); p.setAttribute('class', 'cp-plate'); p.setAttribute('x', x); p.setAttribute('y', (H - h) / 2); p.setAttribute('width', plateW); p.setAttribute('height', h); p.setAttribute('rx', 2.5);
        p.setAttribute('fill', on ? 'var(--accent)' : 'rgba(150,150,150,0.28)');
        if (on && opts.animate && !reduced) { p.style.opacity = '0'; p.style.transform = 'translateX(' + (x < cx ? '-' : '') + '14px)'; p.style.transition = 'opacity .3s ease, transform .3s cubic-bezier(.2,1.4,.4,1)'; p.style.transitionDelay = (i * 0.06 + 0.15) + 's'; setTimeout(function (pp) { return function () { pp.style.opacity = '1'; pp.style.transform = 'translateX(0)'; }; }(p), 30); }
        svg.appendChild(p);
      });
    }
    return svg;
  }

  function renderResults() {
    root.className = 'cp-wrap'; root.innerHTML = '';
    root.appendChild(el('div', 'cp-ambient'));
    root.appendChild(el('span', 'cp-kicker', 'You’re set'));
    root.appendChild(el('h1', 'cp-h1', 'Your program’s built'));
    var lv = CFG.levels[0];
    var card = el('div', 'cp-card'); card.style.textAlign = 'center';
    var badge = plateSvg(1, { w: 140, h: 84, animate: true }); badge.style.margin = '4px auto 0'; card.appendChild(badge);
    var num = el('div'); num.style.cssText = 'font-family:var(--font-display);font-weight:900;font-size:2.4rem;margin-top:6px;color:var(--accent);'; num.textContent = '0'; card.appendChild(num);
    var lvl = el('div', 'cp-label', lv.weight + ' · ' + lv.name); card.appendChild(lvl);
    root.appendChild(card);
    if (!reduced) { var start = performance.now(); (function tick(t) { var k = Math.min(1, (t - start) / 700); num.textContent = String(Math.round(k * lv.weight)); if (k < 1) requestAnimationFrame(tick); })(start); } else num.textContent = String(lv.weight);

    // program lines (compose from their answers) — appear one at a time
    var prog = el('div', 'cp-card');
    var pd = postDays(); var dayNames = pd.map(function (i) { return DOW[i]; }).join(', ');
    var lines = [
      lv.weight + ' · ' + lv.name,
      daysCount() + ' posts a week — ' + (dayNames || 'days you pick'),
      '5 stories a day'
    ];
    var avail = availableDays();
    if (avail.length < levelRequiredPosts()) lines.push('You picked ' + avail.length + ' day' + (avail.length === 1 ? '' : 's') + ', so we’re starting there.');
    lines.forEach(function (t, i) { var row = el('div'); row.style.cssText = 'font-weight:700;padding:8px 0;border-bottom:1px solid var(--line);opacity:0;transform:translateY(8px);transition:opacity .3s ease,transform .3s ease;transition-delay:' + (0.2 + i * 0.12) + 's;'; row.textContent = t; prog.appendChild(row); if (reduced) { row.style.opacity = '1'; row.style.transform = 'none'; } else setTimeout(function () { row.style.opacity = '1'; row.style.transform = 'none'; }, 30); });
    var why = el('p', 'cp-note'); why.style.marginTop = '10px'; why.textContent = 'Why: ' + whyLine(); prog.appendChild(why);
    root.appendChild(prog);

    // Beat 2 — where you're going (all four levels, theirs lit)
    root.appendChild(el('h3', 'cp-section-title', 'Where you’re going'));
    CFG.levels.forEach(function (L, i) {
      var row = el('div', 'cp-level-row' + (i === 0 ? '' : ' locked'));
      var svg = plateSvg(L.plates, { w: 76, h: 48 }); svg.classList.add('lr-svg'); row.appendChild(svg);
      var meta = el('div'); meta.appendChild(el('h4', null, L.weight + ' · ' + esc(L.name)));
      meta.appendChild(el('div', 'lr-req', i === 0 ? 'You’re here' : (L.unlockDays + ' days on program without a miss')));
      meta.appendChild(el('p', null, esc(L.desc))); row.appendChild(meta); root.appendChild(row);
    });
    root.appendChild(el('p', 'cp-note', 'Your level never goes down. Miss a day and the streak resets, that’s all.'));

    var go = el('button', 'cp-btn cp-btn-primary', 'Pick my start day'); go.type = 'button'; go.style.marginTop = '14px'; go.onclick = renderStartDate; root.appendChild(go);
  }

  function renderStartDate() {
    root.className = 'cp-wrap'; root.innerHTML = '';
    root.appendChild(el('span', 'cp-kicker', 'Day Zero'));
    root.appendChild(el('h1', 'cp-h1', 'When do you want to start?'));
    root.appendChild(el('p', 'cp-sub', 'Whatever day you pick is your launch day — it overrides your normal schedule so you get your three pinned videos up first.'));
    var opts = [{ label: 'Today', d: today() }, { label: 'Tomorrow', d: addDays(today(), 1) }];
    opts.forEach(function (o) { var b = el('button', 'cp-btn cp-btn-primary', o.label); b.type = 'button'; b.style.marginTop = '10px'; b.onclick = function () { setStart(o.d); }; root.appendChild(b); });
    var wrap = el('div', 'cp-card');
    wrap.appendChild(el('div', 'cp-label', 'Or pick a date (max 7 days out)'));
    var inp = el('input', 'cp-input'); inp.type = 'date'; inp.min = ymd(today()); inp.max = ymd(addDays(today(), 7)); inp.style.marginTop = '8px';
    wrap.appendChild(inp);
    wrap.appendChild(el('p', 'cp-note', 'Any further out and you won’t start.'));
    var pick = el('button', 'cp-btn cp-btn-ghost', 'Use this date'); pick.type = 'button'; pick.style.marginTop = '8px'; pick.onclick = function () { if (!inp.value) return; var d = parseYmd(inp.value); if (d < today()) d = today(); if (d > addDays(today(), 7)) d = addDays(today(), 7); setStart(d); }; wrap.appendChild(pick);
    root.appendChild(wrap);
  }
  function setStart(d) { state.startDate = ymd(d); state.dayZeroDone = false; state.dzTasks = {}; persist(); renderDayZero(); }

  // ================= DAY ZERO =================
  function pinScript(pin) { return fill(pin.script); }
  function renderDayZero() {
    root.className = 'cp-wrap'; root.innerHTML = '';
    root.appendChild(el('span', 'cp-kicker', 'Day Zero · ' + (state.startDate === ymd(today()) ? 'Today' : (state.startDate === ymd(addDays(today(), 1)) ? 'Tomorrow' : (state.startDate)))));
    root.appendChild(el('h1', 'cp-h1', 'Launch day'));
    root.appendChild(el('p', 'cp-sub', 'This is the only day that looks like this. Get these done and everything after is one video at a time.'));

    var dz = CFG.dayZero || { tasks: [], pins: [] };
    var doneCount = 0, need = 0;
    dz.tasks.forEach(function (task) {
      var taskDone = isTaskDone(task);
      need += 1; if (taskDone) doneCount++;
      var box = el('div', 'cp-dz-task' + (taskDone ? ' done' : ''));
      var head = el('div', 'cp-dz-head');
      var chk = el('div', 'cp-dz-check', '✓'); head.appendChild(chk);
      head.appendChild(el('div', 'cp-dz-title', esc(task.title)));
      box.appendChild(head);
      var b = el('div', 'cp-dz-body'); b.appendChild(el('p', null, esc(task.body)));
      if (task.id === 'guide') { var gl = el('a', 'cp-btn cp-btn-ghost sm', 'Open the guide (downloadable)'); gl.href = '/content/filming-guide'; gl.target = '_blank'; gl.rel = 'noopener'; gl.style.cssText = 'display:inline-flex;margin-top:8px;text-decoration:none;'; gl.onclick = function (e) { e.stopPropagation(); }; b.appendChild(gl); }

      if (task.bioLine) { var bio = 'I help ' + (state.answered.audience || 'people') + ' ' + (state.answered.outcome || 'reach their goals'); var bl = el('div', 'cp-dz-pin'); bl.appendChild(el('div', 'cp-label', 'Your bio line')); bl.appendChild(el('p', 'cp-cta-text', esc(bio))); var cpy = el('button', 'cp-btn cp-btn-ghost sm', 'Copy bio'); cpy.type = 'button'; cpy.style.marginTop = '8px'; cpy.onclick = function (e) { e.stopPropagation(); copyText(bio, 'Bio copied'); }; bl.appendChild(cpy); b.appendChild(bl); }

      if (task.pins) {
        dz.pins.forEach(function (pin, pi) {
          var pinBox = el('div', 'cp-dz-pin');
          var ph = el('div'); ph.style.cssText = 'display:flex;align-items:center;gap:8px;';
          var pchk = el('button', 'cp-dz-check', state.dzTasks['pin' + (pi + 1)] ? '✓' : ''); pchk.style.cssText = 'width:26px;height:26px;' + (state.dzTasks['pin' + (pi + 1)] ? 'background:#16a34a;border-color:#16a34a;color:#fff;' : '');
          pchk.type = 'button'; pchk.onclick = function (e) { e.stopPropagation(); state.dzTasks['pin' + (pi + 1)] = !state.dzTasks['pin' + (pi + 1)]; persist(); renderDayZero(); };
          ph.appendChild(pchk);
          ph.appendChild(el('h4', null, 'Pin ' + (pi + 1) + ' — ' + esc(pin.title) + ' <span style="color:var(--muted);font-weight:600;font-size:.8rem;">(' + pin.len + ')</span>'));
          pinBox.appendChild(ph);
          var beats = el('ul', 'beats'); pin.beats.forEach(function (bt) { beats.appendChild(el('li', null, esc(bt))); }); pinBox.appendChild(beats);
          var sc = el('div', 'cp-script'); sc.textContent = pinScript(pin); sc.style.marginTop = '8px'; pinBox.appendChild(sc);
          var cpy = el('button', 'cp-btn cp-btn-ghost sm', 'Copy script'); cpy.type = 'button'; cpy.style.marginTop = '8px'; cpy.onclick = function (e) { e.stopPropagation(); copyText(pinScript(pin), 'Script copied'); }; pinBox.appendChild(cpy);
          b.appendChild(pinBox);
        });
        var allRow = el('div', 'cp-dz-head'); allRow.style.paddingTop = '6px';
        var allChk = el('div', 'cp-dz-check' + (state.dzTasks.pinsAll ? '' : ''), state.dzTasks.pinsAll ? '✓' : ''); if (state.dzTasks.pinsAll) allChk.style.cssText = 'background:#16a34a;border-color:#16a34a;color:#fff;';
        allRow.appendChild(allChk); allRow.appendChild(el('div', 'cp-dz-title', 'All three pinned to the top of my profile'));
        allRow.onclick = function () { state.dzTasks.pinsAll = !state.dzTasks.pinsAll; persist(); renderDayZero(); };
        b.appendChild(allRow);
      }
      box.appendChild(b);
      // toggle for simple tasks (link, profile, guide)
      if (!task.pins) head.onclick = function () { state.dzTasks[task.id] = !state.dzTasks[task.id]; persist(); renderDayZero(); };
      root.appendChild(box);
    });

    var allDone = dz.tasks.every(isTaskDone);
    var unlock = el('button', 'cp-btn cp-btn-primary', allDone ? 'Start day one →' : 'Finish the tasks to unlock'); unlock.type = 'button'; unlock.style.marginTop = '16px'; unlock.disabled = !allDone;
    unlock.onclick = function () { state.dayZeroDone = true; persist(); toast('You’re live'); renderDashboard(); };
    root.appendChild(unlock);
    if (!allDone) root.appendChild(el('p', 'cp-note', 'Your program’s ready. Three videos between you and day one. Day Zero doesn’t count against your compliance — the streak starts at day one.'));
  }
  function isTaskDone(task) { if (task.pins) return state.dzTasks.pin1 && state.dzTasks.pin2 && state.dzTasks.pin3 && state.dzTasks.pinsAll; return !!state.dzTasks[task.id]; }

  // ================= DASHBOARD =================
  function renderDashboard() {
    // Refresh the stored level once per render (safe: levelIndex() reads the
    // *previous* stored value through postDays, so there's no recursion).
    try { state.levelIdx = levelIndex(); } catch (e) {}
    root.className = 'cp-wrap'; root.innerHTML = '';
    // header + badge
    var head = el('div'); head.appendChild(el('span', 'cp-kicker', 'Content Program'));
    var titleRow = el('div'); titleRow.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;';
    titleRow.appendChild(el('h1', 'cp-h1', 'Today'));
    var redo = el('button', 'cp-btn cp-btn-ghost sm', 'Redo my program'); redo.type = 'button'; redo.onclick = function () { renderPathChooser(); }; titleRow.appendChild(redo);
    head.appendChild(titleRow); root.appendChild(head);

    renderBadgeHead();
    if (state.path === 'quick') renderUpgrade();
    maybeWeeklyRecap();
    renderTodayCard();
    renderStrip();
    renderCompliance();
    renderLinkRow();
    var dm = el('button', 'cp-btn cp-btn-ghost', 'Someone DM’d me — what do I say?'); dm.type = 'button'; dm.style.marginTop = '10px'; dm.onclick = openDmResponse; root.appendChild(dm);
    renderReminderRow();
  }

  function renderBadgeHead() {
    var lvi = levelIndex(); var lv = CFG.levels[lvi];
    var wrap = el('div', 'cp-badge-head'); wrap.setAttribute('role', 'button'); wrap.tabIndex = 0;
    var svg = plateSvg(lv.plates, { w: 76, h: 48 }); svg.classList.add('cp-badge-svg'); wrap.appendChild(svg);
    var meta = el('div', 'cp-badge-meta'); meta.appendChild(el('div', 'lvl', lv.weight + ' · ' + lv.name)); meta.appendChild(el('div', 'nm', 'On program ' + onProgramDaysTotal() + ' days · tap for levels')); wrap.appendChild(meta);
    wrap.onclick = renderLevels; wrap.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderLevels(); } };
    root.appendChild(wrap);
  }

  function renderLevels() {
    root.className = 'cp-wrap'; root.innerHTML = '';
    var back = el('button', 'cp-back', '‹ Back to today'); back.type = 'button'; back.onclick = renderDashboard; root.appendChild(back);
    root.appendChild(el('h1', 'cp-h1', 'The levels'));
    root.appendChild(el('p', 'cp-sub', 'Every level adds a plate. Stay on program and they slide on.'));
    var days = onProgramDaysTotal(); var cur = levelIndex();
    CFG.levels.forEach(function (lv, i) {
      var unlocked = i <= cur;
      var row = el('div', 'cp-level-row' + (unlocked ? '' : ' locked'));
      var svg = plateSvg(lv.plates, { w: 92, h: 56 }); svg.classList.add('lr-svg'); row.appendChild(svg);
      var meta = el('div');
      meta.appendChild(el('h4', null, lv.weight + ' · ' + esc(lv.name)));
      if (!unlocked) meta.appendChild(el('div', 'lr-req', (lv.unlockDays - days) + ' more days on program to unlock'));
      else meta.appendChild(el('div', 'lr-req', 'Unlocked'));
      meta.appendChild(el('p', null, esc(lv.desc)));
      row.appendChild(meta); root.appendChild(row);
    });
  }

  function renderUpgrade() {
    var answered = 0, totalDetailed = CFG.questions.filter(function (q) { return q.path === 'detailed'; }).length;
    CFG.questions.forEach(function (q) { if (q.path === 'detailed' && state.answered[q.id] != null && state.answered[q.id] !== '') answered++; });
    var remaining = totalDetailed - answered;
    var card = el('div', 'cp-card cp-unlock');
    card.appendChild(el('div', 'cp-label', 'Level up your posts'));
    card.appendChild(el('p', 'cp-sub', remaining + ' more answers unlocks the story posts and your voice — so your posts sound like you, not a good trainer in general.'));
    var b = el('button', 'cp-btn cp-btn-primary', 'Add more detail to my program'); b.type = 'button'; b.style.marginTop = '8px';
    b.onclick = function () { state.path = 'detailed'; persist(); startQuestionnaire({ upgrade: true }); }; card.appendChild(b);
    root.appendChild(card);
  }

  function postsMadeCount() { var n = 0; var end = today(); for (var c = new Date(programStart()); c <= end; c = addDays(c, 1)) { var a = assignedTasks(c); var ci = state.checkins[ymd(c)] || {}; if (a.post && ci.posted) n++; } return n; }

  function renderTodayCard() {
    var d = today(); var key = ymd(d); var s = scriptFor(d);
    var card = el('div', 'cp-today');
    var headEl = el('div', 'cp-today-head');
    headEl.appendChild(el('span', 'cp-today-date', DOW_FULL[d.getDay()] + ' · ' + (d.getMonth() + 1) + '/' + d.getDate()));
    headEl.appendChild(el('span', 'cp-jobtag ' + s.type, jobLabel(s.type))); card.appendChild(headEl);
    var body = el('div', 'cp-today-body');
    body.appendChild(el('h2', 'cp-jobtitle', s.title));

    if (s.type === 'stories') body.appendChild(el('p', 'cp-sub', 'No feed post today — just your 5 stories. That’s where the trust is built.'));
    else if (s.type === 'rest') body.appendChild(el('p', 'cp-sub', 'Rest day. Still get your stories up if you can.'));
    else {
      if (s.coachingNote) { var p = el('div', 'cp-prompt'); p.innerHTML = '<b>Why this post:</b> ' + esc(s.coachingNote); body.appendChild(p); }
      // hook
      if (s.hook) { var hk = el('div', 'cp-script'); hk.style.cssText = 'font-weight:700;font-size:1.06rem;'; hk.textContent = s.hook; body.appendChild(hk); }
      // angle: prompt (capture their take), their saved take, or proof
      if (s.angle && (s.angle.kind === 'prompt' || s.angle.kind === 'personal')) {
        if (s.angle.kind === 'prompt') {
          var pw = el('div', 'cp-cta-box'); pw.style.cssText = 'border-style:solid;';
          pw.appendChild(el('div', 'cp-label', 'Today: the ' + jobLabel(s.type).toLowerCase()));
          pw.appendChild(el('p', 'cp-cta-text', 'Topic: “' + esc(s.angle.topic) + '”'));
          pw.appendChild(el('p', 'cp-cta-why', 'Why people believe it: ' + esc(s.angle.why)));
          if (s.angle.ref) { var refP = el('p', 'cp-cta-why'); refP.style.marginTop = '4px'; refP.textContent = 'For reference (don’t read it): ' + s.angle.ref; pw.appendChild(refP); }
          pw.appendChild(el('p', 'cp-ask', s.angle.prompt)).style.marginTop = '10px';
          var ta = el('textarea', 'cp-textarea'); ta.placeholder = 'Say it your way…'; ta.setAttribute('aria-label', 'Your take'); pw.appendChild(ta);
          var save = el('button', 'cp-btn cp-btn-primary sm', 'Save my take'); save.type = 'button'; save.style.marginTop = '8px';
          save.onclick = function () { var v = ta.value.trim(); if (v.length < 3) { toast('Say a little more'); return; } savePersonalTake(s.angle.topicKey, v); toast('Saved — that’s yours now'); renderDashboard(); };
          pw.appendChild(save);
          pw.appendChild(el('p', 'cp-cta-why', 'The topic is the prompt. The video is yours — and you only answer it once.'));
          body.appendChild(pw);
        } else {
          var yt = el('div', 'cp-cta-box'); yt.style.cssText = 'border-style:solid;';
          yt.appendChild(el('div', 'cp-label', 'Your take on: “' + esc(s.angle.topic) + '”'));
          yt.appendChild(el('p', 'cp-cta-text', esc(s.angle.take)));
          var edit = el('button', 'cp-btn cp-btn-ghost sm', 'Edit'); edit.type = 'button'; edit.style.marginTop = '8px'; edit.onclick = function () { delete state.personalTakes[s.angle.topicKey]; persist(); renderDashboard(); };
          yt.appendChild(edit); body.appendChild(yt);
        }
      } else if (s.angle && s.angle.kind === 'proof') {
        var pf = el('div', 'cp-cta-box'); pf.style.cssText = 'border-style:solid;'; pf.appendChild(el('div', 'cp-label', 'Your proof')); pf.appendChild(el('p', 'cp-cta-text', esc(s.angle.text))); body.appendChild(pf);
      }
      if (s.framing) body.appendChild(el('p', 'cp-hooknote', s.framing));
      // beats — the script is the beat list (never a word-for-word middle)
      var beatsWrap = el('div', 'cp-card'); beatsWrap.style.marginTop = '12px'; beatsWrap.appendChild(el('div', 'cp-label', 'Your beats' + (s.length ? ' · ' + s.length : '')));
      (s.beats || []).forEach(function (b) { var row = el('div'); row.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:.92rem;'; var t = el('span'); t.style.cssText = 'font-weight:800;color:var(--accent);white-space:nowrap;'; t.textContent = b.t; row.appendChild(t); row.appendChild(el('span', null, esc(b.job))); beatsWrap.appendChild(row); });
      body.appendChild(beatsWrap);
      // never-repeat counter
      var made = postsMadeCount(); var avail = postsAvailable();
      if (made <= avail) body.appendChild(el('p', 'cp-hooknote', 'Post ' + (made + 1) + ' of ' + avail + ' — you haven’t repeated yet.'));
      var copyRow = el('div', 'cp-copyrow'); var copyScript = el('button', 'cp-btn cp-btn-primary', 'Copy filming plan'); copyScript.type = 'button'; copyScript.onclick = function () { copyText(filmingPlan(s), 'Filming plan copied'); }; copyRow.appendChild(copyScript); body.appendChild(copyRow);
      var ctaBox = el('div', 'cp-cta-box'); ctaBox.appendChild(el('div', 'cp-label', 'Your locked CTA')); ctaBox.appendChild(el('p', 'cp-cta-text', esc(ctaText()))); ctaBox.appendChild(el('p', 'cp-cta-why', (LIB.cta && LIB.cta.note) || 'Same words every time.'));
      var copyCta = el('button', 'cp-btn cp-btn-ghost sm', 'Copy CTA'); copyCta.type = 'button'; copyCta.style.marginTop = '8px'; copyCta.onclick = function () { copyText(ctaText(), 'CTA copied'); }; ctaBox.appendChild(copyCta); body.appendChild(ctaBox);
    }
    body.appendChild(renderStories(d));
    var ci = state.checkins[key] || {};
    var posted = el('button', 'cp-btn cp-btn-primary cp-iposted', ci.posted ? '✓ Posted today' : 'I posted'); posted.type = 'button'; if (ci.posted) { posted.classList.remove('cp-btn-primary'); posted.classList.add('cp-btn-ghost'); }
    posted.onclick = function () { openCheckin(d); }; body.appendChild(posted);
    body.appendChild(el('p', 'cp-hooknote', 'Today’s locked in. You can change future days.'));
    card.appendChild(body); root.appendChild(card);
  }

  function renderStories(d) {
    var key = ymd(d); var slots = storiesFor(d); var doneArr = state.storiesDone[key] || [false, false, false, false, false];
    var wrap = el('div', 'cp-stories'); var count = doneArr.filter(Boolean).length;
    var titleRow = el('div'); titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:6px;';
    titleRow.appendChild(el('span', 'cp-label', 'Stories · ' + count + '/5'));
    var copyAll = el('button', 'cp-btn cp-btn-ghost sm', 'Copy all 5'); copyAll.type = 'button'; copyAll.onclick = function () { copyText(slots.map(function (x, i) { return (i + 1) + '. ' + x.line; }).join('\n\n'), 'All 5 copied'); }; titleRow.appendChild(copyAll); wrap.appendChild(titleRow);
    slots.forEach(function (slot, i) {
      var row = el('div', 'cp-story'); row.appendChild(el('div', 'cp-story-n', String(i + 1)));
      var txt = el('div', 'cp-story-txt'); txt.appendChild(el('div', 'cp-story-slot', esc(slot.slot))); txt.appendChild(el('div', 'cp-story-line', esc(slot.line)));
      var actions = el('div'); actions.style.cssText = 'display:flex;gap:6px;flex-direction:column;';
      var chk = el('button', 'cp-story-check' + (doneArr[i] ? ' done' : ''), doneArr[i] ? '✓' : ''); chk.type = 'button'; chk.setAttribute('aria-label', 'Mark story ' + (i + 1) + ' done'); chk.onclick = function () { doneArr[i] = !doneArr[i]; state.storiesDone[key] = doneArr; persist(); renderDashboard(); };
      var cp = el('button', 'cp-story-check', '⧉'); cp.type = 'button'; cp.style.fontSize = '0.9rem'; cp.setAttribute('aria-label', 'Copy story ' + (i + 1)); cp.onclick = function () { copyText(slot.line, 'Story ' + (i + 1) + ' copied'); };
      actions.appendChild(chk); actions.appendChild(cp); row.appendChild(txt); row.appendChild(actions); wrap.appendChild(row);
    });
    wrap.appendChild(el('p', 'cp-hooknote', (LIB.stories_daily && LIB.stories_daily.coaching_note) || '')); return wrap;
  }

  function renderStrip() {
    root.appendChild(el('h3', 'cp-section-title', 'Next 14 days'));
    var strip = el('div', 'cp-strip'); var start = today();
    for (var i = 0; i < 14; i++) (function (i) {
      var d = addDays(start, i); var job = jobFor(d);
      var cell = el('div', 'cp-day-cell' + (i === 0 ? ' today' : '') + (i > 0 ? ' editable' : ''));
      cell.appendChild(el('div', 'cp-dc-dow', DOW[d.getDay()])); cell.appendChild(el('div', 'cp-dc-date', String(d.getDate()))); cell.appendChild(el('div', 'cp-dc-job ' + job, stripLabel(job)));
      var dotCls = 'upcoming'; if (i === 0) { var r = dayCompletion(d); dotCls = (r.total > 0 && r.done >= r.total) ? 'done' : 'upcoming'; } cell.appendChild(el('div', 'cp-dc-dot ' + dotCls));
      if (i > 0) { cell.appendChild(el('div', 'cp-dc-pencil', '✎')); cell.onclick = function () { openEditDay(d); }; cell.setAttribute('role', 'button'); cell.tabIndex = 0; cell.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditDay(d); } }; }
      else cell.onclick = function () { toast('Today’s locked in. You can change future days.'); };
      strip.appendChild(cell);
    })(i);
    root.appendChild(strip);
  }

  function renderCompliance() {
    var p7 = compliancePct(7); var p30 = compliancePct(30); var streak = currentStreak();
    root.appendChild(el('h3', 'cp-section-title', 'Compliance'));
    var band = (p7 == null) ? 'amber' : (p7 >= 85 ? 'green' : p7 >= 60 ? 'amber' : 'red');
    var lbl = (p7 == null) ? 'No data yet' : (p7 >= 85 ? 'On program' : p7 >= 60 ? 'Slipping' : 'Off program');
    var card = el('div', 'cp-card cp-score ' + band);
    var main = el('div'); main.appendChild(el('span', 'cp-score-num', (p7 == null ? '—' : p7 + '%'))); main.appendChild(el('span', 'cp-band', lbl));
    card.appendChild(main);
    card.appendChild(el('div', 'cp-score-30', '7-day · 30-day: ' + (p30 == null ? '—' : p30 + '%') + '  ·  Streak: ' + streak + ' day' + (streak === 1 ? '' : 's')));
    card.appendChild(el('p', 'cp-note', 'This is the same number you’d give a client who says they’re “kind of” following the plan.'));
    if (streak === 0 && Object.keys(state.checkins).length > 0) card.appendChild(el('p', 'cp-note', 'Streak reset. You’re one post from a new one.'));
    root.appendChild(card);
    var milestone = streak >= 60 ? 60 : streak >= 30 ? 30 : 0;
    if (milestone && state.lastPack < milestone) {
      var u = el('div', 'cp-card cp-unlock'); u.appendChild(el('div', 'cp-label', '⭐ ' + milestone + '-day streak'));
      u.appendChild(el('p', 'cp-sub', milestone === 30 ? 'On program a full month. Ready to add a posting day?' : 'Two months in. Add another day and take the next pack.'));
      var brow = el('div', 'cp-copyrow');
      if (daysCount() < 5) { var bump = el('button', 'cp-btn cp-btn-primary', 'Add a posting day (→ ' + (daysCount() + 1) + ')'); bump.type = 'button'; bump.onclick = function () { renderPathChooser(); }; brow.appendChild(bump); }
      var pack = el('button', 'cp-btn cp-btn-ghost', 'Get my 5-post idea pack'); pack.type = 'button'; pack.onclick = function () { state.lastPack = milestone; persist(); showIdeaPack(milestone); }; brow.appendChild(pack); u.appendChild(brow); root.appendChild(u);
    }
  }

  function maybeWeeklyRecap() {
    if (today().getDay() !== 0) return; // Sundays only
    if (Object.keys(state.checkins).length === 0) return;
    var end = today(); var start = addDays(end, -6); if (start < programStart()) start = programStart();
    var posts = 0, storiesHit = 0, storiesTotal = 0;
    for (var c = new Date(start); c <= end; c = addDays(c, 1)) { var ci = state.checkins[ymd(c)] || {}; if (ci.posted) posts++; if (assignedTasks(c).stories) { storiesTotal++; if (ci.stories === 'yes') storiesHit++; } }
    var weeks = Math.max(1, Math.ceil((daysBetween(state.startDate, ymd(today())) + 1) / 7));
    var card = el('div', 'cp-card cp-unlock');
    card.appendChild(el('div', 'cp-label', 'Weekly recap'));
    card.appendChild(el('p', 'cp-sub', posts + ' posts · ' + storiesHit + '/' + storiesTotal + ' story days · ' + (compliancePct(7) || 0) + '% compliance · ' + currentStreak() + '-day streak.'));
    card.appendChild(el('p', 'cp-note', 'You’ve now said “' + esc(state.answered.core || 'your one thing') + '” ' + Math.min(posts + storiesHit, 9) + ' different ways in ' + weeks + ' week' + (weeks === 1 ? '' : 's') + '. That’s how people start associating you with it.'));
    root.appendChild(card);
  }

  function renderLinkRow() {
    root.appendChild(el('h3', 'cp-section-title', 'Your landing page link'));
    var card = el('div', 'cp-card'); var row = el('div', 'cp-linkrow');
    var inp = el('input', 'cp-input'); inp.value = state.answered.link || autoLink(); inp.setAttribute('aria-label', 'Landing page link'); inp.onchange = function () { state.answered.link = inp.value.trim(); persist(); };
    var copy = el('button', 'cp-btn cp-btn-primary sm', 'Copy'); copy.type = 'button'; copy.onclick = function () { copyText(inp.value.trim(), 'Link copied'); };
    row.appendChild(inp); row.appendChild(copy); card.appendChild(row); root.appendChild(card);
  }
  function renderReminderRow() {
    root.appendChild(el('h3', 'cp-section-title', 'Daily reminder'));
    var card = el('div', 'cp-card'); var row = el('div', 'cp-linkrow');
    var inp = el('input', 'cp-input'); inp.type = 'time'; inp.value = state.reminderTime || '18:00'; inp.setAttribute('aria-label', 'Reminder time'); inp.onchange = function () { state.reminderTime = inp.value; persist(); scheduleReminder(); toast('Reminder set for ' + inp.value); };
    var en = el('button', 'cp-btn cp-btn-ghost sm', 'Enable'); en.type = 'button'; en.onclick = enableNotifications;
    row.appendChild(inp); row.appendChild(en); card.appendChild(row);
    card.appendChild(el('p', 'cp-note', 'We’ll name the job: “Wednesday — mistake post. Tap for your script.” A web page only reminds while it’s open — full background reminders come with the installed app.'));
    root.appendChild(card);
  }

  function jobLabel(t) { return { win: 'Win', mistake: 'Mistake', app: 'Free app', rest: 'Rest', stories: 'Stories only' }[t] || t; }
  function stripLabel(t) { return { win: 'Win', mistake: 'Mistake', app: 'App', rest: 'Rest', stories: 'Stories' }[t] || t; }

  // ================= CHECK-IN (+ post-it-back) =================
  function openCheckin(d) {
    var key = ymd(d); var ci = state.checkins[key] || {}; var node = el('div');
    node.appendChild(el('h3', null, 'Today’s check-in')); node.appendChild(el('p', 'cp-sub', 'One tap. Be honest — this is your compliance score.'));
    node.appendChild(el('p', 'cp-ask', 'Did you post today?'));
    var postSeg = el('div', 'cp-seg'); var postVal = ci.posted === true ? 'yes' : (ci.posted === false ? 'no' : null);
    ['Yes', 'No'].forEach(function (lbl) { var b = el('button', (postVal === lbl.toLowerCase()) ? 'on' : ''); b.type = 'button'; b.textContent = lbl; b.onclick = function () { postVal = lbl.toLowerCase(); [].forEach.call(postSeg.children, function (c) { c.classList.toggle('on', c.textContent === lbl); }); syncExtra(); }; postSeg.appendChild(b); });
    node.appendChild(postSeg);
    var stAsk = el('p', 'cp-ask', 'Did you get your stories up?'); stAsk.style.marginTop = '14px'; node.appendChild(stAsk);
    var stSeg = el('div', 'cp-seg'); var stVal = ci.stories || null;
    [['Yes', 'yes'], ['Partial', 'partial'], ['No', 'no']].forEach(function (pair) { var b = el('button', (stVal === pair[1]) ? 'on' : ''); b.type = 'button'; b.textContent = pair[0]; b.onclick = function () { stVal = pair[1]; [].forEach.call(stSeg.children, function (c) { c.classList.toggle('on', c.textContent === pair[0]); }); syncExtra(); }; stSeg.appendChild(b); });
    node.appendChild(stSeg);
    function needReason() { return postVal === 'no' || stVal === 'no'; }
    var reasonWrap = el('div'); reasonWrap.style.marginTop = '14px'; reasonWrap.appendChild(el('p', 'cp-ask', 'What got in the way?'));
    var reasonSeg = el('div'); reasonSeg.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;'; var reasonVal = ci.reason || null;
    [['no time', 'no time'], ['didn’t know what to say', 'didnt know'], ['forgot', 'forgot'], ['didn’t feel like it', 'didnt feel']].forEach(function (pair) { var b = el('button', 'cp-chip'); b.type = 'button'; b.textContent = pair[0]; if (reasonVal === pair[1]) b.style.cssText = 'background:var(--accent);border-color:var(--accent);color:#1c1206;'; b.onclick = function () { reasonVal = pair[1]; [].forEach.call(reasonSeg.children, function (c) { c.style.cssText = ''; }); b.style.cssText = 'background:var(--accent);border-color:var(--accent);color:#1c1206;'; }; reasonSeg.appendChild(b); });
    reasonWrap.appendChild(reasonSeg); node.appendChild(reasonWrap);
    // post-it-back (optional): only for posting days
    var ps = state.postStats[key] || {}; var statWrap = el('div'); statWrap.style.marginTop = '14px';
    statWrap.appendChild(el('p', 'cp-ask', 'How did it do? (optional)'));
    var statRow = el('div'); statRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;';
    var vIn = el('input', 'cp-input'); vIn.type = 'text'; vIn.inputMode = 'numeric'; vIn.placeholder = 'views'; vIn.value = ps.views || '';
    var dIn = el('input', 'cp-input'); dIn.type = 'text'; dIn.inputMode = 'numeric'; dIn.placeholder = 'DMs'; dIn.value = ps.dms || '';
    var cIn = el('input', 'cp-input'); cIn.type = 'text'; cIn.inputMode = 'numeric'; cIn.placeholder = 'clicks'; cIn.value = ps.clicks || '';
    statRow.appendChild(vIn); statRow.appendChild(dIn); statRow.appendChild(cIn); statWrap.appendChild(statRow);
    var isPost = assignedTasks(d).post;
    // Quality floor — all five must be ticked before a post counts (v5 §2.8).
    var qcWrap = el('div'); qcWrap.style.marginTop = '14px';
    qcWrap.appendChild(el('p', 'cp-ask', 'Quick quality check'));
    qcWrap.appendChild(el('p', 'cp-hooknote', 'Ten seconds. This catches most of what goes wrong.'));
    var qcItems = (LIB.quality_check || []); var qcState = (ci.quality || []).slice();
    qcItems.forEach(function (label, qi) {
      var row = el('label', 'cp-story'); row.style.cursor = 'pointer';
      var box = el('span', 'cp-story-check' + (qcState[qi] ? ' done' : ''), qcState[qi] ? '✓' : ''); box.style.cssText = 'width:26px;height:26px;';
      row.appendChild(box); var txt = el('div', 'cp-story-txt'); txt.appendChild(el('div', 'cp-story-line', esc(label))); row.appendChild(txt);
      row.onclick = function () { qcState[qi] = !qcState[qi]; box.className = 'cp-story-check' + (qcState[qi] ? ' done' : ''); box.textContent = qcState[qi] ? '✓' : ''; };
      qcWrap.appendChild(row);
    });
    function qcAllTicked() { return qcItems.length > 0 && qcItems.every(function (_, qi) { return qcState[qi]; }); }
    function syncExtra() { reasonWrap.style.display = needReason() ? 'block' : 'none'; var showPost = (isPost && postVal === 'yes'); statWrap.style.display = showPost ? 'block' : 'none'; qcWrap.style.display = showPost ? 'block' : 'none'; }
    if (isPost) { node.appendChild(qcWrap); node.appendChild(statWrap); }
    syncExtra();
    var save = el('button', 'cp-btn cp-btn-primary', 'Save check-in'); save.type = 'button'; save.style.marginTop = '16px';
    var qcErr = el('p', 'cp-err');
    save.onclick = function () {
      if (isPost && postVal === 'yes' && !qcAllTicked()) { qcErr.textContent = 'Tick all five — a post that skips these usually underperforms.'; return; }
      state.checkins[key] = { posted: postVal === 'yes', stories: stVal || 'no', reason: needReason() ? (reasonVal || '') : '', quality: (isPost && postVal === 'yes') ? qcState.slice() : [] };
      if (isPost && postVal === 'yes') { var num = function (x) { x = String(x || '').replace(/[^0-9]/g, ''); return x ? +x : undefined; }; var st = { views: num(vIn.value), dms: num(dIn.value), clicks: num(cIn.value) }; if (st.views != null || st.dms != null || st.clicks != null) state.postStats[key] = st; }
      persist(); closeModal(); toast('Logged'); renderDashboard();
    };
    node.appendChild(qcErr); node.appendChild(save);
    var cancel = el('button', 'cp-btn cp-btn-ghost', 'Cancel'); cancel.type = 'button'; cancel.style.marginTop = '8px'; cancel.onclick = closeModal; node.appendChild(cancel);
    openModal(node);
  }

  // DM handling — the copy button that gets a lead to the link (don't sell in DMs).
  function openDmResponse() {
    var node = el('div'); node.appendChild(el('h3', null, 'When someone DMs you'));
    node.appendChild(el('p', 'cp-sub', (LIB.dm_response && LIB.dm_response.note) || 'Get them to the link.'));
    var txt = fill((LIB.dm_response && LIB.dm_response.text) || '');
    var box = el('div', 'cp-script'); box.textContent = txt; box.style.marginTop = '10px'; node.appendChild(box);
    var copy = el('button', 'cp-btn cp-btn-primary', 'Copy this reply'); copy.type = 'button'; copy.style.marginTop = '12px'; copy.onclick = function () { copyText(txt, 'Reply copied'); }; node.appendChild(copy);
    var done = el('button', 'cp-btn cp-btn-ghost', 'Close'); done.type = 'button'; done.style.marginTop = '8px'; done.onclick = closeModal; node.appendChild(done);
    openModal(node);
  }

  // ================= EDIT FUTURE DAY =================
  function openEditDay(d) {
    var key = ymd(d); var ov = state.overrides[key] || {}; var currentType = jobFor(d); var node = el('div');
    node.appendChild(el('h3', null, 'Edit ' + DOW_FULL[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate()));
    node.appendChild(el('p', 'cp-ask', 'What do you want this day to be?'));
    var typeSeg = el('div'); typeSeg.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    var chosenType = currentType === 'stories' ? 'stories' : currentType; var typeBtns = {};
    [['Win', 'win'], ['Mistake', 'mistake'], ['App', 'app'], ['Rest', 'rest']].forEach(function (pair) { var b = el('button', 'cp-chip'); b.type = 'button'; b.textContent = pair[0]; if (chosenType === pair[1]) markChip(b); b.onclick = function () { chosenType = pair[1]; Object.keys(typeBtns).forEach(function (k) { unmarkChip(typeBtns[k]); }); markChip(b); mistakeWrap.style.display = (chosenType === 'mistake') ? 'block' : 'none'; }; typeSeg.appendChild(b); typeBtns[pair[1]] = b; });
    node.appendChild(typeSeg);
    var mistakeWrap = el('div'); mistakeWrap.style.marginTop = '14px'; mistakeWrap.appendChild(el('p', 'cp-ask', 'Which mistake?'));
    var mSeg = el('div'); mSeg.style.cssText = 'display:flex;flex-direction:column;gap:6px;'; var mChosen = (typeof ov.mistakeIndex === 'number') ? ov.mistakeIndex : null; var mBtns = [];
    function drawMistakeBtns() {
      mSeg.innerHTML = ''; mBtns = [];
      mistakesList().forEach(function (m, i) { var b = el('button', 'cp-chip'); b.type = 'button'; b.style.textAlign = 'left'; b.textContent = m; if (mChosen === i) markChip(b); b.onclick = function () { mChosen = i; mBtns.forEach(unmarkChip); markChip(b); }; mSeg.appendChild(b); mBtns.push(b); });
      var add = el('button', 'cp-btn cp-btn-ghost sm', '+ Add a new mistake'); add.type = 'button'; add.style.marginTop = '4px'; add.onclick = function () { var inp = el('input', 'cp-input'); inp.placeholder = 'New mistake'; inp.style.marginTop = '6px'; var go = el('button', 'cp-btn cp-btn-primary sm', 'Add'); go.type = 'button'; go.style.marginTop = '6px'; go.onclick = function () { var val = inp.value.trim(); if (!val) return; state.answered.extraMistakes = state.answered.extraMistakes || []; state.answered.extraMistakes.push(val); mChosen = mistakesList().length - 1; persist(); drawMistakeBtns(); }; mSeg.appendChild(inp); mSeg.appendChild(go); };
      mSeg.appendChild(add);
    }
    drawMistakeBtns(); mistakeWrap.appendChild(mSeg); mistakeWrap.style.display = (chosenType === 'mistake') ? 'block' : 'none'; node.appendChild(mistakeWrap);
    var whyAsk = el('p', 'cp-ask', 'Why are you changing it?'); whyAsk.style.marginTop = '14px'; node.appendChild(whyAsk);
    var why = el('input', 'cp-input'); why.placeholder = 'Short — required'; why.value = ov.reason || ''; node.appendChild(why);
    var err = el('p', 'cp-err'); node.appendChild(err);
    var save = el('button', 'cp-btn cp-btn-primary', 'Save this day'); save.type = 'button'; save.style.marginTop = '14px';
    save.onclick = function () {
      if (baseJob(d) === 'app' && chosenType !== 'app') { err.textContent = 'The app day stays. It’s how you get leads from people who aren’t ready to pay yet. Use “Move the app day” instead.'; return; }
      if (!why.value.trim()) { err.textContent = 'Tell me why — one line.'; return; }
      var override = { type: chosenType, reason: why.value.trim() }; if (chosenType === 'mistake' && mChosen != null) override.mistakeIndex = mChosen;
      state.overrides[key] = override; state.editLog.push({ date: key, type: chosenType, reason: why.value.trim(), at: new Date().toISOString() }); if (state.editLog.length > 200) state.editLog = state.editLog.slice(-200);
      persist(); closeModal(); toast('Day updated'); renderDashboard();
    };
    node.appendChild(save);
    var moveApp = el('button', 'cp-btn cp-btn-ghost', 'Move the app day here'); moveApp.type = 'button'; moveApp.style.marginTop = '8px';
    moveApp.onclick = function () { if (postDays().indexOf(d.getDay()) === -1) { var pd = postDays(); pd.push(d.getDay()); pd.sort(function (a, b) { return a - b; }); state.answered.days = { count: Math.max(daysCount(), pd.length), days: pd }; } state.appWeekday = d.getDay(); state.editLog.push({ date: key, type: 'move-app', reason: 'moved app day', at: new Date().toISOString() }); persist(); closeModal(); toast('App day moved to ' + DOW_FULL[d.getDay()]); renderDashboard(); };
    node.appendChild(moveApp);
    var cancel = el('button', 'cp-btn cp-btn-ghost', 'Cancel'); cancel.type = 'button'; cancel.style.marginTop = '8px'; cancel.onclick = closeModal; node.appendChild(cancel);
    openModal(node);
  }
  function markChip(b) { b.classList.add('on'); b.style.cssText = (b.style.textAlign === 'left' ? 'text-align:left;' : '') + 'background:var(--accent);border-color:var(--accent);color:#1c1206;'; }
  function unmarkChip(b) { b.classList.remove('on'); b.style.cssText = (b.style.textAlign === 'left' ? 'text-align:left;' : ''); }

  // ================= IDEA PACK =================
  function showIdeaPack(milestone) {
    var node = el('div'); node.appendChild(el('h3', null, milestone + '-day idea pack')); node.appendChild(el('p', 'cp-sub', '5 filming plans from angles you haven’t used yet. Bank them for a busy week.'));
    var types = ['mistake', 'myth', 'win', 'objection', 'app'];
    types.forEach(function (type, i) {
      var idx = milestone + i * 3;
      // reuse scriptFor's shape by faking an occurrence via a synthetic date offset
      var pt = (LIB.post_types || {})[type] || {}; var beats = ((type === 'win' && state.answered.has_proof === 'self') ? (pt.no_client_variant || {}).beats : pt.beats) || [];
      var plan = filmingPlan({ type: type, hook: (type === 'app') ? fill(pick(pt.hook_variants, idx)) : (type === 'win' ? fill('When {proof_name} started, they were sure {proof_belief}.') : hookLine(idx, (mistakesList()[idx % Math.max(1, mistakesList().length)]))), angle: null, beats: beats.map(function (b) { return { t: b.t, job: fill(b.job) }; }), cta: ctaText() });
      var c = el('div', 'cp-card'); c.appendChild(el('div', 'cp-label', jobLabel(type))); var sc = el('div', 'cp-script'); sc.textContent = plan; sc.style.marginTop = '8px'; c.appendChild(sc);
      var b = el('button', 'cp-btn cp-btn-ghost sm', 'Copy'); b.type = 'button'; b.style.marginTop = '8px'; b.onclick = function () { copyText(plan, 'Copied'); }; c.appendChild(b);
      node.appendChild(c);
    });
    var done = el('button', 'cp-btn cp-btn-primary', 'Done'); done.type = 'button'; done.style.marginTop = '14px'; done.onclick = closeModal; node.appendChild(done); openModal(node);
  }

  // ================= reminders =================
  function enableNotifications() { if (!('Notification' in window)) { toast('This browser can’t do reminders'); return; } Notification.requestPermission().then(function (p) { if (p === 'granted') { toast('Reminders on'); scheduleReminder(); } else toast('Reminders blocked in settings'); }); }
  var reminderTimer = 0;
  function scheduleReminder() {
    if (reminderTimer) clearTimeout(reminderTimer);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var t = String(state.reminderTime || '18:00').split(':'); var now = new Date(); var fire = new Date(); fire.setHours(+t[0] || 18, +t[1] || 0, 0, 0); if (fire <= now) { fire = addDays(fire, 1); fire.setHours(+t[0] || 18, +t[1] || 0, 0, 0); }
    var ms = fire - now; if (ms > 2147483647) ms = 2147483647;
    reminderTimer = setTimeout(function () { var d = today(); var job = jobFor(d); var msg = (job === 'app') ? (DOW_FULL[d.getDay()] + ' — free-app post. Tap for your script.') : (job === 'stories' || job === 'rest') ? (DOW_FULL[d.getDay()] + ' — get your 5 stories up.') : (DOW_FULL[d.getDay()] + ' — ' + job + ' post. Tap for your script.'); try { new Notification('RiseForIt', { body: msg }); } catch (e) {} scheduleReminder(); }, ms);
  }
  function maybeEveningNudge() { var key = ymd(today()); if (state.checkins[key]) return; if (new Date().getHours() < 17) return; setTimeout(function () { toast('Evening check-in: did you post today?'); }, 1400); }

  // ================= boot / router =================
  function route() {
    if (!state.path || !state.setupDone) { if (state.path && !state.setupDone) return startQuestionnaire({ resume: true }); return renderPathChooser(); }
    if (!state.startDate) return renderStartDate();
    if (!state.dayZeroDone) return renderDayZero();
    renderDashboard(); maybeEveningNudge(); scheduleReminder();
  }
  function boot() {
    state = loadLocal() || defaultState();
    route();
    // Reconcile with the server draft by freshness (newest wins) — never let an
    // older/empty profile clobber in-progress answers (that was the wipe bug).
    loadFromProfile().then(function (cp) {
      if (cp && cp.answered && (cp.updatedAt || 0) > (state.updatedAt || 0)) {
        state = Object.assign(defaultState(), cp);
        try { localStorage.setItem(lsKey(), JSON.stringify(state)); localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
        route();
      }
    });
  }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
