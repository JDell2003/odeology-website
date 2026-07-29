/* ====================================================================
   OWNER TRANSCRIPTION — in-app speech-to-text, owner-only, flagged off.

   HARD CONSTRAINT (the whole point of this module): VIDEO NEVER TRANSITS
   AND IS NEVER STORED. The browser extracts + downsamples the audio track
   to 16 kHz mono 16-bit PCM and uploads only that. This module additionally
   refuses, server-side, any chunk whose first bytes look like a media
   container (MP4/MOV/Matroska/WebM/Ogg/RIFF/MP3/FLAC/ADTS) — so a client
   bug can't quietly turn this into a video uploader.

   AUDIO LIFETIME: raw PCM lands in a per-job directory under the OS temp
   dir (never the repo, never a Railway volume — see resolveTempRoot). The
   directory is wiped in a finally on completion, failure, cancel, upload
   timeout, and at process start (orphan sweep). The ONLY thing that
   survives is the transcript text + segment timings in Postgres.

   Everything is gated behind TRANSCRIBE_ENABLED (default off). Flag off ->
   every route 503s with a clear reason and no job can be created.
   Trainers are deliberately excluded: owner only, no exceptions.

   Routes (all owner-only):
     GET    /api/owner/transcribe/status
     POST   /api/owner/transcribe/jobs              { filename, durationSec, sampleRate, channels, totalBytes, model? }
     PUT    /api/owner/transcribe/jobs/:id/chunk?index=N   raw application/octet-stream PCM
     POST   /api/owner/transcribe/jobs/:id/complete
     POST   /api/owner/transcribe/jobs/:id/cancel
     GET    /api/owner/transcribe/jobs/:id
     GET    /api/owner/transcribe/transcripts
     GET    /api/owner/transcribe/transcripts/:id
     PATCH  /api/owner/transcribe/transcripts/:id   { title }
     DELETE /api/owner/transcribe/transcripts/:id

   Engine: faster-whisper (MIT) via ctranslate2 int8 on CPU, driven by
   scripts/transcribe_worker.py. The worker takes raw s16le PCM on a path,
   so the server needs NO ffmpeg. See deploy/transcription/README.md — the
   runtime is not part of the live Railway build yet, and with it absent
   the status endpoint reports engine.available = false instead of
   pretending to work.
   ==================================================================== */
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const db = require('./db');
const { resolveSessionRoleFlags } = require('./roleGuard');

const ROUTE_PREFIX = '/api/owner/transcribe';
const WORKER_SCRIPT = path.join(__dirname, '..', 'scripts', 'transcribe_worker.py');

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2; // s16le
const BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE; // 32000

// 400 MB of 16 kHz mono PCM ~= 3h30m of audio. A 60-90 min job is 115-173 MB.
const MAX_AUDIO_BYTES = Math.max(
  1_000_000,
  Number(process.env.TRANSCRIBE_MAX_AUDIO_BYTES || 400 * 1024 * 1024)
);
const MAX_CHUNK_BYTES = Math.max(
  64 * 1024,
  Number(process.env.TRANSCRIBE_MAX_CHUNK_BYTES || 8 * 1024 * 1024)
);
// An upload that stops mid-flight must not pin the queue or leave PCM on disk.
const UPLOAD_IDLE_TIMEOUT_MS = Math.max(
  60_000,
  Number(process.env.TRANSCRIBE_UPLOAD_IDLE_MS || 10 * 60 * 1000)
);
const JOB_RETENTION_MS = 30 * 60 * 1000; // finished job records linger for polling only

// Model catalogue. The distil ".en" models are several times faster at
// comparable quality but ENGLISH ONLY — englishOnly drives both the UI label
// and the worker's refusal to run them against another language.
const MODEL_CATALOG = {
  'small': { label: 'small — balanced', englishOnly: false },
  'medium': { label: 'medium — most accurate, slowest', englishOnly: false },
  'distil-small.en': { label: 'distil-small.en — fastest (English only)', englishOnly: true },
  'distil-large-v3': { label: 'distil-large-v3 — accurate + fast', englishOnly: false }
};
const MODELS = new Set(Object.keys(MODEL_CATALOG));
const DEFAULT_MODEL = MODELS.has(String(process.env.TRANSCRIBE_MODEL || '').trim())
  ? String(process.env.TRANSCRIBE_MODEL).trim()
  : 'small';

// Batched inference (faster-whisper >= 1.1) runs VAD-segmented pieces in
// parallel — the biggest single speedup available on CPU.
const BATCH_SIZE = Math.max(1, Math.min(32, Number(process.env.TRANSCRIBE_BATCH_SIZE || 8)));
const BATCHING_DISABLED = String(process.env.TRANSCRIBE_NO_BATCH || '').trim().toLowerCase() === 'true';

