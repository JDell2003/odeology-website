/* RiseForIt manual workout builder (Trainerize-style, desktop-first).
   Mounted via window.RiseWorkoutBuilder.mount(rootEl, { exercises, onSave }).
   Left pane: day tabs + the workout being built (editable exercise rows).
   Right pane: searchable exercise library grid; hover animates the two pose
   frames; drag a card onto a day (or click it) to add it to that day.
   Save assembles a { name, instructions, days } plan and hands it to onSave. */
(function () {
  'use strict';

  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var REST_OPTIONS = ['30 sec', '45 sec', '60 sec', '90 sec', '2 min', '3 min', '5 min'];
  var PAGE = 30;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid() { return 'x' + Math.random().toString(36).slice(2, 9); }
  function imgPath(ex, i) {
    var arr = ex && Array.isArray(ex.images) ? ex.images : [];
    var p = arr[i] || arr[0] || '';
    return p ? ('/' + String(p).replace(/^\/+/, '')) : '';
  }

  function injectStyles() {
    if (document.getElementById('wb-styles')) return;
    var s = document.createElement('style');
    s.id = 'wb-styles';
    s.textContent = [
      '.wb{--gold:#d4a537;--ink:#1f2937;--line:rgba(15,23,42,.1);display:flex;flex-direction:column;height:100vh;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);}',
      '.wb *{box-sizing:border-box;}',
      '.wb-top{display:flex;align-items:center;gap:14px;padding:12px 18px;background:#20232a;color:#fff;flex:0 0 auto;}',
      '.wb-top .wb-kicker{font:700 11px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;opacity:.7;}',
      '.wb-name{flex:1 1 auto;min-width:0;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.25);color:#fff;font:700 16px/1.2 system-ui;padding:6px 2px;}',
      '.wb-name:focus{outline:0;border-bottom-color:var(--gold);}',
      '.wb-save{background:#2f6f8f;border:0;color:#fff;font:800 13px/1 system-ui;padding:10px 20px;border-radius:8px;cursor:pointer;}',
      '.wb-save:hover{filter:brightness(1.08);}',
      '.wb-x{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;opacity:.8;line-height:1;}',
      '.wb-status{font:700 12px/1 system-ui;padding:0 4px;}',
      '.wb-status.ok{color:#4ade80;} .wb-status.bad{color:#f87171;}',
      '.wb-body{display:grid;grid-template-columns:minmax(380px,1fr) minmax(420px,1.15fr);gap:0;flex:1 1 auto;min-height:0;}',
      '.wb-left{border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;}',
      '.wb-right{display:flex;flex-direction:column;min-height:0;background:#fbfbfc;}',
      '.wb-instr{padding:14px 18px 8px;border-bottom:1px solid var(--line);}',
      '.wb-instr label{font:800 10px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;color:#2f6f8f;}',
      '.wb-instr textarea{width:100%;margin-top:6px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:400 13px/1.5 system-ui;resize:vertical;min-height:40px;}',
      // day tabs
      '.wb-days{display:flex;gap:6px;flex-wrap:wrap;padding:12px 18px 4px;}',
      '.wb-day{border:1px solid var(--line);background:#f1f3f5;color:#475569;border-radius:8px;padding:7px 13px;font:700 12px/1 system-ui;cursor:pointer;position:relative;}',
      '.wb-day.is-active{background:var(--ink);color:#fff;border-color:var(--ink);}',
      '.wb-day.is-drop{border-color:var(--gold);box-shadow:0 0 0 2px rgba(212,165,55,.35);}',
      '.wb-day .wb-day-count{margin-left:6px;font-weight:800;opacity:.7;font-size:11px;}',
      // toolbar
      '.wb-tools{display:flex;gap:8px;align-items:center;padding:8px 18px;border-bottom:1px solid var(--line);}',
      '.wb-tool{border:1px solid var(--line);background:#fff;border-radius:7px;padding:7px 12px;font:700 11px/1 system-ui;color:#475569;cursor:pointer;letter-spacing:.03em;}',
      '.wb-tool:hover{background:#f8fafc;}',
      '.wb-tool.rest{margin-left:auto;color:#a1751f;border-color:rgba(185,138,43,.4);background:rgba(212,165,55,.1);}',
      // rows
      '.wb-rows{flex:1 1 auto;overflow:auto;min-height:0;padding:4px 12px 24px;}',
      '.wb-colhead{display:grid;grid-template-columns:1fr 66px 128px 96px 28px;gap:8px;padding:8px 6px;font:700 11px/1 system-ui;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8;}',
      '.wb-empty{border:2px dashed var(--line);border-radius:14px;padding:44px 20px;text-align:center;color:#94a3b8;font:600 13px/1.5 system-ui;margin:12px 6px;}',
      '.wb-empty.is-drop{border-color:var(--gold);background:rgba(212,165,55,.06);}',
      '.wb-row{display:grid;grid-template-columns:1fr 66px 128px 96px 28px;gap:8px;align-items:center;padding:8px 6px;border-bottom:1px solid var(--line);}',
      '.wb-row.rest{background:rgba(212,165,55,.1);}',
      '.wb-ex{display:flex;align-items:center;gap:10px;min-width:0;}',
      '.wb-ex-thumb{width:40px;height:40px;border-radius:7px;object-fit:cover;background:#eef1f4;flex:0 0 auto;}',
      '.wb-ex-name{font:700 13px/1.25 system-ui;color:#2f6f8f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.wb-row.rest .wb-ex-name{color:#a1751f;}',
      '.wb-restic{width:40px;height:40px;border-radius:7px;background:var(--gold);display:grid;place-items:center;flex:0 0 auto;}',
      '.wb-in{width:100%;border:1px solid var(--line);border-radius:7px;padding:7px 8px;font:600 13px/1 system-ui;background:#fff;}',
      '.wb-in:focus{outline:0;border-color:var(--gold);}',
      '.wb-sets{display:flex;align-items:center;gap:4px;}',
      '.wb-target{display:flex;flex-direction:column;gap:4px;}',
      '.wb-mini{font:600 12px/1;}',
      '.wb-del{border:0;background:transparent;color:#cbd5e1;font-size:17px;cursor:pointer;}',
      '.wb-del:hover{color:#ef4444;}',
      '.wb-handle{cursor:grab;color:#cbd5e1;font-size:15px;text-align:center;}',
      // library
      '.wb-search-wrap{padding:12px 16px;border-bottom:1px solid var(--line);}',
      '.wb-search{width:100%;border:1px solid var(--line);border-radius:9px;padding:10px 12px;font:500 13px/1 system-ui;}',
      '.wb-search:focus{outline:0;border-color:var(--gold);}',
      '.wb-grid{flex:1 1 auto;overflow:auto;min-height:0;padding:14px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px;align-content:start;}',
      '.wb-card{border:0;background:transparent;padding:0;cursor:grab;text-align:center;}',
      '.wb-card-img{position:relative;width:100%;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#eef1f4;box-shadow:0 1px 3px rgba(0,0,0,.08);}',
      '.wb-card-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .35s ease;}',
      '.wb-card-img .f1{opacity:0;}',
      '.wb-card:hover .wb-card-img .f0{opacity:0;} .wb-card:hover .wb-card-img .f1{opacity:1;}',
      '.wb-card-name{margin-top:6px;font:600 12px/1.3 system-ui;color:#2f6f8f;}',
      '.wb-more{grid-column:1/-1;text-align:center;padding:10px;}',
      '.wb-more button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:9px 18px;font:700 12px/1 system-ui;cursor:pointer;color:#475569;}',
      '.wb-dragging{opacity:.5;}',
      '@media (max-width:820px){.wb-body{grid-template-columns:1fr;}.wb-left{border-right:0;border-bottom:1px solid var(--line);}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function WorkoutBuilder(root, opts) {
    opts = opts || {};
    var allExercises = (opts.exercises || []).filter(function (e) { return e && e.name; });
    var onSave = typeof opts.onSave === 'function' ? opts.onSave : null;
    var state = {
      name: opts.name || 'New workout',
      instructions: opts.instructions || '',
      activeDay: 'Monday',
      days: {}, // day -> [ {id, kind:'exercise'|'rest', name, exerciseId, img, sets, targetType, target, rest} ]
      q: '',
      shown: PAGE
    };
    DAYS.forEach(function (d) { state.days[d] = []; });
    // Preload any existing plan
    if (opts.plan && opts.plan.days) {
      DAYS.forEach(function (d) { if (Array.isArray(opts.plan.days[d])) state.days[d] = opts.plan.days[d]; });
    }

    function filtered() {
      var q = state.q.trim().toLowerCase();
      if (!q) return allExercises;
      return allExercises.filter(function (e) {
        return String(e.name).toLowerCase().indexOf(q) >= 0
          || String(e.primary || '').toLowerCase().indexOf(q) >= 0
          || (e.equipment || []).join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }

    function addExerciseToDay(ex, day) {
      state.days[day].push({
        id: uid(), kind: 'exercise', name: ex.name, exerciseId: ex.name,
        img0: imgPath(ex, 0), img1: imgPath(ex, 1),
        sets: 3, targetType: 'text', target: '', rest: '90 sec'
      });
      render();
    }
    function addRest(day) {
      state.days[day].push({ id: uid(), kind: 'rest', name: 'Rest', sets: '', targetType: 'text', target: '', rest: '90 sec' });
      render();
    }

    function rowHtml(item) {
      if (item.kind === 'rest') {
        return '<div class="wb-row rest" data-id="' + item.id + '">'
          + '<div class="wb-ex"><div class="wb-restic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1206" stroke-width="2" stroke-linecap="round"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/></svg></div><div class="wb-ex-name">Rest</div></div>'
          + '<div></div>'
          + '<div></div>'
          + '<div><select class="wb-in wb-mini" data-f="rest">' + REST_OPTIONS.map(function (o) { return '<option' + (o === item.rest ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>'
          + '<button class="wb-del" data-del="' + item.id + '" title="Remove">&times;</button>'
          + '</div>';
      }
      return '<div class="wb-row" data-id="' + item.id + '" draggable="true">'
        + '<div class="wb-ex"><img class="wb-ex-thumb" src="' + esc(item.img0) + '" alt="" onerror="this.style.visibility=\'hidden\'"><div class="wb-ex-name" title="' + esc(item.name) + '">' + esc(item.name) + '</div></div>'
        + '<div class="wb-sets"><input class="wb-in" type="number" min="1" value="' + esc(item.sets) + '" data-f="sets" style="width:46px;"> </div>'
        + '<div class="wb-target"><select class="wb-in wb-mini" data-f="targetType"><option value="text"' + (item.targetType === 'text' ? ' selected' : '') + '>reps/weight</option><option value="time"' + (item.targetType === 'time' ? ' selected' : '') + '>time</option></select>'
        + '<input class="wb-in wb-mini" value="' + esc(item.target) + '" data-f="target" placeholder="' + (item.targetType === 'time' ? '30s, 1 min…' : 'reps, weight, tempo…') + '"></div>'
        + '<div><select class="wb-in wb-mini" data-f="rest">' + REST_OPTIONS.map(function (o) { return '<option' + (o === item.rest ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>'
        + '<button class="wb-del" data-del="' + item.id + '" title="Remove">&times;</button>'
        + '</div>';
    }

    function cardHtml(ex, i) {
      return '<button class="wb-card" draggable="true" data-ex="' + i + '" title="Drag to a day or click to add">'
        + '<span class="wb-card-img"><img class="f0" loading="lazy" src="' + esc(imgPath(ex, 0)) + '" alt="" onerror="this.style.visibility=\'hidden\'"><img class="f1" loading="lazy" src="' + esc(imgPath(ex, 1)) + '" alt="" onerror="this.style.display=\'none\'"></span>'
        + '<span class="wb-card-name">' + esc(ex.name) + '</span>'
        + '</button>';
    }

    function render() {
      var list = filtered();
      var visible = list.slice(0, state.shown);
      var dayItems = state.days[state.activeDay] || [];
      root.innerHTML = ''
        + '<div class="wb">'
        + '<div class="wb-top"><span class="wb-kicker">Workout</span>'
        + '<input class="wb-name" value="' + esc(state.name) + '" id="wb-name">'
        + '<span class="wb-status" id="wb-status"></span>'
        + '<button class="wb-save" id="wb-save">SAVE</button>'
        + '<button class="wb-x" id="wb-x" title="Close">&times;</button></div>'
        + '<div class="wb-body">'
        // LEFT
        + '<div class="wb-left">'
        + '<div class="wb-instr"><label>Instructions <span style="font-weight:500;color:#94a3b8;">(optional)</span></label>'
        + '<textarea id="wb-instr" placeholder="A short summary or cues for this workout…">' + esc(state.instructions) + '</textarea></div>'
        + '<div class="wb-days" id="wb-days">' + DAYS.map(function (d) {
          var n = (state.days[d] || []).length;
          return '<button class="wb-day' + (d === state.activeDay ? ' is-active' : '') + '" data-day="' + d + '">' + d + (n ? '<span class="wb-day-count">' + n + '</span>' : '') + '</button>';
        }).join('') + '</div>'
        + '<div class="wb-tools"><button class="wb-tool" data-tool="superset">SUPERSET</button><button class="wb-tool" data-tool="circuit">CIRCUIT</button><button class="wb-tool rest" data-tool="rest">＋ ADD REST</button></div>'
        + '<div class="wb-rows" id="wb-rows" data-day="' + state.activeDay + '">'
        + '<div class="wb-colhead"><span>Exercise</span><span>Sets</span><span>Target</span><span>Rest</span><span></span></div>'
        + (dayItems.length ? dayItems.map(rowHtml).join('') : '<div class="wb-empty" id="wb-empty">Drag &amp; drop exercises here for <b>' + state.activeDay + '</b><br><span style="font-size:12px;">(or click one on the right)</span></div>')
        + '</div>'
        + '</div>'
        // RIGHT
        + '<div class="wb-right">'
        + '<div class="wb-search-wrap"><input class="wb-search" id="wb-search" placeholder="Search ' + allExercises.length + ' exercises…" value="' + esc(state.q) + '"></div>'
        + '<div class="wb-grid" id="wb-grid">'
        + visible.map(function (ex) { return cardHtml(ex, allExercises.indexOf(ex)); }).join('')
        + (list.length > state.shown ? '<div class="wb-more"><button id="wb-more">Load more (' + (list.length - state.shown) + ')</button></div>' : '')
        + '</div>'
        + '</div>'
        + '</div></div>';
      wire();
    }

    function currentDayEl() { return root.querySelector('#wb-rows'); }

    function wire() {
      var nameEl = root.querySelector('#wb-name');
      nameEl.addEventListener('input', function () { state.name = nameEl.value; });
      root.querySelector('#wb-instr').addEventListener('input', function (e) { state.instructions = e.target.value; });
      root.querySelector('#wb-x').addEventListener('click', function () { if (opts.onClose) opts.onClose(); });
      root.querySelector('#wb-save').addEventListener('click', doSave);
      // day tabs
      root.querySelector('#wb-days').addEventListener('click', function (e) {
        var b = e.target.closest('[data-day]'); if (!b) return;
        state.activeDay = b.getAttribute('data-day'); state.shown = state.shown; render();
      });
      // tools
      root.querySelector('.wb-tools').addEventListener('click', function (e) {
        var b = e.target.closest('[data-tool]'); if (!b) return;
        var t = b.getAttribute('data-tool');
        if (t === 'rest') addRest(state.activeDay);
        else setStatus('', t.charAt(0).toUpperCase() + t.slice(1) + ' grouping is coming next.');
      });
      // search
      var search = root.querySelector('#wb-search');
      search.addEventListener('input', function () { state.q = search.value; state.shown = PAGE; renderGridOnly(); });
      var more = root.querySelector('#wb-more');
      if (more) more.addEventListener('click', function () { state.shown += PAGE; renderGridOnly(); });
      // row field edits + delete (delegated)
      var rows = currentDayEl();
      rows.addEventListener('input', function (e) {
        var f = e.target.getAttribute('data-f'); if (!f) return;
        var id = e.target.closest('[data-id]').getAttribute('data-id');
        var item = state.days[state.activeDay].find(function (x) { return x.id === id; });
        if (!item) return;
        item[f] = e.target.value;
        if (f === 'targetType') render();
      });
      rows.addEventListener('change', function (e) {
        var f = e.target.getAttribute('data-f'); if (!f) return;
        var id = e.target.closest('[data-id]').getAttribute('data-id');
        var item = state.days[state.activeDay].find(function (x) { return x.id === id; });
        if (item) item[f] = e.target.value;
      });
      rows.addEventListener('click', function (e) {
        var d = e.target.closest('[data-del]'); if (!d) return;
        var id = d.getAttribute('data-del');
        state.days[state.activeDay] = state.days[state.activeDay].filter(function (x) { return x.id !== id; });
        render();
      });
      wireDragDrop();
    }

    function renderGridOnly() {
      var grid = root.querySelector('#wb-grid'); if (!grid) return render();
      var list = filtered();
      var visible = list.slice(0, state.shown);
      grid.innerHTML = visible.map(function (ex) { return cardHtml(ex, allExercises.indexOf(ex)); }).join('')
        + (list.length > state.shown ? '<div class="wb-more"><button id="wb-more">Load more (' + (list.length - state.shown) + ')</button></div>' : '');
      var more = grid.querySelector('#wb-more');
      if (more) more.addEventListener('click', function () { state.shown += PAGE; renderGridOnly(); });
    }

    function wireDragDrop() {
      // dragging a library card
      var grid = root.querySelector('#wb-grid');
      grid.addEventListener('dragstart', function (e) {
        var card = e.target.closest('[data-ex]'); if (!card) return;
        e.dataTransfer.setData('text/plain', 'lib:' + card.getAttribute('data-ex'));
        card.classList.add('wb-dragging');
      });
      grid.addEventListener('dragend', function (e) {
        var card = e.target.closest('[data-ex]'); if (card) card.classList.remove('wb-dragging');
      });
      grid.addEventListener('click', function (e) {
        var card = e.target.closest('[data-ex]'); if (!card) return;
        e.preventDefault();
        addExerciseToDay(allExercises[Number(card.getAttribute('data-ex'))], state.activeDay);
      });
      // drop targets: the rows area (current day) + each day tab
      var rows = currentDayEl();
      function over(e) { e.preventDefault(); }
      rows.addEventListener('dragover', over);
      rows.addEventListener('dragenter', function () { var em = root.querySelector('#wb-empty'); if (em) em.classList.add('is-drop'); });
      rows.addEventListener('dragleave', function () { var em = root.querySelector('#wb-empty'); if (em) em.classList.remove('is-drop'); });
      rows.addEventListener('drop', function (e) {
        e.preventDefault();
        var data = e.dataTransfer.getData('text/plain') || '';
        if (data.indexOf('lib:') === 0) addExerciseToDay(allExercises[Number(data.slice(4))], state.activeDay);
      });
      // day tabs as drop targets (drop onto a specific day)
      root.querySelectorAll('.wb-day').forEach(function (tab) {
        tab.addEventListener('dragover', function (e) { e.preventDefault(); tab.classList.add('is-drop'); });
        tab.addEventListener('dragleave', function () { tab.classList.remove('is-drop'); });
        tab.addEventListener('drop', function (e) {
          e.preventDefault(); tab.classList.remove('is-drop');
          var data = e.dataTransfer.getData('text/plain') || '';
          var day = tab.getAttribute('data-day');
          if (data.indexOf('lib:') === 0) { addExerciseToDay(allExercises[Number(data.slice(4))], day); }
        });
      });
    }

    function setStatus(kind, text) {
      var el = root.querySelector('#wb-status'); if (!el) return;
      el.className = 'wb-status ' + (kind || '');
      el.textContent = text || '';
    }

    function assemble() {
      var out = { name: state.name || 'Workout', instructions: state.instructions || '', days: {} };
      DAYS.forEach(function (d) {
        out.days[d] = (state.days[d] || []).map(function (it) {
          return {
            kind: it.kind, name: it.name, exerciseId: it.exerciseId || null,
            sets: it.sets, targetType: it.targetType, target: it.target, rest: it.rest
          };
        });
      });
      return out;
    }

    function doSave() {
      var plan = assemble();
      var total = DAYS.reduce(function (n, d) { return n + plan.days[d].length; }, 0);
      if (!total) { setStatus('bad', 'Add at least one exercise first.'); return; }
      try { localStorage.setItem('ode_manual_workout_v1', JSON.stringify(plan)); } catch (e) {}
      setStatus('ok', 'Saving…');
      if (onSave) {
        Promise.resolve(onSave(plan)).then(function (r) {
          setStatus(r && r.ok === false ? 'bad' : 'ok', r && r.message ? r.message : 'Saved to your profile.');
        }).catch(function () { setStatus('ok', 'Saved locally.'); });
      } else {
        setStatus('ok', 'Saved.');
      }
    }

    injectStyles();
    render();
    return { getPlan: assemble, save: doSave };
  }

  window.RiseWorkoutBuilder = {
    mount: function (rootEl, opts) {
      if (!rootEl) return null;
      return WorkoutBuilder(rootEl, opts || {});
    }
  };
})();
