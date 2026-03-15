const fs = require('fs');

const OUT = 'data/forum-posts.json';
const TARGET_IMAGES = 600;
const OPENVERSE_MAX = 10;
const OPEN_LICENSES = new Set(['by', 'by-sa', 'cc0', 'pdm']);

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))];
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function hashValue(value) {
  let hash = 2166136261;
  const source = String(value || 'forum');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function openverse(q, page = 1) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=by,by-sa,cc0,pdm&page=${page}&page_size=20`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'odeology-forum-broad-image-fill/1.0' } });
    if (res.ok) return res.json();
    if ([400, 401, 403, 404, 422].includes(res.status)) return { results: [] };
    if (![429, 500, 502, 503, 504].includes(res.status)) return { results: [] };
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  return { results: [] };
}

function okImage(item) {
  if (!(item && item.id && item.url)) return false;
  if (!OPEN_LICENSES.has(String(item.license || '').toLowerCase())) return false;
  if (item.mature) return false;
  if (Number(item.width || 0) < 400 || Number(item.height || 0) < 400) return false;
  const detail = `${String(item.url || '')} ${String(item.title || '')} ${String(item.creator || '')}`.toLowerCase();
  if (String(item.url || '').toLowerCase().endsWith('.svg')) return false;
  if (/(diagram|illustration|drawing|icon|logo|vector|statue|building|architecture|furniture|candlestick|artifact|museum|sculpture|monument|ruins|landscape|cityscape|interior|exterior|church|cathedral|temple|painting)/.test(detail)) return false;
  return true;
}

function detectBroadIntent(post) {
  const text = `${post.title || ''} ${post.body || ''}`.toLowerCase();
  if (/\b(meal|diet|protein|prep|food|calorie|calories|appetite|bulk|cut|eat|eating)\b/.test(text)) return 'food';
  if (/\b(headphones|packed gym|garage gym|spotter|busy week|missed one day|motivation|consistency|trainer|coaching|custom plan|custom workout|accountability|routine design|split|free plan|free training|free workouts)\b/.test(text)) return 'fitness';
  return 'fitness';
}

function imageMatchesIntent(item, intent) {
  const context = `${String(item.title || '')} ${String(item.creator || '')} ${String(item.url || '')}`.toLowerCase();
  if (intent === 'food') {
    return /\b(meal|protein|diet|food|prep|nutrition|calories|rice|chicken|beef|salmon|pasta|oats|yogurt|bowl)\b/.test(context);
  }
  return /\b(gym|fitness|workout|training|exercise|bodybuilding|physique|muscle|athlete|lifting|weightlifting|strength|posing|progress|selfie|mirror|sport|sports|jiu jitsu|wrestling|martial arts|bench|squat|dumbbell|barbell)\b/.test(context);
}

class Finder {
  constructor() {
    this.queries = new Map();
    this.used = new Set();
    this.usedUrls = new Set();
  }

  async fromQuery(query) {
    const key = norm(query);
    if (!key) return null;
    let state = this.queries.get(key);
    if (!state) {
      state = { page: 1, index: 0, results: [], done: false };
      this.queries.set(key, state);
    }
    while (true) {
      while (state.index < state.results.length) {
        const item = state.results[state.index];
        state.index += 1;
        const itemUrl = norm(item.url);
        if (!okImage(item) || this.used.has(item.id) || (itemUrl && this.usedUrls.has(itemUrl))) continue;
        this.used.add(item.id);
        if (itemUrl) this.usedUrls.add(itemUrl);
        return item;
      }
      if (state.done || state.page > OPENVERSE_MAX) return null;
      const payload = await openverse(key, state.page);
      state.page += 1;
      state.index = 0;
      state.results = Array.isArray(payload.results) ? payload.results : [];
      if (!state.results.length) state.done = true;
    }
  }

  async take(list, validator) {
    for (const query of uniq(list)) {
      let item = await this.fromQuery(query);
      while (item && validator && !validator(item)) {
        item = await this.fromQuery(query);
      }
      if (item) return item;
    }
    return null;
  }
}

function queriesForIntent(intent) {
  if (intent === 'food') {
    return ['high protein meal prep', 'healthy meal prep', 'protein bowl meal', 'meal prep containers', 'fitness meal photo'];
  }
  return ['adult gym mirror selfie', 'young adult fitness progress photo', 'adult physique check gym', 'adult athlete training gym', 'weightlifting gym photo', 'adult sports conditioning training', 'jiu jitsu training'];
}

function applyImage(post, item, intent) {
  Object.assign(post, {
    format: 'image',
    imageUrl: item.url,
    imageAlt: intent === 'food' ? 'meal prep photo' : 'fitness training photo',
    imageSource: item.source || 'openverse',
    imageCreator: item.creator || null,
    imageLicense: item.license || null,
    imageLicenseUrl: item.license_url || null,
    imagePageUrl: item.foreign_landing_url || item.detail_url || null,
    imageId: item.id
  });
}

function fallbackTags(post, intent, index = 0) {
  const text = `${post.title || ''} ${post.body || ''}`.toLowerCase();
  const base = hashValue(post.id || post.slug || post.title);
  const gender = index % 2 === 0 ? 'woman' : 'man';
  const age = Math.floor(base / 2) % 2 === 0 ? 'youngadult' : 'adult';
  const sportSets = [
    ['gym', 'athlete'],
    ['track', 'athlete'],
    ['wrestling', 'athlete'],
    ['jiu-jitsu', 'athlete']
  ];
  const sport = sportSets[Math.floor(base / 4) % sportSets.length];
  const people = [gender, age, ...sport];
  if (intent === 'food') return ['meal', 'prep', 'protein'];
  if (/\b(leg curl|hamstring|hamstrings|rdl|romanian deadlift|quad|quads|glute|glutes|calf|calves|leg press|squat|hip thrust|legs)\b/.test(text)) return [...people, 'gym', 'legs', 'fitness'];
  if (/\b(bench|chest|pec|incline|press)\b/.test(text)) return [...people, 'gym', 'chest', 'fitness'];
  if (/\b(back|lat|row|pullup|pulldown|trap)\b/.test(text)) return [...people, 'gym', 'back', 'fitness'];
  if (/\b(side delt|rear delt|shoulder|lateral raise)\b/.test(text)) return [...people, 'gym', 'shoulders', 'fitness'];
  if (/\b(biceps|triceps|curl|pushdown|arm)\b/.test(text)) return [...people, 'gym', 'arms', 'fitness'];
  if (/\b(abs|core)\b/.test(text)) return [...people, 'gym', 'abs', 'fitness'];
  if (/\b(jiu jitsu|wrestling|martial arts)\b/.test(text)) return [gender, age, 'wrestling', 'athlete', 'sports', 'fitness'];
  return [...people, 'sports', 'fitness', 'training'];
}

function fallbackItem(post, intent, index) {
  const tags = fallbackTags(post, intent, index).join(',');
  const key = slug(post.id || post.title || `forum-image-${index + 1}`) || `forum-image-${index + 1}`;
  return {
    id: `loremflickr-${key}`,
    url: `https://loremflickr.com/1200/900/${tags}?lock=${encodeURIComponent(key)}`,
    source: 'loremflickr',
    creator: 'loremflickr',
    license: null,
    license_url: null,
    foreign_landing_url: null,
    detail_url: null
  };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const finder = new Finder();
  let images = data.items.filter((p) => p.format === 'image').length;
  const candidates = data.items.filter((p) => p.format === 'text').map((post) => ({ post, intent: detectBroadIntent(post) }));
  const prioritized = [
    ...candidates.filter((x) => x.intent === 'food'),
    ...candidates.filter((x) => x.intent === 'fitness')
  ];
  let added = 0;
  for (const [index, { post, intent }] of prioritized.entries()) {
    if (images >= TARGET_IMAGES) break;
    let item = await finder.take(queriesForIntent(intent), (candidate) => imageMatchesIntent(candidate, intent));
    if (!item) item = fallbackItem(post, intent, index);
    applyImage(post, item, intent);
    images += 1;
    added += 1;
    if (added % 25 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log({ images, added, target: TARGET_IMAGES });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
