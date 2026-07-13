// js/meal-program-questions.js — Meal Program Work Order Phase 2:
// budget / store / state, dietary + allergies (legacy enums), body stats (Mifflin inputs),
// email gate (Klaviyo best-effort, never blocks the plan).
(function () {
    'use strict';

    var C = window.MealProgramConstants;
    var KLAVIYO_COMPANY_ID = 'W83QZb'; // MIRRORED(js/main.js:28)
    var App = null;

    function bindPills(containerId, dataAttr, onPick, multi) {
        var wrap = document.getElementById(containerId);
        if (!wrap) return;
        wrap.addEventListener('click', function (e) {
            var btn = e.target.closest('.mp-pill-btn');
            if (!btn) return;
            var val = btn.getAttribute(dataAttr);
            if (!multi) {
                wrap.querySelectorAll('.mp-pill-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
            }
            onPick(val, btn, wrap);
            App.persist();
        });
    }

    function setActivePill(containerId, dataAttr, value) {
        var wrap = document.getElementById(containerId);
        if (!wrap) return;
        wrap.querySelectorAll('.mp-pill-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute(dataAttr) === String(value));
        });
    }

    function populateStates() {
        var sel = document.getElementById('mp-state');
        var states = App.dataset.location_multipliers.states;
        sel.innerHTML = '';
        Object.keys(states).sort().forEach(function (code) {
            var opt = document.createElement('option');
            opt.value = code;
            opt.textContent = states[code].name + ' (' + code + ')';
            sel.appendChild(opt);
        });
        sel.value = states[App.answers.state] ? App.answers.state : 'GA';
        App.answers.state = sel.value;
    }

    function restoreForm() {
        document.getElementById('mp-budget').value = App.answers.budgetMonthly;
        document.getElementById('mp-store').value = App.answers.storePref;
        document.getElementById('mp-dietary').value = App.answers.dietaryPref;
        document.getElementById('mp-age').value = App.answers.age;
        document.getElementById('mp-height').value = App.answers.heightIn;
        document.getElementById('mp-weight').value = App.answers.weightLb;
        document.getElementById('mp-goal-weight').value = App.answers.goalWeightLb;
        setActivePill('mp-tier-pills', 'data-tier', App.answers.tierOverride || '');
        setActivePill('mp-goal-pills', 'data-goal', App.answers.goal);
        setActivePill('mp-sex-pills', 'data-sex', App.answers.sex);
        setActivePill('mp-activity-pills', 'data-activity', App.answers.dayActivity);
        setActivePill('mp-intensity-pills', 'data-intensity', App.answers.intensity);
        setActivePill('mp-frequency-pills', 'data-frequency', App.answers.frequency);
        renderAllergies();
    }

    function renderAllergies() {
        var wrap = document.getElementById('mp-allergies');
        wrap.querySelectorAll('.mp-pill-btn').forEach(function (b) {
            b.classList.toggle('active', App.answers.allergies.indexOf(b.getAttribute('data-allergy')) >= 0);
        });
    }

    function toggleAllergy(val) {
        var list = App.answers.allergies.slice();
        if (val === 'none') {
            list = ['none']; // 'none' clears the rest (legacy main.js:23831 behavior)
        } else {
            list = list.filter(function (a) { return a !== 'none'; });
            var i = list.indexOf(val);
            if (i >= 0) list.splice(i, 1); else list.push(val);
            if (!list.length) list = ['none'];
        }
        App.answers.allergies = list;
        renderAllergies();
    }

    function readNumbers() {
        var a = App.answers;
        a.budgetMonthly = Number(document.getElementById('mp-budget').value) || C.budget.defaultMonthly;
        a.age = Number(document.getElementById('mp-age').value) || 25;
        a.heightIn = Number(document.getElementById('mp-height').value) || 70;
        a.weightLb = Number(document.getElementById('mp-weight').value) || 180;
        a.goalWeightLb = Number(document.getElementById('mp-goal-weight').value) || a.weightLb;
        a.storePref = document.getElementById('mp-store').value;
        a.dietaryPref = document.getElementById('mp-dietary').value;
        App.persist();
    }

    // ------------------------------------------------------------ Klaviyo (best-effort)
    function klaviyoBootstrap() {
        try {
            if (!window.klaviyo && !document.querySelector('script[src*="klaviyo.js"]')) {
                window._klOnsite = window._klOnsite || [];
                var s = document.createElement('script');
                s.async = true;
                s.src = 'https://static.klaviyo.com/onsite/js/' + KLAVIYO_COMPANY_ID +
                    '/klaviyo.js?company_id=' + KLAVIYO_COMPANY_ID;
                document.head.appendChild(s);
            }
        } catch (e) { /* never block the plan on Klaviyo */ }
    }

    function klaviyoIdentify(email) {
        try {
            if (window.klaviyo && typeof window.klaviyo.identify === 'function') {
                window.klaviyo.identify({ email: email });
                if (typeof window.klaviyo.track === 'function') {
                    window.klaviyo.track('Meal Program Plan Unlocked', { source: 'meal-program.html' });
                }
            } else if (window._klOnsite) {
                window._klOnsite.push(['identify', { email: email }]);
                window._klOnsite.push(['track', 'Meal Program Plan Unlocked', { source: 'meal-program.html' }]);
            }
        } catch (e) { /* best-effort only */ }
    }

    function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

    function unlockAndGenerate() {
        readNumbers();
        App.plan = null;
        window.MealProgramPlanView.generateAndRender();
        App.goToStep('plan');
    }

    // ------------------------------------------------------------ init
    function init(app) {
        App = app;
        populateStates();
        restoreForm();
        klaviyoBootstrap();

        bindPills('mp-tier-pills', 'data-tier', function (v) { App.answers.tierOverride = v; });
        bindPills('mp-goal-pills', 'data-goal', function (v) {
            App.answers.goal = v;
            App.renderPicker(); // goal re-orders the picker pools
        });
        bindPills('mp-sex-pills', 'data-sex', function (v) { App.answers.sex = v; });
        bindPills('mp-activity-pills', 'data-activity', function (v) { App.answers.dayActivity = v; });
        bindPills('mp-intensity-pills', 'data-intensity', function (v) { App.answers.intensity = v; });
        bindPills('mp-frequency-pills', 'data-frequency', function (v) { App.answers.frequency = v; });
        bindPills('mp-allergies', 'data-allergy', function (v) { toggleAllergy(v); }, true);

        document.getElementById('mp-state').addEventListener('change', function (e) {
            App.answers.state = e.target.value; App.persist();
        });

        document.getElementById('mp-budget-back').addEventListener('click', function () { App.goToStep('picker'); });
        document.getElementById('mp-budget-next').addEventListener('click', function () {
            readNumbers(); App.goToStep('profile');
        });
        document.getElementById('mp-profile-back').addEventListener('click', function () { App.goToStep('budget'); });
        document.getElementById('mp-profile-next').addEventListener('click', function () {
            readNumbers();
            // Logged-in users (or returning unlocked users) skip the gate — Q38 pattern.
            if (App.authUser || validEmail(App.email)) unlockAndGenerate();
            else App.goToStep('email');
        });
        document.getElementById('mp-email-back').addEventListener('click', function () { App.goToStep('profile'); });
        document.getElementById('mp-email-form').addEventListener('submit', function (e) {
            e.preventDefault();
            var email = document.getElementById('mp-email').value;
            if (!validEmail(email)) {
                document.getElementById('mp-email').focus();
                return;
            }
            App.email = String(email).trim();
            App.persist();
            klaviyoIdentify(App.email); // fire-and-forget; never gates the payoff
            unlockAndGenerate();
        });
    }

    window.MealProgramQuestions = { init: init };
})();
