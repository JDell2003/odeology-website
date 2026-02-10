# Priority-Driven Meal Optimization Engine
## Complete Technical Documentation

---

## 🎯 Overview

The new meal optimization engine represents a significant upgrade from simple calorie-first sizing. Instead of forcing one protein + one carb + one fat per meal, this engine:

- **Dynamically selects** the best food combinations
- **Can skip or replace** foods that worsen optimization
- **Respects strict priority ordering** (Calories > Protein > Carbs > Fat)
- **Treats fat as a ceiling** (≤ target only; underage is acceptable)
- **Tests multiple strategies** (not greedy)
- **Behaves like a real nutrition coach** (transparent, intelligent choices)

---

## 🔑 Core Philosophy

```
"Calories decide.
 Protein builds.
 Carbs support.
 Fat is capped."
```

---

## Priority Ordering (HARD CONSTRAINTS)

### Level 1: Calories (Primary)
```
Requirement: Within ±2–3% of target
Weight in scoring: 100
Why: If calories are wrong, the entire plan fails
```

### Level 2: Protein (High Priority)
```
Requirement: As close as possible to target
Weight in scoring: 50
Why: Maximizes muscle building; user pays for protein
```

### Level 3: Carbs (Secondary)
```
Requirement: Reasonable accuracy
Weight in scoring: 20
Why: Provides energy; less critical than protein
```

### Level 4: Fat (Ceiling Constraint)
```
Requirement: Must be ≤ target (not ≥)
Weight in scoring:
  - Fat overage: 200 (HEAVILY penalized)
  - Fat underage: 2 (slightly penalized)
Why: Fat is calorie-dense and easy to overshoot
```

---

## Scoring Function

### Implementation

```javascript
function scoreMeal(totals, targets) {
    // Calculate errors
    const calorieError = Math.abs(totals.calories - targets.calories);
    const proteinError = Math.abs(totals.protein_g - targets.protein_g);
    const carbError = Math.abs(totals.carbs_g - targets.carbs_g);
    
    // FAT IS ASYMMETRIC
    const fatOverage = Math.max(0, totals.fat_g - targets.fat_g);
    const fatUnderage = Math.max(0, targets.fat_g - totals.fat_g);
    
    // Weighted loss function (LOWER score = BETTER meal)
    const score =
        calorieError * 100 +      // Calories: highest priority
        proteinError * 50 +       // Protein: high priority
        carbError * 20 +          // Carbs: secondary priority
        fatOverage * 200 +        // Fat overage: CRITICAL penalty
        fatUnderage * 2;          // Fat underage: minimal penalty
    
    return score;
}
```

### Example Scoring

**Meal Candidate A:**
```
Target: 410 kcal, 30g P, 45g C, 10g F
Actual: 405 kcal, 28g P, 44g C, 9g F (under fat)

Errors:
  Calorie: |405 - 410| = 5
  Protein: |28 - 30| = 2
  Carbs: |44 - 45| = 1
  Fat overage: max(0, 9 - 10) = 0
  Fat underage: max(0, 10 - 9) = 1

Score = 5*100 + 2*50 + 1*20 + 0*200 + 1*2 = 500 + 100 + 20 + 0 + 2 = 622 ✓
```

**Meal Candidate B:**
```
Target: 410 kcal, 30g P, 45g C, 10g F
Actual: 408 kcal, 27g P, 42g C, 14g F (over fat!)

Errors:
  Calorie: |408 - 410| = 2
  Protein: |27 - 30| = 3
  Carbs: |42 - 45| = 3
  Fat overage: max(0, 14 - 10) = 4 ← PROBLEM
  Fat underage: 0

Score = 2*100 + 3*50 + 3*20 + 4*200 + 0*2 = 200 + 150 + 60 + 800 + 0 = 1,210 ❌

Candidate B has better calorie/protein/carbs accuracy, but...
The 4g fat overage costs 800 points, making it worse overall!
```

**Result:** Engine chooses Candidate A (score 622 < 1,210)

---

## Search Strategies

The engine doesn't just pick the first valid combination. It explores the solution space using four strategies:

### Strategy 1: Single Food at Full Budget
```
Test: Using one food to fill the entire meal calorie budget
Purpose: Find simple, elegant solutions
Example: 400 kcal meal = 400g of one food

When this wins: Foods with excellent macro profiles
```

### Strategy 2: Two-Food Combinations with Splits
```
Test: Two foods with calorie allocation ratios:
  [50/50, 60/40, 70/30, 40/60, 30/70]
  
Example: 410 kcal meal
  Split 60/40: 246 kcal food A + 164 kcal food B

When this wins: Need balance between two macro types
```

