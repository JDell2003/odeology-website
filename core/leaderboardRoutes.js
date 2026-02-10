const crypto = require('crypto');
const db = require('./db');

const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.LEADERBOARD_MAX_BODY_BYTES || 200_000));

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function parseCookies(header) {
  const src = String(header || '');
  const out = {};
  src.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
  return true;
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str) {
  const h = sha256Hex(str);
  return Number.parseInt(h.slice(0, 8), 16) >>> 0;
}

function monthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDaysIso(isoDate, deltaDays) {
  const base = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + Number(deltaDays || 0));
  return base.toISOString().slice(0, 10);
}

function streakFromDateSet(dateSet, { todayIso } = {}) {
  const today = String(todayIso || new Date().toISOString().slice(0, 10));
  const yesterday = addDaysIso(today, -1);
  const start = dateSet.has(today) ? today : (yesterday && dateSet.has(yesterday) ? yesterday : null);
  if (!start) return 0;

  let streak = 0;
  let cursor = start;
  while (cursor && dateSet.has(cursor) && streak < 365) {
    streak += 1;
    cursor = addDaysIso(cursor, -1);
  }
  return streak;
}

function monthStartIso(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0)).toISOString();
}

function encodeSvgDataUrl(svg) {
  // Base64 avoids edge cases with SVG URL encoding in <img src="data:...">.
  const b64 = Buffer.from(String(svg || ''), 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

function avatarSvg({ initials, a, b }) {
  const safeInitials = String(initials || '?').slice(0, 3).toUpperCase();
  const ca = String(a || '#2dd4bf');
  const cb = String(b || '#f59e0b');
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${ca}"/>
          <stop offset="1" stop-color="${cb}"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#g)"/>
      <circle cx="64" cy="64" r="62" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="4"/>
      <text x="64" y="72" text-anchor="middle" font-family="Space Grotesk, Arial" font-size="42" font-weight="800" fill="rgba(16,12,10,0.86)">
        ${safeInitials}
      </text>
    </svg>
  `.trim();
}

function portraitUrl({ seed, gender } = {}) {
  const g = gender === 'women' ? 'women' : 'men';
  const n = Math.abs(Number(seed) || 1) % 100; // randomuser portraits: 0..99
  return `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
}

const AWARD_CATALOG = [
  { id: 'streak_3', label: 'Spark', tone: 'sky', desc: 'Log a daily check-in 3 days in a row.' },
  { id: 'streak_7', label: 'Week Warrior', tone: 'amber', desc: 'Log a daily check-in 7 days in a row.' },
  { id: 'streak_14', label: 'Two-Week Titan', tone: 'violet', desc: 'Log a daily check-in 14 days in a row.' },
  { id: 'streak_30', label: 'Month Locked', tone: 'indigo', desc: 'Log a daily check-in 30 days in a row.' },

  { id: 'workout_1', label: 'First Workout', tone: 'teal', desc: 'Save 1 workout (Training) this month.' },
  { id: 'workout_5', label: '5 Workouts', tone: 'emerald', desc: 'Save 5 workouts (Training) this month.' },
  { id: 'workout_10', label: '10 Workouts', tone: 'indigo', desc: 'Save 10 workouts (Training) this month.' },
  { id: 'workout_15', label: '15 Workouts', tone: 'rose', desc: 'Save 15 workouts (Training) this month.' },
  { id: 'workout_20', label: '20 Workouts', tone: 'amber', desc: 'Save 20 workouts (Training) this month.' },

  { id: 'checkin_1', label: 'First Check-in', tone: 'slate', desc: 'Save 1 daily check-in this month.' },
  { id: 'checkin_7', label: '7 Check-ins', tone: 'sky', desc: 'Save 7 daily check-ins this month.' },
  { id: 'checkin_14', label: '14 Check-ins', tone: 'violet', desc: 'Save 14 daily check-ins this month.' },
  { id: 'checkin_20', label: '20 Check-ins', tone: 'emerald', desc: 'Save 20 daily check-ins this month.' },

  { id: 'grocery_1', label: 'First Grocery Plan', tone: 'lime', desc: 'Save 1 grocery plan this month.' },
  { id: 'grocery_3', label: 'Grocery Routine', tone: 'teal', desc: 'Save 3 grocery plans this month.' },
  { id: 'grocery_6', label: 'Grocery Strategist', tone: 'indigo', desc: 'Save 6 grocery plans this month.' },
  { id: 'grocery_10', label: 'Grocery Architect', tone: 'amber', desc: 'Save 10 grocery plans this month.' },

  { id: 'mealprep_1', label: 'Meal Prep: Yes', tone: 'rose', desc: 'Mark Meal Prep = Yes on a daily check-in.' },
  { id: 'mealprep_7', label: 'Meal Prep Week', tone: 'emerald', desc: 'Mark Meal Prep = Yes on 7 check-ins this month.' },
  { id: 'mealprep_14', label: 'Meal Prep Machine', tone: 'amber', desc: 'Mark Meal Prep = Yes on 14 check-ins this month.' },

  { id: 'planmeals_1', label: 'Meals On Plan', tone: 'teal', desc: 'Mark Meals On Plan = Yes on a daily check-in.' },
  { id: 'planmeals_7', label: 'On-Plan Week', tone: 'violet', desc: 'Mark Meals On Plan = Yes on 7 check-ins this month.' },
  { id: 'planmeals_14', label: 'On-Plan Operator', tone: 'indigo', desc: 'Mark Meals On Plan = Yes on 14 check-ins this month.' },

  { id: 'measures_1', label: 'Measurements Logged', tone: 'sky', desc: 'Log at least 1 measurement field on a check-in.' },
  { id: 'triple_measures_1', label: 'Full Set', tone: 'amber', desc: 'Log waist + chest + hips on the same check-in.' },
  { id: 'measures_7', label: 'Metrics Week', tone: 'teal', desc: 'Log measurements on 7 different days this month.' },
  { id: 'measures_21', label: 'Metrics Master', tone: 'violet', desc: 'Log 21 total measurement fields this month.' },

  { id: 'points_100', label: '100 Points Club', tone: 'lime', desc: 'Earn 100 leaderboard points this month.' },
  { id: 'points_500', label: '500 Points', tone: 'amber', desc: 'Earn 500 leaderboard points this month.' },
  { id: 'points_1000', label: '1,000 Points', tone: 'indigo', desc: 'Earn 1,000 leaderboard points this month.' }
];

function pickAward(id) {
  return AWARD_CATALOG.find((a) => a.id === id) || null;
}

function tierPick(n, tiers) {
  const value = Number(n || 0);
  for (const t of Array.isArray(tiers) ? tiers : []) {
    if (value >= Number(t.min || 0)) return t.id;
  }
  return '';
}

function computeBadgesLegacy(entry, { month, day } = {}) {
  const badges = [];
  const points = Number(entry?.points || 0);
  const streakDays = Number(entry?.streakDays || 0);
  const rank = Number(entry?.rank || 0);

  const title = computeTitleBadge({ points });
  if (title) badges.push(title);

  if (rank && rank <= 1) badges.push(pickBadge('champion'));
  else if (rank && rank <= 3) badges.push(pickBadge('top_3'));
  else if (rank && rank <= 10) badges.push(pickBadge('top_10'));

  if (streakDays >= 30) badges.push(pickBadge('streak_30'));
  else if (streakDays >= 14) badges.push(pickBadge('streak_14'));
  else if (streakDays >= 7) badges.push(pickBadge('streak_7'));

  // Add 1–2 "flavor" badges deterministically so rows feel different.
  const flavorPool = [
    'discipline', 'sleep', 'mobility', 'steps', 'macro_master', 'meal_prep',
    'strength', 'technique', 'iron_mind', 'coach_mode', 'weekend_warrior',
    'early_riser', 'night_owl', 'recomp', 'cutting', 'bulking'
  ].map(pickBadge).filter(Boolean);

  const seedStr = `ode_badges_${month || ''}_${day || ''}_${String(entry?.id || entry?.handle || entry?.displayName || '')}`;
  const flavor = seededPickMany(seedStr, flavorPool, 2);
  flavor.forEach((b) => badges.push(b));

  // Dedup by id and cap to keep rows compact.
  const seen = new Set();
  return badges.filter((b) => {
    const id = String(b?.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 5);
}

// Awards-based badges: everyone can earn these via real activity.
function computeBadges(entry) {
  const points = Number(entry?.points || 0);
  const streakDays = Number(entry?.streakDays || 0);
  const breakdown = entry?.breakdown && typeof entry.breakdown === 'object' ? entry.breakdown : {};
  const workouts = Number(breakdown.workouts || 0);
  const checkins = Number(breakdown.checkins || 0);
  const groceryPlans = Number(breakdown.groceryPlans || 0);
  const mealPrepDays = Number(breakdown.mealPrepDays || 0);
  const mealsOnPlanDays = Number(breakdown.mealsOnPlanDays || 0);
  const measurementFields = Number(breakdown.measurementBonus || 0);
  const measurementDays = Number(breakdown.measurementDays || 0);
  const tripleMeasureDays = Number(breakdown.tripleMeasureDays || 0);

  const picks = [];
  const add = (id) => { if (id) picks.push(id); };

  add(tierPick(points, [
    { id: 'points_1000', min: 1000 },
    { id: 'points_500', min: 500 },
    { id: 'points_100', min: 100 }
  ]));

  add(tierPick(streakDays, [
    { id: 'streak_30', min: 30 },
    { id: 'streak_14', min: 14 },
    { id: 'streak_7', min: 7 },
    { id: 'streak_3', min: 3 }
  ]));

  add(tierPick(workouts, [
    { id: 'workout_20', min: 20 },
    { id: 'workout_15', min: 15 },
    { id: 'workout_10', min: 10 },
    { id: 'workout_5', min: 5 },
    { id: 'workout_1', min: 1 }
  ]));

  add(tierPick(checkins, [
    { id: 'checkin_20', min: 20 },
    { id: 'checkin_14', min: 14 },
    { id: 'checkin_7', min: 7 },
    { id: 'checkin_1', min: 1 }
  ]));

  const utilities = [];
  const pushUtil = (id, score) => { if (id) utilities.push({ id, score: Number(score || 0) }); };

  pushUtil(tierPick(groceryPlans, [
    { id: 'grocery_10', min: 10 },
    { id: 'grocery_6', min: 6 },
    { id: 'grocery_3', min: 3 },
    { id: 'grocery_1', min: 1 }
  ]), groceryPlans);

  pushUtil(tierPick(mealPrepDays, [
    { id: 'mealprep_14', min: 14 },
    { id: 'mealprep_7', min: 7 },
    { id: 'mealprep_1', min: 1 }
  ]), mealPrepDays);

  pushUtil(tierPick(mealsOnPlanDays, [
    { id: 'planmeals_14', min: 14 },
    { id: 'planmeals_7', min: 7 },
    { id: 'planmeals_1', min: 1 }
  ]), mealsOnPlanDays);

  let measuresId = '';
  if (measurementFields >= 21) measuresId = 'measures_21';
  else if (measurementDays >= 7) measuresId = 'measures_7';
  else if (measurementFields >= 1) measuresId = 'measures_1';
  pushUtil(measuresId, measurementFields + measurementDays);

  if (tripleMeasureDays >= 1) pushUtil('triple_measures_1', 10_000);

  utilities.sort((a, b) => b.score - a.score);
  add(utilities[0]?.id || '');

  const seen = new Set();
  const out = [];
  for (const id of picks) {
    const award = pickAward(id);
    if (!award?.id || seen.has(award.id)) continue;
    seen.add(award.id);
    out.push(award);
    if (out.length >= 5) break;
  }
  return out;
}

function makeBotPool({ month, day }) {
  const seed = seedFromString(`ode_leaderboard_${month}`);
  const rnd = mulberry32(seed);
  const palette = [
    ['#22c55e', '#06b6d4'],
    ['#a78bfa', '#f472b6'],
    ['#f97316', '#facc15'],
    ['#60a5fa', '#34d399'],
    ['#fb7185', '#f59e0b'],
    ['#38bdf8', '#a3e635'],
    ['#fda4af', '#93c5fd'],
    ['#10b981', '#fbbf24']
  ];

  const names = [
    { displayName: 'Mia Carter', handle: '@miacarter' },
    { displayName: 'Jordan Lee', handle: '@jlee' },
    { displayName: 'Noah Patel', handle: '@noahpatel' },
    { displayName: 'Ava Nguyen', handle: '@ava.ng' },
    { displayName: 'Elijah Brooks', handle: '@ebrooks' },
    { displayName: 'Sofia Ramirez', handle: '@sofiaram' },
    { displayName: 'Caleb Johnson', handle: '@calebj' }
  ];

  const bios = [
    'Cutting season. Steps daily. Protein first.',
    'Strength focus. Sleep locked in.',
    'Recomp in progress. Consistency > perfection.',
    'Meal prep Sundays. Gym before work.',
    'Tracking macros, lifting heavy, staying humble.',
    'New PRs this month. Showing up anyway.',
    'Bulking clean. Mobility every session.'
  ];

  const now = new Date();
  const today = new Date(`${day}T00:00:00Z`);
  const joinOffsets = new Set();
  while (joinOffsets.size < 7) {
    joinOffsets.add(Math.floor(rnd() * 7));
  }
  const joinList = Array.from(joinOffsets).sort((a, b) => a - b);

  const bots = names.map((n, idx) => {
    const [a, b] = palette[idx % palette.length];
    const initials = n.displayName.split(' ').map(s => s.slice(0, 1)).join('').slice(0, 2);
    const base = 420 + Math.floor(rnd() * 280) + idx * 8;

    // Slight daily fluctuation (deterministic per day).
    const daySeed = seedFromString(`ode_leaderboard_${month}_${day}_${n.handle}`);
    const dr = mulberry32(daySeed);
    const delta = Math.floor(dr() * 31) - 15; // -15..+15

    const joinDaysAgo = joinList[idx] ?? idx;
    const joinedAt = new Date(today);
    joinedAt.setUTCDate(joinedAt.getUTCDate() - joinDaysAgo);

    const streakSeed = seedFromString(`ode_leaderboard_streak_${month}_${day}_${n.handle}`);
    const sr2 = mulberry32(streakSeed);
    const streakDays = 2 + Math.floor(sr2() * 18); // 2..19

    const points = Math.max(0, base + delta);
    const workouts = Math.min(24, Math.max(1, Math.round(points / 85)));
    const checkins = Math.min(26, Math.max(streakDays, Math.round(points / 35)));
    const groceryPlans = Math.min(12, Math.max(0, Math.round(points / 180)));
    const mealPrepDays = Math.min(checkins, Math.max(0, Math.round(checkins * (0.30 + dr() * 0.30))));
    const mealsOnPlanDays = Math.min(checkins, Math.max(0, Math.round(checkins * (0.35 + dr() * 0.35))));
    const measurementDays = Math.min(checkins, Math.max(0, Math.round(checkins * (0.20 + dr() * 0.30))));
    const fieldsPerMeasureDay = 1 + Math.floor(dr() * 3);
    const measurementBonus = Math.min(measurementDays * 3, measurementDays * fieldsPerMeasureDay);
    const tripleMeasureDays = measurementDays > 0 && dr() > 0.62 ? 1 : 0;

    const avatarSeed = seedFromString(`ode_leaderboard_avatar_${month}_${day}_${n.handle}`);
    const ar = mulberry32(avatarSeed);
    const gender = ar() > 0.5 ? 'women' : 'men';
    const wantsAvatar = true;
    return {
      id: `bot_${month}_${idx}`,
      displayName: n.displayName,
      handle: n.handle,
      avatarUrl: wantsAvatar ? portraitUrl({ seed: avatarSeed, gender }) : '',
      joinedAt: joinedAt.toISOString(),
      points,
      breakdown: {
        workouts,
        checkins,
        groceryPlans,
        mealPrepDays,
        mealsOnPlanDays,
        measurementDays,
        measurementBonus,
        tripleMeasureDays
      },
      bio: bios[idx] || '',
      streakDays,
      isBot: true
    };
  });

  // Shuffle a little per month so the bot set feels "new" monthly.
  const shuffleSeed = seedFromString(`ode_leaderboard_shuffle_${month}`);
  const sr = mulberry32(shuffleSeed);
  for (let i = bots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(sr() * (i + 1));
    [bots[i], bots[j]] = [bots[j], bots[i]];
  }

  return bots;
}

async function scoreUserStreakDays(userId, { todayIso } = {}) {
  if (!db.isConfigured()) return 0;
  const today = String(todayIso || new Date().toISOString().slice(0, 10));
  const from = addDaysIso(today, -60) || today;

  const dateSet = new Set();

  try {
    const checkinsRes = await db.query(
      `
        SELECT day::date AS day
        FROM app_daily_checkins
        WHERE user_id = $1
          AND day >= $2::date;
      `,
      [userId, from]
    );
    (checkinsRes.rows || []).forEach((r) => {
      const d = String(r.day || '').slice(0, 10);
      if (d) dateSet.add(d);
    });
  } catch {
    // ignore
  }

  try {
    const workoutsRes = await db.query(
      `
        SELECT COALESCE(performed_at::date, created_at::date) AS day
        FROM app_training_workouts
        WHERE user_id = $1
          AND COALESCE(performed_at::date, created_at::date) >= $2::date;
      `,
      [userId, from]
    );
    (workoutsRes.rows || []).forEach((r) => {
      const d = String(r.day || '').slice(0, 10);
      if (d) dateSet.add(d);
    });
  } catch {
    // ignore
  }

  return streakFromDateSet(dateSet, { todayIso: today });
}

async function resolveUserFromSession(req) {
  if (!db.isConfigured()) return null;
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const result = await db.query(
    `
      SELECT u.id, u.display_name, u.username, u.created_at
      FROM app_sessions s
      JOIN app_users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
        AND s.expires_at > now()
      LIMIT 1;
    `,
    [tokenHash]
  );
  const row = result.rows?.[0] || null;
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
    joinedAt: row.created_at
  };
}

function rules() {
  return {
    cadence: 'Leaderboard resets monthly.',
    points: [
      { action: 'Save a workout (Training)', points: 25, note: 'Each logged training day.' },
      { action: 'Save a daily check-in', points: 10, note: 'Basic Check-in modal.' },
      { action: 'Meal prep = Yes', points: 5, note: 'Bonus on check-in.' },
      { action: 'Meals on plan = Yes', points: 5, note: 'Bonus on check-in.' },
      { action: 'Save a grocery plan', points: 15, note: 'Each time you generate a grocery plan.' },
      { action: 'Log measurements', points: 1, note: 'Per measurement field (waist/chest/hips), up to 3/day.' }
    ],
    fairness: [
      'Bots fluctuate slightly each day to simulate a live community.',
      'Your points are based on your real activity this month.'
    ]
  };
}

async function scoreUserForMonth(userId, { monthStart } = {}) {
  if (!db.isConfigured()) return { points: 0, breakdown: {} };

  const fromIso = monthStart || monthStartIso(new Date());

  // Workouts this month
  const workoutsRes = await db.query(
    `
      SELECT COUNT(*)::int AS n
      FROM app_training_workouts
      WHERE user_id = $1
        AND COALESCE(performed_at::timestamptz, created_at) >= $2::timestamptz;
    `,
    [userId, fromIso]
  );
  const workouts = Number(workoutsRes.rows?.[0]?.n || 0);

  // Check-ins this month (with bonuses)
  const checkinsRes = await db.query(
    `
      SELECT day, data
      FROM app_daily_checkins
      WHERE user_id = $1
        AND day >= $2::date;
    `,
    [userId, fromIso]
  );
  const checkins = Array.isArray(checkinsRes.rows) ? checkinsRes.rows : [];

  let checkinPoints = checkins.length * 10;
  let mealPrepBonus = 0;
  let mealsOnPlanBonus = 0;
  let measurementBonus = 0;
  let mealPrepDays = 0;
  let mealsOnPlanDays = 0;
  let measurementDays = 0;
  let tripleMeasureDays = 0;

  for (const row of checkins) {
    const data = row?.data && typeof row.data === 'object' ? row.data : {};
    if (String(data.mealPrep || '').toLowerCase() === 'yes') {
      mealPrepBonus += 5;
      mealPrepDays += 1;
    }
    if (String(data.mealsOnPlan || '').toLowerCase() === 'yes') {
      mealsOnPlanBonus += 5;
      mealsOnPlanDays += 1;
    }
    const waist = Number(data?.circumferences?.waistIn);
    const chest = Number(data?.circumferences?.chestIn);
    const hips = Number(data?.circumferences?.hipsIn);
    let dayMeasures = 0;
    if (Number.isFinite(waist) && waist > 0) dayMeasures += 1;
    if (Number.isFinite(chest) && chest > 0) dayMeasures += 1;
    if (Number.isFinite(hips) && hips > 0) dayMeasures += 1;
    measurementBonus += Math.min(3, dayMeasures);
    if (dayMeasures > 0) measurementDays += 1;
    if (dayMeasures >= 3) tripleMeasureDays += 1;
  }

  // Grocery plans this month
  const groceryRes = await db.query(
    `
      SELECT COUNT(*)::int AS n
      FROM app_grocery_lists
      WHERE user_id = $1
        AND created_at >= $2::timestamptz;
    `,
    [userId, fromIso]
  );
  const groceryPlans = Number(groceryRes.rows?.[0]?.n || 0);
  const groceryPoints = groceryPlans * 15;

  const workoutPoints = workouts * 25;
  const total = workoutPoints + checkinPoints + mealPrepBonus + mealsOnPlanBonus + groceryPoints + measurementBonus;

  return {
    points: total,
    breakdown: {
      workouts,
      workoutPoints,
      checkins: checkins.length,
      checkinPoints,
      mealPrepBonus,
      mealsOnPlanBonus,
      mealPrepDays,
      mealsOnPlanDays,
      groceryPlans,
      groceryPoints,
      measurementBonus,
      measurementDays,
      tripleMeasureDays
    }
  };
}

function buildLeaderboard({ entries, userEntry, month, day }) {
  const list = entries.slice().sort((a, b) => b.points - a.points);
  const ranked = list.map((row, idx) => ({ ...row, rank: idx + 1 }));
  const withBadges = ranked.map((row) => ({ ...row, badges: computeBadges(row, { month, day }) }));
  let you = null;
  if (userEntry) {
    const found = withBadges.find((r) => r.id === userEntry.id) || null;
    if (found) you = found;
  }
  return { entries: withBadges, you };
}

module.exports = async function leaderboardRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/leaderboard')) return false;

  // Public: no auth required, but includes "you" if signed in.
  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    const now = new Date();
    const month = monthKey(now);
    const day = todayKey(now);

    const bots = makeBotPool({ month, day });
    let user = null;
    let userEntry = null;

    if (db.isConfigured()) {
      try {
        user = await resolveUserFromSession(req);
      } catch {
        user = null;
      }
    }

    if (user && db.isConfigured()) {
      try {
        const profileRes = await db.query(
          `SELECT profile_image, bio FROM app_training_profiles WHERE user_id = $1 LIMIT 1;`,
          [user.id]
        );
        const profileImage = profileRes.rows?.[0]?.profile_image || null;
        const bio = profileRes.rows?.[0]?.bio || '';
        const initials = String(user.displayName || user.username || 'You')
          .split(' ')
          .map(s => s.slice(0, 1))
          .join('')
          .slice(0, 2)
          .toUpperCase();
        const avatarUrl = profileImage || encodeSvgDataUrl(avatarSvg({ initials, a: '#0ea5e9', b: '#22c55e' }));

        const score = await scoreUserForMonth(user.id, { monthStart: monthStartIso(now) });
        const streakDays = await scoreUserStreakDays(user.id, { todayIso: day });
        userEntry = {
          id: String(user.id),
          displayName: user.displayName || user.username || 'You',
          handle: user.username ? `@${user.username}` : '@you',
          avatarUrl,
          joinedAt: user.joinedAt,
          points: Number(score.points) || 0,
          breakdown: score.breakdown || {},
          bio,
          streakDays,
          isBot: false
        };
      } catch {
        userEntry = null;
      }
    }

    const combined = userEntry ? [...bots, userEntry] : bots;
    const { entries, you } = buildLeaderboard({ entries: combined, userEntry, month, day });
    return sendJson(res, 200, { month, day, rules: rules(), entries, you });
  }

  if (url.pathname === '/api/leaderboard/rules' && req.method === 'GET') {
    return sendJson(res, 200, rules());
  }

  // Optional: future admin/manual adjustments.
  if (url.pathname === '/api/leaderboard' && req.method === 'POST') {
    try {
      await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    return sendJson(res, 501, { error: 'Not implemented' });
  }

  return sendJson(res, 404, { error: 'Not found' });
};
