const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(process.cwd(), 'data', 'forum-posts.json');
const TOTAL_POSTS = 2000;
const SEED = 20260315;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let value = Math.imul(t ^ (t >>> 15), t | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);

const pick = (items) => items[Math.floor(random() * items.length)];
const chance = (value) => random() < value;
const intBetween = (min, max) => Math.floor(random() * (max - min + 1)) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const normalizeKeyword = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .join('-');

const communityConfigs = {
  training: {
    communities: ['r/odeology_forum', 'r/training', 'r/homegym', 'r/bicepsgrowth', 'r/pushpulllegs'],
    authors: ['pull_day_notes', 'volume_and_vibes', 'garage_rack_log', 'benchdayhabit', 'weekend_hypertrophy'],
    tags: ['training', 'hypertrophy', 'execution'],
    imageTags: ['gym', 'fitness', 'workout', 'dumbbell', 'barbell', 'bodybuilding']
  },
  nutrition: {
    communities: ['r/nutrition', 'r/nutritiontiming', 'r/highprotein', 'r/mealprep', 'r/easymeals'],
    authors: ['macro_plate', 'rice_and_rituals', 'proteinfirstdaily', 'mealprep_mike', 'pantry_systems'],
    tags: ['nutrition', 'meals', 'protein'],
    imageTags: ['healthy-food', 'meal', 'mealprep', 'protein', 'salad', 'salmon']
  },
  recovery: {
    communities: ['r/recovery', 'r/mobility', 'r/sleepforgains', 'r/deload', 'r/injuryfree'],
    authors: ['recovery_logbook', 'restdaywalker', 'sleep_quality_check', 'mobility_minute', 'easy_does_it'],
    tags: ['recovery', 'sleep', 'mobility'],
    imageTags: ['stretching', 'mobility', 'recovery', 'walking', 'yoga', 'foam-roller']
  },
  cutting: {
    communities: ['r/cutting', 'r/fatlossphase', 'r/leaningout', 'r/bodyrecomp', 'r/caloriedeficit'],
    authors: ['deficit_diary', 'lean_phase_log', 'trimwithoutpanic', 'hunger_management', 'recomp_notes'],
    tags: ['fat-loss', 'nutrition', 'consistency'],
    imageTags: ['healthy-food', 'lean-meal', 'salad', 'fish', 'mealprep', 'calorie-deficit']
  },
  bulking: {
    communities: ['r/bulking', 'r/gaining', 'r/massphase', 'r/bigplates', 'r/strengthmeals'],
    authors: ['surplus_journal', 'massphasecook', 'more_rice_more_reps', 'bulk_szn_daily', 'hardgainerhelper'],
    tags: ['muscle-gain', 'nutrition', 'surplus'],
    imageTags: ['meal', 'rice', 'beef', 'chicken', 'bodybuilding-food', 'gym-food']
  },
  supplements: {
    communities: ['r/supplements', 'r/creatine', 'r/preworkout', 'r/researchstack', 'r/proteinpowder'],
    authors: ['stack_check', 'creatine_question', 'label_reader', 'simple_supps_only', 'scoopandgo'],
    tags: ['supplements', 'creatine', 'performance'],
    imageTags: ['supplements', 'protein', 'shaker', 'creatine', 'preworkout', 'gym-bag']
  },
  lifestyle: {
    communities: ['r/consistency', 'r/busyfitness', 'r/shiftworkerfitness', 'r/weekendreset', 'r/adhesion'],
    authors: ['calendar_and_cals', 'busyweek_lifter', 'nightshift_macros', 'consistentish', 'habit_stack_daily'],
    tags: ['consistency', 'lifestyle', 'planning'],
    imageTags: ['planner', 'notebook', 'desk', 'calendar', 'coffee', 'workspace']
  }
};

