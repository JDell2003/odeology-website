const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('./db');
const { DbUnavailableError, isTransientPgError } = require('./dbErrors');
const { generatePlan, applyLogAdjustments, normalizeExperience, assertBodybuildingPlanIntegrity } = require('./trainingEngine');
const { buildOblueprintPlan } = require('../generator/trainingEngine.oblueprint');
const { resolveWorkoutExercises } = require('./exerciseResolver');
const { invalidateDatasetCache } = require('./exerciseCatalog');
const { emitUserEvent } = require('./emailEvents');
const enrichPlanWithExerciseMedia = async () => {};

const MAX_BODY_BYTES = Math.max(50_000, Number(process.env.TRAINING_MAX_BODY_BYTES || 1_500_000));
const TRAINING_IMPORT_OCR_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'training_import_ocr.py');
const TRAINING_IMPORT_OCR_TIMEOUT_MS = Math.max(4_000, Number(process.env.TRAINING_IMPORT_OCR_TIMEOUT_MS || 8_000));
const TRAINING_IMPORT_OCR_MAX_IMAGE_BYTES = Math.max(200_000, Number(process.env.TRAINING_IMPORT_OCR_MAX_IMAGE_BYTES || 4_000_000));
const TRAINING_IMPORT_OCR_PYTHON_CMD = String(
  process.env.TRAINING_IMPORT_OCR_PYTHON
  || (process.platform === 'win32' ? 'python' : 'python3')
).trim();
const TRAINING_IMPORT_OCRSPACE_ENDPOINT = 'https://api.ocr.space/parse/image';
const TRAINING_IMPORT_OCRSPACE_API_KEY = String(process.env.TRAINING_IMPORT_OCRSPACE_API_KEY || process.env.OCRSPACE_API_KEY || 'helloworld').trim();

let schemaEnsured = false;
let schemaEnsurePromise = null;
const SCHEMA_RETRY_DELAYS_MS = [200, 600, 1400];
const INVITE_CACHE_TTL_MS = 20000;
const trainingInviteCache = new Map();
const ONLINE_WINDOW_MS = Math.max(30_000, Number(process.env.ONLINE_WINDOW_MS || 180_000));
const SHARE_ROUTE_DEBUG = String(process.env.TRAINING_SHARE_DEBUG || '').trim() === '1'
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
  for (const x of src) {
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

function buildTrainingWeekdays(daysPerWeek, unavailableDays) {
  const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
  if (!n) return [];
  const unavailable = new Set(normalizeWeekdayIndexList(unavailableDays));
  const available = [1, 2, 3, 4, 5, 6, 0].filter((d) => !unavailable.has(d));
  if (available.length < n) return [];

  const chosen = [];
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
  const weekdays = daysPerWeek ? buildTrainingWeekdays(daysPerWeek, unavailableDays) : [];
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

const OWNER_USERNAMES = csvToSet(process.env.OWNER_USERNAMES || 'odeology,odeology_,odeology_owner,jason');
const OWNER_EMAILS = csvToSet(process.env.OWNER_EMAILS || '');
const OWNER_EMAIL_DOMAIN = String(process.env.OWNER_EMAIL_DOMAIN || 'odeology.com').trim().toLowerCase();
const OWNER_DISPLAY_NAMES = csvToSet(process.env.OWNER_DISPLAY_NAMES || 'odeology,odeology_');
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
    .replace(/â€“|â€”|âˆ’/g, '-')
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
    shoulders: 'Shoulders',
    shoulder: 'Shoulders',
    arms: 'Arms',
    abs: 'Core',
    core: 'Core'
  };
  const painAreaAllowed = new Set(['Back', 'Knee', 'Hip', 'Shoulder', 'Elbow', 'Wrist']);
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
      recency: raw?.recency === 'Recent' || raw?.recency === 'Old' ? raw.recency : ''
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

function buildOblueprintPlanWithFallback(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const seedBase = Number(src?.planSeed);
  const nextPayload = {
    ...src,
    planSeed: Number.isFinite(seedBase) ? Math.floor(seedBase) : Date.now()
  };
  const out = buildOblueprintPlan(nextPayload);
  if (out?.error) return { error: out };
  const repaired = repairOblueprintBodybuildingPlan(out);
  const stabilized = repairOblueprintBodybuildingPlan(repaired);
  return { plan: stabilized, usedPayload: nextPayload };
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

function coerceClassicBodybuildingToOblueprintPayload(payload) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const discipline = String(src?.discipline || '').trim().toLowerCase();
  const trainingFeel = discipline === 'powerbuilding' ? 'Powerbuilding' : 'Aesthetic bodybuilding';
  return normalizeOblueprintPayload({
    trainingFeel,
    primaryGoal: String(src?.phase || '').toLowerCase() === 'cut' ? 'Cut fat' : 'Build size',
    timeline: '8 weeks',
    focus: 'Aesthetic',
    experience: src?.experience,
    location: 'Commercial gym',
    trainingStyle: 'Balanced mix',
    outputStyle: 'RPE/RIR cues',
    closeToFailure: 'No',
    daysPerWeek: src?.daysPerWeek,
    sessionLengthMin: src?.timePerSession || src?.sessionLength || '60',
    priorityGroups: src?.emphasis || src?.priorityGroups || [],
    movementsToAvoid: [],
    preferredDays: [],
    equipmentAccess: equipmentAccessToList(src?.equipmentAccess),
    painAreas: [],
    painProfilesByArea: {},
    sleepHours: 7,
    activityLevel: 'Active',
    stress: 'Medium',
    planSeed: Number(src?.planSeed) || Date.now()
  }, { relax: false });
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
    { name: 'Dumbbell Rear Lunge', pattern: 'Lunge', style: 'Compound', primary: 'Legs' }
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
  ]
};

