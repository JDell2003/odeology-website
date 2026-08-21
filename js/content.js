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
      editLog: [], postStats: {}, personalTakes: {}, reminderTime: '18:00', lastPack: 0, levelIdx: 0,
      redoing: false, answered_meta: {},
      hookDay: 3, hookChoices: {}, trainerHooks: [],
      // v10 0.2/0.3 — THE commit boundary. The questionnaire (first run AND
      // redo) only ever writes into `draft`; the live `answered` program is
      // untouched until finish commits the draft. Abandon = discard the draft,
      // live program survives.
      draft: null
    };
  }
  function deepClone(o) { try { return JSON.parse(JSON.stringify(o || {})); } catch (e) { return {}; } }
  function beginDraft(path) {
    state.draft = {
      answers: state.setupDone ? deepClone(state.answered) : {},
      meta: deepClone(state.answered_meta || {}),
      path: path || state.path || 'quick',
      i: 0
    };
    state.redoing = !!state.setupDone;
    persist();
  }
  // Effective answers for the questionnaire + previews: the draft while one is
  // open, the committed program otherwise.
  function qa() { return (state.draft && state.draft.answers) ? state.draft.answers : state.answered; }
  function qmeta() { return (state.draft && state.draft.meta) ? state.draft.meta : (state.answered_meta = state.answered_meta || {}); }
  // v10 0.1 — storage is STRICTLY per-user. No un-keyed fallback: on a shared
  // browser that let account B inherit account A's entire program (the
  // staydown0813 bleed). Un-keyed keys get deleted, never migrated — we can't
  // know whose they are. A uid stamp inside the object is the second line of
  // defence.
  function currentUid() { try { var u = window.__odeCurrentUser || (typeof readAuthUserHint === 'function' ? readAuthUserHint() : null); return u && (u.id || u.username) ? String(u.id || u.username) : ''; } catch (e) {} return ''; }
  function lsKey() { var uid = currentUid(); return uid ? LS_KEY + ':' + uid : ''; }
  function purgeForeignStorage() {
    try {
      var uid = currentUid(); var mine = lsKey(); var kill = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k === LS_KEY || k === LS_OLD) kill.push(k); // un-keyed: delete, never migrate
        else if (k && k.indexOf(LS_KEY + ':') === 0 && k !== mine) kill.push(k); // other accounts on this browser
      }
      kill.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {}
  }
  function loadLocal() {
    purgeForeignStorage();
    var key = lsKey(); if (!key) return null; // no resolved user → no program
    try {
      var raw = JSON.parse(localStorage.getItem(key) || 'null');
      if (raw && raw.answered) {
        if (raw.uid && raw.uid !== currentUid()) { try { localStorage.removeItem(key); } catch (e) {} return null; }
        return raw;
      }
    } catch (e) {}
    return null;
  }
  var saveTimer = 0;
  function persist() {
    state.updatedAt = Date.now();
    state.uid = currentUid();
    var key = lsKey();
    if (key) { try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) {} }
    if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(saveToProfile, 400);
  }
  // Server save with VISIBLE failure feedback. A trainer must never answer
  // questions into the void: on a failed POST we show a persistent banner and
  // retry with backoff until a save lands, then clear it.
  var saveRetryTimer = 0;
  var saveRetryDelay = 2000;
  function saveBannerEl() {
    var el = document.getElementById('cp-save-banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'cp-save-banner';
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;display:none;'
      + 'padding:10px 16px;border-radius:10px;background:#8f1d1d;color:#fff;'
      + 'font:700 13px/1.4 "Space Grotesk",system-ui,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,.35);max-width:92vw;text-align:center;';
    el.textContent = 'Answers not saving — check connection. Retrying…';
    (document.body || document.documentElement).appendChild(el);
    return el;
  }
  function saveFailed() {
    try { saveBannerEl().style.display = 'block'; } catch (e) {}
    if (saveRetryTimer) clearTimeout(saveRetryTimer);
    saveRetryTimer = setTimeout(function () { saveRetryTimer = 0; saveToProfile(); }, saveRetryDelay);
    saveRetryDelay = Math.min(saveRetryDelay * 2, 60000);
  }
  function saveSucceeded() {
    saveRetryDelay = 2000;
    if (saveRetryTimer) { clearTimeout(saveRetryTimer); saveRetryTimer = 0; }
    var el = document.getElementById('cp-save-banner');
    if (el) el.style.display = 'none';
  }
  function saveIdentityMismatch() {
    // The session changed under the page (peered in/out in another tab). A
    // retry would just save to the wrong account — stop and tell the user
    // instead of silently misdirecting answers (the peer routing bug).
    try {
      var el = saveBannerEl();
      el.style.background = '#8a5a00';
      el.textContent = 'Not saving — your session changed (peered in or out). Reload this page before continuing.';
      el.style.display = 'block';
    } catch (e) {}
    if (saveRetryTimer) { clearTimeout(saveRetryTimer); saveRetryTimer = 0; }
    renderWhoBanner();
  }
  function saveToProfile() {
    try {
      // Server-authoritative save target: tell the server which account we
      // BELIEVE we're editing; it rejects (409) if that != the session's user,
      // so a stale page can never save one trainer's answers into another's row.
      var expectedUserId = (window.__odeCurrentUser && window.__odeCurrentUser.id) ? String(window.__odeCurrentUser.id) : '';
      fetch('/api/profile', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { content_program_v2: state }, expectedUserId: expectedUserId }) })
        .then(function (r) {
          if (r && r.ok) { saveSucceeded(); return; }
          if (r && r.status === 409) { saveIdentityMismatch(); return; }
          saveFailed();
        })
        .catch(function () { saveFailed(); });
    } catch (e) { saveFailed(); }
  }
  // ---------- identity banner ----------
  // Persistent, unmistakable "whose content program is this" bar. The peer
  // (impersonation) save-routing bug silently misdirected two trainers'
  // onboarding calls; this makes the active save target impossible to miss.
  function renderWhoBanner() {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.user) return;
        var imp = (j.impersonation && j.impersonation.active) ? j.impersonation : null;
        var el = document.getElementById('cp-who-banner');
        // Plain trainer on their own account: no banner needed.
        if (!imp && !j.user.isOwner) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
        if (!el) {
          el = document.createElement('div');
          el.id = 'cp-who-banner';
          el.setAttribute('role', 'status');
          var root = document.getElementById('cp-root');
          if (root && root.parentNode) root.parentNode.insertBefore(el, root);
          else (document.body || document.documentElement).insertBefore(el, (document.body || document.documentElement).firstChild);
        }
        var who = '@' + esc(j.user.username || j.user.displayName || 'account');
        var base = 'position:sticky;top:0;z-index:50;padding:9px 16px;text-align:center;font:600 13px/1.45 "Space Grotesk",system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.18);';
        if (imp) {
          el.style.cssText = base + 'background:#8a5a00;color:#fff;';
          el.innerHTML = '⚠ Peered in — you are editing <b>' + who + '</b>’s content program. Everything you type saves to their account.';
        } else {
          el.style.cssText = base + 'background:#0f2435;color:#fff;';
          el.innerHTML = 'You are editing <b>your own</b> content program (' + who + '). You are <b>not</b> peered into a trainer.';
        }
      })
      .catch(function () {});
  }
  function loadFromProfile() {
    return fetch('/api/profile', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { var cp = j && j.profile && j.profile.profile && j.profile.profile.content_program_v2; return (cp && cp.answered) ? cp : null; })
      .catch(function () { return null; });
  }

  // ---------- derived variables ----------
  // v10 0.4 — ONE name resolution, at render time, never snapshotted:
  // trainer_profiles.full_name → display_name → username.
  function trainerName() {
    try {
      var u = window.__odeCurrentUser || (typeof readAuthUserHint === 'function' ? readAuthUserHint() : null);
      if (u) {
        var full = (u.trainer && (u.trainer.fullName || u.trainer.full_name)) || u.trainerFullName || '';
        return String(full || u.displayName || u.username || '').trim() || 'your coach';
      }
    } catch (e) {}
    return 'your coach';
  }
  function mistakesList() {
    var a = qa(); var arr = [a.mistake1, a.mistake2, a.mistake3];
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
    // The self branch takes the trainer's own words, which rarely end in
    // punctuation — without this it lands mid-air ("Now? down 30 lbs and I've
    // kept it off"). The client branch below has always terminated itself.
    if (a.has_proof === 'self') { var r = a.selfResult || 'I’m proof it works'; return 'Now? ' + r + (/[.!?]$/.test(r) ? '' : '.'); }
    return 'The result: ' + (a.proofResult || 'a result they were proud of') + '.';
  }

  function fill(str, mistakeForCycle) {
    // Guard: if a hook/template OBJECT ({pattern, voices}) reaches fill, resolve
    // it to a string instead of rendering "[object Object]".
    if (str && typeof str === 'object') { str = (str.voices && str.voices[voiceKey()]) || str.pattern || str.text || ''; }
    var a = qa(); var m = mistakesList();
    var map = {
      '{audience}': a.audience_short || a.audience || 'the people you train',
      '{audience_full}': a.audience || a.audience_short || 'the people you train',
      '{outcome}': a.outcome || 'reach their goal',
      '{core}': a.core || 'the fundamentals',
      '{support1}': a.support1 || '', '{support2}': a.support2 || '',
      '{contrarian}': a.contrarian || (a.core ? (a.core + ' matters more than anything else') : 'the basics beat the fancy stuff'),
      '{mistake1}': m[0] || 'the same old mistake', '{mistake2}': m[1] || m[0] || 'the same old mistake', '{mistake3}': m[2] || m[0] || 'the same old mistake',
      '{mistake}': mistakeForCycle || m[0] || 'the same old mistake',
      '{story}': a.turning_point || 'I found what actually works',
      '{story_line}': a.turning_point || a.why || 'I found what actually works',
      '{turning_point}': a.turning_point || 'I found what actually works',
      '{before}': a.before || 'stuck and frustrated', '{old_belief}': a.old_belief || 'I needed more willpower', '{why}': a.why || 'I don’t want anyone to waste the time I wasted',
      // both camelCase (questionnaire) and snake_case (library) proof slots
      '{proofName}': a.proofName || 'a client of mine', '{proof_name}': a.proofName || 'a client of mine',
      '{proofResult}': a.proofResult || 'a result they were proud of', '{proof_result}': a.proofResult || 'a result they were proud of',
      '{proof_belief}': a.proofBelief || 'they’d already tried everything',
      '{selfResult}': a.selfResult || 'I’m proof it works', '{own_result}': a.selfResult || 'I’m proof it works',
      '{proofLead}': proofLead(), '{proofResultLine}': proofResultLine(),
      '{p_they}': ({ he: 'he', she: 'she' })[a.proof_pronoun] || 'they',
      '{p_were}': (a.proof_pronoun === 'he' || a.proof_pronoun === 'she') ? 'was' : 'were',
      '{p_their}': ({ he: 'his', she: 'her' })[a.proof_pronoun] || 'their',
      '{p_them}': ({ he: 'him', she: 'her' })[a.proof_pronoun] || 'them',
      '{objection}': a.objection || 'they don’t think they have time', '{objection2}': a.objection2 || '', '{fear}': a.fear || 'that this is just who they are now',
      '{catchphrase}': a.catchphrase || '', '{name}': trainerName(), '{link}': autoLink()
    };
    return String(str || '').replace(/\{[a-zA-Z0-9_]+\}/g, function (mm) { return (mm in map) ? map[mm] : mm; });
  }
  function ctaText() {
    var c = LIB.cta || {}; var out = fill((c.voices && c.voices[voiceKey()]) || c.master || '');
    // §1/§5 — if a long audience/outcome splices the CTA into nonsense, use a
    // safe layout with each answer at the end of its own short line.
    if (!grammarGuard(out) || tooLongInline('audience') || tooLongInline('outcome')) {
      return fill('I’m {name}.\nI train {audience}.\nWhat you get: {outcome}.\nDrop your name at the link in my bio and I’ll build you a plan.');
    }
    return out;
  }
  // SINGLE source of truth for the trainer's public link — derived only from
  // the current session user, never a cached/seeded/stored slug (v8 0.1).
  function coachSlug() { try { var u = window.__odeCurrentUser || (typeof readAuthUserHint === 'function' ? readAuthUserHint() : null); return u && (u.username || u.id) ? String(u.username || u.id) : ''; } catch (e) {} return ''; }
  function autoLink() { var s = coachSlug(); return location.origin + '/coach' + (s ? '/' + s : ''); }

  // Voice: questionnaire values → library voice keys (beats stay constant).
  function voiceKey() { var v = qa().voice; if (v === 'blunt' || v === 'warm' || v === 'funny' || v === 'technical') return v; return ({ direct: 'blunt' })[v] || 'blunt'; }

  // §2 — classify an answer so the generator knows where it may appear.
  function wordCount(s) { s = String(s || '').trim(); return s ? s.split(/\s+/).length : 0; }
  function classifyAnswer(text) {
    var t = String(text || '').trim(); var w = wordCount(t);
    var comma = /,/.test(t); var conj = /\b(and|but|or|so|because|then|while|who|that)\b/i.test(t);
    var startsVerb = /^(get|build|lose|gain|stop|start|feel|look|train|eat|drop|add|fix|keep|make|finally)\b/i.test(t);
    var type = (w > 8 || comma) ? 'SENTENCE' : conj ? 'FRAGMENT' : startsVerb ? 'SHORT_VERB' : 'NOUN_PHRASE';
    return { type: type, words: w };
  }
  // Best-guess 3–4 word noun phrase from a long answer (prefill for audience_short).
  function shortGuess(text) {
    var t = String(text || '').trim(); if (!t) return '';
    t = t.split(',')[0].split(/s+(?:who|that|which)s+/i)[0];
    return t.split(/s+/).slice(0, 4).join(' ');
  }
  function answerType(id) { var m = qmeta()[id]; return m ? m.type : classifyAnswer(qa()[id]).type; }
  function tooLongInline(id) {
    if (id === 'audience' && String(qa().audience_short || '').trim()) id = 'audience_short';
    var t = answerType(id); return t === 'SENTENCE' || t === 'FRAGMENT';
  }

  // §5 — grammar guard. Returns false if a composed sentence is broken.
  function grammarGuard(sentence) {
    var s = ' ' + String(sentence || '').toLowerCase().replace(/[.,!?;:—-]/g, ' ').replace(/\s+/g, ' ') + ' ';
    if (/ (to they|to i|to you|ready to they|is are|are is|to to|the the|a a|an an|of of|for for|they they|them them|because (do|skip|chase|wait|train|eat|copy|program|start|compare|cut|go|quit|weigh|fear|starve|only|never)) /.test(s)) return false;
    // a verb immediately following "to" that's actually a pronoun+verb splice
    if (/ (ready|going|about|able) to (they|you|i|he|she|we) /.test(s)) return false;
    return true;
  }

  // §1 — hook composed safely. If the voiced pattern trips the guard, or it
  // splices a long/sentence answer mid-clause, fall back to a layout that puts
  // the answer at the END of a short sentence (reads fine at any length).
  // Profanity variants serve ONLY when the trainer said sometimes/freely, and
  // only on blunt/funny (v11 Part 1 rule 3).
  function profanityOk() { var p = String(qa().profanity || '').toLowerCase(); return p === 'some' || p === 'sometimes' || p === 'yes' || p === 'freely'; }
  function hookLine(idx, mistakeForCycle) {
    // Answers often start with "they …" while templates now supply the
    // subject ("because they {mistake}") — strip the doubled pronoun.
    if (mistakeForCycle) mistakeForCycle = String(mistakeForCycle).replace(/^(they|them)s+(alsos+)?/i, '');
    var hs = LIB.hooks || []; if (!hs.length) return '';
    var h = hs[idx % hs.length]; var vk = voiceKey();
    var pat = (h.voices && h.voices[vk]) || h.pattern;
    if (profanityOk() && (vk === 'blunt' || vk === 'funny')) {
      var pv = (LIB.hooks_profanity || {})[h.id];
      if (pv && pv[vk]) pat = pv[vk];
    }
    var usesMistakeMid = /\{mistake\}/.test(pat) && String(mistakeForCycle || '').trim() && wordCount(mistakeForCycle) > 8;
    var audienceMid = /\{audience\}[^.!?]*\{|\{audience\}\s+\w+\s+\w/.test(pat) && tooLongInline('audience');
    var out = fill(pat, mistakeForCycle);
    if (!grammarGuard(out) || usesMistakeMid || audienceMid) {
      // safe fallback: one variable, at the end of a short sentence — but
      // still VOICED (a voice-blind fallback made blunt/technical read
      // identical whenever long answers forced this path).
      if (String(mistakeForCycle || '').trim()) return fill(voicedFallbackLead() + ' ' + fillSafe(mistakeForCycle) + '.');
      return fill(voicedAudienceLead());
    }
    return out;
  }
  // Voiced frames for the safety layouts + shared-pool hook wrappers. The
  // variable still lands at the end (or inside quotes), so the grammar-guard
  // safety property is unchanged — only the frame words carry the voice.
  function voicedFallbackLead() {
    return ({
      blunt: 'Here’s what I keep seeing:',
      warm: 'Can I share the pattern I keep seeing?',
      funny: 'Same movie, every single week:',
      technical: 'The most common pattern in the people I coach:'
    })[voiceKey()] || 'Here’s what I keep seeing:';
  }
  function voicedAudienceLead() {
    return ({
      blunt: 'This one’s for {audience}.',
      warm: 'If you’re one of {audience}, this one is for you.',
      funny: 'Attention {audience}: this one’s yours.',
      technical: 'A note for {audience} — worth two minutes.'
    })[voiceKey()] || 'This one’s for {audience}.';
  }
  function voicedMythHook(topic) {
    var t = String(topic || '').trim();
    return ({
      blunt: 'Most people believe: “' + t + '” — here’s why that’s wrong.',
      warm: 'A lot of people believe “' + t + '” — let’s talk about why it keeps you stuck.',
      funny: '“' + t + '” — sure. And I’m the tooth fairy.',
      technical: 'Claim: “' + t + '”. The evidence points the other way.'
    })[voiceKey()] || ('Most people believe: “' + t + '” — here’s why that’s wrong.');
  }
  function voicedTopicHook(topic) {
    var t = String(topic || '').trim();
    return ({
      blunt: '“' + t + '”',
      warm: 'Let’s talk about “' + t + '”.',
      funny: '“' + t + '” … we need to talk.',
      technical: 'On “' + t + '”: what actually works.'
    })[voiceKey()] || ('“' + t + '”');
  }
  function fillSafe(v) { return String(v || '').replace(/\.$/, ''); }
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

    var PTV = LIB.post_type_voices || {}; var vkey = voiceKey();
    if (type === 'win') {
      if (qa().has_proof === 'self') { var nv = pt.no_client_variant || {}; base.title = nv.label || 'Your progress'; base.beats = (nv.beats || []).map(function (b) { return { t: b.t, job: fill(b.job) }; }); base.framing = nv.framing; base.hook = fill((PTV.win_self && PTV.win_self[vkey]) || 'What I used to believe that was wrong: {old_belief}.'); }
      else { base.hook = fill((PTV.win && PTV.win[vkey]) || 'When {proof_name} started, they were sure {proof_belief}.'); base.angle = { kind: 'proof', text: fill('{proof_name} — {proof_result}') }; }
      return base;
    }
    if (type === 'app') { base.hook = fill((PTV.app && PTV.app[vkey]) || pick(pt.hook_variants, idx)); return base; }
    if (type === 'reframe') {
      var rf = PTV.reframe || {};
      base.hook = rf.question ? (rf.question + (rf[vkey] ? '\n' + fill(rf[vkey]) : '')) : fill(pick(pt.variants, idx));
      return base;
    }

    // v11 2.1/2.6 — a chosen trainer hook (Hook Day) overrides; and once a
    // trainer has 3+ active hooks for this type, theirs cycle on normal days
    // too (their material first, ours filling gaps).
    var choice = (state.hookChoices || {})[ymd(d)];
    // shared-pool types: mistake / myth / objection
    var a = angleFor(type, idx);
    if (type === 'mistake') { var mt = mistakesList(); base.hook = hookLine(idx, mt.length ? mt[idx % mt.length] : (a && a.item.topic)); }
    else if (type === 'myth') { base.hook = a ? voicedMythHook(a.item.topic) : hookLine(idx); }
    else { base.hook = a ? voicedTopicHook(a.item.topic) : hookLine(idx); }
    if (a) { base.angle = { kind: a.needsTake ? 'prompt' : 'personal', topicKey: a.item.key, topic: a.item.topic, why: a.item.why, ref: a.item.ref, prompt: a.item.prompt, take: a.take }; base.needsTake = a.needsTake; }
    base.hookSource = 'house';
    if (choice && choice.text) { base.hook = choice.text; base.hookSource = 'trainer'; base.trainerHookId = choice.trainerHookId || null; }
    else {
      var mine = (state.trainerHooks || []).filter(function (h) { return h.status !== 'retired' && (!h.post_type || h.post_type === type); });
      if (mine.length >= 3 && (idx % 2 === 1)) { var th = mine[Math.floor(idx / 2) % mine.length]; base.hook = th.hook_text || th.text; base.hookSource = 'trainer'; base.trainerHookId = th.id || null; }
    }
    base.isHookDay = isHookDay(d, type);
    return base;
  }
  // Safe per-slot fallbacks — variables at the end of short lines (or none), so
  // a long/comma-heavy answer can never break a story.
  var STORY_SAFE = {
    1: function () { return 'Up. Moving. Before the day gets a vote.'; },
    2: function () { return fill('The thing I’m known for: {core}.'); },
    3: function () { return 'Watched a client hit a number today they didn’t think was possible. It usually is.'; },
    4: function () { return fill('Right now: doing the exact thing I tell my people to do.'); },
    5: function () { return 'Link’s in my bio. Drop your name and I’ll build you a plan.'; }
  };
  // v11 2.1 — Hook Day: once a week (default Wed) on the mistake post, 225+.
  function isHookDay(d, type) { return type === 'mistake' && d.getDay() === (state.hookDay != null ? state.hookDay : 3) && (state.levelIdx || 0) >= 1; }
  function validTrainerHook(text) {
    var t = String(text || '').trim();
    if (t.length < 8) return 'Give it a full line.';
    if (/^you\b|\byou('re|r)?\b/i.test(t.split(/\s+/).slice(0, 3).join(' '))) return 'Name a group, not "you" - "men over 35", not "you"';
    var aud = (qa().audience_short || qa().audience || '').toLowerCase();
    if (aud && t.toLowerCase().indexOf(aud.split(' ').slice(0, 2).join(' ')) === -1) return 'Say the group by name — that’s what makes strangers stop.';
    if (!grammarGuard(t)) return 'Read that out loud — something’s off. Try again.';
    return '';
  }
  function logPost(d, sc, posted, stats) {
    try {
      fetch('/api/content/posts', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        scheduledDate: ymd(d), postType: sc.type, hookText: sc.hook || '', hookSource: sc.hookSource || 'house',
        trainerHookId: sc.trainerHookId || null, status: posted ? 'posted' : 'scheduled',
        views: stats && stats.views, dms: stats && stats.dms, clicks: stats && stats.clicks,
        script: { beats: sc.beats || [], cta: sc.cta || '' }
      }) }).catch(function () {});
    } catch (e) {}
  }
  function storiesFor(d) {
    var idx = daysBetween(ymd(programStart()), ymd(d)); if (idx < 0) idx = 0;
    var slots = (LIB.stories_daily && LIB.stories_daily.slots) || [];
    var svk = voiceKey();
    return slots.map(function (s) {
      var poolArr = (s.examples_by_voice && s.examples_by_voice[svk]) || s.examples || [];
      var tpl = pick(poolArr, idx); var line = fill(tpl);
      var risky = (/\{audience\}/.test(tpl) && tooLongInline('audience')) || (/\{outcome\}/.test(tpl) && tooLongInline('outcome')) || (/\{core\}/.test(tpl) && tooLongInline('core'));
      if (!grammarGuard(line) || risky) line = (STORY_SAFE[s.n] ? STORY_SAFE[s.n]() : line);
      return { slot: s.type, line: line };
    });
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
  function labelForAngle(type) { return { mistake: 'The mistake', myth: 'The myth', objection: 'The objection', reframe: 'The question' }[type] || 'The angle'; }
  function thinkQuestions(brief, idx) { var arr = (brief && brief.think) || []; if (!arr.length) return []; var out = []; var n = Math.min(4, arr.length); for (var k = 0; k < n; k++) out.push(arr[(idx * 2 + k) % arr.length]); return out; }
  function briefText(s, brief, qs, hookText) {
    var o = [];
    o.push('TODAY: ' + (s.title || s.type).toUpperCase());
    if (brief && brief.job) o.push('Job: ' + brief.job);
    if (brief && brief.goal) o.push('If it works, they think: ' + brief.goal);
    o.push(''); o.push('YOUR MATERIAL');
    if (state.answered.audience) o.push('· Who: ' + state.answered.audience);
    if (s.angle && s.angle.topic) o.push('· ' + labelForAngle(s.type) + ': ' + (s.angle.take || s.angle.topic));
    if (state.answered.core) o.push('· Stand for: ' + state.answered.core);
    if (qs && qs.length) { o.push(''); o.push('THINK ABOUT'); qs.forEach(function (q) { o.push('- ' + q); }); }
    o.push(''); o.push('THE SHAPE'); (s.beats || []).forEach(function (b) { o.push(b.t + '  ' + b.job); });
    o.push(''); o.push('HOOK: ' + (hookText || s.hook || ''));
    o.push('CTA: ' + ctaText());
    return o.join('\n');
  }

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
  // ---- Flow A -> Flow B signup handoff ----
  var SIGNUP_PREFILL_KEY = 'ode_content_prefill_v1';
  function readSignupPrefill() {
    try { return JSON.parse(localStorage.getItem(SIGNUP_PREFILL_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearSignupPrefill() { try { localStorage.removeItem(SIGNUP_PREFILL_KEY); } catch (e) {} }
  // The "last step" framing screen shown once, straight out of Flow A signup.
  function renderSignupFraming(prefill) {
    root.className = 'cp-wrap'; root.innerHTML = '';
    root.appendChild(el('div', 'cp-ambient'));
    var wrap = el('div', 'cp-pathwrap');
    var eyebrow = el('span', 'cp-seclabel cp-kicker', 'Content Program'); staggerRise(eyebrow, 0); wrap.appendChild(eyebrow);
    var h = el('h1', 'cp-h1', 'Last step'); h.style.marginTop = '12px'; staggerRise(h, 1); wrap.appendChild(h);
    var sub = el('p', 'cp-sub', 'These questions build your website and your content plan. Answer rough and honest — we sharpen them together on your call.');
    staggerRise(sub, 2); wrap.appendChild(sub);
    var go = el('button', 'cp-btn cp-btn-primary', 'Start'); go.type = 'button'; go.style.marginTop = '16px'; staggerRise(go, 3);
    go.onclick = function () { state.draft = null; seedDetailedFromPrefill(); startQuestionnaire(); };
    wrap.appendChild(go);
    root.appendChild(wrap);
  }

  function isTrainerUser() {
    try {
      var u = window.__odeCurrentUser || (typeof readAuthUserHint === 'function' ? readAuthUserHint() : null);
      return !!(u && (u.isTrainer || (u.trainer && u.trainer.active)));
    } catch (e) {}
    return false;
  }
  // The owner is exempt from the trainer gate (interstitial + server-only boot):
  // they preview content on their own account and must never walk their own gate.
  function isOwnerUser() {
    try {
      var u = window.__odeCurrentUser || (typeof readAuthUserHint === 'function' ? readAuthUserHint() : null);
      return !!(u && u.isOwner);
    } catch (e) {}
    return false;
  }
  // Existing trainers have no local prefill blob (they predate the handoff), so
  // we pull their Flow A answers (brand_positioning -> outcome, specialties)
  // from the server once and use them as the seed source.
  var signupPrefillServer = null;
  function fetchServerPrefill() {
    try {
      fetch('/api/content/signup-prefill', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.ok && (j.outcome || (Array.isArray(j.specialties) && j.specialties.length))) signupPrefillServer = j; })
        .catch(function () {});
    } catch (e) {}
  }
  function renderTrainerLoading() {
    root.className = 'cp-wrap'; root.innerHTML = '';
    root.appendChild(el('div', 'cp-ambient'));
    var wrap = el('div', 'cp-pathwrap');
    wrap.appendChild(el('p', 'cp-sub', 'Loading your content program…'));
    root.appendChild(wrap);
  }
  // Applies the shared Flow A -> Flow B pre-fill onto the fresh detailed draft:
  // the local signup blob if present, else the server-fetched Flow A answers.
  // Used by both the signup framing and the upgrade interstitial.
  function seedDetailedFromPrefill() {
    beginDraft('detailed');
    var pf = readSignupPrefill() || signupPrefillServer;
    if (pf) {
      try {
        if (pf.outcome) state.draft.answers.outcome = String(pf.outcome);
        var specs = Array.isArray(pf.specialties) ? pf.specialties.filter(Boolean) : [];
        if (specs.length) {
          if (!state.draft.answers.core) state.draft.answers.core = String(specs[0]);
          if (!state.draft.answers.audience) state.draft.answers.audience = 'people who want ' + specs.slice(0, 2).join(' and ').toLowerCase();
        }
      } catch (e) {}
      clearSignupPrefill();
    }
  }
  // One-time upgrade interstitial for an EXISTING trainer whose content
  // questionnaire is missing/incomplete (setupDone=false). Hard gate: it stands
  // in front of the dashboard until they finish. Distinct from the signup
  // framing screen (new trainers, prefill blob present).
  function renderUpgradeInterstitial() {
    root.className = 'cp-wrap'; root.innerHTML = '';
    root.appendChild(el('div', 'cp-ambient'));
    var wrap = el('div', 'cp-pathwrap');
    var eyebrow = el('span', 'cp-seclabel cp-kicker', 'Content Program'); staggerRise(eyebrow, 0); wrap.appendChild(eyebrow);
    var h = el('h1', 'cp-h1', 'We’ve upgraded onboarding'); h.style.marginTop = '12px'; staggerRise(h, 1); wrap.appendChild(h);
    var sub = el('p', 'cp-sub', 'Your content questions are the foundation of your website and your posting plan — and yours need to be completed on the new system. Takes 20–30 min, answer rough and honest; we sharpen them together on your call. Your content plan unlocks the moment you finish.');
    staggerRise(sub, 2); wrap.appendChild(sub);
    var go = el('button', 'cp-btn cp-btn-primary', 'Finish my questions'); go.type = 'button'; go.style.marginTop = '16px'; staggerRise(go, 3);
    go.onclick = function () { state.draft = null; seedDetailedFromPrefill(); startQuestionnaire(); };
    wrap.appendChild(go);
    root.appendChild(wrap);
  }

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
      go.onclick = function () { state.draft = null; beginDraft(pth.id); startQuestionnaire(); };
      opt.appendChild(go); wrap.appendChild(opt);
    });
    var re = el('p', 'cp-reassure', 'You can switch later without losing anything.'); staggerRise(re, 5); wrap.appendChild(re);
    root.appendChild(wrap);
  }

  // ================= QUESTIONNAIRE (schema-driven) =================
  var flow = null; // { steps, i }
  function activeQuestions() {
    var pth = (state.draft && state.draft.path) || state.path;
    return CFG.questions.filter(function (q) { return pth === 'detailed' || q.path === 'quick'; });
  }
  function showIfOk(q) { if (q.showIfSentence) { if (answerType(q.showIfSentence) !== 'SENTENCE') return false; } if (!q.showIf) return true; return Object.keys(q.showIf).every(function (k) { return qa()[k] === q.showIf[k]; }); }
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
    // v10 0.2/0.3 — the questionnaire ALWAYS works on a draft. The live
    // program (state.answered) is never touched until finish commits.
    if (!state.draft) beginDraft(state.path);
    flow = { steps: buildSteps(), i: 0 };
    if (opts.upgrade) { // detailed upgrade: land on first unanswered
      while (flow.i < flow.steps.length) { var st = flow.steps[flow.i]; if (st.kind === 'q' && showIfOk(st.q) && (qa()[st.q.id] == null || qa()[st.q.id] === '')) break; flow.i++; }
    } else if (opts.resume && state.draft && typeof state.draft.i === 'number') {
      flow.i = Math.min(Math.max(0, state.draft.i), flow.steps.length - 1);
      while (flow.i > 0 && stepIsSkippable(flow.steps[flow.i])) flow.i--;
      pendingResume = flow.i > 0;
    }
    drawStep();
  }
  // In-app confirm (native confirm() froze the page for one auditor — 2.4).
  function confirmModal(msg, yesLabel, onYes) {
    var node = el('div');
    node.appendChild(el('h3', null, 'Hold on'));
    node.appendChild(el('p', 'cp-sub', esc(msg)));
    var yes = el('button', 'cp-btn cp-btn-primary', yesLabel || 'Yes'); yes.type = 'button'; yes.style.marginTop = '14px'; yes.onclick = function () { closeModal(); onYes(); };
    var no = el('button', 'cp-btn cp-btn-ghost', 'Cancel'); no.type = 'button'; no.style.marginTop = '8px'; no.onclick = closeModal;
    node.appendChild(yes); node.appendChild(no); openModal(node);
  }
  function discardDraft() { state.draft = null; state.redoing = false; persist(); renderDashboard(); }
  function resumeBannerNode() {
    var isRedo = !!state.setupDone;
    var bar = el('div'); bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0 2px;padding:8px 12px;border-radius:10px;background:var(--accent-soft);border:1px solid rgba(197,141,79,.3);font-size:.82rem;font-weight:700;color:var(--ink);flex-wrap:wrap;';
    bar.appendChild(el('span', null, isRedo ? 'You’ve got a redo in progress.' : 'Picked up where you left off.'));
    var actions = el('span'); actions.style.cssText = 'display:flex;gap:10px;';
    if (isRedo) {
      var cont = el('button', null, 'Continue'); cont.type = 'button'; cont.style.cssText = 'background:none;border:0;color:var(--accent);font-weight:800;cursor:pointer;font-size:.82rem;min-height:44px;'; cont.onclick = function () { bar.remove(); };
      var disc = el('button', null, 'Discard'); disc.type = 'button'; disc.style.cssText = 'background:none;border:0;color:var(--muted);font-weight:800;cursor:pointer;font-size:.82rem;min-height:44px;';
      disc.onclick = function () { confirmModal('Throw away this redo? Your finished program stays exactly as it was.', 'Discard the redo', discardDraft); };
      actions.appendChild(cont); actions.appendChild(disc);
    } else {
      var over = el('button', null, 'Start over'); over.type = 'button'; over.style.cssText = 'background:none;border:0;color:var(--accent);font-weight:800;cursor:pointer;font-size:.82rem;min-height:44px;';
      over.onclick = function () { confirmModal('Start the questionnaire over? Your answers so far will be cleared.', 'Start over', function () { state.draft = null; persist(); renderPathChooser(); }); };
      var x = el('button', null, '✕'); x.type = 'button'; x.style.cssText = 'background:none;border:0;color:var(--muted);cursor:pointer;font-size:.9rem;min-height:44px;'; x.onclick = function () { bar.remove(); };
      actions.appendChild(over); actions.appendChild(x);
    }
    bar.appendChild(actions);
    return bar;
  }
  function stepIsSkippable(st) { return st.kind === 'q' && !showIfOk(st.q); }
  function nextStep() { do { flow.i++; } while (flow.i < flow.steps.length && stepIsSkippable(flow.steps[flow.i])); if (flow.i >= flow.steps.length) return finishQuestionnaire(); drawStep(); }
  function prevStep() { do { flow.i--; } while (flow.i > 0 && stepIsSkippable(flow.steps[flow.i])); if (flow.i < 0) { flow.i = 0; return renderPathChooser(); } drawStep(); }
  function answerableProgress() { var qs = flow.steps.filter(function (s) { return s.kind === 'q' && showIfOk(s.q); }); var doneCount = 0; for (var j = 0; j <= flow.i && j < flow.steps.length; j++) { var s = flow.steps[j]; if (s.kind === 'q' && showIfOk(s.q)) doneCount++; } return { total: qs.length, done: Math.max(1, doneCount) }; }

  var screenCleanup = [];
  function runScreenCleanup() { screenCleanup.forEach(function (fn) { try { fn(); } catch (e) {} }); screenCleanup = []; }
  function drawStep() {
    runScreenCleanup(); // v12 — stale timers from the previous question can never write again
    if (state.draft) { state.draft.i = flow.i; } state.lastStepIndex = flow.i; persist();
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
    var hook = hookLine(0, m[0]);
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
      var wrap = el('div', 'cp-choices'); var chosen = qa()[q.id] || null; var btns = {};
      q.choices.forEach(function (c) { var b = el('button', 'cp-choice' + (chosen === c.v ? ' on' : '')); b.type = 'button'; b.textContent = c.label; b.onclick = function () { chosen = c.v; Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('on', k === c.v); }); errEl.textContent = ''; }; wrap.appendChild(b); btns[c.v] = b; });
      body.appendChild(wrap);
      getVal = function () { return chosen; };
    } else if (q.type === 'days') {
      var pickWrap = buildDaysPicker(); body.appendChild(pickWrap.node); getVal = pickWrap.get;
    } else {
      if (q.example) body.appendChild(el('p', 'cp-example', 'e.g. <b>' + esc(q.example) + '</b>'));
      // §3 — fill-in-the-blank framing: greyed prompt sentence above the input.
      var blankHalves = null;
      if (q.blank) { var idxBlank = q.blank.indexOf('___'); blankHalves = idxBlank === -1 ? [q.blank + ' ', ''] : [q.blank.slice(0, idxBlank), q.blank.slice(idxBlank + 3)]; body.appendChild(el('p', 'cp-blank', esc(blankHalves[0]) + '<span class="cp-blank-slot">' + '&nbsp;____&nbsp;' + '</span>' + esc(blankHalves[1]))); }
      var inWrap = el('div', 'cp-qinput');
      var input = q.type === 'textarea' ? el('textarea', 'cp-textarea') : el('input', 'cp-input');
      input.value = qa()[q.id] || (q.prefillFrom ? shortGuess(qa()[q.prefillFrom]) : '');
      if (q.blank && !input.value) input.placeholder = (blankHalves[0] || '').trim() + ' …';
      // 1.4 — write-friendly inputs
      input.spellcheck = true; input.setAttribute('autocorrect', 'on'); input.setAttribute('autocapitalize', 'sentences'); input.setAttribute('autocomplete', 'off');
      if (q.type !== 'textarea') { input.type = 'text'; input.inputMode = q.inputmode || 'text'; input.setAttribute('enterkeyhint', 'next'); input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next.click(); } }); }
      else { input.setAttribute('enterkeyhint', 'done'); }
      input.setAttribute('aria-label', q.label);
      input.addEventListener('focus', function () { setTimeout(function () { try { input.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); } catch (e) {} }, 150); });
      if (q.type === 'textarea') { var grow = function () { input.style.height = 'auto'; input.style.height = Math.min(260, input.scrollHeight) + 'px'; }; input.addEventListener('input', grow); setTimeout(grow, 0); }
      inWrap.appendChild(input); body.appendChild(inWrap);
      // v12 1 — the invariant: what the field displays IS what the draft holds.
      // Re-assert after paint so no browser restore/race can desync them.
      var expected = input.value;
      requestAnimationFrame(function () { if (input.isConnected && input.value !== expected && !input.matches(':focus')) input.value = expected; });
      // §3 — live preview of the completed sentence + soft 8-word counter.
      var preview = null, counter = null;
      if (q.blank) {
        preview = el('p', 'cp-preview'); body.appendChild(preview);
        counter = el('p', 'cp-hooknote'); body.appendChild(counter);
      }
      function syncBlank() {
        if (!q.blank) return; var v = input.value.trim();
        preview.textContent = v ? (blankHalves[0] + v + (blankHalves[1] || '') + (/[.!?]$/.test(v) ? '' : '.')).replace(/\s+/g, ' ').trim() : '';
        var w = wordCount(v); var cap = q.softCap || 8;
        counter.textContent = v ? (w + ' word' + (w === 1 ? '' : 's') + (w > cap ? ' · shorter is better here — you can add detail in the next question' : '')) : '';
        counter.style.color = w > cap ? 'var(--accent)' : 'var(--muted)';
      }
      var typeTimer = 0;
      screenCleanup.push(function () { clearTimeout(typeTimer); });
      input.addEventListener('input', function () {
        expected = input.value; errEl.textContent = ''; syncBlank();
        // v10 2.6 — the answer being typed survives a reload: debounce it into
        // the draft (validation still runs on Next before it counts).
        clearTimeout(typeTimer); typeTimer = setTimeout(function () { qa()[q.id] = input.value; persist(); }, 600);
      });
      setTimeout(syncBlank, 0);
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
      if (q.validate === 'audience') {
        if (String(val).trim().length < 4) { errEl.textContent = 'Give me a bit more — who are they?'; return; }
        if (isSingularOrVague(val)) { errEl.textContent = 'Name a group, not “you” — try “men over 35” or “people who’ve tried every diet.”'; return; }
      }
      qa()[q.id] = val;
      if (typeof val === 'string') { qmeta()[q.id] = classifyAnswer(val); }
      persist(); nextStep();
    };
    sticky.appendChild(next); screen.appendChild(sticky);
    root.appendChild(screen);
  }

  // 1.6 — no volume selector. Just: which days can you post? (multi-select).
  function buildDaysPicker() {
    var srcDays = qa().days;
    var picked = (srcDays && srcDays.days && srcDays.days.slice()) || [1, 3, 5];
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
    if (needs.some(function (k) { return !qa()[k]; })) return null;
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
    // COMMIT: the draft becomes the live program only here (v10 0.2/0.3).
    if (state.draft) {
      state.answered = state.draft.answers || {};
      state.answered_meta = state.draft.meta || {};
      state.path = state.draft.path || state.path || 'quick';
      state.draft = null;
    }
    delete state.answered.name; delete state.answered.link; // both are resolved at render, never stored
    state.redoing = false; delete state.redoBackup;
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
  // v10 1.4 — pins use the beats-based library data (LIB.pins / post_types),
  // same thinking-brief treatment as the daily card. Only the hook is a
  // written line, and it goes through the grammar guard.
  function pinBriefFor(pi) {
    var P = LIB.pins || {}; var PT = LIB.post_types || {};
    function beats(arr) { return (arr || []).map(function (b) { return { t: b.t, job: fill(b.job) }; }); }
    function safeHook(h, fallback) { return grammarGuard(h) ? h : fallback; }
    if (pi === 0) {
      var p1 = P.pin1 || {};
      return { label: p1.label || 'Who I am', len: p1.length || '60–75 sec', beats: beats(p1.beats),
        hook: safeHook(fill('I’m {name}. This page is for {audience}.'), fill('I’m {name}.')) };
    }
    if (pi === 1) {
      var mt = PT.myth || {};
      return { label: (P.pin2 || {}).label || 'What I believe', len: (P.pin2 || {}).length || '45–60 sec', beats: beats(mt.beats),
        hook: safeHook(fill('Here’s something most trainers won’t say: {contrarian}.'), fill('Here’s what I actually believe about {core}.')),
        note: (P.pin2 || {}).note || '' };
    }
    var w = PT.win || {}; var self = qa().has_proof === 'self';
    return { label: (P.pin3 || {}).label || 'Proof', len: (P.pin3 || {}).length || '45–60 sec',
      beats: beats(self ? (w.no_client_variant || {}).beats : w.beats),
      hook: self ? safeHook(fill('What I used to believe that was wrong: {old_belief}.'), 'I’ve been where you are.')
                 : safeHook(fill('When {proof_name} started, they were sure {proof_belief}.'), fill('Let me tell you about {proof_name}.')) };
  }
  function pinPlanText(pi) {
    var pb = pinBriefFor(pi); var o = [];
    o.push('PIN ' + (pi + 1) + ' — ' + pb.label + ' (' + pb.len + ')');
    o.push('HOOK: ' + pb.hook); o.push('');
    pb.beats.forEach(function (b) { o.push(b.t + '  ' + b.job); });
    o.push(''); o.push('CTA: ' + ctaText());
    return o.join('\n');
  }

  // ---------- Day Zero task 4: the VSL (the video on their coach page) ----------
  // Unlike the pins — whose config entries are dead data, the visible content
  // coming from LIB via pinBriefFor — this card is rendered DIRECTLY from
  // CFG.dayZero.vsl. That object is the single source of truth. There is no
  // LIB.pins.vsl and there must not be one, or it splits in two again.
  function vslData() { var v = (CFG.dayZero || {}).vsl; return (v && typeof v === 'object' && v.script) ? v : null; }
  // {?id} is a SOFT slot: the trainer's own answer if they gave one, a blank if
  // they didn't. Unlike {id} it never substitutes a stand-in sentence — these
  // are lines a trainer says about himself, and a plausible invention read off
  // the autocue is worse than a gap he fills in his own words.
  function softSlots(s) {
    return String(s == null ? '' : s).replace(/\{\?([a-zA-Z0-9_]+)\}/g, function (_m, id) {
      var val = String(qa()[id] == null ? '' : qa()[id]).trim(); return val || '___';
    });
  }
  // Soft slots, then fill(), then turn any slot we DON'T know about into a
  // blank. fill() passes unknown slots through verbatim, and a trainer reads
  // this out loud on camera — "___" is something they can say around,
  // "{offer}" isn't.
  function fillStrict(s) { return String(fill(softSlots(s)) || '').replace(/\{[a-zA-Z0-9_]+\}/g, '___'); }
  function vslHook() {
    var v = vslData(); if (!v) return '';
    var h = fillStrict(v.hook || ''); return grammarGuard(h) ? h : fillStrict(v.hookAlt || v.hook || '');
  }
  // Exactly 8 blocks, index-aligned 1:1 with vsl.beats. Block 5 forks on the
  // same has_proof branch pin3 makes — on the self path {proofLead} degrades to
  // a bare line and "That belief" would refer to nothing.
  function vslBlocks() {
    var v = vslData(); if (!v) return [];
    var blocks = String(v.script || '').split('\n\n');
    if (qa().has_proof === 'self' && v.scriptSelf && blocks.length >= 5) blocks[4] = v.scriptSelf;
    return blocks;
  }
  // A question about a client is hidden from a trainer whose proof is himself,
  // and vice versa — same fork, one list.
  function vslAsks() {
    var v = vslData(); if (!v) return [];
    return (v.ask || []).filter(function (a) { return !a.only || qa().has_proof === a.only; });
  }
  // Beats paired with their script block, already dropped where the beat
  // declares `needs` and that answer was never given. A quick-path trainer has
  // no `contrarian`, and beat 4's setup ("most trainers won't say this out
  // loud") followed by the {contrarian} fallback makes him read the blandest
  // line in fitness as though it were his edge. No beat beats a false beat.
  // `n` stays the ORIGINAL 1-based beat number so mvpBeats keeps working.
  function vslRows() {
    var v = vslData(); if (!v) return [];
    var blocks = vslBlocks(); var a = qa();
    return (v.beats || []).map(function (bt, i) { return { n: i + 1, bt: bt, block: blocks[i] || '' }; })
      .filter(function (r) { return !r.bt.needs || String(a[r.bt.needs] == null ? '' : a[r.bt.needs]).trim(); });
  }
  function beatLabel(bt) { return String(bt.label || bt.t || ''); }
  // mvpOnly mirrors what the card is SHOWING. The copied text is what goes to
  // the phone and gets filmed from — if it disagrees with the screen, the
  // personalisation is undone at the one moment it mattered.
  function vslPlanText(mvpOnly) {
    var v = vslData(); if (!v) return '';
    var mvp = v.mvpBeats || []; var blanks = []; var o = [];
    o.push('YOUR PAGE VIDEO — ' + (v.title || '') + ' (' + (v.len || '') + ')');
    o.push('Phone sideways, camera set to 720p. Aim for ' + (v.target || 'about 90 seconds') + '. Floor is ' + (v.floor || '90 sec') + '.');
    o.push('HOOK: ' + vslHook()); o.push('');
    vslRows().forEach(function (r) {
      if (mvpOnly && mvp.indexOf(r.n) === -1) return;
      o.push(r.n + '. ' + beatLabel(r.bt) + ' — ' + fillStrict(r.bt.job));
      var blk = fillStrict(r.block);
      if (blk) { o.push(blk); blk.split('\n').forEach(function (ln) { if (ln.indexOf('___') !== -1) blanks.push(ln.trim()); }); }
      o.push('');
    });
    if (blanks.length) { o.push('THE BLANKS ARE YOURS — fill these in your own words:'); blanks.forEach(function (ln) { o.push('- ' + ln); }); o.push(''); }
    o.push(mvpOnly ? 'This is the five-beat version — about 90 seconds, and it does the whole job.' : (v.mvpNote || ''));
    o.push('');
    if (v.done) o.push('DONE = ' + v.done);
    return o.join('\n');
  }
  function vslAskText() {
    var v = vslData(); if (!v) return '';
    var o = ['BEFORE YOU FILM — say these out loud'];
    if (v.askIntro) { o.push(''); o.push(v.askIntro); }
    o.push('');
    vslAsks().forEach(function (a, i) {
      o.push((i + 1) + '. ' + fillStrict(a.q) + (a.optional ? '  (optional)' : ''));
      var prev = a.from ? String(qa()[a.from] || '').trim() : '';
      if (prev) o.push('   You already said: ' + prev);
    });
    return o.join('\n');
  }
  // The lesson. Not fine print — a trainer who doesn't understand why this
  // video is different from a reel films a reel, and the page stays dead.
  // Copy lives in the config (vsl.lesson.body); this is only the floor if the
  // config half hasn't loaded a lesson yet.
  var VSL_LESSON = [
    'A reel gets someone to stop. This gets them to book. Different jobs — you can’t do the second one with the first.',
    'Every link you just set up sends people to one page. The first thing on that page should be you, talking to them, for about two minutes. That’s the VSL — the conversation you’d have with someone who walked up to you on the gym floor and asked what you actually do.',
    'A reel has about three seconds to win a stranger who’s scrolling. Someone on your page has already stopped and already clicked — without this video they read a headline, don’t find you anywhere on the page, and leave. That’s every reel you filmed this week, wasted at the last step.'
  ];
  // The trainer's own answer, in the words the questionnaire showed them —
  // read off CFG.questions so a re-labelled choice never drifts from this card.
  function answerLabel(qid) {
    var val = String(qa()[qid] == null ? '' : qa()[qid]);
    var q = (CFG.questions || []).filter(function (x) { return x.id === qid; })[0];
    if (!q || !q.choices) return val;
    var c = q.choices.filter(function (x) { return String(x.v) === val; })[0];
    return c ? c.label : val;
  }
  function renderVslCard(host, onChange) {
    var v = vslData();
    var boxes = [];
    function paint() {
      var on = !!state.dzTasks.vsl;
      boxes.forEach(function (c) { c.textContent = on ? '✓' : ''; c.style.cssText = 'width:26px;height:26px;' + (on ? 'background:#16a34a;border-color:#16a34a;color:#fff;' : ''); });
    }
    // v12 6 — updates in place, never re-renders on tap, so one tap can never
    // eat another. Both checkboxes drive the one key: state.dzTasks.vsl.
    function toggle(e) { if (e) e.stopPropagation(); state.dzTasks.vsl = !state.dzTasks.vsl; persist(); paint(); if (onChange) onChange(); }
    function mkCheck() {
      var c = el('button', 'cp-dz-check', state.dzTasks.vsl ? '✓' : ''); c.type = 'button';
      c.style.cssText = 'width:26px;height:26px;' + (state.dzTasks.vsl ? 'background:#16a34a;border-color:#16a34a;color:#fff;' : '');
      c.onclick = toggle; boxes.push(c); return c;
    }
    function blankify(txt) { return esc(fillStrict(txt)).replace(/_{3,}/g, '<span class="cp-blank-slot">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>'); }

    var box = el('div', 'cp-dz-pin');
    var head = el('div'); head.style.cssText = 'display:flex;align-items:center;gap:8px;';
    head.appendChild(mkCheck());
    head.appendChild(el('h4', null, 'Your page video — ' + esc((v && v.title) || 'The video on your page') + (v && v.len ? ' <span style="color:var(--muted);font-weight:600;font-size:.8rem;">(' + esc(v.len) + ')</span>' : '')));
    box.appendChild(head);
    if (!v) {
      // The script lives in the config. If it hasn't loaded, say so — never
      // show an empty card the trainer can tick their way past.
      box.appendChild(el('p', 'cp-hooknote', 'Your script didn’t load. Reload the page — if it’s still blank, tell us before you film.'));
      host.appendChild(box); return;
    }

    // The permission, up top and in plain sight. A trainer who thinks this has
    // to be perfect films nothing, and a trainer who films nothing earns nothing.
    var perm = el('div', 'cp-prompt');
    perm.innerHTML = '<b>Rough is fine. Done beats good.</b> Ninety seconds, one take, notes just off camera, said your own way. A page with a rough video of you on it beats a page with a perfect video you never filmed — and it beats a page with no video by a mile.';
    box.appendChild(perm);

    // The lesson: why this isn't a reel.
    var lessonBody = (v.lesson && v.lesson.body && v.lesson.body.length) ? v.lesson.body : VSL_LESSON;
    var lessonTitle = (v.lesson && v.lesson.title && v.lesson.title !== v.title) ? v.lesson.title : 'Why this one is different';
    var lesson = el('div', 'cp-lesson'); lesson.style.marginTop = '10px';
    var lh = el('div', 'cp-label', esc(lessonTitle)); lh.style.color = 'var(--accent)'; lesson.appendChild(lh);
    lessonBody.forEach(function (p, i) { var n = el('p', null, esc(p)); n.style.cssText = 'margin:' + (i ? '8px' : '6px') + ' 0 0;font-size:.9rem;line-height:1.5;'; lesson.appendChild(n); });
    box.appendChild(lesson);

    // Where it goes. This is the route that exists AND is safe: the Custom
    // canvas is the default tab, its Add video is the same upload the template
    // panel uses, and Done saves and publishes in one step.
    var where = el('div'); where.style.marginTop = '10px';
    var lnk = el('a', 'cp-btn cp-btn-ghost sm', 'Open my page → Edit');
    lnk.href = fill('{link}'); lnk.target = '_blank'; lnk.rel = 'noopener';
    lnk.style.cssText = 'display:inline-flex;text-decoration:none;';
    lnk.onclick = function (e) { e.stopPropagation(); };
    where.appendChild(lnk);
    if (v.where) where.appendChild(el('p', 'cp-hooknote', esc(v.where)));
    // The two ways this ends with nothing — or worse, with a wiped page.
    // Deliberately not another italic note: a trainer who skims past these
    // ticks the box and walks away, and the Template tab is genuinely
    // destructive (it rebuilds the whole site from blank fields).
    var warn = el('div'); warn.style.cssText = 'margin-top:8px;padding:8px 0 8px 11px;border-left:3px solid #f5b942;font-size:.82rem;line-height:1.5;';
    warn.innerHTML = '<b>Stay on the Custom tab.</b> Don’t go through Template to do this — Template rebuilds your whole page from blank boxes and wipes what’s already there. Add video, then Done.<br><b>Then check it.</b> Open your own link on your phone and watch it play. If it never appears, it didn’t upload.';
    where.appendChild(warn);
    box.appendChild(where);

    // Different rules from the feed videos — read BEFORE filming.
    if (v.note) box.appendChild(el('p', 'cp-hooknote', esc(v.note)));

    var hk = el('div'); hk.style.cssText = 'margin-top:10px;font-weight:700;font-size:.98rem;line-height:1.35;';
    hk.textContent = 'Hook: ' + vslHook(); box.appendChild(hk);

    // The five-beat version is the DEFAULT for everyone, not a fallback for the
    // nervous. It's ~90 seconds, it does the whole job, and — unlike the full
    // eight — it fits inside the page's 80MB upload limit at 720p. The other
    // three beats are hidden until asked for, so the card a trainer reads
    // before filming is short enough to read before filming.
    var rows = []; var mvpOn = true;
    var mvpWrap = el('div'); mvpWrap.style.cssText = 'margin-top:10px;';
    if (v.mvpNote) mvpWrap.appendChild(el('p', 'cp-note', esc(v.mvpNote)));
    var mvpBtn = el('button', 'cp-btn cp-btn-ghost sm', ''); mvpBtn.type = 'button'; mvpBtn.style.marginTop = '8px';
    mvpWrap.appendChild(mvpBtn);
    // The full eight-beat version runs about two and a half minutes, which is
    // over the page's 80MB upload limit even at 720p. Say so before they film
    // it, not after — being told your video is wrong once it already exists is
    // the surest way to end the session with nothing on the page.
    var mvpWarn = el('p', 'cp-hooknote', 'Heads up: the full version runs about two and a half minutes, which is over the 80MB your page accepts. Film the 90-second version if you want it to upload first time.');
    mvpWarn.style.display = 'none'; mvpWrap.appendChild(mvpWarn);
    box.appendChild(mvpWrap);
    function paintMvp() {
      var keep = v.mvpBeats || [];
      rows.forEach(function (r) { var on = !mvpOn || keep.indexOf(r.n) !== -1; r.node.style.display = on ? '' : 'none'; });
      mvpBtn.textContent = mvpOn ? 'Show the full version (that’s version two)' : 'Back to the 90-second version';
      mvpWarn.style.display = mvpOn ? 'none' : '';
    }
    mvpBtn.onclick = function (e) { e.stopPropagation(); mvpOn = !mvpOn; paintMvp(); };

    vslRows().forEach(function (r) {
      var row = el('div'); row.style.cssText = 'padding:8px 0;border-top:1px solid var(--line);';
      var top = el('div'); top.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:10px;font-size:.88rem;';
      // A short label, not a stopwatch. Timecodes on a first take manufacture
      // retakes: you say the scripted words, glance down, and conclude you got
      // your own opening line wrong.
      var t = el('span'); t.style.cssText = 'font-weight:800;color:var(--accent);white-space:nowrap;'; t.textContent = r.n + ' · ' + beatLabel(r.bt);
      top.appendChild(t); top.appendChild(el('span', null, esc(fillStrict(r.bt.job))));
      row.appendChild(top);
      if (r.block) {
        var blk = el('p'); blk.style.cssText = 'margin:6px 0 0;white-space:pre-line;font-size:.94rem;line-height:1.55;color:var(--ink);font-weight:500;';
        blk.innerHTML = blankify(r.block); row.appendChild(blk);
      }
      rows.push({ n: r.n, node: row }); box.appendChild(row);
    });
    var blankHint = el('p', 'cp-hooknote', 'The underlined gaps are yours — that’s where your own words go. Everything else we pulled from your answers.');
    box.appendChild(blankHint);
    paintMvp();

    var copyRow = el('div', 'cp-copyrow');
    var c1 = el('button', 'cp-btn cp-btn-ghost sm', 'Copy my script'); c1.type = 'button';
    // Copies the version currently on screen — see vslPlanText.
    c1.onclick = function (e) { e.stopPropagation(); copyText(vslPlanText(mvpOn), 'Script copied'); };
    var c2 = el('button', 'cp-btn cp-btn-ghost sm', 'Copy the questions'); c2.type = 'button';
    c2.onclick = function (e) { e.stopPropagation(); copyText(vslAskText(), 'Questions copied'); };
    copyRow.appendChild(c1); copyRow.appendChild(c2); box.appendChild(copyRow);

    // The self-interview. Anything onboarding already answered is shown back to
    // them as a 5-second check, not asked twice.
    var qWrap = el('div'); qWrap.style.marginTop = '14px';
    qWrap.appendChild(el('div', 'cp-label', 'Questions to ask yourself'));
    if (v.askIntro) qWrap.appendChild(el('p', 'cp-hooknote', esc(v.askIntro)));
    var ol = el('ol'); ol.style.cssText = 'margin:10px 0 0;padding-left:20px;display:grid;gap:10px;';
    vslAsks().forEach(function (a) {
      var prev = a.from ? String(qa()[a.from] || '').trim() : '';
      var li = el('li'); li.style.cssText = 'font-size:.9rem;line-height:1.45;' + (prev ? 'color:var(--muted);' : 'font-weight:600;');
      var q = el('span'); q.textContent = fillStrict(a.q); li.appendChild(q);
      if (a.optional) { var tag = el('span', null, 'optional'); tag.style.cssText = 'margin-left:6px;font-size:.62rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:2px 7px;'; li.appendChild(tag); }
      if (prev) {
        var pa = el('div'); pa.style.cssText = 'margin-top:5px;padding:7px 10px;border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 10px 10px 0;';
        var pl = el('div', 'cp-label', 'You already said'); pl.style.color = 'var(--accent)'; pa.appendChild(pl);
        var pv = el('div'); pv.style.cssText = 'margin-top:2px;color:var(--ink);font-weight:600;line-height:1.4;'; pv.textContent = prev; pa.appendChild(pv);
        li.appendChild(pa);
      }
      ol.appendChild(li);
    });
    qWrap.appendChild(ol); box.appendChild(qWrap);

    // Progress over perfection, spelled out: what you may get wrong, what you
    // may drop entirely, and the five things that carry the whole video.
    var pw = el('div'); pw.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid var(--line);';
    var ph = el('h4', null, esc(v.progressTitle || 'Progress, not perfect. Here’s exactly what that buys you.')); ph.style.cssText = 'margin:0;font-size:1rem;';
    pw.appendChild(ph);
    // The three lists live behind a tap. They're reassurance, not instruction —
    // and length is itself a perfection signal. A card that reads as a big
    // serious thing is a card you don't film today.
    var listWrap = el('div'); listWrap.style.display = 'none';
    var listBtn = el('button', 'cp-btn cp-btn-ghost sm', 'What you’re allowed to get wrong'); listBtn.type = 'button'; listBtn.style.marginTop = '10px';
    listBtn.onclick = function (e) {
      e.stopPropagation(); var open = listWrap.style.display !== 'none';
      listWrap.style.display = open ? 'none' : ''; listBtn.textContent = open ? 'What you’re allowed to get wrong' : 'Hide that';
    };
    pw.appendChild(listBtn); pw.appendChild(listWrap);
    function permList(label, items, colour, ordered) {
      if (!items || !items.length) return;
      var lb = el('div', 'cp-label', esc(label)); lb.style.cssText = 'margin-top:12px;color:' + colour + ';line-height:1.35;'; listWrap.appendChild(lb);
      var list = el(ordered ? 'ol' : 'ul'); list.style.cssText = 'margin:6px 0 0;padding-left:20px;display:grid;gap:5px;font-size:.88rem;line-height:1.45;';
      items.forEach(function (it) { var li = el('li'); li.textContent = fillStrict(it); list.appendChild(li); });
      listWrap.appendChild(list);
    }
    permList(v.allowedTitle || 'You can get this wrong', v.allowed, '#4ade80');
    permList(v.skipTitle || 'You can skip', v.skip, 'var(--muted)');
    permList(v.neverTitle || 'Don’t skip these', v.never, '#f87171', true);
    var fit = v.fit || {};
    var tips = [];
    if (fit.camera && fit.camera[qa().camera]) tips.push({ a: answerLabel('camera'), t: fit.camera[qa().camera] });
    if (fit.time && fit.time[String(qa().time)]) tips.push({ a: answerLabel('time'), t: fit.time[String(qa().time)] });
    if (tips.length) {
      var tl = el('div', 'cp-label', esc(v.fitIntro || 'Built to fit how you answered')); tl.style.marginTop = '12px'; pw.appendChild(tl);
      tips.forEach(function (o) {
        var n = el('p'); n.style.cssText = 'margin:6px 0 0;font-size:.88rem;line-height:1.45;';
        if (o.a) { var b2 = el('b'); b2.style.color = 'var(--accent)'; b2.textContent = o.a + ' — '; n.appendChild(b2); }
        var s2 = el('span'); s2.textContent = o.t; n.appendChild(s2); pw.appendChild(n);
      });
    }
    if (v.bar) { var barP = el('p', null, esc(v.bar)); barP.style.cssText = 'margin:12px 0 0;font-size:.88rem;line-height:1.45;color:var(--muted);'; pw.appendChild(barP); }
    box.appendChild(pw);

    // The definition of done is the last thing read before the tick.
    if (v.done) {
      var dn = el('div'); dn.style.cssText = 'margin:14px 0 0;padding:10px 12px;border-radius:10px;background:var(--accent-soft);border:1px solid rgba(197,141,79,.28);';
      var dl = el('div', 'cp-label', esc(v.doneTitle || 'What “done” means')); dl.style.color = 'var(--accent)'; dn.appendChild(dl);
      var dv = el('p'); dv.style.cssText = 'margin:4px 0 0;font-weight:700;font-size:.94rem;line-height:1.45;'; dv.textContent = fillStrict(v.done); dn.appendChild(dv);
      if (v.doneNote) { var dnn = el('p'); dnn.style.cssText = 'margin:4px 0 0;font-size:.86rem;line-height:1.45;color:var(--muted);font-weight:500;'; dnn.textContent = v.doneNote; dn.appendChild(dnn); }
      box.appendChild(dn);
    }
    var doneRow = el('div'); doneRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line);cursor:pointer;';
    doneRow.appendChild(mkCheck());
    doneRow.appendChild(el('div', 'cp-dz-title', 'It’s published, and it plays when I open my own link'));
    doneRow.onclick = toggle;
    box.appendChild(doneRow);
    host.appendChild(box);
  }

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

      if (task.bioLine) { var bio = fill('I help {audience} {outcome}'); if (!grammarGuard(bio) || tooLongInline('outcome')) bio = fill('I train {audience}.') + ' ' + fill('What you get: {outcome}.'); var bl = el('div', 'cp-dz-pin'); bl.appendChild(el('div', 'cp-label', 'Your bio line')); bl.appendChild(el('p', 'cp-cta-text', esc(bio))); var cpy = el('button', 'cp-btn cp-btn-ghost sm', 'Copy bio'); cpy.type = 'button'; cpy.style.marginTop = '8px'; cpy.onclick = function (e) { e.stopPropagation(); copyText(bio, 'Bio copied'); }; bl.appendChild(cpy); b.appendChild(bl); }

      if (task.pins) {
        dz.pins.forEach(function (pin, pi) {
          var pinBox = el('div', 'cp-dz-pin');
          var ph = el('div'); ph.style.cssText = 'display:flex;align-items:center;gap:8px;';
          var pinKey = 'pin' + (pi + 1);
          var pchk = el('button', 'cp-dz-check', state.dzTasks[pinKey] ? '✓' : ''); pchk.style.cssText = 'width:26px;height:26px;' + (state.dzTasks[pinKey] ? 'background:#16a34a;border-color:#16a34a;color:#fff;' : '');
          // v12 6 — each checkbox binds to its OWN key and updates in place;
          // no full re-render between taps, so one tap can never eat another.
          pchk.type = 'button'; pchk.onclick = function (e) { e.stopPropagation(); state.dzTasks[pinKey] = !state.dzTasks[pinKey]; persist(); pchk.textContent = state.dzTasks[pinKey] ? '✓' : ''; pchk.style.cssText = 'width:26px;height:26px;' + (state.dzTasks[pinKey] ? 'background:#16a34a;border-color:#16a34a;color:#fff;' : ''); syncDzGate(); };
          ph.appendChild(pchk);
          ph.appendChild(el('h4', null, 'Pin ' + (pi + 1) + ' — ' + esc(pin.title) + ' <span style="color:var(--muted);font-weight:600;font-size:.8rem;">(' + pin.len + ')</span>'));
          pinBox.appendChild(ph);
          var pb = pinBriefFor(pi);
          if (pb.note) pinBox.appendChild(el('p', 'cp-hooknote', esc(pb.note)));
          var hk = el('div'); hk.style.cssText = 'margin-top:8px;font-weight:700;font-size:.98rem;line-height:1.35;'; hk.textContent = 'Hook: ' + pb.hook; pinBox.appendChild(hk);
          pb.beats.forEach(function (bt) { var row = el('div'); row.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:10px;padding:7px 0;border-top:1px solid var(--line);font-size:.88rem;'; var t = el('span'); t.style.cssText = 'font-weight:800;color:var(--accent);white-space:nowrap;'; t.textContent = bt.t; row.appendChild(t); row.appendChild(el('span', null, esc(bt.job))); pinBox.appendChild(row); });
          var cpy = el('button', 'cp-btn cp-btn-ghost sm', 'Copy filming plan'); cpy.type = 'button'; cpy.style.marginTop = '8px'; cpy.onclick = function (e) { e.stopPropagation(); copyText(pinPlanText(pi), 'Plan copied'); }; pinBox.appendChild(cpy);
          b.appendChild(pinBox);
        });
        var allRow = el('div', 'cp-dz-head'); allRow.style.paddingTop = '6px';
        var allChk = el('div', 'cp-dz-check', state.dzTasks.pinsAll ? '✓' : ''); if (state.dzTasks.pinsAll) allChk.style.cssText = 'background:#16a34a;border-color:#16a34a;color:#fff;';
        allRow.appendChild(allChk); allRow.appendChild(el('div', 'cp-dz-title', 'All three pinned to the top of my profile'));
        allRow.onclick = function () { state.dzTasks.pinsAll = !state.dzTasks.pinsAll; persist(); allChk.textContent = state.dzTasks.pinsAll ? '✓' : ''; allChk.style.cssText = state.dzTasks.pinsAll ? 'background:#16a34a;border-color:#16a34a;color:#fff;' : ''; syncDzGate(); };
        b.appendChild(allRow);
      }

      // The page video. One task, one key (state.dzTasks.vsl) — the same
      // persist() → /api/profile path every other Day Zero tick uses.
      if (task.vsl) renderVslCard(b, function () { box.classList.toggle('done', !!state.dzTasks.vsl); syncDzGate(); });

      box.appendChild(b);
      // toggle for simple tasks (link, profile, guide)
      if (!task.pins && !task.vsl) head.onclick = function () { state.dzTasks[task.id] = !state.dzTasks[task.id]; persist(); chk.textContent = '✓'; box.classList.toggle('done', !!state.dzTasks[task.id]); syncDzGate(); };
      root.appendChild(box);
    });

    var allDone = dz.tasks.every(isTaskDone);
    // A trainer who already started can be in here voluntarily (see the missing-
    // video card on the dashboard). Never trap them behind a disabled unlock.
    if (state.dayZeroDone) {
      var back = el('button', 'cp-btn cp-btn-ghost', '← Back to today'); back.type = 'button'; back.style.marginTop = '16px';
      back.onclick = function () { renderDashboard(); }; root.appendChild(back); return;
    }
    var unlock = el('button', 'cp-btn cp-btn-primary', allDone ? 'Start day one →' : 'Finish the tasks to unlock'); unlock.type = 'button'; unlock.style.marginTop = '16px'; unlock.disabled = !allDone;
    // v12 6 — the gate is computed from the individual keys, in any tap order.
    // `unlock` is undefined on the revisit path (we return before creating it),
    // and every checkbox in the task list calls this on tap.
    function syncDzGate() { if (!unlock) return; var ok2 = dz.tasks.every(isTaskDone); unlock.disabled = !ok2; unlock.textContent = ok2 ? 'Start day one →' : 'Finish the tasks to unlock'; }
    renderDayZero._sync = syncDzGate;
    unlock.onclick = function () { state.dayZeroDone = true; persist(); toast('You’re live'); renderDashboard(); };
    root.appendChild(unlock);
    if (!allDone) {
      // Count follows the task list above it: three for the feed, one for the page.
      var vslTask = (dz.tasks || []).some(function (t) { return t && t.vsl; });
      root.appendChild(el('p', 'cp-note', 'Your program’s ready. ' + (vslTask ? 'Four videos between you and day one — three for your feed, one for your page.' : 'Three videos between you and day one.') + ' Day Zero doesn’t count against your compliance — the streak starts at day one.'));
    }
  }
  function isTaskDone(task) { if (task.pins) return state.dzTasks.pin1 && state.dzTasks.pin2 && state.dzTasks.pin3 && state.dzTasks.pinsAll; return !!state.dzTasks[task.id]; }

  // ================= DASHBOARD =================
  function renderDashboard() {
    try { lastRenderedName = trainerName(); } catch (e) {}
    // Refresh the stored level once per render (safe: levelIndex() reads the
    // *previous* stored value through postDays, so there's no recursion).
    try { state.levelIdx = levelIndex(); } catch (e) {}
    root.className = 'cp-wrap'; root.innerHTML = '';
    // header + badge
    var head = el('div'); head.appendChild(el('span', 'cp-kicker', 'Content Program'));
    var titleRow = el('div'); titleRow.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;';
    titleRow.appendChild(el('h1', 'cp-h1', 'Today'));
    var redo = el('button', 'cp-btn cp-btn-ghost sm', 'Redo my program'); redo.type = 'button'; redo.onclick = function () { renderPathChooser(); }; titleRow.appendChild(redo);
    head.appendChild(titleRow);
    // Read-only look-backs: their own onboarding answers, and every day the
    // program has assigned or they've logged.
    var tools = el('div', 'cp-toolrow');
    var onbBtn = el('button', 'cp-btn cp-btn-ghost sm', 'My Onboarding'); onbBtn.type = 'button'; onbBtn.id = 'cp-my-onboarding-btn'; onbBtn.onclick = openMyOnboarding; tools.appendChild(onbBtn);
    var prevBtn = el('button', 'cp-btn cp-btn-ghost sm', 'Previous Days'); prevBtn.type = 'button'; prevBtn.id = 'cp-previous-days-btn'; prevBtn.onclick = openPreviousDays; tools.appendChild(prevBtn);
    head.appendChild(tools);
    root.appendChild(head);

    renderBadgeHead();
    // v10 addendum A — account flagged by the bleed migration: their saved
    // answers may be another trainer's. Offer the 4-minute redo, never guess.
    if (state.needsReview) {
      var nr = el('div', 'cp-card cp-unlock');
      nr.appendChild(el('div', 'cp-label', 'Check your answers'));
      nr.appendChild(el('p', 'cp-sub', 'We found a problem with your saved answers — they may not all be yours. Want to redo your program? Takes 4 minutes.'));
      var row = el('div', 'cp-copyrow');
      var redoB = el('button', 'cp-btn cp-btn-primary', 'Redo my program'); redoB.type = 'button'; redoB.onclick = function () { state.needsReview = false; persist(); renderPathChooser(); };
      var keepB = el('button', 'cp-btn cp-btn-ghost', 'They’re mine — keep them'); keepB.type = 'button'; keepB.onclick = function () { state.needsReview = false; persist(); renderDashboard(); };
      row.appendChild(redoB); row.appendChild(keepB); nr.appendChild(row);
      root.appendChild(nr);
    }
    // Trainers who finished Day Zero before the page video existed never see it
    // otherwise — renderDayZero is only reachable while !state.dayZeroDone, and
    // setStart is the only reset. That's the whole existing roster: the people
    // already off a call and already earning nothing.
    var dzc = CFG.dayZero || {};
    var vslTask = (dzc.tasks || []).filter(function (t) { return t && t.vsl; })[0];
    if (state.dayZeroDone && vslTask && !state.dzTasks.vsl) {
      var mv = el('div', 'cp-card cp-unlock');
      mv.appendChild(el('div', 'cp-label', 'One video missing from your page'));
      mv.appendChild(el('p', 'cp-sub', 'Every link you post sends people to your coach page, and right now there’s no you on it — just a headline. Ninety seconds, phone sideways, script written from your answers. Rough is fine.'));
      var mvB = el('button', 'cp-btn cp-btn-primary', 'Show me the script'); mvB.type = 'button';
      mvB.onclick = function () { renderDayZero(); };
      mv.appendChild(mvB); root.appendChild(mv);
    }
    if (state.path === 'quick') renderUpgrade();
    // v11 2.3 — Your hooks vs ours. Only renders once a trainer-hook post is
    // logged; no verdict line below 5 posts per side (2.5 — no winners on noise).
    if (!renderDashboard._hooksFetched) {
      renderDashboard._hooksFetched = true;
      try {
        fetch('/api/content/hooks', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.hooks) { state.trainerHooks = j.hooks; persist(); } }).catch(function () {});
        fetch('/api/content/hook-stats', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.stats) { renderDashboard._stats = j.stats; renderHookCompare(); } }).catch(function () {});
      } catch (e) {}
    } else renderHookCompare();
    maybeWeeklyRecap();
    renderTodayCard();
    renderStrip();
    renderCompliance();
    renderLinkRow();
    var dm = el('button', 'cp-btn cp-btn-ghost', 'Someone DM’d me — what do I say?'); dm.type = 'button'; dm.style.marginTop = '10px'; dm.onclick = openDmResponse; root.appendChild(dm);
    renderReminderRow();
  }


  function renderHookCompare() {
    var stats = renderDashboard._stats || []; if (!stats.length) return;
    var mine = stats.find(function (x) { return x.hook_source === 'trainer'; });
    var house = stats.find(function (x) { return x.hook_source === 'house'; });
    if (!mine || !mine.posts) return; // only once they've logged a trainer-hook post
    var host = document.getElementById('cp-hook-compare');
    if (!host) { host = el('div', 'cp-card'); host.id = 'cp-hook-compare'; var anchor = root.querySelector('.cp-today'); if (anchor) root.insertBefore(host, anchor); else root.appendChild(host); }
    host.innerHTML = '';
    host.appendChild(el('div', 'cp-label', 'Your hooks vs ours'));
    function line(lbl, o) { return lbl + ': ' + (o ? o.posts : 0) + ' post' + ((o && o.posts === 1) ? '' : 's') + ' · ' + (o ? o.clicks : 0) + ' click' + ((o && o.clicks === 1) ? '' : 's'); }
    host.appendChild(el('p', 'cp-sub', line('Your hooks', mine)));
    host.appendChild(el('p', 'cp-sub', line('House hooks', house)));
    var enough = mine.posts >= 5 && house && house.posts >= 5;
    if (enough) {
      var mineRate = mine.clicks / Math.max(1, mine.posts); var houseRate = (house.clicks || 0) / Math.max(1, house.posts);
      host.appendChild(el('p', 'cp-note', mineRate > houseRate ? 'Yours are winning. Keep writing them.' : 'The house is ahead for now — keep testing yours.'));
    } else {
      host.appendChild(el('p', 'cp-note', 'Numbers only for now — verdicts start at 5 posts per side.'));
    }
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

  /* ================= MY ONBOARDING (read-only) =================
     The trainer's own content_program_v2 record, every question in the order
     it was asked. Same shape as the owner "Information" modal (section title,
     muted question line, answer under it) but strictly self-scoped: the
     answers come from GET /api/profile, which is session-scoped server-side —
     there is no user parameter to point at anyone else. Local state is only a
     fallback when the fetch fails. */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtWhen(v) {
    if (!v) return '';
    var d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
  }
  function humanKey(k) {
    return String(k).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  // Render any stored answer shape as a readable line.
  function answerText(q, val) {
    if (val == null || val === '') return '';
    if (q && q.type === 'choice' && q.choices) {
      var hit = null;
      q.choices.forEach(function (c) { if (c.v === val) hit = c; });
      if (hit) return hit.label;
    }
    if (q && q.type === 'days' && val && typeof val === 'object') {
      var arr = (val.days || []).map(function (n) { return DOW_FULL[n] || n; });
      var cnt = val.count ? val.count + ' a week' : '';
      return [cnt, arr.join(', ')].filter(Boolean).join(' · ');
    }
    if (Array.isArray(val)) return val.map(function (x) { return answerText(null, x); }).filter(Boolean).join(', ');
    if (typeof val === 'object') { try { return JSON.stringify(val); } catch (e) { return String(val); } }
    return String(val);
  }
  // showIf, evaluated against a saved record instead of live draft state — a
  // question the branch never asked shouldn't show up as "not answered".
  function askedInRecord(q, ans, meta) {
    if (q.showIfSentence) {
      var m = meta && meta[q.showIfSentence];
      var t = m ? m.type : classifyAnswer(ans[q.showIfSentence]).type;
      if (t !== 'SENTENCE') return false;
    }
    if (!q.showIf) return true;
    return Object.keys(q.showIf).every(function (k) { return ans[k] === q.showIf[k]; });
  }
  function onboardingSections(rec) {
    var ans = (rec && rec.answered) || {};
    var meta = (rec && rec.answered_meta) || {};
    var path = (rec && rec.path) || 'quick';
    var sections = [];
    var used = {};
    var current = null;
    CFG.questions.forEach(function (q) {
      if (path !== 'detailed' && q.path !== 'quick') return;
      if (!askedInRecord(q, ans, meta)) return;
      used[q.id] = true;
      var sec = (CFG.sections[q.section] && CFG.sections[q.section].title) || humanKey(q.section);
      if (!current || current.title !== sec) { current = { title: sec, rows: [] }; sections.push(current); }
      current.rows.push([q.label, answerText(q, ans[q.id])]);
    });
    // Anything stored that isn't a current question (older schema, extras) —
    // fall through as-is rather than hiding it.
    var extras = [];
    Object.keys(ans).forEach(function (k) {
      if (used[k]) return;
      var v = answerText(null, ans[k]);
      if (v) extras.push([humanKey(k), v]);
    });
    if (extras.length) sections.push({ title: 'Other saved answers', rows: extras });
    return sections;
  }
  function onboardingCopyText(rec, sections) {
    var out = ['My content program onboarding'];
    if (rec && rec.path) out.push('Path: ' + (rec.path === 'detailed' ? 'Detailed' : 'Quick'));
    if (rec && rec.updatedAt) out.push('Last updated: ' + fmtWhen(rec.updatedAt));
    sections.forEach(function (sec) {
      out.push(''); out.push(sec.title.toUpperCase());
      sec.rows.forEach(function (r) { out.push(r[0] + '\n' + (r[1] || '— not answered')); });
    });
    return out.join('\n');
  }
  function openMyOnboarding() {
    var node = el('div');
    var head = el('div', 'cp-modal-head');
    var headText = el('div');
    headText.appendChild(el('h3', null, 'My onboarding'));
    var sub = el('div', 'cp-modal-sub', 'Loading your answers…');
    headText.appendChild(sub); head.appendChild(headText);
    var headBtns = el('div', 'cp-modal-headbtns');
    var copyBtn = el('button', 'cp-btn cp-btn-ghost sm', 'Copy'); copyBtn.type = 'button'; copyBtn.disabled = true;
    var closeBtn = el('button', 'cp-btn cp-btn-ghost sm', 'Close'); closeBtn.type = 'button'; closeBtn.onclick = closeModal;
    headBtns.appendChild(copyBtn); headBtns.appendChild(closeBtn); head.appendChild(headBtns);
    node.appendChild(head);
    var list = el('div', 'cp-info-list'); node.appendChild(list);
    openModal(node);

    var paint = function (rec, note) {
      var sections = onboardingSections(rec);
      var bits = [];
      if (rec && rec.path) bits.push((rec.path === 'detailed' ? 'Detailed' : 'Quick') + ' path');
      if (rec && rec.updatedAt) bits.push('Last updated ' + fmtWhen(rec.updatedAt));
      if (note) bits.push(note);
      sub.textContent = bits.join(' • ');
      list.innerHTML = '';
      if (!sections.length) { list.appendChild(el('p', 'cp-note', 'No onboarding answers on file yet.')); return; }
      sections.forEach(function (sec) {
        var item = el('article', 'cp-info-item');
        item.appendChild(el('div', 'cp-info-sec', esc(sec.title)));
        sec.rows.forEach(function (r) {
          var row = el('div', 'cp-info-row');
          row.appendChild(el('div', 'cp-info-q', esc(r[0])));
          var a = el('div', 'cp-info-a' + (r[1] ? '' : ' empty'));
          a.textContent = r[1] || 'Not answered';
          row.appendChild(a); item.appendChild(row);
        });
        list.appendChild(item);
      });
      var copy = onboardingCopyText(rec, sections);
      copyBtn.disabled = false;
      copyBtn.onclick = function () { copyText(copy, 'Onboarding copied'); };
    };

    fetch('/api/profile', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var cp = j && j.profile && j.profile.profile && j.profile.profile.content_program_v2;
        if (cp && cp.answered) { paint(cp); return; }
        paint(state, 'from this device');
      })
      .catch(function () { paint(state, 'offline — showing this device’s copy'); });
  }

  /* ================= PREVIOUS DAYS (read-only) =================
     Every prior day the program assigned something or the trainer logged
     something, newest first. Assignments come from the program itself
     (scriptFor/assignedTasks over the local record); what actually happened
     comes from the day check-ins plus GET /api/content/posts (session-scoped,
     the same rows "I posted" writes). */
  var PREV_DAYS_MAX = 180;
  function dayLabel(d) {
    var now = today();
    var base = DOW[d.getDay()] + ' · ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
    return d.getFullYear() === now.getFullYear() ? base : base + ', ' + d.getFullYear();
  }
  function previousDayRows(serverPosts) {
    var byDate = {};
    (serverPosts || []).forEach(function (p) { (byDate[p.scheduledDate] = byDate[p.scheduledDate] || []).push(p); });
    var rows = [];
    var seen = {};
    var end = addDays(today(), -1);
    var start = programStart();
    var floor = addDays(end, -(PREV_DAYS_MAX - 1));
    if (start < floor) start = floor;
    for (var c = new Date(end); c >= start; c = addDays(c, -1)) {
      var key = ymd(c);
      var ci = state.checkins[key] || null;
      var posts = byDate[key] || [];
      var s = scriptFor(c);
      var assigned = assignedTasks(c);
      var hasSomething = posts.length || ci || assigned.post || assigned.stories;
      if (!hasSomething) continue;
      seen[key] = true;
      rows.push({ key: key, date: new Date(c), script: s, assigned: assigned, checkin: ci, posts: posts });
    }
    // Logged days outside the local program window (older account, reinstall,
    // another device) still belong in the list.
    Object.keys(byDate).forEach(function (k) {
      if (seen[k] || !k) return;
      var d = parseYmd(k);
      if (d >= today()) return;
      rows.push({ key: k, date: d, script: null, assigned: null, checkin: state.checkins[k] || null, posts: byDate[k] });
    });
    rows.sort(function (a, b) { return a.key < b.key ? 1 : a.key > b.key ? -1 : 0; });
    return rows;
  }
  // What the day actually was: a logged post beats the assignment (they can
  // swap the day), the assignment covers days with nothing logged.
  function prevRowType(row) {
    var logged = row.posts.filter(function (p) { return p.status === 'posted'; })[0] || row.posts[0];
    if (logged && logged.postType) return logged.postType;
    if (row.script && row.script.type) return row.script.type;
    return 'stories';
  }
  function prevRowHeadline(row) {
    var posted = row.posts.filter(function (p) { return p.hookText; })[0];
    if (posted && posted.hookText) return posted.hookText;
    if (row.script && row.script.hook) return row.script.hook;
    if (row.script && row.script.title) return row.script.title;
    return jobLabel(prevRowType(row));
  }
  function prevRowStatus(row) {
    var ci = row.checkin || {};
    var serverPosted = row.posts.some(function (p) { return p.status === 'posted'; });
    var type = prevRowType(row);
    var needsPost = row.assigned ? row.assigned.post : (type === 'win' || type === 'mistake' || type === 'app');
    if (serverPosted || ci.posted) return { label: 'Posted', cls: 'done' };
    if (!row.checkin && !row.posts.length) return { label: needsPost ? 'Not logged' : 'No log', cls: 'idle' };
    if (needsPost && ci.posted === false) return { label: 'Missed', cls: 'missed' };
    if (ci.stories === 'yes') return { label: 'Stories done', cls: 'done' };
    if (ci.stories === 'partial') return { label: 'Stories partial', cls: 'idle' };
    return { label: 'Logged', cls: 'idle' };
  }
  function prevDayDetails(row) {
    var box = el('div', 'cp-dayrow-details');
    var add = function (label, value) {
      if (!String(value == null ? '' : value).trim()) return;
      var r = el('div', 'cp-info-row');
      r.appendChild(el('div', 'cp-info-q', esc(label)));
      var v = el('div', 'cp-info-a'); v.textContent = value; r.appendChild(v);
      box.appendChild(r);
    };
    var s = row.script;
    if (s) {
      add('Assigned', jobLabel(s.type) + (s.title && s.title !== jobLabel(s.type) ? ' — ' + s.title : ''));
      if (s.hook) add('Hook for the day', s.hook);
      if (s.angle && (s.angle.take || s.angle.topic)) add(labelForAngle(s.type), s.angle.take || s.angle.topic);
      if (s.angle && s.angle.kind === 'proof') add('The proof', s.angle.text);
      if (s.beats && s.beats.length) add('The shape', s.beats.map(function (b) { return b.t + ' — ' + b.job; }).join('\n'));
      if (s.cta) add('CTA', s.cta);
    }
    row.posts.forEach(function (p) {
      var bits = [jobLabel(p.postType), p.status === 'posted' ? 'posted' : p.status];
      if (p.postedAt) bits.push(fmtWhen(p.postedAt));
      add('Logged post', bits.filter(Boolean).join(' · '));
      if (p.hookText) add('Hook used' + (p.hookSource === 'trainer' ? ' (yours)' : ''), p.hookText);
      var stats = [];
      if (p.views != null) stats.push(p.views + ' views');
      if (p.dms != null) stats.push(p.dms + ' DMs');
      if (p.clicks) stats.push(p.clicks + ' link clicks');
      if (stats.length) add('Numbers', stats.join(' · '));
    });
    var ci = row.checkin;
    if (ci) {
      add('Check-in', (ci.posted ? 'Posted' : 'Did not post') + (ci.stories ? ' · stories: ' + ci.stories : ''));
      if (ci.reason) add('Reason given', ci.reason);
      if (ci.quality && ci.quality.length) add('Quality check', ci.quality.join(', '));
    }
    if (!box.childNodes.length) box.appendChild(el('p', 'cp-note', 'Nothing logged for this day.'));
    return box;
  }
  function openPreviousDays() {
    var node = el('div');
    var head = el('div', 'cp-modal-head');
    var headText = el('div');
    headText.appendChild(el('h3', null, 'Previous days'));
    var sub = el('div', 'cp-modal-sub', 'Loading your history…');
    headText.appendChild(sub); head.appendChild(headText);
    var headBtns = el('div', 'cp-modal-headbtns');
    var closeBtn = el('button', 'cp-btn cp-btn-ghost sm', 'Close'); closeBtn.type = 'button'; closeBtn.onclick = closeModal;
    headBtns.appendChild(closeBtn); head.appendChild(headBtns);
    node.appendChild(head);
    var list = el('div', 'cp-daylist'); node.appendChild(list);
    openModal(node);

    var paint = function (serverPosts, note) {
      var rows = previousDayRows(serverPosts);
      sub.textContent = (rows.length ? rows.length + ' day' + (rows.length === 1 ? '' : 's') + ' · newest first' : 'Nothing here yet')
        + (note ? ' • ' + note : '');
      list.innerHTML = '';
      if (!rows.length) {
        list.appendChild(el('p', 'cp-note', 'No previous days yet — your history starts the day after your program does.'));
        return;
      }
      rows.forEach(function (row) {
        var type = prevRowType(row);
        var st = prevRowStatus(row);
        var item = el('div', 'cp-dayrow');
        var btn = el('button', 'cp-dayrow-head'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
        var left = el('div', 'cp-dayrow-main');
        var top = el('div', 'cp-dayrow-top');
        top.appendChild(el('span', 'cp-dayrow-date', esc(dayLabel(row.date))));
        top.appendChild(el('span', 'cp-jobtag ' + type, esc(jobLabel(type))));
        left.appendChild(top);
        var hook = el('div', 'cp-dayrow-hook'); hook.textContent = prevRowHeadline(row); left.appendChild(hook);
        btn.appendChild(left);
        var right = el('div', 'cp-dayrow-right');
        right.appendChild(el('span', 'cp-daystat ' + st.cls, esc(st.label)));
        right.appendChild(el('span', 'cp-dayrow-chev', '›'));
        btn.appendChild(right);
        item.appendChild(btn);
        var details = null;
        btn.onclick = function () {
          var open = item.classList.toggle('open');
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (open && !details) { details = prevDayDetails(row); item.appendChild(details); }
        };
        list.appendChild(item);
      });
    };

    fetch('/api/content/posts', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { paint((j && j.posts) || []); })
      .catch(function () { paint([], 'logged posts unavailable — showing this device’s record'); });
  }

  function renderUpgrade() {
    var answered = 0, totalDetailed = CFG.questions.filter(function (q) { return q.path === 'detailed'; }).length;
    CFG.questions.forEach(function (q) { if (q.path === 'detailed' && state.answered[q.id] != null && state.answered[q.id] !== '') answered++; });
    var remaining = totalDetailed - answered;
    var card = el('div', 'cp-card cp-unlock');
    card.appendChild(el('div', 'cp-label', 'Level up your posts'));
    card.appendChild(el('p', 'cp-sub', remaining + ' more answers unlocks the story posts and your voice — so your posts sound like you, not a good trainer in general.'));
    var b = el('button', 'cp-btn cp-btn-primary', 'Add more detail to my program'); b.type = 'button'; b.style.marginTop = '8px';
    b.onclick = function () { state.draft = null; beginDraft('detailed'); startQuestionnaire({ upgrade: true }); }; card.appendChild(b);
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
      var brief = (LIB.briefs || {})[s.type] || {};
      var idx = occurrenceIndex(d, s.type);
      // ── 1 · The job
      if (brief.job) { var jb = el('div', 'cp-prompt'); jb.innerHTML = '<b>Job:</b> ' + esc(brief.job); body.appendChild(jb); }
      // ── 2 · The goal (what a stranger feels)
      if (brief.goal) { var gl = el('div', 'cp-card'); gl.style.marginTop = '10px'; gl.appendChild(el('div', 'cp-label', 'If it works, they think')); gl.appendChild(el('p', 'cp-cta-text', esc(brief.goal))); body.appendChild(gl); }
      // ── 3 · Your material (their own answers, verbatim, labelled — never spliced)
      var mat = el('div', 'cp-card'); mat.style.marginTop = '10px'; mat.appendChild(el('div', 'cp-label', 'Your material'));
      function matRow(label, val) { if (!String(val || '').trim()) return; var r = el('div'); r.style.cssText = 'padding:7px 0;border-top:1px solid var(--line);'; r.appendChild(el('div', 'cp-hooknote', label)); var v = el('div'); v.style.cssText = 'font-weight:600;font-size:.96rem;line-height:1.4;'; v.textContent = val; r.appendChild(v); mat.appendChild(r); }
      matRow('Who you’re talking to', state.answered.audience);
      if (s.angle && s.angle.topic) matRow(labelForAngle(s.type) + ' this week', s.angle.take || s.angle.topic);
      else if (s.angle && s.angle.kind === 'proof') matRow('The proof', s.angle.text);
      matRow('What you stand for', state.answered.core);
      body.appendChild(mat);
      // shared-pool prompt: capture their take (still their material)
      if (s.angle && s.angle.kind === 'prompt') {
        var pw = el('div', 'cp-cta-box'); pw.style.cssText = 'border-style:solid;margin-top:10px;';
        pw.appendChild(el('div', 'cp-label', 'Make it yours (once)'));
        pw.appendChild(el('p', 'cp-cta-why', esc(s.angle.prompt)));
        var ta = el('textarea', 'cp-textarea'); ta.placeholder = 'Your take, your words…'; ta.setAttribute('aria-label', 'Your take'); pw.appendChild(ta);
        var save = el('button', 'cp-btn cp-btn-primary sm', 'Save my take'); save.type = 'button'; save.style.marginTop = '8px';
        save.onclick = function () { var v = ta.value.trim(); if (v.length < 3) { toast('Say a little more'); return; } savePersonalTake(s.angle.topicKey, v); toast('Saved — that’s yours now'); renderDashboard(); };
        pw.appendChild(save); body.appendChild(pw);
      }
      // ── 4 · Think about (the heart — questions, cycled)
      var qs = thinkQuestions(brief, idx);
      if (qs.length) { var tk = el('div', 'cp-card'); tk.style.marginTop = '10px'; tk.appendChild(el('div', 'cp-label', 'Think about — before you film')); qs.forEach(function (q) { var r = el('div'); r.style.cssText = 'display:flex;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:.95rem;line-height:1.4;'; r.appendChild(el('span', null, '→')).style.color = 'var(--accent)'; r.appendChild(el('span', null, esc(q))); tk.appendChild(r); }); body.appendChild(tk); }
      // ── 6 · Think-it-through field
      var savedBul = (state.personalTakes && state.personalTakes['bullets:' + s.type]) || '';
      var tif = el('div', 'cp-card'); tif.style.marginTop = '10px'; tif.appendChild(el('div', 'cp-label', 'Jot your bullets before you film'));
      tif.appendChild(el('p', 'cp-hooknote', 'Thirty seconds writing this saves you four takes.'));
      if (savedBul) tif.appendChild(el('p', 'cp-hooknote', 'What you said last time: ' + savedBul));
      var bulTa = el('textarea', 'cp-textarea'); bulTa.placeholder = '• …'; bulTa.value = ''; tif.appendChild(bulTa);
      var bulSave = el('button', 'cp-btn cp-btn-ghost sm', 'Save my bullets'); bulSave.type = 'button'; bulSave.style.marginTop = '8px'; bulSave.onclick = function () { if (bulTa.value.trim()) { savePersonalTake('bullets:' + s.type, bulTa.value.trim()); toast('Saved'); } }; tif.appendChild(bulSave);
      body.appendChild(tif);
      // ── 5 · The shape (beats)
      var beatsWrap = el('div', 'cp-card'); beatsWrap.style.marginTop = '10px'; beatsWrap.appendChild(el('div', 'cp-label', 'The shape' + (s.length ? ' · ' + s.length : '')));
      (s.beats || []).forEach(function (b) { var row = el('div'); row.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:.92rem;'; var t = el('span'); t.style.cssText = 'font-weight:800;color:var(--accent);white-space:nowrap;'; t.textContent = b.t; row.appendChild(t); row.appendChild(el('span', null, esc(b.job))); beatsWrap.appendChild(row); });
      body.appendChild(beatsWrap);
      // ── 6 · The two written lines: hook + CTA
      var hookKey = 'hook:' + s.type + ':' + (idx % 6);
      var hookText = (state.personalTakes && state.personalTakes[hookKey]) || s.hook || '';
      var written = el('div', 'cp-card'); written.style.marginTop = '10px'; written.appendChild(el('div', 'cp-label', 'The two lines you write out'));
      var hookBox = el('div'); hookBox.style.cssText = 'padding:8px 0;border-top:1px solid var(--line);';
      var todayKey = ymd(d);
      if (s.isHookDay && !(state.hookChoices || {})[todayKey]) {
        // v11 2.1 — Your Hook Day: they write the opener. House version only
        // shows AFTER they've typed, so they don't just reword ours.
        hookBox.appendChild(el('div', 'cp-hooknote', 'YOUR HOOK DAY — today you write the opener. Same rules: name the group, never “you.”'));
        var hdIn = el('textarea', 'cp-textarea'); hdIn.placeholder = 'Your hook…'; hdIn.setAttribute('aria-label', 'Your hook'); hookBox.appendChild(hdIn);
        var hdErr = el('p', 'cp-err'); hookBox.appendChild(hdErr);
        var houseRef = el('p', 'cp-hooknote'); houseRef.style.display = 'none'; houseRef.textContent = 'House version, for reference: “' + (s.hook || '') + '”'; hookBox.appendChild(houseRef);
        hdIn.addEventListener('input', function () { hdErr.textContent = ''; if (hdIn.value.trim().length > 8) houseRef.style.display = 'block'; });
        var hdRow = el('div'); hdRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;';
        var useMine = el('button', 'cp-btn cp-btn-primary sm', 'Use mine'); useMine.type = 'button';
        useMine.onclick = function () {
          var msg = validTrainerHook(hdIn.value); if (msg) { hdErr.textContent = msg; return; }
          var text = hdIn.value.trim();
          state.hookChoices[todayKey] = { source: 'trainer', text: text };
          state.trainerHooks = state.trainerHooks || [];
          var local = { hook_text: text, post_type: s.type, status: 'active', topic_key: (s.angle && s.angle.topicKey) || '' };
          state.trainerHooks.push(local); persist();
          try { fetch('/api/content/hooks', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hookText: text, topicKey: local.topic_key, postType: s.type }) }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.id) { local.id = j.id; state.hookChoices[todayKey].trainerHookId = j.id; persist(); } }).catch(function () {}); } catch (e) {}
          toast('That’s your opener today'); renderDashboard();
        };
        var useHouse = el('button', 'cp-btn cp-btn-ghost sm', 'Use the house version'); useHouse.type = 'button';
        useHouse.onclick = function () { state.hookChoices[todayKey] = { source: 'house', text: s.hook || '' }; persist(); renderDashboard(); };
        hdRow.appendChild(useMine); hdRow.appendChild(useHouse); hookBox.appendChild(hdRow);
        written.appendChild(hookBox);
        hookText = '';
      } else {
      hookBox.appendChild(el('div', 'cp-hooknote', 'HOOK — say this first' + (s.hookSource === 'trainer' ? ' · yours' : ''))); var hookLineEl = el('div'); hookLineEl.style.cssText = 'font-weight:700;font-size:1.04rem;line-height:1.35;'; hookLineEl.textContent = hookText; hookBox.appendChild(hookLineEl);
      written.appendChild(hookBox);
      }
      // §7 read-aloud check
      var ra = el('div'); ra.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;' + (hookText ? '' : 'display:none;');
      var ok = el('button', 'cp-btn cp-btn-ghost sm', 'Sounds right'); ok.type = 'button'; ok.onclick = function () { toast('Good — film it.'); };
      var fix = el('button', 'cp-btn cp-btn-ghost sm', 'Let me fix it'); fix.type = 'button';
      fix.onclick = function () {
        var ed = el('textarea', 'cp-textarea'); ed.value = hookText; ed.style.marginTop = '8px'; hookBox.appendChild(ed); ra.style.display = 'none';
        var sv = el('button', 'cp-btn cp-btn-primary sm', 'Save my hook'); sv.type = 'button'; sv.style.marginTop = '6px'; sv.onclick = function () { if (ed.value.trim()) { savePersonalTake(hookKey, ed.value.trim()); toast('Saved — that’s your hook now'); renderDashboard(); } }; hookBox.appendChild(sv);
      };
      ra.appendChild(el('span', 'cp-hooknote', 'Read your hook out loud — sound like you?')); ra.appendChild(ok); ra.appendChild(fix); written.appendChild(ra);
      var ctaBox2 = el('div'); ctaBox2.style.cssText = 'padding:8px 0;border-top:1px solid var(--line);margin-top:8px;';
      ctaBox2.appendChild(el('div', 'cp-hooknote', 'CTA — say this last (same every time)')); var ctaLineEl = el('div'); ctaLineEl.style.cssText = 'font-weight:600;font-size:.96rem;line-height:1.4;white-space:pre-wrap;'; ctaLineEl.textContent = ctaText(); ctaBox2.appendChild(ctaLineEl);
      written.appendChild(ctaBox2);
      body.appendChild(written);
      if (s.framing) body.appendChild(el('p', 'cp-hooknote', s.framing));
      var made = postsMadeCount(); var avail = postsAvailable();
      if (made <= avail) body.appendChild(el('p', 'cp-hooknote', 'Post ' + (made + 1) + ' of ' + avail + ' — you haven’t repeated yet.'));
      var copyRow = el('div', 'cp-copyrow'); var copyScript = el('button', 'cp-btn cp-btn-primary', 'Copy the brief'); copyScript.type = 'button'; copyScript.onclick = function () { copyText(briefText(s, brief, qs, hookText), 'Brief copied'); }; copyRow.appendChild(copyScript); body.appendChild(copyRow);
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
    root.appendChild(el('h3', 'cp-section-title', 'Compliance'));
    // Before day one — no percentage, no band, no shame (v7 1.7 / v8 P2).
    var elapsed = daysBetween(ymd(programStart()), ymd(today()));
    if (elapsed < 1 && Object.keys(state.checkins).length === 0) {
      var start = programStart(); var card0 = el('div', 'cp-card');
      card0.appendChild(el('span', 'cp-score-num', 'Starts')); card0.lastChild.style.fontSize = '1.6rem';
      card0.appendChild(el('div', 'cp-score-30', DOW_FULL[start.getDay()] + ' ' + (start.getMonth() + 1) + '/' + start.getDate()));
      card0.appendChild(el('p', 'cp-note', 'Your score kicks in once you’re rolling. Nobody’s failing before day one.'));
      root.appendChild(card0); return;
    }
    var p7 = compliancePct(7); var p30 = compliancePct(30); var streak = currentStreak();
    var band = (p7 == null) ? 'amber' : (p7 >= 85 ? 'green' : p7 >= 60 ? 'amber' : 'red');
    var lbl = (p7 == null) ? 'Getting going' : (p7 >= 85 ? 'On program' : p7 >= 60 ? 'Slipping' : 'Off program');
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
    var inp = el('input', 'cp-input'); inp.value = autoLink(); inp.readOnly = true; inp.setAttribute('aria-label', 'Landing page link');
    var copy = el('button', 'cp-btn cp-btn-primary sm', 'Copy'); copy.type = 'button'; copy.onclick = function () { copyText(autoLink(), 'Link copied'); };
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
      if (isPost) { try { var num2 = function (x) { x = String(x || '').replace(/[^0-9]/g, ''); return x ? +x : undefined; }; logPost(d, scriptFor(d), postVal === 'yes', { views: num2(vIn.value), dms: num2(dIn.value), clicks: num2(cIn.value) }); } catch (e) {} }
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
    // An open draft (first run or redo) resumes the questionnaire (v10 0.2).
    if (state.draft) return startQuestionnaire({ resume: true });
    // Flow A -> Flow B handoff: a first-time trainer arriving from signup sees
    // one framing screen, then the DETAILED track pre-filled from what signup
    // already knows. Completed programs (setupDone) never see this.
    if (!state.setupDone && !state.draft) {
      var prefill = readSignupPrefill();
      if (prefill && prefill.fromSignup) return renderSignupFraming(prefill);
      // Legacy bridge: /content?path=quick|full also drops straight in.
      var wanted = '';
      try { wanted = String(new URL(window.location.href).searchParams.get('path') || ''); } catch (e) {}
      if (wanted === 'quick' || wanted === 'full') {
        beginDraft(wanted);
        return startQuestionnaire();
      }
    }
    if (!state.path || !state.setupDone) {
      // Existing trainer with an incomplete/missing questionnaire: one-time
      // upgrade interstitial, hard-gated in front of the dashboard. The owner is
      // exempt (previews on their own account); non-trainers keep the chooser.
      if (!state.setupDone && isTrainerUser() && !isOwnerUser()) return renderUpgradeInterstitial();
      return renderPathChooser();
    }
    if (!state.startDate) return renderStartDate();
    if (!state.dayZeroDone) return renderDayZero();
    renderDashboard(); maybeEveningNudge(); scheduleReminder();
  }
  var bootedUid = null;
  function boot() {
    bootedUid = currentUid();
    // Trainers are SERVER-AUTHORITATIVE: never seed from localStorage. A stale
    // local blob on a shared/impersonated browser must not resurrect as
    // "complete" (the ghost that misdirected onboarding this week). If the
    // server says no record, the answer is no record. Owners are exempt — they
    // preview on their own account and use the normal local path.
    if (isTrainerUser() && !isOwnerUser()) {
      purgeForeignStorage(); // still scrub other-account/legacy keys off a shared browser
      state = defaultState();
      renderTrainerLoading();
      renderWhoBanner();
      fetchServerPrefill(); // ready the Flow A seeds for an incomplete trainer
      loadFromProfile().then(function (cp) {
        if (cp) state = Object.assign(defaultState(), cp); // whatever the server has, authoritative
        route();
      }).catch(function () { route(); });
      return;
    }
    state = loadLocal() || defaultState();
    if (state.answered && state.answered.link) delete state.answered.link; // purge any stale seeded slug (v8 0.1)
    // Legacy v8 redo repair: redoBackup held the pre-redo program while the redo
    // wrote into live. Restore the backup as live and drop the broken redo.
    if (state.redoBackup) { state.answered = state.redoBackup; delete state.redoBackup; state.redoing = false; }
    route();
    renderWhoBanner();
    // Reconcile with the server copy — never let an older/empty profile clobber
    // in-progress answers (the wipe bug), BUT a COMPLETED server record always
    // wins over an incomplete local scaffold regardless of timestamps. That is
    // what stops "log in on another device and get asked to start over" when the
    // answers are already saved server-side (server-authoritative completion).
    loadFromProfile().then(function (cp) {
      if (!cp || !cp.answered) return;
      var serverNewer = (cp.updatedAt || 0) > (state.updatedAt || 0);
      var serverComplete = !!cp.setupDone && Object.keys(cp.answered).length > 0;
      var localComplete = !!(state && state.setupDone);
      if (serverNewer || (serverComplete && !localComplete)) {
        state = Object.assign(defaultState(), cp);
        var key = lsKey(); if (key) { try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) {} }
        route();
      }
    });
  }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
  // If auth resolves (or switches accounts) after first paint, re-boot against
  // the right per-user key so we never keep another account's state on screen.
  var lastRenderedName = null;
  try { window.addEventListener('odeauth', function () {
    renderWhoBanner(); // identity may resolve/switch after first paint
    if (currentUid() !== bootedUid) { boot(); return; }
    // Same account, richer user object (trainer.fullName arrives with the full
    // /api/auth/me): if the resolved name changed, re-render so the CTA and
    // pins never disagree (v12 3).
    if (state && state.setupDone && trainerName() !== lastRenderedName) route();
  }); } catch (e) {}

  // §7 — test hook so the QA harness can drive the generator directly.
  try {
    window.__cpTest = {
      setProfile: function (p) { state = Object.assign(defaultState(), p); if (!state.startDate) state.startDate = ymd(today()); },
      setVoice: function (v) { state.answered.voice = v; },
      scriptFor: function (d) { return scriptFor(parseYmd(d)); },
      storiesFor: function (d) { return storiesFor(parseYmd(d)); },
      ctaText: ctaText, hookLine: hookLine, grammarGuard: grammarGuard, classifyAnswer: classifyAnswer, voiceKey: voiceKey, isHookDay: function (d, t) { return isHookDay(parseYmd(d), t); }, validTrainerHook: validTrainerHook,
      getState: function () { return state; },
      jobFor: function (d) { return jobFor(parseYmd(d)); }, wordCount: wordCount,
      today: function () { return ymd(today()); }, addDays: function (d, n) { return ymd(addDays(parseYmd(d), n)); }
    };
  } catch (e) {}
})();
