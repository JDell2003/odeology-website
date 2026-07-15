# RiseForIt Selection Engine — "Everyone Gets a Great Workout" Change Log

Tracks the Selection Engine work order (v1.0). One task = one commit.

---

## Task 0 — Reconcile with the in-progress rewrite ✅ (blocker)

**State on entry:** `generator/trainingEngine.oblueprint.js` working copy **equals HEAD**
(12,949 lines) — no uncommitted rewrite in the tree. The incomplete 2,464-line
rewrite (which had removed the projection layer) remains **shelved in `git stash@{0}`**
from the progression work order and was NOT applied. HEAD already contains the
committed progression upgrades (config/flag, per-lift steps, anchors, telemetry,
readiness governor, cardio, spider coupling).

**Decision:** the tree is already **one stable base (HEAD)**. Nothing to land or
shelve. Verified the base builds a valid plan (weeks=8, no error). All selection
work below targets this base.

Only non-engine concurrent-agent changes are in the tree (`data/trainer-websites.json`
+ untracked files) — left untouched.

## Task 1 — Baseline + triage ✅ (commit: `test(selection): baseline + triage`)

**Golden fixtures:** `tests/fixtures/selection-golden.json` snapshots all **56 healthy
builds** (bodybuilding + powerbuilding × 3-6 days × 7 priority combos), each with a
fixed seed + a SHA-256 structure hash. `tests/selection.golden.test.js` rebuilds all
56 and asserts identical hashes — **must stay green through every task**. (Runs ~140s
locally; `// TODO(owner): mark @slow / nightly if CI budget is tight.`)

**Triage of the 21 failing selection tests** — dominant root cause is the exercise
**pool running empty for constrained cells** (`NO_ELIGIBLE_EXERCISE`) and a required
**hinge pattern removed by injury/equipment**.

| # | Test | Failing invariant | Class |
|---|---|---|---|
| 1 | stage 1 safe base planner (10 locked cases) | NO_ELIGIBLE_EXERCISE | A |
| 2 | golden regression set 1 (lena_abs_calves) | NO_ELIGIBLE_EXERCISE | A |
| 3 | final plan carries canonical exercise truth | NO_ELIGIBLE_EXERCISE | A |
| 4 | equipment matrix clean across constrained access | NO_ELIGIBLE_EXERCISE | A |
| 5 | 2-day abs-calves beginner shows both priorities | NO_ELIGIBLE_EXERCISE | A |
| 6 | arm-priority dumbbell-only intermediate | NO_ELIGIBLE_EXERCISE | A |
| 7 | dumbbell-only back-arms intermediate | NO_ELIGIBLE_EXERCISE | A |
| 8 | adversarial coverage cases stay valid | NO_ELIGIBLE_EXERCISE | A |
| 9 | golden regression set 2 (dumbbell_only_arms_shoulders) | NO_ELIGIBLE_EXERCISE | A |
| 10 | advanced arm-priority forearm support | thin pool: no direct forearm | A |
| 11 | eligible advanced users neck work | thin pool: no direct neck | A |
| 12 | 200 randomized valid profiles (case 0) | NO_ELIGIBLE_EXERCISE | A |
| 13 | glutes+core 75+ real lower work | "Lower day must include one hinge" | A/C |
| 14 | back pain avoids high-risk hinge | "Lower day must include one hinge" (injury removes hinges) | C |
| 15 | machine/cable-only lower injured, no db leak | "Lower day must include one hinge" | A/C |
| 16 | machine-cable lower-priority push-pull coherence | "Lower day must include one hinge" | A/C |
| 17 | route fallback repairs raw invalid bodybuilding | expected "missing shoulder press", got "too many bench compounds" | B |
| 18 | route fallback short-session shoulders-arms | "Leg day must start with staple squat/press" | B |
| 19 | live parity constrained machine lower-body | display-truth divergence (actual true, expected false) | B |
| 20 | chest-shoulders-arms cap chest pressing | "Push: chest pressing exceeded slot cap" | B |
| 21 | elite QA rubric flags plans at least good | quality score below "good" | B |

**Resolution map:** A (12) + A/C (4) → **Task 2** (fill empty pool cells) + **Task 3**
(injury-safe hinge/pattern substitutes). B (5) → **Task 4** (principled relaxation
ladder converges to a valid plan / consistent repair). Genuinely over-constrained
(class C, e.g. #14 back-pain with all hinges unsafe) → **Task 5** fallback + **Task 6**
reclassify the assertion to expect the safe degraded output with a visible note.

## Task 2 — Selection-pool audit ✅ (commit: `fix(selection): fill empty cells`)

`scripts/selection-pool-audit.js` counts equipment-compatible exercises for every
(equipment subset × muscle) and (equipment subset × movement pattern) cell across
the 549 preprocessed catalog exercises.

**Key finding — the catalog is NOT the bottleneck.** Zero **empty** required cells.
Only 4 thin (<2) cells, all in edge equipment that onboarding never offers
alone: `bands_only`/`bodyweight_only` × `Biceps`/`Calves` (bodyweight direct
biceps/calves is genuinely limited; chin-ups + bodyweight calf raises cover them).
Equipment × pattern: 0 empty, a few thin (Power/Lunge on constrained kits — Power
isn't a demanded hypertrophy slot).

**Therefore the class-A `NO_ELIGIBLE_EXERCISE` failures are NOT missing catalog
entries — they are fine-grained filter intersections** (injury flags + style purity
+ per-week dedupe + difficulty caps emptying a *contextual* cell mid-build), plus
equipment mislabeling in the source data (e.g. "3/4 Sit-Up" tagged `requiredEquipment:
['barbell']`). The guarantee is therefore delivered by the **relaxation ladder
(Task 4)** + **injury-safe substitutes (Task 3)** + the **safe fallback floor
(Task 5)**, not by stuffing the catalog. This is the correct, lower-risk path and
keeps the golden-56 untouched.

`// TODO(owner):` a catalog consolidation pass (fix mislabeled requiredEquipment on
source rows) would further widen thin cells; deferred as data-cleanup, not required
for the guarantee.
