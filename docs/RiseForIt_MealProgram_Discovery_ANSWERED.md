# RiseForIt / Stryve — Meal Program Discovery Questionnaire — ANSWERED
### Answered 2026-07-13 by read-only repo discovery on `D:\Jasons Web` (branch `main`)
### Legend: **NOT BUILT** = doesn't exist · ⚠️ = best answer / product decision with recommended default

> Repo-wide context up front: there is **no separate parked meal-program module**. The meal program is a large, partly-disabled meal/macro/grocery engine embedded in `js/main.js` (~32k lines), fronted by SEO landing pages and the index.html "Nutrition Simplified" funnel, with a live Postgres backend route (`core/groceriesRoutes.js`). There is **no recipe content anywhere** — the new `riseforit_meal_data.json` is the first recipe data to enter the system. The dataset checks out: 75 meals (Breakfast 15, Chicken & Turkey 15, Beef & Pork 15, Fish & Seafood 15, Vegetarian 10, Snacks & Shakes 5; goal tags: 36 `bulk` / 39 `cut`), a 216-item `ingredient_prices` master list (Walmart/Sams/Target, Augusta GA base), and `location_multipliers` with both `states` (51) and `metros` blocks (BEA 2024 RPP-Goods, base Augusta MSA 96.293).

---

## A. Where the old code lives

- [x] **1.** Where is the parked meal-program code right now — repo name, branch, folder path? Paste the file tree of that folder.

**Repo:** `D:\Jasons Web` (package name `jasons-web`), **branch `main`** (`.git/HEAD` → `refs/heads/main`). Only one other branch exists: `deploy-backup-2026-03-29`. No meal/recipe branches; recent commit history (`.git/logs/HEAD`) is all training/trainer/leaderboard work — the meal side is dormant on `main` itself.

**There is no single folder.** The meal program spans:

```
D:\Jasons Web\
├─ js\main.js                  ← THE meal engine (food DB, macro calc, plan builder, grocery flow) ~32k lines
├─ js\planner.js               ← CLI grocery planner (npm run plan:groceries)
├─ js\grocery-calendar.js      ← grocery calendar page logic
├─ js\usda.js                  ← USDA FoodData Central client (placeholder, "Do not call from UI yet")
├─ js\scrape-prices.js, js\scrape-config.json  ← Puppeteer price scraper
├─ index.html                  ← "Nutrition Simplified" funnel (§resources, lines ~4702–5110)
├─ grocery-final.html          ← inputs page (budget/store/meals-per-day) — the current "question flow"
├─ grocery-plan.html           ← generated plan output screen
├─ grocery-calendar.html       ← grocery calendar
├─ grocery-generator.html      ← meta-refresh redirect stub → grocery-final.html
├─ food-admin.html             ← admin UI for the food catalog
├─ meal-plan-generator.html, macro-meal-plan-generator.html,
│  simple-meal-plan-generator.html, high-protein-meal-plan.html,
│  fat-loss-meal-plan.html, bulking-meal-plan.html,
│  cheap-meal-plan-bodybuilding.html, macro-calculator.html  ← SEO shells funneling to index.html?ns=start#ns-entry
├─ core\groceriesRoutes.js     ← live backend, Postgres table app_grocery_lists (/api/groceries/*)
├─ core\{storeUtils,cache,httpClient,walmartCart,sessionManager}.js  ← price-scrape infra
├─ stores\{walmart,target,sams}.js  ← HTTP API price adapters
├─ index.js (root)             ← price-scrape runner (npm run scrape:api)
├─ data\products.json, data\latest.json, data\usda-cache.json,
│  data\dri-targets.js, data\dri_targets.json, data\micros_spec.json,
│  data\grocery-list.example.json
└─ grocery-price-engine\       ← standalone ESM sub-project (own package.json, cron price puller)
   ├─ config\{budget,stores,items}.json
   └─ src\{index,runner}.js, src\adapters\{walmart,sams}.js, src\lib\*
```

- [x] **2.** What state is it in — compiles/runs, half-finished, or design-only? What was the last thing working before it was hidden behind the site?

**Mixed.** The live path still runs end-to-end: index.html ns funnel (Mifflin macro calculator, email-gated) → `grocery-final.html` inputs → `grocery-plan.html` grocery+meal output built from the hardcoded food DB. What was **parked** is the in-page "food wizard":

```js
// js/main.js:2199
const FOOD_WIZARD_ENABLED = false;
...
// js/main.js:2239
// Legacy functions (no-op for compatibility)
function openGroceryPage() { return; }    // Permanently disabled
function closeGroceryPage() { return; }   // Permanently disabled
function persistGrocerySession() { return; } // Permanently disabled
// Any attempt to open food wizard will silently fail
```

Also half-finished: the `planGroceryList()` pipeline (`js/main.js:7734`) is placeholder stubs — `annotateWithUSDA` (USDA not wired), `allocateQuantities` ("Minimal stub"), `attachPricing` (`price: 'TBD'`). The *working* plan math lives elsewhere in main.js (`enforceMacroClosureWithStaples` :713, `scalePlanToOvershootCaps` :555, `setupGroceryPlanPage` :26429). Last working thing: the macro-target → grocery-list builder with weekly/28-day costs and a micros tracker.

- [x] **3.** Is it wired into the main app (routes, nav entry) or fully standalone? What URL/route mounted it?

Wired in, but soft-hidden. Nav (`index.html:4157-4173`) has exactly three entries — `#resources` ("Macro Calculator"), `training-coming-soon.html`, `forum.html`. No commented-out nav entries exist. Entry points:

- `index.html#resources` / `index.html?ns=start#ns-entry` — the Nutrition Simplified funnel (email-gated behind Klaviyo: `id="ns-unlock-btn"` "Enter your Email to Unlock Macros and Build Grocery Plan").
- `launchGroceryFlow()` (`js/main.js:2203`) hard-redirects to `grocery-final.html` after saving `sessionStorage.grocerySession`.
- SEO shells (`high-protein-meal-plan.html` etc.) link `index.html?ns=start#ns-entry`; `grocery-generator.html` is a meta-refresh redirect to `grocery-final.html`.
- Backend: `server.js` (hand-rolled `http` server) serves all pages statically and mounts `core/groceriesRoutes.js` at `/api/groceries/*`.

- [x] **4.** Same stack as the rest of the app (frontend framework, backend language, database)? If it differs, how?