// Audio seconds transcribed per wall-clock second, per model, on a modest
// shared-CPU container. Seeds the "estimated wait" until real jobs measure it;
// runJob replaces these with observed throughput as jobs complete. Batched
// inference is assumed on (~3-4x over sequential).
const SEED_SPEED = {
  'small': 9.0,
  'medium': 3.3,
  'distil-small.en': 22.0,
  'distil-large-v3': 6.0
};
const measuredSpeed = {};

const ID_RE = /^[0-9a-f]{32}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

/* ---------- flag + engine availability ---------- */

function transcribeEnabled() {
  return String(process.env.TRANSCRIBE_ENABLED || '').trim().toLowerCase() === 'true';
}

function pythonBin() {
  return String(process.env.TRANSCRIBE_PYTHON || 'python3').trim() || 'python3';
}

/**
 * Worker thread count. Deliberately NOT os.cpus().length: inside a container
 * that reports the HOST's core count (32+ on Railway), not the cgroup's share,
 * so trusting it makes ctranslate2 spawn dozens of threads that thrash against
 * each other AND starve the Node event loop serving the rest of the site for
 * the 20-60 minutes a long job runs. Cap at 4 unless told otherwise.
 */
function resolveThreads() {
  const override = Number(process.env.TRANSCRIBE_THREADS || 0);
  if (Number.isFinite(override) && override > 0) return Math.min(32, Math.floor(override));
  return Math.max(1, Math.min(4, os.cpus()?.length || 2));
}

let engineProbe = null; // { at, ok, detail }
const ENGINE_PROBE_TTL_MS = 60_000;

/** Ask the worker to self-check (imports faster-whisper, reports version). */
function probeEngine() {
  if (engineProbe && Date.now() - engineProbe.at < ENGINE_PROBE_TTL_MS) {
    return Promise.resolve(engineProbe);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      engineProbe = { at: Date.now(), ok, detail };
      resolve(engineProbe);
    };
    if (!fs.existsSync(WORKER_SCRIPT)) return finish(false, 'worker script missing');
    let child;
    try {
      child = spawn(pythonBin(), [WORKER_SCRIPT, '--selfcheck'], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return finish(false, `python not runnable (${err?.code || err?.message || 'spawn failed'})`);
    }
    let out = '';
    let errOut = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { errOut += c; });
    child.on('error', (err) => finish(false, `python not runnable (${err?.code || err?.message})`));
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } finish(false, 'engine self-check timed out'); }, 20_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const why = String(errOut || out || '').trim().split('\n').pop() || `exit ${code}`;
        return finish(false, why.slice(0, 200));
      }
      let parsed = null;
      try { parsed = JSON.parse(String(out).trim().split('\n').pop() || '{}'); } catch { /* ignore */ }
      finish(true, parsed?.faster_whisper ? `faster-whisper ${parsed.faster_whisper}` : 'ready');
    });
  });
}

/* ---------- temp dir: OS temp only, never repo, never a Railway volume ---------- */

