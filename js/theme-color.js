/* ====================================================================
   RiseForIt — BROWSER CHROME THEME SYNC (v3)
   --------------------------------------------------------------------
   Keeps iOS Safari's status bar AND bottom toolbar (and Android's
   address bar) matched to what's actually on screen instead of white.

   v2 fixed the TOP bar by sampling the element stack at the top of the
   viewport (full-screen dark stages paint over a light-locked body, so
   body alone lies). v3 fixes the BOTTOM bar: iOS derives the toolbar /
   home-indicator tint from the document's own background (body/html),
   not the theme-color meta and not the pixels an overlay paints. So
   when a full-viewport surface (login stage, recap veil, cutscene)
   supplies the bottom-of-viewport color, we temporarily override the
   body + html backgrounds to that color — invisible, since the overlay
   covers everything — and restore the originals as soon as no overlay
   qualifies.

   Self-contained; safe to include on any page.
   ==================================================================== */
(function () {
    'use strict';

    var FALLBACK = '#140f0b'; // site's dark base tone

    /* Brand favicon: swap the legacy pink /favicon.ico for the SVG mark
       on every page that loads this script. Modern browsers prefer the
       SVG; the .ico stays as a fallback for very old ones. */
    var ensureFavicon = function () {
        try {
            if (!document.head) return;
            var links = document.head.querySelectorAll('link[rel~="icon"]');
            for (var i = 0; i < links.length; i++) {
                if ((links[i].getAttribute('href') || '').indexOf('favicon.svg') !== -1) return;
            }
            var link = document.createElement('link');
            link.setAttribute('rel', 'icon');
            link.setAttribute('type', 'image/svg+xml');
            link.setAttribute('href', '/favicon.svg');
            document.head.appendChild(link);
        } catch (e) { /* never break the host page */ }
    };
    ensureFavicon();

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

    var solidColor = function (c, minAlpha) {
        var p = parse(c);
        if (!p || p.a < (minAlpha == null ? 0.99 : minAlpha)) return null;
        return p.rgb;
    };

    /* First color stop of the LAST gradient layer (painted underneath;
       with this site's 180deg gradients that's the surface's top tone). */
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

    /* Topmost element with a usable background at a viewport point.
       Skips our own body/html overrides via the `ignore` list. */
    var surfaceAt = function (x, y, ignore) {
        if (!document.elementsFromPoint || !document.body) return null;
        var stack;
        try { stack = document.elementsFromPoint(x, y); } catch (e) { return null; }
        if (!stack || !stack.length) return null;
        for (var i = 0; i < stack.length; i++) {
            var el = stack[i];
            if (ignore && ignore.indexOf(el) !== -1) continue;
            var c = usableBackground(el, 0.6);
            if (c) return { el: el, color: c };
        }
        return null;
    };

    /* Does this element's box cover (essentially) the whole viewport? */
    var coversViewport = function (el) {
        if (!el || el === document.body || el === document.documentElement) return false;
        var r;
        try { r = el.getBoundingClientRect(); } catch (e) { return false; }
        var w = window.innerWidth || 0;
        var h = window.innerHeight || 0;
        return r.top <= 2 && r.left <= 2 && r.right >= w - 2 && r.bottom >= h - 2;
    };

    var bodyFallback = function () {
        var els = [document.body, document.documentElement];
        for (var i = 0; i < els.length; i++) {
            if (!els[i]) continue;
            var c = usableBackground(els[i], 0.99);
            if (c) return c;
        }
        return FALLBACK;
    };

    /* --- body/html override bookkeeping ---------------------------- */
    var savedBody = null;      // original inline body background shorthand
    var bodyOverridden = false;

    var overrideBody = function (color) {
        if (!document.body) return;
        if (!bodyOverridden) {
            savedBody = document.body.style.background;
            bodyOverridden = true;
        }
        document.body.style.background = color;
    };

    var restoreBody = function () {
        if (!bodyOverridden || !document.body) return;
        document.body.style.background = savedBody || '';
        bodyOverridden = false;
        savedBody = null;
    };

    var lastKey = null;
    var apply = function () {
        try {
            var w = Math.max(2, window.innerWidth || 2);
            var h = Math.max(2, window.innerHeight || 2);
            var x = Math.floor(w / 2);

            var top = surfaceAt(x, 1, null);
            var bottom = surfaceAt(x, h - 2, null);

            var metaColor = (top && top.color) || bodyFallback();

            /* Full-viewport overlay owning the bottom edge? Then the
               document background must match it or iOS paints the
               bottom toolbar from the (light) body underneath. */
            var overlayColor = null;
            if (bottom && bottom.color && coversViewport(bottom.el)) {
                overlayColor = bottom.color;
            }

            var key = metaColor + '|' + (overlayColor || '');
            if (key === lastKey) return;
            lastKey = key;

            var meta = document.querySelector('meta[name="theme-color"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute('name', 'theme-color');
                if (document.head) document.head.appendChild(meta);
            }
            meta.setAttribute('content', metaColor);

            if (overlayColor) {
                overrideBody(overlayColor);
                document.documentElement.style.backgroundColor = overlayColor;
            } else {
                restoreBody();
                document.documentElement.style.backgroundColor = metaColor;
            }
        } catch (e) { /* never break the host page */ }
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
        window.addEventListener('scroll', schedule, { passive: true });
        document.addEventListener('visibilitychange', schedule);
        try {
            new MutationObserver(schedule).observe(document.documentElement, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeFilter: ['class', 'data-theme', 'data-entry-stage', 'style']
            });
        } catch (e) { /* ignore */ }
        /* Timed re-checks cover post-load stage activation even if the
           observer misses. */
        [400, 1200, 2500, 5000].forEach(function (ms) {
            window.setTimeout(apply, ms);
        });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
})();
