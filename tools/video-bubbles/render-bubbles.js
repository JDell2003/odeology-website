// Bake small comic speech bubbles into the rank BACKGROUND videos and slow
// everything to 80%. Bubbles belong to the bystander NPCs around the main
// character (never the hero himself), tails at the NPC's mouth, extending
// away from the hero. Promotions / demotions / intro get NO bubbles — those
// scenes stay cinematic and only get the slowdown.
// Originals live in videos/originals/ and every run re-processes FROM them,
// so this is safe to re-run after editing lines.js.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');
const puppeteer = require('puppeteer');
const LINES = require('./lines');

const ROOT = path.resolve(__dirname, '..', '..');
const VIDEOS_DIR = path.join(ROOT, 'videos');
const ORIGINALS_DIR = path.join(VIDEOS_DIR, 'originals');
const BUBBLES_DIR = path.join(__dirname, 'bubbles');
const TRACKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', 'mouth-tracks.json'), 'utf8'));

const SHOW_SECONDS = 3.0;          // per bubble, in the original timeline
const SLOWDOWN = 0.8;              // 80% speed
const MOMENTS = [0.12, 0.55];      // fractions of duration for line 1 / line 2
const NO_BUBBLES = /^(promotion|demotion|intro)/;

// Manual tracking nodes from the tagger (tools/video-bubbles/tagger-server.js).
// When a video has manual nodes they are the ONLY bubbles it gets; videos
// without nodes stay clean unless --auto restores the NPC auto-placement.
const ANCHORS_FILE = path.join(ROOT, 'artifacts', 'manual-anchors.json');
let MANUAL = {};
try { MANUAL = JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf8')); } catch { /* none yet */ }

// Small, long-and-thin comic bubble. Rendered crisp, then pixelated by the
// ffmpeg chain so it grains into the pixel-art footage.
const bubbleHtml = (text, tailSide) => `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&display=swap" rel="stylesheet">
<style>body{margin:0;background:transparent}</style></head><body>
<div id="stage"></div>
<script>
  window.build = async () => {
    await Promise.race([
      (async () => { await document.fonts.load('800 17px "Space Grotesk"'); await document.fonts.ready; })(),
      new Promise((r) => setTimeout(r, 8000))
    ]);
    const text = ${JSON.stringify(text)};
    const tailSide = ${JSON.stringify(tailSide)};
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = '800 17px "Space Grotesk", sans-serif';
    const textW = Math.ceil(cv.measureText(text).width);
    const padX = 14, bodyH = 34, rx = 13;
    const bodyW = Math.max(72, textW + padX * 2);
    const W = bodyW + 10, H = bodyH + 9 + 26;
    const flip = tailSide === 'right';
    const tx = flip ? bodyW - 44 : 44;         // tail base on body
    const tipX = flip ? bodyW - 19 : 19;       // tail tip x
    const dir = flip ? 1 : -1;
    const tail = (ox, oy, fill, stroke) => \`<path d="M \${tx + ox} \${bodyH - 2 + oy}
        C \${tx + dir * 2 + ox} \${bodyH + 10 + oy} \${tipX - dir * 4 + ox} \${bodyH + 18 + oy} \${tipX + ox} \${bodyH + 25 + oy}
        C \${tipX + dir * 10 + ox} \${bodyH + 18 + oy} \${tx + dir * 17 + ox} \${bodyH + 9 + oy} \${tx + dir * 26 + ox} \${bodyH - 1 + oy} Z"
        fill="\${fill}" \${stroke ? 'stroke="#131313" stroke-width="3" stroke-linejoin="round"' : ''}/>\`;
    const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${W}" height="\${H}" viewBox="0 0 \${W} \${H}">
      <defs><pattern id="dots" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
        <circle cx="1.4" cy="1.4" r="0.8" fill="#2a48e0" opacity="0.7"/></pattern></defs>
      <g transform="translate(1.5,1.5)">
        <rect x="6" y="7" width="\${bodyW}" height="\${bodyH}" rx="\${rx}" fill="#efdf3a"/>
        <rect x="6" y="7" width="\${bodyW}" height="\${bodyH}" rx="\${rx}" fill="url(#dots)"/>
        \${tail(6, 7, '#efdf3a', false)}
        \${tail(0, 0, '#f4ead0', true)}
        <rect x="0" y="0" width="\${bodyW}" height="\${bodyH}" rx="\${rx}" fill="#f4ead0" stroke="#131313" stroke-width="3.2"/>
        <rect x="\${Math.min(tx, tx + dir * 26) + 4}" y="\${bodyH - 4}" width="20" height="5" fill="#f4ead0"/>
        <path d="M \${rx} 4 Q \${bodyW * 0.4} 1.5 \${bodyW - rx * 1.5} 4.5" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.8"/>
        <text x="\${bodyW / 2}" y="\${bodyH / 2 + 6}" text-anchor="middle"
          font-family="'Space Grotesk', sans-serif" font-weight="800" font-size="17" fill="#181008">\${text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
      </g></svg>\`;
    document.getElementById('stage').innerHTML = svg;
    return { w: W, h: H, tipX: tipX + 1.5, tipY: bodyH + 25 + 1.5 };
  };
</script></body></html>`;

function probe(file) {
  let text = '';
  try {
    execFileSync(ffmpeg, ['-i', file], { stdio: 'pipe' });
  } catch (err) {
    text = String(err.stderr || '');
  }
  const dm = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const vm = text.match(/Video:.* (\d{3,4})x(\d{3,4})/);
  const hasAudio = /Stream #.*Audio/.test(text);
  return {
    duration: dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : null,
    width: vm ? Number(vm[1]) : 1280,
    height: vm ? Number(vm[2]) : 720,
    hasAudio
  };
}

const median = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];

