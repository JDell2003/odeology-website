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

function cleanShortText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function notesHasFlag(notes, flag) {
  const hay = String(notes || '').toLowerCase();
  const needle = String(flag || '').toLowerCase();
  if (!needle) return false;
  return hay.split(/[,\s;|/]+/).some((part) => part === needle);
}

function normalizeManagerCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 80);
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
      SELECT
        u.id,
        u.display_name,
        u.username,
        u.created_at,
        u.admin_notes,
        COALESCE(tp.meta->>'managerCode', '') AS manager_code,
        COALESCE(tp.meta->>'workspaceId', '') AS workspace_id,
        COALESCE(tp.meta->>'locationId', '') AS location_id
      FROM app_sessions s
      JOIN app_users u ON u.id = s.user_id
      LEFT JOIN app_trainer_profiles tp ON tp.user_id = u.id
      WHERE s.session_token_hash = $1
        AND s.expires_at > now()
      LIMIT 1;
    `,
    [tokenHash]
  );
  const row = result.rows?.[0] || null;
  if (!row) return null;
  let hasTrainerWorkspace = false;
  try {
    const trainerResult = await db.query(
      `
        SELECT EXISTS (
          SELECT 1 FROM app_trainer_profiles WHERE user_id = $1
          UNION ALL
          SELECT 1 FROM app_trainer_clients WHERE trainer_user_id = $1
          UNION ALL
          SELECT 1 FROM app_trainer_invites WHERE trainer_user_id = $1
          LIMIT 1
        ) AS has_trainer_workspace;
      `,
      [row.id]
    );
    hasTrainerWorkspace = trainerResult.rows?.[0]?.has_trainer_workspace === true;
  } catch {
    hasTrainerWorkspace = false;
  }
  const isManager = notesHasFlag(row.admin_notes, 'manager');
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
    joinedAt: row.created_at,
    isTrainer: notesHasFlag(row.admin_notes, 'trainer') || (hasTrainerWorkspace && !isManager),
    isManager,
    managerCode: normalizeManagerCode(row.manager_code || ''),
    workspaceId: row.workspace_id || '',
    locationId: row.location_id || ''
  };
}

function trainerClientRules() {
  return {
    cadence: 'Trainer client leaderboard resets monthly and only includes clients linked to this trainer account.',
    points: [
      { action: 'Client logs a workout', points: 30, note: 'Each saved training day this month.' },
      { action: 'Client submits a daily check-in', points: 10, note: 'Shows the client is reporting in.' },
      { action: 'Meals on plan = Yes', points: 8, note: 'Nutrition adherence bonus.' },
      { action: 'Meals or calories tracked', points: 5, note: 'Counts as meal tracking for the day.' },
      { action: 'Water tracked', points: 4, note: 'Any water amount logged on the check-in.' },
      { action: 'Measurements logged', points: 3, note: 'Per day with waist, chest, or hips logged.' },
      { action: 'Trainer approves a workout', points: 10, note: 'Reviewed workouts count toward coaching accountability.' },
      { action: 'Meals off plan', points: -5, note: 'Penalty when the client marks meals off plan.' },
      { action: 'Check-in without meals tracked', points: -4, note: 'Tracks missed meals on reported days.' },
      { action: 'Missed daily check-in', points: -2, note: 'Capped at 10 missed days so new clients are not buried.' }
    ],
    fairness: [
      'Only linked clients for the signed-in trainer are ranked.',
      'Workout rate assumes a practical target of 3 workouts per week unless a richer client schedule is added later.'
    ]
  };
}

function metricBadge(id, label, tone = 'slate', desc = '') {
  return { id, label, tone, desc };
}

async function buildTrainerClientLeaderboard(trainer, { now = new Date() } = {}) {
  if (!trainer?.id || !db.isConfigured()) return null;
  const month = monthKey(now);
  const day = todayKey(now);
  const monthStart = monthStartIso(now);

  const rosterResult = await db.query(
    `
      WITH roster AS (
        SELECT
          'coaching'::text AS source_type,
          ti.id::text AS source_id,
          ti.linked_user_id,
          COALESCE(NULLIF(BTRIM(CONCAT(COALESCE(ti.first_name, ''), ' ', COALESCE(ti.last_name, ''))), ''), ti.email, 'Client') AS display_name,
          ti.email,
          COALESCE(ti.accepted_at, ti.created_at) AS joined_at
        FROM app_trainer_invites ti
        WHERE ti.trainer_user_id = $1
          AND ti.invite_type = 'coaching_invite'
          AND ti.linked_user_id IS NOT NULL
        UNION ALL
        SELECT
          'manual'::text AS source_type,
          c.id::text AS source_id,
          c.linked_user_id,
          c.display_name,
          c.email,
          c.created_at AS joined_at
        FROM app_trainer_clients c
        WHERE c.trainer_user_id = $1
          AND c.status <> 'removed'
          AND c.linked_user_id IS NOT NULL
      ),
      deduped AS (
        SELECT DISTINCT ON (linked_user_id)
          source_type,
          source_id,
          linked_user_id,
          display_name,
          email,
          joined_at
        FROM roster
        ORDER BY linked_user_id, CASE WHEN source_type = 'coaching' THEN 0 ELSE 1 END, joined_at DESC
      )
      SELECT
        d.*,
        u.username,
        u.display_name AS account_display_name,
        u.created_at AS account_created_at,
        tp.profile_image,
        tp.bio
      FROM deduped d
      JOIN app_users u ON u.id = d.linked_user_id
      LEFT JOIN app_training_profiles tp ON tp.user_id = u.id
      ORDER BY d.joined_at DESC NULLS LAST, d.display_name ASC;
    `,
    [trainer.id]
  );

  const clients = Array.isArray(rosterResult.rows) ? rosterResult.rows : [];
  const linkedIds = clients.map((row) => String(row.linked_user_id || '').trim()).filter(Boolean);
  if (!linkedIds.length) {
    return {
      mode: 'trainer_clients',
      month,
      day,
      rules: trainerClientRules(),
      entries: [],
      you: null,
      summary: { clientCount: 0, avgWorkoutRate: 0, atRiskCount: 0 }
    };
  }

  const workoutsRes = await db.query(
    `
      SELECT
        user_id,
        COUNT(*)::int AS workouts,
        MAX(COALESCE(performed_at::timestamptz, created_at)) AS last_workout_at,
        AVG(NULLIF(readiness, 0)) AS avg_readiness,
        SUM(COALESCE(duration_ms, 0))::bigint AS total_duration_ms
      FROM app_training_workouts
      WHERE user_id = ANY($1::uuid[])
        AND COALESCE(performed_at::timestamptz, created_at) >= $2::timestamptz
      GROUP BY user_id;
    `,
    [linkedIds, monthStart]
  );

  const checkinsRes = await db.query(
    `
      SELECT user_id, day, data
      FROM app_daily_checkins
      WHERE user_id = ANY($1::uuid[])
        AND day >= $2::date;
    `,
    [linkedIds, monthStart]
  );

  const reviewsRes = await db.query(
    `
      SELECT client_user_id, COUNT(*)::int AS approved_reviews
      FROM app_trainer_workout_reviews
      WHERE trainer_user_id = $1
        AND client_user_id = ANY($2::uuid[])
        AND reviewed_at >= $3::timestamptz
        AND status = 'approved'
      GROUP BY client_user_id;
    `,
    [trainer.id, linkedIds, monthStart]
  );

  const workoutsByUser = new Map();
  (workoutsRes.rows || []).forEach((row) => workoutsByUser.set(String(row.user_id), row));
  const reviewsByUser = new Map();
  (reviewsRes.rows || []).forEach((row) => reviewsByUser.set(String(row.client_user_id), Number(row.approved_reviews || 0)));
  const checkinsByUser = new Map();
  (checkinsRes.rows || []).forEach((row) => {
    const key = String(row.user_id);
    if (!checkinsByUser.has(key)) checkinsByUser.set(key, []);
    checkinsByUser.get(key).push(row);
  });

  const todayDate = new Date(`${day}T00:00:00Z`);
  const startDate = new Date(monthStart);
  const monthDaysElapsed = Math.max(1, Math.floor((todayDate - startDate) / 86400000) + 1);
  const weeksElapsed = Math.max(1 / 7, monthDaysElapsed / 7);

  const entries = clients.map((row) => {
    const userId = String(row.linked_user_id || '');
    const displayName = cleanShortText(row.display_name || row.account_display_name || row.email || 'Client', 120);
    const initials = displayName.split(' ').map((s) => s.slice(0, 1)).join('').slice(0, 2).toUpperCase();
    const avatarUrl = row.profile_image || encodeSvgDataUrl(avatarSvg({ initials, a: '#d8952f', b: '#1f2937' }));
    const workouts = workoutsByUser.get(userId) || {};
    const checkins = checkinsByUser.get(userId) || [];
    const approvedReviews = reviewsByUser.get(userId) || 0;

    let mealsOnPlanDays = 0;
    let mealsOffPlanDays = 0;
    let mealTrackedDays = 0;
    let waterDays = 0;
    let measurementDays = 0;
    let readinessSum = 0;
    let readinessCount = 0;

    checkins.forEach((item) => {
      const data = item?.data && typeof item.data === 'object' ? item.data : {};
      const meals = Array.isArray(data.meals) ? data.meals : [];
      const calories = Number(data?.macros?.calories);
      const waterOz = Number(data?.waterOz);
      const mealsOnPlan = String(data?.mealsOnPlan || '').trim().toLowerCase();
      const readiness = Number(data?.readiness || data?.energy || data?.sleepQuality);
      if (mealsOnPlan === 'yes') mealsOnPlanDays += 1;
      if (mealsOnPlan === 'no') mealsOffPlanDays += 1;
      if (meals.length || (Number.isFinite(calories) && calories > 0)) mealTrackedDays += 1;
      if (Number.isFinite(waterOz) && waterOz > 0) waterDays += 1;
      const c = data?.circumferences && typeof data.circumferences === 'object' ? data.circumferences : {};
      if ([c.waistIn, c.chestIn, c.hipsIn].some((v) => Number.isFinite(Number(v)) && Number(v) > 0)) measurementDays += 1;
      if (Number.isFinite(readiness) && readiness > 0) {
        readinessSum += readiness;
        readinessCount += 1;
      }
    });

    const workoutCount = Number(workouts.workouts || 0);
    const checkinCount = checkins.length;
    const missedMealDays = Math.max(0, checkinCount - mealTrackedDays);
    const possibleDays = Math.max(1, monthDaysElapsed);
    const missedCheckins = Math.max(0, possibleDays - checkinCount);
    const workoutRate = workoutCount / weeksElapsed;
    const workoutAdherence = Math.min(100, Math.round((workoutRate / 3) * 100));
    const avgReadiness = readinessCount
      ? Math.round((readinessSum / readinessCount) * 10) / 10
      : (workouts.avg_readiness ? Math.round(Number(workouts.avg_readiness) * 10) / 10 : null);

    const points = Math.max(0,
      (workoutCount * 30)
      + (checkinCount * 10)
      + (mealsOnPlanDays * 8)
      + (mealTrackedDays * 5)
      + (waterDays * 4)
      + (measurementDays * 3)
      + (approvedReviews * 10)
      - (mealsOffPlanDays * 5)
      - (missedMealDays * 4)
      - (Math.min(missedCheckins, 10) * 2)
    );

    const riskFlags = [];
    if (workoutAdherence < 50) riskFlags.push('low workout rate');
    if (missedMealDays >= 3 || mealsOffPlanDays >= 3) riskFlags.push('meal misses');
    if (missedCheckins >= 3) riskFlags.push('missed check-ins');
    const status = riskFlags.length ? 'needs attention' : 'on track';

    return {
      id: userId,
      displayName,
      handle: row.username ? `@${row.username}` : (row.email || ''),
      avatarUrl,
      joinedAt: row.joined_at || row.account_created_at,
      points,
      breakdown: {
        workouts: workoutCount,
        checkins: checkinCount,
        mealsOnPlanDays,
        mealsOffPlanDays,
        mealTrackedDays,
        missedMealDays,
        missedCheckins,
        waterDays,
        measurementDays,
        approvedReviews,
        workoutRate,
        workoutAdherence,
        avgReadiness,
        lastWorkoutAt: workouts.last_workout_at || null,
        totalDurationMs: Number(workouts.total_duration_ms || 0)
      },
      badges: [
        metricBadge('workout_rate', `${workoutRate.toFixed(1)}/wk`, workoutAdherence >= 75 ? 'teal' : 'amber', 'Workout rate this month.'),
        metricBadge('meals', `${mealsOnPlanDays}/${checkinCount || 0} meals on plan`, mealsOffPlanDays ? 'rose' : 'emerald', 'Nutrition adherence from check-ins.'),
        metricBadge('missed', `${missedMealDays} missed meals`, missedMealDays ? 'rose' : 'slate', 'Check-in days without meals/calories tracked.'),
        metricBadge('checkins', `${checkinCount} check-ins`, checkinCount >= Math.max(3, possibleDays - 2) ? 'teal' : 'amber', 'Daily check-ins this month.'),
        metricBadge('status', status, riskFlags.length ? 'rose' : 'emerald', riskFlags.join(', '))
      ],
      bio: riskFlags.length ? `Watch: ${riskFlags.join(', ')}.` : 'Client is tracking consistently this month.',
      streakDays: 0,
      isBot: false,
      isTrainerClient: true
    };
  });

  const ranked = entries
    .sort((a, b) => b.points - a.points || Number(b.breakdown.workoutAdherence || 0) - Number(a.breakdown.workoutAdherence || 0))
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
  const atRiskCount = ranked.filter((entry) => String(entry.bio || '').startsWith('Watch:')).length;
  const avgWorkoutRate = ranked.length
    ? ranked.reduce((sum, entry) => sum + Number(entry.breakdown?.workoutRate || 0), 0) / ranked.length
    : 0;

  return {
    mode: 'trainer_clients',
    month,
    day,
    rules: trainerClientRules(),
    entries: ranked,
    you: null,
    summary: {
      clientCount: ranked.length,
      avgWorkoutRate: Math.round(avgWorkoutRate * 10) / 10,
      atRiskCount
    }
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

function managerTrainerRules() {
  return {
    cadence: 'Manager trainer leaderboard resets monthly and only includes trainers under this manager account.',
    points: [
      { action: 'Retain an active client', points: 25, note: 'Current linked clients still active under the trainer.' },
      { action: 'Add a new client', points: 35, note: 'Linked client added this month.' },
      { action: 'Client logs a workout', points: 12, note: 'Every client workout under that trainer.' },
      { action: 'Client submits a daily check-in', points: 8, note: 'Daily client reporting.' },
      { action: 'Client has an active meal/training plan', points: 12, note: 'Counts active client plans.' },
      { action: 'Meals on plan = Yes', points: 5, note: 'Client nutrition adherence.' },
      { action: 'Trainer approves/reviews a workout', points: 10, note: 'Trainer is keeping up with review work.' },
      { action: 'Client meals off plan', points: -3, note: 'Penalty for nutrition misses.' },
      { action: 'Client missed meal tracking', points: -2, note: 'Check-in day without meal/calorie tracking.' }
    ],
    fairness: [
      'Scores are based on linked clients underneath each trainer.',
      'The manager view rewards both growth and keeping existing clients active.'
    ]
  };
}

async function buildManagerTrainerLeaderboard(manager, { now = new Date() } = {}) {
  if (!manager?.id || !db.isConfigured()) return null;
  const managerCode = normalizeManagerCode(manager.managerCode || '');
  const month = monthKey(now);
  const day = todayKey(now);
  const monthStart = monthStartIso(now);
  if (!managerCode) {
    return {
      mode: 'manager_trainers',
      month,
      day,
      rules: managerTrainerRules(),
      entries: [],
      you: null,
      summary: { trainerCount: 0, activeClients: 0, atRiskCount: 0 }
    };
  }

  const trainersRes = await db.query(
    `
      WITH trainer_matches AS (
        SELECT tp.user_id AS trainer_user_id
        FROM app_trainer_profiles tp
        WHERE UPPER(COALESCE(tp.meta->>'managerCode', '')) = $1
        UNION
        SELECT mr.trainer_user_id
        FROM app_trainer_manager_reviews mr
        WHERE UPPER(COALESCE(mr.manager_code, '')) = $1
          AND mr.status = 'approved'
      )
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.email,
        u.created_at,
        tp.profile_image,
        trp.full_name,
        trp.contact_email,
        trp.updated_at AS trainer_updated_at
      FROM trainer_matches tm
      JOIN app_users u ON u.id = tm.trainer_user_id
      LEFT JOIN app_training_profiles tp ON tp.user_id = u.id
      LEFT JOIN app_trainer_profiles trp ON trp.user_id = u.id
      ORDER BY COALESCE(trp.updated_at, u.created_at) DESC;
    `,
    [managerCode]
  );

  const trainers = Array.isArray(trainersRes.rows) ? trainersRes.rows : [];
  const trainerIds = trainers.map((row) => String(row.id || '').trim()).filter(Boolean);
  if (!trainerIds.length) {
    return {
      mode: 'manager_trainers',
      month,
      day,
      rules: managerTrainerRules(),
      entries: [],
      you: null,
      summary: { trainerCount: 0, activeClients: 0, atRiskCount: 0 }
    };
  }

  const clientsRes = await db.query(
    `
      WITH roster AS (
        SELECT
          ti.trainer_user_id,
          ti.linked_user_id,
          COALESCE(ti.accepted_at, ti.created_at) AS joined_at,
          COALESCE(ti.payment_status, ti.status, 'active') AS status
        FROM app_trainer_invites ti
        WHERE ti.trainer_user_id = ANY($1::uuid[])
          AND ti.invite_type = 'coaching_invite'
          AND ti.linked_user_id IS NOT NULL
        UNION ALL
        SELECT
          tc.trainer_user_id,
          tc.linked_user_id,
          tc.created_at AS joined_at,
          tc.status
        FROM app_trainer_clients tc
        WHERE tc.trainer_user_id = ANY($1::uuid[])
          AND tc.linked_user_id IS NOT NULL
      ),
      deduped AS (
        SELECT DISTINCT ON (trainer_user_id, linked_user_id)
          trainer_user_id,
          linked_user_id,
          joined_at,
          status
        FROM roster
        ORDER BY trainer_user_id, linked_user_id, CASE WHEN status <> 'removed' THEN 0 ELSE 1 END, joined_at DESC
      )
      SELECT *
      FROM deduped;
    `,
    [trainerIds]
  );

  const clients = Array.isArray(clientsRes.rows) ? clientsRes.rows : [];
  const clientIds = Array.from(new Set(clients.map((row) => String(row.linked_user_id || '').trim()).filter(Boolean)));
  const trainerClientRows = clients.filter((row) => String(row.status || '').trim().toLowerCase() !== 'removed');

  const workoutsByClient = new Map();
  const checkinsByClient = new Map();
  const planClients = new Set();
  if (clientIds.length) {
    const workoutsRes = await db.query(
      `
        SELECT user_id, COUNT(*)::int AS workouts
        FROM app_training_workouts
        WHERE user_id = ANY($1::uuid[])
          AND COALESCE(performed_at::timestamptz, created_at) >= $2::timestamptz
        GROUP BY user_id;
      `,
      [clientIds, monthStart]
    );
    (workoutsRes.rows || []).forEach((row) => workoutsByClient.set(String(row.user_id), Number(row.workouts || 0)));

    const checkinsRes = await db.query(
      `
        SELECT user_id, day, data
        FROM app_daily_checkins
        WHERE user_id = ANY($1::uuid[])
          AND day >= $2::date;
      `,
      [clientIds, monthStart]
    );
    (checkinsRes.rows || []).forEach((row) => {
      const key = String(row.user_id);
      if (!checkinsByClient.has(key)) checkinsByClient.set(key, []);
      checkinsByClient.get(key).push(row);
    });

    const plansRes = await db.query(
      `
        SELECT DISTINCT user_id
        FROM app_training_plans
        WHERE user_id = ANY($1::uuid[])
          AND active = true;
      `,
      [clientIds]
    );
    (plansRes.rows || []).forEach((row) => planClients.add(String(row.user_id)));
  }

  const reviewsRes = await db.query(
    `
      SELECT trainer_user_id, COUNT(*)::int AS approved_reviews
      FROM app_trainer_workout_reviews
      WHERE trainer_user_id = ANY($1::uuid[])
        AND reviewed_at >= $2::timestamptz
        AND status = 'approved'
      GROUP BY trainer_user_id;
    `,
    [trainerIds, monthStart]
  );
  const reviewsByTrainer = new Map();
  (reviewsRes.rows || []).forEach((row) => reviewsByTrainer.set(String(row.trainer_user_id), Number(row.approved_reviews || 0)));

  const clientsByTrainer = new Map();
  trainerClientRows.forEach((row) => {
    const key = String(row.trainer_user_id);
    if (!clientsByTrainer.has(key)) clientsByTrainer.set(key, []);
    clientsByTrainer.get(key).push(row);
  });

  const entries = trainers.map((trainer) => {
    const trainerId = String(trainer.id || '');
    const rows = clientsByTrainer.get(trainerId) || [];
    const activeClients = rows.length;
    let newClients = 0;
    let clientWorkouts = 0;
    let clientCheckins = 0;
    let mealsOnPlanDays = 0;
    let mealsOffPlanDays = 0;
    let missedMealDays = 0;
    let clientsWithPlans = 0;

    rows.forEach((client) => {
      const clientId = String(client.linked_user_id || '');
      const joinedAt = new Date(String(client.joined_at || ''));
      if (!Number.isNaN(joinedAt.getTime()) && joinedAt >= new Date(monthStart)) newClients += 1;
      clientWorkouts += workoutsByClient.get(clientId) || 0;
      if (planClients.has(clientId)) clientsWithPlans += 1;
      const checkins = checkinsByClient.get(clientId) || [];
      clientCheckins += checkins.length;
      checkins.forEach((item) => {
        const data = item?.data && typeof item.data === 'object' ? item.data : {};
        const meals = Array.isArray(data.meals) ? data.meals : [];
        const calories = Number(data?.macros?.calories);
        const mealsOnPlan = String(data?.mealsOnPlan || '').trim().toLowerCase();
        if (mealsOnPlan === 'yes') mealsOnPlanDays += 1;
        if (mealsOnPlan === 'no') mealsOffPlanDays += 1;
        if (!meals.length && !(Number.isFinite(calories) && calories > 0)) missedMealDays += 1;
      });
    });

    const retainedClients = activeClients;
    const approvedReviews = reviewsByTrainer.get(trainerId) || 0;
    const workoutsPerClient = activeClients ? clientWorkouts / activeClients : 0;
    const checkinsPerClient = activeClients ? clientCheckins / activeClients : 0;
    const points = Math.max(0,
      (retainedClients * 25)
      + (newClients * 35)
      + (clientWorkouts * 12)
      + (clientCheckins * 8)
      + (clientsWithPlans * 12)
      + (mealsOnPlanDays * 5)
      + (approvedReviews * 10)
      - (mealsOffPlanDays * 3)
      - (missedMealDays * 2)
    );

    const displayName = cleanShortText(trainer.full_name || trainer.display_name || trainer.username || 'Trainer', 120);
    const initials = displayName.split(' ').map((s) => s.slice(0, 1)).join('').slice(0, 2).toUpperCase();
    const avatarUrl = trainer.profile_image || encodeSvgDataUrl(avatarSvg({ initials, a: '#d8952f', b: '#0f172a' }));
    const riskFlags = [];
    if (activeClients === 0) riskFlags.push('no active clients');
    if (activeClients > 0 && workoutsPerClient < 1) riskFlags.push('low client workout rate');
    if (activeClients > 0 && checkinsPerClient < 2) riskFlags.push('low check-in rate');
    if (activeClients > 0 && clientsWithPlans < activeClients) riskFlags.push('missing client plans');

    return {
      id: trainerId,
      displayName,
      handle: trainer.username ? `@${trainer.username}` : (trainer.contact_email || trainer.email || ''),
      avatarUrl,
      joinedAt: trainer.created_at,
      points,
      breakdown: {
        retainedClients,
        activeClients,
        newClients,
        clientWorkouts,
        clientCheckins,
        mealsOnPlanDays,
        mealsOffPlanDays,
        missedMealDays,
        clientsWithPlans,
        approvedReviews,
        workoutsPerClient,
        checkinsPerClient
      },
      badges: [
        metricBadge('retention', `${retainedClients} retained`, retainedClients ? 'teal' : 'amber', 'Current active linked clients.'),
        metricBadge('growth', `${newClients} new`, newClients ? 'emerald' : 'slate', 'New linked clients this month.'),
        metricBadge('workouts', `${clientWorkouts} workouts`, workoutsPerClient >= 2 ? 'teal' : 'amber', 'Client workouts this month.'),
        metricBadge('plans', `${clientsWithPlans}/${activeClients} plans`, clientsWithPlans >= activeClients && activeClients ? 'emerald' : 'rose', 'Clients with active plans.'),
        metricBadge('status', riskFlags.length ? 'needs attention' : 'on track', riskFlags.length ? 'rose' : 'emerald', riskFlags.join(', '))
      ],
      bio: riskFlags.length ? `Watch: ${riskFlags.join(', ')}.` : 'Trainer roster is active and reporting.',
      streakDays: 0,
      isBot: false,
      isManagerTrainer: true
    };
  });

  const ranked = entries
    .sort((a, b) => b.points - a.points || Number(b.breakdown.activeClients || 0) - Number(a.breakdown.activeClients || 0))
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
  const activeClients = ranked.reduce((sum, entry) => sum + Number(entry.breakdown?.activeClients || 0), 0);
  const atRiskCount = ranked.filter((entry) => String(entry.bio || '').startsWith('Watch:')).length;

  return {
    mode: 'manager_trainers',
    month,
    day,
    rules: managerTrainerRules(),
    entries: ranked,
    you: null,
    summary: {
      trainerCount: ranked.length,
      activeClients,
      atRiskCount
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
    const requestedTrainerView = ['trainer', 'trainer_clients', 'clients'].includes(
      String(url.searchParams.get('view') || url.searchParams.get('scope') || '').trim().toLowerCase()
    );
    const requestedManagerView = ['manager', 'manager_trainers', 'trainers'].includes(
      String(url.searchParams.get('view') || url.searchParams.get('scope') || '').trim().toLowerCase()
    );

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
      if (requestedTrainerView) {
        try {
          const trainerLeaderboard = await buildTrainerClientLeaderboard(user, { now });
          if (trainerLeaderboard) return sendJson(res, 200, trainerLeaderboard);
        } catch (err) {
          return sendJson(res, 200, {
            mode: 'trainer_clients',
            month,
            day,
            rules: trainerClientRules(),
            entries: [],
            you: null,
            summary: { clientCount: 0, avgWorkoutRate: 0, atRiskCount: 0 },
            error: err?.message || 'Could not load trainer client leaderboard.'
          });
        }
      }
      if (requestedManagerView) {
        try {
          const managerLeaderboard = await buildManagerTrainerLeaderboard(user, { now });
          if (managerLeaderboard) return sendJson(res, 200, managerLeaderboard);
        } catch (err) {
          return sendJson(res, 200, {
            mode: 'manager_trainers',
            month,
            day,
            rules: managerTrainerRules(),
            entries: [],
            you: null,
            summary: { trainerCount: 0, activeClients: 0, atRiskCount: 0 },
            error: err?.message || 'Could not load manager trainer leaderboard.'
          });
        }
      }

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
