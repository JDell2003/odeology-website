/* Role guard (server floor) — logic suite with a stubbed db.
   Verifies core/roleGuard.js resolves session role flags exactly like the
   production model and rejects trainer/manager-only sessions from
   client-only APIs. Run: node tests/role-guard.server.js */
const db = require('../core/db');
let fakeRow = null;
db.isConfigured = () => true;
db.query = async () => ({ rows: fakeRow ? [fakeRow] : [] });

const { rejectsClientOnlyApi, resolveSessionRoleFlags } = require('../core/roleGuard');
const req = { headers: { cookie: 'sid=testtoken' } };

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failures++;
};

(async () => {
  fakeRow = { id: 'u1', username: 'coach_t', email: 't@x.com', display_name: 'Coach', admin_notes: 'trainer' };
  check('trainer-only session rejected from client API', await rejectsClientOnlyApi(req) === true);

  fakeRow = { id: 'u2', username: 'dual_d', email: 'd@x.com', display_name: 'Dual', admin_notes: 'trainer client' };
  check('dual-role session allowed', await rejectsClientOnlyApi(req) === false);

  fakeRow = { id: 'u3', username: 'client_c', email: 'c@x.com', display_name: 'C', admin_notes: 'client' };
  check('explicit client allowed', await rejectsClientOnlyApi(req) === false);

  fakeRow = { id: 'u4', username: 'plain_p', email: 'p@x.com', display_name: 'P', admin_notes: '' };
  check('default (flagless) account allowed', await rejectsClientOnlyApi(req) === false);

  fakeRow = { id: 'u5', username: 'mgr_m', email: 'm@x.com', display_name: 'M', admin_notes: 'manager' };
  check('manager-only session rejected', await rejectsClientOnlyApi(req) === true);

  fakeRow = { id: 'u6', username: 'riseforit', email: 'o@x.com', display_name: 'Owner', admin_notes: 'trainer' };
  check('owner passes regardless of flags', await rejectsClientOnlyApi(req) === false);

  fakeRow = null;
  check('no session → not rejected here (401 downstream)', await rejectsClientOnlyApi(req) === false);
  check('no cookie → not rejected', await rejectsClientOnlyApi({ headers: {} }) === false);

  fakeRow = { id: 'u1', username: 'coach_t', email: 't@x.com', display_name: 'Coach', admin_notes: 'trainer' };
  const f = await resolveSessionRoleFlags(req);
  check('flags: trainerOnly derived correctly', f.trainerOnly === true && f.clientAccess === false, JSON.stringify(f));

  console.log(failures === 0 ? 'ROLE-GUARD: ALL PASS' : `ROLE-GUARD: ${failures} FAILURE(S)`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error('SUITE CRASH:', err); process.exit(1); });
