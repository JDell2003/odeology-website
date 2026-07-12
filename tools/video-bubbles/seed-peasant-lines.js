// One-off: seed the weak-peasant loop with NPC trash-talk. Fills the saved
// mobile comment boxes with lines and creates desktop boxes on the saved
// desktop tracker nodes. Each NPC has its own personality and a per-loop
// speak chance, so passes interleave (some silent, different voices).
// Safe to re-run: it overwrites lines/chance but keeps positions you set.

const fs = require('fs');
const path = require('path');

const META_PATH = path.join(__dirname, '..', '..', 'data', 'cutscene-meta.json');
const FILE = 'bg-peasant-weak.mp4';
const uid = () => Math.random().toString(36).slice(2, 9);

// personality per tracker label (matched loosely, case-insensitive)
const PERSONALITIES = [
  {
    match: /walking away|npc 1\b|^npc 1$/i,
    name: 'dismissive walker',
    chance: 0.3,
    lines: [
      "Don't bother. He quits by Wednesday.",
      'Seen this one before. All talk.',
      'Keep walking. Nothing changes here.'
    ]
  },
  {
    match: /knight/i,
    name: 'contemptuous knight',
    chance: 0.4,
    lines: [
      'Barely any cardio. Barely any effort.',
      "You said 'tomorrow' three weeks straight.",
      'My armor works harder than you do.',
      'That posture? Pathetic, peasant.'
    ]
  },
  {
    match: /lady|teleport/i,
    name: 'disgusted noblewoman',
    chance: 0.28,
    lines: [
      'Eww. Are those... excuses?',
      'He skipped again. Shocking.',
      'The gym forgot your name, darling.'
    ]
  },
  {
    match: /npc #?3/i,
    name: 'gossip',
    chance: 0.3,
    lines: [
      "That's the 'shredded by summer' guy.",
      'He logs one workout, then vanishes.',
      'He thinks the fridge walk is cardio.'
    ]
  },
  {
    match: /shop\s*keep/i,
    name: 'mocking merchant',
    chance: 0.32,
    lines: [
      "Fresh excuses! Oh — you're stocked.",
      "No protein for you. You'd waste it.",
      "Motivation? You can't afford it."
    ]
  },
  {
    match: /main character/i,
    name: 'his own head',
    chance: 0.25,
    lines: [
      "Maybe they're right about me...",
      'I barely even tried.',
      "I said I'd change. I didn't."
    ]
  },
  {
    match: /npc #?2/i,
    name: 'sneering bystander',
    chance: 0.32,
    lines: [
      'Look who crawled back.',
      'Barely moving. Barely trying.',
      'Eww. The effort is missing.'
    ]
  }
];

const FREE_BOX = {
  name: 'the crowd itself',
  chance: 0.15,
  lines: [
    'The whole market is judging you.',
    'Everyone here already doubts you.'
  ]
};

const personalityFor = (label) =>
  PERSONALITIES.find((p) => p.match.test(String(label || ''))) || null;

const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
const m = meta[FILE];
if (!m) throw new Error(FILE + ' has no saved meta');
m.comments = Array.isArray(m.comments) ? m.comments : [];
const trackers = Array.isArray(m.trackers) ? m.trackers : [];
const report = [];

// 1. Fill every EXISTING box (keeps the user's positions/timing/style).
m.comments.forEach((c) => {
  if (c.trackerId === '*') {
    c.lines = FREE_BOX.lines.slice();
    c.chance = FREE_BOX.chance;
    report.push(`existing ${c.mode} free box -> ${FREE_BOX.name} (${c.lines.length} lines)`);
    return;
  }
  const tr = trackers.find((t) => t.id === c.trackerId);
  const p = tr && personalityFor(tr.label);
  if (p) {
    c.lines = p.lines.slice();
    c.chance = p.chance;
    // Blank desktop boxes were seeded oversized — pull them down to 14%.
    if (c.mode === 'desktop' && !c.png) c.w = Math.min(Number(c.w) || 14, 14);
    report.push(`existing ${c.mode} box on "${tr.label}" -> ${p.name} (${c.lines.length} lines, ${Math.round(p.chance * 100)}%)`);
  }
});

// 2. Create boxes for tracked NPCs that don't have one yet (desktop nodes).
trackers.forEach((tr) => {
  const has = m.comments.some((c) => c.trackerId === tr.id);
  if (has) return;
  const p = personalityFor(tr.label);
  if (!p || !tr.points || !tr.points.length) return;
  m.comments.push({
    id: uid(),
    trackerId: tr.id,
    mode: tr.mode === 'mobile' ? 'mobile' : 'desktop',
    dx: 2,
    dy: -13,
    w: 14,
    png: '',
    tint: '#d9a15c',
    tintAmt: 0,
    opacity: 1,
    flip: false,
    lines: p.lines.slice(),
    chance: p.chance,
    start: Math.round(tr.points[0].t * 10) / 10,
    end: Math.round(tr.points[tr.points.length - 1].t * 10) / 10
  });
  report.push(`created ${tr.mode} box on "${tr.label}" -> ${p.name} (${p.lines.length} lines, ${Math.round(p.chance * 100)}% per loop)`);
});

fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
console.log(report.join('\n'));
console.log('saved', META_PATH);
