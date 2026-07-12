// Seeds NPC trash-talk / banter for EVERY rank background loop, using the
// tracker nodes tagged in the editor. Same box style/size as the weak-peasant
// scene (small retro boxes, w:14). Each character gets its own personality and
// per-loop speak chance; pairs converse; MCs talk to themselves; weak/bad
// scenes hint at demotion, strong/good scenes hint at the next rank.
// bg-peasant-weak.mp4 is skipped — it was seeded and hand-tuned already
// (tools/video-bubbles/seed-peasant-lines.js).
// Safe to re-run: overwrites lines/chance on boxes it made, keeps positions.

const fs = require('fs');
const path = require('path');

const META_PATH = path.join(__dirname, '..', '..', 'data', 'cutscene-meta.json');
const uid = () => Math.random().toString(36).slice(2, 9);

/* Per scene: personalities in priority order. For each tracker (per view),
   the first personality whose regex matches AND hasn't been used yet in that
   view wins — so twin labels ("Crowd npc" / "Crowd NPC") get different voices,
   while desktop+mobile versions of the same character share one voice. */
const SCENES = {
  'bg-peasant-normal.mp4': [
    { match: /togther|together/i, name: 'the loyal friend', chance: 0.3, lines: [
      'He never skips. Learn from him.',
      'We walk this road daily. Rain too.',
      "You're keeping pace lately. Good."
    ] },
    { match: /armless/i, name: 'one-armed realist', chance: 0.32, lines: [
      'Lost the arm. Kept the discipline.',
      "He's got two arms and one excuse.",
      "Show up. That's the whole secret."
    ] },
    { match: /knight/i, name: 'recruiting knight', chance: 0.35, lines: [
      'The Drill Yard takes the consistent.',
      'Two more weeks like this, peasant.',
      'Squires are made of mornings like these.'
    ] },
    { match: /npc 1/i, name: 'cautious optimist', chance: 0.3, lines: [
      "He's... actually improving?",
      "I said he'd quit. I was wrong. So far.",
      "Don't jinx it. He's on a streak."
    ] },
    { match: /npc 5/i, name: 'market gossip', chance: 0.3, lines: [
      'He logs his meals now. Fancy.',
      'Third workout this week. I counted.',
      'The knight keeps eyeing him. Promotion?'
    ] },
    { match: /group npc 2/i, name: 'the skeptic friend', chance: 0.3, lines: [
      "I gave him a month. It's been two.",
      "Fine. He's earned the nod."
    ] },
    { match: /group/i, name: 'chatty neighbor', chance: 0.3, lines: [
      'He trains before work now.',
      'Bet you a loaf he makes squire.'
    ] },
    { match: /npc/i, name: 'bystander', chance: 0.28, lines: [
      "Steady lately, isn't he?",
      'The streak is real. For now.'
    ] }
  ],

  'bg-peasant-strong.mp4': [
    { match: /knight/i, name: 'herald knight', chance: 0.4, lines: [
      'The Drill Yard sent for you.',
      "Walk taller. You've earned it.",
      "Next rank's gate is already open."
    ] },
    { match: /couple 1/i, name: 'the pointed wife', chance: 0.32, lines: [
      "Why don't YOU train like that?",
      'That used to be you. Briefly.',
      "I'm just saying. LOOK at him."
    ] },
    { match: /couple 2/i, name: 'the deflecting husband', chance: 0.32, lines: [
      'I lift the groceries, dear.',
      "He's young. I'm... seasoned.",
      'Fine. Monday. I start Monday.'
    ] },
    { match: /group member 2|member 2/i, name: 'the loud friend', chance: 0.3, lines: [
      'Told you he was different now.',
      "The rank board's about to move."
    ] },
    { match: /group/i, name: 'impressed local', chance: 0.3, lines: [
      "That's the comeback guy.",
      'From excuses to THIS. Unreal.'
    ] },
    { match: /npc/i, name: 'quiet admirer', chance: 0.28, lines: [
      "The streets won't hold him long.",
      'Squire by the festival. Watch.'
    ] }
  ],

  'bg-squire-weak.mp4': [
    { match: /thoughts|main/i, name: 'his own head', chance: 0.35, lines: [
      'Can I even do this...?',
      'The Streets are right behind me.',
      'One more set. Then decide.',
      "I didn't climb out to fall back."
    ] },
    { match: /knight 2/i, name: 'the worried knight', chance: 0.3, lines: [
      "He's one bad week from the Streets.",
      'Someone should warn him. You do it.'
    ] },
    { match: /knight/i, name: 'hard drillmaster', chance: 0.35, lines: [
      'Peasants swing harder than that.',
      'The Streets keep a bed for quitters.',
      'Earn the yard or leave it, squire.'
    ] },
    { match: /mage/i, name: 'ominous mage', chance: 0.3, lines: [
      "I've seen your future. It's downhill.",
      "Your aura reads... 'peasant'.",
      'The spell fades when effort does.'
    ] }
  ],

  'bg-squire-regular.mp4': [
    { match: /main/i, name: 'steady head', chance: 0.32, lines: [
      'Better than last week. Keep it.',
      'Blade, bow, or book... choosing soon.',
      'The yard feels smaller lately.'
    ] },
    { match: /knight/i, name: 'path recruiter', chance: 0.32, lines: [
      'Pick a path, squire. The blade waits.',
      'Berserkers eat squires like you.',
      'Steady work. The tiers notice.'
    ] },
    { match: /archer/i, name: 'bow recruiter', chance: 0.3, lines: [
      'Rangers rise before the sun. Could you?',
      'Good lungs. The forest would take you.'
    ] },
    { match: /background/i, name: 'background mage', chance: 0.28, lines: [
      "He hasn't chosen. The paths whisper.",
      'Three doors. One squire.'
    ] },
    { match: /mage/i, name: 'book recruiter', chance: 0.3, lines: [
      'The circle could use that focus.',
      'Magic favors the consistent. So... you.'
    ] }
  ],

  'bg-squire-strong.mp4': [
    { match: /unhinged/i, name: 'unhinged mage', chance: 0.32, lines: [
      'THE STARS SAY HE ASCENDS!',
      "I licked a rune once. He's the one.",
      'UP! The graph goes UP!'
    ] },
    { match: /main/i, name: 'hungry head', chance: 0.32, lines: [
      'Ranger. Berserker. Mage. My pick.',
      "The yard can't hold this anymore.",
      "Whatever I choose, I'm ready."
    ] },
    { match: /obserber 2|observer 2|npc 2/i, name: 'the observer friend', chance: 0.3, lines: [
      'The mage circle asked about him.',
      'Even the guard stopped to watch.'
    ] },
    { match: /observer|npc 1/i, name: 'the observer', chance: 0.3, lines: [
      "He's outgrown the yard.",
      "Specialist by month's end. Bet."
    ] },
    { match: /mage/i, name: 'mage scout', chance: 0.3, lines: [
      "The circle votes tonight. He's in.",
      'That focus is wasted on swords.'
    ] },
    { match: /guard/i, name: 'old guard', chance: 0.28, lines: [
      "Haven't seen drive like that in years.",
      'Reminds me of the King. Early days.'
    ] }
  ],

  'bg-mage-bad.mp4': [
    { match: /unhinged/i, name: 'unhinged mage', chance: 0.32, lines: [
      'The void skips leg day too!',
      'I ate a scroll once. No regrets.',
      "His mana's flat. FLAT I SAY."
    ] },
    { match: /main/i, name: 'slipping mage head', chance: 0.35, lines: [
      'My focus is... slipping.',
      'Squire robes again? No. Please no.',
      'Cast. Miss. Cast. Miss. Why?'
    ] },
    { match: /knight/i, name: 'blunt knight', chance: 0.3, lines: [
      'Magic quits when the body does.',
      'The yard takes mages back. Often.'
    ] },
    { match: /background one|fighter.*one/i, name: 'sparring partner', chance: 0.28, lines: [
      'Even he felt that miss.',
      "Focus, mage! We're TRYING here."
    ] },
    { match: /background two|fighter.*two/i, name: 'the other partner', chance: 0.28, lines: [
      "Your robe's doing more work than you.",
      'He blinked. Mid-cast. Twice.'
    ] }
  ],

  'bg-mage-good.mp4': [
    { match: /shifts to look/i, name: 'the watcher', chance: 0.35, lines: [
      'The Knight tier watches you, mage.',
      'One rank up. The gate knows your name.',
      "Keep this pace. You'll wear steel yet."
    ] },
    { match: /^mage doing/i, name: 'brawler mage', chance: 0.3, lines: [
      'Hands AND spells. Learn both.',
      'He trains like us now. Finally.'
    ] },
    { match: /doing hadn to/i, name: 'sparring knight', chance: 0.3, lines: [
      "Best mage I've traded hits with.",
      "He'd survive the Knight trials."
    ] },
    { match: /doing hand to hadn/i, name: 'the second knight', chance: 0.28, lines: [
      'His guard never drops now.',
      'The table talks about him.'
    ] },
    { match: /main/i, name: 'sharp mage head', chance: 0.32, lines: [
      'The circle bends when I work.',
      'Knight tier next. The math holds.',
      'Every rep sharpens the cast.'
    ] }
  ],

  'bg-ranger-weak.mp4': [
    { match: /deer/i, name: 'judgmental deer', chance: 0.35, lines: [
      'Even I do more cardio.',
      '*chews* ...pathetic pace.',
      "I'm PREY and I outrun him."
    ] },
    { match: /main/i, name: 'winded head', chance: 0.35, lines: [
      'The trail feels longer lately...',
      'Skip one dawn run, lose the rank.',
      'The yard is downhill from here. No.'
    ] },
    { match: /npc/i, name: 'trail veteran', chance: 0.3, lines: [
      "Skip dawns, and you're no ranger.",
      'The forest keeps score, kid.'
    ] }
  ],

  'bg-ranger-strong.mp4': [
    { match: /main|min ch/i, name: 'clear head', chance: 0.32, lines: [
      'Knighthood is one ridge away.',
      'Dawn runs bought me this pace.',
      'The forest moves aside now.'
    ] },
    { match: /npc/i, name: 'trail veteran', chance: 0.3, lines: [
      'The forest speaks well of you.',
      "Knight's road forks off this trail."
    ] }
  ],

  'bg-berserker-bad.mp4': [
    { match: /besekrker|represen|main/i, name: 'unraveling fury', chance: 0.35, lines: [
      'RAGE!... right after this nap.',
      'Strong or just loud? LOUD COUNTS!',
      'The yard whispers my old name...',
      'I bit a barbell. It won.'
    ] },
    { match: /member 1|crowd/i, name: 'nervous local', chance: 0.3, lines: [
      "Don't make eye contact.",
      'He used to lift twice this.'
    ] },
    { match: /two|crowd/i, name: 'whispering friend', chance: 0.3, lines: [
      "The rage is there. The reps aren't.",
      "One more slip and he's a squire."
    ] },
    { match: /four|crowd/i, name: 'blunt heckler', chance: 0.28, lines: [
      'All roar, no bar.',
      'The pit demotes the undisciplined.'
    ] }
  ],

  'bg-berserker-good.mp4': [
    { match: /beserker|berserker/i, name: 'channeled fury', chance: 0.35, lines: [
      'Calm. Heavy. Forward.',
      'The rage lifts WITH me now.',
      "Knight's table keeps a seat warm.",
      'Control is the heaviest weight.'
    ] }
  ],

  'bg-knight-bad.mp4': [
    { match: /#2|knigt #?2/i, name: 'the second peer', chance: 0.3, lines: [
      'Squires behave better than this.',
      'The table votes on him tonight.',
      'Pride demotes faster than sloth.'
    ] },
    { match: /watching bad/i, name: 'disgusted peer', chance: 0.32, lines: [
      "He kicked a CHILD'S ball.",
      'The King sees everything. Everything.',
      'That armor is on loan, brother.'
    ] },
    { match: /disrespetcful/i, name: 'the second peer, again', chance: 0.3, lines: [
      'Rank rots when respect does.',
      'The kid cried, you know.'
    ] },
    { match: /watching disrespectful/i, name: 'disgusted peer', chance: 0.32, lines: [
      "He kicked a CHILD'S ball.",
      'The King sees everything. Everything.',
      'That armor is on loan, brother.'
    ] },
    { match: /kicking/i, name: 'fallen knight head', chance: 0.32, lines: [
      'The ball was in my way.',
      'Rank means I do what I want... right?',
      'Why does the armor feel loose?'
    ] }
  ],

  'bg-knight-good.mp4': [
    { match: /picking up|^mc$/i, name: 'noble head', chance: 0.32, lines: [
      'Strength is FOR this.',
      'The throne watches. Let it.',
      'Carry the small ones. Always.'
    ] },
    { match: /watching mc.*knight|kngiht/i, name: 'admiring knight', chance: 0.32, lines: [
      'The King asked about him yesterday.',
      "That's what the crown looks for."
    ] },
    { match: /bystander/i, name: 'grateful parent', chance: 0.3, lines: [
      'My kid wants to BE him.',
      'Knights like that make kings.'
    ] },
    { match: /wlaking|walking/i, name: 'passerby', chance: 0.25, lines: [
      'Did you see that? Proper knight.',
      'The realm feels safer lately.'
    ] }
  ],

  'bg-king-regular.mp4': [
    { match: /knigt coming|mess with|passing/i, name: 'the needling knight', chance: 0.5, lines: [
      "Don't lose your spot.",
      'Are you content, my king?',
      'Comfort has cost crowns before.',
      'The Streets remember you, sire.',
      'Someone lifted more than you today.'
    ] },
    { match: /^mc$|main/i, name: "the crown's weight", chance: 0.32, lines: [
      'The view is earned daily.',
      'Everyone below wants this chair.',
      'Kings fall in weeks, not wars.',
      'Still hungry. Good.'
    ] }
  ]
};

