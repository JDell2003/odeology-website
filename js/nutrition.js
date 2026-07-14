/* Nutrition page: the editable home for a user's meal plan.
   Order: MEALS first (7-day plan + per-slot add/remove), then the GROCERY
   LIST (store choice + bulk-vs-cheaper note), then the INGREDIENT list
   (uncheck to drop items). Everything regenerates through the meal engine
   from the answers saved at onboarding. No grocery calendar here — that
   lives on the Grocery Calendar page. */
(function () {
    'use strict';
    var C = window.MealProgramConstants, engine = window.MealProgramEngine, data = window.MealProgramData;
    var K = (C && C.storageKeys) || { picks: 'ode_meal_picks_v1', answers: 'ode_meal_answers_v1', plan: 'ode_meal_program_plan_v1' };
    var EXCL_KEY = 'ode_meal_excluded_ings_v1';

    function $(id) { return document.getElementById(id); }
    function money(v) { return '$' + Number(v || 0).toFixed(2); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    function readJSON(k, f) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? f : v; } catch (e) { return f; } }
    function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    var dataset = null, mealsById = {}, answers = null;
    var picks = { breakfast: [], lunch: [], dinner: [] };
    var defaultPicks = null;
    var excluded = {};                 // canonical grocery name -> true (dropped)
    var plan = null, activeStore = null;

    function statsFromAnswers(a) {
        a = a || {};
        return {
            sex: a.sex === 'female' ? 'female' : 'male',
            age: Number(a.age) || 30,
            heightIn: Number(a.heightIn) || 70,
            weightLb: Number(a.weightLb) || 180,
            goalWeightLb: Number(a.goalWeightLb) || Number(a.weightLb) || 180,
            goal: a.goal === 'cut' || a.goal === 'bulk' || a.goal === 'maintain' ? a.goal : 'maintain',
            dayActivity: a.dayActivity || 'MODERATE',
            intensity: a.intensity || 'AVERAGE',
            frequency: a.frequency || '3-4'
        };
    }
    function engineInput() {
        var a = answers || {};
        return {
            dataset: dataset, picks: picks, stats: statsFromAnswers(a),
            budgetMonthly: Number(a.budgetMonthly) || (C && C.budget.defaultMonthly) || 300,
            state: (typeof a.state === 'string' && a.state.length === 2) ? a.state : 'GA',
            storePref: a.storePref && a.storePref !== 'cheapest' ? a.storePref : null,
            dietaryPref: a.dietaryPref || 'no-restrictions',
            allergies: Array.isArray(a.allergies) && a.allergies.length ? a.allergies : ['none'],
            tierOverride: null,
            respectPicks: true   // edits on this page honor the exact meals chosen
        };
    }
    function regenerate() {
        try { plan = engine.generatePlan(engineInput()); } catch (e) { return; }
        picks = { breakfast: (plan.picks.breakfast || []).slice(), lunch: (plan.picks.lunch || []).slice(), dinner: (plan.picks.dinner || []).slice() };
        writeJSON(K.plan, plan);
        writeJSON(K.picks, plan.picks);
        activeStore = plan.store;
        render();
    }

    /* -------- grocery totals (respect excluded ingredients) -------- */
    function includedItems(store) {
        return (plan.groceryList || []).filter(function (it) {
            return it.stores[store] && !excluded[String(it.canonical).toLowerCase()];
        });
    }
    function storeMonthly(store) {
        return includedItems(store).reduce(function (s, it) { return s + (it.stores[store].monthlyCost || 0); }, 0);
    }

    /* ----------------------------- render ----------------------------- */
    function slotMeals(slot) {
        return (picks[slot] || []).map(function (id) { return mealsById[id]; }).filter(Boolean);
    }
    var SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']];

    function renderSummary() {
        var t = plan.targets, store = activeStore;
        var monthly = storeMonthly(store);
        $('nut-summary').innerHTML = [
            ['Tier', plan.tierLabel], ['Calories', t.calories + ' kcal'], ['Protein', t.proteinG + ' g'],
            ['Carbs', t.carbsG + ' g'], ['Fat', t.fatG + ' g'],
            ['Monthly', money(monthly)], ['Budget', money(plan.budgetMonthly)]
        ].map(function (r) { return '<div class="mp-sum-item"><span class="label">' + esc(r[0]) + '</span><span class="value">' + esc(r[1]) + '</span></div>'; }).join('');
        var fill = $('nut-budget-fill');
        var pct = Math.min(100, monthly / Math.max(1, plan.budgetMonthly) * 100);
        fill.style.width = pct + '%';
        fill.classList.toggle('over', monthly > plan.budgetMonthly);
        // One headline line; the detailed budget edits collapse behind a toggle.
        var box = $('nut-msgs'); box.innerHTML = '';
        var under = monthly <= plan.budgetMonthly;
        var head = '<div class="mp-msg ' + (under ? 'ok' : 'warn') + '">' + (under
            ? ('Under budget — ' + money(monthly) + ' of your ' + money(plan.budgetMonthly) + '/mo.')
            : ('Closest fit: ' + money(monthly) + ' vs ' + money(plan.budgetMonthly) + '/mo (' + money(monthly - plan.budgetMonthly) + ' over) at the ' + esc(plan.tierLabel) + '.')) + '</div>';
        var detail = (plan.messages || []).filter(Boolean);
        if (detail.length) {
            head += '<details class="nut-changes"><summary>What we changed to fit your budget (' + detail.length + ')</summary>' +
                '<ul>' + detail.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></details>';
        }
        box.innerHTML = head;
    }

    function recipeHtml(meal, mult) {
        var h = '<h5>Ingredients</h5><ul>' + (meal.ingredients || []).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
        h += '<h5>Instructions</h5><ol>' + (meal.instructions || []).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ol>';
        if (mult && mult !== 1) h = '<p class="mp-hint">Portion: ' + mult + '× per serving.</p>' + h;
        if (meal.source_url) h += '<p class="attribution">Recipe & photo: <a href="' + esc(meal.source_url) + '" target="_blank" rel="noopener nofollow">' + esc(String(meal.source_url).replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + '</a></p>';
        return h;
    }

    function renderMeals() {
        // Editable pick chips per slot (subtract / add).
        var picksBox = $('nut-picks');
        picksBox.innerHTML = SLOTS.map(function (s) {
            var chips = slotMeals(s[0]).map(function (m) {
                return '<span class="nut-chip"><img loading="lazy" alt="" src="' + esc(m.image_url || '') + '" onerror="this.style.display=\'none\'">' +
                    '<span class="nut-chip-name">' + esc(m.name) + '</span>' +
                    '<button type="button" class="nut-chip-x" data-remove-meal="' + m.id + '" data-slot="' + s[0] + '" aria-label="Remove">&times;</button></span>';
            }).join('');
            return '<div class="nut-slot"><div class="nut-slot-head"><span class="nut-slot-name">' + s[1] + '</span>' +
                '<button type="button" class="btn btn-ghost nut-add" data-add-slot="' + s[0] + '">+ Add ' + s[1].toLowerCase() + '</button></div>' +
                '<div class="nut-chips">' + (chips || '<span class="ns-muted tiny">No meals yet — add some.</span>') + '</div></div>';
        }).join('');

        // 7-day breakdown with expandable recipes.
        var box = $('nut-days'); box.innerHTML = '';
        var slotName = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', meal4: 'Meal 4' };
        var order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3, meal4: 4 };
        (plan.days || []).forEach(function (day) {
            var d = document.createElement('div'); d.className = 'mp-day';
            d.innerHTML = '<div class="mp-day-head"><h4>Day ' + day.day + '</h4><span class="totals">' + day.totals.calories + ' kcal · ' + day.totals.proteinG + 'g P</span></div>';
            day.slots.slice().sort(function (a, b) { return (order[a.slot] || 9) - (order[b.slot] || 9); }).forEach(function (ref) {
                var m = mealsById[ref.mealId]; if (!m) return;
                var row = document.createElement('div'); row.className = 'mp-meal-row';
                row.innerHTML = '<img loading="lazy" alt="" src="' + esc(m.image_url || '') + '">' +
                    '<div class="info"><span class="slot-tag">' + esc(slotName[ref.slot] || ref.slot) + '</span>' +
                    '<span class="name">' + esc(m.name) + '</span>' +
                    '<span class="meta">' + (ref.mult !== 1 ? ref.mult + '× · ' : '') + Math.round(m.calories * ref.mult) + ' kcal · ' + Math.round(m.protein_g * ref.mult) + 'g protein</span></div>';
                row.querySelector('img').onerror = function () { this.style.display = 'none'; };
                var rec = document.createElement('div'); rec.className = 'mp-recipe'; rec.innerHTML = recipeHtml(m, ref.mult);
                row.addEventListener('click', function () { rec.classList.toggle('open'); });
                d.appendChild(row); d.appendChild(rec);
            });
            box.appendChild(d);
        });
    }

    function renderGrocery() {
        var wrap = $('nut-stores'); wrap.innerHTML = '';
        var stores = (C && C.pricing.stores) || ['walmart', 'sams', 'target'];
        var monthlies = {}; stores.forEach(function (s) { monthlies[s] = storeMonthly(s); });
        var cheapest = stores.reduce(function (best, s) { return (best == null || monthlies[s] < monthlies[best]) ? s : best; }, null);
        stores.forEach(function (s) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mp-store-card' + (s === activeStore ? ' active' : '');
            btn.innerHTML = '<span class="name">' + esc(C.pricing.storeLabels[s]) + '</span><span class="price">' + money(monthlies[s]) + '/mo</span>' +
                '<span class="badge">' + (s === cheapest ? '<span class="cheapest">Cheapest</span>' : '') + (s === 'sams' ? ' bulk' : '') + '</span>';
            btn.addEventListener('click', function () { activeStore = s; render(); });
            wrap.appendChild(btn);
        });
        // Bulk explanation (Sam's is bulk).
        var note = $('nut-bulk-note');
        if (activeStore === 'sams') {
            note.innerHTML = '<strong>Bulk pricing.</strong> Sam\'s Club costs more up front because you\'re buying bigger sizes — but they last about <strong>2× longer</strong>, so it\'s usually <strong>cheaper per serving over time</strong>. Great if you have the storage and buy the same staples every month.';
            note.style.display = 'block';
        } else {
            note.innerHTML = 'Prefer buying in bulk? Sam\'s Club runs pricier up front but the bigger sizes last ~2× longer — cheaper per serving in the long run.';
            note.style.display = 'block';
        }
        // Items
        var box = $('nut-grocery'); box.innerHTML = '';
        var storeLabel = (C && C.pricing.storeLabels[activeStore]) || activeStore;
        includedItems(activeStore).slice().sort(function (a, b) { return (b.stores[activeStore].monthlyCost || 0) - (a.stores[activeStore].monthlyCost || 0); }).forEach(function (it) {
            var s = it.stores[activeStore];
            var row = document.createElement('div'); row.className = 'nut-groc-row';
            var buy = s.url ? '<a class="nut-buy" href="' + esc(s.url) + '" target="_blank" rel="noopener">Buy at ' + esc(storeLabel) + ' &rarr;</a>' : '';
            row.innerHTML =
                '<div class="nut-groc-main"><strong>' + esc(it.canonical) + '</strong>' +
                '<span class="nut-groc-sub">' + esc(s.size || '') + ' × ' + s.containers + (s.estimated ? ' · <span class="est">est.</span>' : '') + '</span></div>' +
                '<div class="nut-groc-right"><span class="nut-groc-cost">' + money(s.monthlyCost) + '</span>' + buy + '</div>';
            box.appendChild(row);
        });
        $('nut-free').textContent = (plan.freeItems && plan.freeItems.length) ? 'Pantry staples you likely have: ' + plan.freeItems.join(', ') + '.' : '';
    }

    function renderIngredients() {
        var box = $('nut-ingredients'); box.innerHTML = '';
        (plan.groceryList || []).slice().sort(function (a, b) { return String(a.canonical).localeCompare(String(b.canonical)); }).forEach(function (it) {
            var key = String(it.canonical).toLowerCase();
            var on = !excluded[key];
            var row = document.createElement('label'); row.className = 'nut-ing' + (on ? '' : ' is-off');
            row.innerHTML = '<input type="checkbox" ' + (on ? 'checked' : '') + ' data-ing="' + esc(key) + '"><span>' + esc(it.canonical) + '</span>' +
                '<span class="nut-ing-cat">' + esc(it.category || '') + '</span>';
            box.appendChild(row);
        });
    }

    function render() {
        if (!plan) return;
        if (!activeStore) activeStore = plan.store;
        renderSummary(); renderMeals(); renderGrocery(); renderIngredients();
    }

    /* --------------------------- add-meals modal --------------------------- */
    function openPicker(slot) {
        var a = answers || {};
        var pool = engine.slotPool(dataset.meals, slot, statsFromAnswers(a).goal, a.dietaryPref || 'no-restrictions', (a.allergies && a.allergies.length ? a.allergies : ['none']));
        var chosen = {};
        var modal = $('nut-picker');
        modal.querySelector('.nut-modal-title').textContent = 'Add ' + slot + ' meals';
        var grid = modal.querySelector('.nut-modal-grid');
        grid.innerHTML = pool.map(function (m) {
            var already = picks[slot].indexOf(m.id) >= 0;
            return '<button type="button" class="mp-card' + (already ? ' selected' : '') + '" data-pick="' + m.id + '"' + (already ? ' disabled' : '') + '>' +
                '<img loading="lazy" alt="" src="' + esc(m.image_url || '') + '" onerror="this.style.visibility=\'hidden\'">' +
                '<span class="mp-card-body"><span class="mp-card-name">' + esc(m.name) + '</span><span class="mp-card-meta">' + Number(m.calories) + ' kcal · ' + Number(m.protein_g) + 'g protein</span></span></button>';
        }).join('');
        grid.querySelectorAll('[data-pick]').forEach(function (b) {
            if (b.disabled) return;
            b.addEventListener('click', function () {
                var id = Number(b.getAttribute('data-pick'));
                if (chosen[id]) { delete chosen[id]; b.classList.remove('selected'); }
                else { chosen[id] = true; b.classList.add('selected'); }
            });
        });
        modal.querySelector('[data-modal-add]').onclick = function () {
            Object.keys(chosen).forEach(function (id) { id = Number(id); if (picks[slot].indexOf(id) < 0) picks[slot].push(id); });
            modal.hidden = true;
            regenerate();
        };
        modal.hidden = false;
    }

    /* ----------------------------- events ----------------------------- */
    function wire() {
        document.addEventListener('click', function (ev) {
            var rm = ev.target.closest('[data-remove-meal]');
            if (rm) {
                var slot = rm.getAttribute('data-slot'), id = Number(rm.getAttribute('data-remove-meal'));
                picks[slot] = (picks[slot] || []).filter(function (x) { return x !== id; });
                regenerate();
                return;
            }
            var add = ev.target.closest('[data-add-slot]');
            if (add) { openPicker(add.getAttribute('data-add-slot')); return; }
            if (ev.target.closest('[data-modal-close]')) { $('nut-picker').hidden = true; return; }
        });
        document.addEventListener('change', function (ev) {
            var ing = ev.target.closest('[data-ing]');
            if (ing) {
                var key = ing.getAttribute('data-ing');
                if (ing.checked) delete excluded[key]; else excluded[key] = true;
                writeJSON(EXCL_KEY, excluded);
                render();
            }
        });
        var def = $('nut-default'); if (def) def.addEventListener('click', function () {
            if (!defaultPicks) return;
            picks = { breakfast: defaultPicks.breakfast.slice(), lunch: defaultPicks.lunch.slice(), dinner: defaultPicks.dinner.slice() };
            excluded = {}; writeJSON(EXCL_KEY, excluded);
            regenerate();
        });
        var res = $('nut-restart'); if (res) res.addEventListener('click', function () {
            if (window.confirm('Restart your meal plan from scratch?')) window.location.href = 'meal-program.html';
        });
    }

    /* --------------- coach's nutrition PDF (from trainer) ---------------
       Trainers send a nutrition PDF from their dashboard ("Send nutrition
       PDF"); it lands in client-docs on the server. Here the client sees a
       card to view or download whatever their coach most recently sent.
       Runs independently of whether the client has built a meal plan. */
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
    function loadCoachDoc() {
        var sec = $('nut-coach-doc');
        if (!sec) return;
        fetch('/api/training/client-doc', { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) {
                var docs = (j && Array.isArray(j.docs)) ? j.docs : [];
                var doc = docs.filter(function (d) { return d && d.kind === 'nutrition' && d.dataUrl; })[0];
                if (!doc) return;                       // no PDF from coach — stay hidden
                var titleEl = $('nut-coach-doc-title'), metaEl = $('nut-coach-doc-meta');
                if (titleEl) titleEl.textContent = doc.filename || 'Your nutrition PDF';
                if (metaEl) {
                    var who = doc.fromTrainerName ? ('From ' + doc.fromTrainerName) : 'From your coach';
                    var when = '';
                    try { when = doc.at ? new Date(doc.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; } catch (e) {}
                    metaEl.textContent = who + (when ? ' · ' + when : '');
                }
                var url = dataUrlToBlobUrl(doc.dataUrl) || doc.dataUrl;
                var viewBtn = $('nut-coach-doc-view'), dlBtn = $('nut-coach-doc-download');
                if (viewBtn) viewBtn.addEventListener('click', function () { window.open(url, '_blank', 'noopener'); });
                if (dlBtn) dlBtn.addEventListener('click', function () {
                    var a = document.createElement('a');
                    a.href = url; a.download = doc.filename || 'nutrition-plan.pdf';
                    document.body.appendChild(a); a.click(); a.remove();
                });
                sec.hidden = false;
                // The coach PDF IS the plan: embed it under the title and hide
                // the generated meal-plan / empty state / edit controls so the
                // two never show at once.
                var frame = $('nut-coach-doc-frame'), viewer = $('nut-coach-doc-viewer');
                if (frame && viewer) { frame.src = url; viewer.hidden = false; }
                var planEl = $('nutrition-plan'); if (planEl) { planEl.hidden = true; planEl.style.display = 'none'; }
                var emptyEl = $('nutrition-empty'); if (emptyEl) { emptyEl.hidden = true; emptyEl.style.display = 'none'; }
                var defBtn = $('nut-default'); if (defBtn) defBtn.style.display = 'none';
                var rstBtn = $('nut-restart'); if (rstBtn) rstBtn.style.display = 'none';
            })
            .catch(function () {});
    }
    loadCoachDoc();

    /* ----------------------------- boot ----------------------------- */
    plan = readJSON(K.plan, null);
    answers = readJSON(K.answers, {});
    excluded = readJSON(EXCL_KEY, {}) || {};
    var emptyEl = $('nutrition-empty'), planEl = $('nutrition-plan');
    if (!plan || !plan.days) { if (emptyEl) { emptyEl.hidden = false; emptyEl.style.display = ''; } if (planEl) planEl.style.display = 'none'; return; }
    if (emptyEl) emptyEl.style.display = 'none';
    if (planEl) { planEl.hidden = false; planEl.style.display = 'block'; }
    picks = { breakfast: (plan.picks.breakfast || []).slice(), lunch: (plan.picks.lunch || []).slice(), dinner: (plan.picks.dinner || []).slice() };
    defaultPicks = { breakfast: picks.breakfast.slice(), lunch: picks.lunch.slice(), dinner: picks.dinner.slice() };
    activeStore = plan.store;
    wire();
    if (!data) { render(); return; }
    data.load().then(function (ds) {
        dataset = ds; mealsById = {}; ds.meals.forEach(function (m) { mealsById[m.id] = m; });
        render();
    }).catch(function () { render(); });
})();