Same stack: **vanilla HTML/CSS/JS front end (no framework), hand-rolled Node `http` backend (`server.js`, no Express), Postgres (Neon) via `core/db.js`**. Custom CSS with `:root` variables (`css/main.css`, ~17k lines), Space Grotesk/Playfair fonts. Only deviation: `grocery-price-engine/` is a separate ESM sub-project (`"type":"module"`) with its own package.json — the main repo is CommonJS scripts + browser globals.

---

## B. The existing question flow ("already baked into the code")

- [x] **5.** Paste the full list of questions the program currently asks the user, in order, with their exact field names and answer types.

Two stages. **Stage 1 — index.html ns funnel** (`#ns-flow`, steps `data-step="1|2|3"`):

| # | Question | Field / element id | Type · values |
|---|---|---|---|
| 1 | Primary goal | `data-group="goal"` | pill select: `CUT` / `BULK` / `RECOMP` |
| 2 | Training style | `data-group="style"` | pill: `STRENGTH` / `CALISTHENICS` |
| 3 | Training frequency | `data-group="frequency"` | pill: `1-2` / `3-4` / `5-6` (days/week) |
| 4 | Sex | `data-group="sex"` | pill: `MALE` / `FEMALE` (+ `data-pregnant-value` YES/NO, `data-group="trimester"` 1/2/3, `#ns-lactating` NO/YES) |
| 5 | Age (years) | `#ns-age` | number 14–80 |
| 6 | Height | `#ns-height` (inches) or `#ns-height-ft`+`#ns-height-in` | number, unit toggle `data-height-unit` |
| 7 | Current bodyweight (lbs) | `#ns-weight` | number 80–400 |
| 8 | Goal bodyweight (lbs) | `#ns-goal-weight` | number 80–400 |
| 9 | Day Activity (NEAT) | `data-group="dayActivity"` | pill: `SEDENTARY` / `MODERATE` / `ACTIVE` |
| 10 | Session intensity | `data-group="intensity"` | pill: `LIGHT` / `AVERAGE` / `INTENSE` |
| — | Step 3 shows results + email gate | `#ns-email` | email (Klaviyo unlock) |

**Stage 2 — grocery-final.html** (`#g-final-form`):

| # | Question | Field id | Type · values |
|---|---|---|---|
| 1 | Monthly grocery budget | `#g-budget-total` (hidden number, default `300`) + tier buttons `data-budget-tier` | tier: `budget` ("Minimum Effective Plan") / `balanced` ("Balanced Results") / `best` ("Best Performance", default) |
| 2 | Groceries to use (optional) | `#food-source-list`, rendered by `renderFoodSources()` (main.js:25556) | checkboxes over default + custom foods |
| 3 | Preferred store | `#g-store` | select: `Walmart` (only enabled), `Target`/`Sams` disabled "(coming soon)" |
| 4 | Meals per day | `#g-meals` (hidden, default 3) via `.meal-btn` `data-meals` | 2 / 3 / 4 / 5 |
| 5 | Prep style | `#g-prep` | hidden, hardcoded `daily` (no longer asked) |
| 6 | Prices in my area are… | `#g-price-adjustment` | range −20…+20 step 5 (%) |
| 7 | Wake-up time | `#g-wake-time` | select (JS-populated) |
| 8 | Training time | `#g-workout-time` | select (JS-populated) |
| 9 | Zip code | `#g-zip` | text, optional |

(Separately, account onboarding is `js/client-quiz.js` — a BetterMe-style one-question-per-screen quiz whose `SCREENS[]` covers gender, ageRange, build, bodyGoal, equipment, sleep, nutrition habits, height/weight/goalWeight/age, etc. It feeds the identity/scoring system, not the grocery flow.)

- [x] **6.** Which of those answers are stored to the user's profile vs. used once and thrown away?

**Throwaway (per-tab sessionStorage):** everything in the grocery flow. `sessionStorage.grocerySession` (macros + all ns selections — see snippet in Q31) and `sessionStorage.groceryPrefs` (budget, tier, store, meals, prep, zip, price adjustment, timing). Cleared on flow exit (`main.js:28479`, `:4322`, `:11109`).

**Persisted locally:** generated plan snapshot → `localStorage['ode_meal_plan_snapshot_v1']` (`main.js:23118`) with `macroTargets: {calories, protein, carbs, fat}`; onboarding quiz → `localStorage['ode_identity_profile_v1']` (`client-quiz.js:850`).

**Persisted server-side:** onboarding quiz answers POST to `/api/training/onboarding-insights`; profile stats live in Postgres `app_training_profiles` (Q10); saved grocery lists for logged-in users → `app_grocery_lists` (`core/groceriesRoutes.js`, `ensureSchema()`). Custom foods require an account (`#food-sources-login-hint`: "Make an account to use custom groceries"). **The grocery flow answers themselves are never written to the Postgres profile.**

- [x] **7.** Is the flow one long form, a step wizard, or conversational? Paste the component/controller that drives it.

**Step wizard**, two implementations:

1. ns funnel — `index.html` `.ns-step[data-step]` panels driven by the nutrition-funnel controller in `js/main.js` (`nutritionState`, `#ns-next-1`/`#ns-next-2`, progress bar `#ns-progress-fill`), ending in `launchGroceryFlow()`:

```js
// js/main.js:2203
function launchGroceryFlow() {
    if (typeof nutritionState !== 'undefined' && nutritionState.results) {
        const grocerySession = {
            macros: { calories: ..., proteinG: ..., carbG: ..., fatG: ... },
            proteinTarget: nutritionState.results.proteinG,
            timing: 'balanced', prep: 'batch',
            selections: { sex, ageYears, pregnant, trimester, lactating, intensity,
                dayActivity, minutesPerSession, frequency, goal, style,
                heightIn, weightLbs, goalWeightLbs, lossRateLbsPerWeek }
        };
        sessionStorage.setItem('grocerySession', JSON.stringify(grocerySession));
    }
    window.location.href = 'grocery-final.html';
}
```

2. grocery-final — a single-page form (`#g-final-form`) driven by `setupGroceryFinalPage()` (`js/main.js:23812`), then `setupGroceryPlanPage()` (`:26429`) renders the result.

The best wizard component to copy for the picture-picker is `js/client-quiz.js` — declarative `SCREENS[]` array + `mount()/render()/answerAndAdvance()` (:387+) with sectioned progress (`SECTIONS[]` :10), one question per screen.

- [x] **8.** What dietary-restriction options exist today (exact enum values), and how are they applied when filtering meals?