### Strategy 3: Three-Food Random Combinations
```
Test: Three foods with random calorie splits
  Example: r1 = 0.4, r2 = 0.35, r3 = 0.25
  Allocations: 164, 143, 103 kcal

Iterations: Up to 20 random combinations per meal
Purpose: Explore complex multi-component solutions

When this wins: Need all three components but not locked to ratios
```

### Strategy 4: Lean Protein + Low-Fat Carb Strategy
```
Test: Intelligently pair lean proteins with low-fat carbs
  Filter lean proteins: fat_g ≤ 5
  Filter low-fat carbs: fat_g ≤ 3
  
Test splits: [40/60, 50/50, 60/40]

Purpose: Naturally avoid fat overage
When this wins: User selected healthy, lean foods
```

---

## Key Differences from Old System

| Aspect | Old System | New System |
|--------|-----------|-----------|
| **Structure** | Locked 1P + 1C + 1F | Flexible food combinations |
| **Food selection** | Forced inclusion of all selected | Can skip/replace foods |
| **Search** | None (deterministic) | Multiple strategies tested |
| **Fat handling** | Symmetric (target ±10%) | Asymmetric (≤ target only) |
| **Calorie sizing** | Division by ratio | Calorie allocation + testing |
| **Food pool** | Separate P/C/F arrays | Combined pool |
| **Optimization** | None (first match) | Scoring function (best match) |

---

## Function Signatures

### `scoreMeal(totals, targets) → number`
```javascript
// Input:
{
  totals: { calories: 405, protein_g: 28, carbs_g: 44, fat_g: 9 },
  targets: { calories: 410, protein_g: 30, carbs_g: 45, fat_g: 10 }
}

// Output: 622 (lower is better)
```

**Purpose:** Calculate priority-weighted error for a meal candidate

---

### `sizeFoodByCalories(food, targetCalories) → Object`
```javascript
// Input:
{
  food: { macros: { calories: 165, protein_g: 26, ... }, serving_size: 100 },
  targetCalories: 130
}

// Output:
{
  foodId: "chicken-breast",
  foodName: "Chicken breast",
  servings: 0.79,
  grams: 79,
  calories: 130,
  protein_g: 20,
  carbs_g: 0,
  fat_g: 2
}
```

**Purpose:** Size a single food to contribute exactly X calories

---

### `buildOptimizedMeal(config) → Object`
```javascript
// Input:
{
  mealCalories: 410,
  targets: { protein_g: 30, carbs_g: 45, fat_g: 10 },
  availableFoods: [food1, food2, food3, ...],
  maxIterations: 50
}

// Output:
{
  foods: [
    { foodId, foodName, servings, grams, calories, protein_g, carbs_g, fat_g },
    { ... },
    { ... }
  ],
  totals: { calories: 408, protein_g: 28, carbs_g: 42, fat_g: 9 },
  score: 622
}
```

**Purpose:** Find the best meal combination across all strategies

---

## Algorithm Flow

```
INPUT: mealCalories, targets, availableFoods

INITIALIZE:
  bestMeal = null
  bestScore = Infinity

STRATEGY 1: Single Food Tests
  FOR each food in availableFoods:
    Size to full budget
    Calculate score
    If score < bestScore: Save as bestMeal

STRATEGY 2: Two-Food Tests
  FOR each pair of foods:
    FOR each split [50/50, 60/40, ...]:
      Size food1 to split1 × mealCalories
      Size food2 to split2 × mealCalories
      Calculate combined score
      If score < bestScore: Save as bestMeal

STRATEGY 3: Random Three-Food Tests
  FOR iterations 1 to maxIterations:
    Randomly select 3 foods
    Randomly generate splits (sum to 1.0)
    Size all three
    Calculate combined score
    If score < bestScore: Save as bestMeal

STRATEGY 4: Lean Protein + Low-Fat Carb
  Filter lean proteins (fat ≤ 5g)
  Filter low-fat carbs (fat ≤ 3g)
  FOR each lean protein:
    FOR each low-fat carb:
      FOR each split [40/60, 50/50, 60/40]:
        Size both
        Calculate score
        If score < bestScore: Save as bestMeal

RETURN: bestMeal
```

---

## Real-World Example

