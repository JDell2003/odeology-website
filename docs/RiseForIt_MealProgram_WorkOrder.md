# RiseForIt / Stryve — Picture-Based Meal Program Implementation Work Order

**For the coding agent operating on `D:\Jasons Web`**
**Version 1.0 — 2026-07-13 — authored in-session (the original work order never existed in the repo; this one is written from the answered discovery pass and mirrors the scoring work order's format and rigor).**

Companion docs:
- `docs/RiseForIt_MealProgram_Discovery_ANSWERED.md` — every file path, field name, and code snippet referenced below. Where this work order is silent, that doc's ⚠️ recommendations are the tiebreaker.
- `_workorder_extract.pdf` (repo root) — the scoring engine work order this document mirrors.

---

## READ THIS FIRST — Rules of engagement (non-negotiable)

1. **Additive only. Never destructive.** New pages, new modules, new CSS file. Do not edit `js/main.js` (32k lines, live funnel, concurrently edited by the scoring session), `grocery-final.html`, `grocery-plan.html`, or `index.html`. The new program is a parallel flow at `meal-program.html`; the legacy grocery funnel keeps working untouched.
   - *Recorded deviation from discovery Q35:* the ⚠️ there suggested extending `grocery-plan.html`. That page is driven by `setupGroceryPlanPage()` inside `js/main.js`; extending it means editing main.js. This work order overrides: build a standalone page that **reuses the same CSS classes and visual structure** (`.plan-shell`, `.plan-summary-bar`, `.plan-card`, `.meal-budget-option`, pills) so it looks native, without touching the live files.
2. **Scoring files are off-limits (another session's work):** `core/scoringEngine.js`, `core/scoringGather.js`, `core/scoringConstants.js`, and the scoring parts of `core/trainingRoutes.js`. READ them freely; reuse their values **by importing, never by copy-editing them**.
3. **Every tunable lives in `core/mealProgramConstants.js`**, tagged HIGH / MEDIUM / DESIGN / MIRRORED (MIRRORED = value duplicated for browser use from `core/scoringConstants.js` or `js/main.js`; a Node test must assert each mirror still equals its source where the source is importable). No magic numbers in the engine.
4. **Engine is pure.** `core/mealProgramEngine.js` has zero DB/network imports, no `Math.random`, no `Date.now` inside plan math. Same input → same plan (tests assert determinism). UMD-style export: `module.exports` in Node, `window.MealProgramEngine` in the browser.
5. **Match existing style.** Vanilla JS IIFE on `window.*` for page logic, raw Node `http` backend (no server changes needed — `server.js` already statically serves every repo file, including `data/*.json`), custom CSS with `:root` variables, Space Grotesk. Tests are plain `node:test` scripts in `tests/`, house style of `tests/scoringEngine.*.test.js`.
6. **Anonymous-first.** The entire flow works logged out on a phone. Logged-in users (`/api/auth/me` → `window.__odeCurrentUser`) get prefill (sex/age/weight/state from `app_training_profiles`) and server-persisted liked meals later; anonymous users get `localStorage` (`ode_meal_*_v1` key convention). Email gate (Klaviyo, company `W83QZb`) sits between questions and plan, matching today's `#ns-unlock-btn` pattern; it must never hard-fail the plan if Klaviyo is unreachable.
7. **One phase = one commit**, prefix `feat(mealprogram):` / `test(mealprogram):`. Stage only files this work order creates. Keep `MEALPROGRAM_CHANGELOG.md` at repo root current: files touched, constants added (with tags), acceptance results, deferred TODOs.
8. **The dataset's static prices are authoritative for v1.** The three legacy price-scraper pipelines are future refreshers — do not wire them.
9. **Self-verify each phase** against its acceptance checks before starting the next. Environment note: the Linux sandbox is unavailable (host disk); node runs happen host-side via `.bat` + screen control (`run-mealprogram-tests.bat`, output redirected to a file, `run-scoring-tests.bat` precedent). Code may be authored ahead, but a phase is only *done* — and only committed — once its checks pass.

## CONTEXT (from the answered discovery)

- No recipe content exists anywhere; `data/riseforit_meal_data.json` is the first. 75 meals (Breakfast 15, Chicken & Turkey 15, Beef & Pork 15, Fish & Seafood 15, Vegetarian 10, Snacks & Shakes 5; 36 bulk / 39 cut), each with photo URL, per-serving macros, recipe, structured `ing_rows` (canonical → 3-store container prices + `free` flag) and a precomputed per-store `cart` total. Plus a 216-item `ingredient_prices` master list and BEA `location_multipliers` (51 states, base Augusta 96.293).
- The old meal engine (js/main.js) fits raw foods to macros; recipes-to-week is new work. Its reusable math: Mifflin (`computeNutritionTargets` :5956), goal calories (`computeGoalCalories` :5592), tier→protein factors (:5707/:5795). Mirror these into `mealProgramConstants` — do not import main.js.
- Old dietary enums (logic only, UI orphaned): pref `no-restrictions|vegetarian|vegan|pescatarian|no-red-meat`; allergies `fish|eggs|dairy|gluten|none`. Reuse the exact enums; meal-level filtering is new (keyword inference over `ing_rows[].canonical`, keyword lists are DESIGN constants).
- Protein tiers (discovery Q13 ⚠️, evidence band 1.6–2.2 g/kg): cut `1.6 / 1.9 / 2.2`, bulk-or-maintain `1.6 / 1.8 / 2.0` g/kg for MINIMUM / BALANCED / BEST. `scoringConstants.nutrition` (`proteinGPerKg`, `perMealProteinG`, `calorieBandPct`) is imported/mirrored, never edited.

## PHASE 0 — Data wiring (commit: `feat(mealprogram): phase 0 data wiring`)

- Land the uploaded dataset **byte-exact** at `data/riseforit_meal_data.json` (host `copy` via `.bat`; file tools must not re-serialize it).
- `js/meal-program-data.js`: fetch-once loader (`window.MealProgramData.load()` → cached parsed JSON), fetched only on meal-program pages, never on index.html.
- Skeleton `core/mealProgramConstants.js` (tags in place) + `MEALPROGRAM_CHANGELOG.md`.

**Acceptance:** host `node -e` re-parse prints `meals=75`, `ingredient_prices=216`, `states=51`, and every meal has `name, category, goal, image_url, servings, calories, protein_g, carbs_g, fat_g, ing_rows, cart`; `require('./core/mealProgramConstants')` loads.

## PHASE 1 — Picture picker (commit: `feat(mealprogram): phase 1 picture picker`)

- `meal-program.html` + `css/meal-program.css` (+ `js/meal-program.js` wizard shell): step-wizard (client-quiz.js pattern), step 1 = photo cards under tabs **Breakfast / Lunch / Dinner** mapped per discovery Q17 (Lunch = Chicken & Turkey + Fish & Seafood + Vegetarian; Dinner = those + Beef & Pork; Snacks auto-added by the engine, not a tab). Cards: photo + name + kcal/protein pill only — no recipe yet; `onerror` placeholder swap for dead hotlinks.
- Picks: min 3 per slot (Breakfast min 2), max 8; "Surprise me" per tab deterministically picks top goal-matching, cheapest meals. Goal-tag ordering (user's goal first), no hard hiding. Dedupe: a meal picked in Lunch shows as already-picked in Dinner (shared pool) but may be picked in both.
- Persist picks at every change → `localStorage['ode_meal_picks_v1']`.
- Mobile-first 360–430px: 2-column `minmax(150px,1fr)` grid, fluid to desktop.

**Acceptance:** page loads logged-out; tabs show 15/40/55 meals; Continue disabled until minimums; picks survive reload; images fall back gracefully.

## PHASE 2 — Budget, dietary, stats questions (commit: `feat(mealprogram): phase 2 questions`)

- Step 2 (budget): monthly dollar input (default $300) + the three tier buttons (visual override; tier is normally **derived** — Phase 3), store preference (Walmart / Sam's / Target / "cheapest — compare for me" default), **state select** (51 options → BEA multiplier; prefill `location_state`).
- Step 3 (dietary + stats): dietary pref + allergy checkboxes (exact legacy enums, Q8), then the Mifflin inputs: sex, age, height, weight, goal weight, goal (cut/bulk/maintain), day activity, session intensity, training frequency. Prefill from `__odeCurrentUser` profile when present and skip known fields.
- Dietary-after-picks conflict rule (Q22 ⚠️): filter conflicting picks, auto-backfill from the same tab's pool, tell the user what was swapped.
- Email gate between step 3 and the plan: valid email unlocks; Klaviyo identify/track best-effort; logged-in users skip.

**Acceptance:** full question flow works logged-out on 390px viewport; state multiplier and prefs land in the engine input object; vegetarian pick-conflict demonstrably backfills; email gate unlocks and never blocks on Klaviyo failure.

## PHASE 3 — Plan engine (commit: `feat(mealprogram): phase 3 engine + constants`)

`core/mealProgramEngine.js` (pure) + fully populated `core/mealProgramConstants.js`:

- `computeTargets(stats, tier)`: Mifflin BMR → PAL + workout add (mirrored main.js math) → goal calories (cut ×0.80 clamp [0.75,0.85], floor BMR×1.10; bulk ×1.08 clamp [1.05,1.12]; maintain) → protein by tier g/kg (Q13 table, clamp 100–260 g) → fat fraction → carbs remainder (floor 50 g).
- `inferMealTags(meal)`: keyword inference (beef/pork/poultry/fish/egg/dairy/gluten) over canonicals; `filterMeals(meals, pref, allergies)` using the legacy enums.
- `buildWeekPlan(...)`: 7 days × 3 slots, deterministic round-robin batching (each pick repeats 2–3×), global portion multiplier in 0.5× steps clamped 0.5–2.0×, then Snacks & Shakes close calorie/protein gaps (≤2/day), 4th meal slot only past 3,500 kcal. Respect `perMealProteinG` bounds when distributing.
- Pricing: weekly union of non-free canonicals; containers = `ceil(servingsUsed / servingsPerContainer)`; per-store totals × state multiplier; monthly (28d) = weekly × 4. Cheapest store selected by **plan total** (Sam's bulk sizes; membership badge). Carry `price_confidence` (`approx` → "estimated" flag).
- `fitToBudget(...)` ladder (Q28 ⚠️): (1) reduce variety toward cheapest picks (floor 2/slot) → (2) swap in cheaper same-tab meals (goal-tag preferred) → (3) drop tier one step with the explicit copy "Tight budget: protein set to the minimum that still builds muscle" → (4) surface the remaining gap ("$X/mo short of the minimum-effective plan") — plan still returned.
- Tier derivation: highest tier whose fitted plan cost ≤ budget; tier buttons act as user override.
- Micros: **deferred to v2** (`// TODO(owner)`: wire USDA client + DRI targets per Q33); output shows the micros panel collapsed with an "estimates coming in v2" note.

**Acceptance:** engine has zero DB/network imports; grep shows no magic numbers; same input twice → deep-equal plans; every Phase 5 engine test passes.

## PHASE 4 — Output screen (commit: `feat(mealprogram): phase 4 output`)

Plan step inside `meal-program.html`, visually mirroring `grocery-plan.html`:

- Summary bar (store / calories / protein / carbs / fat / monthly budget), tier + "why this tier" line.
- **7-day plan**: day tabs or vertical days, meal cards with photo, name, portion multiplier, per-serving macros; tap → recipe accordion (ingredients, instructions, prep time, `source_url` attribution link — licensing-safe pattern).
- **Priced grocery list**: unique ingredients with product name, container size, count, store price; `free` pantry items in a "you likely have these" section; "estimated" badge on `approx` confidence.
- **Store comparison**: Walmart / Sam's / Target plan totals, cheapest highlighted, Sam's membership badge; switching store re-renders list + totals locally.
- Budget bar: plan monthly cost vs budget, ladder messages (what was reduced/swapped/dropped). Print button (popup print, no PDF lib). Persist plan → `localStorage['ode_meal_program_plan_v1']`.

**Acceptance:** logged-out phone user reaches a full 7-day plan under (or explained-over) budget with recipes, priced list, and 3-store comparison; reload restores the plan; mobile switcher between list and meals works.

## PHASE 5 — Tests (commit: `test(mealprogram): engine coverage`)

`tests/mealProgram.engine.test.js` (plain `node:test`, loads the real dataset via `fs`):

- Dataset integrity: 75 meals / 216 priced ingredients / 51 states; required fields present.
- Mirror-sync: every MIRRORED constant equals its `scoringConstants` source.
- Targets: Mifflin male/female known-answer checks; cut floor ≥ BMR×1.10; protein tier table honored and clamped; goal-weight-vs-weight direction sanity.
- Dietary: vegetarian excludes all beef/pork/poultry/fish meals; `gluten` allergy excludes gluten-tagged meals; `none` clears.
- Plan: 7 days × ≥3 slots; each day within `calorieBandPct` of target after snack fill (or an explicit warning when impossible); portion multipliers within 0.5–2.0 in 0.5 steps; batching ≤3 repeats per pick per week.
- Budget ladder: tight budget triggers variety reduction before tier drop; impossible budget still returns a plan + gap warning; tier derivation picks the highest affordable tier.
- Store compare: per-store totals computed; cheapest selected; CA multiplier raises totals vs GA.
- Determinism: two identical runs deep-equal.

**Acceptance:** `node --test tests/mealProgram.engine.test.js` exits 0 host-side; failures recorded and fixed before the commit.

## DEFINITION OF DONE (whole project)

- ☐ A logged-out phone user gets a full 7-day plan **under budget** (or with an explicit gap explanation) with recipes, a priced grocery list, and a Walmart/Sam's/Target comparison.
- ☐ `node tests/mealProgram.engine.test.js` (via `node --test`) passes.
- ☐ All six phases committed with shown prefixes, own files only; `MEALPROGRAM_CHANGELOG.md` current with constants + confidence tags per phase.
- ☐ No edits to `js/main.js`, scoring files, or the legacy grocery pages; legacy funnel unaffected.
- ☐ Dataset byte-exact in `data/`, verified by re-parse counts.
- ☐ Owner-action list recorded (nav entry, Klaviyo list wiring check, image download script decision, micros v2).

## GUARDRAILS — what NOT to do

- No edits to scoring files or `js/main.js`/`main.js.bak`; no `git add .` (other session's scratch files are untracked at root).
- No live price scraping; no USDA calls; no new npm dependencies; no frameworks/build steps.
- No `Math.random` in the engine; "Surprise me" is deterministic.
- Do not hotlink-download images in this pass (owner decision; `onerror` placeholder is the v1 mitigation, Q20).
- Do not gate the plan on Klaviyo success.
