const test = require('node:test');
const assert = require('node:assert/strict');

const ACCEPTED_FIELDS = [
  'trainingFeel',
  'primaryGoal',
  'timeline',
  'focus',
  'experience',
  'location',
  'trainingStyle',
  'outputStyle',
  'closeToFailure',
  'daysPerWeek',
  'sessionLengthMin',
  'priorityGroups',
  'movementsToAvoid',
  'preferredDays',
  'equipmentAccess',
  'painAreas',
  'painProfilesByArea',
  'weightLb',
  'bodyweight',
  'bench',
  'squat',
  'deadlift',
  'benchVariation',
  'benchWeight',
  'benchReps',
  'lowerMovement',
  'lowerWeight',
  'lowerReps',
  'hingeMovement',
  'hingeWeight',
  'hingeReps',
  'sleepHours',
  'activityLevel',
  'stress',
  'planSeed'
];

const ACCEPTED_FIELD_SET = new Set(ACCEPTED_FIELDS);

function buildPayload(overrides = {}) {
  return {
    trainingFeel: 'Powerbuilding',
    primaryGoal: 'Recomp',
    timeline: '8 weeks',
    focus: 'Strength',
    experience: '6-24m',
    location: 'Commercial gym',
    trainingStyle: 'Balanced mix',
    outputStyle: 'RPE/RIR cues',
    closeToFailure: 'No',
    daysPerWeek: 4,
    sessionLengthMin: '60',
    priorityGroups: ['Chest', 'Back'],
    movementsToAvoid: [],
    preferredDays: ['Mo', 'Tu', 'Th', 'Fr'],
    equipmentAccess: ['Dumbbells', 'Barbell', 'Cable', 'Machines'],
    painAreas: [],
    painProfilesByArea: {},
    weightLb: 185,
    bodyweight: 185,
    bench: 225,
    squat: 315,
    deadlift: 405,
    benchVariation: 'Barbell Bench Press',
    benchWeight: 185,
    benchReps: 8,
    lowerMovement: 'Back Squat',
    lowerWeight: 275,
    lowerReps: 5,
    hingeMovement: 'Romanian Deadlift',
    hingeWeight: 315,
    hingeReps: 6,
    sleepHours: 7,
    activityLevel: 'Active',
    stress: 'Medium',
    planSeed: 20001,
    ...overrides
  };
}

function buildCase({
  id,
  title,
  payloadOverrides,
  inferredStrengthEmphasis,
  expectedSplitBehavior,
  expectedMainMovementFrequency,
  expectedAccessoryBias,
  expectedRecoveryRules,
  exercisesToAvoid,
  passFailChecks
}) {
  return {
    id,
    title,
    payload: buildPayload({
      ...payloadOverrides,
      planSeed: Number(20000 + id)
    }),
    inferredStrengthEmphasis,
    expectedSplitBehavior,
    expectedMainMovementFrequency,
    expectedAccessoryBias,
    expectedRecoveryRules,
    exercisesToAvoid,
    passFailChecks
  };
}

