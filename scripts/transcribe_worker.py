#!/usr/bin/env python3
"""
Owner transcription worker — faster-whisper (MIT) on CPU, int8.

Driven by core/transcribeRoutes.js. Contract:

  stdin   : unused
  argv    : --audio PATH --model {small|medium} --sample-rate 16000
            --channels 1 [--compute-type int8] [--threads N]
            [--model-dir DIR] [--language xx]
  stdout  : NDJSON, one message per line
              {"type":"meta","language":"en","duration":5412.3}
              {"type":"segment","start":0.0,"end":4.2,"text":"..."}
              {"type":"progress","seconds":123.4}
              {"type":"done","segments":812}
              {"type":"error","message":"..."}
  exit    : 0 on success, non-zero on failure

  --selfcheck : print {"ok":true,"faster_whisper":"x.y.z", ...} and exit 0
                (or exit 1 with a one-line reason). This is how the Node
                side decides whether the engine is installed at all, so it
                must never import a model or touch the network.

The audio arrives as RAW s16le PCM at 16 kHz mono — the browser already did
the extraction and downsampling, so this worker needs NO ffmpeg and never
sees a video container. It reads the PCM with numpy and hands whisper a
float32 array directly.

This worker never writes to disk and never deletes the input; the Node side
owns the temp directory and wipes it on every exit path.
"""

import argparse
import json
import os
import sys


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fail(message, code=1):
    emit({"type": "error", "message": str(message)[:500]})
    sys.stderr.write(str(message)[:500] + "\n")
    sys.exit(code)


def selfcheck():
    """Prove the runtime is installed without downloading or loading a model."""
    try:
        import faster_whisper  # noqa: F401
        import ctranslate2
        import numpy
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write("faster-whisper not importable: %s\n" % exc)
        sys.exit(1)
    emit({
        "ok": True,
        "faster_whisper": getattr(faster_whisper, "__version__", "unknown"),
        "ctranslate2": getattr(ctranslate2, "__version__", "unknown"),
        "numpy": getattr(numpy, "__version__", "unknown"),
        "python": "%d.%d.%d" % sys.version_info[:3],
    })
    sys.exit(0)


def read_pcm(path, sample_rate, channels):
    import numpy as np

    size = os.path.getsize(path)
    if size <= 0:
        fail("audio file is empty")
    frame_bytes = 2 * channels
    if size % frame_bytes != 0:
        fail("audio file is not a whole number of %d-bit frames" % (8 * frame_bytes))

    # memmap keeps peak RSS flat: a 90-minute job is ~173 MB of PCM and we
    # only materialise the float32 copy whisper actually needs.
    raw = np.memmap(path, dtype="<i2", mode="r")
    audio = np.asarray(raw, dtype=np.float32) / 32768.0
    del raw
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, len(audio) / float(sample_rate)


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--selfcheck", action="store_true")
    parser.add_argument("--audio")
    parser.add_argument("--model", default="small")
    parser.add_argument("--sample-rate", type=int, default=16000)
    parser.add_argument("--channels", type=int, default=1)
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--threads", type=int, default=0)
    parser.add_argument("--model-dir", default=None)
    parser.add_argument("--language", default=None)
    parser.add_argument("--beam-size", type=int, default=1)
    args = parser.parse_args()

    if args.selfcheck:
        selfcheck()

    if not args.audio:
        fail("--audio is required")
    if not os.path.isfile(args.audio):
        fail("audio file not found: %s" % args.audio)
    if args.sample_rate != 16000:
        fail("worker expects 16000 Hz audio, got %s" % args.sample_rate)

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        fail("faster-whisper is not installed (%s)" % exc)

    audio, duration = read_pcm(args.audio, args.sample_rate, args.channels)

    threads = args.threads if args.threads and args.threads > 0 else (os.cpu_count() or 2)
    try:
        model = WhisperModel(
            args.model,
            device="cpu",
            compute_type=args.compute_type,
            cpu_threads=threads,
            num_workers=1,
            download_root=args.model_dir or None,
        )
    except Exception as exc:  # noqa: BLE001
        fail("could not load model '%s' (%s)" % (args.model, exc))

    try:
        # beam_size=1 (greedy) is roughly 2x faster than the default beam 5 on
        # CPU for a small accuracy cost — the right trade for long-form content
        # on a shared container. vad_filter skips silence outright.
        segments, info = model.transcribe(
            audio,
            language=args.language or None,
            beam_size=args.beam_size,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
        )
    except Exception as exc:  # noqa: BLE001
        fail("transcription failed (%s)" % exc)

    emit({
        "type": "meta",
        "language": getattr(info, "language", "") or "",
        "duration": float(getattr(info, "duration", duration) or duration),
        "model": args.model,
        "compute_type": args.compute_type,
        "threads": threads,
    })

    count = 0
    last_progress = -1.0
    try:
        for seg in segments:
            text = (seg.text or "").strip()
            if text:
                emit({"type": "segment", "start": float(seg.start), "end": float(seg.end), "text": text})
                count += 1
            end = float(seg.end)
            if end - last_progress >= 5.0:
                emit({"type": "progress", "seconds": end})
                last_progress = end
    except Exception as exc:  # noqa: BLE001
        fail("transcription stream failed (%s)" % exc)

    emit({"type": "done", "segments": count})
    sys.exit(0)


if __name__ == "__main__":
    main()