// The hero is the biggest tracked figure across the whole clip.
function heroX(track) {
  const xs = [];
  for (const s of track.samples || []) {
    const f = s.faces.slice().sort((a, b) => b.bw * b.bh - a.bw * a.bh)[0];
    if (f) xs.push(f.x);
  }
  return xs.length ? median(xs) : 0.5;
}

// Pick a BYSTANDER mouth near time t: cluster all non-hero detections by x,
// prefer the most-seen cluster that is clearly away from the hero and not
// hugging the frame edge. Falls back to an offset beside the hero.
function npcAt(track, t, hx) {
  const clusters = new Map();
  for (const s of track.samples || []) {
    if (Math.abs(s.t - t) > 1.1) continue;
    const sorted = s.faces.slice().sort((a, b) => b.bw * b.bh - a.bw * a.bh);
    for (const f of sorted.slice(sorted.length > 1 ? 1 : 0)) {
      if (Math.abs(f.x - hx) < 0.12) continue;             // that's the hero
      if (f.x < 0.07 || f.x > 0.93 || f.y < 0.06) continue; // avoid crop edges
      const bin = Math.round(f.x * 12);
      if (!clusters.has(bin)) clusters.set(bin, []);
      clusters.get(bin).push(f);
    }
  }
  const best = [...clusters.values()].sort((a, b) => b.length - a.length)[0];
  if (best && best.length >= 2) {
    return { x: median(best.map((f) => f.x)), y: median(best.map((f) => f.y)), found: true };
  }
  // No reliable bystander: speak from beside the hero instead of over him.
  const side = hx <= 0.5 ? 1 : -1;
  const my = track.mouthMedian ? track.mouthMedian.y : 0.35;
  return { x: Math.min(0.9, Math.max(0.1, hx + side * 0.22)), y: Math.max(0.14, my - 0.05), found: false };
}

