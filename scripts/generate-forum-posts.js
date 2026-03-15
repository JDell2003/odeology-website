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

const words = (text) => String(text || '').toLowerCase().match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/g) || [];
const slug = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const norm = (text) => uniq(words(text).slice(0, 3)).join(' ');
const grams = (text) => {
  const list = words(text);
  const out = [];
  for (let i = 0; i <= list.length - NGRAM; i += 1) out.push(list.slice(i, i + NGRAM).join(' '));
  return out;
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
  part: ['upper-chest', 'biceps', 'rear-delts', 'side-delts', 'quads', 'hamstrings', 'lats', 'glutes', 'triceps', 'calves'],
  block: ['upper-lower', 'push-pull-legs', 'full-body', '4-day-hypertrophy', '3-day-strength-split', 'bench-specialization', 'home-dumbbell-split'],
  setting: ['garage-gym mornings', 'lunch-break sessions', 'shift-work weeks', 'crowded evenings', 'home-dumbbell nights', 'weekend catch-ups'],
  constraint: ['under-45 minutes', 'before-work', 'no fifth-day', 'weekends open', 'limited rack-access', 'calm elbows'],
  friction: ['presses fine curls-late', 'rows fine arms-late', 'front-delt takeover', 'pump no-progress', 'recovery runs-late'],
  lift: ['incline-press', 'dumbbell-curl', 'RDL', 'hack-squat', 'lat-pulldown', 'leg-press', 'cable-row'],
  food: ['salmon-bowls', 'ground-turkey-rice', 'Greek-yogurt-bowls', 'egg-wraps', 'beef-jasmine-rice', 'bagel-sandwiches', 'cottage-cheese-bowls', 'overnight-oats'],
  food2: ['fruit-yogurt', 'rice-cake-turkey', 'potatoes-eggs', 'rice-beef', 'oats-whey', 'toast-eggs', 'chicken-pasta'],
  meal: ['pre-6am training', 'long workdays', 'late shifts', 'post-leg day', 'commute days', 'cut days', 'low appetite'],
  appetite: ['midday appetite-loss', 'late-hunger spikes', 'breakfast resistance', 'poor portability', 'weekend drift'],
  issue: ['pressing-shoulder tightness', 'curl-elbow crankiness', 'slow quad-recovery', 'evening sleep-latency', 'row-day back-tightness'],
  tool: ['dinner walks', 'mobility resets', 'foam rolling', 'breathing drills', 'early caffeine-cutoff'],
  deficit: ['260 calorie deficit', '320 calorie deficit', '380 calorie deficit', '430 calorie deficit'],
  hunger: ['dinner hunger-spikes', 'training goes-flat', 'restaurant math-breaks', 'energy drops-early'],
  surplus: ['180 calorie surplus', '240 calorie surplus', '300 calorie surplus', '360 calorie surplus'],
  bulk: ['meal-two appetite-drop', 'surplus digestion-mess', 'random extra-snacks', 'carbs drift-late'],
  supp: ['creatine-monohydrate', 'whey-isolate', 'electrolytes', 'pre-workout', 'fish-oil', 'magnesium-glycinate', 'caffeine'],
  stack: ['three-item-stack', 'two-scoop-shaker', 'simple-gym-bag', 'cut-back-stack', 'training-day-stack'],
  planner: ['Sunday-whiteboard', 'notes-checklist', 'paper-planner', 'fridge-meal-grid', 'Sunday-grocery-template', 'calendar-reminder-stack'],
  routine: ['Tuesday collapse', 'Friday drift', 'travel reset-loss', 'sleep cut-first', 'weekend Monday-spill'],
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
  if (category === 'training') return `${c.week}, ${c.tag}, ${c.part}, ${c.block}, ${c.constraint}`;
  if (category === 'nutrition') return `${c.week}, ${c.tag}, ${c.food}, ${c.protein}g, ${c.meals} meals`;
  if (category === 'recovery') return `${c.week}, ${c.tag}, ${c.issue}, ${c.block}, ${c.tool}`;
  if (category === 'cutting') return `${c.week}, ${c.tag}, ${c.deficit}, ${c.food}, ${c.hunger}`;
  if (category === 'bulking') return `${c.week}, ${c.tag}, ${c.surplus}, ${c.food}, ${c.bulk}`;
  if (category === 'supplements') return `${c.week}, ${c.tag}, ${c.supp}, ${c.caffeine}mg, ${c.supp2}`;
  return `${c.week}, ${c.tag}, ${c.planner}, ${c.routine.toLowerCase()}, ${c.steps}k`;
}