### Setup
```
Daily target: 1,600 kcal, 130g P, 160g C, 40g F
Meals per day: 4

Per-meal target: 400 kcal, 32.5g P, 40g C, 10g F

Available foods:
  - Chicken breast (31g P, 0g C, 3.6g F, 165 kcal/100g)
  - Salmon (25g P, 0g C, 13g F, 206 kcal/100g) ← High fat!
  - Eggs (13g P, 1.1g C, 11g F, 155 kcal/100g) ← High fat!
  - Rice (3g P, 28g C, 0.5g F, 130 kcal/100g)
  - Oats (17g P, 54g C, 6.7g F, 389 kcal/100g)
  - Olive oil (0g P, 0g C, 14g F, 120 kcal/15ml) ← Pure fat!
  - Spinach (3.6g P, 3.6g C, 0.4g F, 23 kcal/100g)
```

### Old System Would Do:
```
Meal: Chicken + Rice + Olive oil

Chicken (32.5g / 31g P = 1.05 servings = 105g):
  165 × 1.05 = 173 kcal, 32.5g P, 0g C, 3.8g F

Rice (40g / 28g C = 1.43 servings = 143g):
  130 × 1.43 = 186 kcal, 4.3g P, 40g C, 0.7g F

Oil (10g / 14g F = 0.71 servings = 10.7ml):
  120 × 0.71 = 85 kcal, 0g P, 0g C, 10g F

Meal Total: 444 kcal, 36.8g P, 40g C, 14.5g F
Problem: 35g calorie overshoot, 4.5g fat overage ❌
```

### New Optimization Engine Would Do:

**Test Strategy 2: Chicken + Rice split (60/40)**
```
Chicken gets 240 kcal:
  240 / 165 = 1.45 servings = 145g
  45g P, 0g C, 5.2g F, 240 kcal

Rice gets 160 kcal:
  160 / 130 = 1.23 servings = 123g
  3.7g P, 34.4g C, 0.6g F, 160 kcal

Meal Total: 400 kcal, 48.7g P, 34.4g C, 5.8g F
Score = 0*100 + 16.2*50 + 5.6*20 + 0*200 + 4.2*2 = 0 + 810 + 112 + 0 + 8 = 930
⚠ Protein is 16g over, score is high
```

**Test Strategy 4: Lean Chicken + Low-Fat Rice (50/50)**
```
Chicken gets 200 kcal:
  200 / 165 = 1.21 servings
  31g P, 0g C, 4.4g F, 200 kcal

Rice gets 200 kcal:
  200 / 130 = 1.54 servings
  4.6g P, 43.1g C, 0.8g F, 200 kcal

Meal Total: 400 kcal, 35.6g P, 43.1g C, 5.2g F
Score = 0*100 + 3.1*50 + 3.1*20 + 0*200 + 4.8*2 = 0 + 155 + 62 + 0 + 9.6 = 226.6
✓ EXCELLENT: Calories perfect, protein near target, fat under target
```

**Test Strategy 1: Eggs only (400 kcal)**
```
Eggs: 400 / 155 = 2.58 servings
  33.5g P, 2.8g C, 28.4g F, 400 kcal

Meal Total: 400 kcal, 33.5g P, 2.8g C, 28.4g F
Score = 0*100 + 1*50 + 37.2*20 + 18.4*200 + 0*2 = 0 + 50 + 744 + 3,680 + 0 = 4,474
❌ TERRIBLE: Fat overage of 18.4g costs 3,680 points!
```

### Engine Result:
```
WINNER: Strategy 4 with score 226.6
Meal: Chicken (200 kcal) + Rice (200 kcal)

Final: 400 kcal, 35.6g P, 43.1g C, 5.2g F
- Calories: Perfect (0g error) ✓
- Protein: 35.6 vs. 32.5g target (3.1g over, acceptable) ✓
- Carbs: 43.1 vs. 40g target (3.1g over, acceptable) ✓
- Fat: 5.2 vs. 10g target (4.8g UNDER, preferred) ✓

Why this beats the old system:
- Same calorie budget but NO overshoot
- Fat is below ceiling (5.2g < 10g)
- Skipped oil entirely (not needed!)
- More balanced, healthier macros
```

---

## When Foods Get Excluded

The engine naturally excludes foods by never selecting them. Example:

```
User selected: Chicken, Salmon, Eggs, Rice, Oats, Oil, Spinach

Old system would force: 1 from each category
New system might use: Chicken + Rice only

Why Salmon was skipped:
  - Salmon has 13g fat per 100g (vs. 3.6g for chicken)
  - At 400 kcal (242g salmon), that's 31g fat (WAY over 10g target)
  - Every combo with salmon gets heavily penalized
  - Engine naturally prefers chicken

Why Oil was skipped:
  - Pure fat (14g per 15ml)
  - Can't hit any macro with oil without overshooting fat
  - Every combo with oil gets penalized
  - Engine prefers carb + protein combination
```

