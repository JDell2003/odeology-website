// core/mealProgramEngine.js
// Meal Program Work Order Phase 3 — pure plan engine.
// RULES (work order): zero DB/network imports; no Math.random; no Date.now in plan math;
// every tunable read from core/mealProgramConstants.js; deterministic (same input -> same plan).
// UMD: `require()`-able in Node (tests), `window.MealProgramEngine` in the browser.
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mealProgramConstants'));
    } else {
        root.MealProgramEngine = factory(root.MealProgramConstants);
    }
})(typeof self !== 'undefined' ? self : this, function (C) {
    'use strict';

    if (!C) throw new Error('mealProgramEngine: constants module missing');

    // ---------------------------------------------------------------- utils
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function round1(v) { return Math.round(v * 10) / 10; }
    function round2(v) { return Math.round(v * 100) / 100; }
    function roundTo10(v) { return Math.round(v / 10) * 10; }
    function toKg(lb) { return lb / C.lbPerKg; }
    function toCm(inches) { return inches / C.inPerCm; }
    function lower(s) { return String(s || '').toLowerCase(); }

    // ------------------------------------------------------------- targets
    // MIRRORED math from js/main.js computeNutritionTargets (:5956) + computeGoalCalories (:5592).
    // stats: { sex:'male'|'female', age, heightIn, weightLb, goalWeightLb?, goal:'cut'|'gain'|'maintain',
    //          dayActivity:'SEDENTARY'|'MODERATE'|'ACTIVE', intensity:'LIGHT'|'AVERAGE'|'INTENSE',
    //          frequency:'1-2'|'3-4'|'5-6', minutesPerSession? }
    function computeTargets(stats, tier) {
        var sex = lower(stats.sex) === 'female' ? 'female' : 'male';
        var kg = toKg(Number(stats.weightLb) || 0);
        var cm = toCm(Number(stats.heightIn) || 0);
        var age = Number(stats.age) || 30;
        var goal = normalizeGoal(stats.goal);
        var M = C.mifflin;

        var bmr = Math.round(
            (M.weightCoef * kg) + (M.heightCoef * cm) - (M.ageCoef * age) +
            (sex === 'female' ? M.femaleConst : M.maleConst)
        );

        var pal = C.palByDayActivity[stats.dayActivity] || C.palByDayActivity.MODERATE;
        var met = C.metByEffort[stats.intensity] || C.metByEffort.AVERAGE;
        var sessions = C.sessionsByFrequency[stats.frequency] || C.sessionsByFrequency['3-4'];
        var minutes = Number(stats.minutesPerSession) || C.defaultMinutesPerSession;

        var baseline = bmr * pal;
        var netWorkoutWeekly = Math.max(0, (met - 1) * 3.5 * kg / 200 * minutes * sessions);
        var maintenance = roundTo10(clamp(
            baseline + netWorkoutWeekly / 7,
            bmr * C.maintenanceClampBmrMult.min,
            bmr * C.maintenanceClampBmrMult.max
        ));

        var G = C.goalCalories[goal] || C.goalCalories.maintain;
        var calories = maintenance * (G.defaultMult || 1);
        if (G.clampMin) calories = clamp(calories, maintenance * G.clampMin, maintenance * G.clampMax);
        if (G.floorBmrMult) calories = Math.max(calories, bmr * G.floorBmrMult);
        calories = roundTo10(calories);

        var tierKey = C.budget.tiers.indexOf(tier) >= 0 ? tier : 'BEST';
        var gPerKg = C.proteinTiersGPerKg[tierKey][goal];
        var proteinG = Math.round(clamp(gPerKg * kg, C.proteinClampG.min, C.proteinClampG.max));
        var fatG = Math.max(C.minFatG, Math.round(calories * C.fatCalorieFraction / C.kcalPerG.fat));
        var carbsG = Math.max(C.carbFloorG, Math.round(
            (calories - proteinG * C.kcalPerG.protein - fatG * C.kcalPerG.fat) / C.kcalPerG.carbs
        ));

        return {
            method: 'mifflin_st_jeor',
            sex: sex, goal: goal, tier: tierKey,
            bmr: bmr, maintenance: maintenance,
            calories: calories, proteinG: proteinG, fatG: fatG, carbsG: carbsG,
            proteinGPerKg: gPerKg
        };
    }

    function normalizeGoal(goal) {
        var g = lower(goal);
        if (g === 'cut') return 'cut';
        if (g === 'bulk' || g === 'gain' || g === 'lean_bulk') return 'gain';
        return 'maintain';
    }

    // ------------------------------------------------------- dietary tags
    function inferMealTags(meal) {
        var tags = {};
        var hay = [];
        (meal.ing_rows || []).forEach(function (r) {
            hay.push(lower(r.canonical), lower(r.raw));
        });
        (meal.ingredients || []).forEach(function (s) { hay.push(lower(s)); });
        var text = hay.join(' | ');
        Object.keys(C.dietKeywords).forEach(function (tag) {
            tags[tag] = C.dietKeywords[tag].some(function (kw) { return text.indexOf(kw) >= 0; });
        });
        // Category is a dietary signal too (protein-type categories, C.categoryTags).
        (C.categoryTags[meal.category] || []).forEach(function (tag) { tags[tag] = true; });
        return tags;
    }

    // pref: legacy enum; allergies: array of legacy allergy enums ('none' clears).
    function mealAllowed(meal, pref, allergies) {
        var p = C.prefBlocks.hasOwnProperty(lower(pref)) ? lower(pref) : 'no-restrictions';
        var blocked = C.prefBlocks[p];
        var tags = meal.__tags || inferMealTags(meal);
        for (var i = 0; i < blocked.length; i++) {
            if (tags[blocked[i]]) return false;
        }
        var al = (allergies || []).map(lower).filter(function (a) { return a !== 'none'; });
        for (var j = 0; j < al.length; j++) {
            if (tags[al[j]]) return false;
        }
        return true;
    }

    function filterMeals(meals, pref, allergies) {
        return meals.filter(function (m) { return mealAllowed(m, pref, allergies); });
    }

    // ----------------------------------------------------------- pools
    function tagMeals(meals) {
        meals.forEach(function (m) { if (!m.__tags) m.__tags = inferMealTags(m); });
        return meals;
    }

    function cheapestCartTotal(meal) {
        var best = Infinity;
        var cart = meal.cart || {};
        C.pricing.stores.forEach(function (s) {
            if (cart[s] && typeof cart[s].total === 'number') best = Math.min(best, cart[s].total);
        });
        return best === Infinity ? 9999 : best;
    }

    // Deterministic pool ordering: user's goal tag first, then cheapest cart, then id.
    function orderPool(meals, goal) {
        var g = normalizeGoal(goal) === 'gain' ? 'bulk' : 'cut';
        return meals.slice().sort(function (a, b) {
            var ga = a.goal === g ? 0 : 1;
            var gb = b.goal === g ? 0 : 1;
            if (ga !== gb) return ga - gb;
            var ca = cheapestCartTotal(a), cb = cheapestCartTotal(b);
            if (ca !== cb) return ca - cb;
            return a.id - b.id;
        });
    }

    function slotPool(meals, slot, goal, pref, allergies) {
        var cats = C.slotCategories[slot] || [];
        var pool = meals.filter(function (m) { return cats.indexOf(m.category) >= 0; });
        pool = filterMeals(tagMeals(pool), pref, allergies);
        return orderPool(pool, goal);
    }

    // Deterministic "Surprise me": top goal-matching, cheapest meals from the slot pool.
    function surprisePicks(meals, slot, goal, pref, allergies) {
        return slotPool(meals, slot, goal, pref, allergies)
            .slice(0, C.picker.surpriseCount)
            .map(function (m) { return m.id; });
    }

    // ------------------------------------------------------- week builder
    function roundToStep(v) {
        return clamp(
            Math.round(v / C.week.portionStep) * C.week.portionStep,
            C.week.portionMin, C.week.portionMax
        );
    }

    function mealMacros(meal, mult) {
        return {
            calories: meal.calories * mult,
            proteinG: meal.protein_g * mult,
            carbsG: meal.carbs_g * mult,
            fatG: meal.fat_g * mult
        };
    }

    // picks: { breakfast:[mealId], lunch:[mealId], dinner:[mealId] } (already diet-filtered).
    // Returns { days:[{slots:[{mealId, slot, mult}], totals}], warnings }
    function buildWeekPlan(picks, mealsById, targets, snacksPool) {
        var warnings = [];
        var days = [];
        var d, s;

        for (d = 0; d < C.week.days; d++) days.push({ day: d + 1, slots: [], totals: null });

        // Round-robin batching: consecutive blocks per pick (prep-friendly), deterministic.
        C.week.slots.forEach(function (slot) {
            var ids = picks[slot] || [];
            if (!ids.length) return;
            var batchLen = Math.ceil(C.week.days / ids.length);
            for (d = 0; d < C.week.days; d++) {
                var idx = Math.min(Math.floor(d / batchLen), ids.length - 1);
                days[d].slots.push({ mealId: ids[idx], slot: slot, mult: 1 });
            }
        });

        // Per-day portion scaling in fixed steps, then snack fill, then optional 4th meal.
        var perMeal = C.mirroredScoring.perMealProteinG;
        for (d = 0; d < C.week.days; d++) {
            var day = days[d];
            var base = sumDay(day, mealsById);
            if (base.calories > 0) {
                var mult = roundToStep(targets.calories / base.calories);
                day.slots.forEach(function (slotRef) { slotRef.mult = mult; });
            }
            var totals = sumDay(day, mealsById);

            // Snack fill: close calorie/protein gaps (discovery Q34 ⚠️ order).
            var snacks = 0;
            var si = 0;
            while (snacks < C.week.snackMaxPerDay && si < snacksPool.length &&
                   (totals.calories < targets.calories * (1 - C.mirroredScoring.calorieBandPct) ||
                    totals.proteinG < targets.proteinG * (1 - C.output.proteinBandPct))) {
                var snack = snacksPool[si];
                day.slots.push({ mealId: snack.id, slot: 'snack', mult: 1 });
                totals = sumDay(day, mealsById);
                snacks++;
                si = (si + 1) % snacksPool.length;
                if (snacks >= snacksPool.length) break;
            }

            // 4th meal only past the threshold and still short.
            if (targets.calories > C.week.fourthMealKcalThreshold &&
                totals.calories < targets.calories * (1 - C.mirroredScoring.calorieBandPct)) {
                var dinnerIds = picks.dinner || [];
                if (dinnerIds.length) {
                    day.slots.push({ mealId: dinnerIds[d % dinnerIds.length], slot: 'meal4', mult: 1 });
                    totals = sumDay(day, mealsById);
                }
            }

            if (totals.calories < targets.calories * (1 - C.mirroredScoring.calorieBandPct) ||
                totals.calories > targets.calories * (1 + C.mirroredScoring.calorieBandPct)) {
                warnings.push('Day ' + (d + 1) + ' lands at ' + Math.round(totals.calories) +
                    ' kcal vs the ' + targets.calories + ' kcal target (outside the ±' +
                    Math.round(C.mirroredScoring.calorieBandPct * 100) + '% band).');
            }
            day.slots.forEach(function (ref) {
                var m = mealsById[ref.mealId];
                var pg = m ? m.protein_g * ref.mult : 0;
                if (m && pg < perMeal.absoluteMin && ref.slot !== 'snack') {
                    warnings.push('“' + m.name + '” at ' + ref.mult + '× provides ' + Math.round(pg) +
                        ' g protein (< the ' + perMeal.absoluteMin + ' g per-meal floor).');
                }
            });
            day.totals = roundTotals(totals);
        }

        return { days: days, warnings: dedupe(warnings) };
    }

    function sumDay(day, mealsById) {
        var t = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
        day.slots.forEach(function (ref) {
            var m = mealsById[ref.mealId];
            if (!m) return;
            var mm = mealMacros(m, ref.mult);
            t.calories += mm.calories; t.proteinG += mm.proteinG;
            t.carbsG += mm.carbsG; t.fatG += mm.fatG;
        });
        return t;
    }

    function roundTotals(t) {
        return {
            calories: Math.round(t.calories), proteinG: Math.round(t.proteinG),
            carbsG: Math.round(t.carbsG), fatG: Math.round(t.fatG)
        };
    }

    function dedupe(arr) {
        var seen = {};
        return arr.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
    }

    // ----------------------------------------------------------- pricing
    function buildPriceIndex(dataset) {
        var idx = {};
        (dataset.ingredient_prices || []).forEach(function (row) {
            idx[lower(row.item)] = row;
        });
        return idx;
    }

    function stateMultiplier(dataset, state) {
        var st = dataset.location_multipliers && dataset.location_multipliers.states;
        if (st && state && st[String(state).toUpperCase()]) {
            return st[String(state).toUpperCase()].multiplier || 1;
        }
        return 1;
    }

    // Weekly grocery list + per-store totals for a built week.
    function priceWeek(week, mealsById, dataset, state) {
        var priceIdx = buildPriceIndex(dataset);
        var mult = stateMultiplier(dataset, state);
        var usage = {};   // canonical -> { servings, sample ing_row }
        var freeItems = {};

        week.days.forEach(function (day) {
            day.slots.forEach(function (ref) {
                var m = mealsById[ref.mealId];
                if (!m) return;
                (m.ing_rows || []).forEach(function (row) {
                    var key = lower(row.canonical);
                    if (row.free) { freeItems[key] = row.canonical; return; }
                    if (!usage[key]) usage[key] = { canonical: row.canonical, servings: 0, row: row };
                    usage[key].servings += ref.mult;
                });
            });
        });

        var items = [];
        var totals = {};
        C.pricing.stores.forEach(function (s) { totals[s] = 0; });
        var estimatedAny = false;
        var spcTable = C.pricing.servingsPerContainerByCategory;

        Object.keys(usage).sort().forEach(function (key) {
            var u = usage[key];
            var master = priceIdx[key];
            var category = (master && master.category) || 'Other';
            var spc = spcTable[category] || spcTable['default'];
            // Monthly-first: containers bought over the 28-day month, amortized by yield.
            var monthlyServings = u.servings * C.pricing.weeksPerMonth;
            var stores = (master && master.stores) || (u.row && u.row.stores) || {};
            var item = {
                canonical: u.canonical,
                category: category,
                servingsUsedWeekly: round1(u.servings),
                stores: {}
            };
            C.pricing.stores.forEach(function (s) {
                var entry = stores[s] || stores[C.pricing.missingPriceFallbackStore];
                if (!entry || typeof entry.price !== 'number') return;
                var yieldServings = spc * (C.pricing.bulkFactorByStore[s] || 1);
                var containers = Math.max(1, Math.ceil(monthlyServings / yieldServings));
                var cost = round2(entry.price * containers * mult);
                var estimated = entry.price_confidence && entry.price_confidence !== 'listed';
                if (estimated) estimatedAny = true;
                item.stores[s] = {
                    product: entry.product, size: entry.size, url: entry.url,
                    unitPrice: entry.price, containers: containers, monthlyCost: cost,
                    estimated: !!estimated
                };
                totals[s] += cost;
            });
            items.push(item);
        });

        var byStore = {};
        C.pricing.stores.forEach(function (s) {
            var monthly = round2(totals[s]);
            byStore[s] = { monthly: monthly, weekly: round2(monthly / C.pricing.weeksPerMonth) };
        });

        // An ingredient can be free in one recipe but priced in another — priced wins.
        Object.keys(usage).forEach(function (k) { delete freeItems[k]; });

        return {
            items: items,
            freeItems: Object.keys(freeItems).sort().map(function (k) { return freeItems[k]; }),
            byStore: byStore,
            stateMultiplier: mult,
            estimatedAny: estimatedAny
        };
    }

    function cheapestStore(byStore) {
        var best = null;
        C.pricing.stores.forEach(function (s) {
            if (!byStore[s]) return;
            if (!best || byStore[s].monthly < byStore[best].monthly) best = s;
        });
        return best;
    }

    // ------------------------------------------------------ budget ladder
    // Q28 ⚠️ ranking: (1) reduce variety -> (2) swap cheaper same-slot meals ->
    // (3) drop protein tier -> (4) report the gap. Deterministic throughout.
    function fitToBudget(args) {
        var dataset = args.dataset;
        var mealsById = args.mealsById;
        var stats = args.stats;
        var state = args.state;
        var budgetMonthly = Number(args.budgetMonthly) || C.budget.defaultMonthly;
        var storePref = args.storePref && C.pricing.stores.indexOf(args.storePref) >= 0 ? args.storePref : null;
        var pref = args.dietaryPref;
        var allergies = args.allergies || [];
        var tierOverride = args.tierOverride && C.budget.tiers.indexOf(args.tierOverride) >= 0 ? args.tierOverride : null;

        var messages = [];
        var picks = {
            breakfast: (args.picks.breakfast || []).slice(),
            lunch: (args.picks.lunch || []).slice(),
            dinner: (args.picks.dinner || []).slice()
        };

        var snacksPool = slotPool(dataset.meals, 'snacks', stats.goal, pref, allergies)
            .slice().sort(function (a, b) {
                if (b.protein_g !== a.protein_g) return b.protein_g - a.protein_g;
                var ca = cheapestCartTotal(a), cb = cheapestCartTotal(b);
                if (ca !== cb) return ca - cb;
                return a.id - b.id;
            });

        var tierIdx = tierOverride ? C.budget.tiers.indexOf(tierOverride) : C.budget.tiers.length - 1;
        var tier = C.budget.tiers[tierIdx];
        var targets = computeTargets(stats, tier);

        function solve() {
            var week = buildWeekPlan(picks, mealsById, targets, snacksPool);
            var prices = priceWeek(week, mealsById, dataset, state);
            var store = storePref || cheapestStore(prices.byStore);
            return { week: week, prices: prices, store: store, monthly: prices.byStore[store].monthly };
        }

        var sol = solve();

        function overBudget() { return sol.monthly > budgetMonthly; }
        function costOfPick(id) { return cheapestCartTotal(mealsById[id]); }

        // (1) Reduce variety toward the cheapest picks (floor per slot).
        // Skipped when the user has hand-set their picks on the Nutrition page.
        var guard = 0;
        while (!args.respectPicks && overBudget() && guard++ < 24) {
            var slotMax = null, idMax = null, costMax = -1;
            C.week.slots.forEach(function (slot) {
                if (picks[slot].length <= C.budget.varietyFloorPerSlot) return;
                picks[slot].forEach(function (id) {
                    var c = costOfPick(id);
                    if (c > costMax) { costMax = c; idMax = id; slotMax = slot; }
                });
            });
            if (!idMax) break;
            var beforeRemove = { picks: picks[slotMax].slice(), sol: sol };
            picks[slotMax] = picks[slotMax].filter(function (id) { return id !== idMax; });
            sol = solve();
            if (sol.monthly > beforeRemove.sol.monthly) {
                // Container rounding can make fewer picks cost more — revert and stop reducing.
                picks[slotMax] = beforeRemove.picks;
                sol = beforeRemove.sol;
                break;
            }
            messages.push('Removed “' + mealsById[idMax].name + '” (your priciest ' + slotMax +
                ' pick) and repeated cheaper picks instead — meal-prep friendly and easier on the budget.');
        }

        // (2) Swap remaining picks for cheaper same-slot pool meals.
        guard = 0;
        while (overBudget() && guard++ < 24) {
            var swapped = false;
            var slots = C.week.slots.slice();
            for (var si = 0; si < slots.length && !swapped; si++) {
                var slot = slots[si];
                var pool = slotPool(dataset.meals, slot, stats.goal, pref, allergies);
                var current = picks[slot].slice().sort(function (a, b) { return costOfPick(b) - costOfPick(a); });
                for (var pi = 0; pi < current.length && !swapped; pi++) {
                    var expensive = current[pi];
                    // Never substitute a meal the user explicitly picked — only
                    // backfilled picks are swappable. Keeps the plan honest to
                    // what they chose (they edit it on the Nutrition page).
                    if (args.lockedIds && args.lockedIds[expensive]) continue;
                    for (var qi = 0; qi < pool.length; qi++) {
                        var cand = pool[qi];
                        if (picks[slot].indexOf(cand.id) >= 0) continue;
                        if (cheapestCartTotal(cand) < costOfPick(expensive)) {
                            var beforeSwap = { picks: picks[slot].slice(), sol: sol };
                            picks[slot][picks[slot].indexOf(expensive)] = cand.id;
                            sol = solve();
                            if (sol.monthly > beforeSwap.sol.monthly) {
                                picks[slot] = beforeSwap.picks;   // swap made it pricier — revert
                                sol = beforeSwap.sol;
                                continue;
                            }
                            messages.push('Swapped “' + mealsById[expensive].name + '” for the cheaper “' +
                                cand.name + '” in ' + slot + '.');
                            swapped = true;
                            break;
                        }
                    }
                }
            }
            if (!swapped) break;
        }

        // (3) Drop the protein tier one step at a time (never silently: explicit copy).
        while (overBudget() && !tierOverride && tierIdx > 0) {
            var beforeDrop = { tierIdx: tierIdx, tier: tier, targets: targets, sol: sol };
            tierIdx--;
            tier = C.budget.tiers[tierIdx];
            targets = computeTargets(stats, tier);
            sol = solve();
            if (sol.monthly > beforeDrop.sol.monthly) {
                tierIdx = beforeDrop.tierIdx; tier = beforeDrop.tier;
                targets = beforeDrop.targets; sol = beforeDrop.sol;
                break;
            }
            messages.push(tier === 'MINIMUM' ? C.budget.tierDropCopy :
                'Budget is tight: protein tier lowered to ' + C.budget.tierLabels[tier] + '.');
        }

        // (4) Still over: report the gap, plan is still returned.
        var gap = null;
        if (overBudget()) {
            gap = round2(sol.monthly - budgetMonthly);
            messages.push('You are $' + gap.toFixed(2) + '/mo short of the ' +
                C.budget.tierLabels[tier] + ' at your current budget. The plan below is the closest fit.');
        }

        return {
            tier: tier, targets: targets, picks: picks,
            week: sol.week, prices: sol.prices, store: sol.store,
            monthly: sol.monthly, budgetMonthly: budgetMonthly,
            underBudget: !overBudget(), gapMonthly: gap, messages: messages
        };
    }

    // --------------------------------------------------------- orchestrator
    // input: { dataset, picks:{breakfast,lunch,dinner:[ids]}, stats, budgetMonthly,
    //          state, storePref|'cheapest', dietaryPref, allergies, tierOverride? }
    function generatePlan(input) {
        var dataset = input.dataset;
        var mealsById = {};
        tagMeals(dataset.meals).forEach(function (m) { mealsById[m.id] = m; });

        var pref = input.dietaryPref || 'no-restrictions';
        var allergies = input.allergies || [];
        var warnings = [];
        var swappedOut = [];

        // Dietary-conflict rule (Q22 ⚠️): filter conflicting picks, backfill from the same slot pool.
        var picks = {};
        C.week.slots.forEach(function (slot) {
            var kept = [];
            (input.picks[slot] || []).forEach(function (id) {
                var m = mealsById[id];
                if (m && mealAllowed(m, pref, allergies)) kept.push(id);
                else if (m) swappedOut.push({ slot: slot, name: m.name });
            });
            // respectPicks (Nutrition-page edits): honor the exact picks the
            // user set — only ensure a slot isn't left completely empty. Normal
            // (onboarding) generation backfills to a full minimum per slot.
            var minNeeded = input.respectPicks ? 1 : (C.picker.minPicksPerSlot[slot] || 2);
            if (kept.length < minNeeded) {
                var pool = slotPool(dataset.meals, slot, input.stats.goal, pref, allergies);
                for (var i = 0; i < pool.length && kept.length < minNeeded; i++) {
                    if (kept.indexOf(pool[i].id) < 0) kept.push(pool[i].id);
                }
            }
            picks[slot] = kept.slice(0, C.picker.maxPicksPerSlot);
        });
        if (swappedOut.length) {
            warnings.push('Some picks conflicted with your dietary answers and were replaced: ' +
                swappedOut.map(function (s) { return s.name; }).join(', ') + '.');
        }

        // Lock the user's explicit, dietary-allowed picks so budget fitting
        // can't swap them for meals they never chose.
        var lockedIds = {};
        C.week.slots.forEach(function (slot) {
            (input.picks[slot] || []).forEach(function (id) {
                var m = mealsById[id];
                if (m && mealAllowed(m, pref, allergies)) lockedIds[id] = true;
            });
        });

        var fitted = fitToBudget({
            dataset: dataset, mealsById: mealsById, picks: picks, stats: input.stats,
            budgetMonthly: input.budgetMonthly, state: input.state,
            storePref: input.storePref === 'cheapest' ? null : input.storePref,
            dietaryPref: pref, allergies: allergies, tierOverride: input.tierOverride || null,
            lockedIds: lockedIds, respectPicks: !!input.respectPicks
        });

        return {
            version: C.version,
            targets: fitted.targets,
            tier: fitted.tier,
            tierLabel: C.budget.tierLabels[fitted.tier],
            picks: fitted.picks,
            days: fitted.week.days,
            groceryList: fitted.prices.items,
            freeItems: fitted.prices.freeItems,
            costs: fitted.prices.byStore,
            stateMultiplier: fitted.prices.stateMultiplier,
            estimatedPrices: fitted.prices.estimatedAny,
            store: fitted.store,
            storeLabel: C.pricing.storeLabels[fitted.store],
            monthlyCost: fitted.monthly,
            budgetMonthly: fitted.budgetMonthly,
            underBudget: fitted.underBudget,
            gapMonthly: fitted.gapMonthly,
            messages: fitted.messages,
            warnings: dedupe(warnings.concat(fitted.week.warnings))
        };
    }

    return {
        computeTargets: computeTargets,
        normalizeGoal: normalizeGoal,
        inferMealTags: inferMealTags,
        mealAllowed: mealAllowed,
        filterMeals: filterMeals,
        slotPool: slotPool,
        surprisePicks: surprisePicks,
        cheapestCartTotal: cheapestCartTotal,
        buildWeekPlan: buildWeekPlan,
        priceWeek: priceWeek,
        stateMultiplier: stateMultiplier,
        cheapestStore: cheapestStore,
        fitToBudget: fitToBudget,
        generatePlan: generatePlan
    };
});
