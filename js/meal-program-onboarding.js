// js/meal-program-onboarding.js — Meal Program Part 2: onboarding integration.
// Bridges the index.html entry flow / client quiz to the pure meal engine so that the
// moment onboarding finishes, the meal plan exists everywhere the app looks for it:
//   1. localStorage ode_meal_program_plan_v1  (meal-program.html full view)
//   2. localStorage ode_meal_plan_snapshot_v1 (legacy meal-logging snapshot: check-ins "meals on plan")
//   3. POST /api/groceries/save               (app_grocery_lists -> overview.html grocery section)
// Pure mapping logic is exported for node tests (UMD); DOM/localStorage/fetch only in persist().
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../core/mealProgramConstants'), require('../core/mealProgramEngine'));
    } else {
        root.MealProgramOnboarding = factory(root.MealProgramConstants, root.MealProgramEngine);
    }
})(typeof self !== 'undefined' ? self : this, function (C, engine) {
    'use strict';

    // ---------------------------------------------------------- answer maps
    // All quiz labels below MIRROR js/client-quiz.js SCREENS / index.html entry flow.
    var AGE_RANGE_MID = { '18 – 29': 24, '30 – 39': 35, '40 – 49': 45, '50+': 55 };
    var GOAL_BY_BODY_GOAL = {
        'A few sizes smaller': 'cut',
        'Athletic': 'maintain',
        'Ripped': 'cut',
        'Swole': 'bulk'
    };
    var ACTIVITY_BY_DAILY = {
        'I spend most of the day sitting': 'SEDENTARY',
        'I take active breaks': 'MODERATE',
        "I'm on my feet all day long": 'ACTIVE'
    };
    var FREQUENCY_BY_WORKOUT_FREQ = {
        '1 - 3 times a week': '1-2',
        '4 - 5 times a week': '3-4',
        '6 - 7 times a week': '5-6',
        'Not sure yet': '3-4'
    };
    var BUDGET_BY_CHOICE = {
        'Under $200': 200, 'Around $300': 300, 'Around $400': 400, '$500 or more': 500
    };
    var DIETARY_BY_LABEL = {
        'No restrictions': 'no-restrictions', 'Vegetarian': 'vegetarian', 'Vegan': 'vegan',
        'Pescatarian': 'pescatarian', 'No red meat': 'no-red-meat'
    };
    var ALLERGY_BY_LABEL = { 'Fish': 'fish', 'Eggs': 'eggs', 'Dairy': 'dairy', 'Gluten': 'gluten' };

    function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }

    // Quiz raw answers (client-quiz.js `answers`) -> engine input pieces. Pure.
    function mapQuizToEngineInput(raw) {
        var a = raw || {};
        var heightIn = null;
        if (a.heightUnit === 'cm' && num(a.heightCm)) heightIn = num(a.heightCm) / 2.54;
        else if (num(a.heightFt)) heightIn = num(a.heightFt) * 12 + (num(a.heightIn) || 0);

        var toLb = function (value, unit) {
            var v = num(value);
            if (v == null) return null;
            return unit === 'kg' ? v * C.lbPerKg : v;
        };

        var stats = {
            sex: a.gender === 'Female' ? 'female' : 'male',
            age: num(a.ageYears) || AGE_RANGE_MID[a.ageRange] || 30,
            heightIn: heightIn || 70,
            weightLb: toLb(a.weightValue, a.weightUnit) || 180,
            goalWeightLb: toLb(a.goalWeightValue, a.goalWeightUnit) || toLb(a.weightValue, a.weightUnit) || 180,
            goal: GOAL_BY_BODY_GOAL[a.bodyGoal] || 'maintain',
            dayActivity: ACTIVITY_BY_DAILY[a.dailyActivity] || 'MODERATE',
            intensity: 'AVERAGE', // DESIGN: quiz has no direct intensity question
            frequency: FREQUENCY_BY_WORKOUT_FREQ[a.workoutFreq] || '3-4'
        };

        var allergies = Array.isArray(a.allergies)
            ? a.allergies.map(function (l) { return ALLERGY_BY_LABEL[l]; }).filter(Boolean)
            : [];
        if (!allergies.length) allergies = ['none'];

        return {
            stats: stats,
            picks: {
                breakfast: Array.isArray(a.mealPicksBreakfast) ? a.mealPicksBreakfast.slice() : [],
                lunch: Array.isArray(a.mealPicksLunch) ? a.mealPicksLunch.slice() : [],
                dinner: Array.isArray(a.mealPicksDinner) ? a.mealPicksDinner.slice() : []
            },
            budgetMonthly: BUDGET_BY_CHOICE[a.mealBudget] || C.budget.defaultMonthly,
            state: (typeof a.mealState === 'string' && a.mealState.length === 2) ? a.mealState : 'GA',
            storePref: 'cheapest',
            dietaryPref: DIETARY_BY_LABEL[a.dietaryPref] || 'no-restrictions',
            allergies: allergies
        };
    }

    // Engine plan -> legacy meal-logging snapshot (main.js saveMealPlanSnapshotForLogging shape).
    // Uses day 1 as the representative daily template. Pure.
    function planToLegacySnapshot(plan, dataset) {
        var byId = {};
        (dataset.meals || []).forEach(function (m) { byId[m.id] = m; });
        var day = (plan.days && plan.days[0]) || { slots: [] };
        var meals = day.slots.map(function (ref, idx) {
            var m = byId[ref.mealId];
            if (!m) return null;
            var item = {
                foodId: 'mealprogram_' + m.id,
                foodName: m.name,
                measurementText: ref.mult + '× serving',
                servings: ref.mult,
                grams: null,
                calories: Math.round(m.calories * ref.mult),
                protein_g: Math.round(m.protein_g * ref.mult),
                carbs_g: Math.round(m.carbs_g * ref.mult),
                fat_g: Math.round(m.fat_g * ref.mult)
            };
            return {
                index: idx + 1,
                items: [item],
                plannedText: '- ' + item.foodName + ' - ' + item.measurementText
            };
        }).filter(Boolean);
        return {
            savedAt: new Date().toISOString(),
            mealsPerDay: meals.length || 3,
            macroTargets: {
                calories: plan.targets.calories,
                protein: plan.targets.proteinG,
                carbs: plan.targets.carbsG,
                fat: plan.targets.fatG
            },
            meals: meals
        };
    }

    // Engine plan -> app_grocery_lists payload (core/groceriesRoutes.js sanitize shape,
    // fields the overview grocery cards renderer reads). Pure.
    function planToGroceryPayload(plan) {
        var store = plan.store;
        var spcTable = C.pricing.servingsPerContainerByCategory;
        var bulk = C.pricing.bulkFactorByStore[store] || 1;
        var items = (plan.groceryList || []).map(function (item) {
            var s = item.stores[store];
            if (!s) return null;
            var spc = (spcTable[item.category] || spcTable['default']) * bulk;
            var daily = (Number(item.servingsUsedWeekly) || 0) / 7;
            return {
                name: item.canonical,
                quantity: (s.size ? s.size + ' × ' : '') + s.containers,
                category: item.category || 'misc',
                estimatedWeeklyCost: Math.round((s.monthlyCost / C.pricing.weeksPerMonth) * 100) / 100,
                estimatedCost: s.monthlyCost,
                image: null,
                url: s.url || null,
                daily: Math.round(daily * 100) / 100,
                daysPerContainer: daily > 0 ? Math.round(spc / daily) : null,
                containerPrice: s.unitPrice,
                servingsPerContainer: spc,
                unit: 'servings'
            };
        }).filter(Boolean);
        return {
            source: 'grocery_generator',
            items: items,
            totals: {
                totalEstimatedWeeklyCost: plan.costs[store].weekly,
                totalEstimatedCost: plan.costs[store].monthly,
                currency: 'USD'
            },
            meta: {
                generatedAt: new Date().toISOString(),
                store: C.pricing.storeLabels[store],
                notes: 'meal_program_onboarding',
                macroTargets: {
                    calories: plan.targets.calories,
                    proteinG: plan.targets.proteinG,
                    carbG: plan.targets.carbsG,
                    fatG: plan.targets.fatG
                }
            }
        };
    }

    // Trainer default input (no body-stat questions on the trainer path):
    // deterministic starter plan, picks auto-backfilled by the engine. Pure.
    function trainerDefaultInput() {
        return {
            stats: {
                sex: 'male', age: 30, heightIn: 70, weightLb: 180, goalWeightLb: 180,
                goal: 'maintain', dayActivity: 'MODERATE', intensity: 'AVERAGE', frequency: '3-4'
            },
            picks: { breakfast: [], lunch: [], dinner: [] },
            budgetMonthly: C.budget.defaultMonthly,
            state: 'GA',
            storePref: 'cheapest',
            dietaryPref: 'no-restrictions',
            allergies: ['none']
        };
    }

    // ------------------------------------------------------------- persist
    function persist(plan, dataset, input) {
        try { localStorage.setItem(C.storageKeys.plan, JSON.stringify(plan)); } catch (e) {}
        try { localStorage.setItem(C.storageKeys.picks, JSON.stringify(plan.picks)); } catch (e) {}
        try {
            // Keep meal-program.html's saved answers coherent with what onboarding used.
            localStorage.setItem(C.storageKeys.answers, JSON.stringify({
                budgetMonthly: input.budgetMonthly, tierOverride: '', storePref: input.storePref,
                state: input.state, dietaryPref: input.dietaryPref, allergies: input.allergies,
                goal: input.stats.goal === 'gain' ? 'bulk' : input.stats.goal,
                sex: input.stats.sex, age: input.stats.age, heightIn: Math.round(input.stats.heightIn),
                weightLb: input.stats.weightLb, goalWeightLb: input.stats.goalWeightLb,
                dayActivity: input.stats.dayActivity, intensity: input.stats.intensity,
                frequency: input.stats.frequency
            }));
        } catch (e) {}
        try {
            localStorage.setItem('ode_meal_plan_snapshot_v1', JSON.stringify(planToLegacySnapshot(plan, dataset)));
        } catch (e) {}
        // Server persist (logged-in only; 401 is fine for anonymous flows).
        var save = fetch('/api/groceries/save', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(planToGroceryPayload(plan))
        }).then(function (r) { return { savedToAccount: r.ok }; })
          .catch(function () { return { savedToAccount: false }; });
        return save;
    }

    // ------------------------------------------------------------ entries
    function generateCore(input) {
        return window.MealProgramData.load().then(function (dataset) {
            var plan = engine.generatePlan({
                dataset: dataset,
                picks: input.picks,
                stats: input.stats,
                budgetMonthly: input.budgetMonthly,
                state: input.state,
                storePref: input.storePref,
                dietaryPref: input.dietaryPref,
                allergies: input.allergies,
                tierOverride: null
            });
            return persist(plan, dataset, input).then(function (srv) {
                return { plan: plan, savedToAccount: srv.savedToAccount };
            });
        });
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise(function (resolve) {
                setTimeout(function () { resolve({ plan: null, timedOut: true }); }, ms);
            })
        ]);
    }

    // Client entry-flow finish: quiz answers live at state.answers.user.bmQuiz.
    function generateFromEntryFlow(userAnswers, opts) {
        var raw = (userAnswers && userAnswers.bmQuiz) || {};
        var input = mapQuizToEngineInput(raw);
        return withTimeout(
            generateCore(input).catch(function (err) {
                if (window.console) console.warn('meal-program onboarding generation failed', err);
                return { plan: null, error: String(err && err.message || err) };
            }),
            (opts && opts.timeoutMs) || 6000
        );
    }

    // Trainer finish: deterministic starter plan so the trainer's own account is complete too.
    function generateDefaultForTrainer(opts) {
        return withTimeout(
            generateCore(trainerDefaultInput()).catch(function (err) {
                if (window.console) console.warn('meal-program trainer default generation failed', err);
                return { plan: null, error: String(err && err.message || err) };
            }),
            (opts && opts.timeoutMs) || 6000
        );
    }

    return {
        mapQuizToEngineInput: mapQuizToEngineInput,
        planToLegacySnapshot: planToLegacySnapshot,
        planToGroceryPayload: planToGroceryPayload,
        trainerDefaultInput: trainerDefaultInput,
        generateFromEntryFlow: generateFromEntryFlow,
        generateDefaultForTrainer: generateDefaultForTrainer
    };
});
