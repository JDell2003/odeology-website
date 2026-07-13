// core/scoringRoutes.js
// v2 scoring (SCORING_ENGINE_V2): GET /api/score — the authoritative score for
// the signed-in user (latest snapshot + recent explanatory events). The browser
// renders this; it can never write it. Flag off -> { enabled:false } and the
// legacy client behavior stays untouched.
'use strict';

const crypto = require('crypto');
const db = require('./db');
const scoringGather = require('./scoringGather');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
  return true;
}

function parseCookies(header) {
  const src = String(header || '');
  const out = {};
  src.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    out[key] = decodeURIComponent(value);
  });
  return out;
}

async function resolveUserIdFromSession(req) {
  if (!db.isConfigured()) return null;
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  try {
    const result = await db.query(
      'SELECT user_id FROM app_sessions WHERE session_token_hash = $1 AND expires_at > now() LIMIT 1;',
      [sha256Hex(token)]
    );
    return result.rows?.[0]?.user_id || null;
  } catch {
    return null;
  }
}

module.exports = async function scoringRoutes(req, res, url) {
  if (url.pathname !== '/api/score' || req.method !== 'GET') return false;

  if (!scoringGather.scoringV2Enabled()) {
    return sendJson(res, 200, { ok: true, enabled: false });
  }
  if (!db.isConfigured()) {
    return sendJson(res, 501, { error: 'Database not configured' });
  }
  const userId = await resolveUserIdFromSession(req);
  if (!userId) return sendJson(res, 401, { error: 'Not signed in' });

  try {
    await scoringGather.ensureScoringSchema();
    let snapRes = await db.query(
      `SELECT day::text AS day, strength, cardio, consistency, nutrition, recovery, progress,
              rank, caste, weeks_at_rank, normalized, computed_at
       FROM app_score_snapshots WHERE user_id = $1 ORDER BY day DESC LIMIT 1;`,
      [userId]
    );
    if (!snapRes.rows?.length) {
      // first request for this user: compute inline once so the UI has data
      await scoringGather.computeAndPersistUserScore(userId);
      snapRes = await db.query(
        `SELECT day::text AS day, strength, cardio, consistency, nutrition, recovery, progress,
                rank, caste, weeks_at_rank, normalized, computed_at
         FROM app_score_snapshots WHERE user_id = $1 ORDER BY day DESC LIMIT 1;`,
        [userId]
      );
    }
    const snap = snapRes.rows?.[0];
    if (!snap) return sendJson(res, 200, { ok: true, enabled: true, ready: false });

    const eventsRes = await db.query(
      `SELECT created_at, axis, delta, reason_code, provenance, trust_multiplier, detail
       FROM app_score_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20;`,
      [userId]
    );

    return sendJson(res, 200, {
      ok: true,
      enabled: true,
      ready: true,
      day: snap.day,
      axes: {
        strength: Number(snap.strength), cardio: Number(snap.cardio),
        consistency: Number(snap.consistency), nutrition: Number(snap.nutrition),
        recovery: Number(snap.recovery), progress: Number(snap.progress)
      },
      rank: snap.rank,
      caste: snap.caste || null,
      weeksAtRank: Number(snap.weeks_at_rank) || 0,
      normalized: snap.normalized === true,
      computedAt: snap.computed_at,
      events: (eventsRes.rows || []).map((e) => ({
        at: e.created_at, axis: e.axis, delta: e.delta === null ? null : Number(e.delta),
        reason: e.reason_code, provenance: e.provenance || null,
        trust: e.trust_multiplier === null ? null : Number(e.trust_multiplier),
        detail: e.detail || {}
      }))
    });
  } catch (err) {
    console.error('[scoring] /api/score failed', err?.message || err);
    return sendJson(res, 503, { error: 'Score temporarily unavailable' });
  }
};
