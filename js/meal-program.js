// js/meal-program.js — Meal Program Work Order Phase 1: wizard shell + picture picker.
// Vanilla IIFE on window.* (house style). Anonymous-first; localStorage via ode_*_v1 keys.
(function () {
    'use strict';

    var C = window.MealProgramConstants;
    var engine = window.MealProgramEngine;

    var PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#2a211a"/>' +
        '<text x="2" y="1.7" font-size="0.5" fill="#c58d4f" text-anchor="middle" font-family="sans-serif">RiseForIt</text></svg>'
    );

    var STEPS = ['picker', 'budget', 'profile', 'email', 'plan'];
    var TABS = ['breakfast', 'lunch', 'dinner'];
    var TAB_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

    var App = {
        dataset: null,
        authUser: null,
        step: 'picker',
        activeTab: 'breakfast',
        picks: { breakfast: [], lunch: [], dinner: [] },
        answers: {
            budgetMonthly: C.budget.defaultMonthly, tierOverride: '', storePref: 'cheapest', state: 'GA',
            dietaryPref: 'no-restrictions', allergies: ['none'],
            goal: 'bulk', sex: 'male', age: 25, heightIn: 70, weightLb: 180, goalWeightLb: 190,
            dayActivity: 'MODERATE', intensity: 'AVERAGE', frequency: '3-4'
        },
        email: null,
        plan: null
    };
    window.MealProgramApp = App;

    // ------------------------------------------------------------ storage
    function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
    function loadJSON(key) {
        try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
        catch (e) { return null; }
    }
    App.persist = function () {
        saveJSON(C.storageKeys.picks, App.picks);
        saveJSON(C.storageKeys.answers, App.answers);
        if (App.email) saveJSON(C.storageKeys.email, App.email);
    };
    App.persistPlan = function () { saveJSON(C.storageKeys.plan, App.plan); };
    App.clearAll = function () {
        Object.keys(C.storageKeys).forEach(function (k) {
            try { localStorage.removeItem(C.storageKeys[k]); } catch (e) {}
        });
    };

    // ------------------------------------------------------------ steps
    App.goToStep = function (step) {
        App.step = step;
        STEPS.forEach(function (s) {
            var el = document.getElementById('mp-step-' + s);
            if (el) el.classList.toggle('active', s === step);
        });
        var fill = document.getElementById('mp-progress-fill');
        if (fill) fill.style.width = ((STEPS.indexOf(step) + 1) / STEPS.length * 100) + '%';
        var titles = {
            picker: ['Pick the meals you actually want to eat', "Tap the photos. We'll turn your picks into a 7-day plan that fits your budget."],
            budget: ['Set your budget', 'Your budget drives your protein tier — we squeeze the most muscle out of every dollar.'],
            profile: ['About you', 'These set your calorie and protein targets (Mifflin-St Jeor — same math as our macro calculator).'],
            email: ['Almost there', ''],
            plan: ['Your 7-day plan', 'Meals you picked, priced at three stores, scaled to your targets.']
        };
        var t = titles[step];
        document.getElementById('mp-title').textContent = t[0];
        document.getElementById('mp-subtitle').textContent = t[1];
        window.scrollTo(0, 0);
    };

    // ------------------------------------------------------------ picker
    function pool(tab) {
        // Picker shows the full tab pool (dietary answers come later — Q22 order);
        // ordering favors the current goal, then cheapest (deterministic).
        return engine.slotPool(App.dataset.meals, tab, App.answers.goal, 'no-restrictions', []);
    }

    function minFor(tab) { return C.picker.minPicksPerSlot[tab] || 2; }

    function pickerMet() {
        return TABS.every(function (t) { return App.picks[t].length >= minFor(t); });
    }

    function renderTabs() {
        var wrap = document.getElementById('mp-tabs');
        wrap.innerHTML = '';
        TABS.forEach(function (tab) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mp-tab' + (tab === App.activeTab ? ' active' : '') +
                (App.picks[tab].length >= minFor(tab) ? ' met' : '');
            btn.setAttribute('role', 'tab');
            btn.innerHTML = TAB_LABELS[tab] +
                '<span class="mp-tab-count">' + App.picks[tab].length + ' picked · min ' + minFor(tab) + '</span>';
            btn.addEventListener('click', function () { App.activeTab = tab; renderPicker(); });
            wrap.appendChild(btn);
        });
    }

    function otherTabHas(tab, id) {
        return TABS.some(function (t) { return t !== tab && App.picks[t].indexOf(id) >= 0; });
    }

    function renderGrid() {
        var grid = document.getElementById('mp-grid');
        var tab = App.activeTab;
        grid.innerHTML = '';
        pool(tab).forEach(function (meal) {
            var selected = App.picks[tab].indexOf(meal.id) >= 0;
            var card = document.createElement('button');
            card.type = 'button';
            card.className = 'mp-card' + (selected ? ' selected' : '') +
                (otherTabHas(tab, meal.id) ? ' already' : '');
            card.setAttribute('aria-pressed', selected ? 'true' : 'false');
            var img = document.createElement('img');
            img.loading = 'lazy';
            img.alt = meal.name;
            img.src = meal.image_url || PLACEHOLDER_IMG;
            img.onerror = function () { this.onerror = null; this.src = PLACEHOLDER_IMG; };
            card.appendChild(img);
            var goalPill = document.createElement('span');
            goalPill.className = 'mp-goal-pill';
            goalPill.textContent = meal.goal;
            card.appendChild(goalPill);
            var body = document.createElement('div');
            body.className = 'mp-card-body';
            body.innerHTML = '<span class="mp-card-name"></span>' +
                '<span class="mp-card-meta">' + meal.calories + ' kcal · ' + meal.protein_g + 'g protein</span>';
            body.querySelector('.mp-card-name').textContent = meal.name;
            card.appendChild(body);
            card.addEventListener('click', function () { togglePick(tab, meal.id); });
            grid.appendChild(card);
        });
    }

    function togglePick(tab, id) {
        var arr = App.picks[tab];
        var i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1);
        else {
            if (arr.length >= C.picker.maxPicksPerSlot) return;
            arr.push(id);
        }
        App.persist();
        renderPicker();
    }

    function renderPicker() {
        renderTabs();
        renderGrid();
        var hint = document.getElementById('mp-pick-hint');
        var tab = App.activeTab;
        hint.textContent = 'Pick ' + minFor(tab) + '–' + C.picker.maxPicksPerSlot + ' ' +
            TAB_LABELS[tab].toLowerCase() + ' meals. Snacks are added automatically to hit your targets.';
        document.getElementById('mp-picker-next').disabled = !pickerMet();
    }
    App.renderPicker = renderPicker;

    function surprise() {
        var tab = App.activeTab;
        var ids = engine.surprisePicks(App.dataset.meals, tab, App.answers.goal, 'no-restrictions', []);
        var arr = App.picks[tab];
        ids.forEach(function (id) {
            if (arr.length < Math.max(minFor(tab), C.picker.surpriseCount) && arr.indexOf(id) < 0) arr.push(id);
        });
        App.persist();
        renderPicker();
    }

    // ------------------------------------------------------------ auth prefill
    function fetchAuth() {
        return fetch('/api/auth/me', { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) {
                var user = j && (j.user || j);
                if (user && (user.id || user.email)) {
                    App.authUser = user;
                    if (user.email) App.email = App.email || user.email;
                    // Best-effort prefill from profile fields when the API exposes them.
                    var p = user.profile || user;
                    if (p.sex === 'male' || p.sex === 'female') App.answers.sex = p.sex;
                    if (p.age) App.answers.age = Number(p.age) || App.answers.age;
                    if (p.location_state) App.answers.state = String(p.location_state).toUpperCase();
                }
            })
            .catch(function () { /* anonymous-first: ignore */ });
    }

    // ------------------------------------------------------------ boot
    function boot() {
        var errBox = document.getElementById('mp-load-error');
        errBox.style.display = 'none';
        Promise.all([window.MealProgramData.load(), fetchAuth()])
            .then(function (results) {
                App.dataset = results[0];

                var savedPicks = loadJSON(C.storageKeys.picks);
                if (savedPicks) TABS.forEach(function (t) {
                    if (Array.isArray(savedPicks[t])) App.picks[t] = savedPicks[t];
                });
                var savedAnswers = loadJSON(C.storageKeys.answers);
                if (savedAnswers) Object.keys(App.answers).forEach(function (k) {
                    if (savedAnswers[k] !== undefined) App.answers[k] = savedAnswers[k];
                });
                App.email = App.email || loadJSON(C.storageKeys.email);

                window.MealProgramQuestions.init(App);
                window.MealProgramPlanView.init(App);
                renderPicker();

                var savedPlan = loadJSON(C.storageKeys.plan);
                if (savedPlan && savedPlan.days) {
                    App.plan = savedPlan;
                    window.MealProgramPlanView.render();
                    App.goToStep('plan');
                } else {
                    App.goToStep('picker');
                }
            })
            .catch(function (err) {
                errBox.style.display = 'block';
                if (window.console) console.error('meal-program boot failed', err);
            });
    }

    document.getElementById('mp-retry').addEventListener('click', boot);
    document.getElementById('mp-surprise').addEventListener('click', surprise);
    document.getElementById('mp-picker-next').addEventListener('click', function () {
        if (pickerMet()) App.goToStep('budget');
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
