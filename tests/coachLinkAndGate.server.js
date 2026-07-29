/* Two trainer-website bugs, guarded.
   1. GET /api/training/website-funnel — the "Link you attach to your videos"
      must work for a trainer who has a published coach page but has never
      pasted an external site. It used to 404 -> visit.html said
      "This link is not active", i.e. a dead link shipped into their bio.
   2. The published-page destination is their own /coach/<handle>.
   Run: node tests/coachLinkAndGate.server.js */
const db = require('../core/db');
const jsonStore = require('../core/jsonStore');
const trainerPages = require('../core/trainerPages');

let websites = {};
let livePage = null;
let pageLookups = [];

db.isConfigured = () => true;
db.query = async () => ({ rows: [] });
jsonStore.getJson = async (key, fallback) => {
  if (key === 'trainer-websites') return websites;
  if (key === 'funnel-events') return [];
  return fallback;
};
jsonStore.setJson = async () => true;
trainerPages.getPublicTrainerPage = async (_db, slug) => {
  pageLookups.push(slug);
  return livePage;
};

delete require.cache[require.resolve('../core/trainingRoutes')];
const trainingRoutes = require('../core/trainingRoutes');

function fakeReq(method = 'GET') {
  const { Readable } = require('stream');
  const r = new Readable({ read() {} });
  r.push(null);
  r.method = method;
  r.headers = { cookie: '' };
  return r;
}
function fakeRes() {
  const res = { status: 0, body: null };
  res.writeHead = (s) => { res.status = s; };
  res.end = (b) => { try { res.body = JSON.parse(String(b || '{}')); } catch { res.body = String(b || ''); } };
  return res;
}
const mkUrl = (p, qs = '') => new URL(`http://x${p}${qs}`);

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failures++;
};

const call = async (qs) => {
  const res = fakeRes();
  await trainingRoutes(fakeReq('GET'), res, mkUrl('/api/training/website-funnel', qs));
  return res;
};

(async () => {
  // --- the reported bug: published page, no saved website config ---
  websites = {};
  livePage = { trainer: { username: 'etavisf', displayName: 'etavisf' } };
  pageLookups = [];
  let res = await call('?t=etavisf');
  check('published page + no config -> 200 (was 404 "not active")', res.status === 200, JSON.stringify(res.body));
  check('destination is their own coach page', res.body?.siteUrl === '/coach/etavisf', JSON.stringify(res.body?.siteUrl));
  check('coach name carried through for the funnel screen', res.body?.displayName === 'etavisf', JSON.stringify(res.body?.displayName));
  check('no questions configured -> no variants (visit.html forwards straight through)',
    Array.isArray(res.body?.variants) && res.body.variants.length === 0, JSON.stringify(res.body?.variants));
  check('handle is looked up lowercase', pageLookups.includes('etavisf'), JSON.stringify(pageLookups));

  // handle casing from a pasted link must still resolve
  res = await call('?t=EtaVisF');
  check('mixed-case handle still resolves', res.status === 200 && res.body?.siteUrl === '/coach/etavisf', JSON.stringify(res.body));

  // --- a saved external site still wins over the coach-page fallback ---
  websites = {
    'user-1': {
      userId: 'user-1',
      username: 'etavisf',
      displayName: 'Etavis F',
      siteUrl: 'https://etavis.example.com',
      variants: [{ id: 'v1', label: 'A', weight: 100, questions: ['What is your goal?'] }]
    }
  };
  res = await call('?t=etavisf');
  check('saved external site wins over the fallback',
    res.body?.siteUrl === 'https://etavis.example.com', JSON.stringify(res.body?.siteUrl));
  check('configured questions are still served',
    res.body?.variants?.length === 1 && res.body.variants[0].questions.length === 1, JSON.stringify(res.body?.variants));
  check('saved display name preferred', res.body?.displayName === 'Etavis F', JSON.stringify(res.body?.displayName));

  // --- config exists but with no site url: still falls back ---
  websites = { 'user-1': { userId: 'user-1', username: 'etavisf', displayName: 'Etavis F', siteUrl: '', variants: [] } };
  res = await call('?t=etavisf');
  check('config with empty siteUrl falls back to the coach page',
    res.body?.siteUrl === '/coach/etavisf', JSON.stringify(res.body?.siteUrl));

  // --- zero-weight variants are still filtered out ---
  websites = {
    'user-1': {
      userId: 'user-1', username: 'etavisf', displayName: 'Etavis F', siteUrl: 'https://x.example.com',
      variants: [{ id: 'v1', label: 'A', weight: 0, questions: ['Skipped?'] }]
    }
  };
  res = await call('?t=etavisf');
  check('zero-weight variants stay filtered out', res.body?.variants?.length === 0, JSON.stringify(res.body?.variants));

  // --- unknown handle with no page anywhere is still a 404 ---
  websites = {};
  livePage = null;
  res = await call('?t=nobody');
  check('unknown handle -> 404', res.status === 404, JSON.stringify(res.body));
  res = await call('');
  check('missing handle -> 404', res.status === 404, JSON.stringify(res.body));

  // --- a DB hiccup during the fallback must not 500 the public link ---
  websites = {};
  trainerPages.getPublicTrainerPage = async () => { throw new Error('db down'); };
  res = await call('?t=etavisf');
  check('DB error during fallback degrades to 404, never a 500', res.status === 404, JSON.stringify({ s: res.status, b: res.body }));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