Enums exist **in logic only** — the input markup is orphaned (JS reads `document.getElementById('g-dietary-pref')` and `.allergy-checkbox input` at `main.js:24201/23817/4650/26135`, CSS `.allergy-checkbox` at `css/main.css:1094`, but **no HTML defines them** — they lived in the disabled food wizard). Application logic (`calculateAdjustedBaselineFoods`, `js/main.js:21857`):

```js
const pref = String(dietaryPref || 'no-restrictions').toLowerCase();
const canBeef    = pref !== 'vegetarian' && pref !== 'vegan' && pref !== 'pescatarian' && pref !== 'no-red-meat';
const canChicken = pref !== 'vegetarian' && pref !== 'vegan' && pref !== 'pescatarian';
const canTurkey  = pref !== 'vegetarian' && pref !== 'vegan' && pref !== 'pescatarian';
const canFish    = pref !== 'vegan' && !allergySet.has('fish');
const canEggs    = pref !== 'vegan' && !allergySet.has('eggs');
const canMilk    = pref !== 'vegan' && !allergySet.has('dairy');
const canGluten  = !allergySet.has('gluten');
```

**Dietary pref enum:** `no-restrictions` (default), `vegetarian`, `vegan`, `pescatarian`, `no-red-meat`. **Allergy enum:** `fish`, `eggs`, `dairy`, `gluten` (+ `none`, which clears the rest — `main.js:23831`). Server-side, `server.js:892` independently tags foods `vegetarian`/`vegan`/`dairy`/`gluten-free` from food names. Filtering is food-level exclusion (`can*` gates), not meal-level — meal-level filtering is new work.

- [x] **9.** Is budget already one of the questions? What format — dollar amount per week, per month, low/medium/high tiers?

**Yes — both a monthly dollar amount and a 3-tier selector**, in `grocery-final.html` (see Q5): hidden `#g-budget-total` (default **$300/month**) plus tier buttons `budget` / `balanced` / `best`. Tiers normalize via `normalizeTierForTargetEngine` (`main.js:5584`): `budget|under-200 → MINIMUM`, `balanced|200-400 → BALANCED`, `best|400-plus → BEST` — and these tiers **already drive the protein factors** in the macro engine (Q12/Q13). A budget-forecast widget (`#budget-forecast-main`: "Estimated monthly grocery cost at full target") suggests cheaper options. Marketing pages mention "weekly budget" but the engine is monthly (plan output shows "Avg month (28d)").

---

## C. User profile & the protein math

- [x] **10.** What user stats does the app already have that the meal program can reuse? Exact field names.

**Postgres `app_training_profiles`** (`core/trainingRoutes.js:8932`):

```sql
user_id uuid PK → app_users(id), created_at, updated_at,
onboarding_complete boolean, discipline text, experience text, days_per_week int,
strength jsonb DEFAULT '{}',            -- includes strength.bodyweight, strength.phase ('cut'|'bulk'|'maintain')
first_name text, age int, location_city text, location_state text,
goals text, profile_image text,
-- ALTERed in later:
calorie_offset int DEFAULT 0, no_progress_iterations int, flagged boolean,
eval_weight_lb numeric, eval_weight_at date, last_weighin_lb numeric, last_weighin_at date,
equipment_access jsonb, bio text, injuries text,
sex text,        -- 'male' | 'female' | 'unspecified'
dob date,        -- preferred over age int
timezone text
```

Bodyweight resolution used by scoring (`core/scoringGather.js:206`): `last_weighin_lb || eval_weight_lb || strength.bodyweight`. Goal mode derived from `strength.phase` or regex over `goals` text (`scoringGather.js:123`). Onboarding quiz intake fields (`client-quiz.js:299` `mapAnswers`): `sex, age, height, weight, goal, phase, experience, daysPerWeek, timePerSession, equipment[], injuries[], priorityMuscles[], stepTracking, sleepTracking, wakeTime`. Also `app_user_profiles` (free-form `profile jsonb`, `core/profileRoutes.js:75`) for anything unstructured. **Note:** `location_city`/`location_state` already exist — usable for the BEA multiplier (Q30).

- [x] **11.** Is there an existing TDEE / calorie-target calculation anywhere in the codebase? Paste the formula and where it lives.

**Yes — client-side only**, `computeNutritionTargets()` at `js/main.js:5956` (`method: 'mifflin_st_jeor'`, :6101):

```js
// js/main.js:5980
const sexConst = sexNorm === 'female' ? -161 : 5;
const bmr = Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * ageYears) + sexConst);
const palByDayActivity = { SEDENTARY: 1.25, MODERATE: 1.45, ACTIVE: 1.65 };
const metByEffort = { LIGHT: 3.5, AVERAGE: 5.0, INTENSE: 6.0 };
const sessionsByChoice = { '1-2': 2, '3-4': 4, '5-6': 6 };
const baseline = (bmr * pal);
const netWorkoutWeekly = Math.max(0, (met - 1) * 3.5 * weightKg / 200 * minutesPerSession * sessionsPerWeek);
const workoutDaily = netWorkoutWeekly / 7;
const maintenance = roundTo10(clamp((baseline + workoutDaily), bmr * 1.20, bmr * 2.40));
```

Goal deltas in `computeGoalCalories()` (`js/main.js:5592`) — see Q14. Rate conversions (`calcCalories`, :6079): `lossRate = deficit/500 lb/wk`, `gainRate = surplus*7/3500 lb/wk`. A display-only copy exists in `why-stryve.html:654`. **There is no BMR/TDEE code in `core/`** — the server explicitly doesn't know the calorie target yet: `core/scoringGather.js:332` → `calorieTargetKcal: null, // TODO(owner): surface the client Mifflin target server-side`. Server-side there IS a calorie **auto-adjust**: `upsertWeighin` (`core/trainingRoutes.js:10507`) nudges `calorie_offset` ±200 kcal (clamped ±1200) from bi-weekly weigh-in pace.

- [x] **12.** How was protein target computed in the old code, if at all — g per lb bodyweight, fixed number, tiers?

**g per lb of basis (LBM if body-fat known, else bodyweight), by budget tier**:

- Cut (`computeCutTierMacros`, `js/main.js:5707`): factor `MINIMUM 0.75 / BALANCED 0.90 / BEST 1.05` g/lb, clamped **100–260 g**; fat `0.25×basis` clamped 45–90 g; carbs fill remainder (floor 50 g).
- Non-cut (`computeMacros`, `js/main.js:5795`): `proteinBaseFactor` `MINIMUM 0.85 / BALANCED 0.95 / BEST 1.05`, **+0.10 if bulk**, capped 1.2, clamped **120–260 g**; fat factor bulk `{floor .22, target .25, cap .30}` vs non-bulk `{.30, .33, .40}` of calories; carb floor per training days `5-6→1.00, 3-4→0.75, else 0.50` g/lb.

