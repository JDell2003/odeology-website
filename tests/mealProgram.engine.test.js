// Meal Program Work Order — Phase 5: engine coverage.
// House style: plain node:test against the pure engine (mirrors tests/scoringEngine.*.test.js).
// Run: node --test tests/mealProgram.engine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../core/mealProgramEngine');
const C = require('../core/mealProgramConstants');
const scoring = require('../core/scoringConstants');

const dataset = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'riseforit_meal_data.json'), 'utf8')
);

const STATS = {
    sex: 'male', age: 30, heightIn: 70, weightLb: 180, goalWeightLb: 190,
    goal: 'bulk', dayActivity: 'MODERATE', intensity: 'AVERAGE', frequency: '3-4'
};

function pickInput(overrides) {
    const picks = {
        breakfast: engine.surprisePicks(dataset.meals, 'breakfast', STATS.goal, 'no-restrictions', []),
        lunch: engine.surprisePicks(dataset.meals, 'lunch', STATS.goal, 'no-restrictions', []),
        dinner: engine.surprisePicks(dataset.meals, 'dinner', STATS.goal, 'no-restrictions', [])
    };
    return Object.assign({
        dataset, picks, stats: STATS, budgetMonthly: 10000,
        state: 'GA', storePref: 'cheapest', dietaryPref: 'no-restrictions', allergies: []
    }, overrides || {});
}

// ---------------------------------------------------------------- dataset

test('dataset integrity: 75 meals, 216 priced ingredients, 51 states', () => {
    assert.equal(dataset.meals.length, 75);
    assert.equal(dataset.ingredient_prices.length, 216);
    assert.equal(Object.keys(dataset.location_multipliers.states).length, 51);
});

test('dataset integrity: every meal has the fields the program relies on', () => {
    for (const m of dataset.meals) {
        for (const f of ['name', 'category', 'goal', 'image_url', 'servings',
            'calories', 'protein_g', 'carbs_g', 'fat_g', 'ing_rows', 'cart']) {
            assert.ok(m[f] !== undefined && m[f] !== null, `meal ${m.id} missing ${f}`);
        }
        assert.ok(Array.isArray(m.ing_rows) && m.ing_rows.length > 0, `meal ${m.id} has no ing_rows`);
    }
});

// ------------------------------------------------------------ mirror sync

test('MIRRORED constants still equal core/scoringConstants (drift guard)', () => {
    assert.deepEqual(C.__mirrorScoringLiterals.proteinGPerKg, scoring.nutrition.proteinGPerKg);
    assert.deepEqual(C.__mirrorScoringLiterals.perMealProteinG, scoring.nutrition.perMealProteinG);
    assert.equal(C.__mirrorScoringLiterals.calorieBandPct, scoring.nutrition.calorieBandPct);
    // In Node the live values must be preferred (reuse-by-import rule).
    assert.equal(C.mirroredScoring.proteinGPerKg, scoring.nutrition.proteinGPerKg);
});

test('BEST cut tier equals the scoring engine protein ceiling (single source of truth)', () => {
    assert.equal(C.proteinTiersGPerKg.BEST.cut, scoring.nutrition.proteinGPerKg.cut);
});

// --------------------------------------------------------------- targets

test('Mifflin known-answer: 30y male, 180 lb, 70 in', () => {
    const t = engine.computeTargets(STATS, 'BEST');
    // 10*81.6466 + 6.25*177.8 - 5*30 + 5 = 1782.7
    assert.ok(Math.abs(t.bmr - 1783) <= 1, `bmr=${t.bmr}`);
    assert.ok(t.maintenance >= t.bmr * 1.20 && t.maintenance <= t.bmr * 2.40);
});

test('Mifflin sex constant: female = male - 166 at identical stats', () => {
    const m = engine.computeTargets(Object.assign({}, STATS, { sex: 'male' }), 'BEST');
    const f = engine.computeTargets(Object.assign({}, STATS, { sex: 'female' }), 'BEST');
    assert.equal(m.bmr - f.bmr, 166);
});

test('cut calories respect the BMR floor and clamp band', () => {
    const t = engine.computeTargets(Object.assign({}, STATS, {
        goal: 'cut', dayActivity: 'SEDENTARY', intensity: 'LIGHT', frequency: '1-2'
    }), 'BEST');
    assert.ok(t.calories >= t.bmr * 1.10 - 5, `cut floor: ${t.calories} vs bmr ${t.bmr}`);
    assert.ok(t.calories <= t.maintenance * 0.85 + 10 || t.calories >= t.bmr * 1.10 - 5);
});

