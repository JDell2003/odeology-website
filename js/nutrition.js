/* Nutrition page: renders the saved meal-program plan (7-day meals, priced
   grocery list, ingredients, budget fit) using the meal-program plan renderer,
   and seeds the grocery calendar from the same plan so it works out of the box.
   Reads localStorage 'ode_meal_program_plan_v1' (written at onboarding). */
(function () {
    'use strict';

    var plan = null;
    try { plan = JSON.parse(localStorage.getItem('ode_meal_program_plan_v1') || 'null'); } catch (e) { plan = null; }

    // 1) SYNC THE GROCERY CALENDAR (synchronous — must run before
    // js/grocery-calendar.js reads localStorage further down the page).
    if (plan && window.MealProgramOnboarding && window.MealProgramConstants) {
        try {
            var payload = window.MealProgramOnboarding.planToGroceryPayload(plan);
            if (payload && Array.isArray(payload.items) && payload.items.length) {
                localStorage.setItem('ode_grocery_calendar_items_v1', JSON.stringify({
                    items: payload.items,
                    unit: 'servings',
                    startDate: new Date().toISOString().slice(0, 10),
                    savedAt: new Date().toISOString()
                }));
            }
        } catch (e) { /* calendar just stays on whatever was last synced */ }
    }

    // 2) EMPTY STATE vs PLAN. Use inline display (not the [hidden] attr) —
    // .plan-card / .mp-step both set `display`, which beats [hidden].
    var emptyEl = document.getElementById('nutrition-empty');
    var planEl = document.getElementById('mp-step-plan');
    if (!plan || !plan.days) {
        if (emptyEl) { emptyEl.hidden = false; emptyEl.style.display = ''; }
        if (planEl) planEl.style.display = 'none';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (planEl) { planEl.hidden = false; planEl.style.display = 'block'; planEl.classList.add('active'); }

    // 3) RICH RENDER via the shared meal-program plan renderer.
    if (!window.MealProgramData || !window.MealProgramPlanView) return;
    window.MealProgramData.load().then(function (dataset) {
        var App = {
            plan: plan,
            dataset: dataset,
            picks: plan.picks || { breakfast: [], lunch: [], dinner: [] },
            persistPlan: function () { /* read-only view */ },
            clearAll: function () { try { localStorage.removeItem('ode_meal_program_plan_v1'); } catch (e) {} },
            // The renderer's built-in "start over" flow routes back to the picker;
            // on this page that means rebuilding from the full meal program.
            renderPicker: function () { window.location.href = 'meal-program.html'; },
            goToStep: function () { window.location.href = 'meal-program.html'; }
        };
        try {
            window.MealProgramPlanView.init(App);
            window.MealProgramPlanView.render();
        } catch (e) {
            if (window.console) console.warn('[nutrition] render failed', e);
        }
    }).catch(function () { /* dataset offline — plan section stays as-is */ });
})();
