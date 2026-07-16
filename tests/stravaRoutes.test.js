// Strava import pipeline — isolated tests (no DB, no network). Cover the
// activity→health mapping, the flag gate, the webhook validation handshake,
// and per-activity dedupe. Everything stays behind STRAVA_IMPORT_ENABLED.
const test = require('node:test');
const assert = require('node:assert/strict');
const health = require('../core/healthRoutes');
const strava = require('../core/stravaRoutes');

test('strava mapping: activities roll up per day with distance + vigorous split', () => {
  const byDay = health.mapStravaActivitiesByDay([
    { id: 1, start_date_local: '2026-07-15T07:00:00Z', moving_time: 1800, distance: 5000, type: 'Run', average_heartrate: 150 },
    { id: 2, start_date_local: '2026-07-15T18:00:00Z', moving_time: 1200, distance: 2000, type: 'Walk', average_heartrate: 100 },
    { id: 3, start_date_local: '2026-07-14T07:00:00Z', moving_time: 600, distance: 1000, type: 'Ride' }
  ]);
  const d15 = byDay.get('2026-07-15');
  assert.equal(d15.activeMinutes, 50, '30m run + 20m walk');
  assert.equal(d15.distanceMeters, 7000);
  assert.equal(d15.vigorousMinutes, 30, 'only the HR-150 run is vigorous');
  assert.deepEqual(d15.providerActivityIds, ['1', '2']);
  assert.equal(byDay.get('2026-07-14').activeMinutes, 10);
});

test('strava mapping: dedupe — the same activity id is tracked for the unique-index insert', () => {
  // fetchDaily aggregates by day; the (user, provider, external_id) unique index
  // then guarantees a re-delivered webhook for the same activity inserts once.
  const byDay = health.mapStravaActivitiesByDay([
    { id: 99, start_date_local: '2026-07-15T07:00:00Z', moving_time: 1800, distance: 5000, type: 'Run' }
  ]);
  assert.deepEqual(byDay.get('2026-07-15').providerActivityIds, ['99']);
});

test('strava flag: import is a no-op while STRAVA_IMPORT_ENABLED is off', async () => {
  delete process.env.STRAVA_IMPORT_ENABLED;
  assert.equal(strava.importEnabled(), false);
  const r = await strava.importForUser('00000000-0000-0000-0000-000000000000');
  assert.equal(r.ok, false);
  assert.equal(r.skipped, 'disabled');
});

test('strava webhook: GET validation echoes the challenge only for the right verify token', async () => {
  function mockRes() {
    return { status: 0, body: '', writeHead(s) { this.status = s; }, end(b) { this.body = b || ''; } };
  }
  const good = mockRes();
  await strava(
    { method: 'GET' }, good,
    new URL(`http://x/api/strava/webhook?hub.mode=subscribe&hub.verify_token=${strava.verifyToken()}&hub.challenge=abc123`)
  );
  assert.equal(good.status, 200);
  assert.equal(JSON.parse(good.body)['hub.challenge'], 'abc123');

  const bad = mockRes();
  await strava(
    { method: 'GET' }, bad,
    new URL('http://x/api/strava/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123')
  );
  assert.equal(bad.status, 403);
});

test('strava connect: refused (503) while the flag is off', async () => {
  delete process.env.STRAVA_IMPORT_ENABLED;
  const res = { status: 0, headers: null, body: '', writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = b || ''; } };
  const handled = await strava({ method: 'GET' }, res, new URL('http://x/api/strava/connect'));
  assert.equal(handled, true);
  assert.equal(res.status, 503);
});