test('protein tier table honored: BEST cut 2.2 g/kg, MINIMUM 1.6 g/kg, clamped 100-260', () => {
    const kg = 180 / C.lbPerKg;
    const best = engine.computeTargets(Object.assign({}, STATS, { goal: 'cut' }), 'BEST');
    const min = engine.computeTargets(Object.assign({}, STATS, { goal: 'cut' }), 'MINIMUM');
    assert.equal(best.proteinG, Math.round(2.2 * kg));
    assert.equal(min.proteinG, Math.round(1.6 * kg));
    assert.ok(best.proteinG > min.proteinG);
    const heavy = engine.computeTargets(Object.assign({}, STATS, { weightLb: 400, goal: 'cut' }), 'BEST');
    assert.equal(heavy.proteinG, 260); // clamp ceiling
});

test('bulk calories sit above maintenance, maintain equals maintenance', () => {
    const bulk = engine.computeTargets(Object.assign({}, STATS, { goal: 'bulk' }), 'BEST');
    const maint = engine.computeTargets(Object.assign({}, STATS, { goal: 'maintain' }), 'BEST');
    assert.ok(bulk.calories > maint.calories);
    assert.equal(maint.calories, maint.maintenance);
});

// --------------------------------------------------------------- dietary

test('vegetarian excludes every beef/pork/poultry/fish meal', () => {
    const allowed = engine.filterMeals(dataset.meals, 'vegetarian', []);
    assert.ok(allowed.length > 0, 'vegetarian pool must not be empty');
    for (const m of allowed) {
        const tags = engine.inferMealTags(m);
        assert.ok(!tags.beef && !tags.pork && !tags.poultry && !tags.fish,
            `vegetarian pool contains "${m.name}" (${m.category})`);
        assert.notEqual(m.category, 'Beef & Pork');
    }
});

test('pescatarian allows fish but not poultry; no-red-meat blocks beef/pork only', () => {
    const pesc = engine.filterMeals(dataset.meals, 'pescatarian', []);
    assert.ok(pesc.some(m => engine.inferMealTags(m).fish), 'pescatarian should keep fish meals');
    assert.ok(pesc.every(m => !engine.inferMealTags(m).poultry));
    const nrm = engine.filterMeals(dataset.meals, 'no-red-meat', []);
    assert.ok(nrm.some(m => engine.inferMealTags(m).poultry), 'no-red-meat keeps poultry');
    assert.ok(nrm.every(m => !engine.inferMealTags(m).beef && !engine.inferMealTags(m).pork));
});

test('allergies: fish allergy empties fish meals; "none" clears', () => {
    const noFish = engine.filterMeals(dataset.meals, 'no-restrictions', ['fish']);
    assert.ok(noFish.every(m => !engine.inferMealTags(m).fish));
    const cleared = engine.filterMeals(dataset.meals, 'no-restrictions', ['none']);
    assert.equal(cleared.length, dataset.meals.length);
});

test('slot pools match the discovery Q17 mapping sizes', () => {
    const b = engine.slotPool(dataset.meals, 'breakfast', 'bulk', 'no-restrictions', []);
    const l = engine.slotPool(dataset.meals, 'lunch', 'bulk', 'no-restrictions', []);
    const d = engine.slotPool(dataset.meals, 'dinner', 'bulk', 'no-restrictions', []);
    assert.equal(b.length, 15);
    assert.equal(l.length, 40);
    assert.equal(d.length, 55);
});

// ------------------------------------------------------------------ plan

test('plan shape: 7 days, ≥3 slots/day, portion multipliers in 0.5 steps within 0.5–2.0', () => {
    const plan = engine.generatePlan(pickInput());
    assert.equal(plan.days.length, 7);
    for (const day of plan.days) {
        assert.ok(day.slots.length >= 3, `day ${day.day} has ${day.slots.length} slots`);
        for (const ref of day.slots) {
            assert.ok(ref.mult >= C.week.portionMin && ref.mult <= C.week.portionMax);
            assert.ok(Math.abs(ref.mult / C.week.portionStep - Math.round(ref.mult / C.week.portionStep)) < 1e-9,
                `mult ${ref.mult} not on the ${C.week.portionStep} grid`);
        }
    }
});

