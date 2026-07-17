/* Silent Wake Check-In (replaces the retired ringing alarm).
   One tap when the user is up. Grades HOW on-time they were vs their stated
   wake time (onboarding, ode_tracking_prefs_v1.wakeTime): on time = full; each
   minute late earns less; past 20 min it goes negative. No sound, no nag.
   Emits 'ode:wake-checkin' and POSTs /api/health/wake so the consistency
   scoring sees it. Mounts into #wake-checkin-mount. */
(function () {
  'use strict';
  var PREF_KEY = 'ode_tracking_prefs_v1';
  var CHECK_KEY = 'ode_wake_checkin_v1';
  var LATE_CAP_MIN = 20; // at +20 min the score hits 0; beyond that it's negative
  var EARLY_WINDOW_MIN = 15; // the card only appears from 15 min BEFORE wake time
  // ...to 20 min AFTER (LATE_CAP_MIN). Outside that window, or once checked off,
  // the card is hidden entirely.

  function today() { return new Date().toISOString().slice(0, 10); }
  function wakeTime() {
    try { var p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return (p && p.wakeTime) || '07:00'; }
    catch (e) { return '07:00'; }
  }
  function getToday() {
    try { var c = JSON.parse(localStorage.getItem(CHECK_KEY) || 'null'); return c && c.date === today() ? c : null; }
    catch (e) { return null; }
  }
  function minutesOf(hhmm) { var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? (+m[1]) * 60 + (+m[2]) : 7 * 60; }

  // True only inside [wake - 15 min, wake + 20 min]. Uses a signed minute delta
  // that wraps around midnight so wake times near 00:00 behave correctly.
  function withinWindow() {
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var delta = nowMin - minutesOf(wakeTime());
    if (delta > 720) delta -= 1440;      // wrapped past midnight forward
    else if (delta < -720) delta += 1440; // wrapped past midnight backward
    return delta >= -EARLY_WINDOW_MIN && delta <= LATE_CAP_MIN;
  }

  // Graded progress from minutes-after-target: <=0 = 1.0 (full), linear down to
  // 0 at +LATE_CAP_MIN, then negative (to -1 at +2x the cap).
  function grade(minutesLate) {
    if (minutesLate <= 0) return 1;
    if (minutesLate <= LATE_CAP_MIN) return 1 - (minutesLate / LATE_CAP_MIN);
    return Math.max(-1, -((minutesLate - LATE_CAP_MIN) / LATE_CAP_MIN));
  }

  function record() {
    var now = new Date();
    var wt = wakeTime();
    var minutesLate = (now.getHours() * 60 + now.getMinutes()) - minutesOf(wt);
    var score = grade(minutesLate);
    var rec = {
      date: today(), at: now.toISOString(), wakeTime: wt,
      minutesFromTarget: minutesLate, progressScore: Math.round(score * 100) / 100,
      onTime: minutesLate <= 0, withinWindow: minutesLate < LATE_CAP_MIN
    };
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(rec)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('ode:wake-checkin', { detail: rec })); } catch (e) {}
    try { if (window.RiseActivity && window.RiseActivity.log) window.RiseActivity.log('checkins'); } catch (e) {}
    // Server-side for scoring: 'clean' inside the 20-min window, else 'snoozed'.
    try {
      fetch('/api/health/wake', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: minutesLate < LATE_CAP_MIN ? 'clean' : 'snoozed' })
      }).catch(function () {});
    } catch (e) {}
    return rec;
  }

  function styles() {
    if (document.getElementById('wc-styles')) return;
    var s = document.createElement('style');
    s.id = 'wc-styles';
    s.textContent = [
      // solid glass card so it never bleeds into the hero image behind it
      '#wake-checkin-mount{position:relative;z-index:5;}',
      '.wc-card{display:flex;align-items:center;gap:16px;flex-wrap:wrap;max-width:640px;margin:0 0 18px;',
      '  padding:15px 18px;border-radius:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;',
      '  background:rgba(17,20,28,.86);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      '  border:1px solid rgba(212,175,55,.45);box-shadow:0 14px 36px rgba(0,0,0,.34);}',
      '.wc-card .wc-body{flex:1 1 230px;min-width:0;}',
      '.wc-title{font:800 15px/1.3 system-ui;color:#fff;}',
      '.wc-sub{margin-top:4px;font:500 12.5px/1.5 system-ui;color:rgba(255,255,255,.68);}',
      '.wc-sub b{color:#f0d089;}',
      '.wc-btn{flex:0 0 auto;border:0;border-radius:12px;padding:13px 22px;cursor:pointer;',
      '  font:800 13.5px/1 system-ui;color:#1a1206;background:linear-gradient(135deg,#e6bd57,#c79a34);',
      '  box-shadow:0 6px 18px rgba(212,175,55,.28);transition:filter .14s ease,transform .12s ease;}',
      '.wc-btn:hover{filter:brightness(1.06);} .wc-btn:active{transform:translateY(1px);}',
      // graded result states
      '.wc-card.done{border-color:rgba(74,222,128,.5);}',
      '.wc-card.partial{border-color:rgba(212,175,55,.55);}',
      '.wc-card.late{border-color:rgba(248,113,113,.55);}',
      '.wc-ic{width:42px;height:42px;flex:0 0 auto;border-radius:12px;display:grid;place-items:center;',
      '  font:900 20px/1 system-ui;color:#fff;}',
      '.wc-card.done .wc-ic{background:#16a34a;} .wc-card.partial .wc-ic{background:#d4a537;color:#1a1206;} .wc-card.late .wc-ic{background:#dc2626;}',
      '.wc-meter{margin-top:8px;height:6px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden;max-width:280px;}',
      '.wc-meter i{display:block;height:100%;border-radius:99px;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function feedback(rec) {
    var late = rec.minutesFromTarget;
    var pct = Math.round(Math.max(0, Math.min(1, rec.progressScore)) * 100);
    if (late <= 0) {
      return { cls: 'done', ic: '&#10003;', title: 'Up on time — full progress', sub: 'Nailed your ' + rec.wakeTime + ' target. Consistency gets the full tick.', pct: 100, bar: '#16a34a' };
    }
    if (late < LATE_CAP_MIN) {
      return { cls: 'partial', ic: '&#9203;', title: late + ' min after ' + rec.wakeTime + ' — partial progress', sub: 'Still counts, but earlier is worth more. <b>' + pct + '%</b> of the wake tick.', pct: pct, bar: '#d4a537' };
    }
    return { cls: 'late', ic: '&#9888;', title: late + ' min late — past the ' + LATE_CAP_MIN + '-min window', sub: 'This one dings your Consistency. Aim within ' + LATE_CAP_MIN + ' min of ' + rec.wakeTime + ' tomorrow.', pct: 0, bar: '#dc2626' };
  }

  var lastShown = null; // cache the shown/hidden decision to avoid re-render flicker

  function render(mount) {
    // Show ONLY when not yet checked off today AND we're inside the wake window.
    // Before -15 min, after +20 min, or once checked off -> the card goes away.
    var show = !getToday() && withinWindow();
    if (show === lastShown) return;
    lastShown = show;
    if (!show) { mount.innerHTML = ''; return; }
    var wt = wakeTime();
    mount.innerHTML = '<div class="wc-card"><div class="wc-body">'
      + '<div class="wc-title">Good morning — up and at it?</div>'
      + '<div class="wc-sub">Tap when you’re up. Target wake <b>' + wt + '</b>. On time = full progress; each minute after earns less, and past ' + LATE_CAP_MIN + ' min it goes negative.</div>'
      + '</div><button class="wc-btn" id="wc-btn" type="button">I’m up — Check In</button></div>';
    var btn = mount.querySelector('#wc-btn');
    if (btn) btn.addEventListener('click', function () { record(); render(mount); });
  }

  function init() {
    var mount = document.getElementById('wake-checkin-mount');
    if (!mount) return;
    styles();
    render(mount);
    // Re-evaluate as time passes so the card appears when the window opens and
    // disappears when it closes, without needing a page refresh.
    setInterval(function () { render(mount); }, 30000);
    // Re-render immediately when the wake time is changed from the bottom-nav
    // wake modal (main.js odeOpenWakeModal) so the card reacts right away.
    window.addEventListener('ode:wake-prefs-changed', function () {
      lastShown = null;
      render(mount);
    });
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  window.RiseWakeCheckin = { record: record, getToday: getToday, grade: grade };
})();
