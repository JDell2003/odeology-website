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

function title(category, c) {
  const question = {
    training: [`${pretty(c.setting)} has me wondering if ${pretty(c.lift)} is enough for ${pretty(c.part)}`, `${pretty(c.block)} and ${pretty(c.part)} still not clicking for me`, `${pretty(c.constraint)} and ${pretty(c.part)} still lagging`, `${pretty(c.lift)} for ${pretty(c.part)} growth or am i missing something`, `${pretty(c.setting)} and anyone else struggle with ${pretty(c.part)}`],
    nutrition: [`${pretty(c.meal)} got me asking what meals you repeat the most`, `${pretty(c.food)} worth meal prepping or not really`, `${pretty(c.appetite)} and keeping protein high feels impossible`, `${pretty(c.setting)} and food starts getting random fast`, `${pretty(c.food2)} or ${pretty(c.food)} when the day gets messy`],
    recovery: [`${pretty(c.issue)} after normal sessions is getting old`, `${pretty(c.tool)} helping or just placebo for recovery`, `${pretty(c.setting)} and soreness hanging around too long`, `${pretty(c.issue)} and what actually helped you fix it`, `${pretty(c.block)} plus recovery feeling off again`],
    cutting: [`${pretty(c.deficit)} and normal life do not feel compatible rn`, `${pretty(c.hunger)} keeps hijacking this cut`, `${pretty(c.setting)} and staying full on a cut is rough`, `${pretty(c.meal)} making this cut harder than it should be`, `${pretty(c.food)} actually helping anyone stay full lately`],
    bulking: [`${pretty(c.surplus)} and my appetite already tapped out`, `${pretty(c.food)} making bulking easier or just repetitive`, `${pretty(c.setting)} and eating enough feels harder than training`, `${pretty(c.bulk)} keeps showing up halfway through the week`, `${pretty(c.food2)} helping anyone hit calories cleanly`],
    supplements: [`${pretty(c.supp)} doing anything noticeable for you guys`, `${pretty(c.stack)} and i want to cut half of it`, `${pretty(c.supp2)} worth keeping or not really`, `${c.caffeine}mg before training feel normal to you`, `${pretty(c.supp)} plus food and sleep enough for most people`],
    lifestyle: [`${pretty(c.routine)} keeps wrecking my consistency`, `${pretty(c.setting)} and the whole week starts slipping`, `${pretty(c.planner)} helping anyone stay on track long term`, `${pretty(c.routine)} and what part of the week fails first`, `${pretty(c.setting)} making this way harder than it should be`]
  };
  const personal = {
    training: [`${pretty(c.setting)} finally showed me why ${pretty(c.part)} keeps lagging`, `${pretty(c.lift)} started moving once i stopped changing everything`, `${pretty(c.block)} feels way better after trimming junk volume`, `${pretty(c.constraint)} and my ${pretty(c.part)} finally looks better`, `${pretty(c.setting)} but training is finally clicking again`],
    nutrition: [`${pretty(c.food)} is carrying my diet right now`, `${pretty(c.food2)} made meal prep way easier this week`, `${pretty(c.setting)} and simple food is saving me again`, `${pretty(c.food)} finally feels like a meal i can repeat`, `${pretty(c.appetite)} is still annoying but food got easier`],
    recovery: [`${pretty(c.tool)} helped my recovery more than expected`, `${pretty(c.issue)} finally calmed down this week`, `${pretty(c.setting)} made me realize i needed more recovery`, `${pretty(c.block)} felt way better after backing off`, `${pretty(c.issue)} was fatigue more than anything else`],
    cutting: [`${pretty(c.setting)} showed me what keeps ruining my cut`, `${pretty(c.food)} made this cut way easier to stick to`, `${pretty(c.hunger)} chilled out once i fixed meal timing`, `${pretty(c.deficit)} finally feels manageable`, `${pretty(c.meal)} was the part making the cut fall apart`],
    bulking: [`${pretty(c.food)} is the first bulk meal i dont hate`, `${pretty(c.setting)} made my bulk way sloppier than i thought`, `${pretty(c.bulk)} showed up right when the scale got moving`, `${pretty(c.food2)} made calories easier this week`, `${pretty(c.surplus)} feels better when dinner is planned`],
    supplements: [`${pretty(c.stack)} got cut in half and i barely noticed`, `${pretty(c.supp)} is the only tub i keep reaching for`, `${pretty(c.supp2)} is probably getting dropped`, `${pretty(c.stack)} looked useful until i actually audited it`, `${pretty(c.supp)} still feels like the only obvious keeper`],
    lifestyle: [`${pretty(c.planner)} works until ${pretty(c.routine)} shows up`, `${pretty(c.setting)} keeps exposing the weak part of my week`, `${pretty(c.routine)} was quietly ruining everything`, `${pretty(c.planner)} got simpler and consistency improved fast`, `${pretty(c.setting)} made me fix the boring parts first`]
  };
  const advice = {
    training: [`${pretty(c.block)} and ${pretty(c.part)} lagging what would you fix first`, `${pretty(c.lift)} earlier in the session or leave it alone`, `${pretty(c.setting)} and would you change volume or exercise order`, `${pretty(c.constraint)} and what would you fix in this split`, `${pretty(c.part)} behind and im trying not to overreact`],
    nutrition: [`${pretty(c.food)} setup and what would you change first`, `${pretty(c.appetite)} keeps ruining dinner what would you fix`, `${pretty(c.setting)} and should i just lower variety`, `${pretty(c.food2)} vs ${pretty(c.food)} for busy days`, `${pretty(c.meal)} and how would you make this easier`],
    recovery: [`${pretty(c.issue)} and would you deload now or wait`, `${pretty(c.tool)} in place and recovery still off`, `${pretty(c.setting)} and what would you change first`, `${pretty(c.issue)} plus mid sleep what would you fix`, `${pretty(c.block)} and i think volume is too high maybe`],
    cutting: [`${pretty(c.hunger)} at night and what would you change`, `${pretty(c.deficit)} plus busy days what would you fix first`, `${pretty(c.setting)} and should i clean weekends up first`, `${pretty(c.food)} setup and how would you make it easier`, `${pretty(c.meal)} and this cut still feels sloppy`],
    bulking: [`${pretty(c.bulk)} showing up and what would you change`, `${pretty(c.food)} setup and should i add liquid calories`, `${pretty(c.setting)} and appetite keeps dropping`, `${pretty(c.surplus)} from here or would you hold it`, `${pretty(c.food2)} helping but the bulk still feels messy`],
    supplements: [`${pretty(c.stack)} and what would you drop first`, `${pretty(c.supp)} staying but the rest feels questionable`, `${pretty(c.supp2)} worth keeping in this stack or no`, `${c.caffeine}mg and pre workout every day too much maybe`, `${pretty(c.stack)} and what would you actually spend money on`],
    lifestyle: [`${pretty(c.routine)} by friday and what would you change`, `${pretty(c.setting)} and how would you simplify this week`, `${pretty(c.planner)} helping but not enough what would you fix`, `${pretty(c.routine)} keeps breaking the routine what would you do`, `${pretty(c.setting)} and i need a lower friction version of this`]
  };
  const casual = {
    training: [`${pretty(c.setting)} and leg day wrecked me tonight`, `${pretty(c.constraint)} and the gym still took me out`, `${pretty(c.block)} has my arms fried`, `${pretty(c.setting)} and bulgarian split squats still feel illegal`],
    nutrition: [`${pretty(c.setting)} and meal prep already got boring again`, `${pretty(c.food)} but im tired of washing containers`, `${pretty(c.meal)} and eating enough is the actual workout`, `${pretty(c.appetite)} makes protein way more annoying than training`],
    recovery: [`${pretty(c.setting)} and my body wants a day off`, `${pretty(c.issue)} hanging around longer than it should`, `${pretty(c.tool)} or not recovery still feels harder than training`, `${pretty(c.block)} and sleep debt is undefeated`],
    cutting: [`${pretty(c.setting)} and cuts are fun until dinner hits`, `${pretty(c.hunger)} is annoying me today`, `${pretty(c.meal)} and this cut is testing my patience`, `${pretty(c.food)} helps but weekends still make the cut feel fake`],
    bulking: [`${pretty(c.setting)} and bulking is fun until appetite disappears`, `${pretty(c.food)} but im already tired of eating this much`, `${pretty(c.surplus)} and my grocery bill is flying`, `${pretty(c.food2)} plus bulking without getting sloppy is hard`],
    supplements: [`${pretty(c.stack)} getting out of hand again`, `${pretty(c.supp)} and i still cant tell if it matters`, `${c.caffeine}mg is carrying this week`, `${pretty(c.supp2)} and supplement shelves still feel like a scam`],
    lifestyle: [`${pretty(c.setting)} and the routine fell apart again`, `${pretty(c.routine)} makes consistency feel fake`, `${pretty(c.planner)} looked good until real life showed up`, `${pretty(c.setting)} and i still got the work done somehow`]
  };
  const roll = rand();
  let value = '';
  if (roll < 0.4) value = pick(question[category]);
  else if (roll < 0.7) value = pick(personal[category]);
  else if (roll < 0.9) value = pick(advice[category]);
  else value = pick(casual[category]);
  return applyCaptionImperfection(value);
}

