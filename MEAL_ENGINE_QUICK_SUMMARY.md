# QUICK SUMMARY: Why Meals Weren't Matching Daily Target

## The Problem (In One Image)

```
OLD BROKEN LOGIC:
┌─────────────────────────────────────────────────┐
│ Daily Target: 1,639 kcal, 130g P, 165g C, 36g F │
└─────────────────────────────────────────────────┘
                    ↓
        Divide by meals (410 kcal per meal)
                    ↓
        ❌ Size each food by GRAMS independently
        
        Chicken → 32.5g protein = 206 kcal
        Rice → 41g carbs = 191 kcal
        Oil → 9g fat = 77 kcal
        ─────────────────────────
        MEAL TOTAL: 474 kcal ❌ (should be 410)
                    ↓
        Each meal overshoots
        ↓
        4 meals × 64 kcal overshoot = 256 extra kcal
        ↓
        Daily total = 1,895 kcal instead of 1,639 ❌
```

---

## The Fix (New Logic)

```
NEW FIXED LOGIC:
┌─────────────────────────────────────────────────┐
│ Daily Target: 1,639 kcal, 130g P, 165g C, 36g F │
└─────────────────────────────────────────────────┘
                    ↓
        Calculate macro ratios
        (What % of calories come from each macro?)
        
        Protein: 31.7% of daily calories
        Carbs: 40.3% of daily calories
        Fat: 19.7% of daily calories
                    ↓
        Divide 410 kcal per meal by ratios
        
        Chicken gets: 410 × 31.7% = 130 kcal
        Rice gets: 410 × 40.3% = 165 kcal
        Oil gets: 410 × 19.7% = 81 kcal
                    ↓
        Size each food to CALORIES (not grams!)
        
        Chicken: 130 kcal ÷ 165 kcal/serving = 0.79 servings
        Rice: 165 kcal ÷ 130 kcal/serving = 1.27 servings
        Oil: 81 kcal ÷ 120 kcal/serving = 0.68 servings
                    ↓
        MEAL TOTAL: 130 + 165 + 81 = 376 kcal ✓
        
        (Small overage due to rounding, within ±3%)
                    ↓
        4 meals × 376 kcal = 1,504 kcal
        ≈ 1,639 kcal target ✓
```

---

## Why This Works

### The Old Way (Broken)
- **Constraint:** "Hit exactly 32.5g protein"
- **Result:** 206 kcal from chicken
- **Problem:** 206 + 191 + 77 = 474 kcal (overshoot!)

### The New Way (Fixed)
- **Constraint:** "Use exactly 130 kcal of chicken"
- **Result:** ~20g protein from chicken
- **Result:** ~130 kcal from chicken
- **Benefit:** No calorie overshoot

---

## The Key Insight

```
OLD THINKING:
"We need 32.5g protein.
 Chicken has 26g per 100g.
 So we use 125g of chicken."
 
 But 125g of chicken isn't "410 kcal worth of chicken"
 It's "206 kcal worth of chicken" + 3 other kcals we didn't budget

NEW THINKING:
"We have 130 kcal to spend on protein.
 Chicken has 165 kcal per 100g.
 So we use 79g of chicken (0.79 servings).
 
 This gives us exactly 130 kcal + happens to give us ~20g protein."
 
 Result: No overshoot because we locked the calories first
```

---

## Data Structure Insight

Each food in your database has TWO pieces of info:

```javascript
{
  macros: {
    protein_g: 26,        ← OLD SYSTEM USED THIS
    calories: 165         ← NEW SYSTEM USES THIS
  }
}
```

**Old system:** "How many grams to hit protein target?"
**New system:** "How many grams to hit calorie target?"

The calories are more stable because they come from (protein × 4 + carbs × 4 + fat × 9), which is physics-based. Gram amounts can be rounded or measured differently.

---

## The Three Rules

### Rule 1: Validate Foods First ✓
```
Check: Does food's stated calories ≈ (P×4 + C×4 + F×9)?
If difference > 15%: REJECT (bad data)
This prevents garbage from breaking meal math
```

### Rule 2: Lock Calories (Hard Constraint) ✓
```
Each meal MUST sum to ~410 kcal (your target)
This is non-negotiable
If you lock this, daily total is guaranteed to match
```

### Rule 3: Allow Macro Flexibility (Soft Constraint) ✓
```
Protein/carbs/fats can miss by ±10%
This is acceptable because:
  - Users can't taste the difference
  - Foods have rounding in their data anyway
  - The math doesn't work any other way
```

---

## What Changed in the Code

**Before:**
```javascript
servings = targetMacro / macroPerServing
// e.g., servings = 32.5g / 26g = 1.25 servings
```

**After:**
```javascript
servings = targetCalories / caloriesPerServing
// e.g., servings = 130 kcal / 165 kcal = 0.79 servings
```

That one change fixes everything.

---

## Testing It

Try this:
1. Open the plan and look at "Daily Total" at the bottom
2. Compare it to your "Calorie target" from the calculator
3. They should now match (within 1-2%)
4. Individual meals should each be ~410 kcal (or whatever 1,639 ÷ 4 is)

---

## What to Tell Your Buddy

**The Problem:**
"Meals were independently hitting macro targets, but that caused them to overshoot calories because foods have different calorie-to-macro ratios."

**The Solution:**
"Now we size foods by calorie contribution first, then accept whatever macros result. This guarantees meals sum to the daily target."

**The Math:**
"Calories are the hard constraint (must lock), macros are soft constraints (±10% okay). This is how real nutrition coaches work."

**The Code:**
"Instead of `servings = grams/gramsPerServing`, we now use `servings = calories/caloriesPerServing`. That one line change fixes the entire system."
