const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
  if (rand() < 0.06) out += ` ${pick(['lol', '😭'])}`;
  return out;
}

function applyTitleImperfection(text) {
  let out = String(text || '');
  if (rand() < 0.05) {
    const pair = pick(typoMap);
    out = out.replace(new RegExp(pair[0], 'i'), pair[1]);
  }
  if (rand() < 0.05) out = out.toLowerCase();
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

function liftMuscleGroup(lift) {
  const map = {
    'incline-press': 'upper-chest',
    'smith-incline': 'upper-chest',
    dip: 'triceps',
    'machine-press': 'pecs',
    'cable-fly': 'pecs',
    'cable-row': 'upper-back',
    'chest-supported-row': 'upper-back',
    'lat-pulldown': 'lats',
    'pull-up': 'lats',
    'dumbbell-curl': 'biceps',
    'preacher-curl': 'biceps',
    'lateral-raise': 'side-delts',
    'hack-squat': 'quads',
    'leg-press': 'quads',
    'split-squat': 'quads',
    'leg-curl': 'hamstrings',
    RDL: 'hamstrings',
    'hip-thrust': 'glutes'
  };
  return map[lift] || 'shoulders';
}

function imageSubjectFor(category, c, imageType) {
  if (imageType === 'food') return pretty(c.food || c.food2 || 'meal prep');
  if (imageType === 'supplement') return pretty(c.supp || 'creatine');
  if (imageType === 'article') {
    const articleTopics = {
      training: ['training to failure', 'weekly volume', 'exercise order', 'progressive overload'],
      nutrition: ['protein timing', 'high protein diets', 'meal timing', 'bulking calories'],
      recovery: ['recovery bottlenecks', 'sleep quality', 'deload timing', 'fatigue management'],
      cutting: ['fat loss adherence', 'diet fatigue', 'meal timing on cuts', 'keeping strength while cutting'],
      bulking: ['rate of gain', 'bulking food quality', 'gaining too fast', 'surplus control'],
      supplements: ['creatine loading', 'pre workout ingredients', 'supplement basics', 'what actually matters'],
      lifestyle: ['habit stacking', 'consistency', 'routine design', 'accountability']
    };
    return pick(articleTopics[category] || articleTopics.training);
  }
  if (imageType === 'planning') return pretty(c.block || c.planner || 'training split');
  if (imageType === 'physique') return pretty(c.part || 'progress check');
  if (imageType === 'equipment') return pretty(c.lift || 'barbell setup');
  if (imageType === 'general_gym') return pretty(c.setting || 'gym session');
  return pretty(c.lift || c.part || 'training');
}

function resolveImageMeta(category, c, postType) {
  const roll = rand();
  let imageType = 'exercise';
  if (category === 'nutrition' || category === 'cutting' || category === 'bulking') {
    if (postType === 'question') imageType = roll < 0.58 ? 'food' : roll < 0.82 ? 'physique' : 'planning';
    else if (postType === 'personal') imageType = roll < 0.48 ? 'food' : roll < 0.84 ? 'physique' : 'general_gym';
    else if (postType === 'advice') imageType = roll < 0.55 ? 'food' : roll < 0.82 ? 'planning' : 'physique';
    else imageType = roll < 0.52 ? 'food' : 'general_gym';
  } else if (category === 'supplements') {
    if (postType === 'question') imageType = roll < 0.42 ? 'supplement' : roll < 0.68 ? 'article' : roll < 0.86 ? 'planning' : 'general_gym';
    else if (postType === 'personal') imageType = roll < 0.46 ? 'supplement' : roll < 0.78 ? 'general_gym' : 'article';
    else if (postType === 'advice') imageType = roll < 0.38 ? 'article' : roll < 0.74 ? 'supplement' : 'planning';
    else imageType = roll < 0.56 ? 'supplement' : 'general_gym';
  } else if (category === 'lifestyle') {
    if (postType === 'question') imageType = roll < 0.45 ? 'planning' : roll < 0.78 ? 'general_gym' : 'physique';
    else if (postType === 'personal') imageType = roll < 0.48 ? 'general_gym' : roll < 0.78 ? 'planning' : 'physique';
    else if (postType === 'advice') imageType = roll < 0.56 ? 'planning' : 'general_gym';
    else imageType = 'general_gym';
  } else if (category === 'recovery') {
    if (postType === 'question') imageType = roll < 0.44 ? 'planning' : roll < 0.76 ? 'exercise' : 'general_gym';
    else if (postType === 'personal') imageType = roll < 0.54 ? 'general_gym' : roll < 0.8 ? 'exercise' : 'planning';
    else if (postType === 'advice') imageType = roll < 0.48 ? 'planning' : 'exercise';
    else imageType = 'general_gym';
  } else {
    if (postType === 'question') imageType = roll < 0.62 ? 'exercise' : roll < 0.82 ? 'physique' : roll < 0.9 ? 'planning' : 'general_gym';
    else if (postType === 'personal') imageType = roll < 0.48 ? 'exercise' : roll < 0.82 ? 'physique' : 'general_gym';
    else if (postType === 'advice') imageType = roll < 0.56 ? 'exercise' : roll < 0.8 ? 'planning' : 'physique';
    else imageType = roll < 0.5 ? 'general_gym' : roll < 0.78 ? 'exercise' : 'physique';
  }

  const muscleGroup =
    imageType === 'exercise' || imageType === 'physique'
      ? imageType === 'exercise'
        ? liftMuscleGroup(c.lift || 'incline-press')
        : c.part
      : imageType === 'food'
        ? 'nutrition'
        : imageType === 'supplement'
          ? 'supplements'
          : imageType === 'planning'
            ? 'programming'
            : null;

  const postAngleByType = {
    article: ['reaction', 'summary', 'debate', 'takeaway'],
    food: ['meal_prep', 'protein_question', 'bulk_cut_use', 'taste_vs_macros'],
    physique: ['progress', 'lagging_part', 'bulk_or_cut', 'confidence_check'],
    exercise: ['technique', 'variation', 'exercise_order', 'stimulus'],
    equipment: ['setup', 'worth_it', 'swap', 'simple_vs_fancy'],
    planning: ['split_review', 'consistency', 'custom_vs_generic', 'progression'],
    supplement: ['worth_it', 'experience', 'food_vs_supps', 'beginner_question'],
    general_gym: ['check_in', 'routine', 'friction', 'motivation']
  };

  const subject = imageSubjectFor(category, c, imageType);
  return {
    imageType,
    mainObject: subject,
    subject,
    muscleGroup,
    postAngle: pick(postAngleByType[imageType] || postAngleByType.general_gym)
  };
}

function imageAwareTitle(category, c, postType, imageMeta) {
  const subject = pretty(imageMeta.subject || c.part || c.lift || 'training');
  const muscle = pretty(imageMeta.muscleGroup || c.part || 'training');
  const lift = liftLabel(c.lift || 'incline-press');
  const families = {
    article: {
      question: [
        { family: 'article-reaction', text: `saw an article about ${subject} and now im rethinking this` },
        { family: 'article-debate', text: `you guys actually agree with this ${subject} take` },
        { family: 'article-summary', text: `read something about ${subject} today and it kind of made sense` }
      ],
      personal: [
        { family: 'article-takeaway', text: `${subject} article kind of changed how im looking at this` },
        { family: 'article-reacted', text: `read a ${subject} piece today and it actually stuck with me` }
      ],
      advice: [
        { family: 'article-discussion', text: `best takeaway ive seen lately on ${subject}` },
        { family: 'article-opinion', text: `this ${subject} article is probably more useful than most hot takes` }
      ],
      casual: [
        { family: 'article-casual', text: `fitness articles always make me question what im doing` }
      ]
    },
    food: {
      question: [
        { family: 'food-easy', text: `this ${subject} has been one of the easiest ways to hit protein` },
        { family: 'food-question', text: `is ${subject} actually a good bulk meal or no` },
        { family: 'food-prep', text: `anybody got a way to make ${subject} less boring` }
      ],
      personal: [
        { family: 'food-repeatable', text: `${subject} is carrying my week right now` },
        { family: 'food-practical', text: `looks boring but this ${subject} makes the diet way easier` }
      ],
      advice: [
        { family: 'food-macros', text: `simple ${subject} beats overcomplicated meal prep every time` },
        { family: 'food-busy', text: `if your week is chaotic something like ${subject} is hard to beat` }
      ],
      casual: [
        { family: 'food-casual', text: `meal prep is still just dishes and protein` }
      ]
    },
    physique: {
      question: [
        { family: 'physique-progress', text: `finally seeing a little more shape but ${muscle} still feels behind` },
        { family: 'physique-bulkcut', text: `bulk or keep leaning out a bit more` },
        { family: 'physique-check', text: `am i being impatient or is ${muscle} still behind` },
        { family: 'physique-subject', text: `progress check on ${muscle} because it still feels behind` }
      ],
      personal: [
        { family: 'physique-personal', text: `${muscle} is not where i want it yet but it finally looks different` },
        { family: 'physique-confidence', text: `trying not to overreact but i think ${muscle} is finally moving` }
      ],
      advice: [
        { family: 'physique-opinion', text: `physique check reminder that boring progress still counts` },
        { family: 'physique-detail', text: `small changes in ${muscle} show up way before perfect photos do` }
      ],
      casual: [
        { family: 'physique-casual', text: `progress is progress even when it feels slow` }
      ]
    },
    exercise: {
      question: [
        { family: 'exercise-clicking', text: `this ${subject} variation finally started clicking for me` },
        { family: 'exercise-order', text: `should ${subject} go earlier in the workout or stay where it is` },
        { family: 'exercise-stimulus', text: `i feel ${subject} everywhere except where im supposed to` }
      ],
      personal: [
        { family: 'exercise-personal', text: `${subject} finally started moving again` },
        { family: 'exercise-specific', text: `putting ${subject} first actually helped a lot` }
      ],
      advice: [
        { family: 'exercise-opinion', text: `this ${subject} setup works better than i expected` },
        { family: 'exercise-variation', text: `this version of ${subject} feels way better than the default one` }
      ],
      casual: [
        { family: 'exercise-casual', text: `${subject} still humbles me every week` }
      ]
    },
    planning: {
      question: [
        { family: 'planning-cleanup', text: `at what point do you stop tweaking your ${subject} every week` },
        { family: 'planning-simple', text: `cleaned up my ${subject} and it already feels easier to follow` },
        { family: 'planning-custom', text: `when do you stop using generic workouts and go more custom` },
        { family: 'planning-structure', text: `does this ${subject} still look too complicated or not` }
      ],
      personal: [
        { family: 'planning-personal', text: `${subject} looks simple on paper and thats probably the point` },
        { family: 'planning-structure', text: `simplifying my ${subject} helped more than i expected` }
      ],
      advice: [
        { family: 'planning-advice', text: `most people would progress faster if they stopped rewriting the plan` },
        { family: 'planning-routine', text: `consistency beats constantly tweaking your ${subject}` }
      ],
      casual: [
        { family: 'planning-casual', text: `my notes app has too much power over the week` }
      ]
    },
    supplement: {
      question: [
        { family: 'supp-worth', text: `anybody actually notice a difference from ${subject} or nah` },
        { family: 'supp-basics', text: `${subject} worth buying or should food still be the focus` },
        { family: 'supp-trust', text: `${subject} actually useful or just expensive powder` }
      ],
      personal: [
        { family: 'supp-personal', text: `${subject} is one of the only things i keep buying` },
        { family: 'supp-experience', text: `at this point ${subject} is either useful or im coping` }
      ],
      advice: [
        { family: 'supp-advice', text: `supplements matter a lot less than people want them to` },
        { family: 'supp-food', text: `food and consistency still beat most supplement stacks` }
      ],
      casual: [
        { family: 'supp-casual', text: `expensive powder discourse never ends` }
      ]
    },
    general_gym: {
      question: [
        { family: 'gym-routine', text: `anybody else feel way better once the gym week gets simpler` },
        { family: 'gym-friction', text: `is it normal to lose momentum after one messy week` },
        { family: 'gym-motivation', text: `what actually keeps you consistent when life gets loud` },
        { family: 'gym-subject', text: `how do you keep ${subject} from throwing the whole week off` }
      ],
      personal: [
        { family: 'gym-personal', text: `${subject} made the week feel way harder than it needed to` },
        { family: 'gym-checkin', text: `busy week but i still found a decent session in there` }
      ],
      advice: [
        { family: 'gym-advice', text: `making gym days easier to start fixes more than motivation does` },
        { family: 'gym-consistency', text: `a lower friction routine usually wins` }
      ],
      casual: [
        { family: 'gym-casual', text: `forgot my headphones and still had a good session` }
      ]
    }
  };

  const selected = pick((families[imageMeta.imageType] || families.general_gym)[postType] || families.general_gym.question);
  const finalText = fixGrammar(applyTitleImperfection(selected.text));
  if (!titlePlausible(finalText)) return imageAwareTitle(category, c, postType, imageMeta);
  return { text: finalText, family: `image-${imageMeta.imageType}-${selected.family}` };
}

function title(category, c, postType, imageMeta = null) {
  if (imageMeta) return imageAwareTitle(category, c, postType, imageMeta);
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
    const finalText = fixGrammar(applyTitleImperfection(varied));
    if (!titlePlausible(finalText)) return title(category, c, postType);
    return { text: finalText, family: `${category}-${postType}` };
  }
  const finalText = fixGrammar(applyTitleImperfection(selected.text));
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
  if (/bodypart-normal|bodypart-helped|free-plan-grow|bodypart-feel|volume-question|is-this-normal|normal-beginner/.test(family)) {
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

function imageAwareBody(category, c, postType, titleInfo, imageMeta) {
  const subject = pretty(imageMeta.subject || c.part || c.lift || 'training');
  const muscle = pretty(imageMeta.muscleGroup || c.part || 'training');
  const lift = liftLabel(c.lift || 'incline-press');
  const freeMixed = [
    'the free setup was honestly better than the random stuff i used to do.',
    'not saying the free workouts are bad at all.',
    'the site gave me a decent base.',
    'free training helped me stop changing everything every week.'
  ];
  const bodies = {
    article: {
      question: [
        `saw a piece about ${subject} earlier and it made me rethink how i have been approaching this.`,
        `curious if people actually change anything after reading about ${subject} or if you just stick with what already works.`,
        `not trying to overreact to one article. just wondering if there is actually something worth taking from it.`
      ],
      personal: [
        `most articles go in one ear and out the other for me, but the ${subject} point here was actually useful.`,
        `it lined up with what i keep running into in the gym, which is why it stood out.`,
        `${rand() < 0.28 ? pick(freeMixed) + ' ' : ''}mostly made me want to simplify things instead of adding more noise.`
      ],
      advice: [
        `stuff like this is useful when it gives you one clear takeaway instead of ten tiny optimizations.`,
        `the ${subject} angle made more sense than the usual recycled fitness advice.`,
        `if a post or article makes you clean up one obvious mistake that is already enough.`
      ],
      casual: [`fitness content is either useless or one sentence that actually sticks with you.`]
    },
    food: {
      question: [
        `this kind of ${subject} is easy for me to repeat when the week gets busy.`,
        `mostly trying to decide if the convenience is worth how boring it looks.`,
        `if youve got a better version of this that still keeps protein high im listening.`
      ],
      personal: [
        `nothing fancy here. it just makes hitting protein and calories way less annoying.`,
        `this is the sort of meal i keep going back to when i dont want to think too much.`,
        `${rand() < 0.22 ? pick(freeMixed) + ' ' : ''}food like this keeps the rest of the plan from falling apart.`
      ],
      advice: [
        `meals do not need to be impressive if they are easy to repeat and easy to track.`,
        `something like ${subject} usually works better than chasing variety every single day.`,
        `when food is simple i am way more likely to stay on plan.`
      ],
      casual: [`looks boring but it gets the job done.`]
    },
    physique: {
      question: [
        `finally starting to notice a little change, but ${muscle} still feels behind compared to the rest.`,
        `trying not to overreact to one check in, just figuring out whether this looks like normal slow progress.`,
        `if you were me would you keep pushing the bulk or lean out a little more first.`
      ],
      personal: [
        `progress has been slow enough that i almost missed it until this week.`,
        `not pretending this is insane progress, but it does look a little more like the work is showing now.`,
        `${rand() < 0.18 ? pick(freeMixed) + ' ' : ''}mostly posting it because im trying to stay objective instead of changing everything too soon.`
      ],
      advice: [
        `physique changes show up slower than people expect, especially when you stare at yourself every day.`,
        `a lot of progress photos look unimpressive until you compare them to where you started.`,
        `small visible changes are usually a sign to stay patient instead of panic.`
      ],
      casual: [`progress is progress even when it still feels behind.`]
    },
    exercise: {
      question: [
        `${lift} looks simple on paper but i still cant tell if my setup is good or if im making it harder than it needs to be.`,
        `this version finally feels closer to the right stimulus, but im still not sure whether it belongs earlier in the workout.`,
        `i either feel ${subject} exactly where i want it or nowhere near the target and i cant tell what changed.`
      ],
      personal: [
        `this variation finally started making sense once i slowed it down and stopped rushing through the setup.`,
        `ive done ${subject} for a while, but this is the first time it has actually felt repeatable.`,
        `turns out a small execution change mattered more than adding more sets.`
      ],
      advice: [
        `if an exercise never feels right, i usually check setup and order before i blame the whole program.`,
        `a better variation or better execution usually fixes more than adding random volume.`,
        `this is one of those movements where being patient with the setup matters a lot.`
      ],
      casual: [`some exercises really do humble you every week.`]
    },
    planning: {
      question: [
        `the more i look at ${subject} the more i think simple might be the whole point.`,
        `${rand() < 0.3 ? pick(freeMixed) + ' ' : ''}trying to figure out when a basic setup stops being enough and when thats just me wanting novelty.`,
        `i keep tweaking the plan instead of actually running it and im pretty sure thats half the problem.`
      ],
      personal: [
        `cleaning up the structure made the week easier to follow almost immediately.`,
        `this is the first time the plan has looked simple enough that i might actually leave it alone.`,
        `a lot of my inconsistency was just coming from overcomplicating everything.`
      ],
      advice: [
        `most people would be better off following a simple split for six weeks instead of rewriting it every few days.`,
        `if the plan only works when life is perfect then it probably needs to be simpler.`,
        `structure matters a lot more once you stop treating every week like a fresh start.`
      ],
      casual: [`my notes app is still the most inconsistent coach ive ever had.`]
    },
    supplement: {
      question: [
        `trying to figure out if ${subject} actually matters here or if im just looking for an easy fix.`,
        `${rand() < 0.3 ? pick(freeMixed) + ' ' : ''}mostly wondering whether food and training still deserve the attention before this does.`,
        `if youve used ${subject} for a while did you actually notice anything or not really.`
      ],
      personal: [
        `${subject} is one of the few things i keep circling back to because at least it feels straightforward.`,
        `im trying to get way less distracted by supplement hype and this is part of that.`,
        `it either helps a little or i just like pretending it does.`
      ],
      advice: [
        `supplements are usually the last place i would look if progress is shaky.`,
        `the basics cover a lot more than people want to hear.`,
        `if the routine and food are messy no powder is really fixing that.`
      ],
      casual: [`expensive tubs keep trying to become a personality trait.`]
    },
    general_gym: {
      question: [
        `the biggest issue lately is not knowledge, its just keeping the week from drifting.`,
        `feels like one messy day turns into three if im not careful.`,
        `curious what actually helps people stay locked in when the week gets loud.`
      ],
      personal: [
        `${subject} threw the week off more than i expected, but i still got enough done to count it.`,
        `not a huge breakthrough or anything. just one of those weeks where showing up was the win.`,
        `the routine felt better once i stopped expecting perfect conditions.`
      ],
      advice: [
        `lower friction routines usually beat high motivation routines over time.`,
        `if showing up takes too much setup the plan probably needs less complexity.`,
        `consistency gets easier when the default week is actually realistic.`
      ],
      casual: [`real life is still the hardest part of the program.`]
    }
  };
  const lines = (bodies[imageMeta.imageType] || bodies.general_gym)[postType] || bodies.general_gym.question;
  const count = postType === 'casual' ? 1 : postType === 'advice' ? 2 : rand() < 0.62 ? 2 : 3;
  const text = fixGrammar(applyCaptionImperfection(shuffle(lines).slice(0, count).join(' ')));
  return {
    text,
    styleKey: `image-${imageMeta.imageType}-${postType}-${imageMeta.postAngle}`,
    mentionsFree: /free setup|free workouts|free training|site gave me|free plan/i.test(text)
  };
}

function body(category, c, postType, titleInfo, imageMeta = null) {
  if (imageMeta) return imageAwareBody(category, c, postType, titleInfo, imageMeta);
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
  const seededImageMeta = image ? resolveImageMeta(category, c, postType) : null;
  const stats = score(category, image);
  const minutesAgo = ageMinutes();
  const hour = int(0, 23);
  const minute = int(0, 59);
  const id = `forum-post-${String(index + 1).padStart(4, '0')}`;
  const postTitle = title(category, c, postType, seededImageMeta);
  const postBody = body(category, c, postType, postTitle, seededImageMeta);
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
    imageType: seededImageMeta ? seededImageMeta.imageType : null,
    imageMainObject: seededImageMeta ? seededImageMeta.mainObject : null,
    imageSubject: seededImageMeta ? seededImageMeta.subject : null,
    imageMuscleGroup: seededImageMeta ? seededImageMeta.muscleGroup : null,
    imagePostAngle: seededImageMeta ? seededImageMeta.postAngle : null,
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
  if (!(item && item.id && item.url)) return false;
  if (!OPEN_LICENSES.has(String(item.license || '').toLowerCase())) return false;
  if (item.mature) return false;
  if (Number(item.width || 0) < 400 || Number(item.height || 0) < 400) return false;
  const url = String(item.url || '').toLowerCase();
  const title = String(item.title || '').toLowerCase();
  const creator = String(item.creator || '').toLowerCase();
  const detail = `${url} ${title} ${creator}`;
  if (url.endsWith('.svg')) return false;
  if (/(diagram|illustration|drawing|icon|logo|vector|statue|building|architecture|furniture|candlestick|artifact|museum|sculpture|monument|ruins|landscape|cityscape|interior|exterior|church|cathedral|temple|painting)/.test(detail)) return false;
  return true;
}

function imageContext(item) {
  return `${String(item.title || '')} ${String(item.creator || '')} ${String(item.url || '')}`.toLowerCase();
}

function imageMatchesProfile(post, item, profile) {
  const context = imageContext(item);
  const genericFitness = /\b(gym|fitness|workout|training|exercise|bodybuilding|physique|muscle|athlete|lifting|weightlifting|crossfit|powerlifting|strength|posing|progress|selfie|mirror|meal|protein|food|nutrition)\b/;
  const peopleCue = /\b(man|men|woman|women|girl|boy|person|people|adult|young adult|teen|teens|male|female|bodybuilder|lifter|athlete|model)\b/;
  const noteCue = /\b(notebook|notes|planner|log|journal|program|spreadsheet|template)\b/;
  const articleCue = /\b(article|study|research|paper|screenshot)\b/;
  const supplementCue = /\b(creatine|protein powder|pre workout|supplement|magnesium|caffeine|shaker|powder|tub)\b/;
  const neutralTrainingCue = /\b(barbell|dumbbell|plates|rack|bench|machine|cable|pulldown|row|press|squat|deadlift|mirror|gym floor)\b/;
  const exactTerms = {
    'upper-chest': /\b(upper chest|incline|incline bench|incline dumbbell|smith incline|cable fly|chest)\b/,
    'rear-delts': /\b(rear delt|reverse pec deck|rear raise|rear delts|posterior delt)\b/,
    'side-delts': /\b(side delt|lateral raise|shoulder raise|medial delt|delt)\b/,
    traps: /\b(trap|traps|shrug|carries|farmer carry|upper back)\b/,
    'upper-back': /\b(upper back|row|rows|chest supported row|back)\b/,
    lats: /\b(lat|lats|pulldown|pullup|pull up|back)\b/,
    biceps: /\b(biceps|bicep|curl|preacher)\b/,
    triceps: /\b(triceps|tricep|pushdown|extension|close grip)\b/,
    hamstrings: /\b(hamstring|leg curl|rdl|romanian deadlift|hinge)\b/,
    glutes: /\b(glute|glutes|hip thrust|glute bridge)\b/,
    quads: /\b(quad|quads|squat|hack squat|leg press|split squat)\b/,
    calves: /\b(calf|calves|calf raise|seated calf|standing calf)\b/,
    abs: /\b(abs|ab|core|cable crunch|ab wheel|bracing)\b/,
    'cable-row': /\b(cable row|seated row|row)\b/,
    'cable-fly': /\b(cable fly|cable chest fly|fly|chest)\b/,
    'smith-incline': /\b(smith incline|incline smith|incline press|smith machine)\b/,
    food: /\b(meal|protein|diet|food|prep|nutrition|calories)\b/,
    planning: /\b(notebook|notes|planner|log|journal|program|spreadsheet|template)\b/,
    supplement: /\b(creatine|protein powder|pre workout|supplement|magnesium|caffeine|shaker|powder|tub)\b/,
    article: /\b(article|study|research|paper|screenshot)\b/,
    lifestyle: /\b(gym|workout|training|mirror|selfie|lifter|athlete)\b/
  };
  const familyTerms = {
    chest: /\b(chest|bench|press|fly|incline)\b/,
    back: /\b(back|lat|row|pulldown|pullup|trap)\b/,
    shoulders: /\b(shoulder|delt|lateral raise|rear delt)\b/,
    arms: /\b(bicep|tricep|curl|pushdown|arm)\b/,
    legs: /\b(legs|quad|hamstring|glute|calf|squat|leg press|split squat|hip thrust|rdl)\b/,
    core: /\b(core|abs|ab wheel|cable crunch|bracing)\b/,
    food: /\b(meal|protein|food|prep|nutrition|diet)\b/,
    planning: /\b(notebook|notes|planner|log|journal|program|spreadsheet|template)\b/,
    supplement: /\b(creatine|protein powder|pre workout|supplement|magnesium|caffeine|shaker|powder|tub)\b/,
    article: /\b(article|study|research|paper|screenshot|notes)\b/,
    general: /\b(gym|workout|training|fitness|physique|progress|mirror|selfie|lifter|athlete|barbell|dumbbell|rack|plates)\b/
  };

  if (profile.exact === 'food' || profile.family === 'food') return exactTerms.food.test(context);
  if (profile.exact === 'planning' || profile.family === 'planning') return noteCue.test(context);
  if (profile.exact === 'article' || profile.family === 'article') return articleCue.test(context);
  if (profile.exact === 'supplement' || profile.family === 'supplement') return supplementCue.test(context);

  if (!(genericFitness.test(context) || peopleCue.test(context) || neutralTrainingCue.test(context))) return false;

  if (profile.exact && exactTerms[profile.exact]) {
    if (exactTerms[profile.exact].test(context)) return true;
    return false;
  }

  if (profile.family && familyTerms[profile.family]) {
    return familyTerms[profile.family].test(context) || neutralTrainingCue.test(context);
  }

  return familyTerms.general.test(context);
}

class Finder {
  constructor() {
    this.queries = new Map();
    this.used = new Set();
    this.usedUrls = new Set();
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
        const itemUrl = norm(item.url);
        if (!okImage(item) || this.used.has(item.id) || (itemUrl && this.usedUrls.has(itemUrl))) continue;
        this.used.add(item.id);
        if (itemUrl) this.usedUrls.add(itemUrl);
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

  async take(list, validator = null) {
    for (const query of uniq(list.map(norm))) {
      const item = await this.fromQuery(query);
      if (item && validator && !validator(item)) {
        continue;
      }
      if (item) return item;
    }
    return null;
  }
}

function detectImageProfile(post) {
  if (post.imageType) {
    const subject = String(post.imageSubject || post.imageMainObject || '').toLowerCase();
    const muscle = String(post.imageMuscleGroup || '').toLowerCase();
    const map = [
      ['cable-fly', /\bcable fly\b/],
      ['cable-row', /\bcable row\b/],
      ['smith-incline', /\bsmith incline|incline smith\b/],
      ['upper-chest', /\bupper chest|incline\b/],
      ['rear-delts', /\brear delt|reverse pec deck\b/],
      ['side-delts', /\bside delt|lateral raise\b/],
      ['traps', /\btraps?|shrug|carry\b/],
      ['upper-back', /\bupper back|chest supported row\b/],
      ['lats', /\blats?|pulldown|pull up\b/],
      ['hamstrings', /\bhamstrings?|rdl|leg curl\b/],
      ['glutes', /\bglutes?|hip thrust\b/],
      ['quads', /\bquads?|hack squat|leg press|split squat|squat\b/],
      ['calves', /\bcalves|calf\b/],
      ['abs', /\babs|core|ab wheel|cable crunch\b/],
      ['biceps', /\bbiceps|curl\b/],
      ['triceps', /\btriceps|pushdown|extension\b/]
    ];
    for (const [key, pattern] of map) {
      if (pattern.test(subject) || pattern.test(muscle)) {
        const familyMap = {
          'upper-chest': 'chest',
          'rear-delts': 'shoulders',
          'side-delts': 'shoulders',
          traps: 'back',
          'upper-back': 'back',
          lats: 'back',
          biceps: 'arms',
          triceps: 'arms',
          hamstrings: 'legs',
          glutes: 'legs',
          quads: 'legs',
          calves: 'legs',
          abs: 'core',
          'cable-row': 'back',
          'cable-fly': 'chest',
          'smith-incline': 'chest'
        };
        return { exact: key, family: familyMap[key] || 'general' };
      }
    }
    if (post.imageType === 'food') return { exact: 'food', family: 'food' };
    if (post.imageType === 'planning') return { exact: 'planning', family: 'planning' };
    if (post.imageType === 'supplement') return { exact: 'supplement', family: 'supplement' };
    if (post.imageType === 'article') return { exact: 'article', family: 'article' };
    if (post.imageType === 'physique') {
      if (/\b(chest|pecs|upper chest)\b/.test(muscle)) return { exact: 'upper-chest', family: 'chest' };
      if (/\b(back|lats|upper back|traps)\b/.test(muscle)) return { exact: null, family: 'back' };
      if (/\b(side delts|rear delts|shoulders)\b/.test(muscle)) return { exact: null, family: 'shoulders' };
      if (/\b(biceps|triceps|forearms)\b/.test(muscle)) return { exact: null, family: 'arms' };
      if (/\b(quads|hamstrings|glutes|calves)\b/.test(muscle)) return { exact: null, family: 'legs' };
      if (/\b(abs|core)\b/.test(muscle)) return { exact: 'abs', family: 'core' };
      return { exact: null, family: 'general' };
    }
    if (post.imageType === 'general_gym' || post.imageType === 'equipment') return { exact: null, family: 'general' };
  }
  const text = `${post.title || ''} ${post.body || ''}`.toLowerCase();
  const exact = [
    ['cable-row', /\bcable row\b/],
    ['cable-fly', /\bcable fly\b/],
    ['smith-incline', /\bsmith incline|smith-incline\b/],
    ['upper-chest', /\bupper chest|incline smith|smith incline|incline dumbbell|incline bench|incline press|upper chest cable fly\b/],
    ['rear-delts', /\brear delts?|reverse pec deck|rear delt\b/],
    ['side-delts', /\bside delts?|lateral raises?\b/],
    ['traps', /\btraps?|shrugs?|carries|farmer carries\b/],
    ['upper-back', /\bupper back|chest supported row|chest-supported-row\b/],
    ['lats', /\blats?|lat pulldown|pullups?|pull up\b/],
    ['hamstrings', /\bhamstrings?|rdl|leg curl\b/],
    ['glutes', /\bglutes?|hip thrust\b/],
    ['quads', /\bquads?|hack squat|leg press|split squat|squat\b/],
    ['calves', /\bcalves|calf\b/],
    ['abs', /\babs|core|bracing|brace|cable crunch|ab wheel\b/],
    ['biceps', /\bbiceps|preacher curl|dumbbell curl|barbell curl\b/],
    ['triceps', /\btriceps|pushdowns?|extensions?|close grip\b/],
    ['planning', /\b(trainer|coaching|custom plan|custom workout|accountability|routine design|split)\b|free plan|free training|free workouts/],
    ['supplement', /\b(creatine|pre workout|pre-workout|protein powder|supplement|magnesium|caffeine|beta alanine)\b/],
    ['article', /\b(article|study|research|paper)\b/],
    ['food', /\b(meal|diet|protein|prep|food|calorie|calories|appetite|bulk|cut)\b/],
    ['lifestyle', /\b(headphones|packed gym|garage gym|spotter|busy week|missed one day)\b/]
  ];
  for (const [key, pattern] of exact) {
    if (pattern.test(text)) {
      const familyMap = {
        'upper-chest': 'chest',
        'rear-delts': 'shoulders',
        'side-delts': 'shoulders',
        traps: 'back',
        'upper-back': 'back',
        lats: 'back',
        biceps: 'arms',
        triceps: 'arms',
        hamstrings: 'legs',
        glutes: 'legs',
        quads: 'legs',
        calves: 'legs',
        abs: 'core',
        'cable-row': 'back',
        'cable-fly': 'chest',
        'smith-incline': 'chest',
        planning: 'planning',
        supplement: 'supplement',
        article: 'article',
        food: 'food',
        lifestyle: 'general'
      };
      return { exact: key, family: familyMap[key] || 'general' };
    }
  }
  if (/\b(pecs?|chest|bench|pressing?)\b/.test(text)) return { exact: null, family: 'chest' };
  if (/\b(back|rows?|pullups?|pull up|mid back)\b/.test(text)) return { exact: null, family: 'back' };
  if (/\b(shoulders?|lateral raise)\b/.test(text)) return { exact: null, family: 'shoulders' };
  if (/\b(arms|forearms?)\b/.test(text)) return { exact: null, family: 'arms' };
  if (/\b(legs|adductors?)\b/.test(text)) return { exact: null, family: 'legs' };
  if (/\b(article|study|research|paper)\b/.test(text)) return { exact: 'article', family: 'article' };
  if (/\b(creatine|supplement|pre workout|protein powder)\b/.test(text)) return { exact: 'supplement', family: 'supplement' };
  return { exact: null, family: 'general' };
}

function imageQueries(post) {
  const c = post._c || {};
  const titleTerms = words(post.title).filter((word) => word.length > 2).slice(0, 3).join(' ');
  const profile = detectImageProfile(post);
  const subject = pretty(post.imageSubject || '');
  const adultProgress = {
    chest: ['adult gym mirror selfie chest', 'young adult bodybuilding chest progress', 'adult fitness posing chest', 'adult athlete bench press gym'],
    back: ['adult gym mirror selfie back', 'young adult bodybuilding back progress', 'adult fitness posing back', 'adult athlete pull up gym'],
    shoulders: ['adult gym mirror selfie shoulders', 'young adult fitness shoulder progress', 'adult lateral raise physique', 'adult athlete shoulder workout gym'],
    arms: ['adult gym mirror selfie arms', 'young adult fitness biceps progress', 'adult bodybuilding arm pose', 'adult athlete dumbbell curl gym'],
    legs: ['adult gym mirror selfie legs', 'young adult fitness leg progress', 'adult bodybuilding lower body', 'adult athlete squat gym'],
    core: ['adult gym mirror selfie abs', 'young adult fitness core progress', 'adult physique check abs', 'adult athlete core workout gym'],
    food: ['healthy meal prep adult fitness', 'protein meal prep gym lifestyle'],
    planning: ['adult workout notebook', 'adult gym notes phone', 'adult athlete training plan'],
    supplement: ['creatine tub gym', 'protein powder shaker adult', 'supplement container gym'],
    article: ['fitness article screenshot', 'research article screenshot fitness', 'training notes screenshot'],
    general: ['adult gym mirror selfie', 'young adult fitness progress photo', 'adult physique check gym', 'adult athlete training gym', 'adult sports conditioning training']
  };
  const exactQueries = {
    'upper-chest': ['incline bench press adult gym', 'incline dumbbell press adult fitness', 'incline smith machine chest adult', 'upper chest cable fly adult'],
    'rear-delts': ['rear delt machine adult gym', 'reverse pec deck adult gym', 'rear delt raise adult gym'],
    'side-delts': ['lateral raise adult gym', 'cable lateral raise adult gym', 'dumbbell lateral raise adult fitness'],
    traps: ['barbell shrug adult gym', 'dumbbell shrug adult gym', 'farmer carry adult gym'],
    'upper-back': ['chest supported row adult gym', 'upper back row adult fitness', 'barbell row adult gym'],
    lats: ['lat pulldown adult gym', 'pull up adult gym', 'wide grip pulldown adult fitness'],
    biceps: ['dumbbell curl adult gym', 'preacher curl adult gym', 'barbell curl adult fitness'],
    triceps: ['tricep pushdown adult gym', 'overhead tricep extension adult gym', 'close grip bench adult gym'],
    hamstrings: ['romanian deadlift adult gym', 'leg curl machine adult gym', 'rdl adult fitness'],
    glutes: ['hip thrust adult gym', 'glute bridge adult fitness', 'hip thrust machine adult gym'],
    quads: ['hack squat adult gym', 'leg press adult gym', 'split squat adult fitness', 'barbell squat adult gym'],
    calves: ['standing calf raise adult gym', 'seated calf raise adult gym', 'calf raise machine adult fitness'],
    abs: ['ab wheel adult gym', 'cable crunch adult gym', 'core workout adult fitness'],
    'cable-row': ['cable row adult gym', 'seated cable row adult fitness'],
    'cable-fly': ['cable fly adult gym', 'cable chest fly adult fitness'],
    'smith-incline': ['smith incline press adult gym', 'incline smith machine chest adult'],
    planning: ['adult workout notebook', 'gym notes phone adult', 'training split notebook', 'program notes gym'],
    supplement: [`${subject} supplement`, `${subject} shaker`, 'creatine tub gym', 'protein powder scoop'],
    article: [`${subject} article screenshot`, `${subject} study screenshot`, 'fitness article screenshot', 'research article screenshot fitness'],
    food: [`${c.food} meal prep`, `${c.food2} healthy meal`, 'meal prep containers', `${c.meal} protein meal`],
    lifestyle: ['adult gym mirror selfie', 'crowded gym adult fitness', 'adult athlete training gym', 'adult weightlifting gym photo', 'adult jiu jitsu training']
  };
  const familyQueries = {
    chest: ['bench press adult gym', 'chest press machine adult', 'incline bench adult fitness', 'adult athlete chest workout', ...adultProgress.chest],
    back: ['lat pulldown adult gym', 'barbell row adult gym', 'back mirror adult gym', 'pull up adult fitness', 'adult athlete back workout', ...adultProgress.back],
    shoulders: ['lateral raise adult gym', 'rear delt machine adult gym', 'shoulder dumbbell raise adult', 'adult athlete shoulder day gym', ...adultProgress.shoulders],
    arms: ['dumbbell curl adult gym', 'tricep pushdown adult gym', 'arm flex mirror adult gym', 'adult athlete arm workout gym', ...adultProgress.arms],
    legs: ['squat rack adult gym', 'leg press adult gym', 'split squat adult fitness', 'hamstring curl adult gym', 'adult athlete leg workout gym', ...adultProgress.legs],
    core: ['ab wheel adult gym', 'cable crunch adult gym', 'core workout adult fitness', 'adult athlete ab workout gym', ...adultProgress.core],
    food: ['meal prep containers', 'high protein meal prep', 'healthy meal prep', 'protein meal', ...adultProgress.food],
    planning: ['adult workout notebook', 'training split notebook', 'gym notes phone adult', 'workout planner notebook', ...adultProgress.planning],
    supplement: ['creatine tub gym', 'protein powder shaker adult', 'supplement shelf gym', ...adultProgress.supplement],
    article: ['fitness article screenshot', 'research article screenshot fitness', 'training notes screenshot', ...adultProgress.article],
    general: ['adult gym mirror selfie', 'young adult fitness progress photo', 'adult physique check gym', 'barbell plates gym', 'gym rack platform', 'adult athlete training gym', 'adult sports conditioning training']
  };
  const neutralTraining = ['adult gym mirror selfie', 'young adult fitness progress photo', 'adult physique check gym', 'barbell plates gym', 'gym rack platform', 'adult athlete training gym', 'adult sports conditioning training', 'adult weightlifting gym photo'];
  return {
    exact: uniq([...(exactQueries[profile.exact] || []), titleTerms]),
    family: uniq([...(familyQueries[profile.family] || familyQueries.general), titleTerms]),
    neutral: neutralTraining,
    profile
  };
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
    'upper-chest': 'upper chest training photo',
    'rear-delts': 'rear delt training photo',
    'side-delts': 'side delt training photo',
    traps: 'trap training photo',
    'upper-back': 'upper back training photo',
    lats: 'lat training photo',
    biceps: 'biceps training photo',
    triceps: 'triceps training photo',
    hamstrings: 'hamstring training photo',
    glutes: 'glute training photo',
    quads: 'quad training photo',
    calves: 'calf training photo',
    abs: 'core training photo',
    'cable-row': 'cable row training photo',
    'cable-fly': 'cable fly training photo',
    'smith-incline': 'incline press training photo',
    chest: 'chest training photo',
    back: 'back training photo',
    shoulders: 'shoulder training photo',
    arms: 'arm training photo',
    legs: 'leg training photo',
    core: 'core training photo',
    food: 'meal prep photo',
    planning: 'workout planning photo',
    supplement: 'supplement photo',
    article: 'fitness article screenshot',
    general: 'fitness training photo'
  };
  const profile = detectImageProfile(post);
  const intent = profile.exact || profile.family;
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
  const readPool = (payload) => {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items
      .filter((item) => item && item.format === 'image' && item.imageUrl)
      .filter((item) => !/(museum|collections\.|candlestick|furniture_fitting|artifact|brooklynmuseum|otegroupmuseum)/i.test(String(item.imageUrl || '')))
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
  };

  if (fs.existsSync(OUT)) {
    try {
      const payload = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      const pool = readPool(payload);
      if (pool.length >= 200) return pool;
    } catch {
      // Fall through to git copy.
    }
  }

  try {
    const raw = execSync('git show HEAD:data/forum-posts.json', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    });
    return readPool(JSON.parse(raw));
  } catch {
    return [];
  }
}

function existingImageMatches(post, item, profile) {
  const text = `${String(item.imageAlt || '')} ${String(item.imageUrl || '')}`.toLowerCase();
  const intent = profile.exact || profile.family;
  const exactAlt = {
    'upper-chest': /upper chest|incline press/,
    'rear-delts': /rear delt/,
    'side-delts': /side delt|shoulder training/,
    traps: /trap training|back training/,
    'upper-back': /upper back|back training/,
    lats: /lat training|back training/,
    biceps: /biceps|arm training/,
    triceps: /triceps|arm training/,
    hamstrings: /hamstring|leg training/,
    glutes: /glute|leg training/,
    quads: /quad|leg training/,
    calves: /calf|leg training/,
    abs: /core training/,
    'cable-row': /cable row|back training/,
    'cable-fly': /cable fly|chest training/,
    'smith-incline': /incline press|chest training/,
    food: /meal prep/,
    planning: /workout planning/,
    supplement: /supplement photo/,
    article: /article screenshot/,
    chest: /chest training/,
    back: /back training/,
    shoulders: /shoulder training/,
    arms: /arm training|biceps|triceps/,
    legs: /leg training|hamstring|glute|quad|calf/,
    core: /core training/,
    general: /gym mirror/
  };
  const pattern = exactAlt[intent];
  if (!pattern) return false;
  if (pattern.test(text)) return true;
  if (profile.family && profile.family !== 'food' && profile.family !== 'planning' && profile.family !== 'article' && profile.family !== 'supplement') {
    return /fitness training photo|chest training photo|back training photo|shoulder training photo|arm training photo|leg training photo|core training photo|lat training photo|triceps training photo|upper chest training photo|cable fly training photo|cable row training photo/.test(text);
  }
  return false;
}

function applyExistingImage(post, item) {
  const altMap = {
    'upper-chest': 'upper chest training photo',
    'rear-delts': 'rear delt training photo',
    'side-delts': 'side delt training photo',
    traps: 'trap training photo',
    'upper-back': 'upper back training photo',
    lats: 'lat training photo',
    biceps: 'biceps training photo',
    triceps: 'triceps training photo',
    hamstrings: 'hamstring training photo',
    glutes: 'glute training photo',
    quads: 'quad training photo',
    calves: 'calf training photo',
    abs: 'core training photo',
    'cable-row': 'cable row training photo',
    'cable-fly': 'cable fly training photo',
    'smith-incline': 'incline press training photo',
    chest: 'chest training photo',
    back: 'back training photo',
    shoulders: 'shoulder training photo',
    arms: 'arm training photo',
    legs: 'leg training photo',
    core: 'core training photo',
    food: 'meal prep photo',
    planning: 'workout planning photo',
    supplement: 'supplement photo',
    article: 'fitness article screenshot',
    general: 'fitness training photo'
  };
  const profile = detectImageProfile(post);
  const intent = profile.exact || profile.family;
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
  const takeExisting = (post, profile) => {
    const exactIndex = fallbackPool.findIndex((item, index) => !usedFallback.has(index) && existingImageMatches(post, item, profile));
    if (exactIndex === -1) return null;
    usedFallback.add(exactIndex);
    return fallbackPool[exactIndex];
  };
  const takeFallback = (post, profile) => {
    const imageAlt = (item) => String(item.imageAlt || '').toLowerCase();
    const preferredPattern =
      profile.family === 'food' || profile.exact === 'food'
        ? /meal prep photo/
        : profile.family === 'planning' || profile.exact === 'planning'
          ? /workout planning photo/
          : /fitness training photo|chest training photo|back training photo|shoulder training photo|arm training photo|leg training photo|core training photo|lat training photo|triceps training photo|upper chest training photo|cable fly training photo|cable row training photo/;
    const patternedIndex = fallbackPool.findIndex((item, index) => !usedFallback.has(index) && preferredPattern.test(imageAlt(item)));
    const pickIndex = fallbackPool.findIndex((item, index) => !usedFallback.has(index) && item.category === post.category);
    const scopeIndex = fallbackPool.findIndex((item, index) => !usedFallback.has(index) && item.scope === post.scope);
    const anyIndex = fallbackPool.findIndex((_, index) => !usedFallback.has(index));
    const index = patternedIndex !== -1 ? patternedIndex : pickIndex !== -1 ? pickIndex : scopeIndex !== -1 ? scopeIndex : anyIndex;
    if (index === -1) return null;
    usedFallback.add(index);
    return fallbackPool[index];
  };
  for (const post of posts) {
    if (post.format !== 'image') continue;
    const queries = imageQueries(post);
    const profile = queries.profile;
    const usePlanning = profile.family === 'planning' || profile.exact === 'planning';
    const matches = (candidate) => imageMatchesProfile(post, candidate, profile);
    let item = takeExisting(post, profile);
    if (item) {
      Object.assign(post, imageMeta(post, item));
      continue;
    }
    if (profile.family === 'article' || profile.family === 'supplement') {
      post.format = 'text';
      post.imageUrl = null;
      post.imageAlt = null;
      post.imageSource = null;
      post.imageCreator = null;
      post.imageLicense = null;
      post.imageLicenseUrl = null;
      post.imagePageUrl = null;
      continue;
    }
    const fallback = takeFallback(post, profile);
    if (!fallback) {
      post.format = 'text';
      post.imageUrl = null;
      post.imageAlt = null;
      post.imageSource = null;
      post.imageCreator = null;
      post.imageLicense = null;
      post.imageLicenseUrl = null;
      post.imagePageUrl = null;
      continue;
    }
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
