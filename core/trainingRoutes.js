const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Worker } = require('worker_threads');
const db = require('./db');
const { DbUnavailableError, isTransientPgError } = require('./dbErrors');
const { generatePlan, applyLogAdjustments, normalizeExperience, assertBodybuildingPlanIntegrity } = require('./trainingEngine');
const { buildOblueprintPlan } = require('../generator/trainingEngine.oblueprint');
const { resolveWorkoutExercises } = require('./exerciseResolver');
const { invalidateDatasetCache } = require('./exerciseCatalog');
const { emitUserEvent } = require('./emailEvents');
const {
  DEBUG_COMBO_LABEL,
  evaluateGlutesLegsCoreDebugCombo,
  matchesGlutesLegsCoreDebugCombo
} = require('../js/training-debug-combo');
const enrichPlanWithExerciseMedia = async () => {};

const MAX_BODY_BYTES = Math.max(50_000, Number(process.env.TRAINING_MAX_BODY_BYTES || 1_500_000));
const TRAINING_IMPORT_OCR_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'training_import_ocr.py');
const TRAINING_IMPORT_OCR_TIMEOUT_MS = Math.max(6_000, Number(process.env.TRAINING_IMPORT_OCR_TIMEOUT_MS || 18_000));
const TRAINING_IMPORT_OCR_MAX_IMAGE_BYTES = Math.max(200_000, Number(process.env.TRAINING_IMPORT_OCR_MAX_IMAGE_BYTES || 4_000_000));
const TRAINING_IMPORT_OCR_PYTHON_CMD = String(
  process.env.TRAINING_IMPORT_OCR_PYTHON
  || (process.platform === 'win32' ? 'python' : 'python3')
).trim();
const TRAINING_IMPORT_OCRSPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
const TRAINING_IMPORT_OCRSPACE_API_KEY = String(process.env.TRAINING_IMPORT_OCRSPACE_API_KEY || process.env.OCRSPACE_API_KEY || 'helloworld').trim();
const TRAINING_PLAN_BUILD_TIMEOUT_MS = Math.max(5_000, Number(process.env.TRAINING_PLAN_BUILD_TIMEOUT_MS || 15_000));
const TRAINING_PLAN_BUILD_WORKER_PATH = path.join(__dirname, 'trainingPlanBuildWorker.js');

let schemaEnsured = false;
let schemaEnsurePromise = null;
const SCHEMA_RETRY_DELAYS_MS = [200, 600, 1400];
const INVITE_CACHE_TTL_MS = 20000;
const trainingInviteCache = new Map();
const ONLINE_WINDOW_MS = Math.max(30_000, Number(process.env.ONLINE_WINDOW_MS || 180_000));
const SHARE_ROUTE_DEBUG = String(process.env.TRAINING_SHARE_DEBUG || '').trim() === '1'
  || String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
const TRAINING_ROUTE_DEBUG = String(process.env.TRAINING_ROUTE_DEBUG || '').trim() === '1'
  || String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

function logShareRoute(event, payload = {}) {
  if (!SHARE_ROUTE_DEBUG) return;
  try {
    console.log('[share-route]', {
      at: new Date().toISOString(),
      event,
      ...payload
    });
  } catch {
    // ignore logging failures
  }
}

function getInviteCache(userId) {
  const cached = trainingInviteCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.at > INVITE_CACHE_TTL_MS) {
    trainingInviteCache.delete(userId);
    return null;
  }
  return cached.value;
}

function setInviteCache(userId, value) {
  trainingInviteCache.set(userId, { at: Date.now(), value });
}

function clearInviteCache(userId) {
  if (!userId) return;
  trainingInviteCache.delete(userId);
}

async function createShareEvent({
  userId,
  actorUserId = null,
  counterpartyUserId = null,
  inviteId = null,
  eventType,
  meta = {}
} = {}) {
  const targetUserId = String(userId || '').trim();
  const type = String(eventType || '').trim().toLowerCase();
  if (!isUuid(targetUserId) || !type) return;
  const actorId = String(actorUserId || '').trim();
  const counterpartyId = String(counterpartyUserId || '').trim();
  const inviteIdNorm = String(inviteId || '').trim();
  try {
    await db.query(
      `
        INSERT INTO app_training_share_events (
          user_id,
          actor_user_id,
          counterparty_user_id,
          invite_id,
          event_type,
          meta
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb);
      `,
      [
        targetUserId,
        isUuid(actorId) ? actorId : null,
        isUuid(counterpartyId) ? counterpartyId : null,
        isUuid(inviteIdNorm) ? inviteIdNorm : null,
        type,
        JSON.stringify(meta && typeof meta === 'object' ? meta : {})
      ]
    );
  } catch {
    // non-blocking notification write
  }
}

function toEpochMs(raw) {
  if (!raw) return NaN;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isLastSeenOnline(lastSeenRaw) {
  const ts = toEpochMs(lastSeenRaw);
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) <= ONLINE_WINDOW_MS;
}

async function touchUserLastSeen(userId) {
  const id = String(userId || '').trim();
  if (!id) return;
  try {
    await db.query(
      `
        UPDATE app_users
        SET last_seen = now()
        WHERE id = $1
          AND (last_seen IS NULL OR last_seen < now() - interval '30 seconds');
      `,
      [id]
    );
  } catch {
    // ignore best-effort presence update
  }
}

const mediaEnrichInFlight = new Set();
const QUOTE_BANK_PATH = path.join(__dirname, 'quoteBank.json');
const WORKOUT_DB_PRIMARY_PATH = path.join(__dirname, '..', 'free-exercise-db', 'dist', 'exercises.json');
const WORKOUT_DB_FALLBACK_PATH = path.join(__dirname, '..', 'data', 'workout-database.json');
const WORKOUT_DB_PRIMARY_IMAGE_ROOT = path.join(__dirname, '..', 'free-exercise-db', 'exercises');
const WORKOUT_DB_FALLBACK_IMAGE_ROOT = path.join(__dirname, '..', 'data', 'workout-images');
const WORKOUT_UPLOAD_MAX_IMAGES = 2;
const WORKOUT_UPLOAD_MAX_BYTES = 900_000;

function resolveWorkoutDbReadPaths() {
  return [WORKOUT_DB_PRIMARY_PATH, WORKOUT_DB_FALLBACK_PATH];
}

function resolveWorkoutDbWritePath() {
  if (fs.existsSync(WORKOUT_DB_PRIMARY_PATH)) return WORKOUT_DB_PRIMARY_PATH;
  return WORKOUT_DB_FALLBACK_PATH;
}

function resolveWorkoutImageRoot() {
  if (fs.existsSync(WORKOUT_DB_PRIMARY_IMAGE_ROOT)) return WORKOUT_DB_PRIMARY_IMAGE_ROOT;
  return WORKOUT_DB_FALLBACK_IMAGE_ROOT;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function logTransientTrainingError(err, context) {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return;
  const d = db.getDiagnostics ? db.getDiagnostics() : {};
  console.warn('[training][db-transient]', {
    context: context || 'unknown',
    code: err?.code || null,
    message: err?.message || String(err),
    sslEnabled: Boolean(d?.sslEnabled),
    totalCount: Number(d?.totalCount || 0),
    idleCount: Number(d?.idleCount || 0),
    waitingCount: Number(d?.waitingCount || 0)
  });
}

function sendDbUnavailable(res) {
  return sendJson(res, 503, { ok: false, error: 'DB_UNAVAILABLE' });
}

function sendTrainingShareRequestsUnavailable(res) {
  return sendJson(res, 200, {
    ok: true,
    invites: [],
    requests: [],
    unavailable: true
  });
}

function handleTrainingDbFailure(res, err, context, fallbackMessage) {
  if (err instanceof DbUnavailableError || isTransientPgError(err)) {
    logTransientTrainingError(err, context);
    return sendDbUnavailable(res);
  }
  if (fallbackMessage) {
    console.error(`[${context}]`, err?.message || err);
    return sendJson(res, 500, { error: fallbackMessage });
  }
  throw err;
}

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

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
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

function decodeImageDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n\s]+)$/i);
  if (!match) {
    throw new Error('Invalid image payload');
  }
  const mimeType = String(match[1] || 'image/jpeg').toLowerCase();
  const base64Raw = String(match[2] || '').replace(/\s+/g, '');
  if (!base64Raw) {
    throw new Error('Missing image content');
  }
  const buffer = Buffer.from(base64Raw, 'base64');
  if (!buffer.length) {
    throw new Error('Could not decode image data');
  }
  return { mimeType, buffer };
}

async function runTrainingImportOcr(imageBuffer, filename = 'import.jpg') {
  if (!fs.existsSync(TRAINING_IMPORT_OCR_SCRIPT_PATH)) {
    const err = new Error('OCR script not found');
    err.code = 'OCR_SCRIPT_MISSING';
    throw err;
  }
  const payload = {
    imageBase64: imageBuffer.toString('base64'),
    filename: String(filename || 'import.jpg').slice(0, 180)
  };
  return await new Promise((resolve, reject) => {
    const child = spawn(TRAINING_IMPORT_OCR_PYTHON_CMD, [TRAINING_IMPORT_OCR_SCRIPT_PATH], {
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      try {
        clearTimeout(timer);
      } catch {}
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      const err = new Error('OCR timeout');
      err.code = 'OCR_TIMEOUT';
      finish(err);
    }, TRAINING_IMPORT_OCR_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('error', (err) => {
      const wrapped = new Error(`OCR process failed to start: ${err?.message || 'unknown error'}`);
      wrapped.code = 'OCR_PROCESS_START_FAILED';
      finish(wrapped);
    });
    child.on('close', (code) => {
      const exitCode = Number(code || 0);
      const output = String(stdout || '').trim();
      if (exitCode !== 0) {
        const detail = String(stderr || output || '').trim();
        const wrapped = new Error(detail || `OCR process exited with code ${exitCode}`);
        wrapped.code = 'OCR_PROCESS_FAILED';
        finish(wrapped);
        return;
      }
      try {
        const parsed = output ? JSON.parse(output) : {};
        if (!parsed || parsed.ok !== true) {
          const msg = String(parsed?.error || parsed?.detail || 'OCR did not return usable text');
          const wrapped = new Error(msg);
          wrapped.code = 'OCR_NO_TEXT';
          finish(wrapped);
          return;
        }
        finish(null, parsed);
      } catch (err) {
        const wrapped = new Error(`Invalid OCR response: ${err?.message || 'unknown parse error'}`);
        wrapped.code = 'OCR_INVALID_RESPONSE';
        finish(wrapped);
      }
    });
    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch (err) {
      const wrapped = new Error(`Failed to send OCR payload: ${err?.message || 'unknown error'}`);
      wrapped.code = 'OCR_PAYLOAD_FAILED';
      finish(wrapped);
    }
  });
}

async function runTrainingImportOcrViaOcrSpace(imageBuffer, filename = 'import.jpg') {
  const apiKey = String(TRAINING_IMPORT_OCRSPACE_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('OCR.space API key missing');
    err.code = 'OCRSPACE_KEY_MISSING';
    throw err;
  }
  const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  const body = new URLSearchParams();
  body.set('apikey', apiKey);
  body.set('language', 'eng');
  body.set('isOverlayRequired', 'false');
  body.set('scale', 'true');
  body.set('OCREngine', '2');
  body.set('filetype', path.extname(String(filename || '')).replace('.', '') || 'jpg');
  body.set('base64Image', base64Image);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    try { controller.abort(); } catch {}
  }, TRAINING_IMPORT_OCR_TIMEOUT_MS);
  try {
    const resp = await fetch(TRAINING_IMPORT_OCRSPACE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString(),
      signal: controller.signal
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(`OCR.space request failed (${resp.status})`);
      err.code = 'OCRSPACE_HTTP_FAILED';
      throw err;
    }
    if (json?.IsErroredOnProcessing) {
      const message = Array.isArray(json?.ErrorMessage) ? json.ErrorMessage.join('; ') : String(json?.ErrorMessage || 'OCR.space processing error');
      const err = new Error(message);
      err.code = 'OCRSPACE_PROCESSING_FAILED';
      throw err;
    }
    const parsedResults = Array.isArray(json?.ParsedResults) ? json.ParsedResults : [];
    const text = parsedResults
      .map((part) => String(part?.ParsedText || ''))
      .join('\n')
      .replace(/\r\n?/g, '\n')
      .trim();
    if (!text) {
      const err = new Error('OCR.space returned no readable text');
      err.code = 'OCRSPACE_NO_TEXT';
      throw err;
    }
    const avgConfidenceRaw = parsedResults.length
      ? parsedResults.reduce((sum, part) => sum + Number(part?.TextOverlay?.HasOverlay ? 1 : 0.75), 0) / parsedResults.length
      : 0;
    return {
      ok: true,
      engine: 'ocr.space',
      text,
      lineCount: text.split('\n').filter(Boolean).length,
      avgConfidence: Math.max(0, Math.min(1, Number(avgConfidenceRaw || 0)))
    };
  } finally {
    clearTimeout(timer);
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isUuid(input) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(input || '').trim());
}

const TRAINING_WEEKDAY_CODES = ['SU', 'M', 'T', 'W', 'TH', 'F', 'S'];
const TRAINING_WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normalizeWeekdayIndexList(raw) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const codeToIndex = {
    su: 0, sun: 0, sunday: 0,
    m: 1, mo: 1, mon: 1, monday: 1,
    t: 2, tu: 2, tue: 2, tues: 2, tuesday: 2,
    w: 3, we: 3, wed: 3, wednesday: 3,
    th: 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
    f: 5, fr: 5, fri: 5, friday: 5,
    s: 6, sa: 6, sat: 6, saturday: 6
  };
  for (const x of src) {
    const key = String(x || '').trim().toLowerCase();
    if (key && Object.prototype.hasOwnProperty.call(codeToIndex, key)) {
      const idx = codeToIndex[key];
      if (!out.includes(idx)) out.push(idx);
      continue;
    }
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    const i = Math.max(0, Math.min(6, Math.floor(n)));
    if (!out.includes(i)) out.push(i);
  }
  return out;
}

function preferredWeekdayPattern(daysPerWeek) {
  const n = Number(daysPerWeek) || 0;
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (n === 2) return [1, 4];
  if (n === 3) return [1, 3, 5];
  if (n === 4) return [1, 2, 4, 5];
  if (n === 5) return [1, 2, 3, 4, 5];
  if (n === 6) return [1, 2, 3, 4, 5, 6];
  return [0, 1, 2, 3, 4, 5, 6];
}

function buildTrainingWeekdays(daysPerWeek, unavailableDays, preferredDays) {
  const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
  if (!n) return [];
  const unavailable = new Set(normalizeWeekdayIndexList(unavailableDays));
  const preferred = normalizeWeekdayIndexList(preferredDays).filter((d) => !unavailable.has(d));
  const available = [1, 2, 3, 4, 5, 6, 0].filter((d) => !unavailable.has(d));
  if (available.length < n) return [];

  const chosen = [];
  for (const d of preferred) {
    if (chosen.length >= n) break;
    if (!chosen.includes(d)) chosen.push(d);
  }
  const pattern = preferredWeekdayPattern(n);
  for (const d of pattern) {
    if (chosen.length >= n) break;
    if (!unavailable.has(d) && !chosen.includes(d)) chosen.push(d);
  }
  for (const d of available) {
    if (chosen.length >= n) break;
    if (!chosen.includes(d)) chosen.push(d);
  }
  const weekdayOrder = new Map([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [0, 6]]);
  chosen.sort((a, b) => (weekdayOrder.get(a) ?? 99) - (weekdayOrder.get(b) ?? 99));
  return chosen.slice(0, n);
}

function titleCaseWords(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function humanDisciplineLabel(disciplineRaw) {
  const d = String(disciplineRaw || '').trim().toLowerCase();
  if (d === 'bodybuilding') return 'Bodybuilding';
  if (d === 'powerlifting') return 'Powerlifting';
  if (d === 'calisthenics') return 'Calisthenics';
  if (d === 'powerbuilding') return 'Powerbuilding';
  return 'Training';
}

function deriveSplitLabelFromSnapshot(snapshot, disciplineRaw) {
  const firstWeek = Array.isArray(snapshot?.weeks) ? snapshot.weeks[0] : null;
  const days = Array.isArray(firstWeek?.days) ? firstWeek.days : [];
  const seen = new Set();
  const parts = [];
  for (const day of days) {
    const raw = day?.focus || day?.title || day?.name || '';
    const clean = titleCaseWords(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(clean);
    if (parts.length >= 4) break;
  }
  if (parts.length >= 2) return `${parts.join(' / ')} split`;
  if (parts.length === 1) return `${parts[0]} split`;
  return `${humanDisciplineLabel(disciplineRaw)} split`;
}

function buildShareWelcomePayload({ snapshot, fromDisplayName, fromUsername }) {
  const discipline = normalizeDiscipline(snapshot?.meta?.discipline || snapshot?.discipline || '') || '';
  const daysPerWeek = clampInt(snapshot?.meta?.daysPerWeek || snapshot?.daysPerWeek, 2, 7, null);
  const schedule = snapshot?.meta?.schedule && typeof snapshot.meta.schedule === 'object'
    ? snapshot.meta.schedule
    : null;
  const unavailableDays = schedule?.unavailableDays ?? snapshot?.meta?.unavailableDays ?? [];
  const preferredDays = schedule?.preferredDays ?? snapshot?.meta?.preferredDays ?? [];
  const weekdays = daysPerWeek ? buildTrainingWeekdays(daysPerWeek, unavailableDays, preferredDays) : [];
  const dayCodes = weekdays.map((idx) => TRAINING_WEEKDAY_CODES[idx]).filter(Boolean);
  const todayIdx = new Date().getDay();
  const todayCode = TRAINING_WEEKDAY_CODES[todayIdx] || '';
  const todayDayName = TRAINING_WEEKDAY_NAMES[todayIdx] || 'Today';
  const dayPos = weekdays.indexOf(todayIdx);
  return {
    fromDisplayName: safeText(fromDisplayName || fromUsername || 'Account', 120) || 'Account',
    fromUsername: safeText(fromUsername, 80) || null,
    dayCodes,
    split: deriveSplitLabelFromSnapshot(snapshot, discipline),
    todayCode,
    todayDayName,
    todayPlanDay: dayPos >= 0 ? (dayPos + 1) : null
  };
}

function safeText(raw, maxLen) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function csvToSet(raw) {
  const out = new Set();
  String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((s) => out.add(s));
  return out;
}

const OWNER_USERNAMES = csvToSet(process.env.OWNER_USERNAMES || 'RiseForIt,RiseForIt,RiseForItOwner,jason,odeology,odeology_');
const OWNER_EMAILS = csvToSet(process.env.OWNER_EMAILS || '');
const OWNER_EMAIL_DOMAIN = String(process.env.OWNER_EMAIL_DOMAIN || 'RiseForIt.com').trim().toLowerCase();
const OWNER_DISPLAY_NAMES = csvToSet(process.env.OWNER_DISPLAY_NAMES || 'RiseForIt,RiseForIt,ODeology,ODEOLOGY,ODeology_,ODEOLOGY_');
const OWNER_USER_IDS = csvToSet(process.env.OWNER_USER_IDS || '');

function isOwnerUser(userLike) {
  const userId = String(userLike?.id || '').trim().toLowerCase();
  const username = String(userLike?.username || '').trim().toLowerCase();
  const email = String(userLike?.email || '').trim().toLowerCase();
  const displayName = String(userLike?.display_name || userLike?.displayName || '').trim().toLowerCase();
  const adminNotes = String(userLike?.admin_notes || userLike?.adminNotes || '').trim().toLowerCase();
  if (userId && OWNER_USER_IDS.has(userId)) return true;
  if (adminNotes.includes('owner')) return true;
  if (username && OWNER_USERNAMES.has(username)) return true;
  if (email && OWNER_EMAILS.has(email)) return true;
  if (displayName && OWNER_DISPLAY_NAMES.has(displayName)) return true;
  if (email && OWNER_EMAIL_DOMAIN && email.endsWith(`@${OWNER_EMAIL_DOMAIN}`)) return true;
  if (username.includes('riseforit') || displayName.includes('riseforit')) return true;
  if (username.includes('odeology') || displayName.includes('odeology')) return true;
  return false;
}

function asTextArray(input, { maxItems = 20, maxLen = 120 } = {}) {
  const arr = Array.isArray(input)
    ? input
    : String(input || '')
      .split(/\r?\n|,/g)
      .map((x) => x.trim())
      .filter(Boolean);
  const out = [];
  for (const item of arr) {
    const value = String(item || '').trim();
    if (!value) continue;
    out.push(value.slice(0, maxLen));
    if (out.length >= maxItems) break;
  }
  return out;
}

function slugifyExerciseId(raw) {
  const base = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-z0-9 ]+/g, '')
    .trim()
    .replace(/\s+/g, '_');
  if (!base) return '';
  return base.slice(0, 120);
}

const WORKOUT_CATEGORY_ALIASES = new Map([
  ['strength', 'strength'],
  ['stretching', 'stretching'],
  ['stretch', 'stretching'],
  ['warmup', 'warmup'],
  ['warm-up', 'warmup'],
  ['cardio', 'cardio'],
  ['plyometrics', 'plyometrics'],
  ['olympic_weightlifting', 'olympic_weightlifting'],
  ['olympic weightlifting', 'olympic_weightlifting'],
  ['powerlifting', 'powerlifting'],
  ['strongman', 'strongman'],
  ['rehabilitation', 'rehabilitation'],
  ['prehab', 'rehabilitation'],
  ['mobility', 'mobility'],
  ['sports', 'sports'],
  ['other', 'other']
]);

function normalizeWorkoutCategory(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!key) return 'strength';
  return WORKOUT_CATEGORY_ALIASES.get(key) || 'other';
}

function readWorkoutDatabase() {
  let parseError = null;
  for (const candidate of resolveWorkoutDbReadPaths()) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      const json = JSON.parse(raw);
      return Array.isArray(json) ? json : [];
    } catch (err) {
      parseError = err;
    }
  }
  if (parseError) {
    console.error('[workout-db] Could not parse dataset:', parseError?.message || parseError);
  }
  return [];
}

function writeWorkoutDatabase(list) {
  const normalized = Array.isArray(list) ? list : [];
  const targetPath = resolveWorkoutDbWritePath();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tmpPath, targetPath);
  invalidateDatasetCache();
}

function sanitizeWorkoutImagePath(raw) {
  const src = String(raw || '').trim();
  if (!src || src.startsWith('data:')) return null;
  const normalized = src
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
  if (!normalized || normalized.includes('..')) return null;
  return normalized.slice(0, 240);
}

function imageExtFromMime(mimeType) {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return null;
}

function decodeWorkoutImageDataUrl(raw) {
  const text = String(raw || '').trim();
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(text);
  if (!match) throw new Error('Invalid image upload format');
  const ext = imageExtFromMime(match[1]);
  if (!ext) throw new Error('Unsupported image type');
  const base64 = String(match[2] || '').replace(/\s+/g, '');
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new Error('Invalid image upload encoding');
  }
  if (!buffer || !buffer.length) throw new Error('Empty image upload');
  if (buffer.length > WORKOUT_UPLOAD_MAX_BYTES) {
    throw new Error(`Image upload too large (max ${Math.floor(WORKOUT_UPLOAD_MAX_BYTES / 1000)}KB each)`);
  }
  return { buffer, ext };
}

function resolveWorkoutImages({ exerciseId, existingImages, imageUploads, replaceImages }) {
  const keep = (replaceImages ? [] : asTextArray(existingImages, { maxItems: WORKOUT_UPLOAD_MAX_IMAGES, maxLen: 240 }))
    .map((p) => sanitizeWorkoutImagePath(p))
    .filter(Boolean);
  const uploads = Array.isArray(imageUploads) ? imageUploads.slice(0, WORKOUT_UPLOAD_MAX_IMAGES) : [];
  if (!uploads.length) return keep.slice(0, WORKOUT_UPLOAD_MAX_IMAGES);

  const safeExerciseId = slugifyExerciseId(exerciseId);
  if (!safeExerciseId) throw new Error('Invalid exercise id for image upload');
  const exerciseDir = path.join(resolveWorkoutImageRoot(), safeExerciseId);
  fs.mkdirSync(exerciseDir, { recursive: true });

  const written = [];
  const stamp = Date.now();
  for (let i = 0; i < uploads.length; i += 1) {
    const upload = uploads[i];
    const { buffer, ext } = decodeWorkoutImageDataUrl(upload);
    const fileName = `custom_${stamp}_${i + 1}.${ext}`;
    fs.writeFileSync(path.join(exerciseDir, fileName), buffer);
    written.push(`${safeExerciseId}/${fileName}`);
  }

  return [...keep, ...written].slice(0, WORKOUT_UPLOAD_MAX_IMAGES);
}

function normalizeWorkoutEntry(payload, { fixedId = null } = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const name = safeText(src.name, 140);
  if (!name) return { ok: false, error: 'Exercise name is required' };

  const requestedId = fixedId || safeText(src.id, 120) || slugifyExerciseId(name);
  const id = slugifyExerciseId(requestedId);
  if (!id) return { ok: false, error: 'Could not derive a valid id' };

  const forceRaw = String(src.force || '').trim().toLowerCase();
  const force = ['push', 'pull', 'static'].includes(forceRaw) ? forceRaw : null;
  const levelRaw = String(src.level || '').trim().toLowerCase();
  const level = ['beginner', 'intermediate', 'expert'].includes(levelRaw) ? levelRaw : 'beginner';
  const mechanicRaw = String(src.mechanic || '').trim().toLowerCase();
  const mechanic = ['compound', 'isolation'].includes(mechanicRaw) ? mechanicRaw : null;
  const equipment = safeText(src.equipment, 80) || 'machine';
  const category = normalizeWorkoutCategory(src.category);
  const primaryMuscles = asTextArray(src.primaryMuscles, { maxItems: 6, maxLen: 48 }).map((x) => x.toLowerCase());
  const secondaryMuscles = asTextArray(src.secondaryMuscles, { maxItems: 8, maxLen: 48 }).map((x) => x.toLowerCase());
  const subMuscleGroups = asTextArray(src.subMuscleGroups, { maxItems: 8, maxLen: 64 }).map((x) => x.toLowerCase());
  const primaryMuscleGroup = safeText(src.primaryMuscleGroup, 48).toLowerCase() || primaryMuscles[0] || '';
  const subMuscleGroup = safeText(src.subMuscleGroup, 64).toLowerCase() || subMuscleGroups[0] || '';
  const targetRegion = safeText(src.targetRegion, 80);
  const isStretchRaw = String(src.isStretch ?? '').trim().toLowerCase();
  const isIsometricRaw = String(src.isIsometric ?? '').trim().toLowerCase();
  let isStretch = null;
  let isIsometric = null;
  if (['yes', 'true', '1'].includes(isStretchRaw)) isStretch = true;
  if (['no', 'false', '0'].includes(isStretchRaw)) isStretch = false;
  if (['yes', 'true', '1'].includes(isIsometricRaw)) isIsometric = true;
  if (['no', 'false', '0'].includes(isIsometricRaw)) isIsometric = false;
  const instructions = asTextArray(src.instructions, { maxItems: 20, maxLen: 400 });
  const images = asTextArray(src.images, { maxItems: 2, maxLen: 240 });

  if (!primaryMuscles.length) return { ok: false, error: 'At least one primary muscle is required' };
  if (!secondaryMuscles.length) return { ok: false, error: 'At least one secondary muscle is required' };
  if (!subMuscleGroups.length) return { ok: false, error: 'At least one sub-muscle group is required' };
  if (!targetRegion) return { ok: false, error: 'Target region is required' };
  if (isStretch == null) return { ok: false, error: 'Please classify whether this is a stretch' };
  if (isIsometric == null) return { ok: false, error: 'Please classify whether this is isometric' };
  if (!instructions.length) return { ok: false, error: 'At least one instruction line is required' };

  return {
    ok: true,
    entry: {
      id,
      name,
      force,
      level,
      mechanic,
      equipment,
      primaryMuscles,
      secondaryMuscles,
      subMuscleGroups,
      primaryMuscleGroup,
      subMuscleGroup,
      targetRegion: targetRegion ? String(targetRegion).toLowerCase() : null,
      isStretch,
      isIsometric,
      instructions,
      category,
      images
    }
  };
}

function normalizeDiscipline(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'powerlifting') return 'powerlifting';
  if (v === 'bodybuilding') return 'bodybuilding';
  if (v === 'powerbuilding') return 'powerbuilding';
  if (v === 'calisthenics') return 'calisthenics';
  return null;
}

function resolveOblueprintDiscipline(trainingFeel) {
  const v = String(trainingFeel || '').trim().toLowerCase();
  if (v === 'aesthetic bodybuilding' || v === 'bodybuilding') return 'bodybuilding';
  if (v === 'powerbuilding') return 'powerbuilding';
  return null;
}

function isOblueprintRequest(payload) {
  if (!!resolveOblueprintDiscipline(payload?.trainingFeel)) return true;
  const p = payload && typeof payload === 'object' ? payload : null;
  if (!p) return false;
  return Object.prototype.hasOwnProperty.call(p, 'primaryGoal')
    || Object.prototype.hasOwnProperty.call(p, 'trainingStyle')
    || Object.prototype.hasOwnProperty.call(p, 'outputStyle');
}

function normalizeOblueprintExperience(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/\u00e2\u20ac\u201c|\u00e2\u20ac\u201d|\u00e2\u02c6\u2019/g, '-')
    .replace(/\s+/g, '');
  if (v === '<6m' || v === '<6months') return '<6m';
  if (v === '6-24m' || v === '6-24months') return '6-24m';
  if (v === '2-5y' || v === '2-5years' || v === '2-5yrs') return '2-5y';
  if (v === '5y+' || v === '5+years' || v === '5+yrs') return '5y+';
  return '6-24m';
}

function normalizeOblueprintPayload(payload, { relax = false } = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const discipline = resolveOblueprintDiscipline(src.trainingFeel);
  const trainingFeel = discipline === 'powerbuilding' ? 'Powerbuilding' : 'Aesthetic bodybuilding';
  const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  const asArray = (v) => Array.isArray(v) ? v : [];
  const uniqueStrings = (list, max = 24) => {
    const out = [];
    for (const item of list) {
      const s = String(item || '').trim();
      if (!s || out.includes(s)) continue;
      out.push(s);
      if (out.length >= max) break;
    }
    return out;
  };
  const priorityAlias = {
    chest: 'Chest',
    back: 'Back',
    legs: 'Legs',
    glutes: 'Glutes',
    quads: 'Legs',
    hamstrings: 'Glutes',
    hamstrings_glutes: 'Glutes',
    calves: 'Calves',
    shoulders: 'Shoulders',
    shoulder: 'Shoulders',
    arms: 'Arms',
    abs: 'Core',
    core: 'Core'
  };
  const painAreaAllowed = new Set(['Back', 'Knee', 'Hip', 'Shoulder', 'Elbow', 'Wrist', 'Ankle']);
  const priorityGroups = uniqueStrings(asArray(src.priorityGroups || src.focus).map((x) => {
    const key = String(x || '').trim().toLowerCase();
    return priorityAlias[key] || '';
  }), 6).filter(Boolean);

  const painAreas = uniqueStrings(asArray(src.painAreas), 6).filter((a) => painAreaAllowed.has(a));
  const painProfilesByArea = {};
  for (const area of painAreas) {
    const raw = src?.painProfilesByArea?.[area];
    const severity = Number(raw?.severity);
    if (!Number.isFinite(severity)) continue;
    painProfilesByArea[area] = {
      severity: Math.max(1, Math.min(10, Math.round(severity))),
      recency: raw?.recency === 'Recent' || raw?.recency === 'Old' ? raw.recency : '',
      notes: String(raw?.notes || raw?.avoidNotes || raw?.whatHurts || raw?.avoid || '').trim()
    };
  }

  const normalized = {
    trainingFeel,
    primaryGoal: oneOf(String(src.primaryGoal || '').trim(), ['Build size', 'Cut fat', 'Recomp'], 'Build size'),
    timeline: oneOf(String(src.timeline || '').trim(), ['4 weeks', '8 weeks', '12+ weeks'], '8 weeks'),
    focus: oneOf(String(src.focus || '').trim(), ['Size', 'Strength', 'Aesthetic'], trainingFeel === 'Powerbuilding' ? 'Strength' : 'Aesthetic'),
    experience: normalizeOblueprintExperience(src.experience),
    location: oneOf(String(src.location || '').trim(), ['Home', 'Commercial gym'], 'Commercial gym'),
    trainingStyle: oneOf(String(src.trainingStyle || '').trim(), ['Mostly machines/cables', 'Mostly free weights', 'Balanced mix'], 'Balanced mix'),
    outputStyle: oneOf(String(src.outputStyle || '').trim(), ['RPE/RIR cues', 'Simple sets x reps'], 'RPE/RIR cues'),
    closeToFailure: oneOf(String(src.closeToFailure || '').trim(), ['Yes', 'No'], 'No'),
    daysPerWeek: clampInt(src.daysPerWeek, 2, 6, 4),
    sessionLengthMin: oneOf(String(src.sessionLengthMin || src.sessionLength || '').trim(), ['30', '45', '60', '75+'], '60'),
    priorityGroups,
    movementsToAvoid: uniqueStrings(asArray(src.movementsToAvoid), 24),
    preferredDays: uniqueStrings(asArray(src.preferredDays), 7),
    equipmentAccess: uniqueStrings(asArray(src.equipmentAccess), 16),
    painAreas,
    painProfilesByArea,
    weightLb: Number.isFinite(Number(src.weightLb)) ? Number(src.weightLb) : (Number.isFinite(Number(src.bodyweight)) ? Number(src.bodyweight) : null),
    bodyweight: Number.isFinite(Number(src.bodyweight)) ? Number(src.bodyweight) : null,
    bench: Number.isFinite(Number(src.bench)) ? Number(src.bench) : null,
    squat: Number.isFinite(Number(src.squat)) ? Number(src.squat) : null,
    deadlift: Number.isFinite(Number(src.deadlift)) ? Number(src.deadlift) : null,
    benchVariation: String(src.benchVariation || '').trim() || null,
    benchWeight: Number.isFinite(Number(src.benchWeight)) ? Number(src.benchWeight) : null,
    benchReps: Number.isFinite(Number(src.benchReps)) ? Number(src.benchReps) : null,
    lowerMovement: String(src.lowerMovement || '').trim() || null,
    lowerWeight: Number.isFinite(Number(src.lowerWeight)) ? Number(src.lowerWeight) : null,
    lowerReps: Number.isFinite(Number(src.lowerReps)) ? Number(src.lowerReps) : null,
    hingeMovement: String(src.hingeMovement || '').trim() || null,
    hingeWeight: Number.isFinite(Number(src.hingeWeight)) ? Number(src.hingeWeight) : null,
    hingeReps: Number.isFinite(Number(src.hingeReps)) ? Number(src.hingeReps) : null,
    sleepHours: Math.max(4, Math.min(10, Number(src.sleepHours) || 7)),
    activityLevel: oneOf(String(src.activityLevel || '').trim(), ['Sedentary', 'Active', 'Very active'], 'Active'),
    stress: oneOf(String(src.stress || '').trim(), ['Low', 'Medium', 'High'], 'Medium'),
    planSeed: Number.isFinite(Number(src.planSeed)) ? Math.floor(Number(src.planSeed)) : Date.now()
  };

  if (relax) {
    normalized.location = 'Commercial gym';
    normalized.trainingStyle = 'Balanced mix';
    normalized.movementsToAvoid = [];
    normalized.painAreas = [];
    normalized.painProfilesByArea = {};
    normalized.preferredDays = [];
    normalized.equipmentAccess = [];
    normalized.closeToFailure = 'No';
  }

  return normalized;
}

function buildOblueprintPlanWithFallback(payload, opts = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const seedBase = Number(src?.planSeed);
  const baseSeed = Number.isFinite(seedBase) ? Math.floor(seedBase) : Date.now();
  const buildOpts = opts && typeof opts === 'object' ? opts : {};
  const fastBuild = Boolean(buildOpts.fastBuild);
  const directAttempts = fastBuild ? 1 : 6;
  const relaxedAttempts = fastBuild ? 1 : 4;
  const debugCombo = matchesAbsGlutesLegsDebugCombo(src);
  const heartbeat = typeof buildOpts.heartbeat === 'function' ? buildOpts.heartbeat : null;
  const payloadSummary = summarizePlanBuildPayload(src);
  const calvesCombo = shouldTrackCalvesComboDiagnostics(payloadSummary);
  const emitRouteHeartbeat = (stage, payload = {}) => {
    if (typeof heartbeat === 'function') {
      heartbeat(stage, {
        ...payload,
        failedCombo: Array.isArray(payloadSummary.priorityGroups) ? payloadSummary.priorityGroups.slice() : [],
        priorityGroups: Array.isArray(payloadSummary.priorityGroups) ? payloadSummary.priorityGroups.slice() : [],
        lastBuilderStage: String(stage || '').trim() || undefined,
        lastRepairOrPolishFunction: String(payload?.lastRepairOrPolishFunction || stage || '').trim() || undefined
      });
    }
    if (!debugCombo && !calvesCombo) return;
  };
  const runRouteStage = (stage, fn, meta = {}) => {
    const stageStartedAt = Date.now();
    const assertStageMeta = stage === 'assertBodybuildingPlanByEngine'
      ? {
        functionName: 'runRouteStage',
        fileName: 'core/trainingRoutes.js',
        elapsedMs: Date.now() - stageStartedAt,
        requestedDayCount: Number.isFinite(Number(meta?.requestedDayCount)) ? Number(meta.requestedDayCount) : undefined,
        requestedPriorityCount: Number.isFinite(Number(meta?.requestedPriorityCount)) ? Number(meta.requestedPriorityCount) : undefined,
        selectedPriorities: Array.isArray(meta?.selectedPriorities) ? meta.selectedPriorities.map((value) => String(value || '')) : [],
        planExists: typeof meta?.planExists === 'boolean' ? meta.planExists : undefined,
        weeksLength: Number.isFinite(Number(meta?.weeksLength)) ? Number(meta.weeksLength) : undefined,
        callBoundary: 'runRouteStage_before_validateCandidate'
      }
      : null;
    if (stage === 'assertBodybuildingPlanByEngine') {
        emitRouteHeartbeat('entered_run_route_stage_assert', {
          ...meta,
          lastRepairOrPolishFunction: 'runRouteStage',
          validatorSection: 'entered_run_route_stage_assert',
          failedInvariant: 'entered_run_route_stage_assert',
          elapsedMs: Date.now() - stageStartedAt
        });
      }
    if (debugCombo) {
      logAbsGlutesLegsDebug('route', `${stage}-start`, meta);
    }
    if (stage === 'route repair') emitRouteHeartbeat('route repair started', { ...meta, lastRepairOrPolishFunction: 'routeFinalizeBodybuildingPlan' });
    if (stage === 'lower-day hinge repair') emitRouteHeartbeat('hinge repair started', { ...meta, lastRepairOrPolishFunction: 'routeRepairLowerDayHingeInvariant' });
    if (stage === 'assertBodybuildingPlanByEngine') {
      emitRouteHeartbeat('assert_validation_started_callsite_A', {
        ...assertStageMeta,
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'assert_validation_started_callsite_A',
        failedInvariant: 'assert_validation_started_callsite_A'
      });
      emitRouteHeartbeat('after_assert_validation_started_callsite_A', {
        ...assertStageMeta,
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'after_assert_validation_started_callsite_A',
        failedInvariant: 'after_assert_validation_started_callsite_A'
      });
    }
    if (stage === 'delts-arms role repair') emitRouteHeartbeat('delts-arms role repair started', { ...meta, lastRepairOrPolishFunction: 'routeRepairDeltsArmsRoleInvariant' });
    if (stage === 'rear-delt cleanup') emitRouteHeartbeat('rear-delt cleanup started', { ...meta, lastRepairOrPolishFunction: 'routeRepairRearDeltFrequencyInvariant' });
    try {
      if (stage === 'assertBodybuildingPlanByEngine') {
        emitRouteHeartbeat('before_run_route_stage_assert_callback', {
          ...meta,
          lastRepairOrPolishFunction: 'runRouteStage',
          validatorSection: 'before_run_route_stage_assert_callback',
          failedInvariant: 'before_run_route_stage_assert_callback',
          elapsedMs: Date.now() - stageStartedAt
        });
      }
      const result = fn();
      if (stage === 'assertBodybuildingPlanByEngine') {
        emitRouteHeartbeat('after_run_route_stage_assert_callback', {
          ...meta,
          lastRepairOrPolishFunction: 'runRouteStage',
          validatorSection: 'after_run_route_stage_assert_callback',
          failedInvariant: 'after_run_route_stage_assert_callback',
          elapsedMs: Date.now() - stageStartedAt
        });
      }
      return result;
    } finally {
      if (debugCombo) {
        logAbsGlutesLegsDebug('route', `${stage}-finish`, {
          ...meta,
          durationMs: Date.now() - stageStartedAt
        });
      }
    }
  };
  const validateCandidate = (plan) => {
    if (String(plan?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return null;
    let didReturn = false;
    let didThrow = false;
    let thrownError = null;
    let assertStartedAt = null;
    let assertFinishedAt = null;
    const planWeeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
    const planDays = planWeeks.flatMap((week) => Array.isArray(week?.days) ? week.days : []);
    const planExercises = planDays.flatMap((day) => Array.isArray(day?.exercises) ? day.exercises : []);
    const scalarAssertMeta = {
      priorityGroupCount: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.length : 0,
      weekCount: planWeeks.length,
      dayCount: planDays.length,
      exerciseCount: planExercises.length,
      requestedDayCount: Number.isFinite(Number(src?.daysPerWeek)) ? Number(src.daysPerWeek) : undefined,
      requestedPriorityCount: Array.isArray(src?.priorityGroups) ? src.priorityGroups.length : undefined
    };
    try {
      if (debugCombo) {
        logAbsGlutesLegsDebug('route', 'builder-final-validation-start', {
          planPriorityGroups: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [],
          weekCount: Array.isArray(plan?.weeks) ? plan.weeks.length : 0
        });
      }
      assertStartedAt = Date.now();
      emitRouteHeartbeat('assert_call_started', {
        ...scalarAssertMeta,
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'assert_call_started',
        failedInvariant: 'assert_call_started',
        assertCallStarted: true,
        assertStartedAt
      });
      emitRouteHeartbeat('after_assert_validation_started_heartbeat', {
        ...scalarAssertMeta,
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'after_assert_validation_started_heartbeat',
        failedInvariant: 'after_assert_validation_started_heartbeat',
        assertStartedAt
      });
      emitRouteHeartbeat('before_assert_context_meta_build', {
        ...scalarAssertMeta,
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'before_assert_context_meta_build',
        failedInvariant: 'before_assert_context_meta_build',
        assertStartedAt
      });
      const assertContextPriorityGroups = Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [];
      const assertContextWeeklyTargets = plan?.meta?.weeklyTargets || undefined;
      const assertContextCalfTargetSets = Number.isFinite(Number(
        plan?.meta?.weeklyTargets?.targetWeeklySets?.Calves
        || plan?.meta?.weeklyTargets?.weeklyTargets?.targetWeeklySets?.Calves
      ))
        ? Number(
          plan?.meta?.weeklyTargets?.targetWeeklySets?.Calves
          || plan?.meta?.weeklyTargets?.weeklyTargets?.targetWeeklySets?.Calves
        )
        : undefined;
      emitRouteHeartbeat('after_assert_context_meta_build', {
        ...scalarAssertMeta,
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'after_assert_context_meta_build',
        failedInvariant: 'after_assert_context_meta_build',
        assertStartedAt
      });
      emitRouteHeartbeat('before_assert_route_meta_build', {
        ...scalarAssertMeta,
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'before_assert_route_meta_build',
        failedInvariant: 'before_assert_route_meta_build',
        assertStartedAt
      });
      const assertRouteMeta = {
        priorityGroups: assertContextPriorityGroups,
        requestedDayCount: Number.isFinite(Number(src?.daysPerWeek)) ? Number(src.daysPerWeek) : undefined,
        requestedPriorityCount: Array.isArray(src?.priorityGroups) ? src.priorityGroups.length : undefined,
        selectedPriorities: Array.isArray(src?.priorityGroups) ? src.priorityGroups.map((value) => String(value || '')) : [],
        planExists: Boolean(plan),
        weeksLength: planWeeks.length
      };
      emitRouteHeartbeat('after_assert_route_meta_build', {
        ...scalarAssertMeta,
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'after_assert_route_meta_build',
        failedInvariant: 'after_assert_route_meta_build',
        assertStartedAt
      });
      emitRouteHeartbeat('before_run_route_stage_assert', {
        ...scalarAssertMeta,
        lastRepairOrPolishFunction: 'runRouteStage',
        validatorSection: 'before_run_route_stage_assert',
        failedInvariant: 'before_run_route_stage_assert',
        assertStartedAt
      });
      const contractResult = runRouteStage('assertBodybuildingPlanByEngine', () => withAssertionDiagnosticContext({
        heartbeat: emitRouteHeartbeat,
        priorityGroups: assertContextPriorityGroups,
        weeklyTargets: assertContextWeeklyTargets,
        calfTargetSets: assertContextCalfTargetSets
      }, () => {
        emitRouteHeartbeat('entered_run_route_stage_assert_callback', {
          priorityGroups: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [],
          lastRepairOrPolishFunction: 'runRouteStage',
          validatorSection: 'entered_run_route_stage_assert_callback',
          failedInvariant: 'entered_run_route_stage_assert_callback',
          assertStartedAt
        });
        emitRouteHeartbeat('before_validate_bodybuilding_plan_contract', {
          priorityGroups: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [],
          lastRepairOrPolishFunction: 'validateBodybuildingPlanContract',
          validatorSection: 'before_validate_bodybuilding_plan_contract',
          failedInvariant: 'before_validate_bodybuilding_plan_contract',
          assertStartedAt
        });
        return validateBodybuildingPlanContract(plan, {
          priorityGroups: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : []
        });
      }), assertRouteMeta);
      emitRouteHeartbeat('after_run_route_stage_assert', {
        priorityGroups: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [],
        lastRepairOrPolishFunction: 'runRouteStage',
        validatorSection: 'after_run_route_stage_assert',
        failedInvariant: 'after_run_route_stage_assert',
        assertStartedAt,
        assertFinishedAt: Date.now(),
        assertElapsedMs: assertStartedAt ? (Date.now() - assertStartedAt) : undefined
      });
      if (contractResult?.ok === false) throw contractResult.error;
      assertFinishedAt = Date.now();
      emitRouteHeartbeat('assert_call_returned_success', {
        priorityGroups: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [],
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'assert_call_returned_success',
        failedInvariant: 'assert_call_returned_success',
        assertReturnedSuccessfully: true,
        assertCallReturnedSuccess: true,
        assertStartedAt,
        assertFinishedAt,
        assertElapsedMs: assertStartedAt ? (assertFinishedAt - assertStartedAt) : undefined
      });
      didReturn = true;
      return null;
    } catch (err) {
      didThrow = true;
      thrownError = err;
      assertFinishedAt = Date.now();
      emitRouteHeartbeat('assert_call_threw', {
        priorityGroups: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [],
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'assert_call_threw',
        failedInvariant: 'assert_call_threw',
        thrownMessage: String(err?.message || ''),
        thrownName: String(err?.name || ''),
        thrownCode: String(err?.code || err?.error || ''),
        thrownType: typeof err,
        thrownOwnPropertyNames: err && typeof err === 'object' ? Object.getOwnPropertyNames(err) : [],
        thrownPreview: safeAssertionPreview(err),
        stack: String(err?.stack || '').trim() || undefined,
        assertCallThrew: true,
        assertStartedAt,
        assertFinishedAt,
        assertElapsedMs: assertStartedAt ? (assertFinishedAt - assertStartedAt) : undefined
      });
      if (debugCombo) {
        logAbsGlutesLegsDebug('route', 'builder-final-validation-failed', {
          error: normalizePlanBuildError(err, {
            functionName: 'assertBodybuildingPlanByEngine',
            stage: 'assertBodybuildingPlanByEngine',
            failedStage: 'assertBodybuildingPlanByEngine'
          })
        });
      }
      if (buildOpts?.immediateValidationErrorHandoff) {
        const normalized = normalizePlanBuildError(err, {
          functionName: 'assertBodybuildingPlanByEngine',
          stage: 'assertBodybuildingPlanByEngine',
          failedStage: 'assertBodybuildingPlanByEngine'
        });
        normalized.error = 'FINAL_ROUTE_VALIDATION_FAILED';
        normalized.code = 'FINAL_ROUTE_VALIDATION_FAILED';
        throw normalized;
      }
      return err;
    } finally {
      if (!assertFinishedAt && assertStartedAt) assertFinishedAt = Date.now();
      emitRouteHeartbeat('assert_call_finally', {
        priorityGroups: Array.isArray(plan?.meta?.priorityGroups) ? plan.meta.priorityGroups.slice() : [],
        lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
        validatorSection: 'assert_call_finally',
        failedInvariant: 'assert_call_finally',
        didReturn,
        didThrow,
        thrownMessage: thrownError ? String(thrownError?.message || '') : undefined,
        assertCallFinally: true,
        assertStartedAt,
        assertFinishedAt,
        assertElapsedMs: assertStartedAt && assertFinishedAt ? (assertFinishedAt - assertStartedAt) : undefined
      });
    }
  };
  const stabilizeCandidate = (plan) => {
    const repaired = repairOblueprintBodybuildingPlan(plan);
    const finalized = runRouteStage('route repair', () => routeFinalizeBodybuildingPlan(repairOblueprintBodybuildingPlan(repaired)));
    if (finalized?.error) return finalized;
    const deduped = runRouteStage('final dedupe', () => routeEnforceFinalVisibleDedupeInvariant(finalized));
    if (deduped?.error) return deduped;
    const deltsArmsRepaired = runRouteStage('delts-arms role repair', () => routeRepairDeltsArmsRoleInvariant(deduped));
    if (deltsArmsRepaired?.error) return deltsArmsRepaired;
    const hingeRepaired = runRouteStage('lower-day hinge repair', () => routeRepairLowerDayHingeInvariant(deltsArmsRepaired));
    if (hingeRepaired?.error) return hingeRepaired;
    const rearDeltRepaired = runRouteStage('rear-delt cleanup', () => routeRepairRearDeltFrequencyInvariant(hingeRepaired));
    if (rearDeltRepaired?.error) return rearDeltRepaired;
    const trueFinalVisible = runRouteStage('true final visible cleanup', () => routeEnforceTrueFinalVisibleTargetFamilyCleanup(rearDeltRepaired));
    if (trueFinalVisible?.error) return trueFinalVisible;
    return runRouteStage('final banned exercise scrub', () => routeScrubBannedExercisesFromPlan(trueFinalVisible));
  };

  let lastError = null;
  let lastPlan = null;
  let lastPayload = null;
  const tryBuildSeries = (seriesPayload, attempts = 6) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const nextPayload = {
        ...seriesPayload,
        planSeed: baseSeed + (attempt * 9973)
      };
      const out = buildOblueprintPlan(nextPayload, buildOpts);
      if (out?.error) {
        lastError = out;
        lastPayload = nextPayload;
        if (String(out?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') break;
        continue;
      }
      const finalizedRaw = runRouteStage('route repair', () => routeFinalizeBodybuildingPlan(out), {
        attempt: attempt + 1
      });
      if (finalizedRaw?.error) {
        lastError = finalizedRaw;
        lastPayload = nextPayload;
        if (String(finalizedRaw?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') break;
        continue;
      }
      const dedupedRaw = runRouteStage('final dedupe', () => routeEnforceFinalVisibleDedupeInvariant(finalizedRaw), {
        attempt: attempt + 1
      });
      if (dedupedRaw?.error) {
        lastError = dedupedRaw;
        lastPayload = nextPayload;
        if (String(dedupedRaw?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') break;
        continue;
      }
      const deltsArmsRepaired = runRouteStage('delts-arms role repair', () => routeRepairDeltsArmsRoleInvariant(dedupedRaw), {
        attempt: attempt + 1
      });
      if (deltsArmsRepaired?.error) {
        lastError = deltsArmsRepaired;
        lastPayload = nextPayload;
        if (String(deltsArmsRepaired?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') break;
        continue;
      }
      const hingeRepaired = runRouteStage('lower-day hinge repair', () => routeRepairLowerDayHingeInvariant(deltsArmsRepaired), {
        attempt: attempt + 1
      });
      if (hingeRepaired?.error) {
        lastError = hingeRepaired;
        lastPayload = nextPayload;
        if (String(hingeRepaired?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') break;
        continue;
      }
      const rearDeltRepaired = runRouteStage('rear-delt cleanup', () => routeRepairRearDeltFrequencyInvariant(hingeRepaired), {
        attempt: attempt + 1
      });
      if (rearDeltRepaired?.error) {
        lastError = rearDeltRepaired;
        lastPayload = nextPayload;
        if (String(rearDeltRepaired?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') break;
        continue;
      }
      const trueFinalVisible = runRouteStage('true final visible cleanup', () => routeEnforceTrueFinalVisibleTargetFamilyCleanup(rearDeltRepaired), {
        attempt: attempt + 1
      });
      if (trueFinalVisible?.error) {
        lastError = trueFinalVisible;
        lastPayload = nextPayload;
        if (String(trueFinalVisible?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') break;
        continue;
      }
      const bannedScrubbed = runRouteStage('final banned exercise scrub', () => routeScrubBannedExercisesFromPlan(trueFinalVisible), {
        attempt: attempt + 1
      });
      if (bannedScrubbed?.error) {
        lastError = bannedScrubbed;
        lastPayload = nextPayload;
        if (String(bannedScrubbed?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') break;
        continue;
      }
      lastPlan = bannedScrubbed;
      lastPayload = nextPayload;
      if (fastBuild) {
        const rawValidationError = validateCandidate(bannedScrubbed);
        if (!rawValidationError) {
          return { plan: bannedScrubbed, usedPayload: nextPayload };
        }
        const stabilized = stabilizeCandidate(bannedScrubbed);
        if (stabilized?.error) {
          lastError = stabilized;
          continue;
        }
        lastPlan = stabilized;
        const stabilizedValidationError = validateCandidate(stabilized);
        if (!stabilizedValidationError) {
          return { plan: stabilized, usedPayload: nextPayload };
        }
        lastError = stabilizedValidationError;
        continue;
      }
      const rawValidationError = validateCandidate(bannedScrubbed);
      if (!rawValidationError) {
        return { plan: bannedScrubbed, usedPayload: nextPayload };
      }
      const stabilized = stabilizeCandidate(bannedScrubbed);
      if (stabilized?.error) {
        lastError = stabilized;
        continue;
      }
      lastPlan = stabilized;
      const stabilizedValidationError = validateCandidate(stabilized);
      if (!stabilizedValidationError) {
        return { plan: stabilized, usedPayload: nextPayload };
      }
      lastError = stabilizedValidationError;
    }
    return null;
  };

  const directBuild = tryBuildSeries(src, directAttempts);
  if (directBuild) return directBuild;
  if (String(lastError?.error || '') === 'LOWER_BODY_REPAIR_LOOP_LIMIT') {
    return { error: lastError };
  }

  const relaxedPayload = normalizeOblueprintPayload(src, { relax: true });
  const relaxedBuild = tryBuildSeries(relaxedPayload, relaxedAttempts);
  if (relaxedBuild) return { ...relaxedBuild, usedPayload: { ...relaxedBuild.usedPayload, _relaxedFallback: true } };
  if (lastPlan) return { plan: lastPlan, usedPayload: lastPayload };
  return { error: lastError || { error: 'PLAN_BUILD_FAILED', reason: 'Failed to build a valid Oblueprint plan.' } };
}

function equipmentAccessToList(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  if (!raw || typeof raw !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    out.push(String(k || '').trim());
  }
  return out;
}

function mapClassicSessionBucketToOblueprint(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (key === '30_45' || key === '30') return '30';
  if (key === '45_60' || key === '45') return '45';
  if (key === '60_75' || key === '60') return '60';
  if (key === '75_90_plus' || key === '75_90' || key === '75+' || key === '75') return '75+';
  return '60';
}

function mapClassicTrainingAgeToOblueprint(raw, fallbackExperience = '') {
  const key = String(raw || '').trim().toLowerCase();
  if (key === '0_6') return '<6m';
  if (key === '6_18') return '6-24m';
  if (key === '18_36' || key === '3_5') return '2-5y';
  if (key === '5_plus') return '5y+';
  return normalizeOblueprintExperience(fallbackExperience);
}

function mapClassicPhaseToPrimaryGoal(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (key === 'cut') return 'Cut fat';
  if (key === 'maintain' || key === 'recomp') return 'Recomp';
  return 'Build size';
}

function mapClassicEquipmentStyleToTrainingStyle(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (key === 'machine') return 'Mostly machines/cables';
  if (key === 'barbell' || key === 'dumbbell') return 'Mostly free weights';
  return 'Balanced mix';
}

function buildPreferredDaysFromUnavailable(daysPerWeek, unavailableDays) {
  const n = clampInt(daysPerWeek, 2, 6, null);
  if (!n) return [];
  const blocked = new Set(normalizeWeekdayIndexList(unavailableDays));
  const schedule = buildTrainingWeekdays(n, Array.from(blocked));
  return (Array.isArray(schedule) ? schedule : [])
    .map((idx) => TRAINING_WEEKDAY_CODES[idx])
    .filter(Boolean);
}

function mapClassicInjuryToOblueprint(strength) {
  const injury = strength?.injury && typeof strength.injury === 'object' ? strength.injury : null;
  const severityMap = strength?.injurySeverityByJoint && typeof strength.injurySeverityByJoint === 'object'
    ? strength.injurySeverityByJoint
    : {};
  const jointAlias = {
    shoulder: 'Shoulder',
    elbow: 'Elbow',
    wrist: 'Wrist',
    back: 'Back',
    lower_back: 'Back',
    hip: 'Hip',
    knee: 'Knee',
    ankle: 'Ankle'
  };
  const painAreas = [];
  const painProfilesByArea = {};
  const note = String(injury?.note || '').trim();
  const joints = Array.isArray(injury?.joints) ? injury.joints : [];
  joints.forEach((jointKey) => {
    const area = jointAlias[String(jointKey || '').trim().toLowerCase()];
    if (!area || painAreas.includes(area)) return;
    painAreas.push(area);
    const severity = Math.max(1, Math.min(10, Math.round(Number(severityMap?.[jointKey]) || 0)));
    if (severity) {
      painProfilesByArea[area] = {
        severity,
        recency: severity >= 7 ? 'Recent' : '',
        notes: note
      };
    }
  });
  const movementsToAvoid = [];
  const lowerNote = note.toLowerCase();
  if (/overhead|shoulder press|upright row/.test(lowerNote)) movementsToAvoid.push('overhead press');
  if (/bench|press/.test(lowerNote) && /shoulder|pinch/.test(lowerNote)) movementsToAvoid.push('flat bench');
  if (/deadlift|axial|hinge|lower back/.test(lowerNote)) movementsToAvoid.push('barbell hinge');
  if (/deep knee|deep squat|knee flexion|ankle/.test(lowerNote)) movementsToAvoid.push('deep squat');
  if (/dip/.test(lowerNote)) movementsToAvoid.push('dips');
  return { painAreas, painProfilesByArea, movementsToAvoid };
}

function coerceClassicBodybuildingToOblueprintPayload(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const discipline = String(src?.discipline || '').trim().toLowerCase();
  const trainingFeel = discipline === 'powerbuilding' ? 'Powerbuilding' : 'Aesthetic bodybuilding';
  const strength = src?.strength && typeof src.strength === 'object' ? src.strength : {};
  const phase = String(strength?.phase || src?.phase || '').trim().toLowerCase();
  const equipmentStylePref = String(strength?.equipmentStylePref || src?.equipmentStylePref || 'mix').trim().toLowerCase();
  const classicInjury = mapClassicInjuryToOblueprint(strength);
  return normalizeOblueprintPayload({
    trainingFeel,
    primaryGoal: mapClassicPhaseToPrimaryGoal(phase),
    timeline: '8 weeks',
    focus: 'Aesthetic',
    experience: mapClassicTrainingAgeToOblueprint(strength?.trainingAgeBucket, src?.experience),
    location: equipmentAccessToList(src?.equipmentAccess).some((token) => /machine|cable/i.test(String(token || ''))) ? 'Commercial gym' : 'Home',
    trainingStyle: mapClassicEquipmentStyleToTrainingStyle(equipmentStylePref),
    outputStyle: 'RPE/RIR cues',
    closeToFailure: 'No',
    bench: Number(src?.bench || strength?.bench || 0) || null,
    squat: Number(src?.squat || strength?.squat || 0) || null,
    deadlift: Number(src?.deadlift || strength?.deadlift || 0) || null,
    benchVariation: String(strength?.benchVariation || '').trim() || null,
    benchWeight: Number(strength?.benchWeight || 0) || null,
    benchReps: Number(strength?.benchReps || 0) || null,
    lowerMovement: String(strength?.lowerMovement || '').trim() || null,
    lowerWeight: Number(strength?.lowerWeight || 0) || null,
    lowerReps: Number(strength?.lowerReps || 0) || null,
    hingeMovement: String(strength?.hingeMovement || '').trim() || null,
    hingeWeight: Number(strength?.hingeWeight || 0) || null,
    hingeReps: Number(strength?.hingeReps || 0) || null,
    weightLb: Number(strength?.bodyweight || 0) || null,
    bodyweight: Number(strength?.bodyweight || 0) || null,
    daysPerWeek: src?.daysPerWeek,
    sessionLengthMin: mapClassicSessionBucketToOblueprint(strength?.timePerSession || src?.timePerSession || src?.sessionLength || '60'),
    priorityGroups: src?.emphasis || src?.priorityGroups || [],
    movementsToAvoid: classicInjury.movementsToAvoid,
    preferredDays: buildPreferredDaysFromUnavailable(src?.daysPerWeek, src?.unavailableDays),
    equipmentAccess: equipmentAccessToList(src?.equipmentAccess),
    painAreas: classicInjury.painAreas,
    painProfilesByArea: classicInjury.painProfilesByArea,
    sleepHours: 7,
    activityLevel: 'Active',
    stress: 'Medium',
    planSeed: Number(src?.planSeed) || Date.now()
  }, { relax: false });
}

function safeLocalReturnTo(raw, fallback = '/training.html?demoPlan=1') {
  const value = String(raw || '').trim();
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

function buildDemoWorkoutPayload() {
  return normalizeOblueprintPayload({
    trainingFeel: 'Aesthetic bodybuilding',
    primaryGoal: 'Build size',
    timeline: '8 weeks',
    focus: 'Aesthetic',
    experience: '6-24m',
    location: 'Commercial gym',
    trainingStyle: 'Balanced mix',
    outputStyle: 'RPE/RIR cues',
    closeToFailure: 'No',
    daysPerWeek: 4,
    sessionLengthMin: '60',
    priorityGroups: ['Back', 'Shoulders'],
    movementsToAvoid: [],
    preferredDays: ['Mo', 'We', 'Fr', 'Sa'],
    equipmentAccess: ['barbell', 'dumbbells', 'machines'],
    painAreas: [],
    painProfilesByArea: {},
    sleepHours: 7,
    activityLevel: 'Active',
    stress: 'Medium',
    planSeed: Date.now()
  }, { relax: false });
}

async function ensureDemoWorkoutPlanForUser(userId, displayName = 'Demo User') {
  const existing = await getActivePlan(userId);
  if (existing?.id) return existing;

  const payload = buildDemoWorkoutPayload();
  const built = buildOblueprintPlanWithFallback(payload);
  if (built?.error) {
    const reason = built.error?.reason || built.error?.error || 'Could not create demo workout plan.';
    throw new Error(String(reason));
  }

  const planBuilt = built.plan;
  const discipline = resolveOblueprintDiscipline(payload.trainingFeel);
  const daysPerWeek = Number(planBuilt?.meta?.daysPerWeek) || clampInt(payload?.daysPerWeek, 2, 6, 4);
  if (!discipline || !daysPerWeek) {
    throw new Error('Demo workout payload is invalid.');
  }

  await upsertProfile(userId, {
    discipline,
    experience: payload.experience || '6-24m',
    daysPerWeek,
    strength: {},
    preferredDays: payload?.preferredDays,
    equipmentAccess: {},
    profile: { firstName: safeText(displayName || 'Demo User', 80) || 'Demo User' }
  });

  const created = await createNewOblueprintPlan(userId, {
    discipline,
    daysPerWeek,
    plan: planBuilt
  });
  if (!created?.id) {
    throw new Error('Could not save demo workout plan.');
  }
  return created;
}

const ROUTE_BANNED_NAME_PATTERNS = [
  /\bchains?\b/,
  /\bkneeling\s*squat\b/,
  /\bone[-\s]?arm\s*floor\s*press\b/,
  /\bpin\s*press(es)?\b/,
  /\bfloor\s*press\b/,
  /\bfloor\b/,
  /\blying\b(?!.*\b(leg\s*curl|hamstring\s*curl)\b)/,
  /\bprone\b/,
  /\bsupine\b/,
  /\bhanging\s*bar\s*good\s*morning\b/,
  /\boverhead\s*squat\b/,
  /\bpistol\s*squat\b/,
  /\bfrankenstein\b/,
  /\baxle\b/,
  /\blog\b/,
  /\byoke\b/,
  /\bstone\b/,
  /\bfarmers?\b/,
  /\bsandbag\b/,
  /\bjammer\b/,
  /\bwith\s*a\s*twist\b/,
  /\bside[\s-]*to[\s-]*side\b/,
  /\brocky\b/,
  /\bbehind(?:[\s-]*the)?[\s-]*neck\b/,
  /\b(bench|press|curl|extension|squat|deadlift|row)\b.*\bto\b.*\b(bench|press|curl|extension|squat|deadlift|row)\b/,
  /\brear\s*delt\s*row\b/,
  /\bgironda\b/,
  /\bsternum\s*chin\b/,
  /\bpush[\s-]*ups?\b/,
  /\bpull[\s-]*ups?\b/,
  /\bchin[\s-]*ups?\b/,
  /\bmuscle[\s-]*ups?\b/,
  /\bmini\s*band\b/,
  /\bresistance\s*band\b/,
  /\bboard\s*press\b/,
  /\banti[-\s]?gravity\s*press\b/,
  /\bguillotine\b/,
  /\bcompetition\b/,
  /\btechnique\b/,
  /\bneck\s*press\b/,
  /\bspeed\b/,
  /\bdynamic\s*effort\b/,
  /\btempo\b/,
  /\bpaused?\b/,
  /\bdeadlift\b.*\bsingle\b/,
  /\bsingle\b.*\bdeadlift\b/,
  /\bkneeling\b(?!.*\b(crunch|ab|core|rollout)\b)/,
  /\bone[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/,
  /\bsingle[-\s]*arm\b.*\blat\b.*\bpull[\s-]*down\b/,
  /\bone[-\s]*arm\b.*\bpull[\s-]*down\b/,
  /\bsingle[-\s]*arm\b.*\bpull[\s-]*down\b/,
  /\bone[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/,
  /\bsingle[-\s]*leg\b.*\bbarbell\b.*\bsquat\b/,
  /\bsquat\s*with\s*plate\s*movers\b/,
  /\bside\s*laterals?\s*to\s*front\s*raise\b/,
  /\bside\s*split\s*squat\b/,
  /\bdumbbell\s+squat\b/,
  /\bchair\s*squat\b/,
  /\bplie\b.*\bsquat\b/,
  /\bbutterfly\b/,
  /\bcalf\s*raise\s*on\s*a\s*dumbbell\b/,
  /\bone[-\s]*arm\b.*\bshoulder\s*press\b/,
  /\bsingle[-\s]*arm\b.*\bshoulder\s*press\b/,
  /^(?!.*\b(lying|seated)\b).*\bhamstring\s*curls?\b/,
  /^(?!.*\b(lying|seated)\b).*\bleg\s*curls?\b/,
  /\bbosu\b/,
  /\bbalance\s*board\b/,
  /\bpowerlifting\b/
];

const ROUTE_REPLACEMENT_MAP = {
  chest_main: [
    { name: 'Bench Press', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' },
    { name: 'Barbell Incline Bench Press - Medium Grip', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' },
    { name: 'Dumbbell Bench Press', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' },
    { name: 'Machine Chest Press', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' }
  ],
  chest_secondary_press: [
    { name: 'Machine Chest Press', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' },
    { name: 'Cable Chest Press', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' },
    { name: 'Barbell Incline Bench Press - Medium Grip', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' },
    { name: 'Incline Dumbbell Press', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' },
    { name: 'Dumbbell Bench Press', pattern: 'HorizontalPush', style: 'Compound', primary: 'Chest' }
  ],
  shoulder_main: [
    { name: 'Overhead Press', pattern: 'VerticalPush', style: 'Compound', primary: 'Shoulders' },
    { name: 'Dumbbell Shoulder Press', pattern: 'VerticalPush', style: 'Compound', primary: 'Shoulders' },
    { name: 'Seated Dumbbell Press', pattern: 'VerticalPush', style: 'Compound', primary: 'Shoulders' },
    { name: 'Seated Barbell Military Press', pattern: 'VerticalPush', style: 'Compound', primary: 'Shoulders' },
    { name: 'Seated Cable Shoulder Press', pattern: 'VerticalPush', style: 'Compound', primary: 'Shoulders' },
    { name: 'Cable Shoulder Press', pattern: 'VerticalPush', style: 'Compound', primary: 'Shoulders' }
  ],
  chest_iso: [
    { name: 'Low Cable Crossover', pattern: 'Isolation', style: 'Isolation', primary: 'Chest' },
    { name: 'Cable Crossover', pattern: 'Isolation', style: 'Isolation', primary: 'Chest' },
    { name: 'Pec Deck', pattern: 'Isolation', style: 'Isolation', primary: 'Chest' }
  ],
  hinge_main: [
    { name: 'Romanian Deadlift', pattern: 'Hinge', style: 'Compound', primary: 'Legs' },
    { name: 'Barbell Deadlift', pattern: 'Hinge', style: 'Compound', primary: 'Legs' },
    { name: 'Hip Thrust', pattern: 'Hinge', style: 'Compound', primary: 'Glutes' },
    { name: 'Barbell Hip Thrust', pattern: 'Hinge', style: 'Compound', primary: 'Glutes' },
    { name: 'Barbell Glute Bridge', pattern: 'Hinge', style: 'Compound', primary: 'Glutes' }
  ],
  hinge_lengthened: [
    { name: 'Romanian Deadlift', pattern: 'Hinge', style: 'Compound', primary: 'Legs' },
    { name: 'Stiff-Legged Deadlift', pattern: 'Hinge', style: 'Compound', primary: 'Legs' },
    { name: 'Smith Machine Stiff-Legged Deadlift', pattern: 'Hinge', style: 'Compound', primary: 'Legs' },
    { name: 'Good Morning', pattern: 'Hinge', style: 'Compound', primary: 'Legs' },
    { name: 'Back Extension', pattern: 'Hinge', style: 'Compound', primary: 'Legs' }
  ],
  lunge_main: [
    { name: 'Barbell Lunge', pattern: 'Lunge', style: 'Compound', primary: 'Legs' },
    { name: 'Barbell Walking Lunge', pattern: 'Lunge', style: 'Compound', primary: 'Legs' },
    { name: 'Dumbbell Rear Lunge', pattern: 'Lunge', style: 'Compound', primary: 'Legs' },
    { name: 'Elevated Back Lunge', pattern: 'Lunge', style: 'Compound', primary: 'Legs' }
  ],
  leg_iso: [
    { name: 'Seated Leg Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' },
    { name: 'Lying Leg Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' },
    { name: 'Leg Extensions', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' }
  ],
  squat_main: [
    { name: 'Hack Squat', pattern: 'Squat', style: 'Compound', primary: 'Legs' },
    { name: 'Leg Press', pattern: 'Squat', style: 'Compound', primary: 'Legs' },
    { name: 'Front Squat', pattern: 'Squat', style: 'Compound', primary: 'Legs' },
    { name: 'Barbell Full Squat', pattern: 'Squat', style: 'Compound', primary: 'Legs' }
  ],
  vertical_pull: [
    { name: 'Wide-Grip Lat Pulldown', pattern: 'VerticalPull', style: 'Compound', primary: 'Back' },
    { name: 'Lat Pulldown', pattern: 'VerticalPull', style: 'Compound', primary: 'Back' },
    { name: 'Close-Grip Front Lat Pulldown', pattern: 'VerticalPull', style: 'Compound', primary: 'Back' },
    { name: 'V-Bar Pulldown', pattern: 'VerticalPull', style: 'Compound', primary: 'Back' },
    { name: 'Underhand Cable Pulldowns', pattern: 'VerticalPull', style: 'Compound', primary: 'Back' }
  ],
  row_main: [
    { name: 'Chest-Supported Row', pattern: 'HorizontalPull', style: 'Compound', primary: 'Back' },
    { name: 'Cable Row', pattern: 'HorizontalPull', style: 'Compound', primary: 'Back' },
    { name: 'Dumbbell Incline Row', pattern: 'HorizontalPull', style: 'Compound', primary: 'Back' },
    { name: 'Bent Over Two-Arm Long Bar Row', pattern: 'HorizontalPull', style: 'Compound', primary: 'Back' },
    { name: 'One-Arm Dumbbell Row', pattern: 'HorizontalPull', style: 'Compound', primary: 'Back' },
    { name: 'Bent Over One-Arm Long Bar Row', pattern: 'HorizontalPull', style: 'Compound', primary: 'Back' }
  ],
  biceps_iso: [
    { name: 'Barbell Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Machine Preacher Curls', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Alternate Incline Dumbbell Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Drag Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Hammer Curls', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' }
  ],
  biceps_iso_lengthened: [
    { name: 'Alternate Incline Dumbbell Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Incline Hammer Curls', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Bayesian Cable Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' }
  ],
  biceps_iso_shortened: [
    { name: 'Machine Preacher Curls', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Preacher Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Cable Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' }
  ],
  triceps_iso: [
    { name: 'Triceps Extension', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Incline Barbell Triceps Extension', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' },
    { name: 'Dumbbell One-Arm Triceps Extension', pattern: 'Isolation', style: 'Isolation', primary: 'Arms' }
  ],
  lateral_iso: [
    { name: 'Lateral Raise', pattern: 'Isolation', style: 'Isolation', primary: 'Shoulders' },
    { name: 'Cable Seated Lateral Raise', pattern: 'Isolation', style: 'Isolation', primary: 'Shoulders' },
    { name: 'Seated Side Lateral Raise', pattern: 'Isolation', style: 'Isolation', primary: 'Shoulders' }
  ],
  rear_iso: [
    { name: 'Rear Delt Fly', pattern: 'Isolation', style: 'Isolation', primary: 'Shoulders' },
    { name: 'Cable Rear Delt Fly', pattern: 'Isolation', style: 'Isolation', primary: 'Shoulders' },
    { name: 'Seated Bent-Over Rear Delt Raise', pattern: 'Isolation', style: 'Isolation', primary: 'Shoulders' }
  ],
  ham_iso: [
    { name: 'Seated Leg Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' },
    { name: 'Lying Leg Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' },
    { name: 'Seated Hamstring Curl', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' }
  ],
  hinge_alt: [
    { name: 'Barbell Glute Bridge', pattern: 'Hinge', style: 'Compound', primary: 'Glutes' },
    { name: 'Hip Thrust', pattern: 'Hinge', style: 'Compound', primary: 'Glutes' },
    { name: 'Barbell Hip Thrust', pattern: 'Hinge', style: 'Compound', primary: 'Glutes' },
    { name: 'Smith Machine Hip Thrust', pattern: 'Hinge', style: 'Compound', primary: 'Glutes' }
  ],
  calves_iso: [
    { name: 'Seated Calf Raise', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' },
    { name: 'Standing Calf Raise', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' },
    { name: 'Barbell Seated Calf Raise', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' },
    { name: 'Calf Press On The Leg Press Machine', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' },
    { name: 'Calf Press', pattern: 'Isolation', style: 'Isolation', primary: 'Legs' }
  ],
  core_iso: [
    { name: 'Cable Crunch', pattern: 'CoreFlexion', style: 'Isolation', primary: 'Core' },
    { name: 'Ab Crunch Machine', pattern: 'CoreFlexion', style: 'Isolation', primary: 'Core' },
    { name: 'Rope Crunch', pattern: 'CoreFlexion', style: 'Isolation', primary: 'Core' },
    { name: 'Standing Rope Crunch', pattern: 'CoreFlexion', style: 'Isolation', primary: 'Core' },
    { name: 'Cable Seated Crunch', pattern: 'CoreFlexion', style: 'Isolation', primary: 'Core' },
    { name: 'Cable Reverse Crunch', pattern: 'CoreFlexion', style: 'Isolation', primary: 'Core' }
  ],
  core_reverse: [
    { name: 'Cable Reverse Crunch', pattern: 'CoreFlexion', style: 'Isolation', primary: 'Core' }
  ],
  core_stability: [
    { name: 'Pallof Hold', pattern: 'Isolation', style: 'Isolation', primary: 'Core' },
    { name: 'Pallof Press', pattern: 'Isolation', style: 'Isolation', primary: 'Core' }
  ],
  core_rotation: [
    { name: 'Seated Barbell Twist', pattern: 'Isolation', style: 'Isolation', primary: 'Core' },
    { name: 'Cable Oblique Crunch', pattern: 'Isolation', style: 'Isolation', primary: 'Core' },
    { name: 'Russian Twist', pattern: 'Isolation', style: 'Isolation', primary: 'Core' }
  ]
};

function routeNormName(v) {
  return String(v || '').trim().toLowerCase();
}

const ROUTE_CANONICAL_MOVEMENT_FAMILY_OVERRIDES = [
  { canonicalFamily: 'horizontal_row', patterns: [/\bcable row\b/, /\bchest-supported row\b/, /\bdumbbell incline row\b/, /\bleverage high row\b/, /\bt-bar row with handle\b/, /\bbent over row\b/, /\bbent-over row\b/] },
  { canonicalFamily: 'vertical_pull', patterns: [/\blat pulldown\b/, /\bv-bar pulldown\b/, /\bclose-grip front lat pulldown\b/, /\bwide-grip lat pulldown\b/, /\bpull-up\b/, /\bpull up\b/, /\bchin-up\b/, /\bchin up\b/] },
  { canonicalFamily: 'calf_raise', patterns: [/\bcalf press\b/, /\bcalf press on the leg press machine\b/, /\bcalf raise\b/, /\bstanding calf raise\b/, /\bseated calf raise\b/, /\bbarbell seated calf raise\b/, /\bdumbbell seated one-leg calf raise\b/, /\bsmith machine calf raise\b/] },
  { canonicalFamily: 'squat_leg_press', patterns: [/\bhack squat\b/, /\bbarbell hack squat\b/, /\bleg press\b/, /\bsmith machine leg press\b/, /\bback squat\b/, /\bbarbell squat\b/, /\bfront squat\b/, /\bdumbbell squat\b/, /\blunge\b/, /\bsplit squat\b/] },
  { canonicalFamily: 'core_flexion', patterns: [/\bab crunch machine\b/, /\bcable crunch\b/, /\brope crunch\b/, /\breverse crunch\b/, /\bcable reverse crunch\b/, /\bkneeling cable crunch\b/] },
  { canonicalFamily: 'core_rotation_or_stability', patterns: [/\bpallof hold\b/, /\bpallof press\b/, /\bseated barbell twist\b/, /\bcable oblique crunch\b/, /\brussian twist\b/] },
  { canonicalFamily: 'hinge_posterior_chain', patterns: [/\bromanian deadlift\b/, /\bstiff-leg deadlift\b/, /\bgood morning\b/, /\bback extension\b/, /\bhyperextension\b/, /\bglute ham raise\b/, /\bleg curl\b/, /\bhamstring curl\b/] }
];

function routeListifyField(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  const text = String(value || '').trim().toLowerCase();
  return text ? [text] : [];
}

function routeDatabaseFamilyFallback(ex) {
  const primary = routeListifyField(ex?.primaryMuscles).concat(routeListifyField(ex?.primary));
  const secondary = routeListifyField(ex?.secondaryMuscles);
  const target = String(ex?.targetRegion || '').trim().toLowerCase();
  const sub = routeListifyField(ex?.subMuscleGroups).concat(routeListifyField(ex?.sub));
  const allPrimary = primary.join(' ');
  const allSecondary = secondary.join(' ');
  const allSub = sub.join(' ');
  if (/calf/.test(allPrimary) || /calf/.test(target)) return 'calf_raise';
  if (/biceps/.test(allPrimary)) return 'biceps_curl';
  if (/triceps/.test(allPrimary)) return 'triceps_extension_pushdown';
  if (/shoulder/.test(allPrimary) && /rear/.test(allSub)) return 'rear_delt_isolation';
  if (/shoulder/.test(allPrimary) && /(lateral|side)/.test(allSub)) return 'lateral_delt_isolation';
  if (/shoulder/.test(allPrimary)) return 'shoulder_press';
  if (/chest/.test(allPrimary) && /(fly|crossover|pec)/.test(String(ex?.category || '').toLowerCase())) return 'chest_fly';
  if (/chest/.test(allPrimary)) return 'chest_press';
  if (/back/.test(allPrimary) && /(lats|width|vertical)/.test(allSub)) return 'vertical_pull';
  if (/back/.test(allPrimary)) return 'horizontal_row';
  if (/abs|core/.test(allPrimary) || /abs|core/.test(target)) {
    if (/rotation|oblique/.test(allSub)) return 'core_rotation_or_stability';
    return 'core_flexion';
  }
  if (/glute|hamstring/.test(allPrimary) || /glute|hamstring/.test(allSecondary)) return 'hinge_posterior_chain';
  if (/quad|leg/.test(allPrimary) || /quad|leg/.test(target)) return 'squat_leg_press';
  return null;
}

function routeCanonicalFamilyOverride(name) {
  const n = routeNormName(name);
  if (/(seated leg curl|lying leg curl|hamstring curl|leg curl)/.test(n)) return 'hinge_posterior_chain';
  if (/(calf raise|calf press)/.test(n)) return 'calf_raise';
  if (/(pulldown|pull-up|pull up|chin-up|chin up)/.test(n)) return 'vertical_pull';
  if (/\brow\b/.test(n) && !/(pulldown|pull-up|pull up|chin-up|chin up)/.test(n)) return 'horizontal_row';
  if (/(squat|lunge|leg press|leg extension)/.test(n)) return 'squat_leg_press';
  for (const entry of ROUTE_CANONICAL_MOVEMENT_FAMILY_OVERRIDES) {
    if (entry.patterns.some((pattern) => pattern.test(n))) return entry.canonicalFamily;
  }
  return null;
}

function routeIsIsolation(ex) {
  return String(ex?.style || '').toLowerCase() === 'isolation';
}

function routeIsCompound(ex) {
  return String(ex?.style || '').toLowerCase() === 'compound';
}

function routeIsBicepsIsoName(name) {
  const n = routeNormName(name);
  return /(curl|preacher|hammer)/.test(n) && !/(leg curl|hamstring curl)/.test(n);
}

function routeBicepsBias(name) {
  const n = routeNormName(name);
  if (!n) return 'general';
  if (/(incline|bayesian|behind the body|behind-body)/.test(n)) return 'lengthened';
  if (/(preacher|machine preacher|concentration|cable curl|spider)/.test(n)) return 'shortened_mid';
  return 'general';
}

function routeIsTricepsIsoName(name) {
  const n = routeNormName(name);
  return /(triceps|pushdown|skull crusher)/.test(n) || (/\bextension\b/.test(n) && !/(leg extension)/.test(n));
}

function routeIsRearDeltName(name) {
  return /(rear delt|reverse fly|face pull|reverse pec deck)/.test(routeNormName(name));
}

function routeIsLateralRaiseName(name) {
  return /(lateral raise|side lateral)/.test(routeNormName(name));
}

function routeEquipmentBucketFromName(name) {
  const n = routeNormName(name);
  if (!n) return 'other';
  if (/(cable|pulley)/.test(n)) return 'cable';
  if (/(machine|leverage|smith)/.test(n)) return 'machine';
  if (/(barbell|ez bar)/.test(n)) return 'barbell';
  if (/(dumbbell|db )/.test(n)) return 'dumbbell';
  return 'other';
}

function routeIsHorizontalPressMain(ex) {
  if (!routeIsCompound(ex)) return false;
  const n = routeNormName(ex?.name);
  const p = String(ex?.pattern || '').toLowerCase();
  return p === 'horizontalpush' || /(bench press|chest press|incline press|decline press|dumbbell press|machine press)/.test(n);
}

function routeIsStapleChestMainName(name) {
  const n = routeNormName(name);
  if (!n) return false;
  const allowed = /(leverage decline chest press|machine bench press|leverage chest press|smith machine bench press|barbell bench press(?:\s*-\s*medium grip)?|bench press|incline dumbbell press|smith machine incline bench press|machine chest press|chest press|incline bench press|dumbbell bench press)/.test(n);
  const blocked = /(close[-\s]*grip|wide[-\s]*grip|guillotine|behind[-\s]*neck|to\s+skull\s+crusher|landmine|jammer)/.test(n);
  return allowed && !blocked;
}

function routeIsBenchLikePressName(name) {
  return /\bbench\b/.test(routeNormName(name));
}

function routeIsHeavyDeadliftName(name) {
  const n = routeNormName(name);
  return /(deadlift|romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(n) && !/(hip thrust|glute bridge)/.test(n);
}

function routeIsRdlName(name) {
  const n = routeNormName(name);
  return /(romanian deadlift|\brdl\b)/.test(n);
}

function routeIsStapleSquatName(name) {
  const n = routeNormName(name);
  return /(hack squat|leg press|front squat|barbell full squat|back squat|smith squat|squat)/.test(n)
    && !/(kneeling|overhead|frankenstein|chair|plie|side split|one leg|single leg|sissy|box squat|speed|split squat|lunge|step up)/.test(n);
}

function routeIsShoulderPressName(name) {
  const n = routeNormName(name);
  return /(overhead press|shoulder press|military press|seated dumbbell press|dumbbell shoulder press)/.test(n)
    && !/(one arm|single arm|behind neck|jammer|landmine linear)/.test(n);
}

function routeIsCableShoulderPressName(name) {
  const n = routeNormName(name);
  return /(seated cable shoulder press|cable shoulder press)/.test(n);
}

function routeIsVerticalPullName(name) {
  const n = routeNormName(name);
  return /(lat pulldown|pulldown|pull-up|pull up|chin-up|chin up)/.test(n)
    && !/(gironda|sternum|side to side|rocky|one arm|single arm|behind neck)/.test(n);
}

function routeIsRowName(name) {
  const n = routeNormName(name);
  return /\brow\b/.test(n) && !/(rear delt row)/.test(n);
}

function routeIsChestIsoName(name) {
  const n = routeNormName(name);
  return /(fly|crossover|pec deck)/.test(n) && !/(rear delt|reverse fly|face pull|reverse pec deck)/.test(n);
}

function routeIsHamCurlName(name) {
  const n = routeNormName(name);
  return /\b(seated|lying)\b.*\bleg\s*curls?\b/.test(n) || /\b(seated|lying)\b.*\bhamstring\s*curls?\b/.test(n);
}

function routeIsCalvesName(name) {
  return /\bcalf\b/.test(routeNormName(name));
}

function routeIsCoreName(name) {
  return /(crunch|rollout|pallof|wood chop|twist|\bab\b)/.test(routeNormName(name));
}

function routeCoreFlexionSubrole(name) {
  const n = routeNormName(name);
  if (/(cable reverse crunch|reverse crunch)/.test(n)) return 'reverse_crunch_lower_abs';
  if (/(3\/4 sit-up|3\/4 sit up|decline sit-up|decline sit up|sit-up|sit up)/.test(n)) return 'situp_variation';
  if (/(ab crunch machine|rope crunch|cable crunch|standing rope crunch|cable seated crunch|\bcrunch\b)/.test(n)) return 'upper_abs_crunch';
  return 'other_core_flexion';
}

function routeCoreRotationStabilitySubrole(name) {
  const n = routeNormName(name);
  if (/(pallof hold|pallof press)/.test(n)) return 'anti_rotation_stability';
  if (/(seated barbell twist|cable oblique crunch|russian twist)/.test(n)) return 'rotation_oblique';
  return '';
}

function routeGetCanonicalMovementFamily(ex) {
  const name = routeNormName(ex?.name);
  const override = routeCanonicalFamilyOverride(name);
  if (override) return override;
  if (routeIsCompound(ex) && routeIsHorizontalPressMain(ex)) return 'chest_press';
  if (routeIsIsolation(ex) && routeIsChestIsoName(name)) return 'chest_fly';
  if (routeIsCompound(ex) && routeIsShoulderPressName(name)) return 'shoulder_press';
  if (routeIsIsolation(ex) && routeIsLateralRaiseName(name)) return 'lateral_delt_isolation';
  if (routeIsIsolation(ex) && routeIsRearDeltName(name)) return 'rear_delt_isolation';
  if (routeIsCompound(ex) && routeIsRowName(name)) return 'horizontal_row';
  if (routeIsCompound(ex) && routeIsVerticalPullName(name)) return 'vertical_pull';
  if (routeIsIsolation(ex) && routeIsBicepsIsoName(name)) return 'biceps_curl';
  if (routeIsIsolation(ex) && routeIsTricepsIsoName(name)) return 'triceps_extension_pushdown';
  if (routeIsIsolation(ex) && routeIsCalvesName(name)) return 'calf_raise';
  if (routeIsIsolation(ex) && routeIsCoreName(name)) {
    if (/(pallof|twist|wood chop|oblique)/.test(name)) return 'core_rotation_or_stability';
    return 'core_flexion';
  }
  if (routeIsCompound(ex) && (routeIsStapleSquatName(name) || routeIsLungeName(name) || /leg press|leg extension/.test(name))) return 'squat_leg_press';
  if ((routeIsCompound(ex) && routeIsHingeName(name)) || routeIsIsolation(ex) && routeIsHamCurlName(name)) return 'hinge_posterior_chain';
  return routeDatabaseFamilyFallback(ex) || 'general';
}

function routeRearDeltWeeklyDayCap(priorityGroups = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((x) => String(x || '').toLowerCase()));
  const shouldersPriority = priorities.has('shoulders');
  const backPriority = priorities.has('back');
  if (shouldersPriority && backPriority) return 4;
  if (shouldersPriority) return 3;
  return 2;
}

function routeRearDeltHardSetCap() {
  return 12;
}

function routeCollectRearDeltWeekState(week, priorityGroups = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((x) => String(x || '').toLowerCase()));
  const shouldersPriority = priorities.has('shoulders');
  const backPriority = priorities.has('back');
  const chestPriority = priorities.has('chest');
  const armsPriority = priorities.has('arms') || priorities.has('biceps') || priorities.has('triceps');
  const days = Array.isArray(week?.days) ? week.days : [];
  const byDay = new Map();
  let totalSets = 0;
  for (const day of days) {
    const dayType = String(day?.dayType || '').toLowerCase();
    const dayKey = `${Number(week?.weekIndex || week?.index || 0) || 0}:${dayType}`;
    const entries = [];
    (Array.isArray(day?.exercises) ? day.exercises : []).forEach((exercise, exerciseIndex) => {
      if (!(routeIsIsolation(exercise) && routeIsRearDeltName(exercise?.name))) return;
      const sets = Math.max(0, Number(exercise?.sets || 0) || 0);
      totalSets += sets;
      entries.push({
        exercise,
        exerciseIndex,
        sets,
        day,
        dayKey,
        dayType
      });
    });
    if (!entries.length) continue;
    byDay.set(dayKey, {
      day,
      dayKey,
      dayType,
      entries,
      count: entries.length,
      sets: entries.reduce((sum, entry) => sum + entry.sets, 0)
    });
  }
  return {
    week: Number(week?.weekIndex || week?.index || 0) || 0,
    shouldersPriority,
    backPriority,
    chestPriority,
    armsPriority,
    totalSets,
    hardSetCap: routeRearDeltHardSetCap(),
    dayCount: byDay.size,
    dayCap: routeRearDeltWeeklyDayCap(priorityGroups),
    minExposureDays: shouldersPriority ? 2 : (backPriority ? 1 : 0),
    byDay,
    entries: [...byDay.values()].flatMap((dayInfo) => dayInfo.entries.map((entry) => ({
      ...entry,
      dayRearDeltCount: dayInfo.count,
      dayRearDeltSets: dayInfo.sets
    })))
  };
}

function routeIsLungeName(name) {
  const n = routeNormName(name);
  return /(lunge|split squat|step up)/.test(n) && !/(side|lateral)/.test(n);
}

function routeIsHingeName(name) {
  const n = routeNormName(name);
  return /(deadlift|romanian deadlift|\brdl\b|hip thrust|glute bridge|good morning|back extension|hyperextension)/.test(n) && !/(axle|log|yoke|stone|sandbag|single)/.test(n);
}

function routeIsLengthenedHingeName(name) {
  const n = routeNormName(name);
  return /(romanian deadlift|\brdl\b|stiff[-\s]*leg|good morning|back extension|hyperextension)/.test(n)
    && !/(hip thrust|glute bridge|axle|log|yoke|stone|sandbag|single)/.test(n);
}

function routeIsNoveltyName(name) {
  return /(frankenstein|jammer|rocky|side to side|with a twist|competition|technique|speed|tempo|paused?|dynamic effort|chair squat|plie)/.test(routeNormName(name));
}

function routeLowerMainFamily(name) {
  const n = routeNormName(name);
  if (!n) return '';
  if (/hack squat/.test(n)) return 'hack_squat';
  if (/leg press/.test(n)) return 'leg_press';
  if (/front squat/.test(n)) return 'front_squat';
  if (/smith machine squat|barbell full squat|back squat|\bsquat\b/.test(n)) return 'squat';
  if (/split squat|lunge|step up/.test(n)) return 'split_lunge';
  return '';
}

function routeCanonicalizeExercise(ex, list) {
  const n = routeNormName(ex?.name);
  if (!n) return ex;
  if (/\bguillotine\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('chest_main', list));
  }
  if (/\b(wide[-\s]*grip|barbell)\s+bench press\b/.test(n) || /\bbarbell bench press\s*-\s*medium grip\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('chest_main', list));
  }
  if (/\b(close[-\s]*grip|wide[-\s]*grip)\b.*\bbench press\b/.test(n) || /\bdecline\b.*\bbench press\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('chest_main', list));
  }
  if (/standing cable chest press/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('chest_secondary_press', list));
  }
  if (/seated bent[-\s]*over rear delt raise|bent over dumbbell rear delt raise with head on bench/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('rear_iso', list));
  }
  if (/standing inner[-\s]*biceps curl/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('biceps_iso', list));
  }
  if (/split squat with dumbbells/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('lunge_main', list));
  }
  if (/\bdumbbell\s+squat\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('squat_main', list));
  }
  if (/\bbench press\s*\((competition|technique|volume)\)/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('chest_main', list));
  }
  if (/\bleverage shoulder press\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('shoulder_main', list));
  }
  if (/\balternating\b.*\bshoulder press\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('shoulder_main', list));
  }
  if (routeIsCableShoulderPressName(n)) {
    return routeApplyReplacement(ex, routePickReplacementMatching('shoulder_main', list, (spec) => !routeIsCableShoulderPressName(spec?.name)));
  }
  if (/(single|one)[-\s]*arm\b.*(crossover|fly)/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('chest_iso', list));
  }
  if (/(single|one)[-\s]*arm\b.*(side lateral|lateral raise)/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('lateral_iso', list));
  }
  if (/side laterals?\s*to\s*front raise/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('lateral_iso', list));
  }
  if (/bent over low[-\s]*pulley side lateral/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('lateral_iso', list));
  }
  if (/\bleverage\b.*\b(row|iso row|high row)\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('row_main', list));
  }
  if (/reverse flyes with external rotation/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('rear_iso', list));
  }
  if (/(concentration barbell curl|overhead cable curl|high cable curls)/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('biceps_iso', list));
  }
  if (/(one[-\s]*arm.*triceps extension|low[-\s]*pulley.*triceps extension|tricep extension -pronated grip|cable incline triceps extension)/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('triceps_iso', list));
  }
  if (/full range[-\s]*of[-\s]*motion lat pulldown/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('vertical_pull', list));
  }
  if (/\bleverage\b.*\bdeadlift\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('hinge_main', list));
  }
  if (/\bsingle[-\s]*leg\b.*\bsplit squat\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('lunge_main', list));
  }
  if (/\bsingle[-\s]*leg\b.*\bleg extension\b/.test(n)) {
    return routeApplyReplacement(ex, routePickReplacement('leg_iso', list));
  }
  return ex;
}

function routeIsBannedExerciseName(name) {
  const norm = routeNormName(name);
  if (!norm) return false;
  return ROUTE_BANNED_NAME_PATTERNS.some((rx) => rx.test(norm)) || routeIsNoveltyName(norm);
}

function routePickSafeReplacementForDay(dayType, current, dayExercises, keys = [], acceptFn = null) {
  const type = String(dayType || '').toLowerCase();
  const others = Array.isArray(dayExercises) ? dayExercises : [];
  for (const key of Array.isArray(keys) ? keys.filter(Boolean) : []) {
    const spec = routePickReplacementMatching(key, others, (candidate) => {
      if (!candidate?.name || routeIsBannedExerciseName(candidate?.name)) return false;
      const replaced = routeApplyReplacement(current, candidate);
      if (!routeFitsDayType(replaced, type)) return false;
      if (typeof acceptFn === 'function' && !acceptFn(candidate, replaced)) return false;
      return true;
    });
    if (spec?.name && !routeIsBannedExerciseName(spec?.name)) return spec;
  }
  return null;
}

function routePickBannedExerciseReplacement(dayType, current, dayExercises, idx = -1) {
  const type = String(dayType || '').toLowerCase();
  const exercise = current && typeof current === 'object' ? current : {};
  const name = routeNormName(exercise?.name);
  const pattern = routeNormName(exercise?.pattern);
  const isLowerDay = type === 'legs' || type === 'lower';
  if (type === 'pull') {
    return routePickSafeReplacementForDay(type, exercise, dayExercises,
      idx <= 1 ? (idx === 0 ? ['vertical_pull', 'row_main'] : ['row_main', 'vertical_pull']) : ['biceps_iso', 'rear_iso', 'core_iso']);
  }
  if (type === 'deltsarms') {
    return routePickSafeReplacementForDay(type, exercise, dayExercises,
      idx === 0 ? ['shoulder_main', 'lateral_iso']
        : idx === 1 ? ['lateral_iso', 'rear_iso']
          : idx === 2 ? ['rear_iso', 'lateral_iso']
            : idx === 3 ? ['biceps_iso', 'rear_iso']
              : ['triceps_iso', 'lateral_iso']);
  }
  if (isLowerDay) {
    const isLunge = pattern === 'lunge' || routeIsLungeName(name) || /\bside\s*split\s*squat\b/.test(name);
    const isSquat = pattern === 'squat' || routeIsStapleSquatName(name) || /leg press/.test(name);
    const isHinge = pattern === 'hinge' || routeIsHingeName(name);
    const isIso = routeIsIsolation(exercise) || pattern === 'isolation' || routeIsHamCurlName(name) || /leg extension/.test(name);
    if (isLunge) {
      return routePickSafeReplacementForDay(type, exercise, dayExercises, ['lunge_main', 'squat_main', 'leg_iso'],
        (candidate) => routeIsLungeName(candidate?.name) || routeIsStapleSquatName(candidate?.name) || /leg extension/.test(routeNormName(candidate?.name)));
    }
    if (isSquat) return routePickSafeReplacementForDay(type, exercise, dayExercises, ['squat_main', 'lunge_main', 'leg_iso']);
    if (isHinge) {
      return routePickSafeReplacementForDay(type, exercise, dayExercises, ['hinge_lengthened', 'hinge_alt', 'ham_iso'],
        (candidate) => routeIsHingeName(candidate?.name) || routeIsHamCurlName(candidate?.name));
    }
    if (isIso) return routePickSafeReplacementForDay(type, exercise, dayExercises, ['leg_iso', 'ham_iso', 'calves_iso']);
    return routePickSafeReplacementForDay(type, exercise, dayExercises, ['squat_main', 'lunge_main', 'leg_iso', 'hinge_alt']);
  }
  return routePickSafeReplacementForDay(type, exercise, dayExercises,
    idx <= 1 ? (idx === 0 ? ['chest_main', 'row_main'] : ['shoulder_main', 'chest_secondary_press']) : ['chest_iso', 'lateral_iso', 'rear_iso', 'core_iso', 'row_main']);
}

function routeScrubBannedExercisesFromPlan(planObj) {
  if (!planObj || String(planObj?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return planObj;
  const absPriority = Array.isArray(planObj?.meta?.priorityGroups)
    && planObj.meta.priorityGroups.some((value) => ['abs', 'core'].includes(String(value || '').toLowerCase()));
  for (const week of Array.isArray(planObj?.weeks) ? planObj.weeks : []) {
    for (const day of Array.isArray(week?.days) ? week.days : []) {
      const dayType = String(day?.dayType || '').toLowerCase();
      let list = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
      if (!list.length) continue;
      let changed = false;
      for (let i = 0; i < list.length; i += 1) {
        if (!routeIsBannedExerciseName(list[i]?.name)) continue;
        const replacement = routePickBannedExerciseReplacement(dayType, list[i], list, i);
        if (!replacement?.name) continue;
        list[i] = routeCanonicalizeExercise(routeApplyReplacement(list[i], replacement), list);
        changed = true;
      }
      if (!changed) continue;
      list = routeFinalizeBodybuildingDay(dayType, list, { absPriority });
      list = dayType === 'deltsarms' ? routeDedupeFinalDeltsArmsDay(list, {}) : routeDedupeFinalDay(dayType, list);
      list = routeFinalizeBodybuildingDay(dayType, list, { absPriority });
      day.exercises = list;
    }
  }
  return planObj;
}

function routeDefaultReplacementKey(dayType, idx) {
  const type = String(dayType || '').toLowerCase();
  const i = Math.max(0, Number(idx) || 0);
  if (type === 'push') {
    if (i === 0) return 'chest_main';
    if (i === 1) return 'shoulder_main';
    if (i === 2) return 'chest_iso';
    if (i === 3) return 'lateral_iso';
    if (i === 4) return 'triceps_iso';
    return 'core_iso';
  }
  if (type === 'pull') {
    if (i === 0) return 'vertical_pull';
    if (i === 1) return 'row_main';
    if (i === 2) return 'rear_iso';
    if (i === 3) return 'biceps_iso';
    return 'core_iso';
  }
  if (type === 'legs') {
    if (i === 0) return 'squat_main';
    if (i === 1) return 'hinge_lengthened';
    if (i === 2) return 'lunge_main';
    if (i === 3) return 'ham_iso';
    if (i === 4) return 'calves_iso';
    return 'core_iso';
  }
  if (type === 'lower') {
    if (i === 0) return 'squat_main';
    if (i === 1) return 'hinge_lengthened';
    if (i === 2) return 'ham_iso';
    if (i === 3) return 'calves_iso';
    return 'core_iso';
  }
  if (type === 'deltsarms') {
    if (i === 0) return 'shoulder_main';
    if (i === 1) return 'lateral_iso';
    if (i === 2) return 'rear_iso';
    if (i === 3) return 'biceps_iso';
    if (i === 4) return 'triceps_iso';
    return 'core_iso';
  }
  if (type === 'upper') {
    if (i === 0) return 'chest_main';
    if (i === 1) return 'row_main';
    if (i === 2) return 'vertical_pull';
    if (i === 3) return 'chest_iso';
    if (i === 4) return 'lateral_iso';
    return 'triceps_iso';
  }
  if (type === 'upperfocus') {
    if (i === 0) return 'chest_main';
    if (i === 1) return 'row_main';
    if (i === 2) return 'vertical_pull';
    if (i === 3) return 'chest_iso';
    if (i === 4) return 'lateral_iso';
    return 'biceps_iso';
  }
  if (type === 'lowerfocus') {
    if (i === 0) return 'squat_main';
    if (i === 1) return 'hinge_lengthened';
    if (i === 2) return 'ham_iso';
    if (i === 3) return 'leg_iso';
    if (i === 4) return 'calves_iso';
    return 'glute_iso';
  }
  if (type === 'fullbodya') {
    if (i === 0) return 'chest_main';
    if (i === 1) return 'row_main';
    if (i === 2) return 'squat_main';
    if (i === 3) return 'lateral_iso';
    if (i === 4) return 'biceps_iso';
    return 'ham_iso';
  }
  if (type === 'fullbodyb') {
    if (i === 0) return 'vertical_pull';
    if (i === 1) return 'hinge_lengthened';
    if (i === 2) return 'chest_main';
    if (i === 3) return 'ham_iso';
    if (i === 4) return 'calves_iso';
    return 'biceps_iso';
  }
  return 'core_iso';
}

function routeFitsDayType(ex, dayType) {
  const n = routeNormName(ex?.name);
  const type = String(dayType || '').toLowerCase();
  const isCompound = routeIsCompound(ex);
  const isIso = routeIsIsolation(ex);
  if (type === 'push') {
    if (isCompound) return routeIsHorizontalPressMain(ex) || routeIsShoulderPressName(n);
    if (!isIso) return false;
    return routeIsChestIsoName(n) || routeIsLateralRaiseName(n) || routeIsRearDeltName(n) || routeIsTricepsIsoName(n) || routeIsCoreName(n);
  }
  if (type === 'pull') {
    if (isCompound) return routeIsVerticalPullName(n) || routeIsRowName(n);
    if (!isIso) return false;
    return routeIsRearDeltName(n) || routeIsBicepsIsoName(n) || routeIsCoreName(n);
  }
  if (type === 'legs' || type === 'lower') {
    if (isCompound) return routeIsStapleSquatName(n) || routeIsHingeName(n) || routeIsLungeName(n);
    if (!isIso) return false;
    return routeIsHamCurlName(n) || /leg extension/.test(n) || routeIsCalvesName(n) || routeIsCoreName(n);
  }
  if (type === 'deltsarms') {
    if (isCompound) return routeIsShoulderPressName(n);
    if (!isIso) return false;
    return routeIsLateralRaiseName(n) || routeIsRearDeltName(n) || routeIsBicepsIsoName(n) || routeIsTricepsIsoName(n) || routeIsCoreName(n);
  }
  if (type === 'upper') {
    if (isCompound) return routeIsHorizontalPressMain(ex) || routeIsVerticalPullName(n) || routeIsRowName(n) || routeIsShoulderPressName(n);
    if (!isIso) return false;
    return routeIsChestIsoName(n) || routeIsLateralRaiseName(n) || routeIsRearDeltName(n) || routeIsBicepsIsoName(n) || routeIsTricepsIsoName(n) || routeIsCoreName(n);
  }
  return true;
}

function routeDedupeIsolationFamilies(dayType, list) {
  const out = Array.isArray(list) ? list.slice() : [];
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    const seenFamilies = new Set();
    for (let i = 0; i < out.length; i += 1) {
      if (!routeIsIsolation(out[i])) continue;
      const fam = routeGetCanonicalMovementFamily(out[i]);
      if (!fam) continue;
      if (!seenFamilies.has(fam)) {
        seenFamilies.add(fam);
        continue;
      }
      const candidateKeys = [];
      if (fam === 'lateral_delt_isolation') candidateKeys.push('rear_iso', 'triceps_iso', 'core_iso');
      else if (fam === 'rear_delt_isolation') candidateKeys.push('lateral_iso', 'triceps_iso', 'core_iso');
      else if (fam === 'chest_fly') candidateKeys.push('triceps_iso', 'lateral_iso', 'core_iso');
      else if (fam === 'biceps_curl') {
        if (dayType === 'deltsarms') candidateKeys.push('triceps_iso', 'rear_iso', 'core_iso');
        else if (dayType === 'pull') candidateKeys.push('rear_iso', 'row_main', 'core_iso');
        else candidateKeys.push('rear_iso', 'core_iso');
      } else if (fam === 'triceps_extension_pushdown') {
        if (dayType === 'deltsarms') candidateKeys.push('biceps_iso', 'rear_iso', 'core_iso');
        else if (dayType === 'push') candidateKeys.push('lateral_iso', 'chest_iso', 'core_iso');
        else if (dayType === 'upper') candidateKeys.push('chest_secondary_press', 'lateral_iso', 'core_iso');
        else candidateKeys.push('lateral_iso', 'core_iso');
      } else if (fam === 'core_flexion' || fam === 'core_rotation_or_stability') {
        candidateKeys.push(routeDefaultReplacementKey(dayType, i), 'core_iso');
      }
      candidateKeys.push(routeDefaultReplacementKey(dayType, i), 'core_iso');
      let replaced = false;
      for (const key of candidateKeys) {
        const next = routeApplyReplacement(out[i], routePickReplacement(key, out));
        const nextFam = routeIsIsolation(next) ? routeGetCanonicalMovementFamily(next) : null;
        if (nextFam && seenFamilies.has(nextFam)) continue;
        out[i] = next;
        if (nextFam) seenFamilies.add(nextFam);
        replaced = true;
        changed = true;
        break;
      }
      if (!replaced) {
        out[i] = routeApplyReplacement(out[i], routePickReplacement('core_iso', out));
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

function routeDiversifyNearDuplicateMovements(dayType, list, shouldersPriority) {
  const out = Array.isArray(list) ? list.slice() : [];
  if (!out.length) return out;
  const type = String(dayType || '').toLowerCase();
  const shoulderPressIdx = out
    .map((ex, idx) => (routeIsCompound(ex) && routeIsShoulderPressName(ex?.name) ? idx : -1))
    .filter((idx) => idx >= 0);
  if (shoulderPressIdx.length <= 1) return out;

  const hasIso = (fn) => out.some((ex) => routeIsIsolation(ex) && fn(ex?.name));
  const canUseIso = type === 'push' || type === 'upper' || type === 'deltsarms';
  const firstIdx = shoulderPressIdx[0];
  const firstName = routeNormName(out[firstIdx]?.name);
  const firstBucket = routeEquipmentBucketFromName(firstName);

  for (let k = 1; k < shoulderPressIdx.length; k += 1) {
    const idx = shoulderPressIdx[k];
    const current = out[idx];
    let replaced = false;

    // Priority shoulders can keep a 2nd shoulder slot if resistance profile is meaningfully different.
    if (shouldersPriority) {
      const profiledShoulder = routePickReplacementMatching('shoulder_main', out, (spec) => {
        const n = routeNormName(spec?.name);
        if (!routeIsShoulderPressName(n)) return false;
        const bucket = routeEquipmentBucketFromName(n);
        if (n === firstName) return false;
        if (bucket === firstBucket) return false;
        return bucket === 'machine' || bucket === 'cable';
      });
      if (profiledShoulder) {
        out[idx] = routeApplyReplacement(current, profiledShoulder);
        out[idx].sets = Math.max(2, Math.min(3, Number(out[idx]?.sets) || 2));
        replaced = true;
      }
    }

    if (!replaced && canUseIso) {
      const preferLateral = !hasIso(routeIsLateralRaiseName);
      const isoKey = preferLateral ? 'lateral_iso' : 'rear_iso';
      const iso = routePickReplacement(isoKey, out) || routePickReplacement(preferLateral ? 'rear_iso' : 'lateral_iso', out);
      if (iso) {
        out[idx] = routeApplyReplacement(current, iso);
        out[idx].sets = Math.max(2, Math.min(3, Number(out[idx]?.sets) || 2));
        replaced = true;
      }
    }

    if (!replaced) {
      const fallbackKey = type === 'pull'
        ? 'row_main'
        : type === 'legs' || type === 'lower'
          ? 'ham_iso'
          : 'core_iso';
      out[idx] = routeApplyReplacement(current, routePickReplacement(fallbackKey, out));
      out[idx].sets = Math.max(2, Math.min(3, Number(out[idx]?.sets) || 2));
    }
  }

  return out;
}

function routePickReplacement(key, dayExercises) {
  const list = Array.isArray(ROUTE_REPLACEMENT_MAP[key]) ? ROUTE_REPLACEMENT_MAP[key] : [];
  const used = new Set((Array.isArray(dayExercises) ? dayExercises : []).map((ex) => routeNormName(ex?.name)));
  for (const spec of list) {
    if (!spec?.name) continue;
    if (used.has(routeNormName(spec.name))) continue;
    return spec;
  }
  return list[0] || null;
}

function routePickReplacementMatching(key, dayExercises, acceptFn) {
  const list = Array.isArray(ROUTE_REPLACEMENT_MAP[key]) ? ROUTE_REPLACEMENT_MAP[key] : [];
  const used = new Set((Array.isArray(dayExercises) ? dayExercises : []).map((ex) => routeNormName(ex?.name)));
  for (const spec of list) {
    if (!spec?.name) continue;
    if (used.has(routeNormName(spec.name))) continue;
    if (typeof acceptFn === 'function' && !acceptFn(spec)) continue;
    return spec;
  }
  for (const spec of list) {
    if (!spec?.name) continue;
    if (typeof acceptFn === 'function' && !acceptFn(spec)) continue;
    return spec;
  }
  return list[0] || null;
}

function routePickUniqueReplacementMatching(key, dayExercises, acceptFn) {
  const list = Array.isArray(ROUTE_REPLACEMENT_MAP[key]) ? ROUTE_REPLACEMENT_MAP[key] : [];
  const used = new Set((Array.isArray(dayExercises) ? dayExercises : []).map((ex) => routeNormName(ex?.name)));
  for (const spec of list) {
    if (!spec?.name) continue;
    if (used.has(routeNormName(spec.name))) continue;
    if (typeof acceptFn === 'function' && !acceptFn(spec)) continue;
    return spec;
  }
  return null;
}

function routePickChestPressRedundancyReplacement(dayExercises, {
  chestPriority = false,
  armsPriority = false,
  shouldersPriority = false,
  calvesPriority = false,
  chestIsoPresent = false,
  calfExposureUnderTarget = false
} = {}) {
  const attempts = [];
  if (chestPriority && !chestIsoPresent) attempts.push(['chest_iso', (spec) => !routeIsHorizontalPressMain(spec)]);
  if (armsPriority) attempts.push(['triceps_iso', (spec) => !routeIsHorizontalPressMain(spec)]);
  if (shouldersPriority) {
    attempts.push(['lateral_iso', (spec) => !routeIsHorizontalPressMain(spec)]);
    attempts.push(['rear_iso', (spec) => !routeIsHorizontalPressMain(spec)]);
  }
  if (calvesPriority && calfExposureUnderTarget) attempts.push(['calves_iso', (spec) => !routeIsHorizontalPressMain(spec)]);
  if (chestPriority) attempts.push(['chest_iso', (spec) => !routeIsHorizontalPressMain(spec)]);
  attempts.push(['core_iso', (spec) => !routeIsHorizontalPressMain(spec)]);
  attempts.push(['row_main', (spec) => !routeIsHorizontalPressMain(spec)]);
  for (const [key, accept] of attempts) {
    const picked = routePickUniqueReplacementMatching(key, dayExercises, accept);
    if (picked) return picked;
  }
  return null;
}

function routeEnforceChestPressCompoundCap(dayType, exercises, {
  chestPriority = false,
  armsPriority = false,
  shouldersPriority = false,
  calvesPriority = false
} = {}) {
  const type = String(dayType || '').toLowerCase();
  if (type !== 'push' && type !== 'upper') return Array.isArray(exercises) ? exercises.slice() : [];
  const list = Array.isArray(exercises) ? exercises.slice() : [];
  const allowedChestPressCompounds = chestPriority ? 2 : 1;
  let safety = 0;
  while (safety < 6) {
    safety += 1;
    const pressIdx = list.map((ex, idx) => (routeIsHorizontalPressMain(ex) ? idx : -1)).filter((x) => x >= 0);
    if (pressIdx.length <= allowedChestPressCompounds) break;
    const ranked = pressIdx
      .map((idx) => {
        const n = routeNormName(list[idx]?.name);
        let keepScore = 0;
        if (idx === 0 && routeIsStapleChestMainName(list[idx]?.name)) keepScore += 100;
        if (routeIsStapleChestMainName(list[idx]?.name)) keepScore += 40;
        if (!/(close[-\s]*grip|dip)/.test(n)) keepScore += 10;
        keepScore -= idx;
        return { idx, keepScore };
      })
      .sort((a, b) => b.keepScore - a.keepScore || a.idx - b.idx);
    const keep = new Set(ranked.slice(0, allowedChestPressCompounds).map((entry) => entry.idx));
    let changed = false;
    for (const idx of pressIdx.filter((pressIndex) => !keep.has(pressIndex)).sort((a, b) => b - a)) {
      const others = list.filter((_, exIdx) => exIdx !== idx);
      const chestIsoPresent = others.some((ex) => routeIsChestIsoName(ex?.name));
      const calfExposureUnderTarget = calvesPriority && !others.some((ex) => routeIsCalvesName(ex?.name));
      const replacement = routePickChestPressRedundancyReplacement(others, {
        chestPriority,
        armsPriority,
        shouldersPriority,
        calvesPriority,
        chestIsoPresent,
        calfExposureUnderTarget
      });
      if (!replacement || routeIsHorizontalPressMain(replacement)) continue;
      list[idx] = routeApplyReplacement(list[idx], replacement);
      changed = true;
    }
    if (!changed) break;
  }
  return list;
}

function routeCanonicalFamilyCap(dayType, family, priorityGroups = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').toLowerCase()));
  const type = String(dayType || '').toLowerCase();
  if (family === 'chest_press') return priorities.has('chest') ? 2 : 1;
  if (family === 'shoulder_press') return priorities.has('shoulders') ? 2 : 1;
  if (family === 'horizontal_row') return type === 'pull' || (type === 'upper' && priorities.has('back')) ? 2 : 1;
  if (family === 'vertical_pull') return (type === 'pull' && priorities.has('back')) ? 2 : 1;
  if (family === 'squat_leg_press') return (type === 'legs' || type === 'lower') ? 2 : 1;
  if (family === 'hinge_posterior_chain') return (type === 'legs' || type === 'lower') ? 2 : 1;
  if (family === 'calf_raise') return priorities.has('calves') ? 2 : 1;
  if (family === 'biceps_curl') return priorities.has('arms') ? 2 : 1;
  if (family === 'triceps_extension_pushdown') return priorities.has('arms') ? 2 : 1;
  if (family === 'core_flexion' || family === 'core_rotation_or_stability') return priorities.has('abs') || priorities.has('core') ? 2 : 1;
  if (family === 'lateral_delt_isolation') return priorities.has('shoulders') ? 2 : 1;
  if (family === 'rear_delt_isolation') return priorities.has('shoulders') || priorities.has('back') ? 2 : 1;
  return 1;
}

function routePickCanonicalFamilyReplacement(dayType, current, dayExercises, familyToAvoid, priorityGroups = []) {
  const type = String(dayType || '').toLowerCase();
  const others = Array.isArray(dayExercises) ? dayExercises : [];
  const keys = routeReplacementKeysForExercise(type, current, 0);
  const fallbackKeys = type === 'push'
    ? ['triceps_iso', 'lateral_iso', 'rear_iso', 'chest_iso', 'core_iso']
    : type === 'pull'
      ? ['biceps_iso', 'rear_iso', 'vertical_pull', 'row_main', 'core_iso']
      : type === 'legs' || type === 'lower'
        ? ['ham_iso', 'leg_iso', 'calves_iso', 'core_iso', 'hinge_alt']
        : type === 'upper'
          ? ['row_main', 'vertical_pull', 'chest_iso', 'biceps_iso', 'triceps_iso', 'core_iso']
          : ['core_iso', 'rear_iso', 'lateral_iso'];
  const attempts = [...new Set([...keys, ...fallbackKeys])];
  for (const key of attempts) {
    const spec = routePickReplacementMatching(key, others, (candidate) => {
      if (!routeFitsDayType(routeApplyReplacement(current, candidate), type)) return false;
      const candidateFamily = routeGetCanonicalMovementFamily(candidate);
      if (candidateFamily === familyToAvoid) return false;
      const cap = routeCanonicalFamilyCap(type, candidateFamily, priorityGroups);
      const existing = others.filter((ex) => routeGetCanonicalMovementFamily(ex) === candidateFamily).length;
      if (existing >= cap) return false;
      return true;
    });
    if (spec) return spec;
  }
  return null;
}

function routeCanonicalCleanupSkipReason(reason) {
  return String(reason || 'no_safe_replacement_found');
}

function routeShouldEmitCleanupDiagnostic(family) {
  return family === 'horizontal_row' || family === 'squat_leg_press';
}

function routeCanonicalFamilyAllowedCount(dayType, family, priorityGroups = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').toLowerCase()));
  const type = String(dayType || '').toLowerCase();
  if (family === 'horizontal_row') {
    return (type === 'pull' || (type === 'upper' && priorities.has('back'))) ? 2 : 1;
  }
  if (family === 'squat_leg_press') {
    return 1;
  }
  if (family === 'shoulder_press') return 1;
  return 1;
}

function routeCanonicalCleanupWarningThreshold(dayType, family, priorityGroups = []) {
  if (family === 'shoulder_press') return 2;
  return 2;
}

function routeCanonicalCleanupTriggerThreshold(dayType, family, priorityGroups = []) {
  if (family === 'shoulder_press') return 2;
  return 3;
}

function routeCanonicalCleanupLoopThreshold(dayType, family, priorityGroups = []) {
  if (family === 'shoulder_press') return 1;
  return 2;
}

function routeCanonicalCleanupFamilyCount(list, family) {
  return routeCountCanonicalFamily(list, family);
}

function routeCanonicalCleanupExerciseNames(list) {
  return (Array.isArray(list) ? list : []).map((ex) => String(ex?.name || '').trim()).filter(Boolean);
}

function routeCanonicalCleanupDiagnosticKey({ week = null, day = null, dayType = '', family = '', cleanupPhase = '' } = {}) {
  return [
    String(week ?? ''),
    String(day || ''),
    String(dayType || '').toLowerCase(),
    String(family || '').toLowerCase(),
    String(cleanupPhase || '').toLowerCase()
  ].join('|');
}

function routeBuildCanonicalCleanupDiagnostic(dayType, family, list, entries, {
  combo = [],
  week = null,
  day = null,
  cleanupPhase = '',
  priorityGroups = []
} = {}) {
  const beforeExercises = routeCanonicalCleanupExerciseNames(list);
  const beforeCount = Array.isArray(entries) ? entries.length : routeCanonicalCleanupFamilyCount(list, family);
  const warningThresholdUsed = routeCanonicalCleanupWarningThreshold(dayType, family, priorityGroups);
  const triggerThresholdUsed = routeCanonicalCleanupTriggerThreshold(dayType, family, priorityGroups);
  const keepIndexes = routeSelectCanonicalKeepIndexes(dayType, family, entries, priorityGroups);
  const keptEntries = (Array.isArray(entries) ? entries : []).filter((entry) => keepIndexes.has(entry.idx));
  const replacedEntries = (Array.isArray(entries) ? entries : []).filter((entry) => !keepIndexes.has(entry.idx));
  return {
    combo,
    week,
    day,
    dayType: String(dayType || '').toLowerCase(),
    family,
    cleanupPhase: String(cleanupPhase || ''),
    exerciseNamesBeforeCleanup: beforeExercises,
    familyCountBeforeCleanup: beforeCount,
    cleanupTriggered: false,
    triggerThresholdUsed,
    warningThresholdUsed,
    thresholdMismatch: warningThresholdUsed !== triggerThresholdUsed,
    exercisesChosenToKeep: keptEntries.map((entry) => String(entry.ex?.name || '').trim()).filter(Boolean),
    exercisesChosenToReplaceOrRemove: replacedEntries.map((entry) => String(entry.ex?.name || '').trim()).filter(Boolean),
    replacementCandidatesAttempted: [],
    replacementSelected: [],
    skipReason: null,
    exerciseNamesAfterCleanup: beforeExercises.slice(),
    familyCountAfterCleanup: beforeCount,
    beforeCleanupSnapshot: {
      exerciseNames: beforeExercises,
      familyCount: beforeCount
    },
    afterCleanupSnapshot: {
      exerciseNames: beforeExercises.slice(),
      familyCount: beforeCount
    },
    finalReturnedVisibleDay: null,
    finalReturnedVisibleFamilyCount: null,
    cleanupOverwrittenLater: false
  };
}

function routeAppendCanonicalCleanupDiagnostic(log, payload) {
  if (!Array.isArray(log) || !payload) return;
  log.push(payload);
}

function routeFinalizeCanonicalCleanupDiagnostic(diag, list, family, extra = {}) {
  if (!diag) return;
  const afterExercises = routeCanonicalCleanupExerciseNames(list);
  const afterCount = routeCanonicalCleanupFamilyCount(list, family);
  diag.exerciseNamesAfterCleanup = afterExercises;
  diag.familyCountAfterCleanup = afterCount;
  diag.afterCleanupSnapshot = {
    exerciseNames: afterExercises,
    familyCount: afterCount
  };
  Object.assign(diag, extra || {});
}

function routeMarkCanonicalCleanupDiagnosticsFinalState(diagnostics, { week = null, day = null, dayType = '', list = [] } = {}) {
  if (!Array.isArray(diagnostics) || !diagnostics.length) return;
  const normalizedDayType = String(dayType || '').toLowerCase();
  const finalExerciseNames = routeCanonicalCleanupExerciseNames(list);
  for (const diag of diagnostics) {
    if (!diag) continue;
    if (Number(diag.week ?? null) !== Number(week ?? null)) continue;
    if (String(diag.day || '') !== String(day || '')) continue;
    if (String(diag.dayType || '').toLowerCase() !== normalizedDayType) continue;
    if (!routeShouldEmitCleanupDiagnostic(diag.family)) continue;
    const finalCount = routeCanonicalCleanupFamilyCount(list, diag.family);
    diag.finalReturnedVisibleDay = finalExerciseNames.slice();
    diag.finalReturnedVisibleFamilyCount = finalCount;
    diag.cleanupOverwrittenLater = Number(diag.familyCountAfterCleanup || 0) < Number(diag.familyCountBeforeCleanup || 0)
      && finalCount > Number(diag.familyCountAfterCleanup || 0)
      && finalCount >= routeCanonicalCleanupWarningThreshold(normalizedDayType, diag.family, []);
  }
}

function getTrainingRequestId(req) {
  return String(
    req?.headers?.['x-training-request-id']
    || req?.headers?.['x-request-id']
    || ''
  ).trim() || null;
}

function getSlowestBuilderStage(sectionDurationsMs = {}, fallbackStage = '') {
  const entries = Object.entries(sectionDurationsMs || {})
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0)
    .map(([stage, value]) => [String(stage || '').trim(), Number(value)]);
  if (!entries.length) {
    return {
      stage: String(fallbackStage || '').trim() || null,
      elapsedMs: null
    };
  }
  entries.sort((a, b) => b[1] - a[1]);
  return {
    stage: entries[0][0] || null,
    elapsedMs: entries[0][1]
  };
}

function logTrainingRouteLifecycle(event, payload = {}) {
  if (!TRAINING_ROUTE_DEBUG) return;
  try {
    console.info('[training-route]', {
      at: new Date().toISOString(),
      event,
      ...payload
    });
  } catch {
    // ignore logging failures
  }
}

function routeBuildReplacementAttemptFailureReasons(candidateExercise, { type = '', family = '', others = [], priorityGroups = [] } = {}) {
  const reasons = [];
  if (!routeFitsDayType(candidateExercise, type)) reasons.push('day_type_mismatch');
  const candidateFamily = routeGetCanonicalMovementFamily(candidateExercise);
  if (candidateFamily === family) reasons.push('same_family');
  if (others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(candidateExercise))) reasons.push('duplicate_name');
  if (candidateFamily) {
    const cap = routeCanonicalFamilyCap(type, candidateFamily, priorityGroups);
    const existing = others.filter((ex) => routeGetCanonicalMovementFamily(ex) === candidateFamily).length;
    if (existing >= cap) reasons.push('family_cap_reached');
  }
  if (Array.isArray(candidateExercise?.equipment) && candidateExercise.equipment.length === 0) reasons.push('unavailable_equipment');
  return reasons;
}

function routeWouldCreateDuplicateIsolationFamily(dayExercises, candidateExercise) {
  if (!routeIsIsolation(candidateExercise)) return false;
  const fam = isolationFamilyForName(candidateExercise?.name);
  if (!fam) return false;
  return (Array.isArray(dayExercises) ? dayExercises : []).some((ex) => {
    if (!routeIsIsolation(ex)) return false;
    return isolationFamilyForName(ex?.name) === fam;
  });
}

function routeSimulateReplacementValidator(dayType, candidateDay) {
  const type = String(dayType || '').toLowerCase();
  const list = Array.isArray(candidateDay) ? candidateDay : [];
  if (routeDuplicateNamesForDay({ exercises: list }).length) {
    return { ok: false, reason: 'duplicate_exercise_name' };
  }
  const isoFamilies = new Set();
  for (const ex of list) {
    const fam = routeIsIsolation(ex) ? isolationFamilyForName(ex?.name) : null;
    if (!fam) continue;
    if (isoFamilies.has(fam)) return { ok: false, reason: 'duplicate_isolation_family' };
    isoFamilies.add(fam);
  }
  const names = list.map((ex) => String(ex?.name || ''));
  if (type === 'pull') {
    const hasRow = list.some((ex) => String(ex?.pattern || '').toLowerCase() === 'horizontalpull' || /\brow\b/.test(routeNormName(ex?.name)));
    const hasVerticalPull = list.some((ex) => routeIsVerticalPullName(ex?.name));
    const hasBicepsIso = list.some((ex) => routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name));
    const firstTwo = names.slice(0, 2);
    if (!hasRow || !hasVerticalPull) return { ok: false, reason: 'missing_row_or_vertical_pull' };
    if (!firstTwo.some((name) => routeIsVerticalPullName(name))) return { ok: false, reason: 'pull_day_lead_vertical_pull' };
    if (!hasBicepsIso) return { ok: false, reason: 'missing_biceps_iso' };
    if (names.some((name) => /(lateral raise|side lateral)/.test(String(name || '').toLowerCase()))) return { ok: false, reason: 'pull_day_lateral_raise_forbidden' };
  }
  return { ok: true, reason: null };
}

function routeBuildReplacementSafetySimulation(dayType, others, candidateExercise, currentIndex = null) {
  const duplicateExerciseName = (Array.isArray(others) ? others : []).some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(candidateExercise));
  const duplicateIsolationFamily = routeWouldCreateDuplicateIsolationFamily(others, candidateExercise);
  const rebuiltDay = [];
  const before = Array.isArray(others) ? others.slice() : [];
  const insertIndex = Number.isFinite(Number(currentIndex)) ? Math.max(0, Math.min(Number(currentIndex), before.length)) : before.length;
  rebuiltDay.push(...before.slice(0, insertIndex), candidateExercise, ...before.slice(insertIndex));
  const validator = routeSimulateReplacementValidator(dayType, rebuiltDay);
  return {
    wouldCreateDuplicateExerciseName: duplicateExerciseName,
    wouldCreateDuplicateIsolationFamily: duplicateIsolationFamily,
    finalValidatorWouldPass: Boolean(validator.ok),
    finalValidatorReason: validator.reason,
    acceptDecision: (!duplicateExerciseName && !duplicateIsolationFamily && validator.ok) ? 'accept' : 'reject'
  };
}

function routeCountCanonicalFamily(list, family) {
  return (Array.isArray(list) ? list : []).filter((ex) => routeGetCanonicalMovementFamily(ex) === family).length;
}

function routeHasCanonicalFamily(list, family) {
  return routeCountCanonicalFamily(list, family) > 0;
}

function routeCanonicalKeepScore(dayType, ex, family) {
  const name = routeNormName(ex?.name);
  const type = String(dayType || '').toLowerCase();
  let score = 0;
  if (family === 'horizontal_row') {
    if (/chest-supported row|leverage high row|cable row/.test(name)) score += 30;
    if (type === 'pull') score += 10;
    if (routeIsCompound(ex)) score += 10;
  } else if (family === 'squat_leg_press') {
    if (routeIsStapleSquatName(name)) score += 40;
    if (routeIsLungeName(name)) score += 20;
    if (/leg extension/.test(name)) score += 10;
    if (type === 'legs' || type === 'lower') score += 10;
  } else if (family === 'shoulder_press') {
    if (/leverage shoulder press|dumbbell shoulder press|overhead press|seated cable shoulder press/.test(name)) score += 35;
    if (routeIsCompound(ex)) score += 10;
  } else if (family === 'core_flexion') {
    const subrole = routeCoreFlexionSubrole(name);
    if (subrole === 'reverse_crunch_lower_abs') score += 35;
    else if (subrole === 'upper_abs_crunch') {
      if (/cable crunch/.test(name)) score += 30;
      else if (/ab crunch machine/.test(name)) score += 25;
      else if (/rope crunch/.test(name)) score += 20;
      else score += 15;
    } else if (subrole === 'situp_variation') score += 10;
  }
  score += Math.max(0, 10 - Number(ex?.sets || 0));
  return score;
}

function routeAppendCanonicalCleanupLog(log, payload) {
  if (!Array.isArray(log)) return;
  log.push(payload);
}

function routeCanonicalRedundancySnapshot(dayType, list) {
  const families = ['horizontal_row', 'squat_leg_press', 'shoulder_press', 'hinge_posterior_chain'];
  const counts = {};
  for (const family of families) counts[family] = routeCountCanonicalFamily(list, family);
  return {
    dayType: String(dayType || '').toLowerCase(),
    sameDayRedundancy: Object.values(counts).reduce((sum, count) => sum + (count > 1 ? count - 1 : 0), 0),
    counts
  };
}

function routeSelectCanonicalKeepIndexes(dayType, family, entries, priorityGroups = []) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').toLowerCase()));
  const type = String(dayType || '').toLowerCase();
  const sorted = entries
    .slice()
    .sort((a, b) => routeCanonicalKeepScore(dayType, b.ex, family) - routeCanonicalKeepScore(dayType, a.ex, family) || a.idx - b.idx);
  if (family === 'horizontal_row') {
    const keepCount = priorities.has('back') && (type === 'pull' || type === 'upper') ? 2 : 1;
    return new Set(sorted.slice(0, Math.min(keepCount, sorted.length)).map((entry) => entry.idx));
  }
  if (family === 'squat_leg_press') {
    const keep = new Set();
    const staple = sorted.find((entry) => routeIsStapleSquatName(entry.ex?.name));
    if (staple) keep.add(staple.idx);
    const unilateral = sorted.find((entry) => routeIsLungeName(entry.ex?.name) || /leg extension/.test(routeNormName(entry.ex?.name)));
    if (unilateral) keep.add(unilateral.idx);
    for (const entry of sorted) {
      if (keep.size >= 2) break;
      keep.add(entry.idx);
    }
    return keep;
  }
  if (family === 'shoulder_press') {
    return new Set(sorted.slice(0, 1).map((entry) => entry.idx));
  }
  return new Set(sorted.slice(0, 1).map((entry) => entry.idx));
}

function routePickTargetedCanonicalReplacement(dayType, family, current, others, priorityGroups = [], {
  currentIndex = null,
  missingVerticalPull = false,
  missingHinge = false
} = {}) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').toLowerCase()));
  const type = String(dayType || '').toLowerCase();
  const attempts = [];
  if (family === 'horizontal_row') {
    if (missingVerticalPull) attempts.push(['vertical_pull', 'missing_vertical_pull']);
    if (priorities.has('shoulders')) attempts.push(['rear_iso', 'shoulders_priority']);
    if (priorities.has('arms')) attempts.push(['biceps_iso', 'arms_priority']);
    if (priorities.has('chest')) attempts.push(['chest_iso', 'chest_priority']);
    if (priorities.has('calves')) attempts.push(['calves_iso', 'calves_priority']);
    attempts.push(['core_iso', 'fallback_core']);
  } else if (family === 'squat_leg_press') {
    if (missingHinge) attempts.push(['hinge_alt', 'missing_hinge']);
    if (priorities.has('calves')) attempts.push(['calves_iso', 'calves_priority']);
    if (priorities.has('abs') || priorities.has('core')) attempts.push(['core_iso', 'abs_priority']);
    attempts.push(['ham_iso', 'hamstring_accessory']);
  } else if (family === 'shoulder_press') {
    attempts.push(['lateral_iso', 'lateral_replacement']);
    attempts.push(['rear_iso', 'rear_delt_replacement']);
  }
  const attemptDiagnostics = [];
  for (const [key, reason] of attempts) {
    const candidateLog = {
      replacementRole: key,
      attemptReason: reason,
      candidateAttempts: [],
      selectedCandidate: null,
      failureReasons: []
    };
    const list = Array.isArray(ROUTE_REPLACEMENT_MAP[key]) ? ROUTE_REPLACEMENT_MAP[key] : [];
    let selectedSpec = null;
    for (const candidate of list) {
      if (!candidate?.name) continue;
      const candidateExercise = routeCanonicalizeExercise(routeApplyReplacement(current, candidate), others);
      const failureReasons = routeBuildReplacementAttemptFailureReasons(candidateExercise, {
        type,
        family,
        others,
        priorityGroups
      });
      const safetySimulation = routeBuildReplacementSafetySimulation(type, others, candidateExercise, currentIndex);
      candidateLog.candidateAttempts.push({
        candidateName: String(candidateExercise?.name || candidate?.name || '').trim(),
        failureReasons,
        safetySimulation
      });
      const passesSafetyGate = family !== 'horizontal_row' || safetySimulation.acceptDecision === 'accept';
      if (!failureReasons.length && passesSafetyGate) {
        selectedSpec = candidate;
        candidateLog.selectedCandidate = String(candidateExercise?.name || candidate?.name || '').trim();
        break;
      }
    }
    if (!candidateLog.candidateAttempts.length) candidateLog.failureReasons.push('no_candidate');
    if (!selectedSpec && !candidateLog.failureReasons.length) {
      const aggregated = new Set(candidateLog.candidateAttempts.flatMap((entry) => Array.isArray(entry.failureReasons) ? entry.failureReasons : []));
      candidateLog.failureReasons = aggregated.size ? [...aggregated] : ['no_candidate'];
    }
    attemptDiagnostics.push(candidateLog);
    if (selectedSpec) return { spec: selectedSpec, reason, attemptDiagnostics };
  }
  return { spec: null, reason: null, attemptDiagnostics };
}

function routeSimulateTargetedCanonicalReplacement(dayType, family, current, others, priorityGroups = [], options = {}) {
  return routePickTargetedCanonicalReplacement(dayType, family, current, others, priorityGroups, options);
}

function routeSimulateCanonicalKeepIndexes(dayType, family, exercises, priorityGroups = []) {
  const entries = (Array.isArray(exercises) ? exercises : [])
    .map((ex, idx) => ({ ex, idx }))
    .filter((entry) => routeGetCanonicalMovementFamily(entry.ex) === family);
  return [...routeSelectCanonicalKeepIndexes(dayType, family, entries, priorityGroups)];
}

function routePickCoreFlexionCleanupReplacement(dayType, current, others, priorityGroups = [], currentIndex = null) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').toLowerCase()));
  const absPriority = priorities.has('abs') || priorities.has('core');
  const attempts = [];
  if (absPriority && !others.some((ex) => routeCoreFlexionSubrole(ex?.name) === 'reverse_crunch_lower_abs')) {
    attempts.push(['core_reverse', 'missing_reverse_crunch_lower_abs']);
  }
  if (!others.some((ex) => routeCoreRotationStabilitySubrole(ex?.name) === 'anti_rotation_stability')) {
    attempts.push(['core_stability', 'missing_anti_rotation_stability']);
  }
  if (!others.some((ex) => routeCoreRotationStabilitySubrole(ex?.name) === 'rotation_oblique')) {
    attempts.push(['core_rotation', 'missing_rotation_oblique']);
  }
  if (!absPriority && priorities.has('calves')) attempts.push(['calves_iso', 'calves_priority']);
  if (!absPriority && priorities.has('shoulders')) attempts.push(['rear_iso', 'shoulders_priority']);
  if (!absPriority && priorities.has('arms')) {
    attempts.push(['biceps_iso', 'arms_priority_biceps']);
    attempts.push(['triceps_iso', 'arms_priority_triceps']);
  }
  const attemptDiagnostics = [];
  const type = String(dayType || '').toLowerCase();
  for (const [key, reason] of attempts) {
    const candidateLog = {
      replacementRole: key,
      attemptReason: reason,
      candidateAttempts: [],
      selectedCandidate: null,
      failureReasons: []
    };
    const list = Array.isArray(ROUTE_REPLACEMENT_MAP[key]) ? ROUTE_REPLACEMENT_MAP[key] : [];
    let selectedSpec = null;
    for (const candidate of list) {
      if (!candidate?.name) continue;
      const candidateExercise = routeCanonicalizeExercise(routeApplyReplacement(current, candidate), others);
      const candidateName = String(candidateExercise?.name || candidate?.name || '').trim();
      const failureReasons = [];
      if (!routeFitsDayType(candidateExercise, type)) failureReasons.push('day_type_mismatch');
      if (others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(candidateExercise))) failureReasons.push('duplicate_name');
      if (routeWouldCreateDuplicateIsolationFamily(others, candidateExercise)) failureReasons.push('duplicate_isolation_family');
      if (routeCoreFlexionSubrole(candidateExercise?.name) === 'upper_abs_crunch') failureReasons.push('upper_abs_crunch_same_role');
      const candidateFamily = routeGetCanonicalMovementFamily(candidateExercise);
      if (candidateFamily && candidateFamily !== 'core_flexion') {
        const cap = routeCanonicalFamilyCap(type, candidateFamily, priorityGroups);
        const existing = others.filter((ex) => routeGetCanonicalMovementFamily(ex) === candidateFamily).length;
        if (existing >= cap) failureReasons.push('family_cap_reached');
      }
      const safetySimulation = routeBuildReplacementSafetySimulation(type, others, candidateExercise, currentIndex);
      candidateLog.candidateAttempts.push({
        candidateName,
        failureReasons,
        safetySimulation
      });
      if (!failureReasons.length && safetySimulation.acceptDecision === 'accept') {
        selectedSpec = candidate;
        candidateLog.selectedCandidate = candidateName;
        break;
      }
    }
    if (!candidateLog.candidateAttempts.length) candidateLog.failureReasons.push('no_candidate');
    if (!selectedSpec && !candidateLog.failureReasons.length) {
      const aggregated = new Set(candidateLog.candidateAttempts.flatMap((entry) => Array.isArray(entry.failureReasons) ? entry.failureReasons : []));
      candidateLog.failureReasons = aggregated.size ? [...aggregated] : ['no_candidate'];
    }
    attemptDiagnostics.push(candidateLog);
    if (selectedSpec) return { spec: selectedSpec, reason, attemptDiagnostics };
  }
  return { spec: null, reason: null, attemptDiagnostics };
}

function routeCanSafelyRemoveExtraCoreCrunch(dayType, current, others, priorityGroups = [], dayLength = 0) {
  const priorities = new Set((Array.isArray(priorityGroups) ? priorityGroups : []).map((value) => String(value || '').toLowerCase()));
  const absPriority = priorities.has('abs') || priorities.has('core');
  if (absPriority) return { ok: false, reason: 'abs_priority_underfill' };
  if (Number(dayLength || 0) - 1 < 5) return { ok: false, reason: 'day_too_short_after_removal' };
  if (!others.some((ex) => routeIsCoreName(ex?.name))) return { ok: false, reason: 'weekly_core_exposure_risk' };
  const validator = routeSimulateReplacementValidator(dayType, others);
  if (!validator.ok) return { ok: false, reason: validator.reason || 'validator_failed' };
  return { ok: true, reason: 'safe_remove_extra_upper_abs_crunch' };
}

function routeEnforceCanonicalMovementFamilyRedundancy(dayType, exercises, { priorityGroups = [], cleanupLog = null, cleanupDiagnostics = null, cleanupPhase = '', cleanupFamilies = null, combo = [], week = null, day = null } = {}) {
  const type = String(dayType || '').toLowerCase();
  const list = Array.isArray(exercises) ? exercises.slice() : [];
  if (!list.length) return list;
  const familiesToClean = Array.isArray(cleanupFamilies) && cleanupFamilies.length
    ? cleanupFamilies.slice()
    : ['horizontal_row', 'squat_leg_press', 'shoulder_press'];
  for (const family of familiesToClean) {
    const entries = list.map((ex, idx) => ({ ex, idx })).filter((entry) => routeGetCanonicalMovementFamily(entry.ex) === family);
    if (!entries.length) continue;
    const beforeNames = list.map((ex) => String(ex?.name || '').trim()).filter(Boolean);
    const beforeCount = entries.length;
    const cleanupThreshold = routeCanonicalCleanupLoopThreshold(type, family, priorityGroups);
    const warningThreshold = routeCanonicalCleanupWarningThreshold(type, family, priorityGroups);
    const diag = routeShouldEmitCleanupDiagnostic(family) && beforeCount >= warningThreshold
      ? routeBuildCanonicalCleanupDiagnostic(type, family, list, entries, {
        combo,
        week,
        day,
        cleanupPhase,
        priorityGroups
      })
      : null;
    if (family === 'squat_leg_press' && type !== 'legs' && type !== 'lower') {
      if (diag) {
        diag.skipReason = routeCanonicalCleanupSkipReason('would_break_structure');
        routeFinalizeCanonicalCleanupDiagnostic(diag, list, family);
        routeAppendCanonicalCleanupDiagnostic(cleanupDiagnostics, diag);
      }
        routeAppendCanonicalCleanupLog(cleanupLog, {
          combo,
          week,
          day,
          dayType: type,
          family,
          beforeExercises: beforeNames,
          afterExercises: beforeNames,
          skipReason: routeCanonicalCleanupSkipReason('would_break_structure')
      });
      continue;
    }
    let changed = false;
    if (family === 'core_flexion') {
      const upperAbsEntries = entries
        .filter((entry) => routeCoreFlexionSubrole(entry.ex?.name) === 'upper_abs_crunch')
        .sort((a, b) => routeCanonicalKeepScore(type, b.ex, family) - routeCanonicalKeepScore(type, a.ex, family) || a.idx - b.idx);
      if (upperAbsEntries.length < 2) continue;
      const keepUpperAbs = upperAbsEntries[0];
      for (const entry of upperAbsEntries.slice(1).sort((a, b) => b.idx - a.idx)) {
        const others = list.filter((_, idx) => idx !== entry.idx);
        const replacement = routePickCoreFlexionCleanupReplacement(type, entry.ex, others, priorityGroups, entry.idx);
        if (replacement?.spec) {
          const replaced = routeCanonicalizeExercise(routeApplyReplacement(entry.ex, replacement.spec), others);
          if (!others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(replaced))) {
            list[entry.idx] = replaced;
            changed = true;
            routeAppendCanonicalCleanupLog(cleanupLog, {
              combo,
              week,
              day,
              dayType: type,
              family,
              beforeExercises: beforeNames,
              afterExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
              keptExercises: [String(keepUpperAbs.ex?.name || '').trim()],
              removedOrReplacedExercise: String(entry.ex?.name || '').trim(),
              replacementSelected: String(replaced?.name || '').trim(),
              replacementReason: replacement.reason,
              skipReason: null
            });
            continue;
          }
        }
        const removalCheck = routeCanSafelyRemoveExtraCoreCrunch(type, entry.ex, others, priorityGroups, list.length);
        if (removalCheck.ok) {
          list.splice(entry.idx, 1);
          changed = true;
          routeAppendCanonicalCleanupLog(cleanupLog, {
            combo,
            week,
            day,
            dayType: type,
            family,
            beforeExercises: beforeNames,
            afterExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
            keptExercises: [String(keepUpperAbs.ex?.name || '').trim()],
            removedOrReplacedExercise: String(entry.ex?.name || '').trim(),
            replacementSelected: null,
            replacementReason: null,
            skipReason: null
          });
          continue;
        }
        routeAppendCanonicalCleanupLog(cleanupLog, {
          combo,
          week,
          day,
          dayType: type,
          family,
          beforeExercises: beforeNames,
          afterExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
          keptExercises: [String(keepUpperAbs.ex?.name || '').trim()],
          removedOrReplacedExercise: String(entry.ex?.name || '').trim(),
          replacementSelected: null,
          skipReason: routeCanonicalCleanupSkipReason('no_safe_replacement_found')
        });
      }
      continue;
    }
    if (beforeCount <= cleanupThreshold) {
      if (diag) {
        diag.skipReason = routeCanonicalCleanupSkipReason('cleanup_threshold_not_met');
        routeFinalizeCanonicalCleanupDiagnostic(diag, list, family);
        routeAppendCanonicalCleanupDiagnostic(cleanupDiagnostics, diag);
      }
      continue;
    }
    if (diag) diag.cleanupTriggered = true;
    const keepIndexes = routeSelectCanonicalKeepIndexes(type, family, entries, priorityGroups);
    for (const entry of entries.filter((item) => !keepIndexes.has(item.idx)).sort((a, b) => b.idx - a.idx)) {
      const others = list.filter((_, idx) => idx !== entry.idx);
      const keptNames = entries.filter((item) => keepIndexes.has(item.idx)).map((item) => String(item.ex?.name || '').trim()).filter(Boolean);
      const attemptLog = {
        exerciseName: String(entry.ex?.name || '').trim(),
        attemptedReplacementRoles: [],
        replacementSelected: null,
        skipReason: null
      };
      if (family === 'squat_leg_press' && routeCountCanonicalFamily(others, 'squat_leg_press') < 1) {
        if (diag) {
          attemptLog.skipReason = routeCanonicalCleanupSkipReason('would_remove_only_quad_pattern');
          attemptLog.attemptedReplacementRoles.push({
            replacementRole: null,
            attemptReason: 'would_remove_only_quad_pattern',
            candidateAttempts: [],
            selectedCandidate: null,
            failureReasons: ['would_break_structure']
          });
          diag.replacementCandidatesAttempted.push(attemptLog);
        }
        routeAppendCanonicalCleanupLog(cleanupLog, {
          combo,
          week,
          day,
          dayType: type,
          family,
          beforeExercises: beforeNames,
          afterExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
          keptExercises: keptNames,
          removedOrReplacedExercise: String(entry.ex?.name || '').trim(),
          replacementSelected: null,
          skipReason: routeCanonicalCleanupSkipReason('would_remove_only_quad_pattern')
        });
        continue;
      }
      const replacement = routePickTargetedCanonicalReplacement(type, family, entry.ex, others, priorityGroups, {
        currentIndex: entry.idx,
        missingVerticalPull: family === 'horizontal_row' && !routeHasCanonicalFamily(others, 'vertical_pull'),
        missingHinge: family === 'squat_leg_press' && !routeHasCanonicalFamily(others, 'hinge_posterior_chain')
      });
      if (diag) {
        attemptLog.attemptedReplacementRoles = Array.isArray(replacement?.attemptDiagnostics) ? replacement.attemptDiagnostics : [];
      }
      if (!replacement?.spec) {
        if (diag) {
          attemptLog.skipReason = routeCanonicalCleanupSkipReason(family === 'squat_leg_press' ? 'would_break_structure' : 'no_safe_replacement_found');
          diag.replacementCandidatesAttempted.push(attemptLog);
        }
        routeAppendCanonicalCleanupLog(cleanupLog, {
          combo,
          week,
          day,
          dayType: type,
          family,
          beforeExercises: beforeNames,
          afterExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
          keptExercises: keptNames,
          removedOrReplacedExercise: String(entry.ex?.name || '').trim(),
          replacementSelected: null,
          skipReason: routeCanonicalCleanupSkipReason(family === 'squat_leg_press' ? 'would_break_structure' : 'no_safe_replacement_found')
        });
        continue;
      }
      const replaced = routeCanonicalizeExercise(routeApplyReplacement(entry.ex, replacement.spec), others);
      const replacedFamily = routeGetCanonicalMovementFamily(replaced);
      if (replacedFamily === family) {
        if (diag) {
          attemptLog.replacementSelected = String(replaced?.name || '').trim();
          attemptLog.skipReason = routeCanonicalCleanupSkipReason('replacement_same_family');
          diag.replacementCandidatesAttempted.push(attemptLog);
        }
        routeAppendCanonicalCleanupLog(cleanupLog, {
          combo,
          week,
          day,
          dayType: type,
          family,
          beforeExercises: beforeNames,
          afterExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
          keptExercises: keptNames,
          removedOrReplacedExercise: String(entry.ex?.name || '').trim(),
          replacementSelected: String(replaced?.name || '').trim(),
          skipReason: routeCanonicalCleanupSkipReason('replacement_same_family')
        });
        continue;
      }
      if (others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(replaced))) {
        if (diag) {
          attemptLog.replacementSelected = String(replaced?.name || '').trim();
          attemptLog.skipReason = routeCanonicalCleanupSkipReason('would_create_duplicate_name');
          diag.replacementCandidatesAttempted.push(attemptLog);
        }
        routeAppendCanonicalCleanupLog(cleanupLog, {
          combo,
          week,
          day,
          dayType: type,
          family,
          beforeExercises: beforeNames,
          afterExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
          keptExercises: keptNames,
          removedOrReplacedExercise: String(entry.ex?.name || '').trim(),
          replacementSelected: String(replaced?.name || '').trim(),
          skipReason: routeCanonicalCleanupSkipReason('would_create_duplicate_name')
        });
        continue;
      }
      list[entry.idx] = replaced;
      changed = true;
      if (diag) {
        attemptLog.replacementSelected = String(replaced?.name || '').trim();
        diag.replacementCandidatesAttempted.push(attemptLog);
        diag.replacementSelected.push({
          replacedExercise: String(entry.ex?.name || '').trim(),
          replacementExercise: String(replaced?.name || '').trim(),
          replacementReason: replacement.reason
        });
      }
      routeAppendCanonicalCleanupLog(cleanupLog, {
        combo,
        week,
        day,
        dayType: type,
        family,
        beforeExercises: beforeNames,
        afterExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
        keptExercises: keptNames,
        removedOrReplacedExercise: String(entry.ex?.name || '').trim(),
        replacementSelected: String(replaced?.name || '').trim(),
        replacementReason: replacement.reason,
        skipReason: null
      });
    }
    if (diag) {
      if (!changed && !diag.skipReason) {
        const attempted = diag.replacementCandidatesAttempted.flatMap((entry) => Array.isArray(entry.attemptedReplacementRoles) ? entry.attemptedReplacementRoles : []);
        if (attempted.length) diag.skipReason = routeCanonicalCleanupSkipReason('no_safe_replacement_found');
      }
      routeFinalizeCanonicalCleanupDiagnostic(diag, list, family);
      routeAppendCanonicalCleanupDiagnostic(cleanupDiagnostics, diag);
    }
    if (!changed && family === 'hinge_posterior_chain') {
      routeAppendCanonicalCleanupLog(cleanupLog, {
        combo,
        week,
        day,
        dayType: type,
        family,
        beforeExercises: beforeNames,
        afterExercises: beforeNames,
        skipReason: routeCanonicalCleanupSkipReason('priority_specific_duplication_allowed')
      });
    }
  }
  return list;
}

function routeApplyReplacement(ex, spec) {
  if (!spec) return ex;
  return {
    ...ex,
    name: spec.name,
    pattern: spec.pattern || ex?.pattern,
    style: spec.style || ex?.style,
    primary: spec.primary || ex?.primary
  };
}

function routeExerciseIdentityKey(ex) {
  return routeNormName(ex?.canonicalName || ex?.name);
}

function routeTricepsFamily(name) {
  const n = routeNormName(name);
  if (!n) return 'none';
  if (/(close grip|close-grip|jm press|dip|bench dip|triceps press)/.test(n)) return 'press';
  if (/(overhead|one arm tricep extension|one arm triceps extension|rope overhead)/.test(n)) return 'overhead';
  if (/(pushdown|pressdown)/.test(n)) return 'pushdown';
  if (/(machine triceps extension|machine extension)/.test(n)) return 'machine_extension';
  if (/(skull crusher|skullcrusher|lying extension|barbell triceps extension|incline barbell triceps extension|tate press|\bextension\b)/.test(n)) return 'extension';
  return 'none';
}

function routeDuplicateNamesForDay(day) {
  const seen = new Set();
  const duplicates = [];
  for (const ex of Array.isArray(day?.exercises) ? day.exercises : []) {
    const key = routeExerciseIdentityKey(ex);
    if (!key) continue;
    if (seen.has(key)) duplicates.push(String(ex?.canonicalName || ex?.name || key));
    else seen.add(key);
  }
  return duplicates;
}

function routeClassifyDeltsArmsRole(ex) {
  const name = routeNormName(ex?.name);
  if (routeIsIsolation(ex) && routeIsBicepsIsoName(name)) return 'biceps_iso';
  if (routeIsIsolation(ex) && routeIsTricepsIsoName(name)) return 'triceps_iso';
  if (routeIsLateralRaiseName(name) || routeIsRearDeltName(name) || routeIsShoulderPressName(name)) return 'delt';
  return 'other';
}

function routeCountDeltsArmsRoles(exercises) {
  return (Array.isArray(exercises) ? exercises : []).reduce((acc, ex) => {
    const role = routeClassifyDeltsArmsRole(ex);
    acc[role] = Number(acc[role] || 0) + 1;
    return acc;
  }, {
    biceps_iso: 0,
    triceps_iso: 0,
    delt: 0,
    other: 0
  });
}

function routePickDeltsArmsRoleReplacement(role, current, dayExercises) {
  const key = String(role || '');
  if (!key) return null;
  const currentBucket = routeEquipmentBucketFromName(current?.name);
  const currentName = routeNormName(current?.name);
  const used = new Set((Array.isArray(dayExercises) ? dayExercises : []).map((ex) => routeNormName(ex?.name)).filter(Boolean));
  const accept = (spec) => {
    const candidateName = routeNormName(spec?.name);
    return Boolean(candidateName) && candidateName !== currentName && !used.has(candidateName);
  };
  if (currentBucket && currentBucket !== 'other') {
    const sameEquip = routePickReplacementMatching(key, dayExercises, (spec) => accept(spec) && routeEquipmentBucketFromName(spec?.name) === currentBucket);
    if (sameEquip) return sameEquip;
  }
  return routePickReplacementMatching(key, dayExercises, accept);
}

function routePickDeltsArmsNonArmReplacement(role, current, dayExercises) {
  const fallbackKeys = role === 'biceps_iso'
    ? ['lateral_iso', 'rear_iso', 'shoulder_main']
    : ['rear_iso', 'lateral_iso', 'shoulder_main'];
  const currentBucket = routeEquipmentBucketFromName(current?.name);
  const currentName = routeNormName(current?.name);
  const used = new Set((Array.isArray(dayExercises) ? dayExercises : []).map((ex) => routeNormName(ex?.name)).filter(Boolean));
  const accept = (spec) => {
    const candidateName = routeNormName(spec?.name);
    return Boolean(candidateName) && candidateName !== currentName && !used.has(candidateName);
  };
  for (const key of fallbackKeys) {
    if (currentBucket && currentBucket !== 'other') {
      const sameEquip = routePickReplacementMatching(key, dayExercises, (spec) => accept(spec) && routeEquipmentBucketFromName(spec?.name) === currentBucket);
      if (sameEquip) return sameEquip;
    }
    const fallback = routePickReplacementMatching(key, dayExercises, accept);
    if (fallback) return fallback;
  }
  return null;
}

function routePickDeltsArmsRoleRepairIndex(list, role, { protectedIndexes = [] } = {}) {
  const targetRole = String(role || '');
  const protectedSet = new Set((Array.isArray(protectedIndexes) ? protectedIndexes : []).filter((idx) => Number.isFinite(idx)));
  const eligible = (Array.isArray(list) ? list : [])
    .map((ex, idx) => ({ ex, idx, role: routeClassifyDeltsArmsRole(ex) }))
    .filter(({ idx, role: currentRole }) => !protectedSet.has(idx) && currentRole !== targetRole);
  const scoreEntry = ({ ex, idx, role: currentRole }) => {
    let score = 0;
    if (idx > 1) score += 200;
    if (currentRole === 'delt') score += 100;
    if (routeIsIsolation(ex) && (routeIsLateralRaiseName(ex?.name) || routeIsRearDeltName(ex?.name))) score += 60;
    if (currentRole === 'other' && !routeIsCoreName(ex?.name)) score += 40;
    if (routeIsCoreName(ex?.name)) score -= 50;
    score -= idx;
    return score;
  };
  const ranked = eligible.sort((a, b) => scoreEntry(b) - scoreEntry(a) || b.idx - a.idx);
  return Number.isFinite(Number(ranked[0]?.idx)) ? ranked[0].idx : -1;
}

function routeBuildDeltsArmsRoleRepairError(day, week, counts, reason) {
  return {
    error: 'PLAN_BUILD_FAILED',
    message: String(reason || 'Delts+Arms day role repair failed.'),
    reason: String(reason || 'Delts+Arms day role repair failed.'),
    functionName: 'routeRepairDeltsArmsRoleInvariant',
    stage: 'routeRepairDeltsArmsRoleInvariant',
    failedStage: 'routeRepairDeltsArmsRoleInvariant',
    week: Number(week?.weekIndex || week?.index || 0) || 0,
    day: String(day?.day || day?.label || day?.dayType || '').trim() || undefined,
    dayType: String(day?.dayType || '').trim() || undefined,
    roleCounts: counts
  };
}

function routePickFinalDuplicateReplacement(dayType, current, dayExercises) {
  const type = String(dayType || '').toLowerCase();
  const currentKey = routeExerciseIdentityKey(current);
  const currentBucket = routeEquipmentBucketFromName(current?.name);
  const currentName = routeNormName(current?.name);
  const sameDayNames = new Set((Array.isArray(dayExercises) ? dayExercises : []).map((ex) => routeExerciseIdentityKey(ex)).filter(Boolean));
  const existingTriFamilies = new Set((Array.isArray(dayExercises) ? dayExercises : [])
    .filter((ex) => routeIsTricepsIsoName(ex?.name))
    .map((ex) => routeTricepsFamily(ex?.name))
    .filter((family) => family && family !== 'none'));

  const keys = [];
  if (routeIsBicepsIsoName(currentName)) keys.push('biceps_iso');
  else if (routeIsTricepsIsoName(currentName)) keys.push('triceps_iso');
  else if (routeIsCalvesName(currentName)) keys.push('calves_iso');
  else if (routeIsCoreName(currentName)) keys.push('core_iso');
  else if (routeIsRearDeltName(currentName)) keys.push('rear_iso');
  else if (routeIsLateralRaiseName(currentName)) keys.push('lateral_iso');
  keys.push(...routeReplacementKeysForExercise(type, current, 0));

  const seenKeys = new Set();
  const dedupedKeys = keys.filter((key) => {
    if (!key || seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const tryFind = (acceptFn = null) => {
    for (const key of dedupedKeys) {
      const spec = routePickReplacementMatching(key, dayExercises, (candidate) => {
        const candidateKey = routeNormName(candidate?.name);
        if (!candidateKey || candidateKey === currentKey || sameDayNames.has(candidateKey)) return false;
        if (typeof acceptFn === 'function' && !acceptFn(candidate)) return false;
        return true;
      });
      if (spec) return spec;
    }
    return null;
  };

  if (routeIsTricepsIsoName(currentName)) {
    const varied = tryFind((candidate) => {
      const family = routeTricepsFamily(candidate?.name);
      return family === 'none' || !existingTriFamilies.has(family);
    });
    if (varied) return varied;
  }

  const sameEquip = currentBucket !== 'other'
    ? tryFind((candidate) => routeEquipmentBucketFromName(candidate?.name) === currentBucket)
    : null;
  if (sameEquip) return sameEquip;

  return tryFind() || null;
}

function routeDedupeFinalDeltsArmsDay(exercises, context = {}) {
  let list = Array.isArray(exercises) ? exercises.slice() : [];
  for (let pass = 0; pass < 5; pass += 1) {
    const seen = new Set();
    let changed = false;
    for (let i = 0; i < list.length; i += 1) {
      const current = list[i];
      const key = routeExerciseIdentityKey(current);
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        continue;
      }
      const role = routeClassifyDeltsArmsRole(current);
      const others = list.filter((_, idx) => idx !== i);
      if (role === 'biceps_iso' || role === 'triceps_iso') {
        const replacement = routePickDeltsArmsRoleReplacement(role, current, others);
        console.warn('delts_arms_duplicate_replacement_attempt', {
          week: Number(context?.week || 0) || 0,
          day: String(context?.day || '').trim() || '',
          dayType: String(context?.dayType || '').trim() || '',
          duplicateExerciseName: String(current?.name || '').trim() || '',
          role,
          replacement: replacement ? String(replacement?.name || '').trim() : '',
          sameEquipmentPreferred: true
        });
        if (replacement) {
          const replaced = routeCanonicalizeExercise(routeApplyReplacement(current, replacement), others);
          if (!others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(replaced))) {
            list[i] = replaced;
            changed = true;
            continue;
          }
        }
        const countsAfterRemoval = routeCountDeltsArmsRoles(others);
        if ((role === 'biceps_iso' && countsAfterRemoval.biceps_iso >= 1) || (role === 'triceps_iso' && countsAfterRemoval.triceps_iso >= 1)) {
          list.splice(i, 1);
          i -= 1;
          changed = true;
          continue;
        }
      }
      const spec = routePickFinalDuplicateReplacement('deltsarms', current, others);
      if (spec) {
        const replaced = routeCanonicalizeExercise(routeApplyReplacement(current, spec), others);
        if (!others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(replaced))) {
          list[i] = replaced;
          changed = true;
          continue;
        }
      }
      list.splice(i, 1);
      i -= 1;
      changed = true;
    }
    if (!changed || !routeDuplicateNamesForDay({ exercises: list }).length) break;
  }
  return list;
}

function routeDedupeFinalDay(dayType, exercises) {
  let list = Array.isArray(exercises) ? exercises.slice() : [];
  for (let pass = 0; pass < 5; pass += 1) {
    const seen = new Set();
    let changed = false;
    for (let i = 0; i < list.length; i += 1) {
      const current = list[i];
      const key = routeExerciseIdentityKey(current);
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        continue;
      }
      const others = list.filter((_, idx) => idx !== i);
      const spec = routePickFinalDuplicateReplacement(dayType, current, others);
      if (spec) {
        const replaced = routeCanonicalizeExercise(routeApplyReplacement(current, spec), others);
        if (!others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(replaced))) {
          list[i] = replaced;
          changed = true;
          continue;
        }
      }
      list.splice(i, 1);
      i -= 1;
      changed = true;
    }
    if (!changed || !routeDuplicateNamesForDay({ exercises: list }).length) break;
  }
  return list;
}

function routeApplyUniqueReplacementAtIndex(list, idx, spec) {
  if (!Array.isArray(list) || idx < 0 || idx >= list.length || !spec) return false;
  const others = list.filter((_, i) => i !== idx);
  const replaced = routeCanonicalizeExercise(routeApplyReplacement(list[idx], spec), others);
  if (others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(replaced))) return false;
  list[idx] = replaced;
  return true;
}

function routeEnsureDayAccessoryInvariant(dayType, exercises) {
  const type = String(dayType || '').toLowerCase();
  const out = Array.isArray(exercises) ? exercises.slice() : [];
  const pickReplaceIndex = (predicate) => {
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (predicate(out[i], i)) return i;
    }
    return -1;
  };
  const appendUnique = (key, base = { style: 'Isolation', pattern: 'Isolation', sets: 2 }) => {
    if (out.length >= 6) return false;
    const spec = routePickUniqueReplacementMatching(key, out);
    if (!spec) return false;
    const next = routeCanonicalizeExercise(routeApplyReplacement(base, spec), out);
    if (out.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(next))) return false;
    out.push(next);
    return true;
  };
  const ensurePushTriceps = () => {
    if (out.some((ex) => routeIsTricepsIsoName(ex?.name))) return;
    const spec = routePickUniqueReplacementMatching('triceps_iso', out);
    if (!spec) return;
    let idx = pickReplaceIndex((ex, i) => i > 1 && !routeIsHorizontalPressMain(ex) && !routeIsShoulderPressName(ex?.name) && !routeIsCoreName(ex?.name));
    if (idx < 0) idx = pickReplaceIndex((ex, i) => i > 1 && !routeIsHorizontalPressMain(ex) && !routeIsShoulderPressName(ex?.name));
    if (idx >= 0 && routeApplyUniqueReplacementAtIndex(out, idx, spec)) return;
    appendUnique('triceps_iso');
  };
  const ensurePullBiceps = () => {
    if (out.some((ex) => routeIsBicepsIsoName(ex?.name))) return;
    const spec = routePickUniqueReplacementMatching('biceps_iso', out);
    if (!spec) return;
    let idx = pickReplaceIndex((ex, i) => i > 1 && !routeIsVerticalPullName(ex?.name) && !routeIsRowName(ex?.name) && !routeIsCoreName(ex?.name));
    if (idx < 0) idx = pickReplaceIndex((ex, i) => i > 1 && !routeIsVerticalPullName(ex?.name) && !routeIsRowName(ex?.name));
    if (idx >= 0 && routeApplyUniqueReplacementAtIndex(out, idx, spec)) return;
    appendUnique('biceps_iso');
  };

  if (type === 'push') ensurePushTriceps();
  if (type === 'pull') ensurePullBiceps();
  return out;
}

function routeRepairDeltsArmsDayRoles(day, week, { absPriority = false } = {}) {
  const context = {
    week: Number(week?.weekIndex || week?.index || 0) || 0,
    day: String(day?.day || day?.label || day?.dayType || '').trim() || '',
    dayType: String(day?.dayType || '').trim() || ''
  };
  let list = routeDedupeFinalDeltsArmsDay(day?.exercises || [], context);
  const countRoles = () => routeCountDeltsArmsRoles(list);
  const appendUniqueRole = (role) => {
    if (list.length >= 6) return false;
    const spec = routePickUniqueReplacementMatching(role, list);
    if (!spec) return false;
    const next = routeCanonicalizeExercise(routeApplyReplacement({ style: 'Isolation', pattern: 'Isolation', sets: 3 }, spec), list);
    if (list.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(next))) return false;
    list.push(next);
    return true;
  };
  const protectedRoleIndexes = (role) => list
    .map((ex, idx) => (routeClassifyDeltsArmsRole(ex) === role ? idx : -1))
    .filter((idx) => idx >= 0);
  const ensureSingleRole = (role) => {
    let counts = countRoles();
    while (counts[role] > 1) {
      const indexes = list
        .map((ex, idx) => (routeClassifyDeltsArmsRole(ex) === role ? idx : -1))
        .filter((idx) => idx >= 0);
      const idx = indexes[indexes.length - 1];
      if (!Number.isFinite(idx)) break;
      const replacement = routePickDeltsArmsNonArmReplacement(role, list[idx], list.filter((_, i) => i !== idx));
      if (replacement) {
        const others = list.filter((_, i) => i !== idx);
        const next = routeCanonicalizeExercise(routeApplyReplacement(list[idx], replacement), others);
        if (!others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(next))) {
          list[idx] = next;
        } else {
          list.splice(idx, 1);
        }
      } else {
        list.splice(idx, 1);
      }
      list = routeDedupeFinalDeltsArmsDay(list, context);
      counts = countRoles();
    }
    counts = countRoles();
    if (counts[role] === 1) return true;
    if (appendUniqueRole(role)) {
      list = routeDedupeFinalDeltsArmsDay(list, context);
      return countRoles()[role] === 1;
    }
    const oppositeRole = role === 'biceps_iso' ? 'triceps_iso' : 'biceps_iso';
    const oppositeIndexes = protectedRoleIndexes(oppositeRole);
    const protectedIndexes = oppositeIndexes.length === 1 ? oppositeIndexes : [];
    const replaceIdx = routePickDeltsArmsRoleRepairIndex(list, role, { protectedIndexes });
    const spec = routePickUniqueReplacementMatching(role, list);
    if (Number.isFinite(replaceIdx) && replaceIdx >= 0 && spec) {
      const others = list.filter((_, i) => i !== replaceIdx);
      const next = routeCanonicalizeExercise(routeApplyReplacement(list[replaceIdx], spec), others);
      if (!others.some((ex) => routeExerciseIdentityKey(ex) === routeExerciseIdentityKey(next))) {
        list[replaceIdx] = next;
      }
    } else {
      return false;
    }
    list = routeDedupeFinalDeltsArmsDay(list, context);
    return countRoles()[role] === 1;
  };

  const bicepsOk = ensureSingleRole('biceps_iso');
  const tricepsOk = ensureSingleRole('triceps_iso');
  const rolesStable = bicepsOk && tricepsOk && ensureSingleRole('biceps_iso') && ensureSingleRole('triceps_iso');
  list = routeFinalizeBodybuildingDay('deltsarms', list, { absPriority });
  list = routeDedupeFinalDeltsArmsDay(list, context);
  const finalCounts = countRoles();
  if (
    rolesStable
    && finalCounts.biceps_iso === 1
    && finalCounts.triceps_iso === 1
    && !routeDuplicateNamesForDay({ exercises: list }).length
    && !routeHasDuplicateIsolationFamily(list)
  ) {
    console.warn('delts_arms_role_repair_success', {
      ...context,
      roleCounts: finalCounts
    });
    return { exercises: list };
  }
  console.warn('delts_arms_role_repair_failed', {
    ...context,
    roleCounts: finalCounts
  });
  return {
    error: routeBuildDeltsArmsRoleRepairError(day, week, finalCounts, 'Delts+Arms day must include exactly one biceps iso and one triceps iso.')
  };
}

function routeEnforceFinalVisibleDedupeInvariant(planObj) {
  if (!planObj || String(planObj?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return planObj;
  const weeks = Array.isArray(planObj?.weeks) ? planObj.weeks : [];
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.map((x) => String(x || '').toLowerCase()) : [];
  const combo = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.slice() : [];
  const absPriority = priorityGroups.includes('abs') || priorityGroups.includes('core');
  const chestPriority = priorityGroups.includes('chest');
  const armsPriority = priorityGroups.includes('arms') || priorityGroups.includes('biceps') || priorityGroups.includes('triceps');
  const shouldersPriority = priorityGroups.includes('shoulders');
  const calvesPriority = priorityGroups.includes('calves');
  const cleanupLog = [];
  const cleanupDiagnostics = [];
  const cleanupSummary = {
    sameDayRedundancyBefore: 0,
    sameDayRedundancyAfter: 0,
    horizontal_row: { before: 0, after: 0 },
    squat_leg_press: { before: 0, after: 0 },
    shoulder_press: { before: 0, after: 0 }
  };
  const before = [];
  for (const week of weeks) {
    for (const day of week?.days || []) {
      const duplicates = routeDuplicateNamesForDay(day);
      if (duplicates.length) before.push({
        week: Number(week?.weekIndex || week?.index || 0),
        day: String(day?.dayType || ''),
        duplicates
      });
      const dType = String(day?.dayType || '').toLowerCase();
      const beforeSnapshot = routeCanonicalRedundancySnapshot(dType, day?.exercises || []);
      cleanupSummary.sameDayRedundancyBefore += beforeSnapshot.sameDayRedundancy;
      cleanupSummary.horizontal_row.before += beforeSnapshot.counts.horizontal_row;
      cleanupSummary.squat_leg_press.before += beforeSnapshot.counts.squat_leg_press;
      cleanupSummary.shoulder_press.before += beforeSnapshot.counts.shoulder_press;
      if (dType === 'deltsarms') {
        console.warn('delts_arms_dedupe_before', {
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.day || ''),
          dayType: String(day?.dayType || ''),
          duplicates,
          exercises: Array.isArray(day?.exercises) ? day.exercises.map((ex) => String(ex?.name || '')) : []
        });
        console.warn('delts_arms_role_counts_before', {
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.day || ''),
          dayType: String(day?.dayType || ''),
          roleCounts: routeCountDeltsArmsRoles(day?.exercises || [])
        });
        day.exercises = routeDedupeFinalDeltsArmsDay(day?.exercises || [], {
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.day || ''),
          dayType: String(day?.dayType || '')
        });
      } else {
        day.exercises = routeDedupeFinalDay(dType, day?.exercises || []);
      }
      day.exercises = routeEnsureDayAccessoryInvariant(dType, day.exercises || []);
      day.exercises = routeEnforceChestPressCompoundCap(dType, day.exercises || [], {
        chestPriority,
        armsPriority,
        shouldersPriority,
        calvesPriority
      });
      day.exercises = routeEnforceCanonicalMovementFamilyRedundancy(dType, day.exercises || [], {
        priorityGroups,
        cleanupLog,
        cleanupDiagnostics,
        cleanupPhase: 'post_accessory_pre_finalize',
        combo,
        week: Number(week?.weekIndex || week?.index || 0),
        day: String(day?.day || '').trim() || null
      });
      day.exercises = routeFinalizeBodybuildingDay(dType, day.exercises || [], { absPriority });
      day.exercises = routeEnforceCanonicalMovementFamilyRedundancy(dType, day.exercises || [], {
        priorityGroups,
        cleanupLog,
        cleanupDiagnostics,
        cleanupPhase: 'post_finalize',
        combo,
        week: Number(week?.weekIndex || week?.index || 0),
        day: String(day?.day || '').trim() || null
      });
      day.exercises = routeDedupeIsolationFamilies(dType, day.exercises || []);
      day.exercises = routeEnforceCanonicalMovementFamilyRedundancy(dType, day.exercises || [], {
        priorityGroups,
        cleanupLog,
        cleanupDiagnostics,
        cleanupPhase: 'post_isolation_dedupe',
        cleanupFamilies: ['core_flexion'],
        combo,
        week: Number(week?.weekIndex || week?.index || 0),
        day: String(day?.day || '').trim() || null
      });
      const hingeCount = routeCountCanonicalFamily(day.exercises || [], 'hinge_posterior_chain');
      if (hingeCount >= 3) {
        routeAppendCanonicalCleanupLog(cleanupLog, {
          combo,
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.day || '').trim() || null,
          dayType: dType,
          family: 'hinge_posterior_chain',
          beforeExercises: (day.exercises || []).map((ex) => String(ex?.name || '').trim()).filter(Boolean),
          afterExercises: (day.exercises || []).map((ex) => String(ex?.name || '').trim()).filter(Boolean),
          skipReason: routeCanonicalCleanupSkipReason('priority_specific_duplication_allowed')
        });
      }
      day.exercises = dType === 'deltsarms'
        ? routeDedupeFinalDeltsArmsDay(day.exercises || [], {
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.day || ''),
          dayType: String(day?.dayType || '')
        })
        : routeDedupeFinalDay(dType, day.exercises || []);
      if (dType === 'deltsarms') {
        console.warn('delts_arms_dedupe_after', {
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.day || ''),
          dayType: String(day?.dayType || ''),
          duplicates: routeDuplicateNamesForDay(day),
          exercises: Array.isArray(day?.exercises) ? day.exercises.map((ex) => String(ex?.name || '')) : []
        });
        console.warn('delts_arms_role_counts_after', {
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.day || ''),
          dayType: String(day?.dayType || ''),
          roleCounts: routeCountDeltsArmsRoles(day?.exercises || [])
        });
      }
      routeMarkCanonicalCleanupDiagnosticsFinalState(cleanupDiagnostics, {
        week: Number(week?.weekIndex || week?.index || 0),
        day: String(day?.day || '').trim() || null,
        dayType: dType,
        list: day?.exercises || []
      });
      const afterSnapshot = routeCanonicalRedundancySnapshot(dType, day?.exercises || []);
      cleanupSummary.sameDayRedundancyAfter += afterSnapshot.sameDayRedundancy;
      cleanupSummary.horizontal_row.after += afterSnapshot.counts.horizontal_row;
      cleanupSummary.squat_leg_press.after += afterSnapshot.counts.squat_leg_press;
      cleanupSummary.shoulder_press.after += afterSnapshot.counts.shoulder_press;
    }
  }
  if (before.length) console.warn('ROUTE_FINAL_DEDUPE_BEFORE', before);

  const after = [];
  for (const week of weeks) {
    for (const day of week?.days || []) {
      const duplicates = routeDuplicateNamesForDay(day);
      if (duplicates.length) {
        after.push({
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.dayType || ''),
          duplicates
        });
        duplicates.forEach((duplicateExerciseName) => {
          console.warn('ROUTE_FINAL_DEDUPE_FAILED', {
            week: Number(week?.weekIndex || week?.index || 0),
            day: String(day?.dayType || ''),
            duplicateExerciseName
          });
        });
      }
    }
  }
  if (before.length || after.length) console.warn('ROUTE_FINAL_DEDUPE_AFTER', after);
  if (planObj.meta && typeof planObj.meta === 'object') {
    planObj.meta._finalVisibleCleanupLog = cleanupLog;
    planObj.meta._finalVisibleCleanupDiagnostics = cleanupDiagnostics;
    planObj.meta._finalVisibleCleanupSummary = cleanupSummary;
  }
  return planObj;
}

function routeEnforceTrueFinalVisibleTargetFamilyCleanup(planObj) {
  if (!planObj || String(planObj?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return planObj;
  const weeks = Array.isArray(planObj?.weeks) ? planObj.weeks : [];
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.map((x) => String(x || '').toLowerCase()) : [];
  const combo = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.slice() : [];
  const cleanupLog = [];
  const cleanupDiagnostics = [];
  const cleanupSummary = {
    sameDayRedundancyBefore: 0,
    sameDayRedundancyAfter: 0,
    horizontal_row: { before: 0, after: 0 },
    squat_leg_press: { before: 0, after: 0 },
    shoulder_press: { before: 0, after: 0 }
  };
  for (const week of weeks) {
    for (const day of week?.days || []) {
      const dType = String(day?.dayType || '').toLowerCase();
      const beforeSnapshot = routeCanonicalRedundancySnapshot(dType, day?.exercises || []);
      cleanupSummary.sameDayRedundancyBefore += beforeSnapshot.sameDayRedundancy;
      cleanupSummary.horizontal_row.before += beforeSnapshot.counts.horizontal_row;
      cleanupSummary.squat_leg_press.before += beforeSnapshot.counts.squat_leg_press;
      cleanupSummary.shoulder_press.before += beforeSnapshot.counts.shoulder_press;
      day.exercises = routeEnforceCanonicalMovementFamilyRedundancy(dType, day.exercises || [], {
        priorityGroups,
        cleanupLog,
        cleanupDiagnostics,
        cleanupPhase: 'true_final_visible',
        cleanupFamilies: ['horizontal_row'],
        combo,
        week: Number(week?.weekIndex || week?.index || 0),
        day: String(day?.day || '').trim() || null
      });
      day.exercises = dType === 'deltsarms'
        ? routeDedupeFinalDeltsArmsDay(day.exercises || [], {
          week: Number(week?.weekIndex || week?.index || 0),
          day: String(day?.day || ''),
          dayType: String(day?.dayType || '')
        })
        : routeDedupeFinalDay(dType, day.exercises || []);
      routeMarkCanonicalCleanupDiagnosticsFinalState(cleanupDiagnostics, {
        week: Number(week?.weekIndex || week?.index || 0),
        day: String(day?.day || '').trim() || null,
        dayType: dType,
        list: day?.exercises || []
      });
      const afterSnapshot = routeCanonicalRedundancySnapshot(dType, day?.exercises || []);
      cleanupSummary.sameDayRedundancyAfter += afterSnapshot.sameDayRedundancy;
      cleanupSummary.horizontal_row.after += afterSnapshot.counts.horizontal_row;
      cleanupSummary.squat_leg_press.after += afterSnapshot.counts.squat_leg_press;
      cleanupSummary.shoulder_press.after += afterSnapshot.counts.shoulder_press;
    }
  }
  if (planObj.meta && typeof planObj.meta === 'object') {
    planObj.meta._finalVisibleCleanupLog = cleanupLog;
    planObj.meta._finalVisibleCleanupDiagnostics = cleanupDiagnostics;
    planObj.meta._finalVisibleCleanupSummary = cleanupSummary;
  }
  return planObj;
}

function routeRepairDeltsArmsRoleInvariant(planObj) {
  if (!planObj || String(planObj?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return planObj;
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.map((x) => String(x || '').toLowerCase()) : [];
  const absPriority = priorityGroups.includes('abs') || priorityGroups.includes('core');
  for (const week of Array.isArray(planObj?.weeks) ? planObj.weeks : []) {
    for (const day of Array.isArray(week?.days) ? week.days : []) {
      if (String(day?.dayType || '').toLowerCase() !== 'deltsarms') continue;
      const repaired = routeRepairDeltsArmsDayRoles(day, week, { absPriority });
      if (repaired?.error) return repaired.error;
      day.exercises = repaired.exercises;
    }
  }
  return planObj;
}

function routeEnsureAt(list, idx, replacementKey, isValid) {
  if (!Array.isArray(list) || idx < 0 || idx >= list.length) return;
  const item = list[idx];
  if (isValid && isValid(item)) return;
  list[idx] = routeApplyReplacement(item, routePickReplacement(replacementKey, list));
}

function routeReplaceByPredicate(list, predicate, replacementKey) {
  if (!Array.isArray(list)) return 0;
  let count = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (!predicate(list[i], i)) continue;
    list[i] = routeApplyReplacement(list[i], routePickReplacement(replacementKey, list));
    count += 1;
  }
  return count;
}

function routeReplacementKeysForExercise(dayType, ex, idx) {
  const type = String(dayType || '').toLowerCase();
  const n = routeNormName(ex?.name);
  const keys = [];
  if (routeIsCompound(ex)) {
    if (routeIsHorizontalPressMain(ex)) keys.push(type === 'upper' ? 'chest_secondary_press' : 'chest_main', 'chest_secondary_press');
    else if (routeIsShoulderPressName(n)) keys.push('shoulder_main');
    else if (routeIsVerticalPullName(n)) keys.push('vertical_pull', 'row_main');
    else if (routeIsRowName(n)) keys.push('row_main', 'vertical_pull');
    else if (routeIsStapleSquatName(n)) keys.push('squat_main');
    else if (routeIsHingeName(n)) keys.push('hinge_alt', 'hinge_main');
    else if (routeIsLungeName(n)) keys.push('lunge_main', 'squat_main');
  } else if (routeIsIsolation(ex)) {
    if (routeIsChestIsoName(n)) keys.push('chest_iso', 'chest_secondary_press');
    else if (routeIsLateralRaiseName(n)) keys.push('lateral_iso', 'rear_iso');
    else if (routeIsRearDeltName(n)) keys.push('rear_iso', 'lateral_iso');
    else if (routeIsBicepsIsoName(n)) keys.push('biceps_iso', 'rear_iso');
    else if (routeIsTricepsIsoName(n)) keys.push('triceps_iso', 'lateral_iso');
    else if (routeIsHamCurlName(n)) keys.push('ham_iso', 'leg_iso');
    else if (routeIsCalvesName(n)) keys.push('calves_iso');
    else if (routeIsCoreName(n)) {
      if (type === 'pull') keys.push('biceps_iso', 'rear_iso', 'row_main', 'core_iso');
      else if (type === 'push') keys.push('triceps_iso', 'lateral_iso', 'chest_iso', 'core_iso');
      else if (type === 'upper') keys.push('row_main', 'chest_secondary_press', 'core_iso');
      else if (type === 'deltsarms') keys.push('shoulder_main', 'lateral_iso');
      else if (type === 'legs' || type === 'lower') keys.push('core_iso', 'leg_iso');
      else keys.push('core_iso');
    }
  }
  keys.push(routeDefaultReplacementKey(type, idx));
  return Array.from(new Set(keys.filter(Boolean)));
}

function routeEnsureWeekUniqueNames(dayType, exercises, weekUsedNames) {
  if (!Array.isArray(exercises) || !exercises.length) return exercises;
  const list = exercises.slice();
  const type = String(dayType || '').toLowerCase();
  for (let i = 0; i < list.length; i += 1) {
    const initialName = routeNormName(list[i]?.name);
    if (!initialName) continue;
    if (!weekUsedNames.has(initialName)) {
      weekUsedNames.add(initialName);
      continue;
    }
    const keys = routeReplacementKeysForExercise(dayType, list[i], i);
    let replaced = false;
    for (const key of keys) {
      const spec = routePickReplacementMatching(key, list, (candidate) => {
        const candidateName = routeNormName(candidate?.name);
        if (!candidateName || weekUsedNames.has(candidateName)) return false;
        const next = routeApplyReplacement(list[i], candidate);
        return routeFitsDayType(next, dayType);
      });
      if (!spec) continue;
      list[i] = routeApplyReplacement(list[i], spec);
      const nextName = routeNormName(list[i]?.name);
      if (nextName && !weekUsedNames.has(nextName)) {
        weekUsedNames.add(nextName);
      }
      replaced = true;
      break;
    }
    if (!replaced) {
      const fallbackKeys = type === 'push'
        ? ['chest_secondary_press', 'triceps_iso', 'lateral_iso', 'chest_iso', 'shoulder_main', 'row_main', 'vertical_pull']
        : type === 'pull'
          ? ['row_main', 'vertical_pull', 'biceps_iso', 'rear_iso', 'chest_secondary_press', 'lateral_iso']
          : type === 'legs' || type === 'lower'
            ? ['squat_main', 'hinge_alt', 'hinge_main', 'ham_iso', 'leg_iso', 'calves_iso', 'core_iso']
            : type === 'deltsarms'
              ? ['shoulder_main', 'lateral_iso', 'rear_iso', 'biceps_iso', 'triceps_iso']
              : ['row_main', 'vertical_pull', 'chest_secondary_press', 'shoulder_main', 'biceps_iso', 'triceps_iso', 'core_iso'];
      for (const key of fallbackKeys) {
        const spec = routePickReplacementMatching(key, list, (candidate) => {
          const candidateName = routeNormName(candidate?.name);
          if (!candidateName || weekUsedNames.has(candidateName)) return false;
          const next = routeApplyReplacement(list[i], candidate);
          return routeFitsDayType(next, type);
        });
        if (!spec) continue;
        list[i] = routeApplyReplacement(list[i], spec);
        const nextName = routeNormName(list[i]?.name);
        if (nextName && !weekUsedNames.has(nextName)) weekUsedNames.add(nextName);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      // Keep it if no safe unique candidate exists. Integrity assertion will force a new seed if needed.
      weekUsedNames.add(initialName);
    }
  }
  return list;
}

function routeEnforceCoreCap(dayType, list, maxCore) {
  if (!Array.isArray(list) || maxCore < 0) return;
  let coreCount = 0;
  const type = String(dayType || '').toLowerCase();
  for (let i = 0; i < list.length; i += 1) {
    if (!routeIsCoreName(list[i]?.name)) continue;
    coreCount += 1;
    if (coreCount <= maxCore) continue;
    const replacementKey = type === 'push'
      ? 'triceps_iso'
      : type === 'pull'
        ? 'biceps_iso'
        : type === 'upper'
          ? 'chest_secondary_press'
          : type === 'upperfocus'
            ? 'biceps_iso'
            : type === 'lowerfocus'
              ? 'ham_iso'
              : type === 'fullbodya'
                ? 'row_main'
                : type === 'fullbodyb'
                  ? 'hinge_lengthened'
          : type === 'legs' || type === 'lower'
            ? 'ham_iso'
            : type === 'deltsarms'
              ? 'lateral_iso'
              : routeDefaultReplacementKey(type, i);
    list[i] = routeApplyReplacement(list[i], routePickReplacement(replacementKey, list));
  }
}

function routeNormalizeSetsByRole(dayType, list) {
  if (!Array.isArray(list) || !list.length) return;
  const type = String(dayType || '').toLowerCase();
  for (let i = 0; i < list.length; i += 1) {
    const ex = list[i];
    const n = routeNormName(ex?.name);
    const isComp = routeIsCompound(ex);
    const isMain = i === 0;
    const isSecondaryComp = isComp && i === 1;
    if (type === 'push' || type === 'upper') {
      if (isMain && routeIsHorizontalPressMain(ex)) ex.sets = Math.max(4, Math.min(4, Number(ex?.sets) || 4));
      else if (isSecondaryComp && routeIsShoulderPressName(n)) ex.sets = Math.max(2, Math.min(3, Number(ex?.sets) || 2));
      else if (isComp) ex.sets = Math.max(2, Math.min(3, Number(ex?.sets) || 2));
      else if (routeIsChestIsoName(n)) ex.sets = Math.max(2, Math.min(3, Number(ex?.sets) || 3));
      else ex.sets = Math.max(2, Math.min(4, Number(ex?.sets) || 2));
      continue;
    }
    if (type === 'pull') {
      if (i <= 1 && isComp) ex.sets = Math.max(3, Math.min(4, Number(ex?.sets) || 3));
      else if (isComp) ex.sets = Math.max(2, Math.min(3, Number(ex?.sets) || 2));
      else if (routeIsBicepsIsoName(n)) ex.sets = Math.max(3, Math.min(4, Number(ex?.sets) || 3));
      else ex.sets = Math.max(2, Math.min(4, Number(ex?.sets) || 2));
      continue;
    }
    if (type === 'legs' || type === 'lower') {
      if (isMain && routeIsStapleSquatName(n)) ex.sets = Math.max(3, Math.min(4, Number(ex?.sets) || 3));
      else if (isComp && routeIsHeavyDeadliftName(n)) ex.sets = Math.max(3, Math.min(4, Number(ex?.sets) || 3));
      else if (isComp && routeIsHingeName(n)) ex.sets = Math.max(2, Math.min(4, Number(ex?.sets) || 3));
      else if (routeIsHamCurlName(n)) ex.sets = Math.max(3, Math.min(4, Number(ex?.sets) || 3));
      else if (isComp) ex.sets = Math.max(2, Math.min(3, Number(ex?.sets) || 2));
      else ex.sets = Math.max(2, Math.min(4, Number(ex?.sets) || 2));
      continue;
    }
    if (type === 'deltsarms') {
      if (isMain && routeIsShoulderPressName(n)) ex.sets = Math.max(3, Math.min(4, Number(ex?.sets) || 3));
      else if (routeIsBicepsIsoName(n) || routeIsTricepsIsoName(n)) ex.sets = Math.max(3, Math.min(4, Number(ex?.sets) || 3));
      else ex.sets = Math.max(2, Math.min(4, Number(ex?.sets) || 2));
      continue;
    }
    ex.sets = Math.max(2, Math.min(4, Number(ex?.sets) || 2));
  }
}

function routeReplaceLastEligible(list, predicate, replacementKey) {
  const out = Array.isArray(list) ? list : [];
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (!predicate(out[i], i)) continue;
    out[i] = routeApplyReplacement(out[i], routePickReplacement(replacementKey, out));
    return true;
  }
  return false;
}

function routeFinalizeBodybuildingDay(dayType, list, { absPriority = false } = {}) {
  let out = Array.isArray(list) ? list.slice() : [];
  const type = String(dayType || '').toLowerCase();
  const maxCorePerDay = type === 'deltsarms' ? 0 : (absPriority && (type === 'legs' || type === 'lower') ? 2 : 1);
  const normalize = () => {
    out = routeDedupeIsolationFamilies(type, out);
    routeEnforceCoreCap(type, out, maxCorePerDay);
    out = routeDedupeIsolationFamilies(type, out);
    routeNormalizeSetsByRole(type, out);
    out = routeOrganizeDay(type, out);
  };

  normalize();

  if (type === 'legs' || type === 'lower') {
    if (!out.some((ex) => routeIsCalvesName(ex?.name))) {
      const replaced = routeReplaceLastEligible(
        out,
        (ex, idx) => idx > 0 && !routeIsStapleSquatName(ex?.name) && !routeIsHingeName(ex?.name) && !routeIsHamCurlName(ex?.name) && !routeIsCoreName(ex?.name),
        'calves_iso'
      );
      if (!replaced && out.length < 6) {
        out.push(routeApplyReplacement({ style: 'Isolation', pattern: 'Isolation', sets: 2 }, routePickReplacement('calves_iso', out)));
      } else if (!replaced) {
        routeReplaceLastEligible(out, (ex, idx) => idx > 0 && routeIsCoreName(ex?.name), 'calves_iso');
      }
    }
    if (!out.some((ex) => routeIsCoreName(ex?.name))) {
      const replaced = routeReplaceLastEligible(
        out,
        (ex, idx) => idx > 0 && !routeIsStapleSquatName(ex?.name) && !routeIsHingeName(ex?.name) && !routeIsHamCurlName(ex?.name) && !routeIsCalvesName(ex?.name),
        'core_iso'
      );
      if (!replaced && out.length < 6) {
        out.push(routeApplyReplacement({ style: 'Isolation', pattern: 'CoreFlexion', sets: 2 }, routePickReplacement('core_iso', out)));
      } else if (!replaced) {
        routeReplaceLastEligible(out, (ex, idx) => idx > 0 && routeIsCalvesName(ex?.name), 'core_iso');
      }
    }
    normalize();
  }

  normalize();
  return out;
}

function routeLowerDayHingeFailure(day, week, message, reason, details = null) {
  const list = Array.isArray(day?.exercises) ? day.exercises : [];
  return {
    error: 'PLAN_BUILD_FAILED',
    message,
    reason,
    functionName: 'routeRepairLowerDayHingeInvariant',
    stage: 'routeRepairLowerDayHingeInvariant',
    failedStage: 'routeRepairLowerDayHingeInvariant',
    week: Number(week?.weekIndex || week?.index || 0) || 0,
    day: String(day?.day || day?.label || day?.dayType || '').trim() || undefined,
    dayType: String(day?.dayType || '').trim() || undefined,
    finalVisibleDayExercises: list.map((ex) => String(ex?.name || '').trim()).filter(Boolean),
    lowerExerciseFamilies: list.map((ex) => routeGetCanonicalMovementFamily(ex)).filter(Boolean),
    failedDayExercises: list
      .filter((ex) => routeIsHingeName(ex?.name) || routeIsStapleSquatName(ex?.name) || routeIsLungeName(ex?.name) || routeIsCoreName(ex?.name))
      .map((ex) => String(ex?.name || '').trim())
      .filter(Boolean),
    hingeDeadliftExercisesInWeek: list
      .filter((ex) => routeIsHingeName(ex?.name))
      .map((ex) => String(ex?.name || '').trim())
      .filter(Boolean),
    heavyDeadliftExercisesInWeek: list
      .filter((ex) => routeIsHeavyDeadliftName(ex?.name))
      .map((ex) => String(ex?.name || '').trim())
      .filter(Boolean),
    sameDayHeavyHingeCount: list.filter((ex) => routeIsHeavyDeadliftName(ex?.name)).length,
    ...((details && typeof details === 'object') ? details : {})
  };
}

function routeIsGluteHamRaiseName(name) {
  return /glute ham raise/.test(routeNormName(name));
}

function routeLowerDayHasQuadWork(exercises) {
  return (Array.isArray(exercises) ? exercises : []).some((ex) => {
    const name = routeNormName(ex?.name);
    return routeIsStapleSquatName(name) || /\bleg extension\b/.test(name) || routeIsLungeName(name);
  });
}

function routeLowerDayHasPosteriorWork(exercises) {
  return (Array.isArray(exercises) ? exercises : []).some((ex) => routeIsHingeName(ex?.name) || routeIsHamCurlName(ex?.name) || routeIsGluteHamRaiseName(ex?.name));
}

function routeHasDuplicateIsolationFamily(exercises) {
  const seen = new Set();
  for (const ex of Array.isArray(exercises) ? exercises : []) {
    if (!routeIsIsolation(ex)) continue;
    const fam = isolationFamilyForName(ex?.name);
    if (!fam) continue;
    if (seen.has(fam)) return true;
    seen.add(fam);
  }
  return false;
}

function routeHeavyHingeKeepScore(exercise) {
  const name = routeNormName(exercise?.name);
  if (!name) return -1000;
  let score = 0;
  if (name === 'romanian deadlift') score += 100;
  else if (routeIsRdlName(name) && !/deficit/.test(name)) score += 90;
  else if (routeIsRdlName(name)) score += 80;
  else if (routeIsLengthenedHingeName(name) && !/smith/.test(name)) score += 70;
  else if (routeIsLengthenedHingeName(name)) score += 60;
  if (routeIsHeavyDeadliftName(name)) score += 10;
  return score;
}

function routePickSameDayHeavyHingeReplacementSpec(dayType, exercises, {
  replaceIdx = -1,
  glutesSelected = false,
  legsSelected = false,
  absPriority = false
} = {}) {
  const list = Array.isArray(exercises) ? exercises : [];
  const others = list.filter((_, idx) => idx !== replaceIdx);
  const hasGluteSlot = others.some((ex) => /\b(hip thrust|glute bridge)\b/.test(routeNormName(ex?.name)));
  const hasHamCurl = others.some((ex) => routeIsHamCurlName(ex?.name));
  const hasGhr = others.some((ex) => routeIsGluteHamRaiseName(ex?.name));
  const hasCalves = others.some((ex) => routeIsCalvesName(ex?.name));
  const hasCore = others.some((ex) => routeIsCoreName(ex?.name));
  const attempts = [];
  if (glutesSelected || !hasGluteSlot) {
    attempts.push(() => routePickReplacementMatching('hinge_alt', others, (spec) => !routeIsHeavyDeadliftName(spec?.name)));
  }
  if (!hasHamCurl) {
    attempts.push(() => routePickReplacementMatching('ham_iso', others, (spec) => !routeIsHeavyDeadliftName(spec?.name)));
  }
  if (!hasGhr) {
    attempts.push(() => (
      others.some((ex) => routeNormName(ex?.name) === routeNormName('Glute Ham Raise'))
        ? null
        : { name: 'Glute Ham Raise', pattern: 'Hinge', style: 'Compound', primary: 'Legs' }
    ));
  }
  if (legsSelected && !hasCalves) {
    attempts.push(() => routePickReplacement('calves_iso', others));
  }
  if (absPriority && !hasCore) {
    attempts.push(() => routePickReplacementMatching('core_iso', others, (spec) => !/^(cable crunch|rope crunch|ab crunch machine)$/i.test(String(spec?.name || ''))));
    attempts.push(() => routePickReplacement('core_iso', others));
  }
  for (const pick of attempts) {
    const spec = typeof pick === 'function' ? pick() : null;
    if (!spec?.name) continue;
    if (routeIsHeavyDeadliftName(spec?.name)) continue;
    return spec;
  }
  return null;
}

function routeTryRepairSameDayHeavyHingeStacking(dayType, exercises, {
  glutesSelected = false,
  legsSelected = false,
  absPriority = false
} = {}) {
  let list = Array.isArray(exercises) ? exercises.slice() : [];
  const requiresLowerQuadSafety = ['lower', 'lowerfocus'].includes(String(dayType || '').toLowerCase());
  const heavyIdxs = list
    .map((ex, idx) => (routeIsHeavyDeadliftName(ex?.name) ? idx : -1))
    .filter((idx) => idx >= 0);
  if (heavyIdxs.length < 2) {
    return { exercises: list, changed: false, noSafeReplacementFound: false };
  }

  const ranked = heavyIdxs
    .map((idx) => ({ idx, score: routeHeavyHingeKeepScore(list[idx]) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);
  const keepIdx = ranked[0]?.idx ?? heavyIdxs[0];
  let changed = false;
  let noSafeReplacementFound = false;

  for (const idx of heavyIdxs.filter((value) => value !== keepIdx).sort((a, b) => b - a)) {
    const heavyCountBefore = list.filter((ex) => routeIsHeavyDeadliftName(ex?.name)).length;
    if (heavyCountBefore < 2) break;
    const spec = routePickSameDayHeavyHingeReplacementSpec(dayType, list, {
      replaceIdx: idx,
      glutesSelected,
      legsSelected,
      absPriority
    });
    if (!spec) {
      noSafeReplacementFound = true;
      continue;
    }
    const candidate = list.slice();
    candidate[idx] = routeApplyReplacement(candidate[idx], spec);
    let finalized = routeFinalizeBodybuildingDay(dayType, candidate, { absPriority });
    finalized = routeDedupeFinalDay(dayType, finalized);
    finalized = routeFinalizeBodybuildingDay(dayType, finalized, { absPriority });
    const heavyCountAfter = finalized.filter((ex) => routeIsHeavyDeadliftName(ex?.name)).length;
    const safe =
      heavyCountAfter < heavyCountBefore
      && (!requiresLowerQuadSafety || routeLowerDayHasQuadWork(finalized))
      && routeLowerDayHasPosteriorWork(finalized)
      && finalized.some((ex) => routeIsLengthenedHingeName(ex?.name))
      && !routeDuplicateNamesForDay({ exercises: finalized }).length
      && !routeHasDuplicateIsolationFamily(finalized);
    if (!safe) {
      noSafeReplacementFound = true;
      continue;
    }
    list = finalized;
    changed = true;
  }

  return { exercises: list, changed, noSafeReplacementFound };
}

function routeWeeklyHeavyHingeKeepScoreForDay(dayType, exercises) {
  const type = String(dayType || '').toLowerCase();
  const list = Array.isArray(exercises) ? exercises : [];
  let score = 0;
  if (type === 'lowerfocus') score += 100;
  else if (type === 'lower') score += 90;
  else if (type === 'fullbodyb') score += 40;
  else if (type === 'fullbodya') score += 30;
  const heavyNames = list.filter((ex) => routeIsHeavyDeadliftName(ex?.name)).map((ex) => routeNormName(ex?.name));
  if (heavyNames.some((name) => name === 'romanian deadlift')) score += 30;
  else if (heavyNames.some((name) => routeIsRdlName(name) && !/deficit/.test(name))) score += 20;
  else if (heavyNames.some((name) => routeIsRdlName(name))) score += 10;
  if (heavyNames.some((name) => /smith/.test(name))) score -= 5;
  return score;
}

function routePickWeeklyHeavyHingeReplacementSpec(dayType, exercises, {
  replaceIdx = -1,
  glutesSelected = false,
  legsSelected = false,
  absPriority = false
} = {}) {
  const list = Array.isArray(exercises) ? exercises : [];
  const others = list.filter((_, idx) => idx !== replaceIdx);
  const hasGluteSlot = others.some((ex) => /\b(hip thrust|glute bridge)\b/.test(routeNormName(ex?.name)));
  const hasHamCurl = others.some((ex) => routeIsHamCurlName(ex?.name));
  const hasGhr = others.some((ex) => routeIsGluteHamRaiseName(ex?.name));
  const hasBackExtension = others.some((ex) => /(back extension|hyperextension)/.test(routeNormName(ex?.name)));
  const hasCalves = others.some((ex) => routeIsCalvesName(ex?.name));
  const hasCore = others.some((ex) => routeIsCoreName(ex?.name));
  const attempts = [];
  attempts.push(() => routePickReplacementMatching('hinge_alt', others, (spec) => !routeIsHeavyDeadliftName(spec?.name)));
  if (!hasHamCurl) attempts.push(() => routePickReplacementMatching('ham_iso', others, (spec) => !routeIsHeavyDeadliftName(spec?.name)));
  if (!hasGhr) {
    attempts.push(() => (
      others.some((ex) => routeNormName(ex?.name) === routeNormName('Glute Ham Raise'))
        ? null
        : { name: 'Glute Ham Raise', pattern: 'Hinge', style: 'Compound', primary: glutesSelected ? 'Glutes' : 'Legs' }
    ));
  }
  if (!hasBackExtension) {
    attempts.push(() => (
      others.some((ex) => routeNormName(ex?.name) === routeNormName('Back Extension'))
        ? null
        : { name: 'Back Extension', pattern: 'Hinge', style: 'Compound', primary: 'Legs' }
    ));
  }
  if (legsSelected && !hasCalves) attempts.push(() => routePickReplacement('calves_iso', others));
  if (absPriority && !hasCore) {
    attempts.push(() => routePickReplacementMatching('core_iso', others, (spec) => !/^(cable crunch|rope crunch|ab crunch machine)$/i.test(String(spec?.name || ''))));
    attempts.push(() => routePickReplacement('core_iso', others));
  }
  for (const pick of attempts) {
    const spec = typeof pick === 'function' ? pick() : null;
    if (!spec?.name) continue;
    if (routeIsHeavyDeadliftName(spec?.name)) continue;
    return spec;
  }
  return null;
}

function routeTryRepairWeeklySeparatedHeavyHingeDuplication(week, {
  glutesSelected = false,
  legsSelected = false,
  absPriority = false
} = {}) {
  const days = Array.isArray(week?.days) ? week.days : [];
  const entriesByRole = new Map();
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const day = days[dayIndex];
    const dayType = String(day?.dayType || '').toLowerCase();
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
      const ex = exercises[exerciseIndex];
      if (!routeIsHeavyDeadliftName(ex?.name)) continue;
      const role = routeHeavyHingeRoleName(ex?.name);
      if (!role) continue;
      const bucket = entriesByRole.get(role) || [];
      bucket.push({
        role,
        dayIndex,
        dayType,
        exerciseIndex,
        exerciseName: String(ex?.name || ''),
        keepScore: routeWeeklyHeavyHingeKeepScoreForDay(dayType, exercises)
      });
      entriesByRole.set(role, bucket);
    }
  }

  let changed = false;
  let noSafeReplacementFound = false;
  for (const entries of entriesByRole.values()) {
    const uniqueDays = new Set(entries.map((entry) => entry.dayIndex));
    if (uniqueDays.size <= 1) continue;
    const sorted = entries.slice().sort((a, b) => b.keepScore - a.keepScore || a.dayIndex - b.dayIndex || a.exerciseIndex - b.exerciseIndex);
    const keep = sorted[0];
    const replaceEntries = sorted
      .filter((entry) => !(entry.dayIndex === keep.dayIndex && entry.exerciseIndex === keep.exerciseIndex))
      .sort((a, b) => b.dayIndex - a.dayIndex || b.exerciseIndex - a.exerciseIndex);

    for (const entry of replaceEntries) {
      const day = days[entry.dayIndex];
      const dayType = String(day?.dayType || '').toLowerCase();
      const exercises = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
      const spec = routePickWeeklyHeavyHingeReplacementSpec(dayType, exercises, {
        replaceIdx: entry.exerciseIndex,
        glutesSelected,
        legsSelected,
        absPriority
      });
      if (!spec) {
        noSafeReplacementFound = true;
        continue;
      }
      const candidate = exercises.slice();
      candidate[entry.exerciseIndex] = routeApplyReplacement(candidate[entry.exerciseIndex], spec);
      let finalized = routeFinalizeBodybuildingDay(dayType, candidate, { absPriority });
      finalized = dayType === 'deltsarms' ? routeDedupeFinalDeltsArmsDay(finalized, {}) : routeDedupeFinalDay(dayType, finalized);
      finalized = routeFinalizeBodybuildingDay(dayType, finalized, { absPriority });

      const weekExercisesAfter = days.flatMap((candidateDay, idx) => (
        idx === entry.dayIndex ? finalized : (Array.isArray(candidateDay?.exercises) ? candidateDay.exercises : [])
      ));
      const safe =
        weekExercisesAfter.some((ex) => routeIsLengthenedHingeName(ex?.name))
        && !routeDuplicateNamesForDay({ exercises: finalized }).length
        && !routeHasDuplicateIsolationFamily(finalized)
        && (!['lower', 'lowerfocus'].includes(dayType) || routeLowerDayHasQuadWork(finalized))
        && (!['lower', 'lowerfocus'].includes(dayType) || routeLowerDayHasPosteriorWork(finalized))
        && finalized.some((ex) => routeGetCanonicalMovementFamily(ex) !== 'hinge_posterior_chain' || !routeIsHeavyDeadliftName(ex?.name) || routeNormName(ex?.name) !== routeNormName(entry.exerciseName));
      if (!safe) {
        noSafeReplacementFound = true;
        continue;
      }
      day.exercises = finalized;
      changed = true;
    }
  }
  return { changed, noSafeReplacementFound };
}

function routePickLowerDayHingeSpec(dayExercises, { gluteBias = false, requireLengthened = false } = {}) {
  const list = Array.isArray(dayExercises) ? dayExercises : [];
  if (requireLengthened) {
    return routePickReplacementMatching('hinge_lengthened', list, (spec) => routeIsLengthenedHingeName(spec?.name))
      || routePickReplacement('hinge_lengthened', list);
  }
  if (gluteBias) {
    return routePickReplacementMatching('hinge_alt', list, (spec) => routeIsHingeName(spec?.name))
      || routePickReplacementMatching('hinge_main', list, (spec) => routeIsHingeName(spec?.name) && !routeIsLengthenedHingeName(spec?.name))
      || routePickReplacement('hinge_alt', list)
      || routePickReplacement('hinge_main', list);
  }
  return routePickReplacementMatching('hinge_main', list, (spec) => routeIsHingeName(spec?.name))
    || routePickReplacement('hinge_main', list)
    || routePickReplacement('hinge_alt', list);
}

function routeFindLengthenedHingeInsertionIndex(dayType, exercises) {
  const list = Array.isArray(exercises) ? exercises : [];
  const type = String(dayType || '').toLowerCase();
  const preferredIsolationIdx = list.findIndex((ex, exIdx) => (
    exIdx > 1
    && routeIsIsolation(ex)
    && !routeIsCalvesName(ex?.name)
    && !routeIsCoreName(ex?.name)
  ));
  if (preferredIsolationIdx >= 0) return preferredIsolationIdx;
  const preferredAccessoryIdx = list.findIndex((ex, exIdx) => (
    exIdx > 1
    && !routeIsCalvesName(ex?.name)
    && !routeIsCoreName(ex?.name)
    && !routeIsHorizontalPressMain(ex)
    && !routeIsVerticalPullName(ex?.name)
    && !routeIsRowName(ex?.name)
    && !(type === 'legs' || type === 'lower' || type === 'lowerfocus' || type === 'fullbodya' || type === 'fullbodyb')
  ));
  if (preferredAccessoryIdx >= 0) return preferredAccessoryIdx;
  return list.findIndex((ex, exIdx) => exIdx > 0 && !routeIsCalvesName(ex?.name) && !routeIsCoreName(ex?.name));
}

function routeFindLowerDayHingeReplacementIndex(dayType, exercises, { absPriority = false } = {}) {
  const list = Array.isArray(exercises) ? exercises : [];
  const replaceable = [];
  const wouldKeepQuadWork = (idx) => routeLowerDayHasQuadWork(list.filter((_, exIdx) => exIdx !== idx));
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const ex = list[i];
    const name = routeNormName(ex?.name);
    if (!name || routeIsHingeName(name) || routeIsStapleSquatName(name)) continue;
    let score = -1000;
    if (routeIsCalvesName(name)) score = 10;
    else if (routeIsHamCurlName(name)) score = 20;
    else if (/\bleg extension\b/.test(name)) score = wouldKeepQuadWork(i) ? 30 : -100;
    else if (routeIsLungeName(name)) score = wouldKeepQuadWork(i) ? 25 : -100;
    else if (routeIsCoreName(name)) score = absPriority ? 35 : 5;
    else if (routeIsIsolation(ex)) score = 15;
    else if (routeFitsDayType(ex, dayType)) score = 12;
    if (score > -1000) replaceable.push({ index: i, score });
  }
  replaceable.sort((a, b) => b.score - a.score || b.index - a.index);
  return replaceable[0]?.index ?? -1;
}

function routeRearDeltTrimScore(entry) {
  const dayType = String(entry?.dayType || '').toLowerCase();
  let score = 0;
  if (Number(entry?.dayRearDeltCount || 0) > 1) score += 30;
  if (dayType === 'push') score += 24;
  else if (dayType === 'upper') score += 18;
  else if (dayType === 'upperfocus') score += 16;
  else if (dayType === 'fullbodya' || dayType === 'fullbodyb') score += 14;
  else if (dayType === 'pull') score += 8;
  else if (dayType === 'deltsarms') score -= 12;
  score += Math.max(0, 6 - Math.max(0, Number(entry?.sets || 0)));
  score += Number(entry?.exerciseIndex || 0) * 0.1;
  return score;
}

function routeBuildRearDeltReplacementSpecs(day, snapshot) {
  const dayType = String(day?.dayType || '').toLowerCase();
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const lateralCount = exercises.filter((exercise) => routeIsIsolation(exercise) && routeIsLateralRaiseName(exercise?.name)).length;
  const chestPressCompoundCount = exercises.filter((exercise) => routeIsHorizontalPressMain(exercise)).length;
  const specs = [];
  if (snapshot?.shouldersPriority && lateralCount < 2 && ['push', 'upper', 'upperfocus', 'deltsarms', 'fullbodya', 'fullbodyb'].includes(dayType)) {
    specs.push({
      key: 'lateral_iso',
      accept: (candidate) => routeIsLateralRaiseName(candidate?.name)
    });
  }
  if (snapshot?.chestPriority && ['push', 'upper', 'upperfocus', 'fullbodya', 'fullbodyb'].includes(dayType) && chestPressCompoundCount < 2) {
    specs.push({
      key: 'chest_iso',
      accept: (candidate) => routeIsChestIsoName(candidate?.name)
    });
  }
  if (snapshot?.backPriority && ['pull', 'upper', 'upperfocus', 'fullbodya', 'fullbodyb'].includes(dayType)) {
    specs.push({
      key: 'row_main',
      accept: (candidate) => routeIsRowName(candidate?.name) && !routeIsRearDeltName(candidate?.name)
    });
    specs.push({
      key: 'vertical_pull',
      accept: (candidate) => routeIsVerticalPullName(candidate?.name) && !routeIsRearDeltName(candidate?.name)
    });
  }
  if (snapshot?.armsPriority) {
    if (['push', 'upper', 'upperfocus', 'deltsarms', 'fullbodya', 'fullbodyb'].includes(dayType)) {
      specs.push({
        key: 'triceps_iso',
        accept: (candidate) => routeIsTricepsIsoName(candidate?.name)
      });
    }
    if (['pull', 'upper', 'upperfocus', 'deltsarms', 'fullbodya', 'fullbodyb'].includes(dayType)) {
      specs.push({
        key: 'biceps_iso',
        accept: (candidate) => routeIsBicepsIsoName(candidate?.name)
      });
    }
  }
  if (dayType !== 'deltsarms') {
    specs.push({
      key: 'core_iso',
      accept: (candidate) => routeIsCoreName(candidate?.name)
    });
  }
  return specs;
}

function routeFinalizeRearDeltCleanupDay(dayType, exercises, { absPriority = false } = {}) {
  const normalizedType = String(dayType || '').toLowerCase();
  let out = routeFinalizeBodybuildingDay(normalizedType, Array.isArray(exercises) ? exercises.slice() : [], { absPriority });
  out = routeEnsureDayAccessoryInvariant(normalizedType, out);
  out = normalizedType === 'deltsarms'
    ? routeDedupeFinalDeltsArmsDay(out, {})
    : routeDedupeFinalDay(normalizedType, out);
  return routeOrganizeDay(normalizedType, out);
}

function routeRepairRearDeltFrequencyInvariant(planObj) {
  if (!planObj || String(planObj?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return planObj;
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.map((x) => String(x || '').toLowerCase()) : [];
  const absPriority = priorityGroups.includes('abs') || priorityGroups.includes('core');
  for (const week of Array.isArray(planObj?.weeks) ? planObj.weeks : []) {
    let passes = 0;
    while (passes < 12) {
      passes += 1;
      const snapshot = routeCollectRearDeltWeekState(week, priorityGroups);
      console.warn('rear_delt_frequency_check', {
        week: snapshot.week,
        rearDeltDays: snapshot.dayCount,
        rearDeltSets: snapshot.totalSets,
        allowedDayCap: snapshot.dayCap,
        hardSetCap: snapshot.hardSetCap,
        shouldersPriority: snapshot.shouldersPriority,
        backPriority: snapshot.backPriority
      });
      const exceedsDays = snapshot.dayCount > snapshot.dayCap;
      const exceedsSets = snapshot.totalSets > snapshot.hardSetCap;
      if (!exceedsDays && !exceedsSets) {
        console.warn('rear_delt_validation_result', {
          week: snapshot.week,
          rearDeltDays: snapshot.dayCount,
          rearDeltSets: snapshot.totalSets,
          allowedDayCap: snapshot.dayCap,
          hardSetCap: snapshot.hardSetCap,
          valid: true
        });
        break;
      }
      console.warn('rear_delt_cleanup_entry', {
        week: snapshot.week,
        rearDeltDays: snapshot.dayCount,
        rearDeltSets: snapshot.totalSets,
        allowedDayCap: snapshot.dayCap,
        hardSetCap: snapshot.hardSetCap
      });
      let changed = false;
      const rankedEntries = snapshot.entries
        .slice()
        .sort((a, b) => routeRearDeltTrimScore(b) - routeRearDeltTrimScore(a) || b.exerciseIndex - a.exerciseIndex);
      for (const entry of rankedEntries) {
        const day = entry?.day;
        if (!day) continue;
        const dayType = String(day?.dayType || '').toLowerCase();
        if (dayType === 'deltsarms') continue;
        const current = day?.exercises?.[entry.exerciseIndex];
        if (!current || !routeIsIsolation(current) || !routeIsRearDeltName(current?.name)) continue;
        const dayInfo = snapshot.byDay.get(entry.dayKey);
        const removingWholeExposureDay = Number(dayInfo?.count || 0) <= 1;
        const exposureDaysAfterTrim = snapshot.dayCount - (removingWholeExposureDay ? 1 : 0);
        const specs = routeBuildRearDeltReplacementSpecs(day, snapshot);
        for (const spec of specs) {
          const specCandidate = routePickReplacementMatching(spec.key, day.exercises.filter((_, idx) => idx !== entry.exerciseIndex), spec.accept);
          if (!specCandidate) continue;
          const trialList = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
          if (!routeApplyUniqueReplacementAtIndex(trialList, entry.exerciseIndex, specCandidate)) continue;
          const finalized = routeFinalizeRearDeltCleanupDay(dayType, trialList, { absPriority });
          const trialWeek = {
            ...week,
            days: (week?.days || []).map((candidateDay) => candidateDay !== day ? candidateDay : { ...day, exercises: finalized })
          };
          const trialSnapshot = routeCollectRearDeltWeekState(trialWeek, priorityGroups);
          if (trialSnapshot.dayCount < snapshot.minExposureDays) continue;
          day.exercises = finalized;
          console.warn('rear_delt_cleanup_trim', {
            week: snapshot.week,
            day: String(day?.day || day?.dayType || '').trim() || '',
            dayType,
            action: 'replace',
            removedExercise: String(current?.name || '').trim() || '',
            replacementExercise: String(day.exercises?.[entry.exerciseIndex]?.name || specCandidate?.name || '').trim() || '',
            replacementKey: spec.key,
            rearDeltDays: trialSnapshot.dayCount,
            rearDeltSets: trialSnapshot.totalSets
          });
          changed = true;
          break;
        }
        if (changed) break;
        const exercisesAfterRemoval = (Array.isArray(day?.exercises) ? day.exercises.length : 0) - 1;
        if (exposureDaysAfterTrim >= snapshot.minExposureDays && exercisesAfterRemoval >= 5) {
          const nextExercises = (day?.exercises || []).filter((_, idx) => idx !== entry.exerciseIndex);
          day.exercises = routeFinalizeRearDeltCleanupDay(dayType, nextExercises, { absPriority });
          const trialSnapshot = routeCollectRearDeltWeekState(week, priorityGroups);
          console.warn('rear_delt_cleanup_trim', {
            week: snapshot.week,
            day: String(day?.day || day?.dayType || '').trim() || '',
            dayType,
            action: 'remove',
            removedExercise: String(current?.name || '').trim() || '',
            rearDeltDays: trialSnapshot.dayCount,
            rearDeltSets: trialSnapshot.totalSets
          });
          changed = true;
          break;
        }
      }
      if (!changed) {
        console.warn('rear_delt_cleanup_skip', {
          week: snapshot.week,
          rearDeltDays: snapshot.dayCount,
          rearDeltSets: snapshot.totalSets,
          allowedDayCap: snapshot.dayCap,
          hardSetCap: snapshot.hardSetCap,
          reason: 'no_safe_rear_delt_trim'
        });
        break;
      }
    }
    const finalSnapshot = routeCollectRearDeltWeekState(week, priorityGroups);
    console.warn('rear_delt_cleanup_exit', {
      week: finalSnapshot.week,
      rearDeltDays: finalSnapshot.dayCount,
      rearDeltSets: finalSnapshot.totalSets,
      allowedDayCap: finalSnapshot.dayCap,
      hardSetCap: finalSnapshot.hardSetCap
    });
  }
  return planObj;
}

function routeRepairLowerDayHingeInvariant(planObj) {
  if (!planObj || String(planObj?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return planObj;
  const weeks = Array.isArray(planObj?.weeks) ? planObj.weeks : [];
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups)
    ? planObj.meta.priorityGroups.map((x) => String(x || '').toLowerCase())
    : [];
  const absPriority = priorityGroups.includes('abs') || priorityGroups.includes('core');
  const gluteBias = priorityGroups.includes('glutes') || priorityGroups.includes('hamstrings/glutes');
  const legsSelected = priorityGroups.includes('legs') || priorityGroups.includes('quads');

  for (const week of weeks) {
    const days = Array.isArray(week?.days) ? week.days : [];
    for (const day of days) {
      const dayType = String(day?.dayType || '').toLowerCase();
      if (!['lower', 'lowerfocus', 'fullbodya', 'fullbodyb'].includes(dayType)) continue;
      let list = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
      if (!list.length) {
        return routeLowerDayHingeFailure(day, week, 'Lower day must include one hinge pattern.', 'Lower day had no exercises available for hinge repair.');
      }
      const sameDayHeavyRepair = routeTryRepairSameDayHeavyHingeStacking(dayType, list, {
        glutesSelected: gluteBias,
        legsSelected,
        absPriority
      });
      list = sameDayHeavyRepair.exercises;
      if (['fullbodya', 'fullbodyb'].includes(dayType)) {
        day.exercises = list;
        continue;
      }
      if (sameDayHeavyRepair.changed) {
        day.exercises = list;
      }
      if (list.some((ex) => routeIsHingeName(ex?.name))) continue;

      const requireLengthened = !days.some((candidateDay) => (candidateDay?.exercises || []).some((ex) => routeIsLengthenedHingeName(ex?.name)));
      const hingeSpec = routePickLowerDayHingeSpec(list, { gluteBias, requireLengthened });
      if (!hingeSpec) {
        return routeLowerDayHingeFailure(day, week, 'Lower day must include one hinge pattern.', 'No valid hinge replacement was available for this lower day.');
      }
      const quadWorkBeforeRepair = routeLowerDayHasQuadWork(list);

      const replaceIdx = routeFindLowerDayHingeReplacementIndex(dayType, list, { absPriority });
      if (replaceIdx >= 0) {
        list[replaceIdx] = routeApplyReplacement(list[replaceIdx], hingeSpec);
      } else if (list.length < 6) {
        list.push(routeApplyReplacement({ style: 'Compound', pattern: 'Hinge', sets: 2, primary: gluteBias ? 'Glutes' : 'Legs' }, hingeSpec));
      } else {
        const fallbackIdx = !absPriority
          ? list.findIndex((ex, idx) => idx > 0 && routeIsCoreName(ex?.name))
          : -1;
        if (fallbackIdx < 0) {
          return routeLowerDayHingeFailure(day, week, 'Lower day must include one hinge pattern.', 'No removable lower-body accessory was available for hinge repair.');
        }
        list[fallbackIdx] = routeApplyReplacement(list[fallbackIdx], hingeSpec);
      }

      if (quadWorkBeforeRepair && !routeLowerDayHasQuadWork(list)) {
        return routeLowerDayHingeFailure(day, week, 'Lower day must include one hinge pattern.', 'Hinge repair would remove all quad work from the lower day.', {
          safestRepairCandidate: hingeSpec?.name || null,
          safeHeavyHingeReplacementCandidate: hingeSpec?.name ? { replace: hingeSpec.name, reason: 'restore_lower_day_hinge' } : null,
          removingOrReplacingWouldBreakLowerDayStructure: true
        });
      }

      list = routeFinalizeBodybuildingDay(dayType, list, { absPriority });
      list = routeDedupeFinalDay(dayType, list);
      list = routeFinalizeBodybuildingDay(dayType, list, { absPriority });
      if (routeDuplicateNamesForDay({ exercises: list }).length) {
        return routeLowerDayHingeFailure(day, week, 'Lower day hinge repair created duplicate exercises.', 'Hinge repair could not satisfy same-day duplicate constraints.');
      }
      if (!list.some((ex) => routeIsHingeName(ex?.name))) {
        return routeLowerDayHingeFailure(day, week, 'Lower day must include one hinge pattern.', 'Hinge repair could not place a hinge after final day normalization.');
      }
      day.exercises = list;
    }
    routeTryRepairWeeklySeparatedHeavyHingeDuplication(week, {
      glutesSelected: gluteBias,
      legsSelected,
      absPriority
    });
  }
  return planObj;
}

function routeFinalizeBodybuildingPlan(planObj) {
  if (!planObj || String(planObj?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return planObj;
  const weeks = Array.isArray(planObj?.weeks) ? planObj.weeks : [];
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.map((x) => String(x || '').toLowerCase()) : [];
  const absPriority = priorityGroups.includes('abs') || priorityGroups.includes('core');
  for (const week of weeks) {
    for (const day of week?.days || []) {
      day.exercises = routeFinalizeBodybuildingDay(String(day?.dayType || '').toLowerCase(), day?.exercises || [], { absPriority });
    }
    const allDays = Array.isArray(week?.days) ? week.days : [];
    const hasLengthenedHinge = allDays.some((day) => (day?.exercises || []).some((ex) => routeIsLengthenedHingeName(ex?.name)));
    if (!hasLengthenedHinge) {
      const preferredTypes = ['legs', 'lower', 'lowerfocus', 'fullbodyb', 'fullbodya', 'upperfocus', 'upper', 'pull', 'push'];
      const targetDay = preferredTypes
        .map((type) => allDays.find((day) => String(day?.dayType || '').toLowerCase() === type))
        .find(Boolean);
      if (targetDay) {
        const dType = String(targetDay?.dayType || '').toLowerCase();
        const exs = Array.isArray(targetDay?.exercises) ? targetDay.exercises.slice() : [];
        const lengthenedSpec = routePickReplacementMatching('hinge_lengthened', exs, (spec) => routeIsLengthenedHingeName(spec?.name))
          || routePickReplacement('hinge_lengthened', exs);
        let idx = routeFindLengthenedHingeInsertionIndex(dType, exs);
        if (idx < 0 && exs.length < 6) {
          exs.push(routeApplyReplacement({ style: 'Compound', pattern: 'Hinge', sets: 2 }, lengthenedSpec));
        } else {
          if (idx < 0) idx = Math.min(1, Math.max(0, exs.length - 1));
          exs[idx] = routeApplyReplacement(exs[idx], lengthenedSpec);
        }
        targetDay.exercises = routeFinalizeBodybuildingDay(dType, exs, { absPriority });
      }
    }
  }
  return planObj;
}

function routeOrganizeDay(dayType, exercises) {
  const src = Array.isArray(exercises) ? exercises.slice() : [];
  if (src.length <= 1) return src;
  const remaining = src.slice();
  const ordered = [];
  const type = String(dayType || '').toLowerCase();
  const isCompound = (ex) => String(ex?.style || '').toLowerCase() === 'compound';
  const isArms = (ex) => routeIsBicepsIsoName(ex?.name) || routeIsTricepsIsoName(ex?.name);
  const isCalves = (ex) => routeIsCalvesName(ex?.name);
  const isCore = (ex) => routeIsCoreName(ex?.name);
  const mainPredicate = (ex) => {
    const n = routeNormName(ex?.name);
    if (!isCompound(ex)) return false;
    if (type === 'push') return routeIsHorizontalPressMain(ex) || routeIsShoulderPressName(n);
    if (type === 'pull') return routeIsVerticalPullName(n) || routeIsRowName(n);
    if (type === 'legs' || type === 'lower') return routeIsStapleSquatName(n) || routeIsHingeName(n);
    if (type === 'deltsarms') return routeIsShoulderPressName(n);
    if (type === 'upper') return routeIsHorizontalPressMain(ex) || routeIsRowName(n) || routeIsVerticalPullName(n);
    return false;
  };
  const takeFirst = (predicate) => {
    const idx = remaining.findIndex(predicate);
    if (idx >= 0) ordered.push(...remaining.splice(idx, 1));
  };
  const moveAll = (predicate) => {
    for (let i = 0; i < remaining.length;) {
      if (predicate(remaining[i])) ordered.push(...remaining.splice(i, 1));
      else i += 1;
    }
  };
  takeFirst(mainPredicate);
  moveAll((ex) => isCompound(ex) && !isArms(ex) && !isCalves(ex) && !isCore(ex));
  moveAll((ex) => !isCompound(ex) && !isArms(ex) && !isCalves(ex) && !isCore(ex));
  moveAll((ex) => isArms(ex) && !isCalves(ex) && !isCore(ex));
  moveAll((ex) => isCalves(ex));
  moveAll((ex) => isCore(ex));
  moveAll(() => true);
  return ordered;
}

function routeTuneWeeklyBicepsVolume(week, { bicepsPriority = false } = {}) {
  const days = Array.isArray(week?.days) ? week.days : [];
  if (!days.length) return;

  const collect = () => {
    let directBicepsSets = 0;
    let pullCompoundSets = 0;
    const bicepsDays = new Map();
    const biases = new Set();
    for (let dIdx = 0; dIdx < days.length; dIdx += 1) {
      const day = days[dIdx];
      const exs = Array.isArray(day?.exercises) ? day.exercises : [];
      for (let eIdx = 0; eIdx < exs.length; eIdx += 1) {
        const ex = exs[eIdx];
        const sets = Math.max(0, Number(ex?.sets) || 0);
        const n = routeNormName(ex?.name);
        if (routeIsCompound(ex) && (routeIsRowName(n) || routeIsVerticalPullName(n))) {
          pullCompoundSets += sets;
        }
        if (routeIsIsolation(ex) && routeIsBicepsIsoName(n)) {
          directBicepsSets += sets;
          if (!bicepsDays.has(dIdx)) bicepsDays.set(dIdx, []);
          bicepsDays.get(dIdx).push(eIdx);
          biases.add(routeBicepsBias(n));
        }
      }
    }
    return { directBicepsSets, pullCompoundSets, bicepsDays, biases };
  };

  const injectBicepsIntoDay = (dIdx, preferredBias = null) => {
    const day = days[dIdx];
    const dayType = String(day?.dayType || '').toLowerCase();
    if (!['pull', 'upper', 'deltsarms'].includes(dayType)) return false;
    const exs = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
    if (!exs.length) return false;
    if (dayType === 'deltsarms' && exs.some((ex) => routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name))) return false;

    let idx = exs.findIndex((ex) => routeIsCoreName(ex?.name));
    if (idx < 0) idx = exs.findIndex((ex) => routeIsIsolation(ex) && !routeIsTricepsIsoName(ex?.name) && !routeIsCalvesName(ex?.name));
    if (idx < 0) idx = exs.findIndex((ex) => routeIsIsolation(ex));
    if (idx < 0) return false;

    const key = preferredBias === 'lengthened'
      ? 'biceps_iso_lengthened'
      : preferredBias === 'shortened_mid'
        ? 'biceps_iso_shortened'
        : 'biceps_iso';
    exs[idx] = routeApplyReplacement(exs[idx], routePickReplacement(key, exs) || routePickReplacement('biceps_iso', exs));
    exs[idx].style = 'Isolation';
    exs[idx].sets = Math.max(bicepsPriority ? 3 : 2, Math.min(4, Number(exs[idx]?.sets) || (bicepsPriority ? 3 : 2)));
    routeNormalizeSetsByRole(dayType, exs);
    day.exercises = routeOrganizeDay(dayType, exs);
    return true;
  };

  const minTarget = bicepsPriority ? 10 : 6;
  const maxTarget = bicepsPriority ? 14 : 8;
  const highPullNoPriorityThreshold = 18;
  let stats = collect();
  const effectiveMin = (!bicepsPriority && stats.pullCompoundSets >= highPullNoPriorityThreshold) ? 5 : minTarget;
  if (!bicepsPriority && stats.directBicepsSets >= effectiveMin) return;

  const desiredDays = bicepsPriority ? 3 : 2;
  if (stats.bicepsDays.size < desiredDays) {
    const preferredDayOrder = ['pull', 'upper', 'deltsarms'];
    for (const type of preferredDayOrder) {
      if (stats.bicepsDays.size >= desiredDays) break;
      for (let dIdx = 0; dIdx < days.length; dIdx += 1) {
        const day = days[dIdx];
        if (String(day?.dayType || '').toLowerCase() !== type) continue;
        if (stats.bicepsDays.has(dIdx)) continue;
        const prefBias = bicepsPriority && !stats.biases.has('lengthened')
          ? 'lengthened'
          : bicepsPriority && !stats.biases.has('shortened_mid')
            ? 'shortened_mid'
            : null;
        if (injectBicepsIntoDay(dIdx, prefBias)) {
          stats = collect();
          if (stats.bicepsDays.size >= desiredDays) break;
        }
      }
    }
  }

  stats = collect();
  let deficit = Math.max(0, effectiveMin - stats.directBicepsSets);
  if ((deficit <= 0 && (!bicepsPriority || stats.directBicepsSets <= maxTarget)) || !stats.bicepsDays.size) {
    deficit = 0;
  }

  const dayPriority = { pull: 0, deltsarms: 1, upper: 2 };
  const dayOrder = Array.from(stats.bicepsDays.keys())
    .sort((a, b) => {
      const da = String(days[a]?.dayType || '').toLowerCase();
      const db = String(days[b]?.dayType || '').toLowerCase();
      const pa = Object.prototype.hasOwnProperty.call(dayPriority, da) ? dayPriority[da] : 9;
      const pb = Object.prototype.hasOwnProperty.call(dayPriority, db) ? dayPriority[db] : 9;
      if (pa !== pb) return pa - pb;
      const sa = (stats.bicepsDays.get(a) || []).reduce((sum, idx) => sum + (Number(days[a]?.exercises?.[idx]?.sets) || 0), 0);
      const sb = (stats.bicepsDays.get(b) || []).reduce((sum, idx) => sum + (Number(days[b]?.exercises?.[idx]?.sets) || 0), 0);
      return sa - sb;
    })
    .slice(0, Math.min(bicepsPriority ? 3 : 2, stats.bicepsDays.size));

  const touched = new Set();
  while (deficit > 0 && stats.directBicepsSets < maxTarget) {
    let progressed = false;
    for (const dIdx of dayOrder) {
      if (deficit <= 0) break;
      const day = days[dIdx];
      const exs = Array.isArray(day?.exercises) ? day.exercises : [];
      const slots = exs
        .map((ex, idx) => (routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name) ? idx : -1))
        .filter((idx) => idx >= 0)
        .sort((a, b) => (Number(exs[a]?.sets) || 0) - (Number(exs[b]?.sets) || 0));
      if (!slots.length) continue;
      const idx = slots[0];
      const cur = Math.max(0, Number(exs[idx]?.sets) || 0);
      if (cur >= 4) continue;
      const next = Math.min(4, cur + 1);
      if (next <= cur) continue;
      exs[idx].sets = next;
      deficit -= (next - cur);
      stats.directBicepsSets += (next - cur);
      touched.add(dIdx);
      progressed = true;
    }
    if (!progressed) break;
  }

  const enforceBias = (biasKey, replacementKey) => {
    const latest = collect();
    if (latest.biases.has(biasKey)) return;
    for (const dIdx of dayOrder) {
      const day = days[dIdx];
      const exs = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
      const idx = exs.findIndex((ex) => routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name) && routeBicepsBias(ex?.name) !== biasKey);
      if (idx < 0) continue;
      exs[idx] = routeApplyReplacement(exs[idx], routePickReplacement(replacementKey, exs) || routePickReplacement('biceps_iso', exs));
      exs[idx].sets = Math.max(3, Math.min(4, Number(exs[idx]?.sets) || 3));
      routeNormalizeSetsByRole(String(day?.dayType || '').toLowerCase(), exs);
      day.exercises = routeOrganizeDay(String(day?.dayType || '').toLowerCase(), exs);
      touched.add(dIdx);
      break;
    }
  };

  if (bicepsPriority) {
    enforceBias('lengthened', 'biceps_iso_lengthened');
    enforceBias('shortened_mid', 'biceps_iso_shortened');
  }

  for (const dIdx of touched) {
    const day = days[dIdx];
    const dayType = String(day?.dayType || '').toLowerCase();
    const exs = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
    routeNormalizeSetsByRole(dayType, exs);
    day.exercises = routeOrganizeDay(dayType, exs);
  }
}

function repairOblueprintBodybuildingPlan(planObj) {
  if (!planObj || String(planObj?.meta?.discipline || '').toLowerCase() !== 'bodybuilding') return planObj;
  const weeks = Array.isArray(planObj?.weeks) ? planObj.weeks : [];
  const priorities = new Set((Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups : []).map((x) => String(x || '').toLowerCase()));
  const shouldersPriority = priorities.has('shoulders');
  const armsPriority = priorities.has('arms') || priorities.has('biceps') || priorities.has('triceps');
  const bicepsPriority = priorities.has('arms') || priorities.has('biceps');
  const chestPriority = priorities.has('chest');
  const calvesPriority = priorities.has('calves');
  const hamstringsPriority = priorities.has('hamstrings');
  const absPriority = priorities.has('abs') || priorities.has('core');
  const lowerRepeatAllowed = priorities.has('legs') || priorities.has('glutes') || priorities.has('quads') || priorities.has('hamstrings');
  const shoulderIsoWeeklyCap = shouldersPriority ? 6 : 3;

  for (const week of weeks) {
    let shoulderIsoUsed = 0;
    let heavyDeadliftSeen = false;
    let lengthenedHingeSeen = false;
    let rdlSeen = false;
    let thrustSeen = false;
    let chestIsoDays = 0;
    let extraShoulderIsoDays = 0;
    let nonLegCoreDays = 0;
    const weekUsedExerciseNames = new Set();
    const weekUsedHamCurlNames = new Set();
    const weekUsedCoreNames = new Set();
    const weekUsedThrustBridgeNames = new Set();
    const seenLowerMainFamilies = new Set();
    const rearDeltDays = new Set();
    const rearDeltDayCap = routeRearDeltWeeklyDayCap([...priorities]);
    for (const day of week?.days || []) {
      const dayType = String(day?.dayType || '').toLowerCase();
      let list = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
      if (!list.length) continue;

      for (let i = 0; i < list.length; i += 1) {
        const norm = routeNormName(list[i]?.name);
        if (routeIsBannedExerciseName(norm)) {
          const fallback = routePickBannedExerciseReplacement(dayType, list[i], list, i);
          if (fallback?.name) list[i] = routeApplyReplacement(list[i], fallback);
        }
        list[i] = routeCanonicalizeExercise(list[i], list);
        if (!routeFitsDayType(list[i], dayType)) {
          const fallbackKey = routeDefaultReplacementKey(dayType, i);
          list[i] = routeApplyReplacement(list[i], routePickReplacement(fallbackKey, list));
        }
      }

      if (dayType === 'push') {
        routeEnsureAt(list, 0, 'chest_main', (ex) => routeIsHorizontalPressMain(ex) && routeIsStapleChestMainName(ex?.name));
        routeEnsureAt(list, 1, 'shoulder_main', (ex) => routeIsShoulderPressName(ex?.name));
      }
      if (dayType === 'upper') {
        routeEnsureAt(list, 0, 'chest_main', (ex) => routeIsHorizontalPressMain(ex) && routeIsStapleChestMainName(ex?.name));
        routeEnsureAt(list, 1, 'row_main', (ex) => routeIsRowName(ex?.name));
      }
      if (dayType === 'pull') {
        routeEnsureAt(list, 0, 'vertical_pull', (ex) => routeIsVerticalPullName(ex?.name));
        routeEnsureAt(list, 1, 'row_main', (ex) => routeIsRowName(ex?.name));
      }
      if (dayType === 'legs' || dayType === 'lower') {
        routeEnsureAt(list, 0, 'squat_main', (ex) => routeIsStapleSquatName(ex?.name));
        const hingeIdx = list.findIndex((ex) => routeIsHingeName(ex?.name));
        if (hingeIdx < 0) routeEnsureAt(list, 1, 'hinge_lengthened', () => false);
        if (!rdlSeen && !list.some((ex) => routeIsRdlName(ex?.name))) {
          let forceRdlIdx = list.findIndex((ex) => routeIsCompound(ex) && routeIsHingeName(ex?.name));
          if (forceRdlIdx < 0) forceRdlIdx = list.findIndex((ex, idx) => idx > 0 && routeIsCompound(ex));
          if (forceRdlIdx < 0) forceRdlIdx = Math.min(1, Math.max(0, list.length - 1));
          const rdlSpec = routePickReplacementMatching('hinge_lengthened', list, (spec) => routeIsRdlName(spec?.name))
            || routePickReplacement('hinge_lengthened', list);
          list[forceRdlIdx] = routeApplyReplacement(list[forceRdlIdx], rdlSpec);
          if (list[forceRdlIdx]) {
            list[forceRdlIdx].pattern = 'Hinge';
            list[forceRdlIdx].style = 'Compound';
          }
        }
        if (!heavyDeadliftSeen && !list.some((ex) => routeIsHeavyDeadliftName(ex?.name))) {
          let forceIdx = list.findIndex((ex) => routeIsCompound(ex) && routeIsHingeName(ex?.name));
          if (forceIdx < 0) forceIdx = list.findIndex((ex) => routeIsCompound(ex) && !routeIsStapleSquatName(ex?.name));
          if (forceIdx < 0) forceIdx = Math.min(1, Math.max(0, list.length - 1));
          const lengthenedSpec = routePickReplacementMatching('hinge_lengthened', list, (spec) => routeIsLengthenedHingeName(spec?.name));
          if (lengthenedSpec) list[forceIdx] = routeApplyReplacement(list[forceIdx], lengthenedSpec);
        }
        const lowerMainFam = routeLowerMainFamily(list[0]?.name);
        if (lowerMainFam && seenLowerMainFamilies.has(lowerMainFam) && !lowerRepeatAllowed) {
          const swap = routePickReplacementMatching('squat_main', list, (spec) => routeLowerMainFamily(spec?.name) !== lowerMainFam);
          list[0] = routeApplyReplacement(list[0], swap);
        }
        const finalFam = routeLowerMainFamily(list[0]?.name);
        if (finalFam) seenLowerMainFamilies.add(finalFam);
        if (list.some((ex) => routeIsLengthenedHingeName(ex?.name))) {
          lengthenedHingeSeen = true;
        }
        if (list.some((ex) => routeIsRdlName(ex?.name))) {
          rdlSeen = true;
        }
      }
      if (dayType === 'deltsarms') {
        routeEnsureAt(list, 0, 'shoulder_main', (ex) => routeIsShoulderPressName(ex?.name));
      }

      if (dayType === 'pull' || dayType === 'upper') {
        let verticalSeen = 0;
        for (let i = 0; i < list.length; i += 1) {
          if (!(routeIsCompound(list[i]) && routeIsVerticalPullName(list[i]?.name))) continue;
          verticalSeen += 1;
          if (verticalSeen <= 1) continue;
          const fallback = dayType === 'pull' ? 'row_main' : 'biceps_iso';
          list[i] = routeApplyReplacement(list[i], routePickReplacement(fallback, list));
        }
      }
      if (dayType === 'upper') {
        let rowSeen = 0;
        for (let i = 0; i < list.length; i += 1) {
          if (!(routeIsCompound(list[i]) && routeIsRowName(list[i]?.name))) continue;
          rowSeen += 1;
          if (rowSeen <= 1) continue;
          list[i] = routeApplyReplacement(list[i], routePickReplacement('chest_secondary_press', list));
        }
      }

      if (dayType === 'pull') {
        let rearIsoSeen = 0;
        for (let i = 0; i < list.length; i += 1) {
          const ex = list[i];
          if (i <= 1 && routeIsCompound(ex)) {
            list[i].sets = Math.max(3, Math.min(4, Number(list[i]?.sets) || 3));
          }
          if (routeIsRearDeltName(ex?.name)) {
            rearIsoSeen += 1;
            if (rearIsoSeen > 1) {
              list[i] = routeApplyReplacement(ex, routePickReplacement('biceps_iso', list));
              continue;
            }
            list[i].sets = Math.max(2, Math.min(shouldersPriority ? 3 : 2, Number(list[i]?.sets) || 2));
          }
          if (!routeIsLateralRaiseName(ex?.name)) continue;
          const canKeep = shouldersPriority && shoulderIsoUsed < shoulderIsoWeeklyCap;
          if (!canKeep) {
            list[i] = routeApplyReplacement(ex, routePickReplacement('biceps_iso', list));
          } else {
            shoulderIsoUsed += 1;
          }
        }
        routeReplaceByPredicate(
          list,
          (ex, idx) => idx > 1 && routeIsTricepsIsoName(ex?.name),
          'core_iso'
        );
        let bIdx = list.map((ex, idx) => (routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name) ? idx : -1)).filter((x) => x >= 0);
        while (bIdx.length > 1) {
          const idx = bIdx.pop();
          if (!Number.isFinite(idx)) continue;
          list[idx] = routeApplyReplacement(list[idx], routePickReplacement('core_iso', list));
        }
        bIdx = list.map((ex, idx) => (routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name) ? idx : -1)).filter((x) => x >= 0);
        if (!bIdx.length) {
          const idx = list.findIndex((ex, i) => i > 1 && routeIsIsolation(ex) && !routeIsRearDeltName(ex?.name) && !routeIsCoreName(ex?.name));
          if (idx >= 0) list[idx] = routeApplyReplacement(list[idx], routePickReplacement('biceps_iso', list));
        }
        let coreSeen = 0;
        for (let i = 0; i < list.length; i += 1) {
          if (!routeIsCoreName(list[i]?.name)) continue;
          coreSeen += 1;
          if (coreSeen > 1) {
            list[i] = routeApplyReplacement(list[i], routePickReplacement('row_main', list));
            list[i].sets = Math.max(2, Math.min(3, Number(list[i]?.sets) || 2));
          }
        }
      }

      if (!shouldersPriority && (dayType === 'push' || dayType === 'upper')) {
        for (let i = 0; i < list.length; i += 1) {
          if (!routeIsRearDeltName(list[i]?.name)) continue;
          const key = dayType === 'push' ? 'triceps_iso' : 'lateral_iso';
          list[i] = routeApplyReplacement(list[i], routePickReplacement(key, list));
        }
      }

      if (dayType === 'deltsarms') {
        routeEnsureAt(list, 1, 'lateral_iso', (ex) => routeIsIsolation(ex) && routeIsLateralRaiseName(ex?.name));
        routeEnsureAt(list, 2, 'rear_iso', (ex) => routeIsIsolation(ex) && routeIsRearDeltName(ex?.name));
        routeEnsureAt(list, 3, 'biceps_iso', (ex) => routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name));
        routeEnsureAt(list, 4, 'triceps_iso', (ex) => routeIsIsolation(ex) && routeIsTricepsIsoName(ex?.name));
        for (let i = 5; i < list.length; i += 1) {
          if (routeIsIsolation(list[i]) && (routeIsLateralRaiseName(list[i]?.name) || routeIsRearDeltName(list[i]?.name) || routeIsBicepsIsoName(list[i]?.name) || routeIsTricepsIsoName(list[i]?.name) || routeIsCoreName(list[i]?.name))) {
            list[i] = routeApplyReplacement(list[i], routePickReplacement('shoulder_main', list));
          }
        }
        if (list.length < 6) {
          const filler = routeApplyReplacement(
            { ...(list[list.length - 1] || {}), style: 'Compound' },
            routePickReplacement('shoulder_main', list)
          );
          list.push(filler);
        }
      }
      if (dayType === 'push' || dayType === 'upper' || dayType === 'deltsarms') {
        let cableShoulderPressSeen = 0;
        for (let i = 0; i < list.length; i += 1) {
          if (!(routeIsCompound(list[i]) && routeIsCableShoulderPressName(list[i]?.name))) continue;
          cableShoulderPressSeen += 1;
          if (cableShoulderPressSeen <= 1) continue;
          const nonCable = routePickReplacementMatching('shoulder_main', list, (spec) => !routeIsCableShoulderPressName(spec?.name));
          list[i] = routeApplyReplacement(list[i], nonCable || routePickReplacement('shoulder_main', list));
        }
      }

      if (dayType === 'push' || dayType === 'upper') {
        list = routeEnforceChestPressCompoundCap(dayType, list, {
          chestPriority,
          armsPriority,
          shouldersPriority,
          calvesPriority
        });
        let chestFlyCount = 0;
        let dayChestIso = false;
        for (let i = 0; i < list.length; i += 1) {
          if (!routeIsChestIsoName(list[i]?.name)) continue;
          chestFlyCount += 1;
          if (chestFlyCount > 1) {
            list[i] = routeApplyReplacement(list[i], routePickReplacement('triceps_iso', list));
            continue;
          }
          if (!chestPriority && chestIsoDays >= 1) {
            list[i] = routeApplyReplacement(list[i], routePickReplacement('chest_secondary_press', list));
            continue;
          }
          dayChestIso = true;
          const maxChestIsoSets = chestIsoDays > 0 ? 3 : 3;
          list[i].sets = Math.max(2, Math.min(maxChestIsoSets, Number(list[i]?.sets) || 3));
        }
        if (dayChestIso) chestIsoDays += 1;
        if (dayType === 'upper') {
          let shoulderIsoCount = 0;
          let armIsoCount = 0;
          for (let i = 0; i < list.length; i += 1) {
            const n = routeNormName(list[i]?.name);
            if (routeIsLateralRaiseName(n) || routeIsRearDeltName(n)) {
              shoulderIsoCount += 1;
              if (shoulderIsoCount > 1) {
                list[i] = routeApplyReplacement(list[i], routePickReplacement('chest_secondary_press', list));
                list[i].sets = Math.max(2, Math.min(3, Number(list[i]?.sets) || 2));
                continue;
              }
            }
            if (routeIsBicepsIsoName(n) || routeIsTricepsIsoName(n)) {
              armIsoCount += 1;
              if (!armsPriority || armIsoCount > 1) {
                list[i] = routeApplyReplacement(list[i], routePickReplacement('vertical_pull', list));
                list[i].sets = Math.max(2, Math.min(3, Number(list[i]?.sets) || 2));
                continue;
              }
            }
          }
        }
      }

      let dayRearDeltCount = 0;
      for (let i = 0; i < list.length; i += 1) {
        const ex = list[i];
        if (routeIsRdlName(ex?.name)) {
          rdlSeen = true;
        }
        if (routeIsHeavyDeadliftName(ex?.name)) {
          if (heavyDeadliftSeen) {
            list[i] = routeApplyReplacement(ex, routePickReplacement('hinge_alt', list));
          } else {
            heavyDeadliftSeen = true;
          }
        }
        if (/\b(hip thrust|glute bridge)\b/.test(routeNormName(ex?.name))) {
          if (thrustSeen) {
            const lengthenedSwap = routePickReplacementMatching('hinge_lengthened', list, (spec) => routeIsLengthenedHingeName(spec?.name));
            list[i] = routeApplyReplacement(ex, lengthenedSwap || routePickReplacement('hinge_lengthened', list));
            if (routeIsHeavyDeadliftName(list[i]?.name)) heavyDeadliftSeen = true;
          } else {
            thrustSeen = true;
          }
        }
        if ((dayType === 'legs' || dayType === 'lower') && routeIsLungeName(ex?.name) && /side|lateral/.test(routeNormName(ex?.name))) {
          list[i] = routeApplyReplacement(ex, routePickReplacement('lunge_main', list));
          continue;
        }
        if ((dayType === 'legs' || dayType === 'lower') && /\bleg\s*curls?\b|\bhamstring\s*curls?\b/.test(routeNormName(ex?.name)) && !routeIsHamCurlName(ex?.name)) {
          list[i] = routeApplyReplacement(ex, routePickReplacement('ham_iso', list));
          continue;
        }
        if (routeIsRearDeltName(ex?.name)) {
          dayRearDeltCount += 1;
          if (dayRearDeltCount > 1) {
            list[i] = routeApplyReplacement(ex, routePickReplacement('lateral_iso', list));
            continue;
          }
        }
      }

      if (dayRearDeltCount > 0) {
        const dayKey = `${week?.weekIndex || week?.index || '?'}:${dayType}`;
        if (!rearDeltDays.has(dayKey)) {
          if (rearDeltDays.size >= rearDeltDayCap) {
            for (let i = 0; i < list.length; i += 1) {
              if (routeIsRearDeltName(list[i]?.name)) {
                list[i] = routeApplyReplacement(list[i], routePickReplacement('lateral_iso', list));
              }
            }
          } else {
            rearDeltDays.add(dayKey);
          }
        }
      }

      if (dayType === 'legs' || dayType === 'lower') {
        const hasCalves = list.some((ex) => routeIsCalvesName(ex?.name));
        const hasAbs = list.some((ex) => routeIsCoreName(ex?.name));
        const hasHamCurl = list.some((ex) => routeIsHamCurlName(ex?.name));
        if (!hasCalves) {
          const idx = list.findIndex((ex) => routeIsIsolation(ex));
          if (idx >= 0) list[idx] = routeApplyReplacement(list[idx], routePickReplacement('calves_iso', list));
        }
        if (!hasHamCurl) {
          let idx = list.findIndex((ex) => routeIsIsolation(ex) && !routeIsCalvesName(ex?.name) && !routeIsCoreName(ex?.name));
          if (idx < 0) idx = list.findIndex((ex) => !routeIsCalvesName(ex?.name) && !routeIsCoreName(ex?.name) && !routeIsStapleSquatName(ex?.name) && !routeIsHingeName(ex?.name));
          if (idx < 0) idx = list.findIndex((ex) => routeIsCalvesName(ex?.name));
          if (idx < 0) idx = Math.max(0, list.length - 1);
          list[idx] = routeApplyReplacement(list[idx], routePickReplacement('ham_iso', list));
        }
        if (!hasAbs) {
          const idx = Math.max(0, list.length - 1);
          list[idx] = routeApplyReplacement(list[idx], routePickReplacement('core_iso', list));
        }
        if (!list.some((ex) => routeIsHingeName(ex?.name))) {
          const idx = list.findIndex((ex) => !routeIsStapleSquatName(ex?.name) && !routeIsCalvesName(ex?.name) && !routeIsCoreName(ex?.name) && !routeIsHamCurlName(ex?.name));
          if (idx >= 0) list[idx] = routeApplyReplacement(list[idx], routePickReplacement('hinge_alt', list));
        }
        let calfSeen = 0;
        for (let i = 0; i < list.length; i += 1) {
          if (!routeIsCalvesName(list[i]?.name)) continue;
          calfSeen += 1;
          if (calfSeen > 1) {
            list[i] = routeApplyReplacement(list[i], routePickReplacement('core_iso', list));
            continue;
          }
          list[i].sets = Math.max(2, Math.min(3, Number(list[i]?.sets) || 2));
        }
      }

      if (!shouldersPriority && dayType !== 'deltsarms') {
        const shoulderIsoIdx = [];
        for (let i = 0; i < list.length; i += 1) {
          const n = routeNormName(list[i]?.name);
          if (routeIsLateralRaiseName(n) || routeIsRearDeltName(n)) shoulderIsoIdx.push(i);
        }
        if (shoulderIsoIdx.length) {
          if (extraShoulderIsoDays >= 1) {
            for (const idx of shoulderIsoIdx) {
              const key = dayType === 'push' ? 'triceps_iso' : dayType === 'pull' ? 'biceps_iso' : 'core_iso';
              list[idx] = routeApplyReplacement(list[idx], routePickReplacement(key, list));
            }
          } else {
            extraShoulderIsoDays += 1;
            if (shoulderIsoIdx.length > 1) {
              for (let k = 1; k < shoulderIsoIdx.length; k += 1) {
                const idx = shoulderIsoIdx[k];
                const key = dayType === 'push' ? 'triceps_iso' : dayType === 'pull' ? 'biceps_iso' : 'core_iso';
                list[idx] = routeApplyReplacement(list[idx], routePickReplacement(key, list));
              }
            }
          }
        }
      }

      if (!absPriority && dayType !== 'legs' && dayType !== 'lower') {
        const hasCoreNow = list.some((ex) => routeIsCoreName(ex?.name));
        if (hasCoreNow && nonLegCoreDays >= 1) {
          for (let i = 0; i < list.length; i += 1) {
            if (!routeIsCoreName(list[i]?.name)) continue;
            const fallbackKey = dayType === 'push'
              ? 'triceps_iso'
              : dayType === 'pull'
                ? 'biceps_iso'
                : dayType === 'upper'
                  ? 'row_main'
                  : 'shoulder_main';
            list[i] = routeApplyReplacement(list[i], routePickReplacement(fallbackKey, list));
          }
        } else if (hasCoreNow) {
          nonLegCoreDays += 1;
        }
      }

      for (let i = 0; i < list.length; i += 1) {
        const currentName = routeNormName(list[i]?.name);
        if (!currentName) continue;
        if (routeIsHamCurlName(currentName)) {
          if (weekUsedHamCurlNames.has(currentName)) {
            const swap = routePickReplacementMatching('ham_iso', list, (spec) => !weekUsedHamCurlNames.has(routeNormName(spec?.name)));
            if (swap) list[i] = routeApplyReplacement(list[i], swap);
          }
          weekUsedHamCurlNames.add(routeNormName(list[i]?.name));
          continue;
        }
        if (/\b(hip thrust|glute bridge)\b/.test(currentName)) {
          if (weekUsedThrustBridgeNames.has(currentName)) {
            const swap = routePickReplacementMatching(
              'hinge_lengthened',
              list,
              (spec) => routeIsLengthenedHingeName(spec?.name) && !weekUsedThrustBridgeNames.has(routeNormName(spec?.name))
            );
            if (swap) list[i] = routeApplyReplacement(list[i], swap);
          }
          if (/\b(hip thrust|glute bridge)\b/.test(routeNormName(list[i]?.name))) {
            weekUsedThrustBridgeNames.add(routeNormName(list[i]?.name));
          }
          continue;
        }
        if (routeIsCoreName(currentName)) {
          if (weekUsedCoreNames.has(currentName)) {
            if (dayType === 'legs' || dayType === 'lower' || absPriority) {
              const swapCore = routePickReplacementMatching('core_iso', list, (spec) => !weekUsedCoreNames.has(routeNormName(spec?.name)));
              if (swapCore) list[i] = routeApplyReplacement(list[i], swapCore);
            } else {
              const fallbackKey = dayType === 'push'
                ? 'triceps_iso'
                : dayType === 'pull'
                  ? 'biceps_iso'
                  : dayType === 'upper'
                    ? 'row_main'
                    : dayType === 'deltsarms'
                      ? 'shoulder_main'
                      : routeDefaultReplacementKey(dayType, i);
              list[i] = routeApplyReplacement(list[i], routePickReplacement(fallbackKey, list));
            }
          }
          if (routeIsCoreName(list[i]?.name)) {
            weekUsedCoreNames.add(routeNormName(list[i]?.name));
          }
        }
      }

      const maxCorePerDay = dayType === 'deltsarms' ? 0 : (absPriority && (dayType === 'legs' || dayType === 'lower') ? 2 : 1);
      routeEnforceCoreCap(dayType, list, maxCorePerDay);
      list = routeDedupeIsolationFamilies(dayType, list);
      routeEnforceCoreCap(dayType, list, maxCorePerDay);
      list = routeDedupeIsolationFamilies(dayType, list);
      if (dayType === 'push' || dayType === 'upper') {
        const benchLike = list
          .map((ex, idx) => (routeIsCompound(ex) && routeIsBenchLikePressName(ex?.name) ? idx : -1))
          .filter((idx) => idx >= 0);
        if (benchLike.length > 1) {
          for (let k = 1; k < benchLike.length; k += 1) {
            const idx = benchLike[k];
            const key = dayType === 'upper' ? 'row_main' : 'chest_iso';
            list[idx] = routeApplyReplacement(list[idx], routePickReplacement(key, list));
            list[idx].sets = Math.max(2, Math.min(3, Number(list[idx]?.sets) || 2));
          }
        }
        const chestPressIdx = list
          .map((ex, idx) => (routeIsCompound(ex) && routeIsHorizontalPressMain(ex) ? idx : -1))
          .filter((idx) => idx >= 0);
        const hasChestIso = list.some((ex) => routeIsChestIsoName(ex?.name));
        if (hasChestIso && chestPressIdx.length > 1) {
          for (let k = 1; k < chestPressIdx.length; k += 1) {
            const idx = chestPressIdx[k];
            const key = dayType === 'upper' ? 'row_main' : 'triceps_iso';
            list[idx] = routeApplyReplacement(list[idx], routePickReplacement(key, list));
            list[idx].sets = Math.max(2, Math.min(3, Number(list[idx]?.sets) || 2));
          }
        }
      }
      if (dayType === 'deltsarms') {
        routeEnsureAt(list, 1, 'lateral_iso', (ex) => routeIsIsolation(ex) && routeIsLateralRaiseName(ex?.name));
        routeEnsureAt(list, 2, 'rear_iso', (ex) => routeIsIsolation(ex) && routeIsRearDeltName(ex?.name));
        routeEnsureAt(list, 3, 'biceps_iso', (ex) => routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name));
        routeEnsureAt(list, 4, 'triceps_iso', (ex) => routeIsIsolation(ex) && routeIsTricepsIsoName(ex?.name));
        for (let i = 5; i < list.length; i += 1) {
          if (routeIsCoreName(list[i]?.name) || (routeIsIsolation(list[i]) && (routeIsLateralRaiseName(list[i]?.name) || routeIsRearDeltName(list[i]?.name) || routeIsBicepsIsoName(list[i]?.name) || routeIsTricepsIsoName(list[i]?.name)))) {
            list[i] = routeApplyReplacement(list[i], routePickReplacement('shoulder_main', list));
          }
        }
      }
      list = routeDedupeIsolationFamilies(dayType, list);
      routeEnforceCoreCap(dayType, list, maxCorePerDay);
      if (dayType === 'upper') {
        const maxChestSlots = chestPriority ? 2 : 1;
        let chestIdx = list
          .map((ex, idx) => ((routeIsHorizontalPressMain(ex) || routeIsChestIsoName(ex?.name)) ? idx : -1))
          .filter((idx) => idx >= 0);
        while (chestIdx.length > maxChestSlots) {
          const idx = chestIdx.pop();
          if (!Number.isFinite(idx)) break;
          const key = routeIsIsolation(list[idx]) ? 'biceps_iso' : 'row_main';
          list[idx] = routeApplyReplacement(list[idx], routePickReplacement(key, list));
          list[idx].sets = Math.max(2, Math.min(3, Number(list[idx]?.sets) || 2));
          chestIdx = list
            .map((ex, nextIdx) => ((routeIsHorizontalPressMain(ex) || routeIsChestIsoName(ex?.name)) ? nextIdx : -1))
            .filter((nextIdx) => nextIdx >= 0);
        }
        if (!list.some((ex) => routeIsIsolation(ex) && routeIsBicepsIsoName(ex?.name))) {
          let idx = list.findIndex((ex) => routeIsIsolation(ex) && !routeIsChestIsoName(ex?.name) && !routeIsCoreName(ex?.name));
          if (idx < 0) idx = list.findIndex((ex) => routeIsIsolation(ex));
          if (idx < 0) idx = Math.max(0, list.length - 1);
          list[idx] = routeApplyReplacement(list[idx], routePickReplacement('biceps_iso', list));
        }
      }
      if (dayType === 'legs' || dayType === 'lower') {
        const hasHamCurl = list.some((ex) => routeIsHamCurlName(ex?.name));
        if (!hasHamCurl) {
          let idx = list.findIndex((ex) => routeIsIsolation(ex) && !routeIsCalvesName(ex?.name) && !routeIsCoreName(ex?.name));
          if (idx < 0) idx = list.findIndex((ex) => !routeIsStapleSquatName(ex?.name) && !routeIsHingeName(ex?.name) && !routeIsCalvesName(ex?.name) && !routeIsCoreName(ex?.name));
          if (idx < 0) idx = Math.max(0, list.length - 2);
          list[idx] = routeApplyReplacement(list[idx], routePickReplacement('ham_iso', list));
        }
        const maxHamCurl = hamstringsPriority ? 2 : 1;
        let hamIdx = list.map((ex, idx) => (routeIsHamCurlName(ex?.name) ? idx : -1)).filter((idx) => idx >= 0);
        while (hamIdx.length > maxHamCurl) {
          const idx = hamIdx.pop();
          if (!Number.isFinite(idx)) break;
          list[idx] = routeApplyReplacement(list[idx], routePickReplacement('leg_iso', list));
          hamIdx = list.map((ex, nextIdx) => (routeIsHamCurlName(ex?.name) ? nextIdx : -1)).filter((nextIdx) => nextIdx >= 0);
        }
      }
      {
        const heavyIdx = list.map((ex, idx) => (routeIsHeavyDeadliftName(ex?.name) ? idx : -1)).filter((x) => x >= 0);
        if (heavyIdx.length) {
          for (const idx of heavyIdx) {
            if (heavyDeadliftSeen) list[idx] = routeApplyReplacement(list[idx], routePickReplacement('hinge_alt', list));
            else heavyDeadliftSeen = true;
          }
        }
      }
      list = routeDedupeIsolationFamilies(dayType, list);
      routeEnforceCoreCap(dayType, list, maxCorePerDay);
      list = routeDiversifyNearDuplicateMovements(dayType, list, shouldersPriority);
      routeNormalizeSetsByRole(dayType, list);
      list = routeEnsureWeekUniqueNames(dayType, list, weekUsedExerciseNames);
      list = routeDedupeIsolationFamilies(dayType, list);
      routeEnforceCoreCap(dayType, list, maxCorePerDay);
      list = routeDiversifyNearDuplicateMovements(dayType, list, shouldersPriority);
      list = routeEnforceChestPressCompoundCap(dayType, list, {
        chestPriority,
        armsPriority,
        shouldersPriority,
        calvesPriority
      });

      for (let i = 0; i < list.length; i += 1) {
        list[i].sets = Math.max(1, Math.min(4, Number(list[i]?.sets) || 2));
      }
      day.exercises = routeFinalizeBodybuildingDay(dayType, list, { absPriority });
    }

    const dayList = Array.isArray(week?.days) ? week.days : [];
    const rearDays = dayList.filter((d) => (d?.exercises || []).some((ex) => routeIsRearDeltName(ex?.name)));
    if (rearDays.length > rearDeltDayCap) {
      const demote = rearDays.slice(rearDeltDayCap);
      for (const d of demote) {
        const dType = String(d?.dayType || '').toLowerCase();
        const exs = Array.isArray(d?.exercises) ? d.exercises.slice() : [];
        for (let i = 0; i < exs.length; i += 1) {
          if (!routeIsRearDeltName(exs[i]?.name)) continue;
          const key = dType === 'pull' ? 'biceps_iso' : 'lateral_iso';
          exs[i] = routeApplyReplacement(exs[i], routePickReplacement(key, exs));
        }
        const maxCorePerDay = dType === 'deltsarms' ? 0 : (absPriority && (dType === 'legs' || dType === 'lower') ? 2 : 1);
        routeEnforceCoreCap(dType, exs, maxCorePerDay);
        const deduped = routeDedupeIsolationFamilies(dType, exs);
        routeEnforceCoreCap(dType, deduped, maxCorePerDay);
        const diversified = routeDiversifyNearDuplicateMovements(dType, deduped, shouldersPriority);
        routeNormalizeSetsByRole(dType, diversified);
        d.exercises = routeFinalizeBodybuildingDay(dType, diversified, { absPriority });
      }
    }

    const finalWeekNameSet = new Set();
    for (const d of week?.days || []) {
      const dType = String(d?.dayType || '').toLowerCase();
      const maxCorePerDay = dType === 'deltsarms' ? 0 : (absPriority && (dType === 'legs' || dType === 'lower') ? 2 : 1);
      let exs = Array.isArray(d?.exercises) ? d.exercises.slice() : [];
      exs = routeEnsureWeekUniqueNames(dType, exs, finalWeekNameSet);
      exs = routeDedupeIsolationFamilies(dType, exs);
      routeEnforceCoreCap(dType, exs, maxCorePerDay);
      exs = routeDiversifyNearDuplicateMovements(dType, exs, shouldersPriority);
      exs = routeEnforceChestPressCompoundCap(dType, exs, {
        chestPriority,
        armsPriority,
        shouldersPriority,
        calvesPriority
      });
      routeNormalizeSetsByRole(dType, exs);
      for (let i = 0; i < exs.length; i += 1) {
        exs[i].sets = Math.max(1, Math.min(4, Number(exs[i]?.sets) || 2));
      }
      d.exercises = routeFinalizeBodybuildingDay(dType, exs, { absPriority });
    }

    routeTuneWeeklyBicepsVolume(week, { bicepsPriority });

    if (!lengthenedHingeSeen) {
      const targetDay = (week?.days || []).find((d) => {
        const t = String(d?.dayType || '').toLowerCase();
        return t === 'legs' || t === 'lower';
      });
      if (targetDay) {
        const dType = String(targetDay?.dayType || '').toLowerCase();
        const exs = Array.isArray(targetDay?.exercises) ? targetDay.exercises.slice() : [];
        let idx = exs.findIndex((ex) => routeIsCompound(ex) && routeIsHingeName(ex?.name));
        if (idx < 0) idx = exs.findIndex((ex, i) => i > 0 && routeIsCompound(ex));
        if (idx < 0) idx = Math.min(1, Math.max(0, exs.length - 1));
        const spec = routePickReplacementMatching('hinge_lengthened', exs, (candidate) => routeIsLengthenedHingeName(candidate?.name));
        exs[idx] = routeApplyReplacement(exs[idx], spec || routePickReplacement('hinge_lengthened', exs));
        routeNormalizeSetsByRole(dType, exs);
        targetDay.exercises = routeFinalizeBodybuildingDay(dType, exs, { absPriority });
        lengthenedHingeSeen = exs.some((ex) => routeIsLengthenedHingeName(ex?.name));
      }
    }
    const hasRdlInWeek = (week?.days || []).some((d) => {
      const t = String(d?.dayType || '').toLowerCase();
      if (t !== 'legs' && t !== 'lower') return false;
      return (d?.exercises || []).some((ex) => routeIsRdlName(ex?.name));
    });
    if (!hasRdlInWeek) {
      const targetDay = (week?.days || []).find((d) => {
        const t = String(d?.dayType || '').toLowerCase();
        return t === 'legs' || t === 'lower';
      });
      if (targetDay) {
        const dType = String(targetDay?.dayType || '').toLowerCase();
        const exs = Array.isArray(targetDay?.exercises) ? targetDay.exercises.slice() : [];
        let idx = exs.findIndex((ex) => routeIsCompound(ex) && routeIsHingeName(ex?.name));
        if (idx < 0) idx = exs.findIndex((ex, i) => i > 0 && routeIsCompound(ex));
        if (idx < 0) idx = Math.min(1, Math.max(0, exs.length - 1));
        const rdlSpec = routePickReplacementMatching('hinge_lengthened', exs, (candidate) => routeIsRdlName(candidate?.name))
          || routePickReplacementMatching('hinge_main', exs, (candidate) => routeIsRdlName(candidate?.name))
          || routePickReplacement('hinge_lengthened', exs);
        exs[idx] = routeApplyReplacement(exs[idx], rdlSpec);
        if (exs[idx]) {
          exs[idx].pattern = 'Hinge';
          exs[idx].style = 'Compound';
        }
        routeNormalizeSetsByRole(dType, exs);
        targetDay.exercises = routeFinalizeBodybuildingDay(dType, exs, { absPriority });
        rdlSeen = exs.some((ex) => routeIsRdlName(ex?.name));
      }
    }
  }
  return planObj;
}

function isOblueprintPlanShape(planObj) {
  const firstWeek = Array.isArray(planObj?.weeks) ? planObj.weeks[0] : null;
  return Number.isFinite(Number(firstWeek?.weekIndex));
}

function isolationFamilyForName(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  if (/(rear delt|reverse fly|face pull|reverse pec deck)/.test(n)) return 'rear_delt';
  if (/(fly|crossover|pec deck)/.test(n)) return 'chest_fly';
  if (/(lateral raise|side lateral)/.test(n)) return 'lateral_raise';
  if (/\bcurl\b/.test(n) && !/(leg curl|hamstring curl)/.test(n)) return 'curl';
  if (/(triceps|pushdown|skull crusher)/.test(n) || (/\bextension\b/.test(n) && !/(leg extension)/.test(n))) return 'triceps_extension';
  return null;
}

function routeHeavyHingeRoleName(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return '';
  if (/(romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(n)) return 'lengthened_heavy_hinge';
  if (/deadlift/.test(n) && !/(hip thrust|glute bridge)/.test(n)) return 'deadlift_heavy';
  return '';
}

let activeAssertionDiagnosticContext = null;

function withAssertionDiagnosticContext(context, fn) {
  const heartbeat = typeof context?.heartbeat === 'function' ? context.heartbeat : null;
  if (heartbeat) {
    heartbeat('entered_with_assertion_diagnostic_context', {
      lastBuilderStage: 'entered_with_assertion_diagnostic_context',
      lastRepairOrPolishFunction: 'withAssertionDiagnosticContext',
      validatorSection: 'entered_with_assertion_diagnostic_context',
      failedInvariant: 'entered_with_assertion_diagnostic_context',
      priorityGroups: Array.isArray(context?.priorityGroups) ? context.priorityGroups : undefined
    });
  }
  const previous = activeAssertionDiagnosticContext;
  activeAssertionDiagnosticContext = {
    state: {
      validatorSection: '',
      failedInvariant: '',
      sectionPhase: '',
      lastSectionStarted: '',
      lastSectionCompleted: '',
      sectionDurationsMs: {},
      currentRunningSection: '',
      currentRunningSectionStartedAt: null,
      currentRunningSectionElapsedMs: null,
      assertFinallyReached: false,
      assertReturnedSuccessfully: false,
      week: null,
      day: '',
      dayType: '',
      exerciseNames: [],
      calfDirectSets: 0,
      calfExposureDays: []
    },
    ...(context && typeof context === 'object' ? context : {})
  };
  try {
    return fn();
  } finally {
    activeAssertionDiagnosticContext = previous;
  }
}

function buildAssertionDiagnosticFields(extra = {}) {
  const ctx = activeAssertionDiagnosticContext && typeof activeAssertionDiagnosticContext === 'object'
    ? activeAssertionDiagnosticContext
    : null;
  const state = ctx?.state && typeof ctx.state === 'object' ? ctx.state : {};
  const priorityGroups = Array.isArray(extra?.priorityGroups)
    ? extra.priorityGroups
    : (Array.isArray(ctx?.priorityGroups) ? ctx.priorityGroups : undefined);
  const exerciseNames = Array.isArray(extra?.exerciseNames)
    ? extra.exerciseNames
    : (Array.isArray(state?.exerciseNames) ? state.exerciseNames : undefined);
  const calfExposureDays = Array.isArray(extra?.calfExposureDays)
    ? extra.calfExposureDays
    : (Array.isArray(state?.calfExposureDays) ? state.calfExposureDays : undefined);
  const weekExerciseList = Array.isArray(extra?.weekExerciseList)
    ? extra.weekExerciseList
    : (Array.isArray(state?.weekExerciseList) ? state.weekExerciseList : undefined);
  const failedDayExercises = Array.isArray(extra?.failedDayExercises)
    ? extra.failedDayExercises
    : (Array.isArray(state?.failedDayExercises) ? state.failedDayExercises : undefined);
  const hingeDeadliftExercisesInWeek = Array.isArray(extra?.hingeDeadliftExercisesInWeek)
    ? extra.hingeDeadliftExercisesInWeek
    : (Array.isArray(state?.hingeDeadliftExercisesInWeek) ? state.hingeDeadliftExercisesInWeek : undefined);
  const heavyDeadliftExercisesInWeek = Array.isArray(extra?.heavyDeadliftExercisesInWeek)
    ? extra.heavyDeadliftExercisesInWeek
    : (Array.isArray(state?.heavyDeadliftExercisesInWeek) ? state.heavyDeadliftExercisesInWeek : undefined);
  const countedHeavyDeadliftExerciseNames = Array.isArray(extra?.countedHeavyDeadliftExerciseNames)
    ? extra.countedHeavyDeadliftExerciseNames
    : (Array.isArray(state?.countedHeavyDeadliftExerciseNames) ? state.countedHeavyDeadliftExerciseNames : undefined);
  const heavyDeadliftByDay = Array.isArray(extra?.heavyDeadliftByDay)
    ? extra.heavyDeadliftByDay
    : (Array.isArray(state?.heavyDeadliftByDay) ? state.heavyDeadliftByDay : undefined);
  return {
    functionName: 'assertBodybuildingPlanByEngine',
    stage: 'assertBodybuildingPlanByEngine',
    failedStage: 'assertBodybuildingPlanByEngine',
    validatorSection: String(extra?.validatorSection || state?.validatorSection || '').trim() || undefined,
    failedInvariant: String(extra?.failedInvariant || state?.failedInvariant || '').trim() || undefined,
    sectionPhase: String(extra?.sectionPhase || state?.sectionPhase || '').trim() || undefined,
    lastSectionStarted: String(extra?.lastSectionStarted || state?.lastSectionStarted || '').trim() || undefined,
    lastSectionCompleted: String(extra?.lastSectionCompleted || state?.lastSectionCompleted || '').trim() || undefined,
    currentRunningSection: String(extra?.currentRunningSection || state?.currentRunningSection || '').trim() || undefined,
    currentRunningSectionElapsedMs: Number.isFinite(Number(extra?.currentRunningSectionElapsedMs))
      ? Number(extra.currentRunningSectionElapsedMs)
      : (Number.isFinite(Number(state?.currentRunningSectionElapsedMs)) ? Number(state.currentRunningSectionElapsedMs) : undefined),
    sectionDurationsMs: extra?.sectionDurationsMs || state?.sectionDurationsMs || undefined,
    assertFinallyReached: typeof extra?.assertFinallyReached === 'boolean' ? extra.assertFinallyReached : (typeof state?.assertFinallyReached === 'boolean' ? state.assertFinallyReached : undefined),
    assertReturnedSuccessfully: typeof extra?.assertReturnedSuccessfully === 'boolean' ? extra.assertReturnedSuccessfully : (typeof state?.assertReturnedSuccessfully === 'boolean' ? state.assertReturnedSuccessfully : undefined),
    week: Number.isFinite(Number(extra?.week)) ? Number(extra.week) : (Number.isFinite(Number(state?.week)) ? Number(state.week) : undefined),
    day: String(extra?.day || state?.day || '').trim() || undefined,
    dayType: String(extra?.dayType || state?.dayType || '').trim() || undefined,
    exerciseNames: Array.isArray(exerciseNames) ? exerciseNames : undefined,
    priorityGroups: Array.isArray(priorityGroups) ? priorityGroups : undefined,
    weeklyTargets: extra?.weeklyTargets || ctx?.weeklyTargets || undefined,
    calfTargetSets: Number.isFinite(Number(extra?.calfTargetSets))
      ? Number(extra.calfTargetSets)
      : (Number.isFinite(Number(ctx?.calfTargetSets)) ? Number(ctx.calfTargetSets) : undefined),
    calfDirectSets: Number.isFinite(Number(extra?.calfDirectSets))
      ? Number(extra.calfDirectSets)
      : (Number.isFinite(Number(state?.calfDirectSets)) ? Number(state.calfDirectSets) : undefined),
    calfExposureDays: Array.isArray(calfExposureDays) ? calfExposureDays : undefined,
    weekExerciseList: Array.isArray(weekExerciseList) ? weekExerciseList : undefined,
    failedDayExercises: Array.isArray(failedDayExercises) ? failedDayExercises : undefined,
    hingeDeadliftExercisesInWeek: Array.isArray(hingeDeadliftExercisesInWeek) ? hingeDeadliftExercisesInWeek : undefined,
    heavyDeadliftExercisesInWeek: Array.isArray(heavyDeadliftExercisesInWeek) ? heavyDeadliftExercisesInWeek : undefined,
    countedHeavyDeadliftExerciseNames: Array.isArray(countedHeavyDeadliftExerciseNames) ? countedHeavyDeadliftExerciseNames.map((value) => String(value || '')) : undefined,
    heavyDeadliftByDay: Array.isArray(heavyDeadliftByDay) ? heavyDeadliftByDay : undefined,
    legsSelected: typeof extra?.legsSelected === 'boolean' ? extra.legsSelected : (typeof state?.legsSelected === 'boolean' ? state.legsSelected : undefined),
    glutesSelected: typeof extra?.glutesSelected === 'boolean' ? extra.glutesSelected : (typeof state?.glutesSelected === 'boolean' ? state.glutesSelected : undefined),
    sameDayHeavyHingeCount: Number.isFinite(Number(extra?.sameDayHeavyHingeCount))
      ? Number(extra.sameDayHeavyHingeCount)
      : (Number.isFinite(Number(state?.sameDayHeavyHingeCount)) ? Number(state.sameDayHeavyHingeCount) : undefined),
    weeklyHeavyHingeExposureDays: Number.isFinite(Number(extra?.weeklyHeavyHingeExposureDays))
      ? Number(extra.weeklyHeavyHingeExposureDays)
      : (Number.isFinite(Number(state?.weeklyHeavyHingeExposureDays)) ? Number(state.weeklyHeavyHingeExposureDays) : undefined),
    repeatedHeavyHingeRole: String(extra?.repeatedHeavyHingeRole || state?.repeatedHeavyHingeRole || '').trim() || undefined,
    sameDayHeavyHingeStacking: typeof extra?.sameDayHeavyHingeStacking === 'boolean' ? extra.sameDayHeavyHingeStacking : (typeof state?.sameDayHeavyHingeStacking === 'boolean' ? state.sameDayHeavyHingeStacking : undefined),
    weeklyHeavyHingeStacking: typeof extra?.weeklyHeavyHingeStacking === 'boolean' ? extra.weeklyHeavyHingeStacking : (typeof state?.weeklyHeavyHingeStacking === 'boolean' ? state.weeklyHeavyHingeStacking : undefined),
    heavyDeadliftFalsePositiveCount: Number.isFinite(Number(extra?.heavyDeadliftFalsePositiveCount))
      ? Number(extra.heavyDeadliftFalsePositiveCount)
      : (Number.isFinite(Number(state?.heavyDeadliftFalsePositiveCount)) ? Number(state.heavyDeadliftFalsePositiveCount) : undefined),
    falsePositiveClassification: typeof extra?.falsePositiveClassification === 'boolean' ? extra.falsePositiveClassification : (typeof state?.falsePositiveClassification === 'boolean' ? state.falsePositiveClassification : undefined),
    safeHeavyHingeReplacementExists: typeof extra?.safeHeavyHingeReplacementExists === 'boolean' ? extra.safeHeavyHingeReplacementExists : (typeof state?.safeHeavyHingeReplacementExists === 'boolean' ? state.safeHeavyHingeReplacementExists : undefined),
    safeHeavyHingeReplacementCandidate: extra?.safeHeavyHingeReplacementCandidate || state?.safeHeavyHingeReplacementCandidate || undefined,
    removingOrReplacingWouldBreakLowerDayStructure: typeof extra?.removingOrReplacingWouldBreakLowerDayStructure === 'boolean'
      ? extra.removingOrReplacingWouldBreakLowerDayStructure
      : (typeof state?.removingOrReplacingWouldBreakLowerDayStructure === 'boolean' ? state.removingOrReplacingWouldBreakLowerDayStructure : undefined),
    heavyDeadliftIssueKind: String(extra?.heavyDeadliftIssueKind || state?.heavyDeadliftIssueKind || '').trim() || undefined,
    hardFailReason: String(extra?.hardFailReason || state?.hardFailReason || '').trim() || undefined,
    softenedToWarning: typeof extra?.softenedToWarning === 'boolean' ? extra.softenedToWarning : (typeof state?.softenedToWarning === 'boolean' ? state.softenedToWarning : undefined)
  };
}

function emitAssertionDiagnosticBreadcrumb(validatorSection, extra = {}) {
  const ctx = activeAssertionDiagnosticContext && typeof activeAssertionDiagnosticContext === 'object'
    ? activeAssertionDiagnosticContext
    : null;
  if (ctx?.state && typeof ctx.state === 'object') {
    if (validatorSection) ctx.state.validatorSection = String(validatorSection || '').trim();
    if (extra?.failedInvariant) ctx.state.failedInvariant = String(extra.failedInvariant || '').trim();
    if (extra?.sectionPhase) {
      ctx.state.sectionPhase = String(extra.sectionPhase || '').trim();
      if (ctx.state.sectionPhase === 'section_started') {
        ctx.state.lastSectionStarted = String(validatorSection || '').trim();
        ctx.state.currentRunningSection = String(validatorSection || '').trim();
        ctx.state.currentRunningSectionStartedAt = Date.now();
        ctx.state.currentRunningSectionElapsedMs = 0;
      }
      if (ctx.state.sectionPhase === 'section_completed') {
        ctx.state.lastSectionCompleted = String(validatorSection || '').trim();
        const completedSection = String(validatorSection || '').trim();
        const startedAt = Number(ctx.state.currentRunningSectionStartedAt);
        const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : null;
        if (completedSection && Number.isFinite(elapsedMs)) {
          ctx.state.sectionDurationsMs = {
            ...(ctx.state.sectionDurationsMs || {}),
            [completedSection]: Number((ctx.state.sectionDurationsMs || {})[completedSection] || 0) + elapsedMs
          };
        }
        if (ctx.state.currentRunningSection === completedSection) {
          ctx.state.currentRunningSection = '';
          ctx.state.currentRunningSectionStartedAt = null;
          ctx.state.currentRunningSectionElapsedMs = null;
        }
      }
    }
    if (ctx.state.currentRunningSection && Number.isFinite(Number(ctx.state.currentRunningSectionStartedAt))) {
      ctx.state.currentRunningSectionElapsedMs = Math.max(0, Date.now() - Number(ctx.state.currentRunningSectionStartedAt));
    }
    if (typeof extra?.assertFinallyReached === 'boolean') ctx.state.assertFinallyReached = extra.assertFinallyReached;
    if (typeof extra?.assertReturnedSuccessfully === 'boolean') ctx.state.assertReturnedSuccessfully = extra.assertReturnedSuccessfully;
    if (Number.isFinite(Number(extra?.week))) ctx.state.week = Number(extra.week);
    if (extra?.day) ctx.state.day = String(extra.day || '').trim();
    if (extra?.dayType) ctx.state.dayType = String(extra.dayType || '').trim();
    if (Array.isArray(extra?.exerciseNames)) ctx.state.exerciseNames = extra.exerciseNames.map((value) => String(value || ''));
    if (Number.isFinite(Number(extra?.calfDirectSets))) ctx.state.calfDirectSets = Number(extra.calfDirectSets);
    if (Array.isArray(extra?.calfExposureDays)) ctx.state.calfExposureDays = extra.calfExposureDays;
  }
  const payload = buildAssertionDiagnosticFields({
    validatorSection,
    ...extra
  });
  const heartbeat = typeof ctx?.heartbeat === 'function' ? ctx.heartbeat : null;
  if (heartbeat) {
    heartbeat(`assert checkpoint: ${String(validatorSection || '').trim() || 'unknown'}`, {
      lastBuilderStage: String(validatorSection || '').trim() || undefined,
      lastRepairOrPolishFunction: 'assertBodybuildingPlanByEngine',
      lastKnownWeek: payload.week,
      lastKnownDay: payload.day,
      lastKnownDayType: payload.dayType,
      validatorSection: payload.validatorSection,
      failedInvariant: payload.failedInvariant,
      sectionPhase: payload.sectionPhase,
      lastSectionStarted: payload.lastSectionStarted,
      lastSectionCompleted: payload.lastSectionCompleted,
      currentRunningSection: payload.currentRunningSection,
      currentRunningSectionElapsedMs: payload.currentRunningSectionElapsedMs,
      sectionDurationsMs: payload.sectionDurationsMs,
      assertFinallyReached: payload.assertFinallyReached,
      assertReturnedSuccessfully: payload.assertReturnedSuccessfully,
      exerciseNames: payload.exerciseNames,
      priorityGroups: payload.priorityGroups,
      weeklyTargets: payload.weeklyTargets,
      calfTargetSets: payload.calfTargetSets,
      calfDirectSets: payload.calfDirectSets,
      calfExposureDays: payload.calfExposureDays
    });
  }
}

function markAssertionSection(validatorSection, phase, extra = {}) {
  emitAssertionDiagnosticBreadcrumb(validatorSection, {
    ...extra,
    sectionPhase: String(phase || '').trim() || undefined,
    failedInvariant: extra?.failedInvariant || String(phase || '').trim() || undefined
  });
}

function throwAssertionInvariant(message, extra = {}) {
  const err = new Error(message);
  Object.assign(err, buildAssertionDiagnosticFields(extra));
  throw err;
}

function safeAssertionPreview(value, maxLength = 1200) {
  const seen = new WeakSet();
  try {
    const raw = JSON.stringify(value, (key, current) => {
      if (typeof current === 'function') return `[Function ${current.name || 'anonymous'}]`;
      if (typeof current === 'bigint') return String(current);
      if (current && typeof current === 'object') {
        if (seen.has(current)) return '[Circular]';
        seen.add(current);
      }
      return current;
    });
    if (!raw) return String(value);
    return raw.length > maxLength ? `${raw.slice(0, maxLength)}…` : raw;
  } catch (err) {
    return `[Unserializable: ${String(err?.message || err || 'unknown error')}]`;
  }
}

function summarizeAssertionPlanShape(planObj) {
  const weeks = Array.isArray(planObj?.weeks) ? planObj.weeks : [];
  const firstWeek = weeks[0] && typeof weeks[0] === 'object' ? weeks[0] : null;
  const firstWeekDays = Array.isArray(firstWeek?.days) ? firstWeek.days : [];
  const dayTypesPresent = Array.from(new Set(
    weeks.flatMap((week) => (Array.isArray(week?.days) ? week.days : []))
      .map((day) => String(day?.dayType || '').trim())
      .filter(Boolean)
  ));
  const totalDayCount = weeks.reduce((sum, week) => sum + (Array.isArray(week?.days) ? week.days.length : 0), 0);
  const totalExerciseCount = weeks.reduce((sum, week) => sum + (Array.isArray(week?.days) ? week.days.reduce((inner, day) => inner + (Array.isArray(day?.exercises) ? day.exercises.length : 0), 0) : 0), 0);
  return {
    planShapeType: Array.isArray(planObj?.weeks) ? 'weeks_plan' : typeof planObj,
    isOblueprintPlanShape: isOblueprintPlanShape(planObj),
    weeksLength: weeks.length,
    firstWeekDayCount: firstWeekDays.length,
    totalDayCount,
    totalExerciseCount,
    dayTypesPresent,
    dayCount: Number(planObj?.meta?.daysPerWeek || totalDayCount || 0) || undefined,
    priorityCount: Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.length : undefined
  };
}

function assertOblueprintBodybuildingIntegrity(planObj) {
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.map((x) => String(x || '').toLowerCase()) : [];
  const shouldersPriority = priorityGroups.includes('shoulders');
  const backPriority = priorityGroups.includes('back');
  const chestPriority = priorityGroups.includes('chest');
  const weeklyTargets = planObj?.meta?.weeklyTargets || undefined;
  const calfTargetSets = Number.isFinite(Number(
    weeklyTargets?.targetWeeklySets?.Calves
    || weeklyTargets?.weeklyTargets?.targetWeeklySets?.Calves
  ))
    ? Number(
      weeklyTargets?.targetWeeklySets?.Calves
      || weeklyTargets?.weeklyTargets?.targetWeeklySets?.Calves
    )
    : undefined;
  let emittedBeforeWeekLoop = false;
  let emittedWeekLoopStarted = false;
  let emittedDayLoopStarted = false;
  let emittedExerciseLoopStarted = false;
  let emittedAfterFirstDayProcessed = false;
  let emittedAfterFirstWeekProcessed = false;
  markAssertionSection('plan_shape_validation', 'section_started', {
    failedInvariant: 'plan_shape',
    priorityGroups,
    weeklyTargets,
    calfTargetSets
  });
  emitAssertionDiagnosticBreadcrumb('plan_shape_validation', {
    failedInvariant: 'plan_shape',
    priorityGroups,
    weeklyTargets,
    calfTargetSets
  });
  if (!emittedBeforeWeekLoop) {
    emittedBeforeWeekLoop = true;
    emitAssertionDiagnosticBreadcrumb('before_week_loop', {
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'before_week_loop'
    });
  }
  for (const week of planObj?.weeks || []) {
    if (!emittedWeekLoopStarted) {
      emittedWeekLoopStarted = true;
      emitAssertionDiagnosticBreadcrumb('week_loop_started', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        failedInvariant: 'week_loop_started'
      });
    }
    emitAssertionDiagnosticBreadcrumb('plan_shape_validation', {
      week: Number(week?.weekIndex || week?.index || 0) || 0,
      failedInvariant: 'week_iteration',
      priorityGroups,
      weeklyTargets,
      calfTargetSets
    });
    const rearDeltDays = new Set();
    let totalRearDeltSets = 0;
    let weeklyLengthenedHingeCount = 0;
    let weeklyRdlCount = 0;
    let hasLowerDay = false;
    let totalCalfSets = 0;
    const calfExposureDays = [];
    const weekExerciseList = [];
    const weeklyHingeExercises = [];
    const weeklyHeavyDeadliftExercises = [];
    const heavyDeadliftByDay = new Map();
    const heavyDeadliftRoleDays = new Map();
    const weekDays = Array.isArray(week?.days) ? week.days : [];
    for (let dayIndex = 0; dayIndex < weekDays.length; dayIndex += 1) {
      const day = weekDays[dayIndex];
      if (!emittedDayLoopStarted) {
        emittedDayLoopStarted = true;
        emitAssertionDiagnosticBreadcrumb('day_loop_started', {
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          dayIndex,
          day: String(day?.day || '').trim() || undefined,
          dayType: String(day?.dayType || '').trim() || undefined,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          failedInvariant: 'day_loop_started'
        });
      }
      const isoFamilies = new Set();
      let chestFlyCount = 0;
      let chestPressCompoundCount = 0;
      let hasTricepsIso = false;
      let hasBicepsIso = false;
      let hasShoulderPress = false;
      let hasCalves = false;
      let hasAbs = false;
      let hasHamCurl = false;
      let hasPushMain = false;
      let hasRow = false;
      let hasVerticalPull = false;
      let hasSquat = false;
      let hasHinge = false;
      let benchPressCompoundCount = 0;
      let coreCount = 0;
      const dayType = String(day?.dayType || '').toLowerCase();
      if (dayType === 'legs' || dayType === 'lower') hasLowerDay = true;
      const dayKey = `${week?.weekIndex || week?.index || '?'}:${dayType}`;
      let dayRearDeltCount = 0;
      const dayExercises = Array.isArray(day?.exercises) ? day.exercises : [];
      const dayObjectKeys = day && typeof day === 'object' ? Object.keys(day) : [];
      const rawDayPreview = safeAssertionPreview(day);
      const dayExerciseNames = dayExercises.map((x) => String(x?.name || x?.displayName || x?.movementName || ''));
      weekExerciseList.push({
        day: String(day?.day || '').trim() || null,
        dayIndex,
        dayType,
        exerciseNames: dayExerciseNames.slice()
      });
      const firstExercise = dayExercises[0] || null;
      let dayCalfSets = 0;
      markAssertionSection('invalid_exercise_object_validation', 'section_started', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
      emitAssertionDiagnosticBreadcrumb('day_structure_validation', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        failedInvariant: 'day_iteration',
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
      for (let exerciseIndex = 0; exerciseIndex < dayExercises.length; exerciseIndex += 1) {
        const ex = dayExercises[exerciseIndex];
        if (!emittedExerciseLoopStarted) {
          emittedExerciseLoopStarted = true;
          emitAssertionDiagnosticBreadcrumb('exercise_loop_started', {
            week: Number(week?.weekIndex || week?.index || 0) || 0,
            dayIndex,
            day: String(day?.day || '').trim() || undefined,
            dayType,
            exerciseIndex,
            exerciseName: String(ex?.name || ex?.displayName || ex?.movementName || '').trim() || undefined,
            exerciseNames: dayExerciseNames,
            priorityGroups,
            weeklyTargets,
            calfTargetSets,
            failedInvariant: 'exercise_loop_started'
          });
        }
        const exerciseKeys = ex && typeof ex === 'object' ? Object.keys(ex) : [];
        const rawExercisePreview = safeAssertionPreview(ex);
        const exerciseName = String(ex?.name || ex?.displayName || ex?.movementName || '');
        const baseExerciseContext = {
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          dayIndex,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseIndex,
          exerciseName: exerciseName || undefined,
          exerciseKeys,
          rawExercisePreview,
          rawDayPreview,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays,
          dayObjectKeys,
          dayExercisesIsArray: Array.isArray(day?.exercises),
          exerciseType: typeof ex,
          exerciseIsArray: Array.isArray(ex),
          exerciseId: ex?.id,
          exerciseSets: ex?.sets,
          exerciseReps: ex?.reps
        };
        emitAssertionDiagnosticBreadcrumb('invalid_exercise_object_validation', {
          ...baseExerciseContext,
          failedInvariant: 'exercise_object_iteration'
        });
        try {
          const sets = Number(ex?.sets) || 0;
          if (sets > 4) {
            throwAssertionInvariant(`Set cap violated: ${exerciseName || 'exercise'} (${sets} > 4)`, {
              validatorSection: 'invalid_exercise_object_validation',
              failedInvariant: 'set_cap',
              ...baseExerciseContext,
              calfDirectSets: totalCalfSets,
              calfExposureDays
            });
          }
          const name = exerciseName.toLowerCase();
          if (ROUTE_BANNED_NAME_PATTERNS.some((rx) => rx.test(name))) {
            throwAssertionInvariant(`Banned exercise detected: ${exerciseName || 'exercise'}`, {
              validatorSection: 'banned_exercise_validation',
              failedInvariant: 'banned_exercise',
              ...baseExerciseContext,
              calfDirectSets: totalCalfSets,
              calfExposureDays
            });
          }
          if (routeIsNoveltyName(name)) {
            throwAssertionInvariant(`Novelty exercise detected: ${exerciseName || 'exercise'}`, {
              validatorSection: 'banned_exercise_validation',
              failedInvariant: 'novelty_exercise',
              ...baseExerciseContext,
              calfDirectSets: totalCalfSets,
              calfExposureDays
            });
          }
          if (routeIsLengthenedHingeName(name)) {
            weeklyLengthenedHingeCount += 1;
          }
          if ((dayType === 'legs' || dayType === 'lower') && routeIsRdlName(name)) {
            weeklyRdlCount += 1;
          }
          const style = String(ex?.style || '').toLowerCase();
          const pattern = String(ex?.pattern || '').toLowerCase();
          const fam = style === 'isolation' ? isolationFamilyForName(name) : null;
          if (fam) {
            if (isoFamilies.has(fam)) {
              throwAssertionInvariant(`Duplicate isolation family in a day: ${exerciseName || 'exercise'}`, {
                validatorSection: 'duplicate_exercise_name_validation',
                failedInvariant: 'duplicate_isolation_family',
                ...baseExerciseContext,
                calfDirectSets: totalCalfSets,
                calfExposureDays
              });
            }
            isoFamilies.add(fam);
            if (fam === 'chest_fly') chestFlyCount += 1;
            if (fam === 'rear_delt') {
              dayRearDeltCount += 1;
              totalRearDeltSets += sets;
            }
          }
          if (style === 'compound') {
            if (routeIsHorizontalPressMain(ex)) benchPressCompoundCount += 1;
            const isHeavyDeadliftPattern = /(deadlift|romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(name) && !/(hip thrust|glute bridge)/.test(name);
            const isLikelyFalsePositiveHeavyDeadlift = isHeavyDeadliftPattern && /(single[-\s]*leg|single leg|rear lunge|split squat|step up|step-up)/.test(name);
            if (pattern === 'hinge' || /(deadlift|romanian|rdl|hip thrust|glute bridge|good morning|back extension|hyperextension)/.test(name)) {
              weeklyHingeExercises.push({
                day: String(day?.day || '').trim() || null,
                dayIndex,
                dayType,
                exerciseName,
                style,
                pattern,
                countedAsHeavyDeadlift: isHeavyDeadliftPattern,
                likelyFalsePositive: isLikelyFalsePositiveHeavyDeadlift,
                trueHeavyHinge: isHeavyDeadliftPattern && !isLikelyFalsePositiveHeavyDeadlift
              });
            }
            if (isHeavyDeadliftPattern) {
              const heavyRole = routeHeavyHingeRoleName(name) || 'heavy_hinge';
              const heavyEntry = {
                day: String(day?.day || '').trim() || null,
                dayIndex,
                dayType,
                exerciseName,
                style,
                pattern,
                heavyRole,
                countedAsHeavyDeadlift: true,
                likelyFalsePositive: isLikelyFalsePositiveHeavyDeadlift,
                trueHeavyHinge: !isLikelyFalsePositiveHeavyDeadlift
              };
              weeklyHeavyDeadliftExercises.push(heavyEntry);
              const heavyDayKey = `${dayIndex}|${dayType}|${String(day?.day || '').trim() || ''}`;
              const heavyDayBucket = heavyDeadliftByDay.get(heavyDayKey) || {
                day: String(day?.day || '').trim() || null,
                dayIndex,
                dayType,
                exerciseNames: []
              };
              heavyDayBucket.exerciseNames.push(exerciseName);
              heavyDeadliftByDay.set(heavyDayKey, heavyDayBucket);
              const roleDays = heavyDeadliftRoleDays.get(heavyRole) || new Set();
              roleDays.add(heavyDayKey);
              heavyDeadliftRoleDays.set(heavyRole, roleDays);
            }
            if (/(bench|chest press|incline press|decline press|dumbbell press|machine press)/.test(name)) chestPressCompoundCount += 1;
            if (/(overhead press|shoulder press|military press)/.test(name)) hasShoulderPress = true;
            if (/(bench|chest press|incline press|decline press|dumbbell press|machine press|overhead press|shoulder press|military press)/.test(name)) hasPushMain = true;
            if (pattern === 'horizontalpull' || /\brow\b/.test(name)) hasRow = true;
            if (pattern === 'verticalpull' || /(pulldown|pull-up|pull up|chin-up|chin up)/.test(name)) hasVerticalPull = true;
            if (pattern === 'squat' || /(squat|leg press|hack squat)/.test(name)) hasSquat = true;
            if (pattern === 'hinge' || /(deadlift|romanian|rdl|hip thrust|glute bridge)/.test(name)) hasHinge = true;
          }
          if (style === 'isolation') {
            if (routeIsTricepsIsoName(name)) hasTricepsIso = true;
            if (routeIsBicepsIsoName(name)) hasBicepsIso = true;
            if (/(seated leg curl|lying leg curl|hamstring curl|leg curl)/.test(name)) hasHamCurl = true;
            if (/calf/.test(name)) {
              hasCalves = true;
              dayCalfSets += sets;
              totalCalfSets += sets;
            }
            if (routeIsCoreName(name)) {
              hasAbs = true;
              coreCount += 1;
            }
          }
        } catch (err) {
          if (err && typeof err === 'object' && !err.validatorSection) {
            Object.assign(err, buildAssertionDiagnosticFields({
              validatorSection: 'invalid_exercise_object_validation',
              failedInvariant: 'exercise_object_iteration',
              ...baseExerciseContext,
              calfDirectSets: totalCalfSets,
              calfExposureDays
            }));
          }
          throw err;
        }
        emitAssertionDiagnosticBreadcrumb('invalid_exercise_object_validation', {
          ...baseExerciseContext,
          failedInvariant: 'exercise_object_iteration_complete',
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      markAssertionSection('invalid_exercise_object_validation', 'section_completed', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'invalid_exercise_object_validation_complete'
      });
      if (!emittedAfterFirstDayProcessed) {
        emittedAfterFirstDayProcessed = true;
        emitAssertionDiagnosticBreadcrumb('after_first_day_processed', {
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          dayIndex,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          failedInvariant: 'after_first_day_processed'
        });
      }
      emitAssertionDiagnosticBreadcrumb('post_invalid_exercise_validation_transition', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'transition_started'
      });
      markAssertionSection('duplicate_exercise_name_validation', 'section_started', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'duplicate_validation_started'
      });
      if (dayCalfSets > 0) {
        calfExposureDays.push({
          day: String(day?.day || '').trim() || null,
          dayType,
          directSets: dayCalfSets
        });
      }
      if (dayRearDeltCount > 0) rearDeltDays.add(dayKey);
      markAssertionSection('duplicate_exercise_name_validation', 'section_completed', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
      markAssertionSection('same_day_redundancy_validation', 'section_started', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
      if (chestFlyCount > 1) {
        throwAssertionInvariant(`Too many fly variations in one day (${chestFlyCount}).`, {
          validatorSection: 'same_day_redundancy_validation',
          failedInvariant: 'chest_fly_count',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      const benchPressCompoundCap = chestPriority ? 2 : 1;
      if (benchPressCompoundCount > benchPressCompoundCap) {
        throwAssertionInvariant(`Too many bench press compounds in one day (${benchPressCompoundCount}).`, {
          validatorSection: 'same_day_redundancy_validation',
          failedInvariant: 'bench_press_compound_count',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      markAssertionSection('same_day_redundancy_validation', 'section_completed', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
      emitAssertionDiagnosticBreadcrumb('same_day_redundancy_validation_completed', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'same_day_redundancy_validation_completed'
      });
      emitAssertionDiagnosticBreadcrumb('post_same_day_redundancy_transition_started', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'transition_started'
      });
      emitAssertionDiagnosticBreadcrumb('post_same_day_redundancy_statement_1', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'if_daytype_push_or_upper_missing_push_main'
      });
      if ((dayType === 'push' || dayType === 'upper') && !hasPushMain) {
        throwAssertionInvariant('Push/Upper day missing staple press compound.', {
          validatorSection: 'priority fulfillment validation',
          failedInvariant: 'missing_push_main',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      emitAssertionDiagnosticBreadcrumb('post_same_day_redundancy_statement_2', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'if_push_first_exercise'
      });
      if (dayType === 'push' && (!routeIsHorizontalPressMain(firstExercise) || !routeIsStapleChestMainName(firstExercise?.name))) {
        throwAssertionInvariant('Push day must start with a staple chest press.', {
          validatorSection: 'day structure validation',
          failedInvariant: 'push_day_first_exercise',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      emitAssertionDiagnosticBreadcrumb('post_same_day_redundancy_statement_3', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'if_upper_first_exercise'
      });
      if (dayType === 'upper' && (!routeIsHorizontalPressMain(firstExercise) || !routeIsStapleChestMainName(firstExercise?.name))) {
        throwAssertionInvariant('Upper day must start with a staple chest press.', {
          validatorSection: 'day structure validation',
          failedInvariant: 'upper_day_first_exercise',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      emitAssertionDiagnosticBreadcrumb('post_same_day_redundancy_statement_4', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'if_push_missing_shoulder_press'
      });
      if (dayType === 'push' && !hasShoulderPress) {
        throwAssertionInvariant('Push day missing shoulder press compound.', {
          validatorSection: 'shoulder press duplication validation',
          failedInvariant: 'missing_shoulder_press',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      emitAssertionDiagnosticBreadcrumb('post_same_day_redundancy_statement_5', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        failedInvariant: 'if_push_missing_triceps_iso'
      });
      if (dayType === 'push' && !hasTricepsIso) {
        throwAssertionInvariant('Push day missing triceps isolation.', {
          validatorSection: 'arm role validation',
          failedInvariant: 'missing_triceps_iso',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if (dayType === 'pull' && (!hasRow || !hasVerticalPull)) {
        throwAssertionInvariant('Pull day must include both a row and a vertical pull.', {
          validatorSection: 'priority fulfillment validation',
          failedInvariant: 'missing_row_or_vertical_pull',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if (dayType === 'pull' && !routeIsVerticalPullName(dayExerciseNames[0]) && !routeIsVerticalPullName(dayExerciseNames[1])) {
        throwAssertionInvariant('Pull day must lead with a vertical pull.', {
          validatorSection: 'day structure validation',
          failedInvariant: 'pull_day_lead_vertical_pull',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if (dayType === 'pull' && !hasBicepsIso) {
        throwAssertionInvariant('Pull day missing biceps isolation.', {
          validatorSection: 'arm role validation',
          failedInvariant: 'missing_biceps_iso',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if (dayType === 'pull' && /(lateral raise|side lateral)/.test((day?.exercises || []).map((x) => String(x?.name || '').toLowerCase()).join(' | '))) {
        throwAssertionInvariant('Pull day must not include lateral raises.', {
          validatorSection: 'lateral raise cap validation',
          failedInvariant: 'pull_day_lateral_raise_forbidden',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if ((dayType === 'legs' || dayType === 'lower') && !routeIsStapleSquatName(firstExercise?.name)) {
        throwAssertionInvariant('Leg day must start with a staple squat/press pattern.', {
          validatorSection: 'quad pattern validation',
          failedInvariant: 'lower_day_first_exercise_quad',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if ((dayType === 'legs' || dayType === 'lower') && (!hasSquat || !hasHinge)) {
        if (!(hasSquat && hasHamCurl)) {
          throwAssertionInvariant('Leg day must include squat and either hinge or hamstring curl.', {
            validatorSection: 'lower-day hinge validation',
            failedInvariant: 'missing_hinge_or_hamcurl',
            week: Number(week?.weekIndex || week?.index || 0) || 0,
            day: String(day?.day || '').trim() || undefined,
            dayType,
            exerciseNames: dayExerciseNames,
            priorityGroups,
            weeklyTargets,
            calfTargetSets,
            calfDirectSets: totalCalfSets,
            calfExposureDays
          });
        }
      }
      if (dayType === 'lower' && !hasHinge) {
        throwAssertionInvariant('Lower day must include one hinge pattern.', {
          validatorSection: 'lower-day hinge validation',
          failedInvariant: 'lower_day_missing_hinge',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if ((dayType === 'legs' || dayType === 'lower') && !hasHamCurl) {
        throwAssertionInvariant('Leg day must include seated or lying hamstring curl.', {
          validatorSection: 'lower-day hinge validation',
          failedInvariant: 'missing_hamstring_curl',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if ((dayType === 'legs' || dayType === 'lower') && (!hasCalves || !hasAbs)) {
        throwAssertionInvariant('Leg day must include calves and abs.', {
          validatorSection: 'calf volume/exposure validation',
          failedInvariant: !hasCalves ? 'missing_calves' : 'missing_abs',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      emitAssertionDiagnosticBreadcrumb('core volume validation', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        day: String(day?.day || '').trim() || undefined,
        dayType,
        exerciseNames: dayExerciseNames,
        failedInvariant: 'core_count_checkpoint',
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
      const maxCorePerDay = dayType === 'deltsarms'
        ? 0
        : ((priorityGroups.includes('abs') || priorityGroups.includes('core')) && (dayType === 'legs' || dayType === 'lower') ? 2 : 1);
      if (coreCount > maxCorePerDay) {
        throwAssertionInvariant(`Too many core movements in one day (${coreCount} > ${maxCorePerDay}).`, {
          validatorSection: 'core volume validation',
          failedInvariant: 'core_count_per_day',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
      if (dayType === 'deltsarms') {
        const biIsoCount = (day?.exercises || []).filter((x) => String(x?.style || '').toLowerCase() === 'isolation' && routeIsBicepsIsoName(String(x?.name || '').toLowerCase())).length;
        const triIsoCount = (day?.exercises || []).filter((x) => String(x?.style || '').toLowerCase() === 'isolation' && routeIsTricepsIsoName(String(x?.name || '').toLowerCase())).length;
        if (biIsoCount !== 1 || triIsoCount !== 1) {
          throwAssertionInvariant('Delts+Arms day must include exactly one biceps iso and one triceps iso.', {
            validatorSection: 'arm role validation',
            failedInvariant: 'deltsarms_iso_pairing',
            week: Number(week?.weekIndex || week?.index || 0) || 0,
            day: String(day?.day || '').trim() || undefined,
            dayType,
            exerciseNames: dayExerciseNames,
            priorityGroups,
            weeklyTargets,
            calfTargetSets,
            calfDirectSets: totalCalfSets,
            calfExposureDays
          });
        }
      }
      if ((dayType === 'push' || dayType === 'upper') && !chestPriority && chestPressCompoundCount >= 2 && chestFlyCount > 0) {
        throwAssertionInvariant('Chest day cannot combine 2 chest presses with chest fly in same day.', {
          validatorSection: 'day structure validation',
          failedInvariant: 'press_plus_fly_overload',
          week: Number(week?.weekIndex || week?.index || 0) || 0,
          day: String(day?.day || '').trim() || undefined,
          dayType,
          exerciseNames: dayExerciseNames,
          priorityGroups,
          weeklyTargets,
          calfTargetSets,
          calfDirectSets: totalCalfSets,
          calfExposureDays
        });
      }
    }
    emitAssertionDiagnosticBreadcrumb('calf volume/exposure validation', {
      week: Number(week?.weekIndex || week?.index || 0) || 0,
      failedInvariant: 'weekly_calf_checkpoint',
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      calfDirectSets: totalCalfSets,
      calfExposureDays
    });
    const heavyDeadliftDayRows = [...heavyDeadliftByDay.values()].map((entry) => ({
      ...entry,
      count: Array.isArray(entry?.exerciseNames) ? entry.exerciseNames.length : 0
    }));
    const sameDayHeavyHingeCount = heavyDeadliftDayRows.reduce((max, entry) => Math.max(max, Number(entry?.count || 0)), 0);
    const sameDayHeavyHingeStacking = sameDayHeavyHingeCount >= 2;
    const weeklyHeavyHingeExposureDays = heavyDeadliftDayRows.filter((entry) => Number(entry?.count || 0) > 0).length;
    const repeatedHeavyHingeRole = [...heavyDeadliftRoleDays.entries()].find(([, dayKeys]) => dayKeys.size > 1)?.[0] || null;
    const glutesSelected = priorityGroups.includes('glutes') || priorityGroups.includes('hamstrings/glutes');
    const legsSelected = priorityGroups.includes('legs') || priorityGroups.includes('quads');
    const priorityJustifiedSeparatedHeavyExposure = glutesSelected;
    const heavyFalsePositiveCount = weeklyHeavyDeadliftExercises.filter((entry) => entry?.likelyFalsePositive).length;
    const heavyPatternNames = weeklyHeavyDeadliftExercises.map((entry) => String(entry?.exerciseName || ''));
    const safeReplacementCandidate = weeklyHeavyDeadliftExercises.find((entry) => {
      const sameDayHinges = weeklyHingeExercises.filter((hinge) => hinge.dayIndex === entry.dayIndex);
      return sameDayHeavyHingeStacking
        ? sameDayHinges.length > 1
        : (entry.dayType === 'fullbodya' || entry.dayType === 'fullbodyb' || entry.dayType === 'upper');
    }) || null;
    const removingOrReplacingWouldBreakLowerDayStructure = !safeReplacementCandidate;
    let hardFailReason = '';
    if (sameDayHeavyHingeStacking) {
      hardFailReason = 'same_day_heavy_hinge_stacking';
    } else if (weeklyHeavyHingeExposureDays >= 3) {
      hardFailReason = 'weekly_heavy_hinge_exposure_days';
    } else if (repeatedHeavyHingeRole && !priorityJustifiedSeparatedHeavyExposure) {
      hardFailReason = 'repeated_same_role_heavy_hinge_without_priority_justification';
    }
    const softenedToWarning = !hardFailReason && weeklyHeavyHingeExposureDays >= 2;
    if (hardFailReason) {
      throwAssertionInvariant(`Too many heavy deadlift patterns in week (${weeklyHeavyHingeExposureDays}).`, {
        validatorSection: 'lower-day hinge validation',
        failedInvariant: 'heavy_deadlift_count',
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays,
        weekExerciseList,
        failedDayExercises: sameDayHeavyHingeStacking
          ? (heavyDeadliftDayRows.find((entry) => Number(entry?.count || 0) > 1)?.exerciseNames || [])
          : (heavyDeadliftDayRows.at(-1)?.exerciseNames || []),
        hingeDeadliftExercisesInWeek: weeklyHingeExercises,
        heavyDeadliftExercisesInWeek: weeklyHeavyDeadliftExercises,
        countedHeavyDeadliftExerciseNames: heavyPatternNames,
        heavyDeadliftByDay: heavyDeadliftDayRows,
        legsSelected,
        glutesSelected,
        sameDayHeavyHingeCount,
        weeklyHeavyHingeExposureDays,
        repeatedHeavyHingeRole,
        sameDayHeavyHingeStacking,
        weeklyHeavyHingeStacking: !sameDayHeavyHingeStacking && weeklyHeavyHingeExposureDays > 1,
        heavyDeadliftFalsePositiveCount: heavyFalsePositiveCount,
        falsePositiveClassification: heavyFalsePositiveCount > 0,
        safeHeavyHingeReplacementExists: Boolean(safeReplacementCandidate),
        safeHeavyHingeReplacementCandidate: safeReplacementCandidate ? {
          replace: safeReplacementCandidate.exerciseName,
          reason: sameDayHeavyHingeStacking ? 'same_day_heavy_hinge_stacking' : 'weekly_heavy_hinge_stacking'
        } : null,
        removingOrReplacingWouldBreakLowerDayStructure,
        heavyDeadliftIssueKind: sameDayHeavyHingeStacking ? 'same_day_heavy_hinge_stacking' : 'weekly_heavy_hinge_stacking',
        hardFailReason,
        softenedToWarning
      });
    }
    if (weeklyLengthenedHingeCount < 1) {
      throwAssertionInvariant('Week must include at least one true lengthened hinge (RDL/stiff-leg/good morning/back extension).', {
        validatorSection: 'lower-day hinge validation',
        failedInvariant: 'missing_lengthened_hinge_weekly',
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
    }
    if (hasLowerDay && weeklyRdlCount < 1) {
      throwAssertionInvariant('Week must include Romanian Deadlift on at least one leg/lower day.', {
        validatorSection: 'lower-day hinge validation',
        failedInvariant: 'missing_rdl_on_lower_day',
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
    }
    const rearDeltCap = routeRearDeltWeeklyDayCap(priorityGroups);
    const rearDeltHardSetCap = routeRearDeltHardSetCap();
    emitAssertionDiagnosticBreadcrumb('rear-delt frequency validation', {
      week: Number(week?.weekIndex || week?.index || 0) || 0,
      failedInvariant: 'rear_delt_weekly_checkpoint',
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      calfDirectSets: totalCalfSets,
      calfExposureDays
    });
    console.warn('rear_delt_validation_result', {
      week: Number(week?.weekIndex || week?.index || 0) || 0,
      rearDeltDays: rearDeltDays.size,
      rearDeltSets: totalRearDeltSets,
      allowedDayCap: rearDeltCap,
      hardSetCap: rearDeltHardSetCap,
      shouldersPriority,
      backPriority,
      valid: rearDeltDays.size <= rearDeltCap && totalRearDeltSets <= rearDeltHardSetCap
    });
    if (rearDeltDays.size > rearDeltCap) {
      throwAssertionInvariant(`Rear-delt isolation appears on too many days (${rearDeltDays.size}).`, {
        validatorSection: 'rear-delt frequency validation',
        failedInvariant: 'rear_delt_day_cap',
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
    }
    if (totalRearDeltSets > rearDeltHardSetCap) {
      throwAssertionInvariant(`Rear-delt isolation has too many direct sets (${totalRearDeltSets}).`, {
        validatorSection: 'rear-delt frequency validation',
        failedInvariant: 'rear_delt_set_cap',
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        calfDirectSets: totalCalfSets,
        calfExposureDays
      });
    }
    if (!emittedAfterFirstWeekProcessed) {
      emittedAfterFirstWeekProcessed = true;
      emitAssertionDiagnosticBreadcrumb('after_first_week_processed', {
        week: Number(week?.weekIndex || week?.index || 0) || 0,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        failedInvariant: 'after_first_week_processed'
      });
    }
  }
  markAssertionSection('plan_shape_validation', 'section_completed', {
    priorityGroups,
    weeklyTargets,
    calfTargetSets
  });
  markAssertionSection('final_assert_success', 'section_started', {
    priorityGroups,
    weeklyTargets,
    calfTargetSets,
    failedInvariant: 'assert_success_started'
  });
  emitAssertionDiagnosticBreadcrumb('final_assert_success', {
    priorityGroups,
    weeklyTargets,
    calfTargetSets,
    failedInvariant: 'assert_success'
  });
  markAssertionSection('final_assert_success', 'section_completed', {
    priorityGroups,
    weeklyTargets,
    calfTargetSets,
    failedInvariant: 'assert_success_completed'
  });
}

function assertBodybuildingPlanByEngine(planObj) {
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.map((value) => String(value || '').toLowerCase()) : [];
  const weeklyTargets = planObj?.meta?.weeklyTargets || undefined;
  const calfTargetSets = Number.isFinite(Number(
    weeklyTargets?.targetWeeklySets?.Calves
    || weeklyTargets?.weeklyTargets?.targetWeeklySets?.Calves
  ))
    ? Number(
      weeklyTargets?.targetWeeklySets?.Calves
      || weeklyTargets?.weeklyTargets?.targetWeeklySets?.Calves
    )
    : undefined;
  const planShapeSummary = summarizeAssertionPlanShape(planObj);
  const runAssert = () => {
    emitAssertionDiagnosticBreadcrumb('before_oblueprint_integrity_branch', {
      ...planShapeSummary,
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'before_oblueprint_integrity_branch'
    });
    if (planShapeSummary.isOblueprintPlanShape) {
      emitAssertionDiagnosticBreadcrumb('entered_oblueprint_integrity_branch', {
        ...planShapeSummary,
        branchEntered: 'oblueprint_integrity',
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        failedInvariant: 'entered_oblueprint_integrity_branch'
      });
      return assertOblueprintBodybuildingIntegrity(planObj);
    }
    emitAssertionDiagnosticBreadcrumb('before_classic_integrity_branch', {
      ...planShapeSummary,
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'before_classic_integrity_branch'
    });
    if (Array.isArray(planObj?.weeks)) {
      emitAssertionDiagnosticBreadcrumb('entered_classic_integrity_branch', {
        ...planShapeSummary,
        branchEntered: 'classic_integrity',
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        failedInvariant: 'entered_classic_integrity_branch'
      });
      return assertBodybuildingPlanIntegrity({
        weeks: planObj?.weeks || [],
        priorityMuscles: planObj?.meta?.priorityMuscles || []
      });
    }
    emitAssertionDiagnosticBreadcrumb('before_fallback_integrity_branch', {
      ...planShapeSummary,
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'before_fallback_integrity_branch'
    });
    emitAssertionDiagnosticBreadcrumb('entered_fallback_integrity_branch', {
      ...planShapeSummary,
      branchEntered: 'fallback_integrity',
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'entered_fallback_integrity_branch'
    });
    return assertBodybuildingPlanIntegrity({
      weeks: planObj?.weeks || [],
      priorityMuscles: planObj?.meta?.priorityMuscles || []
    });
  };
  const runWithDiagnostics = () => {
    emitAssertionDiagnosticBreadcrumb('entered_run_with_diagnostics', {
      ...planShapeSummary,
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'entered_run_with_diagnostics'
    });
    emitAssertionDiagnosticBreadcrumb('validator_entry_started', {
      ...planShapeSummary,
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'validator_entry_started'
    });
    emitAssertionDiagnosticBreadcrumb('assert_entered', {
      ...planShapeSummary,
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'assert_entered'
    });
    try {
      const result = runAssert();
      emitAssertionDiagnosticBreadcrumb('run_with_diagnostics_returned', {
        ...planShapeSummary,
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        failedInvariant: 'run_with_diagnostics_returned',
        assertReturnedSuccessfully: true
      });
      emitAssertionDiagnosticBreadcrumb('final_success', {
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        failedInvariant: 'final_success',
        sectionPhase: 'section_completed',
        assertReturnedSuccessfully: true
      });
      emitAssertionDiagnosticBreadcrumb('assert_returned_successfully', {
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        failedInvariant: 'assert_returned_successfully',
        assertReturnedSuccessfully: true
      });
      return result;
    } finally {
      emitAssertionDiagnosticBreadcrumb('assert_finally_reached', {
        priorityGroups,
        weeklyTargets,
        calfTargetSets,
        failedInvariant: 'assert_finally_reached',
        assertFinallyReached: true
      });
    }
  };
  if (activeAssertionDiagnosticContext) {
    emitAssertionDiagnosticBreadcrumb('before_run_with_diagnostics', {
      ...planShapeSummary,
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'before_run_with_diagnostics'
    });
    return runWithDiagnostics();
  }
  return withAssertionDiagnosticContext({
    priorityGroups,
    weeklyTargets,
    calfTargetSets
  }, () => {
    emitAssertionDiagnosticBreadcrumb('before_run_with_diagnostics', {
      ...planShapeSummary,
      priorityGroups,
      weeklyTargets,
      calfTargetSets,
      failedInvariant: 'before_run_with_diagnostics'
    });
    return runWithDiagnostics();
  });
}

const BODYBUILDING_VALIDATION_CONTRACT = [
  {
    id: 'invalid_exercise_object',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'hard_fail',
    repairBeforeAssert: 'none',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'invalid exercise object validation'
  },
  {
    id: 'plan_shape_or_schema',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'hard_fail',
    repairBeforeAssert: 'none',
    match: ({ validatorSection, failedInvariant }) => {
      const section = String(validatorSection || '').toLowerCase();
      const invariant = String(failedInvariant || '').toLowerCase();
      return section === 'plan_shape_validation' || invariant === 'plan_shape';
    }
  },
  {
    id: 'duplicate_exact_exercise_name',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'hard_fail',
    repairBeforeAssert: 'routeEnforceFinalVisibleDedupeInvariant',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'duplicate exercise name validation'
  },
  {
    id: 'banned_or_novelty_exercise',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'hard_fail',
    repairBeforeAssert: 'routeCanonicalizeExercise',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'banned exercise validation'
  },
  {
    id: 'day_structure_not_ideal',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeFinalizeBodybuildingPlan',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'day structure validation'
  },
  {
    id: 'same_day_redundancy',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeEnforceFinalVisibleDedupeInvariant',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'same_day_redundancy_validation'
  },
  {
    id: 'soft_pull_structure',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeFinalizeBodybuildingPlan',
    match: ({ failedInvariant }) => String(failedInvariant || '').toLowerCase() === 'missing_row_or_vertical_pull'
  },
  {
    id: 'soft_shoulder_press_presence',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeFinalizeBodybuildingPlan',
    match: ({ failedInvariant }) => String(failedInvariant || '').toLowerCase() === 'missing_shoulder_press'
  },
  {
    id: 'soft_core_volume',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeEnforceCoreCap',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'core volume validation'
  },
  {
    id: 'soft_lower_day_ordering',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeFinalizeBodybuildingPlan',
    match: ({ failedInvariant }) => String(failedInvariant || '').toLowerCase() === 'lower_day_first_exercise_quad'
  },
  {
    id: 'soft_missing_weekly_rdl',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'repairOblueprintBodybuildingPlan',
    match: ({ message }) => /romanian deadlift/.test(String(message || '').toLowerCase())
  },
  {
    id: 'soft_missing_hamstring_curl',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeRepairLowerDayHingeInvariant',
    match: ({ failedInvariant, message }) => {
      const invariant = String(failedInvariant || '').toLowerCase();
      const text = String(message || '').toLowerCase();
      return invariant === 'missing_hamstring_curl' || text.includes('hamstring curl');
    }
  },
  {
    id: 'soft_rear_delt_frequency',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeRepairRearDeltFrequencyInvariant',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'rear-delt frequency validation'
  },
  {
    id: 'soft_lateral_raise_cap',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'polishLateralRaiseRedundancy',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'lateral raise cap validation'
  },
  {
    id: 'soft_arm_role',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'routeEnsureDayAccessoryInvariant',
    match: ({ validatorSection }) => String(validatorSection || '').toLowerCase() === 'arm role validation'
  },
  {
    id: 'soft_priority_fulfillment',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'warning',
    repairBeforeAssert: 'repairOblueprintBodybuildingPlan',
    match: ({ validatorSection, failedInvariant }) => {
      const section = String(validatorSection || '').toLowerCase();
      const invariant = String(failedInvariant || '').toLowerCase();
      return section === 'priority fulfillment validation' && invariant !== 'no_valid_priority_expression';
    }
  }
];

function getBodybuildingValidationContractEntry(errorLike = {}) {
  const error = errorLike && typeof errorLike === 'object' ? errorLike : {};
  return BODYBUILDING_VALIDATION_CONTRACT.find((entry) => {
    try {
      return typeof entry?.match === 'function' && entry.match(error);
    } catch {
      return false;
    }
  }) || {
    id: 'default_hard_fail',
    currentBehavior: 'hard_fail',
    shouldBehavior: 'hard_fail',
    repairBeforeAssert: 'none'
  };
}

function buildBodybuildingValidationWarning(errorLike = {}, contractEntry = null) {
  const normalized = errorLike && typeof errorLike === 'object' ? errorLike : {};
  const contract = contractEntry || getBodybuildingValidationContractEntry(normalized);
  return {
    type: 'validation_contract_warning',
    warningType: contract.id,
    severity: 'warning',
    source: 'validation_contract',
    message: String(normalized?.message || 'Soft bodybuilding validation warning'),
    validatorSection: String(normalized?.validatorSection || '').trim() || null,
    failedInvariant: String(normalized?.failedInvariant || '').trim() || null,
    functionName: 'assertBodybuildingPlanByEngine',
    repairBeforeAssert: contract.repairBeforeAssert,
    week: Number.isFinite(Number(normalized?.week)) ? Number(normalized.week) : null,
    day: String(normalized?.day || '').trim() || null,
    dayType: String(normalized?.dayType || '').trim() || null,
    exerciseNames: Array.isArray(normalized?.exerciseNames) ? normalized.exerciseNames.map((value) => String(value || '')) : []
  };
}

function appendPlanValidationWarning(planObj, warning) {
  if (!planObj || typeof planObj !== 'object' || !warning || typeof warning !== 'object') return;
  const meta = planObj.meta && typeof planObj.meta === 'object' ? planObj.meta : {};
  const existing = Array.isArray(meta.validationWarnings) ? meta.validationWarnings.slice() : [];
  const key = [
    String(warning.warningType || ''),
    String(warning.failedInvariant || ''),
    String(warning.dayType || ''),
    String(warning.message || '')
  ].join('|');
  if (!existing.some((entry) => [
    String(entry?.warningType || ''),
    String(entry?.failedInvariant || ''),
    String(entry?.dayType || ''),
    String(entry?.message || '')
  ].join('|') === key)) {
    existing.push(warning);
  }
  planObj.meta = {
    ...meta,
    validationWarnings: existing
  };
}

function validateBodybuildingPlanContract(planObj, context = {}) {
  emitAssertionDiagnosticBreadcrumb('entered_validate_bodybuilding_plan_contract', {
    priorityGroups: Array.isArray(context?.priorityGroups) ? context.priorityGroups : undefined,
    failedInvariant: 'entered_validate_bodybuilding_plan_contract'
  });
  try {
    emitAssertionDiagnosticBreadcrumb('before_assert_bodybuilding_plan_by_engine_call', {
      priorityGroups: Array.isArray(context?.priorityGroups) ? context.priorityGroups : undefined,
      failedInvariant: 'before_assert_bodybuilding_plan_by_engine_call'
    });
    assertBodybuildingPlanByEngine(planObj);
    emitAssertionDiagnosticBreadcrumb('assert_bodybuilding_plan_by_engine_returned', {
      priorityGroups: Array.isArray(context?.priorityGroups) ? context.priorityGroups : undefined,
      failedInvariant: 'assert_bodybuilding_plan_by_engine_returned',
      assertReturnedSuccessfully: true
    });
    emitAssertionDiagnosticBreadcrumb('after_validate_bodybuilding_plan_contract', {
      priorityGroups: Array.isArray(context?.priorityGroups) ? context.priorityGroups : undefined,
      failedInvariant: 'after_validate_bodybuilding_plan_contract',
      assertReturnedSuccessfully: true
    });
    return {
      ok: true,
      warnings: Array.isArray(planObj?.meta?.validationWarnings) ? planObj.meta.validationWarnings.slice() : [],
      error: null
    };
  } catch (err) {
    const normalized = normalizePlanBuildError(err, {
      functionName: 'assertBodybuildingPlanByEngine',
      stage: 'assertBodybuildingPlanByEngine',
      failedStage: 'assertBodybuildingPlanByEngine',
      ...context
    });
    const contract = getBodybuildingValidationContractEntry(normalized);
    if (contract.shouldBehavior === 'warning') {
      const warning = buildBodybuildingValidationWarning(normalized, contract);
      appendPlanValidationWarning(planObj, warning);
      return {
        ok: true,
        warnings: [warning],
        error: null,
        softError: normalized,
        contract
      };
    }
    return {
      ok: false,
      warnings: [],
      error: {
        ...normalized,
        contractId: contract.id,
        contractBehavior: contract.shouldBehavior,
        repairBeforeAssert: contract.repairBeforeAssert
      },
      contract
    };
  }
}

function normalizePlanBuildError(err, context = {}) {
  const src = err && typeof err === 'object' ? err : {};
  const message = String(
    src?.message
    || src?.reason
    || src?.error
    || context?.message
    || 'Failed to build plan'
  );
  const errorCode = String(
    src?.error
    || src?.code
    || context?.error
    || 'PLAN_BUILD_FAILED'
  );
  const stack = String(src?.stack || '').trim();
  const parsedFunctionName = (() => {
    if (src?.functionName || src?.fn || context?.functionName) {
      return String(src?.functionName || src?.fn || context?.functionName || '').trim() || undefined;
    }
    const firstStackLine = stack.split('\n').map((line) => String(line || '').trim()).find((line) => /^at\s+/.test(line));
    const match = firstStackLine && firstStackLine.match(/^at\s+([^\s(]+)/);
    return match?.[1] || undefined;
  })();
  const out = {
    error: errorCode,
    message,
    reason: src?.reason ? String(src.reason) : undefined,
    functionName: parsedFunctionName,
    stage: src?.stage
      ? String(src.stage)
      : (context?.stage ? String(context.stage) : (src?.lastBuilderStage ? String(src.lastBuilderStage) : (context?.lastBuilderStage ? String(context.lastBuilderStage) : undefined))),
    failedStage: src?.failedStage
      ? String(src.failedStage)
      : (context?.failedStage ? String(context.failedStage) : (src?.lastBuilderStage ? String(src.lastBuilderStage) : (context?.lastBuilderStage ? String(context.lastBuilderStage) : undefined))),
    slotId: src?.slotId ? String(src.slotId) : undefined,
    exerciseName: src?.exerciseName ? String(src.exerciseName) : (src?.exercise ? String(src.exercise) : undefined),
    week: Number.isFinite(Number(src?.week)) ? Number(src.week) : (Number.isFinite(Number(context?.week)) ? Number(context.week) : undefined),
    dayIndex: Number.isFinite(Number(src?.dayIndex)) ? Number(src.dayIndex) : (Number.isFinite(Number(context?.dayIndex)) ? Number(context.dayIndex) : undefined),
    day: src?.day ? String(src.day) : (context?.day ? String(context.day) : undefined),
    dayType: src?.dayType ? String(src.dayType) : (context?.dayType ? String(context.dayType) : undefined),
    exerciseIndex: Number.isFinite(Number(src?.exerciseIndex)) ? Number(src.exerciseIndex) : (Number.isFinite(Number(context?.exerciseIndex)) ? Number(context.exerciseIndex) : undefined),
    muscleTarget: src?.muscleTarget ? String(src.muscleTarget) : (context?.muscleTarget ? String(context.muscleTarget) : undefined),
    priorityGroups: Array.isArray(src?.priorityGroups) ? src.priorityGroups.map((value) => String(value || '')) : undefined,
    selectedSplit: Array.isArray(src?.selectedSplit) ? src.selectedSplit : undefined,
    lastAttemptedRepair: src?.lastAttemptedRepair ? String(src.lastAttemptedRepair) : undefined,
    missingRequirement: src?.missingRequirement ? String(src.missingRequirement) : undefined,
    attempt: Number.isFinite(Number(src?.attempt)) ? Number(src.attempt) : undefined,
    maxAttempts: Number.isFinite(Number(src?.maxAttempts)) ? Number(src.maxAttempts) : undefined,
    lastRepairSucceeded: typeof src?.lastRepairSucceeded === 'boolean' ? src.lastRepairSucceeded : undefined,
    currentStructuralResult: src?.currentStructuralResult || undefined,
    guardKey: src?.guardKey ? String(src.guardKey) : undefined,
    firstHeartbeatStage: src?.firstHeartbeatStage ? String(src.firstHeartbeatStage) : (context?.firstHeartbeatStage ? String(context.firstHeartbeatStage) : undefined),
    heartbeatStageHistory: Array.isArray(src?.heartbeatStageHistory) ? src.heartbeatStageHistory : (Array.isArray(context?.heartbeatStageHistory) ? context.heartbeatStageHistory : undefined),
    lastHeartbeatStage: src?.lastHeartbeatStage ? String(src.lastHeartbeatStage) : (context?.lastHeartbeatStage ? String(context.lastHeartbeatStage) : undefined),
    lastBuilderStage: src?.lastBuilderStage ? String(src.lastBuilderStage) : (context?.lastBuilderStage ? String(context.lastBuilderStage) : undefined),
    failedCombo: Array.isArray(src?.failedCombo)
      ? src.failedCombo.map((value) => String(value || ''))
      : (Array.isArray(context?.failedCombo) ? context.failedCombo.map((value) => String(value || '')) : undefined),
    lastRepairOrPolishFunction: src?.lastRepairOrPolishFunction ? String(src.lastRepairOrPolishFunction) : (context?.lastRepairOrPolishFunction ? String(context.lastRepairOrPolishFunction) : undefined),
    planShapeType: src?.planShapeType ? String(src.planShapeType) : (context?.planShapeType ? String(context.planShapeType) : undefined),
    isOblueprintPlanShape: typeof src?.isOblueprintPlanShape === 'boolean' ? src.isOblueprintPlanShape : (typeof context?.isOblueprintPlanShape === 'boolean' ? context.isOblueprintPlanShape : undefined),
    weeksLength: Number.isFinite(Number(src?.weeksLength)) ? Number(src.weeksLength) : (Number.isFinite(Number(context?.weeksLength)) ? Number(context.weeksLength) : undefined),
    firstWeekDayCount: Number.isFinite(Number(src?.firstWeekDayCount)) ? Number(src.firstWeekDayCount) : (Number.isFinite(Number(context?.firstWeekDayCount)) ? Number(context.firstWeekDayCount) : undefined),
    totalDayCount: Number.isFinite(Number(src?.totalDayCount)) ? Number(src.totalDayCount) : (Number.isFinite(Number(context?.totalDayCount)) ? Number(context.totalDayCount) : undefined),
    totalExerciseCount: Number.isFinite(Number(src?.totalExerciseCount)) ? Number(src.totalExerciseCount) : (Number.isFinite(Number(context?.totalExerciseCount)) ? Number(context.totalExerciseCount) : undefined),
    dayTypesPresent: Array.isArray(src?.dayTypesPresent) ? src.dayTypesPresent.map((value) => String(value || '')) : (Array.isArray(context?.dayTypesPresent) ? context.dayTypesPresent.map((value) => String(value || '')) : undefined),
    dayCount: Number.isFinite(Number(src?.dayCount)) ? Number(src.dayCount) : (Number.isFinite(Number(context?.dayCount)) ? Number(context.dayCount) : undefined),
    priorityCount: Number.isFinite(Number(src?.priorityCount)) ? Number(src.priorityCount) : (Number.isFinite(Number(context?.priorityCount)) ? Number(context.priorityCount) : undefined),
    branchEntered: src?.branchEntered ? String(src.branchEntered) : (context?.branchEntered ? String(context.branchEntered) : undefined),
    lastKnownWeek: Number.isFinite(Number(src?.lastKnownWeek)) ? Number(src.lastKnownWeek) : (Number.isFinite(Number(context?.lastKnownWeek)) ? Number(context.lastKnownWeek) : undefined),
    lastKnownDay: src?.lastKnownDay ? String(src.lastKnownDay) : (context?.lastKnownDay ? String(context.lastKnownDay) : undefined),
    lastKnownDayType: src?.lastKnownDayType ? String(src.lastKnownDayType) : (context?.lastKnownDayType ? String(context.lastKnownDayType) : undefined),
    validatorSection: src?.validatorSection ? String(src.validatorSection) : (context?.validatorSection ? String(context.validatorSection) : undefined),
    failedInvariant: src?.failedInvariant ? String(src.failedInvariant) : (context?.failedInvariant ? String(context.failedInvariant) : undefined),
    sectionPhase: src?.sectionPhase ? String(src.sectionPhase) : (context?.sectionPhase ? String(context.sectionPhase) : undefined),
    lastSectionStarted: src?.lastSectionStarted ? String(src.lastSectionStarted) : (context?.lastSectionStarted ? String(context.lastSectionStarted) : undefined),
    lastSectionCompleted: src?.lastSectionCompleted ? String(src.lastSectionCompleted) : (context?.lastSectionCompleted ? String(context.lastSectionCompleted) : undefined),
    currentRunningSection: src?.currentRunningSection ? String(src.currentRunningSection) : (context?.currentRunningSection ? String(context.currentRunningSection) : undefined),
    currentRunningSectionElapsedMs: Number.isFinite(Number(src?.currentRunningSectionElapsedMs)) ? Number(src.currentRunningSectionElapsedMs) : (Number.isFinite(Number(context?.currentRunningSectionElapsedMs)) ? Number(context.currentRunningSectionElapsedMs) : undefined),
    sectionDurationsMs: src?.sectionDurationsMs || context?.sectionDurationsMs || undefined,
    assertFinallyReached: typeof src?.assertFinallyReached === 'boolean' ? src.assertFinallyReached : (typeof context?.assertFinallyReached === 'boolean' ? context.assertFinallyReached : undefined),
    assertReturnedSuccessfully: typeof src?.assertReturnedSuccessfully === 'boolean' ? src.assertReturnedSuccessfully : (typeof context?.assertReturnedSuccessfully === 'boolean' ? context.assertReturnedSuccessfully : undefined),
    assertCallStarted: typeof src?.assertCallStarted === 'boolean' ? src.assertCallStarted : (typeof context?.assertCallStarted === 'boolean' ? context.assertCallStarted : undefined),
    assertCallReturnedSuccess: typeof src?.assertCallReturnedSuccess === 'boolean' ? src.assertCallReturnedSuccess : (typeof context?.assertCallReturnedSuccess === 'boolean' ? context.assertCallReturnedSuccess : undefined),
    assertCallThrew: typeof src?.assertCallThrew === 'boolean' ? src.assertCallThrew : (typeof context?.assertCallThrew === 'boolean' ? context.assertCallThrew : undefined),
    assertCallFinally: typeof src?.assertCallFinally === 'boolean' ? src.assertCallFinally : (typeof context?.assertCallFinally === 'boolean' ? context.assertCallFinally : undefined),
    thrownMessage: src?.thrownMessage ? String(src.thrownMessage) : (context?.thrownMessage ? String(context.thrownMessage) : undefined),
    assertStartedAt: Number.isFinite(Number(src?.assertStartedAt)) ? Number(src.assertStartedAt) : (Number.isFinite(Number(context?.assertStartedAt)) ? Number(context.assertStartedAt) : undefined),
    assertFinishedAt: Number.isFinite(Number(src?.assertFinishedAt)) ? Number(src.assertFinishedAt) : (Number.isFinite(Number(context?.assertFinishedAt)) ? Number(context.assertFinishedAt) : undefined),
    assertElapsedMs: Number.isFinite(Number(src?.assertElapsedMs)) ? Number(src.assertElapsedMs) : (Number.isFinite(Number(context?.assertElapsedMs)) ? Number(context.assertElapsedMs) : undefined),
    exerciseNames: Array.isArray(src?.exerciseNames) ? src.exerciseNames.map((value) => String(value || '')) : (Array.isArray(context?.exerciseNames) ? context.exerciseNames.map((value) => String(value || '')) : undefined),
    exerciseKeys: Array.isArray(src?.exerciseKeys) ? src.exerciseKeys.map((value) => String(value || '')) : (Array.isArray(context?.exerciseKeys) ? context.exerciseKeys.map((value) => String(value || '')) : undefined),
    rawExercisePreview: src?.rawExercisePreview ? String(src.rawExercisePreview) : (context?.rawExercisePreview ? String(context.rawExercisePreview) : undefined),
    rawDayPreview: src?.rawDayPreview ? String(src.rawDayPreview) : (context?.rawDayPreview ? String(context.rawDayPreview) : undefined),
    dayObjectKeys: Array.isArray(src?.dayObjectKeys) ? src.dayObjectKeys.map((value) => String(value || '')) : (Array.isArray(context?.dayObjectKeys) ? context.dayObjectKeys.map((value) => String(value || '')) : undefined),
    dayExercisesIsArray: typeof src?.dayExercisesIsArray === 'boolean' ? src.dayExercisesIsArray : (typeof context?.dayExercisesIsArray === 'boolean' ? context.dayExercisesIsArray : undefined),
    exerciseType: src?.exerciseType ? String(src.exerciseType) : (context?.exerciseType ? String(context.exerciseType) : undefined),
    exerciseIsArray: typeof src?.exerciseIsArray === 'boolean' ? src.exerciseIsArray : (typeof context?.exerciseIsArray === 'boolean' ? context.exerciseIsArray : undefined),
    exerciseId: src?.exerciseId ? String(src.exerciseId) : (context?.exerciseId ? String(context.exerciseId) : undefined),
    exerciseSets: src?.exerciseSets,
    exerciseReps: src?.exerciseReps,
    weeklyTargets: src?.weeklyTargets || context?.weeklyTargets || undefined,
    calfTargetSets: Number.isFinite(Number(src?.calfTargetSets)) ? Number(src.calfTargetSets) : (Number.isFinite(Number(context?.calfTargetSets)) ? Number(context.calfTargetSets) : undefined),
    calfDirectSets: Number.isFinite(Number(src?.calfDirectSets)) ? Number(src.calfDirectSets) : (Number.isFinite(Number(context?.calfDirectSets)) ? Number(context.calfDirectSets) : undefined),
    calfExposureDays: Array.isArray(src?.calfExposureDays) ? src.calfExposureDays : (Array.isArray(context?.calfExposureDays) ? context.calfExposureDays : undefined),
    calfExposureByWeek: Array.isArray(src?.calfExposureByWeek) ? src.calfExposureByWeek : (Array.isArray(context?.calfExposureByWeek) ? context.calfExposureByWeek : undefined),
    weekExerciseList: Array.isArray(src?.weekExerciseList) ? src.weekExerciseList : (Array.isArray(context?.weekExerciseList) ? context.weekExerciseList : undefined),
    failedDayExercises: Array.isArray(src?.failedDayExercises) ? src.failedDayExercises.map((value) => String(value || '')) : (Array.isArray(context?.failedDayExercises) ? context.failedDayExercises.map((value) => String(value || '')) : undefined),
    hingeDeadliftExercisesInWeek: Array.isArray(src?.hingeDeadliftExercisesInWeek) ? src.hingeDeadliftExercisesInWeek : (Array.isArray(context?.hingeDeadliftExercisesInWeek) ? context.hingeDeadliftExercisesInWeek : undefined),
    heavyDeadliftExercisesInWeek: Array.isArray(src?.heavyDeadliftExercisesInWeek) ? src.heavyDeadliftExercisesInWeek : (Array.isArray(context?.heavyDeadliftExercisesInWeek) ? context.heavyDeadliftExercisesInWeek : undefined),
    countedHeavyDeadliftExerciseNames: Array.isArray(src?.countedHeavyDeadliftExerciseNames) ? src.countedHeavyDeadliftExerciseNames.map((value) => String(value || '')) : (Array.isArray(context?.countedHeavyDeadliftExerciseNames) ? context.countedHeavyDeadliftExerciseNames.map((value) => String(value || '')) : undefined),
    heavyDeadliftByDay: Array.isArray(src?.heavyDeadliftByDay) ? src.heavyDeadliftByDay : (Array.isArray(context?.heavyDeadliftByDay) ? context.heavyDeadliftByDay : undefined),
    legsSelected: typeof src?.legsSelected === 'boolean' ? src.legsSelected : (typeof context?.legsSelected === 'boolean' ? context.legsSelected : undefined),
    glutesSelected: typeof src?.glutesSelected === 'boolean' ? src.glutesSelected : (typeof context?.glutesSelected === 'boolean' ? context.glutesSelected : undefined),
    sameDayHeavyHingeCount: Number.isFinite(Number(src?.sameDayHeavyHingeCount)) ? Number(src.sameDayHeavyHingeCount) : (Number.isFinite(Number(context?.sameDayHeavyHingeCount)) ? Number(context.sameDayHeavyHingeCount) : undefined),
    weeklyHeavyHingeExposureDays: Number.isFinite(Number(src?.weeklyHeavyHingeExposureDays)) ? Number(src.weeklyHeavyHingeExposureDays) : (Number.isFinite(Number(context?.weeklyHeavyHingeExposureDays)) ? Number(context.weeklyHeavyHingeExposureDays) : undefined),
    repeatedHeavyHingeRole: src?.repeatedHeavyHingeRole ? String(src.repeatedHeavyHingeRole) : (context?.repeatedHeavyHingeRole ? String(context.repeatedHeavyHingeRole) : undefined),
    sameDayHeavyHingeStacking: typeof src?.sameDayHeavyHingeStacking === 'boolean' ? src.sameDayHeavyHingeStacking : (typeof context?.sameDayHeavyHingeStacking === 'boolean' ? context.sameDayHeavyHingeStacking : undefined),
    weeklyHeavyHingeStacking: typeof src?.weeklyHeavyHingeStacking === 'boolean' ? src.weeklyHeavyHingeStacking : (typeof context?.weeklyHeavyHingeStacking === 'boolean' ? context.weeklyHeavyHingeStacking : undefined),
    heavyDeadliftFalsePositiveCount: Number.isFinite(Number(src?.heavyDeadliftFalsePositiveCount)) ? Number(src.heavyDeadliftFalsePositiveCount) : (Number.isFinite(Number(context?.heavyDeadliftFalsePositiveCount)) ? Number(context.heavyDeadliftFalsePositiveCount) : undefined),
    falsePositiveClassification: typeof src?.falsePositiveClassification === 'boolean' ? src.falsePositiveClassification : (typeof context?.falsePositiveClassification === 'boolean' ? context.falsePositiveClassification : undefined),
    safeHeavyHingeReplacementExists: typeof src?.safeHeavyHingeReplacementExists === 'boolean' ? src.safeHeavyHingeReplacementExists : (typeof context?.safeHeavyHingeReplacementExists === 'boolean' ? context.safeHeavyHingeReplacementExists : undefined),
    safeHeavyHingeReplacementCandidate: src?.safeHeavyHingeReplacementCandidate || context?.safeHeavyHingeReplacementCandidate || undefined,
    removingOrReplacingWouldBreakLowerDayStructure: typeof src?.removingOrReplacingWouldBreakLowerDayStructure === 'boolean' ? src.removingOrReplacingWouldBreakLowerDayStructure : (typeof context?.removingOrReplacingWouldBreakLowerDayStructure === 'boolean' ? context.removingOrReplacingWouldBreakLowerDayStructure : undefined),
    heavyDeadliftIssueKind: src?.heavyDeadliftIssueKind ? String(src.heavyDeadliftIssueKind) : (context?.heavyDeadliftIssueKind ? String(context.heavyDeadliftIssueKind) : undefined),
    hardFailReason: src?.hardFailReason ? String(src.hardFailReason) : (context?.hardFailReason ? String(context.hardFailReason) : undefined),
    softenedToWarning: typeof src?.softenedToWarning === 'boolean' ? src.softenedToWarning : (typeof context?.softenedToWarning === 'boolean' ? context.softenedToWarning : undefined),
    crashKind: src?.crashKind ? String(src.crashKind) : (context?.crashKind ? String(context.crashKind) : undefined),
    uncaughtExceptionMessage: src?.uncaughtExceptionMessage ? String(src.uncaughtExceptionMessage) : (context?.uncaughtExceptionMessage ? String(context.uncaughtExceptionMessage) : undefined),
    uncaughtExceptionStack: src?.uncaughtExceptionStack ? String(src.uncaughtExceptionStack) : (context?.uncaughtExceptionStack ? String(context.uncaughtExceptionStack) : undefined),
    unhandledRejectionMessage: src?.unhandledRejectionMessage ? String(src.unhandledRejectionMessage) : (context?.unhandledRejectionMessage ? String(context.unhandledRejectionMessage) : undefined),
    unhandledRejectionStack: src?.unhandledRejectionStack ? String(src.unhandledRejectionStack) : (context?.unhandledRejectionStack ? String(context.unhandledRejectionStack) : undefined),
    processExitCalled: typeof src?.processExitCalled === 'boolean' ? src.processExitCalled : (typeof context?.processExitCalled === 'boolean' ? context.processExitCalled : undefined),
    processExitCode: Number.isFinite(Number(src?.processExitCode)) ? Number(src.processExitCode) : (Number.isFinite(Number(context?.processExitCode)) ? Number(context.processExitCode) : undefined),
    processExitStack: src?.processExitStack ? String(src.processExitStack) : (context?.processExitStack ? String(context.processExitStack) : undefined),
    workerAfterAssertSuccess: typeof src?.workerAfterAssertSuccess === 'boolean' ? src.workerAfterAssertSuccess : (typeof context?.workerAfterAssertSuccess === 'boolean' ? context.workerAfterAssertSuccess : undefined),
    workerSuccessPayloadBuildStarted: typeof src?.workerSuccessPayloadBuildStarted === 'boolean' ? src.workerSuccessPayloadBuildStarted : (typeof context?.workerSuccessPayloadBuildStarted === 'boolean' ? context.workerSuccessPayloadBuildStarted : undefined),
    workerSuccessPayloadBuildCompleted: typeof src?.workerSuccessPayloadBuildCompleted === 'boolean' ? src.workerSuccessPayloadBuildCompleted : (typeof context?.workerSuccessPayloadBuildCompleted === 'boolean' ? context.workerSuccessPayloadBuildCompleted : undefined),
    workerSuccessPostMessageStarted: typeof src?.workerSuccessPostMessageStarted === 'boolean' ? src.workerSuccessPostMessageStarted : (typeof context?.workerSuccessPostMessageStarted === 'boolean' ? context.workerSuccessPostMessageStarted : undefined),
    workerSuccessPostMessageCompleted: typeof src?.workerSuccessPostMessageCompleted === 'boolean' ? src.workerSuccessPostMessageCompleted : (typeof context?.workerSuccessPostMessageCompleted === 'boolean' ? context.workerSuccessPostMessageCompleted : undefined),
    workerAssertErrorCaught: typeof src?.workerAssertErrorCaught === 'boolean' ? src.workerAssertErrorCaught : (typeof context?.workerAssertErrorCaught === 'boolean' ? context.workerAssertErrorCaught : undefined),
    workerErrorSerializeStarted: typeof src?.workerErrorSerializeStarted === 'boolean' ? src.workerErrorSerializeStarted : (typeof context?.workerErrorSerializeStarted === 'boolean' ? context.workerErrorSerializeStarted : undefined),
    workerErrorSerializeCompleted: typeof src?.workerErrorSerializeCompleted === 'boolean' ? src.workerErrorSerializeCompleted : (typeof context?.workerErrorSerializeCompleted === 'boolean' ? context.workerErrorSerializeCompleted : undefined),
    workerErrorPostMessageStarted: typeof src?.workerErrorPostMessageStarted === 'boolean' ? src.workerErrorPostMessageStarted : (typeof context?.workerErrorPostMessageStarted === 'boolean' ? context.workerErrorPostMessageStarted : undefined),
    workerErrorPostMessageCompleted: typeof src?.workerErrorPostMessageCompleted === 'boolean' ? src.workerErrorPostMessageCompleted : (typeof context?.workerErrorPostMessageCompleted === 'boolean' ? context.workerErrorPostMessageCompleted : undefined),
    workerMessageReceived: typeof src?.workerMessageReceived === 'boolean' ? src.workerMessageReceived : (typeof context?.workerMessageReceived === 'boolean' ? context.workerMessageReceived : undefined),
    workerMessageType: src?.workerMessageType ? String(src.workerMessageType) : (context?.workerMessageType ? String(context.workerMessageType) : undefined),
    workerExitCode: Number.isFinite(Number(src?.workerExitCode)) ? Number(src.workerExitCode) : (Number.isFinite(Number(context?.workerExitCode)) ? Number(context.workerExitCode) : undefined),
    workerExitAfterMessage: typeof src?.workerExitAfterMessage === 'boolean' ? src.workerExitAfterMessage : (typeof context?.workerExitAfterMessage === 'boolean' ? context.workerExitAfterMessage : undefined),
    workerSpawnedAt: Number.isFinite(Number(src?.workerSpawnedAt)) ? Number(src.workerSpawnedAt) : (Number.isFinite(Number(context?.workerSpawnedAt)) ? Number(context.workerSpawnedAt) : undefined),
    timeoutMs: Number.isFinite(Number(src?.timeoutMs)) ? Number(src.timeoutMs) : (Number.isFinite(Number(context?.timeoutMs)) ? Number(context.timeoutMs) : undefined),
    elapsedMs: Number.isFinite(Number(src?.elapsedMs)) ? Number(src.elapsedMs) : (Number.isFinite(Number(context?.elapsedMs)) ? Number(context.elapsedMs) : undefined),
    didTimeoutFire: typeof src?.didTimeoutFire === 'boolean' ? src.didTimeoutFire : (typeof context?.didTimeoutFire === 'boolean' ? context.didTimeoutFire : undefined),
    timeoutTimerScheduled: typeof src?.timeoutTimerScheduled === 'boolean' ? src.timeoutTimerScheduled : (typeof context?.timeoutTimerScheduled === 'boolean' ? context.timeoutTimerScheduled : undefined),
    timeoutTimerCleared: typeof src?.timeoutTimerCleared === 'boolean' ? src.timeoutTimerCleared : (typeof context?.timeoutTimerCleared === 'boolean' ? context.timeoutTimerCleared : undefined),
    terminateCalled: typeof src?.terminateCalled === 'boolean' ? src.terminateCalled : (typeof context?.terminateCalled === 'boolean' ? context.terminateCalled : undefined),
    terminateReason: src?.terminateReason ? String(src.terminateReason) : (context?.terminateReason ? String(context.terminateReason) : undefined),
    terminateStack: src?.terminateStack ? String(src.terminateStack) : (context?.terminateStack ? String(context.terminateStack) : undefined),
    terminateElapsedMs: Number.isFinite(Number(src?.terminateElapsedMs)) ? Number(src.terminateElapsedMs) : (Number.isFinite(Number(context?.terminateElapsedMs)) ? Number(context.terminateElapsedMs) : undefined),
    workerExitedBeforeTimeout: typeof src?.workerExitedBeforeTimeout === 'boolean' ? src.workerExitedBeforeTimeout : (typeof context?.workerExitedBeforeTimeout === 'boolean' ? context.workerExitedBeforeTimeout : undefined),
    workerExitedAfterTimeout: typeof src?.workerExitedAfterTimeout === 'boolean' ? src.workerExitedAfterTimeout : (typeof context?.workerExitedAfterTimeout === 'boolean' ? context.workerExitedAfterTimeout : undefined),
    lastWorkerDiagnosticStage: src?.lastWorkerDiagnosticStage ? String(src.lastWorkerDiagnosticStage) : (context?.lastWorkerDiagnosticStage ? String(context.lastWorkerDiagnosticStage) : undefined)
  };
  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production' && stack) out.stack = stack;
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined && value !== ''));
}

function logPlanBuildFailure(routeName, err, context = {}) {
  const normalized = normalizePlanBuildError(err, context);
  console.error(`[training][${routeName}][plan-build-failed]`, normalized);
  return normalized;
}

function hasStructuredWorkerValidationContext(diagnostics = {}) {
  const src = diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
  return Boolean(
    String(src?.validatorSection || '').trim()
    || String(src?.failedInvariant || '').trim()
    || String(src?.lastKnownDay || '').trim()
    || String(src?.lastKnownDayType || '').trim()
    || Number.isFinite(Number(src?.lastKnownWeek))
    || src?.assertCallThrew
    || src?.workerAssertErrorCaught
    || src?.workerErrorPostMessageStarted
    || src?.workerErrorSerializeStarted
  );
}

function summarizePlanBuildPayload(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  return {
    discipline: String(src?.discipline || src?.trainingFeel || '').trim(),
    daysPerWeek: Number(src?.daysPerWeek || 0) || null,
    sessionLengthMin: String(src?.sessionLengthMin || '').trim() || null,
    priorityGroups: Array.isArray(src?.priorityGroups) ? src.priorityGroups.slice(0, 6) : [],
    location: String(src?.location || '').trim() || null
  };
}

function shouldTrackCalvesComboDiagnostics(payload) {
  const groups = Array.isArray(payload?.priorityGroups) ? payload.priorityGroups : [];
  return groups.some((value) => String(value || '').trim().toLowerCase() === 'calves');
}

function logCalvesComboDiagnostics(event, payload = {}) {
  if (String(process.env.TRAINING_MATRIX_QUIET || '').trim() === '1') return;
  try {
    console.info('[training-debug][calves-combo][route]', {
      event,
      at: new Date().toISOString(),
      ...payload
    });
  } catch {
    // ignore logging failures
  }
}

function matchesAbsGlutesLegsDebugCombo(payload, { rawClassic = false } = {}) {
  return matchesGlutesLegsCoreDebugCombo(payload, { rawClassic });
}

function logDebugComboMatchEval(locationTag, evaluation) {
  if (String(process.env.TRAINING_MATRIX_QUIET || '').trim() === '1') return;
  const evalObj = evaluation && typeof evaluation === 'object' ? evaluation : {};
  try {
    console.info('DEBUG_COMBO_MATCH_EVAL', {
      location: locationTag,
      matched: Boolean(evalObj.matched),
      reasonIfFalse: String(evalObj.reasonIfFalse || ''),
      rawPriorityGroups: Array.isArray(evalObj.rawPriorityGroups) ? evalObj.rawPriorityGroups : [],
      normalizedPriorityGroups: Array.isArray(evalObj.normalizedPriorityGroups) ? evalObj.normalizedPriorityGroups : [],
      discipline: evalObj.discipline || '',
      trainingFeel: evalObj.trainingFeel || '',
      daysPerWeek: Number(evalObj.daysPerWeek || 0) || 0,
      sessionLengthMin: evalObj.sessionLengthMin || '',
      locationValue: evalObj.location || '',
      primaryGoal: evalObj.primaryGoal || '',
      phase: evalObj.phase || '',
      normalizedEquipmentAccess: Array.isArray(evalObj.normalizedEquipmentAccess) ? evalObj.normalizedEquipmentAccess : [],
      painAreas: Array.isArray(evalObj.painAreas) ? evalObj.painAreas : [],
      injuryMap: Array.isArray(evalObj.injuryMapKeys) ? evalObj.injuryMapKeys : [],
      injuryNotes: evalObj.injuryNotes || ''
    });
  } catch {
    // ignore logging failures
  }
}

function logAbsGlutesLegsDebug(scope, event, payload = {}) {
  if (String(process.env.TRAINING_MATRIX_QUIET || '').trim() === '1') return;
  try {
    console.info(`[training-debug][${DEBUG_COMBO_LABEL}][${scope}] ${event}`, {
      at: new Date().toISOString(),
      ...payload
    });
  } catch {
    // ignore logging failures
  }
}

async function runTrainingPlanBuildWithTimeout(payload, opts = {}, context = {}) {
  const timeoutMs = Math.max(5_000, Number(context?.timeoutMs || TRAINING_PLAN_BUILD_TIMEOUT_MS));
  const routeName = String(context?.routeName || 'training-plan-build');
  const requestId = String(context?.requestId || '').trim() || null;
  const endpoint = String(context?.endpoint || '').trim() || null;
  const routeKind = String(context?.routeKind || routeName || '').trim() || null;
  const payloadSummary = summarizePlanBuildPayload(payload);
  const startedAt = Date.now();
  const comboEval = evaluateGlutesLegsCoreDebugCombo(payload);
  logDebugComboMatchEval('route', comboEval);
  const debugCombo = Boolean(comboEval?.matched);
  const calvesCombo = shouldTrackCalvesComboDiagnostics(payloadSummary);
  if (!debugCombo && Array.isArray(payloadSummary.priorityGroups) && payloadSummary.priorityGroups.join('|') === 'Glutes|Legs|Core') {
    try {
      console.info('[training-debug][route][combo-mismatch-proof]', {
        routeName,
        priorityGroups: payloadSummary.priorityGroups,
        reasonIfFalse: String(comboEval?.reasonIfFalse || '')
      });
    } catch {
      // ignore logging failures
    }
  }
  let lastHeartbeatStage = '';
  let firstHeartbeatStage = '';
  let heartbeatStageHistory = [];
  let lastWorkerDiagnostics = {};
  let lastWorkerCrashError = null;
  let workerMessageReceived = false;
  let workerMessageType = '';
  let workerExitCode = null;
  let workerExitAfterMessage = false;
  const workerSpawnedAt = Date.now();
  let timeoutTimerScheduled = false;
  let timeoutTimerCleared = false;
  let didTimeoutFire = false;
  let terminateCalled = false;
  let terminateReason = '';
  let terminateStack = '';
  let terminateElapsedMs = null;
  if (debugCombo) {
    logAbsGlutesLegsDebug('route', 'worker-path-enter', {
      routeName,
      workerBacked: true,
      timeoutMs,
      payloadSummary,
      elapsedMs: 0
    });
  }
  if (calvesCombo) {
    logCalvesComboDiagnostics('worker-path-enter', {
      routeName,
      timeoutMs,
      payloadSummary
    });
  }
  logTrainingRouteLifecycle('training_build_backend_worker_dispatch', {
    requestId,
    endpoint,
    routeKind,
    timeoutMs,
    dayCount: payloadSummary?.daysPerWeek || null,
    priorityGroups: Array.isArray(payloadSummary?.priorityGroups) ? payloadSummary.priorityGroups : [],
    backendElapsedMs: 0
  });
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      timeoutTimerCleared = true;
      resolve(result);
    };
    const worker = new Worker(TRAINING_PLAN_BUILD_WORKER_PATH, {
      workerData: {
        payload,
        opts
      }
    });
    logTrainingRouteLifecycle('training_build_backend_worker_started', {
      requestId,
      endpoint,
      routeKind,
      timeoutMs,
      dayCount: payloadSummary?.daysPerWeek || null,
      priorityGroups: Array.isArray(payloadSummary?.priorityGroups) ? payloadSummary.priorityGroups : [],
      backendElapsedMs: Date.now() - startedAt
    });
    if (debugCombo) {
      logAbsGlutesLegsDebug('route', 'worker-started', {
        routeName,
        timeoutMs,
        payloadSummary,
        elapsedMs: Date.now() - startedAt
      });
    }
    if (calvesCombo) {
      logCalvesComboDiagnostics('worker-started', {
        routeName,
        timeoutMs,
        payloadSummary
      });
    }
    timeoutTimerScheduled = true;
    const timeoutId = setTimeout(async () => {
      didTimeoutFire = true;
      let terminated = false;
      try {
        terminateCalled = true;
        terminateReason = 'timeout';
        terminateStack = String(new Error('worker.terminate timeout').stack || '').trim();
        terminateElapsedMs = Date.now() - startedAt;
        await worker.terminate();
        terminated = true;
      } catch {
        // ignore terminate failure
      }
      const elapsedMs = Date.now() - startedAt;
      const error = normalizePlanBuildError({
        error: 'PLAN_BUILD_TIMEOUT',
        message: 'Training plan generation timed out.',
        reason: 'The builder did not finish before the server safety timeout.',
        stage: 'worker-timeout',
        failedStage: 'worker-timeout',
        lastHeartbeatStage,
        workerSpawnedAt,
        timeoutMs,
        didTimeoutFire,
        timeoutTimerScheduled,
        timeoutTimerCleared,
        terminateCalled,
        terminateReason,
        terminateStack,
        terminateElapsedMs,
        workerExitCode,
        workerExitedBeforeTimeout: Boolean(workerExitCode !== null && !didTimeoutFire),
        workerExitedAfterTimeout: Boolean(workerExitCode !== null && didTimeoutFire),
        lastWorkerDiagnosticStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || undefined,
        workerMessageReceived,
        workerMessageType,
        ...lastWorkerDiagnostics
      }, {
        functionName: 'runTrainingPlanBuildWithTimeout',
        lastHeartbeatStage,
        workerSpawnedAt,
        timeoutMs,
        didTimeoutFire,
        timeoutTimerScheduled,
        timeoutTimerCleared,
        terminateCalled,
        terminateReason,
        terminateStack,
        terminateElapsedMs,
        workerExitCode,
        workerExitedBeforeTimeout: Boolean(workerExitCode !== null && !didTimeoutFire),
        workerExitedAfterTimeout: Boolean(workerExitCode !== null && didTimeoutFire),
        lastWorkerDiagnosticStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || undefined,
        workerMessageReceived,
        workerMessageType,
        ...lastWorkerDiagnostics
      });
      if (debugCombo) {
        logAbsGlutesLegsDebug('route', 'worker-timeout', {
          routeName,
          elapsedMs,
          timeoutMs,
          terminated,
          lastHeartbeatStage: lastHeartbeatStage || null,
          payloadSummary,
          error
        });
      }
      if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
        console.error(`[training][${routeName}][plan-build-timeout]`, {
          elapsedMs,
          timeoutMs,
          payloadSummary,
          error
        });
      }
      finish({ error });
    }, timeoutMs);

    worker.on('message', (message) => {
      if (message?.type === 'heartbeat') {
        if (!firstHeartbeatStage) firstHeartbeatStage = String(message?.stage || '').trim() || firstHeartbeatStage;
        lastHeartbeatStage = String(message?.stage || '').trim() || lastHeartbeatStage;
        if (Array.isArray(message?.heartbeatStageHistory)) {
          heartbeatStageHistory = message.heartbeatStageHistory.slice(-25);
        } else {
          heartbeatStageHistory = [
            ...heartbeatStageHistory,
            {
              stage: String(message?.stage || '').trim() || '',
              elapsedMs: Number.isFinite(Number(message?.elapsedMs)) ? Number(message.elapsedMs) : null,
              builderStage: message?.lastBuilderStage ? String(message.lastBuilderStage || '').trim() : '',
              repairOrPolishFunction: message?.lastRepairOrPolishFunction ? String(message.lastRepairOrPolishFunction || '').trim() : '',
              validatorSection: message?.validatorSection ? String(message.validatorSection || '').trim() : '',
              failedInvariant: message?.failedInvariant ? String(message.failedInvariant || '').trim() : ''
            }
          ].slice(-25);
        }
        lastWorkerDiagnostics = {
          ...lastWorkerDiagnostics,
          ...(firstHeartbeatStage ? { firstHeartbeatStage } : {}),
          ...(heartbeatStageHistory.length ? { heartbeatStageHistory } : {}),
          ...(Array.isArray(message?.failedCombo) ? { failedCombo: message.failedCombo } : {}),
          ...(Array.isArray(message?.priorityGroups) ? { priorityGroups: message.priorityGroups } : {}),
          ...(message?.lastBuilderStage ? { lastBuilderStage: String(message.lastBuilderStage) } : {}),
          ...(message?.lastRepairOrPolishFunction ? { lastRepairOrPolishFunction: String(message.lastRepairOrPolishFunction) } : {}),
          ...(message?.planShapeType ? { planShapeType: String(message.planShapeType) } : {}),
          ...(typeof message?.isOblueprintPlanShape === 'boolean' ? { isOblueprintPlanShape: message.isOblueprintPlanShape } : {}),
          ...(Number.isFinite(Number(message?.weeksLength)) ? { weeksLength: Number(message.weeksLength) } : {}),
          ...(Number.isFinite(Number(message?.firstWeekDayCount)) ? { firstWeekDayCount: Number(message.firstWeekDayCount) } : {}),
          ...(Number.isFinite(Number(message?.totalDayCount)) ? { totalDayCount: Number(message.totalDayCount) } : {}),
          ...(Number.isFinite(Number(message?.totalExerciseCount)) ? { totalExerciseCount: Number(message.totalExerciseCount) } : {}),
          ...(Array.isArray(message?.dayTypesPresent) ? { dayTypesPresent: message.dayTypesPresent.map((value) => String(value || '')) } : {}),
          ...(Number.isFinite(Number(message?.dayCount)) ? { dayCount: Number(message.dayCount) } : {}),
          ...(Number.isFinite(Number(message?.priorityCount)) ? { priorityCount: Number(message.priorityCount) } : {}),
          ...(message?.branchEntered ? { branchEntered: String(message.branchEntered) } : {}),
          ...(Number.isFinite(Number(message?.lastKnownWeek)) ? { lastKnownWeek: Number(message.lastKnownWeek) } : {}),
          ...(message?.lastKnownDay ? { lastKnownDay: String(message.lastKnownDay) } : {}),
          ...(message?.lastKnownDayType ? { lastKnownDayType: String(message.lastKnownDayType) } : {}),
          ...(message?.validatorSection ? { validatorSection: String(message.validatorSection) } : {}),
          ...(message?.failedInvariant ? { failedInvariant: String(message.failedInvariant) } : {}),
          ...(message?.sectionPhase ? { sectionPhase: String(message.sectionPhase) } : {}),
          ...(message?.lastSectionStarted ? { lastSectionStarted: String(message.lastSectionStarted) } : {}),
          ...(message?.lastSectionCompleted ? { lastSectionCompleted: String(message.lastSectionCompleted) } : {}),
          ...(message?.currentRunningSection ? { currentRunningSection: String(message.currentRunningSection) } : {}),
          ...(Number.isFinite(Number(message?.currentRunningSectionElapsedMs)) ? { currentRunningSectionElapsedMs: Number(message.currentRunningSectionElapsedMs) } : {}),
          ...(message?.sectionDurationsMs && typeof message.sectionDurationsMs === 'object' ? { sectionDurationsMs: message.sectionDurationsMs } : {}),
          ...(typeof message?.assertFinallyReached === 'boolean' ? { assertFinallyReached: message.assertFinallyReached } : {}),
          ...(typeof message?.assertReturnedSuccessfully === 'boolean' ? { assertReturnedSuccessfully: message.assertReturnedSuccessfully } : {}),
          ...(typeof message?.assertCallStarted === 'boolean' ? { assertCallStarted: message.assertCallStarted } : {}),
          ...(typeof message?.assertCallReturnedSuccess === 'boolean' ? { assertCallReturnedSuccess: message.assertCallReturnedSuccess } : {}),
          ...(typeof message?.assertCallThrew === 'boolean' ? { assertCallThrew: message.assertCallThrew } : {}),
          ...(typeof message?.assertCallFinally === 'boolean' ? { assertCallFinally: message.assertCallFinally } : {}),
          ...(message?.thrownMessage ? { thrownMessage: String(message.thrownMessage) } : {}),
          ...(Number.isFinite(Number(message?.assertStartedAt)) ? { assertStartedAt: Number(message.assertStartedAt) } : {}),
          ...(Number.isFinite(Number(message?.assertFinishedAt)) ? { assertFinishedAt: Number(message.assertFinishedAt) } : {}),
          ...(Number.isFinite(Number(message?.assertElapsedMs)) ? { assertElapsedMs: Number(message.assertElapsedMs) } : {}),
          ...(Number.isFinite(Number(message?.dayIndex)) ? { dayIndex: Number(message.dayIndex) } : {}),
          ...(Number.isFinite(Number(message?.exerciseIndex)) ? { exerciseIndex: Number(message.exerciseIndex) } : {}),
          ...(message?.exerciseName ? { exerciseName: String(message.exerciseName) } : {}),
          ...(Array.isArray(message?.exerciseNames) ? { exerciseNames: message.exerciseNames.map((value) => String(value || '')) } : {}),
          ...(Array.isArray(message?.exerciseKeys) ? { exerciseKeys: message.exerciseKeys.map((value) => String(value || '')) } : {}),
          ...(message?.rawExercisePreview ? { rawExercisePreview: String(message.rawExercisePreview) } : {}),
          ...(message?.rawDayPreview ? { rawDayPreview: String(message.rawDayPreview) } : {}),
          ...(Array.isArray(message?.selectedSplit) ? { selectedSplit: message.selectedSplit } : {}),
          ...(message?.weeklyTargets && typeof message.weeklyTargets === 'object' ? { weeklyTargets: message.weeklyTargets } : {}),
          ...(Number.isFinite(Number(message?.calfTargetSets)) ? { calfTargetSets: Number(message.calfTargetSets) } : {}),
          ...(Number.isFinite(Number(message?.calfDirectSets)) ? { calfDirectSets: Number(message.calfDirectSets) } : {}),
          ...(Array.isArray(message?.calfExposureDays) ? { calfExposureDays: message.calfExposureDays } : {}),
          ...(typeof message?.processExitCalled === 'boolean' ? { processExitCalled: message.processExitCalled } : {}),
          ...(Number.isFinite(Number(message?.processExitCode)) ? { processExitCode: Number(message.processExitCode) } : {}),
          ...(message?.processExitStack ? { processExitStack: String(message.processExitStack) } : {}),
          ...(typeof message?.workerAfterAssertSuccess === 'boolean' ? { workerAfterAssertSuccess: message.workerAfterAssertSuccess } : {}),
          ...(typeof message?.workerSuccessPayloadBuildStarted === 'boolean' ? { workerSuccessPayloadBuildStarted: message.workerSuccessPayloadBuildStarted } : {}),
          ...(typeof message?.workerSuccessPayloadBuildCompleted === 'boolean' ? { workerSuccessPayloadBuildCompleted: message.workerSuccessPayloadBuildCompleted } : {}),
          ...(typeof message?.workerSuccessPostMessageStarted === 'boolean' ? { workerSuccessPostMessageStarted: message.workerSuccessPostMessageStarted } : {}),
          ...(typeof message?.workerSuccessPostMessageCompleted === 'boolean' ? { workerSuccessPostMessageCompleted: message.workerSuccessPostMessageCompleted } : {}),
          ...(typeof message?.workerAssertErrorCaught === 'boolean' ? { workerAssertErrorCaught: message.workerAssertErrorCaught } : {}),
          ...(typeof message?.workerErrorSerializeStarted === 'boolean' ? { workerErrorSerializeStarted: message.workerErrorSerializeStarted } : {}),
          ...(typeof message?.workerErrorSerializeCompleted === 'boolean' ? { workerErrorSerializeCompleted: message.workerErrorSerializeCompleted } : {}),
          ...(typeof message?.workerErrorPostMessageStarted === 'boolean' ? { workerErrorPostMessageStarted: message.workerErrorPostMessageStarted } : {}),
          ...(typeof message?.workerErrorPostMessageCompleted === 'boolean' ? { workerErrorPostMessageCompleted: message.workerErrorPostMessageCompleted } : {}),
          ...(typeof message?.workerBeforeAssertCall === 'boolean' ? { workerBeforeAssertCall: message.workerBeforeAssertCall } : {}),
          ...(typeof message?.workerAfterAssertFinally === 'boolean' ? { workerAfterAssertFinally: message.workerAfterAssertFinally } : {}),
          ...(typeof message?.workerBeforeFinalResultBuild === 'boolean' ? { workerBeforeFinalResultBuild: message.workerBeforeFinalResultBuild } : {}),
          ...(typeof message?.workerAfterFinalResultBuild === 'boolean' ? { workerAfterFinalResultBuild: message.workerAfterFinalResultBuild } : {}),
          ...(typeof message?.workerBeforeFinalPostMessage === 'boolean' ? { workerBeforeFinalPostMessage: message.workerBeforeFinalPostMessage } : {}),
          ...(typeof message?.workerAfterFinalPostMessage === 'boolean' ? { workerAfterFinalPostMessage: message.workerAfterFinalPostMessage } : {}),
          ...(typeof message?.workerBeforeProcessNaturalExit === 'boolean' ? { workerBeforeProcessNaturalExit: message.workerBeforeProcessNaturalExit } : {}),
          ...(Array.isArray(message?.calfExposureByWeek) ? { calfExposureByWeek: message.calfExposureByWeek } : {})
        };
        if (debugCombo) {
          logAbsGlutesLegsDebug('route', 'worker-heartbeat', {
            routeName,
            stage: lastHeartbeatStage || null,
            elapsedMs: Number(message?.elapsedMs || 0) || (Date.now() - startedAt)
          });
        }
        if (calvesCombo) {
          logCalvesComboDiagnostics('worker-heartbeat', {
            routeName,
            stage: lastHeartbeatStage || null,
            diagnostics: lastWorkerDiagnostics
          });
        }
        return;
      }
      workerMessageReceived = true;
      if (message?.type === 'worker-crash') {
        workerMessageType = 'worker-crash';
        lastWorkerCrashError = normalizePlanBuildError(message?.error || { message: 'Worker crash reported' }, {
          functionName: 'buildOblueprintPlanWithFallback',
          lastHeartbeatStage,
          workerSpawnedAt,
          timeoutMs,
          didTimeoutFire,
          timeoutTimerScheduled,
          timeoutTimerCleared,
          terminateCalled,
          terminateReason,
          terminateStack,
          terminateElapsedMs,
          workerMessageReceived,
          workerMessageType,
          workerExitCode,
          workerExitAfterMessage,
          lastWorkerDiagnosticStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || undefined,
          ...lastWorkerDiagnostics
        });
        if (calvesCombo) {
          logCalvesComboDiagnostics('worker-crash-message', {
            routeName,
            error: lastWorkerCrashError
          });
        }
        return;
      }
      if (message?.type === 'worker-process-exit') {
        workerMessageType = 'worker-process-exit';
        lastWorkerCrashError = normalizePlanBuildError(message?.error || { message: 'Worker process exit reported' }, {
          functionName: 'buildOblueprintPlanWithFallback',
          lastHeartbeatStage,
          workerSpawnedAt,
          timeoutMs,
          didTimeoutFire,
          timeoutTimerScheduled,
          timeoutTimerCleared,
          terminateCalled,
          terminateReason,
          terminateStack,
          terminateElapsedMs,
          workerMessageReceived,
          workerMessageType,
          workerExitCode,
          workerExitAfterMessage,
          lastWorkerDiagnosticStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || undefined,
          ...lastWorkerDiagnostics
        });
        return;
      }
      if (message?.type === 'error') {
        workerMessageType = 'error';
        const error = normalizePlanBuildError(message?.error || { message: 'Worker validation failed' }, {
          functionName: 'assertBodybuildingPlanByEngine',
          lastHeartbeatStage,
          workerSpawnedAt,
          timeoutMs,
          didTimeoutFire,
          timeoutTimerScheduled,
          timeoutTimerCleared,
          terminateCalled,
          terminateReason,
          terminateStack,
          terminateElapsedMs,
          workerMessageReceived,
          workerMessageType,
          workerExitCode,
          workerExitAfterMessage,
          ...(message?.diagnostics && typeof message.diagnostics === 'object' ? message.diagnostics : {}),
          ...lastWorkerDiagnostics
        });
        finish({ error });
        return;
      }
      workerMessageType = message?.ok ? 'success' : 'error';
      const elapsedMs = Date.now() - startedAt;
      if (message?.ok) {
        const slowestBuilderStage = getSlowestBuilderStage(
          lastWorkerDiagnostics?.sectionDurationsMs || {},
          lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || ''
        );
        logTrainingRouteLifecycle('training_build_backend_worker_finished', {
          requestId,
          endpoint,
          routeKind,
          timeoutMs,
          dayCount: payloadSummary?.daysPerWeek || null,
          priorityGroups: Array.isArray(payloadSummary?.priorityGroups) ? payloadSummary.priorityGroups : [],
          backendElapsedMs: elapsedMs,
          workerElapsedMs: elapsedMs,
          slowestBuilderStage: slowestBuilderStage.stage,
          slowestBuilderStageElapsedMs: slowestBuilderStage.elapsedMs,
          lastBuilderStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || null
        });
        if (debugCombo) {
          logAbsGlutesLegsDebug('route', 'worker-finished', {
            routeName,
            elapsedMs,
            timeoutMs,
            payloadSummary
          });
        }
        if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
          console.info(`[training][${routeName}][plan-build-finished]`, {
            elapsedMs,
            timeoutMs,
            payloadSummary
          });
        }
        finish(message?.built
          ? {
            ...message.built,
            diagnostics: {
              ...(message?.built?.diagnostics && typeof message.built.diagnostics === 'object' ? message.built.diagnostics : {}),
              requestId,
              endpoint,
              routeKind,
              backendElapsedMs: elapsedMs,
              workerElapsedMs: elapsedMs,
              slowestBuilderStage: slowestBuilderStage.stage,
              slowestBuilderStageElapsedMs: slowestBuilderStage.elapsedMs,
              sectionDurationsMs: lastWorkerDiagnostics?.sectionDurationsMs || undefined,
              lastBuilderStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || undefined
            }
          }
          : { error: normalizePlanBuildError({ message: 'Empty worker result' }) });
        return;
      }
      const error = normalizePlanBuildError(message?.error || { message: 'Worker build failed' }, {
        functionName: 'buildOblueprintPlanWithFallback',
        lastHeartbeatStage,
        workerSpawnedAt,
        timeoutMs,
        didTimeoutFire,
        timeoutTimerScheduled,
        timeoutTimerCleared,
        terminateCalled,
        terminateReason,
        terminateStack,
        terminateElapsedMs,
        workerMessageReceived,
        workerMessageType,
        workerExitCode,
        workerExitAfterMessage,
        lastWorkerDiagnosticStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || undefined,
        ...lastWorkerDiagnostics
      });
      if (debugCombo) {
        logAbsGlutesLegsDebug('route', 'worker-error', {
          routeName,
          elapsedMs,
          timeoutMs,
          lastHeartbeatStage: lastHeartbeatStage || null,
          payloadSummary,
          error
        });
      }
      if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
        console.error(`[training][${routeName}][plan-build-worker-error]`, {
          elapsedMs,
          timeoutMs,
          payloadSummary,
          error
        });
      }
      if (calvesCombo) {
        logCalvesComboDiagnostics('worker-error', {
          routeName,
          error
        });
      }
      finish({ error });
    });

    worker.once('error', (err) => {
      const elapsedMs = Date.now() - startedAt;
      const error = normalizePlanBuildError(err, {
        functionName: 'buildOblueprintPlanWithFallback',
        lastHeartbeatStage,
        workerSpawnedAt,
        timeoutMs,
        didTimeoutFire,
        timeoutTimerScheduled,
        timeoutTimerCleared,
        terminateCalled,
        terminateReason,
        terminateStack,
        terminateElapsedMs,
        workerMessageReceived,
        workerMessageType,
        workerExitCode,
        workerExitAfterMessage,
        lastWorkerDiagnosticStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || undefined,
        ...lastWorkerDiagnostics
      });
      if (debugCombo) {
        logAbsGlutesLegsDebug('route', 'worker-crash', {
          routeName,
          elapsedMs,
          timeoutMs,
          lastHeartbeatStage: lastHeartbeatStage || null,
          payloadSummary,
          error
        });
      }
      if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
        console.error(`[training][${routeName}][plan-build-worker-crash]`, {
          elapsedMs,
          timeoutMs,
          payloadSummary,
          error
        });
      }
      if (calvesCombo) {
        logCalvesComboDiagnostics('worker-error-event', {
          routeName,
          error
        });
      }
      finish({ error });
    });

    worker.once('exit', (code) => {
      if (settled || code === 0) return;
      workerExitCode = code;
      workerExitAfterMessage = workerMessageReceived;
      const elapsedMs = Date.now() - startedAt;
      const sharedContext = {
        functionName: 'buildOblueprintPlanWithFallback',
        lastHeartbeatStage,
        workerSpawnedAt,
        timeoutMs,
        elapsedMs,
        didTimeoutFire,
        timeoutTimerScheduled,
        timeoutTimerCleared,
        terminateCalled,
        terminateReason,
        terminateStack,
        terminateElapsedMs,
        workerMessageReceived,
        workerMessageType,
        workerExitCode,
        workerExitAfterMessage,
        workerExitedBeforeTimeout: Boolean(!didTimeoutFire),
        workerExitedAfterTimeout: Boolean(didTimeoutFire),
        lastWorkerDiagnosticStage: String(lastWorkerDiagnostics?.lastBuilderStage || lastHeartbeatStage || '').trim() || undefined,
        ...lastWorkerDiagnostics
      };
      let error = lastWorkerCrashError;
      if (!error) {
        if (didTimeoutFire && terminateReason === 'timeout') {
          error = normalizePlanBuildError({
            error: 'PLAN_BUILD_TIMEOUT',
            message: 'Training plan generation timed out.',
            reason: 'The builder did not finish before the server safety timeout.',
            stage: 'worker-timeout',
            failedStage: 'worker-timeout',
            ...sharedContext
          }, sharedContext);
        } else if (hasStructuredWorkerValidationContext(lastWorkerDiagnostics)) {
          error = normalizePlanBuildError({
            error: 'FINAL_ROUTE_VALIDATION_FAILED',
            code: 'FINAL_ROUTE_VALIDATION_FAILED',
            message: 'Worker exited before delivering a structured validation error.',
            functionName: 'assertBodybuildingPlanByEngine',
            stage: String(lastWorkerDiagnostics?.validatorSection || 'assertBodybuildingPlanByEngine'),
            failedStage: String(lastWorkerDiagnostics?.validatorSection || 'assertBodybuildingPlanByEngine'),
            validatorSection: String(lastWorkerDiagnostics?.validatorSection || ''),
            failedInvariant: String(lastWorkerDiagnostics?.failedInvariant || ''),
            ...sharedContext
          }, sharedContext);
        } else {
          error = normalizePlanBuildError({
            error: 'PLAN_BUILD_WORKER_EXIT',
            message: `Training build worker exited unexpectedly with code ${code}.`,
            ...sharedContext
          }, sharedContext);
        }
      }
      if (debugCombo) {
        logAbsGlutesLegsDebug('route', 'worker-exit', {
          routeName,
          elapsedMs,
          timeoutMs,
          lastHeartbeatStage: lastHeartbeatStage || null,
          payloadSummary,
          code,
          error
        });
      }
      if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
        console.error(`[training][${routeName}][plan-build-worker-exit]`, {
          elapsedMs,
          timeoutMs,
          payloadSummary,
          error
        });
      }
      if (calvesCombo) {
        logCalvesComboDiagnostics('worker-exit', {
          routeName,
          code,
          error
        });
      }
      finish({ error });
    });
  });
}

function normalizeEquipmentAccess(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const keys = ['bodyweight', 'dumbbell', 'barbell', 'cable', 'machine'];
  const out = {};
  keys.forEach((k) => { out[k] = Boolean(src[k]); });
  // Keep a sane default so we never end up with "no equipment" profiles.
  if (!Object.values(out).some(Boolean)) out.bodyweight = true;
  return out;
}

function buildResolverProfile({ discipline, strength, equipmentAccess }) {
  const goalModeRaw = String(strength?.goalMode || '').trim().toLowerCase();
  const goals = Array.isArray(strength?.goals) ? strength.goals : [];
  const goalMode = goalModeRaw
    || (goals.includes('strength') ? 'strength' : goals.includes('muscle') ? 'muscle' : '');
  return {
    discipline,
    goalMode,
    equipmentAccess: normalizeEquipmentAccess(equipmentAccess || {})
  };
}

function planNeedsResolution(plan) {
  try {
    for (const week of plan?.weeks || []) {
      for (const day of week?.days || []) {
        for (const ex of day?.exercises || []) {
          if (!ex?.movementName || !ex?.displayName || !Object.prototype.hasOwnProperty.call(ex, 'mediaPath')) {
            return true;
          }
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function normalizeWeekdayIndexList(input) {
  const raw = Array.isArray(input) ? input : [];
  const out = [];
  const codeToIndex = {
    su: 0, sun: 0, sunday: 0,
    m: 1, mo: 1, mon: 1, monday: 1,
    t: 2, tu: 2, tue: 2, tues: 2, tuesday: 2,
    w: 3, we: 3, wed: 3, wednesday: 3,
    th: 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
    f: 5, fr: 5, fri: 5, friday: 5,
    s: 6, sa: 6, sat: 6, saturday: 6
  };
  for (const x of raw) {
    const key = String(x || '').trim().toLowerCase();
    if (key && Object.prototype.hasOwnProperty.call(codeToIndex, key)) {
      const idx = codeToIndex[key];
      if (!out.includes(idx)) out.push(idx);
      continue;
    }
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    const i = Math.max(0, Math.min(6, Math.floor(n)));
    if (!out.includes(i)) out.push(i);
  }
  return out;
}

function normalizeDataUrlImage(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!s.startsWith('data:image/')) return null;
  if (s.length > 1_000_000) return null;
  return s;
}

function isDateIso(raw) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '').trim());
}

function normalizeProgressPose(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'front') return 'front';
  if (v === 'side') return 'side';
  if (v === 'back') return 'back';
  return null;
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (!db.isConfigured()) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;

  const safeQuery = async (sql) => {
    try {
      await db.query(sql);
    } catch (err) {
      const code = String(err?.code || '');
      if (code === '23505' || code === '42P07') return;
      if (isTransientPgError(err)) {
        throw new DbUnavailableError('Database unavailable during training schema query', err);
      }
      throw err;
    }
  };

  schemaEnsurePromise = (async () => {
    for (let attempt = 0; attempt <= SCHEMA_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await safeQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        username text UNIQUE,
        email text UNIQUE,
        phone text,
        display_name text NOT NULL,
        password_hash text,
        auth_provider text NOT NULL DEFAULT 'local',
        last_seen timestamptz,
        last_login timestamptz,
        admin_notes text NOT NULL DEFAULT ''
      );
    `);
    await safeQuery('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text;');
    await safeQuery('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_seen timestamptz;');
    await safeQuery('ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login timestamptz;');
    await safeQuery("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';");
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_key ON app_users(phone) WHERE phone IS NOT NULL;');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_token_hash text UNIQUE NOT NULL,
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_user_profiles (
        user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        profile jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_profiles (
        user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        onboarding_complete boolean NOT NULL DEFAULT false,
        discipline text,
        experience text,
        days_per_week int,
        strength jsonb NOT NULL DEFAULT '{}'::jsonb,
        first_name text,
        age int,
        location_city text,
        location_state text,
        goals text,
        profile_image text
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_profiles_updated_at ON app_training_profiles(updated_at);');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS calorie_offset int NOT NULL DEFAULT 0;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS no_progress_iterations int NOT NULL DEFAULT 0;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS eval_weight_lb numeric;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS eval_weight_at date;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS last_weighin_lb numeric;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS last_weighin_at date;');
    await safeQuery("ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS equipment_access jsonb NOT NULL DEFAULT '{}'::jsonb;");
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS bio text;');
    await safeQuery('ALTER TABLE app_training_profiles ADD COLUMN IF NOT EXISTS injuries text;');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        active boolean NOT NULL DEFAULT true,
        version int NOT NULL DEFAULT 1,
        discipline text NOT NULL,
        days_per_week int NOT NULL,
        plan jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_plans_user_id ON app_training_plans(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_plans_active ON app_training_plans(user_id, active);');
    await safeQuery(`
      WITH ranked AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY user_id
                 ORDER BY updated_at DESC, created_at DESC, id DESC
               ) AS rn
        FROM app_training_plans
        WHERE active = true
      )
      UPDATE app_training_plans AS p
      SET active = false,
          updated_at = now()
      FROM ranked
      WHERE p.id = ranked.id
        AND ranked.rn > 1;
    `);
    await safeQuery("CREATE UNIQUE INDEX IF NOT EXISTS uq_app_training_plans_one_active_per_user ON app_training_plans(user_id) WHERE active = true;");

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_share_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        from_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        to_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        plan_id uuid REFERENCES app_training_plans(id) ON DELETE SET NULL,
        plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'pending',
        responded_at timestamptz
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_training_share_invites_to_status ON app_training_share_invites(to_user_id, status, created_at);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_training_share_invites_from_status ON app_training_share_invites(from_user_id, status, created_at);');
    await safeQuery("CREATE UNIQUE INDEX IF NOT EXISTS uq_training_share_invites_pending ON app_training_share_invites(from_user_id, to_user_id) WHERE status = 'pending';");
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_share_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
        counterparty_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
        invite_id uuid REFERENCES app_training_share_invites(id) ON DELETE SET NULL,
        event_type text NOT NULL,
        meta jsonb NOT NULL DEFAULT '{}'::jsonb,
        read_at timestamptz
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_training_share_events_user_read_created ON app_training_share_events(user_id, read_at, created_at DESC);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_workouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        plan_id uuid NOT NULL REFERENCES app_training_plans(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        performed_at date,
        week_index int NOT NULL,
        day_index int NOT NULL,
        readiness int,
        duration_ms bigint,
        timer_started_at timestamptz,
        timer_ended_at timestamptz,
        entries jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes text NOT NULL DEFAULT ''
      );
    `);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_training_workouts_plan_week_day ON app_training_workouts(plan_id, week_index, day_index);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_workouts_user_id ON app_training_workouts(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_workouts_plan_id ON app_training_workouts(plan_id);');
    await safeQuery('ALTER TABLE app_training_workouts ADD COLUMN IF NOT EXISTS readiness int;');
    await safeQuery('ALTER TABLE app_training_workouts ADD COLUMN IF NOT EXISTS duration_ms bigint;');
    await safeQuery('ALTER TABLE app_training_workouts ADD COLUMN IF NOT EXISTS timer_started_at timestamptz;');
    await safeQuery('ALTER TABLE app_training_workouts ADD COLUMN IF NOT EXISTS timer_ended_at timestamptz;');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_lift_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        exercise_key text NOT NULL,
        exercise_id text,
        base_id text,
        exercise_name text NOT NULL DEFAULT '',
        last_weight_lb numeric,
        last_reps int,
        last_estimated_1rm_lb numeric,
        last_performed_at date,
        best_weight_lb numeric,
        best_reps int,
        best_estimated_1rm_lb numeric,
        best_performed_at date,
        last_source text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_training_lift_history_user_key ON app_training_lift_history(user_id, exercise_key);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_lift_history_user_updated ON app_training_lift_history(user_id, updated_at DESC);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        event_type text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_events_user_id ON app_training_events(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_events_type ON app_training_events(event_type);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_training_user_workouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        exercise_id text NOT NULL,
        name text NOT NULL,
        category text NOT NULL DEFAULT 'strength',
        equipment text NOT NULL DEFAULT '',
        level text NOT NULL DEFAULT 'beginner',
        primary_muscles jsonb NOT NULL DEFAULT '[]'::jsonb,
        secondary_muscles jsonb NOT NULL DEFAULT '[]'::jsonb,
        instructions jsonb NOT NULL DEFAULT '[]'::jsonb,
        image_url text NOT NULL DEFAULT ''
      );
    `);
    await safeQuery(`ALTER TABLE app_training_user_workouts ADD COLUMN IF NOT EXISTS before_image_url text NOT NULL DEFAULT '';`);
    await safeQuery(`ALTER TABLE app_training_user_workouts ADD COLUMN IF NOT EXISTS after_image_url text NOT NULL DEFAULT '';`);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_training_user_workouts_user_exercise_id ON app_training_user_workouts(user_id, exercise_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_user_workouts_user_created ON app_training_user_workouts(user_id, created_at DESC);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_daily_checkins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        day date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        data jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_daily_checkins_user_day ON app_daily_checkins(user_id, day);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_daily_checkins_user_id ON app_daily_checkins(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_daily_checkins_updated_at ON app_daily_checkins(updated_at);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_progress_photos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        day date NOT NULL,
        pose text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        image_data_url text NOT NULL DEFAULT ''
      );
    `);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_progress_photos_user_day_pose ON app_progress_photos(user_id, day, pose);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_progress_photos_user_id ON app_progress_photos(user_id);');

        schemaEnsured = true;
        return;
      } catch (err) {
        const transient = err instanceof DbUnavailableError || isTransientPgError(err) || isTransientPgError(err?.cause);
        if (!transient) throw err;
        logTransientTrainingError(err?.cause || err, `ensureSchema:attempt_${attempt + 1}`);
        if (attempt >= SCHEMA_RETRY_DELAYS_MS.length) {
          throw (err instanceof DbUnavailableError ? err : new DbUnavailableError('Database unavailable while ensuring training schema', err));
        }
        await sleep(SCHEMA_RETRY_DELAYS_MS[attempt]);
      }
    }
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

async function resolveUserFromSession(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const result = await db.query(
    `
      SELECT u.id, u.display_name, u.username, u.email, COALESCE(u.admin_notes, '') AS admin_notes
      FROM app_sessions s
      JOIN app_users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
        AND s.expires_at > now()
      LIMIT 1;
    `,
    [tokenHash]
  );
  const row = result.rows?.[0];
  if (!row) return null;
  await touchUserLastSeen(row.id);
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username || null,
    email: row.email || null,
    isOwner: isOwnerUser(row)
  };
}

async function safeResolveUserFromSession(req, { routeName = 'trainingRoutes', fallback = 'service_unavailable' } = {}) {
  try {
    const user = await resolveUserFromSession(req);
    return {
      user,
      sessionUnavailable: false,
      error: null,
      fallback: user ? null : 'unauthorized'
    };
  } catch (err) {
    console.warn('auth.session_resolution_failed', {
      routeName,
      error: String(err?.message || 'Session resolution failed'),
      code: String(err?.code || '').trim() || null,
      fallback
    });
    return {
      user: null,
      sessionUnavailable: true,
      error: err,
      fallback
    };
  }
}

async function getActivePlan(userId) {
  await db.query(
    `
      WITH ranked AS (
        SELECT id,
               row_number() OVER (
                 ORDER BY updated_at DESC, created_at DESC, id DESC
               ) AS rn
        FROM app_training_plans
        WHERE user_id = $1
          AND active = true
      )
      UPDATE app_training_plans AS p
      SET active = false,
          updated_at = now()
      FROM ranked
      WHERE p.id = ranked.id
        AND ranked.rn > 1;
    `,
    [userId]
  );
  const result = await db.query(
    `
      SELECT id, version, discipline, days_per_week, plan, created_at, updated_at
      FROM app_training_plans
      WHERE user_id = $1 AND active = true
      ORDER BY updated_at DESC, created_at DESC, id DESC
      LIMIT 1;
    `,
    [userId]
  );
  return result.rows?.[0] || null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, patch) {
  const base = isPlainObject(target) ? { ...target } : {};
  Object.entries(isPlainObject(patch) ? patch : {}).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      base[key] = deepMerge(base[key], value);
    } else {
      base[key] = value;
    }
  });
  return base;
}

function normalizeIntakeDayCodes(raw) {
  const out = [];
  const push = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || out.includes(normalized)) return;
    out.push(normalized);
  };
  (Array.isArray(raw) ? raw : []).forEach((entry) => {
    if (Number.isFinite(Number(entry))) {
      const dayIndex = Math.max(0, Math.min(6, Math.round(Number(entry))));
      const mapped = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dayIndex];
      if (mapped) push(mapped);
      return;
    }
    const text = String(entry || '').trim().toLowerCase();
    if (!text) return;
    if (text.startsWith('su')) push('Su');
    else if (text.startsWith('mo') || text === 'm') push('Mo');
    else if (text.startsWith('tu') || text === 't') push('Tu');
    else if (text.startsWith('we') || text === 'w') push('We');
    else if (text.startsWith('th')) push('Th');
    else if (text.startsWith('fr') || text === 'f') push('Fr');
    else if (text.startsWith('sa') || text === 's') push('Sa');
  });
  return out;
}

function normalizeTextList(raw, maxItems = 16, maxLen = 120) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    const text = safeText(entry, maxLen);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeStoredGoal(primaryGoalRaw, phaseRaw, fallbackRaw) {
  const primaryGoal = String(primaryGoalRaw || '').trim().toLowerCase();
  if (primaryGoal === 'cut fat') return 'cut fat';
  if (primaryGoal === 'recomp') return 'recomp';
  if (primaryGoal === 'build size') return 'build size';
  const phase = String(phaseRaw || '').trim().toLowerCase();
  if (phase === 'cut') return 'cut fat';
  if (phase === 'maintain') return 'recomp';
  if (phase === 'bulk') return 'build size';
  const fallback = String(fallbackRaw || '').trim().toLowerCase();
  if (fallback === 'muscle_gain') return 'build size';
  if (fallback === 'fat_loss') return 'cut fat';
  return fallback || 'build size';
}

function normalizeStoredPriority(focusRaw, fallbackRaw) {
  const focus = String(focusRaw || '').trim().toLowerCase();
  if (focus === 'strength') return 'strength';
  if (focus === 'size') return 'size';
  if (focus === 'aesthetic') return 'aesthetic';
  const fallback = String(fallbackRaw || '').trim().toLowerCase();
  if (fallback === 'strength' || fallback === 'size' || fallback === 'aesthetic') return fallback;
  return 'aesthetic';
}

function normalizeStoredSessionLength(value, fallback = '60') {
  const text = String(value || '').trim();
  if (['30', '45', '60', '75+'].includes(text)) return text;
  const minutes = Number.parseInt(text, 10);
  if (minutes >= 75) return '75+';
  if (minutes >= 60) return '60';
  if (minutes >= 45) return '45';
  if (minutes >= 30) return '30';
  return fallback;
}

function normalizeStoredLocation(value, fallback = 'Commercial gym') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeStoredLoadStyle(value, fallback = 'Balanced mix') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeStoredOutputStyle(value, fallback = 'RPE/RIR cues') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeStoredActivityLevel(value, fallback = 'Active') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeStoredStress(value, fallback = 'Medium') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizePainProfileMap(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  Object.entries(raw).forEach(([key, value]) => {
    const area = safeText(key, 80);
    if (!area || !isPlainObject(value)) return;
    const severity = clampInt(value?.severity, 0, 10, null);
    const recency = safeText(value?.recency, 40);
    if (!Number.isFinite(severity)) return;
    out[area] = {
      severity,
      recency
    };
  });
  return out;
}

function buildTrainingIntakeSnapshot(payload, existing = null) {
  const src = isPlainObject(payload) ? payload : {};
  const prior = isPlainObject(existing) ? existing : {};
  const strength = isPlainObject(src.strength) ? src.strength : {};
  const profile = isPlainObject(src.profile) ? src.profile : {};
  const goalMode = safeText(strength.goalMode, 40);
  const phase = safeText(src.phase || strength.phase, 40);
  const goal = normalizeStoredGoal(src.primaryGoal, phase, goalMode || prior.goal);
  const priority = normalizeStoredPriority(src.focus, prior.priority);
  const preferredDays = normalizeIntakeDayCodes(src.preferredDays ?? strength.preferredDays ?? prior.preferredDays);
  const focus = normalizeTextList(src.priorityGroups ?? src.emphasis ?? prior.focus, 10, 80);
  const injuries = normalizeTextList(src.painAreas ?? prior.injuries, 12, 80);
  const injuryDetails = normalizePainProfileMap(src.painProfilesByArea ?? prior.injuryDetails);
  const avoidMoves = normalizeTextList(src.movementsToAvoid ?? prior.avoidMoves, 20, 120);
  const equipment = normalizeTextList(src.equipmentAccess ?? prior.equipment, 20, 80);
  const experience = safeText(src.experience || prior.experience || '6-24m', 40);
  const sessionLength = normalizeStoredSessionLength(
    src.sessionLengthMin || src.timePerSession || strength.timePerSession || prior.sessionLength,
    prior.sessionLength || '60'
  );

  return {
    ...prior,
    completedAt: prior.completedAt || new Date().toISOString(),
    step: Math.max(10, Number(prior.step) || 0),
    goal,
    timeline: safeText(src.timeline || prior.timeline || '8 weeks', 40),
    priority,
    age: Number.isFinite(Number(profile.age)) ? Number(profile.age) : (Number.isFinite(Number(prior.age)) ? Number(prior.age) : null),
    experience,
    trainToFailure: safeText(src.closeToFailure || prior.trainToFailure || 'No', 12) || 'No',
    daysPerWeek: clampInt(src.daysPerWeek || prior.daysPerWeek, 1, 7, clampInt(prior.daysPerWeek, 1, 7, 4)),
    sessionLength,
    preferredDays,
    location: normalizeStoredLocation(src.location || prior.location, prior.location || 'Commercial gym'),
    equipment,
    focus,
    loadStyle: normalizeStoredLoadStyle(src.trainingStyle || src.equipmentStylePref || prior.loadStyle, prior.loadStyle || 'Balanced mix'),
    injuries,
    injuryDetails,
    avoidMoves,
    sleepHours: clampInt(src.sleepHours || prior.sleepHours, 4, 10, clampInt(prior.sleepHours, 4, 10, 7)),
    activityLevel: normalizeStoredActivityLevel(src.activityLevel || prior.activityLevel, prior.activityLevel || 'Active'),
    stress: normalizeStoredStress(src.stress || prior.stress, prior.stress || 'Medium'),
    outputStyle: normalizeStoredOutputStyle(src.outputStyle || prior.outputStyle, prior.outputStyle || 'RPE/RIR cues'),
    modality: safeText(src.trainingFeel || src.discipline || prior.modality || '', 80),
    phase: phase || safeText(prior.phase, 40),
    trainingWhy: safeText(src.primaryGoal || profile.goals || prior.trainingWhy || '', 160)
  };
}

async function mergeUserProfile(userId, patch) {
  const result = await db.query(
    'SELECT profile FROM app_user_profiles WHERE user_id = $1 LIMIT 1;',
    [userId]
  );
  const current = isPlainObject(result.rows?.[0]?.profile) ? result.rows[0].profile : {};
  const merged = deepMerge(current, patch);
  await db.query(
    `
      INSERT INTO app_user_profiles (user_id, profile)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (user_id) DO UPDATE
      SET profile = EXCLUDED.profile,
          updated_at = now();
    `,
    [userId, JSON.stringify(merged)]
  );
  return merged;
}

async function syncTrainingIntakeProfile(userId, payload) {
  const currentResult = await db.query(
    'SELECT profile FROM app_user_profiles WHERE user_id = $1 LIMIT 1;',
    [userId]
  );
  const currentProfile = isPlainObject(currentResult.rows?.[0]?.profile) ? currentResult.rows[0].profile : {};
  const currentIntake = isPlainObject(currentProfile.training_intake) ? currentProfile.training_intake : null;
  const nextIntake = buildTrainingIntakeSnapshot(payload, currentIntake);
  return await mergeUserProfile(userId, {
    training_intake: nextIntake
  });
}

async function getProfile(userId) {
  const result = await db.query(
    `
      SELECT tp.user_id, tp.onboarding_complete, tp.discipline, tp.experience, tp.days_per_week,
             tp.strength, tp.equipment_access, tp.first_name, tp.age, tp.location_city, tp.location_state, tp.goals, tp.profile_image,
             tp.calorie_offset, tp.no_progress_iterations, tp.flagged, tp.eval_weight_lb, tp.eval_weight_at,
             tp.last_weighin_lb, tp.last_weighin_at, tp.bio, tp.injuries, tp.updated_at,
             p.profile->'training_intake' AS training_intake
      FROM app_training_profiles tp
      LEFT JOIN app_user_profiles p ON p.user_id = tp.user_id
      WHERE tp.user_id = $1
      LIMIT 1;
    `,
    [userId]
  );
  return result.rows?.[0] || null;
}

async function upsertProfile(userId, data) {
  const discipline = normalizeDiscipline(data?.discipline);
  const experience = normalizeExperience(data?.experience);
  const daysPerWeek = clampInt(data?.daysPerWeek, 1, 7, null);
  const strength = data?.strength && typeof data.strength === 'object' ? data.strength : {};
  strength.unavailableDays = normalizeWeekdayIndexList(data?.unavailableDays ?? strength?.unavailableDays);
  strength.preferredDays = normalizeWeekdayIndexList(data?.preferredDays ?? strength?.preferredDays);
  const equipmentAccess = normalizeEquipmentAccess(data?.equipmentAccess);
  const firstName = safeText(data?.profile?.firstName, 80);
  const age = clampInt(data?.profile?.age, 13, 120, null);
  const locationCity = safeText(data?.profile?.locationCity, 80);
  const locationState = safeText(data?.profile?.locationState, 40);
  const goals = safeText(data?.profile?.goals, 240);
  const injuries = safeText(data?.profile?.injuries, 400);
  const profileImage = normalizeDataUrlImage(data?.profileImage?.dataUrl || data?.profileImage || null);

  if (!discipline) throw new Error('Missing discipline');
  if (!daysPerWeek) throw new Error('Missing training days');

  await db.query(
    `
      INSERT INTO app_training_profiles (
        user_id, updated_at, onboarding_complete, discipline, experience, days_per_week,
        strength, equipment_access, first_name, age, location_city, location_state, goals, injuries, profile_image
      )
      VALUES ($1, now(), true, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (user_id) DO UPDATE SET
        updated_at = now(),
        onboarding_complete = true,
        discipline = EXCLUDED.discipline,
        experience = EXCLUDED.experience,
        days_per_week = EXCLUDED.days_per_week,
        strength = EXCLUDED.strength,
        equipment_access = EXCLUDED.equipment_access,
        first_name = EXCLUDED.first_name,
        age = EXCLUDED.age,
        location_city = EXCLUDED.location_city,
        location_state = EXCLUDED.location_state,
        goals = EXCLUDED.goals,
        injuries = EXCLUDED.injuries,
        profile_image = COALESCE(EXCLUDED.profile_image, app_training_profiles.profile_image);
    `,
    [
      userId,
      discipline,
      experience,
      daysPerWeek,
      JSON.stringify(strength),
      JSON.stringify(equipmentAccess),
      firstName,
      age,
      locationCity,
      locationState,
      goals,
      injuries,
      profileImage
    ]
  );
}

function countExercisesWithoutGif(plan) {
  let missing = 0;
  try {
    for (const week of plan?.weeks || []) {
      for (const day of week?.days || []) {
        for (const ex of day?.exercises || []) {
          if (!ex?.gifUrl) missing += 1;
        }
      }
    }
  } catch {
    return missing;
  }
  return missing;
}

function queuePlanMediaEnrichment({ planId, planObj, equipmentAccess } = {}) {
  const id = String(planId || '').trim();
  if (!id || !planObj) return;
  if (mediaEnrichInFlight.has(id)) return;
  mediaEnrichInFlight.add(id);

  setImmediate(async () => {
    try {
      const cloned = JSON.parse(JSON.stringify(planObj));
      const beforeMissing = countExercisesWithoutGif(cloned);
      await enrichPlanWithExerciseMedia(cloned, {
        equipmentAccess,
        maxExercises: 40,
        timeBudgetMs: 10_000
      });
      const afterMissing = countExercisesWithoutGif(cloned);
      if (afterMissing < beforeMissing) {
        await db.query(
          'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
          [JSON.stringify(cloned), id]
        );
      }
    } catch {
      // ignore
    } finally {
      mediaEnrichInFlight.delete(id);
    }
  });
}

async function createNewPlan(userId, { discipline, daysPerWeek, experience, strength, equipmentAccess }) {
  const plan = generatePlan({ discipline, daysPerWeek, experience, strength });
  try {
    resolveWorkoutExercises(plan, buildResolverProfile({ discipline, strength, equipmentAccess }));
  } catch {
    // ignore resolver errors
  }
  await db.query('UPDATE app_training_plans SET active = false, updated_at = now() WHERE user_id = $1 AND active = true;', [userId]);
  const inserted = await db.query(
    `
      INSERT INTO app_training_plans (user_id, active, version, discipline, days_per_week, plan)
      VALUES ($1, true, 1, $2, $3, $4::jsonb)
      RETURNING id, version, discipline, days_per_week, plan, updated_at;
    `,
    [userId, discipline, daysPerWeek, JSON.stringify(plan)]
  );
  const row = inserted.rows?.[0] || null;
  if (row?.id) {
    // Best-effort: attach a couple gifs quickly, then finish in the background.
    try {
      const planObj = row.plan && typeof row.plan === 'object' ? row.plan : JSON.parse(String(row.plan || '{}'));
      const beforeMissing = countExercisesWithoutGif(planObj);
      await enrichPlanWithExerciseMedia(planObj, { equipmentAccess: equipmentAccess || null, maxExercises: 50, timeBudgetMs: 300 });
      const afterMissing = countExercisesWithoutGif(planObj);
      if (afterMissing < beforeMissing) {
        await db.query(
          'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
          [JSON.stringify(planObj), row.id]
        );
        row.plan = planObj;
      }
      queuePlanMediaEnrichment({ planId: row.id, planObj, equipmentAccess: equipmentAccess || null });
    } catch {
      // ignore
    }
  }
  return row;
}

async function createNewOblueprintPlan(userId, { discipline, daysPerWeek, plan }) {
  await db.query('UPDATE app_training_plans SET active = false, updated_at = now() WHERE user_id = $1 AND active = true;', [userId]);
  const inserted = await db.query(
    `
      INSERT INTO app_training_plans (user_id, active, version, discipline, days_per_week, plan)
      VALUES ($1, true, 1, $2, $3, $4::jsonb)
      RETURNING id, version, discipline, days_per_week, plan, updated_at;
    `,
    [userId, discipline, daysPerWeek, JSON.stringify(plan)]
  );
  return inserted.rows?.[0] || null;
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseRepsTargetFromText(raw) {
  const text = String(raw || '').trim();
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return clampInt(range[2], 1, 30, null);
  const single = clampInt(text, 1, 30, null);
  return single || null;
}

function normalizeProjectedFromInput(rawProjected, fallbackValue = null, fallbackUnit = 'lb') {
  const source = rawProjected && typeof rawProjected === 'object'
    ? rawProjected
    : { value: fallbackValue, unit: fallbackUnit };
  const unitRaw = String(source?.unit || fallbackUnit || 'lb').trim().toLowerCase();
  if (unitRaw === 'bw' || unitRaw === 'bodyweight') {
    return { value: null, unit: 'bw' };
  }
  const raw = Number(source?.value ?? source?.weight ?? fallbackValue);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const pounds = unitRaw.startsWith('kg') ? (raw * 2.2046226218) : raw;
  const rounded = Math.round(pounds * 2) / 2;
  const safe = clampNumber(rounded, 5, 2000, null);
  if (!Number.isFinite(safe) || safe <= 0) return null;
  return { value: safe, unit: 'lb' };
}

function normalizeCustomPlanDays(rawDays, dbRowsById) {
  const out = [];
  const seenWeekdays = new Set();
  const days = Array.isArray(rawDays) ? rawDays : [];
  for (const dayRaw of days) {
    const weekday = clampInt(dayRaw?.weekday, 0, 6, null);
    if (weekday == null || seenWeekdays.has(weekday)) continue;
    seenWeekdays.add(weekday);
    const exercisesRaw = Array.isArray(dayRaw?.exercises) ? dayRaw.exercises : [];
    const exercises = [];
    for (const exRaw of exercisesRaw) {
      const rawId = safeText(exRaw?.exerciseId || exRaw?.id, 180);
      const key = String(rawId || '').trim().toLowerCase();
      const dbRow = key ? dbRowsById.get(key) : null;
      const exerciseId = safeText(dbRow?.id || rawId, 180);
      if (!exerciseId) continue;
      const name = safeText(exRaw?.name || dbRow?.name || exerciseId, 180) || exerciseId;
      const sets = clampInt(exRaw?.sets, 1, 8, 3) || 3;
      const reps = safeText(exRaw?.reps, 24) || '8-12';
      const restSec = clampInt(exRaw?.restSec, 30, 300, 90) || 90;
      const projected = normalizeProjectedFromInput(
        exRaw?.projected,
        exRaw?.projectedWeight ?? exRaw?.weight ?? null,
        exRaw?.projectedUnit ?? exRaw?.weightUnit ?? 'lb'
      );
      exercises.push({
        exerciseId,
        name,
        sets,
        reps,
        restSec,
        ...(projected ? { projected } : {})
      });
      if (exercises.length >= 40) break;
    }
    out.push({
      weekday,
      label: WEEKDAY_LABELS[weekday] || `Day ${weekday}`,
      exercises
    });
    if (out.length >= 7) break;
  }
  return out;
}

function normalizeCustomWorkoutLevel(raw) {
  const level = String(raw || '').trim().toLowerCase();
  if (level === 'intermediate' || level === 'expert' || level === 'beginner') return level;
  return 'beginner';
}

function normalizeCustomWorkoutImageUrl(raw) {
  const dataUrl = normalizeDataUrlImage(raw);
  if (dataUrl) return dataUrl;
  const value = safeText(raw, 480) || '';
  if (!value) return '';
  if (!/^https?:\/\/\S+$/i.test(value)) return '';
  return value;
}

function normalizeCustomWorkoutCategory(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (!key) return 'free_weights';
  if (key.includes('calisthenic')) return 'calisthenics';
  if (key.includes('free weight') || key.includes('freeweight') || key === 'free') return 'free_weights';
  if (key.includes('stretch')) return 'stretching';
  if (key.includes('plyometric')) return 'plyometrics';
  return normalizeWorkoutCategory(raw);
}

function normalizeUserCustomWorkoutEntry(payload, { fixedExerciseId = null } = {}) {
  const name = safeText(payload?.name, 160);
  if (!name) return { ok: false, error: 'Workout name is required' };

  let baseExerciseId = slugifyExerciseId(fixedExerciseId || payload?.exerciseId || name);
  if (!fixedExerciseId && baseExerciseId && !/^custom_/i.test(baseExerciseId)) {
    baseExerciseId = `custom_${baseExerciseId}`;
  }
  if (!baseExerciseId) return { ok: false, error: 'Invalid workout id' };

  const primaryMuscles = asTextArray(payload?.primaryMuscles || payload?.primaryMuscle, {
    maxItems: 6,
    maxLen: 48
  })
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean);
  if (!primaryMuscles.length) return { ok: false, error: 'Primary muscle is required' };

  const secondaryMuscles = asTextArray(payload?.secondaryMuscles, {
    maxItems: 8,
    maxLen: 48
  })
    .map((x) => String(x || '').trim().toLowerCase())
    .filter(Boolean);

  const instructions = asTextArray(payload?.instructions, {
    maxItems: 20,
    maxLen: 300
  });

  const entry = {
    exerciseId: baseExerciseId,
    name,
    category: normalizeCustomWorkoutCategory(payload?.category || payload?.section),
    equipment: safeText(payload?.equipment, 80) || '',
    level: normalizeCustomWorkoutLevel(payload?.level),
    primaryMuscles,
    primaryMuscleGroup: String(payload?.primaryMuscleGroup || primaryMuscles[0] || '').trim().toLowerCase(),
    subMuscleGroup: String(payload?.subMuscleGroup || '').trim().toLowerCase(),
    secondaryMuscles,
    instructions,
    imageUrl: normalizeCustomWorkoutImageUrl(payload?.imageUrl),
    beforeImageUrl: normalizeCustomWorkoutImageUrl(payload?.beforeImageUrl || payload?.imageUrl),
    afterImageUrl: normalizeCustomWorkoutImageUrl(payload?.afterImageUrl)
  };
  return { ok: true, entry };
}

function formatUserCustomWorkoutRow(row) {
  const imageUrl = safeText(row?.image_url, 480) || '';
  const beforeImageUrl = safeText(row?.before_image_url, 480) || imageUrl;
  const afterImageUrl = safeText(row?.after_image_url, 480) || '';
  const images = [beforeImageUrl, afterImageUrl].filter(Boolean);
  return {
    id: String(row?.exercise_id || ''),
    name: String(row?.name || row?.exercise_id || 'Custom workout'),
    category: String(row?.category || 'strength'),
    equipment: String(row?.equipment || ''),
    level: String(row?.level || 'beginner'),
    primaryMuscles: Array.isArray(row?.primary_muscles) ? row.primary_muscles : [],
    primaryMuscleGroup: String(row?.primary_muscle_group || (Array.isArray(row?.primary_muscles) ? row.primary_muscles[0] || '' : '') || ''),
    subMuscleGroup: String(row?.sub_muscle_group || ''),
    secondaryMuscles: Array.isArray(row?.secondary_muscles) ? row.secondary_muscles : [],
    instructions: Array.isArray(row?.instructions) ? row.instructions : [],
    imageUrl: beforeImageUrl || imageUrl,
    beforeImageUrl,
    afterImageUrl,
    images,
    isCustom: true,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

async function listUserCustomWorkouts(userId) {
  const result = await db.query(
    `
      SELECT exercise_id, name, category, equipment, level, primary_muscles, secondary_muscles, instructions, image_url, before_image_url, after_image_url, created_at, updated_at
      FROM app_training_user_workouts
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 400;
    `,
    [userId]
  );
  return (result.rows || []).map((row) => formatUserCustomWorkoutRow(row));
}

async function createUserCustomWorkout(userId, payload) {
  const normalized = normalizeUserCustomWorkoutEntry(payload || {});
  if (!normalized.ok) return normalized;

  let exerciseId = normalized.entry.exerciseId;
  const baseId = exerciseId;
  for (let i = 0; i < 80; i += 1) {
    const probe = await db.query(
      'SELECT 1 FROM app_training_user_workouts WHERE user_id = $1 AND exercise_id = $2 LIMIT 1;',
      [userId, exerciseId]
    );
    if (!probe.rows?.length) break;
    exerciseId = `${baseId}_${i + 2}`;
  }

  const inserted = await db.query(
    `
      INSERT INTO app_training_user_workouts (
        user_id, exercise_id, name, category, equipment, level,
        primary_muscles, secondary_muscles, instructions, image_url, before_image_url, after_image_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12)
      RETURNING exercise_id, name, category, equipment, level, primary_muscles, secondary_muscles, instructions, image_url, before_image_url, after_image_url, created_at, updated_at;
    `,
    [
      userId,
      exerciseId,
      normalized.entry.name,
      normalized.entry.category,
      normalized.entry.equipment,
      normalized.entry.level,
      JSON.stringify(normalized.entry.primaryMuscles),
      JSON.stringify(normalized.entry.secondaryMuscles),
      JSON.stringify(normalized.entry.instructions),
      normalized.entry.imageUrl,
      normalized.entry.beforeImageUrl,
      normalized.entry.afterImageUrl
    ]
  );
  return { ok: true, item: formatUserCustomWorkoutRow(inserted.rows?.[0] || {}) };
}

async function deleteUserCustomWorkout(userId, exerciseId) {
  const id = safeText(exerciseId, 180);
  if (!id) return { ok: false, error: 'Missing exercise id' };
  const result = await db.query(
    `
      DELETE FROM app_training_user_workouts
      WHERE user_id = $1 AND lower(exercise_id) = lower($2)
      RETURNING exercise_id;
    `,
    [userId, id]
  );
  if (!result.rows?.length) return { ok: false, error: 'Custom workout not found' };
  return { ok: true };
}

function buildCustomWorkoutPlan({ discipline, experience, templateDays, preferredWeekdays }) {
  const nowIso = new Date().toISOString();
  const safeDays = Array.isArray(templateDays) ? templateDays : [];
  const dayTemplates = safeDays.map((day, dayIdx) => ({
    index: dayIdx + 1,
    dayType: String(day?.label || `Day ${dayIdx + 1}`).toLowerCase(),
    focus: `${String(day?.label || `Day ${dayIdx + 1}`)} session`,
    exercises: (Array.isArray(day?.exercises) ? day.exercises : []).map((ex, exIdx) => {
      const reps = String(ex?.reps || '8-12');
      const repsTarget = parseRepsTargetFromText(reps);
      const projected = normalizeProjectedFromInput(ex?.projected);
      const baseId = String(ex?.exerciseId || `exercise_${dayIdx + 1}_${exIdx + 1}`);
      const exerciseId = `${baseId}__d${dayIdx + 1}__e${exIdx + 1}`;
      return {
        id: exerciseId,
        baseId,
        name: String(ex?.name || baseId),
        displayName: String(ex?.name || baseId),
        sets: clampInt(ex?.sets, 1, 8, 3) || 3,
        reps,
        restSec: clampInt(ex?.restSec, 30, 300, 90) || 90,
        rest: clampInt(ex?.restSec, 30, 300, 90) || 90,
        substitutions: [],
        progression: repsTarget ? { repsTarget } : {},
        ...(projected ? { projected } : {})
      };
    })
  }));

  const weeks = Array.from({ length: 12 }, (_, idx) => ({
    index: idx + 1,
    days: dayTemplates.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => ({ ...ex, progression: { ...(ex.progression || {}) } }))
    }))
  }));

  return {
    meta: {
      discipline,
      experience,
      timeline: '12+ weeks',
      daysPerWeek: safeDays.length,
      source: 'custom_builder',
      customBuilder: true,
      preferredWeekdays: Array.isArray(preferredWeekdays) ? preferredWeekdays : [],
      createdAt: nowIso,
      startDate: nowIso
    },
    weeks
  };
}

async function upsertWorkoutLog({ userId, planId, weekIndex, dayIndex, performedAt, entries, notes, readiness, durationMs, timerStartedAt, timerEndedAt }) {
  const perfDate = performedAt ? String(performedAt).slice(0, 10) : null;
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeNotes = safeText(notes, 2000) || '';
  const safeReadiness = Number.isFinite(Number(readiness)) ? Math.max(1, Math.min(10, Number(readiness))) : null;
  const safeDurationMs = Number.isFinite(Number(durationMs)) && Number(durationMs) > 0
    ? Math.max(0, Math.round(Number(durationMs)))
    : null;
  const parseIsoTimestamp = (raw) => {
    if (!raw) return null;
    const parsed = Date.parse(String(raw));
    if (!Number.isFinite(parsed)) return null;
    return new Date(parsed).toISOString();
  };
  const safeTimerStartedAt = parseIsoTimestamp(timerStartedAt);
  const safeTimerEndedAt = parseIsoTimestamp(timerEndedAt);
  const result = await db.query(
    `
      INSERT INTO app_training_workouts (
        user_id, plan_id, updated_at, performed_at, week_index, day_index, readiness, duration_ms, timer_started_at, timer_ended_at, entries, notes
      )
      VALUES ($1, $2, now(), $3::date, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::jsonb, $11)
      ON CONFLICT (plan_id, week_index, day_index) DO UPDATE SET
        updated_at = now(),
        performed_at = COALESCE(EXCLUDED.performed_at, app_training_workouts.performed_at),
        readiness = COALESCE(EXCLUDED.readiness, app_training_workouts.readiness),
        duration_ms = COALESCE(EXCLUDED.duration_ms, app_training_workouts.duration_ms),
        timer_started_at = COALESCE(EXCLUDED.timer_started_at, app_training_workouts.timer_started_at),
        timer_ended_at = COALESCE(EXCLUDED.timer_ended_at, app_training_workouts.timer_ended_at),
        entries = EXCLUDED.entries,
        notes = EXCLUDED.notes
      RETURNING id, updated_at, duration_ms, timer_started_at, timer_ended_at;
    `,
    [
      userId,
      planId,
      perfDate,
      weekIndex,
      dayIndex,
      safeReadiness,
      safeDurationMs,
      safeTimerStartedAt,
      safeTimerEndedAt,
      JSON.stringify(safeEntries),
      safeNotes
    ]
  );
  return result.rows?.[0] || null;
}

function normalizeLiftHistoryKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/__d\d+__e\d+$/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
}

function buildLiftHistoryKey(entry) {
  const baseId = safeText(entry?.baseId, 180);
  if (baseId) return normalizeLiftHistoryKey(baseId);
  const exerciseId = safeText(entry?.exerciseId, 180);
  if (exerciseId) return normalizeLiftHistoryKey(exerciseId);
  const exerciseName = safeText(entry?.exerciseName || entry?.name, 180);
  return normalizeLiftHistoryKey(exerciseName);
}

function normalizeLiftWeight(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function normalizeLiftReps(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function estimateLiftOneRepMax(weightRaw, repsRaw) {
  const weight = normalizeLiftWeight(weightRaw);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const reps = normalizeLiftReps(repsRaw);
  const repCount = Number.isFinite(reps) && reps > 0 ? Math.max(1, Math.min(30, reps)) : 1;
  return Math.round((weight * (1 + (repCount / 30))) * 100) / 100;
}

function compareLiftPerformance(nextPerf, prevPerf) {
  const nextEst = Number(nextPerf?.estimated1rm || 0);
  const prevEst = Number(prevPerf?.estimated1rm || 0);
  if (nextEst !== prevEst) return nextEst - prevEst;
  const nextWeight = Number(nextPerf?.weight || 0);
  const prevWeight = Number(prevPerf?.weight || 0);
  if (nextWeight !== prevWeight) return nextWeight - prevWeight;
  const nextReps = Number(nextPerf?.reps || 0);
  const prevReps = Number(prevPerf?.reps || 0);
  return nextReps - prevReps;
}

function extractLastLiftPerformance(entry) {
  const sets = Array.isArray(entry?.sets) ? entry.sets : [];
  for (let i = sets.length - 1; i >= 0; i -= 1) {
    const set = sets[i] && typeof sets[i] === 'object' ? sets[i] : null;
    const weight = normalizeLiftWeight(set?.weight);
    const reps = normalizeLiftReps(set?.reps);
    if (!Number.isFinite(weight) && !Number.isFinite(reps)) continue;
    return {
      weight,
      reps,
      estimated1rm: estimateLiftOneRepMax(weight, reps)
    };
  }
  const actualWeight = normalizeLiftWeight(entry?.actual?.weight);
  const actualReps = normalizeLiftReps(entry?.actual?.reps);
  if (!Number.isFinite(actualWeight) && !Number.isFinite(actualReps)) return null;
  return {
    weight: actualWeight,
    reps: actualReps,
    estimated1rm: estimateLiftOneRepMax(actualWeight, actualReps)
  };
}

function extractBestLiftPerformance(entry) {
  const sets = Array.isArray(entry?.sets) ? entry.sets : [];
  let best = null;
  for (const rawSet of sets) {
    const set = rawSet && typeof rawSet === 'object' ? rawSet : null;
    const weight = normalizeLiftWeight(set?.weight);
    const reps = normalizeLiftReps(set?.reps);
    if (!Number.isFinite(weight) && !Number.isFinite(reps)) continue;
    const candidate = {
      weight,
      reps,
      estimated1rm: estimateLiftOneRepMax(weight, reps)
    };
    if (!best || compareLiftPerformance(candidate, best) > 0) best = candidate;
  }
  const actual = extractLastLiftPerformance(entry);
  if (actual && (!best || compareLiftPerformance(actual, best) > 0)) {
    best = actual;
  }
  return best;
}

function formatLiftHistoryRow(row) {
  return {
    exerciseKey: String(row?.exercise_key || '').trim(),
    exerciseId: String(row?.exercise_id || '').trim() || null,
    baseId: String(row?.base_id || '').trim() || null,
    exerciseName: String(row?.exercise_name || row?.exercise_id || row?.exercise_key || 'Exercise').trim(),
    last: {
      weight: normalizeLiftWeight(row?.last_weight_lb),
      reps: normalizeLiftReps(row?.last_reps),
      estimated1rm: normalizeLiftWeight(row?.last_estimated_1rm_lb),
      performedAt: row?.last_performed_at ? String(row.last_performed_at).slice(0, 10) : null
    },
    best: {
      weight: normalizeLiftWeight(row?.best_weight_lb),
      reps: normalizeLiftReps(row?.best_reps),
      estimated1rm: normalizeLiftWeight(row?.best_estimated_1rm_lb),
      performedAt: row?.best_performed_at ? String(row.best_performed_at).slice(0, 10) : null
    },
    updatedAt: row?.updated_at || null
  };
}

function buildLiftHistoryPayloadMap(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.exerciseKey || '').trim();
    if (!key) continue;
    out[key] = row;
  }
  return out;
}

async function listLiftHistory(userId, { limit = 800 } = {}) {
  const result = await db.query(
    `
      SELECT exercise_key, exercise_id, base_id, exercise_name,
             last_weight_lb, last_reps, last_estimated_1rm_lb, last_performed_at,
             best_weight_lb, best_reps, best_estimated_1rm_lb, best_performed_at,
             updated_at
      FROM app_training_lift_history
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2;
    `,
    [userId, Math.max(1, Math.min(2000, Number(limit) || 800))]
  );
  return (result.rows || []).map((row) => formatLiftHistoryRow(row));
}

async function safeListLiftHistory(userId, opts = {}) {
  try {
    const liftHistory = await listLiftHistory(userId, opts);
    return {
      liftHistory,
      liftHistoryUnavailable: false,
      error: null
    };
  } catch (err) {
    console.warn('training.state.lift_history_unavailable', {
      userId,
      error: String(err?.message || 'Failed to load lift history'),
      code: String(err?.code || '').trim() || null,
      fallbackLiftHistoryCount: 0
    });
    return {
      liftHistory: [],
      liftHistoryUnavailable: true,
      error: err
    };
  }
}

async function upsertLiftHistoryEntries({ userId, performedAt, entries, source = 'draft' }) {
  const safePerformedAt = performedAt ? String(performedAt).slice(0, 10) : null;
  const normalizedEntries = [];
  for (const rawEntry of Array.isArray(entries) ? entries : []) {
    const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : null;
    if (!entry) continue;
    const exerciseKey = buildLiftHistoryKey(entry);
    const last = extractLastLiftPerformance(entry);
    const best = extractBestLiftPerformance(entry);
    if (!exerciseKey || (!last && !best)) continue;
    normalizedEntries.push({
      exerciseKey,
      exerciseId: safeText(entry?.exerciseId, 180) || null,
      baseId: safeText(entry?.baseId, 180) || null,
      exerciseName: safeText(entry?.exerciseName || entry?.name || entry?.exerciseId || entry?.baseId, 180) || 'Exercise',
      last,
      best
    });
  }
  if (!normalizedEntries.length) return [];

  const keys = Array.from(new Set(normalizedEntries.map((entry) => entry.exerciseKey)));
  const existingResult = await db.query(
    `
      SELECT exercise_key, exercise_id, base_id, exercise_name,
             last_weight_lb, last_reps, last_estimated_1rm_lb, last_performed_at,
             best_weight_lb, best_reps, best_estimated_1rm_lb, best_performed_at,
             updated_at
      FROM app_training_lift_history
      WHERE user_id = $1 AND exercise_key = ANY($2::text[]);
    `,
    [userId, keys]
  );
  const existingByKey = new Map((existingResult.rows || []).map((row) => [String(row.exercise_key || '').trim(), row]));
  const touchedRows = [];

  for (const entry of normalizedEntries) {
    const existing = existingByKey.get(entry.exerciseKey) || null;
    const previousBest = existing ? {
      weight: normalizeLiftWeight(existing.best_weight_lb),
      reps: normalizeLiftReps(existing.best_reps),
      estimated1rm: normalizeLiftWeight(existing.best_estimated_1rm_lb)
    } : null;
    const shouldReplaceBest = entry.best && (!previousBest || compareLiftPerformance(entry.best, previousBest) > 0);
    const nextBest = entry.best
      ? (shouldReplaceBest ? entry.best : previousBest)
      : previousBest;
    const nextBestPerformedAt = shouldReplaceBest
      ? safePerformedAt
      : (existing?.best_performed_at ? String(existing.best_performed_at).slice(0, 10) : safePerformedAt);

    const params = [
      userId,
      entry.exerciseKey,
      entry.exerciseId,
      entry.baseId,
      entry.exerciseName,
      entry.last?.weight ?? null,
      entry.last?.reps ?? null,
      entry.last?.estimated1rm ?? null,
      safePerformedAt,
      nextBest?.weight ?? null,
      nextBest?.reps ?? null,
      nextBest?.estimated1rm ?? null,
      nextBestPerformedAt,
      String(source || 'draft').slice(0, 40)
    ];

    const result = existing
      ? await db.query(
          `
            UPDATE app_training_lift_history
            SET exercise_id = COALESCE($3, exercise_id),
                base_id = COALESCE($4, base_id),
                exercise_name = COALESCE(NULLIF($5, ''), exercise_name),
                last_weight_lb = $6,
                last_reps = $7,
                last_estimated_1rm_lb = $8,
                last_performed_at = COALESCE($9::date, last_performed_at),
                best_weight_lb = COALESCE($10, best_weight_lb),
                best_reps = COALESCE($11, best_reps),
                best_estimated_1rm_lb = COALESCE($12, best_estimated_1rm_lb),
                best_performed_at = COALESCE($13::date, best_performed_at),
                last_source = $14,
                updated_at = now()
            WHERE user_id = $1 AND exercise_key = $2
            RETURNING exercise_key, exercise_id, base_id, exercise_name,
                      last_weight_lb, last_reps, last_estimated_1rm_lb, last_performed_at,
                      best_weight_lb, best_reps, best_estimated_1rm_lb, best_performed_at,
                      updated_at;
          `,
          params
        )
      : await db.query(
          `
            INSERT INTO app_training_lift_history (
              user_id, exercise_key, exercise_id, base_id, exercise_name,
              last_weight_lb, last_reps, last_estimated_1rm_lb, last_performed_at,
              best_weight_lb, best_reps, best_estimated_1rm_lb, best_performed_at,
              last_source
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13::date, $14)
            RETURNING exercise_key, exercise_id, base_id, exercise_name,
                      last_weight_lb, last_reps, last_estimated_1rm_lb, last_performed_at,
                      best_weight_lb, best_reps, best_estimated_1rm_lb, best_performed_at,
                      updated_at;
          `,
          params
        );

    const row = result.rows?.[0] || null;
    if (!row) continue;
    existingByKey.set(entry.exerciseKey, row);
    touchedRows.push(formatLiftHistoryRow(row));
  }

  return touchedRows;
}

async function listWorkoutLogs({ userId, planId = null }) {
  const hasPlanId = String(planId || '').trim().length > 0;
  const params = hasPlanId ? [userId, planId] : [userId];
  const result = await db.query(
    `
      SELECT plan_id, week_index, day_index, performed_at, readiness, duration_ms, timer_started_at, timer_ended_at, entries, notes, updated_at
      FROM app_training_workouts
      WHERE user_id = $1
      ${hasPlanId ? 'AND plan_id = $2' : ''}
      ORDER BY COALESCE(performed_at::timestamp, updated_at) ASC, week_index ASC, day_index ASC;
    `,
    params
  );
  return result.rows || [];
}

async function patchProjectedWeight({ userId, planId, weekIndex, dayIndex, exerciseId, nextProjected }) {
  const planRow = await db.query(
    'SELECT id, version, plan FROM app_training_plans WHERE id = $1 AND user_id = $2 AND active = true LIMIT 1;',
    [planId, userId]
  );
  const row = planRow.rows?.[0];
  if (!row) return null;
  const plan = row.plan && typeof row.plan === 'object' ? row.plan : JSON.parse(String(row.plan || '{}'));
  const week = (plan.weeks || []).find((w) => Number(w.index) === Number(weekIndex));
  if (!week) return null;
  const day = (week.days || [])[Number(dayIndex) - 1];
  if (!day) return null;
  const ex = (day.exercises || []).find((e) => String(e.id) === String(exerciseId));
  if (!ex) return null;
  const next = Number(nextProjected);
  if (!Number.isFinite(next) || next <= 0) return null;
  ex.projected = ex.projected && typeof ex.projected === 'object' ? ex.projected : {};
  ex.projected.value = next;
  ex.projected.unit = ex.projected.unit || 'lb';
  plan.meta = { ...(plan.meta || {}), updatedAt: new Date().toISOString() };

  const updated = await db.query(
    `
      UPDATE app_training_plans
      SET updated_at = now(),
          version = version + 1,
          plan = $3::jsonb
      WHERE id = $1 AND user_id = $2
      RETURNING id, version, discipline, days_per_week, plan, updated_at;
    `,
    [planId, userId, JSON.stringify(plan)]
  );
  return updated.rows?.[0] || null;
}

async function patchExerciseOverride({
  userId,
  planId,
  weekIndex,
  dayIndex,
  slotId,
  exerciseId,
  oldExerciseId,
  nextExerciseId,
  nextExerciseName
}) {
  const planRow = await db.query(
    'SELECT id, version, plan FROM app_training_plans WHERE id = $1 AND user_id = $2 AND active = true LIMIT 1;',
    [planId, userId]
  );
  const row = planRow.rows?.[0];
  if (!row) return null;
  const plan = row.plan && typeof row.plan === 'object' ? row.plan : JSON.parse(String(row.plan || '{}'));
  const week = (plan.weeks || []).find((w) => Number(w.index) === Number(weekIndex));
  if (!week) return null;
  const day = (week.days || [])[Number(dayIndex) - 1];
  if (!day) return null;
  const targetSlotId = safeText(slotId, 120);
  const targetExerciseId = safeText(exerciseId, 120);
  const targetOldExerciseId = safeText(oldExerciseId, 120);
  const replacementExerciseId = safeText(nextExerciseId, 120);
  if (!replacementExerciseId) return null;
  const ex = (day.exercises || []).find((entry) => {
    if (targetSlotId && String(entry?.slotId || '') === targetSlotId) return true;
    if (targetExerciseId && String(entry?.id || '') === targetExerciseId) return true;
    if (targetOldExerciseId && String(entry?.exerciseId || '') === targetOldExerciseId) return true;
    return false;
  });
  if (!ex) return null;

  ex.exerciseId = replacementExerciseId;
  const safeName = safeText(nextExerciseName, 180);
  if (safeName) {
    ex.name = safeName;
    ex.displayName = safeName;
  }
  plan.meta = { ...(plan.meta || {}), updatedAt: new Date().toISOString() };

  const updated = await db.query(
    `
      UPDATE app_training_plans
      SET updated_at = now(),
          version = version + 1,
          plan = $3::jsonb
      WHERE id = $1 AND user_id = $2
      RETURNING id, version, discipline, days_per_week, plan, updated_at;
    `,
    [planId, userId, JSON.stringify(plan)]
  );
  return updated.rows?.[0] || null;
}

async function applyProgressionFromLog({ userId, planId, logPayload }) {
  const planRow = await db.query(
    'SELECT id, version, plan FROM app_training_plans WHERE id = $1 AND user_id = $2 AND active = true LIMIT 1;',
    [planId, userId]
  );
  const row = planRow.rows?.[0];
  if (!row) return null;
  const plan = row.plan && typeof row.plan === 'object' ? row.plan : JSON.parse(String(row.plan || '{}'));
  const updatedPlan = applyLogAdjustments({
    plan,
    workoutLog: logPayload,
    experience: plan?.meta?.experience
  });
  if (!updatedPlan) return null;

  const updated = await db.query(
    `
      UPDATE app_training_plans
      SET updated_at = now(),
          version = version + 1,
          plan = $3::jsonb
      WHERE id = $1 AND user_id = $2
      RETURNING id, version, discipline, days_per_week, plan, updated_at;
    `,
    [planId, userId, JSON.stringify(updatedPlan)]
  );
  return updated.rows?.[0] || null;
}

async function patchProfile(userId, data) {
  const profileImage = data?.profileImage ? normalizeDataUrlImage(data.profileImage) : null;
  const bio = data?.bio != null ? safeText(data.bio, 220) : null;

  if (!profileImage && bio == null) return null;

  await db.query(
    `
      INSERT INTO app_training_profiles (user_id, profile_image, bio, onboarding_complete)
      VALUES ($1, $2, $3, false)
      ON CONFLICT (user_id) DO UPDATE
      SET profile_image = COALESCE(EXCLUDED.profile_image, app_training_profiles.profile_image),
          bio = COALESCE(EXCLUDED.bio, app_training_profiles.bio),
          updated_at = now();
    `,
    [userId, profileImage, bio]
  );
  return await getProfile(userId);
}

function normalizeGoalMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'cut') return 'cut';
  if (v === 'bulk') return 'bulk';
  return null;
}

function daysBetweenIso(aIso, bIso) {
  if (!aIso || !bIso) return null;
  const a = new Date(`${String(aIso).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(bIso).slice(0, 10)}T00:00:00Z`);
  const ta = a.getTime();
  const tb = b.getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.floor((tb - ta) / (24 * 60 * 60 * 1000));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function upsertWeighin({ userId, weightLb, goalMode }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const profile = await getProfile(userId);

  const existingOffset = Number(profile?.calorie_offset) || 0;
  const existingIter = Number(profile?.no_progress_iterations) || 0;
  const existingFlagged = !!profile?.flagged;
  const evalWeight = profile?.eval_weight_lb == null ? null : Number(profile.eval_weight_lb);
  const evalAt = profile?.eval_weight_at ? String(profile.eval_weight_at).slice(0, 10) : null;

  let nextOffset = existingOffset;
  let nextIterations = existingIter;
  let nextFlagged = existingFlagged;
  let adjusted = false;
  let deltaKcal = 0;
  let recommendation = null;
  let warning = null;

  const w = clampNumber(weightLb, 50, 700, null);
  if (!w) return { ok: false, error: 'Invalid weight' };

  if (!evalAt || !Number.isFinite(evalWeight)) {
    // Establish baseline for bi-weekly checks.
    await db.query(
      `
        INSERT INTO app_training_profiles (user_id, eval_weight_lb, eval_weight_at, last_weighin_lb, last_weighin_at, onboarding_complete)
        VALUES ($1, $2, $3, $2, $3, false)
        ON CONFLICT (user_id) DO UPDATE
        SET last_weighin_lb = EXCLUDED.last_weighin_lb,
            last_weighin_at = EXCLUDED.last_weighin_at,
            updated_at = now();
      `,
      [userId, w, todayIso]
    );
    const updated = await getProfile(userId);
    return { ok: true, profile: updated, adjusted: false, deltaKcal: 0, iterations: updated?.no_progress_iterations || 0, flagged: !!updated?.flagged, recommendation: null, warning: null };
  }

  const daysSince = daysBetweenIso(evalAt, todayIso);
  // Always store the latest weigh-in.
  await db.query(
    `
      UPDATE app_training_profiles
      SET last_weighin_lb = $2,
          last_weighin_at = $3,
          updated_at = now()
      WHERE user_id = $1;
    `,
    [userId, w, todayIso]
  );

  if (daysSince != null && daysSince >= 14) {
    const expRaw = String(profile?.experience || '').trim().toLowerCase();
    const bulkTargets = (() => {
      // Defaults to the "intermediate" guidance range, since that's where most users live.
      if (expRaw.includes('beginner')) return { label: 'Beginner', min: 0.5, max: 1.0 };
      if (expRaw.includes('intermediate')) return { label: 'Intermediate', min: 0.25, max: 0.5 };
      if (expRaw.includes('advanced')) return { label: 'Advanced', min: 0.25, max: 0.5 };
      return { label: 'Intermediate', min: 0.25, max: 0.5 };
    })();

    // Normalize into an approximate weekly pace even if the user checked in late (e.g., 9–10 days).
    const weekScale = 14 / Math.max(14, Number(daysSince) || 14);
    const weeklyLoss = (Number(evalWeight) - w) * weekScale; // positive = losing
    const weeklyGain = (w - Number(evalWeight)) * weekScale; // positive = gaining

    const applyAdjustment = (delta, msg, rec) => {
      deltaKcal = delta;
      nextOffset = clampInt(existingOffset + deltaKcal, -1200, 1200, existingOffset);
      nextIterations = existingIter + 1;
      if (nextIterations >= 4) nextFlagged = true;
      adjusted = true;
      recommendation = rec || null;
      warning = msg || null;
    };

    const resetIterations = () => {
      nextIterations = 0;
      adjusted = false;
      deltaKcal = 0;
      recommendation = null;
      warning = null;
    };

    if (!goalMode) {
      resetIterations();
    } else if (goalMode === 'cut') {
      // Cut guidance:
      // - Ideal: ~1.5–2.0 lb/week loss
      // - Too slow: under 1.5 lb/week (or gaining)
      // - Too fast: over 2.0 lb/week; hard cap: 3.0 lb/week
      const pace = weeklyLoss;
      if (!Number.isFinite(pace)) {
        resetIterations();
      } else if (pace <= 0) {
        applyAdjustment(-200, `Cut pace: ${pace.toFixed(2)} lb/week (not losing). Auto-adjusted -200 kcal to tighten the deficit.`, 'run');
      } else if (pace < 1.5) {
        applyAdjustment(-200, `Cut pace: ${pace.toFixed(2)} lb/week (under 1.5). Auto-adjusted -200 kcal to get back on track (~1.5–2.0 lb/week).`, 'run');
      } else if (pace > 3.0) {
        applyAdjustment(+200, `Cut pace: ${pace.toFixed(2)} lb/week (over 3.0). Auto-adjusted +200 kcal to slow the cut (safer pace).`, null);
      } else if (pace > 2.0) {
        applyAdjustment(+200, `Cut pace: ${pace.toFixed(2)} lb/week (over 2.0). Auto-adjusted +200 kcal to slow the cut toward ~1.5–2.0 lb/week.`, null);
      } else {
        resetIterations();
      }
    } else if (goalMode === 'bulk') {
      // Bulk guidance:
      // - Beginner: 0.5–1.0 lb/week
      // - Intermediate/Advanced: 0.25–0.5 lb/week
      // - Hard cap: >2.0 lb/week gain (too fast)
      const pace = weeklyGain;
      if (!Number.isFinite(pace)) {
        resetIterations();
      } else if (pace > 2.0) {
        applyAdjustment(-200, `Bulk pace: ${pace.toFixed(2)} lb/week (over 2.0). Auto-adjusted -200 kcal to reduce unnecessary fat gain.`, 'bulk_supplement');
      } else if (pace <= 0) {
        applyAdjustment(+200, `Bulk pace: ${pace.toFixed(2)} lb/week (not gaining). Auto-adjusted +200 kcal to move toward your target gain range.`, 'bulk_supplement');
      } else if (pace < bulkTargets.min) {
        applyAdjustment(+200, `Bulk pace: ${pace.toFixed(2)} lb/week (below ${bulkTargets.label} target ${bulkTargets.min}–${bulkTargets.max}). Auto-adjusted +200 kcal.`, 'bulk_supplement');
      } else if (pace > bulkTargets.max) {
        applyAdjustment(-200, `Bulk pace: ${pace.toFixed(2)} lb/week (above ${bulkTargets.label} target ${bulkTargets.min}–${bulkTargets.max}). Auto-adjusted -200 kcal.`, 'bulk_supplement');
      } else {
        resetIterations();
      }
    } else {
      resetIterations();
    }

    await db.query(
      `
        UPDATE app_training_profiles
        SET calorie_offset = $2,
            no_progress_iterations = $3,
            flagged = $4,
            eval_weight_lb = $5,
            eval_weight_at = $6,
            updated_at = now()
        WHERE user_id = $1;
      `,
      [userId, nextOffset, nextIterations, nextFlagged, w, todayIso]
    );
  }

  const updated = await getProfile(userId);
  return {
    ok: true,
    profile: updated,
    adjusted,
    deltaKcal,
    iterations: Number(updated?.no_progress_iterations) || 0,
    flagged: !!updated?.flagged,
    recommendation,
    warning
  };
}

async function trainingRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/training')) return false;
  const pathname = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  try {

  function validatePlanInputs(payload) {
    const discipline = normalizeDiscipline(payload?.discipline);
    const experience = normalizeExperience(payload?.experience);
    const daysPerWeek = clampInt(payload?.daysPerWeek, 2, 6, null);
    if (!discipline) return { ok: false, error: 'Missing discipline' };
    if (!daysPerWeek) return { ok: false, error: 'Missing days per week' };

    const strength = payload?.strength && typeof payload.strength === 'object' ? payload.strength : {};
    if (discipline === 'powerlifting') {
      const squat = Number(strength?.squat);
      const bench = Number(strength?.bench);
      const deadlift = Number(strength?.deadlift);
      const bw = Number(strength?.bodyweight);
      const goalBw = Number(strength?.goalBodyweight);
      const eventType = String(strength?.eventType || '').trim();
      if (!Number.isFinite(squat) || squat <= 0) return { ok: false, error: 'Enter a valid squat' };
      if (!Number.isFinite(bench) || bench <= 0) return { ok: false, error: 'Enter a valid bench' };
      if (!Number.isFinite(deadlift) || deadlift <= 0) return { ok: false, error: 'Enter a valid deadlift' };
      if (!Number.isFinite(bw) || bw <= 0) return { ok: false, error: 'Enter current bodyweight' };
      if (!Number.isFinite(goalBw) || goalBw <= 0) return { ok: false, error: 'Enter goal bodyweight' };
      if (!['full_power', 'bench_only'].includes(eventType)) return { ok: false, error: 'Select event type' };
    }
    if (discipline === 'bodybuilding') {
      const bw = Number(strength?.bodyweight);
      if (!Number.isFinite(bw) || bw <= 0) return { ok: false, error: 'Enter current bodyweight' };

      const hasV2 = strength?.benchWeight != null || strength?.lowerWeight != null || strength?.hingeWeight != null;
      if (hasV2) {
        const height = Number(strength?.height);
        const benchW = Number(strength?.benchWeight);
        const benchR = Number(strength?.benchReps);
        const lowerW = Number(strength?.lowerWeight);
        const lowerR = Number(strength?.lowerReps);
        const hingeW = Number(strength?.hingeWeight);
        const hingeR = Number(strength?.hingeReps);
        if (!Number.isFinite(height) || height <= 0) return { ok: false, error: 'Enter height' };
        if (!Number.isFinite(benchW) || benchW <= 0 || !Number.isFinite(benchR) || benchR <= 0) return { ok: false, error: 'Enter bench working set (weight + reps)' };
        if (!Number.isFinite(lowerW) || lowerW <= 0 || !Number.isFinite(lowerR) || lowerR <= 0) return { ok: false, error: 'Enter squat/leg press working set (weight + reps)' };
        if (!Number.isFinite(hingeW) || hingeW <= 0 || !Number.isFinite(hingeR) || hingeR <= 0) return { ok: false, error: 'Enter deadlift/RDL working set (weight + reps)' };
        const timePerSession = String(strength?.timePerSession || '').trim();
        const trainingAgeBucket = String(strength?.trainingAgeBucket || '').trim();
        const phase = String(strength?.phase || payload?.phase || '').trim().toLowerCase();
        if (!timePerSession) return { ok: false, error: 'Select training time per session' };
        if (!trainingAgeBucket) return { ok: false, error: 'Select training age' };
        if (!phase) return { ok: false, error: 'Select phase' };
        if (['bulk', 'cut'].includes(phase)) {
          const target = Number(strength?.targetWeightLb ?? payload?.targetWeightLb);
          if (!Number.isFinite(target) || target <= 0) return { ok: false, error: 'Enter target weight' };
        }
        const injury = strength?.injury && typeof strength.injury === 'object' ? strength.injury : null;
        const severity = strength?.injurySeverityByJoint && typeof strength.injurySeverityByJoint === 'object'
          ? strength.injurySeverityByJoint
          : {};
        if (injury?.has && Array.isArray(injury?.joints)) {
          for (const j of injury.joints) {
            const v = Number(severity?.[j]);
            if (!Number.isFinite(v) || v < 1 || v > 10) {
              return { ok: false, error: 'Enter injury severity for each selected joint' };
            }
          }
        }
      } else {
        const pw = Number(strength?.pressWeight);
        const pr = Number(strength?.pressReps);
        const rw = Number(strength?.pullWeight);
        const rr = Number(strength?.pullReps);
        const lw = Number(strength?.legWeight);
        const lr = Number(strength?.legReps);
        const pressDate = String(strength?.pressDate || '').trim();
        const pullDate = String(strength?.pullDate || '').trim();
        const legDate = String(strength?.legDate || '').trim();
        const pressMovement = String(strength?.pressMovement || '').trim();
        const pullMovement = String(strength?.pullMovement || '').trim();
        const legMovement = String(strength?.legMovement || '').trim();
        if (!Number.isFinite(pw) || pw <= 0 || !Number.isFinite(pr) || pr <= 0) return { ok: false, error: 'Enter best pressing weight + reps' };
        if (!Number.isFinite(rw) || rw <= 0 || !Number.isFinite(rr) || rr <= 0) return { ok: false, error: 'Enter best pulling weight + reps' };
        if (!Number.isFinite(lw) || lw <= 0 || !Number.isFinite(lr) || lr <= 0) return { ok: false, error: 'Enter best leg movement weight + reps' };
        if (!isDateIso(pressDate) || !isDateIso(pullDate) || !isDateIso(legDate)) {
          return { ok: false, error: 'Enter the last-performed date for each movement' };
        }
        if (!pressMovement || !pullMovement || !legMovement) {
          return { ok: false, error: 'Select movements for pressing, pulling, and legs' };
        }
      }
    }
    if (discipline === 'calisthenics') {
      const pushups = Number(strength?.pushups);
      const pullups = Number(strength?.pullups);
      const dips = Number(strength?.dips);
      if (!Number.isFinite(pushups) || pushups < 0) return { ok: false, error: 'Enter max pushups' };
      if (!Number.isFinite(pullups) || pullups < 0) return { ok: false, error: 'Enter max pullups' };
      if (!Number.isFinite(dips) || dips < 0) return { ok: false, error: 'Enter max dips' };
    }

    return { ok: true, discipline, experience, daysPerWeek, strength };
  }

  if (pathname === '/api/training/workout-test-batch' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const profiles = Array.isArray(payload?.profiles) ? payload.profiles.slice(0, 20) : [];
    if (!profiles.length) return sendJson(res, 400, { error: 'No workout test profiles provided' });

    const results = [];
    for (let index = 0; index < profiles.length; index += 1) {
      const profile = profiles[index] && typeof profiles[index] === 'object' ? profiles[index] : {};
      const rawPayload = profile?.payload && typeof profile.payload === 'object' ? profile.payload : {};
      try {
        let built;
        if (String(rawPayload?.discipline || '').trim().toLowerCase() === 'bodybuilding') {
          built = buildOblueprintPlanWithFallback(coerceClassicBodybuildingToOblueprintPayload(rawPayload));
        } else if (isOblueprintRequest(rawPayload)) {
          built = buildOblueprintPlanWithFallback(rawPayload);
        } else {
          const validated = validatePlanInputs(rawPayload);
          if (!validated.ok) {
            results.push({
              ok: false,
              index,
              label: String(profile?.label || `Simulation ${index + 1}`),
              summary: profile?.summary || null,
              error: validated.error
            });
            continue;
          }
          const plan = generatePlan({
            discipline: validated.discipline,
            daysPerWeek: validated.daysPerWeek,
            experience: validated.experience,
            strength: validated.strength
          });
          built = { plan };
        }

        if (built?.error || !built?.plan) {
          const normalized = normalizePlanBuildError(built?.error || { message: 'Failed to build plan' }, {
            functionName: 'buildOblueprintPlanWithFallback'
          });
          results.push({
            ok: false,
            index,
            label: String(profile?.label || `Simulation ${index + 1}`),
            summary: profile?.summary || null,
            ...normalized
          });
          continue;
        }

        const plan = built.plan;
        if (String(plan?.meta?.discipline || '').toLowerCase() === 'bodybuilding') {
          const validation = validateBodybuildingPlanContract(plan);
          if (!validation.ok) throw validation.error;
        }
        results.push({
          ok: true,
          index,
          label: String(profile?.label || `Simulation ${index + 1}`),
          summary: profile?.summary || null,
          plan: {
            id: null,
            version: 0,
            discipline: plan?.meta?.discipline || String(rawPayload?.discipline || '').trim().toLowerCase(),
            days_per_week: Number(plan?.meta?.daysPerWeek) || Number(rawPayload?.daysPerWeek) || 0,
            plan,
            updated_at: new Date().toISOString(),
            preview: true
          }
        });
      } catch (err) {
        const normalized = normalizePlanBuildError(err);
        results.push({
          ok: false,
          index,
          label: String(profile?.label || `Simulation ${index + 1}`),
          summary: profile?.summary || null,
          ...normalized
        });
      }
    }

    return sendJson(res, 200, { ok: true, results });
  }

  // Public, no-account preview plan. Does not write to DB.
  if (pathname === '/api/training/preview' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const previewRouteStartedAt = Date.now();
    const previewRequestId = getTrainingRequestId(req);
    const previewPayloadSummary = summarizePlanBuildPayload(payload);
    logTrainingRouteLifecycle('training_build_backend_route_started', {
      requestId: previewRequestId,
      endpoint: '/api/training/preview',
      routeKind: 'signed_out_preview',
      dayCount: previewPayloadSummary?.daysPerWeek || null,
      priorityGroups: Array.isArray(previewPayloadSummary?.priorityGroups) ? previewPayloadSummary.priorityGroups : [],
      backendElapsedMs: 0
    });
    const previewDebugRaw = matchesAbsGlutesLegsDebugCombo(payload, { rawClassic: true });
    if (previewDebugRaw) {
      logAbsGlutesLegsDebug('route', 'preview-payload-received', {
        elapsedMs: 0,
        payload
      });
    }

    if (isOblueprintRequest(payload)) {
      if (matchesAbsGlutesLegsDebugCombo(payload)) {
        logAbsGlutesLegsDebug('route', 'preview-oblueprint-worker-dispatch', {
          elapsedMs: Date.now() - previewRouteStartedAt,
          workerBacked: true,
          effectiveTimeoutMs: TRAINING_PLAN_BUILD_TIMEOUT_MS,
          payload
        });
      }
      const built = await runTrainingPlanBuildWithTimeout(payload, { fastBuild: true }, {
        routeName: 'preview',
        requestId: previewRequestId,
        endpoint: '/api/training/preview',
        routeKind: 'signed_out_preview'
      });
      if (built?.error) {
        logTrainingRouteLifecycle('training_build_backend_response_sent', {
          requestId: previewRequestId,
          endpoint: '/api/training/preview',
          routeKind: 'signed_out_preview',
          dayCount: previewPayloadSummary?.daysPerWeek || null,
          priorityGroups: Array.isArray(previewPayloadSummary?.priorityGroups) ? previewPayloadSummary.priorityGroups : [],
          backendElapsedMs: Date.now() - previewRouteStartedAt,
          responseStatus: 400,
          responseKind: 'structured_failure',
          slowestBuilderStage: built?.error?.lastBuilderStage || built?.error?.lastHeartbeatStage || null
        });
        if (matchesAbsGlutesLegsDebugCombo(payload)) {
          logAbsGlutesLegsDebug('route', 'preview-build-failed', {
            elapsedMs: Date.now() - previewRouteStartedAt,
            source: 'builder',
            error: normalizePlanBuildError(built.error, {
              functionName: 'buildOblueprintPlanWithFallback'
            })
          });
        }
        return sendJson(res, 400, logPlanBuildFailure('preview', built.error, {
          functionName: 'buildOblueprintPlanWithFallback'
        }));
      }
      const plan = built.plan;
      const usedPayload = built.usedPayload || payload;
      if (String(plan?.meta?.discipline || '').toLowerCase() === 'bodybuilding') {
        const validation = validateBodybuildingPlanContract(plan);
        if (!validation.ok) {
          return sendJson(res, 400, logPlanBuildFailure('preview', validation.error, {
            functionName: 'assertBodybuildingPlanByEngine'
          }));
        }
      }
      logTrainingRouteLifecycle('training_build_backend_response_sent', {
        requestId: previewRequestId,
        endpoint: '/api/training/preview',
        routeKind: 'signed_out_preview',
        dayCount: previewPayloadSummary?.daysPerWeek || null,
        priorityGroups: Array.isArray(previewPayloadSummary?.priorityGroups) ? previewPayloadSummary.priorityGroups : [],
        backendElapsedMs: Date.now() - previewRouteStartedAt,
        responseStatus: 200,
        responseKind: 'success',
        slowestBuilderStage: built?.diagnostics?.slowestBuilderStage || null,
        slowestBuilderStageElapsedMs: built?.diagnostics?.slowestBuilderStageElapsedMs ?? null
      });
      return sendJson(res, 200, {
        ok: true,
        plan: {
          id: null,
          version: 0,
          discipline: plan?.meta?.discipline || resolveOblueprintDiscipline(usedPayload?.trainingFeel),
          days_per_week: Number(plan?.meta?.daysPerWeek) || Number(usedPayload?.daysPerWeek) || 0,
          plan,
          updated_at: new Date().toISOString(),
          preview: true
        }
      });
    }

    // Graceful fallback: classic bodybuilding payloads can be incomplete.
    if (String(payload?.discipline || '').trim().toLowerCase() === 'bodybuilding') {
      const coerced = coerceClassicBodybuildingToOblueprintPayload(payload);
      if (previewDebugRaw || matchesAbsGlutesLegsDebugCombo(coerced)) {
        logAbsGlutesLegsDebug('route', 'preview-bodybuilding-worker-dispatch', {
          elapsedMs: Date.now() - previewRouteStartedAt,
          workerBacked: true,
          effectiveTimeoutMs: TRAINING_PLAN_BUILD_TIMEOUT_MS,
          frontendPayload: payload,
          normalizedPayload: coerced
        });
      }
      const built = await runTrainingPlanBuildWithTimeout(coerced, { fastBuild: true }, {
        routeName: 'preview',
        requestId: previewRequestId,
        endpoint: '/api/training/preview',
        routeKind: 'signed_out_preview'
      });
      if (!built?.error) {
        const plan = built.plan;
        const validation = validateBodybuildingPlanContract(plan);
        if (!validation.ok) {
          return sendJson(res, 400, logPlanBuildFailure('preview', validation.error, {
            functionName: 'assertBodybuildingPlanByEngine'
          }));
        }
        logTrainingRouteLifecycle('training_build_backend_response_sent', {
          requestId: previewRequestId,
          endpoint: '/api/training/preview',
          routeKind: 'signed_out_preview',
          dayCount: previewPayloadSummary?.daysPerWeek || null,
          priorityGroups: Array.isArray(previewPayloadSummary?.priorityGroups) ? previewPayloadSummary.priorityGroups : [],
          backendElapsedMs: Date.now() - previewRouteStartedAt,
          responseStatus: 200,
          responseKind: 'success',
          slowestBuilderStage: built?.diagnostics?.slowestBuilderStage || null,
          slowestBuilderStageElapsedMs: built?.diagnostics?.slowestBuilderStageElapsedMs ?? null
        });
        return sendJson(res, 200, {
          ok: true,
          plan: {
            id: null,
            version: 0,
            discipline: plan?.meta?.discipline || 'bodybuilding',
            days_per_week: Number(plan?.meta?.daysPerWeek) || Number(coerced?.daysPerWeek) || 0,
            plan,
            updated_at: new Date().toISOString(),
            preview: true
          }
        });
      }
      logTrainingRouteLifecycle('training_build_backend_response_sent', {
        requestId: previewRequestId,
        endpoint: '/api/training/preview',
        routeKind: 'signed_out_preview',
        dayCount: previewPayloadSummary?.daysPerWeek || null,
        priorityGroups: Array.isArray(previewPayloadSummary?.priorityGroups) ? previewPayloadSummary.priorityGroups : [],
        backendElapsedMs: Date.now() - previewRouteStartedAt,
        responseStatus: 400,
        responseKind: 'structured_failure',
        slowestBuilderStage: built?.error?.lastBuilderStage || built?.error?.lastHeartbeatStage || built?.diagnostics?.slowestBuilderStage || null
      });
      if (previewDebugRaw || matchesAbsGlutesLegsDebugCombo(coerced)) {
        logAbsGlutesLegsDebug('route', 'preview-build-failed', {
          elapsedMs: Date.now() - previewRouteStartedAt,
          source: 'builder',
          error: normalizePlanBuildError(built?.error || { message: 'Failed to build plan' }, {
            functionName: 'buildOblueprintPlanWithFallback'
          })
        });
      }
      return sendJson(res, 400, logPlanBuildFailure('preview', built?.error || { message: 'Failed to build plan' }, {
        functionName: 'buildOblueprintPlanWithFallback'
      }));
    }

    const validated = validatePlanInputs(payload);
    if (!validated.ok) return sendJson(res, 400, { error: validated.error });

      try {
        const plan = generatePlan({
          discipline: validated.discipline,
          daysPerWeek: validated.daysPerWeek,
          experience: validated.experience,
          strength: validated.strength
        });
        try {
          resolveWorkoutExercises(plan, buildResolverProfile({
            discipline: validated.discipline,
            strength: validated.strength,
            equipmentAccess: payload?.equipmentAccess || null
          }));
        } catch {
          // ignore resolver errors
        }
        try {
          // Don't block preview with slow ExerciseDB calls.
          await enrichPlanWithExerciseMedia(plan, { equipmentAccess: payload?.equipmentAccess || null, maxExercises: 60, timeBudgetMs: 250 });
        } catch {
        // ignore
      }
      plan.meta = { ...(plan.meta || {}), preview: true };
      return sendJson(res, 200, {
        ok: true,
        plan: {
          id: null,
          version: 0,
          discipline: validated.discipline,
          days_per_week: validated.daysPerWeek,
          plan,
          updated_at: new Date().toISOString(),
          preview: true
        }
      });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-preview', 'Failed to build preview plan');
    }
  }

  if (pathname === '/api/training/quote-bank' && req.method === 'GET') {
    try {
      const raw = fs.readFileSync(QUOTE_BANK_PATH, 'utf8');
      const json = JSON.parse(raw);
      return sendJson(res, 200, { ok: true, quotes: Array.isArray(json) ? json : [] });
    } catch (err) {
      return sendJson(res, 200, { ok: true, quotes: [] });
    }
  }

  if (pathname === '/api/training/import-ocr' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON payload' });
    }
    const imageDataUrl = String(payload?.imageDataUrl || '').trim();
    const filename = String(payload?.filename || 'import.jpg').trim();
    if (!imageDataUrl) {
      return sendJson(res, 400, { ok: false, error: 'Missing imageDataUrl' });
    }
    let decoded;
    try {
      decoded = decodeImageDataUrl(imageDataUrl);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err?.message || 'Invalid image payload' });
    }
    if (decoded.buffer.length > TRAINING_IMPORT_OCR_MAX_IMAGE_BYTES) {
      return sendJson(res, 413, {
        ok: false,
        error: `Image too large (${decoded.buffer.length} bytes). Limit is ${TRAINING_IMPORT_OCR_MAX_IMAGE_BYTES} bytes.`
      });
    }
    try {
      let result = null;
      let primaryError = null;
      try {
        result = await runTrainingImportOcr(decoded.buffer, filename);
      } catch (err) {
        primaryError = err;
      }
      if (!result) {
        try {
          result = await runTrainingImportOcrViaOcrSpace(decoded.buffer, filename);
        } catch (fallbackErr) {
          const primaryMsg = String(primaryError?.message || '').trim();
          const fallbackMsg = String(fallbackErr?.message || '').trim();
          const detail = [primaryMsg, fallbackMsg].filter(Boolean).join(' | ');
          const combined = new Error(detail || 'OCR backend unavailable');
          const fallbackCode = typeof fallbackErr?.code === 'string' ? fallbackErr.code : '';
          const primaryCode = typeof primaryError?.code === 'string' ? primaryError.code : '';
          combined.code = fallbackCode || primaryCode || 'OCR_FAILED';
          throw combined;
        }
      }
      const text = String(result?.text || '').trim();
      return sendJson(res, 200, {
        ok: true,
        text,
        engine: String(result?.engine || 'ocr'),
        lineCount: Number(result?.lineCount || 0),
        avgConfidence: Number(result?.avgConfidence || 0)
      });
    } catch (err) {
      return sendJson(res, 503, {
        ok: false,
        error: err?.message || 'OCR backend unavailable',
        code: err?.code || 'OCR_FAILED'
      });
    }
  }

  const workoutDbItemMatch = pathname.match(/^\/api\/training\/workout-database\/([^/]+)$/);
  const customWorkoutItemMatch = pathname.match(/^\/api\/training\/custom-workouts\/([^/]+)$/);

  if (pathname === '/api/training/workout-database' && req.method === 'GET') {
    try {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const limit = clampInt(url.searchParams.get('limit'), 1, 2000, 500);
      const rows = readWorkoutDatabase();
      const filtered = rows.filter((ex) => {
        if (!q) return true;
        const text = [
          ex?.id,
          ex?.name,
          ex?.category,
          ex?.equipment,
          Array.isArray(ex?.primaryMuscles) ? ex.primaryMuscles.join(' ') : '',
          Array.isArray(ex?.secondaryMuscles) ? ex.secondaryMuscles.join(' ') : ''
        ].join(' ').toLowerCase();
        return text.includes(q);
      });
      const items = filtered
        .slice()
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
        .slice(0, limit);
      let canEdit = false;
      if (db.isConfigured()) {
        const viewerState = await safeResolveUserFromSession(req, {
          routeName: 'training.workout-database.get',
          fallback: 'guest'
        });
        canEdit = Boolean(viewerState?.user?.isOwner);
      }
      return sendJson(res, 200, { ok: true, count: items.length, total: filtered.length, items, canEdit });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to load workout database' });
    }
  }

  if (pathname === '/api/training/workout-database' && req.method === 'POST') {
    if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
    const sessionState = await safeResolveUserFromSession(req, {
      routeName: 'training.workout-database.create',
      fallback: 'service_unavailable'
    });
    if (sessionState.sessionUnavailable) return sendJson(res, 503, { error: 'Service unavailable' });
    const user = sessionState.user;
    if (!user) return sendJson(res, 401, { error: 'Not authenticated' });
    if (!user.isOwner) return sendJson(res, 403, {
      error: 'Owner access required',
      ownerCheck: { id: user.id || null, username: user.username || null, displayName: user.displayName || null, isOwner: !!user.isOwner }
    });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const normalized = normalizeWorkoutEntry(payload);
    if (!normalized.ok) return sendJson(res, 400, { error: normalized.error });
    try {
      const rows = readWorkoutDatabase();
      const nextEntry = { ...(normalized.entry || {}) };
      const id = String(nextEntry.id || '');
      if (rows.some((ex) => String(ex?.id || '').toLowerCase() === id.toLowerCase())) {
        return sendJson(res, 409, { error: 'Exercise id already exists' });
      }
      try {
        nextEntry.images = resolveWorkoutImages({
          exerciseId: id,
          existingImages: payload?.images,
          imageUploads: payload?.imageUploads,
          replaceImages: payload?.replaceImages
        });
      } catch (imgErr) {
        return sendJson(res, 400, { error: imgErr?.message || 'Invalid workout image upload' });
      }
      rows.push(nextEntry);
      writeWorkoutDatabase(rows);
      return sendJson(res, 201, { ok: true, item: nextEntry });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to add workout' });
    }
  }

  if (workoutDbItemMatch && req.method === 'PATCH') {
    if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
    const sessionState = await safeResolveUserFromSession(req, {
      routeName: 'training.workout-database.patch',
      fallback: 'service_unavailable'
    });
    if (sessionState.sessionUnavailable) return sendJson(res, 503, { error: 'Service unavailable' });
    const user = sessionState.user;
    if (!user) return sendJson(res, 401, { error: 'Not authenticated' });
    if (!user.isOwner) return sendJson(res, 403, {
      error: 'Owner access required',
      ownerCheck: { id: user.id || null, username: user.username || null, displayName: user.displayName || null, isOwner: !!user.isOwner }
    });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const id = decodeURIComponent(workoutDbItemMatch[1] || '').trim();
    if (!id) return sendJson(res, 400, { error: 'Missing exercise id' });
    try {
      const rows = readWorkoutDatabase();
      const idx = rows.findIndex((ex) => String(ex?.id || '').toLowerCase() === id.toLowerCase());
      if (idx < 0) return sendJson(res, 404, { error: 'Exercise not found' });
      const merged = { ...rows[idx], ...(payload && typeof payload === 'object' ? payload : {}), id: rows[idx].id };
      const normalized = normalizeWorkoutEntry(merged, { fixedId: rows[idx].id });
      if (!normalized.ok) return sendJson(res, 400, { error: normalized.error });
      const nextEntry = { ...(normalized.entry || {}) };
      const baseImages = Object.prototype.hasOwnProperty.call(payload || {}, 'images')
        ? payload.images
        : rows[idx]?.images;
      try {
        nextEntry.images = resolveWorkoutImages({
          exerciseId: nextEntry.id,
          existingImages: baseImages,
          imageUploads: payload?.imageUploads,
          replaceImages: payload?.replaceImages
        });
      } catch (imgErr) {
        return sendJson(res, 400, { error: imgErr?.message || 'Invalid workout image upload' });
      }
      rows[idx] = nextEntry;
      writeWorkoutDatabase(rows);
      return sendJson(res, 200, { ok: true, item: nextEntry });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to update workout' });
    }
  }

  if (workoutDbItemMatch && req.method === 'DELETE') {
    if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
    const sessionState = await safeResolveUserFromSession(req, {
      routeName: 'training.workout-database.delete',
      fallback: 'service_unavailable'
    });
    if (sessionState.sessionUnavailable) return sendJson(res, 503, { error: 'Service unavailable' });
    const user = sessionState.user;
    if (!user) return sendJson(res, 401, { error: 'Not authenticated' });
    if (!user.isOwner) return sendJson(res, 403, {
      error: 'Owner access required',
      ownerCheck: { id: user.id || null, username: user.username || null, displayName: user.displayName || null, isOwner: !!user.isOwner }
    });
    const id = decodeURIComponent(workoutDbItemMatch[1] || '').trim();
    if (!id) return sendJson(res, 400, { error: 'Missing exercise id' });
    try {
      const rows = readWorkoutDatabase();
      const next = rows.filter((ex) => String(ex?.id || '').toLowerCase() !== id.toLowerCase());
      if (next.length === rows.length) return sendJson(res, 404, { error: 'Exercise not found' });
      writeWorkoutDatabase(next);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to delete workout' });
    }
  }

  const isShareRequestsRoute = pathname === '/api/training/share/requests' && req.method === 'GET';

  if (!db.isConfigured()) {
    if (isShareRequestsRoute) return sendTrainingShareRequestsUnavailable(res);
    return sendJson(res, 501, { error: 'Database not configured' });
  }

  const sessionState = await safeResolveUserFromSession(req, {
    routeName: 'training.authenticated',
    fallback: 'service_unavailable'
  });
  if (sessionState.sessionUnavailable) {
    if (isShareRequestsRoute) return sendTrainingShareRequestsUnavailable(res);
    return sendJson(res, 503, { error: 'Service unavailable' });
  }
  const user = sessionState.user;
  if (!user) return sendJson(res, 401, { error: 'Not authenticated' });

    if (pathname === '/api/training/demo/ensure-workout' && (req.method === 'GET' || req.method === 'POST')) {
      const returnTo = safeLocalReturnTo(url.searchParams.get('returnTo') || '/training.html?demoPlan=1');
      try {
        const plan = await ensureDemoWorkoutPlanForUser(user.id, user.displayName || user.username || 'Demo User');
        if (req.method === 'POST') {
          return sendJson(res, 200, {
            ok: true,
            redirectTo: returnTo,
            planId: plan?.id || null
          });
        }
        res.writeHead(302, { Location: returnTo, 'Cache-Control': 'no-store' });
        res.end();
        return true;
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err?.message || 'Could not create demo workout plan.' });
      }
    }

    if (pathname === '/api/training/custom-workouts' && req.method === 'GET') {
      try {
        const items = await listUserCustomWorkouts(user.id);
        return sendJson(res, 200, { ok: true, items });
      } catch (err) {
        return handleTrainingDbFailure(res, err, 'training-custom-workouts-list', 'Failed to load custom workouts');
      }
    }

    if (pathname === '/api/training/custom-workouts' && req.method === 'POST') {
      let payload;
      try {
        payload = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
      try {
        const created = await createUserCustomWorkout(user.id, payload || {});
        if (!created.ok) return sendJson(res, 400, { ok: false, error: created.error || 'Could not create custom workout' });
        return sendJson(res, 201, { ok: true, item: created.item });
      } catch (err) {
        return handleTrainingDbFailure(res, err, 'training-custom-workouts-create', 'Failed to save custom workout');
      }
    }

    if (customWorkoutItemMatch && req.method === 'DELETE') {
      const exerciseId = decodeURIComponent(customWorkoutItemMatch[1] || '').trim();
      if (!exerciseId) return sendJson(res, 400, { ok: false, error: 'Missing exercise id' });
      try {
        const removed = await deleteUserCustomWorkout(user.id, exerciseId);
        if (!removed.ok) return sendJson(res, 404, { ok: false, error: removed.error || 'Custom workout not found' });
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return handleTrainingDbFailure(res, err, 'training-custom-workouts-delete', 'Failed to delete custom workout');
      }
    }

  if (pathname === '/api/training/state' && req.method === 'GET') {
      const [profile, plan, liftHistoryState] = await Promise.all([
        getProfile(user.id),
        getActivePlan(user.id),
        safeListLiftHistory(user.id)
      ]);
      const liftHistory = Array.isArray(liftHistoryState?.liftHistory) ? liftHistoryState.liftHistory : [];
      const liftHistoryUnavailable = Boolean(liftHistoryState?.liftHistoryUnavailable);
      try {
        const equipmentAccess = profile?.equipment_access && typeof profile.equipment_access === 'object' ? profile.equipment_access : null;
        const planObj = plan?.plan && typeof plan.plan === 'object' ? plan.plan : null;
        if (planObj) {
          if (planNeedsResolution(planObj)) {
            try {
              resolveWorkoutExercises(planObj, buildResolverProfile({
                discipline: planObj?.meta?.discipline,
                strength: profile?.strength,
                equipmentAccess
              }));
              setImmediate(() => {
                db.query(
                  'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
                  [JSON.stringify(planObj), plan.id]
                ).catch(() => {});
              });
            } catch {
              // ignore
            }
          }
          queuePlanMediaEnrichment({ planId: plan.id, planObj, equipmentAccess });
        }
      } catch {
        // ignore
      }

      // Hard validation: if a bodybuilding plan violates bans/caps, deactivate it
      // so users are forced to rebuild with the latest rules.
      if (plan?.plan && typeof plan.plan === 'object') {
        const planObj = plan.plan;
        const discipline = String(planObj?.meta?.discipline || plan?.discipline || '').toLowerCase();
        if (discipline === 'bodybuilding') {
          const validation = validateBodybuildingPlanContract(planObj);
          if (!validation.ok) {
            try {
              await db.query('UPDATE app_training_plans SET active = false, updated_at = now() WHERE id = $1;', [plan.id]);
            } catch {
              // ignore
            }
            return sendJson(res, 200, {
              user,
              profile,
              plan: null,
              error: 'Plan needs a rebuild.',
              liftHistory: buildLiftHistoryPayloadMap(liftHistory),
              liftHistoryUnavailable
            });
          }
        }
      }

      return sendJson(res, 200, {
        user,
        profile,
        plan,
        liftHistory: buildLiftHistoryPayloadMap(liftHistory),
        liftHistoryUnavailable
      });
    }

  if (pathname === '/api/training/share' && req.method === 'POST') {
    logShareRoute('share.request.received', { method: req.method, pathname, fromUserId: user.id });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
    const rawIds = [];
    if (Array.isArray(payload?.targetUserIds)) rawIds.push(...payload.targetUserIds);
    if (payload?.targetUserId != null) rawIds.push(payload.targetUserId);
    const targetIds = Array.from(new Set(rawIds.map((id) => String(id || '').trim()).filter(isUuid))).slice(0, 20);
    if (!targetIds.length) return sendJson(res, 400, { ok: false, error: 'Select at least one account.' });

    const planRow = await getActivePlan(user.id);
    if (!planRow?.plan) return sendJson(res, 400, { ok: false, error: 'No active plan to share.' });
    let planSnapshot = planRow.plan;
    if (typeof planSnapshot === 'string') {
      try {
        planSnapshot = JSON.parse(planSnapshot);
      } catch {
        planSnapshot = {};
      }
    }

    const recipientRows = await db.query(
      'SELECT id FROM app_users WHERE id = ANY($1::uuid[]) AND id <> $2;',
      [targetIds, user.id]
    );
    const recipients = (recipientRows.rows || []).map((row) => row.id).filter(Boolean);
    if (!recipients.length) return sendJson(res, 400, { ok: false, error: 'No valid recipients.' });

    const snapshotJson = JSON.stringify(planSnapshot || {});
    for (const targetId of recipients) {
      try {
        await db.query(
          `
            INSERT INTO app_training_share_invites (from_user_id, to_user_id, plan_id, plan_snapshot, status)
            VALUES ($1, $2, $3, $4::jsonb, 'pending')
            ON CONFLICT (from_user_id, to_user_id) WHERE (status = 'pending')
            DO UPDATE SET updated_at = now(), plan_id = $3, plan_snapshot = $4::jsonb, status = 'pending', responded_at = null;
          `,
          [user.id, targetId, planRow.id, snapshotJson]
        );
      } catch (err) {
        const code = String(err?.code || '').trim();
        const msg = String(err?.message || '');
        const canFallback = code === '42P10' || /no unique or exclusion constraint matching the ON CONFLICT specification/i.test(msg);
        if (!canFallback) throw err;

        const updated = await db.query(
          `
            UPDATE app_training_share_invites
            SET updated_at = now(),
                plan_id = $3,
                plan_snapshot = $4::jsonb,
                status = 'pending',
                responded_at = null
            WHERE from_user_id = $1
              AND to_user_id = $2
              AND status = 'pending';
          `,
          [user.id, targetId, planRow.id, snapshotJson]
        );
        if (!Number(updated.rowCount || 0)) {
          await db.query(
            `
              INSERT INTO app_training_share_invites (from_user_id, to_user_id, plan_id, plan_snapshot, status)
              VALUES ($1, $2, $3, $4::jsonb, 'pending');
            `,
            [user.id, targetId, planRow.id, snapshotJson]
          );
        }
      }
      clearInviteCache(targetId);
      emitUserEvent({
        userId: targetId,
        eventName: 'Workout Share Invite Received',
        eventProps: {
          fromUserId: user.id,
          fromDisplayName: String(user.displayName || user.username || 'Your teammate'),
          inviteStatus: 'pending'
        }
      }).catch(() => {});
    }

    return sendJson(res, 200, {
      ok: true,
      invited: recipients.length,
      skipped: targetIds.length - recipients.length
    });
  }

  if (pathname === '/api/training/share/outgoing' && req.method === 'GET') {
    logShareRoute('share.outgoing.requested', { method: req.method, pathname, fromUserId: user.id });
    const result = await db.query(
      `
        SELECT DISTINCT ON (to_user_id)
               to_user_id,
               status,
               updated_at
        FROM app_training_share_invites i
        WHERE from_user_id = $1
        ORDER BY to_user_id, updated_at DESC
        LIMIT 2000;
      `,
      [user.id]
    );
    const latestStatusByUserId = {};
    const targetUserIds = [];
    for (const row of (result.rows || [])) {
      const toUserId = String(row?.to_user_id || '').trim();
      if (!toUserId) continue;
      const status = String(row?.status || '').trim().toLowerCase();
      if (!status) continue;
      latestStatusByUserId[toUserId] = status;
      if (status === 'pending') targetUserIds.push(toUserId);
    }
    const acceptedIds = Object.entries(latestStatusByUserId)
      .filter(([, status]) => String(status || '').toLowerCase() === 'accepted')
      .map(([id]) => String(id || '').trim())
      .filter((id) => isUuid(id));
    let acceptedUsers = [];
    if (acceptedIds.length) {
      const usersResult = await db.query(
        `
          SELECT u.id,
                 u.username,
                 u.display_name,
                 u.last_seen,
                 p.profile->'profile'->>'photoDataUrl' AS photo
          FROM app_users u
          LEFT JOIN app_user_profiles p ON p.user_id = u.id
          WHERE u.id = ANY($1::uuid[])
          LIMIT 2000;
        `,
        [acceptedIds]
      );
      acceptedUsers = (usersResult.rows || []).map((row) => ({
        id: row.id,
        username: row.username || null,
        displayName: row.display_name || row.username || 'Account',
        photoDataUrl: row.photo || null,
        lastSeen: row.last_seen || null,
        isOnline: isLastSeenOnline(row.last_seen)
      }));
    }
    const joinedResult = await db.query(
      `
        SELECT DISTINCT ON (i.from_user_id)
               i.from_user_id,
               u.username,
               u.display_name,
               u.last_seen,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_training_share_invites i
        JOIN app_users u ON u.id = i.from_user_id
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE i.to_user_id = $1
          AND i.status = 'accepted'
        ORDER BY i.from_user_id, i.updated_at DESC
        LIMIT 2000;
      `,
      [user.id]
    );
    const joinedFromUsers = (joinedResult.rows || []).map((row) => ({
      id: row.from_user_id,
      username: row.username || null,
      displayName: row.display_name || row.username || 'Account',
      photoDataUrl: row.photo || null,
      lastSeen: row.last_seen || null,
      isOnline: isLastSeenOnline(row.last_seen)
    }));
    const acceptedCount = Object.values(latestStatusByUserId).filter((s) => s === 'accepted').length;
    const rejectedCount = Object.values(latestStatusByUserId).filter((s) => s === 'rejected').length;
    logShareRoute('share.outgoing.result', {
      fromUserId: user.id,
      pendingCount: targetUserIds.length,
      acceptedCount,
      rejectedCount
    });
    return sendJson(res, 200, { ok: true, targetUserIds, latestStatusByUserId, acceptedUsers, joinedFromUsers });
  }

  if (pathname === '/api/training/share/remove' && req.method === 'POST') {
    logShareRoute('share.remove.request.received', { method: req.method, pathname, fromUserId: user.id });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }

    const rawIds = [];
    if (Array.isArray(payload?.targetUserIds)) rawIds.push(...payload.targetUserIds);
    if (payload?.targetUserId != null) rawIds.push(payload.targetUserId);
    const targetUserId = Array.from(new Set(rawIds.map((id) => String(id || '').trim()).filter(isUuid)))[0] || '';
    if (!isUuid(targetUserId)) return sendJson(res, 400, { ok: false, error: 'Invalid account.' });
    if (targetUserId === user.id) return sendJson(res, 400, { ok: false, error: 'Cannot remove your own account.' });

    const latestInviteResult = await db.query(
      `
        SELECT id, status
        FROM app_training_share_invites i
        WHERE from_user_id = $1
          AND to_user_id = $2
        ORDER BY updated_at DESC
        LIMIT 1;
      `,
      [user.id, targetUserId]
    );
    const latestInvite = latestInviteResult.rows?.[0] || null;
    if (!latestInvite) {
      return sendJson(res, 404, { ok: false, error: 'No share relationship found for this account.' });
    }

    const latestStatus = String(latestInvite.status || '').trim().toLowerCase();
    if (latestStatus !== 'accepted') {
      return sendJson(res, 409, { ok: false, error: 'Account has not accepted your workout.' });
    }

    await db.query(
      'UPDATE app_training_share_invites SET status = $1, responded_at = now(), updated_at = now() WHERE id = $2;',
      ['removed', latestInvite.id]
    );
    clearInviteCache(targetUserId);
    await createShareEvent({
      userId: targetUserId,
      actorUserId: user.id,
      counterpartyUserId: targetUserId,
      inviteId: latestInvite.id,
      eventType: 'owner_removed',
      meta: { removedBy: 'owner' }
    });
    emitUserEvent({
      userId: targetUserId,
      eventName: 'Shared Workout Removed',
      eventProps: {
        ownerUserId: user.id,
        inviteId: latestInvite.id
      }
    }).catch(() => {});
    logShareRoute('share.remove.success', { fromUserId: user.id, targetUserId, inviteId: latestInvite.id });
    return sendJson(res, 200, { ok: true, targetUserId, action: 'removed' });
  }

  if (pathname === '/api/training/share/leave' && req.method === 'POST') {
    logShareRoute('share.leave.request.received', { method: req.method, pathname, toUserId: user.id });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
    const ownerUserId = String(payload?.ownerUserId || payload?.fromUserId || '').trim();
    const ownerFilter = isUuid(ownerUserId) ? ownerUserId : null;

    const latestInviteResult = await db.query(
      `
        SELECT id, from_user_id
        FROM app_training_share_invites
        WHERE to_user_id = $1
          AND status = 'accepted'
          AND ($2::uuid IS NULL OR from_user_id = $2::uuid)
        ORDER BY updated_at DESC
        LIMIT 1;
      `,
      [user.id, ownerFilter]
    );
    const latestInvite = latestInviteResult.rows?.[0] || null;
    if (!latestInvite) return sendJson(res, 404, { ok: false, error: 'No accepted shared workout found.' });

    await db.query(
      'UPDATE app_training_share_invites SET status = $1, responded_at = now(), updated_at = now() WHERE id = $2;',
      ['removed_by_recipient', latestInvite.id]
    );
    clearInviteCache(user.id);
    clearInviteCache(latestInvite.from_user_id);
    await createShareEvent({
      userId: latestInvite.from_user_id,
      actorUserId: user.id,
      counterpartyUserId: latestInvite.from_user_id,
      inviteId: latestInvite.id,
      eventType: 'recipient_left',
      meta: { removedBy: 'recipient' }
    });
    emitUserEvent({
      userId: latestInvite.from_user_id,
      eventName: 'Shared Workout Left',
      eventProps: {
        recipientUserId: user.id,
        inviteId: latestInvite.id
      }
    }).catch(() => {});
    logShareRoute('share.leave.success', {
      toUserId: user.id,
      ownerUserId: latestInvite.from_user_id,
      inviteId: latestInvite.id
    });
    return sendJson(res, 200, {
      ok: true,
      action: 'left',
      inviteId: latestInvite.id,
      ownerUserId: latestInvite.from_user_id
    });
  }

  if (pathname === '/api/training/share/events' && req.method === 'GET') {
    const result = await db.query(
      `
        SELECT e.id,
               e.created_at,
               e.event_type,
               e.meta,
               e.actor_user_id,
               u.username AS actor_username,
               u.display_name AS actor_display_name
        FROM app_training_share_events e
        LEFT JOIN app_users u ON u.id = e.actor_user_id
        WHERE e.user_id = $1
          AND e.read_at IS NULL
        ORDER BY e.created_at DESC
        LIMIT 30;
      `,
      [user.id]
    );
    const rows = result.rows || [];
    const ids = rows.map((row) => row.id).filter((id) => isUuid(id));
    if (ids.length) {
      await db.query(
        'UPDATE app_training_share_events SET read_at = now() WHERE id = ANY($1::uuid[]);',
        [ids]
      );
    }
    const events = rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      eventType: String(row.event_type || '').trim().toLowerCase(),
      actorUserId: row.actor_user_id || null,
      actorUsername: row.actor_username || null,
      actorDisplayName: row.actor_display_name || row.actor_username || 'Account',
      meta: row.meta && typeof row.meta === 'object' ? row.meta : {}
    }));
    return sendJson(res, 200, { ok: true, events });
  }

  if (pathname === '/api/training/share/requests' && req.method === 'GET') {
    logShareRoute('share.requests.requested', { method: req.method, pathname, toUserId: user.id });
    const forceFresh = String(url.searchParams.get('fresh') || '').trim() === '1';
    if (!forceFresh) {
      const cached = getInviteCache(user.id);
      if (cached) return sendJson(res, 200, cached);
    }
    try {
      const result = await db.query(
        `
          SELECT i.id,
                 i.created_at,
                 i.plan_snapshot,
                 u.id AS from_user_id,
                 u.username,
                 u.display_name,
                 u.last_seen,
                 p.profile->'profile'->>'photoDataUrl' AS photo
          FROM app_training_share_invites i
          JOIN app_users u ON u.id = i.from_user_id
          LEFT JOIN app_user_profiles p ON p.user_id = u.id
          WHERE i.to_user_id = $1
            AND i.status = 'pending'
          ORDER BY i.created_at DESC
          LIMIT 200;
        `,
        [user.id]
      );

      const invites = (result.rows || []).map((row) => {
        let snapshot = row.plan_snapshot || {};
        if (typeof snapshot === 'string') {
          try {
            snapshot = JSON.parse(snapshot);
          } catch {
            snapshot = {};
          }
        }
        const disciplineRaw = snapshot?.meta?.discipline || snapshot?.discipline || '';
        const daysPerWeek = Number(snapshot?.meta?.daysPerWeek || snapshot?.daysPerWeek || 0) || null;
        return {
          id: row.id,
          createdAt: row.created_at,
          fromUserId: row.from_user_id,
          username: row.username || null,
          displayName: row.display_name || row.username || 'Account',
          photoDataUrl: row.photo || null,
          lastSeen: row.last_seen || null,
          isOnline: isLastSeenOnline(row.last_seen),
          discipline: String(disciplineRaw || '').toLowerCase() || null,
          daysPerWeek
        };
      });

      const payload = { ok: true, invites, requests: invites, unavailable: false };
      logShareRoute('share.requests.result', { toUserId: user.id, inviteCount: invites.length, forceFresh });
      if (!forceFresh) setInviteCache(user.id, payload);
      return sendJson(res, 200, payload);
    } catch (err) {
      if (err instanceof DbUnavailableError || isTransientPgError(err) || isTransientPgError(err?.cause)) {
        logTransientTrainingError(err?.cause || err, 'training-share-requests');
        logShareRoute('share.requests.unavailable', {
          toUserId: user.id,
          forceFresh,
          error: String(err?.message || err || 'DB unavailable')
        });
        return sendTrainingShareRequestsUnavailable(res);
      }
      throw err;
    }
  }

  if (pathname === '/api/training/share/respond' && req.method === 'POST') {
    logShareRoute('share.respond.request.received', { method: req.method, pathname, toUserId: user.id });
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
    const inviteId = String(payload?.inviteId || '').trim();
    const action = String(payload?.action || '').trim().toLowerCase();
    if (!isUuid(inviteId)) return sendJson(res, 400, { ok: false, error: 'Invalid invite.' });
    if (!['accept', 'reject'].includes(action)) return sendJson(res, 400, { ok: false, error: 'Invalid action.' });

    const inviteResult = await db.query(
      `
        SELECT i.id,
               i.from_user_id,
               i.plan_snapshot,
               u.username AS from_username,
               u.display_name AS from_display_name
        FROM app_training_share_invites i
        JOIN app_users u ON u.id = i.from_user_id
        WHERE i.id = $1 AND i.to_user_id = $2 AND i.status = 'pending'
        LIMIT 1;
      `,
      [inviteId, user.id]
    );
    const invite = inviteResult.rows?.[0];
    if (!invite) return sendJson(res, 404, { ok: false, error: 'Invite not found.' });

    if (action === 'reject') {
      await db.query(
        'UPDATE app_training_share_invites SET status = $1, responded_at = now(), updated_at = now() WHERE id = $2;',
        ['rejected', inviteId]
      );
      clearInviteCache(user.id);
      emitUserEvent({
        userId: invite.from_user_id,
        eventName: 'Workout Share Invite Declined',
        eventProps: {
          inviteId,
          respondedByUserId: user.id,
          action: 'rejected'
        }
      }).catch(() => {});
      logShareRoute('share.respond.rejected', { toUserId: user.id, inviteId });
      return sendJson(res, 200, { ok: true, action: 'rejected' });
    }

    let snapshot = invite.plan_snapshot || {};
    if (typeof snapshot === 'string') {
      try {
        snapshot = JSON.parse(snapshot);
      } catch {
        snapshot = {};
      }
    }
    const discipline = normalizeDiscipline(snapshot?.meta?.discipline || snapshot?.discipline || '');
    const daysPerWeek = clampInt(snapshot?.meta?.daysPerWeek || snapshot?.daysPerWeek, 2, 6, null);
    if (!discipline || !daysPerWeek) {
      return sendJson(res, 400, { ok: false, error: 'Shared plan is missing key details.' });
    }

    await db.query('UPDATE app_training_plans SET active = false, updated_at = now() WHERE user_id = $1 AND active = true;', [user.id]);
    const inserted = await db.query(
      `
        INSERT INTO app_training_plans (user_id, active, version, discipline, days_per_week, plan)
        VALUES ($1, true, 1, $2, $3, $4::jsonb)
        RETURNING id;
      `,
      [user.id, discipline, daysPerWeek, JSON.stringify(snapshot)]
    );

    await db.query(
      'UPDATE app_training_share_invites SET status = $1, responded_at = now(), updated_at = now() WHERE id = $2;',
      ['accepted', inviteId]
    );
    clearInviteCache(user.id);
    clearInviteCache(invite.from_user_id);
    emitUserEvent({
      userId: invite.from_user_id,
      eventName: 'Workout Share Invite Accepted',
      eventProps: {
        inviteId,
        respondedByUserId: user.id,
        action: 'accepted'
      }
    }).catch(() => {});
    const welcome = buildShareWelcomePayload({
      snapshot,
      fromDisplayName: invite?.from_display_name,
      fromUsername: invite?.from_username
    });
    logShareRoute('share.respond.accepted', {
      toUserId: user.id,
      inviteId,
      planId: inserted.rows?.[0]?.id || null,
      fromUsername: invite?.from_username || null,
      dayCodes: Array.isArray(welcome?.dayCodes) ? welcome.dayCodes : []
    });

    return sendJson(res, 200, {
      ok: true,
      action: 'accepted',
      planId: inserted.rows?.[0]?.id || null,
      welcome
    });
  }

  if (pathname === '/api/training/reset' && req.method === 'POST') {
    try {
      await db.query('UPDATE app_training_plans SET active = false, updated_at = now() WHERE user_id = $1;', [user.id]);
      await db.query(
        `
          INSERT INTO app_training_profiles (
            user_id, updated_at, onboarding_complete
          )
          VALUES (
            $1, now(), false
          )
          ON CONFLICT (user_id) DO UPDATE SET
            updated_at = now(),
            onboarding_complete = false;
        `,
        [user.id]
      );
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-reset', 'Failed to reset training data');
    }
  }

  if (pathname === '/api/training/checkin' && req.method === 'GET') {
    const day = String(url.searchParams.get('day') || '').trim();
    if (!isDateIso(day)) return sendJson(res, 400, { error: 'Missing day (YYYY-MM-DD)' });
    try {
      const result = await db.query(
        `
          SELECT id, day, data, updated_at
          FROM app_daily_checkins
          WHERE user_id = $1 AND day = $2::date
          LIMIT 1;
        `,
        [user.id, day]
      );
      const row = result.rows?.[0] || null;
      return sendJson(res, 200, { checkin: row });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-checkin-get', 'Failed to load check-in');
    }
  }

  if (pathname === '/api/training/checkin' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const day = String(payload?.day || '').trim();
    if (!isDateIso(day)) return sendJson(res, 400, { error: 'Missing day (YYYY-MM-DD)' });
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const serialized = JSON.stringify(data || {});
    if (serialized.length > 50_000) return sendJson(res, 400, { error: 'Check-in too large' });

    try {
      const result = await db.query(
        `
          INSERT INTO app_daily_checkins (user_id, day, data)
          VALUES ($1, $2::date, $3::jsonb)
          ON CONFLICT (user_id, day) DO UPDATE
          SET data = EXCLUDED.data,
              updated_at = now()
          RETURNING id, day, data, updated_at;
        `,
        [user.id, day, serialized]
      );
      const row = result.rows?.[0] || null;
      emitUserEvent({
        userId: user.id,
        eventName: 'Daily Check-In Saved',
        eventProps: {
          day,
          updatedAt: row?.updated_at || null
        }
      }).catch(() => {});
      return sendJson(res, 200, { ok: true, checkin: row });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-checkin-post', 'Failed to save check-in');
    }
  }

  if (pathname === '/api/training/weighin' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const weightLb = Number(payload?.weightLb);
    const goalMode = normalizeGoalMode(payload?.goalMode);
    try {
      const result = await upsertWeighin({ userId: user.id, weightLb, goalMode });
      if (!result.ok) return sendJson(res, 400, { error: result.error || 'Invalid weigh-in' });
      emitUserEvent({
        userId: user.id,
        eventName: 'Weekly Weigh-In Logged',
        eventProps: {
          weightLb: Number(weightLb),
          goalMode: goalMode || null
        }
      }).catch(() => {});
      return sendJson(res, 200, result);
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-weighin', 'Failed to save weigh-in');
    }
  }

  if (pathname === '/api/training/profile' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    try {
      const profile = await patchProfile(user.id, { profileImage: payload?.profileImage, bio: payload?.bio });
      if (!profile) return sendJson(res, 400, { error: 'Invalid profile update' });
      return sendJson(res, 200, { ok: true, profile });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-profile', 'Failed to update profile');
    }
  }

  if (pathname === '/api/training/progress-photos' && req.method === 'GET') {
    const pose = normalizeProgressPose(url.searchParams.get('pose') || '');
    const limit = clampInt(url.searchParams.get('limit') || 60, 1, 365, 60);
    try {
      const result = await db.query(
        `
          SELECT id, day::text AS day, pose, created_at, updated_at, image_data_url
          FROM app_progress_photos
          WHERE user_id = $1
            AND ($2::text IS NULL OR pose = $2::text)
          ORDER BY day DESC, updated_at DESC
          LIMIT $3;
        `,
        [user.id, pose, limit]
      );
      const photos = (result.rows || []).map((r) => ({
        id: r.id,
        day: String(r.day || '').slice(0, 10),
        pose: String(r.pose || ''),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        imageDataUrl: String(r.image_data_url || '')
      }));
      return sendJson(res, 200, { ok: true, photos });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-progress-photos-get', 'Failed to load progress photos');
    }
  }

  if (pathname === '/api/training/progress-photos' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const day = String(payload?.day || '').trim();
    const pose = normalizeProgressPose(payload?.pose);
    const imageDataUrl = normalizeDataUrlImage(payload?.imageDataUrl);
    if (!isDateIso(day)) return sendJson(res, 400, { error: 'Missing day (YYYY-MM-DD)' });
    if (!pose) return sendJson(res, 400, { error: 'Missing pose (front|side|back)' });
    if (!imageDataUrl) return sendJson(res, 400, { error: 'Missing imageDataUrl' });

    try {
      const result = await db.query(
        `
          INSERT INTO app_progress_photos (user_id, day, pose, image_data_url)
          VALUES ($1, $2::date, $3::text, $4::text)
          ON CONFLICT (user_id, day, pose) DO UPDATE
          SET image_data_url = EXCLUDED.image_data_url,
              updated_at = now()
          RETURNING id, day::text AS day, pose, created_at, updated_at, image_data_url;
        `,
        [user.id, day, pose, imageDataUrl]
      );
      const row = result.rows?.[0] || null;
      emitUserEvent({
        userId: user.id,
        eventName: 'Progress Photo Saved',
        eventProps: {
          day,
          pose
        }
      }).catch(() => {});
      return sendJson(res, 200, {
        ok: true,
        photo: row ? {
          id: row.id,
          day: String(row.day || '').slice(0, 10),
          pose: String(row.pose || ''),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          imageDataUrl: String(row.image_data_url || '')
        } : null
      });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-progress-photos-post', 'Failed to save progress photo');
    }
  }

  if (pathname === '/api/training/onboarding' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const onboardingRouteStartedAt = Date.now();
    const onboardingRequestId = getTrainingRequestId(req);
    const onboardingPayloadSummary = summarizePlanBuildPayload(payload);
    logTrainingRouteLifecycle('training_build_backend_route_started', {
      requestId: onboardingRequestId,
      endpoint: '/api/training/onboarding',
      routeKind: 'signed_in_onboarding',
      dayCount: onboardingPayloadSummary?.daysPerWeek || null,
      priorityGroups: Array.isArray(onboardingPayloadSummary?.priorityGroups) ? onboardingPayloadSummary.priorityGroups : [],
      backendElapsedMs: 0
    });
    const onboardingDebugRaw = matchesAbsGlutesLegsDebugCombo(payload, { rawClassic: true });
    if (onboardingDebugRaw) {
      logAbsGlutesLegsDebug('route', 'onboarding-payload-received', {
        elapsedMs: 0,
        payload
      });
    }

    if (isOblueprintRequest(payload)) {
      if (matchesAbsGlutesLegsDebugCombo(payload)) {
        logAbsGlutesLegsDebug('route', 'onboarding-oblueprint-worker-dispatch', {
          elapsedMs: Date.now() - onboardingRouteStartedAt,
          workerBacked: true,
          effectiveTimeoutMs: TRAINING_PLAN_BUILD_TIMEOUT_MS,
          payload
        });
      }
      const built = await runTrainingPlanBuildWithTimeout(payload, { fastBuild: true }, {
        routeName: 'onboarding',
        requestId: onboardingRequestId,
        endpoint: '/api/training/onboarding',
        routeKind: 'signed_in_onboarding'
      });
      if (built?.error) {
        logTrainingRouteLifecycle('training_build_backend_response_sent', {
          requestId: onboardingRequestId,
          endpoint: '/api/training/onboarding',
          routeKind: 'signed_in_onboarding',
          dayCount: onboardingPayloadSummary?.daysPerWeek || null,
          priorityGroups: Array.isArray(onboardingPayloadSummary?.priorityGroups) ? onboardingPayloadSummary.priorityGroups : [],
          backendElapsedMs: Date.now() - onboardingRouteStartedAt,
          responseStatus: 400,
          responseKind: 'structured_failure',
          slowestBuilderStage: built?.error?.lastBuilderStage || built?.error?.lastHeartbeatStage || null
        });
        if (matchesAbsGlutesLegsDebugCombo(payload)) {
          logAbsGlutesLegsDebug('route', 'onboarding-build-failed', {
            elapsedMs: Date.now() - onboardingRouteStartedAt,
            source: 'builder',
            error: normalizePlanBuildError(built.error, {
              functionName: 'buildOblueprintPlanWithFallback'
            })
          });
        }
        return sendJson(res, 400, logPlanBuildFailure('onboarding', built.error, {
          functionName: 'buildOblueprintPlanWithFallback'
        }));
      }
      const planBuilt = built.plan;
      const usedPayload = built.usedPayload || payload;
      if (String(planBuilt?.meta?.discipline || '').toLowerCase() === 'bodybuilding') {
        const validation = validateBodybuildingPlanContract(planBuilt);
        if (!validation.ok) {
          return sendJson(res, 400, logPlanBuildFailure('onboarding', validation.error, {
            functionName: 'assertBodybuildingPlanByEngine'
          }));
        }
      }
      const discipline = resolveOblueprintDiscipline(usedPayload?.trainingFeel);
      const daysPerWeek = Number(planBuilt?.meta?.daysPerWeek) || clampInt(usedPayload?.daysPerWeek, 2, 6, null);
      if (!discipline || !daysPerWeek) return sendJson(res, 400, { error: 'INVALID_INPUT', field: 'trainingFeel', reason: 'Unsupported or invalid onboarding payload' });
      try {
        if (matchesAbsGlutesLegsDebugCombo(usedPayload || payload)) {
          logAbsGlutesLegsDebug('route', 'onboarding-save-start', {
            elapsedMs: Date.now() - onboardingRouteStartedAt,
            source: 'save',
            discipline,
            daysPerWeek
          });
        }
        await upsertProfile(user.id, {
          discipline,
          experience: usedPayload?.experience || '6-24m',
          daysPerWeek,
          strength: {},
          preferredDays: usedPayload?.preferredDays,
          equipmentAccess: {},
          profile: { firstName: usedPayload?.name || '' }
        });
        await syncTrainingIntakeProfile(user.id, usedPayload || payload);
        const plan = await createNewOblueprintPlan(user.id, { discipline, daysPerWeek, plan: planBuilt });
        if (matchesAbsGlutesLegsDebugCombo(usedPayload || payload)) {
          logAbsGlutesLegsDebug('route', 'onboarding-save-succeeded', {
            elapsedMs: Date.now() - onboardingRouteStartedAt,
            source: 'save',
            planId: plan?.id || null
          });
        }
        logTrainingRouteLifecycle('training_build_backend_response_sent', {
          requestId: onboardingRequestId,
          endpoint: '/api/training/onboarding',
          routeKind: 'signed_in_onboarding',
          dayCount: onboardingPayloadSummary?.daysPerWeek || null,
          priorityGroups: Array.isArray(onboardingPayloadSummary?.priorityGroups) ? onboardingPayloadSummary.priorityGroups : [],
          backendElapsedMs: Date.now() - onboardingRouteStartedAt,
          responseStatus: 200,
          responseKind: 'success',
          slowestBuilderStage: built?.diagnostics?.slowestBuilderStage || null,
          slowestBuilderStageElapsedMs: built?.diagnostics?.slowestBuilderStageElapsedMs ?? null,
          planSaved: true,
          planId: plan?.id || null
        });
        return sendJson(res, 200, { ok: true, plan, logs: [] });
      } catch (err) {
        if (matchesAbsGlutesLegsDebugCombo(usedPayload || payload)) {
          logAbsGlutesLegsDebug('route', 'onboarding-save-failed', {
            elapsedMs: Date.now() - onboardingRouteStartedAt,
            source: 'save',
            error: normalizePlanBuildError(err, {
              functionName: 'createNewOblueprintPlan',
              stage: 'save',
              failedStage: 'save'
            })
          });
        }
        return handleTrainingDbFailure(res, err, 'training-onboarding-oblueprint', 'Failed to save onboarding');
      }
    }

    // Graceful fallback: if classic bodybuilding payload is incomplete, coerce it
    // into Oblueprint format instead of failing onboarding with 400.
    if (String(payload?.discipline || '').trim().toLowerCase() === 'bodybuilding') {
      const coerced = coerceClassicBodybuildingToOblueprintPayload(payload);
      if (onboardingDebugRaw || matchesAbsGlutesLegsDebugCombo(coerced)) {
        logAbsGlutesLegsDebug('route', 'onboarding-bodybuilding-worker-dispatch', {
          elapsedMs: Date.now() - onboardingRouteStartedAt,
          workerBacked: true,
          effectiveTimeoutMs: TRAINING_PLAN_BUILD_TIMEOUT_MS,
          frontendPayload: payload,
          normalizedPayload: coerced
        });
      }
      const built = await runTrainingPlanBuildWithTimeout(coerced, { fastBuild: true }, {
        routeName: 'onboarding',
        requestId: onboardingRequestId,
        endpoint: '/api/training/onboarding',
        routeKind: 'signed_in_onboarding'
      });
      if (!built?.error) {
        const planBuilt = built.plan;
        const validation = validateBodybuildingPlanContract(planBuilt);
        if (!validation.ok) {
          return sendJson(res, 400, logPlanBuildFailure('onboarding', validation.error, {
            functionName: 'assertBodybuildingPlanByEngine'
          }));
        }
        try {
          const daysPerWeek = Number(planBuilt?.meta?.daysPerWeek) || clampInt(coerced?.daysPerWeek, 2, 6, 4);
          if (onboardingDebugRaw || matchesAbsGlutesLegsDebugCombo(coerced)) {
            logAbsGlutesLegsDebug('route', 'onboarding-save-start', {
              elapsedMs: Date.now() - onboardingRouteStartedAt,
              source: 'save',
              discipline: 'bodybuilding',
              daysPerWeek
            });
          }
          await upsertProfile(user.id, {
            discipline: 'bodybuilding',
            experience: coerced?.experience || '6-24m',
            daysPerWeek,
            strength: {},
            preferredDays: coerced?.preferredDays,
            equipmentAccess: {},
            profile: { firstName: payload?.name || '' }
          });
          await syncTrainingIntakeProfile(user.id, coerced);
          const plan = await createNewOblueprintPlan(user.id, { discipline: 'bodybuilding', daysPerWeek, plan: planBuilt });
          if (onboardingDebugRaw || matchesAbsGlutesLegsDebugCombo(coerced)) {
            logAbsGlutesLegsDebug('route', 'onboarding-save-succeeded', {
              elapsedMs: Date.now() - onboardingRouteStartedAt,
              source: 'save',
              planId: plan?.id || null
            });
          }
          logTrainingRouteLifecycle('training_build_backend_response_sent', {
            requestId: onboardingRequestId,
            endpoint: '/api/training/onboarding',
            routeKind: 'signed_in_onboarding',
            dayCount: onboardingPayloadSummary?.daysPerWeek || null,
            priorityGroups: Array.isArray(onboardingPayloadSummary?.priorityGroups) ? onboardingPayloadSummary.priorityGroups : [],
            backendElapsedMs: Date.now() - onboardingRouteStartedAt,
            responseStatus: 200,
            responseKind: 'success',
            slowestBuilderStage: built?.diagnostics?.slowestBuilderStage || null,
            slowestBuilderStageElapsedMs: built?.diagnostics?.slowestBuilderStageElapsedMs ?? null,
            planSaved: true,
            planId: plan?.id || null
          });
          return sendJson(res, 200, { ok: true, plan, logs: [] });
        } catch (err) {
          if (onboardingDebugRaw || matchesAbsGlutesLegsDebugCombo(coerced)) {
            logAbsGlutesLegsDebug('route', 'onboarding-save-failed', {
              elapsedMs: Date.now() - onboardingRouteStartedAt,
              source: 'save',
              error: normalizePlanBuildError(err, {
                functionName: 'createNewOblueprintPlan',
                stage: 'save',
                failedStage: 'save'
              })
            });
          }
          return handleTrainingDbFailure(res, err, 'training-onboarding-oblueprint-coerced', 'Failed to save onboarding');
        }
      }
      logTrainingRouteLifecycle('training_build_backend_response_sent', {
        requestId: onboardingRequestId,
        endpoint: '/api/training/onboarding',
        routeKind: 'signed_in_onboarding',
        dayCount: onboardingPayloadSummary?.daysPerWeek || null,
        priorityGroups: Array.isArray(onboardingPayloadSummary?.priorityGroups) ? onboardingPayloadSummary.priorityGroups : [],
        backendElapsedMs: Date.now() - onboardingRouteStartedAt,
        responseStatus: 400,
        responseKind: 'structured_failure',
        slowestBuilderStage: built?.error?.lastBuilderStage || built?.error?.lastHeartbeatStage || built?.diagnostics?.slowestBuilderStage || null
      });
      if (onboardingDebugRaw || matchesAbsGlutesLegsDebugCombo(coerced)) {
        logAbsGlutesLegsDebug('route', 'onboarding-build-failed', {
          elapsedMs: Date.now() - onboardingRouteStartedAt,
          source: 'builder',
          error: normalizePlanBuildError(built?.error || { message: 'Failed to build plan' }, {
            functionName: 'buildOblueprintPlanWithFallback'
          })
        });
      }
      return sendJson(res, 400, logPlanBuildFailure('onboarding', built?.error || { message: 'Failed to build plan' }, {
        functionName: 'buildOblueprintPlanWithFallback'
      }));
    }

    const validated = validatePlanInputs(payload);
    if (!validated.ok) return sendJson(res, 400, { error: validated.error });

    try {
      await upsertProfile(user.id, payload);
      await syncTrainingIntakeProfile(user.id, payload);
      const plan = await createNewPlan(user.id, {
        discipline: validated.discipline,
        daysPerWeek: validated.daysPerWeek,
        experience: validated.experience,
        strength: validated.strength,
        equipmentAccess: payload?.equipmentAccess || null
      });
      return sendJson(res, 200, { ok: true, plan, logs: [] });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-onboarding', 'Failed to save onboarding');
    }
  }

  if (pathname === '/api/training/custom-plan' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }

    const dbRows = readWorkoutDatabase();
    const dbRowsById = new Map(
      (Array.isArray(dbRows) ? dbRows : []).map((row) => [String(row?.id || '').trim().toLowerCase(), row])
    );
    const templateDays = normalizeCustomPlanDays(payload?.days, dbRowsById);
    const daysPerWeek = clampInt(templateDays.length, 1, 7, null);
    if (!daysPerWeek) {
      return sendJson(res, 400, { ok: false, error: 'Select between 1 and 7 workout days.' });
    }
    if (templateDays.some((day) => !Array.isArray(day?.exercises) || !day.exercises.length)) {
      return sendJson(res, 400, { ok: false, error: 'Each selected day needs at least one exercise.' });
    }

    try {
      const profile = await getProfile(user.id);
      const profileDiscipline = normalizeDiscipline(profile?.discipline) || 'powerbuilding';
      const profileExperience = normalizeExperience(profile?.experience || '6-24m');
      const preferredWeekdays = templateDays.map((day) => day.weekday);
      const planObj = buildCustomWorkoutPlan({
        discipline: profileDiscipline,
        experience: profileExperience,
        templateDays,
        preferredWeekdays
      });

      await upsertProfile(user.id, {
        discipline: profileDiscipline,
        experience: profileExperience,
        daysPerWeek,
        strength: profile?.strength || {},
        equipmentAccess: profile?.equipment_access || {},
        profile: { firstName: profile?.first_name || '' }
      });

      const plan = await createNewOblueprintPlan(user.id, {
        discipline: profileDiscipline,
        daysPerWeek,
        plan: planObj
      });
      if (!plan) return sendJson(res, 500, { ok: false, error: 'Could not save plan.' });

      try {
        queuePlanMediaEnrichment({
          planId: plan.id,
          planObj: plan.plan && typeof plan.plan === 'object' ? plan.plan : JSON.parse(String(plan.plan || '{}')),
          equipmentAccess: profile?.equipment_access || null
        });
      } catch {
        // ignore background enrichment failures
      }

      return sendJson(res, 200, { ok: true, plan });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-custom-plan', 'Failed to save custom plan');
    }
  }

  if (pathname === '/api/training/logs' && req.method === 'GET') {
    const planId = String(url.searchParams.get('planId') || '').trim();
    const includeAll = String(url.searchParams.get('includeAll') || '').trim() === '1';
    if (!planId && !includeAll) return sendJson(res, 400, { error: 'Missing planId' });
    try {
      const logs = planId ? await listWorkoutLogs({ userId: user.id, planId }) : [];
      const allLogs = includeAll ? await listWorkoutLogs({ userId: user.id }) : null;
      return sendJson(res, 200, includeAll ? { logs, allLogs } : { logs });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-logs', 'Failed to load logs');
    }
  }

  if (pathname === '/api/training/log-draft' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const planId = safeText(payload?.planId, 80);
    const weekIndex = clampInt(payload?.weekIndex, 1, 52, null);
    const dayIndex = clampInt(payload?.dayIndex, 1, 7, null);
    const readiness = clampInt(payload?.readiness, 1, 10, null);
    if (!planId || !weekIndex || !dayIndex) return sendJson(res, 400, { error: 'Missing plan/week/day' });

    try {
      await upsertWorkoutLog({
        userId: user.id,
        planId,
        weekIndex,
        dayIndex,
        performedAt: payload?.performedAt || null,
        entries: payload?.entries || [],
        notes: payload?.notes || '',
        readiness,
        durationMs: payload?.durationMs,
        timerStartedAt: payload?.timerStartedAt || null,
        timerEndedAt: payload?.timerEndedAt || null
      });
      const liftHistory = await upsertLiftHistoryEntries({
        userId: user.id,
        performedAt: payload?.performedAt || null,
        entries: payload?.entries || [],
        source: 'draft'
      });
      return sendJson(res, 200, {
        ok: true,
        liftHistory: buildLiftHistoryPayloadMap(liftHistory)
      });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-log-draft', 'Failed to save workout draft');
    }
  }

  if (pathname === '/api/training/log' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const planId = safeText(payload?.planId, 80);
    const weekIndex = clampInt(payload?.weekIndex, 1, 52, null);
    const dayIndex = clampInt(payload?.dayIndex, 1, 7, null);
    const readiness = clampInt(payload?.readiness, 1, 10, null);
    if (!planId || !weekIndex || !dayIndex) return sendJson(res, 400, { error: 'Missing plan/week/day' });

    try {
      await upsertWorkoutLog({
        userId: user.id,
        planId,
        weekIndex,
        dayIndex,
        performedAt: payload?.performedAt || null,
        entries: payload?.entries || [],
        notes: payload?.notes || '',
        readiness,
        durationMs: payload?.durationMs,
        timerStartedAt: payload?.timerStartedAt || null,
        timerEndedAt: payload?.timerEndedAt || null
      });
      const liftHistory = await upsertLiftHistoryEntries({
        userId: user.id,
        performedAt: payload?.performedAt || null,
        entries: payload?.entries || [],
        source: 'log'
      });
      const updatedPlan = await applyProgressionFromLog({
        userId: user.id,
        planId,
        logPayload: {
          weekIndex,
          dayIndex,
          entries: payload?.entries || [],
          notes: payload?.notes || '',
          readiness
        }
      });
      emitUserEvent({
        userId: user.id,
        eventName: 'Workout Logged',
        eventProps: {
          planId,
          weekIndex,
          dayIndex
        }
      }).catch(() => {});
      return sendJson(res, 200, {
        ok: true,
        plan: updatedPlan,
        liftHistory: buildLiftHistoryPayloadMap(liftHistory)
      });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-log', 'Failed to save log');
    }
  }

  if (pathname === '/api/training/event' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const eventType = safeText(payload?.eventType, 80);
    const data = payload?.payload && typeof payload.payload === 'object' ? payload.payload : {};
    if (!eventType) return sendJson(res, 400, { error: 'Missing eventType' });
    try {
      await db.query(
        `INSERT INTO app_training_events (user_id, event_type, payload) VALUES ($1, $2, $3::jsonb);`,
        [user.id, eventType, JSON.stringify(data)]
      );
      if (eventType === 'pain_report') {
        const severity = Number(data?.severity);
        const high = Number.isFinite(severity) && severity >= 7;
        emitUserEvent({
          userId: user.id,
          eventName: high ? 'High Pain Report Submitted' : 'Pain Report Submitted',
          eventProps: {
            severity: Number.isFinite(severity) ? severity : null,
            location: data?.location || '',
            action: data?.action || ''
          }
        }).catch(() => {});
      }
      if (eventType === 'pain_followup') {
        emitUserEvent({
          userId: user.id,
          eventName: 'Pain Follow-Up Submitted',
          eventProps: {
            status: data?.status || ''
          }
        }).catch(() => {});
      }
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-event', 'Failed to log event');
    }
  }

  if (pathname === '/api/training/override' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const planId = safeText(payload?.planId, 80);
    const weekIndex = clampInt(payload?.weekIndex, 1, 52, null);
    const dayIndex = clampInt(payload?.dayIndex, 1, 7, null);
    const exerciseId = safeText(payload?.exerciseId, 120);
    const slotId = safeText(payload?.slotId, 120);
    const oldExerciseId = safeText(payload?.oldExerciseId, 120);
    const nextExerciseId = safeText(payload?.newExerciseId, 120);
    const nextExerciseName = safeText(payload?.newExerciseName, 180);
    const projected = Number(payload?.projected);
    if (!planId || !weekIndex || !dayIndex) return sendJson(res, 400, { error: 'Missing override params' });

    try {
      let plan = null;
      if (nextExerciseId) {
        plan = await patchExerciseOverride({
          userId: user.id,
          planId,
          weekIndex,
          dayIndex,
          slotId,
          exerciseId,
          oldExerciseId,
          nextExerciseId,
          nextExerciseName
        });
        if (!plan) {
          return sendJson(res, 200, { ok: true, persisted: false, localOnly: true });
        }
      } else {
        if (!exerciseId) return sendJson(res, 400, { error: 'Missing override params' });
        if (!Number.isFinite(projected) || projected <= 0) return sendJson(res, 400, { error: 'Invalid projected value' });
        plan = await patchProjectedWeight({ userId: user.id, planId, weekIndex, dayIndex, exerciseId, nextProjected: projected });
      }
      if (!plan) return sendJson(res, 404, { error: 'Plan or exercise not found' });
      return sendJson(res, 200, { ok: true, plan });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-override', 'Failed to update plan');
    }
  }

    return sendJson(res, 404, { error: 'Unknown training route' });
  } catch (err) {
    if (err instanceof DbUnavailableError || isTransientPgError(err) || isTransientPgError(err?.cause)) {
      logTransientTrainingError(err?.cause || err, `trainingRoutes:${req.method}:${pathname}`);
      return sendDbUnavailable(res);
    }
    throw err;
  }
}

trainingRoutes._private = {
  buildOblueprintPlanWithFallback,
  coerceClassicBodybuildingToOblueprintPayload,
  assertBodybuildingPlanByEngine,
  validateBodybuildingPlanContract,
  getCanonicalMovementFamily: routeGetCanonicalMovementFamily,
  simulateTargetedCanonicalReplacement: routeSimulateTargetedCanonicalReplacement,
  simulateCanonicalKeepIndexes: routeSimulateCanonicalKeepIndexes,
  getBodybuildingValidationContractTable: () => BODYBUILDING_VALIDATION_CONTRACT.map((entry) => ({
    id: entry.id,
    currentBehavior: entry.currentBehavior,
    shouldBehavior: entry.shouldBehavior,
    repairBeforeAssert: entry.repairBeforeAssert
  })),
  runTrainingPlanBuildWithTimeout,
  matchesAbsGlutesLegsDebugCombo
};

module.exports = trainingRoutes;
