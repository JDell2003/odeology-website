# POWERBUILDING Generator v1

## Current status

- POWERBUILDING is supported in the backend generator through `trainingFeel = "Powerbuilding"`.
- The generator routes POWERBUILDING into a separate logic path instead of reusing the bodybuilding priority module directly.
- POWERBUILDING is now exposed as a selectable lane in the current frontend wizard.
- The current visible wizard still uses the older discipline-style lane UI, but both bodybuilding and powerbuilding are enabled while other lanes remain disabled or marked coming soon.

## Design decision

- POWERBUILDING reuses the same onboarding schema as Aesthetic bodybuilding.
- Do not add `powerbuildingStrengthPriority`.
- Do not add new priority buttons.
- Do not retag the exercise database right now.
- Do not create a separate POWERBUILDING onboarding flow unless the frontend needs minor conditional visibility changes to expose the existing shared fields cleanly.

## Shared inputs used by POWERBUILDING

POWERBUILDING currently uses the same accepted payload family as the bodybuilding path:

- `trainingFeel`
- `primaryGoal`
- `timeline`
- `focus`
- `experience`
- `location`
- `trainingStyle`
- `outputStyle`
- `closeToFailure`
- `daysPerWeek`
- `sessionLengthMin`
- `priorityGroups`
- `movementsToAvoid`
- `preferredDays`
- `equipmentAccess`
- `painAreas`
- `painProfilesByArea`
- `bench`
- `benchVariation`
- `benchWeight`
- `benchReps`
- `lowerMovement`
- `lowerWeight`
- `lowerReps`
- `hingeMovement`
- `hingeWeight`
- `hingeReps`
- `sleepHours`
- `activityLevel`
- `stress`
- `planSeed`

Legacy or classic fields may still be coerced before build, but POWERBUILDING v1 is defined around the shared accepted payload above.

## How POWERBUILDING interprets shared fields

- `trainingFeel` activates the separate POWERBUILDING module and split logic.
- `focus` changes the strength vs size vs aesthetic balance inside the same powerbuilding path.
- `priorityGroups` still represent muscle and visual priorities, not direct lift-max intent.
- `Chest` means more chest growth plus bench-supportive work, not "maximize bench at all costs."
- `Legs` means lower-body and knee-dominant development plus squat-supportive work.
- `Glutes` and `Back` can increase hinge or posterior-chain emphasis, but should not force deadlift-family work when recovery, pain, equipment, or avoidance constraints block it.
- `Calves` and `Core` remain protected small priorities and should not disappear when selected.
- Strength-related input fields help infer bench, squat, and hinge emphasis, but they do not create a separate user-facing intent field.

## Powerbuilding programming rules

- Strength anchors should appear first or very early in the session.
- Hypertrophy accessories should support the selected priority groups instead of competing with the main pattern.
- Strength work uses heavier, more specific, lower-rep programming and should avoid reckless failure.
- Hypertrophy work uses safer accessories, more volume, and closer-to-failure work where appropriate.
- POWERBUILDING should not collapse into pure bodybuilding or pure powerlifting.
- Avoid shotgun programming: do not maximize load, total volume, and failure exposure all at once.
- Recovery, pain, equipment, and `movementsToAvoid` override inferred emphasis when needed.

## Constraint behavior

- `equipmentAccess` is a hard filter.
- `equipmentAccess` is hard-filtered end-to-end in both direct generation and route-level build validation.
- `trainingStyle` is a preference, not a hard filter.
- `movementsToAvoid` must block bench-, squat-, and deadlift-family patterns when those movements are explicitly avoided.
- High-severity or recent pain modifies the weekly pattern budget, not just a single exercise choice.
- Low sleep and high stress reduce heavy exposure and accessory density.
- `LowerFocus` requires posterior-chain coverage, not always a classic hinge.
- If hinge or deadlift is blocked, the builder should use safe posterior-chain substitutes or lower-body accessory support instead of forcing deadlift-family work.

## Tests and reports

- [tests/powerbuilding.priority.matrix.test.js](/d:/Jasons%20Web/tests/powerbuilding.priority.matrix.test.js) is the 40-case spec matrix.
- [tests/powerbuilding.priority.logic.test.js](/d:/Jasons%20Web/tests/powerbuilding.priority.logic.test.js) covers unit and logic behavior.
- [tests/powerbuilding.priority.execution.test.js](/d:/Jasons%20Web/tests/powerbuilding.priority.execution.test.js) runs a real generator execution audit against matrix expectations.
- [reports/powerbuilding.sample-inspection.md](/d:/Jasons%20Web/reports/powerbuilding.sample-inspection.md) contains the 16-plan coach-quality inspection pass.

Verification commands:

```powershell
node --test tests\powerbuilding.priority.matrix.test.js
node --test tests\powerbuilding.priority.execution.test.js
node --test tests\powerbuilding.priority.logic.test.js
node --test tests\trainingEngine.oblueprint.test.js
```

## Frontend next step

The next product step is frontend polish, not new generator inputs.

- Reuse the same question set.
- Ensure the existing strength-related fields are visible and available for POWERBUILDING users.
- Keep `priorityGroups` the same.
- Do not create a separate priority UI.
- Do not add `powerbuildingStrengthPriority`.
- Do not retag the exercise database unless future sample outputs show real exercise-selection failures that logic cannot solve.
