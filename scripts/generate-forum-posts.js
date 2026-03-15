const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(process.cwd(), 'data', 'forum-posts.json');
const IMAGE_OUTPUT_DIR = path.join(process.cwd(), 'generated', 'forum-post-images');
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

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const communityConfigs = {
  training: {
    communities: ['r/odeology_forum', 'r/training', 'r/homegym', 'r/bicepsgrowth', 'r/pushpulllegs'],
    authors: ['pull_day_notes', 'volume_and_vibes', 'garage_rack_log', 'benchdayhabit', 'weekend_hypertrophy'],
    tags: ['training', 'hypertrophy', 'execution'],
    images: [
      { url: 'https://images.unsplash.com/photo-1704223524532-c5b4e8490297?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1600', alt: 'Lifter curling a dumbbell in a gym' },
      { url: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Gym training setup with athlete and weights' },
      { url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Athlete training with dumbbells in a gym' },
      { url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Strength training equipment arranged in a gym' }
    ]
  },
  nutrition: {
    communities: ['r/nutrition', 'r/nutritiontiming', 'r/highprotein', 'r/mealprep', 'r/easymeals'],
    authors: ['macro_plate', 'rice_and_rituals', 'proteinfirstdaily', 'mealprep_mike', 'pantry_systems'],
    tags: ['nutrition', 'meals', 'protein'],
    images: [
      { url: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Healthy mixed meal with vegetables and protein' },
      { url: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Salmon plate with greens and vegetables' },
      { url: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Prepared meal containers lined up on a counter' },
      { url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Protein-forward meal with grains and vegetables' }
    ]
  },
  recovery: {
    communities: ['r/recovery', 'r/mobility', 'r/sleepforgains', 'r/deload', 'r/injuryfree'],
    authors: ['recovery_logbook', 'restdaywalker', 'sleep_quality_check', 'mobility_minute', 'easy_does_it'],
    tags: ['recovery', 'sleep', 'mobility'],
    images: [
      { url: 'https://images.unsplash.com/photo-1547852355-61348aeea17c?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Athlete recovering and stretching on the floor' },
      { url: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Foam roller and recovery equipment in gym space' },
      { url: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Walking outdoors as light recovery activity' }
    ]
  },
  cutting: {
    communities: ['r/cutting', 'r/fatlossphase', 'r/leaningout', 'r/bodyrecomp', 'r/caloriedeficit'],
    authors: ['deficit_diary', 'lean_phase_log', 'trimwithoutpanic', 'hunger_management', 'recomp_notes'],
    tags: ['fat-loss', 'nutrition', 'consistency'],
    images: [
      { url: 'https://images.unsplash.com/photo-1508170754725-6e9a5cfbcabf?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1600', alt: 'Lean meal plated with vegetables and fish' },
      { url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Large salad bowl with lean protein and vegetables' },
      { url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Simple lower-calorie meal prep on a table' }
    ]
  },
  bulking: {
    communities: ['r/bulking', 'r/gaining', 'r/massphase', 'r/bigplates', 'r/strengthmeals'],
    authors: ['surplus_journal', 'massphasecook', 'more_rice_more_reps', 'bulk_szn_daily', 'hardgainerhelper'],
    tags: ['muscle-gain', 'nutrition', 'surplus'],
    images: [
      { url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Large meal bowl used for muscle gain meal prep' },
      { url: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'High-calorie meal prep containers on a kitchen counter' },
      { url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Hearty plate with carbohydrates and protein' }
    ]
  },
  supplements: {
    communities: ['r/supplements', 'r/creatine', 'r/preworkout', 'r/researchstack', 'r/proteinpowder'],
    authors: ['stack_check', 'creatine_question', 'label_reader', 'simple_supps_only', 'scoopandgo'],
    tags: ['supplements', 'creatine', 'performance'],
    images: [
      { url: 'https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Supplements and shaker bottle on a gym bench' },
      { url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Water bottle and training setup for pre-workout routine' },
      { url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Training gear and recovery supplements on a mat' }
    ]
  },
  lifestyle: {
    communities: ['r/consistency', 'r/busyfitness', 'r/shiftworkerfitness', 'r/weekendreset', 'r/adhesion'],
    authors: ['calendar_and_cals', 'busyweek_lifter', 'nightshift_macros', 'consistentish', 'habit_stack_daily'],
    tags: ['consistency', 'lifestyle', 'planning'],
    images: [
      { url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Notebook and laptop used for planning habits and fitness' },
      { url: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Planner and coffee used for scheduling workouts and meals' },
      { url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=1600', alt: 'Simple desk setup for building a weekly routine' }
    ]
  }
};

const categoryArtwork = {
  training: {
    label: 'Training',
    gradientStart: '#102033',
    gradientEnd: '#27485d',
    accent: '#68d5ff',
    accentSoft: '#d7f5ff',
    icon: 'training'
  },
  nutrition: {
    label: 'Nutrition',
    gradientStart: '#1f3a1f',
    gradientEnd: '#516f28',
    accent: '#ffe082',
    accentSoft: '#fff5d0',
    icon: 'nutrition'
  },
  recovery: {
    label: 'Recovery',
    gradientStart: '#2b2247',
    gradientEnd: '#5963a6',
    accent: '#d8d2ff',
    accentSoft: '#f2efff',
    icon: 'recovery'
  },
  cutting: {
    label: 'Cutting',
    gradientStart: '#4a271f',
    gradientEnd: '#a64f3a',
    accent: '#ffd0b8',
    accentSoft: '#fff0e7',
    icon: 'cutting'
  },
  bulking: {
    label: 'Bulking',
    gradientStart: '#40270b',
    gradientEnd: '#9c6b1e',
    accent: '#ffe29a',
    accentSoft: '#fff4d1',
    icon: 'bulking'
  },
  supplements: {
    label: 'Supplements',
    gradientStart: '#1b3351',
    gradientEnd: '#2f7ab0',
    accent: '#bfe7ff',
    accentSoft: '#edf8ff',
    icon: 'supplements'
  },
  lifestyle: {
    label: 'Lifestyle',
    gradientStart: '#25313d',
    gradientEnd: '#667482',
    accent: '#f2d6a2',
    accentSoft: '#fff4e4',
    icon: 'lifestyle'
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
        ? `This is the leanest meal prep I can actually repeat during a cut`
        : `How are you keeping strength while cutting without ${ctx.mistake}?`;
    case 'bulking':
      return format === 'image'
        ? `Current lean bulk plate check before I push calories higher`
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

function wrapLines(text, maxChars, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxChars));
      current = word.slice(maxChars);
    }
  });

  if (current) {
    lines.push(current);
  }

  const trimmed = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    trimmed[maxLines - 1] = `${trimmed[maxLines - 1].replace(/[.,;:!?-]*$/, '')}...`;
  }

  return trimmed;
}

function buildIconMarkup(icon, accent) {
  switch (icon) {
    case 'training':
      return `<path d="M250 204h110l42-42 26 26-42 42v110h-36V230H250z" fill="${accent}" opacity="0.92"/><rect x="160" y="244" width="142" height="32" rx="16" fill="${accent}" opacity="0.92"/>`;
    case 'nutrition':
      return `<path d="M220 168c0 28-18 45-18 71v95h-30v-95c0-26-18-43-18-71h20c0 18 8 30 13 38v-38h20v38c5-8 13-20 13-38Zm88 0h24v166h-24v-70h-24v-22h24z" fill="${accent}" opacity="0.92"/>`;
    case 'recovery':
      return `<circle cx="250" cy="244" r="74" fill="${accent}" opacity="0.92"/><circle cx="284" cy="220" r="64" fill="url(#card-bg)" opacity="0.95"/><circle cx="358" cy="178" r="8" fill="${accent}" opacity="0.85"/><circle cx="388" cy="210" r="6" fill="${accent}" opacity="0.72"/>`;
    case 'cutting':
      return `<path d="M180 312 304 188" stroke="${accent}" stroke-width="26" stroke-linecap="round" opacity="0.9"/><circle cx="338" cy="154" r="34" stroke="${accent}" stroke-width="20" fill="none" opacity="0.9"/><path d="M220 158c28 0 52 24 52 52" stroke="${accent}" stroke-width="18" fill="none" opacity="0.5"/>`;
    case 'bulking':
      return `<path d="M178 210h184l-22 126H200z" fill="${accent}" opacity="0.88"/><path d="M214 210c0-28 17-44 36-44 22 0 33 18 42 18 10 0 18-10 34-10 22 0 38 18 38 44" stroke="${accent}" stroke-width="18" fill="none" opacity="0.88"/>`;
    case 'supplements':
      return `<rect x="186" y="188" width="156" height="78" rx="39" fill="${accent}" opacity="0.92"/><path d="M264 188v78" stroke="url(#card-bg)" stroke-width="14" opacity="0.5"/><rect x="210" y="286" width="108" height="34" rx="17" fill="${accent}" opacity="0.7"/>`;
    case 'lifestyle':
      return `<rect x="186" y="170" width="156" height="138" rx="24" fill="${accent}" opacity="0.9"/><path d="M220 148v40M308 148v40M214 220h100M214 252h76M214 284h54" stroke="url(#card-bg)" stroke-width="16" stroke-linecap="round" opacity="0.55"/>`;
    default:
      return `<circle cx="260" cy="240" r="70" fill="${accent}" opacity="0.88"/>`;
  }
}

function buildImageAsset(post, index) {
  const theme = categoryArtwork[post.category] || categoryArtwork.training;
  const titleLines = wrapLines(post.title, 28, 4);
  const bodyLines = wrapLines(post.body, 42, 3);
  const orbitX = 1040 + ((index * 91) % 380);
  const orbitY = 180 + ((index * 53) % 320);
  const circleX = 1210 + ((index * 47) % 220);
  const circleY = 760 + ((index * 29) % 180);
  const stripeOffset = 720 + ((index * 37) % 150);
  const rotation = ((index * 7) % 24) - 12;
  const fileName = `${post.id}.svg`;
  const relativePath = `/generated/forum-post-images/${fileName}`;
  const titleMarkup = titleLines.map((line, lineIndex) => `<tspan x="120" dy="${lineIndex === 0 ? 0 : 68}">${escapeXml(line)}</tspan>`).join('');
  const bodyMarkup = bodyLines.map((line, lineIndex) => `<tspan x="124" dy="${lineIndex === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(post.title)}</title>
  <desc id="desc">Unique odeology forum cover art for ${escapeXml(post.community)} in the ${escapeXml(theme.label)} category.</desc>
  <defs>
    <linearGradient id="card-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.gradientStart}"/>
      <stop offset="100%" stop-color="${theme.gradientEnd}"/>
    </linearGradient>
    <linearGradient id="card-glow" x1="10%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${theme.accentSoft}" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="1200" fill="url(#card-bg)"/>
  <circle cx="${orbitX}" cy="${orbitY}" r="340" fill="url(#card-glow)" opacity="0.26"/>
  <circle cx="${circleX}" cy="${circleY}" r="210" fill="${theme.accent}" opacity="0.12"/>
  <g opacity="0.16" transform="translate(${stripeOffset} -80) rotate(${rotation} 320 620)">
    <rect x="0" y="0" width="82" height="1400" rx="40" fill="${theme.accentSoft}"/>
    <rect x="132" y="0" width="38" height="1400" rx="19" fill="${theme.accentSoft}"/>
    <rect x="222" y="0" width="20" height="1400" rx="10" fill="${theme.accentSoft}"/>
  </g>
  <rect x="84" y="94" width="1432" height="1012" rx="46" fill="#ffffff" opacity="0.07"/>
  <rect x="96" y="106" width="1408" height="988" rx="40" fill="#0f1720" opacity="0.08"/>
  <rect x="120" y="118" width="230" height="54" rx="27" fill="${theme.accentSoft}" opacity="0.95"/>
  <text x="148" y="152" font-family="IBM Plex Sans, Arial, sans-serif" font-size="28" font-weight="700" fill="${theme.gradientStart}">${escapeXml(theme.label.toUpperCase())}</text>
  <text x="120" y="238" font-family="Space Grotesk, IBM Plex Sans, Arial, sans-serif" font-size="64" font-weight="700" letter-spacing="-1.6" fill="#ffffff">${titleMarkup}</text>
  <text x="124" y="570" font-family="IBM Plex Sans, Arial, sans-serif" font-size="26" font-weight="500" fill="${theme.accentSoft}" opacity="0.95">${bodyMarkup}</text>
  <text x="124" y="1030" font-family="IBM Plex Sans, Arial, sans-serif" font-size="30" font-weight="600" fill="${theme.accentSoft}">${escapeXml(post.community)}</text>
  <text x="124" y="1072" font-family="IBM Plex Sans, Arial, sans-serif" font-size="22" font-weight="500" fill="${theme.accentSoft}" opacity="0.85">odeology forum bot post • ${escapeXml(post.author)}</text>
  <g transform="translate(1010 560)">
    <rect x="0" y="0" width="390" height="390" rx="42" fill="#ffffff" opacity="0.08"/>
    <rect x="16" y="16" width="358" height="358" rx="34" fill="#0d1621" opacity="0.12"/>
    ${buildIconMarkup(theme.icon, theme.accent)}
  </g>
</svg>`;

  fs.writeFileSync(path.join(IMAGE_OUTPUT_DIR, fileName), svg, 'utf8');

  return {
    url: relativePath,
    alt: `${theme.label} forum cover for ${post.title}`
  };
}

function buildPost(index) {
  const categoryKey = pick(['training', 'nutrition', 'recovery', 'cutting', 'bulking', 'supplements', 'lifestyle']);
  const config = communityConfigs[categoryKey];
  const context = buildContext(categoryKey);
  const format = chance(categoryKey === 'nutrition' || categoryKey === 'cutting' || categoryKey === 'bulking' ? 0.78 : 0.48) ? 'image' : 'text';
  const stats = buildStats(categoryKey, format);
  const hour = intBetween(0, 23);
  const minute = intBetween(0, 59);
  const title = buildTitle(categoryKey, format, context);
  const community = pick(config.communities);
  const author = pick(config.authors);
  const body = buildBody(categoryKey, format, context);
  const id = `forum-post-${String(index + 1).padStart(4, '0')}`;
  const image = format === 'image'
    ? buildImageAsset({
      id,
      title,
      community,
      category: categoryKey,
      author,
      body
    }, index)
    : null;

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

fs.rmSync(IMAGE_OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });

const items = generatePosts(TOTAL_POSTS);
const payload = {
  generatedAt: new Date().toISOString(),
  total: items.length,
  seed: SEED,
  summary: {
    imagePosts: items.filter((item) => item.format === 'image').length,
    textPosts: items.filter((item) => item.format === 'text').length,
    uniqueImageAssets: items.filter((item) => item.imageUrl).length
  },
  items
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

console.log(`Saved ${items.length} forum posts to ${OUTPUT_PATH}`);
