// Scratch: assemble data/riseforit_meal_data.json from data/_parts/* (session-file bridge).
'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'data', '_parts');
const ORDER = [
    'part_00.txt',
    'part_01.txt', 'part_01b.txt',
    'part_02.txt', 'part_02b.txt',
    'part_03.txt', 'part_03b.txt',
    'part_04.txt',
    'part_05.txt', 'part_05b.txt',
    'part_06.txt', 'part_06b.txt',
    'part_07.txt', 'part_07b.txt',
    'part_08.txt', 'part_08b.txt',
    'part_09.txt', 'part_09b.txt',
    'part_10.txt', 'part_10b.txt',
    'part_11.txt', 'part_11b.txt',
    'part_12.txt', 'part_12b.txt',
    'part_13.txt', 'part_13b.txt',
    'part_14.txt', 'part_14b.txt',
    'part_15.txt'
];

let out = '';
let lineTotal = 0;
for (const name of ORDER) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) { console.log('MISSING PART: ' + name); process.exit(1); }
    let t = fs.readFileSync(p, 'utf8');
    t = t.replace(/\r\n/g, '\n');
    t = t.replace(/\n+$/, '\n');           // exactly one trailing newline per part
    if (!t.endsWith('\n')) t += '\n';
    const lines = t.split('\n').length - 1;
    lineTotal += lines;
    console.log(name + ': ' + lines + ' lines');
    out += t;
}
console.log('TOTAL LINES: ' + lineTotal + ' (expected 31241)');

// Final file: source's last line is '}' — keep single trailing newline.
const dest = path.join(__dirname, 'data', 'riseforit_meal_data.json');
fs.writeFileSync(dest, out, 'utf8');
console.log('WROTE ' + dest + ' (' + Buffer.byteLength(out, 'utf8') + ' bytes, ' + out.length + ' chars)');

const d = JSON.parse(fs.readFileSync(dest, 'utf8'));
const req = ['name', 'category', 'goal', 'image_url', 'servings', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'ing_rows', 'cart'];
let missing = 0;
for (const m of d.meals) for (const f of req) if (m[f] === undefined || m[f] === null) { missing++; console.log('MISSING FIELD', m.id, f); }
const cats = {};
for (const m of d.meals) cats[m.category] = (cats[m.category] || 0) + 1;
console.log('PARSED OK: meals=' + d.meals.length,
    'ingredient_prices=' + d.ingredient_prices.length,
    'states=' + Object.keys(d.location_multipliers.states).length,
    'metros=' + Object.keys(d.location_multipliers.metros).length,
    'missingFields=' + missing);
console.log('categories:', JSON.stringify(cats));
console.log('goals:', JSON.stringify(d.meals.reduce((a, m) => (a[m.goal] = (a[m.goal] || 0) + 1, a), {})));
