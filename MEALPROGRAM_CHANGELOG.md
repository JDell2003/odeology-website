# Meal Program Changelog

Work order: `docs/RiseForIt_MealProgram_WorkOrder.md` (authored in-session 2026-07-13 — the original was never in the repo; owner instructed writing it from the answered discovery pass, mirroring the scoring work order).
Reference: `docs/RiseForIt_MealProgram_Discovery_ANSWERED.md` (⚠️ recommendations are the tiebreaker).

Environment note: Linux sandbox unavailable (host C: disk space), so node runs and git happen host-side via `.bat` + screen control (`run-scoring-tests.bat` precedent). Phases were authored in order; node-verified acceptance checks and per-phase commits are batched host-side. Because commits are batched, shared files appear in their final state in each phase's commit — phase attribution below is authoritative.

---

## Phase 0 — data wiring
- **Files:** `data/riseforit_meal_data.json` (byte-exact host copy of the uploaded dataset), `js/meal-program-data.js` (fetch-once loader `window.MealProgramData`), `docs/RiseForIt_MealProgram_WorkOrder.md`, `docs/RiseForIt_MealProgram_Discovery_ANSWERED.md`, this changelog.
- **Constants added:** none yet (skeleton lands with Phase 3 file).
- **Acceptance:** PASS (host run 2026-07-13) — re-parse prints meals=75, ingredient_prices=216, states=51, metros=31, missingFields=0; categories and goal split match discovery; 31,241 lines, 978,999 bytes.
- **Transfer note:** the upload was unreachable by normal host file APIs (Claude session storage is app-virtualized; only enumeration worked), so the file was first transcribed through session file tools in 16 parallel 2,000-line chunks and assembled host-side. A robocopy backup-mode attempt turned out to have hydrated the true original, so the final committed file was **restored byte-exact from the source upload** (fc /b verified, 979,031 bytes); the transcription path remains documented in case it's ever needed again. All integrity checks + 27/27 tests pass against the restored file.
- **Deferred:** none.

## Phase 1 — picture picker
- **Files:** `meal-program.html` (wizard page skeleton, all steps), `css/meal-program.css` (namespaced `.mp-*`, mobile-first 360–430px, reuses `:root` vars + `.btn`), `js/meal-program.js` (wizard shell, tab picker Breakfast/Lunch/Dinner per Q17 mapping, min/max pick enforcement, deterministic Surprise-me, `onerror` SVG placeholder, `localStorage ode_meal_picks_v1`, `/api/auth/me` best-effort prefill).
- **Constants:** `picker.*`, `slotCategories` (DESIGN, discovery Q17/Q23 ⚠️).
- **Acceptance:** static checks done (pool sizes 15/40/55 asserted in tests); in-browser check = owner smoke test on phone. Continue gating + reload persistence implemented.
- **Deferred:** picker images stay hotlinked (Q20 owner decision pending).

## Phase 2 — questions
- **Files:** `js/meal-program-questions.js` (budget + tier override + store + state selects; dietary pref + allergies with legacy enums and `none`-clears rule; Mifflin stats pills; email gate with Klaviyo `W83QZb` best-effort, logged-in skip).
- **Constants:** `budget.defaultMonthly` (MIRRORED), `dietaryPrefs`/`allergyOptions` (MIRRORED main.js enums), `storageKeys` (DESIGN).
- **Acceptance:** state list is generated from the dataset's 51-state BEA table; dietary conflict backfill handled in the engine (tested); email gate never blocks on Klaviyo failure (try/catch + fire-and-forget).

