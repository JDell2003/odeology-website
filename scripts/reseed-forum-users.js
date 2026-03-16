const fs = require('fs');
const path = require('path');

const POSTS_PATH = path.join(process.cwd(), 'data', 'forum-posts.json');
const USERS_PATH = path.join(process.cwd(), 'data', 'forum-seeded-users.json');
const SEED = 20260316;
const USER_COUNT = 220;

function rng(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let value = Math.imul(t ^ (t >>> 15), t | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(text) {
  const source = String(text || '');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const rand = rng(SEED);
const pick = (list) => list[Math.floor(rand() * list.length)];
const maybe = (p) => rand() < p;
const uniq = (list) => Array.from(new Set((list || []).filter(Boolean)));
const windowToHours = {
  morning: [6, 12],
  afternoon: [12, 17],
  evening: [17, 22],
  late: [21, 2]
};

const plainNames = [
  'matt', 'derek', 'sarah', 'alex', 'jason', 'mia', 'tyler', 'josh', 'noah', 'emma',
  'ash', 'luke', 'nina', 'ella', 'brad', 'zoe', 'sam', 'hayden', 'logan', 'ava',
  'liam', 'mason', 'olivia', 'leah', 'nora', 'isla', 'elena', 'chase', 'max', 'ryan'
];
const fitnessRoots = [
  'iron', 'bench', 'squat', 'plate', 'chalk', 'pump', 'bulk', 'cut', 'lat', 'row',
  'press', 'rep', 'grit', 'bar', 'grind', 'hypertrophy', 'shred', 'carry'
];
const fitnessSuffixes = [
  'mike', 'beast', 'dad', 'path', 'mode', 'season', 'fiend', 'stack', 'flow',
  'log', 'lifter', 'builder', 'coach', 'gains', 'daily', 'journal'
];

const archetypes = [
  {
    id: 'beginner-questioner',
    weight: 1.35,
    tone: 'curious',
    favoriteTopics: ['training', 'recovery', 'lifestyle'],
    preferredPostTypes: ['question', 'question', 'question', 'personal'],
    allowedImageTypes: ['exercise', 'general_gym', 'physique'],
    grammarStyle: 'lowercase-mixed',
    emojiUsage: 'low',
    activityPattern: 'after-work',
    avgPostsPerWeek: 3,
    avgCommentsPerWeek: 7,
    writingTraits: ['question-heavy', 'simple-phrasing', 'short-posts'],
    recurringConcerns: ['form confidence', 'consistency', 'lagging body parts'],
    preferredDays: ['Mon', 'Tue', 'Thu', 'Sun'],
    preferredWindows: ['evening', 'late']
  },
  {
    id: 'skinny-bulk-guy',
    weight: 0.9,
    tone: 'bro',
    favoriteTopics: ['bulking', 'training', 'nutrition'],
    preferredPostTypes: ['question', 'personal', 'personal', 'advice'],
    allowedImageTypes: ['food', 'physique', 'exercise'],
    grammarStyle: 'casual',
    emojiUsage: 'low',
    activityPattern: 'late-night',
    avgPostsPerWeek: 2,
    avgCommentsPerWeek: 6,
    writingTraits: ['bro-tone', 'progress-check-ins', 'food-questions'],
    recurringConcerns: ['appetite', 'weight gain pace', 'arm growth'],
    preferredDays: ['Mon', 'Wed', 'Fri', 'Sat'],
    preferredWindows: ['late', 'evening']
  },
  {
    id: 'cut-focused',
    weight: 0.85,
    tone: 'direct',
    favoriteTopics: ['cutting', 'nutrition', 'recovery'],
    preferredPostTypes: ['question', 'personal', 'advice'],
    allowedImageTypes: ['food', 'physique', 'general_gym'],
    grammarStyle: 'clean-lowercase',
    emojiUsage: 'low',
    activityPattern: 'morning-consistent',
    avgPostsPerWeek: 2,
    avgCommentsPerWeek: 5,
    writingTraits: ['calorie-aware', 'schedule-aware'],
    recurringConcerns: ['diet fatigue', 'hunger', 'training energy'],
    preferredDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    preferredWindows: ['morning']
  },
  {
    id: 'home-gym',
    weight: 0.75,
    tone: 'practical',
    favoriteTopics: ['training', 'lifestyle'],
    preferredPostTypes: ['question', 'advice', 'personal'],
    allowedImageTypes: ['equipment', 'exercise', 'general_gym'],
    grammarStyle: 'plain',
    emojiUsage: 'none',
    activityPattern: 'weekend-plus-evenings',
    avgPostsPerWeek: 2,
    avgCommentsPerWeek: 6,
    writingTraits: ['setup-focused', 'time-boxed'],
    recurringConcerns: ['equipment limitations', 'exercise order'],
    preferredDays: ['Wed', 'Fri', 'Sat', 'Sun'],
    preferredWindows: ['evening', 'morning']
  },
  {
    id: 'schedule-struggler',
    weight: 0.95,
    tone: 'frustrated',
    favoriteTopics: ['lifestyle', 'recovery', 'training'],
    preferredPostTypes: ['question', 'question', 'personal'],
    allowedImageTypes: ['planning', 'general_gym', 'food'],
    grammarStyle: 'lowercase-noisy',
    emojiUsage: 'medium',
    activityPattern: 'burst-poster',
    avgPostsPerWeek: 2,
    avgCommentsPerWeek: 8,
    writingTraits: ['messy-schedule', 'mini-rants'],
    recurringConcerns: ['falling off routine', 'sleep debt', 'work stress'],
    preferredDays: ['Tue', 'Thu', 'Sat'],
    preferredWindows: ['late', 'evening']
  },
  {
    id: 'meal-prep',
    weight: 0.8,
    tone: 'helpful',
    favoriteTopics: ['nutrition', 'bulking', 'cutting'],
    preferredPostTypes: ['advice', 'personal', 'question'],
    allowedImageTypes: ['food', 'planning'],
    grammarStyle: 'clean',
    emojiUsage: 'low',
    activityPattern: 'weekend-batch',
    avgPostsPerWeek: 2,
    avgCommentsPerWeek: 7,
    writingTraits: ['practical-recipes', 'macro-focus'],
    recurringConcerns: ['protein target', 'prep convenience'],
    preferredDays: ['Sun', 'Mon', 'Wed'],
    preferredWindows: ['morning', 'afternoon']
  },
  {
    id: 'gym-thoughts',
    weight: 0.7,
    tone: 'casual',
    favoriteTopics: ['lifestyle', 'training'],
    preferredPostTypes: ['casual', 'casual', 'question', 'personal'],
    allowedImageTypes: ['general_gym', 'physique'],
    grammarStyle: 'lowercase-casual',
    emojiUsage: 'medium',
    activityPattern: 'inconsistent-burst',
    avgPostsPerWeek: 2,
    avgCommentsPerWeek: 5,
    writingTraits: ['jokes', 'one-liners'],
    recurringConcerns: ['gym crowding', 'motivation swings'],
    preferredDays: ['Fri', 'Sat', 'Sun'],
    preferredWindows: ['evening', 'late']
  },
  {
    id: 'intermediate-fixer',
    weight: 0.7,
    tone: 'confident',
    favoriteTopics: ['training', 'recovery', 'supplements'],
    preferredPostTypes: ['advice', 'personal', 'question'],
    allowedImageTypes: ['exercise', 'physique', 'supplement'],
    grammarStyle: 'clean',
    emojiUsage: 'none',
    activityPattern: 'consistent',
    avgPostsPerWeek: 2,
    avgCommentsPerWeek: 9,
    writingTraits: ['worked-for-me style', 'specific fixes'],
    recurringConcerns: ['plateau fixes', 'exercise execution'],
    preferredDays: ['Mon', 'Wed', 'Fri'],
    preferredWindows: ['afternoon', 'evening']
  },
  {
    id: 'overthink-programming',
    weight: 0.65,
    tone: 'analytical',
    favoriteTopics: ['training', 'lifestyle', 'recovery'],
    preferredPostTypes: ['question', 'advice'],
    allowedImageTypes: ['planning', 'exercise', 'general_gym'],
    grammarStyle: 'clean',
    emojiUsage: 'none',
    activityPattern: 'late-night-planner',
    avgPostsPerWeek: 2,
    avgCommentsPerWeek: 6,
    writingTraits: ['split-discussion', 'progression-questions'],
    recurringConcerns: ['program complexity', 'volume management'],
    preferredDays: ['Tue', 'Thu', 'Sun'],
    preferredWindows: ['late']
  },
  {
    id: 'supplement-curious',
    weight: 0.6,
    tone: 'skeptical',
    favoriteTopics: ['supplements', 'nutrition', 'training'],
    preferredPostTypes: ['question', 'advice', 'personal'],
    allowedImageTypes: ['supplement', 'food', 'planning'],
    grammarStyle: 'casual',
    emojiUsage: 'low',
    activityPattern: 'after-work',
    avgPostsPerWeek: 1,
    avgCommentsPerWeek: 6,
    writingTraits: ['value-for-money', 'hype-check'],
    recurringConcerns: ['what actually works', 'budget stack'],
    preferredDays: ['Mon', 'Thu', 'Sat'],
    preferredWindows: ['evening']
  }
];

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  let cursor = rand() * total;
  for (const item of items) {
    cursor -= Number(item.weight || 0);
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

function buildUsername(index, used) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    let value = '';
    const roll = rand();
    if (roll < 0.3) {
      value = pick(plainNames);
    } else if (roll < 0.55) {
      value = `${pick(plainNames)}${pick(['21', '24', '27', '31', '92', '95'])}`;
    } else if (roll < 0.75) {
      value = `${pick(fitnessRoots)}${pick(fitnessSuffixes)}`;
    } else if (roll < 0.9) {
      value = `${pick(plainNames)}_${pick(['lifts', 'train', 'fit', 'gym', 'prep'])}`;
    } else {
      value = `${pick(['bro', 'night', 'late', 'gymrat', 'plates', 'macro'])}_${pick(['lifts', 'mode', 'notes', 'daily'])}`;
    }
    value = String(value).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
    if (value.length < 4) continue;
    if (!used.has(value)) {
      used.add(value);
      return value;
    }
  }
  const fallback = `user${String(index + 1).padStart(4, '0')}`;
  used.add(fallback);
  return fallback;
}

function buildUsers(count) {
  const users = [];
  const used = new Set();
  for (let index = 0; index < count; index += 1) {
    const archetype = weightedPick(archetypes);
    const username = buildUsername(index, used);
    const userId = `seed-user-${String(index + 1).padStart(4, '0')}`;
    const profileHash = hashText(`${userId}:${username}`);
    const hourRange = pick(archetype.preferredWindows.map((window) => windowToHours[window] || [8, 20]));
    const preferredHour = hourRange[0] <= hourRange[1]
      ? Math.floor(hourRange[0] + rand() * Math.max(1, hourRange[1] - hourRange[0]))
      : Math.floor(rand() * 24);

    users.push({
      userId,
      username,
      avatarUrl: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(userId)}&radius=50`,
      archetype: archetype.id,
      tone: archetype.tone,
      favoriteTopics: archetype.favoriteTopics.slice(),
      allowedImageTypes: archetype.allowedImageTypes.slice(),
      activityPattern: archetype.activityPattern,
      avgPostsPerWeek: archetype.avgPostsPerWeek,
      avgCommentsPerWeek: archetype.avgCommentsPerWeek,
      writingTraits: archetype.writingTraits.slice(),
      grammarStyle: archetype.grammarStyle,
      emojiUsage: archetype.emojiUsage,
      recurringConcerns: archetype.recurringConcerns.slice(),
      preferredPostTypes: archetype.preferredPostTypes.slice(),
      preferredDays: archetype.preferredDays.slice(),
      preferredTimeRanges: archetype.preferredWindows.slice(),
      activeHours: uniq(archetype.preferredWindows.flatMap((window) => {
        const [start, end] = windowToHours[window] || [8, 20];
        if (start <= end) return [start, Math.max(start, end - 1)];
        return [start, (start + 2) % 24];
      })),
      consistencyPattern: maybe(0.25) ? 'bursty' : maybe(0.35) ? 'consistent' : 'mixed',
      burstChance: Number((0.08 + rand() * 0.22).toFixed(2)),
      inactivityChance: Number((0.04 + rand() * 0.2).toFixed(2)),
      catchupPostingChance: Number((0.05 + rand() * 0.25).toFixed(2)),
      profileHash
    });
    users[index].targetPostShare = users[index].avgPostsPerWeek * (1 + (users[index].consistencyPattern === 'consistent' ? 0.3 : 0));
    users[index].assignedPosts = 0;
    users[index].assignedComments = 0;
    users[index].preferredHourLocal = preferredHour;
  }
  return users;
}

function textIncludesAny(text, patterns) {
  const hay = String(text || '').toLowerCase();
  return (patterns || []).some((item) => hay.includes(String(item).toLowerCase()));
}

function scoreUserForPost(user, post) {
  let score = 0;
  const topic = String(post.category || post.scope || '').toLowerCase();
  const postType = String(post.postType || '').toLowerCase();
  const imageType = String(post.imageType || '').toLowerCase();
  const titleBody = `${post.title || ''} ${post.body || ''}`.toLowerCase();
  const postHour = Number.isFinite(Number(post.preferredHourLocal)) ? Number(post.preferredHourLocal) : 12;

  if (user.favoriteTopics.includes(topic)) score += 3.4;
  if (user.preferredPostTypes.includes(postType)) score += 2.4;
  if (imageType && user.allowedImageTypes.includes(imageType)) score += 1.9;
  if (textIncludesAny(titleBody, user.recurringConcerns)) score += 1.8;
  if ((user.activeHours || []).includes(postHour)) score += 1.2;
  if (Math.abs(Number(user.preferredHourLocal || 12) - postHour) <= 2) score += 0.6;

  if (user.consistencyPattern === 'bursty' && post.ageMinutes < 1200) score += 0.45;
  if (user.consistencyPattern === 'consistent' && post.ageMinutes >= 1200) score += 0.25;

  const overloadPenalty = user.assignedPosts * 0.16;
  score -= overloadPenalty;
  score += (hashText(`${user.userId}:${post.id}`) % 1000) / 1000;
  return score;
}

function attachUsers(posts, users) {
  const items = posts.slice().sort((a, b) => Number(a.ageMinutes || 0) - Number(b.ageMinutes || 0));
  const totalTarget = users.reduce((sum, user) => sum + user.targetPostShare, 0);
  users.forEach((user) => {
    user.targetPosts = Math.max(1, Math.round((user.targetPostShare / totalTarget) * posts.length));
  });

  items.forEach((post) => {
    const candidates = users
      .map((user) => ({ user, score: scoreUserForPost(user, post) - Math.max(0, user.assignedPosts - user.targetPosts) * 1.8 }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
    const chosen = candidates[Math.floor(rand() * Math.max(1, Math.min(3, candidates.length)))].user;
    chosen.assignedPosts += 1;
    post.userId = chosen.userId;
    post.author = chosen.username;
    post.username = chosen.username;
    post.avatarUrl = chosen.avatarUrl;
    post.authorArchetype = chosen.archetype;
    post.authorTone = chosen.tone;
    post.authorWritingTraits = chosen.writingTraits.slice();
    post.authorGrammarStyle = chosen.grammarStyle;
    post.authorEmojiUsage = chosen.emojiUsage;
    post.authorRecurringConcerns = chosen.recurringConcerns.slice(0, 2);
    post.preferredHourLocal = post.preferredHourLocal ?? chosen.preferredHourLocal;
    post.preferredWindow = post.preferredWindow || pick(chosen.preferredTimeRanges);
  });
}

function main() {
  if (!fs.existsSync(POSTS_PATH)) {
    throw new Error(`Missing forum posts file: ${POSTS_PATH}`);
  }

  const postsPayload = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
  const posts = Array.isArray(postsPayload.items) ? postsPayload.items : [];
  const users = buildUsers(USER_COUNT);
  attachUsers(posts, users);

  users.forEach((user) => {
    delete user.targetPostShare;
    delete user.targetPosts;
  });

  postsPayload.generatedAt = new Date().toISOString();
  postsPayload.userSeed = SEED;
  postsPayload.seededUsers = users.length;
  postsPayload.items = posts;

  fs.writeFileSync(POSTS_PATH, `${JSON.stringify(postsPayload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(USERS_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    seed: SEED,
    total: users.length,
    items: users
  }, null, 2)}\n`, 'utf8');

  console.log(`[forum-users] users=${users.length} posts=${posts.length}`);
}

main();
