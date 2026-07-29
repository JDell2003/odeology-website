/* ====================================================================
   TRANSCRIBE (owner only) — client-side audio extraction + chunked upload.

   THE RULE THIS FILE EXISTS TO ENFORCE: the chosen video file is read
   ONLY by this tab. What crosses the network is a 16 kHz mono 16-bit PCM
   stream decoded in-browser. There is no code path here that posts the
   original File/Blob anywhere — if extraction fails, the job fails loudly
   with an explanation and nothing is sent.

   Extraction path A (preferred, and what runs for essentially every phone
   recording): Web Audio. `OfflineAudioContext(1, 1, 16000).decodeAudioData`
   uses the browser's own demuxer/decoder for the container's audio track
   and resamples to the context rate in one pass, so we never materialise a
   48 kHz stereo copy.

   Extraction path B (fallback): ffmpeg.wasm, used only when the browser
   refuses the container. It is NOT bundled — it loads from
   /vendor/ffmpeg/ (see deploy/transcription/README.md). If those assets
   are absent, path B reports that clearly instead of silently degrading.
   ==================================================================== */
(function () {
  'use strict';

  var API = '/api/owner/transcribe';
  var TARGET_RATE = 16000;
  var UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB of PCM ~= 131s of audio
  var CHUNK_RETRIES = 3;
  var POLL_MS = 2500;
  // Above this the tab has to hold the whole compressed file in an
  // ArrayBuffer to decode it, and browsers start failing the allocation.
  // We stop before that and say so rather than crashing the tab.
  var SOFT_FILE_BYTES = 1.5 * 1024 * 1024 * 1024;
  var FFMPEG_BASE = 'vendor/ffmpeg/';

  var els = {};
  var state = {
    file: null,
    status: null,
    job: null,
    pcm: null,
    polling: null,
    busy: false,
    canceled: false,
    lastTranscript: null,
    extractionPath: ''
  };

  /* ---------------- small helpers ---------------- */

  function $(id) { return document.getElementById(id); }

  function setStatus(message, kind) {
    if (!els.status) return;
    els.status.textContent = message || '';
    els.status.className = 'tr-status' + (kind ? ' ' + kind : '');
  }

  function showGate(message) {
    if (!els.gate) return;
    if (!message) { els.gate.hidden = true; els.gate.textContent = ''; return; }
    els.gate.hidden = false;
    els.gate.textContent = message;
  }

  function fmtBytes(n) {
    var b = Number(n) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  function fmtClock(totalSeconds) {
    var s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var mm = String(m).padStart(2, '0');
    var ss = String(sec).padStart(2, '0');
    return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
  }

  function fmtWait(seconds) {
    var s = Math.max(0, Math.round(Number(seconds) || 0));
    if (s < 60) return s + ' sec';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }

  function setBar(barEl, percent) {
    if (barEl) barEl.style.width = Math.max(0, Math.min(100, Number(percent) || 0)) + '%';
  }

  function markStepDone(stepEl, done) {
    if (stepEl) stepEl.classList.toggle('is-done', Boolean(done));
  }

  async function api(path, options) {
    var opts = options || {};
    var resp = await fetch(API + path, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: opts.headers || (opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json' } : undefined),
      body: opts.body,
      signal: opts.signal
    });
    var json = null;
    try { json = await resp.json(); } catch (err) { /* non-JSON error page */ }
    if (!resp.ok || !json || json.ok === false) {
      var error = new Error((json && json.error) || ('Request failed (' + resp.status + ')'));
      error.status = resp.status;
      error.code = json && json.code;
      error.payload = json;
      throw error;
    }
    return json;
  }

  /* ---------------- audio extraction (never uploads the file) ---------------- */

  function AudioExtractionError(message, detail) {
    var err = new Error(message);
    err.name = 'AudioExtractionError';
    err.detail = detail || '';
    return err;
  }

  function mixToMono(audioBuffer) {
    var channels = audioBuffer.numberOfChannels;
    var length = audioBuffer.length;
    if (channels === 1) return audioBuffer.getChannelData(0);
    var out = new Float32Array(length);
    for (var c = 0; c < channels; c++) {
      var data = audioBuffer.getChannelData(c);
      for (var i = 0; i < length; i++) out[i] += data[i];
    }
    for (var j = 0; j < length; j++) out[j] /= channels;
    return out;
  }

  /* Explicit resample, only needed when a browser ignores the offline
     context's sample rate during decode (older Safari). */
  async function resampleTo16k(audioBuffer) {
    var frames = Math.max(1, Math.ceil(audioBuffer.duration * TARGET_RATE));
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var offline = new Offline(1, frames, TARGET_RATE);
    var source = offline.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offline.destination); // downmixes to the 1-channel destination
    source.start(0);
    var rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  }

  function floatToPcm16(float32) {
    var out = new Int16Array(float32.length);
    for (var i = 0; i < float32.length; i++) {
      var s = float32[i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  async function extractViaWebAudio(file, onProgress) {
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) throw AudioExtractionError('This browser has no Web Audio support, so audio cannot be extracted here.');

    onProgress(8, 'reading file');
    var buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (err) {
      throw AudioExtractionError(
        'Could not read "' + file.name + '" into memory (' + fmtBytes(file.size) + '). It is too large for in-browser audio extraction.',
        String((err && err.message) || err)
      );
    }

    onProgress(30, 'decoding audio track');
    var context = new Offline(1, 1, TARGET_RATE);
    var decoded;
    try {
      // Promise form first; Safari still needs the callback form.
      decoded = await new Promise(function (resolve, reject) {
        var maybe = context.decodeAudioData(buffer, resolve, reject);
        if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
      });
    } catch (err) {
      throw AudioExtractionError(
        'This browser could not decode the audio track in "' + file.name + '".',
        String((err && err.message) || err || 'decodeAudioData failed')
      );
    }
    if (!decoded || !decoded.length) {
      throw AudioExtractionError('"' + file.name + '" decoded to an empty audio track — there is nothing to transcribe.');
    }

    onProgress(70, 'downsampling to 16 kHz mono');
    var mono;
    if (decoded.sampleRate === TARGET_RATE) {
      mono = mixToMono(decoded);
    } else {
      mono = await resampleTo16k(decoded);
    }

    onProgress(88, 'packing PCM');
    var pcm = floatToPcm16(mono);
    onProgress(100, 'done');
    return { pcm: pcm, durationSec: pcm.length / TARGET_RATE, path: 'Web Audio API' };
  }

  async function ffmpegAssetsPresent() {
    try {
      var resp = await fetch(FFMPEG_BASE + 'ffmpeg.js', { method: 'HEAD' });
      return resp.ok;
    } catch (err) {
      return false;
    }
  }

  /* Fallback for containers the browser's own decoder rejects. Loads the
     self-hosted ffmpeg.wasm build if it has been vendored; otherwise says
     so plainly. It still only ever emits extracted PCM. */
  async function extractViaFfmpegWasm(file, onProgress) {
    if (!(await ffmpegAssetsPresent())) {
      throw AudioExtractionError(
        'This browser cannot decode "' + file.name + '", and the ffmpeg.wasm fallback is not installed on this server.',
        'Vendor @ffmpeg/ffmpeg + @ffmpeg/core into /vendor/ffmpeg/ (see deploy/transcription/README.md), or re-export the clip as .mp4 (H.264/AAC) or .m4a and try again.'
      );
    }
    onProgress(10, 'loading ffmpeg.wasm');
    if (!window.FFmpeg) {
      await new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = FFMPEG_BASE + 'ffmpeg.js';
        script.onload = resolve;
        script.onerror = function () { reject(AudioExtractionError('Failed to load the ffmpeg.wasm fallback.')); };
        document.head.appendChild(script);
      });
    }
    if (!window.FFmpeg || !window.FFmpeg.createFFmpeg) {
      throw AudioExtractionError('The ffmpeg.wasm fallback loaded but exposed no API.');
    }
    var ffmpeg = window.FFmpeg.createFFmpeg({ log: false, corePath: FFMPEG_BASE + 'ffmpeg-core.js' });
    ffmpeg.setProgress(function (p) {
      onProgress(15 + Math.max(0, Math.min(1, Number(p && p.ratio) || 0)) * 75, 'extracting audio');
    });
    await ffmpeg.load();
    var inputName = 'in' + (/\.[a-z0-9]+$/i.test(file.name) ? file.name.slice(file.name.lastIndexOf('.')) : '.bin');
    ffmpeg.FS('writeFile', inputName, new Uint8Array(await file.arrayBuffer()));
    // -vn drops video outright: even inside the wasm sandbox we never carry it.
    await ffmpeg.run('-i', inputName, '-vn', '-ac', '1', '-ar', String(TARGET_RATE), '-f', 's16le', 'out.pcm');
    var raw = ffmpeg.FS('readFile', 'out.pcm');
    try { ffmpeg.FS('unlink', inputName); ffmpeg.FS('unlink', 'out.pcm'); } catch (err) { /* ignore */ }
    try { ffmpeg.exit(); } catch (err) { /* ignore */ }
    if (!raw || !raw.length) throw AudioExtractionError('ffmpeg.wasm produced no audio from "' + file.name + '".');
    onProgress(100, 'done');
    var pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
    return { pcm: pcm, durationSec: pcm.length / TARGET_RATE, path: 'ffmpeg.wasm' };
  }

  /* Can we stream this file instead of buffering it whole? MP4/MOV + WebCodecs
     means yes, at any size — we read only the audio track's byte ranges. */
  async function probeStreamingTrack(file) {
    var demux = window.OdeTranscribeDemux;
    if (!demux || !demux.isSupported()) return null;
    try {
      if (!(await demux.sniffMp4(file))) return null;
      return await demux.probe(file);
    } catch (err) {
      return null; // unreadable tables — fall back to the buffered path
    }
  }

  /* Buffered fallback: needs the whole file in an ArrayBuffer, hence the cap.
     Only reached for containers the streaming demuxer doesn't handle. */
  async function extractAudio(file, onProgress) {
    if (file.size > SOFT_FILE_BYTES) {
      throw AudioExtractionError(
        '"' + file.name + '" is ' + fmtBytes(file.size) + ', and it is not an MP4/MOV this browser can stream.',
        'Files this large are only supported as .mp4/.mov (which stream without a size limit). Re-export it as MP4, or export audio-only (.m4a), and try again. The file was not uploaded.'
      );
    }
    try {
      return await extractViaWebAudio(file, onProgress);
    } catch (webAudioErr) {
      if (webAudioErr.name !== 'AudioExtractionError') throw webAudioErr;
      setStatus('Browser decode failed — trying the ffmpeg.wasm fallback…', 'warn');
      try {
        return await extractViaFfmpegWasm(file, onProgress);
      } catch (ffmpegErr) {
        // Loud, specific failure. Never a silent fall-through to uploading video.
        var lines = [webAudioErr.message];
        if (webAudioErr.detail) lines.push('Decoder said: ' + webAudioErr.detail);
        lines.push(ffmpegErr.message);
        if (ffmpegErr.detail) lines.push(ffmpegErr.detail);
        lines.push('Nothing was uploaded.');
        throw AudioExtractionError(lines.join(' '));
      }
    }
  }

  /* ---------------- upload ----------------
     One uploader serves both paths. The streaming path pushes PCM into it as
     the decoder produces it, so nothing accumulates: a 3-hour file holds one
     4 MB staging buffer, same as a 3-minute one. */

  function makeUploader(jobId, declaredBytes, onProgress) {
    var staging = new Uint8Array(UPLOAD_CHUNK_BYTES);
    var used = 0;
    var index = 0;
    var sent = 0;

    async function put(slice) {
      var attempt = 0;
      for (;;) {
        try {
          await api('/jobs/' + jobId + '/chunk?index=' + index, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: slice
          });
          break;
        } catch (err) {
          attempt++;
          // A 4xx is a decision, not a blip — do not retry into it.
          if (attempt >= CHUNK_RETRIES || (err.status >= 400 && err.status < 500)) throw err;
          await new Promise(function (r) { setTimeout(r, 800 * attempt); });
        }
      }
      index++;
      sent += slice.byteLength;
      var pct = declaredBytes ? Math.min(100, (sent / declaredBytes) * 100) : 0;
      onProgress(pct, fmtBytes(sent) + (declaredBytes ? ' of ~' + fmtBytes(declaredBytes) : ''));
    }

    return {
      async push(int16) {
        if (state.canceled) throw new Error('Canceled');
        var bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
        var offset = 0;
        while (offset < bytes.length) {
          var room = UPLOAD_CHUNK_BYTES - used;
          var take = Math.min(room, bytes.length - offset);
          staging.set(bytes.subarray(offset, offset + take), used);
          used += take;
          offset += take;
          if (used === UPLOAD_CHUNK_BYTES) {
            await put(staging.subarray(0, used));
            used = 0;
          }
        }
        if (sent + used > declaredBytes) {
          throw new Error('Extracted audio ran past the declared size — job aborted before overrunning the server limit.');
        }
      },
      async finish() {
        if (used > 0) {
          await put(staging.subarray(0, used));
          used = 0;
        }
        return sent;
      },
      sentBytes: function () { return sent; }
    };
  }

  /* ---------------- job polling ---------------- */

  function stopPolling() {
    if (state.polling) { clearTimeout(state.polling); state.polling = null; }
  }

  function pollJob(jobId) {
    stopPolling();
    var tick = async function () {
      var json;
      try {
        json = await api('/jobs/' + jobId);
      } catch (err) {
        setStatus('Lost track of the job: ' + err.message, 'error');
        finishRun();
        return;
      }
      var job = json.job;
      state.job = job;

      if (job.status === 'queued') {
        setBar(els.workBar, 0);
        els.workNote.textContent = 'queued (position ' + job.queuePosition + ')';
        els.eta.textContent = 'Estimated wait: ' + fmtWait(job.estimatedWaitSec);
        setStatus('Waiting for the transcription slot — one job runs at a time.', '');
      } else if (job.status === 'running') {
        setBar(els.workBar, job.transcribePercent);
        els.workNote.textContent = job.transcribePercent + '% (' + fmtClock(job.processedSec) + ' of ' + fmtClock(job.durationSec) + ')';
        els.eta.textContent = 'About ' + fmtWait(job.estimatedWaitSec) + ' left';
        setStatus('Transcribing on the server. The uploaded audio is deleted the moment this finishes.', '');
      } else if (job.status === 'done') {
        setBar(els.workBar, 100);
        markStepDone(els.stepWork, true);
        els.workNote.textContent = 'complete';
        els.eta.textContent = '';
        setStatus('Done — audio deleted, transcript saved.', 'ok');
        finishRun();
        if (job.transcriptId) await openTranscript(job.transcriptId);
        loadLibrary();
        return;
      } else if (job.status === 'error') {
        els.workNote.textContent = 'failed';
        els.eta.textContent = '';
        setStatus(job.error || 'Transcription failed.', 'error');
        finishRun();
        return;
      } else if (job.status === 'canceled') {
        els.workNote.textContent = 'canceled';
        els.eta.textContent = '';
        setStatus('Job canceled — the uploaded audio was deleted.', '');
        finishRun();
        return;
      }
      state.polling = setTimeout(tick, POLL_MS);
    };
    state.polling = setTimeout(tick, 400);
  }

  /* ---------------- run ---------------- */

  function beginRun() {
    state.busy = true;
    state.canceled = false;
    els.start.disabled = true;
    els.cancel.hidden = false;
    els.stage.hidden = false;
    els.resultCard.hidden = true;
    setBar(els.extractBar, 0); setBar(els.uploadBar, 0); setBar(els.workBar, 0);
    markStepDone(els.stepExtract, false); markStepDone(els.stepUpload, false); markStepDone(els.stepWork, false);
    els.extractNote.textContent = ''; els.uploadNote.textContent = ''; els.workNote.textContent = '';
  }

  function finishRun() {
    stopPolling();
    state.busy = false;
    state.pcm = null;
    els.cancel.hidden = true;
    els.start.disabled = !state.file;
  }

  async function createJob(file, durationSec, totalBytes) {
    var created = await api('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        title: (els.title.value || '').trim() || file.name,
        durationSec: Math.max(1, Math.round(durationSec)),
        sampleRate: TARGET_RATE,
        channels: 1,
        totalBytes: totalBytes,
        model: els.model.value || undefined,
        language: els.language.value || ''
      })
    });
    return created.job;
  }

  function handleCreateFailure(err) {
    setStatus(err.message, 'error');
    if (err.code === 'job_in_progress' && err.payload && err.payload.job) {
      state.job = err.payload.job;
      els.cancel.hidden = false;
      pollJob(err.payload.job.id);
      return true; // took over polling the existing job
    }
    finishRun();
    return false;
  }

  var uploadProgress = function (percent, note) {
    setBar(els.uploadBar, percent);
    els.uploadNote.textContent = note || '';
  };
  var extractProgress = function (percent, note) {
    setBar(els.extractBar, percent);
    els.extractNote.textContent = note || '';
  };

  /* STREAMING PATH — MP4/MOV of any size. Decode and upload run together, so
     neither the video nor the full PCM is ever resident. */
  async function runStreaming(file, track) {
    var durationSec = track.durationSec;
    // The PCM length is deterministic (duration x 32 kB/s); declare an upper
    // bound with slack and reconcile the exact figure at /complete.
    var estimate = Math.ceil(durationSec * TARGET_RATE * 2 * 1.15);
    if (estimate % 2) estimate++;
    var maxBytes = (state.status && state.status.limits && state.status.limits.maxAudioBytes) || estimate;
    if (estimate > maxBytes) {
      setBar(els.extractBar, 0);
      els.extractNote.textContent = 'too long';
      setStatus(
        '"' + file.name + '" is ' + fmtClock(durationSec) + ' long — the per-job limit is about '
        + Math.floor(maxBytes / (TARGET_RATE * 2) / 60) + ' minutes of audio. Split the recording and try again. Nothing was uploaded.',
        'error'
      );
      finishRun();
      return;
    }

    var job;
    try {
      job = await createJob(file, durationSec, estimate);
    } catch (err) { handleCreateFailure(err); return; }
    state.job = job;
    state.extractionPath = 'WebCodecs streaming';

    var uploader = makeUploader(job.id, estimate, uploadProgress);
    try {
      setStatus('Streaming audio out of "' + file.name + '" (' + fmtBytes(file.size) + ') — only the audio track is read, and only audio uploads.', '');
      var result = await window.OdeTranscribeDemux.streamPcm16k(file, {
        info: track,
        onProgress: extractProgress,
        onPcm: function (pcm) { return uploader.push(pcm); },
        signal: { get aborted() { return state.canceled; } }
      });
      var finalBytes = await uploader.finish();
      state.extractionPath = result.path;
      markStepDone(els.stepExtract, true);
      els.extractNote.textContent = result.path + ' · ' + fmtClock(result.durationSec)
        + ' · read ' + fmtBytes(result.audioBytesRead) + ' of ' + fmtBytes(file.size);
      await api('/jobs/' + job.id + '/complete', {
        method: 'POST',
        body: JSON.stringify({ finalBytes: finalBytes })
      });
      markStepDone(els.stepUpload, true);
    } catch (err) {
      if (state.canceled) { finishRun(); return; }
      setStatus('Streaming extraction failed: ' + err.message + ' Nothing further was uploaded.', 'error');
      try { await api('/jobs/' + job.id + '/cancel', { method: 'POST' }); } catch (e2) { /* ignore */ }
      finishRun();
      return;
    }
    pollJob(job.id);
  }

  /* BUFFERED PATH — everything the streaming demuxer can't open. */
  async function runBuffered(file) {
    var extracted;
    try {
      setStatus('Extracting audio in your browser — the video stays on this device.', '');
      extracted = await extractAudio(file, extractProgress);
    } catch (err) {
      setBar(els.extractBar, 0);
      els.extractNote.textContent = 'failed';
      setStatus(err.message + (err.detail ? ' ' + err.detail : ''), 'error');
      finishRun();
      return;
    }
    state.extractionPath = extracted.path;
    markStepDone(els.stepExtract, true);
    els.extractNote.textContent = extracted.path + ' · ' + fmtClock(extracted.durationSec) + ' · ' + fmtBytes(extracted.pcm.byteLength);
    state.pcm = extracted.pcm;
    if (state.canceled) { finishRun(); return; }

    var job;
    try {
      job = await createJob(file, extracted.durationSec, extracted.pcm.byteLength);
    } catch (err) { handleCreateFailure(err); return; }
    state.job = job;

    var uploader = makeUploader(job.id, extracted.pcm.byteLength, uploadProgress);
    try {
      setStatus('Uploading extracted audio (' + fmtBytes(extracted.pcm.byteLength) + ') — audio only, no video.', '');
      await uploader.push(extracted.pcm);
      await uploader.finish();
      await api('/jobs/' + job.id + '/complete', { method: 'POST' });
    } catch (err) {
      setStatus('Upload failed: ' + err.message, 'error');
      try { await api('/jobs/' + job.id + '/cancel', { method: 'POST' }); } catch (e2) { /* ignore */ }
      finishRun();
      return;
    }
    markStepDone(els.stepUpload, true);
    state.pcm = null; // release the PCM copy; the server has it now
    pollJob(job.id);
  }

  async function startRun() {
    if (state.busy || !state.file) return;
    var file = state.file;
    beginRun();
    setStatus('Inspecting "' + file.name + '"…', '');
    var track = await probeStreamingTrack(file);
    if (track) return runStreaming(file, track);
    return runBuffered(file);
  }

  async function cancelRun() {
    state.canceled = true;
    var job = state.job;
    if (job && job.id) {
      try { await api('/jobs/' + job.id + '/cancel', { method: 'POST' }); } catch (err) { /* ignore */ }
    }
    setStatus('Canceled — the uploaded audio was deleted.', '');
    finishRun();
  }

  /* ---------------- transcript rendering ---------------- */

  function stampedText(transcript) {
    return (transcript.blocks || [])
      .map(function (b) { return '[' + b.at + '] ' + b.text; })
      .join('\n');
  }

  function renderTranscript(transcript) {
    state.lastTranscript = transcript;
    els.resultCard.hidden = false;
    els.resultTitle.textContent = transcript.title || 'Transcript';
    var bits = [];
    if (transcript.durationSec) bits.push(fmtClock(transcript.durationSec) + ' of audio');
    if (transcript.wordCount) bits.push(transcript.wordCount.toLocaleString() + ' words');
    if (transcript.model) bits.push('whisper ' + transcript.model);
    if (transcript.language) bits.push(transcript.language.toUpperCase());
    els.resultMeta.textContent = bits.join(' · ');

    els.transcript.textContent = '';
    var blocks = transcript.blocks || [];
    if (!blocks.length) {
      var empty = document.createElement('div');
      empty.className = 'tr-empty';
      empty.textContent = 'No speech was detected in this recording.';
      els.transcript.appendChild(empty);
      return;
    }
    var frag = document.createDocumentFragment();
    blocks.forEach(function (block) {
      var row = document.createElement('div');
      row.className = 'tr-block';
      var at = document.createElement('div');
      at.className = 'tr-at';
      at.textContent = block.at;
      var text = document.createElement('div');
      text.className = 'tr-text';
      text.textContent = block.text;
      row.appendChild(at);
      row.appendChild(text);
      frag.appendChild(row);
    });
    els.transcript.appendChild(frag);
  }

  async function openTranscript(id) {
    try {
      var json = await api('/transcripts/' + id);
      renderTranscript(json.transcript);
      els.resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setStatus('Could not load that transcript: ' + err.message, 'error');
    }
  }

  async function copyToClipboard(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(label + ' copied to the clipboard.', 'ok');
    } catch (err) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      setStatus(ok ? label + ' copied to the clipboard.' : 'Could not copy — select the text manually.', ok ? 'ok' : 'error');
    }
  }

  /* ---------------- library ---------------- */

  async function loadLibrary() {
    if (!els.library) return;
    try {
      var json = await api('/transcripts');
      var list = json.transcripts || [];
      els.library.textContent = '';
      if (!list.length) {
        var empty = document.createElement('div');
        empty.className = 'tr-empty';
        empty.textContent = 'Nothing transcribed yet.';
        els.library.appendChild(empty);
        return;
      }
      list.forEach(function (t) {
        var row = document.createElement('div');
        row.className = 'tr-item';

        var title = document.createElement('div');
        title.className = 't';
        title.textContent = t.title || t.filename || 'Untitled';

        var meta = document.createElement('div');
        meta.className = 'm';
        meta.textContent = [
          new Date(t.createdAt).toLocaleDateString(),
          fmtClock(t.durationSec),
          (t.wordCount || 0).toLocaleString() + ' words'
        ].join(' · ');

        var open = document.createElement('button');
        open.type = 'button';
        open.className = 'tr-btn';
        open.textContent = 'Open';
        open.addEventListener('click', function () { openTranscript(t.id); });

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'tr-btn danger';
        del.textContent = 'Delete';
        del.addEventListener('click', async function () {
          if (!window.confirm('Delete "' + (t.title || 'this transcript') + '"? This cannot be undone.')) return;
          try {
            await api('/transcripts/' + t.id, { method: 'DELETE' });
            if (state.lastTranscript && state.lastTranscript.id === t.id) els.resultCard.hidden = true;
            loadLibrary();
          } catch (err) {
            setStatus('Delete failed: ' + err.message, 'error');
          }
        });

        row.appendChild(title);
        row.appendChild(meta);
        row.appendChild(open);
        row.appendChild(del);
        els.library.appendChild(row);
      });
    } catch (err) {
      els.library.textContent = '';
      var fail = document.createElement('div');
      fail.className = 'tr-empty';
      fail.textContent = 'Could not load transcripts: ' + err.message;
      els.library.appendChild(fail);
    }
  }

  /* ---------------- status / gating ---------------- */

  async function loadStatus() {
    var json;
    try {
      json = await api('/status');
    } catch (err) {
      showGate('Could not reach the transcription service: ' + err.message);
      els.start.disabled = true;
      return;
    }
    state.status = json;

    els.model.textContent = '';
    (json.models || ['small']).forEach(function (m) {
      var option = document.createElement('option');
      option.value = m;
      option.textContent = m === 'medium' ? 'medium (slower, more accurate)' : 'small (faster)';
      if (m === json.defaultModel) option.selected = true;
      els.model.appendChild(option);
    });

    var blocked = '';
    if (!json.enabled) {
      blocked = 'Transcription is turned off. Set TRANSCRIBE_ENABLED=true on the server to enable it.';
    } else if (!json.engine.available) {
      blocked = 'The transcription engine is not installed on this server (' + (json.engine.detail || 'unavailable') + '). See deploy/transcription/README.md.';
    } else if (!json.storage.tempRootOk) {
      blocked = 'Refusing to run: ' + json.storage.tempRootError;
    }
    showGate(blocked);
    els.start.disabled = Boolean(blocked) || !state.file || state.busy;

    if (!blocked) {
      var limitMin = Math.floor((json.limits.maxAudioSeconds || 0) / 60);
      var note = 'Ready · one job at a time · up to ' + limitMin + ' min of audio per job.';
      if (json.busy) note += ' A job is running now — estimated wait ' + fmtWait(json.estimatedWaitSec) + '.';
      setStatus(note, '');
    }
  }

  /* ---------------- file selection ---------------- */

  function chooseFile(file) {
    if (!file) return;
    state.file = file;
    els.fileLabel.hidden = false;
    els.fileLabel.textContent = file.name + ' · ' + fmtBytes(file.size);
    if (!els.title.value.trim()) {
      els.title.value = file.name.replace(/\.[^.]+$/, '').slice(0, 200);
    }
    els.start.disabled = state.busy || Boolean(els.gate && !els.gate.hidden);
    setStatus('Ready. Press Transcribe — the audio is extracted here first, then only the audio uploads.', '');
  }

  /* ---------------- wiring ---------------- */

  function wire() {
    els = {
      gate: $('tr-gate'),
      drop: $('tr-drop'),
      fileInput: $('tr-file-input'),
      fileLabel: $('tr-file-label'),
      title: $('tr-title'),
      model: $('tr-model'),
      language: $('tr-language'),
      start: $('tr-start'),
      cancel: $('tr-cancel'),
      refresh: $('tr-refresh'),
      eta: $('tr-eta'),
      stage: $('tr-stage'),
      stepExtract: $('tr-step-extract'),
      stepUpload: $('tr-step-upload'),
      stepWork: $('tr-step-work'),
      extractBar: $('tr-extract-bar'),
      uploadBar: $('tr-upload-bar'),
      workBar: $('tr-work-bar'),
      extractNote: $('tr-extract-note'),
      uploadNote: $('tr-upload-note'),
      workNote: $('tr-work-note'),
      status: $('tr-status'),
      resultCard: $('tr-result-card'),
      resultTitle: $('tr-result-title'),
      resultMeta: $('tr-result-meta'),
      transcript: $('tr-transcript'),
      library: $('tr-library'),
      copyPlain: $('tr-copy-plain'),
      copyStamped: $('tr-copy-stamped'),
      download: $('tr-download')
    };
    if (!els.drop) return;

    els.drop.addEventListener('click', function () { els.fileInput.click(); });
    els.drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
    });
    els.drop.addEventListener('dragover', function (e) { e.preventDefault(); els.drop.classList.add('is-over'); });
    els.drop.addEventListener('dragleave', function () { els.drop.classList.remove('is-over'); });
    els.drop.addEventListener('drop', function (e) {
      e.preventDefault();
      els.drop.classList.remove('is-over');
      chooseFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    els.fileInput.addEventListener('change', function () { chooseFile(els.fileInput.files && els.fileInput.files[0]); });

    els.start.addEventListener('click', startRun);
    els.cancel.addEventListener('click', cancelRun);
    els.refresh.addEventListener('click', function () { loadStatus(); loadLibrary(); });

    els.copyPlain.addEventListener('click', function () {
      if (state.lastTranscript) copyToClipboard(state.lastTranscript.text || '', 'Transcript');
    });
    els.copyStamped.addEventListener('click', function () {
      if (state.lastTranscript) copyToClipboard(stampedText(state.lastTranscript), 'Timestamped transcript');
    });
    els.download.addEventListener('click', function () {
      var t = state.lastTranscript;
      if (!t) return;
      var blob = new Blob([stampedText(t)], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (t.title || 'transcript').replace(/[^\w\-. ]+/g, '_').slice(0, 80) + '.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });

    window.addEventListener('beforeunload', function (e) {
      if (!state.busy) return;
      e.preventDefault();
      e.returnValue = '';
    });

    loadStatus();
    loadLibrary();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