## Phase 3 — engine + constants
- **Files:** `core/mealProgramEngine.js` (pure UMD, zero DB/network, no Math.random/Date), `core/mealProgramConstants.js` (fully populated, tags on every block).
- **Constants added (tags):** mifflin/PAL/MET/goalCalories (MIRRORED main.js), proteinTiersGPerKg (MEDIUM, Q13 ⚠️ — BEST-cut pinned to scoringConstants ceiling), proteinClampG/minFatG/carbFloorG (MIRRORED), fatCalorieFraction 0.28 (DESIGN), mirroredScoring (MIRRORED scoringConstants w/ Node live-import + drift literals), dietKeywords/prefBlocks (DESIGN — note: vegetarian excludes fish here, deviating from legacy `canFish` food-gate; recorded), week.* (DESIGN — maxRepeatsPerPick=4 since 2-pick breakfasts need ceil(7/2)), pricing.servingsPerContainerByCategory + bulkFactorByStore sams=3 (DESIGN/TODO(owner)), budget.* incl. varietyFloorPerSlot=2 + tierDropCopy (DESIGN, Q28 ⚠️), output bands (MIRRORED plan copy).
- **Engine:** targets → diet filter/backfill → deterministic 7-day round-robin batching → per-day 0.5×-step portion scaling (0.5–2.0) → snack fill (≤2/day) → 4th meal >3500 kcal → monthly-first container pricing × BEA state multiplier → 3-store totals → budget ladder (variety→swap→tier→gap) with cost-increase reverts. Tier derived (highest affordable) unless overridden.
- **Fix during test run:** added `categoryTags` (DESIGN) — protein-type categories (Beef & Pork / Chicken & Turkey / Fish & Seafood) now set dietary tags directly, catching meals whose ingredient names dodge the keyword lists (found by the vegetarian-filter test).
- **Acceptance:** PASS — zero DB/network imports; all tunables in constants; engine tests green (see Phase 5).

## Phase 4 — output screen
- **Files:** `js/meal-program-plan.js` (summary bar, budget bar, ladder/warning messages, 3-store comparison cards w/ cheapest highlight + Sam's membership badge + estimated-price flag, priced grocery list w/ container counts + free-pantry section, 7-day meal cards w/ recipe accordion + `source_url` attribution, print via `window.print`, start-over reset, plan persisted to `ode_meal_program_plan_v1` and restored on reload).
- **Deviation recorded:** standalone page mirrors `grocery-plan.html` visuals instead of extending it (work order rule 1 — avoids editing `js/main.js`).
- **Deferred:** micros panel omitted for v1 (Q33 → v2 with USDA client); owner action listed.

## Phase 5 — tests
- **Files:** `tests/mealProgram.engine.test.js` (27 tests: dataset integrity, mirror drift guard, Mifflin known-answers, tier table + clamps, dietary/allergy filters + Q17 pool sizes, plan shape/batching/portion grid, conflict backfill, budget ladder order + variety floor + impossible-budget gap, tier override, store compare + preference + BEA multiplier, free-item exclusion, determinism, surprise bounds), `mp-verify.bat`/`mp-assemble.js` (host runners, scratch — not committed).
- **Acceptance:** PASS — `node --test tests/mealProgram.engine.test.js`: 27/27 pass, exit 0 (host, node v24.12.0, 2026-07-13). One engine fix during the run (categoryTags, see Phase 3); dataset transfer fixed the initial ENOENT failure.

## Owner actions (running list)
1. No nav entry added anywhere (additive-only rule): link `meal-program.html` from the site when ready.
2. Recipe photos are hotlinked third-party images with `onerror` placeholder fallback (v1 per discovery Q20). Decide on the one-time download-to-`assets/images/meals/` script; `source_url` attribution is rendered on recipe details.
3. Micros tracker deferred to v2 (discovery Q33): wire `js/usda.js` + DRI targets for exact micros.
4. Klaviyo: the email gate identifies/tracks against company `W83QZb` best-effort; confirm the list/flow wiring in the Klaviyo dashboard.
5. Pricing model v1 is container-based (per-category `servingsPerContainerByCategory` + Sam's `bulkFactor=3`, DESIGN): refine with per-unit amortization (like main.js `calculateInventoryCosts`) in v2.