const POWERBUILDING_PRIORITY_MATRIX = [
  buildCase({
    id: 1,
    title: 'Powerbuilding + Strength focus + Chest priority',
    payloadOverrides: {
      focus: 'Strength',
      priorityGroups: ['Chest', 'Back', 'Arms']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Chest-first ordering plus strong bench data should make the bench pattern the top strength anchor.'
    },
    expectedSplitBehavior: 'Upper/lower or push-pull-upper-lower shape with the best upper slot allocated to a bench or close horizontal press early in the week.',
    expectedMainMovementFrequency: 'Bench pattern 2x weekly, squat pattern 1x weekly, hinge pattern 1x weekly minimum.',
    expectedAccessoryBias: 'Chest press support, triceps support, upper-back stability, controlled shoulder volume.',
    expectedRecoveryRules: 'Bench work stays away from repeated grinders; shoulders do not get enough isolation volume to flatten pressing performance.',
    exercisesToAvoid: ['high-fatigue redundant shoulder pressing', 'extra chest fly spam ahead of bench support work'],
    passFailChecks: [
      'Primary upper strength slot is a bench or close horizontal press pattern.',
      'At least one rowing or vertical pulling support pattern is preserved.',
      'Triceps support exists without crowding out the bench anchor.'
    ]
  }),
  buildCase({
    id: 2,
    title: 'Powerbuilding + Strength focus + Legs priority',
    payloadOverrides: {
      focus: 'Strength',
      priorityGroups: ['Legs', 'Core', 'Back'],
      squat: 275,
      lowerWeight: 245,
      lowerReps: 5
    },
    inferredStrengthEmphasis: {
      primary: 'squat',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'Legs-first ordering with comparatively softer squat numbers should shift the week toward knee-dominant lower strength.'
    },
    expectedSplitBehavior: 'Lower-emphasized split with the top lower session reserved for squat pattern quality and quad-biased support.',
    expectedMainMovementFrequency: 'Squat pattern 2x weekly, hinge pattern 1x weekly, bench pattern 1x weekly minimum.',
    expectedAccessoryBias: 'Quads, adductors, bracing core, enough back work to support the bar path and trunk position.',
    expectedRecoveryRules: 'Do not stack max-fatigue hinge work right after the top squat day.',
    exercisesToAvoid: ['posterior-chain overload that steals from squat recovery', 'random extra arm work'],
    passFailChecks: [
      'Top lower session starts with a squat or close knee-dominant loaded pattern.',
      'Quad support volume exceeds non-priority upper detail work.',
      'Core work is bracing-oriented, not random crunch spam.'
    ]
  }),
  buildCase({
    id: 3,
    title: 'Powerbuilding + Strength focus + Glutes/Back priority',
    payloadOverrides: {
      focus: 'Strength',
      priorityGroups: ['Glutes', 'Back', 'Core'],
      deadlift: 365,
      hingeMovement: 'Conventional Deadlift',
      hingeWeight: 315,
      hingeReps: 5
    },
    inferredStrengthEmphasis: {
      primary: 'hinge',
      secondary: 'bench',
      tertiary: 'squat',
      rationale: 'Glutes and Back together should push the hinge/posterior-chain pattern into the lead slot.'
    },
    expectedSplitBehavior: 'Posterior-chain-biased upper/lower or pull-anchored powerbuilding split with hinge quality protected.',
    expectedMainMovementFrequency: 'Hinge pattern 2x weekly counting one heavy and one supportive exposure, bench 1x, squat 1x.',
    expectedAccessoryBias: 'Rows, pulldowns, glute-biased accessories, hamstring support, trunk bracing.',
    expectedRecoveryRules: 'Heavy hinge work gets spacing from high-fatigue squatting and long-length lower-back stress.',
    exercisesToAvoid: ['extra unsupported low-back fatigue', 'vanity shoulder volume ahead of hinge support work'],
    passFailChecks: [
      'At least one hinge anchor appears early in a lower or full-body session.',
      'Back compound support is substantial, not tokenized.',
      'Posterior-chain accessories do not replace all squat exposure.'
    ]
  }),
  buildCase({
    id: 4,
    title: 'Powerbuilding + Size focus + Chest/Shoulders/Arms',
    payloadOverrides: {
      focus: 'Size',
      primaryGoal: 'Build size',
      priorityGroups: ['Chest', 'Shoulders', 'Arms'],
      closeToFailure: 'Yes'
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'Strength anchor stays upper-body led, but the block should allocate more recovery to pressing hypertrophy and arm detail.'
    },
    expectedSplitBehavior: 'Upper-biased powerbuilding split with one meaningful bench anchor and broad upper-body hypertrophy support.',
    expectedMainMovementFrequency: 'Bench pattern 2x weekly, squat 1x, hinge 1x minimum.',
    expectedAccessoryBias: 'Chest presses, lateral delts, triceps, biceps, restrained rear-delt support.',
    expectedRecoveryRules: 'Failure can rise on isolation work, but pressing compounds still keep fatigue under control.',
    exercisesToAvoid: ['too many shoulder presses competing with the bench anchor', 'junk-volume chest fly duplication'],
    passFailChecks: [
      'Accessories clearly outnumber extra heavy compounds.',
      'Shoulder detail exists without replacing the bench anchor.',
      'Arm work is visible and recoverable.'
    ]
  }),
  buildCase({
    id: 5,
    title: 'Powerbuilding + Aesthetic focus + Back/Shoulders/Arms',
    payloadOverrides: {
      focus: 'Aesthetic',
      priorityGroups: ['Back', 'Shoulders', 'Arms'],
      closeToFailure: 'Yes'
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Even with aesthetic focus, one upper and one posterior strength anchor should remain while accessories bias back and delts.'
    },
    expectedSplitBehavior: 'Aesthetic-leaning powerbuilding week with preserved press and lower anchors but more upper-pull and delt detail.',
    expectedMainMovementFrequency: 'Each main pattern at least 1x weekly; top accessory emphasis shifts to upper back and shoulders.',
    expectedAccessoryBias: 'Rows, vertical pulls, lateral delts, rear delts, triceps and biceps.',
    expectedRecoveryRules: 'Main compounds should not be pushed to failure simply because aesthetic work is selected.',
    exercisesToAvoid: ['bodybuilder-only fluff that erases strength anchors', 'redundant chest work not tied to priorities'],
    passFailChecks: [
      'Back and shoulder detail volume is visibly elevated.',
      'At least one true strength-oriented compound remains for the upper body.',
      'Arms are supported without dominating the entire week.'
    ]
  }),
  buildCase({
    id: 6,
    title: 'Powerbuilding + Legs/Glutes/Core',
    payloadOverrides: {
      focus: 'Strength',
      priorityGroups: ['Legs', 'Glutes', 'Core']
    },
    inferredStrengthEmphasis: {
      primary: 'squat',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'Lower-body pairing plus core should create a squat-hinge-led week with stronger bracing requirements.'
    },
    expectedSplitBehavior: 'Lower-emphasized split with one quad-led day and one posterior-chain support emphasis if frequency allows.',
    expectedMainMovementFrequency: 'Squat and hinge both remain present weekly; squat usually gets the premium slot.',
    expectedAccessoryBias: 'Quads, glutes, hamstrings, calves only if recoverable, and anti-extension or anti-rotation core.',
    expectedRecoveryRules: 'Ab work should support bracing and aesthetics without inflaming lower-body recovery.',
    exercisesToAvoid: ['too much upper-body vanity work', 'high-fatigue hinge stacking next to squat anchor day'],
    passFailChecks: [
      'Core is programmed because it is selected.',
      'Both quad and posterior-chain support work are visible.',
      'Upper-body work is minimal but not missing.'
    ]
  }),
  buildCase({
    id: 7,
    title: 'Powerbuilding + Calves/Core small-priority preservation',
    payloadOverrides: {
      focus: 'Size',
      priorityGroups: ['Calves', 'Core', 'Chest'],
      daysPerWeek: 3,
      sessionLengthMin: '45'
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'Chest keeps the upper anchor in play, but small priorities must still survive trimming.'
    },
    expectedSplitBehavior: 'Compact 3-day week preserving at least one direct calf slot and one direct core slot across the week.',
    expectedMainMovementFrequency: 'Main patterns remain once weekly each or as close as possible within 3 sessions.',
    expectedAccessoryBias: 'Calves and core survive even when upper/lower time is compressed.',
    expectedRecoveryRules: 'Small-priority work should be efficient and not displace main-pattern coverage.',
    exercisesToAvoid: ['dropping calves entirely', 'dropping core entirely'],
    passFailChecks: [
      'At least one direct calf exposure exists.',
      'At least one direct core exposure exists.',
      'Main press anchor is not deleted to make room for small work.'
    ]
  }),
  buildCase({
    id: 8,
    title: 'Powerbuilding + 2 days per week',
    payloadOverrides: {
      daysPerWeek: 2,
      preferredDays: ['Mo', 'Th'],
      sessionLengthMin: '60',
      priorityGroups: ['Chest', 'Legs', 'Back']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'Two-day scheduling forces full-body consolidation, with top priorities sharing the smallest possible structure.'
    },
    expectedSplitBehavior: 'Full-body format with one upper-dominant day and one lower-dominant day or two balanced full-body sessions.',
    expectedMainMovementFrequency: 'At least one bench pattern and one knee/hinge lower pattern each week; one pattern may be secondary.',
    expectedAccessoryBias: 'Only high-value accessories tied directly to the main patterns and priorities.',
    expectedRecoveryRules: 'No filler; fatigue must stay tightly capped because each session carries a lot of responsibility.',
    exercisesToAvoid: ['split structures that assume extra weekly exposure', 'redundant isolation clusters'],
    passFailChecks: [
      'Week has exactly 2 training days.',
      'Both sessions contain purposeful compound work.',
      'Accessories are sparse and priority-driven.'
    ]
  }),
  buildCase({
    id: 9,
    title: 'Powerbuilding + 3 days per week',
    payloadOverrides: {
      daysPerWeek: 3,
      preferredDays: ['Mo', 'We', 'Fr'],
      priorityGroups: ['Back', 'Legs', 'Chest']
    },
    inferredStrengthEmphasis: {
      primary: 'hinge',
      secondary: 'squat',
      tertiary: 'bench',
      rationale: 'Back and Legs should pull the structure toward robust posterior and lower support with a preserved press anchor.'
    },
    expectedSplitBehavior: 'Full-body or upper/lower/full-body with the three main patterns spread intelligently across the week.',
    expectedMainMovementFrequency: 'Each main pattern appears at least once, with one priority pattern getting better placement or support.',
    expectedAccessoryBias: 'Rows, lower support, one small chest accessory lane if time permits.',
    expectedRecoveryRules: 'Three-day spacing should be used to protect the hinge and lower sessions from overlap.',
    exercisesToAvoid: ['bench-only upper bias that ignores back-first ordering'],
    passFailChecks: [
      'Week has exactly 3 training days.',
      'No day becomes a pure bodybuilding isolation day.',
      'Back support is visibly stronger than non-priority vanity work.'
    ]
  }),
  buildCase({
    id: 10,
    title: 'Powerbuilding + 4 days per week',
    payloadOverrides: {
      daysPerWeek: 4,
      priorityGroups: ['Chest', 'Back', 'Legs']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'Four-day powerbuilding is the default sweet spot, allowing clear anchors without excess clutter.'
    },
    expectedSplitBehavior: 'Upper/lower or push-pull-upper-lower with clear early-session strength work.',
    expectedMainMovementFrequency: 'Top pattern can appear 2x weekly; the other two appear at least once.',
    expectedAccessoryBias: 'Balanced upper-back and lower support around the leading pattern.',
    expectedRecoveryRules: 'Use the extra day to distribute fatigue, not to duplicate failure-heavy work.',
    exercisesToAvoid: ['all-main-lift-every-day structures'],
    passFailChecks: [
      'Week has exactly 4 training days.',
      'At least one upper and one lower day carry obvious main-lift priority.',
      'Accessory work complements, rather than replaces, strength work.'
    ]
  }),
  buildCase({
    id: 11,
    title: 'Powerbuilding + 5 days per week',
    payloadOverrides: {
      daysPerWeek: 5,
      preferredDays: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'],
      priorityGroups: ['Chest', 'Arms', 'Back']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Five days allows a second exposure or a specialization lane for the top upper priority.'
    },
    expectedSplitBehavior: 'Four-day powerbuilding base plus one specialization or support day tied to the top priority.',
    expectedMainMovementFrequency: 'Bench 2x weekly likely, squat and hinge at least 1x weekly each.',
    expectedAccessoryBias: 'Chest and triceps support plus enough back work to stabilize pressing.',
    expectedRecoveryRules: 'The fifth day should distribute volume, not become another maximal stressor.',
    exercisesToAvoid: ['junk specialization day with no relation to priorities'],
    passFailChecks: [
      'Week has exactly 5 training days.',
      'Extra day supports the top priority rather than adding random fatigue.',
      'Lower-body recovery remains intact.'
    ]
  }),
  buildCase({
    id: 12,
    title: 'Powerbuilding + 6 days per week',
    payloadOverrides: {
      daysPerWeek: 6,
      preferredDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      experience: '2-5y',
      priorityGroups: ['Legs', 'Glutes', 'Back']
    },
    inferredStrengthEmphasis: {
      primary: 'squat',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'Six days only makes sense if fatigue is distributed and lower priorities are still organized cleanly.'
    },
    expectedSplitBehavior: 'High-frequency distributed split with lower fatigue per day and more precise pattern spacing.',
    expectedMainMovementFrequency: 'Top lower patterns can reach 2x weekly, but with varied stress cost.',
    expectedAccessoryBias: 'Posterior-chain, quads, and back support spread across the week in smaller pieces.',
    expectedRecoveryRules: 'No repeated max-cost days back-to-back; daily volume should drop as frequency rises.',
    exercisesToAvoid: ['copy-pasted 4-day volume stretched across 6 days', 'daily high-failure compounds'],
    passFailChecks: [
      'Week has exactly 6 training days.',
      'Per-session exercise count stays controlled.',
      'At least one lower session is clearly lighter or more supportive than the top lower session.'
    ]
  }),
  buildCase({
    id: 13,
    title: 'Powerbuilding + 30 minute session',
    payloadOverrides: {
      sessionLengthMin: '30',
      priorityGroups: ['Chest', 'Arms', 'Back']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Short sessions should protect the upper anchor and strip accessory clutter aggressively.'
    },
    expectedSplitBehavior: 'Condensed split with one main pattern plus one or two direct supports per session.',
    expectedMainMovementFrequency: 'Main pattern frequency preserved through shorter, tighter sessions.',
    expectedAccessoryBias: 'Only the highest-value arm or back supports survive.',
    expectedRecoveryRules: 'Short sessions should reduce fatigue through lower accessory count, not through deleting anchors.',
    exercisesToAvoid: ['five-accessory sessions', 'multiple low-value isolation swaps'],
    passFailChecks: [
      'Main lift remains early in session.',
      'Accessory count is clearly reduced.',
      'No session bloats beyond what 30 minutes can realistically hold.'
    ]
  }),
  buildCase({
    id: 14,
    title: 'Powerbuilding + 45 minute session',
    payloadOverrides: {
      sessionLengthMin: '45',
      priorityGroups: ['Back', 'Glutes', 'Core']
    },
    inferredStrengthEmphasis: {
      primary: 'hinge',
      secondary: 'bench',
      tertiary: 'squat',
      rationale: 'Moderate time should support one main pattern and a small posterior/bracing support lane.'
    },
    expectedSplitBehavior: 'Efficient split with one primary anchor, one support movement, and one or two accessories.',
    expectedMainMovementFrequency: 'Priority hinge still appears strongly; other patterns are kept efficient.',
    expectedAccessoryBias: 'Posterior-chain support and trunk work survive first.',
    expectedRecoveryRules: 'Accessory density stays modest to protect intensity and timing.',
    exercisesToAvoid: ['non-priority upper fluff'],
    passFailChecks: [
      'Session shape remains compact.',
      'Core work is purposeful.',
      'Back support is not dropped despite shorter time.'
    ]
  }),
  buildCase({
    id: 15,
    title: 'Powerbuilding + 75+ minute session',
    payloadOverrides: {
      sessionLengthMin: '75+',
      primaryGoal: 'Build size',
      focus: 'Size',
      priorityGroups: ['Chest', 'Shoulders', 'Arms']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'Long sessions should expand quality hypertrophy support after the strength anchor is protected.'
    },
    expectedSplitBehavior: 'Normal powerbuilding split with more complete accessory lanes, not extra top-end fatigue everywhere.',
    expectedMainMovementFrequency: 'Strength pattern schedule stays stable; added time mostly expands accessories.',
    expectedAccessoryBias: 'Chest, delts, arms, plus enough back health work to stabilize pressing.',
    expectedRecoveryRules: 'More time should increase completeness, not permit every set to be hard and numerous.',
    exercisesToAvoid: ['turning long sessions into junk marathons'],
    passFailChecks: [
      'Accessory count can rise without deleting recovery logic.',
      'Top strength slot is still first.',
      'Upper-detail volume is visibly richer than in short sessions.'
    ]
  }),
  buildCase({
    id: 16,
    title: 'Beginner <6m with Powerbuilding selected',
    payloadOverrides: {
      experience: '<6m',
      focus: 'Strength',
      priorityGroups: ['Chest', 'Legs', 'Back']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'Beginner powerbuilding should still preserve pattern balance while simplifying lift selection.'
    },
    expectedSplitBehavior: 'Simple split with low-variation loaded patterns and obvious accessory support.',
    expectedMainMovementFrequency: 'All three patterns appear, but with conservative complexity and lower lift variety.',
    expectedAccessoryBias: 'Stable machine or dumbbell support, modest arm and delt work, minimal novelty.',
    expectedRecoveryRules: 'Conservative RIR and fewer simultaneous goals per session.',
    exercisesToAvoid: ['high-skill variations', 'too many close variants', 'max-fatigue failure compounds'],
    passFailChecks: [
      'Exercise menu is simple and stable.',
      'No advanced complexity is added just because powerbuilding was selected.',
      'Recovery is clearly conservative.'
    ]
  }),
  buildCase({
    id: 17,
    title: 'Intermediate 6-24m with Powerbuilding selected',
    payloadOverrides: {
      experience: '6-24m',
      priorityGroups: ['Chest', 'Back', 'Arms']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'This is the default workable powerbuilding tier and should handle a clean strength-plus-size blend.'
    },
    expectedSplitBehavior: 'Balanced split with one or two strong anchor exposures and real accessory support.',
    expectedMainMovementFrequency: 'Enough frequency to progress without advanced fragmentation.',
    expectedAccessoryBias: 'Back support, chest hypertrophy, direct arms, restrained delts.',
    expectedRecoveryRules: 'Moderate complexity, moderate volume, moderate variation.',
    exercisesToAvoid: ['overbuilt advanced sequencing'],
    passFailChecks: [
      'Plan looks like a real powerbuilding week.',
      'Progressive compounds and accessories are both present.',
      'No glaring under-dosing of a main pattern.'
    ]
  }),
  buildCase({
    id: 18,
    title: 'Advanced 2-5y with Powerbuilding selected',
    payloadOverrides: {
      experience: '2-5y',
      priorityGroups: ['Back', 'Glutes', 'Chest'],
      hingeMovement: 'Conventional Deadlift'
    },
    inferredStrengthEmphasis: {
      primary: 'hinge',
      secondary: 'bench',
      tertiary: 'squat',
      rationale: 'Advanced users can handle clearer posterior-chain emphasis and more precise sequencing.'
    },
    expectedSplitBehavior: 'Structured split with better spacing and more intelligent variant support for the top patterns.',
    expectedMainMovementFrequency: 'Primary pattern may receive a heavy exposure plus a supportive second exposure.',
    expectedAccessoryBias: 'Targeted back and glute support with enough chest work to preserve upper balance.',
    expectedRecoveryRules: 'Higher precision, not blindly higher fatigue.',
    exercisesToAvoid: ['novice-style under-dosed pattern work'],
    passFailChecks: [
      'Top priority pattern gets enhanced structure.',
      'Accessories clearly support the main posterior-chain goal.',
      'Bench is maintained rather than erased.'
    ]
  }),
  buildCase({
    id: 19,
    title: '5y+ with high recovery and 6 days',
    payloadOverrides: {
      experience: '5y+',
      daysPerWeek: 6,
      sleepHours: 9,
      activityLevel: 'Active',
      stress: 'Low',
      preferredDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      priorityGroups: ['Legs', 'Back', 'Arms']
    },
    inferredStrengthEmphasis: {
      primary: 'squat',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'High recovery and advanced age allow a denser week, but the lower priorities still need clean organization.'
    },
    expectedSplitBehavior: 'Distributed high-frequency split with small enough daily cost to remain recoverable.',
    expectedMainMovementFrequency: 'Primary lower patterns may reach 2x weekly with varied emphasis.',
    expectedAccessoryBias: 'Back and arm support spread across the week in recoverable amounts.',
    expectedRecoveryRules: 'High-recovery status allows more exposures, not permission to ignore fatigue accounting.',
    exercisesToAvoid: ['repeated all-out compounds across the week'],
    passFailChecks: [
      'Frequency rises without making every day high cost.',
      'Back work remains substantial.',
      'Arm detail fits around lower-strength work rather than disrupting it.'
    ]
  }),
  buildCase({
    id: 20,
    title: 'Cut fat + Powerbuilding',
    payloadOverrides: {
      primaryGoal: 'Cut fat',
      focus: 'Strength',
      closeToFailure: 'No',
      priorityGroups: ['Chest', 'Back', 'Core']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Cutting should preserve strength anchors while trimming total accessory fatigue.'
    },
    expectedSplitBehavior: 'Lean powerbuilding split that preserves the main patterns and pares back nonessential volume.',
    expectedMainMovementFrequency: 'All three patterns remain, but accessory volume is tighter than in size-focused blocks.',
    expectedAccessoryBias: 'Efficient back, chest, and trunk support.',
    expectedRecoveryRules: 'Volume and failure both come down relative to size phases.',
    exercisesToAvoid: ['size-phase accessory bloat', 'all-out main lift fatigue'],
    passFailChecks: [
      'Main patterns are preserved.',
      'Accessory count is lower than build-size equivalents.',
      'Recovery rules are visibly more conservative.'
    ]
  }),
  buildCase({
    id: 21,
    title: 'Recomp + Powerbuilding',
    payloadOverrides: {
      primaryGoal: 'Recomp',
      focus: 'Strength',
      priorityGroups: ['Legs', 'Back', 'Chest']
    },
    inferredStrengthEmphasis: {
      primary: 'squat',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'Recomp should support stable strength while balancing enough hypertrophy to improve body composition.'
    },
    expectedSplitBehavior: 'Balanced powerbuilding week with moderate volume and clear recovery control.',
    expectedMainMovementFrequency: 'All patterns retained, with top pattern getting slightly better support.',
    expectedAccessoryBias: 'Balanced support instead of aggressive specialization.',
    expectedRecoveryRules: 'Moderate volume, moderate intensity, moderate failure exposure.',
    exercisesToAvoid: ['extreme specialization', 'cut-level under-dosing of accessories'],
    passFailChecks: [
      'Plan is balanced rather than extreme.',
      'All three patterns still matter.',
      'Accessory work is present but not bloated.'
    ]
  }),
  buildCase({
    id: 22,
    title: 'Build size + Powerbuilding',
    payloadOverrides: {
      primaryGoal: 'Build size',
      focus: 'Size',
      closeToFailure: 'Yes',
      priorityGroups: ['Chest', 'Arms', 'Shoulders']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'Build-size powerbuilding still keeps strength anchors, but the accessory volume lane is wider.'
    },
    expectedSplitBehavior: 'Upper-biased size-supporting powerbuilding split with preserved lower anchors.',
    expectedMainMovementFrequency: 'Bench pattern likely 2x weekly; lower patterns at least 1x weekly each.',
    expectedAccessoryBias: 'Chest, triceps, biceps, lateral delts, some rear-delt and upper-back stabilization.',
    expectedRecoveryRules: 'Accessory proximity to failure can rise more than compound failure exposure.',
    exercisesToAvoid: ['turning every upper movement into heavy work'],
    passFailChecks: [
      'Accessory volume exceeds cut/recomp analogs.',
      'Bench anchor remains central.',
      'Shoulders are supported without overwhelming recovery.'
    ]
  }),
  buildCase({
    id: 23,
    title: 'Shoulder pain + Chest priority',
    payloadOverrides: {
      priorityGroups: ['Chest', 'Arms', 'Back'],
      painAreas: ['Shoulder'],
      painProfilesByArea: {
        Shoulder: { severity: 7, recency: 'Recent', notes: 'Overhead pressing and deep-stretch barbell benching irritate the shoulder.' }
      },
      benchVariation: 'Machine Chest Press'
    },
    inferredStrengthEmphasis: {
      primary: 'bench-pattern substitute',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Chest remains the top goal, but the press pattern must be kept shoulder-tolerant.'
    },
    expectedSplitBehavior: 'Chest-led powerbuilding week built around safer horizontal pressing instead of aggressive overhead work.',
    expectedMainMovementFrequency: 'Bench pattern preserved through safer variants; squat and hinge remain normal.',
    expectedAccessoryBias: 'Chest support, triceps support, scapular/back stability, minimal provocative shoulder work.',
    expectedRecoveryRules: 'Pressing stress is capped by exercise choice and failure control.',
    exercisesToAvoid: ['overhead press', 'deep-stretch barbell benching', 'upright-row-like stress'],
    passFailChecks: [
      'Chest priority remains visible despite pain.',
      'Shoulder-provoking patterns are filtered out.',
      'Upper support shifts toward stable pressing options.'
    ]
  }),
  buildCase({
    id: 24,
    title: 'Elbow pain + Arms priority',
    payloadOverrides: {
      priorityGroups: ['Arms', 'Chest', 'Back'],
      painAreas: ['Elbow'],
      painProfilesByArea: {
        Elbow: { severity: 7, recency: 'Recent', notes: 'Skull crushers and harsh curl loading flare the elbows.' }
      }
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Arms still matter, but support work must shift toward more elbow-tolerant options.'
    },
    expectedSplitBehavior: 'Bench-supported powerbuilding split with reduced elbow-hostile direct arm exercise selection.',
    expectedMainMovementFrequency: 'Main patterns preserved; arm volume survives via safer patterns.',
    expectedAccessoryBias: 'Cable or machine-biased arm work, chest support, upper-back stability.',
    expectedRecoveryRules: 'Arm work should not sabotage pressing through pain accumulation.',
    exercisesToAvoid: ['skull crushers', 'aggressive straight-bar curls'],
    passFailChecks: [
      'Arms are still trained directly.',
      'Elbow-hostile patterns are swapped out.',
      'Pressing strength support remains intact.'
    ]
  }),
  buildCase({
    id: 25,
    title: 'Wrist pain + pressing/curling',
    payloadOverrides: {
      priorityGroups: ['Chest', 'Arms', 'Back'],
      painAreas: ['Wrist'],
      painProfilesByArea: {
        Wrist: { severity: 7, recency: 'Recent', notes: 'Straight bars and loaded wrist extension are not tolerated.' }
      },
      benchVariation: 'Neutral-Grip Dumbbell Press'
    },
    inferredStrengthEmphasis: {
      primary: 'bench-pattern substitute',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Wrist pain should preserve the press pattern through neutral-grip or machine substitutes.'
    },
    expectedSplitBehavior: 'Upper work shifts toward neutral-grip and supported pressing/pulling while preserving real pattern intent.',
    expectedMainMovementFrequency: 'Bench pattern still appears, but implement selection changes.',
    expectedAccessoryBias: 'Neutral-grip pressing, supported pulls, safer arm work.',
    expectedRecoveryRules: 'Wrist stress is managed by implement and grip before reducing all exposure.',
    exercisesToAvoid: ['straight-bar benching', 'straight-bar curling', 'wrist-extension-heavy setups'],
    passFailChecks: [
      'Press pattern is preserved with safer grips.',
      'Curling support remains but uses wrist-tolerant choices.',
      'No fake barbell insistence appears.'
    ]
  }),
  buildCase({
    id: 26,
    title: 'Back pain + hingeMovement selected',
    payloadOverrides: {
      priorityGroups: ['Glutes', 'Back', 'Core'],
      painAreas: ['Back'],
      painProfilesByArea: {
        Back: { severity: 7, recency: 'Recent', notes: 'Heavy unsupported hinging and axial loading flare the lower back.' }
      },
      hingeMovement: 'Hip Thrust'
    },
    inferredStrengthEmphasis: {
      primary: 'hinge-pattern substitute',
      secondary: 'bench',
      tertiary: 'squat',
      rationale: 'Posterior-chain priority stays, but unsupported hinge choices should be heavily constrained.'
    },
    expectedSplitBehavior: 'Posterior-chain-biased week using back-tolerant hinge substitutes and more supported trunk work.',
    expectedMainMovementFrequency: 'Hinge pattern remains present through safer choices.',
    expectedAccessoryBias: 'Glutes, hamstrings, rows, bracing core with lower spinal cost.',
    expectedRecoveryRules: 'Axial and unsupported fatigue are reduced before the hinge pattern is abandoned.',
    exercisesToAvoid: ['unsupported heavy deadlift patterns', 'excess axial loading'],
    passFailChecks: [
      'Hinge intent is preserved.',
      'Back-hostile hinge variants are removed.',
      'Core shifts toward supportive bracing.'
    ]
  }),
  buildCase({
    id: 27,
    title: 'Knee pain + Legs priority',
    payloadOverrides: {
      priorityGroups: ['Legs', 'Core', 'Glutes'],
      painAreas: ['Knee'],
      painProfilesByArea: {
        Knee: { severity: 7, recency: 'Recent', notes: 'Deep squat depth and aggressive forward knee travel irritate the knees.' }
      },
      lowerMovement: 'Leg Press'
    },
    inferredStrengthEmphasis: {
      primary: 'squat-pattern substitute',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'Legs remain primary, but the squat pattern must move to more knee-tolerant variants.'
    },
    expectedSplitBehavior: 'Lower-priority week anchored around safer knee-dominant loaded patterns and posterior-chain balance.',
    expectedMainMovementFrequency: 'Squat pattern is preserved via substitute options; hinge remains normal.',
    expectedAccessoryBias: 'Quad work, glutes, hamstrings, trunk support with careful knee stress management.',
    expectedRecoveryRules: 'Pain should reduce movement stress, not erase leg priority entirely.',
    exercisesToAvoid: ['deep squat patterns with high forward-knee demand', 'sissy squat style choices'],
    passFailChecks: [
      'Leg priority still looks like a leg-priority plan.',
      'Knee-provocative choices are filtered out.',
      'Lower pattern integrity survives through substitutions.'
    ]
  }),
  buildCase({
    id: 28,
    title: 'Hip pain + squat/hinge pattern',
    payloadOverrides: {
      priorityGroups: ['Glutes', 'Legs', 'Core'],
      painAreas: ['Hip'],
      painProfilesByArea: {
        Hip: { severity: 6, recency: 'Recent', notes: 'Deep hip flexion and end-range loaded hinging are limited.' }
      },
      lowerMovement: 'Leg Press',
      hingeMovement: 'Barbell Glute Bridge'
    },
    inferredStrengthEmphasis: {
      primary: 'hinge-pattern substitute',
      secondary: 'squat-pattern substitute',
      tertiary: 'bench',
      rationale: 'Lower priorities remain, but both knee- and hinge-dominant choices need hip-tolerant loading profiles.'
    },
    expectedSplitBehavior: 'Lower-focused week using constrained ROM or more supported lower choices.',
    expectedMainMovementFrequency: 'Lower patterns preserved, but with hip-aware exercise selection.',
    expectedAccessoryBias: 'Glute and lower support through hip-tolerant patterns and trunk stability.',
    expectedRecoveryRules: 'Range and loading style should adapt before the whole lower lane is abandoned.',
    exercisesToAvoid: ['deep-flexion squat variants', 'provocative deep ROM hinge variations'],
    passFailChecks: [
      'Lower priorities remain visible.',
      'Hip-hostile variants are reduced or replaced.',
      'Core support is present.'
    ]
  }),
  buildCase({
    id: 29,
    title: 'Barbell unavailable but Powerbuilding selected',
    payloadOverrides: {
      equipmentAccess: ['Dumbbells', 'Cable', 'Machines'],
      priorityGroups: ['Chest', 'Legs', 'Back'],
      benchVariation: 'Machine Chest Press',
      lowerMovement: 'Hack Squat',
      hingeMovement: 'Dumbbell Romanian Deadlift'
    },
    inferredStrengthEmphasis: {
      primary: 'bench-pattern substitute',
      secondary: 'squat-pattern substitute',
      tertiary: 'hinge-pattern substitute',
      rationale: 'The engine must preserve loaded movement patterns without inventing fake barbell work.'
    },
    expectedSplitBehavior: 'Powerbuilding-inspired split built around non-barbell loaded substitutes.',
    expectedMainMovementFrequency: 'Each main pattern remains represented through the best available loaded alternative.',
    expectedAccessoryBias: 'Machine and dumbbell support built around the substitute anchors.',
    expectedRecoveryRules: 'Pattern integrity matters more than implement purity.',
    exercisesToAvoid: ['barbell bench', 'barbell squat', 'barbell deadlift'],
    passFailChecks: [
      'No barbell-only exercises appear.',
      'Powerbuilding identity is preserved through substitute patterns.',
      'The plan does not collapse into generic bodybuilding only.'
    ]
  }),
  buildCase({
    id: 30,
    title: 'Home training + dumbbells only',
    payloadOverrides: {
      location: 'Home',
      equipmentAccess: ['Bodyweight', 'Dumbbells'],
      trainingStyle: 'Mostly free weights',
      priorityGroups: ['Chest', 'Legs', 'Glutes'],
      benchVariation: 'Neutral-Grip Dumbbell Press',
      lowerMovement: 'Goblet Squat',
      hingeMovement: 'Dumbbell Romanian Deadlift'
    },
    inferredStrengthEmphasis: {
      primary: 'bench-pattern substitute',
      secondary: 'squat-pattern substitute',
      tertiary: 'hinge-pattern substitute',
      rationale: 'Home dumbbell-only powerbuilding should still pursue loaded movement patterns honestly.'
    },
    expectedSplitBehavior: 'Compact home powerbuilding plan using dumbbell and bodyweight loading progressions.',
    expectedMainMovementFrequency: 'Patterns remain weekly even if absolute loading ceiling is lower.',
    expectedAccessoryBias: 'Dumbbell presses, unilateral lower support, DB hinging, selective arm and core work.',
    expectedRecoveryRules: 'Do not fake barbell loading; manage fatigue through exercise choice and rep progression.',
    exercisesToAvoid: ['machine-only patterns', 'barbell-only patterns'],
    passFailChecks: [
      'Plan is fully home-compatible.',
      'Loaded movement patterns still exist.',
      'No machine or barbell dependencies leak in.'
    ]
  }),
  buildCase({
    id: 31,
    title: 'Commercial gym + balanced equipment',
    payloadOverrides: {
      location: 'Commercial gym',
      trainingStyle: 'Balanced mix',
      equipmentAccess: ['Dumbbells', 'Barbell', 'Cable', 'Machines'],
      priorityGroups: ['Chest', 'Back', 'Legs']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'This is the fullest equipment context and should allow canonical powerbuilding decisions.'
    },
    expectedSplitBehavior: 'Canonical powerbuilding split with clean compound anchors and flexible accessory menu.',
    expectedMainMovementFrequency: 'All patterns can be represented with true loaded options.',
    expectedAccessoryBias: 'Support work can use the best implement for the job rather than forcing a single style.',
    expectedRecoveryRules: 'Balanced equipment should improve choice quality, not increase random volume.',
    exercisesToAvoid: ['needless implement duplication with no purpose'],
    passFailChecks: [
      'Generator uses the broad equipment menu intelligently.',
      'Main anchors can be canonical or close variants.',
      'Accessory choices reflect best-fit implementation.'
    ]
  }),
  buildCase({
    id: 32,
    title: 'Mostly machines/cables + Powerbuilding',
    payloadOverrides: {
      trainingStyle: 'Mostly machines/cables',
      equipmentAccess: ['Cable', 'Machines'],
      priorityGroups: ['Chest', 'Back', 'Arms'],
      benchVariation: 'Machine Chest Press',
      lowerMovement: 'Leg Press',
      hingeMovement: 'Back Extension'
    },
    inferredStrengthEmphasis: {
      primary: 'bench-pattern substitute',
      secondary: 'squat-pattern substitute',
      tertiary: 'hinge-pattern substitute',
      rationale: 'Machines/cables should still express strength-pattern intent through stable heavy substitutes.'
    },
    expectedSplitBehavior: 'Machine-stable powerbuilding plan emphasizing supported heavy patterns plus hypertrophy support.',
    expectedMainMovementFrequency: 'All three patterns remain through machine or cable analogs.',
    expectedAccessoryBias: 'Stable chest pressing, rows, pulldowns, machine lower work, cables for arms.',
    expectedRecoveryRules: 'Stable equipment may allow productive hypertrophy without unnecessary joint cost.',
    exercisesToAvoid: ['barbell-only prescriptions', 'bodyweight-dominant fake substitutes'],
    passFailChecks: [
      'Plan respects machine/cable preference.',
      'Strength patterns are still represented.',
      'Accessory work fits the equipment style.'
    ]
  }),
  buildCase({
    id: 33,
    title: 'Mostly free weights + Powerbuilding',
    payloadOverrides: {
      trainingStyle: 'Mostly free weights',
      equipmentAccess: ['Bodyweight', 'Dumbbells', 'Barbell'],
      priorityGroups: ['Legs', 'Back', 'Chest']
    },
    inferredStrengthEmphasis: {
      primary: 'squat',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'Free-weight access should support more canonical lower anchors while preserving upper balance.'
    },
    expectedSplitBehavior: 'Free-weight-led powerbuilding split with canonical or close main lifts.',
    expectedMainMovementFrequency: 'Main patterns remain explicit and stable.',
    expectedAccessoryBias: 'Free-weight support first, minimal machine dependence, some bodyweight if needed.',
    expectedRecoveryRules: 'Free-weight preference should not trigger maximal axial or joint cost on every day.',
    exercisesToAvoid: ['machine-heavy plans when free-weight options are viable'],
    passFailChecks: [
      'Plan reflects free-weight preference.',
      'Main strength slots are clearly loaded and compound-led.',
      'Accessory work still manages fatigue.'
    ]
  }),
  buildCase({
    id: 34,
    title: 'Balanced mix + Powerbuilding',
    payloadOverrides: {
      trainingStyle: 'Balanced mix',
      priorityGroups: ['Chest', 'Glutes', 'Back']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Balanced mix should allow best-tool selection across implements without dogma.'
    },
    expectedSplitBehavior: 'Mixed-implement powerbuilding week choosing the best implement per purpose.',
    expectedMainMovementFrequency: 'Main patterns preserved through strongest available options.',
    expectedAccessoryBias: 'Mix of barbell/dumbbell/machine/cable support based on fatigue cost and target quality.',
    expectedRecoveryRules: 'Balanced mix should improve fit, not create random variety.',
    exercisesToAvoid: ['implement swaps with no purpose'],
    passFailChecks: [
      'Generator uses multiple implement types when useful.',
      'Main patterns remain clear.',
      'Accessory choices are purposeful.'
    ]
  }),
  buildCase({
    id: 35,
    title: 'Low sleep + high stress',
    payloadOverrides: {
      sleepHours: 5,
      stress: 'High',
      closeToFailure: 'No',
      priorityGroups: ['Chest', 'Back', 'Core']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'Poor recovery should lower total volume and tighten fatigue even if priorities stay the same.'
    },
    expectedSplitBehavior: 'Recovery-constrained powerbuilding split with less accessory bloat and lower fatigue overlap.',
    expectedMainMovementFrequency: 'Main patterns preserved, but support volume drops.',
    expectedAccessoryBias: 'Efficient support only, with core and back surviving because they support the anchor.',
    expectedRecoveryRules: 'Lower total volume, lower failure exposure, stricter overlap control.',
    exercisesToAvoid: ['failure-heavy compounds', 'redundant accessories'],
    passFailChecks: [
      'Plan visibly contracts accessory load.',
      'Main patterns remain.',
      'Recovery rules are stricter than default.'
    ]
  }),
  buildCase({
    id: 36,
    title: 'High sleep + low stress',
    payloadOverrides: {
      sleepHours: 9,
      stress: 'Low',
      primaryGoal: 'Build size',
      focus: 'Size',
      priorityGroups: ['Chest', 'Back', 'Arms']
    },
    inferredStrengthEmphasis: {
      primary: 'bench',
      secondary: 'hinge',
      tertiary: 'squat',
      rationale: 'High recovery should allow more support work, especially for the top upper priorities.'
    },
    expectedSplitBehavior: 'Normal powerbuilding split with somewhat fuller accessory lanes than the default case.',
    expectedMainMovementFrequency: 'Main patterns stable; accessory breadth can increase slightly.',
    expectedAccessoryBias: 'Chest, back, and arms get more recoverable support work.',
    expectedRecoveryRules: 'Higher recovery expands recoverable volume but does not justify reckless overlap.',
    exercisesToAvoid: ['treating high recovery as permission to max everything'],
    passFailChecks: [
      'Accessory support is richer than low-recovery equivalents.',
      'Main patterns are still protected first.',
      'Plan remains coherent rather than excessive.'
    ]
  }),
  buildCase({
    id: 37,
    title: 'movementsToAvoid includes squat',
    payloadOverrides: {
      priorityGroups: ['Legs', 'Glutes', 'Core'],
      movementsToAvoid: ['squat'],
      lowerMovement: 'Leg Press'
    },
    inferredStrengthEmphasis: {
      primary: 'squat-pattern substitute',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'Leg priority still requires a knee-dominant lower anchor, but canonical squat naming should be filtered.'
    },
    expectedSplitBehavior: 'Lower-priority week built around non-squat knee-dominant loaded options.',
    expectedMainMovementFrequency: 'A squat-pattern substitute remains weekly.',
    expectedAccessoryBias: 'Quads, glutes, and trunk support around the substitute lower anchor.',
    expectedRecoveryRules: 'Avoided movement token should redirect pattern selection, not erase lower intent.',
    exercisesToAvoid: ['squat'],
    passFailChecks: [
      'Canonical squat patterns are absent.',
      'A knee-dominant lower anchor still exists.',
      'Leg priority remains obvious.'
    ]
  }),
  buildCase({
    id: 38,
    title: 'movementsToAvoid includes deadlift',
    payloadOverrides: {
      priorityGroups: ['Glutes', 'Back', 'Core'],
      movementsToAvoid: ['deadlift'],
      hingeMovement: 'Hip Thrust'
    },
    inferredStrengthEmphasis: {
      primary: 'hinge-pattern substitute',
      secondary: 'bench',
      tertiary: 'squat',
      rationale: 'Posterior-chain priority should remain, but deadlift-tagged movements should be filtered out.'
    },
    expectedSplitBehavior: 'Posterior-chain-focused split using non-deadlift hinge variants.',
    expectedMainMovementFrequency: 'Hinge intent remains weekly through substitutes.',
    expectedAccessoryBias: 'Rows, glute support, hamstrings, core stability.',
    expectedRecoveryRules: 'Avoid token changes exercise family choice before deleting the whole pattern.',
    exercisesToAvoid: ['deadlift'],
    passFailChecks: [
      'Deadlift-named choices are absent.',
      'A hinge pattern still appears.',
      'Back and glute priorities still drive the week.'
    ]
  }),
  buildCase({
    id: 39,
    title: 'movementsToAvoid includes bench press',
    payloadOverrides: {
      priorityGroups: ['Chest', 'Arms', 'Shoulders'],
      movementsToAvoid: ['bench press'],
      benchVariation: 'Machine Chest Press'
    },
    inferredStrengthEmphasis: {
      primary: 'bench-pattern substitute',
      secondary: 'squat',
      tertiary: 'hinge',
      rationale: 'Chest-first priority still wants a horizontal press anchor, but the exact bench press label should be excluded.'
    },
    expectedSplitBehavior: 'Upper-priority split using non-bench press horizontal pressing for the main upper anchor.',
    expectedMainMovementFrequency: 'Upper press pattern remains weekly, likely twice if priority and recovery allow.',
    expectedAccessoryBias: 'Chest and triceps support, careful shoulder detail.',
    expectedRecoveryRules: 'Avoided movement token changes variant, not the week’s identity.',
    exercisesToAvoid: ['bench press'],
    passFailChecks: [
      'Bench-press-labeled choices are absent.',
      'Chest priority still produces a real upper anchor.',
      'Accessory support remains bench-adjacent.'
    ]
  }),
  buildCase({
    id: 40,
    title: 'preferredDays creates poor recovery spacing',
    payloadOverrides: {
      daysPerWeek: 4,
      preferredDays: ['Mo', 'Tu', 'We', 'Th'],
      priorityGroups: ['Legs', 'Glutes', 'Back']
    },
    inferredStrengthEmphasis: {
      primary: 'squat',
      secondary: 'hinge',
      tertiary: 'bench',
      rationale: 'Tight day clustering should force smarter sequencing and stress separation.'
    },
    expectedSplitBehavior: 'Compressed-week split that avoids placing the heaviest squat and hinge demands on adjacent days if possible.',
    expectedMainMovementFrequency: 'Main patterns remain, but stress placement becomes more important than ideal symmetry.',
    expectedAccessoryBias: 'Support work may need to compress or shift to protect recovery inside the crowded schedule.',
    expectedRecoveryRules: 'When spacing is poor, the engine should downshift overlap and use lighter supportive exposures where needed.',
    exercisesToAvoid: ['back-to-back maximal lower fatigue days'],
    passFailChecks: [
      'Poor spacing does not create obviously reckless lower-fatigue stacking.',
      'Main patterns still appear.',
      'Support work adapts to the compressed schedule.'
    ]
  })
];

