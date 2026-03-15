const fs = require('fs');
const path = require('path');

const OUT = path.join(process.cwd(), 'data', 'forum-posts.json');
const TOTAL = 2000;
const IMAGE_TARGET = 1000;
const SEED = 20260315;
const NGRAM = 5;
const OPENVERSE_PAGE = 20;
const OPENVERSE_MAX = 30;
const OPEN_LICENSES = new Set(['by', 'by-sa', 'cc0', 'pdm']);

function rng(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let value = Math.imul(t ^ (t >>> 15), t | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(SEED);
const pick = (list) => list[Math.floor(rand() * list.length)];
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const uniq = (list) => Array.from(new Set(list.filter(Boolean)));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const shuffle = (list) => {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

let protectedPhrases = [];
const plainWords = (text) => String(text || '').toLowerCase().match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/g) || [];
const protectTitleText = (text) => {
  let out = String(text || '').toLowerCase();
  for (const phrase of protectedPhrases) {
    out = out.split(phrase).join(phrase.replace(/\s+/g, '~'));
  }
  return out;
};
const words = (text) => protectTitleText(text).match(/[a-z0-9]+(?:[.~-][a-z0-9]+)*/g) || [];
const slug = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const norm = (text) => uniq(plainWords(text).slice(0, 3)).join(' ');
const grams = (text) => {
  const list = words(text);
  const out = [];
  for (let i = 0; i <= list.length - NGRAM; i += 1) out.push(list.slice(i, i + NGRAM).join(' '));
  return out;
};
const pretty = (text) => String(text || '').replace(/-/g, ' ');
const cap = (text) => {
  const value = pretty(text);
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
};
const leadStem = (word) => {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && word.length > 4) return word.slice(0, -1);
  return word;
};
const withLead = (c, labels, text) => {
  const tagWords = new Set(plainWords(c.tag).map(leadStem));
  const filtered = labels.filter((label) => plainWords(label).map(leadStem).every((word) => !tagWords.has(word)));
  return `${cap(c.tag)} ${pick(filtered.length ? filtered : labels)}: ${text}`;
};
const titleLead = (c) => {
  const label = `${pretty(c.tag)} ${c.week}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const weighted = ['training', 'training', 'training', 'nutrition', 'nutrition', 'recovery', 'cutting', 'bulking', 'supplements', 'lifestyle'];
const plainUsernames = ['matt', 'derek', 'sarah', 'alex', 'jason', 'mia', 'tyler', 'josh', 'noah', 'emma', 'ash', 'luke', 'nina', 'ella', 'brad', 'zoe'];
const handleRoots = ['matt', 'derek', 'sarah', 'alex', 'jay', 'noah', 'lena', 'ryan', 'chris', 'nina', 'zoe', 'mike'];
const fitnessHandles = ['ironmike', 'benchbeast', 'squatdad', 'platepusher', 'cutmode', 'bulkseason', 'latlover', 'barpath', 'repfiend', 'chalkhands'];
const underscoreHandles = ['jay_train', 'lifter_matt', 'sarah_lifts', 'alex_cuts', 'bench_ben', 'plates_n_prep', 'coach_jay', 'derek_rows'];
const casualHandles = ['bro_lifts', 'gymrat', 'late_night_lifter', 'mealguy', 'cardiohater', 'legdaypain', 'preworkoutbrain', 'restdayvibes'];
const typoMap = [
  ['bench', 'benhc'],
  ['weight', 'weigth'],
  ['about', 'abt'],
  ['because', 'becuase'],
  ['really', 'realy'],
  ['a lot', 'alot'],
  ['going', 'goign']
];
const cfg = {
  training: { communities: ['r/odeology_forum', 'r/training', 'r/pushpulllegs', 'r/homegym'], tags: ['training', 'hypertrophy', 'execution'], fallback: ['strength workout gym', 'barbell workout', 'dumbbell training'] },
  nutrition: { communities: ['r/nutrition', 'r/mealprep', 'r/highprotein', 'r/easymeals'], tags: ['nutrition', 'meals', 'protein'], fallback: ['high protein meal prep', 'healthy meal prep', 'protein meal'] },
  recovery: { communities: ['r/recovery', 'r/mobility', 'r/deload', 'r/sleepforgains'], tags: ['recovery', 'sleep', 'mobility'], fallback: ['mobility stretching', 'recovery stretching', 'walking recovery'] },
  cutting: { communities: ['r/cutting', 'r/caloriedeficit', 'r/leaningout', 'r/recompnotes'], tags: ['fat-loss', 'nutrition', 'consistency'], fallback: ['healthy low calorie meal', 'lean meal prep', 'salad protein meal'] },
  bulking: { communities: ['r/bulking', 'r/gaining', 'r/massphase', 'r/strengthmeals'], tags: ['muscle-gain', 'nutrition', 'surplus'], fallback: ['high calorie meal prep', 'bodybuilding meal', 'protein rice bowl'] },
  supplements: { communities: ['r/supplements', 'r/creatine', 'r/preworkout', 'r/proteinpowder'], tags: ['supplements', 'performance', 'creatine'], fallback: ['supplement shaker bottle', 'protein powder shaker', 'gym bag supplements'] },
  lifestyle: { communities: ['r/consistency', 'r/busyfitness', 'r/weekendreset', 'r/systemsoverhype'], tags: ['consistency', 'lifestyle', 'planning'], fallback: ['fitness planner notebook', 'workout calendar planner', 'meal prep notebook'] }
};

const pool = {
  part: ['upper-chest', 'biceps', 'rear-delts', 'side-delts', 'quads', 'hamstrings', 'lats', 'glutes', 'triceps', 'calves', 'forearms', 'traps', 'upper-back', 'mid-back', 'abs', 'adductors', 'pecs', 'shoulders'],
  block: ['upper-lower', 'push-pull-legs', 'full-body', '4-day-hypertrophy', '3-day-strength-split', 'bench-specialization', 'home-dumbbell-split', 'torso-limbs', 'high-low-mix', 'machine-bias-split', 'strength-hypertrophy-mix', '5-day-bro-split'],
  setting: ['garage-gym mornings', 'lunch-break sessions', 'shift-work weeks', 'crowded evenings', 'home-dumbbell nights', 'weekend catch-ups', 'office-gym mornings', 'hotel-gym weeks', 'post-school dropoff', 'before-bed sessions', 'apartment-gym dawns', 'rainy commute days', 'two-job weeks', 'travel-day training', 'Sunday reset blocks', 'college-schedule weeks'],
  constraint: ['under-45 minutes', 'before-work', 'no fifth-day', 'weekends open', 'limited rack-access', 'calm elbows', 'under-35 minutes', 'one-bench-only', 'no spotter', 'wrist-friendly only', 'post-commute fatigue', 'one-cable-only', 'crowded-gym timing', 'low-energy nights'],
  friction: ['presses fine curls-late', 'rows fine arms-late', 'front-delt takeover', 'pump no-progress', 'recovery runs-late', 'mind-muscle comes-last', 'good-session bad-mirror', 'volume up joints-loud', 'strength up shape-flat', 'tempo helps load-does-not', 'elbows calm until curls', 'motivation good output-mid'],
  lift: ['incline-press', 'dumbbell-curl', 'RDL', 'hack-squat', 'lat-pulldown', 'leg-press', 'cable-row', 'preacher-curl', 'chest-supported-row', 'split-squat', 'machine-press', 'lateral-raise', 'cable-fly', 'leg-curl', 'hip-thrust', 'pull-up', 'smith-incline', 'dip'],
  food: ['salmon-bowls', 'ground-turkey-rice', 'Greek-yogurt-bowls', 'egg-wraps', 'beef-jasmine-rice', 'bagel-sandwiches', 'cottage-cheese-bowls', 'overnight-oats', 'chicken-burrito-bowls', 'steak-potato-boxes', 'protein-pasta-bowls', 'turkey-bagel-melts', 'shrimp-rice-boxes', 'tofu-rice-bowls', 'chicken-pita-boxes', 'taco-beef-bowls', 'tuna-rice-boxes', 'protein-french-toast', 'rice-salmon-boxes', 'yogurt-parfait-cups'],
  food2: ['fruit-yogurt', 'rice-cake-turkey', 'potatoes-eggs', 'rice-beef', 'oats-whey', 'toast-eggs', 'chicken-pasta', 'cereal-whey', 'bagel-turkey', 'wrap-and-fruit', 'protein-shake-oats', 'egg-and-rice', 'beef-and-potatoes', 'skyr-and-berries', 'pasta-and-chicken', 'tofu-noodles', 'rice-and-sardines', 'turkey-chili'],
  meal: ['pre-6am training', 'long workdays', 'late shifts', 'post-leg day', 'commute days', 'cut days', 'low appetite', 'double-session days', 'weekend travel', 'airport mornings', 'late meetings', 'school pickup', 'rest-day lunches', 'high-step days', 'long study nights', 'post-pull day', 'overnight shifts', 'busy Fridays'],
  appetite: ['midday appetite-loss', 'late-hunger spikes', 'breakfast resistance', 'poor portability', 'weekend drift', 'work-stress snacking', 'night-cravings', 'meal-three boredom', 'restaurant detours', 'forgot-to-pack chaos', 'sweet-tooth rebounds', 'evening overfixing'],
  issue: ['pressing-shoulder tightness', 'curl-elbow crankiness', 'slow quad-recovery', 'evening sleep-latency', 'row-day back-tightness', 'ankle stiffness on squats', 'pec soreness hanging-on', 'neck tension after presses', 'hamstring soreness lasting', 'low-back fatigue creep', 'wrist irritation on curls', 'hip pinching on hinges'],
  tool: ['dinner walks', 'mobility resets', 'foam rolling', 'breathing drills', 'early caffeine-cutoff', 'longer cooldowns', 'ankle warmups', 'band pull-aparts', 'short naps', 'post-dinner stretching', 'sunrise walks', 'electrolyte water', 'lighter primers', 'sleep mask routine'],
  deficit: ['220 calorie deficit', '240 calorie deficit', '260 calorie deficit', '280 calorie deficit', '300 calorie deficit', '320 calorie deficit', '340 calorie deficit', '360 calorie deficit', '380 calorie deficit', '400 calorie deficit', '430 calorie deficit', '460 calorie deficit'],
  hunger: ['dinner hunger-spikes', 'training goes-flat', 'restaurant math-breaks', 'energy drops-early', 'late-night fridge-loops', 'afternoon cravings-hit', 'weekend snacks-sneak', 'meal-four gets-shaky', 'low-focus mornings', 'post-cardio hunger-hits', 'office treats-win', 'sleepy evenings-binge'],
  surplus: ['140 calorie surplus', '160 calorie surplus', '180 calorie surplus', '200 calorie surplus', '220 calorie surplus', '240 calorie surplus', '260 calorie surplus', '280 calorie surplus', '300 calorie surplus', '320 calorie surplus', '340 calorie surplus', '360 calorie surplus'],
  bulk: ['meal-two appetite-drop', 'surplus digestion-mess', 'random extra-snacks', 'carbs drift-late', 'dinner fullness-wall', 'weekend portions-creep', 'liquid-calorie reliance', 'late-meal burnout', 'breakfast appetite-missing', 'grocery bill-jump', 'shaker dependence-creep', 'restaurant surplus-spikes'],
  supp: ['creatine-monohydrate', 'whey-isolate', 'electrolytes', 'pre-workout', 'fish-oil', 'magnesium-glycinate', 'caffeine', 'casein', 'vitamin-d', 'citrulline-malate', 'ashwagandha', 'beta-alanine'],
  stack: ['three-item-stack', 'two-scoop-shaker', 'simple-gym-bag', 'cut-back-stack', 'training-day-stack', 'travel-day-stack', 'basic-recovery-stack', 'budget-stack', 'morning-stack', 'night-stack'],
  planner: ['Sunday-whiteboard', 'notes-checklist', 'paper-planner', 'fridge-meal-grid', 'Sunday-grocery-template', 'calendar-reminder-stack', 'kitchen-notepad', 'lift-log-spreadsheet', 'phone-widget-stack', 'sticky-note-board', 'weekly-time-block', 'meal-rotation-sheet'],
  routine: ['Tuesday collapse', 'Friday drift', 'travel reset-loss', 'sleep cut-first', 'weekend Monday-spill', 'Thursday takeout-swing', 'airport routine-break', 'late-meeting dominoes', 'rainy-day skip', 'Sunday prep-slip', 'morning alarm-fail', 'school-run squeeze'],
  tag1: ['busy', 'quiet', 'cheap', 'late', 'early', 'small', 'heavy', 'light', 'steady', 'reset', 'simple', 'quick', 'deep', 'clean', 'weekend', 'weekday', 'office', 'garage', 'kitchen', 'commute', 'night', 'lunch', 'travel', 'student', 'family', 'solo', 'repeat', 'macro', 'grocery', 'sleep', 'volume', 'recovery', 'deficit', 'surplus', 'protein', 'meal', 'prep', 'cardio', 'strength', 'arm', 'leg', 'back', 'chest', 'shoulder', 'paper', 'calendar', 'habit', 'easy', 'hard', 'lean', 'bulk', 'cut', 'rest', 'deload', 'walk', 'shaker', 'stack'],
  tag2: ['check', 'reset', 'plan', 'week', 'groceries', 'plate', 'session', 'routine', 'timing', 'setup', 'rhythm', 'block', 'focus', 'notes', 'budget', 'night', 'morning', 'lunch', 'prep', 'recovery', 'training', 'meal', 'cut', 'bulk', 'stack', 'planner', 'schedule'],
  week: [3, 4, 5, 6, 7, 8, 9, 10, 12, 14],
  days: [3, 4, 4, 4, 5, 5, 6],
  len: ['38-minute', '42-minute', '47-minute', '51-minute', '56-minute', '61-minute'],
  sleep: ['5.9', '6.2', '6.5', '6.8', '7.1', '7.4', '7.7', '8.0'],
  steps: ['6.2', '7.4', '8.1', '8.8', '9.6', '10.4', '11.1', '12.3'],
  protein: [146, 158, 167, 176, 184, 192, 201, 214, 228],
  budget: [64, 72, 79, 86, 94, 103, 112, 121],
  meals: [3, 4, 5, 6]
};

protectedPhrases = uniq(
  Object.values(pool)
    .flat()
    .filter((value) => typeof value === 'string')
    .map((value) => pretty(value).toLowerCase())
    .filter((value) => value.includes(' '))
).sort((left, right) => right.length - left.length);

function common() {
  const left = pick(pool.tag1);
  const leftStem = leadStem(left);
  const tag2Options = pool.tag2.filter((item) => leadStem(item) !== leftStem && leadStem(item) !== 'week');
  return {
    week: `week ${pick(pool.week)}`,
    days: pick(pool.days),
    len: pick(pool.len),
    sleep: pick(pool.sleep),
    steps: pick(pool.steps),
    protein: pick(pool.protein),
    budget: pick(pool.budget),
    meals: pick(pool.meals),
    setting: pick(pool.setting),
    constraint: pick(pool.constraint),
    tag: `${left} ${pick(tag2Options.length ? tag2Options : pool.tag2)}`
  };
}

function ctx(category) {
  const c = common();
  if (category === 'training') return { ...c, part: pick(pool.part), part2: pick(pool.part), block: pick(pool.block), friction: pick(pool.friction), lift: pick(pool.lift) };
  if (category === 'nutrition') return { ...c, food: pick(pool.food), food2: pick(pool.food2), meal: pick(pool.meal), appetite: pick(pool.appetite) };
  if (category === 'recovery') return { ...c, block: pick(pool.block), issue: pick(pool.issue), tool: pick(pool.tool), part: pick(pool.part) };
  if (category === 'cutting') return { ...ctx('nutrition'), deficit: pick(pool.deficit), hunger: pick(pool.hunger) };
  if (category === 'bulking') return { ...ctx('nutrition'), surplus: pick(pool.surplus), bulk: pick(pool.bulk) };
  if (category === 'supplements') {
    const supp = pick(pool.supp);
    return { ...c, supp, supp2: pick(pool.supp.filter((item) => item !== supp)), stack: pick(pool.stack), caffeine: pick([140, 180, 220, 260, 300]) };
  }
  return { ...c, planner: pick(pool.planner), routine: pick(pool.routine), food: pick(pool.food) };
}

function generateUsername() {
  const roll = rand();
  let value = '';
  if (roll < 0.3) value = pick(plainUsernames);
  else if (roll < 0.6) value = `${pick(handleRoots)}${pick(['21', '24', '27', '31', '88', '92', '95'])}`;
  else if (roll < 0.8) value = pick(fitnessHandles);
  else if (roll < 0.9) value = pick(underscoreHandles);
  else value = pick(casualHandles);
  return String(value).slice(0, 16);
}

function applyCaptionImperfection(text) {
  let out = String(text || '');
  if (rand() < 0.1) {
    const pair = pick(typoMap);
    out = out.replace(new RegExp(pair[0], 'i'), pair[1]);
  }
  if (rand() < 0.08) out = out.toLowerCase();
  if (rand() < 0.06) out += ` ${pick(['lol', '😭', 'ngl', 'tbh'])}`;
  return out;
}

function pickPostType() {
  const roll = rand();
  if (roll < 0.5) return 'question';
  if (roll < 0.75) return 'personal';
  if (roll < 0.9) return 'advice';
  return 'casual';
}

function buildPostTypeSchedule(total) {
  const counts = {
    question: Math.round(total * 0.5),
    personal: Math.round(total * 0.25),
    advice: Math.round(total * 0.15)
  };
  counts.casual = total - counts.question - counts.personal - counts.advice;
  return shuffle([
    ...Array.from({ length: counts.question }, () => 'question'),
    ...Array.from({ length: counts.personal }, () => 'personal'),
    ...Array.from({ length: counts.advice }, () => 'advice'),
    ...Array.from({ length: counts.casual }, () => 'casual')
  ]);
}

const singularParts = new Set(['upper-chest', 'upper-back', 'mid-back', 'back']);
const pluralParts = new Set(['biceps', 'rear-delts', 'side-delts', 'quads', 'hamstrings', 'lats', 'glutes', 'triceps', 'calves', 'forearms', 'traps', 'abs', 'adductors', 'pecs', 'shoulders']);
const singularLifts = new Set(['RDL', 'hack-squat', 'lat-pulldown', 'leg-press', 'cable-row', 'preacher-curl', 'chest-supported-row', 'split-squat', 'machine-press', 'lateral-raise', 'cable-fly', 'leg-curl', 'hip-thrust', 'pull-up', 'smith-incline', 'dip', 'incline-press', 'dumbbell-curl']);

function isPluralPart(part) {
  if (pluralParts.has(part)) return true;
  if (singularParts.has(part)) return false;
  return /s$/.test(part);
}

function partLabel(part) {
  return pretty(part);
}

function partAreIs(part) {
  return isPluralPart(part) ? 'are' : 'is';
}

function partDoDoes(part) {
  return isPluralPart(part) ? 'do' : 'does';
}

function liftLabel(lift) {
  return pretty(lift);
}

function fixGrammar(text) {
  let out = String(text || '');
  const replacements = [
    [/\bupper chest are\b/gi, 'upper chest is'],
    [/\bupper back are\b/gi, 'upper back is'],
    [/\bmid back are\b/gi, 'mid back is'],
    [/\btraps keeps\b/gi, 'traps keep'],
    [/\bpecs keeps\b/gi, 'pecs keep'],
    [/\btriceps finally looks\b/gi, 'triceps finally look'],
    [/\bcalves keeps\b/gi, 'calves keep'],
    [/\bhamstrings keeps\b/gi, 'hamstrings keep'],
    [/\bshoulders keeps\b/gi, 'shoulders keep'],
    [/\bglutes keeps\b/gi, 'glutes keep'],
    [/\blats keeps\b/gi, 'lats keep'],
    [/\bquads keeps\b/gi, 'quads keep'],
    [/\brear delts keeps\b/gi, 'rear delts keep'],
    [/\bside delts keeps\b/gi, 'side delts keep'],
    [/\bforearms keeps\b/gi, 'forearms keep'],
    [/\badductors keeps\b/gi, 'adductors keep'],
    [/\bcravings keeps\b/gi, 'cravings keep'],
    [/\bweeks and appetite keeps\b/gi, 'weeks and appetite keeps'],
    [/\bhours and appetite keeps\b/gi, 'hours and appetite keeps']
  ];
  for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement);
  return out;
}

function decorateNonQuestionTitle(text, category, postType, c) {
  return text;
}

function movementForPart(part) {
  if (['lats', 'upper-back', 'mid-back', 'rear-delts', 'biceps', 'forearms'].includes(part)) return 'pull work';
  if (['pecs', 'chest', 'triceps'].includes(part)) return 'pressing';
  if (['quads', 'glutes', 'hamstrings', 'adductors', 'calves'].includes(part)) return 'leg work';
  if (['abs'].includes(part)) return 'core work';
  if (['side-delts', 'shoulders'].includes(part)) return 'shoulder work';
  if (['traps'].includes(part)) return 'upper back work';
  return 'training';
}

function isCompatibleTitle(text) {
  const lower = String(text || '').toLowerCase();
  const bad = [
    /side delts on pull work/,
    /abs on pull work/,
    /quads on pull work/,
    /calves on pull work/,
    /adductors on pull work/,
    /hamstrings on pull work/,
    /shoulders on pull work/,
    /traps on pressing/,
    /abs on pressing/
  ];
  return !bad.some((pattern) => pattern.test(lower));
}

function titlePlausible(text) {
  const lower = String(text || '').toLowerCase();
  if (!isCompatibleTitle(lower)) return false;
  if (/(with wrist friendly only|with low energy nights|after rainy commute days)/.test(lower)) return false;
  if (/\b(and|with|after|during)\s+\1\b/.test(lower)) return false;
  if (/finally showed me why/.test(lower)) return false;
  return true;
}

function title(category, c, postType) {
  const question = {
    training: [
      { family: 'bodypart-normal', text: `are ${partLabel(c.part)} just genetics at some point` },
      { family: 'bodypart-helped', text: `what exercise finally made your ${partLabel(c.part)} grow` },
      { family: 'bodypart-feel', text: `anybody else suck at feeling ${partLabel(c.part)} on ${movementForPart(c.part)}` },
      { family: 'volume-question', text: `how much is too much for ${partLabel(c.part)}` },
      { family: 'is-this-normal', text: `is it normal that my ${partLabel(c.part)} ${partAreIs(c.part)} still behind` },
      { family: 'exercise-order', text: `should ${liftLabel(c.lift)} go before accessories` },
      { family: 'plateau-bench', text: `how long did it take your ${liftLabel(c.lift)} to move again` },
      { family: 'program-sucks', text: `when do you know your split just sucks` },
      { family: 'free-plan-grow', text: `free plan helped but my ${partLabel(c.part)} ${partAreIs(c.part)} still not moving` },
      { family: 'trainer-overthinking', text: `would a trainer actually help or am i overthinking this` },
      { family: 'volume-overthinking', text: `am i overthinking this or do i need more volume` },
      { family: 'normal-beginner', text: `is it normal to feel everything except ${partLabel(c.part)}` }
    ],
    nutrition: [
      { family: 'eat-more', text: `how are you guys eating enough without feeling gross` },
      { family: 'meal-timing', text: `does eating late actually matter for growth` },
      { family: 'weight-moving', text: `my weight is barely moving what would you change first` },
      { family: 'food-vs-coaching', text: `would coaching even help if calories are the real issue` },
      { family: 'appetite', text: `what actually helped your appetite on a bulk` },
      { family: 'meal-prep', text: `what do you eat when work kills your appetite` },
      { family: 'free-plan-food', text: `can the free plan work if food is dialed in` },
      { family: 'generic-food', text: `when do generic meal ideas stop being enough` },
      { family: 'size-moving', text: `what should i eat if size is moving too slow` },
      { family: 'cut-hunger', text: `how do you keep a cut from falling apart at night` }
    ],
    recovery: [
      { family: 'consistency', text: `how do you stay consistent when sleep is bad` },
      { family: 'skip-workouts', text: `what helps you stop skipping workouts every other week` },
      { family: 'recovery-normal', text: `is this level of soreness normal or am i doing too much` },
      { family: 'sleep-trash', text: `should i lower volume if sleep is trash this week` },
      { family: 'trainer-consistency', text: `do beginners actually need a trainer for accountability` },
      { family: 'free-plan-recovery', text: `free plan is fine but recovery still keeps messing me up` },
      { family: 'falling-off', text: `anyone else lose motivation after missing two days` },
      { family: 'normal-confusion', text: `how do you know if youre tired or just making excuses` },
      { family: 'deload-question', text: `how sore is too sore after ${pretty(c.block)}` },
      { family: 'routine-falling', text: `anyone else train hard for two weeks then disappear` }
    ],
    cutting: [
      { family: 'cut-muscle', text: `how do i keep muscle while trying to cut faster` },
      { family: 'weekend-cut', text: `why do cuts always fall apart on weekends` },
      { family: 'coach-cut', text: `should i get coaching if i keep losing consistency on a cut` },
      { family: 'cut-enough', text: `when does a generic cut stop being enough` },
      { family: 'life-messy', text: `can you get lean with free workouts if ${pretty(c.setting)} keeps messing things up` },
      { family: 'stalling-cut', text: `what should i change if my cut keeps stalling` },
      { family: 'accountability-cut', text: `is accountability worth it when fat loss gets hard` },
      { family: 'cut-normal', text: `is it normal for a cut to feel good one week and awful the next` },
      { family: 'meal-order', text: `does meal timing matter more on a cut or am i overthinking it` },
      { family: 'exercise-order-cut', text: `should cardio come after lifting if im trying to keep muscle` }
    ],
    bulking: [
      { family: 'gain-faster', text: `how can i gain weight faster with this program` },
      { family: 'trainer-free', text: `should i get a trainer or keep using the free plan` },
      { family: 'free-enough-big', text: `is the free training enough if im serious about getting bigger` },
      { family: 'switch-free', text: `when should someone switch from free workouts to a real plan` },
      { family: 'custom-bulk', text: `do i need a custom workout plan to bulk right` },
      { family: 'basic-enough', text: `how do you know when a basic plan stops being enough` },
      { family: 'arms-not-growing', text: `my arms still arent growing what would you change` },
      { family: 'chest-not-moving', text: `what should i do if my chest still isnt moving` },
      { family: 'free-plan-big', text: `can a free plan actually get you big if youre consistent` },
      { family: 'tailored-when', text: `at what point do you need something more tailored` }
    ],
    supplements: [
      { family: 'creatine-worth', text: `is creatine actually worth it` },
      { family: 'supp-food', text: `should i fix food first or buy more supplements` },
      { family: 'paying-coach', text: `can i still make progress without paying for coaching` },
      { family: 'free-basics', text: `does the free training cover enough if basics are handled` },
      { family: 'buying-worth', text: `what is actually worth buying for muscle gain` },
      { family: 'coach-vs-tub', text: `would coaching help more than another ${pretty(c.supp)} tub` },
      { family: 'basic-stuff', text: `how do i know if i need more than the basic stuff` },
      { family: 'moves-progress', text: `free plan is decent but what actually moves progress faster` },
      { family: 'online-coaching', text: `is online coaching worth it before buying more tubs` },
      { family: 'food-or-supps', text: `what matters more here food or supplements honestly` }
    ],
    lifestyle: [
      { family: 'stay-consistent', text: `how do you stay consistent with training when life gets busy` },
      { family: 'stop-skipping', text: `what helps you stop skipping workouts when the week gets messy` },
      { family: 'need-accountability', text: `do i need accountability to really grow` },
      { family: 'falling-off', text: `how do i stop falling off every few weeks` },
      { family: 'trainer-consistency', text: `should i get a trainer if consistency is my main problem` },
      { family: 'starting-over', text: `is online coaching worth it if i keep starting over` },
      { family: 'free-stay-locked', text: `free workouts helped but i still cant stay locked in` },
      { family: 'coaching-worth', text: `when is coaching actually worth paying for` },
      { family: 'discipline-or-help', text: `how do i know if i need accountability or just discipline` },
      { family: 'normal-motivation', text: `anyone else lose motivation after missing two days` }
    ]
  };
  const personal = {
    training: [
      { family: 'lift-finally', text: `${liftLabel(c.lift)} finally started moving again` },
      { family: 'split-cleaner', text: `${pretty(c.block)} feels way cleaner now` },
      { family: 'priority-helped', text: `putting ${partLabel(c.part)} first actually helped` },
      { family: 'timing-helped', text: `${pretty(c.constraint)} forced me to simplify and it helped` },
      { family: 'session-clicking', text: `training is finally starting to click again` }
    ],
    nutrition: [`${pretty(c.food)} is carrying my diet right now`, `${pretty(c.food2)} made meal prep way easier this week`, `simple food is saving me again`, `${pretty(c.food)} finally feels like a meal i can repeat`, `${pretty(c.appetite)} is still annoying but food got easier`],
    recovery: [`${pretty(c.tool)} helped my recovery more than expected`, `${pretty(c.issue)} finally calmed down this week`, `backing off made me realize i needed more recovery`, `${pretty(c.block)} felt way better after backing off`, `${pretty(c.issue)} was fatigue more than anything else`],
    cutting: [`${pretty(c.setting)} showed me what keeps ruining my cut`, `${pretty(c.food)} made this cut way easier to stick to`, `${pretty(c.hunger)} chilled out once i fixed meal timing`, `${pretty(c.deficit)} finally feels manageable`, `${pretty(c.meal)} was the part making the cut fall apart`],
    bulking: [`${pretty(c.food)} is the first bulk meal i dont hate`, `${pretty(c.setting)} made my bulk way sloppier than i thought`, `${pretty(c.bulk)} showed up right when the scale got moving`, `${pretty(c.food2)} made calories easier this week`, `${pretty(c.surplus)} feels better when dinner is planned`],
    supplements: [`${pretty(c.stack)} got cut in half and i barely noticed`, `${pretty(c.supp)} is the only tub i keep reaching for`, `${pretty(c.supp2)} is probably getting dropped`, `${pretty(c.stack)} looked useful until i actually audited it`, `${pretty(c.supp)} still feels like the only obvious keeper`],
    lifestyle: [`${pretty(c.planner)} works until ${pretty(c.routine)} shows up`, `${pretty(c.setting)} keeps exposing the weak part of my week`, `${pretty(c.routine)} was quietly ruining everything`, `${pretty(c.planner)} got simpler and consistency improved fast`, `simplifying the week made a bigger difference than i expected`]
  };
  const advice = {
    training: [
      `${pretty(c.block)} and what would you fix first`,
      `should ${liftLabel(c.lift)} come earlier in the session`,
      `would you change volume or exercise order here`,
      `what would you fix in this split first`,
      `am i doing too much for ${partLabel(c.part)} or not enough`
    ],
    nutrition: [`${pretty(c.food)} setup and what would you change first`, `${pretty(c.appetite)} keeps ruining dinner what would you fix`, `${pretty(c.setting)} and should i just lower variety`, `${pretty(c.food2)} vs ${pretty(c.food)} for busy days`, `${pretty(c.meal)} and how would you make this easier`],
    recovery: [`${pretty(c.issue)} and would you deload now or wait`, `${pretty(c.tool)} in place and recovery still off`, `${pretty(c.setting)} and what would you change first`, `${pretty(c.issue)} plus mid sleep what would you fix`, `${pretty(c.block)} and i think volume is too high maybe`],
    cutting: [`${pretty(c.hunger)} at night and what would you change`, `${pretty(c.deficit)} plus busy days what would you fix first`, `${pretty(c.setting)} and should i clean weekends up first`, `${pretty(c.food)} setup and how would you make it easier`, `${pretty(c.meal)} and this cut still feels sloppy`],
    bulking: [`${pretty(c.bulk)} showing up and what would you change`, `${pretty(c.food)} setup and should i add liquid calories`, `${pretty(c.setting)} and appetite keeps dropping`, `${pretty(c.surplus)} from here or would you hold it`, `${pretty(c.food2)} helping but the bulk still feels messy`],
    supplements: [`${pretty(c.stack)} and what would you drop first`, `${pretty(c.supp)} staying but the rest feels questionable`, `${pretty(c.supp2)} worth keeping in this stack or no`, `${c.caffeine}mg and pre workout every day too much maybe`, `${pretty(c.stack)} and what would you actually spend money on`],
    lifestyle: [`${pretty(c.routine)} by friday and what would you change`, `${pretty(c.setting)} and how would you simplify this week`, `${pretty(c.planner)} helping but not enough what would you fix`, `${pretty(c.routine)} keeps breaking the routine what would you do`, `${pretty(c.setting)} and i need a lower friction version of this`]
  };
  const casual = {
    training: ['bulgarian split squats still feel illegal', 'low sleep and squats was a dumb combo', 'gym was packed and i almost left', 'forgot my headphones and still had a solid session', 'garage gym mornings hit different'],
    nutrition: ['meal prep is just doing dishes forever', 'eating enough is way harder than the workout', 'protein is easy until the week gets busy', 'appetite disappeared right when i needed it most', 'i am tired of washing containers again'],
    recovery: ['my body wants a day off and i agree', 'sleep debt is undefeated this week', 'recovery somehow feels harder than training right now', 'still sore and pretending thats fine', 'did not realize fatigue could stack this fast'],
    cutting: ['cuts are fun until dinner hits', 'hunger is annoying me today', 'the cut is testing my patience now', 'weekends make every cut feel fake', 'low calories and errands is a terrible combo'],
    bulking: ['bulking is fun until appetite disappears', 'already tired of eating this much', 'the scale is moving and so is my grocery bill', 'trying to bulk without feeling gross is a full time job', 'liquid calories are saving me right now'],
    supplements: ['my stack is getting out of hand again', 'still cant tell if this tub matters', `${c.caffeine}mg is carrying this week`, 'supplement shelves still feel like a scam', 'creatine is the only thing i trust at this point'],
    lifestyle: ['busy week but i still got sessions in', 'trying to stay consistent without making this my whole life', 'routine felt solid until real life showed up', 'missed one day and almost let the whole week go', 'getting back in rhythm is harder than starting']
  };
  const pools = { question, personal, advice, casual };
  const selected = pick(pools[postType][category]);
  if (typeof selected === 'string') {
    const varied = decorateNonQuestionTitle(selected, category, postType, c);
    const finalText = fixGrammar(applyCaptionImperfection(varied));
    if (!titlePlausible(finalText)) return title(category, c, postType);
    return { text: finalText, family: `${category}-${postType}` };
  }
  const finalText = fixGrammar(applyCaptionImperfection(selected.text));
  if (!titlePlausible(finalText)) return title(category, c, postType);
  return { text: finalText, family: `${category}-${postType}-${selected.family}` };
}

function specificPartBodies(part) {
  const label = partLabel(part);
  const map = {
    traps: ['i mostly do rows and deadlifts so im not sure if direct shrug work is the missing part or not.', 'not sure if i need carries shrugs or just more upper back volume.'],
    calves: ['calves are the one thing i cant tell whether its frequency genetics or just bad reps.', 'i can train them hard and still have no idea if i should be doing more stretch work or just more days.'],
    quads: ['i feel glutes on a lot of lower body stuff so im not sure if quad stimulus is just getting lost.', 'trying to figure out if this is more of a squat pattern issue or a leg press and split squat issue.'],
    hamstrings: ['i do hinge work but im not sure if my glutes are taking over too much.', 'trying to figure out if i need more rdls curls or just better tempo.'],
    'side-delts': ['part of me thinks i just need better lateral raise execution and more shoulder frequency.', 'not sure if this is a volume issue or me letting traps take over every raise.'],
    shoulders: ['part of me thinks the problem is shoulder work quality not just more pressing.', 'trying to figure out if i need more direct raises or just better execution.'],
    biceps: ['i get plenty of pulling in but i still cant tell if curls are too random or just not progressing.', 'trying to figure out if arm work needs to go earlier or if im just being impatient.'],
    triceps: ['i press a decent amount already so i cant tell if i need more direct triceps work or better exercise choice.', 'trying to figure out if extensions are enough or if stronger close grip pressing matters more.'],
    lats: ['i do enough pulling on paper but i still dont know if the actual back stimulus is there.', 'trying to figure out whether this is frequency exercise selection or just bad lat engagement.'],
    'upper-back': ['rows are in the plan but i still cant tell if im actually training upper back well enough.', 'not sure if i need more chest supported work or just better setup on rows.'],
    'mid-back': ['i have rows in the week already but i cant tell if im actually loading mid back or just moving weight.', 'trying to figure out if better row stability would matter more than more sets.'],
    pecs: ['pressing is there already so im trying to figure out if the problem is chest stimulus and not just more work.', 'not sure if incline work fly work or better setup on presses is what i actually need.'],
    'upper-chest': ['flat pressing moves okay but i still cant tell if upper chest needs more incline volume or better execution.', 'trying to figure out if i should put incline first or just give it more time.'],
    abs: ['im not sure if this is a bracing issue or if i just need more direct ab work.', 'trying to figure out if compounds should be enough here or if i need dedicated core work.'],
    adductors: ['not sure if this is a squat pattern thing or if i need actual adductor work in the week.', 'trying to figure out if leg work is enough for this or if im ignoring a weak spot.'],
    forearms: ['not sure if this is grip strength carrying over slowly or if i actually need direct forearm work.', 'trying to figure out whether pulling is enough for this or not.'],
    glutes: ['i can feel glutes on some lifts but progress still looks slow and i dont know if thats just patience.', 'trying to figure out if this is more of a hip thrust issue or overall lower body setup.']
  };
  return map[part] || [`trying to figure out if ${label} need more direct work or just better progression.`, `not sure if this is a volume problem or an exercise selection problem.`];
}

function specificQuestionBody(category, c, titleInfo) {
  if (category !== 'training') return null;
  const family = titleInfo.family || '';
  if (/bodypart-normal|bodypart-helped|free-plan-grow|bodypart-feel|volume-question|is-this-normal/.test(family)) {
    const lines = specificPartBodies(c.part);
    return { text: fixGrammar(applyCaptionImperfection(pick(lines))), styleKey: `${category}-${family}-specific`, mentionsFree: /free-plan-grow/.test(family) };
  }
  if (/exercise-order/.test(family)) {
    const lines = [
      `part of me thinks ${liftLabel(c.lift)} needs to go earlier because by the end of the session im kind of cooked.`,
      `trying to figure out whether exercise order is the actual issue or if im just looking for a cleaner excuse.`,
      `not sure if ${liftLabel(c.lift)} should go first or if i just need to progress it harder where it is now.`
    ];
    return { text: fixGrammar(applyCaptionImperfection(pick(lines))), styleKey: `${category}-${family}-specific`, mentionsFree: false };
  }
  return null;
}

function body(category, c, postType, titleInfo) {
  const questionBodies = {
    training: [
      { key: 'frustrated-short', free: false, lines: ['my progress is decent overall but this one area is still lagging and its starting to piss me off.'] },
      { key: 'progress-but-lagging', free: true, lines: ['overall the free workouts were better than the random stuff i was doing before.', 'problem is one area is still behind and i cant tell what to change next.'] },
      { key: 'confused-beginner', free: false, lines: ['still pretty new to lifting so i cant tell if this is normal or if im doing something wrong.'] },
      { key: 'plateau', free: false, lines: ['everything else is moving okay but this one lift or body part has been stuck for weeks.', 'trying to figure out whether thats normal or if i need to change something.'] },
      { key: 'customization', free: false, lines: ['at what point does a basic plan stop being enough and you need something more tailored?', 'thats basically what im trying to figure out.'] },
      { key: 'consistency-blame', free: false, lines: ['honestly could just be me not pushing hard enough.', 'just wanted to ask before i keep spinning my wheels.'] },
      { key: 'schedule-context', free: false, lines: ['my schedule has been all over the place lately so i cant tell if recovery is the problem or the actual training.'] },
      { key: 'comparison', free: false, lines: ['feels like everyone else grows this faster than me and im trying to figure out what im missing.'] },
      { key: 'coaching-curiosity', free: false, lines: ['not against paying for help.', 'i just dont know if im actually at the point where a trainer would make a difference.'] },
      { key: 'positive-free', free: true, lines: ['the free workouts honestly got me out of doing random dumb stuff.', 'im not complaining about that at all. just trying to figure out what to change next.'] },
      { key: 'normal-check', free: false, lines: ['mostly trying to figure out whether this is normal or if im wasting time by leaving it alone.'] },
      { key: 'exercise-order', free: false, lines: ['part of me thinks the problem is exercise order more than effort.', 'not sure if thats a real issue or me overthinking it.'] },
      { key: 'life-context', free: false, lines: ['between work and training after dark i cant always tell if im under recovering or just impatient.'] }
    ],
    nutrition: [
      { key: 'frustrated-short', free: false, lines: ['food is way better than it used to be but size still isnt moving the way i expected.'] },
      { key: 'progress-but-lagging', free: true, lines: ['free plan was actually better than the random stuff i was doing before.', 'still feels like im missing something if i want faster growth.'] },
      { key: 'confused-beginner', free: false, lines: ['still pretty new so i cant tell if this is just me being impatient or if food actually needs to change.'] },
      { key: 'plateau', free: false, lines: ['weight is basically flat and i feel like i should be moving faster by now.'] },
      { key: 'customization', free: false, lines: ['trying to figure out if this is where generic advice stops helping and something more tailored matters.'] },
      { key: 'consistency-blame', free: false, lines: ['could also just be me not eating as hard as i think i am.'] },
      { key: 'schedule-context', free: false, lines: ['my week gets messy fast so i cant tell if the issue is calories or just life.'] },
      { key: 'comparison', free: false, lines: ['feels like everyone else gains size faster even when their food looks worse than mine.'] },
      { key: 'coaching-curiosity', free: false, lines: ['not against paying for help if it actually speeds things up.', 'just dont know if im there yet.'] },
      { key: 'positive-free', free: true, lines: ['the free setup cleaned up a lot of dumb stuff i was doing.', 'just want to know what the next step is now.'] },
      { key: 'neutral-detail', free: false, lines: ['mostly trying to figure out if i need more food, more time, or a better plan.'] },
      { key: 'appetite-context', free: false, lines: ['my appetite is all over the place during the week so i cant tell if the issue is calories or just inconsistency.'] },
      { key: 'work-context', free: false, lines: ['work has been busy enough that some days i barely feel hungry until late.', 'trying to figure out if thats the whole problem.'] }
    ],
    recovery: [
      { key: 'frustrated-short', free: false, lines: ['recovery is honestly the part that keeps making this feel harder than it should.'] },
      { key: 'progress-but-lagging', free: true, lines: ['the free training gave me some structure.', 'i still fall off when recovery gets weird though.'] },
      { key: 'confused-beginner', free: false, lines: ['dont know if this is normal or if im missing something obvious.'] },
      { key: 'plateau', free: false, lines: ['when progress slows down this is usually the part i cant figure out.'] },
      { key: 'customization', free: false, lines: ['starting to wonder if this is where a more tailored plan actually matters.'] },
      { key: 'consistency-blame', free: false, lines: ['could just be me not sleeping enough and then blaming the plan.'] },
      { key: 'schedule-context', free: false, lines: ['my schedule has been all over the place lately so i dont know what to blame first.'] },
      { key: 'comparison', free: false, lines: ['feels like other people can miss sleep for a week and still train fine.'] },
      { key: 'coaching-curiosity', free: false, lines: ['if this is the kind of thing a coach would catch faster then maybe thats worth it.'] },
      { key: 'positive-free', free: true, lines: ['free plan is fine for getting me in the gym.', 'im just not sure it solves the recovery side once life gets messy.'] },
      { key: 'neutral-detail', free: false, lines: ['i mostly want to know if i should back off or stay the course.'] },
      { key: 'soreness-check', free: false, lines: ['the hard part is i cant tell whether im just normal sore or actually digging a hole.'] },
      { key: 'sleep-context', free: false, lines: ['sleep has been hit or miss and i dont know how much that should change the plan.'] }
    ],
    cutting: [
      { key: 'frustrated-short', free: false, lines: ['fat loss is moving but not cleanly and im getting annoyed with it.'] },
      { key: 'progress-but-lagging', free: true, lines: ['free plan helped me stop doing completely random stuff.', 'still feels like i need a better answer for the hard parts of cutting.'] },
      { key: 'confused-beginner', free: false, lines: ['i cant tell if this is normal cut frustration or if im making an obvious mistake.'] },
      { key: 'plateau', free: false, lines: ['this feels stalled even though i thought i was doing enough.'] },
      { key: 'customization', free: false, lines: ['trying to figure out when generic cut advice stops being enough.'] },
      { key: 'consistency-blame', free: false, lines: ['could just be me falling off at the worst times honestly.'] },
      { key: 'schedule-context', free: false, lines: ['my week gets chaotic and the whole cut gets shaky fast.'] },
      { key: 'comparison', free: false, lines: ['feels like everyone else gets leaner faster than i do with the same effort.'] },
      { key: 'coaching-curiosity', free: false, lines: ['if accountability is the missing part i could see coaching being useful.'] },
      { key: 'positive-free', free: true, lines: ['the free setup gave me a decent base.', 'just feels like im past the point where a generic cut layout solves everything.'] },
      { key: 'neutral-detail', free: false, lines: ['mostly trying to decide whether i need a better plan or better execution.'] },
      { key: 'social-context', free: false, lines: ['weekends are where everything falls apart for me so im trying to fix that without making the whole cut miserable.'] },
      { key: 'normal-check', free: false, lines: ['not sure if this is just normal cut frustration or if im doing something obviously wrong.'] }
    ],
    bulking: [
      { key: 'frustrated-short', free: false, lines: ['im doing okay overall but size is not coming on as fast as i thought it would.'] },
      { key: 'progress-but-lagging', free: true, lines: ['free training got me more consistent for sure.', 'i just want faster results now and cant tell what the bottleneck is.'] },
      { key: 'confused-beginner', free: false, lines: ['still not advanced enough to know if this is normal or if im wasting time.'] },
      { key: 'plateau', free: false, lines: ['weight or strength has been stuck long enough that im starting to question the setup.'] },
      { key: 'customization', free: false, lines: ['at some point i assume a basic plan stops being enough for size.', 'just dont know if im there yet.'] },
      { key: 'consistency-blame', free: false, lines: ['could just be me not eating or training hard enough and looking for a better answer than that.'] },
      { key: 'schedule-context', free: false, lines: ['my schedule is messy enough that i cant tell whether the issue is recovery or the plan itself.'] },
      { key: 'comparison', free: false, lines: ['feels like everyone else gets bigger faster and im trying to figure out why.'] },
      { key: 'coaching-curiosity', free: false, lines: ['not against paying for help if it means i stop second guessing everything.'] },
      { key: 'positive-free', free: true, lines: ['the site honestly got me out of random training.', 'just feels like i might need more structure now if im serious about getting bigger.'] },
      { key: 'neutral-detail', free: false, lines: ['mostly trying to figure out whether to stay patient or get more specific.'] },
      { key: 'friend-comparison', free: false, lines: ['guys i train with seem to put on size faster than i do and im trying not to do something stupid just because of that.'] },
      { key: 'age-context', free: false, lines: ['ive only been training seriously for a bit over a year so i dont know if this pace is normal or slow.'] }
    ],
    supplements: [
      { key: 'frustrated-short', free: false, lines: ['i cant tell if im solving the wrong problem with supplements.'] },
      { key: 'progress-but-lagging', free: true, lines: ['free plan helped me stop doing random stuff.', 'still not sure what actually moves progress faster from here.'] },
      { key: 'confused-beginner', free: false, lines: ['hard to tell if i need better food, a better plan, or literally less overthinking.'] },
      { key: 'plateau', free: false, lines: ['progress feels stuck enough that im looking everywhere for what im missing.'] },
      { key: 'customization', free: false, lines: ['maybe this is where generic advice stops helping and specifics matter more.'] },
      { key: 'consistency-blame', free: false, lines: ['could just be me wanting an easy fix instead of doing the boring work better.'] },
      { key: 'schedule-context', free: false, lines: ['routine gets chaotic and then i start wondering if i need more structure.'] },
      { key: 'comparison', free: false, lines: ['feels like everybody else knows exactly what matters and i still dont.'] },
      { key: 'coaching-curiosity', free: false, lines: ['if a coach would just tell me what not to waste time on that might be worth it.'] },
      { key: 'positive-free', free: true, lines: ['free stuff is a good base honestly.', 'im just trying to figure out if the next step is programming or not supplements at all.'] },
      { key: 'neutral-detail', free: false, lines: ['mostly trying to figure out what actually matters before spending more money.'] },
      { key: 'confused-stack', free: false, lines: ['feels like im one youtube video away from buying nonsense again so im trying to slow down and ask first.'] },
      { key: 'shortcut-check', free: false, lines: ['i dont want to waste time on expensive shortcuts if the boring basics are still the answer.'] }
    ],
    lifestyle: [
      { key: 'frustrated-short', free: false, lines: ['consistency is still the thing i cant get fully under control.'] },
      { key: 'progress-but-lagging', free: true, lines: ['free workouts helped because at least im not training randomly anymore.', 'i still keep falling off once life gets noisy though.'] },
      { key: 'confused-beginner', free: false, lines: ['i cant tell if this is just normal beginner inconsistency or if i need more accountability.'] },
      { key: 'plateau', free: false, lines: ['every time progress slows down it feels like the routine falls apart right after.'] },
      { key: 'customization', free: false, lines: ['starting to wonder if a basic setup just stops being enough once life gets busier.'] },
      { key: 'consistency-blame', free: false, lines: ['could just be discipline. i know that. just trying to be honest about it.'] },
      { key: 'schedule-context', free: false, lines: ['my schedule has been everywhere lately so i dont know what part is actually failing.'] },
      { key: 'comparison', free: false, lines: ['feels like other people can stay locked in way easier than i can.'] },
      { key: 'coaching-curiosity', free: false, lines: ['if a coach would mostly help with accountability then maybe thats what i need.'] },
      { key: 'positive-free', free: true, lines: ['the free workouts are better than the random stuff i was doing before.', 'i just cant tell whether consistency is the real issue now.'] },
      { key: 'neutral-detail', free: false, lines: ['mostly trying to figure out if i need more structure or just better habits.'] },
      { key: 'kids-work', free: false, lines: ['between work and family stuff my week gets weird fast, so i need something that doesnt fall apart every time life gets busy.'] },
      { key: 'gym-confidence', free: false, lines: ['half of this is probably just me getting in my own head after missing a few days.'] }
    ]
  };
  const bodies = {
    training: {
      question: questionBodies.training,
      personal: ['Finally feels like I can see what was going wrong instead of just guessing every week.', 'I did not change a ton, but the small adjustment made the whole week feel cleaner.', 'Still early, but this is the first time the setup has felt sustainable.'],
      advice: ['Mostly posting this because the simple fixes usually work better than people think.', 'If I was starting over I would clean up the boring stuff first.', 'This is one of those things that feels more complicated than it needs to be.'],
      casual: ['No deep lesson here. Just one of those gym thoughts you have mid week.', 'Posting this because I know I am not the only one who deals with it.', 'Some gym problems are not serious, just annoying enough to be funny.']
    },
    nutrition: {
      question: questionBodies.nutrition,
      personal: ['This was one of those changes that made dieting feel easier without making it feel strict.', 'The food is nothing special, it is just repeatable enough that I keep doing it.', 'I keep trying more interesting meals and then end up back here because it works.'],
      advice: ['I think most people would be better off repeating one decent meal instead of chasing perfect variety.', 'If the plan only works when life is calm, the food setup is probably too complicated.', 'Simple meals are boring, but boring is usually what keeps the week on track.'],
      casual: ['No clue why food gets harder the second the week gets busy.', 'Meal prep really is just doing dishes forever.', 'Eating enough protein is way less glamorous than people make it sound.']
    },
    recovery: {
      question: questionBodies.recovery,
      personal: ['The fix was a lot less exciting than I wanted it to be.', 'I kept calling it motivation until I finally admitted it was just fatigue.', 'A lighter week helped more than another recovery gadget did.'],
      advice: ['A lot of recovery issues are just stress showing up in training clothes.', 'Sometimes the answer really is sleep, food, and one less hard set.', 'Recovery gets easier once you stop treating every week like a max effort block.'],
      casual: ['Recovery is somehow harder than training this week.', 'My body wants a day off and I respect that.', 'Sleep debt is still undefeated.']
    },
    cutting: {
      question: questionBodies.cutting,
      personal: ['The scale was not the issue. My routine was.', 'This got easier once I stopped trying to diet perfectly every single day.', 'I finally found the part of the cut that kept wrecking my weekends.'],
      advice: ['If your cut falls apart at night, the problem probably started earlier in the day.', 'A smaller deficit you can repeat usually beats the aggressive one you keep breaking.', 'Cuts feel way less miserable when the meals are boring on purpose.'],
      casual: ['Cuts are fun until dinner hits.', 'Hunger is annoying me today.', 'The cut is testing my patience now.']
    },
    bulking: {
      question: questionBodies.bulking,
      personal: ['This bulk is going better now that dinner is not random.', 'I thought appetite would be the easy part and was very wrong.', 'The training is fun. Eating enough without feeling gross is the real skill.'],
      advice: ['A clean boring bulk is usually better than a sloppy fun one.', 'If appetite disappears, meal timing matters more than people want to admit.', 'One reliable calorie dense meal does more than trying to freestyle the whole day.'],
      casual: ['Bulking is fun until appetite disappears.', 'I am already tired of eating this much.', 'The scale is moving and so is my grocery bill.']
    },
    supplements: {
      question: questionBodies.supplements,
      personal: ['Cutting the stack down was less dramatic than I expected.', 'Most of the tubs looked useful until I actually paid attention.', 'I keep coming back to the same one or two things and ignoring the rest.'],
      advice: ['Most people would be fine with fewer tubs and better groceries.', 'If you cannot explain why it is in the stack, it probably does not need to be there.', 'The basic stuff covers more than most people want to hear.'],
      casual: ['My stack is getting out of hand again.', 'I still cannot tell if this tub matters.', 'Supplement shelves are a scam sometimes.']
    },
    lifestyle: {
      question: questionBodies.lifestyle,
      personal: ['This finally clicked once the setup got more boring.', 'I kept thinking I needed motivation when I really needed less friction.', 'One small routine fix carried more than I expected.'],
      advice: ['If the system falls apart on a busy week, the system probably needs simplifying.', 'The routine should survive a normal thursday, not just a perfect monday.', 'Making things easier usually works better than trying harder.'],
      casual: ['Routine felt solid until real life showed up.', 'Busy week but i still got sessions in.', 'Trying to stay consistent without making this my whole life.']
    }
  };
  const specific = specificQuestionBody(category, c, titleInfo || {});
  if (specific) return specific;
  const pool = bodies[category][postType];
  if (postType === 'question') {
    const archetype = pick(pool);
    return {
      text: fixGrammar(applyCaptionImperfection(archetype.lines.join(' '))),
      styleKey: `${category}-${archetype.key}`,
      mentionsFree: archetype.free
    };
  }
  return {
    text: fixGrammar(applyCaptionImperfection(shuffle(pool).slice(0, rand() < 0.68 ? 1 : rand() < 0.88 ? 2 : 3).join(' '))),
    styleKey: `${category}-${postType}`,
    mentionsFree: false
  };
}

const scopeMap = { training: 'training', nutrition: 'nutrition', recovery: 'recovery', cutting: 'nutrition', bulking: 'nutrition', supplements: 'nutrition', lifestyle: 'training' };

function score(category, image) {
  const span = {
    training: [12, 96],
    nutrition: [8, 78],
    recovery: [4, 52],
    cutting: [10, 84],
    bulking: [8, 72],
    supplements: [3, 36],
    lifestyle: [3, 44]
  }[category] || [3, 40];
  const base = int(span[0], span[1]) + (image ? int(0, 12) : 0);
  const comments = int(3, 7);
  const views = clamp(int(90, 1280) + comments * int(12, 44), 90, 1480);
  const saves = clamp(int(2, 25), 2, 25);
  return { score: clamp(base, 3, 120), comments, views, saves };
}

function ageMinutes() {
  const roll = rand();
  if (roll < 0.1) return int(0, 12);
  if (roll < 0.24) return int(13, 59);
  if (roll < 0.54) return int(60, 60 * 8);
  if (roll < 0.8) return int(60 * 8, 60 * 24);
  if (roll < 0.94) return int(60 * 24, 60 * 48);
  return int(60 * 48, 60 * 24 * 6);
}

function titlePattern(post) {
  const text = String(post.title || '').toLowerCase();
  if (post.titleFamily) return post.titleFamily;
  if (/how can i grow|how do i grow|bring up my|grow the fastest/.test(text)) return 'grow-x';
  if (/free plan|free training|free workouts|site/.test(text)) return 'free-plan';
  if (/trainer|coaching|custom plan|custom workout|basic program/.test(text)) return 'coach-custom';
  if (/hasnt gone up|stuck|plateau|stalled/.test(text)) return 'plateau';
  return 'other';
}

function recentWindowOk(post, posts) {
  const window = posts.slice(-25);
  if (window.some((item) => item.title === post.title)) return false;
  const pattern = titlePattern(post);
  const samePatternCount = window.filter((item) => titlePattern(item) === pattern).length;
  if (samePatternCount >= 1 && /bodypart-normal|bodypart-helped|is-this-normal|plateau-bench|free-plan-grow|trainer-overthinking|free-plan|coach-custom|plateau/.test(pattern)) return false;
  if (pattern === 'grow-x' && samePatternCount >= 2) return false;
  if (pattern === 'free-plan' && samePatternCount >= 2) return false;
  if (pattern === 'coach-custom' && samePatternCount >= 2) return false;
  if (pattern === 'plateau' && samePatternCount >= 2) return false;

  if (post.postType === 'question') {
    const freeMentions = window.filter((item) => item.postType === 'question' && item.mentionsFree).length;
    if (post.mentionsFree && freeMentions >= 1) return false;

    const sameStyle = posts.slice(-20).filter((item) => item.postType === 'question' && item.bodyStyle === post.bodyStyle).length;
    if (sameStyle >= 1) return false;
  } else {
    const sameStyle = posts.slice(-20).filter((item) => item.postType === post.postType && item.bodyStyle === post.bodyStyle).length;
    if (sameStyle >= 2) return false;
  }

  return true;
}

function imageSlots(total, target) {
  return new Set(shuffle(Array.from({ length: total }, (_, i) => i)).slice(0, target));
}

function candidate(index, slots, postTypes) {
  const category = pick(weighted);
  const c = ctx(category);
  const postType = postTypes[index] || pickPostType();
  const image = slots.has(index);
  const stats = score(category, image);
  const minutesAgo = ageMinutes();
  const hour = int(0, 23);
  const minute = int(0, 59);
  const id = `forum-post-${String(index + 1).padStart(4, '0')}`;
  const postTitle = title(category, c, postType);
  const postBody = body(category, c, postType, postTitle);
  return {
    id,
    slug: slug(postTitle.text).slice(0, 96),
    community: pick(cfg[category].communities),
    scope: scopeMap[category] || 'training',
    category,
    author: generateUsername(),
    format: image ? 'image' : 'text',
    postType,
    title: postTitle.text,
    titleFamily: postTitle.family,
    body: postBody.text,
    bodyStyle: postBody.styleKey,
    mentionsFree: postBody.mentionsFree,
    imageUrl: null,
    imageAlt: null,
    imageSource: null,
    imageCreator: null,
    imageLicense: null,
    imageLicenseUrl: null,
    imagePageUrl: null,
    tags: cfg[category].tags,
    score: stats.score,
    comments: stats.comments,
    viewCount: stats.views,
    saveCount: stats.saves,
    ageMinutes: minutesAgo,
    preferredHourLocal: hour,
    preferredMinuteLocal: minute,
    preferredWindow: hour < 11 ? 'morning' : hour < 17 ? 'afternoon' : 'evening',
    botSource: 'seeded-forum-generator',
    isSeeded: true,
    _c: c
  };
}

function useable(post, seenTitles, seenBodies, seenGrams) {
  if (post.postType === 'question' && seenTitles.has(post.title)) return false;
  if (!titlePlausible(post.title)) return false;
  return true;
}

function commit(post, seenTitles, seenBodies, seenGrams) {
  seenTitles.add(post.title);
  grams(post.title).forEach((gram) => seenGrams.add(gram));
}

function generate() {
  const posts = [];
  const seenTitles = new Set();
  const seenBodies = new Set();
  const seenGrams = new Set();
  const slots = imageSlots(TOTAL, IMAGE_TARGET);
  const postTypes = buildPostTypeSchedule(TOTAL);
  let attempts = 0;
  while (posts.length < TOTAL && attempts < TOTAL * 500) {
    attempts += 1;
    const post = candidate(posts.length, slots, postTypes);
    if (!useable(post, seenTitles, seenBodies, seenGrams)) continue;
    if (!recentWindowOk(post, posts)) continue;
    commit(post, seenTitles, seenBodies, seenGrams);
    posts.push(post);
  }
  if (posts.length !== TOTAL) {
    const probe = candidate(posts.length, slots, postTypes);
    const conflict = grams(probe.title).find((gram) => seenGrams.has(gram));
    throw new Error(`Only generated ${posts.length} posts after ${attempts} attempts. Sample conflict: ${conflict}`);
  }
  return posts;
}

async function openverse(query, page) {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.searchParams.set('q', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(OPENVERSE_PAGE));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'odeology-forum-generator/1.0' } });
    if (res.ok) return res.json();
    if ([400, 401, 403, 404, 422].includes(res.status)) {
      return { results: [] };
    }
    if (![429, 500, 502, 503, 504].includes(res.status)) {
      return { results: [] };
    }
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  return { results: [] };
}

function okImage(item) {
  return item && item.id && item.url && OPEN_LICENSES.has(String(item.license || '').toLowerCase()) && !item.mature && Number(item.width || 0) >= 400 && Number(item.height || 0) >= 400;
}

class Finder {
  constructor() {
    this.queries = new Map();
    this.used = new Set();
    this.requests = 0;
  }

  async fromQuery(query) {
    if (!query) return null;
    const key = norm(query);
    if (!key) return null;
    let state = this.queries.get(key);
    if (!state) {
      state = { page: 1, index: 0, results: [], done: false };
      this.queries.set(key, state);
    }
    while (true) {
      while (state.index < state.results.length) {
        const item = state.results[state.index];
        state.index += 1;
        if (!okImage(item) || this.used.has(item.id)) continue;
        this.used.add(item.id);
        return item;
      }
      if (state.done || state.page > OPENVERSE_MAX) return null;
      const payload = await openverse(key, state.page);
      this.requests += 1;
      state.page += 1;
      state.index = 0;
      state.results = Array.isArray(payload.results) ? payload.results : [];
      if (!state.results.length) state.done = true;
    }
  }

  async take(list) {
    for (const query of uniq(list.map(norm))) {
      const item = await this.fromQuery(query);
      if (item) return item;
    }
    return null;
  }
}

function imageQueries(post) {
  const c = post._c || {};
  const titleText = String(post.title || '').toLowerCase();
  const titleTerms = words(post.title).filter((word) => word.length > 2).slice(0, 3).join(' ');
  const intent = detectImageIntent(post);
  const byIntent = {
    chest: ['bench press gym', 'chest press machine', 'incline bench press', 'barbell bench gym'],
    back: ['lat pulldown gym', 'pull up gym', 'barbell row gym', 'back mirror gym'],
    shoulders: ['lateral raise gym', 'shoulder dumbbell raise', 'rear delt machine gym', 'dumbbell shoulder workout'],
    arms: ['dumbbell curl gym', 'tricep pushdown gym', 'arm flex mirror gym', 'preacher curl gym'],
    legs: ['squat rack gym', 'leg press gym', 'split squat gym', 'hamstring curl gym'],
    core: ['ab wheel gym', 'cable crunch gym', 'core workout gym', 'plank gym'],
    food: ['meal prep containers', 'high protein meal prep', 'healthy meal prep', 'protein meal'],
    planning: ['workout notebook gym', 'phone notes gym workout', 'fitness planner notebook', 'workout log notebook'],
    general: ['gym mirror selfie', 'gym floor scene', 'barbell plates gym', 'crowded gym']
  };
  const contextual = {
    training: [`${c.lift} workout`, `${c.part} gym`],
    nutrition: [`${c.food} meal prep`, `${c.food2} healthy meal`, `${c.meal} protein meal`],
    recovery: [`${c.issue} stretching`, `${c.tool} recovery`, `${c.block} mobility`],
    cutting: [`${c.food} low calorie meal`, `${c.food2} lean meal`, `${c.meal} healthy meal`],
    bulking: [`${c.food} high calorie meal`, `${c.food2} bodybuilding meal`, `${c.meal} protein meal`],
    supplements: [`${c.supp} shaker`, `${c.supp2} supplement`, 'gym bag supplements'],
    lifestyle: [`${c.planner} planner`, 'fitness planner notebook', 'crowded gym']
  };
  const intentFallback = {
    chest: ['gym mirror selfie', 'workout notebook gym'],
    back: ['gym mirror selfie', 'barbell plates gym'],
    shoulders: ['gym mirror selfie', 'workout notebook gym'],
    arms: ['gym mirror selfie', 'barbell plates gym'],
    legs: ['gym rack platform', 'barbell plates gym'],
    core: ['gym mirror selfie', 'workout notebook gym'],
    food: ['meal prep containers', 'protein meal'],
    planning: ['fitness planner notebook', 'phone notes gym workout'],
    general: ['gym mirror selfie', 'barbell plates gym']
  };
  return uniq([...(byIntent[intent] || byIntent.general), ...(contextual[post.category] || []), ...(intentFallback[intent] || []), titleTerms]);
}

function detectImageIntent(post) {
  const text = `${post.title || ''} ${post.body || ''}`.toLowerCase();
  if (/\b(meal|diet|protein|prep|food|calorie|calories|appetite|bulk|cut)\b/.test(text)) return 'food';
  if (/\b(trainer|coaching|custom|accountability|notebook|planner|split|exercise order)\b|free plan|free training|free workouts/.test(text)) return 'planning';
  if (/\b(pecs?|chest|bench|incline|pressing?)\b/.test(text)) return 'chest';
  if (/\b(lats?|back|rows?|pull up|pullups|upper back|mid back)\b/.test(text)) return 'back';
  if (/\b(side delts?|rear delts?|shoulders?|lateral raises?)\b/.test(text)) return 'shoulders';
  if (/\b(quads?|hamstrings?|glutes?|calves|adductors?|leg press|split squat|squats?|rdl|hip thrust|leg curl)\b/.test(text)) return 'legs';
  if (/\b(biceps|triceps|arms|curls?|pushdowns?|forearms?)\b/.test(text)) return 'arms';
  if (/\b(abs|core|brace|bracing)\b/.test(text)) return 'core';
  return 'general';
}

function broadImageQueries(category) {
  const map = {
    training: ['gym mirror selfie', 'barbell plates gym', 'gym floor scene'],
    nutrition: ['meal prep containers', 'protein meal prep', 'meal prep food'],
    recovery: ['chalk hands gym', 'stretching gym', 'walking recovery'],
    cutting: ['gym mirror selfie', 'lean meal prep', 'meal prep food'],
    bulking: ['gym mirror selfie', 'bodybuilding meal prep', 'protein meal prep'],
    supplements: ['shaker bottle gym', 'gym bag supplements', 'supplement container'],
    lifestyle: ['crowded gym', 'fitness planner notebook', 'gym floor scene']
  };
  return map[category] || ['photo'];
}

function imageMeta(post, item) {
  const altMap = {
    chest: 'chest training photo',
    back: 'back training photo',
    shoulders: 'shoulder training photo',
    arms: 'arm training photo',
    legs: 'leg training photo',
    core: 'core training photo',
    food: 'meal prep photo',
    planning: 'workout planning photo',
    general: 'gym lifestyle photo'
  };
  const intent = detectImageIntent(post);
  return {
    imageUrl: item.url,
    imageAlt: altMap[intent] || 'fitness forum photo',
    imageSource: 'openverse',
    imageCreator: item.creator || null,
    imageLicense: item.license || null,
    imageLicenseUrl: item.license_url || null,
    imagePageUrl: item.foreign_landing_url || item.detail_url || null,
    imageId: item.id
  };
}

function loadExistingImagePool() {
  if (!fs.existsSync(OUT)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items
      .filter((item) => item && item.format === 'image' && item.imageUrl)
      .map((item) => ({
        category: item.category,
        scope: item.scope,
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt || null,
        imageSource: item.imageSource || null,
        imageCreator: item.imageCreator || null,
        imageLicense: item.imageLicense || null,
        imageLicenseUrl: item.imageLicenseUrl || null,
        imagePageUrl: item.imagePageUrl || null
      }));
  } catch {
    return [];
  }
}

function applyExistingImage(post, item) {
  const altMap = {
    chest: 'chest training photo',
    back: 'back training photo',
    shoulders: 'shoulder training photo',
    arms: 'arm training photo',
    legs: 'leg training photo',
    core: 'core training photo',
    food: 'meal prep photo',
    planning: 'workout planning photo',
    general: 'gym lifestyle photo'
  };
  const intent = detectImageIntent(post);
  return {
    imageUrl: item.imageUrl,
    imageAlt: altMap[intent] || item.imageAlt || 'fitness forum photo',
    imageSource: item.imageSource || 'openverse',
    imageCreator: item.imageCreator || null,
    imageLicense: item.imageLicense || null,
    imageLicenseUrl: item.imageLicenseUrl || null,
    imagePageUrl: item.imagePageUrl || null
  };
}

async function assign(posts) {
  const finder = new Finder();
  const fallbackPool = loadExistingImagePool();
  const usedFallback = new Set();
  const imageCount = posts.filter((post) => post.format === 'image').length;
  const takeFallback = (post) => {
    const pickIndex = fallbackPool.findIndex((item, index) => !usedFallback.has(index) && item.category === post.category);
    const scopeIndex = fallbackPool.findIndex((item, index) => !usedFallback.has(index) && item.scope === post.scope);
    const anyIndex = fallbackPool.findIndex((_, index) => !usedFallback.has(index));
    const index = pickIndex !== -1 ? pickIndex : scopeIndex !== -1 ? scopeIndex : anyIndex;
    if (index === -1) return null;
    usedFallback.add(index);
    return fallbackPool[index];
  };
  for (const post of posts) {
    if (post.format !== 'image') continue;
    let item = await finder.take(imageQueries(post));
    if (!item) item = await finder.take(broadImageQueries(post.category));
    if (item) {
      Object.assign(post, imageMeta(post, item));
      continue;
    }
    const fallback = takeFallback(post);
    if (!fallback) throw new Error(`No unique open-license image found for ${post.id}`);
    Object.assign(post, applyExistingImage(post, fallback));
  }
  return { requests: finder.requests, ids: finder.used.size };
}

function dupFourGrams(posts) {
  const seen = new Map();
  let dup = 0;
  for (const post of posts) {
    for (const gram of grams(post.title)) {
      const first = seen.get(gram);
      if (first && first !== post.id) dup += 1;
      else if (!first) seen.set(gram, post.id);
    }
  }
  return dup;
}

function clean(post) {
  const { _c, imageId, bodyStyle, mentionsFree, ...rest } = post;
  return rest;
}

async function main() {
  const posts = generate();
  const imageStats = await assign(posts);
  const dup = dupFourGrams(posts);
  const items = posts.map(clean);
  const imagePosts = items.filter((item) => item.format === 'image');
  const payload = {
    generatedAt: new Date().toISOString(),
    total: items.length,
    seed: SEED,
    summary: {
      imagePosts: imagePosts.length,
      textPosts: items.length - imagePosts.length,
      uniqueImageUrls: new Set(imagePosts.map((item) => item.imageUrl).filter(Boolean)).size,
      duplicateTitleFiveWordPhrases: dup,
      openverseRequests: imageStats.requests
    },
    items
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Saved ${items.length} forum posts to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