let tempRootCache = null;
function resolveTempRoot() {
  if (tempRootCache) return tempRootCache;
  const root = path.resolve(os.tmpdir(), 'riseforit-transcribe');
  const repoRoot = path.resolve(__dirname, '..');
  const volume = String(process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim();
  const within = (child, parent) => {
    if (!parent) return false;
    const rel = path.relative(path.resolve(parent), child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  // Refusing here is correct: an OS temp dir that resolved inside the repo or
  // a persistent volume would silently break the "audio is never stored"
  // promise, and a broken promise is worse than a disabled feature.
  if (within(root, repoRoot)) throw new Error('Transcription temp dir resolved inside the repo — refusing to store audio there');
  if (volume && within(root, volume)) throw new Error('Transcription temp dir resolved inside the Railway volume — refusing to store audio there');
  tempRootCache = root;
  return root;
}

function jobDir(jobId) {
  return path.join(resolveTempRoot(), jobId);
}

async function wipeJobDir(jobId) {
  if (!ID_RE.test(String(jobId || ''))) return;
  try {
    await fsp.rm(jobDir(jobId), { recursive: true, force: true });
  } catch (err) {
    console.error('[transcribe] temp wipe failed', jobId, err?.message || err);
  }
}

/** Orphan sweep — a crash/redeploy mid-job must not leave PCM behind. */
async function sweepTempRoot() {
  let root;
  try { root = resolveTempRoot(); } catch { return; }
  try {
    await fsp.rm(root, { recursive: true, force: true });
  } catch (err) {
    console.error('[transcribe] temp sweep failed', err?.message || err);
  }
}

/* ---------- schema: transcript text only ---------- */

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_owner_transcripts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id uuid NOT NULL,
      title text NOT NULL DEFAULT '',
      source_filename text NOT NULL DEFAULT '',
      duration_sec integer NOT NULL DEFAULT 0,
      model text NOT NULL DEFAULT 'small',
      language text NOT NULL DEFAULT '',
      text text NOT NULL DEFAULT '',
      segments jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_app_owner_transcripts_owner ON app_owner_transcripts(owner_user_id, created_at DESC);');
  schemaReady = true;
}

/* ---------- http helpers ---------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJsonBody(req, maxBytes = 32_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('Chunk too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function cleanText(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

/* ---------- container sniff: the server-side "no video" backstop ---------- */

const CONTAINER_SIGNATURES = [
  { name: 'MP4/MOV', test: (b) => b.length >= 12 && b.slice(4, 8).toString('latin1') === 'ftyp' },
  { name: 'Matroska/WebM', test: (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { name: 'RIFF/WAV/AVI', test: (b) => b.length >= 4 && b.slice(0, 4).toString('latin1') === 'RIFF' },
  { name: 'Ogg', test: (b) => b.length >= 4 && b.slice(0, 4).toString('latin1') === 'OggS' },
  { name: 'FLAC', test: (b) => b.length >= 4 && b.slice(0, 4).toString('latin1') === 'fLaC' },
  { name: 'MP3/ID3', test: (b) => b.length >= 3 && b.slice(0, 3).toString('latin1') === 'ID3' },
  { name: 'MPEG audio', test: (b) => b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 },
  { name: 'ASF/WMV', test: (b) => b.length >= 4 && b[0] === 0x30 && b[1] === 0x26 && b[2] === 0xb2 && b[3] === 0x75 },
  { name: 'FLV', test: (b) => b.length >= 3 && b.slice(0, 3).toString('latin1') === 'FLV' }
];

function detectContainer(buf) {
  for (const sig of CONTAINER_SIGNATURES) {
    try { if (sig.test(buf)) return sig.name; } catch { /* ignore */ }
  }
  return null;
}

/* ---------- job registry (single process, one job at a time) ---------- */

/** @type {Map<string, any>} */
const jobs = new Map();
let activeJobId = null; // the job currently holding the transcription slot

function speedFor(model) {
  return measuredSpeed[model] || SEED_SPEED[model] || SEED_SPEED.small;
}

/** True when this model can only transcribe English. */
function isEnglishOnly(model) {
  return Boolean(MODEL_CATALOG[model] && MODEL_CATALOG[model].englishOnly);
}

function estimateSeconds(job) {
  return Math.round(Math.max(1, Number(job.durationSec) || 0) / speedFor(job.model));
}

/** Queue = jobs waiting for the slot, in creation order. */
function queuedJobs() {
  return Array.from(jobs.values())
    .filter((j) => j.status === 'queued')
    .sort((a, b) => a.createdAt - b.createdAt);
}

function runningJob() {
  return activeJobId ? jobs.get(activeJobId) || null : null;
}

/** Wall-clock seconds before THIS job's own transcription starts. */
function waitSecondsBefore(job) {
  let wait = 0;
  const running = runningJob();
  if (running && running.id !== job.id) {
    const elapsed = (Date.now() - (running.startedAt || Date.now())) / 1000;
    wait += Math.max(0, estimateSeconds(running) - elapsed);
  }
  for (const q of queuedJobs()) {
    if (q.id === job.id) break;
    wait += estimateSeconds(q);
  }
  return Math.round(wait);
}

function publicJob(job) {
  const out = {
    id: job.id,
    status: job.status,
    model: job.model,
    filename: job.filename,
    durationSec: job.durationSec,
    receivedBytes: job.receivedBytes,
    totalBytes: job.totalBytes,
    uploadPercent: job.totalBytes ? Math.min(100, Math.round((job.receivedBytes / job.totalBytes) * 100)) : 0,
    processedSec: job.processedSec || 0,
    transcribePercent: job.durationSec ? Math.min(100, Math.round(((job.processedSec || 0) / job.durationSec) * 100)) : 0,
    estimatedTotalSec: estimateSeconds(job),
    queuePosition: job.status === 'queued' ? queuedJobs().findIndex((j) => j.id === job.id) + 1 : 0,
    error: job.error || null,
    transcriptId: job.transcriptId || null,
    createdAt: new Date(job.createdAt).toISOString()
  };
  if (job.status === 'queued' || job.status === 'running') {
    out.estimatedWaitSec = job.status === 'running'
      ? Math.max(0, estimateSeconds(job) - Math.round((Date.now() - (job.startedAt || Date.now())) / 1000))
      : waitSecondsBefore(job) + estimateSeconds(job);
  }
  return out;
}

function touchJob(job) {
  job.lastActivityAt = Date.now();
}

/** Reap stalled uploads and expired finished-job records. */
function reapJobs() {
  const now = Date.now();
  for (const job of Array.from(jobs.values())) {
    if (job.status === 'uploading' && now - job.lastActivityAt > UPLOAD_IDLE_TIMEOUT_MS) {
      failJob(job, 'Upload stalled — job discarded and audio deleted.');
    } else if (['done', 'error', 'canceled'].includes(job.status) && now - job.finishedAt > JOB_RETENTION_MS) {
      jobs.delete(job.id);
    }
  }
}
const reaper = setInterval(reapJobs, 60_000);
if (typeof reaper.unref === 'function') reaper.unref();

async function finalizeJob(job, status, error) {
  job.status = status;
  job.error = error || null;
  job.finishedAt = Date.now();
  if (job.child) { try { job.child.kill('SIGKILL'); } catch { /* ignore */ } job.child = null; }
  // The audio dies here, on EVERY exit path.
  await wipeJobDir(job.id);
  job.audioWiped = true;
  if (activeJobId === job.id) {
    activeJobId = null;
    pumpQueue();
  }
}

function failJob(job, message) {
  finalizeJob(job, 'error', message).catch((err) => console.error('[transcribe] finalize failed', err?.message || err));
}

/* ---------- worker execution ---------- */

function pumpQueue() {
  if (activeJobId) return;
  const next = queuedJobs()[0];
  if (!next) return;
  activeJobId = next.id;
  runJob(next).catch((err) => {
    console.error('[transcribe] run failed', err?.message || err);
    failJob(next, 'Transcription failed to start.');
  });
}

async function runJob(job) {
  job.status = 'running';
  job.startedAt = Date.now();
  job.processedSec = 0;
  touchJob(job);

  const audioPath = path.join(jobDir(job.id), 'audio.pcm');
  const args = [
    WORKER_SCRIPT,
    '--audio', audioPath,
    '--model', job.model,
    '--sample-rate', String(SAMPLE_RATE),
    '--channels', String(CHANNELS),
    '--compute-type', String(process.env.TRANSCRIBE_COMPUTE_TYPE || 'int8'),
    '--threads', String(resolveThreads()),
    '--batch-size', String(BATCH_SIZE)
  ];
  if (BATCHING_DISABLED) args.push('--no-batch');
  if (process.env.TRANSCRIBE_MODEL_DIR) args.push('--model-dir', String(process.env.TRANSCRIBE_MODEL_DIR));
  if (job.language) args.push('--language', job.language);

  let child;
  try {
    child = spawn(pythonBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    await finalizeJob(job, 'error', `Transcription engine unavailable (${err?.code || 'spawn failed'}).`);
    return;
  }
  job.child = child;

  const segments = [];
  let stdoutBuf = '';
  let stderrTail = '';
  let language = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk;
    let nl;
    while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === 'progress') {
        job.processedSec = Math.max(job.processedSec || 0, Number(msg.seconds) || 0);
        touchJob(job);
      } else if (msg.type === 'segment') {
        segments.push({ start: Number(msg.start) || 0, end: Number(msg.end) || 0, text: String(msg.text || '') });
        job.processedSec = Math.max(job.processedSec || 0, Number(msg.end) || 0);
        touchJob(job);
      } else if (msg.type === 'meta') {
        language = String(msg.language || '');
        if (Number(msg.duration) > 0) job.durationSec = Math.round(Number(msg.duration));
      } else if (msg.type === 'error') {
        stderrTail = String(msg.message || 'worker error');
      }
    }
  });
  child.stderr.on('data', (c) => {
    stderrTail = (stderrTail + String(c)).slice(-2000);
  });

  const exitCode = await new Promise((resolve) => {
    child.on('error', (err) => resolve({ code: -1, err }));
    child.on('close', (code) => resolve({ code }));
  });
  job.child = null;

  if (job.status === 'canceled') return; // cancel already finalized + wiped

  if (exitCode.code !== 0) {
    const detail = exitCode.err
      ? `engine unavailable (${exitCode.err.code || exitCode.err.message})`
      : (String(stderrTail).trim().split('\n').pop() || `exit ${exitCode.code}`).slice(0, 300);
    await finalizeJob(job, 'error', `Transcription failed: ${detail}`);
    return;
  }

  // Learn real throughput so the next job's estimate is honest.
  const wallSec = Math.max(1, (Date.now() - job.startedAt) / 1000);
  const observed = (job.durationSec || 0) / wallSec;
  if (observed > 0.05 && observed < 200) {
    const prev = measuredSpeed[job.model];
    measuredSpeed[job.model] = prev ? prev * 0.6 + observed * 0.4 : observed;
  }

  try {
    const transcript = await saveTranscript(job, segments, language);
    job.transcriptId = transcript.id;
    await finalizeJob(job, 'done', null);
  } catch (err) {
    console.error('[transcribe] save failed', err?.message || err);
    await finalizeJob(job, 'error', 'Transcription finished but the transcript could not be saved.');
  }
}

function buildPlainText(segments) {
  return segments.map((s) => String(s.text || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function saveTranscript(job, segments, language) {
  await ensureSchema();
  const text = buildPlainText(segments);
  const result = await db.query(
    `INSERT INTO app_owner_transcripts
       (owner_user_id, title, source_filename, duration_sec, model, language, text, segments)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *;`,
    [
      job.ownerUserId,
      job.title || job.filename || 'Transcript',
      job.filename || '',
      Math.max(0, Math.round(job.durationSec || 0)),
      job.model,
      cleanText(language, 16),
      text,
      JSON.stringify(segments)
    ]
  );
  return mapTranscript(result.rows[0]);
}

/* ---------- transcript shaping (~15s timestamp marks) ---------- */

const MARK_INTERVAL_SEC = Math.max(5, Number(process.env.TRANSCRIBE_MARK_INTERVAL_SEC || 15));

function formatTimestamp(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * Group raw whisper segments into ~15s blocks. Whisper segments are
 * sentence-ish and irregular (0.4s-30s), so a block closes at the first
 * segment that crosses the next mark — blocks never split a sentence.
 */
function buildMarkedBlocks(segments, intervalSec = MARK_INTERVAL_SEC) {
  const blocks = [];
  let current = null;
  for (const seg of Array.isArray(segments) ? segments : []) {
    const start = Number(seg.start) || 0;
    const end = Number(seg.end) || start;
    const textPart = String(seg.text || '').trim();
    if (!textPart) continue;
    if (!current || start >= current.start + intervalSec) {
      current = { start, end, at: formatTimestamp(start), text: textPart };
      blocks.push(current);
    } else {
      current.end = Math.max(current.end, end);
      current.text = `${current.text} ${textPart}`.replace(/\s+/g, ' ');
    }
  }
  return blocks;
}

function mapTranscript(row, { includeBody = true } = {}) {
  const segments = Array.isArray(row.segments) ? row.segments : [];
  const out = {
    id: row.id,
    title: row.title || '',
    filename: row.source_filename || '',
    durationSec: Number(row.duration_sec) || 0,
    model: row.model || 'small',
    language: row.language || '',
    createdAt: row.created_at,
    wordCount: String(row.text || '').split(/\s+/).filter(Boolean).length
  };
  if (includeBody) {
    out.text = row.text || '';
    out.blocks = buildMarkedBlocks(segments);
  }
  return out;
}

/* ---------- routes ---------- */

async function transcribeRoutes(req, res, url) {
  if (!url.pathname.startsWith(ROUTE_PREFIX)) return false;

  try {
    const flags = await resolveSessionRoleFlags(req);
    if (!flags?.userId) { sendJson(res, 401, { ok: false, error: 'Not signed in' }); return true; }
    // Owner only. Trainers are explicitly excluded from this feature for now.
    if (!flags.owner) { sendJson(res, 403, { ok: false, error: 'Owner only' }); return true; }

    const sub = url.pathname.slice(ROUTE_PREFIX.length) || '/';

    // Status is readable with the flag off so the UI can explain itself.
    if (sub === '/status' && req.method === 'GET') return await handleStatus(res), true;

    if (!transcribeEnabled()) {
      sendJson(res, 503, { ok: false, error: 'Transcription is turned off (TRANSCRIBE_ENABLED is not true).', code: 'flag_off' });
      return true;
    }

    if (sub === '/jobs' && req.method === 'POST') return await handleCreateJob(req, res, flags), true;

    const chunkMatch = sub.match(/^\/jobs\/([0-9a-f]{32})\/chunk$/);
    if (chunkMatch && req.method === 'PUT') return await handleChunk(req, res, flags, chunkMatch[1], url), true;

    const completeMatch = sub.match(/^\/jobs\/([0-9a-f]{32})\/complete$/);
    if (completeMatch && req.method === 'POST') return await handleComplete(req, res, flags, completeMatch[1]), true;

    const cancelMatch = sub.match(/^\/jobs\/([0-9a-f]{32})\/cancel$/);
    if (cancelMatch && req.method === 'POST') return await handleCancel(res, flags, cancelMatch[1]), true;

    const jobMatch = sub.match(/^\/jobs\/([0-9a-f]{32})$/);
    if (jobMatch && req.method === 'GET') return handleJobStatus(res, flags, jobMatch[1]), true;

    if (sub === '/transcripts' && req.method === 'GET') return await handleListTranscripts(res, flags), true;

    const trMatch = sub.match(/^\/transcripts\/([0-9a-f-]{36})$/i);
    if (trMatch && req.method === 'GET') return await handleGetTranscript(res, flags, trMatch[1]), true;
    if (trMatch && req.method === 'PATCH') return await handleRenameTranscript(req, res, flags, trMatch[1]), true;
    if (trMatch && req.method === 'DELETE') return await handleDeleteTranscript(res, flags, trMatch[1]), true;

    sendJson(res, 404, { ok: false, error: 'Not found' });
    return true;
  } catch (err) {
    console.error('[transcribe]', err?.message || err);
    sendJson(res, 500, { ok: false, error: 'Transcription error' });
    return true;
  }
}

async function handleStatus(res) {
  const enabled = transcribeEnabled();
  const engine = enabled ? await probeEngine() : { ok: false, detail: 'flag off' };
  const running = runningJob();
  const queue = queuedJobs();
  let tempRootOk = true;
  let tempRootError = '';
  try { resolveTempRoot(); } catch (err) { tempRootOk = false; tempRootError = err.message; }
  sendJson(res, 200, {
    ok: true,
    enabled,
    engine: { available: Boolean(engine.ok), detail: engine.detail || '' },
    storage: { tempRootOk, tempRootError, audioPersisted: false },
    limits: {
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      maxAudioBytes: MAX_AUDIO_BYTES,
      maxChunkBytes: MAX_CHUNK_BYTES,
      maxAudioSeconds: Math.floor(MAX_AUDIO_BYTES / BYTES_PER_SECOND),
      markIntervalSec: MARK_INTERVAL_SEC
    },
    models: Object.keys(MODEL_CATALOG).map((id) => ({
      id,
      label: MODEL_CATALOG[id].label,
      englishOnly: MODEL_CATALOG[id].englishOnly,
      // Audio seconds per wall second — lets the UI show a realistic estimate
      // per model choice, and reflects real measurements once jobs have run.
      speedFactor: Math.round(speedFor(id) * 10) / 10,
      measured: Boolean(measuredSpeed[id])
    })),
    defaultModel: DEFAULT_MODEL,
    batching: { enabled: !BATCHING_DISABLED, batchSize: BATCH_SIZE },
    threads: resolveThreads(),
    busy: Boolean(running),
    queueLength: queue.length,
    estimatedWaitSec: running ? waitSecondsBefore({ id: '__new__', model: DEFAULT_MODEL, durationSec: 0 }) : 0
  });
}

async function handleCreateJob(req, res, flags) {
  let payload;
  try { payload = await readJsonBody(req); } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }); }

  const sampleRate = Number(payload.sampleRate);
  const channels = Number(payload.channels);
  if (sampleRate !== SAMPLE_RATE || channels !== CHANNELS) {
    return sendJson(res, 400, { ok: false, error: `Audio must be ${SAMPLE_RATE} Hz mono — got ${sampleRate || '?'} Hz / ${channels || '?'} ch.` });
  }
  const totalBytes = Math.floor(Number(payload.totalBytes) || 0);
  if (!(totalBytes > 0)) return sendJson(res, 400, { ok: false, error: 'totalBytes required' });
  if (totalBytes > MAX_AUDIO_BYTES) {
    return sendJson(res, 413, {
      ok: false,
      error: `Audio is ${(totalBytes / 1048576).toFixed(0)} MB — the limit is ${(MAX_AUDIO_BYTES / 1048576).toFixed(0)} MB (about ${Math.floor(MAX_AUDIO_BYTES / BYTES_PER_SECOND / 60)} minutes).`
    });
  }
  if (totalBytes % (BYTES_PER_SAMPLE * CHANNELS) !== 0) {
    return sendJson(res, 400, { ok: false, error: 'totalBytes must be a whole number of 16-bit samples' });
  }

  const model = MODELS.has(String(payload.model)) ? String(payload.model) : DEFAULT_MODEL;
  let language = cleanText(payload.language, 8);
  if (isEnglishOnly(model)) {
    if (language && language !== 'en') {
      return sendJson(res, 400, {
        ok: false,
        code: 'model_english_only',
        error: `${model} is English-only — pick "small" or "medium" for ${language.toUpperCase()} audio.`
      });
    }
    language = 'en';
  }

  // Queue guard: exactly one job may exist per owner at a time. A long file
  // can't stack behind another and double the container's CPU burn.
  const mine = Array.from(jobs.values()).find(
    (j) => j.ownerUserId === flags.userId && ['uploading', 'queued', 'running'].includes(j.status)
  );
  if (mine) {
    return sendJson(res, 429, {
      ok: false,
      code: 'job_in_progress',
      error: 'A transcription is already in progress. Wait for it to finish or cancel it.',
      job: publicJob(mine)
    });
  }
  if (jobs.size > 8) reapJobs();

  const engine = await probeEngine();
  if (!engine.ok) {
    return sendJson(res, 503, {
      ok: false,
      code: 'engine_unavailable',
      error: `Transcription engine is not installed on this server (${engine.detail}). See deploy/transcription/README.md.`
    });
  }

  const id = crypto.randomBytes(16).toString('hex');
  let dir;
  try { dir = jobDir(id); } catch (err) { return sendJson(res, 500, { ok: false, error: err.message }); }
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'audio.pcm'), Buffer.alloc(0));

  const job = {
    id,
    ownerUserId: flags.userId,
    status: 'uploading',
    model,
    language,
    filename: cleanText(payload.filename, 200),
    title: cleanText(payload.title || payload.filename, 200),
    durationSec: Math.max(0, Math.round(Number(payload.durationSec) || totalBytes / BYTES_PER_SECOND)),
    totalBytes,
    receivedBytes: 0,
    nextChunkIndex: 0,
    processedSec: 0,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    error: null,
    transcriptId: null,
    child: null
  };
  jobs.set(id, job);
  sendJson(res, 200, { ok: true, job: publicJob(job) });
}