- [x] **13.** For the three protein tiers (ideal / medium / minimum-to-still-gain), were thresholds ever defined? If yes paste them.

**Yes — twice, and they disagree slightly (reconcile in the build prompt):**

1. Meal engine (g/lb, budget-tier-driven — Q12): cut `0.75 / 0.90 / 1.05`, non-cut `0.85 / 0.95 / 1.05` (+0.10 bulk). In g/kg that's ≈ cut `1.65 / 1.98 / 2.31`, non-cut `1.87 / 2.09 / 2.31`.
2. Scoring engine v2 (`core/scoringConstants.js`, single value per goal, evidence-cited):

```js
// HIGH/MEDIUM: within the 1.6-2.2 g/kg evidence band (Morton 2018 ~1.62 ceiling for FFM;
// ISSN 2017 1.4-2.0; higher when cutting to spare lean mass).
proteinGPerKg: { cut: 2.2, maintain: 1.8, gain: 1.8 },
perMealProteinG: { perKg: 0.25, absoluteMin: 20, absoluteMax: 40 }, // HIGH (ISSN 2017)
calorieBandPct: 0.10,
```

⚠️ A true "minimum-effective-to-still-gain" floor (~1.4–1.6 g/kg ≈ 0.64–0.73 g/lb per Morton 2018 / ISSN 2017) is **lower than the current MINIMUM tier** (0.75–0.85 g/lb). Recommended spec for the new program: **min 1.6 / mid 1.9 / ideal 2.2 g/kg** (cut) and **min 1.6 / mid 1.8 / ideal 2.0 g/kg** (bulk/maintain), which stays inside the evidence band, keeps scoringConstants as the single source of truth, and is close to the existing tier math.

- [x] **14.** Does goal (cut vs bulk vs maintain) already change any calculation in the code, and how?

Yes, three places:

1. `computeGoalCalories` (`js/main.js:5592`): **CUT** (:5622) `maint − lossLbsPerWeek×3500/7`, default `maint×0.80` clamped `[0.75, 0.85]×maint`, hard floor `BMR×1.10`; **LEAN_BULK** (:5646) `maint + gain×3500/7` clamped `[1.05, 1.12]×maint`, default `×1.08`; **RECOMP** (:5658) body-fat-driven `−7.5%`/`+4%`/`0` (no-BF default `−5%`), clamp `[max(BMR×1.10, maint×0.90), maint×1.05]`; **MAINTAIN** = maint.
2. Macro factors differ cut vs bulk (Q12), incl. +0.10 g/lb protein on bulk.
3. `scoringEngine.js:235` picks `proteinGPerKg[goal]`; `trainingRoutes.js:10558-10633` pace targets (cut ideal 1.5–2.0 lb/wk, bulk 0.5–1.0 beginner / 0.25–0.5 int+adv) drive `calorie_offset`.

---

## D. Meal & recipe data model

- [x] **15.** Paste the old meal/recipe schema — what fields did a meal have?

**Meals/recipes: NOT BUILT.** No recipe schema, no meal names, no instructions anywhere. What exists is a **food-item** schema — `WALMART_BASELINE_FOODS` (`js/main.js:2965`, merged with `NEW_GROCERY_ITEMS` :3762 into `ALL_FOODS` :4165):

```js
{
  id: "ground_beef_80_20",
  name: "80/20 Ground Beef",
  store: "Walmart",
  category: "protein_fat",            // protein / carb / fat / protein_fat / legume...
  url: "https://www.walmart.com/ip/...15136796",
  image: "assets/images/products/ground-beef.jpg",
  serving: { amount: 4, unit: "oz" }, servingLabel: "3 oz (85g)", servingGrams: 85,
  macros: { calories: 290, protein: 19, carbs: 0, fat: 23 },
  micros: { fiber_g: 0, potassium_mg: 323, sodium_mg: 76, magnesium_mg: 20, calcium_mg: 24,
            iron_mg: 2.4, zinc_mg: 5.1, vitamin_d_mcg: 0, vitamin_c_mg: 0, vitamin_a_mcg_rae: 3,
            folate_mcg: 7, b12_mcg: 2.4, omega3_epa_dha_mg: 30, choline_mg: 56 },
  sources: ["MyFoodData (USDA)", "FoodStruct / label-style cross-check"],
  container: { size: 80, unit: "oz", price: 26.43 }
}
```

Plans are assembled at runtime from `ALL_FOODS` against macro targets — "meals" in the current output are food allocations, not recipes.

- [x] **16.** Where did meal data live — hardcoded array, JSON file, database table, external API?

**Hardcoded arrays in `js/main.js`** (`WALMART_BASELINE_FOODS` :2965, `NEW_GROCERY_ITEMS` :3762, simpler UI catalog `groceryFoods` :4254). Prices live in JSON files (`data/latest.json`, `data/products.json` — a plain string array — and `grocery-price-engine/config/items.json` with real SKUs like `"sku": "walmart:27935840"`). No meals database table; the only DB table is `app_grocery_lists` (saved outputs). USDA API client exists but is unwired (`js/usda.js`, needs `USDA_API_KEY`).

- [x] **17.** Were meals already tagged breakfast / lunch / dinner? Is snacks a category? What mapping do you want for the new dataset?

**NOT BUILT** — old categories are macro-role tags (`protein`/`carb`/`fat`/`protein_fat`), never breakfast/lunch/dinner. New dataset facts: `category` ∈ Breakfast(15), Chicken & Turkey(15), Beef & Pork(15), Fish & Seafood(15), Vegetarian(10), Snacks & Shakes(5); `goal` ∈ `bulk`(36) / `cut`(39).

⚠️ **Recommended mapping (product decision):**

| Picker tab | Dataset categories |
|---|---|
| Breakfast | `Breakfast` (15 meals) |
| Lunch | `Chicken & Turkey` + `Fish & Seafood` + `Vegetarian` (40 meals, shared pool) |
| Dinner | `Beef & Pork` + `Chicken & Turkey` + `Fish & Seafood` + `Vegetarian` (55 meals, shared pool) |
| Snacks | `Snacks & Shakes` (5) — not a picker tab; engine auto-adds them to close calorie/protein gaps (Q34) |

Lunch/dinner sharing one pool is deliberate — the categories are protein-type, not slot-type, so let both tabs draw from the same meals (dedupe picks). Filter/boost by `goal` tag matching the user's phase (show bulk meals to bulkers first, but don't hard-hide — 36/39 split is too thin to hard-partition after dietary filters).

