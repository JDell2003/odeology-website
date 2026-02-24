const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  let i = source.indexOf('{', start);
  if (i < 0) throw new Error(`No body for function: ${name}`);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Unbalanced braces for function: ${name}`);
}

function loadMainFunctions(names) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
  const chunks = names.map((name) => extractFunctionSource(src, name)).join('\n');
  const context = { module: { exports: {} } };
  vm.runInNewContext(`${chunks}\nmodule.exports = { ${names.join(', ')} };`, context);
  return context.module.exports;
}

function readMainSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
}

test('front-load rule is penalty-first and only hard-rejects extreme', () => {
  const { evaluateCutFrontLoad } = loadMainFunctions(['evaluateCutFrontLoad']);

  const soft = evaluateCutFrontLoad(0.50);
  assert.equal(soft.hardReject, false);
  assert.ok(soft.penaltyPoints > 0);

  const extremeLow = evaluateCutFrontLoad(0.40);
  assert.equal(extremeLow.hardReject, true);

  const extremeHigh = evaluateCutFrontLoad(0.80);
  assert.equal(extremeHigh.hardReject, true);
});

test('olive oil rule allows 2 meals only when fat target > 70g', () => {
  const { getCutOliveOilMaxMeals } = loadMainFunctions(['getCutOliveOilMaxMeals']);
  assert.equal(getCutOliveOilMaxMeals(70), 1);
  assert.equal(getCutOliveOilMaxMeals(69), 1);
  assert.equal(getCutOliveOilMaxMeals(71), 2);
  assert.equal(getCutOliveOilMaxMeals(95), 2);
});

test('penalty direction is safe regardless of score direction', () => {
  const { applyPenalty } = loadMainFunctions(['applyPenalty']);

  const betterLower = 100;
  const worseLower = applyPenalty(betterLower, 20, 'lower_is_better');
  assert.ok(worseLower > betterLower);

  const betterHigher = 100;
  const worseHigher = applyPenalty(betterHigher, 20, 'higher_is_better');
  assert.ok(worseHigher < betterHigher);
});

test('finalized meal totals are source-of-truth and deterministic', () => {
  const { computeTotalsFromBuiltMeals } = loadMainFunctions(['computeTotalsFromBuiltMeals']);
  const meals = [
    {
      foods: [
        { calories: 400, protein_g: 35, carbs_g: 40, fat_g: 12 },
        { calories: 120, protein_g: 0, carbs_g: 0, fat_g: 14 }
      ]
    },
    {
      foods: [
        { calories: 300, protein_g: 30, carbs_g: 25, fat_g: 8 }
      ]
    }
  ];
  const totals = computeTotalsFromBuiltMeals(meals);
  assert.equal(JSON.stringify(totals), JSON.stringify({ calories: 820, protein_g: 65, carbs_g: 65, fat_g: 34 }));
});

test('scoreMeal is declared exactly once', () => {
  const src = readMainSource();
  const matches = src.match(/function\s+scoreMeal\s*\(/g) || [];
  assert.equal(matches.length, 1);
});

test('CUT rules include carb-without-protein block and veg floors', () => {
  const src = readMainSource();
  assert.match(src, /totals\.carbs_g\s*>\s*25\s*&&\s*totals\.protein_g\s*<\s*30/);
  assert.match(src, /mealFoods\.length\s*<\s*2/);
  assert.match(src, /cut_meal_missing_protein_food/);
  assert.match(src, /Number\(vegCaps\.vegMealsCount\)\s*\|\|\s*0\)\s*<\s*2/);
  assert.match(src, /!\s*vegCaps\.vegMealsInSecondHalf/);
  assert.match(src, /cut_spinach_per_meal_cap/);
  assert.match(src, /cut_spinach_daily_cap/);
  assert.match(src, /cut_mixed_veg_required/);
  assert.match(src, /cut_fruit_required/);
  assert.match(src, /cut_single_veg_overcap/);
  assert.match(src, /missing_food_mapping/);
  assert.doesNotMatch(src, /return\s+isVegetableFood\s*\(/);
});

test('daily fiber helper supports floor enforcement and missing mapping detection', () => {
  const { computeDailyFiberEstimateFromMeals } = loadMainFunctions(['computeDailyFiberEstimateFromMeals']);
  const foodsToUse = [
    { id: 'spinach_chopped_frozen' },
    { id: 'black_beans_dry_gv_4lb' }
  ];
  const meals = [
    { foods: [{ foodId: 'spinach_chopped_frozen', servings: 2 }, { foodId: 'missing_food', servings: 1 }] },
    { foods: [{ foodId: 'black_beans_dry_gv_4lb', servings: 1 }] }
  ];
  const estimatedFiberForFood = (food, servings) => {
    if (food.id === 'spinach_chopped_frozen') return 3 * servings;
    if (food.id === 'black_beans_dry_gv_4lb') return 15 * servings;
    return 0;
  };
  const result = computeDailyFiberEstimateFromMeals(meals, foodsToUse, estimatedFiberForFood);
  assert.equal(result.totalFiber, 21);
  assert.equal(result.missingFoodIds.length, 1);
  assert.equal(result.missingFoodIds[0], 'missing_food');

  const src = readMainSource();
  assert.match(src, /computeDailyFiberEstimateFromMeals\(meals,\s*foodsToUse,\s*estimatedFiberForFood\)/);
  assert.match(src, /daily_fiber_floor/);
  assert.match(src, /finalDailyFiber\s*>\s*45/);
});

test('CUT frontload uses final daily carb totals', () => {
  const src = readMainSource();
  assert.match(src, /const\s+cutDailyTotals\s*=\s*computeTotalsFromBuiltMeals\(meals\)/);
  assert.match(src, /earlyShare\s*=\s*earlyCarbs\s*\/\s*Math\.max\(1,\s*cutDailyTotals\.carbs_g\)/);
});

test('computeCutVegCapsSnapshot computes spinach caps + mixed veg meal count', () => {
  const { computeCutVegCapsSnapshot } = loadMainFunctions(['computeCutVegCapsSnapshot']);
  const foodsToUse = [
    { id: 'spinach_chopped_frozen', name: 'Great Value Chopped Spinach (Frozen)', servingGrams: 85 },
    { id: 'mixed_vegetables_birds_eye', name: 'Birds Eye Frozen Mixed Vegetables', servingGrams: 91 },
    { id: 'banana_fresh_each', name: 'Fresh Banana, Each' }
  ];
  const meals = [
    {
      foods: [
        { foodId: 'spinach_chopped_frozen', servings: 1.25, grams: 106.25 },
        { foodId: 'tilapia_fillet', servings: 1 }
      ]
    },
    {
      foods: [
        { foodId: 'Fresh spinach', foodName: 'Great Value Chopped Spinach (Frozen)', servings: 0.9 },
        { foodId: 'mixed_vegetables_birds_eye', servings: 1 }
      ]
    },
    {
      foods: [
        { foodId: 'mixed_vegetables_birds_eye', servings: 0.5 },
        { foodId: 'banana_fresh_each', servings: 1 }
      ]
    }
  ];
  const snapshot = computeCutVegCapsSnapshot(meals, foodsToUse);
  assert.equal(snapshot.perMealSpinachServings.length, 3);
  assert.equal(snapshot.perMealSpinachServings[0], 1.25);
  assert.equal(snapshot.perMealSpinachServings[1], 0.9);
  assert.equal(snapshot.perMealSpinachServings[2], 0);
  assert.ok(snapshot.spinachServingsDay > 2);
  assert.equal(snapshot.spinachUsed, true);
  assert.equal(snapshot.mixedVegMealsCount, 2);
  assert.equal(snapshot.bananaServingsDay, 1);
  assert.ok(snapshot.perMealSpinachOunces[0] > 0);
  assert.equal(snapshot.vegMealsCount, 3);
  assert.equal(snapshot.vegMealsInSecondHalf, true);
});

test('CUT validation uses computeCutVegCapsSnapshot', () => {
  const src = readMainSource();
  assert.match(src, /computeCutVegCapsSnapshot\(meals,\s*foodsToUse\)/);
  assert.match(src, /buildCutReservedAssignments\(foodsToUse,\s*mealsPerDay\)/);
  assert.match(src, /maxCutVegServingsByRemaining\(/);
  assert.match(src, /candidate\?\.cutRejected/);
});

test('maxCutVegServingsByRemaining enforces strict cap when no macro headroom remains', () => {
  const { maxCutVegServingsByRemaining } = loadMainFunctions(['maxCutVegServingsByRemaining']);
  const food = { macros: { calories: 35, carbs_g: 6 } };
  const remaining = { calories: 5, carbs_g: 0 };
  const strictMax = 0;
  const allowed = maxCutVegServingsByRemaining(food, remaining, strictMax);
  assert.equal(allowed, 0);
});

test('buildCutReservedAssignments deterministic mixed-veg slot selection', () => {
  const { buildCutReservedAssignments } = loadMainFunctions(['buildCutReservedAssignments']);
  const foods = [
    { id: 'mixed_vegetables_birds_eye' },
    { id: 'spinach_chopped_frozen' },
    { id: 'banana_fresh_each' }
  ];
  const for4 = buildCutReservedAssignments(foods, 4);
  assert.equal(for4.perMeal[3].forceVegId, 'mixed_vegetables_birds_eye');
  const for3 = buildCutReservedAssignments(foods, 3);
  assert.ok(for3.perMeal[1].forceVegId === 'mixed_vegetables_birds_eye' || for3.perMeal[2].forceVegId === 'mixed_vegetables_birds_eye');
  const for2 = buildCutReservedAssignments(foods, 2);
  assert.equal(for2.perMeal[1].forceVegId, 'mixed_vegetables_birds_eye');
});

test('validateCutCandidateHardRules rejects 0-veg + low-protein meal candidate', () => {
  const { validateCutCandidateHardRules } = loadMainFunctions([
    'computeDailyFiberEstimateFromMeals',
    'computeCutVegCapsSnapshot',
    'validateCutCandidateHardRules'
  ]);
  const meals = [
    { foods: [{ foodId: 'tilapia_fillet', servings: 1 }, { foodId: 'white_rice_dry', servings: 1 }], totals: { protein_g: 35, carbs_g: 40 } },
    { foods: [{ foodId: 'tilapia_fillet', servings: 1 }, { foodId: 'white_rice_dry', servings: 1 }], totals: { protein_g: 34, carbs_g: 38 } },
    { foods: [{ foodId: 'tilapia_fillet', servings: 1 }, { foodId: 'white_rice_dry', servings: 1 }], totals: { protein_g: 33, carbs_g: 35 } },
    { foods: [{ foodId: 'black_beans_dry_gv_4lb', servings: 2 }, { foodId: 'white_rice_dry', servings: 1 }], totals: { protein_g: 21, carbs_g: 70 } }
  ];
  const foodsToUse = [
    { id: 'tilapia_fillet', type: 'protein' },
    { id: 'white_rice_dry', type: 'carb' },
    { id: 'black_beans_dry_gv_4lb', type: 'carb' },
    { id: 'banana_fresh_each', type: 'carb' },
    { id: 'mixed_vegetables_birds_eye', type: 'carb' },
    { id: 'spinach_chopped_frozen', type: 'carb' }
  ];
  const result = validateCutCandidateHardRules(meals, foodsToUse, {
    estimatedFiberForFood: () => 0,
    isProteinFood: (food) => String(food?.type || '') === 'protein'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reason === 'cut_meal_protein_floor' || result.reason === 'veg_floor_lt_2');
});

test('validateCutCandidateHardRules rejects low-calorie last meal in CUT', () => {
  const { validateCutCandidateHardRules } = loadMainFunctions([
    'computeDailyFiberEstimateFromMeals',
    'computeCutVegCapsSnapshot',
    'validateCutCandidateHardRules'
  ]);
  const meals = [
    { foods: [{ foodId: 'tilapia_fillet', servings: 1 }, { foodId: 'mixed_vegetables_birds_eye', servings: 1 }], totals: { calories: 420, protein_g: 35, carbs_g: 20 } },
    { foods: [{ foodId: 'ground_turkey_93_7', servings: 1 }, { foodId: 'spinach_chopped_frozen', servings: 0.8 }], totals: { calories: 380, protein_g: 34, carbs_g: 22 } },
    { foods: [{ foodId: 'tilapia_fillet', servings: 1 }, { foodId: 'banana_fresh_each', servings: 1 }], totals: { calories: 390, protein_g: 32, carbs_g: 30 } },
    { foods: [{ foodId: 'ground_turkey_93_7', servings: 1 }, { foodId: 'mixed_vegetables_birds_eye', servings: 1 }], totals: { calories: 260, protein_g: 31, carbs_g: 20 } }
  ];
  const foodsToUse = [
    { id: 'tilapia_fillet', type: 'protein' },
    { id: 'ground_turkey_93_7', type: 'protein' },
    { id: 'mixed_vegetables_birds_eye', type: 'carb' },
    { id: 'spinach_chopped_frozen', type: 'carb', servingGrams: 85 },
    { id: 'banana_fresh_each', type: 'carb' }
  ];
  const result = validateCutCandidateHardRules(meals, foodsToUse, {
    estimatedFiberForFood: (food, servings) => (String(food?.id || '').includes('vegetables') ? 3 * servings : 0),
    isProteinFood: (food) => String(food?.type || '') === 'protein',
    availableProteinCount: 2,
    availableCarbCount: 3
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cut_meal_calorie_floor');
});

test('validateCutCandidateHardRules requires mixed veg when available', () => {
  const { validateCutCandidateHardRules } = loadMainFunctions([
    'computeDailyFiberEstimateFromMeals',
    'computeCutVegCapsSnapshot',
    'validateCutCandidateHardRules'
  ]);
  const meals = [
    { foods: [{ foodId: 'tilapia_fillet', servings: 1 }, { foodId: 'spinach_chopped_frozen', servings: 0.9 }], totals: { calories: 420, protein_g: 35, carbs_g: 18 } },
    { foods: [{ foodId: 'ground_turkey_93_7', servings: 1 }, { foodId: 'spinach_chopped_frozen', servings: 0.9 }], totals: { calories: 410, protein_g: 33, carbs_g: 18 } },
    { foods: [{ foodId: 'tilapia_fillet', servings: 1 }, { foodId: 'banana_fresh_each', servings: 1 }, { foodId: 'spinach_chopped_frozen', servings: 0.1 }], totals: { calories: 390, protein_g: 32, carbs_g: 30 } },
    { foods: [{ foodId: 'ground_turkey_93_7', servings: 1 }, { foodId: 'banana_fresh_each', servings: 1 }], totals: { calories: 320, protein_g: 31, carbs_g: 28 } }
  ];
  const foodsToUse = [
    { id: 'tilapia_fillet', type: 'protein' },
    { id: 'ground_turkey_93_7', type: 'protein' },
    { id: 'spinach_chopped_frozen', type: 'carb', servingGrams: 85 },
    { id: 'mixed_vegetables_birds_eye', type: 'carb' },
    { id: 'banana_fresh_each', type: 'carb' }
  ];
  const result = validateCutCandidateHardRules(meals, foodsToUse, {
    estimatedFiberForFood: (food, servings) => {
      if (String(food?.id || '') === 'spinach_chopped_frozen') return 3 * servings;
      if (String(food?.id || '') === 'banana_fresh_each') return 3 * servings;
      return 0;
    },
    isProteinFood: (food) => String(food?.type || '') === 'protein',
    availableProteinCount: 2,
    availableCarbCount: 3
  });
  assert.equal(result.ok, false);
  assert.ok(result.reason === 'cut_veg_variety_required' || result.reason === 'cut_mixed_veg_required');
});