const titleBits = {
  goals: ['grow my upper chest', 'bring my arms up', 'stop stalling on squats', 'stay fuller while cutting', 'keep strength on low calories', 'eat enough protein without overthinking every meal', 'fix my push day fatigue', 'clean up my meal timing', 'feel more recovered between sessions', 'make a lean bulk actually work'],
  trainingGoals: ['grow my upper chest', 'bring my arms up', 'stop stalling on squats', 'fix my push day fatigue', 'feel more recovered between sessions', 'bring up my side delts', 'make my back work feel better', 'actually progress my bench again'],
  nutritionGoals: ['eat enough protein without overthinking every meal', 'clean up my meal timing', 'stay fuller while cutting', 'make a lean bulk actually work', 'stop late-night snacking from blowing calories', 'hit calories without force-feeding', 'make meal prep easier to repeat'],
  supplementGoals: ['improve training performance', 'recover better between sessions', 'feel less flat during long sessions', 'make hydration easier', 'hit protein targets more consistently'],
  mistakes: ['turning every session into junk volume', 'overshooting carbs at night', 'skipping recovery work until I feel beat up', 'making every meal too clean to stick to', 'copying influencer splits that bury my elbows', 'eating like a bodybuilder on weekdays and guessing on weekends', 'trying to PR when sleep is terrible', 'adding more supplements instead of fixing basics', 'cutting too hard and wrecking my training', 'changing the plan every five days'],
  constraints: ['with only 45 minutes before work', 'while training in a garage gym', 'if I only want four meals a day', 'without needing six days in the gym', 'while working late shifts', 'when my appetite is low in the morning', 'if I meal prep only twice a week', 'without buying a ton of supplements', 'with two rest days locked in', 'while keeping groceries simple'],
  foods: ['salmon bowls', 'ground turkey rice', 'overnight oats', 'Greek yogurt mixes', 'egg wraps', 'slow cooker chicken', 'air fryer potatoes', 'bagel sandwiches', 'beef and jasmine rice', 'cottage cheese bowls'],
  recoveryIssues: ['waking up sore for two straight days', 'my elbows feeling cooked after push day', 'flat pumps by midweek', 'stiff hips before lower body days', 'sleeping badly on heavy training weeks', 'feeling fine in session but dead the next morning', 'tight shoulders during pressing', 'my back feeling fried after rows and RDLs'],
  supplements: ['creatine monohydrate', 'caffeine', 'electrolytes', 'protein powder', 'beta-alanine', 'fish oil', 'magnesium glycinate', 'pre-workout', 'intra-workout carbs', 'collagen'],
  mealSituations: ['before early morning training', 'on long workdays', 'during a cut', 'when appetite is low', 'for late-night hunger', 'on rest days', 'after heavy leg day', 'while traveling', 'during a lean bulk', 'when eating out a lot'],
  trainingBlocks: ['upper/lower', 'push pull legs', 'full body', '4-day hypertrophy', 'home dumbbell split', 'bench specialization block', 'cutting maintenance block', 'high-frequency arms phase', '3-day strength split', 'glute-focused lower plan'],
  bodyParts: ['biceps', 'rear delts', 'upper chest', 'quads', 'hamstrings', 'lats', 'side delts', 'triceps', 'glutes', 'calves'],
  progressFrames: ['2 weeks', '4 weeks', '6 weeks', '8 weeks', '10 weeks', '12 weeks'],
  contexts: ['after switching to a simpler split', 'since I started pre-planning dinner', 'once I stopped missing breakfast', 'after reducing junk volume', 'since I started walking after dinner', 'when I matched carbs to training days', 'after tightening my sleep schedule', 'since I cut out random snack grazing']
};

const titleQualifiers = [
  'for busy weeks',
  'without overcomplicating it',
  'when recovery is average',
  'if time is tight',
  'on a normal work schedule',
  'without relying on motivation',
  'for people keeping it simple',
  'when the basics are already in place',
  'if meals need to stay repeatable',
  'without turning it into a second job',
  'for a four-day setup',
  'while keeping weekends sane',
  'for lifters who miss meals sometimes',
  'while staying consistent',
  'when appetite is unpredictable',
  'during a cut',
  'during a lean bulk',
  'for home gym training',
  'for simple grocery runs',
  'without chasing hacks'
];

function buildContext(categoryKey) {
  const bits = titleBits;
  const defaultGoal = pick(bits.goals);
  const goal = categoryKey === 'training'
    ? pick(bits.trainingGoals)
    : categoryKey === 'nutrition' || categoryKey === 'cutting' || categoryKey === 'bulking'
      ? pick(bits.nutritionGoals)
      : categoryKey === 'supplements'
        ? pick(bits.supplementGoals)
        : defaultGoal;

  return {
    goal,
    mistake: pick(bits.mistakes),
    constraint: pick(bits.constraints),
    food: pick(bits.foods),
    recoveryIssue: pick(bits.recoveryIssues),
    supplement: pick(bits.supplements),
    mealSituation: pick(bits.mealSituations),
    trainingBlock: pick(bits.trainingBlocks),
    bodyPart: pick(bits.bodyParts),
    progressFrame: pick(bits.progressFrames),
    context: pick(bits.contexts)
  };
}