function body(category, c) {
  if (category === 'training') return pick([
    `${c.week}; ${c.block}; ${c.setting}; ${c.len}; ${c.protein}g protein; ${c.sleep}h sleep; ${c.steps}k steps; ${c.part} late; ${c.lift} okay; volume or order?`,
    `${c.block}; ${c.days} days; ${c.constraint}; ${c.friction}; ${c.protein}g protein; ${c.steps}k steps; tempo or exercise-swap?`,
    `${c.setting}; ${c.week}; ${c.lift}; ${c.part} focus; ${c.sleep}h sleep; ${c.protein}g protein; ${c.len}; more sets or better order?`
  ]);
  if (category === 'nutrition') return pick([
    `${c.food}; ${c.meals} meals; ${c.protein}g protein; ${c.budget} dollars; ${c.appetite}; meal or timing?`,
    `${c.week}; ${c.food2}; ${c.food}; ${c.meal}; ${c.protein}g protein; prep or portability?`,
    `${c.setting}; ${c.food}; ${c.food2}; ${c.meals} meals; ${c.appetite}; grocery or timing?`
  ]);
  if (category === 'recovery') return pick([
    `${c.block}; ${c.week}; ${c.issue}; ${c.tool}; ${c.sleep}h sleep; ${c.steps}k steps; ${c.len}; deload or habit-fix?`,
    `${c.setting}; ${c.issue}; ${c.part} focus; ${c.days} training days; ${c.tool}; walk more or trim sets?`,
    `${c.week}; ${c.block}; ${c.issue}; ${c.sleep}h sleep; ${c.steps}k steps; caffeine-cutoff or mobility?`
  ]);
  if (category === 'cutting') return pick([
    `${c.week}; ${c.deficit}; ${c.food}; ${c.steps}k steps; ${c.hunger}; fiber or timing?`,
    `${c.setting}; ${c.deficit}; ${c.meals} meals; ${c.protein}g protein; ${c.hunger.toLowerCase()}; bigger lunch or later carbs?`,
    `${c.food}; ${c.food2}; ${c.meal}; ${c.week}; ${c.deficit}; meal or habit?`
  ]);
  if (category === 'bulking') return pick([
    `${c.week}; ${c.surplus}; ${c.food}; ${c.food2}; ${c.bulk}; breakfast or liquid calories?`,
    `${c.setting}; ${c.meals} meals; ${c.protein}g protein; ${c.surplus}; ${c.bulk}; easier meal?`,
    `${c.surplus}; ${c.food}; ${c.budget} dollars; ${c.week}; structure drifts; add carbs where?`
  ]);
  if (category === 'supplements') return pick([
    `${c.stack}; ${c.supp}; ${c.supp2}; ${c.caffeine}mg caffeine; ${c.len}; ${c.sleep}h sleep; keep or cut?`,
    `${c.week}; ${c.setting}; ${c.supp} in; ${c.supp2} out?; ${c.caffeine}mg caffeine; useful or clutter?`,
    `${c.supp}; ${c.supp2}; ${c.stack}; ${c.protein}g protein; ${c.len}; ${c.steps}k steps; first cut?`
  ]);
  return pick([
    `${c.planner}; ${c.days} training days; ${c.meals} meals; ${c.budget} dollars; ${c.routine}; simplify what?`,
    `${c.week}; ${c.setting}; ${c.food}; ${c.planner}; follow-through slips; habit or grocery fix?`,
    `${c.constraint}; ${c.planner}; ${c.days} training days; ${c.steps}k steps; ${c.routine}; sleep or schedule?`
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
    if (![401, 429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(`Openverse ${res.status} for ${query}`);
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

async function assign(posts) {
  const finder = new Finder();
  for (const post of posts) {
    if (post.format !== 'image') continue;
    let item = await finder.take(imageQueries(post));
    if (!item) item = await finder.take(broadImageQueries(post.category));
    if (!item) throw new Error(`No unique open-license image found for ${post.id}`);
    Object.assign(post, imageMeta(post, item));
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