- [x] **18.** How were ingredients stored per meal — plain strings or structured {item, quantity, unit}? Any ingredient master list?

Old system: no per-meal ingredients (no meals). Foods carried `container: {size, unit, price}`; the grocery-list example format is `{ "name": "Chicken breast", "quantity": 10, "unit": "lb" }` (`data/grocery-list.example.json`); master lists = `data/products.json` (string array) and `grocery-price-engine/config/items.json` (`{group, groupName, sku, name, url, qty, unit}`).

New dataset: **both** — display strings (`ingredients: ["1 cup baby spinach", ...]`) and structured `ing_rows`:

```json
{ "raw": "1 cup baby spinach", "canonical": "baby spinach", "free": false,
  "stores": { "walmart": { "product": "Marketside Fresh Baby Spinach", "price": 2.18,
              "size": "6 oz bag", "url": "https://...", "price_confidence": "listed" },
              "sams": {...}, "target": {...} } }
```

plus the top-level `ingredient_prices` master list (216 items, `{item, category, stores{walmart|sams|target: {product, price, size, url, price_confidence}}}` — categories: Pantry/Produce/Dairy & Eggs/Meat & Seafood/Spices/Frozen/Other). `canonical` in `ing_rows` is the join key to `ingredient_prices.item`. Note: `ing_rows` has no parsed `{quantity, unit}` — quantity lives in `raw` text; the engine should price by container (like the old `container` model), not by fractional usage, for v1.

- [x] **19.** Was there any grocery-pricing logic in the old code at all, or is the new 3-store price data the first time prices enter the system?

**Pricing is the most-built part of the old system — three separate pipelines:** (1) Puppeteer scraper `js/scrape-prices.js` + `js/scrape-config.json` (32 foods × 3 stores, DOM selectors, stealth/proxies, unit normalization lb→oz ÷16, g→oz ÷28.3495; output `data/latest.json` keyed food→store→`{name, price, unit, unitPrice, unitType, url}`); (2) HTTP-API pipeline root `index.js` + `stores/{walmart,target,sams}.js` + `core/{storeUtils,cache,httpClient}.js` (output `{store, product, price, unit, date, source:'api', url}`); (3) `grocery-price-engine/` (cron `0 7 * * *`, cheapest-variant picking by `pricePerBaseUnit`, budget compare vs `config/budget.json` `monthlyBudget: 200`, outputs `data/latest.json` + CSV with `{totals:{totalEstimate, monthlyBudget, overBudget}, items:[...]}`). Plus static `container.price` on every hardcoded food, and the `#g-price-adjustment` ±20% slider. **What's new in the dataset is static per-ingredient 3-store pricing attached to meals** — the old scrapers can later become the refresher for `ingredient_prices`.

- [x] **20.** How were recipe images handled — bundled assets, hotlinked URLs, CDN? Any image caching/fallback pattern already in the app?

Old food images: **bundled assets** at `assets/images/products/*.jpg` (eggs.jpg, tilapia.jpg, ground-beef.jpg, rice.jpg, chocolate-milk.jpg...). No CDN, no caching/fallback pattern found (NOT BUILT). The new dataset **hotlinks recipe-site images** (`image_url: "https://i2.wp.com/www.downshiftology.com/..."`). ⚠️ Hotlinking 75 external images is fragile (hotlink protection, dead links, no licensing control). Recommended default: a one-time download script into `assets/images/meals/<id>.jpg` (repo already bundles images), keep `image_url` as fallback, and add a simple `onerror` swap to a placeholder card. Flag licensing: these are third-party recipe photos — `source_url` attribution on the recipe detail view is the safe pattern.

---

## E. Picture-picker UX (the new front door)

- [x] **21.** Does any picture-grid / card-select component already exist in the app I should reuse?

Yes — combine these (all custom CSS, no framework):

- **`.g-food-grid` / `.food-item`** (`css/main.css:10012`) — responsive selectable grid: `display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr))`, hover/selected borders, rendered by `renderFoodSources()` (`js/main.js:25556`) with `data-food-default` hooks. Closest existing tap-to-select-with-data component.
- **`.store-product-grid` / `.store-product-media` / `.store-product-image`** (`css/main.css:16442`) — product image-card layout (`object-fit:contain`), used by `store-category.html` / `store-product.html`. Best visual base for meal photo cards.
- **`.training-photo-picker`** (`css/main.css:17040`) — image-picker states (`.dragover`, `.has-photo`, `:focus-within`).
- Selection-state classes to copy: `.intake-choice.is-selected`, `.price-option.selected`, `.checkin-pp-slot.has-photo` (has a `::after` checkmark — exactly the tap-to-select affordance needed).
- Wizard chrome: `client-quiz.js` `SCREENS[]` engine + `css/client-quiz.css` (`cards` question type already renders image-figure choices).
- Theming: CSS variables on `:root` (`--bg`, `--card`, `--accent:#c58d4f`, `--radius-md`, `--font-body:'Space Grotesk'`), light theme via `:root[data-theme="light"]`.

- [x] **22.** Confirm the intended flow order: (1) picture picking by breakfast/lunch/dinner tabs → (2) budget → (3) dietary + remaining questions → (4) plan. Anything missing between steps?

⚠️ **Product decision — order confirmed with two inserts recommended:**

1. **Picture picking** (tabs per Q17 mapping, photos + meal name only, no recipes — dataset supports this: `name`, `image_url`, hide `ingredients`/`instructions`).
2. **Budget** (reuse `grocery-final.html` tier buttons + monthly dollar; add store + location here — Q29/Q30).
3. **Dietary + remaining questions** — dietary pref + allergies (rebuild the orphaned UI from Q8 enums), **plus the body-stats questions the macro engine needs** (sex, age, height, weight, goal weight, goal, dayActivity, intensity, frequency — the existing ns funnel fields). For logged-in users, prefill from `app_training_profiles` and skip what's known. **This is the missing piece: nothing in steps 1–2 captures the stats that `computeNutritionTargets()` requires.**
4. **Generated plan.**

Second insert: decide where the existing **email gate** goes (today macros unlock via Klaviyo email capture at `#ns-unlock-btn`). Recommended: keep it between (3) and (4) — user invests picks/answers first, gate right before the payoff, same conversion pattern as today.

Ordering dietary AFTER picking creates a conflict case (user picks steak, then says vegetarian) — handle by filtering picks and backfilling from the same tab's pool. Alternatively swap (2)↔(3); recommended default keeps your stated order with that backfill rule.

