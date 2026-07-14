/* Coach's plan PDF card — shared by the training + nutrition pages.
   A trainer sends a training/nutrition PDF from their dashboard; it lands in
   client-docs on the server. This mounts a "From your coach" card (View /
   Download) into any element that carries data-coach-doc, filtered by
   data-kind ("training" | "nutrition"). Stays hidden when no PDF was sent. */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function dataUrlToBlobUrl(dataUrl) {
        try {
            var comma = dataUrl.indexOf(',');
            var b64 = dataUrl.slice(comma + 1);
            var bin = atob(b64);
            var len = bin.length, bytes = new Uint8Array(len);
            for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
            return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        } catch (e) { return ''; }
    }

    function ensureStyles() {
        if (document.getElementById('coach-doc-card-styles')) return;
        var s = document.createElement('style');
        s.id = 'coach-doc-card-styles';
        s.textContent = [
            '.coach-doc-card{display:flex;align-items:center;gap:16px;margin:0 0 22px;padding:18px 20px;',
            '  border-radius:16px;border:1px solid rgba(185,138,43,.32);',
            '  background:linear-gradient(135deg,rgba(212,175,55,.14),rgba(212,175,55,.05));',
            '  box-shadow:0 8px 24px rgba(90,60,10,.08);}',
            '.coach-doc-card .cdc-icon{flex:0 0 auto;display:flex;align-items:center;justify-content:center;',
            '  width:48px;height:48px;border-radius:12px;color:#8a6414;',
            '  background:rgba(212,175,55,.2);border:1px solid rgba(185,138,43,.4);}',
            '.coach-doc-card .cdc-body{flex:1 1 auto;min-width:0;}',
            '.coach-doc-card .cdc-eyebrow{margin:0 0 2px;font:800 10px/1.4 "Space Grotesk",system-ui,sans-serif;',
            '  letter-spacing:.12em;text-transform:uppercase;color:#a1751f;}',
            '.coach-doc-card .cdc-title{margin:0 0 3px;font:800 18px/1.25 "Space Grotesk",system-ui,sans-serif;color:inherit;}',
            '.coach-doc-card .cdc-meta{margin:0;font-size:12.5px;opacity:.7;}',
            '.coach-doc-card .cdc-actions{flex:0 0 auto;display:flex;gap:8px;flex-wrap:wrap;}',
            '.coach-doc-card .cdc-btn{font:800 13px/1 "Space Grotesk",system-ui,sans-serif;padding:11px 15px;',
            '  border-radius:11px;cursor:pointer;border:1px solid rgba(185,138,43,.4);}',
            '.coach-doc-card .cdc-btn.primary{background:#b98a2b;color:#fff;border-color:transparent;}',
            '.coach-doc-card .cdc-btn.primary:hover{background:#a6791f;}',
            '.coach-doc-card .cdc-btn.ghost{background:transparent;color:#7a5312;}',
            '.coach-doc-card .cdc-btn.ghost:hover{background:rgba(212,175,55,.16);}',
            '@media (max-width:640px){',
            '  .coach-doc-card{flex-wrap:wrap;}',
            '  .coach-doc-card .cdc-actions{width:100%;}',
            '  .coach-doc-card .cdc-actions .cdc-btn{flex:1 1 auto;}}'
        ].join('\n');
        document.head.appendChild(s);
    }

    function render(mount, kind, doc) {
        ensureStyles();
        var label = kind === 'nutrition' ? 'nutrition' : 'training';
        var who = doc.fromTrainerName ? ('From ' + doc.fromTrainerName) : 'From your coach';
        var when = '';
        try { when = doc.at ? new Date(doc.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; } catch (e) {}
        var card = document.createElement('section');
        card.className = 'coach-doc-card';
        card.innerHTML =
            '<div class="cdc-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path></svg>' +
            '</div>' +
            '<div class="cdc-body">' +
            '<p class="cdc-eyebrow">From your coach</p>' +
            '<h3 class="cdc-title">' + esc(doc.filename || ('Your ' + label + ' PDF')) + '</h3>' +
            '<p class="cdc-meta">' + esc(who + (when ? ' · ' + when : '')) + '</p>' +
            '</div>' +
            '<div class="cdc-actions">' +
            '<button type="button" class="cdc-btn primary" data-cdc-view>Open in new tab</button>' +
            '<button type="button" class="cdc-btn ghost" data-cdc-download>Download</button>' +
            '</div>';
        var url = dataUrlToBlobUrl(doc.dataUrl) || doc.dataUrl;
        card.querySelector('[data-cdc-view]').addEventListener('click', function () {
            window.open(url, '_blank', 'noopener');
        });
        card.querySelector('[data-cdc-download]').addEventListener('click', function () {
            var a = document.createElement('a');
            a.href = url; a.download = doc.filename || (label + '-plan.pdf');
            document.body.appendChild(a); a.click(); a.remove();
        });
        mount.innerHTML = '';
        mount.appendChild(card);
        mount.hidden = false;
    }

    function boot() {
        var mounts = document.querySelectorAll('[data-coach-doc]');
        if (!mounts.length) return;
        fetch('/api/training/client-doc', { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) {
                var docs = (j && Array.isArray(j.docs)) ? j.docs : [];
                Array.prototype.forEach.call(mounts, function (mount) {
                    var kind = String(mount.getAttribute('data-kind') || 'training').trim();
                    var doc = docs.filter(function (d) { return d && d.kind === kind && d.dataUrl; })[0];
                    if (doc) render(mount, kind, doc);
                });
            })
            .catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
