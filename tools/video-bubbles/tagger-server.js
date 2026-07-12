// Tiny standalone server for the manual tracking-node tagger.
//   node tools/video-bubbles/tagger-server.js   ->  http://localhost:3777
// Serves tagger.html, streams the ORIGINAL videos (so node timestamps live
// on the original timeline), and reads/writes artifacts/manual-anchors.json.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ORIGINALS = path.join(ROOT, 'videos', 'originals');
const ANCHORS_FILE = path.join(ROOT, 'artifacts', 'manual-anchors.json');
const PORT = 3777;

const readAnchors = () => {
  try { return JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf8')); } catch { return {}; }
};

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/' || url.pathname === '/tagger.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'tagger.html')));
    return;
  }

  if (url.pathname === '/videos.json') {
    const files = fs.readdirSync(ORIGINALS).filter((f) => f.endsWith('.mp4')).sort();
    return json(res, 200, files);
  }

  if (url.pathname === '/anchors.json') {
    return json(res, 200, readAnchors());
  }

  if (url.pathname === '/save' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { video, nodes } = JSON.parse(body);
        if (!/^[\w.-]+\.mp4$/.test(String(video))) return json(res, 400, { error: 'bad video name' });
        const all = readAnchors();
        all[String(video).replace(/\.mp4$/, '')] = (Array.isArray(nodes) ? nodes : []).map((n) => ({
          t: Math.max(0, Number(n.t) || 0),
          x: Math.min(1, Math.max(0, Number(n.x) || 0)),
          y: Math.min(1, Math.max(0, Number(n.y) || 0)),
          text: String(n.text || '').slice(0, 90)
        }));
        fs.mkdirSync(path.dirname(ANCHORS_FILE), { recursive: true });
        fs.writeFileSync(ANCHORS_FILE, JSON.stringify(all, null, 1));
        json(res, 200, { ok: true, saved: all[String(video).replace(/\.mp4$/, '')].length });
      } catch (e) {
        json(res, 400, { error: String(e.message || e) });
      }
    });
    return;
  }

  const vm = url.pathname.match(/^\/video\/([\w.-]+\.mp4)$/);
  if (vm) {
    const file = path.join(ORIGINALS, vm[1]);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const stat = fs.statSync(file);
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'video/mp4'
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' });
      fs.createReadStream(file).pipe(res);
    }
    return;
  }

  res.writeHead(404);
  res.end('not found');
}).listen(PORT, () => console.log(`tagger on http://localhost:${PORT}`));
