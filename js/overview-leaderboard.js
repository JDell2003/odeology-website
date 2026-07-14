/* ====================================================================
   RiseForIt — OVERVIEW LEADERBOARD ENHANCER
   --------------------------------------------------------------------
   Makes the overview page's mini leaderboard speak the same language as
   the rest of the app — the spider graph. It:
     1. Gives every leaderboard member a deterministic six-axis stat
        block (seeded by their handle, scaled by their points), then
        classifies them with the SAME engine the overview hero and the
        Arena use (window.OdeIdentity: character type + title + in-type
        rank). Each row gains a mini radar + a "where they are" caste
        chip (e.g. "♞ Knight").
     2. Makes each row clickable. Clicking opens a read-only member
        overview: their rank scene, big spider graph, character type /
        title / rank, a progress-photo strip and a grocery-list peek —
        a look inside that member's account.

   Self-contained on purpose (no overview.js edits — see the concurrent-
   agents note in overview-identity.js). It reads the rows overview.js
   renders into #overview-lb-list and enhances them in place, so the two
   never fight over the same code. The community leaderboard is seeded
   bots ("bots fluctuate daily"), so the progress photos and grocery
   list shown here are illustrative demo content, not private user data.
   ==================================================================== */
(function () {
    'use strict';

    var AXES = ['strength', 'cardio', 'consistency', 'nutrition', 'recovery', 'progress'];
    var AXIS_LABEL = {
        strength: 'Strength', cardio: 'Cardio', consistency: 'Consistency',
        nutrition: 'Nutrition', recovery: 'Recovery', progress: 'Progress'
    };

    /* Per-caste representative scene loop (mirrors js/cutscenes.js
       BACKGROUNDS): pick the band by the member's average reach. */
    var SCENES = {
        peasant: [[18, 'bg-peasant-weak.mp4'], [27, 'bg-peasant-normal.mp4'], [999, 'bg-peasant-strong.mp4']],
        squire: [[41, 'bg-squire-weak.mp4'], [47, 'bg-squire-regular.mp4'], [999, 'bg-squire-strong.mp4']],
        mage: [[58, 'bg-mage-bad.mp4'], [999, 'bg-mage-good.mp4']],
        ranger: [[58, 'bg-ranger-weak.mp4'], [999, 'bg-ranger-strong.mp4']],
        berserker: [[58, 'bg-berserker-bad.mp4'], [999, 'bg-berserker-good.mp4']],
        knight: [[77, 'bg-knight-bad.mp4'], [999, 'bg-knight-good.mp4']],
        king: [[999, 'bg-king-regular.mp4']]
    };
    var EMBLEM = { king: '♛', knight: '♞', berserker: '⚔', ranger: '➳', mage: '✦', squire: '⚑', peasant: '⚒' };

    var PHOTO_PAIRS = [
        ['assets/images/trainers/client-before-01.jpg', 'assets/images/trainers/client-after-01.jpg'],
        ['assets/images/trainers/client-before-02.jpg', 'assets/images/trainers/client-after-02.jpg'],
        ['assets/images/trainers/client-before-03.jpg', 'assets/images/trainers/client-after-03.jpg'],
        ['assets/images/trainers/client-before-04.jpg', 'assets/images/trainers/transformation-01.jpg'],
        ['assets/images/trainers/transformation-02.jpg', 'assets/images/trainers/client-after-02.jpg']
    ];
    var GROCERY_POOL = [
        'Chicken breast', 'Ground turkey', 'Sirloin steak', 'Salmon fillet', 'Eggs (18ct)',
        'Greek yogurt', 'Cottage cheese', 'Rolled oats', 'Jasmine rice', 'Sweet potato',
        'Broccoli', 'Spinach', 'Bell peppers', 'Avocado', 'Blueberries', 'Bananas',
        'Almonds', 'Peanut butter', 'Olive oil', 'Whey protein', 'Black beans', 'Whole-grain wraps'
    ];

    /* ---- seeded RNG (mulberry32 + string hash) ---------------------- */
    var hashStr = function (str) {
        var h = 2166136261 >>> 0;
        for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    };
    var mulberry32 = function (a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    var clampStat = function (v) { return Math.max(0, Math.min(100, Math.round(Number(v) || 0))); };

    /* ---- deterministic six-axis stats for a member -----------------
       Points set the overall level (top of the board ranks higher); a
       seeded spike axis + noise create specialists so castes vary. */
    var statsFor = function (handle, points, streak) {
        var rng = mulberry32(hashStr('ode_lb_stats_' + String(handle || 'anon')));
        var pts = Number(points) || 0;
        // 420..720 pts -> ~32..80 base level.
        var level = 32 + Math.max(0, Math.min(1, (pts - 420) / 300)) * 48;
        var spikeAxis = AXES[Math.floor(rng() * AXES.length)];
        var doSpike = rng() < 0.55;
        var stats = {};
        for (var i = 0; i < AXES.length; i++) {
            var a = AXES[i];
            var noise = (rng() - 0.5) * 30;
            var v = level + noise;
            if (a === 'consistency') v += Math.min(18, Number(streak || 0) * 1.1); // streak feeds consistency
            if (doSpike && a === spikeAxis) v += 22;
            if (a === 'progress') v -= 6; // progress lags for everyone
            stats[a] = clampStat(v);
        }
        return stats;
    };

    /* ---- classify with the canonical identity engine ---------------- */
    var classify = function (stats) {
        var Ode = window.OdeIdentity;
        if (Ode && typeof Ode.pickType === 'function') {
            var type = Ode.pickType(stats);
            var title = typeof Ode.pickTitle === 'function' ? Ode.pickTitle(stats) : '';
            var out = { id: type.id, name: type.name, emblem: type.emblem || EMBLEM[type.id] || '•', blurb: type.blurb || '', title: title, rank: null, total: null };
            if (typeof Ode.computeScore === 'function' && typeof Ode.simulateRank === 'function') {
                try {
                    var score = Ode.computeScore(stats, type, null);
                    var r = Ode.simulateRank(score, type, score - 2);
                    out.rank = r.rank; out.total = r.total;
                } catch (e) { /* ignore */ }
            }
            return out;
        }
        // Fallback: crude average-based caste if the engine isn't loaded.
        var avg = AXES.reduce(function (s, a) { return s + stats[a]; }, 0) / AXES.length;
        var id = avg >= 82 ? 'king' : avg >= 70 ? 'knight' : avg >= 50 ? 'mage' : avg >= 35 ? 'squire' : 'peasant';
        return { id: id, name: id.charAt(0).toUpperCase() + id.slice(1), emblem: EMBLEM[id], blurb: '', title: '', rank: null, total: null };
    };

    var sceneFor = function (casteId, stats) {
        var avg = AXES.reduce(function (s, a) { return s + stats[a]; }, 0) / AXES.length;
        var bands = SCENES[casteId] || SCENES.squire;
        for (var i = 0; i < bands.length; i++) { if (avg <= bands[i][0]) return bands[i][1]; }
        return bands[bands.length - 1][1];
    };

    /* ---- radar SVG (same geometry family as the overview hero) ------ */
    var radarSvg = function (stats, opts) {
        opts = opts || {};
        var size = opts.size || 92;
        var cx = size / 2, cy = size / 2, R = size / 2 - (opts.pad || 10);
        var point = function (i, v) {
            var ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
            var r = R * (Math.max(3, v) / 100);
            return (cx + Math.cos(ang) * r).toFixed(1) + ',' + (cy + Math.sin(ang) * r).toFixed(1);
        };
        var ring = function (v) { return AXES.map(function (a, i) { return point(i, v); }).join(' '); };
        var shape = AXES.map(function (a, i) { return point(i, stats[a]); }).join(' ');
        var spokes = AXES.map(function (a, i) {
            var p = point(i, 100).split(',');
            return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" class="olb-spoke"/>';
        }).join('');
        var labels = '';
        if (opts.labels) {
            labels = AXES.map(function (a, i) {
                var p = point(i, 122).split(',');
                return '<text x="' + p[0] + '" y="' + p[1] + '" class="olb-axis-label">' + AXIS_LABEL[a].slice(0, 4) + '</text>';
            }).join('');
        }
        return '<svg class="olb-radar" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">'
            + '<polygon points="' + ring(100) + '" class="olb-ring"/>'
            + '<polygon points="' + ring(62) + '" class="olb-ring"/>'
            + '<polygon points="' + ring(28) + '" class="olb-ring"/>'
            + spokes
            + '<polygon points="' + shape + '" class="olb-shape"/>'
            + labels + '</svg>';
    };

    var esc = function (s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    /* ---- read a rendered row into a member object ------------------- */
    var readRow = function (row) {
        var q = function (sel) { var el = row.querySelector(sel); return el ? el.textContent.trim() : ''; };
        var meta = q('.overview-lb-meta');            // "@handle · 🔥 12d"
        var handle = meta.split('·')[0].trim();
        var streakM = meta.match(/(\d+)\s*d/);
        var streak = streakM ? Number(streakM[1]) : 0;
        var ptsM = q('.overview-lb-points').replace(/[^0-9]/g, '');
        var img = row.querySelector('.overview-lb-avatar img');
        return {
            name: q('.overview-lb-name') || 'Member',
            handle: handle || '',
            pos: q('.overview-lb-pos') || '',
            points: Number(ptsM) || 0,
            streak: streak,
            bio: q('.overview-lb-bio') || '',
            joined: q('.overview-lb-joined') || '',
            avatar: img ? img.getAttribute('src') : ''
        };
    };

    /* ---- enhance one row: mini radar + caste chip + click ----------- */
    var enhanceRow = function (row) {
        if (row.getAttribute('data-olb-enhanced') === '1') return;
        row.setAttribute('data-olb-enhanced', '1');
        var m = readRow(row);
        var stats = statsFor(m.handle || m.name, m.points, m.streak);
        var caste = classify(stats);
        m.stats = stats; m.caste = caste;

        // Caste chip appended to the meta line.
        var meta = row.querySelector('.overview-lb-meta');
        if (meta) {
            var chip = document.createElement('span');
            chip.className = 'olb-chip olb-caste-' + caste.id;
            chip.innerHTML = '<span class="olb-chip-emblem">' + caste.emblem + '</span>' + esc(caste.name);
            meta.appendChild(document.createTextNode(' '));
            meta.appendChild(chip);
        }
        // Mini radar dropped between the text block and the points column.
        var right = row.querySelector('.overview-lb-row-right');
        var spider = document.createElement('div');
        spider.className = 'olb-row-spider olb-caste-' + caste.id;
        spider.innerHTML = radarSvg(stats, { size: 62, pad: 8 });
        if (right && right.parentNode) right.parentNode.insertBefore(spider, right);
        else row.appendChild(spider);

        row.classList.add('olb-clickable');
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', 'View ' + m.name + '’s profile');
        var open = function () { openProfile(m); };
        row.addEventListener('click', open);
        row.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
    };

    /* ---- the read-only member overview modal ----------------------- */
    var openProfile = function (m) {
        injectStyle();
        var existing = document.getElementById('olb-profile');
        if (existing) existing.remove();

        var stats = m.stats, caste = m.caste;
        var rng = mulberry32(hashStr('ode_lb_profile_' + m.handle));
        var scene = sceneFor(caste.id, stats);
        var rankLine = caste.rank ? '#' + caste.rank.toLocaleString() + ' ' + caste.name : caste.name;

        // Progress photos (seeded pair + a mid shot) with fake dates.
        var pair = PHOTO_PAIRS[Math.floor(rng() * PHOTO_PAIRS.length)];
        var wk = 4 + Math.floor(rng() * 8);
        var photos = [
            { src: pair[0], tag: 'Week 1' },
            { src: pair[1], tag: 'Week ' + wk }
        ];
        // Grocery list (seeded 6 items).
        var pool = GROCERY_POOL.slice();
        var groceries = [];
        for (var g = 0; g < 6 && pool.length; g++) groceries.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);

        var statRows = AXES.map(function (a) {
            return '<div class="olb-statrow"><span class="olb-statlabel">' + AXIS_LABEL[a] + '</span>'
                + '<span class="olb-statbar"><b style="width:' + stats[a] + '%"></b></span>'
                + '<span class="olb-statval">' + stats[a] + '</span></div>';
        }).join('');

        var wrap = document.createElement('div');
        wrap.id = 'olb-profile';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', m.name + ' profile');
        wrap.innerHTML =
            '<div class="olb-sheet" data-olb-sheet>'
            + '<button type="button" class="olb-close" data-olb-close aria-label="Close">✕</button>'
            + '<div class="olb-scene olb-caste-' + caste.id + '">'
            + '  <video class="olb-scene-video" muted loop autoplay playsinline preload="metadata" src="videos/' + scene + '"></video>'
            + '  <div class="olb-scene-veil"></div>'
            + '  <div class="olb-scene-head">'
            + '    <div class="olb-scene-avatar"><img src="' + esc(m.avatar) + '" alt="" onerror="this.style.display=\'none\'"></div>'
            + '    <div class="olb-scene-id">'
            + '      <div class="olb-scene-name">' + esc(m.name) + '</div>'
            + '      <div class="olb-scene-handle">' + esc(m.handle) + (m.streak > 1 ? ' · 🔥 ' + m.streak + 'd' : '') + '</div>'
            + '      <div class="olb-scene-rank"><span class="olb-scene-emblem">' + caste.emblem + '</span> ' + esc(rankLine) + '</div>'
            + (caste.title ? '      <div class="olb-scene-title">“' + esc(caste.title) + '”</div>' : '')
            + '    </div>'
            + '  </div>'
            + '</div>'
            + '<div class="olb-body">'
            + '  <div class="olb-grid">'
            + '    <div class="olb-radarwrap">' + radarSvg(stats, { size: 260, pad: 44, labels: true }) + '</div>'
            + '    <div class="olb-stats">'
            + '      <div class="olb-section-h">Spider graph</div>' + statRows
            + (caste.blurb ? '<div class="olb-blurb">' + esc(caste.blurb) + '</div>' : '')
            + '    </div>'
            + '  </div>'
            + '  <div class="olb-metaline">'
            + '    <span><b>' + m.points.toLocaleString() + '</b> pts</span>'
            + '    <span><b>' + (m.pos || '—') + '</b> this month</span>'
            + '    <span>' + esc(m.joined || '') + '</span>'
            + '  </div>'
            + '  <div class="olb-section-h">Progress photos</div>'
            + '  <div class="olb-photos">' + photos.map(function (p) {
                return '<figure class="olb-photo"><img src="' + esc(p.src) + '" alt="" loading="lazy" onerror="this.closest(\'figure\').classList.add(\'olb-photo-missing\')"><figcaption>' + esc(p.tag) + '</figcaption></figure>';
            }).join('') + '</div>'
            + '  <div class="olb-section-h">Grocery list</div>'
            + '  <div class="olb-grocery">' + groceries.map(function (item) {
                return '<label class="olb-groc-item"><input type="checkbox" ' + (rng() > 0.5 ? 'checked' : '') + ' disabled><span>' + esc(item) + '</span></label>';
            }).join('') + '</div>'
            + '  <a class="olb-openarena" href="leaderboard.html">See the full Arena →</a>'
            + '</div>'
            + '</div>';
        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.classList.add('is-open'); });

        var close = function () {
            wrap.classList.remove('is-open');
            window.setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 260);
        };
        wrap.addEventListener('click', function (e) {
            if (e.target === wrap) return close();
            var t = e.target;
            if (t && t.closest && t.closest('[data-olb-close]')) close();
        });
        document.addEventListener('keydown', function esce(e) {
            if (e.key === 'Escape') { document.removeEventListener('keydown', esce); close(); }
        });
    };

    /* ---- styles ---------------------------------------------------- */
    var CASTE_TINT = {
        king: '#e7b84b', knight: '#7f9bd6', berserker: '#e0674f', ranger: '#69c98c',
        mage: '#b98fe6', squire: '#6fb7d9', peasant: '#b8a887'
    };
    var injectStyle = function () {
        if (document.getElementById('olb-style')) return;
        var tintVars = Object.keys(CASTE_TINT).map(function (k) {
            return '.olb-caste-' + k + '{--olb-tint:' + CASTE_TINT[k] + '}';
        }).join('');
        var s = document.createElement('style');
        s.id = 'olb-style';
        s.textContent = [
            tintVars,
            /* row enhancements */
            '.overview-lb-row.olb-clickable{cursor:pointer;transition:background .15s ease,transform .12s ease}',
            '.overview-lb-row.olb-clickable:hover{background:rgba(217,161,92,.08)}',
            '.overview-lb-row.olb-clickable:focus-visible{outline:2px solid var(--accent,#d9a15c);outline-offset:2px}',
            '.olb-chip{display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:1px 8px;border-radius:999px;',
            '  font:800 10.5px/1.5 system-ui,sans-serif;color:var(--olb-tint,#b8a887);',
            '  background:color-mix(in srgb,var(--olb-tint,#b8a887) 16%,transparent);border:1px solid color-mix(in srgb,var(--olb-tint,#b8a887) 34%,transparent)}',
            '.olb-chip-emblem{font-size:11px}',
            '.olb-row-spider{flex:0 0 auto;width:46px;height:46px;margin:0 6px;opacity:.92;align-self:center}',
            '.olb-row-spider .olb-radar{width:46px;height:46px;display:block}',
            '.olb-ring{fill:none;stroke:rgba(120,120,120,.28)}',
            '.olb-spoke{stroke:rgba(120,120,120,.22)}',
            '.olb-shape{fill:color-mix(in srgb,var(--olb-tint,#d9a15c) 30%,transparent);stroke:var(--olb-tint,#d9a15c);stroke-width:2;stroke-linejoin:round}',
            '.olb-axis-label{fill:rgba(150,150,160,.75);font:700 8px/1 system-ui,sans-serif;text-anchor:middle;dominant-baseline:middle}',
            /* modal */
            '#olb-profile{position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;justify-content:center;',
            '  background:rgba(8,12,20,0);transition:background .26s ease}',
            '#olb-profile.is-open{background:rgba(8,12,20,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
            '@media(min-width:720px){#olb-profile{align-items:center}}',
            '.olb-sheet{position:relative;width:min(720px,100%);max-height:94vh;overflow:auto;background:#12151b;color:#f4f5f7;',
            '  border-radius:22px 22px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.5);transform:translateY(30px);opacity:0;',
            '  transition:transform .3s cubic-bezier(.2,.8,.25,1),opacity .26s ease;scrollbar-width:none}',
            '.olb-sheet::-webkit-scrollbar{width:0}',
            '@media(min-width:720px){.olb-sheet{border-radius:22px}}',
            '#olb-profile.is-open .olb-sheet{transform:none;opacity:1}',
            '.olb-close{position:absolute;top:12px;right:12px;z-index:3;width:34px;height:34px;border-radius:999px;border:1px solid rgba(255,255,255,.25);',
            '  background:rgba(0,0,0,.35);color:#fff;font:700 14px/1 system-ui,sans-serif;cursor:pointer}',
            '.olb-close:hover{background:rgba(0,0,0,.6)}',
            '.olb-scene{position:relative;height:190px;overflow:hidden;border-radius:22px 22px 0 0}',
            '@media(min-width:720px){.olb-scene{border-radius:22px 22px 0 0}}',
            '.olb-scene-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}',
            '.olb-scene-veil{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(10,14,20,.15) 0%,rgba(10,14,20,.55) 55%,rgba(18,21,27,.95) 100%),',
            '  radial-gradient(120% 90% at 18% 20%,color-mix(in srgb,var(--olb-tint) 30%,transparent),transparent 60%)}',
            '.olb-scene-head{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;gap:14px;align-items:flex-end;padding:16px 18px}',
            '.olb-scene-avatar{flex:0 0 auto;width:64px;height:64px;border-radius:16px;overflow:hidden;border:2px solid rgba(255,255,255,.5);background:#222}',
            '.olb-scene-avatar img{width:100%;height:100%;object-fit:cover}',
            '.olb-scene-id{min-width:0}',
            '.olb-scene-name{font:800 22px/1.1 "Space Grotesk",system-ui,sans-serif}',
            '.olb-scene-handle{font:600 12.5px/1.3 system-ui,sans-serif;color:rgba(255,255,255,.72)}',
            '.olb-scene-rank{margin-top:4px;display:inline-flex;align-items:center;gap:6px;font:800 13px/1 system-ui,sans-serif;',
            '  color:var(--olb-tint);padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.35);border:1px solid color-mix(in srgb,var(--olb-tint) 45%,transparent)}',
            '.olb-scene-emblem{font-size:15px}',
            '.olb-scene-title{margin-top:5px;font:600 12.5px/1.35 system-ui,sans-serif;color:rgba(255,255,255,.78);font-style:italic}',
            '.olb-body{padding:16px 18px 22px}',
            '.olb-grid{display:grid;grid-template-columns:220px 1fr;gap:16px;align-items:center}',
            '@media(max-width:560px){.olb-grid{grid-template-columns:1fr}}',
            '.olb-radarwrap{display:flex;justify-content:center}',
            '.olb-radarwrap .olb-radar{width:100%;max-width:240px;height:auto}',
            '.olb-section-h{font:800 11px/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--olb-tint);margin:18px 0 10px}',
            '.olb-stats .olb-section-h{margin-top:0}',
            '.olb-statrow{display:grid;grid-template-columns:88px 1fr 28px;align-items:center;gap:8px;margin:6px 0}',
            '.olb-statlabel{font:600 12px/1 system-ui,sans-serif;color:rgba(255,255,255,.72)}',
            '.olb-statbar{height:7px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}',
            '.olb-statbar b{display:block;height:100%;border-radius:99px;background:var(--olb-tint)}',
            '.olb-statval{font:800 12px/1 system-ui,sans-serif;text-align:right;color:#fff}',
            '.olb-blurb{margin-top:10px;font:500 12.5px/1.5 system-ui,sans-serif;color:rgba(255,255,255,.6)}',
            '.olb-metaline{display:flex;gap:18px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);',
            '  font:500 12.5px/1 system-ui,sans-serif;color:rgba(255,255,255,.6)}',
            '.olb-metaline b{color:#fff;font-weight:800}',
            '.olb-photos{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
            '.olb-photo{margin:0;border-radius:14px;overflow:hidden;background:#1b1f27;position:relative}',
            '.olb-photo img{display:block;width:100%;height:190px;object-fit:cover}',
            '.olb-photo figcaption{position:absolute;left:8px;bottom:8px;padding:3px 9px;border-radius:999px;background:rgba(0,0,0,.6);',
            '  font:800 11px/1 system-ui,sans-serif;color:#fff}',
            '.olb-photo-missing{display:none}',
            '.olb-grocery{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px}',
            '@media(max-width:480px){.olb-grocery{grid-template-columns:1fr}}',
            '.olb-groc-item{display:flex;align-items:center;gap:9px;font:500 13px/1.3 system-ui,sans-serif;color:rgba(255,255,255,.82)}',
            '.olb-groc-item input{width:16px;height:16px;accent-color:var(--olb-tint)}',
            '.olb-groc-item input:checked+span{color:rgba(255,255,255,.45);text-decoration:line-through}',
            '.olb-openarena{display:inline-block;margin-top:18px;font:800 13px/1 system-ui,sans-serif;color:var(--olb-tint);text-decoration:none}',
            '.olb-openarena:hover{text-decoration:underline}'
        ].join('\n');
        document.head.appendChild(s);
    };

    /* ---- watch the list and enhance rows as they render ------------- */
    var enhanceAll = function () {
        var list = document.getElementById('overview-lb-list');
        if (!list) return;
        var rows = list.querySelectorAll('.overview-lb-row');
        for (var i = 0; i < rows.length; i++) enhanceRow(rows[i]);
    };

    var boot = function () {
        var list = document.getElementById('overview-lb-list');
        if (!list) { window.setTimeout(boot, 400); return; }
        injectStyle();
        enhanceAll();
        var obs = new MutationObserver(function () { enhanceAll(); });
        obs.observe(list, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
