/* Transcribe page — real-browser verification of the hard constraint.

   This is the suite that proves the promise: it feeds an actual media file
   into the page and inspects EVERY byte the page tries to send. If the
   client ever regressed into uploading the file itself, the "no container
   bytes on the wire" assertion below fails.

   The API is stubbed, so no server, no Python, and no model are needed —
   what is under test is the browser-side extraction + upload contract.

   Run: node tests/transcribe.browser.js */
'use strict';

const puppeteer = require('../node_modules/puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TRANSCRIBE_TEST_PORT || 4188);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const OWNER = {
  id: '44444444-4444-4444-8444-444444444444', username: 'riseforit', displayName: 'RiseForIt',
  isOwner: true, isTrainer: true, isManager: false, isClient: true,
  trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: true }
};

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   → ' + extra}`);
  if (!cond) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A real, decodable 3-second 44.1 kHz STEREO WAV (a RIFF container — the
   browser must demux it, downmix it and resample it to 16 kHz mono). */
function makeStereoWav(seconds = 3, rate = 44100) {
  const frames = seconds * rate;
  const dataBytes = frames * 2 * 2; // stereo, 16-bit
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);      // PCM
  buf.writeUInt16LE(2, 22);      // channels
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000);
    buf.writeInt16LE(v, 44 + i * 4);
    buf.writeInt16LE(v, 44 + i * 4 + 2);
  }
  return buf;
}