- [x] **23.** Minimum/maximum picks per meal slot? Any "skip / surprise me" option?

**NOT BUILT.** ⚠️ Recommended defaults: minimum **3 per slot** (enough variety for a 7-day plan at cook-once×2–3 batching), maximum **8** (keeps the cost/variety solver tractable), and a **"Surprise me" skip per tab** that auto-selects the top budget-appropriate meals for the user's goal tag. Breakfast could allow min 2 (15-meal pool). Enforce via the wizard's Continue button state, same pattern as `client-quiz.js` `pillarGoals` (`min: 2` already exists as precedent in its SCREENS config).

- [x] **24.** Should picks be remembered per user for next time (a "liked meals" list feeding future plans)?

**NOT BUILT.** ⚠️ Recommended: yes — cheap and high-value. Logged-in: store `mealProgram: { likedMealIds: [int], lastPlanAt }` inside the existing `app_user_profiles.profile` jsonb (deep-merge PATCH already exists in `core/profileRoutes.js` — zero schema work). Anonymous: `localStorage['ode_meal_picks_v1']`, matching the existing `ode_*_v1` key convention (`ode_meal_plan_snapshot_v1`, `ode_identity_profile_v1`). Merge local→server on signup, same as onboarding-insights.

- [x] **25.** Mobile-first, desktop web, or both? What screen widths matter most?

Both, mobile-first. Evidence: every page ships `width=device-width, initial-scale=1.0`; layouts use `auto-fit/minmax` grids rather than desktop breakpoints; `grocery-plan.html` has a dedicated mobile tab switcher (`#mobile-plan-switch` "View Grocery List"/"Meals") and `#mobile-size-control`; onboarding quiz is BetterMe-style (phone-shaped); traffic sources in the quiz skew TikTok/Instagram. ⚠️ Recommended: design at **360–430 px** primary (2-column meal cards, `minmax(150px,1fr)`), fluid up to desktop where `auto-fit` naturally yields 4–5 columns; no fixed breakpoints needed given the existing CSS approach.

---

## F. Budget engine (budget → protein tier → plan)

- [x] **26.** Confirm the core rule: budget drives protein tier. Was any of this logic written already? Paste it.

**Rule confirmed, and it's half-built.** The tier→protein mapping is fully written (this is the engine's spine today):

```js
// js/main.js:5584 — normalizeTierForTargetEngine
// 'budget' | 'under-200'  → 'MINIMUM'
// 'balanced' | '200-400'  → 'BALANCED'
// 'best' | '400-plus'     → 'BEST'

// js/main.js:5707 — computeCutTierMacros: protein g/lb by tier
// MINIMUM 0.75 / BALANCED 0.90 / BEST 1.05  (basis = LBM if BF known else BW, clamp 100–260g)

// js/main.js:5795 — computeMacros (non-cut)
// proteinBaseFactor MINIMUM 0.85 / BALANCED 0.95 / BEST 1.05, +0.10 if bulk, cap 1.2, clamp 120–260g
```

What's **NOT BUILT** is the direction you want: deriving the tier **from the dollar amount vs. actual plan cost**. Today the user picks a tier button AND a hidden `$300` default coexists; the legacy tier names (`under-200`, `200-400`, `400-plus`) show the old intent of dollar-banded tiers. New work: price the user's picks (dataset `ing_rows` × multiplier), then solve for the highest tier whose plan cost fits the budget — tier becomes an output, with the buttons as an override.

- [x] **27.** Is the budget per week or per month, and does it cover ALL groceries or just this meal plan?

**Per month** — label "Monthly grocery budget", default $300, output surfaces "Avg Budget (28d)" / "Avg month (28d)" (`grocery-plan.html:50,112`); `grocery-price-engine/config/budget.json` uses `monthlyBudget` too. ⚠️ Scope: in the current system the generated list effectively IS all the user's groceries (every meal, every day), so budget = all groceries. Recommended: keep monthly, keep "covers everything the plan needs" semantics, and note the dataset's `"free": false` flag on `ing_rows` — items marked `free: true` (pantry staples assumed owned) are excluded from cost, which soft-handles the "I already own salt" problem.

- [x] **28.** When budget can't cover the user's picks, what should the program do? Rank the preferred behaviors.

**NOT BUILT.** ⚠️ Product decision — recommended ranking:

