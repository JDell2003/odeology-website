/* v2 scoring (SCORING_ENGINE_V2): one-time, non-blocking modal asking existing
 * users for sex / date of birth so the server engine can normalize their
 * scores. Entirely gated on the server flag: when SCORING_ENGINE_V2 is off the
 * GET below reports enabled=false and nothing ever renders. Dismissal is
 * remembered locally; saving stores to app_training_profiles via
 * POST /api/training/scoring-profile.
 */
(function () {
  'use strict';

  var DISMISS_KEY = 'ode_scoring_profile_prompt_v1';

  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === 'done'; } catch (e) { return true; }
  }

  function markDismissed() {
    try { localStorage.setItem(DISMISS_KEY, 'done'); } catch (e) { /* ignore */ }
  }

  function detectTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
  }

  function buildModal(existing) {
    var overlay = document.createElement('div');
    overlay.id = 'scoringProfileModal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Complete your athlete profile');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(10,12,16,.62);display:flex;align-items:center;justify-content:center;padding:16px;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#141821;color:#f2f4f8;border:1px solid rgba(255,255,255,.12);border-radius:14px;max-width:420px;width:100%;padding:22px;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.5);';
    card.innerHTML = ''
      + '<h3 style="margin:0 0 6px;font-size:18px;">Make your scores fair</h3>'
      + '<p style="margin:0 0 14px;color:#aab3c2;font-size:13.5px;">Your new performance scores are normalized by sex, age, and bodyweight so everyone competes against their own potential. Two quick answers (optional, editable later):</p>'
      + '<label style="display:block;margin:0 0 10px;font-size:13px;color:#cfd6e2;">Sex'
      + '  <select id="spmSex" style="display:block;width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#0e1218;color:#f2f4f8;">'
      + '    <option value="">Select...</option>'
      + '    <option value="male">Male</option>'
      + '    <option value="female">Female</option>'
      + '    <option value="unspecified">Prefer not to say</option>'
      + '  </select>'
      + '</label>'
      + '<label style="display:block;margin:0 0 16px;font-size:13px;color:#cfd6e2;">Date of birth'
      + '  <input id="spmDob" type="date" style="display:block;width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#0e1218;color:#f2f4f8;" />'
      + '</label>'
      + '<div id="spmError" style="display:none;margin:0 0 10px;color:#ff8b8b;font-size:13px;"></div>'
      + '<div style="display:flex;gap:10px;justify-content:flex-end;">'
      + '  <button id="spmSkip" type="button" style="padding:9px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#aab3c2;cursor:pointer;">Not now</button>'
      + '  <button id="spmSave" type="button" style="padding:9px 16px;border-radius:9px;border:0;background:#e8b021;color:#141821;font-weight:700;cursor:pointer;">Save</button>'
      + '</div>';

    overlay.appendChild(card);

    if (existing && existing.sex) card.querySelector('#spmSex').value = existing.sex;
    if (existing && existing.dob) card.querySelector('#spmDob').value = existing.dob;

    function close() {
      markDismissed();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    card.querySelector('#spmSkip').addEventListener('click', close);
    card.querySelector('#spmSave').addEventListener('click', function () {
      var sex = card.querySelector('#spmSex').value || null;
      var dob = card.querySelector('#spmDob').value || null;
      var errEl = card.querySelector('#spmError');
      if (!sex && !dob) { close(); return; }
      fetch('/api/training/scoring-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ sex: sex, dob: dob, timezone: detectTimezone() })
      }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (result.ok) { close(); return; }
          errEl.textContent = (result.data && result.data.error) || 'Could not save - try again.';
          errEl.style.display = 'block';
        })
        .catch(function () {
          errEl.textContent = 'Could not save - try again.';
          errEl.style.display = 'block';
        });
    });

    document.body.appendChild(overlay);
  }

  function init() {
    if (dismissed()) return;
    fetch('/api/training/scoring-profile', { credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.ok) return;               // signed out / error: stay silent
        if (!data.enabled) return;                   // SCORING_ENGINE_V2 off: no user-facing change
        if (data.sex && data.dob) { markDismissed(); return; }
        buildModal(data);
      })
      .catch(function () { /* stay silent */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
