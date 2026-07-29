/* GET /api/content/posts — the trainer's own logged days (Previous Days).
   Stubbed db + session. Run: node tests/contentPostsList.server.js */
const db = require('../core/db');
const authRoutes = require('../core/authRoutes');

let sessionUser = null;
let queries = [];
let nextRows = [];
db.isConfigured = () => true;
db.query = async (sql, values) => { queries.push({ sql: String(sql), values }); return { rows: nextRows }; };
// contentRoutes resolves getUserFromRequest lazily off _private, so stubbing
// the export here is enough — but do it before the require to be safe.
authRoutes._private.getUserFromRequest = async () => sessionUser;

delete require.cache[require.resolve('../core/contentRoutes')];
const contentRoutes = require('../core/contentRoutes');

function fakeReq(method) {
  const { Readable } = require('stream');
  const r = new Readable({ read() {} });
  r.push(null);
  r.method = method;
  r.headers = { cookie: 'sid=x' };
  return r;
}
function fakeRes() {
  const res = { status: 0, body: null };
  res.writeHead = (s) => { res.status = s; };
  res.end = (b) => { res.body = JSON.parse(String(b || '{}')); };
  return res;
}
const mkUrl = (p, qs = '') => new URL(`http://x${p}${qs}`);

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failures++;
};

const TRAINER = { id: '55555555-5555-4555-8555-555555555555', username: 'etavisf', isTrainer: true, isOwner: false };
const OTHER = { id: '66666666-6666-4666-8666-666666666666', username: 'someone_else', isTrainer: true, isOwner: false };
const ROW = {
  id: 12, scheduled_date: new Date('2026-07-28T00:00:00Z'), post_type: 'mistake',
  hook_text: 'Men over 35: you train hard and eat like you didn’t.', hook_source: 'trainer',
  status: 'posted', posted_at: '2026-07-28T18:00:00Z', track_code: 'abc123',
  script_json: { beats: [] }, views: 1400, dms: 6, link_clicks_manual: 3, clicks: 4
};

(async () => {
  // unauthenticated -> 401
  sessionUser = null;
  let res = fakeRes();
  await contentRoutes(fakeReq('GET'), res, mkUrl('/api/content/posts'));
  check('unauthenticated -> 401', res.status === 401, JSON.stringify(res.body));

  // signed in -> own rows only
  sessionUser = TRAINER;
  queries = []; nextRows = [ROW];
  res = fakeRes();
  await contentRoutes(fakeReq('GET'), res, mkUrl('/api/content/posts'));
  check('signed in -> 200', res.status === 200, JSON.stringify(res.body));
  const listQ = queries.filter((q) => /FROM app_content_posts/i.test(q.sql)).pop();
  check('query is scoped to the session user', Boolean(listQ) && listQ.values[0] === TRAINER.id, JSON.stringify(listQ && listQ.values));
  check('query cannot be pointed at another account',
    Boolean(listQ) && !listQ.values.includes(OTHER.id) && /trainer_user_id = \$1/.test(listQ.sql), listQ && listQ.sql.slice(0, 120));
  check('newest first', Boolean(listQ) && /ORDER BY cp\.scheduled_date DESC/i.test(listQ.sql));
  const post = res.body.posts && res.body.posts[0];
  check('date serialised as YYYY-MM-DD', post && post.scheduledDate === '2026-07-28', JSON.stringify(post && post.scheduledDate));
  check('carries type, hook and status', post && post.postType === 'mistake' && /train hard/.test(post.hookText) && post.status === 'posted', JSON.stringify(post));
  check('carries the numbers', post && post.views === 1400 && post.dms === 6 && post.clicks === 4, JSON.stringify(post));

  // a userId in the query string is ignored — no way to read another trainer
  queries = [];
  res = fakeRes();
  await contentRoutes(fakeReq('GET'), res, mkUrl('/api/content/posts', `?userId=${OTHER.id}`));
  const spoofQ = queries.filter((q) => /FROM app_content_posts/i.test(q.sql)).pop();
  check('userId param is ignored (still the session user)', Boolean(spoofQ) && spoofQ.values[0] === TRAINER.id, JSON.stringify(spoofQ && spoofQ.values));

  // limit is clamped
  queries = [];
  res = fakeRes();
  await contentRoutes(fakeReq('GET'), res, mkUrl('/api/content/posts', '?limit=99999'));
  const limQ = queries.filter((q) => /FROM app_content_posts/i.test(q.sql)).pop();
  check('limit clamped to 400', Boolean(limQ) && limQ.values[1] === 400, JSON.stringify(limQ && limQ.values));

  queries = [];
  res = fakeRes();
  await contentRoutes(fakeReq('GET'), res, mkUrl('/api/content/posts', '?limit=abc'));
  const badLimQ = queries.filter((q) => /FROM app_content_posts/i.test(q.sql)).pop();
  check('non-numeric limit falls back to the default', Boolean(badLimQ) && badLimQ.values[1] === 200, JSON.stringify(badLimQ && badLimQ.values));

  // POST is still the log-a-post route, not this one
  res = fakeRes();
  const handled = await contentRoutes(fakeReq('GET'), res, mkUrl('/api/content/nope'));
  check('unknown content route is not handled', handled === false);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
