// Meal Program Part 2 — onboarding integration mapping coverage.
// House style: plain node:test against the pure mapping functions.
// Run: node --test tests/mealProgram.onboarding.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const onboarding = require('../js/meal-program-onboarding');
const engine = require('../core/mealProgramEngine');
const C = require('../core/mealProgramConstants');

const dataset = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'riseforit_meal_data.json'), 'utf8')
);

const QUIZ_RAW = {
    gender: 'Female',
    ageYears: 28,
    heightUnit: 'ft', heightFt: 5, heightIn: 6,
    weightUnit: 'lb', weightValue: 150,
    goalWeightUnit: 'lb', goalWeightValue: 140,
    bodyGoal: 'Ripped',
    dailyActivity: 'I take active breaks',
    workoutFreq: '4 - 5 times a week',
    mealBudget: 'Around $400',
    mealState: 'CA',
    dietaryPref: 'Pescatarian',
    allergies: ['Dairy'],
    mealPicksBreakfast: [], mealPicksLunch: [], mealPicksDinner: []
};

test('quiz answers map onto the engine input (no re-asking)', () => {
    const input = onboarding.mapQuizToEngineInput(QUIZ_RAW);
    assert.equal(input.stats.sex, 'female');
    assert.equal(input.stats.age, 28);
    assert.equal(input.stats.heightIn, 66);
    assert.equal(input.stats.weightLb, 150);
    assert.equal(input.stats.goal, 'cut');           // Ripped -> cut
    assert.equal(input.stats.dayActivity, 'MODERATE');
    assert.equal(input.stats.frequency, '3-4');      // 4-5 times a week
    assert.equal(input.budgetMonthly, 400);
    assert.equal(input.state, 'CA');
    assert.equal(input.dietaryPref, 'pescatarian');
    assert.deepEqual(input.allergies, ['dairy']);
});

test('defaults: empty quiz still yields a valid, generatable input', () => {
    const input = onboarding.mapQuizToEngineInput({});
    assert.equal(input.stats.sex, 'male');
    assert.equal(input.budgetMonthly, C.budget.defaultMonthly);
    assert.equal(input.state, 'GA');
    assert.equal(input.dietaryPref, 'no-restrictions');
    assert.deepEqual(input.allergies, ['none']);
    const plan = engine.generatePlan(Object.assign({ dataset }, input));
    assert.equal(plan.days.length, 7); // picks auto-backfilled by the engine
});

test('kg/cm units convert; age range midpoint used when exact age missing', () => {
    const input = onboarding.mapQuizToEngineInput({
        heightUnit: 'cm', heightCm: 180, weightUnit: 'kg', weightValue: 80, ageRange: '30 – 39'
    });
    assert.ok(Math.abs(input.stats.heightIn - 70.87) < 0.1);
    assert.ok(Math.abs(input.stats.weightLb - 176.37) < 0.1);
    assert.equal(input.stats.age, 35);
});

test('allergies: "None of the above" maps to none; quiz labels map to legacy enums', () => {
    const a = onboarding.mapQuizToEngineInput({ allergies: ['None of the above'] });
    assert.deepEqual(a.allergies, ['none']);
    const b = onboarding.mapQuizToEngineInput({ allergies: ['Fish', 'Gluten'] });
    assert.deepEqual(b.allergies, ['fish', 'gluten']);
});

test('quiz picks flow through to the plan when present and diet-compatible', () => {
    const goal = 'bulk';
    const picks = {
        mealPicksBreakfast: engine.surprisePicks(dataset.meals, 'breakfast', goal, 'no-restrictions', []),
        mealPicksLunch: engine.surprisePicks(dataset.meals, 'lunch', goal, 'no-restrictions', []),
        mealPicksDinner: engine.surprisePicks(dataset.meals, 'dinner', goal, 'no-restrictions', [])
    };
    const input = onboarding.mapQuizToEngineInput(Object.assign({}, QUIZ_RAW, picks, {
        bodyGoal: 'Swole', dietaryPref: 'No restrictions', allergies: ['None of the above']
    }));
    input.budgetMonthly = 10000; // generous: the budget ladder must not trim the picks
    const plan = engine.generatePlan(Object.assign({ dataset }, input));
    assert.deepEqual(plan.picks.breakfast, picks.mealPicksBreakfast);
});

test('legacy snapshot shape matches main.js saveMealPlanSnapshotForLogging contract', () => {
    // No-restrictions input: guarantees full slot coverage. (Pescatarian + dairy allergy
    // can legitimately empty the breakfast/snack pools — the engine then warns instead.)
    const input = onboarding.mapQuizToEngineInput({});
    const plan = engine.generatePlan(Object.assign({ dataset }, input));
    const snap = onboarding.planToLegacySnapshot(plan, dataset);
    assert.ok(snap.savedAt);
    assert.ok(snap.mealsPerDay >= 3);
    assert.equal(snap.meals.length, plan.days[0].slots.length);
    assert.ok(snap.macroTargets && Number.isFinite(snap.macroTargets.calories));
    assert.ok(Array.isArray(snap.meals) && snap.meals.length >= 3);
    for (const meal of snap.meals) {
        assert.ok(Number.isFinite(meal.index));
        assert.ok(Array.isArray(meal.items) && meal.items.length);
        assert.ok(meal.items[0].foodName);
        assert.ok(meal.items[0].measurementText);
        assert.ok(typeof meal.plannedText === 'string' && meal.plannedText.startsWith('- '));
    }
});

test('grocery payload matches groceriesRoutes sanitize shape and overview card fields', () => {
    const input = onboarding.mapQuizToEngineInput(QUIZ_RAW);
    const plan = engine.generatePlan(Object.assign({ dataset }, input));
    const payload = onboarding.planToGroceryPayload(plan);
    assert.equal(payload.source, 'grocery_generator');
    assert.ok(payload.items.length > 0);
    for (const item of payload.items) {
        assert.ok(item.name, 'item.name required by sanitizeItems');
        assert.ok(Number.isFinite(item.estimatedCost));
        assert.ok(Number.isFinite(item.containerPrice));
        assert.ok(Number.isFinite(item.daily));
        assert.ok(item.daysPerContainer === null || Number.isFinite(item.daysPerContainer));
        assert.equal(item.unit, 'servings');
    }
    assert.ok(Number.isFinite(payload.totals.totalEstimatedWeeklyCost));
    assert.ok(Number.isFinite(payload.totals.totalEstimatedCost));
    assert.ok(payload.meta.store);
    assert.equal(payload.meta.notes, 'meal_program_onboarding');
    assert.ok(Number.isFinite(payload.meta.macroTargets.proteinG));
});

test('trainer default input is deterministic and produces a complete starter plan', () => {
    const a = onboarding.trainerDefaultInput();
    const b = onboarding.trainerDefaultInput();
    assert.deepEqual(a, b);
    const p1 = engine.generatePlan(Object.assign({ dataset }, a));
    const p2 = engine.generatePlan(Object.assign({ dataset }, b));
    assert.deepEqual(p1, p2);
    assert.equal(p1.days.length, 7);
    assert.ok(p1.groceryList.length > 0);
});
