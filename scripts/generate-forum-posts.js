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

function title(category, c) {
  if (category === 'training') return `${titleLead(c)}, ${pretty(c.setting)}: ${pick([
    `${pretty(c.part)} lagging, ${pretty(c.lift)} climbing, ${pretty(c.block)} unchanged`,
    `${pretty(c.setting)} exposing ${pretty(c.part)}, ${pretty(c.constraint)} shrinking ${pretty(c.block)}`,
    `${pretty(c.friction)} returning, ${pretty(c.part)} stalling, ${pretty(c.lift)} rising`,
    `${pretty(c.block)} running smooth, ${pretty(c.part)} still not catching up`,
    `${pretty(c.constraint)} squeezing sessions, ${pretty(c.part)} paying first`,
    `${pretty(c.setting)} consistent, ${pretty(c.part)} progress still off`,
    `${pretty(c.lift)} better, ${pretty(c.part)} flatter, ${pretty(c.friction)} louder`,
    `${pretty(c.block)} helping most things, ${pretty(c.part)} missing the memo`,
    `${pretty(c.friction)} back again, ${pretty(c.part)} growth slowing down`,
    `${pretty(c.constraint)} tighter now, ${pretty(c.part)} showing it first`
  ])}`;
  if (category === 'nutrition') return `${titleLead(c)}, ${pretty(c.meal)}: ${pick([
    `${pretty(c.food)} surviving ${pretty(c.meal)}, ${pretty(c.appetite)} killing consistency`,
    `${c.protein}g planned, ${pretty(c.appetite)} arriving, ${pretty(c.food)} still easiest`,
    `${c.budget} groceries, ${pretty(c.food)} staying, ${pretty(c.food2)} traveling`,
    `${pretty(c.setting)} messy again, ${pretty(c.food)} still beating ${pretty(c.food2)}`,
    `${pretty(c.meal)} getting rough, ${pretty(c.food)} carrying the day`,
    `${pretty(c.appetite)} rising, ${pretty(c.food2)} looking better than usual`,
    `${pretty(c.setting)} hitting hard, ${pretty(c.food)} staying repeatable`,
    `${pretty(c.food)} carrying protein, ${pretty(c.food2)} carrying convenience`,
    `${pretty(c.food2)} packing easier, ${pretty(c.food)} keeping me on track`,
    `${pretty(c.appetite)} back again, ${pretty(c.food)} still saving the plan`
  ])}`;
  if (category === 'recovery') return `${titleLead(c)}, ${pretty(c.tool)}: ${pick([
    `${pretty(c.issue)} outlasting ${pretty(c.tool)} again`,
    `${pretty(c.block)} solid in session, ${pretty(c.issue)} loud after`,
    `${pretty(c.setting)} rougher lately, ${pretty(c.issue)} easier to notice`,
    `${pretty(c.tool)} helping a little, ${pretty(c.issue)} coming back anyway`,
    `${pretty(c.issue)} hanging around, ${pretty(c.block)} looking messier`,
    `${pretty(c.setting)} amplifying ${pretty(c.issue)} more than expected`,
    `${pretty(c.tool)} softening it, ${pretty(c.issue)} refusing to leave`,
    `${pretty(c.issue)} showing up late, ${pretty(c.block)} losing trust`,
    `${pretty(c.setting)} heavier now, ${pretty(c.issue)} heavier too`,
    `${pretty(c.issue)} still there, even after better recovery`
  ])}`;
  if (category === 'cutting') return `${titleLead(c)}, ${pretty(c.meal)}: ${pick([
    `${pretty(c.food)} holding ${pretty(c.deficit)}, ${pretty(c.hunger)} blowing up nights`,
    `${pretty(c.meal)} breaking ${pretty(c.deficit)}, ${pretty(c.food2)} helping, ${pretty(c.food)} winning`,
    `${pretty(c.food2)} traveling better, ${pretty(c.food)} keeping me fuller`,
    `${pretty(c.setting)} messy again, ${pretty(c.hunger)} feeling worse than calories`,
    `${pretty(c.hunger)} bigger now, ${pretty(c.deficit)} feeling smaller on paper`,
    `${pretty(c.food)} still winning this cut by Friday`,
    `${pretty(c.food2)} useful early, ${pretty(c.hunger)} stronger late`,
    `${pretty(c.meal)} wobbling again, clean cut turning random`,
    `${pretty(c.deficit)} manageable until ${pretty(c.setting)} gets chaotic`,
    `${pretty(c.food)} doing more for this cut than macro math`
  ])}`;
  if (category === 'bulking') return `${titleLead(c)}, ${pretty(c.food)}: ${pick([
    `${pretty(c.food)} carrying ${pretty(c.surplus)}, ${pretty(c.bulk)} wrecking later meals`,
    `meal ${c.meals} flipping ${pretty(c.surplus)} into random snacking`,
    `${pretty(c.food2)} going down easier, ${pretty(c.food)} keeping calories cleaner`,
    `${pretty(c.setting)} making ${pretty(c.surplus)} look sloppier than planned`,
    `${pretty(c.bulk)} showing up right when the scale gets fun`,
    `${pretty(c.food)} still feeling like my cleanest late week calories`,
    `${pretty(c.surplus)} fine early, appetite gone near meal ${c.meals}`,
    `${pretty(c.food2)} helping appetite, ${pretty(c.food)} fitting the plan better`,
    `${pretty(c.bulk)} making this lean bulk way messier`,
    `${pretty(c.setting)} pushing the bulk toward convenience over structure`
  ])}`;
  if (category === 'supplements') return `${titleLead(c)}, ${pretty(c.supp)}: ${pick([
    `${pretty(c.supp)} staying, ${pretty(c.supp2)} fading, ${pretty(c.stack)} shrinking`,
    `${c.caffeine}mg doing more than half this ${pretty(c.stack)}`,
    `${pretty(c.stack)} feeling cluttered next to ${pretty(c.supp)}`,
    `${pretty(c.supp2)} still invisible beside ${pretty(c.supp)}`,
    `${pretty(c.stack)} looking smart, then feeling unnecessary`,
    `${pretty(c.supp)} earning its spot, ${pretty(c.supp2)} losing ground`,
    `${c.caffeine}mg and ${pretty(c.supp)} doing the real work`,
    `${pretty(c.supp2)} making me want a smaller cheaper stack`,
    `${pretty(c.stack)} turning into habit over help`,
    `${pretty(c.supp)} obvious, the rest still questionable`
  ])}`;
  return `${titleLead(c)}, ${pretty(c.setting)}: ${pick([
    `${pretty(c.planner)} helping until ${pretty(c.routine)} shows up`,
    `${pretty(c.setting)} exposing the weak spot in my routine`,
    `normal weeks fine, ${pretty(c.routine)} breaking everything`,
    `${pretty(c.setting)} making this system look too complicated`,
    `${pretty(c.planner)} folding when ${pretty(c.routine)} hits`,
    `${pretty(c.planner)} cannot save ${pretty(c.setting)} plus ${pretty(c.routine)}`,
    `${pretty(c.setting)} still being the part my routine cannot survive`,
    `${pretty(c.routine)} starting the consistency leak every time`,
    `perfect weeks easy, ${pretty(c.setting)} testing the real plan`,
    `${pretty(c.planner)} helping, ${pretty(c.routine)} still winning too often`
  ])}`;
}