function buildTitle(categoryKey, format, context) {
  const ctx = context;

  switch (categoryKey) {
    case 'training':
      return pick([
        `How do you ${ctx.goal} without ${ctx.mistake}?`,
        `What finally helped you ${ctx.goal} ${ctx.constraint}?`,
        `${ctx.progressFrame} into a ${ctx.trainingBlock} block and my ${ctx.bodyPart} still lag`,
        `Is a ${ctx.trainingBlock} enough to ${ctx.goal} ${ctx.constraint}?`
      ]);
    case 'nutrition':
      return format === 'image'
        ? `Rate this ${ctx.food} setup ${ctx.mealSituation}`
        : `What are your easiest high-protein meals ${ctx.mealSituation}?`;
    case 'recovery':
      return pick([
        `What fixed ${ctx.recoveryIssue} without killing training momentum?`,
        `Anyone else dealing with ${ctx.recoveryIssue} after a ${ctx.trainingBlock} block?`,
        `${ctx.progressFrame} of training and recovery is the thing falling apart`
      ]);
    case 'cutting':
      return format === 'image'
        ? 'This is the leanest meal prep I can actually repeat during a cut'
        : `How are you keeping strength while cutting without ${ctx.mistake}?`;
    case 'bulking':
      return format === 'image'
        ? 'Current lean bulk plate check before I push calories higher'
        : `What made your lean bulk finally work ${ctx.constraint}?`;
    case 'supplements':
      return pick([
        `What supplements are actually worth it if the goal is to ${ctx.goal}?`,
        `Do you notice a real difference from ${ctx.supplement} or is it mostly routine?`,
        'If you only kept two supplements during a cut, what would they be?'
      ]);
    case 'lifestyle':
      return pick([
        `How are you staying consistent ${ctx.constraint}?`,
        `What changed most for your progress ${ctx.context}?`,
        'Busy schedule check: what part of the plan are you simplifying first?'
      ]);
    default:
      return "What's working for you right now?";
  }
}

function buildBody(categoryKey, format, context) {
  const ctx = context;
  const lines = {
    training: [
      `I'm trying to ${ctx.goal} ${ctx.constraint}. Right now I'm running a ${ctx.trainingBlock} and I'm not sure if the bottleneck is volume, execution, or recovery.`,
      'Not looking for a magic fix. Just curious what small change made the biggest difference for people here.',
      'Would rather keep this sustainable than rebuild the whole program again next week.'
    ],
    nutrition: [
      format === 'image'
        ? `Dropped the picture because this is the easiest ${ctx.food} combo I've been repeating lately.`
        : 'I keep overcomplicating food and then defaulting to random takeout.',
      `Trying to get enough protein ${ctx.mealSituation} without cooking six different things.`,
      'If you have a go-to option that always works, I want the simple version.'
    ],
    recovery: [
      "Training is fine in the moment, but recovery is where I'm slipping right now.",
      `Biggest issue lately is ${ctx.recoveryIssue} and I'd rather fix the base habits before I start removing exercises.`,
      'Open to simple stuff like walking, sleep changes, mobility work, or changing weekly volume.'
    ],
    cutting: [
      format === 'image'
        ? 'Picture is basically the type of meal that helps me stay on plan without feeling deprived.'
        : "The deficit itself isn't the hard part, it's keeping performance from sliding by week two.",
      "I'm trying to keep the cut clean without turning every day into hunger management.",
      'Would rather hear what actually worked than generic "just grind harder" advice.'
    ],
    bulking: [
      format === 'image'
        ? 'This is the kind of plate I can keep repeating without feeling stuffed all day.'
        : 'I can hit calories for a few days, then appetite or planning falls apart.',
      'Trying to make the surplus feel controlled instead of just eating random extra food.',
      "If you've found a structure that keeps the gain phase clean, I'm interested."
    ],
    supplements: [
      format === 'image'
        ? "Pic is my current training bag setup because I'm trying to cut the supplement stack down to the basics."
        : "I'm not anti-supplement, I just don't want to buy things that only feel useful because they're hyped.",
      'Diet and training are handled first. Just trying to see what has a real place after that.',
      'Would rather keep a short list that actually earns its spot.'
    ],
    lifestyle: [
      format === 'image'
        ? 'Photo is basically the little planning setup that keeps me from improvising the whole week.'
        : "I'm not really struggling with knowledge right now, just with sticking to the basics when life gets noisy.",
      'The more friction the system has, the faster I drift off it.',
      'Curious what part you simplified first when consistency became the real problem.'
    ]
  };

  return lines[categoryKey].join(' ');
}

function buildScope(categoryKey) {
  const map = {
    training: 'training',
    nutrition: 'nutrition',
    recovery: 'recovery',
    cutting: 'nutrition',
    bulking: 'nutrition',
    supplements: 'nutrition',
    lifestyle: 'training'
  };

  return map[categoryKey] || 'training';
}

