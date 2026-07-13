/* ====================================================================
   RiseForIt — BROWSER CHROME THEME SYNC (v2)
   --------------------------------------------------------------------
   Keeps iOS Safari's status bar / toolbar (and Android's address bar)
   matched to what's actually on screen instead of rendering white.

   v2: don't trust <body> alone — pages like the login screen paint a
   full-viewport dark section/overlay over a light body. We sample the
   element stack at the top-center of the viewport (elementsFromPoint)
   and use the first element with a usable background: an opaque or
   mostly-opaque background-color, or the first stop of its base (last)
   background gradient layer. Falls back to body/html, then the site's
   dark base tone.

   Writes the color to <meta name="theme-color"> (created if missing)
   and to <html>'s background-color so overscroll rubber-banding
   matches. Re-syncs on load/pageshow, when <html>/<body> attributes
   flip (data-theme, classes), and throttled on DOM changes so overlay
   screens (login stage, recap veil, cutscenes) are picked up.
   Self-contained; safe to include on any page.
   ==================================================================== */
(function () {
    'use strict';

    var FALLBACK = '#140f0b'; // site's dark base tone

    /* Parse a CSS color; return {rgb:'rgb(r,g,b)', a:alpha} or null. */
    var parse = function (c) {
        if (!c || c === 'transparent' || c === 'none') return null;
        if (c.charAt(0) === '#') return { rgb: c, a: 1 };
        var m = /^rgba?\(([^)]+)\)$/.exec(c);
        if (!m) return null;
        var p = m[1].split(',');
        if (p.length < 3) return null;
        var a = p.length >= 4 ? parseFloat(p[3]) : 1;
        if (!isFinite(a)) a = 1;
        return { rgb: 'rgb(' + p[0].trim() + ',' + p[1].trim() + ',' + p[2].trim() + ')', a: a };
    };

    /* Background-color usable for the bars? Opaque-ish only. */
    var solidColor = function (c, minAlpha) {
        var p = parse(c);
        if (!p || p.a < (minAlpha == null ? 0.99 : minAlpha)) return null;
        return p.rgb;
    };

    /* First color stop of the LAST gradient layer (painted underneath;
       with the site's 180deg gradients the first stop is the TOP color,
       i.e. what sits beneath the status bar). */
    var gradientBase = function (image) {
        if (!image || image === 'none') return null;
        var layers = image.split(/gradient\(/);
        if (layers.length < 2) return null;
        var last = layers[layers.length - 1];
        var m = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/.exec(last);
        if (!m) return null;
        return solidColor(m[0], 0.6);
    };

    var usableBackground = function (el, minAlpha) {
        var cs;
        try { cs = getComputedStyle(el); } catch (e) { return null; }
        if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return null;
        return solidColor(cs.backgroundColor, minAlpha) || gradientBase(cs.backgroundImage);
    };

    /* What's really visible at the top of the viewport — walks the
       stacked elements top-most first, so full-screen overlays (login
       stage, recap veil, cutscenes) win over the body behind them. */
    var colorAtTop = function () {
        if (!document.elementsFromPoint || !document.body) return null;
        var x = Math.max(1, Math.floor((window.innerWidth || 2) / 2));
        var stack;
        try { stack = document.elementsFromPoint(x, 1); } catch (e) { return null; }
        if (!stack || !stack.length) return null;
        for (var i = 0; i < stack.length; i++) {
            var c = usableBackground(stack[i], 0.6);
            if (c) return c;
        }
        return null;
    };

    var resolve = function () {
        var top = colorAtTop();
        if (top) return top;
        var els = [document.body, document.documentElement];
        for (var i = 0; i < els.length; i++) {
            if (!els[i]) continue;
            var c = usableBackground(els[i], 0.99);
            if (c) return c;
        }
        return FALLBACK;
    };

    var lastApplied = null;
    var apply = function () {
        var color = FALLBACK;
        try { color = resolve(); } catch (e) { /* keep fallback */ }
        if (color === lastApplied) return;
        lastApplied = color;
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            if (document.head) document.head.appendChild(meta);
        }
        meta.setAttribute('content', color);
        try { document.documentElement.style.backgroundColor = color; } catch (e) { /* ignore */ }
    };

    /* Throttled re-check so overlay stages flipping classes/DOM are
       caught without hammering style resolution on busy pages. */
    var pending = null;
    var schedule = function () {
        if (pending) return;
        pending = window.setTimeout(function () {
            pending = null;
            apply();
        }, 250);
    };

    var arm = function () {
        apply();
        window.addEventListener('load', apply);
        window.addEventListener('pageshow', apply);
        window.addEventListener('resize', schedule);
        document.addEventListener('visibilitychange', schedule);
        try {
            new MutationObserver(schedule).observe(document.documentElement, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeFilter: ['class', 'data-theme', 'data-entry-stage', 'style']
            });
        } catch (e) { /* ignore */ }
        /* A few timed re-checks cover post-load stage activation even if
           the observer misses (e.g. styles applied inside iframes/fonts). */
        [400, 1200, 2500, 5000].forEach(function (ms) {
            window.setTimeout(apply, ms);
        });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
})();
