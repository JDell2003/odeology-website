const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function readTrainingSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'js', 'training.js'), 'utf8');
}

function readLegacySource() {
  return fs.readFileSync(path.join(__dirname, '..', 'training-coming-soon.html'), 'utf8');
}

function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  let cursor = source.indexOf('{', start);
  let depth = 0;
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, cursor + 1);
    }
  }
  throw new Error(`Unbalanced function: ${name}`);
}

function loadFunctions(names) {
  const source = readTrainingSource();
  const chunks = names.map((name) => extractFunctionSource(source, name)).join('\n');
  const context = { module: { exports: {} } };
  vm.runInNewContext(`${chunks}\nmodule.exports = { ${names.join(', ')} };`, context);
  return context.module.exports;
}

test('military maps to the shared normalized lane labels', () => {
  const { normalizeDiscipline, mapWizardDisciplineToTrainingFeel } = loadFunctions([
    'normalizeDiscipline',
    'mapWizardDisciplineToTrainingFeel'
  ]);
  assert.equal(normalizeDiscipline('military'), 'military');
  assert.equal(normalizeDiscipline('Military Hybrid'), 'military');
  assert.equal(mapWizardDisciplineToTrainingFeel('military'), 'Military Hybrid');
  assert.equal(mapWizardDisciplineToTrainingFeel('bodybuilding'), 'Aesthetic bodybuilding');
  assert.equal(mapWizardDisciplineToTrainingFeel('powerbuilding'), 'Powerbuilding');
});

test('military reuses the shared priority group mapping', () => {
  const { mapWizardEmphasisToPriorityGroups } = loadFunctions(['mapWizardEmphasisToPriorityGroups']);
  assert.equal(
    JSON.stringify(mapWizardEmphasisToPriorityGroups(['chest', 'back', 'quads', 'glutes', 'calves', 'shoulders', 'arms', 'abs'])),
    JSON.stringify(['Chest', 'Back', 'Legs'])
  );
});

test('real wizard enables military and leaves unfinished lanes disabled', () => {
  const source = readTrainingSource();
  assert.match(source, /key:\s*'military',\s*title:\s*'Military Hybrid',\s*sub:\s*'Endurance \+ strength \+ readiness\.'/);
  assert.match(source, /!\['bodybuilding', 'powerbuilding', 'military'\]\.includes\(opt\.key\)/);
  assert.match(source, /key:\s*'powerlifting'/);
  assert.match(source, /key:\s*'calisthenics'/);
  assert.doesNotMatch(source, /powerbuildingStrengthPriority/);
});

test('legacy modal keeps military in the same intake instead of redirecting', () => {
  const source = readLegacySource();
  assert.match(source, /Military = Endurance \+ Strength',v:'military'/);
  assert.doesNotMatch(source, /Military = Endurance \+ Strength',v:'military',soon:true/);
  assert.match(source, /if\(v==='military'\)\{\s*S\.modality='military hybrid';\s*S\.discipline='military';/);
  assert.doesNotMatch(source, /redirectToRealTrainingFlow\('military'\)/);
});

test('shared payload builder carries military through existing fields', () => {
  const source = readTrainingSource();
  assert.match(source, /\['bodybuilding', 'powerbuilding', 'military'\]\.includes\(normalizedDiscipline\)/);
  assert.match(source, /discipline: normalizedDiscipline/);
  assert.match(source, /trainingFeel/);
  assert.match(source, /priorityGroups: mapWizardEmphasisToPriorityGroups\(emphasis\)/);
  assert.match(source, /normalizedDiscipline === 'military'/);
  assert.match(source, /benchVariation/);
  assert.match(source, /lowerMovement/);
  assert.match(source, /hingeMovement/);
});

test('training summary uses resolved preferred days and no mojibake placeholder', () => {
  const source = readTrainingSource();
  assert.match(source, /preferredDaysResolved/);
  assert.match(source, /resolvedPreferredDays = Array\.isArray\(plan\?\.schedule\)/);
  assert.doesNotMatch(source, /Discipline', v: discipline \|\| 'â€”'/);
  assert.doesNotMatch(source, /Skill level', v: experience \|\| 'â€”'/);
  assert.doesNotMatch(source, /Sleep', v: .*'â€”'/);
});