test('batching: each pick repeats no more than ceil(7 / picks-in-slot) times', () => {
    const input = pickInput();
    const plan = engine.generatePlan(input);
    for (const slot of C.week.slots) {
        const counts = {};
        for (const day of plan.days) {
            for (const ref of day.slots.filter(r => r.slot === slot)) {
                counts[ref.mealId] = (counts[ref.mealId] || 0) + 1;
            }
        }
        const nPicks = plan.picks[slot].length;
        const maxAllowed = Math.ceil(7 / nPicks);
        for (const id of Object.keys(counts)) {
            assert.ok(counts[id] <= maxAllowed,
                `${slot} meal ${id} repeats ${counts[id]}x > ${maxAllowed}`);
        }
    }
});

test('dietary conflict after picking: meat picks get filtered and backfilled (Q22 rule)', () => {
    const meaty = pickInput();
    // Force a guaranteed conflict: put a Beef & Pork meal into the dinner picks.
    const beef = dataset.meals.find(m => m.category === 'Beef & Pork');
    meaty.picks.dinner = [beef.id].concat(meaty.picks.dinner.filter(id => id !== beef.id)).slice(0, 4);
    const plan = engine.generatePlan(Object.assign({}, meaty, { dietaryPref: 'vegetarian' }));
    for (const slot of C.week.slots) {
        assert.ok(plan.picks[slot].length >= C.budget.varietyFloorPerSlot);
        for (const id of plan.picks[slot]) {
            const meal = dataset.meals.find(m => m.id === id);
            assert.ok(engine.mealAllowed(meal, 'vegetarian', []),
                `pick "${meal.name}" violates vegetarian`);
        }
    }
    assert.ok(plan.warnings.some(w => /replaced/i.test(w)), 'user must be told about the swap');
});

// ---------------------------------------------------------------- budget

test('generous budget: plan under budget, tier stays BEST, no reduction messages', () => {
    const plan = engine.generatePlan(pickInput({ budgetMonthly: 10000 }));
    assert.equal(plan.underBudget, true);
    assert.equal(plan.tier, 'BEST');
    assert.equal(plan.messages.length, 0);
});

test('impossible budget: plan still returned with an explicit gap', () => {
    const plan = engine.generatePlan(pickInput({ budgetMonthly: 10 }));
    assert.equal(plan.underBudget, false);
    assert.ok(plan.gapMonthly > 0);
    assert.equal(plan.days.length, 7);
    assert.ok(plan.messages.some(m => /short of/i.test(m)));
});

test('budget ladder order: variety reduction / swaps come before any tier drop', () => {
    const plan = engine.generatePlan(pickInput({ budgetMonthly: 10 }));
    const tierIdx = plan.messages.findIndex(m => /protein/i.test(m) && /(tier|minimum)/i.test(m));
    const reduceIdx = plan.messages.findIndex(m => /^(Removed|Swapped)/.test(m));
    // Reductions are always ATTEMPTED first (cost-increase guards may revert them silently),
    // so when both message kinds exist, reduction must come first.
    if (tierIdx >= 0 && reduceIdx >= 0) {
        assert.ok(reduceIdx < tierIdx,
            `expected variety/swap (${reduceIdx}) before tier drop (${tierIdx}): ${JSON.stringify(plan.messages)}`);
    }
    // Even the last-resort "blander repeats" stage keeps at least 1 pick/slot.
    for (const slot of C.week.slots) {
        assert.ok(plan.picks[slot].length >= C.budget.lastResortFloorPerSlot);
    }
});

// ------------------------------------------------- 30-day budget realism

test('realistic solo budget: $350/mo bulk fits WITHIN budget', () => {
    const plan = engine.generatePlan(pickInput({ budgetMonthly: 350 }));
    assert.equal(plan.underBudget, true, `monthly ${plan.monthlyCost} over 350`);
    assert.ok(plan.monthlyCost <= 350);
});

test('realistic solo budget: $300/mo cut fits, store totals plausible for 30 days', () => {
    const stats = Object.assign({}, STATS, { goal: 'cut' });
    const plan = engine.generatePlan(pickInput({ budgetMonthly: 300, stats }));
    assert.equal(plan.underBudget, true, `monthly ${plan.monthlyCost} over 300`);
    assert.ok(plan.monthlyCost <= 300);
    for (const s of C.pricing.stores) {
        assert.ok(plan.costs[s].monthly >= 100 && plan.costs[s].monthly <= 700,
            `${s} monthly ${plan.costs[s].monthly} implausible for one person / 30 days`);
    }
});