function body(category, c) {
  const bodies = {
    training: ['I keep training consistently but one thing is obviously lagging. The main lift is moving and recovery is decent, so I am trying not to throw random volume at the problem.', 'This has been bugging me because the overall split is fine, but one body part is still behind. Curious what you would fix first.', 'Not looking for a magic answer. Just trying to figure out whether this is an exercise order problem, a volume problem, or me being impatient.'],
    nutrition: ['I can eat well for a few days no problem, then the routine gets messy and I start winging it. The easiest thing to repeat is usually what saves the week.', 'Mostly trying to keep food simple enough that I actually stick to it. The hard part is when the day gets busy and I stop wanting to think about meals.', 'I do better when one or two meals are boring on purpose. Curious what foods you guys keep around when motivation is low.'],
    recovery: ['This is not a dramatic injury post. It is more that recovery has felt off long enough that I know something needs to change.', 'Session performance is okay, but afterward I can tell something is getting backed up. Sleep has been mid and that might be the whole answer.', 'Trying not to overreact, but I also do not want to ignore it until it gets worse.'],
    cutting: ['The cut is fine on paper. The real issue is how random the day gets once I am tired or hungry.', 'I can hit the numbers early, then the back half of the day turns into a negotiation with convenience and appetite.', 'Mostly looking for practical fixes, not another perfect plan I will not follow.'],
    bulking: ['Training is good. The food side is what keeps getting weird on busy days.', 'I am trying to keep the surplus intentional instead of just eating random extra stuff late at night.', 'Curious what actually worked for people once appetite stopped cooperating.'],
    supplements: ['I am trying to be honest about what is actually helping and what just makes me feel organized.', 'This started as a simple stack and somehow turned into too many tubs again.', 'Would rather keep the basics and stop pretending every extra scoop matters.'],
    lifestyle: ['I do fine when the week is calm. The second life gets messy, I can see exactly where the routine was never really stable.', 'This feels more like a friction problem than a motivation problem.', 'Trying to build something that works on normal weeks, not just ideal ones.']
  };
  return applyCaptionImperfection(shuffle(bodies[category]).slice(0, rand() < 0.75 ? 2 : 3).join(' '));
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
  return { score: clamp(base, 3, 120), comments: int(3, 7) };
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

function imageSlots(total, target) {
  return new Set(shuffle(Array.from({ length: total }, (_, i) => i)).slice(0, target));
}

function candidate(index, slots) {
  const category = pick(weighted);
  const c = ctx(category);
  const image = slots.has(index);
  const stats = score(category, image);
  const minutesAgo = ageMinutes();
  const hour = int(0, 23);
  const minute = int(0, 59);
  const id = `forum-post-${String(index + 1).padStart(4, '0')}`;
  const postTitle = title(category, c);
  const postBody = body(category, c);
  return {
    id,
    slug: slug(postTitle).slice(0, 96),
    community: pick(cfg[category].communities),
    scope: scopeMap[category] || 'training',
    category,
    author: generateUsername(),
    format: image ? 'image' : 'text',
    title: postTitle,
    body: postBody,
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
  if (seenTitles.has(post.title)) return false;
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
  let attempts = 0;
  while (posts.length < TOTAL && attempts < TOTAL * 500) {
    attempts += 1;
    const post = candidate(posts.length, slots);
    if (!useable(post, seenTitles, seenBodies, seenGrams)) continue;
    commit(post, seenTitles, seenBodies, seenGrams);
    posts.push(post);
  }
  if (posts.length !== TOTAL) {
    const probe = candidate(posts.length, slots);
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
  const titleTerms = words(post.title).filter((word) => word.length > 2).slice(0, 2).join(' ');
  const queries = {
    training: [`${c.part} gym`, `${c.lift} workout`, `${c.block} training`, `${c.setting} dumbbell`],
    nutrition: [`${c.food} meal prep`, `${c.food2} healthy meal`, `${c.meal} protein meal`, `${titleTerms} meal`],
    recovery: [`${c.issue} stretching`, `${c.tool} recovery`, `${c.block} mobility`, `${titleTerms} recovery`],
    cutting: [`${c.food} low calorie meal`, `${c.food2} lean meal`, `${c.meal} healthy meal`, `${titleTerms} meal`],
    bulking: [`${c.food} high calorie meal`, `${c.food2} bodybuilding meal`, `${c.meal} protein meal`, `${titleTerms} meal`],
    supplements: [`${c.supp} shaker`, `${c.supp2} supplement`, `${c.stack} gym bag`, `${titleTerms} supplement`],
    lifestyle: [`${c.planner} planner`, 'fitness planner notebook', 'meal prep calendar', `${titleTerms} planner`]
  };
  return uniq([...(queries[post.category] || []), ...cfg[post.category].fallback, titleTerms]);
}

function broadImageQueries(category) {
  const map = {
    training: ['fitness', 'gym', 'exercise'],
    nutrition: ['food', 'meal', 'cooking'],
    recovery: ['stretching', 'walking', 'mobility'],
    cutting: ['healthy food', 'meal prep', 'food'],
    bulking: ['bodybuilding food', 'meal prep', 'food'],
    supplements: ['shaker bottle', 'supplement', 'nutrition'],
    lifestyle: ['planner', 'notebook', 'calendar']
  };
  return map[category] || ['photo'];
}

function imageMeta(post, item) {
  return {
    imageUrl: item.url,
    imageAlt: `${post.category} image for ${post.title}`,
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
  return {
    imageUrl: item.imageUrl,
    imageAlt: `${post.category} image for ${post.title}`,
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
    if (fallbackPool.length >= imageCount) {
      const fallback = takeFallback(post);
      if (!fallback) throw new Error(`No unique fallback image found for ${post.id}`);
      Object.assign(post, applyExistingImage(post, fallback));
      continue;
    }
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
  const { _c, imageId, ...rest } = post;
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
