/* Owner calendar routes — logic suite with stubbed db + role resolution.
   Run: node tests/owner-calendar.server.js */
const db = require('../core/db');
const roleGuard = require('../core/roleGuard');

let fakeFlags = null;
let queries = [];
let nextRows = [];
db.isConfigured = () => true;
db.query = async (sql, values) => { queries.push({ sql: String(sql), values }); return { rows: nextRows }; };
roleGuard.resolveSessionRoleFlags = async () => fakeFlags;

// ownerCalendarRoutes destructures resolveSessionRoleFlags at require time,
// so the stub above must be in place BEFORE this require.
delete require.cache[require.resolve('../core/ownerCalendarRoutes')];
const ownerCalendarRoutes = require('../core/ownerCalendarRoutes');

function fakeReq(method, body) {
  const { Readable } = require('stream');
  const r = new Readable({ read() {} });
  if (body != null) r.push(Buffer.from(JSON.stringify(body)));
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
const mkUrl = (path, qs = '') => new URL(`http://x${path}${qs}`);

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failures++;
};

const OWNER = { userId: '99999999-9999-4999-8999-999999999999', owner: true, trainer: true, manager: true, explicitClient: true, clientAccess: true, trainerOnly: false };
const TRAINER = { userId: '11111111-1111-4111-8111-111111111111', owner: false, trainer: true, manager: false, explicitClient: false, clientAccess: false, trainerOnly: true };
const EVT_ID = '22222222-2222-4222-8222-222222222222';
const ROW = { id: EVT_ID, title: 'Call Nick', event_date: '2026-07-21', event_time: '14:00', event_type: 'call', note: '', created_at: 'x', updated_at: 'x' };

(async () => {
  // unauthenticated -> 401
  fakeFlags = null;
  let res = fakeRes();
  check('handles only its prefix', await ownerCalendarRoutes(fakeReq('GET'), res, mkUrl('/api/other')) === false);
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('GET'), res, mkUrl('/api/owner/calendar', '?from=2026-07-01&to=2026-07-31'));
  check('unauthenticated -> 401', res.status === 401, JSON.stringify(res.body));

  // non-owner -> 403
  fakeFlags = TRAINER;
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('GET'), res, mkUrl('/api/owner/calendar', '?from=2026-07-01&to=2026-07-31'));
  check('trainer session -> 403 owner only', res.status === 403, JSON.stringify(res.body));

  // owner GET without range -> 400
  fakeFlags = OWNER;
  queries = []; nextRows = [];
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('GET'), res, mkUrl('/api/owner/calendar'));
  check('GET without from/to -> 400', res.status === 400);

  // owner GET with range -> 200 + scoped query
  queries = []; nextRows = [ROW];
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('GET'), res, mkUrl('/api/owner/calendar', '?from=2026-07-01&to=2026-07-31'));
  const listQ = queries.find((q) => q.sql.includes('SELECT * FROM app_owner_calendar_events'));
  check('GET range -> 200 + events', res.status === 200 && res.body.ok && res.body.events.length === 1, JSON.stringify(res.body));
  check('GET query scoped to owner_user_id', Boolean(listQ) && listQ.values[0] === OWNER.userId);

  // POST missing title -> 400
  queries = []; nextRows = [ROW];
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('POST', { date: '2026-07-21', type: 'call' }), res, mkUrl('/api/owner/calendar'));
  check('POST without title -> 400', res.status === 400);

  // POST valid -> INSERT
  queries = []; nextRows = [ROW];
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('POST', { title: 'Call Nick', date: '2026-07-21', time: '14:00', type: 'call', note: 'about content' }), res, mkUrl('/api/owner/calendar'));
  const insQ = queries.find((q) => q.sql.includes('INSERT INTO app_owner_calendar_events'));
  check('POST valid -> 200 + INSERT', res.status === 200 && res.body.ok && Boolean(insQ), JSON.stringify(res.body));

  // POST with junk type -> coerced to 'call' in the INSERT values
  queries = []; nextRows = [ROW];
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('POST', { title: 'X', date: '2026-07-22', type: 'party' }), res, mkUrl('/api/owner/calendar'));
  const insQ2 = queries.find((q) => q.sql.includes('INSERT INTO app_owner_calendar_events'));
  check('POST junk type coerced to call', Boolean(insQ2) && insQ2.values[4] === 'call', JSON.stringify(insQ2?.values));

  // PATCH -> UPDATE scoped to owner + id
  queries = []; nextRows = [ROW];
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('PATCH', { title: 'Call Nick (moved)', time: '15:00' }), res, mkUrl(`/api/owner/calendar/${EVT_ID}`));
  const updQ = queries.find((q) => q.sql.includes('UPDATE app_owner_calendar_events'));
  check('PATCH -> 200 + UPDATE', res.status === 200 && res.body.ok && Boolean(updQ));
  check('PATCH scoped owner+id', Boolean(updQ) && updQ.values[0] === OWNER.userId && updQ.values[1] === EVT_ID);

  // DELETE unknown -> 404
  queries = []; nextRows = [];
  res = fakeRes();
  await ownerCalendarRoutes(fakeReq('DELETE'), res, mkUrl(`/api/owner/calendar/${EVT_ID}`));
  check('DELETE missing -> 404', res.status === 404);

  console.log(failures === 0 ? 'OWNER-CALENDAR: ALL PASS' : `OWNER-CALENDAR: ${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASH:', e); process.exit(1); });