1. **Reduce variety first** (more repeats of the user's *cheapest* picks — respects their choices, and repeats are meal-prep-friendly; cost drops because bulk containers amortize across repeats).
2. **Swap in cheaper meals from the same tab/category** (still picture-adjacent to what they liked; prefer same `goal` tag).
3. **Drop protein tier one step** (BEST→BALANCED→MINIMUM) — this is the stated core mechanic, so surface it explicitly: "Tight budget: we've set protein to the minimum that still builds muscle."
4. **Only then** tell the user: show the gap ("You're $23/mo short of the minimum-effective plan") with a raise-budget CTA — mirrors the existing `#budget-forecast-*` "Make the cost cheaper:" widget, which is the precedent for this UX.

- [x] **29.** Should the engine price against one store (cheapest), let the user pick their store, or compare all three?

Existing precedent: **user picks one store**, and only Walmart is enabled (`#g-store`: Target/Sam's "(coming soon)"). The dataset now unlocks all three. ⚠️ Recommended: **price all three per-store totals, show the comparison in the output, default the cart to the cheapest** ("Walmart $67.20 · Target $74.10 · Sam's $71.55 — cheapest selected"). Keep single-store carts (no cross-store mixing — real people shop one store; Sam's needs a membership, worth a badge). This keeps the `#g-store` control but turns it into an informed choice. Note dataset nuance: Sam's is bulk-sized (e.g. eggs 24 ct vs 12 ct), so compare on plan-total, not per-item, and carry `price_confidence` (`listed`/`approx`) into a small "estimated" indicator.

- [x] **30.** Should the user's location be asked so the BEA multiplier table adjusts prices, or is Augusta-base fine for v1?

⚠️ Recommended: **ask state (2-letter select) — it's nearly free.** The dataset's `location_multipliers.states` is a complete 51-state table (`multiplier = RPP_goods(state)/96.293`, e.g. CA 1.102, HI 1.159, AR 0.972), plus a `metros` block for finer grain later. The app already has slots for this: `app_training_profiles.location_state`/`location_city` (prefill for logged-in), the existing `#g-zip` field, and the manual `#g-price-adjustment` ±20% slider (which the multiplier supersedes — keep the slider as a manual override). v1: one `state` select in the budget step, `price × states[st].multiplier`; skip zip→metro resolution for now. Augusta-base-only would silently misprice CA/HI/NY users by 10–16%, which matters when budget drives the protein tier.

---

## G. Plan generation backend

- [x] **31.** Paste whatever plan-generation logic existed — how did the old code turn answers into a week of meals?

Two layers. The **parked pipeline** is placeholder stubs (`js/main.js:7734`):

```js
async function planGroceryList(state, nutritionResults) {
    const { selections, prefs } = state;
    const foods = mergeSelectedFoods(selections);
    const enriched = await annotateWithUSDA(foods);        // Placeholder: USDA when wired
    const quantities = allocateQuantities(enriched, macroTargets, prefs); // "Minimal stub"
    const priced = await attachPricing(quantities, prefs.store);          // price: 'TBD'
    return { store: prefs.store, days: prefs.days, meals: prefs.meals,
             timing: prefs.timing, prep: prefs.prep, items: priced,
             meta: { macroTargets, tolerance: '±10%' } };
}
```

The **working generator** (what `grocery-plan.html` actually runs) is deterministic constraint-fitting, not random and not scoring: `setupGroceryPlanPage()` (`main.js:26429`) reads `grocerySession`/`groceryPrefs` → filters `ALL_FOODS` by dietary gates (`calculateAdjustedBaselineFoods` :21857) → allocates food quantities to hit macro targets, with `enforceMacroClosureWithStaples()` (:713) closing residual macro gaps using staple foods, `scalePlanToOvershootCaps()` (:555) clamping overshoot, `computeTotalsFromBuiltMeals()` (:699) totaling, and container-amortized costs (`calculateInventoryCosts` :4174, weekly + 28-day). Meals-per-day (`g-meals` 2–5) splits allocations into meal slots. **Turning picked recipes into a week plan is new work** — the old engine fits foods, not recipes.

- [x] **32.** What does a generated plan cover — 7 days? Meals per day? Does it repeat meals for meal-prep efficiency?

Current output covers a **repeating daily template** costed weekly and per 28-day month (not 7 distinct days): meals/day = `#g-meals` (2–5, default 3); every day is identical, so repetition is implicit and maximal. `#g-prep` is hardcoded `'daily'` (a batch/daily toggle existed, now hidden). ⚠️ Recommended for the new program: **7-day plan, 3 meal slots + auto-snacks, cook-once-eat-2-3× batching by default** — each picked meal appears 2–3× per week (75-meal dataset with min 3 picks/slot supports this), which is also what makes tight budgets work (Q28 rank 1).

- [x] **33.** Micronutrients: does the old code have a micronutrient source, or is that NOT BUILT?

**Built, surprisingly deep — but keyed to the old food DB:** every `WALMART_BASELINE_FOODS` entry carries a 14-field `micros` block (fiber, potassium, sodium, magnesium, calcium, iron, zinc, vit D/C/A, folate, B12, omega-3 EPA+DHA, choline); DRI reference targets exist (`data/dri-targets.js` — loaded by `grocery-final.html:146` — plus `data/dri_targets.json`, `data/micros_spec.json`); and `grocery-plan.html:54-88` renders a full micros tracker UI for exactly those 14. The USDA FoodData Central client exists but is unwired (`js/usda.js`: "Do not call from UI yet", needs `USDA_API_KEY`; cache at `data/usda-cache.json`). ⚠️ Decision: for v1, **estimate** micros by mapping each meal's `ing_rows[].canonical` to the nearest `ALL_FOODS` entry's per-gram micros (most protein/staple canonicals match); anything unmapped shows "—". Wiring USDA for exact micros is a clean v2 (the client + cache + DRI targets are all waiting).

- [x] **34.** How should servings scale — if a user needs 3,200 kcal, does the engine scale portion multipliers, add snacks, or add meals?

**NOT BUILT** for recipes; the old engine scaled raw food quantities to targets ±10% (`calorieBandPct: 0.10` is also the scoring engine's on-plan band). ⚠️ Recommended order for the new engine: (1) **scale portion multipliers** on picked meals in 0.5× steps, clamped ~0.5–2.0× (dataset macros are per serving — `servings`, `calories`, `protein_g`, `carbs_g`, `fat_g` — so multiplication is exact); (2) **add Snacks & Shakes** (that's what the 5-item category is for) to close remaining gaps — high-protein snacks double as the protein-tier lever; (3) only add a 4th meal slot beyond ~3,500 kcal. Respect `perMealProteinG` from scoringConstants (`{perKg: 0.25, absoluteMin: 20, absoluteMax: 40}`) when distributing protein across slots.

- [x] **35.** What's the output surface — in-app screen, PDF export, shareable link? What did the old code render at the end?

**In-app screen: `grocery-plan.html`** (+ print popup; **no PDF lib exists** — no jsPDF/html2pdf in any package.json). Layout (`grocery-plan.html:17-135`):

```
section.plan-page > .plan-shell
├─ .plan-top  h1 "Your Grocery + Meal Plan"
│  ├─ .plan-summary-bar#plan-macros: #p-store, #p-cal, #p-pro, #p-car, #p-fat, #p-budget "Avg Budget (28d)"
│  └─ section#plan-micros-card (collapsible): 14 .plan-micro-row (Fiber…Choline)
├─ #mobile-plan-switch: [View Grocery List] [Meals]
└─ .plan-grid
   ├─ section.plan-card.weekly-list#grocery-list: #store-pill, #p-weekly-cost, #p-monthly-cost "Avg month (28d)", #grocery-list-items
   └─ (meals tab content)
```

Plus `buildPlanHtml()` (`js/main.js:7615`) — a standalone printable HTML document (inline styles, meta grid of Goal/Style/Frequency/Sex/Age/Height/Weight/Activity/Effort + macro cards) used by the funnel's `#ns-download` / `#ns-print` buttons. Snapshot persists to `localStorage['ode_meal_plan_snapshot_v1']`; logged-in users can save lists to Postgres (`app_grocery_lists`). No shareable links. ⚠️ Recommended: extend `grocery-plan.html` (meals tab becomes meal cards with photo + recipe accordion + per-store cost compare) rather than a new page; keep print-popup as the "export".

---

## H. Integration & delivery

- [x] **36.** Where should `riseforit_meal_data.json` live in the repo — bundled static asset, seeded into the database, or served from an endpoint? Any size constraints (~1 MB)?

⚠️ Recommended: **bundled static asset at `data/riseforit_meal_data.json`**, fetched (not `<script>`-loaded) on the picker page and cached in memory. Precedent: `server.js` already statically serves everything in the repo, and `data/dri-targets.js`/`data/workout-database.json` set the pattern; `core/jsonStore.js` exists if server-side reads are needed. ~1 MB is fine as a one-time fetch, but don't load it on index.html — only on the meal-program pages. Split option if payload matters: meals (~large) / `ingredient_prices` / `location_multipliers` into three files, since the picker only needs meal names+images+macros upfront. Skip DB seeding for v1 (no meals table exists; static data, no writes needed) — revisit if meals become admin-editable via `food-admin.html`.

- [x] **37.** How does the dispatcher → VS Code pipeline want the build prompt formatted — one big work order or phased tickets?

⚠️ Product/process decision, but the repo shows the precedent: `core/scoringConstants.js` references "the Work Order" with numbered tasks ("AGENT-ADDED (Task 3, per the Work Order rule...)"), i.e. the scoring engine v2 was built from **one big work-order markdown with numbered phases and explicit rules** (e.g. "if the engine needs a value not present, add it to scoringConstants with a confidence tag"). Recommended: same format — one `RiseForIt_MealProgram_WorkOrder.md` with ~5 phases (data wiring → picker UI → questions/budget → engine → output screen), per-phase acceptance checks, and a rules block (don't touch scoring files; all new constants into one `mealProgramConstants` module; reuse listed CSS classes).

- [x] **38.** Auth/user context: is there a logged-in user object available on these screens, or must the flow work for anonymous users too?

Both exist. Logged-in: cookie session (`sid`, SHA-256-hashed token → Postgres `app_sessions`; `resolveUserIdFromSession`, `core/profileRoutes.js:90`); client checks `fetch('/api/auth/me', {credentials:'include'})` and caches `window.__odeCurrentUser` (`main.js:9033`) with access gating (trial/demo/Stripe `access_type`). Anonymous: fully supported — the whole grocery funnel runs logged-out today, gated only by **email capture** (Klaviyo unlock), plus a 365-day guest cookie (`core/trackRoutes.js:325`) for analytics. Account-only features already draw the line: custom groceries ("Make an account to use custom groceries") and saved lists (`app_grocery_lists.user_id`). **Build the new flow anonymous-first with the email gate, prefill + persist extras (liked meals, saved plans) when `__odeCurrentUser` exists** — exactly today's pattern.

- [x] **39.** Any existing tests, fixtures, or CI the new feature must not break? Paste how the old meal code was tested, if at all.

**Old meal code: never tested (NOT BUILT).** `tests/` has 19 standalone `*.test.js` scripts — all training/trainer/leaderboard (`cut-mode.policy.test.js`, `trainingEngine.oblueprint.test.js`, `powerbuilding.priority.*.test.js`, `militaryHybrid.*.test.js`, `trainerPageBuilder.*.test.js`, ...) — run manually (no `test` script in package.json, no runner). **No CI**: no `.github/` at repo root (the only workflows are inside `node_modules/` and the vendored `free-exercise-db/`). Only fixtures are scraper debug HTML in `data/debug/`. Constraints for the build: don't break `server.js` static serving/route mounting, `core/` scoring files (**active work in another session right now**), and the training tests' imports. Recommended: add `tests/mealProgram.engine.test.js` in the same standalone-script style.

- [x] **40.** Anything else parked with the old code (half-built screens, TODO lists, notes-to-self) that I should read before writing the prompt? Paste them raw.

Everything found, raw:

```js
// js/main.js:2199
const FOOD_WIZARD_ENABLED = false;
// js/main.js:2239-2243
// Legacy functions (no-op for compatibility)
function openGroceryPage() { return; }    // Permanently disabled
function closeGroceryPage() { return; }   // Permanently disabled
function persistGrocerySession() { return; } // Permanently disabled
// Any attempt to open food wizard will silently fail

// js/main.js:7739-7745 (inside planGroceryList)
// Placeholder: fetch macro data from USDA when wired
// Placeholder: calculate quantities (keep within ±10% of targets)
// Placeholder: pricing lookups / scraping
// js/main.js:7777  — "Minimal stub: return foods with a default quantity; real math will balance to macros ±10%"
// js/main.js:7786  — "Placeholder for store API / scraping integration"  → price: 'TBD', link: '#'

// js/main.js:26373
// Keep grocerySession so planner can read original goal/style context.

// core/scoringGather.js:110
// TODO(owner): curate an explicit exercise_key -> main-lift map if these
// core/scoringGather.js:332
calorieTargetKcal: null, // TODO(owner): surface the client Mifflin target server-side
```

Plus, worth knowing before writing the prompt:

- `js/usda.js` — placeholder USDA client, comment "Do not call from UI yet"; needs `USDA_API_KEY`.
- Orphaned dietary UI: JS reads `#g-dietary-pref` / `.allergy-checkbox` but no HTML defines them (Q8) — the markup died with the food wizard; must be rebuilt.
- `grocery-generator.html` — meta-refresh redirect stub to grocery-final.html ("Redirecting…").
- `js/main.js.bak` — backup copy of main.js sitting in js/ (don't edit the wrong file).
- Root scratch files: `tmp-jasonodell-page.html`, `tmp-jasonodell-live.html`, `tmp-live-coach-route.html`, `walmart-latest.html`.
- `food-admin.html` — existing admin UI over the food catalog (candidate surface for meal-data admin later).
- Three overlapping price pipelines (Q19) — the build prompt should declare the dataset's static prices authoritative for v1 and the scrapers a future refresher, or the agent may try to wire live scraping.
- `grocery-calendar.html` + `js/grocery-calendar.js` (localStorage `ode_grocery_calendar_items_v1`) — half-connected calendar feature that could consume the plan later.
- Demo/marketing plan data: `DEMO_MEAL_PLAN_SNAPSHOT_KEY`, `buildDemoMealSnapshot`, demo grocery item shape at `main.js:20292` (`{name, quantity, category, estimatedWeeklyCost, estimatedCost, image, daily, daysPerContainer, containerPrice, unit}`).
- `PLACEHOLDERS.md` — legacy Jan-2026 launch checklist for the old "TheOBlueprint" template; ignore.
- `.git/COMMIT_EDITMSG` (last commit): "Onboarding: BetterMe-style one-question flow + kill redundant re-asking" — confirms `client-quiz.js` is the freshest UX pattern in the repo to imitate.

---
*All answers from read-only inspection of `D:\Jasons Web` (nothing modified) + the uploaded `riseforit_meal_data.json`.*