function buildStats(categoryKey, format) {
  const base = {
    training: [120, 820],
    nutrition: [85, 760],
    recovery: [40, 520],
    cutting: [95, 910],
    bulking: [90, 700],
    supplements: [35, 480],
    lifestyle: [25, 420]
  }[categoryKey] || [25, 400];

  const score = intBetween(base[0], base[1]) + (format === 'image' ? intBetween(10, 140) : 0);
  const comments = clamp(Math.round(score * (format === 'text' ? 0.18 : 0.12) + intBetween(2, 28)), 6, 420);

  return { score, comments };
}

function buildImageTags(categoryKey, context) {
  const config = communityConfigs[categoryKey];
  const tags = new Set(config.imageTags);

  if (categoryKey === 'training') {
    tags.add(normalizeKeyword(context.bodyPart));
    tags.add(normalizeKeyword(context.trainingBlock));
  } else if (categoryKey === 'nutrition' || categoryKey === 'cutting' || categoryKey === 'bulking') {
    tags.add(normalizeKeyword(context.food));
    tags.add(normalizeKeyword(context.mealSituation));
  } else if (categoryKey === 'recovery') {
    tags.add(normalizeKeyword(context.recoveryIssue));
  } else if (categoryKey === 'supplements') {
    tags.add(normalizeKeyword(context.supplement));
  } else if (categoryKey === 'lifestyle') {
    tags.add(normalizeKeyword(context.context));
  }

  return Array.from(tags)
    .filter(Boolean)
    .slice(0, 5);
}

function buildRemoteImage(categoryKey, context, index, title) {
  const tags = buildImageTags(categoryKey, context).join(',');
  const lock = SEED + index + 1;

  return {
    url: `https://loremflickr.com/1600/1200/${tags}?lock=${lock}`,
    alt: `${communityConfigs[categoryKey].tags[0]} image for ${title}`
  };
}

function buildPost(index) {
  const categoryKey = pick(['training', 'nutrition', 'recovery', 'cutting', 'bulking', 'supplements', 'lifestyle']);
  const config = communityConfigs[categoryKey];
  const context = buildContext(categoryKey);
  const format = chance(0.5) ? 'image' : 'text';
  const stats = buildStats(categoryKey, format);
  const hour = intBetween(0, 23);
  const minute = intBetween(0, 59);
  const title = buildTitle(categoryKey, format, context);
  const community = pick(config.communities);
  const author = pick(config.authors);
  const body = buildBody(categoryKey, format, context);
  const id = `forum-post-${String(index + 1).padStart(4, '0')}`;
  const image = format === 'image' ? buildRemoteImage(categoryKey, context, index, title) : null;

  return {
    id,
    slug: slugify(title).slice(0, 80),
    community,
    scope: buildScope(categoryKey),
    category: categoryKey,
    author,
    format,
    title,
    body,
    imageUrl: image ? image.url : null,
    imageAlt: image ? image.alt : null,
    tags: config.tags,
    score: stats.score,
    comments: stats.comments,
    preferredHourLocal: hour,
    preferredMinuteLocal: minute,
    preferredWindow: hour < 11 ? 'morning' : hour < 17 ? 'afternoon' : 'evening',
    botSource: 'seeded-forum-generator'
  };
}

function uniquifyTitle(baseTitle, seenTitles) {
  if (!seenTitles.has(baseTitle)) {
    return baseTitle;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `${baseTitle} ${pick(titleQualifiers)}`;
    if (!seenTitles.has(candidate)) {
      return candidate;
    }
  }

  return `${baseTitle} ${intBetween(2, 99)}`;
}

function generatePosts(total) {
  const posts = [];
  const seenTitles = new Set();

  let attempts = 0;
  while (posts.length < total && attempts < total * 20) {
    attempts += 1;
    const post = buildPost(posts.length);
    post.title = uniquifyTitle(post.title, seenTitles);
    seenTitles.add(post.title);
    posts.push(post);
  }

  if (posts.length !== total) {
    throw new Error(`Only generated ${posts.length} unique posts out of ${total}`);
  }

  return posts;
}

const items = generatePosts(TOTAL_POSTS);
const payload = {
  generatedAt: new Date().toISOString(),
  total: items.length,
  seed: SEED,
  summary: {
    imagePosts: items.filter((item) => item.format === 'image').length,
    textPosts: items.filter((item) => item.format === 'text').length,
    uniqueImageUrls: new Set(items.map((item) => item.imageUrl).filter(Boolean)).size
  },
  items
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

console.log(`Saved ${items.length} forum posts to ${OUTPUT_PATH}`);
