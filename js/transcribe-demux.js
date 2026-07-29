/* ====================================================================
   MP4 / MOV STREAMING AUDIO DEMUXER — for the owner Transcribe page.

   WHY THIS EXISTS: the Web Audio path (`decodeAudioData`) needs the whole
   file in an ArrayBuffer, which caps usable input at ~1.5 GB and makes a
   3-hour phone recording impossible. This module reads the container's
   sample tables, then pulls the audio samples off disk in small slices via
   File.slice() and feeds them to WebCodecs. Peak memory is a few MB
   regardless of whether the file is 200 MB or 20 GB — the video payload is
   never read at all, only the audio track's byte ranges.

   Scope is deliberate: MP4/MOV with AAC (or Opus/MP3-in-MP4), which is what
   every phone produces. Anything else returns null and the caller falls back
   to the Web Audio path. This never reads or transmits video samples.

   Exposes window.OdeTranscribeDemux:
     isSupported()                       -> WebCodecs available
     sniffMp4(file)                      -> Promise<boolean>
     probe(file)                         -> Promise<TrackInfo|null>
     streamPcm16k(file, opts)            -> Promise<{durationSec, path}>
   ==================================================================== */
(function () {
  'use strict';

  var TARGET_RATE = 16000;
  // Decode/resample in ~20s segments: big enough that the browser's
  // resampler boundary effects are irrelevant for speech, small enough that
  // peak memory stays ~4 MB (20s * 48kHz * 4 bytes).
  var SEGMENT_SECONDS = 20;
  // Cap how many encoded frames sit in the decoder queue at once.
  var MAX_QUEUE = 24;
  // Read encoded samples off disk in batches rather than one slice per frame
  // (AAC frames are ~400 bytes; per-frame slices would be thousands of reads).
  var READ_BATCH_BYTES = 1 * 1024 * 1024;

  function isSupported() {
    return typeof window.AudioDecoder === 'function'
      && typeof window.EncodedAudioChunk === 'function'
      && (typeof window.OfflineAudioContext === 'function' || typeof window.webkitOfflineAudioContext === 'function');
  }

  async function readRange(file, start, length) {
    if (length <= 0) return new Uint8Array(0);
    var end = Math.min(file.size, start + length);
    if (start >= file.size) return new Uint8Array(0);
    return new Uint8Array(await file.slice(start, end).arrayBuffer());
  }

  function fourcc(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  /* ---------- top-level box walk (header reads only) ---------- */

  async function topLevelBoxes(file) {
    var boxes = [];
    var pos = 0;
    var guard = 0;
    while (pos < file.size && guard++ < 4096) {
      var head = await readRange(file, pos, 16);
      if (head.length < 8) break;
      var view = new DataView(head.buffer, head.byteOffset, head.length);
      var size = view.getUint32(0);
      var type = fourcc(head, 4);
      var headerLen = 8;
      if (size === 1) {
        if (head.length < 16) break;
        // 64-bit size. Number is exact well past any real file size.
        size = view.getUint32(8) * 4294967296 + view.getUint32(12);
        headerLen = 16;
      } else if (size === 0) {
        size = file.size - pos; // extends to EOF
      }
      if (size < headerLen) break;
      boxes.push({ type: type, start: pos, headerLen: headerLen, size: size });
      pos += size;
    }
    return boxes;
  }

  async function sniffMp4(file) {
    var head = await readRange(file, 0, 12);
    return head.length >= 12 && fourcc(head, 4) === 'ftyp';
  }

  /* ---------- in-memory box tree (for moov, which is small) ---------- */

  var CONTAINERS = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, edts: 1, udta: 1, wave: 1 };

  function parseTree(bytes, start, end) {
    var out = [];
    var pos = start;
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (pos + 8 <= end) {
      var size = view.getUint32(pos);
      var type = fourcc(bytes, pos + 4);
      var headerLen = 8;
      if (size === 1) {
        if (pos + 16 > end) break;
        size = view.getUint32(pos + 8) * 4294967296 + view.getUint32(pos + 12);
        headerLen = 16;
      } else if (size === 0) {
        size = end - pos;
      }
      if (size < headerLen || pos + size > end) break;
      var node = { type: type, start: pos + headerLen, end: pos + size };
      if (CONTAINERS[type]) node.children = parseTree(bytes, node.start, node.end);
      out.push(node);
      pos += size;
    }
    return out;
  }

  function find(nodes, type) {
    for (var i = 0; i < (nodes || []).length; i++) if (nodes[i].type === type) return nodes[i];
    return null;
  }
  function findAll(nodes, type) {
    return (nodes || []).filter(function (n) { return n.type === type; });
  }
  /* Depth-first search — esds can sit under stsd>mp4a directly or nested in a
     QuickTime `wave` box. */
  function findDeep(nodes, type) {
    for (var i = 0; i < (nodes || []).length; i++) {
      if (nodes[i].type === type) return nodes[i];
      if (nodes[i].children) {
        var hit = findDeep(nodes[i].children, type);
        if (hit) return hit;
      }
    }
    return null;
  }

  /* ---------- esds / AudioSpecificConfig ---------- */

  function readDescriptorLength(view, pos) {
    var length = 0;
    var read = 0;
    for (;;) {
      var b = view.getUint8(pos + read);
      read++;
      length = (length << 7) | (b & 0x7f);
      if (!(b & 0x80) || read >= 4) break;
    }
    return { length: length, read: read };
  }

  /** Pull the DecoderSpecificInfo (AudioSpecificConfig) out of an esds box. */
  function parseEsds(bytes, start, end) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var pos = start + 4; // version + flags
    if (pos >= end) return null;
    var objectTypeIndication = 0;
    // ES_Descriptor
    if (view.getUint8(pos) !== 0x03) return null;
    pos++;
    var len = readDescriptorLength(view, pos);
    pos += len.read;
    pos += 2; // ES_ID
    var flags = view.getUint8(pos); pos++;
    if (flags & 0x80) pos += 2;  // streamDependence
    if (flags & 0x40) pos += 1 + view.getUint8(pos); // URL
    if (flags & 0x20) pos += 2;  // OCR
    // DecoderConfigDescriptor
    if (pos >= end || view.getUint8(pos) !== 0x04) return null;
    pos++;
    len = readDescriptorLength(view, pos);
    pos += len.read;
    objectTypeIndication = view.getUint8(pos);
    pos += 13; // objectType(1) + streamType/bufferSize(4) + max/avgBitrate(8)
    // DecoderSpecificInfo
    if (pos >= end || view.getUint8(pos) !== 0x05) return { config: null, objectTypeIndication: objectTypeIndication };
    pos++;
    len = readDescriptorLength(view, pos);
    pos += len.read;
    var cfgEnd = Math.min(end, pos + len.length);
    return {
      config: bytes.slice(pos, cfgEnd),
      objectTypeIndication: objectTypeIndication
    };
  }

  /** AAC audio object type lives in the top 5 bits of the ASC. */
  function codecFromAsc(asc) {
    if (!asc || !asc.length) return 'mp4a.40.2';
    var objectType = asc[0] >> 3;
    if (objectType === 31 && asc.length > 1) objectType = 32 + ((asc[0] & 0x07) << 3 | (asc[1] >> 5));
    return 'mp4a.40.' + objectType;
  }

  /* ---------- sample tables ---------- */

  function parseStsd(bytes, node) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var pos = node.start + 4; // version + flags
    var entryCount = view.getUint32(pos); pos += 4;
    if (!entryCount) return null;
    var entrySize = view.getUint32(pos);
    var format = fourcc(bytes, pos + 4);
    var entryStart = pos;
    var entryEnd = Math.min(node.end, pos + entrySize);

    // AudioSampleEntry: 8 (size+format) + 6 reserved + 2 dataRefIdx = 16,
    // then version(2) revision(2) vendor(4) channels(2) sampleSize(2)
    // compressionId(2) packetSize(2) sampleRate(4, 16.16 fixed) = 20 -> 36.
    var p = entryStart + 16;
    var version = view.getUint16(p);
    var channels = view.getUint16(p + 8);
    var sampleRate = view.getUint32(p + 16) / 65536;
    var childStart = entryStart + 36;
    if (version === 1) {
      childStart += 16; // samplesPerPacket, bytesPerPacket, bytesPerFrame, bytesPerSample
    } else if (version === 2) {
      // V2 stores the real values as float64/uint32 after a 16-byte preamble.
      var v2 = entryStart + 36 + 4;
      sampleRate = view.getFloat64(v2);
      channels = view.getUint32(v2 + 8);
      childStart = entryStart + 36 + 36;
    }
    var children = childStart < entryEnd ? parseTree(bytes, childStart, entryEnd) : [];
    return {
      format: format,
      channels: channels || 2,
      sampleRate: Math.round(sampleRate) || 0,
      children: children,
      entryStart: entryStart,
      entryEnd: entryEnd
    };
  }

  function parseStts(bytes, node) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var pos = node.start + 4;
    var count = view.getUint32(pos); pos += 4;
    var runs = [];
    for (var i = 0; i < count && pos + 8 <= node.end; i++) {
      runs.push({ count: view.getUint32(pos), delta: view.getUint32(pos + 4) });
      pos += 8;
    }
    return runs;
  }

  function parseStsz(bytes, node) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var pos = node.start + 4;
    var uniform = view.getUint32(pos); pos += 4;
    var count = view.getUint32(pos); pos += 4;
    if (uniform) return { uniform: uniform, count: count, sizes: null };
    var sizes = new Uint32Array(count);
    for (var i = 0; i < count && pos + 4 <= node.end; i++) { sizes[i] = view.getUint32(pos); pos += 4; }
    return { uniform: 0, count: count, sizes: sizes };
  }

  function parseStsc(bytes, node) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var pos = node.start + 4;
    var count = view.getUint32(pos); pos += 4;
    var runs = [];
    for (var i = 0; i < count && pos + 12 <= node.end; i++) {
      runs.push({
        firstChunk: view.getUint32(pos),
        samplesPerChunk: view.getUint32(pos + 4),
        descIndex: view.getUint32(pos + 8)
      });
      pos += 12;
    }
    return runs;
  }

  function parseChunkOffsets(bytes, stco, co64) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var offsets = [];
    if (stco) {
      var pos = stco.start + 4;
      var count = view.getUint32(pos); pos += 4;
      for (var i = 0; i < count && pos + 4 <= stco.end; i++) { offsets.push(view.getUint32(pos)); pos += 4; }
    } else if (co64) {
      var p = co64.start + 4;
      var c = view.getUint32(p); p += 4;
      for (var j = 0; j < c && p + 8 <= co64.end; j++) {
        offsets.push(view.getUint32(p) * 4294967296 + view.getUint32(p + 4));
        p += 8;
      }
    }
    return offsets;
  }

  /** Flatten the sample tables into a per-sample [offset, size, timestamp] list. */
  function buildSamples(stts, stsz, stsc, offsets, timescale) {
    var sampleCount = stsz.count;
    var sizes = new Uint32Array(sampleCount);
    var i;
    if (stsz.uniform) { for (i = 0; i < sampleCount; i++) sizes[i] = stsz.uniform; }
    else sizes = stsz.sizes;

    var deltas = new Uint32Array(sampleCount);
    var idx = 0;
    for (i = 0; i < stts.length && idx < sampleCount; i++) {
      for (var k = 0; k < stts[i].count && idx < sampleCount; k++) deltas[idx++] = stts[i].delta;
    }
    // A truncated stts (some muxers) — hold the last delta.
    var lastDelta = idx > 0 ? deltas[idx - 1] : 1024;
    while (idx < sampleCount) deltas[idx++] = lastDelta;

    var offsetsOut = new Float64Array(sampleCount);
    var sample = 0;
    for (var run = 0; run < stsc.length && sample < sampleCount; run++) {
      var firstChunk = stsc[run].firstChunk;
      var perChunk = stsc[run].samplesPerChunk;
      var lastChunk = run + 1 < stsc.length ? stsc[run + 1].firstChunk - 1 : offsets.length;
      for (var chunk = firstChunk; chunk <= lastChunk && sample < sampleCount; chunk++) {
        var base = offsets[chunk - 1];
        if (base == null) break;
        var cursor = base;
        for (var s = 0; s < perChunk && sample < sampleCount; s++) {
          offsetsOut[sample] = cursor;
          cursor += sizes[sample];
          sample++;
        }
      }
    }
    if (sample < sampleCount) sampleCount = sample; // trust what we could map

    var timestamps = new Float64Array(sampleCount);
    var t = 0;
    for (i = 0; i < sampleCount; i++) { timestamps[i] = t; t += deltas[i]; }

    return {
      count: sampleCount,
      sizes: sizes,
      offsets: offsetsOut,
      timestamps: timestamps,
      deltas: deltas,
      totalTicks: t,
      timescale: timescale
    };
  }

  /* ---------- probe: find the audio track without reading media ---------- */

  async function probe(file) {
    if (!(await sniffMp4(file))) return null;
    var boxes = await topLevelBoxes(file);
    var moovBox = null;
    for (var i = 0; i < boxes.length; i++) if (boxes[i].type === 'moov') moovBox = boxes[i];
    if (!moovBox) return null;
    // moov holds the tables only; even for a 3-hour file this is a few MB.
    var moovBytes = await readRange(file, moovBox.start, moovBox.size);
    if (moovBytes.length < moovBox.size) return null;
    // parseTree starts INSIDE moov, so this is already moov's child list —
    // there is no enclosing 'moov' node to look for here.
    var moovChildren = parseTree(moovBytes, moovBox.headerLen, moovBytes.length);
    var traks = findAll(moovChildren, 'trak');
    for (var t = 0; t < traks.length; t++) {
      var mdia = find(traks[t].children, 'mdia');
      if (!mdia) continue;
      var hdlr = find(mdia.children, 'hdlr');
      if (!hdlr) continue;
      var handler = fourcc(moovBytes, hdlr.start + 8);
      if (handler !== 'soun') continue;

      var mdhd = find(mdia.children, 'mdhd');
      if (!mdhd) continue;
      var mv = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
      var version = mv.getUint8(mdhd.start);
      var timescale, trackDuration;
      if (version === 1) {
        timescale = mv.getUint32(mdhd.start + 4 + 16);
        trackDuration = mv.getUint32(mdhd.start + 4 + 20) * 4294967296 + mv.getUint32(mdhd.start + 4 + 24);
      } else {
        timescale = mv.getUint32(mdhd.start + 4 + 8);
        trackDuration = mv.getUint32(mdhd.start + 4 + 12);
      }

      var minf = find(mdia.children, 'minf');
      var stbl = minf && find(minf.children, 'stbl');
      if (!stbl) continue;
      var stsdNode = find(stbl.children, 'stsd');
      var sttsNode = find(stbl.children, 'stts');
      var stszNode = find(stbl.children, 'stsz') || find(stbl.children, 'stz2');
      var stscNode = find(stbl.children, 'stsc');
      var stcoNode = find(stbl.children, 'stco');
      var co64Node = find(stbl.children, 'co64');
      if (!stsdNode || !sttsNode || !stszNode || !stscNode || (!stcoNode && !co64Node)) continue;

      var stsd = parseStsd(moovBytes, stsdNode);
      if (!stsd) continue;

      var asc = null;
      var esdsNode = findDeep(stsd.children, 'esds');
      var objectTypeIndication = 0;
      if (esdsNode) {
        var esds = parseEsds(moovBytes, esdsNode.start, esdsNode.end);
        if (esds) { asc = esds.config; objectTypeIndication = esds.objectTypeIndication; }
      }

      var codec = null;
      if (stsd.format === 'mp4a') {
        // 0x69 / 0x6b are MPEG-1/2 Layer III in MP4.
        codec = (objectTypeIndication === 0x69 || objectTypeIndication === 0x6b) ? 'mp3' : codecFromAsc(asc);
      } else if (stsd.format === 'Opus' || stsd.format === 'opus') {
        codec = 'opus';
        var dOps = findDeep(stsd.children, 'dOps');
        if (dOps) asc = moovBytes.slice(dOps.start, dOps.end);
      } else if (stsd.format === '.mp3' || stsd.format === 'mp3 ') {
        codec = 'mp3';
      } else if (stsd.format === 'alac') {
        codec = 'alac';
      } else {
        continue; // unknown audio codec — caller falls back
      }

      var samples = buildSamples(
        parseStts(moovBytes, sttsNode),
        parseStsz(moovBytes, stszNode),
        parseStsc(moovBytes, stscNode),
        parseChunkOffsets(moovBytes, stcoNode, co64Node),
        timescale
      );
      if (!samples.count) continue;

      var durationSec = timescale
        ? (trackDuration || samples.totalTicks) / timescale
        : samples.totalTicks / 44100;

      return {
        codec: codec,
        format: stsd.format,
        description: asc && asc.length ? asc : null,
        sampleRate: stsd.sampleRate || 44100,
        channels: stsd.channels || 2,
        timescale: timescale || 44100,
        durationSec: durationSec,
        samples: samples,
        // Sanity signal for the caller: how much of the file we actually touch.
        audioBytes: (function () {
          var total = 0;
          for (var n = 0; n < samples.count; n++) total += samples.sizes[n];
          return total;
        })()
      };
    }
    return null;
  }

  /* ---------- resampling ---------- */

  function OfflineCtor() {
    return window.OfflineAudioContext || window.webkitOfflineAudioContext;
  }

  /** Resample a mono Float32Array to 16 kHz using the browser's resampler. */
  async function resampleMonoTo16k(mono, sourceRate) {
    if (!mono.length) return new Float32Array(0);
    if (sourceRate === TARGET_RATE) return mono;
    var frames = Math.max(1, Math.round(mono.length * TARGET_RATE / sourceRate));
    var Offline = OfflineCtor();
    var ctx = new Offline(1, frames, TARGET_RATE);
    var buffer = ctx.createBuffer(1, mono.length, sourceRate);
    buffer.copyToChannel ? buffer.copyToChannel(mono, 0) : buffer.getChannelData(0).set(mono);
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    var rendered = await ctx.startRendering();
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

  /** Pull an AudioData's channels out and mix to mono Float32. */
  function audioDataToMono(audioData) {
    var frames = audioData.numberOfFrames;
    var channels = audioData.numberOfChannels;
    var mono = new Float32Array(frames);
    var plane = new Float32Array(frames);
    var format = 'f32-planar';
    for (var c = 0; c < channels; c++) {
      audioData.copyTo(plane, { planeIndex: c, format: format });
      for (var i = 0; i < frames; i++) mono[i] += plane[i];
    }
    if (channels > 1) for (var j = 0; j < frames; j++) mono[j] /= channels;
    return mono;
  }

  /* ---------- streaming decode ---------- */

  /**
   * Decode the audio track to 16 kHz mono PCM, handing the caller Int16Array
   * blocks as they are produced. Nothing larger than one ~20s segment is ever
   * resident, so a 3-hour 12 GB file uses the same memory as a 3-minute clip.
   *
   * opts: { onPcm(Int16Array), onProgress(percent, note), signal }
   */
  async function streamPcm16k(file, opts) {
    var options = opts || {};
    var onPcm = options.onPcm || function () {};
    var onProgress = options.onProgress || function () {};

    var info = options.info || await probe(file);
    if (!info) throw new Error('No readable MP4/MOV audio track');
    if (!isSupported()) throw new Error('WebCodecs AudioDecoder is unavailable');

    var samples = info.samples;
    var sourceRate = info.sampleRate;
    var segmentTarget = Math.max(1, Math.round(SEGMENT_SECONDS * sourceRate));

    var pending = [];          // decoded mono Float32 blocks awaiting resample
    var pendingFrames = 0;
    var emittedSamples = 0;
    var decodeError = null;

    async function flushSegment(force) {
      while (pendingFrames >= segmentTarget || (force && pendingFrames > 0)) {
        var take = force ? pendingFrames : segmentTarget;
        var merged = new Float32Array(take);
        var filled = 0;
        while (filled < take && pending.length) {
          var head = pending[0];
          var need = take - filled;
          if (head.length <= need) {
            merged.set(head, filled);
            filled += head.length;
            pending.shift();
          } else {
            merged.set(head.subarray(0, need), filled);
            pending[0] = head.subarray(need);
            filled += need;
          }
        }
        pendingFrames -= filled;
        var resampled = await resampleMonoTo16k(merged.subarray(0, filled), sourceRate);
        var pcm = floatToPcm16(resampled);
        emittedSamples += pcm.length;
        onPcm(pcm);
        if (!force) continue;
        if (!pendingFrames) break;
      }
    }

    var decoder = new window.AudioDecoder({
      output: function (audioData) {
        try {
          if (audioData.numberOfFrames > 0) {
            var mono = audioDataToMono(audioData);
            pending.push(mono);
            pendingFrames += mono.length;
          }
        } catch (err) {
          decodeError = decodeError || err;
        } finally {
          audioData.close();
        }
      },
      error: function (err) { decodeError = decodeError || err; }
    });

    var config = {
      codec: info.codec,
      sampleRate: sourceRate,
      numberOfChannels: info.channels
    };
    if (info.description) config.description = info.description;

    if (typeof window.AudioDecoder.isConfigSupported === 'function') {
      var support = await window.AudioDecoder.isConfigSupported(config);
      if (!support || !support.supported) throw new Error('This browser cannot decode ' + info.codec + ' audio');
    }
    decoder.configure(config);

    // Walk the samples in file order, reading in ~1 MB batches.
    var index = 0;
    var total = samples.count;
    var lastReport = -1;
    try {
      while (index < total) {
        if (options.signal && options.signal.aborted) throw new Error('Canceled');

        // Group contiguous samples into one read.
        var batchStart = index;
        var readStart = samples.offsets[index];
        var readEnd = readStart + samples.sizes[index];
        var batchEnd = index + 1;
        while (batchEnd < total) {
          var nextStart = samples.offsets[batchEnd];
          var nextEnd = nextStart + samples.sizes[batchEnd];
          if (nextStart < readEnd) break;                       // non-monotonic: stop the batch
          if (nextEnd - readStart > READ_BATCH_BYTES) break;     // batch is big enough
          readEnd = nextEnd;
          batchEnd++;
        }
        var blob = await readRange(file, readStart, readEnd - readStart);
        if (!blob.length) break;

        for (var s = batchStart; s < batchEnd; s++) {
          var rel = samples.offsets[s] - readStart;
          var len = samples.sizes[s];
          if (rel < 0 || rel + len > blob.length) continue;
          var tsUs = Math.round(samples.timestamps[s] / info.timescale * 1e6);
          var durUs = Math.round(samples.deltas[s] / info.timescale * 1e6);
          decoder.decode(new window.EncodedAudioChunk({
            type: 'key',                       // every AAC/Opus/MP3 frame is a sync frame
            timestamp: tsUs,
            duration: durUs || undefined,
            data: blob.subarray(rel, rel + len)
          }));
        }
        index = batchEnd;

        // Backpressure: let the decoder drain, and resample what's ready.
        while (decoder.decodeQueueSize > MAX_QUEUE) {
          if (decodeError) throw decodeError;
          await new Promise(function (r) { setTimeout(r, 4); });
        }
        await flushSegment(false);
        if (decodeError) throw decodeError;

        var percent = Math.round((index / total) * 100);
        if (percent !== lastReport) {
          lastReport = percent;
          onProgress(percent, 'decoding audio ' + percent + '%');
        }
      }

      await decoder.flush();
      if (decodeError) throw decodeError;
      await flushSegment(true);
    } finally {
      try { decoder.close(); } catch (err) { /* already closed */ }
    }

    return {
      durationSec: emittedSamples / TARGET_RATE,
      path: 'WebCodecs streaming (' + info.codec + ')',
      audioBytesRead: info.audioBytes
    };
  }

  window.OdeTranscribeDemux = {
    isSupported: isSupported,
    sniffMp4: sniffMp4,
    probe: probe,
    streamPcm16k: streamPcm16k,
    _internals: {
      parseTree: parseTree,
      parseEsds: parseEsds,
      codecFromAsc: codecFromAsc,
      buildSamples: buildSamples,
      floatToPcm16: floatToPcm16,
      TARGET_RATE: TARGET_RATE,
      SEGMENT_SECONDS: SEGMENT_SECONDS
    }
  };
})();
