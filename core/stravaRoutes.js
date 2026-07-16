// Strava import pipeline — ISOLATED from the scoring engine. It only feeds the
// existing health path (healthRoutes.syncProvider → app_health_daily, source
// 'strava', device-verified ×1.0 tier), which the scoring gather already reads.
// This module NEVER imports or mutates scoring*.js.
//
// Everything is gated behind STRAVA_IMPORT_ENABLED (default off). With the flag
// off, connect is refused and webhook events are acked-and-ignored, so nothing
// imports until the owner flips it on (10-athlete Standard tier; public >10
// needs Strava app review).
//
// Env: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET (never hardcoded), and
// STRAVA_WEBHOOK_VERIFY_TOKEN (any string; must match the push subscription).
// OAuth reuses the working /api/health/connect/strava flow (callback domain
// riseforit.com), so we don't duplicate token exchange/refresh.
'use strict';
const db = require('./db');
const health = require('./healthRoutes');

function importEnabled() {
  return String(process.env.STRAVA_IMPORT_ENABLED || '').trim().toLowerCase() === 'true';
}
function configured() {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}
function verifyToken() {
  return String(process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'riseforit-strava').trim();
}

async function findUserByAthlete(athleteId) {
  const id = String(athleteId || '').trim();
  if (!id) return null;
  try {
    const r = await db.query(
      "SELECT user_id FROM app_health_connections WHERE provider = 'strava' AND external_id = $1 LIMIT 1;",
      [id]
    );
    return r.rows?.[0]?.user_id || null;
  } catch { return null; }
}

// Pull the athlete's recent activities into app_health_daily via the shared
// health sync (which handles token refresh + source tagging + per-day merge —
// COALESCE means the same run reported both by our built-in GPS tracker and by
// Strava lands once per day, not double-counted).
async function importForUser(userId) {
  if (!importEnabled() || !configured()) return { ok: false, skipped: 'disabled' };
  try {
    const conns = await health.loadConnections(userId);
    const conn = (conns || []).find((c) => c.provider === 'strava');
    if (!conn) return { ok: false, skipped: 'not_connected' };
    await health.syncProvider(userId, conn);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'sync_failed' };
  }
}

// De-authorization / termination: delete this user's Strava-sourced data and
// mark them disconnected. Strava data is per-user and tagged, so it's purgeable.
async function purgeUser(userId) {
  try { await db.query("DELETE FROM app_health_activities WHERE user_id = $1 AND provider = 'strava';", [userId]); } catch {}
  try { await db.query("DELETE FROM app_health_connections WHERE user_id = $1 AND provider = 'strava';", [userId]); } catch {}
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(b));
    req.on('error', () => resolve(''));
  });
}

module.exports = async function stravaRoutes(req, res, url) {
  const p = url.pathname;

  // --- webhook validation (GET): Strava calls this when the subscription is created ---
  if (p === '/api/strava/webhook' && req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === verifyToken() && challenge) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 'hub.challenge': challenge }));
      return true;
    }
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('forbidden');
    return true;
  }

  // --- webhook events (POST): ack immediately, process async ---
  if (p === '/api/strava/webhook' && req.method === 'POST') {
    const body = await readBody(req);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    (async () => {
      if (!importEnabled()) return; // flag off → ignore
      let evt = {};
      try { evt = JSON.parse(body || '{}'); } catch { return; }
      try {
        if (evt.object_type === 'activity' && (evt.aspect_type === 'create' || evt.aspect_type === 'update')) {
          const userId = await findUserByAthlete(evt.owner_id);
          if (userId) await importForUser(userId);
        } else if (evt.object_type === 'athlete' && evt.aspect_type === 'update'
          && evt.updates && String(evt.updates.authorized) === 'false') {
          const userId = await findUserByAthlete(evt.owner_id);
          if (userId) await purgeUser(userId);
        }
      } catch { /* webhook processing is best-effort */ }
    })();
    return true;
  }

  // --- connect: reuse the working health OAuth (scope read,activity:read_all) ---
  if (p === '/api/strava/connect' && req.method === 'GET') {
    if (!importEnabled() || !configured()) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Strava import is not enabled yet.');
      return true;
    }
    res.writeHead(302, { Location: '/api/health/connect/strava' });
    res.end();
    return true;
  }

  return false;
};

// exposed for the subscription script + tests
module.exports.importForUser = importForUser;
module.exports.purgeUser = purgeUser;
module.exports.findUserByAthlete = findUserByAthlete;
module.exports.importEnabled = importEnabled;
module.exports.configured = configured;
module.exports.verifyToken = verifyToken;
