# Transcription runtime — staged, NOT part of the live build

Everything in this folder is **inert**. Nothing here is picked up by Railway
today, and merging it changes nothing about how the app builds or deploys.

That is deliberate. The service currently builds with **Railpack** (confirmed
via the Railway API: `builder: RAILPACK`) as a plain Node app. Dropping a
`Dockerfile` at the repo root would change the build for the **entire production
site** on the next push — not just this feature. So the runtime pieces live here
until you decide to promote them, after reading the resource numbers below.

With the runtime absent, the feature degrades honestly:

* `GET /api/owner/transcribe/status` returns `engine.available: false` with the
  reason, and the Transcribe page shows it as a blocking banner.
* `POST /api/owner/transcribe/jobs` returns `503 engine_unavailable`.
* No job is created, no audio is accepted, nothing is written anywhere.

---

## 1. Flag

```
TRANSCRIBE_ENABLED=true
```

Default off. With it off every route except `/status` returns `503`.
This is the only switch you need for the code path; the runtime below is what
makes it actually able to transcribe.

Optional:

| Variable | Default | Notes |
| --- | --- | --- |
| `TRANSCRIBE_MODEL` | `small` | `small` or `medium` |
| `TRANSCRIBE_PYTHON` | `python3` | interpreter used to spawn the worker |
| `TRANSCRIBE_COMPUTE_TYPE` | `int8` | ctranslate2 quantization |
| `TRANSCRIBE_THREADS` | `4` | never `os.cpus()` — that reports the host's cores, not the container's share. Lower to `2` if site latency suffers during a job |
| `TRANSCRIBE_MODEL_DIR` | HF cache | pre-baked model path (see Dockerfile) |
| `TRANSCRIBE_MAX_AUDIO_BYTES` | `419430400` (400 MB ≈ 3h30m) | per-job ceiling |
| `TRANSCRIBE_MAX_CHUNK_BYTES` | `8388608` | per-chunk ceiling |
| `TRANSCRIBE_UPLOAD_IDLE_MS` | `600000` | stalled upload → job killed, audio wiped |
| `TRANSCRIBE_MARK_INTERVAL_SEC` | `15` | transcript timestamp spacing |

## 2. Runtime (choose one, then promote)

### Option A — Dockerfile (recommended)

`Dockerfile` in this folder builds Node 20 + Python 3 + faster-whisper and
**pre-downloads the model at build time** so the first job doesn't stall on a
~500 MB (small) / ~1.5 GB (medium) download.

To promote:

```bash
cp deploy/transcription/Dockerfile ./Dockerfile
git add Dockerfile && git commit -m "build: switch Railway to Docker for transcription runtime"
```

A root `Dockerfile` takes precedence over Railpack automatically — no service
setting to change. **Verify a deploy on a preview/staging environment first**:
this replaces the build for the whole site, not just this feature.

### Option B — nixpacks.toml (only if you switch builders)

`nixpacks.toml` is included for completeness, but note it does **nothing** while
the service is on Railpack. Using it means first switching the builder to
Nixpacks in the Railway service settings, which is a bigger change than adding a
Dockerfile. It also doesn't bake the model in, so the first job after every
deploy pays a ~500 MB download.

Recommendation: use Option A. Option B exists only if you have a reason to avoid
Docker.

### Rollback

Delete the promoted `Dockerfile` from the repo root and redeploy — Railpack
resumes auto-detecting the Node app. Set `TRANSCRIBE_ENABLED=false` first so the
UI stops offering the feature.

## 3. Railway plan sizing

See `RESOURCE-IMPACT.md` in this folder. Read it before promoting — a 60–90
minute job is a **sustained multi-core CPU burn for 10–60 minutes**, which is a
different cost shape from anything else this service does.

## 4. Optional: ffmpeg.wasm browser fallback

The browser's own decoder (Web Audio) handles the formats phones actually
produce. The `ffmpeg.wasm` fallback in `js/transcribe.js` only engages when the
browser refuses a container, and it is **not bundled** — it loads from
`/vendor/ffmpeg/`. Without those files the page fails loudly and tells the user
to re-export the clip. It never falls back to uploading video.

To enable it, vendor a UMD build of `@ffmpeg/ffmpeg` (v0.11.x, which exposes
`window.FFmpeg.createFFmpeg`) plus `@ffmpeg/core`:

```
vendor/ffmpeg/ffmpeg.js
vendor/ffmpeg/ffmpeg-core.js
vendor/ffmpeg/ffmpeg-core.wasm
vendor/ffmpeg/ffmpeg-core.worker.js
```

Note these add ~30 MB of binary to the repo and the single-threaded core is
several times slower than the browser's native decoder. Only worth it if you
hit a format the browser genuinely can't open.

## 5. Verifying the "no video, no stored audio" promise

`node tests/transcribe.server.js` asserts the invariants:

* flag off → every route 503s, no job created
* non-owner session → 403 (trainers included — this is owner-only)
* a chunk whose first bytes look like MP4/MOV/WebM/Ogg/RIFF/MP3 is rejected
  `415` and the job is destroyed
* the per-job temp dir is wiped on complete, on failure, and on cancel
* the temp root resolves under the OS temp dir — never the repo, never
  `RAILWAY_VOLUME_MOUNT_PATH`
* the only DB writes are `INSERT`/`SELECT` on `app_owner_transcripts`

On a live box you can watch it directly:

```bash
watch -n1 'ls -laR ${TMPDIR:-/tmp}/riseforit-transcribe 2>/dev/null'
```

The directory appears when a job starts uploading and is gone within a second
of the job reaching `done`, `error`, or `canceled`.

Also worth knowing: the Railway API reports **no volumes attached to this
service**, so there is no persistent storage for audio to land on even if the
wipe logic failed.

## 6. On the transcribee reference

`https://github.com/bugbakery/transcribee` was read as a reference but **no code
from it was copied**, for two reasons:

1. It is **AGPL-3.0**. Vendoring AGPL code into this repo — which is
   `UNLICENSED` and served over a network — would trigger the network-use
   copyleft clause across the whole server.
2. Its worker uses **whisper.cpp**, not faster-whisper, plus Wav2Vec2 and
   speechbrain for realignment and diarization. That's a heavier stack than
   this needs and a different engine from the one specified.

What's here instead is a purpose-built worker (`scripts/transcribe_worker.py`,
~160 lines) on **faster-whisper (MIT)** + **ctranslate2 (MIT)** — both
permissively licensed and safe to ship.