async function handleChunk(req, res, flags, jobId, url) {
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== flags.userId) return sendJson(res, 404, { ok: false, error: 'Job not found' });
  if (job.status !== 'uploading') return sendJson(res, 409, { ok: false, error: `Job is ${job.status} — not accepting chunks.` });

  const index = Number(url.searchParams.get('index'));
  if (!Number.isInteger(index) || index < 0) return sendJson(res, 400, { ok: false, error: 'index required' });
  if (index !== job.nextChunkIndex) {
    return sendJson(res, 409, { ok: false, error: `Out-of-order chunk: expected ${job.nextChunkIndex}, got ${index}.`, expectedIndex: job.nextChunkIndex });
  }

  let buf;
  try { buf = await readRawBody(req, MAX_CHUNK_BYTES); }
  catch (err) { failJob(job, 'Upload chunk rejected.'); return sendJson(res, 413, { ok: false, error: err.message }); }

  // Backstop: if this is somehow a media container rather than raw PCM, the
  // client's audio extraction failed. Kill the job loudly — never let a video
  // (or any container) get written to disk under the guise of PCM.
  if (index === 0) {
    const container = detectContainer(buf);
    if (container) {
      await finalizeJob(job, 'error', `Rejected: upload looked like a ${container} file, not extracted audio. Video is never uploaded.`);
      return sendJson(res, 415, {
        ok: false,
        code: 'container_rejected',
        error: `That upload looked like a ${container} container, not extracted PCM audio. The job was rejected and nothing was stored.`
      });
    }
  }

  if (buf.length % (BYTES_PER_SAMPLE * CHANNELS) !== 0) {
    await finalizeJob(job, 'error', 'Chunk was not a whole number of 16-bit samples.');
    return sendJson(res, 400, { ok: false, error: 'Chunk must be a whole number of 16-bit samples' });
  }
  if (job.receivedBytes + buf.length > job.totalBytes) {
    await finalizeJob(job, 'error', 'Upload exceeded the declared size.');
    return sendJson(res, 413, { ok: false, error: 'Upload exceeded the declared totalBytes' });
  }

  try {
    await fsp.appendFile(path.join(jobDir(job.id), 'audio.pcm'), buf);
  } catch (err) {
    await finalizeJob(job, 'error', 'Could not buffer audio on the server.');
    return sendJson(res, 500, { ok: false, error: 'Could not buffer audio' });
  }

  job.receivedBytes += buf.length;
  job.nextChunkIndex = index + 1;
  touchJob(job);
  sendJson(res, 200, { ok: true, job: publicJob(job) });
}

