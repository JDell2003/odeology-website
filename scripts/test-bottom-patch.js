const fs = require('fs');
const { generatePlan } = require('../core/trainingEngine');

const data = JSON.parse(fs.readFileSync('./free-exercise-db/dist/exercises.json', 'utf8'));
const byId = new Map(data.map((x) => [String(x.id), x]));
const quotes = JSON.parse(fs.readFileSync('./core/quoteBank.json', 'utf8'));

const plan = generatePlan({
  discipline: 'bodybuilding',
  daysPerWeek: 4,
  experience: 'advanced',
  equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
  strength: {
    bodyweight: 185,
    height: 70,
    benchWeight: 225,
    benchReps: 5,
    lowerWeight: 315,
    lowerReps: 5,
    hingeWeight: 275,
    hingeReps: 5,
    pullWeight: 140,
    pullReps: 8,
    phase: 'bulk',
    targetWeightLb: 195,
    trainingAgeBucket: '5_plus',
    timePerSession: '60_75',
    equipmentStylePref: 'mix',
    emphasis: ['chest'],
    injurySeverityByJoint: {}
  }
});

const badTerms = /(stretch|mobility|warmup|activation|rehab|therapy|prehab)/i;

let squatSwapBad = [];
for (const day of plan.weeks[0].days) {
  for (const ex of day.exercises) {
    if (String(ex.movementPattern || '') !== 'squat') continue;
    for (const id of ex.swapCandidates || []) {
      const name = String(byId.get(String(id))?.name || '');
      if (badTerms.test(name)) squatSwapBad.push(name);
    }
  }
}
console.log('Swap candidates (squat) bad terms count:', squatSwapBad.length, squatSwapBad);

let projectedBad = [];
for (const day of plan.weeks[0].days) {
  for (const ex of day.exercises) {
    if (!ex.projected || !ex.projected.value) continue;
    const entry = byId.get(String(ex.exerciseId || ''));
    const name = String(entry?.name || '');
    const cat = String(entry?.category || '');
    const mech = String(entry?.mechanic || '');
    if (badTerms.test(name) || badTerms.test(cat) || badTerms.test(mech)) {
      projectedBad.push({ name, projected: ex.projected });
    }
  }
}
console.log('Projected bad keyword count:', projectedBad.length, projectedBad);

const fakeTags = new Set(['phase_nonexistent']);
let snippets = quotes.filter((q) => Array.isArray(q.tags) && q.tags.some((t) => t === 'all' || fakeTags.has(t))).slice(0, 4);
if (!snippets.length && quotes.length) snippets = quotes.slice(0, 4);
console.log('Explain fallback count:', snippets.length, snippets.map((q) => q.id));
