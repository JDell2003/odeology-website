/* ====================================================================
   RiseForIt — BROWSER CHROME THEME SYNC
   --------------------------------------------------------------------
   Keeps iOS Safari's status bar / toolbar (and Android's address bar)
   matched to the page instead of rendering white over a dark page.
   - Resolves the page's real background: body/html background-color
     when opaque, else the first color stop of the base (last) CSS
     background gradient layer.
   - Writes it to <meta name="theme-color"> (created if missing) and to
     html's background-color so overscroll rubber-banding matches too.
   - Re-syncs when the theme flips (data-theme / class on <html>), on
     load, and on bfcache restore (pageshow).
   Self-contained; safe to include on any page.
   ==================================================================== */
(function () {
    'use strict';

    var FALLBACK = '#140f0b'; // site's dark base tone

    /* Return a usable opaque color string, or null. */
    var opaque = function (c) {
        if (!c || c === 'transparent') return null;
        if (c.charAt(0) === '#') return c;
        var m = /^rgba?\(([^)]+)\)$/.exec(c);
        if (!m) return null;
        var p = m[1].split(',');
        if (p.length >= 4 && parseFloat(p[3]) < 0.99) return null;
        return 'rgb(' + p[0].trim() + ',' + p[1].trim() + ',' + p[2].trim() + ')';
    };

    /* First color stop of the LAST gradient layer (painted underneath,
       i.e. the page's base tone; top stop = what sits under the status
       bar with the site's 180deg gradients). */
    var gradientBase = function (image) {
        if (!image || image === 'none') return null;
        var layers = image.split(/gradient\(/);
        if (layers.length < 2) return null;
        var last = layers[layers.length - 1];
        var m = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/.exec(last);
        if (!m) return null;
        return opaque(m[0]);
    };

    var resolve = function () {
        var els = [document.body, document.documentElement];
        for (var i = 0; i < els.length; i++) {
            if (!els[i]) continue;
            var cs = getComputedStyle(els[i]);
            var solid = opaque(cs.backgroundColor);
            if (solid) return solid;
            var grad = gradientBase(cs.backgroundImage);
            if (grad) return grad;
        }
        return FALLBACK;
    };

    var apply = function () {
        var color = FALLBACK;
        try { color = resolve(); } catch (e) { /* keep fallback */ }
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            if (document.head) document.head.appendChild(meta);
        }
        meta.setAttribute('content', color);
        try { document.documentElement.style.backgroundColor = color; } catch (e) { /* ignore */ }
    };

    var arm = function () {
        apply();
        window.addEventListener('load', apply);
        window.addEventListener('pageshow', apply);
        try {
            new MutationObserver(apply).observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['data-theme', 'class']
            });
        } catch (e) { /* ignore */ }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
})();