test('powerbuilding mass priority matrix is complete and uses only accepted payload fields', () => {
  assert.equal(POWERBUILDING_PRIORITY_MATRIX.length, 40);
  for (const entry of POWERBUILDING_PRIORITY_MATRIX) {
    assert.ok(Number.isInteger(entry.id), `${entry.title}: missing integer id`);
    assert.ok(entry.title, `case ${entry.id}: missing title`);
    const keys = Object.keys(entry.payload || {});
    assert.ok(keys.length > 0, `${entry.title}: payload is empty`);
    for (const key of keys) {
      assert.ok(ACCEPTED_FIELD_SET.has(key), `${entry.title}: unsupported payload field ${key}`);
    }
    assert.equal(entry.payload.trainingFeel, 'Powerbuilding', `${entry.title}: trainingFeel must remain Powerbuilding`);
    assert.ok(Array.isArray(entry.passFailChecks) && entry.passFailChecks.length >= 3, `${entry.title}: expected >= 3 pass/fail checks`);
    assert.ok(Array.isArray(entry.exercisesToAvoid), `${entry.title}: exercisesToAvoid must be an array`);
    assert.ok(entry.inferredStrengthEmphasis && entry.inferredStrengthEmphasis.primary, `${entry.title}: missing inferred strength emphasis`);
    assert.ok(typeof entry.expectedSplitBehavior === 'string' && entry.expectedSplitBehavior.length > 0, `${entry.title}: missing expected split behavior`);
    assert.ok(typeof entry.expectedMainMovementFrequency === 'string' && entry.expectedMainMovementFrequency.length > 0, `${entry.title}: missing expected movement frequency`);
    assert.ok(typeof entry.expectedAccessoryBias === 'string' && entry.expectedAccessoryBias.length > 0, `${entry.title}: missing expected accessory bias`);
    assert.ok(typeof entry.expectedRecoveryRules === 'string' && entry.expectedRecoveryRules.length > 0, `${entry.title}: missing expected recovery rules`);
  }
});

module.exports = {
  ACCEPTED_FIELDS,
  POWERBUILDING_PRIORITY_MATRIX
};