const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
const report = [];

Object.keys(SCENES).forEach((file) => {
  const m = meta[file];
  if (!m || !Array.isArray(m.trackers) || !m.trackers.length) {
    report.push(file + ': NO TRACKERS — skipped');
    return;
  }
  m.comments = Array.isArray(m.comments) ? m.comments : [];
  const personalities = SCENES[file];
  const usedByMode = { desktop: new Set(), mobile: new Set() };

  m.trackers.forEach((tr) => {
    const mode = tr.mode === 'mobile' ? 'mobile' : 'desktop';
    const used = usedByMode[mode];
    const p = personalities.find((pp) => !used.has(pp) && pp.match.test(String(tr.label || '')))
      || personalities.find((pp) => pp.match.test(String(tr.label || '')));
    if (!p || !tr.points || !tr.points.length) {
      report.push(file + ': "' + tr.label + '" [' + mode + '] — NO PERSONALITY MATCHED');
      return;
    }
    used.add(p);
    const existing = m.comments.find((c) => c.trackerId === tr.id);
    if (existing) {
      existing.lines = p.lines.slice();
      existing.chance = p.chance;
      if (!existing.png) existing.w = Math.min(Number(existing.w) || 14, 14);
      report.push(file + ': "' + tr.label + '" [' + mode + '] -> ' + p.name + ' (updated, ' + p.lines.length + ' lines, ' + Math.round(p.chance * 100) + '%)');
      return;
    }
    m.comments.push({
      id: uid(),
      trackerId: tr.id,
      mode: mode,
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
    report.push(file + ': "' + tr.label + '" [' + mode + '] -> ' + p.name + ' (' + p.lines.length + ' lines, ' + Math.round(p.chance * 100) + '%)');
  });
});

fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
console.log(report.join('\n'));
console.log('\nsaved ' + META_PATH);
