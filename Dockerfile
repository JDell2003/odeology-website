# Node + Python runtime for owner transcription (faster-whisper, CPU int8).
#
# This replaces Railpack for the WHOLE service, so it must reproduce the
# existing runtime faithfully, not just add Python:
#   - puppeteer is a PRODUCTION dependency (core/walmartCart.js and
#     core/sessionManager.js are required at server boot), so Chromium and its
#     shared libraries have to be present or those features regress.
#   - the whisper model is baked in so the first job doesn't stall on a
#     ~500 MB download, and so it survives redeploys (the container filesystem
#     is ephemeral and no volume is attached).

FROM node:22-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    TRANSCRIBE_PYTHON=python3 \
    TRANSCRIBE_MODEL_DIR=/opt/whisper-models \
    HF_HUB_DISABLE_TELEMETRY=1

# python3 + libgomp (ctranslate2 needs OpenMP), then Chromium's runtime
# libraries — puppeteer downloads its own browser binary but not these.
# No ffmpeg: the browser extracts the audio and the worker reads raw s16le PCM.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        libgomp1 \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libglib2.0-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# faster-whisper (MIT) + ctranslate2 (MIT). CPU wheels only — no CUDA, no torch.
# --break-system-packages is required on bookworm (PEP 668).
RUN pip3 install --no-cache-dir --break-system-packages \
        "faster-whisper==1.0.3" \
        "numpy>=1.24,<2"

# Pre-bake the model. Change this ARG and TRANSCRIBE_MODEL together.
ARG WHISPER_MODEL=small
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8', download_root='/opt/whisper-models')"

WORKDIR /app

# Install deps first so the layer caches independently of app code. Chromium
# is downloaded here by puppeteer's postinstall, exactly as it is today.
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# Fail the BUILD if the transcription runtime is wrong, rather than letting it
# surface as a mystery 503 in production.
RUN python3 scripts/transcribe_worker.py --selfcheck

# Fail the build if the server can't even be parsed/required cleanly.
RUN node --check server.js

EXPOSE 8080
CMD ["node", "server.js"]
