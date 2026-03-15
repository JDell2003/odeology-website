const fs = require('fs');
const path = require('path');

const STUDIES_PATH = path.join(process.cwd(), 'data', 'studies.json');

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(payload));
  return true;
}

function readStudiesPayload() {
  try {
    return JSON.parse(fs.readFileSync(STUDIES_PATH, 'utf8'));
  } catch {
    return { generatedAt: null, total: 0, items: [] };
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function tokenize(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function rankStudy(item, tokens, topic) {
  if (!item || typeof item !== 'object') return -1;
  const title = String(item.title || '').toLowerCase();
  const summary = String(item.summary || '').toLowerCase();
  const journal = String(item.journal || '').toLowerCase();
  const studyType = String(item.studyType || '').toLowerCase();
  const evidenceType = String(item.evidenceType || '').toLowerCase();
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || '').toLowerCase()) : [];

  if (topic && topic !== 'all' && !tags.includes(topic.toLowerCase())) return -1;

  if (!tokens.length) {
    let baseScore = 1;
    if (evidenceType.includes('meta-analysis')) baseScore += 8;
    else if (evidenceType.includes('systematic review')) baseScore += 7;
    else if (studyType.includes('randomized')) baseScore += 5;
    return baseScore;
  }

  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 8;
    if (summary.includes(token)) score += 4;
    if (journal.includes(token)) score += 2;
    if (studyType.includes(token)) score += 3;
    if (evidenceType.includes(token)) score += 3;
    if (tags.some((tag) => tag.includes(token))) score += 6;
  }

  return score;
}

async function studiesRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/studies')) return false;

  if (url.pathname === '/api/studies' && req.method === 'GET') {
    const payload = readStudiesPayload();
    return sendJson(res, 200, {
      ok: true,
      generatedAt: payload.generatedAt || null,
      total: Array.isArray(payload.items) ? payload.items.length : 0,
      sources: payload.sources || []
    });
  }

  if (url.pathname === '/api/studies/search' && req.method === 'GET') {
    const payload = readStudiesPayload();
    const items = Array.isArray(payload.items) ? payload.items : [];
    const query = String(url.searchParams.get('q') || '').trim();
    const topic = String(url.searchParams.get('topic') || 'all').trim().toLowerCase();
    const limit = clampInt(url.searchParams.get('limit'), 1, 50, 12);
    const offset = clampInt(url.searchParams.get('offset'), 0, 5000, 0);
    const tokens = tokenize(query);

    const ranked = items
      .map((item) => ({ item, score: rankStudy(item, tokens, topic) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aDate = String(a.item?.publicationDate || a.item?.year || '');
        const bDate = String(b.item?.publicationDate || b.item?.year || '');
        return bDate.localeCompare(aDate);
      });

    const sliced = ranked.slice(offset, offset + limit).map((entry) => entry.item);

    return sendJson(res, 200, {
      ok: true,
      query,
      topic,
      generatedAt: payload.generatedAt || null,
      total: ranked.length,
      limit,
      offset,
      items: sliced
    });
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

module.exports = studiesRoutes;