function body(category, c) {
  if (category === 'training') return pick([
    `I have been running ${pretty(c.block)} for ${c.week} and overall I like it, but ${pretty(c.part)} progress is clearly behind. ${pretty(c.lift)} feels stronger, recovery is decent, and I do not want to add junk volume just to feel productive. If you were in this spot, would you change exercise order, weekly sets, or just let it ride longer?`,
    `The reality is ${pretty(c.setting)} and ${pretty(c.constraint)} are not changing any time soon. I can stay consistent, but ${pretty(c.friction)} keeps showing up and I cannot tell whether ${pretty(c.part)} needs more attention or just better placement in the session.`,
    `Protein is around ${c.protein}g, sleep is about ${c.sleep} hours, and steps are near ${c.steps}k, so the basics are not terrible. That is why ${pretty(c.part)} progress being behind is starting to bother me more than it should.`,
    `I am not chasing a crazy fix here. I just want ${pretty(c.part)} to stop being the thing that makes the whole block feel incomplete, especially when ${pretty(c.lift)} is moving in the right direction.`
  ]);
  if (category === 'nutrition') return pick([
    `I keep coming back to ${pretty(c.food)} because it is easy, repeatable, and does not make me hate eating for this goal. I am aiming for ${c.protein}g across ${c.meals} meals, but ${pretty(c.appetite)} is usually what turns a clean day into a random one.`,
    `The ${pretty(c.meal)} stretch is where my whole plan usually starts slipping. I can prep ${pretty(c.food)} or ${pretty(c.food2)}, but once the day gets busy I start improvising and the numbers drift faster than I want.`,
    `I am trying to keep groceries around ${c.budget} a week and still make high protein eating feel normal. Right now most of the workload is falling on ${pretty(c.food)}, and I can tell the setup gets shaky during ${pretty(c.setting)} stretches.`,
    `I do not need fancy food. I need food I will actually repeat when I am tired, busy, or bored. That is why I keep testing ${pretty(c.food)} against ${pretty(c.food2)} instead of chasing another perfect recipe.`
  ]);
  if (category === 'recovery') return pick([
    `${pretty(c.issue)} is the one thing making this block feel less sustainable than it should. I already added ${pretty(c.tool)}, sleep is around ${c.sleep} hours, and I am trying not to overreact, but it keeps hanging around long enough to make me second guess the whole setup.`,
    `Everything feels fine during the session and then ${pretty(c.issue)} shows up later and ruins the confidence. I am training ${c.days} days, steps are around ${c.steps}k, and I cannot tell whether I need less volume, a better warm up, or just more patience.`,
    `I do not mind doing recovery work when I can actually feel it helping. The frustrating part is that even with ${pretty(c.tool)} in the mix, I still do not trust ${pretty(c.issue)} is actually getting fixed.`,
    `This is not dramatic pain, it is just annoying enough to keep stealing attention. That is why I am trying to figure out whether the problem is recovery, exercise setup, or the fact that ${pretty(c.setting)} has been rough lately.`
  ]);
  if (category === 'cutting') return pick([
    `The cut itself is not killing me. ${pretty(c.hunger)} is. I can handle a ${pretty(c.deficit)}, keep steps around ${c.steps}k, and still feel the day go sideways once ${pretty(c.meal)} stops being predictable.`,
    `${pretty(c.food)} is the one meal that keeps me calm, ${pretty(c.food2)} travels better, and neither fully solves the mental side of a long cut. That is the part I am trying to clean up before I blame the calories.`,
    `Training is holding up better than my patience with food. ${c.protein}g is manageable, the deficit is fine on paper, and then ${pretty(c.setting)} plus ${pretty(c.hunger)} makes me want to improvise dinner.`,
    `I wanted this cut to feel boring. Instead it keeps turning into little negotiations with hunger, convenience, and how much I want to think about food after work.`
  ]);
  if (category === 'bulking') return pick([
    `The bulk is going fine until ${pretty(c.bulk)} starts showing up. I am aiming for about a ${pretty(c.surplus)}, and ${pretty(c.food)} has been the easiest way to push calories up without feeling gross.`,
    `Meal ${c.meals} is where the whole thing starts feeling like work. I can get most of my food in early, but once appetite drops I either force it or start eating random stuff that does not feel worth it.`,
    `I want the extra calories to feel intentional, not like I am just snacking my way into a surplus. ${pretty(c.food)} and ${pretty(c.food2)} both work, but one probably needs to become the boring default.`,
    `This is the part of bulking nobody sold me on. The training is fun, the scale moving is fun, and then digestion, appetite, and a normal schedule all start negotiating with each other.`
  ]);
  if (category === 'supplements') return pick([
    `I am at the point where I would rather simplify the stack than keep pretending every tub matters. ${pretty(c.supp)} is the one I expect to keep, ${pretty(c.supp2)} is the one I keep side eyeing, and ${c.caffeine}mg already covers most of what I actually feel.`,
    `Training and food are still the main drivers for me, so I am trying to be honest about what is earning a place in the bag. Right now this is basically a ${pretty(c.stack)}, and I am not convinced every piece deserves to survive.`,
    `The more I look at my setup, the more I think I bought convenience instead of results. If you cut your stack back to the things you could genuinely notice, what would still be left?`,
    `I am not anti supplement, I am just anti pretending. If something matters, I want to be able to point to what it is actually doing besides making me feel organized.`
  ]);
  return pick([
    `I do not think motivation is the issue anymore. I think the system is. ${pretty(c.planner)} works until ${pretty(c.routine)} shows up, and then the whole week starts feeling improvised again.`,
    `My training is fine when the schedule is calm. The second life gets noisy, I can tell which parts of the routine were never really stable. ${pretty(c.setting)} exposes that immediately.`,
    `I am trying to build something that survives normal life, not just perfect weeks. Right now the weak spot is probably groceries, sleep, or the way I am timing everything.`,
    `This is less about discipline and more about friction. I can usually tell exactly where the week unravels; I just have not simplified that part enough yet.`
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