async function handleComplete(req, res, flags, jobId) {
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== flags.userId) return sendJson(res, 404, { ok: false, error: 'Job not found' });
  if (job.status !== 'uploading') return sendJson(res, 409, { ok: false, error: `Job is ${job.status}.` });

  // Streaming extraction can't know the exact PCM length before it has decoded
  // the whole file, so the client declares an upper bound at creation and
  // reconciles here. finalBytes must match what we actually received and must
  // not exceed the declared bound — so this loosens the ceiling, never the
  // integrity check.
  let payload = {};
  try { payload = await readJsonBody(req); } catch { payload = {}; }
  const finalBytes = Number(payload.finalBytes);
  if (
    job.receivedBytes !== job.totalBytes
    && Number.isInteger(finalBytes)
    && finalBytes === job.receivedBytes
    && finalBytes > 0
    && finalBytes <= job.totalBytes
    && finalBytes % (BYTES_PER_SAMPLE * CHANNELS) === 0
  ) {
    job.totalBytes = job.receivedBytes;
    job.durationSec = Math.max(1, Math.round(job.receivedBytes / BYTES_PER_SECOND));
  }

  if (job.receivedBytes !== job.totalBytes) {
    // Recoverable, so do NOT destroy the job: a dropped connection or a
    // duplicated complete shouldn't cost the user a re-extract of a 90-minute
    // file. The job stays in 'uploading' and the client resumes at
    // expectedIndex. The idle reaper still wipes it if nothing more arrives.
    touchJob(job);
    return sendJson(res, 400, {
      ok: false,
      code: 'upload_incomplete',
      error: `Upload incomplete: ${job.receivedBytes} of ${job.totalBytes} bytes.`,
      expectedIndex: job.nextChunkIndex
    });
  }
  job.status = 'queued';
  touchJob(job);
  pumpQueue();
  sendJson(res, 200, { ok: true, job: publicJob(job) });
}

