# Military Hybrid Generator v1

## Status

Military Hybrid is a supported generator lane:

- `discipline = "military"`
- `trainingFeel = "Military Hybrid"`
- UI label: `Military = Endurance + Strength`

It is available in the same onboarding modal and training wizard used by Bodybuilding and Powerbuilding. Powerlifting and Calisthenics remain disabled.

## Product Boundary

This lane is general fitness and military-readiness training. It does not generate combat, weapons, tactical, or occupational instruction.

Military Hybrid reuses the existing onboarding schema, controls, priority groups, exercise database, and workout display. It does not add a Military-only priority field or a separate frontend flow.

## Shared Inputs

The lane uses the existing fields for goal, timeline, focus, experience, days per week, session length, preferred days, location, equipment, training style, output style, proximity to failure, priority groups, pain, movements to avoid, strength numbers, recovery, and plan seed.

The same muscle priorities remain available:

- Chest
- Back
- Legs
- Glutes
- Calves
- Shoulders
- Arms
- Core

Priority order protects hypertrophy support, but readiness requirements are not removed when a user chooses upper-body priorities.

## Programming Identity

Each complete week combines:

- At least one strength anchor using conservative strength-style loading
- Aerobic base work through Zone 2 running or a safe low-impact replacement
- Limited high-intensity conditioning through intervals and/or work-capacity circuits
- Bodyweight endurance and trunk endurance
- Explosive power when impact tolerance permits
- Hypertrophy accessories selected through the shared priority system

Strength work stays early. Conditioning quality is not progressed by taking strength sets to failure. Hypertrophy support remains present without turning the plan into a bodybuilding-only week.

## Scheduling Rules

- 2 days: full-body strength with minimum viable intervals and Zone 2
- 3 days: full-body/lower/full-body hybrid
- 4 days: upper/lower/upper/lower readiness structure
- 5 days: added pull/full-body capacity
- 6 days: advanced distribution with workload spread across the week

High-intensity conditioning is capped at two weekly exposures under normal recovery and one under low recovery. Zone 2 is separated from the hardest work-capacity day when the schedule has enough room.

Preferred weekdays are used to spread the two hard-conditioning exposures. When users select consecutive training days, the builder chooses the widest available calendar spacing rather than blindly placing intervals and work capacity on adjacent days.

Session task caps:

- 30 minutes: 4 tasks
- 45 minutes: 5 tasks
- 60 minutes: 6 tasks
- 75+ minutes: 8 tasks

## Constraints

`equipmentAccess` is a hard filter. Sled work appears only with sled access. Loaded carries require an eligible load. Home/bodyweight plans use compatible substitutes.

Custom running, carry, sled, power, and endurance tasks intentionally use generic icon fallbacks with null image paths. Existing database exercises continue using their existing media, so a custom readiness task cannot render a broken image URL.

Pain and movement avoidance affect weekly structure:

- Running or severe lower-limb pain replaces impact conditioning with low-impact work.
- Blocked deadlift/hinge work uses safe posterior-chain support.
- Missing or unsafe squat patterns use a controlled knee-dominant substitute.
- Severe shoulder/elbow/wrist pain replaces standard push-up endurance with a pain-free upper-body endurance slot.
- Low sleep, high stress, a calorie deficit, or severe pain reduces hard conditioning and accessory density.

The direct Military builder owns these substitutions. It does not depend on bodybuilding fallback broadening.

## Implementation

- `generator/militaryHybrid.oblueprint.js`: Military profile, split, strength slots, readiness tasks, session trimming, fatigue controls, substitutions, final validation
- `generator/trainingEngine.oblueprint.js`: lane activation and shared planner hooks
- `core/trainingRoutes.js`: payload normalization, routing, and Military-specific route validation
- `js/training.js`: shared wizard mapping and enabled lane
- `training-coming-soon.html`: legacy modal entry point

## Verification

```powershell
node --test tests\training.frontend.military-wiring.test.js
node --test tests\militaryHybrid.matrix.test.js
node --test tests\militaryHybrid.logic.test.js
node --test tests\militaryHybrid.execution.test.js
```

Regression suites:

```powershell
node --test tests\training.frontend.powerbuilding-wiring.test.js
node --test tests\powerbuilding.priority.matrix.test.js
node --test tests\powerbuilding.priority.logic.test.js
node --test tests\powerbuilding.priority.execution.test.js
```

The sample coach audit is in `reports/militaryHybrid.sample-inspection.md`.
