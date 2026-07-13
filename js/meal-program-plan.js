// js/meal-program-plan.js — Meal Program Work Order Phase 4: plan output screen.
// Renders the engine result: summary bar, budget bar, ladder messages, 3-store comparison,
// priced grocery list (free items separate), 7-day meal cards with recipe accordions + attribution.
(function () {
    'use strict';

    var C = window.MealProgramConstants;
    var engine = window.MealProgramEngine;
    var App = null;
    var mealsById = {};

    function $(id) { return document.getElementById(id); }
    function money(v) { return '$' + Number(v).toFixed(2); }
    function esc(s) {
        var d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    function generate() {
        var a = App.answers;
        App.plan = engine.generatePlan({
            dataset: App.dataset,
            picks: App.picks,
            stats: {
                sex: a.sex, age: a.age, heightIn: a.heightIn, weightLb: a.weightLb,
                goalWeightLb: a.goalWeightLb, goal: a.goal,
                dayActivity: a.dayActivity, intensity: a.intensity, frequency: a.frequency
            },
            budgetMonthly: a.budgetMonthly,
            state: a.state,
            storePref: a.storePref,
            dietaryPref: a.dietaryPref,
            allergies: a.allergies,
            tierOverride: a.tierOverride || null
        });
        App.persistPlan();
    }

    function renderSummary(plan, store) {
        var t = plan.targets;
        $('mp-plan-summary').innerHTML = [
            ['Store', C.pricing.storeLabels[store]],
            ['Tier', plan.tierLabel],
            ['Calories', t.calories + ' kcal'],
            ['Protein', t.proteinG + ' g'],
            ['Carbs', t.carbsG + ' g'],
            ['Fat', t.fatG + ' g'],
            ['Monthly cost', money(plan.costs[store].monthly)],
            ['Budget', money(plan.budgetMonthly)]
        ].map(function (row) {
            return '<div class="mp-sum-item"><span class="label">' + esc(row[0]) +
                '</span><span class="value">' + esc(row[1]) + '</span></div>';
        }).join('');

        var pct = Math.min(100, plan.costs[store].monthly / plan.budgetMonthly * 100);
        var fill = $('mp-budget-fill');
        fill.style.width = pct + '%';
        fill.classList.toggle('over', plan.costs[store].monthly > plan.budgetMonthly);
    }

    function renderMessages(plan, store) {
        var box = $('mp-plan-msgs');
        box.innerHTML = '';
        var monthly = plan.costs[store].monthly;
        var head = document.createElement('div');
        if (monthly <= plan.budgetMonthly) {
            head.className = 'mp-msg ok';
            head.textContent = 'Under budget: ' + money(monthly) + ' of your ' +
                money(plan.budgetMonthly) + '/mo at ' + C.pricing.storeLabels[store] + '.';
        } else {
            head.className = 'mp-msg warn';
            head.textContent = 'Over budget at ' + C.pricing.storeLabels[store] + ': ' + money(monthly) +
                ' vs ' + money(plan.budgetMonthly) + '/mo (' + money(monthly - plan.budgetMonthly) + ' gap).';
        }
        box.appendChild(head);
        plan.messages.forEach(function (m) {
            var el = document.createElement('div');
            el.className = 'mp-msg';
            el.textContent = m;
            box.appendChild(el);
        });
        plan.warnings.forEach(function (w) {
            var el = document.createElement('div');
            el.className = 'mp-msg warn';
            el.textContent = w;
            box.appendChild(el);
        });
        if (plan.estimatedPrices) {
            var est = document.createElement('div');
            est.className = 'mp-msg';
            est.textContent = 'Some prices are estimates (marked in the list) — expect small differences at the shelf.';
            box.appendChild(est);
        }
    }

    function renderStores(plan, activeStore) {
        var wrap = $('mp-store-compare');
        wrap.innerHTML = '';
        var cheapest = engine.cheapestStore(plan.costs);
        C.pricing.stores.forEach(function (s) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mp-store-card' + (s === activeStore ? ' active' : '');
            btn.innerHTML = '<span class="name">' + esc(C.pricing.storeLabels[s]) + '</span>' +
                '<span class="price">' + money(plan.costs[s].monthly) + '/mo</span>' +
                '<span class="badge">' +
                (s === cheapest ? '<span class="cheapest">Cheapest</span>' : '') +
                (s === 'sams' && C.pricing.samsMembershipBadge ? ' membership required' : '') +
                '</span>';
            btn.addEventListener('click', function () { render(s); });
            wrap.appendChild(btn);
        });
    }

    function renderGroceries(plan, store) {
        $('mp-grocery-store').textContent = C.pricing.storeLabels[store];
        $('mp-grocery-monthly').textContent = money(plan.costs[store].monthly) + ' / month · ' +
            money(plan.costs[store].weekly) + ' / week';
        var box = $('mp-grocery-items');
        box.innerHTML = '';
        plan.groceryList.slice().sort(function (a, b) {
            var ca = a.stores[store] ? a.stores[store].monthlyCost : 0;
            var cb = b.stores[store] ? b.stores[store].monthlyCost : 0;
            return cb - ca;
        }).forEach(function (item) {
            var s = item.stores[store];
            if (!s) return;
            var row = document.createElement('div');
            row.className = 'mp-grocery-item';
            row.innerHTML =
                '<div><strong>' + esc(item.canonical) + '</strong>' +
                '<span class="qty">' + esc(s.product || '') + ' · ' + esc(s.size || '') +
                ' × ' + s.containers + '</span></div>' +
                '<div class="cost">' + money(s.monthlyCost) +
                (s.estimated ? '<span class="est">estimated</span>' : '') + '</div>';
            box.appendChild(row);
        });
        $('mp-free-items').textContent = plan.freeItems.length ?
            'Pantry staples you likely have: ' + plan.freeItems.join(', ') + '.' : '';
    }

    function recipeHtml(meal, mult) {
        var html = '<h5>Ingredients</h5><ul>' + (meal.ingredients || []).map(function (i) {
            return '<li>' + esc(i) + '</li>';
        }).join('') + '</ul>';
        html += '<h5>Instructions</h5><ol>' + (meal.instructions || []).map(function (i) {
            return '<li>' + esc(i) + '</li>';
        }).join('') + '</ol>';
        if (mult !== 1) {
            html = '<p class="mp-hint">Portion: ' + mult + '× the recipe below (per serving).</p>' + html;
        }
        if (meal.prep_time) html += '<p class="mp-hint">Prep: ' + esc(meal.prep_time) + '</p>';
        if (meal.note) html += '<p class="mp-hint">' + esc(meal.note) + '</p>';
        if (meal.source_url) {
            html += '<p class="attribution">Recipe & photo: <a href="' + esc(meal.source_url) +
                '" target="_blank" rel="noopener nofollow">' + esc(meal.source_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + '</a></p>';
        }
        return html;
    }

    function renderDays(plan) {
        var box = $('mp-days');
        box.innerHTML = '';
        var slotOrder = { breakfast: 0, lunch: 1, dinner: 2, snack: 3, meal4: 4 };
        var slotNames = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', meal4: 'Meal 4' };
        plan.days.forEach(function (day) {
            var d = document.createElement('div');
            d.className = 'mp-day';
            d.innerHTML = '<div class="mp-day-head"><h4>Day ' + day.day + '</h4>' +
                '<span class="totals">' + day.totals.calories + ' kcal · ' + day.totals.proteinG +
                'g P · ' + day.totals.carbsG + 'g C · ' + day.totals.fatG + 'g F</span></div>';
            day.slots.slice().sort(function (a, b) {
                return (slotOrder[a.slot] || 9) - (slotOrder[b.slot] || 9);
            }).forEach(function (ref) {
                var meal = mealsById[ref.mealId];
                if (!meal) return;
                var row = document.createElement('div');
                row.className = 'mp-meal-row';
                row.innerHTML =
                    '<img loading="lazy" alt="" src="' + esc(meal.image_url || '') + '">' +
                    '<div class="info"><span class="slot-tag">' + esc(slotNames[ref.slot] || ref.slot) + '</span>' +
                    '<span class="name">' + esc(meal.name) + '</span>' +
                    '<span class="meta">' + (ref.mult !== 1 ? ref.mult + '× serving · ' : '') +
                    Math.round(meal.calories * ref.mult) + ' kcal · ' +
                    Math.round(meal.protein_g * ref.mult) + 'g protein</span></div>';
                var img = row.querySelector('img');
                img.onerror = function () { this.style.display = 'none'; };
                var recipe = document.createElement('div');
                recipe.className = 'mp-recipe';
                recipe.innerHTML = recipeHtml(meal, ref.mult);
                row.addEventListener('click', function () { recipe.classList.toggle('open'); });
                d.appendChild(row);
                d.appendChild(recipe);
            });
            box.appendChild(d);
        });
    }

    function render(storeOverride) {
        var plan = App.plan;
        if (!plan) return;
        mealsById = {};
        App.dataset.meals.forEach(function (m) { mealsById[m.id] = m; });
        var store = storeOverride || plan.store;
        renderSummary(plan, store);
        renderMessages(plan, store);
        renderStores(plan, store);
        renderGroceries(plan, store);
        renderDays(plan);
    }

    function generateAndRender() {
        generate();
        render();
    }

    function init(app) {
        App = app;
        $('mp-print').addEventListener('click', function () { window.print(); });
        $('mp-start-over').addEventListener('click', function () {
            if (!window.confirm('Start over? Your picks and plan will be cleared.')) return;
            App.clearAll();
            App.plan = null;
            App.picks = { breakfast: [], lunch: [], dinner: [] };
            App.renderPicker();
            App.goToStep('picker');
        });
    }

    window.MealProgramPlanView = {
        init: init,
        render: function (s) { render(s); },
        generateAndRender: generateAndRender
    };
})();