---

## Performance Characteristics

### Time Complexity
```
Strategy 1: O(F) where F = number of foods
Strategy 2: O(F² × splits) = O(F²)
Strategy 3: O(maxIterations)
Strategy 4: O(leanProteins × lowFatCarbs × splits)

Total: ~O(F²) but with early termination at iteration limits
Typical: 50–100 combinations tested per meal
```

### Space Complexity
```
O(F) for food pool storage
O(meals × bestMeal.foods) for result storage
Typical: ~100 bytes per meal × 4 meals = 400 bytes
```

### Execution Time (Estimated)
```
Per meal: 5–50ms (depending on food pool size)
Per day (4 meals): 20–200ms
Per week (28 meals): 140–1,400ms

Typically sub-100ms for most realistic food pools
```

---

## Backwards Compatibility

The legacy `buildMeal()` function still works:

```javascript
// Old API call still works:
const meal = buildMeal({
  mealCalories: 410,
  proteinRatio: 0.32,
  carbRatio: 0.41,
  fatRatio: 0.27,
  proteinFood: chicken,
  carbFood: rice,
  fatFood: oil
});

// This internally falls back to simple 1P+1C+1F sizing
```

This ensures no breaking changes to existing code.

---

## Testing Recommendations

### Unit Tests

```javascript
// Test 1: Perfect meal
const result = buildOptimizedMeal({
  mealCalories: 400,
  targets: { protein_g: 30, carbs_g: 40, fat_g: 10 },
  availableFoods: [leanChicken, rice]
});
assert(result.score < 500);  // Should find excellent solution

// Test 2: Fat overage penalty
const result2 = buildOptimizedMeal({
  mealCalories: 400,
  targets: { protein_g: 30, carbs_g: 40, fat_g: 10 },
  availableFoods: [salmon, oil] // Only high-fat options
});
assert(result2.totals.fat_g <= 15); // May exceed target, but minimized

// Test 3: Calorie constraint
const result3 = buildOptimizedMeal({
  mealCalories: 400,
  targets: { protein_g: 30, carbs_g: 40, fat_g: 10 },
  availableFoods: allFoods
});
assert(Math.abs(result3.totals.calories - 400) < 20); // Within ±5%
```

### Integration Tests

```javascript
// Test 1: Daily total matches scaled targets
const meal1 = buildOptimizedMeal(...);
const meal2 = buildOptimizedMeal(...);
const meal3 = buildOptimizedMeal(...);
const meal4 = buildOptimizedMeal(...);

const dailyTotal = {
  calories: meal1.totals.calories + meal2.totals.calories + 
            meal3.totals.calories + meal4.totals.calories
};

assert(Math.abs(dailyTotal - 1600) < 50); // Within ±3%

// Test 2: Fat never systematically exceeds target
const allMeals = [meal1, meal2, meal3, meal4];
const avgFatPerMeal = allMeals.reduce((s, m) => s + m.totals.fat_g, 0) / 4;
assert(avgFatPerMeal <= 10.5); // Allow small rounding
```

---

## Configuration Parameters

### `maxIterations`
```
Default: 50
Range: 20–500
Effect: Higher = more combinations tested, slower execution
Recommendation: 50 for balance of speed/quality
```

### Weight Coefficients (in scoreMeal)
```
calorieError weight: 100 (fixed)
proteinError weight: 50 (fixed)
carbError weight: 20 (fixed)
fatOverage weight: 200 (fixed, critical)
fatUnderage weight: 2 (fixed, low)

These are intentionally hard-coded to enforce priority order
```

---

## Future Optimization Opportunities

1. **Machine learning**: Train weights based on user satisfaction
2. **Caching**: Store best meals for common target combinations
3. **GPU acceleration**: Parallel evaluation of candidates (browser WebGPU)
4. **User preference**: "I dislike oil" → exclude entirely
5. **Cost optimization**: Factor in food prices alongside nutrition
6. **Taste variety**: Penalize repeating same food across meals

---

## Key Takeaways

✅ **Calories are locked** (±2–3% is hard requirement)
✅ **Protein is prioritized** (build muscle, optimize spending)
✅ **Carbs are reasonable** (secondary accuracy)
✅ **Fat is capped** (asymmetric penalty prevents overage)
✅ **Foods are selected dynamically** (not forced into categories)
✅ **Engine explores solution space** (not greedy)
✅ **Real nutrition coach behavior** (intelligent choices)
✅ **Backwards compatible** (old API still works)

---

**Created:** January 31, 2026
**Status:** Complete and Production-Ready
**Complexity:** Medium (4 search strategies, weighted scoring)
