// Seeds crowd-reaction comment boxes into the STORY cutscenes (promotions +
// demotions; the intro stays clean). These scenes have no tracker nodes, so
// the boxes are free-positioned ('*') in the upper corners, styled like the
// rank-loop ones. If you later tag tracker nodes on these videos in the
// editor, delete these and run a tracker-based seed instead — or just drag
// these boxes wherever you want; positions stick.
// Safe to re-run: replaces only the boxes this script created (marked ids).

const fs = require('fs');

const META_PATH = 'd:/Jasons Web/data/cutscene-meta.json';
const uid = () => 'story' + Math.random().toString(36).slice(2, 7);

const SCENES = {
  'promotion-squire.mp4': [
    ['He made it out of the Streets!', 'Make way for the new squire!'],
    ["The yard's got fresh blood!", "Told you he'd climb."]
  ],
  'promotion-mage.mp4': [
    ['The circle accepts him!', 'A new mage rises!'],
    ['His focus earned the robes.', 'The books chose well.']
  ],
  'promotion-ranger.mp4': [
    ['The forest chose him!', 'A new ranger takes the trail!'],
    ['Dawn runs paid off.', 'The wilds gain a guardian.']
  ],
  'promotion-berserker.mp4': [
    ['The pit has a new voice!', 'RAAAH! One of us now!'],
    ['That rage is EARNED.', 'The bar fears him already.']
  ],
  'promotion-knight.mp4': [
    ['Rise, knight of the realm!', 'Steel for the worthy!'],
    ['The table gains a strong one.', 'Specialist no more — a knight!']
  ],
  'promotion-king.mp4': [
    ['The crown has chosen!', 'Long live the new King!'],
    ['The throne is earned, not given.', 'All ranks bow today.']
  ],
  'demotion-peasant.mp4': [
    ['Back to the Streets with him.', "Told you he'd slip."],
    ['The yard forgets quickly.', 'He knows the way down.']
  ],
  'demotion-squire.mp4': [
    ['The armor comes off...', 'From knight to the yard. Ouch.'],
    ['The table votes. He falls.', 'Earn it back, squire.']
  ],
  'demotion-knight.mp4': [
    ['The crown slips...', 'Even kings answer to the grind.'],
    ['A knight again. Humbled.', 'The grind spares no king.']
  ]
};

// [dx, dy] source-frame % per box slot, per view
const POS = {
  desktop: [[22, 20], [76, 18]],
  mobile: [[38, 16], [62, 26]]
};

const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
const report = [];

Object.keys(SCENES).forEach((file) => {
  const m = meta[file] = meta[file] || {};
  m.comments = (Array.isArray(m.comments) ? m.comments : [])
    .filter((c) => !/^story/.test(String(c.id || ''))); // replace our own only
  const segs = Array.isArray(m.segments) && m.segments.length ? m.segments : null;
  const end = segs ? Number(segs[segs.length - 1].to) : 16;
  SCENES[file].forEach((lines, slot) => {
    ['desktop', 'mobile'].forEach((mode) => {
      const p = POS[mode][slot];
      m.comments.push({
        id: uid(),
        trackerId: '*',
        mode: mode,
        dx: p[0],
        dy: p[1],
        w: 14,
        png: '',
        tint: '#d9a15c',
        tintAmt: 0,
        opacity: 1,
        flip: false,
        lines: lines.slice(),
        // one-shot scenes (no loop = one roll): high odds so the crowd
        // almost always reacts, slot 2 a bit shier for variety
        chance: slot === 0 ? 0.85 : 0.6,
        start: slot === 0 ? 1.2 : Math.max(7, end * 0.45),
        end: Math.max(10, end - 3.2)
      });
    });
    report.push(file + ' box ' + (slot + 1) + ': "' + lines[0] + '" (+' + (lines.length - 1) + ' more, both views)');
  });
});

fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
console.log(report.join('\n'));
console.log('saved');
