const fs = require('fs');
const { generatePlan } = require('../core/trainingEngine');

const quotes = JSON.parse(fs.readFileSync('./core/quoteBank.json', 'utf8'));
const pickSnippets = (phase) => {
  const phaseTag = `phase_${phase}`;
  const withPhase = quotes.filter((q) => Array.isArray(q.tags) && q.tags.includes(phaseTag));
  const general = quotes.filter((q) => Array.isArray(q.tags) && q.tags.includes('all'));
  const seen = new Set();
  const out = [];
  for (const q of [...withPhase, ...general]) {
    if (out.length >= 4) break;
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
};

console.log('Explain bulk snippets:', pickSnippets('bulk').map((q) => q.id));
console.log('Explain maintain snippets:', pickSnippets('maintain').map((q) => q.id));

const data = JSON.parse(fs.readFileSync('./free-exercise-db/dist/exercises.json', 'utf8'));
const byId = new Map(data.map((x) => [String(x.id), x]));

const plan = generatePlan({
  discipline: 'bodybuilding',
  daysPerWeek: 5,
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

const first = plan.weeks[0].days[0].exercises[0];
console.log('Swap candidates names ok:', (first.swapCandidates || []).map((id) => byId.get(String(id))?.name || ''));

let bandHits = new Set();
let machineComp = 0;
let compTotal = 0;

for (const day of plan.weeks[0].days) {
  for (const ex of day.exercises) {
    const entry = byId.get(String(ex.exerciseId || ''));
    const name = entry?.name || '';
    if (/(^|\b)(band|bands|resistance band|mini band)(\b|$)/i.test(name)) bandHits.add(name);
    if (ex.stimulusType === 'compound') {
      compTotal += 1;
      const eq = String(entry?.equipment || '').toLowerCase();
      if (eq.includes('machine') || eq.includes('cable') || eq.includes('smith') || name.toLowerCase().includes('leverage')) {
        machineComp += 1;
      }
    }
    if (Array.isArray(ex.swapCandidates)) {
      for (const id of ex.swapCandidates) {
        const n = byId.get(String(id))?.name || '';
        if (/(^|\b)(band|bands|resistance band|mini band)(\b|$)/i.test(n)) bandHits.add(n);
      }
    }
  }
}

console.log('Band hits:', bandHits.size, bandHits.size ? Array.from(bandHits) : '');
const pushEntry = byId.get(String(first.exerciseId || ''));
console.log('Push day first:', pushEntry?.name, pushEntry?.equipment);
console.log('Machine/cable compound count:', machineComp, 'of', compTotal);
