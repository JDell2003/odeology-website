/* RiseForIt manual workout builder (Trainerize-style, desktop-first).
   Mounted via window.RiseWorkoutBuilder.mount(rootEl, { exercises, onSave }).
   Left pane: day tabs + the workout being built (editable exercise rows).
   Right pane: exercise library grid (ALL exercises, A→Z), search + filters;
   each card shows a before/after image box that animates on hover; drag a card
   onto a day (or click) to add it — a toast confirms the add. */
(function () {
  'use strict';

  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var REST_OPTIONS = ['30 sec', '45 sec', '60 sec', '90 sec', '2 min', '3 min', '5 min'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid() { return 'x' + Math.random().toString(36).slice(2, 9); }
  function imgPath(ex, i) {
    var arr = ex && Array.isArray(ex.images) ? ex.images : [];
    var p = arr[i];
    return p ? ('/' + String(p).replace(/^\/+/, '')) : '';
  }
  function titleCase(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function injectStyles() {
    if (document.getElementById('wb-styles')) return;
    var s = document.createElement('style');
    s.id = 'wb-styles';
    s.textContent = [
      '.wb{--gold:#d4a537;--ink:#1f2937;--line:rgba(15,23,42,.12);display:flex;flex-direction:column;height:100vh;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);}',
      '.wb *{box-sizing:border-box;}',
      // slim light top strip (no black bar): just Save + close
      '.wb-bar{position:relative;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:10px 18px;border-bottom:1px solid var(--line);flex:0 0 auto;background:#fff;}',
      '.wb-save{background:#2f6f8f;border:0;color:#fff;font:800 13px/1 system-ui;padding:10px 22px;border-radius:9px;cursor:pointer;}',
      '.wb-save:hover{filter:brightness(1.08);}',
      '.wb-x{background:#fff;border:1px solid var(--line);color:#475569;width:34px;height:34px;border-radius:9px;font-size:19px;cursor:pointer;line-height:1;}',
      '.wb-body{display:grid;grid-template-columns:minmax(360px,1fr) minmax(440px,1.2fr);flex:1 1 auto;min-height:0;}',
      '.wb-left{border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;}',
      '.wb-right{display:flex;flex-direction:column;min-height:0;background:#fbfbfc;}',
      // day tabs
      '.wb-days{display:flex;gap:6px;flex-wrap:wrap;padding:14px 18px 6px;}',
      '.wb-day{border:1px solid var(--line);background:#f1f3f5;color:#475569;border-radius:8px;padding:8px 14px;font:700 12px/1 system-ui;cursor:pointer;}',
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
      '.wb-colhead{display:grid;grid-template-columns:1fr 60px 178px 92px 26px;gap:8px;padding:10px 6px 6px;font:700 11px/1 system-ui;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8;}',
      '.wb-empty{border:2px dashed var(--line);border-radius:14px;padding:44px 20px;text-align:center;color:#94a3b8;font:600 13px/1.5 system-ui;margin:12px 6px;}',
      '.wb-empty.is-drop{border-color:var(--gold);background:rgba(212,165,55,.06);}',
      '.wb-row{display:grid;grid-template-columns:1fr 60px 178px 92px 26px;gap:8px;align-items:center;padding:8px 6px;border-bottom:1px solid var(--line);}',
      '.wb-row.rest{background:rgba(212,165,55,.1);}',
      '.wb-ex{display:flex;align-items:center;gap:10px;min-width:0;}',
      '.wb-ex-thumb{width:44px;height:44px;border-radius:8px;object-fit:cover;background:#eef1f4;border:1px solid var(--line);flex:0 0 auto;}',
      '.wb-ex-name{font:700 13px/1.25 system-ui;color:#2f6f8f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.wb-row.rest .wb-ex-name{color:#a1751f;}',
      '.wb-restic{width:44px;height:44px;border-radius:8px;background:var(--gold);display:grid;place-items:center;flex:0 0 auto;}',
      '.wb-in{width:100%;border:1px solid var(--line);border-radius:7px;padding:8px;font:600 13px/1 system-ui;background:#fff;}',
      '.wb-in:focus{outline:0;border-color:var(--gold);}',
      // inline target (dropdown + value side by side)
      '.wb-target{display:flex;gap:6px;align-items:center;}',
      '.wb-target select{flex:0 0 92px;} .wb-target input{flex:1 1 auto;min-width:0;}',
      // center the Sets / Target / Rest columns + their headers for a tidy look
      '.wb-colhead span:not(:first-child){text-align:center;}',
      '.wb-row input[type=number].wb-in{text-align:center;}',
      '.wb-row select.wb-in{text-align:center;text-align-last:center;}',
      '.wb-target input[data-f=target]{text-align:center;}',
      // Clear button + its popup
      '.wb-clear{background:#fff;border:1px solid var(--line);color:#475569;font:700 13px/1 system-ui;padding:10px 16px;border-radius:9px;cursor:pointer;margin-right:auto;}',
      '.wb-clear:hover{background:#f8fafc;}',
      '.wb-clear-pop{position:absolute;top:calc(100% + 4px);left:18px;z-index:60;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 44px rgba(15,23,42,.2);padding:8px;display:grid;gap:4px;min-width:230px;}',
      '.wb-clear-pop[hidden]{display:none;}',
      '.wb-clear-pop-title{font:700 11px/1.4 system-ui;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8;padding:6px 10px 2px;}',
      '.wb-clear-opt{display:block;width:100%;text-align:left;border:0;background:#fff;border-radius:8px;padding:10px 12px;font:600 13px/1.3 system-ui;color:#33465c;cursor:pointer;}',
      '.wb-clear-opt:hover{background:#f1f5f9;} .wb-clear-opt.danger{color:#b91c1c;} .wb-clear-opt.danger:hover{background:rgba(220,38,38,.08);}',
      '.wb-del{border:0;background:transparent;color:#cbd5e1;font-size:18px;cursor:pointer;}',
      '.wb-del:hover{color:#ef4444;}',
      // library
      '.wb-search-wrap{padding:14px 16px 8px;border-bottom:0;}',
      '.wb-search{width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 13px;font:500 14px/1 system-ui;}',
      '.wb-search:focus{outline:0;border-color:var(--gold);}',
      '.wb-filters{display:flex;gap:8px;flex-wrap:wrap;padding:0 16px 12px;border-bottom:1px solid var(--line);}',
      '.wb-filter{border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 11px;font:600 12.5px/1 system-ui;color:#475569;}',
      '.wb-filter:focus{outline:0;border-color:var(--gold);}',
      '.wb-count{font:700 11px/1 system-ui;color:#94a3b8;padding:0 4px;align-self:center;}',
      '.wb-grid{flex:1 1 auto;overflow:auto;min-height:0;padding:14px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px;align-content:start;}',
      // card — flex column so it fills the grid cell and the image box gets full width
      '.wb-card{display:flex;flex-direction:column;gap:6px;width:100%;border:0;background:transparent;padding:0;cursor:grab;text-align:center;}',
      '.wb-card-img{position:relative;width:100%;aspect-ratio:1/1;border-radius:11px;overflow:hidden;background:#eef1f4;border:1px solid var(--line);box-shadow:0 1px 3px rgba(0,0,0,.06);}',
      '.wb-card-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .3s ease;}',
      '.wb-card-img .f1{opacity:0;}',
      '.wb-card:hover .wb-card-img{box-shadow:0 4px 12px rgba(0,0,0,.14);}',
      // continuous back-and-forth fade between the before (f0) and after (f1) pose
      '@keyframes wbFlip{0%{opacity:0}45%{opacity:0}55%{opacity:1}100%{opacity:1}}',
      '.wb-card:hover .wb-card-img .f1{animation:wbFlip 1.5s ease-in-out infinite alternate;}',
      '.wb-card-badge{position:absolute;top:6px;left:6px;background:rgba(31,41,55,.72);color:#fff;font:700 9px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;padding:3px 6px;border-radius:6px;opacity:0;transition:opacity .2s;}',
      '.wb-card:hover .wb-card-badge{opacity:1;}',
      '.wb-card-name{font:600 12px/1.3 system-ui;color:#2f6f8f;}',
      '.wb-dragging{opacity:.5;}',
      // toast
      '.wb-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(12px);z-index:9999;display:flex;align-items:center;gap:10px;background:#1f2937;color:#fff;font:700 13px/1.3 system-ui;padding:11px 16px;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.3);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;max-width:90vw;}',
      '.wb-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}',
      '.wb-toast .dot{width:20px;height:20px;border-radius:6px;object-fit:cover;background:var(--gold);flex:0 0 auto;}',
      // mobile
      '.wb-mtabs{display:none;}',
      '@media (max-width:820px){',
      '  .wb{height:100dvh;}',
      '  .wb-bar{position:sticky;top:0;z-index:20;}',
      '  .wb-mtabs{display:flex;gap:6px;padding:8px 12px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:53px;z-index:15;}',
      '  .wb-mtab{flex:1;border:1px solid var(--line);background:#f1f3f5;border-radius:9px;padding:11px;font:800 13px/1 system-ui;color:#475569;cursor:pointer;}',
      '  .wb-mtab.is-active{background:var(--ink);color:#fff;border-color:var(--ink);}',
      '  .wb-body{display:block;overflow:auto;-webkit-overflow-scrolling:touch;}',
      '  .wb-left,.wb-right{border:0;min-height:0;}',
      '  .wb-rows,.wb-grid{overflow:visible;}',
      '  .wb-days{overflow-x:auto;flex-wrap:nowrap;} .wb-day{flex:0 0 auto;}',
      '  .wb-grid{grid-template-columns:repeat(3,1fr);gap:12px;}',
      '  body.wb-m-lib .wb-left{display:none;} body.wb-m-lib .wb-right{display:flex;}',
      '  body.wb-m-work .wb-right{display:none;} body.wb-m-work .wb-left{display:flex;}',
      '  .wb-colhead,.wb-row{grid-template-columns:1fr 50px 150px 78px 24px;gap:6px;}',
      '  .wb-target select{flex:0 0 74px;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function WorkoutBuilder(root, opts) {
    opts = opts || {};
    var allExercises = (opts.exercises || []).filter(function (e) { return e && e.name; })
      .slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var onSave = typeof opts.onSave === 'function' ? opts.onSave : null;

    // filter option lists
    var bodyParts = Array.from(new Set(allExercises.map(function (e) { return String(e.primary || '').trim(); }).filter(Boolean))).sort();
    var equipments = Array.from(new Set([].concat.apply([], allExercises.map(function (e) { return Array.isArray(e.equipment) ? e.equipment : []; })).map(function (x) { return String(x || '').trim(); }).filter(Boolean))).sort();

    var state = {
      activeDay: 'Monday',
      days: {},
      q: '', bodyPart: '', equip: ''
    };
    DAYS.forEach(function (d) { state.days[d] = []; });
    if (opts.plan && opts.plan.days) {
      DAYS.forEach(function (d) { if (Array.isArray(opts.plan.days[d])) state.days[d] = opts.plan.days[d]; });
    }

    function filtered() {
      var q = state.q.trim().toLowerCase();
      return allExercises.filter(function (e) {
        if (state.bodyPart && String(e.primary || '') !== state.bodyPart) return false;
        if (state.equip && !(Array.isArray(e.equipment) ? e.equipment : []).some(function (x) { return String(x) === state.equip; })) return false;
        if (!q) return true;
        return String(e.name).toLowerCase().indexOf(q) >= 0
          || String(e.primary || '').toLowerCase().indexOf(q) >= 0
          || (e.equipment || []).join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }

    var toastTimer = null;
    function toast(ex, day) {
      var t = document.getElementById('wb-toast');
      if (!t) { t = document.createElement('div'); t.id = 'wb-toast'; t.className = 'wb-toast'; document.body.appendChild(t); }
      var img = imgPath(ex, 0);
      t.innerHTML = (img ? '<img class="dot" src="' + esc(img) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '<span class="dot"></span>')
        + '<span>Added <b>' + esc(ex.name) + '</b> to ' + esc(day) + '</span>';
      t.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1600);
    }

    function addExerciseToDay(ex, day, quiet) {
      state.days[day].push({
        id: uid(), kind: 'exercise', name: ex.name, exerciseId: ex.name,
        img0: imgPath(ex, 0), img1: imgPath(ex, 1),
        sets: 3, targetType: 'text', target: '', rest: '90 sec'
      });
      if (!quiet) toast(ex, day);
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
          + '<div></div><div></div>'
          + '<div><select class="wb-in" data-f="rest">' + REST_OPTIONS.map(function (o) { return '<option' + (o === item.rest ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>'
          + '<button class="wb-del" data-del="' + item.id + '" title="Remove">&times;</button></div>';
      }
      return '<div class="wb-row" data-id="' + item.id + '" draggable="true">'
        + '<div class="wb-ex"><img class="wb-ex-thumb" src="' + esc(item.img0) + '" alt="" onerror="this.style.visibility=\'hidden\'"><div class="wb-ex-name" title="' + esc(item.name) + '">' + esc(item.name) + '</div></div>'
        + '<div><input class="wb-in" type="number" min="1" value="' + esc(item.sets) + '" data-f="sets"></div>'
        + '<div class="wb-target"><select class="wb-in" data-f="targetType"><option value="text"' + (item.targetType === 'text' ? ' selected' : '') + '>reps/weight</option><option value="time"' + (item.targetType === 'time' ? ' selected' : '') + '>time</option></select>'
        + '<input class="wb-in" value="' + esc(item.target) + '" data-f="target" placeholder="' + (item.targetType === 'time' ? '30s, 1 min…' : 'reps, weight…') + '"></div>'
        + '<div><select class="wb-in" data-f="rest">' + REST_OPTIONS.map(function (o) { return '<option' + (o === item.rest ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>'
        + '<button class="wb-del" data-del="' + item.id + '" title="Remove">&times;</button></div>';
    }

    function cardHtml(ex, idx) {
      var b = imgPath(ex, 0), a = imgPath(ex, 1);
      return '<button class="wb-card" draggable="true" data-ex="' + idx + '" title="Drag to a day or click to add">'
        + '<span class="wb-card-img">'
        + (b ? '<img class="f0" loading="lazy" src="' + esc(b) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '')
        + (a ? '<img class="f1" loading="lazy" src="' + esc(a) + '" alt="" onerror="this.style.display=\'none\'">' : '')
        + '<span class="wb-card-badge">Hover</span>'
        + '</span>'
        + '<span class="wb-card-name">' + esc(ex.name) + '</span></button>';
    }

    function libHtml() {
      var list = filtered();
      return '<div class="wb-search-wrap"><input class="wb-search" id="wb-search" placeholder="Search ' + allExercises.length + ' exercises…" value="' + esc(state.q) + '"></div>'
        + '<div class="wb-filters">'
        + '<select class="wb-filter" id="wb-f-body"><option value="">All body parts</option>' + bodyParts.map(function (m) { return '<option value="' + esc(m) + '"' + (m === state.bodyPart ? ' selected' : '') + '>' + esc(titleCase(m)) + '</option>'; }).join('') + '</select>'
        + '<select class="wb-filter" id="wb-f-equip"><option value="">All equipment</option>' + equipments.map(function (m) { return '<option value="' + esc(m) + '"' + (m === state.equip ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select>'
        + ((state.bodyPart || state.equip || state.q) ? '<button class="wb-filter" id="wb-f-clear">Clear</button>' : '')
        + '<span class="wb-count">' + list.length + ' shown</span>'
        + '</div>'
        + '<div class="wb-grid" id="wb-grid">' + list.map(function (ex) { return cardHtml(ex, allExercises.indexOf(ex)); }).join('') + '</div>';
    }

    function render() {
      var dayItems = state.days[state.activeDay] || [];
      root.innerHTML = ''
        + '<div class="wb">'
        + '<div class="wb-bar">'
        + '<button class="wb-clear" id="wb-clear">Clear</button>'
        + '<div class="wb-clear-pop" id="wb-clear-pop" hidden>'
        + '<div class="wb-clear-pop-title">Clear which?</div>'
        + '<button class="wb-clear-opt" data-clear="day">Clear <b>' + state.activeDay + '</b> only</button>'
        + '<button class="wb-clear-opt danger" data-clear="all">Clear the entire workout</button>'
        + '<button class="wb-clear-opt" data-clear="cancel" style="color:#94a3b8;">Cancel</button>'
        + '</div>'
        + '<button class="wb-save" id="wb-save">SAVE</button><button class="wb-x" id="wb-x" title="Close">&times;</button></div>'
        + '<div class="wb-mtabs"><button class="wb-mtab" data-mtab="work">Workout</button><button class="wb-mtab" data-mtab="lib">Exercises</button></div>'
        + '<div class="wb-body">'
        + '<div class="wb-left">'
        + '<div class="wb-days" id="wb-days">' + DAYS.map(function (d) {
          var n = (state.days[d] || []).length;
          return '<button class="wb-day' + (d === state.activeDay ? ' is-active' : '') + '" data-day="' + d + '">' + d + (n ? '<span class="wb-day-count">' + n + '</span>' : '') + '</button>';
        }).join('') + '</div>'
        + '<div class="wb-tools"><button class="wb-tool" data-tool="superset">SUPERSET</button><button class="wb-tool" data-tool="circuit">CIRCUIT</button><button class="wb-tool rest" data-tool="rest">＋ ADD REST</button></div>'
        + '<div class="wb-rows" id="wb-rows">'
        + '<div class="wb-colhead"><span>Exercise</span><span>Sets</span><span>Target</span><span>Rest</span><span></span></div>'
        + (dayItems.length ? dayItems.map(rowHtml).join('') : '<div class="wb-empty" id="wb-empty">Drag exercises here for <b>' + state.activeDay + '</b><br><span style="font-size:12px;">(or tap one on the right)</span></div>')
        + '</div>'
        + '</div>'
        + '<div class="wb-right" id="wb-right">' + libHtml() + '</div>'
        + '</div></div>';
      wire();
    }

    function renderLibOnly() {
      var right = root.querySelector('#wb-right'); if (!right) return render();
      // keep search focus/caret
      var active = document.activeElement;
      var keepSearch = active && active.id === 'wb-search';
      var caret = keepSearch ? active.selectionStart : null;
      right.innerHTML = libHtml();
      wireLib();
      if (keepSearch) { var si = root.querySelector('#wb-search'); if (si) { si.focus(); try { si.setSelectionRange(caret, caret); } catch (e) {} } }
    }

    function wireLib() {
      var search = root.querySelector('#wb-search');
      if (search) search.addEventListener('input', function () { state.q = search.value; renderLibOnly(); });
      var fb = root.querySelector('#wb-f-body');
      if (fb) fb.addEventListener('change', function () { state.bodyPart = fb.value; renderLibOnly(); });
      var fe = root.querySelector('#wb-f-equip');
      if (fe) fe.addEventListener('change', function () { state.equip = fe.value; renderLibOnly(); });
      var fc = root.querySelector('#wb-f-clear');
      if (fc) fc.addEventListener('click', function () { state.q = ''; state.bodyPart = ''; state.equip = ''; renderLibOnly(); });
      var grid = root.querySelector('#wb-grid');
      if (grid) {
        grid.addEventListener('click', function (e) {
          var card = e.target.closest('[data-ex]'); if (!card) return;
          e.preventDefault();
          addExerciseToDay(allExercises[Number(card.getAttribute('data-ex'))], state.activeDay);
        });
        grid.addEventListener('dragstart', function (e) {
          var card = e.target.closest('[data-ex]'); if (!card) return;
          e.dataTransfer.setData('text/plain', 'lib:' + card.getAttribute('data-ex'));
          card.classList.add('wb-dragging');
        });
        grid.addEventListener('dragend', function (e) { var c = e.target.closest('[data-ex]'); if (c) c.classList.remove('wb-dragging'); });
      }
    }

    function wire() {
      // mobile toggle
      if (!document.body.classList.contains('wb-m-work') && !document.body.classList.contains('wb-m-lib')) document.body.classList.add('wb-m-work');
      var mtabs = root.querySelector('.wb-mtabs');
      if (mtabs) {
        var cur = document.body.classList.contains('wb-m-lib') ? 'lib' : 'work';
        mtabs.querySelectorAll('.wb-mtab').forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-mtab') === cur); });
        mtabs.addEventListener('click', function (e) {
          var b = e.target.closest('[data-mtab]'); if (!b) return;
          var m = b.getAttribute('data-mtab');
          document.body.classList.toggle('wb-m-lib', m === 'lib');
          document.body.classList.toggle('wb-m-work', m === 'work');
          mtabs.querySelectorAll('.wb-mtab').forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-mtab') === m); });
        });
      }
      root.querySelector('#wb-x').addEventListener('click', function () { if (opts.onClose) opts.onClose(); });
      root.querySelector('#wb-save').addEventListener('click', doSave);
      // Clear button -> popup (this day / entire workout)
      var clearBtn = root.querySelector('#wb-clear');
      var clearPop = root.querySelector('#wb-clear-pop');
      if (clearBtn && clearPop) {
        clearBtn.addEventListener('click', function (e) { e.stopPropagation(); clearPop.hidden = !clearPop.hidden; });
        document.addEventListener('click', function (e) { if (!clearPop.hidden && !clearPop.contains(e.target) && e.target !== clearBtn) clearPop.hidden = true; });
        clearPop.addEventListener('click', function (e) {
          var opt = e.target.closest('[data-clear]'); if (!opt) return;
          var which = opt.getAttribute('data-clear');
          if (which === 'day') { state.days[state.activeDay] = []; render(); }
          else if (which === 'all') { DAYS.forEach(function (d) { state.days[d] = []; }); render(); }
          else { clearPop.hidden = true; }
        });
      }
      root.querySelector('#wb-days').addEventListener('click', function (e) {
        var b = e.target.closest('[data-day]'); if (!b) return;
        state.activeDay = b.getAttribute('data-day'); render();
      });
      root.querySelector('.wb-tools').addEventListener('click', function (e) {
        var b = e.target.closest('[data-tool]'); if (!b) return;
        var t = b.getAttribute('data-tool');
        if (t === 'rest') addRest(state.activeDay);
      });
      // row edits + delete
      var rows = root.querySelector('#wb-rows');
      rows.addEventListener('input', function (e) {
        var f = e.target.getAttribute('data-f'); if (!f) return;
        var item = state.days[state.activeDay].find(function (x) { return x.id === e.target.closest('[data-id]').getAttribute('data-id'); });
        if (!item) return; item[f] = e.target.value; if (f === 'targetType') render();
      });
      rows.addEventListener('change', function (e) {
        var f = e.target.getAttribute('data-f'); if (!f) return;
        var item = state.days[state.activeDay].find(function (x) { return x.id === e.target.closest('[data-id]').getAttribute('data-id'); });
        if (item) item[f] = e.target.value;
      });
      rows.addEventListener('click', function (e) {
        var d = e.target.closest('[data-del]'); if (!d) return;
        state.days[state.activeDay] = state.days[state.activeDay].filter(function (x) { return x.id !== d.getAttribute('data-del'); });
        render();
      });
      wireDragDrop();
      wireLib();
    }

    function wireDragDrop() {
      var rows = root.querySelector('#wb-rows');
      rows.addEventListener('dragover', function (e) { e.preventDefault(); });
      rows.addEventListener('dragenter', function () { var em = root.querySelector('#wb-empty'); if (em) em.classList.add('is-drop'); });
      rows.addEventListener('dragleave', function () { var em = root.querySelector('#wb-empty'); if (em) em.classList.remove('is-drop'); });
      rows.addEventListener('dragstart', function (e) {
        var row = e.target.closest('.wb-row'); if (!row) return;
        e.dataTransfer.setData('text/plain', 'row:' + row.getAttribute('data-id'));
        row.classList.add('wb-dragging');
      });
      rows.addEventListener('dragend', function (e) { var r = e.target.closest('.wb-row'); if (r) r.classList.remove('wb-dragging'); });
      rows.addEventListener('drop', function (e) {
        e.preventDefault();
        var data = e.dataTransfer.getData('text/plain') || '';
        if (data.indexOf('lib:') === 0) { addExerciseToDay(allExercises[Number(data.slice(4))], state.activeDay); return; }
        if (data.indexOf('row:') === 0) {
          var arr = state.days[state.activeDay];
          var from = arr.findIndex(function (x) { return x.id === data.slice(4); });
          if (from < 0) return;
          var moved = arr.splice(from, 1)[0];
          var targetRow = e.target.closest('.wb-row');
          var to = arr.length;
          if (targetRow) { var idx = arr.findIndex(function (x) { return x.id === targetRow.getAttribute('data-id'); }); if (idx >= 0) to = idx; }
          arr.splice(to, 0, moved);
          render();
        }
      });
      root.querySelectorAll('.wb-day').forEach(function (tab) {
        tab.addEventListener('dragover', function (e) { e.preventDefault(); tab.classList.add('is-drop'); });
        tab.addEventListener('dragleave', function () { tab.classList.remove('is-drop'); });
        tab.addEventListener('drop', function (e) {
          e.preventDefault(); tab.classList.remove('is-drop');
          var data = e.dataTransfer.getData('text/plain') || '';
          if (data.indexOf('lib:') === 0) addExerciseToDay(allExercises[Number(data.slice(4))], tab.getAttribute('data-day'));
        });
      });
    }

    function setStatus(kind, text) {
      var t = document.getElementById('wb-toast');
      if (!t) { t = document.createElement('div'); t.id = 'wb-toast'; t.className = 'wb-toast'; document.body.appendChild(t); }
      t.innerHTML = '<span>' + esc(text) + '</span>';
      t.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
    }

    function assemble() {
      var out = { name: 'My workout', instructions: '', days: {} };
      DAYS.forEach(function (d) {
        out.days[d] = (state.days[d] || []).map(function (it) {
          return { kind: it.kind, name: it.name, exerciseId: it.exerciseId || null, sets: it.sets, targetType: it.targetType, target: it.target, rest: it.rest };
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
        Promise.resolve(onSave(plan)).then(function (r) { setStatus('ok', (r && r.message) || 'Saved to your profile.'); })
          .catch(function () { setStatus('ok', 'Saved locally.'); });
      } else { setStatus('ok', 'Saved.'); }
    }

    injectStyles();
    render();
    return { getPlan: assemble, save: doSave };
  }

  window.RiseWorkoutBuilder = {
    mount: function (rootEl, opts) { if (!rootEl) return null; return WorkoutBuilder(rootEl, opts || {}); }
  };
})();