async function handleCancel(res, flags, jobId) {
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== flags.userId) return sendJson(res, 404, { ok: false, error: 'Job not found' });
  if (['done', 'error', 'canceled'].includes(job.status)) return sendJson(res, 200, { ok: true, job: publicJob(job) });
  await finalizeJob(job, 'canceled', null);
  sendJson(res, 200, { ok: true, job: publicJob(job) });
}

function handleJobStatus(res, flags, jobId) {
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== flags.userId) return sendJson(res, 404, { ok: false, error: 'Job not found' });
  sendJson(res, 200, { ok: true, job: publicJob(job) });
}

async function handleListTranscripts(res, flags) {
  await ensureSchema();
  const result = await db.query(
    `SELECT id, title, source_filename, duration_sec, model, language, created_at, text, '[]'::jsonb AS segments
     FROM app_owner_transcripts WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 200;`,
    [flags.userId]
  );
  sendJson(res, 200, { ok: true, transcripts: (result.rows || []).map((r) => mapTranscript(r, { includeBody: false })) });
}

async function handleGetTranscript(res, flags, id) {
  await ensureSchema();
  const result = await db.query(
    'SELECT * FROM app_owner_transcripts WHERE owner_user_id = $1 AND id = $2 LIMIT 1;',
    [flags.userId, id]
  );
  const row = result.rows?.[0];
  if (!row) return sendJson(res, 404, { ok: false, error: 'Transcript not found' });
  sendJson(res, 200, { ok: true, transcript: mapTranscript(row) });
}

