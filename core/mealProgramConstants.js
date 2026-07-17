// core/mealProgramConstants.js
// SINGLE SOURCE OF TRUTH FOR ALL MEAL-PROGRAM TUNABLES (mirrors the scoringConstants pattern).
// Do NOT scatter magic numbers in mealProgramEngine.js — read them from here.
//
// Confidence tags on each block:
//   HIGH     = settled/canonical published value — trust it.
//   MEDIUM   = well-established but approximate — fine to ship, refine later.
//   DESIGN   = owner/product decision (not a scientific constant).
//   MIRRORED = duplicated for browser use from an importable source
//              (core/scoringConstants.js or js/main.js). In Node the live
//              scoringConstants values are preferred at require-time, and
//              tests/mealProgram.engine.test.js asserts the literals below
//              still equal the source, so drift fails tests.
//
// UMD: `require()`-able in Node (engine + tests), `window.MealProgramConstants` in the browser.
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        var scoring = null;
        try { scoring = require('./scoringConstants'); } catch (e) { /* stand-alone use */ }
        module.exports = factory(scoring);
    } else {
        root.MealProgramConstants = factory(null);
    }
})(typeof self !== 'undefined' ? self : this, function (scoringConstants) {
    'use strict';

    // MIRRORED(core/scoringConstants.js nutrition.*) — literals kept for the browser,
    // where CommonJS require() is unavailable. See drift test.
    var MIRROR_SCORING_LITERALS = {
        proteinGPerKg: { cut: 2.2, maintain: 1.8, gain: 1.8 },
        perMealProteinG: { perKg: 0.25, absoluteMin: 20, absoluteMax: 40 },
        calorieBandPct: 0.10
    };

    var C = {
        version: '1.0',

        // ------------------------------------------------------------------
        // Energy & macro math
        // ------------------------------------------------------------------
        // MIRRORED(js/main.js computeNutritionTargets :5956). Formula itself is HIGH (Mifflin-St Jeor).
        mifflin: { weightCoef: 10, heightCoef: 6.25, ageCoef: 5, maleConst: 5, femaleConst: -161 },
        // MIRRORED(js/main.js :5984-5989). MEDIUM.
        palByDayActivity: { SEDENTARY: 1.25, MODERATE: 1.45, ACTIVE: 1.65 },
        metByEffort: { LIGHT: 3.5, AVERAGE: 5.0, INTENSE: 6.0 },
        sessionsByFrequency: { '1-2': 2, '3-4': 4, '5-6': 6 },
        defaultMinutesPerSession: 60,                              // DESIGN
        maintenanceClampBmrMult: { min: 1.20, max: 2.40 },         // MIRRORED(js/main.js :5993)
        // MIRRORED(js/main.js computeGoalCalories :5592). DESIGN numbers.
        goalCalories: {
            cut:      { defaultMult: 0.80, clampMin: 0.75, clampMax: 0.85, floorBmrMult: 1.10 },
            gain:     { defaultMult: 1.08, clampMin: 1.05, clampMax: 1.12 },
            maintain: { defaultMult: 1.00 }
        },
        // MEDIUM — discovery Q13 ⚠️ tier table, inside the 1.6–2.2 g/kg evidence band
        // (Morton 2018; ISSN 2017). BEST(cut) intentionally equals
        // scoringConstants.nutrition.proteinGPerKg.cut (drift-tested).
        proteinTiersGPerKg: {
            MINIMUM:  { cut: 1.6, gain: 1.6, maintain: 1.6 },
            BALANCED: { cut: 1.9, gain: 1.8, maintain: 1.8 },
            BEST:     { cut: 2.2, gain: 2.0, maintain: 2.0 }
        },
        proteinClampG: { min: 100, max: 260 },   // MIRRORED(js/main.js tier engines :5707/:5795)
        fatCalorieFraction: 0.28,                // DESIGN — main.js used a .25–.33 band; fixed midpoint for v1
        minFatG: 45,                             // MIRRORED(js/main.js cut fat floor)
        carbFloorG: 50,                          // MIRRORED(js/main.js)
        kcalPerG: { protein: 4, carbs: 4, fat: 9 },  // HIGH
        lbPerKg: 2.2046226218,                        // HIGH
        inPerCm: 0.3937007874,                        // HIGH

        // Mirrored scoring nutrition block (see header). Node prefers live values below.
        mirroredScoring: MIRROR_SCORING_LITERALS,

        // ------------------------------------------------------------------
        // Picker (discovery Q17/Q23 ⚠️ — all DESIGN)
        // ------------------------------------------------------------------
        picker: {
            minPicksPerSlot: { breakfast: 2, lunch: 3, dinner: 3 },
            maxPicksPerSlot: 8,
            surpriseCount: 4
        },
        slotCategories: {
            breakfast: ['Breakfast'],
            lunch:     ['Chicken & Turkey', 'Fish & Seafood', 'Vegetarian'],
            dinner:    ['Beef & Pork', 'Chicken & Turkey', 'Fish & Seafood', 'Vegetarian'],
            snacks:    ['Snacks & Shakes']
        },

        // ------------------------------------------------------------------
        // Dietary filtering (legacy enums MIRRORED(js/main.js :21857); keywords DESIGN)
        // ------------------------------------------------------------------
        dietaryPrefs: ['no-restrictions', 'vegetarian', 'vegan', 'pescatarian', 'no-red-meat'],
        allergyOptions: ['fish', 'eggs', 'dairy', 'gluten', 'none'],
        // DESIGN — keyword inference over ing_rows[].canonical (meal-level filtering is new work).
        dietKeywords: {
            beef:    ['beef', 'steak', 'brisket', 'sirloin', 'chuck', 'flank'],
            pork:    ['pork', 'bacon', 'ham', 'sausage', 'prosciutto', 'pepperoni', 'chorizo'],
            poultry: ['chicken', 'turkey'],
            fish:    ['salmon', 'tuna', 'tilapia', 'cod', 'shrimp', 'fish', 'mahi', 'halibut',
                      'sardine', 'anchov', 'crab', 'scallop', 'prawn'],
            eggs:    ['egg'],
            dairy:   ['milk', 'cheese', 'yogurt', 'butter', 'cottage', 'cream', 'whey',
                      'mozzarella', 'parmesan', 'cheddar', 'feta', 'ricotta', 'greek yogurt'],
            // DESIGN — oats included conservatively (cross-contact). TODO(owner): confirm policy.
            gluten:  ['bread', 'tortilla', 'pasta', 'flour', 'bun', 'pita', 'panko', 'breadcrumb',
                      'couscous', 'noodle', 'wrap', 'bagel', 'english muffin', 'soy sauce',
                      'cracker', 'oats', 'oat', 'barley', 'wheat']
        },
        // DESIGN — dataset categories are protein-type, so they are a dietary signal too
        // (catches meals whose ingredient names dodge the keyword lists, e.g. cut names).
        categoryTags: {
            'Beef & Pork': ['beef', 'pork'],
            'Chicken & Turkey': ['poultry'],
            'Fish & Seafood': ['fish']
        },
        // DESIGN — deviation from legacy food-level gates, recorded: legacy `canFish` did not
        // exclude fish for `vegetarian`; meal-level semantics here do (vegetarian ⊅ fish).
        prefBlocks: {
            'no-restrictions': [],
            'vegetarian':      ['beef', 'pork', 'poultry', 'fish'],
            'vegan':           ['beef', 'pork', 'poultry', 'fish', 'eggs', 'dairy'],
            'pescatarian':     ['beef', 'pork', 'poultry'],
            'no-red-meat':     ['beef', 'pork']
        },

        // ------------------------------------------------------------------
        // Week layout & scaling (discovery Q32/Q34 ⚠️ — DESIGN)
        // ------------------------------------------------------------------
        week: {
            days: 7,
            slots: ['breakfast', 'lunch', 'dinner'],
            // With the breakfast minimum of 2 picks, a pick can repeat ceil(7/2)=4 times.
            maxRepeatsPerPick: 4,
            snackMaxPerDay: 2,
            fourthMealKcalThreshold: 3500,
            portionStep: 0.5,
            portionMin: 0.5,
            portionMax: 2.0
        },

        // ------------------------------------------------------------------
        // Pricing (discovery Q18/Q27/Q29 ⚠️)
        // ------------------------------------------------------------------
        pricing: {
            stores: ['walmart', 'sams', 'target'],
            storeLabels: { walmart: 'Walmart', sams: "Sam's Club", target: 'Target' },
            // DESIGN — v2 container model: how many MEAL-SERVING USES one retail
            // container yields, by ingredient_prices.category. Costs are
            // amortized against this yield (engine priceWeek), so these are the
            // main realism lever. v1 values (Spices 40, Pantry 16, Dairy 10,
            // Produce 6, Meat 4, Frozen 6) plus whole-container ceil() billing
            // over-counted one person's month to $600+ — a pinch of pepper was
            // billed as 1/40 of a jar and every item rounded UP to full jars.
            servingsPerContainerByCategory: {
                'Spices': 150, 'Pantry': 36, 'Dairy & Eggs': 16, 'Produce': 10,
                'Meat & Seafood': 6, 'Frozen': 10, 'Other': 12, 'default': 12
            },
            // DESIGN / TODO(owner): Sam's containers are bulk-sized (~3× retail: eggs 24 vs 12,
            // cheese 5 lb vs 16 oz) — yield scales, so compare on plan-total (discovery Q29 ⚠️).
            bulkFactorByStore: { walmart: 1, sams: 3, target: 1 },
            daysPerMonth: 30,              // DESIGN — the plan budgets exactly 30 days
            weeksPerMonth: 30 / 7,         // derived — weekly figures come off the 30-day month
            samsMembershipBadge: true,     // DESIGN (discovery Q29 ⚠️)
            missingPriceFallbackStore: 'walmart'  // DESIGN — item missing at a store
        },

        // ------------------------------------------------------------------
        // Budget (discovery Q9/Q26/Q28 ⚠️)
        // ------------------------------------------------------------------
        budget: {
            defaultMonthly: 300,           // MIRRORED(grocery-final.html #g-budget-total)
            tiers: ['MINIMUM', 'BALANCED', 'BEST'],   // MIRRORED(js/main.js normalizeTierForTargetEngine)
            tierLabels: {
                MINIMUM: 'Minimum Effective Plan',
                BALANCED: 'Balanced Results',
                BEST: 'Best Performance'
            },
            varietyFloorPerSlot: 2,        // DESIGN — normal budget ladder floor (picks/slot)
            lastResortFloorPerSlot: 1,     // DESIGN — final "blander repeats" stage may go to 1
            tierDropCopy: 'Tight budget: protein set to the minimum that still builds muscle.' // DESIGN (Q28)
        },

        // Output accuracy bands. MIRRORED(grocery-plan.html macro-note copy: protein ±5%, calories ±10%).
        output: { proteinBandPct: 0.05, calorieBandPct: 0.10 },

        // DESIGN — localStorage keys, ode_*_v1 house convention.
        storageKeys: {
            picks: 'ode_meal_picks_v1',
            answers: 'ode_meal_answers_v1',
            plan: 'ode_meal_program_plan_v1',
            email: 'ode_meal_email_v1'
        }
    };

    // Drift guard: expose the literals for the Node-side equality test…
    C.__mirrorScoringLiterals = MIRROR_SCORING_LITERALS;
    // …and prefer the live scoringConstants values when importable (reuse-by-import rule).
    if (scoringConstants && scoringConstants.nutrition) {
        C.mirroredScoring = {
            proteinGPerKg: scoringConstants.nutrition.proteinGPerKg,
            perMealProteinG: scoringConstants.nutrition.perMealProteinG,
            calorieBandPct: scoringConstants.nutrition.calorieBandPct
        };
    }

    return C;
});