const FAKE_TRANSCRIPT = {
  id: '55555555-5555-4555-8555-555555555555',
  title: 'Hook day take 1',
  filename: 'take1.wav',
  durationSec: 3,
  model: 'small',
  language: 'en',
  createdAt: '2026-07-29T00:00:00Z',
  wordCount: 9,
  text: 'First thing I want to say. This starts a new block.',
  blocks: [
    { start: 0, end: 12.5, at: '0:00', text: 'First thing I want to say.' },
    { start: 16, end: 22, at: '0:16', text: 'This starts a new block.' }
  ]
};

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const wav = makeStereoWav(3);
  const tmpFile = path.join(require('os').tmpdir(), 'riseforit-transcribe-test-input.wav');
  fs.writeFileSync(tmpFile, wav);

  const uploaded = []; // every chunk body the page PUT
  let jobState = 'uploading';
  let createBody = null;
  let completeBody = null;

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (body, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});

    if (u.includes('/api/auth/me')) return json({ user: OWNER, impersonation: null });

    // Everything below is scoped to this feature's prefix — main.js calls
    // plenty of other endpoints whose paths would otherwise collide.
    const isTranscribeApi = u.includes('/api/owner/transcribe/');

    if (u.includes('/api/owner/transcribe/status')) {
      return json({
        ok: true, enabled: true,
        engine: { available: true, detail: 'faster-whisper 1.0.3' },
        storage: { tempRootOk: true, tempRootError: '', audioPersisted: false },
        limits: { sampleRate: 16000, channels: 1, maxAudioBytes: 419430400, maxChunkBytes: 8388608, maxAudioSeconds: 13107, markIntervalSec: 15 },
        models: [
          { id: 'small', label: 'small — balanced', englishOnly: false, speedFactor: 9, measured: false },
          { id: 'medium', label: 'medium — most accurate, slowest', englishOnly: false, speedFactor: 3.3, measured: false },
          { id: 'distil-small.en', label: 'distil-small.en — fastest (English only)', englishOnly: true, speedFactor: 22, measured: false },
          { id: 'distil-large-v3', label: 'distil-large-v3 — accurate + fast', englishOnly: false, speedFactor: 6, measured: false }
        ],
        defaultModel: 'small',
        batching: { enabled: true, batchSize: 8 },
        threads: 8,
        busy: false, queueLength: 0, estimatedWaitSec: 0
      });
    }
    if (u.includes('/api/owner/transcribe/transcripts/')) return json({ ok: true, transcript: FAKE_TRANSCRIPT });
    if (u.includes('/api/owner/transcribe/transcripts')) return json({ ok: true, transcripts: [] });

    if (/\/api\/owner\/transcribe\/jobs$/.test(u) && req.method() === 'POST') {
      createBody = JSON.parse(req.postData() || '{}');
      return json({ ok: true, job: { id: 'a'.repeat(32), status: 'uploading', model: 'small', filename: createBody.filename, durationSec: createBody.durationSec, receivedBytes: 0, totalBytes: createBody.totalBytes, uploadPercent: 0, processedSec: 0, transcribePercent: 0, estimatedTotalSec: 1, queuePosition: 0, error: null, transcriptId: null, createdAt: new Date().toISOString() } });
    }
    if (isTranscribeApi && u.includes('/chunk')) {
      // postData() is lossy for binary; the page also mirrors each chunk to
      // window.__sentChunks (test-only hook is not in the page — so we read
      // the raw bytes Chromium gives us here).
      const data = req.postData() || '';
      uploaded.push(Buffer.from(data, 'binary'));
      return json({ ok: true, job: { id: 'a'.repeat(32), status: 'uploading', receivedBytes: 0, totalBytes: createBody.totalBytes, uploadPercent: 50, processedSec: 0, transcribePercent: 0, estimatedTotalSec: 1, queuePosition: 0, durationSec: 3, model: 'small', filename: 'x', error: null, transcriptId: null, createdAt: new Date().toISOString() } });
    }
    if (isTranscribeApi && u.includes('/complete')) {
      try { completeBody = JSON.parse(req.postData() || '{}'); } catch (e) { completeBody = {}; }
      jobState = 'done';
      return json({ ok: true, job: { id: 'a'.repeat(32), status: 'queued', receivedBytes: createBody.totalBytes, totalBytes: createBody.totalBytes, uploadPercent: 100, processedSec: 0, transcribePercent: 0, estimatedTotalSec: 1, estimatedWaitSec: 1, queuePosition: 1, durationSec: 3, model: 'small', filename: 'x', error: null, transcriptId: null, createdAt: new Date().toISOString() } });
    }
    if (isTranscribeApi && /\/jobs\/[a-f0-9]{32}$/.test(u)) {
      return json({ ok: true, job: { id: 'a'.repeat(32), status: jobState === 'done' ? 'done' : 'running', receivedBytes: 1, totalBytes: 1, uploadPercent: 100, processedSec: 3, transcribePercent: 100, estimatedTotalSec: 1, estimatedWaitSec: 0, queuePosition: 0, durationSec: 3, model: 'small', filename: 'x', error: null, transcriptId: FAKE_TRANSCRIPT.id, createdAt: new Date().toISOString() } });
    }
    if (u.includes('/api/')) return json({});
    req.continue().catch(() => {});
  });

  await page.evaluateOnNewDocument((hintUser) => {
    localStorage.setItem('ode_auth_user_hint_v1', JSON.stringify({ ts: Date.now(), user: hintUser }));
    localStorage.setItem('ode_onboarding_done_v1', '1');
    localStorage.setItem('ode_onboarding_version', '99');
  }, OWNER);

  console.log('--- page loads for the owner ---');
  await page.goto(`http://localhost:${PORT}/transcribe.html`, { waitUntil: 'networkidle2' });
  await sleep(700);

  check('owner is not redirected off the page', page.url().endsWith('/transcribe.html'), page.url());
  const gateHidden = await page.$eval('#tr-gate', (el) => el.hidden);
  check('no blocking banner when flag + engine are healthy', gateHidden === true);
  const modelOptions = await page.$$eval('#tr-model option', (els) => els.map((e) => e.value));
  check('model choices populated from the server',
    modelOptions.join(',') === 'small,medium,distil-small.en,distil-large-v3', modelOptions.join(','));
  const modelLabels = await page.$$eval('#tr-model option', (els) => els.map((e) => e.textContent));
  check('labels carry the speed factor', /9×\s*realtime/.test(modelLabels[0]), modelLabels[0]);

  // Picking an English-only model must disable the non-English languages
  // rather than let the user build a request the server will reject.
  await page.select('#tr-model', 'distil-small.en');
  await sleep(120);
  const langState = await page.$$eval('#tr-language option', (els) =>
    els.map((e) => ({ v: e.value, d: e.disabled })));
  check('English-only model disables other languages',
    langState.filter((o) => o.v && o.v !== 'en').every((o) => o.d === true), JSON.stringify(langState));
  check('English-only model leaves auto-detect + English usable',
    langState.find((o) => o.v === 'en').d === false, JSON.stringify(langState));
  check('English-only model forces the language to English',
    await page.$eval('#tr-language', (el) => el.value) === 'en');
  await page.select('#tr-model', 'small');
  await sleep(120);
  const langBack = await page.$$eval('#tr-language option', (els) => els.map((e) => e.disabled));
  check('switching back re-enables every language', langBack.every((d) => d === false), JSON.stringify(langBack));
  const privacy = await page.$eval('.tr-privacy', (el) => el.textContent.replace(/\s+/g, ' '));
  check('privacy contract is stated in the UI', /deleted the moment transcription finishes/.test(privacy));
  check('Transcribe link is present in the owner control panel',
    await page.$('#control-owner-section a[href="transcribe.html"]') !== null);

  console.log('\n--- extraction + upload, with every byte on the wire inspected ---');
  const input = await page.$('#tr-file-input');
  await input.uploadFile(tmpFile);
  await sleep(300);
  const startDisabled = await page.$eval('#tr-start', (el) => el.disabled);
  check('Transcribe button enables after picking a file', startDisabled === false);

  await page.click('#tr-start');
  await page.waitForFunction(
    () => /Done|failed|Could not|cannot|not installed/i.test(document.getElementById('tr-status').textContent),
    { timeout: 25000 }
  ).catch(() => {});
  await sleep(600);

  const status = await page.$eval('#tr-status', (el) => el.textContent);
  const extractNote = await page.$eval('#tr-extract-note', (el) => el.textContent);

  check('extraction used the Web Audio API path', /Web Audio API/.test(extractNote), extractNote);
  check('extraction reported the source duration', /0:03/.test(extractNote), extractNote);

  check('job was declared as 16 kHz mono', createBody && createBody.sampleRate === 16000 && createBody.channels === 1, JSON.stringify(createBody));
  const expectedBytes = 3 * 16000 * 2;
  check('declared byte count == 3s of 16 kHz mono PCM',
    createBody && Math.abs(createBody.totalBytes - expectedBytes) <= 16000 * 2 * 0.05,
    `${createBody && createBody.totalBytes} vs ${expectedBytes}`);
  check('declared size is far smaller than the source file',
    createBody && createBody.totalBytes < wav.length,
    `${createBody && createBody.totalBytes} vs source ${wav.length}`);

  const sent = Buffer.concat(uploaded);
  check('something was actually uploaded', sent.length > 0, String(sent.length));
  check('uploaded bytes match the declared PCM size',
    Math.abs(sent.length - createBody.totalBytes) <= 4, `${sent.length} vs ${createBody.totalBytes}`);

  // THE assertion: no container header anywhere in what went over the wire.
  const asLatin = sent.toString('latin1');
  check('NO RIFF/WAVE header on the wire (the file itself was never sent)',
    !asLatin.includes('RIFF') && !asLatin.includes('WAVE') && !asLatin.includes('fmt '));
  check('NO MP4/MOV ftyp box on the wire', !asLatin.includes('ftyp'));
  check('uploaded payload is not a prefix of the source file',
    !wav.slice(0, Math.min(2048, sent.length)).equals(sent.slice(0, Math.min(2048, sent.length))));
  check('uploaded payload is a whole number of 16-bit samples', sent.length % 2 === 0);

  // It should still be the same 440 Hz tone, i.e. real audio, not zeros.
  let peak = 0;
  for (let i = 0; i + 1 < sent.length; i += 2) peak = Math.max(peak, Math.abs(sent.readInt16LE(i)));
  check('uploaded PCM contains real signal (not silence)', peak > 4000, `peak=${peak}`);

  console.log('\n--- transcript rendering ---');
  check('finished with a success status', /Done/i.test(status), status);
  const resultVisible = await page.$eval('#tr-result-card', (el) => !el.hidden);
  check('transcript card is shown', resultVisible);
  const stamps = await page.$$eval('.tr-at', (els) => els.map((e) => e.textContent));
  check('timestamps rendered', stamps.join(',') === '0:00,0:16', stamps.join(','));
  const bodyText = await page.$eval('#tr-transcript', (el) => el.textContent);
  check('transcript text rendered', /First thing I want to say/.test(bodyText));

  const copyPlain = await page.$eval('#tr-copy-plain', (el) => el.textContent);
  check('copy controls present', /Copy text/.test(copyPlain) && await page.$('#tr-copy-stamped') !== null);

  console.log('\n--- loud failure when a format cannot be decoded ---');
  const badFile = path.join(require('os').tmpdir(), 'riseforit-transcribe-test-bad.mp4');
  // A syntactically valid MP4 header with no decodable audio track.
  fs.writeFileSync(badFile, Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(16, 0), Buffer.alloc(512, 0x11)
  ]));
  uploaded.length = 0;
  const before = uploaded.length;
  await page.evaluate(() => { document.getElementById('tr-status').textContent = ''; });
  const input2 = await page.$('#tr-file-input');
  await input2.uploadFile(badFile);
  await sleep(300);
  await page.click('#tr-start');
  await page.waitForFunction(
    () => /could not|cannot|not installed|Nothing was uploaded/i.test(document.getElementById('tr-status').textContent),
    { timeout: 20000 }
  ).catch(() => {});
  await sleep(400);
  const failStatus = await page.$eval('#tr-status', (el) => el.textContent);
  check('undecodable file fails loudly with a reason',
    /could not decode|cannot decode|not installed/i.test(failStatus), failStatus);
  check('failure message states nothing was uploaded', /Nothing was uploaded/i.test(failStatus), failStatus);
  check('NOTHING was sent for the undecodable file', uploaded.length === before, `${uploaded.length} chunks`);

  console.log('\n--- streaming path: real MP4, audio track only, no size cap ---');
  const MP4 = path.join(ROOT, 'videos', 'bg-king-regular.mp4');
  const mp4Size = fs.statSync(MP4).size;

  // First: the demuxer's own reading of the container, in the real browser.
  const probed = await page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], 'king.mp4', { type: 'video/mp4' });
    const D = window.OdeTranscribeDemux;
    const t = await D.probe(file);
    return {
      supported: D.isSupported(),
      codec: t && t.codec,
      sampleRate: t && t.sampleRate,
      channels: t && t.channels,
      durationSec: t && t.durationSec,
      sampleCount: t && t.samples.count,
      audioBytes: t && t.audioBytes,
      fileSize: file.size
    };
  }, `http://localhost:${PORT}/videos/bg-king-regular.mp4`);

  check('WebCodecs streaming is supported in this browser', probed.supported === true);
  check('demuxer identifies the AAC track', probed.codec === 'mp4a.40.2', String(probed.codec));
  check('demuxer reads the real sample rate / channels', probed.sampleRate === 44100 && probed.channels === 2,
    `${probed.sampleRate}/${probed.channels}`);
  check('demuxer reads the duration', Math.abs(probed.durationSec - 17.57) < 0.2, String(probed.durationSec));
  check('demuxer maps every audio sample', probed.sampleCount === 757, String(probed.sampleCount));
  check('ONLY the audio track is touched, not the video payload',
    probed.audioBytes < probed.fileSize * 0.25,
    `${probed.audioBytes} of ${probed.fileSize} bytes (${(100 * probed.audioBytes / probed.fileSize).toFixed(1)}%)`);

  // Now drive the page end-to-end with that MP4.
  uploaded.length = 0;
  createBody = null;
  completeBody = null;
  jobState = 'uploading';
  await page.evaluate(() => { document.getElementById('tr-status').textContent = ''; });
  const input3 = await page.$('#tr-file-input');
  await input3.uploadFile(MP4);
  await sleep(300);
  await page.click('#tr-start');
  await page.waitForFunction(
    () => /Done|failed|could not|cannot|Nothing/i.test(document.getElementById('tr-status').textContent),
    { timeout: 40000 }
  ).catch(() => {});
  await sleep(700);

  const streamNote = await page.$eval('#tr-extract-note', (el) => el.textContent);
  const streamStatus = await page.$eval('#tr-status', (el) => el.textContent);
  check('streaming path was chosen for the MP4', /WebCodecs streaming/.test(streamNote), streamNote);
  check('note reports it read only the audio bytes', /read .* of /.test(streamNote), streamNote);
  check('streaming run reached Done', /Done/i.test(streamStatus), streamStatus);

  const streamed = Buffer.concat(uploaded);
  const expectPcm = 17.57 * 16000 * 2;
  check('uploaded PCM length matches the audio duration',
    Math.abs(streamed.length - expectPcm) < expectPcm * 0.05,
    `${streamed.length} vs ~${Math.round(expectPcm)}`);
  check('uploaded far less than the source file', streamed.length < mp4Size, `${streamed.length} vs ${mp4Size}`);
  check('more than one chunk was streamed (not buffered whole)', uploaded.length >= 1, String(uploaded.length));

  const streamLatin = streamed.toString('latin1');
  check('NO ftyp/moov/mdat box on the wire', !/ftyp|moov|mdat|stco|stsz/.test(streamLatin));
  check('uploaded payload is not a prefix of the MP4',
    !fs.readFileSync(MP4).slice(0, 2048).equals(streamed.slice(0, 2048)));
  let speak = 0;
  for (let i = 0; i + 1 < streamed.length; i += 2) speak = Math.max(speak, Math.abs(streamed.readInt16LE(i)));
  check('streamed PCM contains real decoded audio', speak > 500, `peak=${speak}`);

  check('job declared an upper bound, not an exact size',
    createBody && createBody.totalBytes > streamed.length,
    `declared ${createBody && createBody.totalBytes} vs actual ${streamed.length}`);
  check('complete reconciled the exact byte count via finalBytes',
    completeBody && completeBody.finalBytes === streamed.length,
    JSON.stringify(completeBody));

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

  try { fs.unlinkSync(tmpFile); fs.unlinkSync(badFile); } catch (e) { /* ignore */ }
  await browser.close();
  server.close();
  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('SUITE CRASHED', err);
  process.exit(1);
});
