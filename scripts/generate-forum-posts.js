const fs = require('fs');
const path = require('path');

const OUT = path.join(process.cwd(), 'data', 'forum-posts.json');
const TOTAL = 2000;
const IMAGE_TARGET = 1000;
const SEED = 20260315;
const NGRAM = 4;
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
const cfg = {
  training: { communities: ['r/odeology_forum', 'r/training', 'r/pushpulllegs', 'r/homegym'], authors: ['garage_rack_log', 'rep_quality_first', 'benchblocknotes', 'set_count_journal'], tags: ['training', 'hypertrophy', 'execution'], fallback: ['strength workout gym', 'barbell workout', 'dumbbell training'] },
  nutrition: { communities: ['r/nutrition', 'r/mealprep', 'r/highprotein', 'r/easymeals'], authors: ['protein_platebook', 'rice_and_rituals', 'prepdayrepeat', 'macro_margin'], tags: ['nutrition', 'meals', 'protein'], fallback: ['high protein meal prep', 'healthy meal prep', 'protein meal'] },
  recovery: { communities: ['r/recovery', 'r/mobility', 'r/deload', 'r/sleepforgains'], authors: ['restdaywalker', 'sleep_window', 'mobility_minute', 'recovery_notes'], tags: ['recovery', 'sleep', 'mobility'], fallback: ['mobility stretching', 'recovery stretching', 'walking recovery'] },
  cutting: { communities: ['r/cutting', 'r/caloriedeficit', 'r/leaningout', 'r/recompnotes'], authors: ['deficit_diary', 'lean_phase_log', 'satiety_first', 'cut_week_check'], tags: ['fat-loss', 'nutrition', 'consistency'], fallback: ['healthy low calorie meal', 'lean meal prep', 'salad protein meal'] },
  bulking: { communities: ['r/bulking', 'r/gaining', 'r/massphase', 'r/strengthmeals'], authors: ['surplus_journal', 'massphasecook', 'big_plate_simple', 'bulkweeknotes'], tags: ['muscle-gain', 'nutrition', 'surplus'], fallback: ['high calorie meal prep', 'bodybuilding meal', 'protein rice bowl'] },
  supplements: { communities: ['r/supplements', 'r/creatine', 'r/preworkout', 'r/proteinpowder'], authors: ['stack_check', 'simple_supps_only', 'label_reader', 'scoopandgo'], tags: ['supplements', 'performance', 'creatine'], fallback: ['supplement shaker bottle', 'protein powder shaker', 'gym bag supplements'] },
  lifestyle: { communities: ['r/consistency', 'r/busyfitness', 'r/weekendreset', 'r/systemsoverhype'], authors: ['calendar_and_cals', 'habit_stack_daily', 'busyweeklift', 'reset_sunday'], tags: ['consistency', 'lifestyle', 'planning'], fallback: ['fitness planner notebook', 'workout calendar planner', 'meal prep notebook'] }
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
  return { week: `week ${pick(pool.week)}`, days: pick(pool.days), len: pick(pool.len), sleep: pick(pool.sleep), steps: pick(pool.steps), protein: pick(pool.protein), budget: pick(pool.budget), meals: pick(pool.meals), setting: pick(pool.setting), constraint: pick(pool.constraint), tag: `${pick(pool.tag1)} ${pick(pool.tag2)}` };
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

function title(category, c) {
  if (category === 'training') return withLead(c, ['check', 'question', 'update', 'note', 'rant', 'look'], pick([
    `${cap(c.part)} on ${pretty(c.block)}: ${pretty(c.lift)} climbs, ${pretty(c.friction)} stays`,
    `${cap(c.setting)} with ${pretty(c.part)}: ${pretty(c.block)} fits, ${pretty(c.constraint)} bites`,
    `${cap(c.constraint)} for ${pretty(c.part)}: ${pretty(c.lift)} stays, ${pretty(c.block)} changes`,
    `${cap(c.friction)} after ${c.week}: ${pretty(c.part)} lag, ${pretty(c.setting)} adds noise`,
    `${cap(c.block)} for ${pretty(c.part)}: ${pretty(c.setting)} works, ${pretty(c.constraint)} does not`,
    `${cap(c.lift)} days for ${pretty(c.part)}: ${pretty(c.block)} helps, ${pretty(c.friction)} wins`,
    `${cap(c.part)} check with ${pretty(c.setting)}: ${pretty(c.lift)} solid, ${pretty(c.constraint)} annoying`,
    `${cap(c.setting)} x ${pretty(c.block)}: ${pretty(c.part)} late, ${pretty(c.lift)} early`,
    `${cap(c.part)} update after ${c.week}: ${pretty(c.block)} good, ${pretty(c.friction)} louder`,
    `${cap(c.block)} around ${pretty(c.part)}: ${pretty(c.setting)} calm, ${pretty(c.constraint)} messy`
  ]));
  if (category === 'nutrition') return withLead(c, ['meal', 'thought', 'question', 'check', 'note', 'update'], pick([
    `${cap(c.food)} for ${pretty(c.meal)}: ${c.protein}g fits, ${pretty(c.appetite)} does not`,
    `${cap(c.food)} vs ${pretty(c.food2)}: ${pretty(c.meal)} picks ${pretty(c.food)}, ${pretty(c.appetite)} picks ${pretty(c.food2)}`,
    `${cap(c.setting)} with ${pretty(c.food)}: ${c.budget} holds, ${pretty(c.appetite)} pushes back`,
    `${cap(c.meal)} around ${pretty(c.food)}: ${pretty(c.food2)} travels, ${c.protein}g still lands`,
    `${c.budget} dollar ${pretty(c.meal)}: ${pretty(c.food)} stays cheap, ${c.protein}g stays possible`,
    `${cap(c.appetite)} after ${c.week}: ${pretty(c.food)} easy, ${pretty(c.setting)} not easy`,
    `${cap(c.food2)} on ${pretty(c.setting)}: ${c.protein}g lands, ${pretty(c.appetite)} lingers`,
    `${cap(c.food)} check for ${pretty(c.setting)}: ${pretty(c.meal)} smooth, ${pretty(c.appetite)} loud`,
    `${cap(c.meal)} with ${pretty(c.food2)}: ${c.budget} okay, ${pretty(c.appetite)} still weird`,
    `${cap(c.food)} after ${c.week}: ${c.protein}g easy, ${pretty(c.food2)} tempting`
  ]));
  if (category === 'recovery') return withLead(c, ['reality', 'check', 'question', 'note', 'update', 'rant'], pick([
    `${cap(c.issue)} with ${pretty(c.tool)}: ${pretty(c.block)} improves, ${pretty(c.setting)} stings`,
    `${cap(c.tool)} for ${pretty(c.issue)}: ${pretty(c.part)} calms down, ${c.days} days still drag`,
    `${cap(c.block)} plus ${pretty(c.issue)}: ${c.sleep}h helps, ${pretty(c.setting)} hurts`,
    `${cap(c.issue)} after ${c.week}: ${pretty(c.tool)} stays, ${pretty(c.part)} still complains`,
    `${cap(c.setting)} around ${pretty(c.issue)}: ${pretty(c.block)} survives, ${pretty(c.tool)} barely does`,
    `${cap(c.part)} on ${pretty(c.issue)}: ${pretty(c.tool)} helps, ${c.steps}k still feels low`,
    `${cap(c.tool)} during ${pretty(c.block)}: ${pretty(c.issue)} softer, ${pretty(c.setting)} louder`,
    `${cap(c.issue)} check with ${pretty(c.part)}: ${pretty(c.tool)} real, ${pretty(c.block)} maybe real`,
    `${cap(c.setting)} after ${c.week}: ${pretty(c.issue)} up, ${pretty(c.tool)} also up`,
    `${cap(c.block)} with ${pretty(c.tool)}: ${pretty(c.issue)} less sharp, ${c.sleep}h still short`
  ]));
  if (category === 'cutting') return withLead(c, ['cut', 'check', 'question', 'update', 'note', 'reality'], pick([
    `${cap(c.deficit)} with ${pretty(c.food)}: ${pretty(c.meal)} works, ${pretty(c.hunger)} follows`,
    `${cap(c.food)} on ${pretty(c.deficit)}: ${c.protein}g lands, ${pretty(c.hunger)} stays`,
    `${cap(c.meal)} during ${pretty(c.deficit)}: ${pretty(c.food)} helps, ${pretty(c.food2)} travels`,
    `${cap(c.hunger)} after ${c.week}: ${pretty(c.food)} steady, ${c.steps}k daily`,
    `${cap(c.setting)} in ${pretty(c.deficit)}: ${pretty(c.food)} easy, ${pretty(c.hunger)} loud`,
    `${cap(c.hunger)} with ${pretty(c.meal)}: ${c.protein}g holds, ${pretty(c.food)} also holds`,
    `${c.steps}k and ${pretty(c.deficit)}: ${pretty(c.food)} fine, ${pretty(c.hunger)} annoying`,
    `${cap(c.food)} vs ${pretty(c.food2)}: ${pretty(c.deficit)} keeps ${pretty(c.food)}, ${pretty(c.hunger)} keeps ${pretty(c.food2)}`,
    `${cap(c.deficit)} after ${c.week}: ${pretty(c.meal)} shaky, ${pretty(c.food)} reliable`,
    `${cap(c.food2)} for ${pretty(c.deficit)}: ${c.protein}g okay, ${pretty(c.hunger)} not okay`
  ]));
  if (category === 'bulking') return withLead(c, ['bulk', 'check', 'question', 'update', 'note', 'look'], pick([
    `${cap(c.surplus)} with ${pretty(c.food)}: ${pretty(c.food2)} helps, ${pretty(c.bulk)} shows up`,
    `${cap(c.food)} on ${pretty(c.surplus)}: ${c.meals} meals okay, ${pretty(c.bulk)} gets loud`,
    `${cap(c.meal)} during ${pretty(c.surplus)}: ${pretty(c.food)} lands, ${pretty(c.food2)} lands easier`,
    `${cap(c.bulk)} after ${c.week}: ${pretty(c.food)} saves mornings, ${pretty(c.food2)} saves later`,
    `${cap(c.setting)} on ${pretty(c.surplus)}: ${pretty(c.food)} works, ${pretty(c.bulk)} lingers`,
    `${c.meals} meals in ${pretty(c.surplus)}: ${pretty(c.food)} solid, ${pretty(c.food2)} smoother`,
    `${cap(c.food2)} with ${pretty(c.bulk)}: ${pretty(c.meal)} easier, ${pretty(c.surplus)} still clean`,
    `${cap(c.food)} vs ${pretty(c.food2)}: ${pretty(c.surplus)} needs ${pretty(c.food)}, appetite needs ${pretty(c.food2)}`,
    `${cap(c.surplus)} after ${c.week}: ${pretty(c.bulk)} worse, ${pretty(c.food)} better`,
    `${cap(c.bulk)} on ${pretty(c.setting)}: ${pretty(c.food)} reliable, ${c.meals} still not enough`
  ]));
  if (category === 'supplements') return withLead(c, ['stack', 'check', 'question', 'update', 'note', 'thought'], pick([
    `${cap(c.supp)} with ${pretty(c.stack)}: ${pretty(c.supp2)} stays, ${c.caffeine}mg already carries`,
    `${cap(c.stack)} around ${pretty(c.supp)}: ${pretty(c.supp2)} extra, ${c.caffeine}mg enough`,
    `${cap(c.supp)} vs ${pretty(c.supp2)}: bag keeps ${pretty(c.supp)}, budget cuts ${pretty(c.supp2)}`,
    `${c.caffeine}mg plus ${pretty(c.supp)}: ${pretty(c.stack)} enough, ${pretty(c.supp2)} optional`,
    `${cap(c.supp2)} in ${pretty(c.stack)}: ${pretty(c.supp)} earns space, ${c.caffeine}mg earns more`,
    `${cap(c.supp)} after ${c.week}: ${pretty(c.stack)} simple, ${pretty(c.supp2)} probably out`,
    `${cap(c.stack)} with ${c.caffeine}mg: ${pretty(c.supp)} clear, ${pretty(c.supp2)} cloudy`,
    `${cap(c.supp2)} on ${pretty(c.stack)}: ${pretty(c.supp)} stays obvious, ${c.caffeine}mg stays louder`,
    `${cap(c.supp)} for ${pretty(c.stack)}: ${c.caffeine}mg fixed, ${pretty(c.supp2)} maybe fluff`,
    `${cap(c.stack)} after ${c.week}: ${pretty(c.supp)} survives, ${pretty(c.supp2)} gets cut`
  ]));
  return withLead(c, ['reset', 'check', 'question', 'note', 'update', 'reality'], pick([
    `${cap(c.planner)} with ${pretty(c.setting)}: ${pretty(c.food)} helps, ${pretty(c.routine)} still hits`,
    `${cap(c.routine)} after ${c.week}: ${pretty(c.planner)} helps, ${pretty(c.food)} saves nights`,
    `${cap(c.setting)} with ${pretty(c.planner)}: ${pretty(c.food)} holds, ${pretty(c.routine)} leaks`,
    `${cap(c.planner)} vs ${pretty(c.routine)}: ${pretty(c.food)} fits one, ${pretty(c.setting)} breaks one`,
    `${cap(c.food)} plus ${pretty(c.planner)}: ${pretty(c.routine)} still finds gaps`,
    `${cap(c.setting)} after ${c.week}: ${pretty(c.planner)} okay, ${pretty(c.routine)} louder`,
    `${cap(c.routine)} with ${pretty(c.food)}: ${pretty(c.planner)} helps, mornings still wobble`,
    `${cap(c.planner)} around ${pretty(c.setting)}: ${pretty(c.food)} stays ready, sleep does not`,
    `${cap(c.food)} for ${pretty(c.routine)}: ${pretty(c.setting)} messy, ${pretty(c.planner)} cleaner`,
    `${cap(c.setting)} x ${pretty(c.planner)}: ${pretty(c.routine)} late, ${pretty(c.food)} early`
  ]));
}

function body(category, c) {
  if (category === 'training') return pick([
    `Not gonna lie, this block looks better on paper than it feels in the mirror. I have been running ${pretty(c.block)} for ${c.week} in ${pretty(c.setting)}, keeping food around ${c.protein}g and steps near ${c.steps}k, and ${pretty(c.part)} still read like the slowest responder.`,
    `This is one of those phases where I do not want more fluff, I want one clean fix. ${pretty(c.lift)} feels good, ${pretty(c.constraint)} is real, and ${pretty(c.friction)} keeps making me wonder if ${pretty(c.part)} need more intent instead of more volume.`,
    `I am trying to coach myself like a normal person, not a spreadsheet. ${pretty(c.setting)} is the reality, ${pretty(c.block)} is the plan, and ${pretty(c.part)} are the part that still make me think I am missing something obvious.`,
    `Honestly, the rest of the setup is boring in a good way. Sleep is around ${c.sleep} hours, sessions land inside ${pretty(c.constraint)}, and ${pretty(c.part)} still look late compared with how ${pretty(c.lift)} is moving.`
  ]);
  if (category === 'nutrition') return pick([
    `This is the kind of meal setup I can actually repeat without feeling like I am cosplaying a bodybuilder. ${pretty(c.food)} has been doing the heavy lifting, ${pretty(c.meal)} is still the stress point, and ${pretty(c.appetite)} is usually what turns a clean day into a random day.`,
    `I am aiming for about ${c.protein}g across ${c.meals} meals and trying to keep groceries near ${c.budget}. The part I still hate is how fast ${pretty(c.setting)} can turn a good plan into whatever I can grab in two minutes.`,
    `Low-key, I do not need a fancier plan, I need a default that survives noise. ${pretty(c.food)} works, ${pretty(c.food2)} travels better, and ${pretty(c.appetite)} keeps deciding whether I stay on script or start winging it.`,
    `The goal here is food that feels automatic, not food that deserves applause. ${pretty(c.meal)} is where I usually lose rhythm, so I keep testing ${pretty(c.food)} against ${pretty(c.food2)} and seeing which one survives a messy week better.`
  ]);
  if (category === 'recovery') return pick([
    `I can feel the difference between something being annoying and something being unsustainable, and this is getting close to the second bucket. ${pretty(c.issue)} is the part that keeps hanging around even though I already added ${pretty(c.tool)} and cleaned up the obvious stuff.`,
    `The session itself usually feels okay. Then later on ${pretty(c.issue)} shows up and makes me re-read the whole block in my head. I am around ${c.sleep} hours, ${c.steps}k steps, and ${c.days} training days, so I am trying not to be dramatic before I need to be.`,
    `I do not mind doing recovery work when it clearly pays off. What gets old is doing ${pretty(c.tool)} and still not trusting whether ${pretty(c.issue)} is actually moving in the right direction or just getting quieter for a day.`,
    `This is the kind of thing that makes a good block feel sloppy. ${pretty(c.block)} still makes sense, but ${pretty(c.setting)} plus ${pretty(c.issue)} keeps making me wonder whether I need less stress, better prep, or a straight-up deload.`
  ]);
  if (category === 'cutting') return pick([
    `The calories are not the hard part right now. ${pretty(c.hunger)} is. I can hold a ${c.deficit}, keep steps around ${c.steps}k, and still feel the day go sideways the second ${pretty(c.meal)} stops being predictable.`,
    `I wanted this cut to feel boring, and instead it keeps turning into little negotiations with hunger. ${pretty(c.food)} is the one meal that keeps me calm, ${pretty(c.food2)} is the one that travels best, and neither fully solves ${pretty(c.hunger)} once the week gets long.`,
    `Training is holding up better than my patience with food. ${c.protein}g is manageable, the deficit is fine on paper, and then ${pretty(c.setting)} plus ${pretty(c.hunger)} makes me feel like I am one sloppy dinner away from improvising the whole day.`,
    `This is less about suffering and more about friction. ${pretty(c.food)} keeps me inside the lines, ${pretty(c.meal)} is still the wobble point, and I am trying to fix the setup before I blame the deficit itself.`
  ]);
  if (category === 'bulking') return pick([
    `I am trying to keep this bulk looking intentional instead of just bigger portions plus bad decisions. ${pretty(c.food)} is the easiest win, ${pretty(c.food2)} is the backup, and ${pretty(c.bulk)} is the part that keeps showing up once the day gets long.`,
    `The first half of the day usually feels easy. Then appetite shifts, meal ${c.meals} starts feeling expensive, and the whole surplus goes from planned to improvised way too fast. That is the part I am trying to tighten up.`,
    `I do not want extra calories to feel chaotic. A ${c.surplus} is fine, ${pretty(c.setting)} is manageable, and I can still tell exactly when the structure breaks and the bulk starts feeling dirtier than I want.`,
    `The goal is more food, not more noise. ${pretty(c.food)} keeps the numbers moving, ${pretty(c.bulk)} keeps testing my patience, and I am trying to find the version of this phase that still feels clean by Friday night.`
  ]);
  if (category === 'supplements') return pick([
    `I am in the mood to cut containers, not add new ones. ${pretty(c.supp)} is the one I still trust, ${pretty(c.supp2)} is the one I keep questioning, and ${c.caffeine}mg already does most of the heavy lifting I actually notice.`,
    `This stack got built one small purchase at a time, and now I am trying to figure out which pieces are real and which pieces just look disciplined on the counter. ${pretty(c.stack)} sounded smart when I put it together; now I am less convinced.`,
    `Food and training still run the whole show for me, so I am trying to be brutally honest about what belongs in the bag. If ${pretty(c.supp2)} disappeared tomorrow, I am not sure I could tell without looking at the label.`,
    `There is a big difference between useful and just familiar. ${pretty(c.supp)} has earned that spot so far, but I keep looking at the rest of the stack and thinking I might be paying for routine more than effect.`
  ]);
  return pick([
    `I am pretty sure motivation is not the problem here anymore. Structure is. ${pretty(c.planner)} works when life stays calm, ${pretty(c.routine)} is what shows up when life does not, and that gap is what I am trying to close.`,
    `The thing I want most is a routine that still works on a weird week. ${pretty(c.setting)} keeps exposing what is real, ${pretty(c.food)} keeps saving the evenings, and I can still tell the whole setup is a little too fragile.`,
    `I do not need a harder plan. I need a plan that survives real life. ${pretty(c.planner)} helps, ${pretty(c.routine)} keeps testing it, and I am trying to simplify before I start pretending I just need more discipline.`,
    `Some weeks make me feel organized, other weeks make me feel like I built the whole system for a version of life I do not actually live. That is why I keep trimming, testing, and seeing what still holds once the noise shows up.`
  ]);
}

const scopeMap = { training: 'training', nutrition: 'nutrition', recovery: 'recovery', cutting: 'nutrition', bulking: 'nutrition', supplements: 'nutrition', lifestyle: 'training' };

function score(category, image) {
  const span = {
    training: [125, 840], nutrition: [100, 790], recovery: [45, 520], cutting: [120, 930],
    bulking: [95, 740], supplements: [40, 430], lifestyle: [30, 410]
  }[category] || [30, 400];
  const base = int(span[0], span[1]) + (image ? int(12, 120) : 0);
  return { score: clamp(base, 18, 1200), comments: clamp(Math.round(base * (image ? 0.14 : 0.19) + int(4, 34)), 8, 420) };
}

function imageSlots(total, target) {
  return new Set(shuffle(Array.from({ length: total }, (_, i) => i)).slice(0, target));
}

function candidate(index, slots) {
  const category = pick(weighted);
  const c = ctx(category);
  const image = slots.has(index);
  const stats = score(category, image);
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
    author: pick(cfg[category].authors),
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
    preferredHourLocal: hour,
    preferredMinuteLocal: minute,
    preferredWindow: hour < 11 ? 'morning' : hour < 17 ? 'afternoon' : 'evening',
    botSource: 'seeded-forum-generator',
    _c: c
  };
}

function useable(post, seenTitles, seenBodies, seenGrams) {
  if (seenTitles.has(post.title)) return false;
  if (seenBodies.has(post.body)) return false;
  return grams(post.title).every((gram) => !seenGrams.has(gram));
}

function commit(post, seenTitles, seenBodies, seenGrams) {
  seenTitles.add(post.title);
  seenBodies.add(post.body);
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
  if (dup !== 0) throw new Error(`Generator produced ${dup} duplicate 4-word phrases`);
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
      duplicateTitleFourWordPhrases: dup,
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
