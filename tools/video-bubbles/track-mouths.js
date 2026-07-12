// One-off: track NPC mouth positions in every video under videos/.
// Extracts frames with ffmpeg, runs MediaPipe face detection in headless
// Chrome (mouth = keypoint 3), and writes normalized coordinates + movement
// speed to artifacts/mouth-tracks.json. Requires the dev server on :3000
// (it serves this folder) and `npm i --no-save ffmpeg-static`.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..', '..');
const VIDEOS_DIR = path.join(ROOT, 'videos');
const FRAMES_ROOT = path.join(__dirname, 'frames');
const OUT_FILE = path.join(ROOT, 'artifacts', 'mouth-tracks.json');
const SAMPLE_FPS = 6;
const BASE = 'http://localhost:3000/tools/video-bubbles';

function videoDuration(file) {
  try {
    execFileSync(ffmpeg, ['-i', file], { stdio: 'pipe' });
  } catch (err) {
    const text = String(err.stderr || '');
    const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return null;
}

function extractFrames(file, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(ffmpeg, [
    '-y', '-i', file,
    '-vf', `fps=${SAMPLE_FPS},scale=640:-2`,
    '-q:v', '4',
    path.join(dir, '%05d.jpg')
  ], { stdio: 'pipe' });
  return fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
}

(async () => {
  const files = fs.readdirSync(VIDEOS_DIR).filter((f) => f.endsWith('.mp4'));
  if (!files.length) throw new Error('no videos found');
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page]', String(e.message).slice(0, 200)));
  await page.goto(`${BASE}/detect.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.ready === true', { timeout: 90_000 });
  console.log('detector ready');

  const out = {};
  for (const file of files) {
    const base = file.replace(/\.mp4$/, '');
    const full = path.join(VIDEOS_DIR, file);
    const framesDir = path.join(FRAMES_ROOT, base);
    const duration = videoDuration(full);
    const frames = extractFrames(full, framesDir);

    const samples = [];
    for (let i = 0; i < frames.length; i++) {
      const url = `${BASE}/frames/${base}/${frames[i]}`;
      let det;
      try {
        det = await page.evaluate((u) => window.detectImage(u), url);
      } catch {
        det = { detections: [] };
      }
      samples.push({
        t: Number((i / SAMPLE_FPS).toFixed(3)),
        faces: det.detections
          .filter((d) => d.mouth)
          .map((d) => ({
            src: d.src,
            score: Number(d.score.toFixed(3)),
            x: Number(d.mouth.x.toFixed(4)),
            y: Number(d.mouth.y.toFixed(4)),
            bw: Number(d.bw.toFixed(4)),
            bh: Number(d.bh.toFixed(4))
          }))
      });
    }

    // Primary face per sample = largest box; speed in px/s at 1280x720.
    const primary = samples
      .map((s) => {
        const f = s.faces.slice().sort((a, b) => b.bw * b.bh - a.bw * a.bh)[0];
        return f ? { t: s.t, x: f.x, y: f.y, bw: f.bw } : null;
      })
      .filter(Boolean);
    const speeds = [];
    for (let i = 1; i < primary.length; i++) {
      const dt = primary[i].t - primary[i - 1].t;
      if (dt <= 0 || dt > 0.5) continue;
      const dx = (primary[i].x - primary[i - 1].x) * 1280;
      const dy = (primary[i].y - primary[i - 1].y) * 720;
      speeds.push(Math.hypot(dx, dy) / dt);
    }
    const med = (arr) => {
      if (!arr.length) return null;
      const s = arr.slice().sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    out[base] = {
      file,
      duration,
      sampleFps: SAMPLE_FPS,
      coverage: Number((primary.length / Math.max(1, samples.length)).toFixed(3)),
      mouthMedian: primary.length ? { x: med(primary.map((p) => p.x)), y: med(primary.map((p) => p.y)) } : null,
      speedMedianPxS: speeds.length ? Math.round(med(speeds)) : null,
      speedMaxPxS: speeds.length ? Math.round(Math.max(...speeds)) : null,
      samples
    };
    console.log(`${base}: ${frames.length} frames, coverage ${(out[base].coverage * 100).toFixed(0)}%, medSpeed ${out[base].speedMedianPxS ?? '-'} px/s`);
    fs.rmSync(framesDir, { recursive: true, force: true });
  }

  await browser.close();
  fs.rmSync(FRAMES_ROOT, { recursive: true, force: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1));
  console.log('wrote', OUT_FILE);
})().catch((e) => { console.error(e); process.exit(1); });
