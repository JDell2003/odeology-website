/* Owner transcription routes — logic suite with stubbed db, role resolution
   and child_process.spawn (no Python required to run this).

   The point of most of these assertions is the privacy contract, not the
   happy path: video/containers are refused, audio lives only in the OS temp
   dir, and the temp dir is gone on every exit path.

   Run: node tests/transcribe.server.js */
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');

const db = require('../core/db');
const roleGuard = require('../core/roleGuard');
const childProcess = require('child_process');

/* ---------- stubs, all installed BEFORE requiring the module under test ---------- */

let fakeFlags = null;
let queries = [];

db.isConfigured = () => true;
db.query = async (sql, values) => {
  const text = String(sql);
  queries.push({ sql: text, values });
  if (/INSERT INTO app_owner_transcripts/i.test(text)) {
    return {
      rows: [{
        id: '33333333-3333-4333-8333-333333333333',
        title: values[1],
        source_filename: values[2],
        duration_sec: values[3],
        model: values[4],
        language: values[5],
        text: values[6],
        segments: JSON.parse(values[7]),
        created_at: '2026-07-29T00:00:00Z'
      }]
    };
  }
  return { rows: [] };
};

roleGuard.resolveSessionRoleFlags = async () => fakeFlags;

// Fake worker. `--selfcheck` reports a healthy engine; a real run streams the
// same NDJSON contract scripts/transcribe_worker.py emits.
let engineHealthy = true;
let spawnCalls = [];
childProcess.spawn = (cmd, args) => {
  spawnCalls.push({ cmd, args });
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  const selfcheck = args.includes('--selfcheck');
  setImmediate(() => {
    if (selfcheck) {
      if (!engineHealthy) {
        child.stderr.emit('data', Buffer.from('faster-whisper not importable: No module named faster_whisper\n'));
        child.emit('close', 1);
        return;
      }
      child.stdout.emit('data', Buffer.from(JSON.stringify({ ok: true, faster_whisper: '1.0.3' }) + '\n'));
      child.emit('close', 0);
      return;
    }
    child.stdout.emit('data', Buffer.from(
      JSON.stringify({ type: 'meta', language: 'en', duration: 32 }) + '\n' +
      JSON.stringify({ type: 'segment', start: 0.0, end: 6.0, text: 'First thing I want to say.' }) + '\n' +
      JSON.stringify({ type: 'segment', start: 6.0, end: 12.5, text: 'Still inside the first block.' }) + '\n'
    ));
    child.stdout.emit('data', Buffer.from(
      JSON.stringify({ type: 'segment', start: 16.0, end: 22.0, text: 'This one starts a new block.' }) + '\n' +
      JSON.stringify({ type: 'done', segments: 3 }) + '\n'
    ));
    child.emit('close', 0);
  });
  return child;
};

delete require.cache[require.resolve('../core/transcribeRoutes')];
const transcribeRoutes = require('../core/transcribeRoutes');
const P = transcribeRoutes._private;

/* ---------- harness ---------- */

function fakeReq(method, body, isRaw) {
  const r = new Readable({ read() {} });
  if (body != null) r.push(Buffer.isBuffer(body) ? body : Buffer.from(isRaw ? body : JSON.stringify(body)));
  r.push(null);
  r.method = method;
  r.headers = { cookie: 'sid=x' };
  return r;
}
function fakeRes() {
  const res = { status: 0, body: null };
  res.writeHead = (s) => { res.status = s; };
  res.end = (b) => { try { res.body = JSON.parse(String(b || '{}')); } catch { res.body = String(b || ''); } };
  return res;
}
const mkUrl = (p, qs = '') => new URL(`http://x${p}${qs}`);

async function call(method, p, { body, raw, qs } = {}) {
  const res = fakeRes();
  const handled = await transcribeRoutes(fakeReq(method, body, raw), res, mkUrl(p, qs || ''));
  return { handled, status: res.status, body: res.body };
}

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + extra}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OWNER = { userId: '99999999-9999-4999-8999-999999999999', owner: true, trainer: true, manager: true, explicitClient: true, clientAccess: true, trainerOnly: false };
const TRAINER = { userId: '11111111-1111-4111-8111-111111111111', owner: false, trainer: true, manager: false, explicitClient: false, clientAccess: false, trainerOnly: true };
const CLIENT = { userId: '22222222-2222-4222-8222-222222222222', owner: false, trainer: false, manager: false, explicitClient: true, clientAccess: true, trainerOnly: false };

