const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function readTrainingSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'js', 'training.js'), 'utf8');
}

function readLegacyTrainingSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'training-coming-soon.html'), 'utf8');
}

function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  let i = source.indexOf('{', start);
  if (i < 0) throw new Error(`No body for function: ${name}`);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces for function: ${name}`);
}

function loadTrainingFunctions(names) {
  const src = readTrainingSource();
  const constants = `
    const WEEKDAY_CODE_TO_INDEX = {
      su: 0, sun: 0, sunday: 0,
      m: 1, mo: 1, mon: 1, monday: 1,
      t: 2, tu: 2, tue: 2, tues: 2, tuesday: 2,
      w: 3, we: 3, wed: 3, wednesday: 3,
      th: 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
      f: 5, fr: 5, fri: 5, friday: 5,
      s: 6, sa: 6, sat: 6, saturday: 6
    };
    const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  `;
  const chunks = names.map((name) => extractFunctionSource(src, name)).join('\n');
  const context = { module: { exports: {} }, Date: { now: () => 12345 } };
  vm.runInNewContext(`${constants}\n${chunks}\nmodule.exports = { ${names.join(', ')} };`, context);
  return context.module.exports;
}

test('powerbuilding and bodybuilding map to the correct trainingFeel labels', () => {
  const { normalizeDiscipline, mapWizardDisciplineToTrainingFeel } = loadTrainingFunctions([
    'normalizeDiscipline',
    'mapWizardDisciplineToTrainingFeel'
  ]);

  assert.equal(normalizeDiscipline('powerbuilding'), 'powerbuilding');
  assert.equal(mapWizardDisciplineToTrainingFeel('powerbuilding'), 'Powerbuilding');
  assert.equal(mapWizardDisciplineToTrainingFeel('bodybuilding'), 'Aesthetic bodybuilding');
});

test('powerbuilding keeps the shared priority groups mapping', () => {
  const { mapWizardEmphasisToPriorityGroups } = loadTrainingFunctions(['mapWizardEmphasisToPriorityGroups']);
  assert.equal(JSON.stringify(mapWizardEmphasisToPriorityGroups(['chest', 'quads', 'abs'])), JSON.stringify(['Chest', 'Legs', 'Core']));
});

test('frontend source wires shared payload fields for powerbuilding and bodybuilding', () => {
  const src = readTrainingSource();
  assert.match(src, /if \(normalizedDiscipline === 'bodybuilding' \|\| normalizedDiscipline === 'powerbuilding' \|\| normalizedDiscipline === 'military'\)/);
  assert.match(src, /trainingFeel,\s*discipline: normalizedDiscipline,/);
  assert.match(src, /focus: normalizedDiscipline === 'bodybuilding' \? 'Aesthetic' : 'Strength'/);
  assert.match(src, /priorityGroups: mapWizardEmphasisToPriorityGroups\(emphasis\)/);
  assert.match(src, /disciplineRaw === 'powerbuilding' \|\| trainingFeel === 'Powerbuilding'/);
  assert.match(src, /trainingFeel === 'Powerbuilding'/);
  assert.match(src, /benchVariation: String\(normalizedStrength\.benchVariation \|\| normalizedStrength\.pressMovement \|\| ''\)/);
  assert.match(src, /benchWeight: Number\(normalizedStrength\.benchWeight \|\| normalizedStrength\.pressWeight \|\| 0\) \|\| null/);
  assert.match(src, /lowerMovement: String\(normalizedStrength\.lowerMovement \|\| normalizedStrength\.legMovement \|\| ''\)/);
  assert.match(src, /hingeMovement: String\(normalizedStrength\.hingeMovement \|\| ''\)/);
});

test('frontend source keeps unready lanes disabled and enables powerbuilding lane copy', () => {
  const src = readTrainingSource();
  assert.match(src, /key:\s*'powerbuilding',\s*title:\s*'Powerbuilding'/);
  assert.match(src, /Build strength on key lifts while adding muscle\./);
  assert.match(src, /const isDisabled = !\['bodybuilding', 'powerbuilding', 'military'\]\.includes\(opt\.key\)/);
  assert.match(src, /key:\s*'powerlifting'/);
  assert.match(src, /key:\s*'calisthenics'/);
});

test('legacy training entry point keeps powerbuilding in the modal wizard and keeps unready lanes disabled', () => {
  const src = readLegacyTrainingSource();
  assert.match(src, /Powerbuilding = Strength and Proportion',v:'strength'\}/);
  assert.doesNotMatch(src, /Powerbuilding = Strength and Proportion',v:'strength',soon:true/);
  assert.match(src, /Military = Endurance \+ Strength',v:'military'/);
  assert.match(src, /if\(startTop\)startTop\.addEventListener\('click',openIntake\)/);
  assert.match(src, /if\(startParam==='1'\|\|startParam==='true'\) openIntake\(\)/);
  assert.match(src, /if\(v==='strength'\)\{\s*S\.modality='powerbuilding';\s*S\.discipline='powerbuilding';\s*\}else\{/);
  assert.doesNotMatch(src, /redirectToRealTrainingFlow\('powerbuilding'\)/);
});
