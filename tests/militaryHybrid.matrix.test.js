const test = require('node:test');
const assert = require('node:assert/strict');

const ACCEPTED_FIELDS = new Set([
  'trainingFeel', 'discipline', 'primaryGoal', 'timeline', 'focus', 'experience',
  'location', 'trainingStyle', 'outputStyle', 'closeToFailure', 'daysPerWeek',
  'sessionLengthMin', 'priorityGroups', 'movementsToAvoid', 'preferredDays',
  'equipmentAccess', 'painAreas', 'painProfilesByArea', 'weightLb', 'bodyweight',
  'bench', 'squat', 'deadlift', 'benchVariation', 'benchWeight', 'benchReps',
  'lowerMovement', 'lowerWeight', 'lowerReps', 'hingeMovement', 'hingeWeight',
  'hingeReps', 'sleepHours', 'activityLevel', 'stress', 'planSeed'
]);

function basePayload(overrides = {}) {
  return {
    trainingFeel: 'Military Hybrid',
    discipline: 'military',
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
    priorityGroups: ['Legs', 'Back', 'Core'],
    movementsToAvoid: [],
    preferredDays: ['Mo', 'Tu', 'Th', 'Sa'],
    equipmentAccess: ['Barbell', 'Dumbbells', 'Bench', 'Cable', 'Machines', 'Sled'],
    painAreas: [],
    painProfilesByArea: {},
    weightLb: 185,
    bodyweight: 185,
    bench: 205,
    squat: 285,
    deadlift: 345,
    benchVariation: 'Bench press',
    benchWeight: 185,
    benchReps: 5,
    lowerMovement: 'Back squat',
    lowerWeight: 245,
    lowerReps: 5,
    hingeMovement: 'Deadlift',
    hingeWeight: 315,
    hingeReps: 5,
    sleepHours: 7,
    activityLevel: 'Active',
    stress: 'Medium',
    planSeed: 4100,
    ...overrides
  };
}

const cases = [
  ['2-day minimum viable readiness', { daysPerWeek: 2, preferredDays: ['Tu', 'Sa'] }],
  ['3-day beginner hybrid', { daysPerWeek: 3, experience: '<6m', preferredDays: ['Mo', 'We', 'Sa'] }],
  ['4-day standard hybrid', {}],
  ['5-day full-gym hybrid', { daysPerWeek: 5, preferredDays: ['Mo', 'Tu', 'Th', 'Fr', 'Sa'] }],
  ['6-day advanced hybrid', { daysPerWeek: 6, experience: '5y+', sleepHours: 8, stress: 'Low', preferredDays: ['Mo', 'Tu', 'We', 'Fr', 'Sa', 'Su'] }],
  ['30-minute sessions', { sessionLengthMin: '30' }],
  ['45-minute sessions', { sessionLengthMin: '45' }],
  ['75-minute sessions', { sessionLengthMin: '75+' }],
  ['home dumbbell and bodyweight', { location: 'Home', equipmentAccess: ['Bodyweight', 'Dumbbells', 'Bench'], trainingStyle: 'Mostly free weights' }],
  ['bodyweight-only home', { location: 'Home', equipmentAccess: ['Bodyweight'], trainingStyle: 'Balanced mix', bench: null, squat: null, deadlift: null }],
  ['full gym with sled', {}],
  ['full gym without sled', { equipmentAccess: ['Barbell', 'Dumbbells', 'Bench', 'Cable', 'Machines'] }],
  ['running avoided', { movementsToAvoid: ['running'] }],
  ['deadlift avoided', { movementsToAvoid: ['deadlift'] }],
  ['squat avoided', { movementsToAvoid: ['squat'] }],
  ['pressing avoided', { movementsToAvoid: ['bench press'] }],
  ['recent severe back pain', { painAreas: ['Back'], painProfilesByArea: { Back: { severity: 8, recency: 'Recent', notes: 'No loaded hinging.' } } }],
  ['moderate knee pain', { painAreas: ['Knee'], painProfilesByArea: { Knee: { severity: 5, recency: 'Old', notes: 'Reduce impact and deep knee flexion.' } } }],
  ['recent hip pain', { painAreas: ['Hip'], painProfilesByArea: { Hip: { severity: 7, recency: 'Recent', notes: 'Avoid aggressive hip flexion.' } } }],
  ['ankle pain limits running', { painAreas: ['Ankle'], painProfilesByArea: { Ankle: { severity: 8, recency: 'Recent', notes: 'No impact running.' } } }],
  ['shoulder pain modifies pushups', { painAreas: ['Shoulder'], painProfilesByArea: { Shoulder: { severity: 8, recency: 'Recent', notes: 'Press only in pain-free ranges.' } } }],
  ['low sleep high stress', { sleepHours: 5, stress: 'High', primaryGoal: 'Cut fat' }],
  ['high recovery build-size block', { sleepHours: 8, stress: 'Low', primaryGoal: 'Build size' }],
  ['poor preferred-day spacing', { preferredDays: ['Mo', 'Tu', 'We', 'Th'] }],
  ['chest priority', { priorityGroups: ['Chest', 'Back', 'Core'] }],
  ['back priority', { priorityGroups: ['Back', 'Arms', 'Core'] }],
  ['legs priority', { priorityGroups: ['Legs', 'Glutes', 'Core'] }],
  ['glutes priority', { priorityGroups: ['Glutes', 'Legs', 'Back'] }],
  ['shoulders priority', { priorityGroups: ['Shoulders', 'Arms', 'Core'] }],
  ['arms priority', { priorityGroups: ['Arms', 'Shoulders', 'Chest'] }],
  ['calves priority preservation', { priorityGroups: ['Calves', 'Legs', 'Core'] }],
  ['core priority preservation', { priorityGroups: ['Core', 'Shoulders', 'Arms'] }]
].map(([title, overrides], index) => ({
  id: index + 1,
  title,
  payload: basePayload({ ...overrides, planSeed: 4101 + index })
}));

const MILITARY_HYBRID_MATRIX = cases;

test('military hybrid matrix covers the intended input surface', () => {
  assert.ok(MILITARY_HYBRID_MATRIX.length >= 30);
  assert.deepEqual(
    Array.from(new Set(MILITARY_HYBRID_MATRIX.map((entry) => entry.id))).length,
    MILITARY_HYBRID_MATRIX.length
  );
  for (const entry of MILITARY_HYBRID_MATRIX) {
    assert.equal(entry.payload.trainingFeel, 'Military Hybrid');
    assert.equal(entry.payload.discipline, 'military');
    assert.ok(entry.payload.daysPerWeek >= 2 && entry.payload.daysPerWeek <= 6);
    assert.ok(Array.isArray(entry.payload.priorityGroups));
    for (const key of Object.keys(entry.payload)) {
      assert.ok(ACCEPTED_FIELDS.has(key), `${entry.title}: unsupported payload field ${key}`);
    }
  }
});

module.exports = {
  ACCEPTED_FIELDS,
  MILITARY_HYBRID_MATRIX,
  basePayload
};
