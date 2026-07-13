/* ====================================================================
   RiseForIt — DAILY RECAP
   --------------------------------------------------------------------
   Once per day, the first app page a signed-in user opens routes them
   to the Overview. There, the page dims, the spider graph morphs to
   center stage and replays yesterday: each axis animates from where it
   was to where it is now (+/- chips on every vertex), next to a
   did/didn't list built from yesterday's logged activity, and a
   "Log today" button into the Daily Dash. Dismissing it morphs the
   graph back to its spot in the hero card.

   Self-contained on purpose (no main.js / main.css edits — see the
   concurrent-agents note in overview-identity.js). Reads:
     ode_auth_user_hint_v1     — signed-in hint (main.js)
     ode_onboarding_done_v1    — onboarding gate flag (main.js)
     ode_identity_engine_v1    — identity engine state (day + stats)
     ovIdentityStats / ovIdentityStatsPrev — current / previous stats
     ode_identity_activity_v1  — per-day activity buckets
   Writes:
     ode_daily_overview_day_v1:<userId> — last day the daily flow ran
     ode_daily_recap_v1                 — today's recap snapshot
   ==================================================================== */
(function () {
    'use strict';

    var AXES = [
        { key: 'strength', label: 'Strength' },
        { key: 'cardio', label: 'Cardio' },
        { key: 'consistency', label: 'Consistency' },
        { key: 'nutrition', label: 'Nutrition' },
        { key: 'recovery', label: 'Recovery' },
        { key: 'progress', label: 'Progress' }
    ];

    /* Bullet rules: which activity counters feed each axis, and how the
       did / didn't lines read. Keys match ode_identity_activity_v1. */
    var CHECKS = [
        { axis: 'strength', keys: ['strengthWorkouts', 'workouts'], did: 'You logged a workout', not: 'You didn’t log a workout' },
        { axis: 'cardio', keys: ['cardioSessions'], did: 'You got your cardio in', not: 'You didn’t do any cardio' },
        { axis: 'consistency', keys: ['checkins'], did: 'You checked in', not: 'You skipped your daily check-in' },
        { axis: 'nutrition', keys: ['mealsOnPlan'], did: 'You ate on plan', not: 'You didn’t log your meals on plan' },
        { axis: 'recovery', keys: ['sleepLogs'], did: 'You logged your sleep', not: 'You didn’t log your sleep' },
        { axis: 'progress', keys: ['measurements'], did: 'You tracked your numbers', not: 'You didn’t track weight or measurements' }
    ];

    var DAY_FLAG_PREFIX = 'ode_daily_overview_day_v1';
    var RECAP_KEY = 'ode_daily_recap_v1';

    var readJSON = function (key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    };
    var writeJSON = function (key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    };
    var dayKey = function (d) { return (d || new Date()).toISOString().slice(0, 10); };

    var signedInUser = function () {
        var hint = readJSON('ode_auth_user_hint_v1');
        var user = hint && hint.user;
        if (!user || !user.id) return null;
        var ts = Number(hint.ts || 0);
        if (!Number.isFinite(ts) || ts <= 0 || Date.now() - ts > 1000 * 60 * 60 * 24 * 14) return null;
        return user;
    };

    var cleanStats = function (raw) {
        if (!raw || typeof raw !== 'object') return null;
        var out = {};
        for (var i = 0; i < AXES.length; i++) {
            var v = Number(raw[AXES[i].key]);
            if (!Number.isFinite(v)) return null;
            out[AXES[i].key] = Math.max(0, Math.min(100, v));
        }
        return out;
    };

    /* ---- daily gate: snapshot + route to overview --------------------- */
    var page = (String(location.pathname || '/').split('/').pop() || 'index.html').toLowerCase() || 'index.html';
    var onOverview = page === 'overview.html';

    var runDailyGate = function () {
        if (window.top !== window) return; // never inside preview iframes
        var user = signedInUser();
        if (!user) return;
        // Trainer / manager-only accounts live in the trainer dashboard, not the overview.
        var isTrainer = Boolean(user.isTrainer || (user.trainer && user.trainer.active));
        var isManager = Boolean(user.isManager || (user.manager && user.manager.active));
        var isClient = Boolean(user.isClient || (user.client && user.client.active));
        if ((isTrainer || isManager) && !isClient) return;
        // Don't hijack someone mid-onboarding.
        try { if (localStorage.getItem('ode_onboarding_done_v1') !== '1') return; } catch (e) { return; }
        // No identity yet -> nothing to recap, no forced routing.
        var engineState = readJSON('ode_identity_engine_v1');
        if (!engineState || !engineState.stats) return;

        var today = dayKey();
        var flagKey = DAY_FLAG_PREFIX + ':' + String(user.id);
        var lastDay = null;
        try { lastDay = localStorage.getItem(flagKey); } catch (e) { /* ignore */ }
        if (lastDay === today) return;

        // The auth hint can be rewritten with the server's user id right
        // after boot, changing this flag key mid-day. If today's recap
        // snapshot already exists, the daily flow already ran — stamp the
        // new key and stop instead of re-running (and re-playing) it.
        var existing = readJSON(RECAP_KEY);
        if (existing && existing.day === today) {
            try { localStorage.setItem(flagKey, today); } catch (e) { /* ignore */ }
            return;
        }

        // First app page-load of a new day. Snapshot yesterday's story NOW
        // (identity-engine.js already ran refresh() above this script, so
        // ovIdentityStatsPrev holds the pre-advance shape) and mark the day
        // handled before navigating so a slow redirect can't loop.
        var cur = cleanStats(readJSON('ovIdentityStats')) || cleanStats(engineState.stats);
        if (!cur) return;
        var prev = cleanStats(readJSON('ovIdentityStatsPrev')) || cur;
        var activity = readJSON('ode_identity_activity_v1');
        var yDay = dayKey(new Date(Date.now() - 86400000));
        writeJSON(RECAP_KEY, {
            day: today,
            yesterdayDay: yDay,
            prev: prev,
            cur: cur,
            yesterday: (activity && activity.days && activity.days[yDay]) || null,
            shown: false
        });
        try { localStorage.setItem(flagKey, today); } catch (e) { /* ignore */ }
        if (!onOverview) location.replace('overview.html');
    };

    try { runDailyGate(); } catch (e) { /* never break the host page */ }

    /* ================================================================
       RECAP OVERLAY
       Auto-plays once per day on the overview. The owner Cutscenes
       panel can trigger it anywhere via window.OdeDailyRecap.preview().
       ================================================================ */
    var reducedMotion = false;
    try { reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }

    /* ---- radar geometry (mirrors js/overview-identity.js) ---- */
    var VB_W = 500, VB_H = 380, CX = VB_W / 2, CY = VB_H / 2 + 4, R = 128, LABEL_R = R + 26;
    var axisPoint = function (i, value, radius) {
        var angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
        var r = (radius || R) * (value / 100);
        return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
    };
    var polyPoints = function (stats) {
        return AXES.map(function (a, i) {
            return axisPoint(i, stats[a.key]).map(function (n) { return n.toFixed(2); }).join(',');
        }).join(' ');
    };
    var lerpStats = function (a, b, t) {
        var out = {};
        AXES.forEach(function (ax) { out[ax.key] = a[ax.key] + (b[ax.key] - a[ax.key]) * t; });
        return out;
    };
    var easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

    var injectStyle = function () {
        if (document.getElementById('ov-recap-style')) return;
        var s = document.createElement('style');
        s.id = 'ov-recap-style';
        s.textContent = [
            '#ov-recap{position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;',
            '  background:rgba(6,10,18,0);backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);',
            '  transition:background .55s ease,backdrop-filter .55s ease;overflow:hidden}',
            '#ov-recap.is-on{background:rgba(6,10,18,.84);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}',
            '#ov-recap .ovr-stage{display:flex;align-items:center;justify-content:center;gap:34px;flex-wrap:wrap;',
            '  width:min(1020px,94vw);max-width:100%;box-sizing:border-box;max-height:94vh;overflow:auto;padding:20px;scrollbar-width:none}',
            '#ov-recap .ovr-stage::-webkit-scrollbar{width:0;height:0}',
            '.ovr-radar-box{flex:0 0 auto;width:min(470px,88vw);will-change:transform;transform-origin:top left}',
            '.ovr-radar-box svg{width:100%;height:auto;display:block}',
            '.ovr-ring{fill:none;stroke:rgba(255,255,255,.14)}',
            '.ovr-spoke{stroke:rgba(255,255,255,.09)}',
            '.ovr-shape{fill:rgba(217,161,92,.22);fill:color-mix(in srgb, var(--accent,#d9a15c) 24%, transparent);',
            '  stroke:var(--accent,#d9a15c);stroke-width:2.6;stroke-linejoin:round;',
            '  filter:drop-shadow(0 0 14px rgba(217,161,92,.45))}',
            '.ovr-dot{fill:var(--accent,#d9a15c)}',
            '.ovr-label{fill:rgba(255,255,255,.82);font:700 13px/1 system-ui,sans-serif}',
            '.ovr-value{fill:#ffffff;font:800 15px/1 "Space Grotesk",system-ui,sans-serif}',
            '.ovr-chip{font:800 12.5px/1 system-ui,sans-serif;opacity:0;transition:opacity .45s ease}',
            '.ovr-chip.is-up{fill:#4ade80}.ovr-chip.is-down{fill:#f87171}.ovr-chip.is-flat{fill:rgba(255,255,255,.42)}',
            '#ov-recap.chips-on .ovr-chip{opacity:1}',
            '.ovr-side{flex:1 1 300px;max-width:420px;min-width:270px;color:#fff;',
            '  opacity:0;transform:translateY(14px);transition:opacity .5s ease,transform .5s ease}',
            '#ov-recap.side-on .ovr-side{opacity:1;transform:none}',
            '.ovr-kicker{font:800 11px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--accent,#d9a15c);margin:0 0 8px}',
            '.ovr-side h3{margin:0 0 4px;font:800 26px/1.15 "Space Grotesk",system-ui,sans-serif;color:#fff}',
            '.ovr-sub{margin:0 0 14px;font:500 13.5px/1.5 system-ui,sans-serif;color:rgba(255,255,255,.62)}',
            '.ovr-list{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:7px}',
            '.ovr-list li{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;',
            '  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);',
            '  font:600 13.5px/1.35 system-ui,sans-serif;color:rgba(255,255,255,.9);',
            '  opacity:0;transform:translateX(-8px);transition:opacity .4s ease,transform .4s ease}',
            '#ov-recap.side-on .ovr-list li{opacity:1;transform:none}',
            '.ovr-list li .ic{flex:0 0 auto;width:22px;height:22px;border-radius:999px;display:inline-flex;',
            '  align-items:center;justify-content:center;font:800 12px/1 system-ui,sans-serif}',
            '.ovr-list li.is-did .ic{background:rgba(74,222,128,.16);color:#4ade80}',
            '.ovr-list li.is-not .ic{background:rgba(248,113,113,.15);color:#f87171}',
            '.ovr-list li.is-not{color:rgba(255,255,255,.68)}',
            '.ovr-list li .d{margin-left:auto;font:800 12.5px/1 system-ui,sans-serif;white-space:nowrap}',
            '.ovr-list li .d.is-up{color:#4ade80}.ovr-list li .d.is-down{color:#f87171}.ovr-list li .d.is-flat{color:rgba(255,255,255,.4)}',
            '.ovr-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
            '.ovr-log{display:inline-flex;align-items:center;gap:8px;background:var(--accent,#d9a15c);color:#131b28;',
            '  font:800 14px/1 system-ui,sans-serif;padding:14px 22px;border-radius:999px;text-decoration:none;',
            '  box-shadow:0 14px 34px rgba(217,161,92,.35)}',
            '.ovr-log:hover{filter:brightness(1.06)}',
            '.ovr-later{border:1px solid rgba(255,255,255,.25);background:transparent;color:rgba(255,255,255,.8);',
            '  font:700 13px/1 system-ui,sans-serif;padding:13px 18px;border-radius:999px;cursor:pointer}',
            '.ovr-later:hover{background:rgba(255,255,255,.08)}',
            '.ovr-x{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));right:18px;width:38px;height:38px;border-radius:999px;',
            '  border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#fff;font:700 15px/1 system-ui,sans-serif;',
            '  cursor:pointer;opacity:0;transition:opacity .4s ease}',
            '#ov-recap.is-on .ovr-x{opacity:1}',
            '.ovr-x:hover{background:rgba(255,255,255,.14)}',
            /* Stack to a single column on narrow viewports AND on any
               touch-only device (covers phones stuck in desktop-site mode,
               where the layout viewport is ~980px and a width query alone
               never fires). justify-content:flex-start keeps the top of a
               taller-than-screen recap reachable when the stage scrolls. */
            '@media (max-width:720px), (hover:none) and (pointer:coarse){',
            '  #ov-recap .ovr-stage{flex-direction:column;flex-wrap:nowrap;justify-content:flex-start;gap:6px;',
            '    align-content:flex-start;width:100%;padding:14px 16px 26px}',
            '  .ovr-radar-box{width:min(340px,92vw)}',
            '  .ovr-side{max-width:520px;min-width:0;width:100%}',
            '  .ovr-side h3{font-size:22px}',
            '}'
        ].join('\n');
        document.head.appendChild(s);
    };

    var svgNS = 'http://www.w3.org/2000/svg';
    var svgEl = function (tag, attrs) {
        var el = document.createElementNS(svgNS, tag);
        Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
        return el;
    };

    /* data = { prev, cur, yesterday: activity bucket|null, yesterdayDay } */
    var buildOverlay = function (data) {
        injectStyle();
        var prevStats = data.prev;
        var curStats = data.cur;
        var recap = { yesterday: data.yesterday, yesterdayDay: data.yesterdayDay };
        var deltas = {};
        AXES.forEach(function (a) { deltas[a.key] = Math.round(curStats[a.key]) - Math.round(prevStats[a.key]); });

        var wrap = document.createElement('div');
        wrap.id = 'ov-recap';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', 'Your daily recap');

        // --- radar ---
        var box = document.createElement('div');
        box.className = 'ovr-radar-box';
        var svg = svgEl('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, 'aria-hidden': 'true' });
        [25, 50, 75, 100].forEach(function (ring) {
            svg.appendChild(svgEl('polygon', {
                points: AXES.map(function (a, i) { return axisPoint(i, ring).map(function (n) { return n.toFixed(1); }).join(','); }).join(' '),
                'class': 'ovr-ring'
            }));
        });
        AXES.forEach(function (a, i) {
            var p = axisPoint(i, 100);
            svg.appendChild(svgEl('line', { x1: CX, y1: CY, x2: p[0].toFixed(1), y2: p[1].toFixed(1), 'class': 'ovr-spoke' }));
        });
        var shape = svgEl('polygon', { points: polyPoints(prevStats), 'class': 'ovr-shape' });
        svg.appendChild(shape);
        var dots = AXES.map(function (a, i) {
            var p = axisPoint(i, prevStats[a.key]);
            var dot = svgEl('circle', { r: 4.5, cx: p[0].toFixed(2), cy: p[1].toFixed(2), 'class': 'ovr-dot' });
            svg.appendChild(dot);
            return dot;
        });
        var valueEls = [];
        AXES.forEach(function (a, i) {
            var p = axisPoint(i, 100, LABEL_R);
            var anchor = Math.abs(p[0] - CX) < 12 ? 'middle' : p[0] > CX ? 'start' : 'end';
            var label = svgEl('text', { x: p[0].toFixed(1), y: (p[1] - 6).toFixed(1), 'text-anchor': anchor, 'class': 'ovr-label' });
            label.textContent = a.label;
            var value = svgEl('text', { x: p[0].toFixed(1), y: (p[1] + 12).toFixed(1), 'text-anchor': anchor, 'class': 'ovr-value' });
            value.textContent = Math.round(prevStats[a.key]);
            var d = deltas[a.key];
            var chip = svgEl('text', {
                x: p[0].toFixed(1), y: (p[1] + 28).toFixed(1), 'text-anchor': anchor,
                'class': 'ovr-chip ' + (d > 0 ? 'is-up' : d < 0 ? 'is-down' : 'is-flat')
            });
            chip.textContent = d > 0 ? '+' + d : d < 0 ? String(d) : '±0';
            svg.appendChild(label);
            svg.appendChild(value);
            svg.appendChild(chip);
            valueEls.push(value);
        });
        box.appendChild(svg);

        // --- side: headline + bullets + actions ---
        var yBucket = recap.yesterday || {};
        var yLabel = 'Yesterday';
        try {
            yLabel = new Date(recap.yesterdayDay + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
        } catch (e) { /* keep fallback */ }
        var side = document.createElement('div');
        side.className = 'ovr-side';
        var items = CHECKS.map(function (c) {
            var did = c.keys.some(function (k) { return Number(yBucket[k]) > 0; });
            var d = deltas[c.axis];
            var dCls = d > 0 ? 'is-up' : d < 0 ? 'is-down' : 'is-flat';
            var dTxt = d > 0 ? '+' + d : d < 0 ? String(d) : '±0';
            var axisLabel = AXES.filter(function (a) { return a.key === c.axis; })[0].label;
            return '<li class="' + (did ? 'is-did' : 'is-not') + '"><span class="ic">' + (did ? '✓' : '✕') + '</span>' +
                '<span>' + (did ? c.did : c.not) + '</span>' +
                '<span class="d ' + dCls + '" title="' + axisLabel + '">' + axisLabel + ' ' + dTxt + '</span></li>';
        }).join('');
        side.innerHTML =
            '<p class="ovr-kicker">Daily recap</p>' +
            '<h3>' + yLabel + ' moved your graph</h3>' +
            '<p class="ovr-sub">Here’s what yesterday did to your six stats — green grew, red decayed. Today is a fresh set of points.</p>' +
            '<ul class="ovr-list">' + items + '</ul>' +
            '<div class="ovr-actions">' +
            '  <a class="ovr-log" href="dashboard.html" data-recap-log>Log today →</a>' +
            '  <button type="button" class="ovr-later" data-recap-later>Not now</button>' +
            '</div>';

        var stage = document.createElement('div');
        stage.className = 'ovr-stage';
        stage.appendChild(box);
        stage.appendChild(side);
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'ovr-x';
        x.setAttribute('aria-label', 'Close recap');
        x.textContent = '✕';
        wrap.appendChild(stage);
        wrap.appendChild(x);
        document.body.appendChild(wrap);

        return {
            wrap: wrap, box: box, side: side, xBtn: x, shape: shape, dots: dots, valueEls: valueEls,
            laterBtn: side.querySelector('[data-recap-later]'),
            logBtn: side.querySelector('[data-recap-log]')
        };
    };

    var morphShape = function (ui, from, to, duration, done) {
        var start = performance.now();
        var frame = function (now) {
            var t = Math.min(1, (now - start) / duration);
            var s = lerpStats(from, to, easeInOut(t));
            ui.shape.setAttribute('points', polyPoints(s));
            AXES.forEach(function (a, i) {
                var p = axisPoint(i, s[a.key]);
                ui.dots[i].setAttribute('cx', p[0].toFixed(2));
                ui.dots[i].setAttribute('cy', p[1].toFixed(2));
                ui.valueEls[i].textContent = Math.round(s[a.key]);
            });
            if (t < 1) requestAnimationFrame(frame);
            else if (done) done();
        };
        requestAnimationFrame(frame);
    };

    /* The FLIP source: the hero card's live radar. Returns null when it
       isn't usable (not built yet, hidden by showcase mode, zero rect). */
    var sourceRect = function () {
        var host = document.querySelector('#ov-radar svg');
        if (!host) return null;
        var r = host.getBoundingClientRect();
        if (!r || r.width < 60 || r.bottom < 0 || r.top > window.innerHeight) return null;
        var hostBox = host.closest('#ov-radar');
        if (hostBox && Number(getComputedStyle(hostBox).opacity) < 0.2) return null; // showcase top-of-page state
        return r;
    };

    var play = function (data, opts) {
        opts = opts || {};
        if (opts.markShown) {
            var stored = readJSON(RECAP_KEY);
            if (stored && stored.day === dayKey()) {
                stored.shown = true;
                writeJSON(RECAP_KEY, stored);
            }
        }
        var prevStats = data.prev;
        var curStats = data.cur;
        var already = document.getElementById('ov-recap');
        if (already && already.parentNode) already.parentNode.removeChild(already);

        var ui = buildOverlay(data);
        var closing = false;

        var finishClose = function () {
            if (ui.wrap.parentNode) ui.wrap.parentNode.removeChild(ui.wrap);
        };
        var close = function () {
            if (closing) return;
            closing = true;
            ui.wrap.classList.remove('side-on');
            ui.wrap.classList.remove('chips-on');
            ui.wrap.classList.remove('is-on');
            // Morph the graph back to its spot in the hero card.
            var src = sourceRect();
            if (src && !reducedMotion) {
                var cur = ui.box.getBoundingClientRect();
                ui.box.style.transition = 'transform .65s cubic-bezier(.6,.05,.35,1)';
                ui.box.style.transform = 'translate(' + (src.left - cur.left) + 'px,' + (src.top - cur.top) + 'px) scale(' + (src.width / cur.width) + ')';
                window.setTimeout(finishClose, 680);
            } else {
                ui.wrap.style.transition = 'opacity .4s ease';
                ui.wrap.style.opacity = '0';
                window.setTimeout(finishClose, 420);
            }
        };

        ui.xBtn.addEventListener('click', close);
        ui.laterBtn.addEventListener('click', close);
        ui.wrap.addEventListener('click', function (e) { if (e.target === ui.wrap) close(); });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(); }
        });
        ui.logBtn.addEventListener('click', function (ev) {
            // Open the Daily Dash popup right here instead of bouncing the
            // user to dashboard.html — the pill's click handler owns the
            // signed-in check and the modal. Navigation stays as fallback
            // when the control panel (and its pill) isn't on the page.
            var pill = document.getElementById('control-checkin');
            if (!pill) return; // navigation proceeds; recap already marked shown
            ev.preventDefault();
            close();
            pill.click();
        });

        if (reducedMotion) {
            // No theatrics: final state right away.
            ui.wrap.classList.add('is-on');
            ui.shape.setAttribute('points', polyPoints(curStats));
            AXES.forEach(function (a, i) {
                var p = axisPoint(i, curStats[a.key]);
                ui.dots[i].setAttribute('cx', p[0].toFixed(2));
                ui.dots[i].setAttribute('cy', p[1].toFixed(2));
                ui.valueEls[i].textContent = Math.round(curStats[a.key]);
            });
            ui.wrap.classList.add('chips-on');
            ui.wrap.classList.add('side-on');
            return;
        }

        // FLIP: lay out at the final spot, then start transformed onto the
        // hero radar and release. The veil fades in underneath ("background
        // fades out") while the graph flies to center stage.
        var src = sourceRect();
        requestAnimationFrame(function () {
            if (src) {
                var fin = ui.box.getBoundingClientRect();
                ui.box.style.transform = 'translate(' + (src.left - fin.left) + 'px,' + (src.top - fin.top) + 'px) scale(' + (src.width / fin.width) + ')';
            } else {
                ui.box.style.transform = 'scale(.6)';
                ui.box.style.opacity = '0';
            }
            requestAnimationFrame(function () {
                ui.wrap.classList.add('is-on');
                ui.box.style.transition = 'transform .85s cubic-bezier(.2,.8,.25,1), opacity .5s ease';
                ui.box.style.transform = 'none';
                ui.box.style.opacity = '1';
            });
        });

        // Sequence: fly (850ms) -> replay yesterday on the points (950ms)
        // -> chips + bullet list + actions.
        window.setTimeout(function () {
            morphShape(ui, prevStats, curStats, 950, function () {
                ui.wrap.classList.add('chips-on');
                ui.wrap.classList.add('side-on');
                var lis = ui.side.querySelectorAll('.ovr-list li');
                for (var i = 0; i < lis.length; i++) {
                    lis[i].style.transitionDelay = (i * 70) + 'ms';
                }
            });
        }, 950);
    };

    /* ---- owner preview (Cutscenes panel): play it now, on any page ----
       Uses today's real snapshot when one exists; otherwise synthesizes a
       plausible yesterday from the current stats so the morph, chips and
       list always have something to show. Never touches the shown flag. */
    var previewData = function () {
        var stored = readJSON(RECAP_KEY);
        if (stored && stored.day === dayKey()) {
            var p = cleanStats(stored.prev);
            var c = cleanStats(stored.cur);
            if (p && c) {
                return {
                    prev: p, cur: c,
                    yesterday: stored.yesterday || null,
                    yesterdayDay: stored.yesterdayDay || dayKey(new Date(Date.now() - 86400000))
                };
            }
        }
        var engineState = readJSON('ode_identity_engine_v1');
        var cur = cleanStats(readJSON('ovIdentityStats'))
            || cleanStats(engineState && engineState.stats)
            || { strength: 46, cardio: 34, consistency: 58, nutrition: 40, recovery: 44, progress: 31 };
        var sampleDelta = { strength: 2, cardio: -1, consistency: 3, nutrition: 2, recovery: 2, progress: 0 };
        var prev = {};
        AXES.forEach(function (a) {
            prev[a.key] = Math.max(0, Math.min(100, cur[a.key] - (sampleDelta[a.key] || 0)));
        });
        var activity = readJSON('ode_identity_activity_v1');
        var yDay = dayKey(new Date(Date.now() - 86400000));
        var bucket = activity && activity.days && activity.days[yDay];
        return {
            prev: prev, cur: cur,
            yesterday: bucket || { workouts: 1, checkins: 1, mealsOnPlan: 1, sleepLogs: 1 },
            yesterdayDay: yDay
        };
    };
    window.OdeDailyRecap = {
        preview: function () {
            try { play(previewData(), { markShown: false }); } catch (e) { /* never break the page */ }
        }
    };

    /* ---- auto-play (overview only, once per day) ----------------------
       Wait for the page (and ideally the hero radar) to exist, then play.
       The radar is built by overview-identity.js after the engine loads;
       poll briefly and start anyway if it never shows. Full-screen rank
       cutscenes (js/cutscenes.js, z-index 6000) own the screen while they
       run — the recap waits them out and plays right after. The first
       tick is delayed past the ~400ms window in which cutscenes.js
       decides whether one runs. */
    if (!onOverview) return;
    var autoRecap = readJSON(RECAP_KEY);
    if (!autoRecap || autoRecap.day !== dayKey() || autoRecap.shown) return;
    var autoPrev = cleanStats(autoRecap.prev);
    var autoCur = cleanStats(autoRecap.cur);
    if (!autoPrev || !autoCur) return;
    var autoData = {
        prev: autoPrev, cur: autoCur,
        yesterday: autoRecap.yesterday || null,
        yesterdayDay: autoRecap.yesterdayDay || dayKey(new Date(Date.now() - 86400000))
    };

    var armed = false;
    var arm = function () {
        if (armed) return;
        armed = true;
        var tries = 0;
        var tick = function () {
            if (document.querySelector('.rf-cutscene')) {
                window.setTimeout(tick, 600);
                return;
            }
            // Owner already previewing it? Don't stack an auto-play on top.
            if (document.getElementById('ov-recap')) return;
            tries += 1;
            if (document.querySelector('#ov-radar svg') || tries >= 14) {
                window.setTimeout(function () { play(autoData, { markShown: true }); }, 350);
                return;
            }
            window.setTimeout(tick, 220);
        };
        window.setTimeout(tick, 900);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
})();
