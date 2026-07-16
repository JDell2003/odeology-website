// One-time Strava push-subscription setup (webhooks are required by Strava's
// API terms). Run AFTER the app is deployed and reachable at the public URL.
//   node --env-file .env scripts/strava-subscribe.js create   # create the sub
//   node --env-file .env scripts/strava-subscribe.js view     # list current
//   node --env-file .env scripts/strava-subscribe.js delete <id>
// Needs STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_WEBHOOK_VERIFY_TOKEN,
// and a public callback (defaults to https://riseforit.com/api/strava/webhook).
'use strict';
const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'riseforit-strava';
const CALLBACK = process.env.STRAVA_WEBHOOK_CALLBACK_URL || 'https://riseforit.com/api/strava/webhook';
const BASE = 'https://www.strava.com/api/v3/push_subscriptions';

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) { console.error('Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET'); process.exit(1); }
  const mode = (process.argv[2] || 'view').toLowerCase();
  const auth = `client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;

  if (mode === 'view') {
    const r = await fetch(`${BASE}?${auth}`);
    console.log('status', r.status, await r.text());
    return;
  }
  if (mode === 'delete') {
    const id = process.argv[3];
    if (!id) { console.error('pass the subscription id'); process.exit(1); }
    const r = await fetch(`${BASE}/${id}?${auth}`, { method: 'DELETE' });
    console.log('delete status', r.status, await r.text());
    return;
  }
  if (mode === 'create') {
    const body = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, callback_url: CALLBACK, verify_token: VERIFY_TOKEN });
    const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    console.log('create status', r.status, await r.text());
    console.log('callback:', CALLBACK);
    return;
  }
  console.error('usage: create | view | delete <id>');
  process.exit(1);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
