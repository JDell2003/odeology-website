# Railway CPU / memory impact of a 60–90 minute transcription job

Read this before setting `TRANSCRIBE_ENABLED=true` or promoting a runtime.

## Verified facts about the current service

Queried live from the Railway API (read-only) on 2026-07-29:

| Fact | Value | Why it matters |
| --- | --- | --- |
| Project | `perfect-smile` | — |
| Plan | **Hobby** | Ceiling is **8 GB RAM / 8 vCPU** per service; $5/mo included credit, usage-billed past it |
| Service | `RiseForIt` | — |
| Builder | **Railpack** | *Not* Nixpacks — see the note in README.md |
| Replicas | 1 | The in-process queue guard is genuinely sufficient today (see caveat below) |
| Volumes attached | **none** (`volumes.edges: []`) | There is no persistent volume on this service at all, so "audio never touches persistent storage" is structurally true, not just enforced in code |

Everything below the line is **estimated**, not measured. There is no Python on
this dev machine and none in the current container, so no job has actually been
run. The numbers come from published faster-whisper CPU benchmarks plus the
model sizes; treat them as a planning envelope, and re-measure on the first real
job before trusting them for cost.

---

## Per-job envelope

Assumptions: 90 minutes of audio, 16 kHz mono, `int8` on CPU, `beam_size=1`
(greedy), `vad_filter=True`, and `TRANSCRIBE_THREADS=4`.

| | `small` (default) | `medium` |
| --- | --- | --- |
| Model weights, int8 | ~250 MB | ~800 MB |
| Peak worker RSS | **~1.1–1.4 GB** | **~2.4–3.0 GB** |
| Throughput | ~4–6× realtime | ~1.5–2× realtime |
| Wall time, 90 min audio | **~15–23 min** | **~45–60 min** |
| Wall time, 60 min audio | ~10–15 min | ~30–40 min |
| CPU during the job | **4 vCPU pinned at ~100%** | same |
| Est. Railway cost / job | **~$0.03–0.05** | **~$0.12–0.16** |

RSS includes ~350 MB for the audio itself: the worker memory-maps the PCM but
faster-whisper needs a float32 array, so 90 min → 173 MB on disk → ~346 MB in
memory. That term scales linearly with duration and is why `medium` on a
3-hour file would approach 3.5 GB.

Cost math uses Railway's usage rates (~$20/vCPU-month, ~$10/GB-month):
4 vCPU × 18 min ≈ 72 vCPU-min ≈ $0.033, plus ~1.3 GB × 18 min ≈ $0.005.

## Disk

* 60 min of audio → **115 MB** of PCM in the job's temp dir
* 90 min → **173 MB**
* ceiling → 400 MB (`TRANSCRIBE_MAX_AUDIO_BYTES`, ≈ 3h30m)

This lives in the container's **ephemeral** filesystem under
`$TMPDIR/riseforit-transcribe/<jobId>/`, is deleted the moment the job reaches
`done`/`error`/`canceled`, and is swept wholesale at process start. With no
volume attached there is nowhere for it to persist even if that failed.

Database growth is trivial: one row per transcript, roughly 1 KB of text plus
~15 KB of segment JSON per hour of audio.

## The actual risk: CPU contention, not memory

Memory is fine — even `medium` peaks around 3 GB against an 8 GB ceiling.

The real problem is that **this is the first workload on this service that
pins multiple cores for tens of minutes straight.** Everything else the app
does is short and I/O-bound. During a job:

* the Node event loop competes with the worker for the same cgroup CPU share
* request latency across the *whole site* (training engine, scoring, meal
  program) will rise for the duration
* on the Hobby plan there is no CPU isolation between the two

Mitigations already in the code:

* `TRANSCRIBE_THREADS` defaults to **4, never `os.cpus().length`** — inside a
  container that reports the host's 32+ cores, which would thrash the cgroup
  and starve the web server. Drop it to `2` if latency during a job is
  noticeable.
* one job at a time, enforced per owner at job creation (`429 job_in_progress`)
* `beam_size=1` and `vad_filter` cut compute substantially versus defaults
* stalled uploads are reaped after 10 minutes so they can't hold the slot

## Recommendation

1. Promote the **Dockerfile** (not the Railpack/Nixpacks route) with
   `WHISPER_MODEL=small`, and leave `TRANSCRIBE_ENABLED=false`.
2. Deploy, confirm the site is unchanged, then flip the flag and run **one
   short clip (2–5 min)** end to end. Confirm the temp dir appears and vanishes.
3. Run one real 60–90 min job and watch the Railway metrics graph. Record the
   actual peak RSS and wall time here, replacing the estimates.
4. Only consider `medium` after step 3, and only if `small`'s accuracy is
   genuinely insufficient — it triples both cost and wall time.

## Caveat to revisit if this ever scales

The queue guard is **in-process**. It is correct at 1 replica, which is what
this service runs today. If replicas ever go above 1, two jobs could run
concurrently on different instances and double the CPU burn. That would need a
Postgres advisory lock (`core/db.js` already exports `withClient` for exactly
this pattern — it's how scoring v2 does it).