// 1 second of silence = 16000 samples * 2 bytes.
const pcmSeconds = (n) => Buffer.alloc(P.SAMPLE_RATE * 2 * n);

async function waitForJob(id, wanted, timeoutMs = 4000) {
  const started = Date.now();
  for (;;) {
    const r = await call('GET', `/api/owner/transcribe/jobs/${id}`);
    if (r.body && r.body.job && wanted.includes(r.body.job.status)) return r.body.job;
    if (Date.now() - started > timeoutMs) return (r.body && r.body.job) || null;
    await sleep(40);
  }
}

/* ---------- suite ---------- */

(async () => {
  console.log('--- routing + access floor ---');
  fakeFlags = OWNER;
  const other = await call('GET', '/api/other/thing');
  check('ignores paths outside its prefix', other.handled === false);

  fakeFlags = null;
  let r = await call('GET', '/api/owner/transcribe/status');
  check('unauthenticated -> 401', r.status === 401, JSON.stringify(r.body));

  fakeFlags = TRAINER;
  r = await call('GET', '/api/owner/transcribe/status');
  check('trainer-only session -> 403 (trainers excluded)', r.status === 403, JSON.stringify(r.body));
  r = await call('POST', '/api/owner/transcribe/jobs', { body: {} });
  check('trainer cannot create a job -> 403', r.status === 403, JSON.stringify(r.body));

  fakeFlags = CLIENT;
  r = await call('GET', '/api/owner/transcribe/status');
  check('client session -> 403', r.status === 403, JSON.stringify(r.body));

  console.log('\n--- feature flag ---');
  fakeFlags = OWNER;
  delete process.env.TRANSCRIBE_ENABLED;
  r = await call('GET', '/api/owner/transcribe/status');
  check('flag off: status still readable', r.status === 200 && r.body.enabled === false, JSON.stringify(r.body));
  check('flag off: engine reported unavailable', r.body.engine.available === false);
  r = await call('POST', '/api/owner/transcribe/jobs', { body: { sampleRate: 16000, channels: 1, totalBytes: 32000 } });
  check('flag off: job creation -> 503 flag_off', r.status === 503 && r.body.code === 'flag_off', JSON.stringify(r.body));
  check('flag off: no job was registered', P.jobs.size === 0);

  console.log('\n--- engine availability ---');
  process.env.TRANSCRIBE_ENABLED = 'true';
  engineHealthy = false;
  P.resetEngineProbe();
  r = await call('GET', '/api/owner/transcribe/status');
  check('engine missing: status says so with a reason',
    r.status === 200 && r.body.engine.available === false && /faster_whisper/.test(r.body.engine.detail),
    JSON.stringify(r.body && r.body.engine));
  r = await call('POST', '/api/owner/transcribe/jobs', { body: { sampleRate: 16000, channels: 1, totalBytes: 32000, filename: 'a.mp4' } });
  check('engine missing -> 503 engine_unavailable', r.status === 503 && r.body.code === 'engine_unavailable', JSON.stringify(r.body));
  check('engine missing: no job registered', P.jobs.size === 0);
  engineHealthy = true;
  P.resetEngineProbe();

  console.log('\n--- temp storage guarantees ---');
  const tempRoot = P.resolveTempRoot();
  check('temp root is under the OS temp dir', tempRoot.startsWith(path.resolve(os.tmpdir())), tempRoot);
  const repoRoot = path.resolve(__dirname, '..');
  check('temp root is NOT inside the repo', !tempRoot.toLowerCase().startsWith(repoRoot.toLowerCase()), tempRoot);

  console.log('\n--- container sniffing (the no-video backstop) ---');
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(20)]);
  check('detects MP4/MOV ftyp', P.detectContainer(mp4) === 'MP4/MOV');
  check('detects Matroska/WebM', P.detectContainer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0])) === 'Matroska/WebM');
  check('detects RIFF/WAV', P.detectContainer(Buffer.from('RIFF....WAVEfmt ')) === 'RIFF/WAV/AVI');
  check('detects Ogg', P.detectContainer(Buffer.from('OggS....')) === 'Ogg');
  check('detects ID3/MP3', P.detectContainer(Buffer.from('ID3\x03\x00\x00')) === 'MP3/ID3');
  check('detects raw MPEG frame sync', P.detectContainer(Buffer.from([0xff, 0xfb, 0x90, 0x00])) === 'MPEG audio');
  check('silent PCM is not a container', P.detectContainer(pcmSeconds(1)) === null);

  console.log('\n--- job creation validation ---');
  r = await call('POST', '/api/owner/transcribe/jobs', { body: { sampleRate: 48000, channels: 2, totalBytes: 32000 } });
  check('rejects non-16kHz/non-mono audio', r.status === 400 && /16000 Hz mono/.test(r.body.error), JSON.stringify(r.body));
  r = await call('POST', '/api/owner/transcribe/jobs', { body: { sampleRate: 16000, channels: 1, totalBytes: P.MAX_AUDIO_BYTES + 32 } });
  check('rejects oversized audio -> 413', r.status === 413, JSON.stringify(r.body));
  r = await call('POST', '/api/owner/transcribe/jobs', { body: { sampleRate: 16000, channels: 1, totalBytes: 32001 } });
  check('rejects a partial 16-bit sample', r.status === 400, JSON.stringify(r.body));

  console.log('\n--- a video upload is refused and destroys the job ---');
  r = await call('POST', '/api/owner/transcribe/jobs', {
    body: { sampleRate: 16000, channels: 1, totalBytes: 32000 * 2, filename: 'clip.mov', durationSec: 2 }
  });
  check('job created for the container test', r.status === 200, JSON.stringify(r.body));
  const videoJobId = r.body.job.id;
  const videoJobDir = P.jobDir(videoJobId);
  check('temp dir exists while uploading', fs.existsSync(videoJobDir), videoJobDir);
  r = await call('PUT', `/api/owner/transcribe/jobs/${videoJobId}/chunk`, { body: mp4, raw: true, qs: '?index=0' });
  check('MP4 bytes rejected -> 415 container_rejected', r.status === 415 && r.body.code === 'container_rejected', JSON.stringify(r.body));
  await sleep(60);
  check('temp dir wiped after container rejection', !fs.existsSync(videoJobDir), videoJobDir);
  const rejected = await call('GET', `/api/owner/transcribe/jobs/${videoJobId}`);
  check('rejected job is in error state', rejected.body.job.status === 'error', JSON.stringify(rejected.body));

  console.log('\n--- happy path: create -> chunk -> complete -> transcript -> wipe ---');
  queries = [];
  spawnCalls = [];
  r = await call('POST', '/api/owner/transcribe/jobs', {
    body: { sampleRate: 16000, channels: 1, totalBytes: 32000 * 3, filename: 'talk.mov', title: 'Hook day take 1', durationSec: 3 }
  });
  check('job created', r.status === 200 && r.body.job.status === 'uploading', JSON.stringify(r.body));
  const jobId = r.body.job.id;
  const dir = P.jobDir(jobId);

  r = await call('POST', '/api/owner/transcribe/jobs', { body: { sampleRate: 16000, channels: 1, totalBytes: 32000 } });
  check('queue guard: second job -> 429 job_in_progress', r.status === 429 && r.body.code === 'job_in_progress', JSON.stringify(r.body));

  r = await call('PUT', `/api/owner/transcribe/jobs/${jobId}/chunk`, { body: pcmSeconds(1), raw: true, qs: '?index=0' });
  check('chunk 0 accepted', r.status === 200 && r.body.job.receivedBytes === 32000, JSON.stringify(r.body));
  r = await call('PUT', `/api/owner/transcribe/jobs/${jobId}/chunk`, { body: pcmSeconds(1), raw: true, qs: '?index=5' });
  check('out-of-order chunk -> 409', r.status === 409, JSON.stringify(r.body));
  r = await call('PUT', `/api/owner/transcribe/jobs/${jobId}/chunk`, { body: pcmSeconds(1), raw: true, qs: '?index=1' });
  check('chunk 1 accepted', r.status === 200 && r.body.job.receivedBytes === 64000, JSON.stringify(r.body));

  r = await call('POST', `/api/owner/transcribe/jobs/${jobId}/complete`);
  check('premature complete -> 400 upload_incomplete', r.status === 400 && r.body.code === 'upload_incomplete', JSON.stringify(r.body));
  check('premature complete does NOT destroy a resumable job', r.body.expectedIndex === 2, JSON.stringify(r.body));

  const stillThere = fs.existsSync(dir);
  r = await call('PUT', `/api/owner/transcribe/jobs/${jobId}/chunk`, { body: pcmSeconds(1), raw: true, qs: '?index=2' });
  check('final chunk accepted', r.status === 200 && r.body.job.uploadPercent === 100, JSON.stringify(r.body));
  check('audio was buffered on disk during upload', stillThere);
  check('PCM on disk matches what was sent', fs.existsSync(path.join(dir, 'audio.pcm')) && fs.statSync(path.join(dir, 'audio.pcm')).size === 96000);

  r = await call('POST', `/api/owner/transcribe/jobs/${jobId}/complete`);
  check('complete -> queued', r.status === 200 && ['queued', 'running'].includes(r.body.job.status), JSON.stringify(r.body));

  const done = await waitForJob(jobId, ['done', 'error']);
  check('job reached done', done && done.status === 'done', JSON.stringify(done));
  check('transcript id returned', Boolean(done && done.transcriptId));
  check('worker was spawned with int8 + model + pcm path', spawnCalls.some((c) =>
    c.args.includes('--compute-type') && c.args.includes('int8') && c.args.some((a) => String(a).endsWith('audio.pcm'))));
  check('worker thread count is capped, not host core count', (() => {
    const run = spawnCalls.find((c) => c.args.includes('--threads'));
    const n = Number(run && run.args[run.args.indexOf('--threads') + 1]);
    return n >= 1 && n <= 4;
  })());

  await sleep(80);
  check('TEMP DIR WIPED after success', !fs.existsSync(dir), dir);
  check('temp root has no leftover job dirs', !fs.existsSync(tempRoot) || fs.readdirSync(tempRoot).length === 0,
    fs.existsSync(tempRoot) ? fs.readdirSync(tempRoot).join(',') : '');

  console.log('\n--- what actually reaches the database ---');
  const writes = queries.filter((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q.sql));
  check('only one write, and it is the transcript insert',
    writes.length === 1 && /INSERT INTO app_owner_transcripts/i.test(writes[0].sql),
    writes.map((w) => w.sql.slice(0, 60)).join(' | '));
  const insert = writes[0];
  check('insert stores transcript text, not audio', typeof insert.values[6] === 'string' && /First thing I want to say/.test(insert.values[6]));
  check('no Buffer/binary is ever bound to a query',
    !queries.some((q) => (q.values || []).some((v) => Buffer.isBuffer(v))));
  check('no table other than app_owner_transcripts is written',
    !queries.some((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q.sql) && !/app_owner_transcripts/i.test(q.sql)));

  console.log('\n--- cancel wipes audio too ---');
  r = await call('POST', '/api/owner/transcribe/jobs', {
    body: { sampleRate: 16000, channels: 1, totalBytes: 32000, filename: 'x.mov', durationSec: 1 }
  });
  const cancelId = r.body.job.id;
  const cancelDir = P.jobDir(cancelId);
  await call('PUT', `/api/owner/transcribe/jobs/${cancelId}/chunk`, { body: pcmSeconds(1), raw: true, qs: '?index=0' });
  check('temp dir exists before cancel', fs.existsSync(cancelDir));
  r = await call('POST', `/api/owner/transcribe/jobs/${cancelId}/cancel`);
  check('cancel -> 200 canceled', r.status === 200 && r.body.job.status === 'canceled', JSON.stringify(r.body));
  await sleep(60);
  check('TEMP DIR WIPED after cancel', !fs.existsSync(cancelDir), cancelDir);

  console.log('\n--- streaming upload: over-declared size reconciled at complete ---');
  // The streaming extractor can't know the exact PCM length up front, so it
  // declares an upper bound and reports the real figure via finalBytes.
  queries = [];
  r = await call('POST', '/api/owner/transcribe/jobs', {
    body: { sampleRate: 16000, channels: 1, totalBytes: 32000 * 4, filename: 'stream.mp4', durationSec: 4 }
  });
  const streamId = r.body.job.id;
  const streamDir = P.jobDir(streamId);
  await call('PUT', `/api/owner/transcribe/jobs/${streamId}/chunk`, { body: pcmSeconds(1), raw: true, qs: '?index=0' });
  await call('PUT', `/api/owner/transcribe/jobs/${streamId}/chunk`, { body: pcmSeconds(1), raw: true, qs: '?index=1' });

  r = await call('POST', `/api/owner/transcribe/jobs/${streamId}/complete`, { body: { finalBytes: 999 } });
  check('finalBytes that disagrees with what arrived -> 400', r.status === 400 && r.body.code === 'upload_incomplete', JSON.stringify(r.body));
  r = await call('POST', `/api/owner/transcribe/jobs/${streamId}/complete`, { body: { finalBytes: 32000 * 9 } });
  check('finalBytes above the declared bound -> 400', r.status === 400, JSON.stringify(r.body));
  r = await call('POST', `/api/owner/transcribe/jobs/${streamId}/complete`, { body: { finalBytes: 64000 } });
  check('honest finalBytes below the declared bound -> accepted', r.status === 200 && ['queued', 'running'].includes(r.body.job.status), JSON.stringify(r.body));
  check('duration is recomputed from the real byte count', r.body.job.durationSec === 2, JSON.stringify(r.body.job.durationSec));
  check('totalBytes shrinks to what actually arrived', r.body.job.totalBytes === 64000, String(r.body.job.totalBytes));

  const streamDone = await waitForJob(streamId, ['done', 'error']);
  check('streamed job transcribes to done', streamDone && streamDone.status === 'done', JSON.stringify(streamDone));
  await sleep(80);
  check('TEMP DIR WIPED after a streamed job', !fs.existsSync(streamDir), streamDir);

  console.log('\n--- cross-owner isolation ---');
  fakeFlags = { ...OWNER, userId: '88888888-8888-4888-8888-888888888888' };
  r = await call('GET', `/api/owner/transcribe/jobs/${jobId}`);
  check('another owner cannot read this job -> 404', r.status === 404, JSON.stringify(r.body));
  fakeFlags = OWNER;

  console.log('\n--- transcript shaping (~15s marks) ---');
  check('formats mm:ss under an hour', P.formatTimestamp(75) === '1:15', P.formatTimestamp(75));
  check('formats h:mm:ss over an hour', P.formatTimestamp(3725) === '1:02:05', P.formatTimestamp(3725));
  check('mark interval is 15s', P.MARK_INTERVAL_SEC === 15);
  const blocks = P.buildMarkedBlocks([
    { start: 0, end: 6, text: 'One.' },
    { start: 6, end: 12.5, text: 'Two.' },
    { start: 16, end: 22, text: 'Three.' },
    { start: 22, end: 28, text: 'Four.' },
    { start: 33, end: 40, text: 'Five.' }
  ]);
  check('groups segments into ~15s blocks', blocks.length === 3, JSON.stringify(blocks.map((b) => b.at)));
  check('first block merges without splitting sentences', blocks[0].text === 'One. Two.' && blocks[0].at === '0:00', JSON.stringify(blocks[0]));
  check('second block starts at its own segment time', blocks[1].at === '0:16', JSON.stringify(blocks[1]));
  check('third block rolls past 30s', blocks[2].at === '0:33', JSON.stringify(blocks[2]));
  check('plain text joins every segment', P.buildPlainText([{ text: ' a ' }, { text: 'b' }]) === 'a b');

  console.log('\n--- unknown routes ---');
  r = await call('GET', '/api/owner/transcribe/nope');
  check('unknown subpath -> 404', r.status === 404, JSON.stringify(r.body));

  await P.sweepTempRoot();
  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('SUITE CRASHED', err);
  process.exit(1);
});
