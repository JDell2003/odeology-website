/* Silent Wake Check-In (replaces the retired ringing alarm).
   A single tap when the user is up. Records the timestamp vs their stated wake
   time (from onboarding, ode_tracking_prefs_v1.wakeTime). No sound, no nag —
   missing it just means no check-in that day. Emits 'ode:wake-checkin' so the
   consistency scoring can factor it in. Mounts into #wake-checkin-mount. */
(function () {
  'use strict';
  var PREF_KEY = 'ode_tracking_prefs_v1';
  var CHECK_KEY = 'ode_wake_checkin_v1';
  var WINDOW_MIN = 60; // "on time" = within an hour of the target

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

  function record() {
    var now = new Date();
    var wt = wakeTime();
    var diff = (now.getHours() * 60 + now.getMinutes()) - minutesOf(wt); // + = after target
    var rec = { date: today(), at: now.toISOString(), wakeTime: wt, minutesFromTarget: diff, onTime: Math.abs(diff) <= WINDOW_MIN };
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(rec)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('ode:wake-checkin', { detail: rec })); } catch (e) {}
    try { if (window.RiseActivity && window.RiseActivity.log) window.RiseActivity.log('checkins'); } catch (e) {}
    return rec;
  }

  function styles() {
    if (document.getElementById('wc-styles')) return;
    var s = document.createElement('style');
    s.id = 'wc-styles';
    s.textContent = [
      '.wc-card{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 16px;padding:16px 18px;border-radius:16px;',
      '  border:1px solid rgba(212,175,55,.32);background:linear-gradient(135deg,rgba(212,175,55,.14),rgba(212,175,55,.04));',
      '  box-shadow:0 8px 24px rgba(90,60,10,.08);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;}',
      '.wc-card .wc-body{flex:1 1 220px;min-width:0;}',
      '.wc-title{font:800 15px/1.3 system-ui;color:#3a2c0c;}',
      '.wc-sub{margin-top:3px;font:500 12.5px/1.5 system-ui;color:rgba(58,44,12,.7);}',
      '.wc-btn{flex:0 0 auto;border:0;border-radius:11px;padding:12px 20px;cursor:pointer;',
      '  font:800 13px/1 system-ui;color:#1a1206;background:linear-gradient(135deg,#d4a537,#b98a2b);}',
      '.wc-btn:hover{filter:brightness(1.05);}',
      '.wc-card.done{border-color:rgba(22,163,74,.32);background:linear-gradient(135deg,rgba(22,163,74,.1),rgba(22,163,74,.02));}',
      '.wc-card.done .wc-title{color:#14532d;}',
      '.wc-ic{width:40px;height:40px;flex:0 0 auto;border-radius:11px;display:grid;place-items:center;font:900 20px/1 system-ui;color:#fff;background:#16a34a;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function render(mount) {
    var done = getToday();
    var wt = wakeTime();
    if (done) {
      var t = new Date(done.at);
      var hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0');
      mount.innerHTML = '<div class="wc-card done"><div class="wc-ic">&#10003;</div><div class="wc-body">'
        + '<div class="wc-title">Checked in at ' + hh + ':' + mm + '</div>'
        + '<div class="wc-sub">' + (done.onTime ? 'Right on time — nice. Consistency counts it.' : 'Logged. Aim for within an hour of ' + wt + ' next time.') + '</div>'
        + '</div></div>';
    } else {
      mount.innerHTML = '<div class="wc-card"><div class="wc-body">'
        + '<div class="wc-title">Good morning — up and at it?</div>'
        + '<div class="wc-sub">Tap when you’re up. Target wake: <b>' + wt + '</b>. Within an hour ticks Consistency up.</div>'
        + '</div><button class="wc-btn" id="wc-btn" type="button">I’m up — Check In</button></div>';
      var btn = mount.querySelector('#wc-btn');
      if (btn) btn.addEventListener('click', function () { record(); render(mount); });
    }
  }

  function init() {
    var mount = document.getElementById('wake-checkin-mount');
    if (!mount) return;
    styles();
    render(mount);
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
  window.RiseWakeCheckin = { record: record, getToday: getToday };
})();