test('tight-but-possible budget: ladder (incl. locked-pick swaps + repeats) forces a fit', () => {
    const stats = Object.assign({}, STATS, { goal: 'maintain' });
    const plan = engine.generatePlan(pickInput({ budgetMonthly: 300, stats }));
    assert.equal(plan.underBudget, true,
        `monthly ${plan.monthlyCost} over 300: ${JSON.stringify(plan.messages)}`);
});

test('pricing is scaled to a 30-day month; weekly derives from it', () => {
    assert.equal(C.pricing.daysPerMonth, 30);
    const plan = engine.generatePlan(pickInput());
    for (const s of C.pricing.stores) {
        const c = plan.costs[s];
        assert.ok(Math.abs(c.weekly - c.monthly / (C.pricing.daysPerMonth / 7)) <= 0.02,
            `${s} weekly ${c.weekly} vs monthly ${c.monthly}`);
    }
});

test('amortization: an item month-cost never exceeds the full price of its containers', () => {
    const plan = engine.generatePlan(pickInput());
    for (const item of plan.groceryList) {
        for (const s of Object.keys(item.stores)) {
            const e = item.stores[s];
            assert.ok(e.monthlyCost <= e.unitPrice * e.containers * plan.stateMultiplier + 0.01,
                `${item.canonical}@${s}: ${e.monthlyCost} > ${e.containers} × ${e.unitPrice}`);
            assert.ok(e.containers >= 1);
        }
    }
});

test('tier derivation: mid-tight budget never returns a HIGHER cost than the generous plan', () => {
    const generous = engine.generatePlan(pickInput({ budgetMonthly: 10000 }));
    const tight = engine.generatePlan(pickInput({ budgetMonthly: Math.max(50, generous.monthlyCost * 0.5) }));
    assert.ok(tight.monthlyCost <= generous.monthlyCost + 0.01,
        `tight ${tight.monthlyCost} vs generous ${generous.monthlyCost}`);
});

test('tier override is respected and skips automatic tier drops', () => {
    const plan = engine.generatePlan(pickInput({ budgetMonthly: 10, tierOverride: 'BALANCED' }));
    assert.equal(plan.tier, 'BALANCED');
});

// ----------------------------------------------------------------- stores

test('store comparison: three store totals, cheapest selected by plan total', () => {
    const plan = engine.generatePlan(pickInput());
    for (const s of C.pricing.stores) {
        assert.ok(plan.costs[s] && plan.costs[s].monthly > 0, `missing ${s} total`);
    }
    const cheapest = C.pricing.stores.reduce((a, b) =>
        plan.costs[a].monthly <= plan.costs[b].monthly ? a : b);
    assert.equal(plan.store, cheapest);
});

test('store preference wins over cheapest', () => {
    const plan = engine.generatePlan(pickInput({ storePref: 'target' }));
    assert.equal(plan.store, 'target');
});

test('BEA location multiplier: CA plan costs more than AR for identical input', () => {
    const ca = engine.generatePlan(pickInput({ state: 'CA' }));
    const ar = engine.generatePlan(pickInput({ state: 'AR' }));
    assert.ok(ca.monthlyCost > ar.monthlyCost,
        `CA ${ca.monthlyCost} should exceed AR ${ar.monthlyCost}`);
    assert.equal(ca.stateMultiplier, dataset.location_multipliers.states.CA.multiplier);
});

test('free pantry items are excluded from cost and listed separately', () => {
    const plan = engine.generatePlan(pickInput());
    for (const item of plan.groceryList) {
        assert.ok(!plan.freeItems.includes(item.canonical),
            `free item "${item.canonical}" was priced`);
    }
});

// ------------------------------------------------------------ determinism

test('determinism: identical input produces a deep-equal plan (no randomness, no clock)', () => {
    const a = engine.generatePlan(pickInput());
    const b = engine.generatePlan(pickInput());
    assert.deepEqual(a, b);
});

test('surprise picks are deterministic and within picker bounds', () => {
    const s1 = engine.surprisePicks(dataset.meals, 'lunch', 'bulk', 'no-restrictions', []);
    const s2 = engine.surprisePicks(dataset.meals, 'lunch', 'bulk', 'no-restrictions', []);
    assert.deepEqual(s1, s2);
    assert.ok(s1.length >= C.picker.minPicksPerSlot.lunch && s1.length <= C.picker.maxPicksPerSlot);
});