function routeNormName(v) {
  return String(v || '').trim().toLowerCase();
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
  const allowed = /(bench press|dumbbell bench press|incline dumbbell press|incline bench press|machine chest press|chest press)/.test(n);
  const blocked = /(close[-\s]*grip|wide[-\s]*grip|decline|guillotine|behind[-\s]*neck|to\s+skull\s+crusher|landmine|jammer)/.test(n);
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
      const fam = isolationFamilyForName(out[i]?.name);
      if (!fam) continue;
      if (!seenFamilies.has(fam)) {
        seenFamilies.add(fam);
        continue;
      }
      const candidateKeys = [];
      if (fam === 'lateral_raise') candidateKeys.push('rear_iso', 'triceps_iso', 'core_iso');
      else if (fam === 'rear_delt') candidateKeys.push('lateral_iso', 'triceps_iso', 'core_iso');
      else if (fam === 'chest_fly') candidateKeys.push('triceps_iso', 'lateral_iso', 'core_iso');
      else if (fam === 'curl') {
        if (dayType === 'deltsarms') candidateKeys.push('triceps_iso', 'rear_iso', 'core_iso');
        else if (dayType === 'pull') candidateKeys.push('rear_iso', 'row_main', 'core_iso');
        else candidateKeys.push('rear_iso', 'core_iso');
      } else if (fam === 'triceps_extension') {
        if (dayType === 'deltsarms') candidateKeys.push('biceps_iso', 'rear_iso', 'core_iso');
        else if (dayType === 'push') candidateKeys.push('lateral_iso', 'chest_iso', 'core_iso');
        else if (dayType === 'upper') candidateKeys.push('chest_secondary_press', 'lateral_iso', 'core_iso');
        else candidateKeys.push('lateral_iso', 'core_iso');
      }
      candidateKeys.push(routeDefaultReplacementKey(dayType, i), 'core_iso');
      let replaced = false;
      for (const key of candidateKeys) {
        const next = routeApplyReplacement(out[i], routePickReplacement(key, out));
        const nextFam = routeIsIsolation(next) ? isolationFamilyForName(next?.name) : null;
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
    const rearDeltDayCap = shouldersPriority ? 3 : 2;
    for (const day of week?.days || []) {
      const dayType = String(day?.dayType || '').toLowerCase();
      let list = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
      if (!list.length) continue;

      for (let i = 0; i < list.length; i += 1) {
        const norm = routeNormName(list[i]?.name);
        if (ROUTE_BANNED_NAME_PATTERNS.some((rx) => rx.test(norm)) || routeIsNoveltyName(norm)) {
          const fallback = dayType === 'pull'
            ? routePickReplacement(i <= 1 ? (i === 0 ? 'vertical_pull' : 'row_main') : 'biceps_iso', list)
            : dayType === 'legs' || dayType === 'lower'
              ? routePickReplacement(i === 0 ? 'squat_main' : i === 1 ? 'hinge_lengthened' : 'leg_iso', list)
              : dayType === 'deltsarms'
                ? routePickReplacement(i === 0 ? 'shoulder_main' : i === 1 ? 'lateral_iso' : i === 2 ? 'rear_iso' : i === 3 ? 'biceps_iso' : 'triceps_iso', list)
                : routePickReplacement(i <= 1 ? (i === 0 ? 'chest_main' : 'shoulder_main') : 'chest_iso', list);
          list[i] = routeApplyReplacement(list[i], fallback);
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
        const pressIdx = list.map((ex, idx) => (routeIsHorizontalPressMain(ex) ? idx : -1)).filter((x) => x >= 0);
        const benchLike = pressIdx.filter((idx) => routeIsBenchLikePressName(list[idx]?.name));
        if (benchLike.length > 1) {
          for (let i = 1; i < benchLike.length; i += 1) {
            const idx = benchLike[i];
            list[idx] = routeApplyReplacement(list[idx], routePickReplacement('chest_iso', list));
          }
        }
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

      for (let i = 0; i < list.length; i += 1) {
        list[i].sets = Math.max(1, Math.min(4, Number(list[i]?.sets) || 2));
      }
      day.exercises = routeOrganizeDay(dayType, list);
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
        d.exercises = routeOrganizeDay(dType, routeDedupeIsolationFamilies(dType, diversified));
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
      routeNormalizeSetsByRole(dType, exs);
      for (let i = 0; i < exs.length; i += 1) {
        exs[i].sets = Math.max(1, Math.min(4, Number(exs[i]?.sets) || 2));
      }
      d.exercises = routeOrganizeDay(dType, exs);
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
        targetDay.exercises = routeOrganizeDay(dType, exs);
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
        targetDay.exercises = routeOrganizeDay(dType, exs);
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

function assertOblueprintBodybuildingIntegrity(planObj) {
  const priorityGroups = Array.isArray(planObj?.meta?.priorityGroups) ? planObj.meta.priorityGroups.map((x) => String(x || '').toLowerCase()) : [];
  const shouldersPriority = priorityGroups.includes('shoulders');
  for (const week of planObj?.weeks || []) {
    const rearDeltDays = new Set();
    let heavyDeadliftCount = 0;
    let weeklyLengthenedHingeCount = 0;
    let weeklyRdlCount = 0;
    let hasLowerDay = false;
    for (const day of week?.days || []) {
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
      const dayExerciseNames = (day?.exercises || []).map((x) => String(x?.name || x?.displayName || x?.movementName || ''));
      const firstExercise = day?.exercises?.[0] || null;
      for (const ex of day?.exercises || []) {
        const sets = Number(ex?.sets) || 0;
        if (sets > 4) {
          throw new Error(`Set cap violated: ${ex?.name || ex?.displayName || 'exercise'} (${sets} > 4)`);
        }
        const name = String(ex?.name || ex?.displayName || ex?.movementName || '').toLowerCase();
        if (ROUTE_BANNED_NAME_PATTERNS.some((rx) => rx.test(name))) {
          throw new Error(`Banned exercise detected: ${ex?.name || ex?.displayName || 'exercise'}`);
        }
        if (routeIsNoveltyName(name)) {
          throw new Error(`Novelty exercise detected: ${ex?.name || ex?.displayName || 'exercise'}`);
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
            throw new Error(`Duplicate isolation family in a day: ${ex?.name || ex?.displayName || 'exercise'}`);
          }
          isoFamilies.add(fam);
          if (fam === 'chest_fly') chestFlyCount += 1;
          if (fam === 'rear_delt') dayRearDeltCount += 1;
        }
        if (style === 'compound') {
          if (/\bbench press\b/.test(name)) benchPressCompoundCount += 1;
          if (/(deadlift|romanian deadlift|\brdl\b|stiff[-\s]*leg)/.test(name) && !/(hip thrust|glute bridge)/.test(name)) {
            heavyDeadliftCount += 1;
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
          if (/calf/.test(name)) hasCalves = true;
          if (routeIsCoreName(name)) {
            hasAbs = true;
            coreCount += 1;
          }
        }
      }
      if (dayRearDeltCount > 0) rearDeltDays.add(dayKey);
      if (chestFlyCount > 1) {
        throw new Error(`Too many fly variations in one day (${chestFlyCount}).`);
      }
      if (benchPressCompoundCount > 1) {
        throw new Error(`Too many bench press compounds in one day (${benchPressCompoundCount}).`);
      }
      if ((dayType === 'push' || dayType === 'upper') && !hasPushMain) {
        throw new Error('Push/Upper day missing staple press compound.');
      }
      if (dayType === 'push' && (!routeIsHorizontalPressMain(firstExercise) || !routeIsStapleChestMainName(firstExercise?.name))) {
        throw new Error('Push day must start with a staple chest press.');
      }
      if (dayType === 'upper' && (!routeIsHorizontalPressMain(firstExercise) || !routeIsStapleChestMainName(firstExercise?.name))) {
        throw new Error('Upper day must start with a staple chest press.');
      }
      if (dayType === 'push' && !hasShoulderPress) {
        throw new Error('Push day missing shoulder press compound.');
      }
      if (dayType === 'push' && !hasTricepsIso) {
        throw new Error('Push day missing triceps isolation.');
      }
      if (dayType === 'pull' && (!hasRow || !hasVerticalPull)) {
        throw new Error('Pull day must include both a row and a vertical pull.');
      }
      if (dayType === 'pull' && !routeIsVerticalPullName(dayExerciseNames[0]) && !routeIsVerticalPullName(dayExerciseNames[1])) {
        throw new Error('Pull day must lead with a vertical pull.');
      }
      if (dayType === 'pull' && !hasBicepsIso) {
        throw new Error('Pull day missing biceps isolation.');
      }
      if (dayType === 'pull' && /(lateral raise|side lateral)/.test((day?.exercises || []).map((x) => String(x?.name || '').toLowerCase()).join(' | '))) {
        throw new Error('Pull day must not include lateral raises.');
      }
      if ((dayType === 'legs' || dayType === 'lower') && !routeIsStapleSquatName(firstExercise?.name)) {
        throw new Error('Leg day must start with a staple squat/press pattern.');
      }
      if ((dayType === 'legs' || dayType === 'lower') && (!hasSquat || !hasHinge)) {
        if (!(hasSquat && hasHamCurl)) {
          throw new Error('Leg day must include squat and either hinge or hamstring curl.');
        }
      }
      if (dayType === 'lower' && !hasHinge) {
        throw new Error('Lower day must include one hinge pattern.');
      }
      if ((dayType === 'legs' || dayType === 'lower') && !hasHamCurl) {
        throw new Error('Leg day must include seated or lying hamstring curl.');
      }
      if ((dayType === 'legs' || dayType === 'lower') && (!hasCalves || !hasAbs)) {
        throw new Error('Leg day must include calves and abs.');
      }
      const maxCorePerDay = dayType === 'deltsarms'
        ? 0
        : ((priorityGroups.includes('abs') || priorityGroups.includes('core')) && (dayType === 'legs' || dayType === 'lower') ? 2 : 1);
      if (coreCount > maxCorePerDay) {
        throw new Error(`Too many direct core movements in a day (${coreCount}).`);
      }
      if (dayType === 'deltsarms') {
        const biIsoCount = (day?.exercises || []).filter((x) => String(x?.style || '').toLowerCase() === 'isolation' && routeIsBicepsIsoName(String(x?.name || '').toLowerCase())).length;
        const triIsoCount = (day?.exercises || []).filter((x) => String(x?.style || '').toLowerCase() === 'isolation' && routeIsTricepsIsoName(String(x?.name || '').toLowerCase())).length;
        if (biIsoCount !== 1 || triIsoCount !== 1) {
          throw new Error('Delts+Arms day must include exactly one biceps iso and one triceps iso.');
        }
      }
      if ((dayType === 'push' || dayType === 'upper') && chestPressCompoundCount >= 2 && chestFlyCount > 0) {
        throw new Error('Chest day cannot combine 2 chest presses with chest fly in same day.');
      }
    }
    if (heavyDeadliftCount > 1) {
      throw new Error(`Too many heavy deadlift patterns in week (${heavyDeadliftCount}).`);
    }
    if (weeklyLengthenedHingeCount < 1) {
      throw new Error('Week must include at least one true lengthened hinge (RDL/stiff-leg/good morning/back extension).');
    }
    if (hasLowerDay && weeklyRdlCount < 1) {
      throw new Error('Week must include Romanian Deadlift on at least one leg/lower day.');
    }
    const rearDeltCap = shouldersPriority ? 3 : 2;
    if (rearDeltDays.size > rearDeltCap) {
      throw new Error(`Rear-delt isolation appears on too many days (${rearDeltDays.size}).`);
    }
  }
}

function assertBodybuildingPlanByEngine(planObj) {
  if (isOblueprintPlanShape(planObj)) {
    return assertOblueprintBodybuildingIntegrity(planObj);
  }
  return assertBodybuildingPlanIntegrity({
    weeks: planObj?.weeks || [],
    priorityMuscles: planObj?.meta?.priorityMuscles || []
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
  for (const x of raw) {
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
        entries jsonb NOT NULL DEFAULT '[]'::jsonb,
        notes text NOT NULL DEFAULT ''
      );
    `);
    await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_training_workouts_plan_week_day ON app_training_workouts(plan_id, week_index, day_index);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_workouts_user_id ON app_training_workouts(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_training_workouts_plan_id ON app_training_workouts(plan_id);');
    await safeQuery('ALTER TABLE app_training_workouts ADD COLUMN IF NOT EXISTS readiness int;');

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

async function getActivePlan(userId) {
  const result = await db.query(
    `
      SELECT id, version, discipline, days_per_week, plan, created_at, updated_at
      FROM app_training_plans
      WHERE user_id = $1 AND active = true
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [userId]
  );
  return result.rows?.[0] || null;
}

async function getProfile(userId) {
  const result = await db.query(
    `
      SELECT user_id, onboarding_complete, discipline, experience, days_per_week,
             strength, equipment_access, first_name, age, location_city, location_state, goals, profile_image,
             calorie_offset, no_progress_iterations, flagged, eval_weight_lb, eval_weight_at,
             last_weighin_lb, last_weighin_at, bio, injuries, updated_at
      FROM app_training_profiles
      WHERE user_id = $1
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
    secondaryMuscles,
    instructions,
    imageUrl: normalizeCustomWorkoutImageUrl(payload?.imageUrl)
  };
  return { ok: true, entry };
}

function formatUserCustomWorkoutRow(row) {
  const imageUrl = safeText(row?.image_url, 480) || '';
  return {
    id: String(row?.exercise_id || ''),
    name: String(row?.name || row?.exercise_id || 'Custom workout'),
    category: String(row?.category || 'strength'),
    equipment: String(row?.equipment || ''),
    level: String(row?.level || 'beginner'),
    primaryMuscles: Array.isArray(row?.primary_muscles) ? row.primary_muscles : [],
    secondaryMuscles: Array.isArray(row?.secondary_muscles) ? row.secondary_muscles : [],
    instructions: Array.isArray(row?.instructions) ? row.instructions : [],
    imageUrl,
    images: imageUrl ? [imageUrl] : [],
    isCustom: true,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

async function listUserCustomWorkouts(userId) {
  const result = await db.query(
    `
      SELECT exercise_id, name, category, equipment, level, primary_muscles, secondary_muscles, instructions, image_url, created_at, updated_at
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
        primary_muscles, secondary_muscles, instructions, image_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)
      RETURNING exercise_id, name, category, equipment, level, primary_muscles, secondary_muscles, instructions, image_url, created_at, updated_at;
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
      normalized.entry.imageUrl
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

async function upsertWorkoutLog({ userId, planId, weekIndex, dayIndex, performedAt, entries, notes, readiness }) {
  const perfDate = performedAt ? String(performedAt).slice(0, 10) : null;
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeNotes = safeText(notes, 2000) || '';
  const safeReadiness = Number.isFinite(Number(readiness)) ? Math.max(1, Math.min(10, Number(readiness))) : null;
  const result = await db.query(
    `
      INSERT INTO app_training_workouts (
        user_id, plan_id, updated_at, performed_at, week_index, day_index, readiness, entries, notes
      )
      VALUES ($1, $2, now(), $3::date, $4, $5, $6, $7::jsonb, $8)
      ON CONFLICT (plan_id, week_index, day_index) DO UPDATE SET
        updated_at = now(),
        performed_at = COALESCE(EXCLUDED.performed_at, app_training_workouts.performed_at),
        readiness = COALESCE(EXCLUDED.readiness, app_training_workouts.readiness),
        entries = EXCLUDED.entries,
        notes = EXCLUDED.notes
      RETURNING id, updated_at;
    `,
    [userId, planId, perfDate, weekIndex, dayIndex, safeReadiness, JSON.stringify(safeEntries), safeNotes]
  );
  return result.rows?.[0] || null;
}

async function listWorkoutLogs({ userId, planId }) {
  const result = await db.query(
    `
      SELECT week_index, day_index, performed_at, readiness, entries, notes, updated_at
      FROM app_training_workouts
      WHERE user_id = $1 AND plan_id = $2
      ORDER BY week_index ASC, day_index ASC;
    `,
    [userId, planId]
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

  // Public, no-account preview plan. Does not write to DB.
  if (pathname === '/api/training/preview' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    if (isOblueprintRequest(payload)) {
      const built = buildOblueprintPlanWithFallback(payload);
      if (built?.error) {
        if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
          console.warn('[training][preview][oblueprint]', built.error);
        }
        return sendJson(res, 400, built.error);
      }
      const plan = built.plan;
      const usedPayload = built.usedPayload || payload;
      if (String(plan?.meta?.discipline || '').toLowerCase() === 'bodybuilding') {
        try {
          assertBodybuildingPlanByEngine(plan);
        } catch (err) {
          return sendJson(res, 400, { error: err?.message || 'Invalid bodybuilding plan output' });
        }
      }
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
      const built = buildOblueprintPlanWithFallback(coerced);
      if (!built?.error) {
        const plan = built.plan;
        try {
          assertBodybuildingPlanByEngine(plan);
        } catch (err) {
          return sendJson(res, 400, { error: err?.message || 'Invalid bodybuilding plan output' });
        }
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
        try {
          const viewer = await resolveUserFromSession(req);
          canEdit = Boolean(viewer?.isOwner);
        } catch {
          canEdit = false;
        }
      }
      return sendJson(res, 200, { ok: true, count: items.length, total: filtered.length, items, canEdit });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to load workout database' });
    }
  }

  if (pathname === '/api/training/workout-database' && req.method === 'POST') {
    if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
    let user = null;
    try {
      user = await resolveUserFromSession(req);
    } catch {
      user = null;
    }
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
    let user = null;
    try {
      user = await resolveUserFromSession(req);
    } catch {
      user = null;
    }
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
    let user = null;
    try {
      user = await resolveUserFromSession(req);
    } catch {
      user = null;
    }
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

  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  const user = await resolveUserFromSession(req);
  if (!user) return sendJson(res, 401, { error: 'Not authenticated' });

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
      const profile = await getProfile(user.id);
      const plan = await getActivePlan(user.id);
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
              await db.query(
                'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
                [JSON.stringify(planObj), plan.id]
              );
            } catch {
              // ignore
            }
          }
          // Kaggle media is local; we can enrich quickly without blocking the UX.
          try {
            const beforeMissing = countExercisesWithoutGif(planObj);
            await enrichPlanWithExerciseMedia(planObj, { equipmentAccess, maxExercises: 140, timeBudgetMs: 350 });
            const afterMissing = countExercisesWithoutGif(planObj);
          if (afterMissing < beforeMissing) {
            await db.query(
              'UPDATE app_training_plans SET plan = $1::jsonb, updated_at = now() WHERE id = $2;',
              [JSON.stringify(planObj), plan.id]
            );
          }
        } catch {
          // ignore
        }
        // Finish whatever is left in the background.
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
        try {
          assertBodybuildingPlanByEngine(planObj);
        } catch {
          try {
            await db.query('UPDATE app_training_plans SET active = false, updated_at = now() WHERE id = $1;', [plan.id]);
          } catch {
            // ignore
          }
          return sendJson(res, 200, { user, profile, plan: null, error: 'Plan needs a rebuild.' });
        }
      }
    }

    return sendJson(res, 200, { user, profile, plan });
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

    const payload = { ok: true, invites };
    logShareRoute('share.requests.result', { toUserId: user.id, inviteCount: invites.length, forceFresh });
    if (!forceFresh) setInviteCache(user.id, payload);
    return sendJson(res, 200, payload);
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

    if (isOblueprintRequest(payload)) {
      const built = buildOblueprintPlanWithFallback(payload);
      if (built?.error) {
        if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
          console.warn('[training][onboarding][oblueprint]', built.error);
        }
        return sendJson(res, 400, built.error);
      }
      const planBuilt = built.plan;
      const usedPayload = built.usedPayload || payload;
      if (String(planBuilt?.meta?.discipline || '').toLowerCase() === 'bodybuilding') {
        try {
          assertBodybuildingPlanByEngine(planBuilt);
        } catch (err) {
          return sendJson(res, 400, { error: err?.message || 'Invalid bodybuilding plan output' });
        }
      }
      const discipline = resolveOblueprintDiscipline(usedPayload?.trainingFeel);
      const daysPerWeek = Number(planBuilt?.meta?.daysPerWeek) || clampInt(usedPayload?.daysPerWeek, 2, 6, null);
      if (!discipline || !daysPerWeek) return sendJson(res, 400, { error: 'INVALID_INPUT', field: 'trainingFeel', reason: 'Unsupported or invalid onboarding payload' });
      try {
        await upsertProfile(user.id, {
          discipline,
          experience: usedPayload?.experience || '6-24m',
          daysPerWeek,
          strength: {},
          equipmentAccess: {},
          profile: { firstName: usedPayload?.name || '' }
        });
        const plan = await createNewOblueprintPlan(user.id, { discipline, daysPerWeek, plan: planBuilt });
        return sendJson(res, 200, { ok: true, plan, logs: [] });
      } catch (err) {
        return handleTrainingDbFailure(res, err, 'training-onboarding-oblueprint', 'Failed to save onboarding');
      }
    }

    // Graceful fallback: if classic bodybuilding payload is incomplete, coerce it
    // into Oblueprint format instead of failing onboarding with 400.
    if (String(payload?.discipline || '').trim().toLowerCase() === 'bodybuilding') {
      const coerced = coerceClassicBodybuildingToOblueprintPayload(payload);
      const built = buildOblueprintPlanWithFallback(coerced);
      if (!built?.error) {
        const planBuilt = built.plan;
        try {
          assertBodybuildingPlanByEngine(planBuilt);
        } catch (err) {
          return sendJson(res, 400, { error: err?.message || 'Invalid bodybuilding plan output' });
        }
        try {
          const daysPerWeek = Number(planBuilt?.meta?.daysPerWeek) || clampInt(coerced?.daysPerWeek, 2, 6, 4);
          await upsertProfile(user.id, {
            discipline: 'bodybuilding',
            experience: coerced?.experience || '6-24m',
            daysPerWeek,
            strength: {},
            equipmentAccess: {},
            profile: { firstName: payload?.name || '' }
          });
          const plan = await createNewOblueprintPlan(user.id, { discipline: 'bodybuilding', daysPerWeek, plan: planBuilt });
          return sendJson(res, 200, { ok: true, plan, logs: [] });
        } catch (err) {
          return handleTrainingDbFailure(res, err, 'training-onboarding-oblueprint-coerced', 'Failed to save onboarding');
        }
      }
    }

    const validated = validatePlanInputs(payload);
    if (!validated.ok) return sendJson(res, 400, { error: validated.error });

    try {
      await upsertProfile(user.id, payload);
      const plan = await createNewPlan(user.id, {
        discipline: validated.discipline,
        daysPerWeek: validated.daysPerWeek,
        experience: validated.experience,
        strength: validated.strength,
        equipmentAccess: payload?.equipmentAccess || null
      });
      const logs = plan ? await listWorkoutLogs({ userId: user.id, planId: plan.id }) : [];
      return sendJson(res, 200, { ok: true, plan, logs });
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
    if (!planId) return sendJson(res, 400, { error: 'Missing planId' });
    try {
      const logs = await listWorkoutLogs({ userId: user.id, planId });
      return sendJson(res, 200, { logs });
    } catch (err) {
      return handleTrainingDbFailure(res, err, 'training-logs', 'Failed to load logs');
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
        readiness
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
      return sendJson(res, 200, { ok: true, plan: updatedPlan });
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
    const projected = Number(payload?.projected);
    if (!planId || !weekIndex || !dayIndex || !exerciseId) return sendJson(res, 400, { error: 'Missing override params' });
    if (!Number.isFinite(projected) || projected <= 0) return sendJson(res, 400, { error: 'Invalid projected value' });

    try {
      const plan = await patchProjectedWeight({ userId: user.id, planId, weekIndex, dayIndex, exerciseId, nextProjected: projected });
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

module.exports = trainingRoutes;