async function handleRenameTranscript(req, res, flags, id) {
  let payload;
  try { payload = await readJsonBody(req); } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }); }
  const title = cleanText(payload.title, 200);
  if (!title) return sendJson(res, 400, { ok: false, error: 'Title required' });
  await ensureSchema();
  const result = await db.query(
    'UPDATE app_owner_transcripts SET title = $3 WHERE owner_user_id = $1 AND id = $2 RETURNING *;',
    [flags.userId, id, title]
  );
  if (!result.rows?.length) return sendJson(res, 404, { ok: false, error: 'Transcript not found' });
  sendJson(res, 200, { ok: true, transcript: mapTranscript(result.rows[0], { includeBody: false }) });
}

async function handleDeleteTranscript(res, flags, id) {
  await ensureSchema();
  const result = await db.query(
    'DELETE FROM app_owner_transcripts WHERE owner_user_id = $1 AND id = $2 RETURNING id;',
    [flags.userId, id]
  );
  if (!result.rows?.length) return sendJson(res, 404, { ok: false, error: 'Transcript not found' });
  sendJson(res, 200, { ok: true });
}

// Wipe anything a previous process left behind before serving traffic.
sweepTempRoot().catch(() => { /* best effort */ });

module.exports = transcribeRoutes;
module.exports._private = {
  transcribeEnabled,
  resolveTempRoot,
  jobDir,
  wipeJobDir,
  sweepTempRoot,
  detectContainer,
  buildMarkedBlocks,
  buildPlainText,
  formatTimestamp,
  ensureSchema,
  jobs,
  reapJobs,
  probeEngine,
  resetEngineProbe: () => { engineProbe = null; },
  resolveThreads,
  MAX_AUDIO_BYTES,
  MAX_CHUNK_BYTES,
  SAMPLE_RATE,
  BYTES_PER_SECOND,
  MARK_INTERVAL_SEC
};