(async () => {
  fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
  fs.mkdirSync(BUBBLES_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 700, height: 200, deviceScaleFactor: 1 });

  const renderBubble = async (text, tailSide, outFile) => {
    await page.setContent(bubbleHtml(text, tailSide), { waitUntil: 'domcontentloaded' });
    const meta = await page.evaluate(() => window.build());
    const el = await page.$('#stage svg');
    await el.screenshot({ path: outFile, omitBackground: true });
    return meta;
  };

  const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  for (const name of Object.keys(TRACKS)) {
    if (onlyArg && name !== onlyArg) continue;
    const track = TRACKS[name];
    const srcOriginal = path.join(ORIGINALS_DIR, track.file);
    const live = path.join(VIDEOS_DIR, track.file);
    if (!fs.existsSync(srcOriginal)) fs.copyFileSync(live, srcOriginal);
    const info = probe(srcOriginal);
    const dur = info.duration || track.duration || 10;
    const noneMode = process.argv.includes('--no-bubbles');
    const autoMode = process.argv.includes('--auto');
    const manualNodes = (MANUAL[name] || []).slice().sort((a, b) => a.t - b.t);

    const placeBubble = async (text, anchor, tailSide, idx, t0) => {
      const png = path.join(BUBBLES_DIR, `${name}-${idx}.png`);
      const meta = await renderBubble(text, tailSide, png);
      let x = Math.round(anchor.x * info.width - meta.tipX);
      let y = Math.round(anchor.y * info.height - meta.tipY);
      x = Math.max(8, Math.min(info.width - meta.w - 8, x));
      y = Math.max(8, Math.min(info.height - meta.h - 8, y));
      const tStart = Math.max(0.05, Math.min(dur - 0.4, t0));
      return { png, x, y, t0: tStart, t1: Math.min(dur - 0.05, tStart + SHOW_SECONDS) };
    };

    const overlays = [];
    if (!noneMode && manualNodes.length) {
      // Manual tracking nodes win: any count, exact click time + position.
      const defaults = LINES[name] || [];
      for (let i = 0; i < manualNodes.length; i++) {
        const n = manualNodes[i];
        const text = String(n.text || '').trim() || defaults[i % Math.max(1, defaults.length)] || 'Keep climbing.';
        const tailSide = n.x <= 0.5 ? 'left' : 'right'; // bubble extends toward frame center
        overlays.push(await placeBubble(text, n, tailSide, i, n.t));
      }
    } else if (!noneMode && autoMode && LINES[name] && !NO_BUBBLES.test(name)) {
      const hx = heroX(track);
      for (let i = 0; i < LINES[name].length && i < MOMENTS.length; i++) {
        const tStart = Math.max(0.8, Math.min(dur - SHOW_SECONDS - 0.3, MOMENTS[i] * dur));
        const npc = npcAt(track, tStart + SHOW_SECONDS / 2, hx);
        // Bubble extends AWAY from the hero: NPC left of hero -> bubble goes
        // further left -> tail sits on the bubble's right side.
        const tailSide = npc.x < hx ? 'right' : 'left';
        overlays.push(await placeBubble(LINES[name][i], npc, tailSide, i, tStart));
      }
    }

    // Build the filter graph: pixelate each bubble (down+up with nearest
    // neighbor) so it grains into the footage, overlay on the ORIGINAL
    // timeline, then slow everything down.
    const inputs = ['-y', '-i', srcOriginal];
    overlays.forEach((o) => inputs.push('-i', o.png));
    let chain = '';
    let cur = '[0:v]';
    overlays.forEach((o, i) => {
      chain += `[${i + 1}:v]scale=iw/2:ih/2:flags=area,scale=iw*2:ih*2:flags=neighbor[b${i}];`;
    });
    overlays.forEach((o, i) => {
      const out = i === overlays.length - 1 ? '[vo]' : `[v${i}]`;
      chain += `${cur}[b${i}]overlay=${o.x}:${o.y}:enable='between(t,${o.t0.toFixed(2)},${o.t1.toFixed(2)})'${out};`;
      cur = out;
    });
    if (!overlays.length) chain += `${cur}null[vo];`;
    chain += `[vo]setpts=PTS/${SLOWDOWN}[v]`;
    const tmpOut = path.join(VIDEOS_DIR, `.__tmp__${track.file}`);
    const args = [...inputs, '-filter_complex', chain, '-map', '[v]'];
    if (info.hasAudio) args.push('-map', '0:a', '-af', `atempo=${SLOWDOWN}`, '-c:a', 'aac', '-b:a', '128k');
    args.push('-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmpOut);
    execFileSync(ffmpeg, args, { stdio: 'pipe' });
    fs.renameSync(tmpOut, live);
    console.log(`${name}: ${overlays.length ? `baked ${overlays.length} bubble(s)${manualNodes.length ? ' [manual]' : ' [auto]'}` : 'no bubbles'}, slowed to ${SLOWDOWN * 100}%`);
  }

  await browser.close();
  console.log(`done — originals kept in ${ORIGINALS_DIR}`);
})().catch((e) => { console.error(e.stderr ? String(e.stderr).slice(-800) : e); process.exit(1); });
