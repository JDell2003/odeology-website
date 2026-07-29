// Content Program server foundation (v5 §2.1–2.2 / v11 §2.2) — the post log,
// trainer hooks, track codes, and the /r/:code click redirect.
//
// - app_content_posts: one row per generated post, stamped with hook_source
//   (house|trainer) so house vs trainer rollups can split cleanly.
// - app_trainer_hooks: hooks trainers write on Hook Day (and reuse in their
//   own rotation). Promotion into the shared library is owner-gated (later).
// - GET /r/:code → look up the post's trainer, log the click, set a 30-day
//   first-party rfi_src cookie, 302 to the trainer's coach page. This is the
//   attribution backbone; the consult-form cookie read lives with the trainer
//   pages (flagged separately).
'use strict';
const crypto = require('crypto');
const db = require('./db');
const authRoutes = require('./authRoutes');
// getUserFromRequest lives under _private since the roles refactor - resolve
// it lazily so require-order between route modules can't bite.
function getUserFromRequest(req) { return authRoutes._private.getUserFromRequest(req); }

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS app_content_posts (
          id bigserial PRIMARY KEY,
          trainer_user_id text NOT NULL,
          scheduled_date date NOT NULL,
          post_type text NOT NULL,
          template_id text,
          variable_used text,
          hook_text text,
          script_json jsonb,
          status text NOT NULL DEFAULT 'scheduled',
          posted_at timestamptz,
          track_code text UNIQUE,
          hook_source text NOT NULL DEFAULT 'house',
          hook_id text,
          trainer_hook_id bigint,
          views int, dms int, link_clicks_manual int,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (trainer_user_id, scheduled_date, post_type)
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS app_trainer_hooks (
          id bigserial PRIMARY KEY,
          trainer_user_id text NOT NULL,
          hook_text text NOT NULL,
          topic_key text,
          post_type text,
          times_used int NOT NULL DEFAULT 0,
          total_clicks int NOT NULL DEFAULT 0,
          total_leads int NOT NULL DEFAULT 0,
          total_views_reported int NOT NULL DEFAULT 0,
          status text NOT NULL DEFAULT 'active',
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS app_content_post_clicks (
          id bigserial PRIMARY KEY,
          post_id bigint,
          trainer_user_id text,
          referrer text,
          user_agent text,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
  return true; // handlers `return sendJson(...)` to signal the route was handled
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) { raw = ''; req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function newTrackCode() { return crypto.randomBytes(4).toString('hex'); }

module.exports = async function contentRoutes(req, res, url) {
  const p = url.pathname;

  // --- click redirect: /r/:code -----------------------------------------
  const rMatch = p.match(/^\/r\/([a-z0-9]{6,16})$/i);
  if (rMatch && req.method === 'GET') {
    try {
      await ensureSchema();
      const code = rMatch[1].toLowerCase();
      const found = await db.query(
        `SELECT cp.id, cp.trainer_user_id, u.username
         FROM app_content_posts cp JOIN app_users u ON u.id::text = cp.trainer_user_id
         WHERE cp.track_code = $1 LIMIT 1;`, [code]);
      const row = found.rows?.[0];
      if (!row) { res.writeHead(302, { Location: '/' }); res.end(); return true; }
      try {
        await db.query(
          'INSERT INTO app_content_post_clicks (post_id, trainer_user_id, referrer, user_agent) VALUES ($1,$2,$3,$4);',
          [row.id, row.trainer_user_id, String(req.headers.referer || '').slice(0, 500), String(req.headers['user-agent'] || '').slice(0, 300)]);
      } catch {}
      res.writeHead(302, {
        Location: '/coach/' + encodeURIComponent(row.username || ''),
        'Set-Cookie': `rfi_src=${row.id}; Max-Age=${30 * 24 * 3600}; Path=/; SameSite=Lax`
      });
      res.end();
      return true;
    } catch (e) {
      res.writeHead(302, { Location: '/' }); res.end(); return true;
    }
  }

  if (!p.startsWith('/api/content/')) return false;

  // --- log / upsert a generated post (stamps hook_source) ----------------
  if (p === '/api/content/posts' && req.method === 'POST') {
    const user = await getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    await ensureSchema();
    const b = await readBody(req);
    const date = String(b.scheduledDate || '').slice(0, 10);
    const type = String(b.postType || '').slice(0, 24);
    if (!date || !type) return sendJson(res, 400, { ok: false, error: 'scheduledDate and postType required' });
    const code = newTrackCode();
    const r = await db.query(`
      INSERT INTO app_content_posts
        (trainer_user_id, scheduled_date, post_type, template_id, variable_used, hook_text, script_json, status, posted_at, track_code, hook_source, hook_id, trainer_hook_id, views, dms, link_clicks_manual)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8, CASE WHEN $8='posted' THEN now() ELSE NULL END, $9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (trainer_user_id, scheduled_date, post_type) DO UPDATE SET
        hook_text = EXCLUDED.hook_text,
        hook_source = EXCLUDED.hook_source,
        hook_id = EXCLUDED.hook_id,
        trainer_hook_id = EXCLUDED.trainer_hook_id,
        status = EXCLUDED.status,
        posted_at = COALESCE(app_content_posts.posted_at, EXCLUDED.posted_at),
        views = COALESCE(EXCLUDED.views, app_content_posts.views),
        dms = COALESCE(EXCLUDED.dms, app_content_posts.dms),
        link_clicks_manual = COALESCE(EXCLUDED.link_clicks_manual, app_content_posts.link_clicks_manual),
        updated_at = now()
      RETURNING id, track_code;`,
      [user.id, date, type, b.templateId || null, b.variableUsed || null, String(b.hookText || '').slice(0, 600),
        JSON.stringify(b.script || {}), (b.status === 'posted' ? 'posted' : 'scheduled'), code,
        (b.hookSource === 'trainer' ? 'trainer' : 'house'), b.hookId || null, b.trainerHookId || null,
        Number.isFinite(+b.views) ? +b.views : null, Number.isFinite(+b.dms) ? +b.dms : null, Number.isFinite(+b.clicks) ? +b.clicks : null]);
    const row = r.rows?.[0] || {};
    if (b.trainerHookId && b.status === 'posted') {
      try { await db.query('UPDATE app_trainer_hooks SET times_used = times_used + 1 WHERE id = $1 AND trainer_user_id = $2;', [b.trainerHookId, user.id]); } catch {}
    }
    return sendJson(res, 200, { ok: true, id: row.id, trackCode: row.track_code });
  }

  // --- the CURRENT trainer's own logged/scheduled posts -------------------
  // Feeds the content page's "Previous Days" popup. Session-scoped only —
  // there is no userId param, so a trainer can only ever read their own days.
  if (p === '/api/content/posts' && req.method === 'GET') {
    const user = await getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    await ensureSchema();
    const limitRaw = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 400) : 200;
    const r = await db.query(`
      SELECT cp.id, cp.scheduled_date, cp.post_type, cp.hook_text, cp.hook_source, cp.status,
             cp.posted_at, cp.track_code, cp.script_json, cp.views, cp.dms, cp.link_clicks_manual,
             COALESCE((SELECT COUNT(*)::int FROM app_content_post_clicks c WHERE c.post_id = cp.id), 0) AS clicks
      FROM app_content_posts cp
      WHERE cp.trainer_user_id = $1
      ORDER BY cp.scheduled_date DESC, cp.id DESC
      LIMIT $2;`, [user.id, limit]);
    const posts = (r.rows || []).map((row) => ({
      id: row.id,
      scheduledDate: row.scheduled_date instanceof Date ? row.scheduled_date.toISOString().slice(0, 10) : String(row.scheduled_date || '').slice(0, 10),
      postType: row.post_type,
      hookText: row.hook_text || '',
      hookSource: row.hook_source || 'house',
      status: row.status,
      postedAt: row.posted_at,
      trackCode: row.track_code,
      script: row.script_json || null,
      views: row.views,
      dms: row.dms,
      linkClicks: row.link_clicks_manual,
      clicks: row.clicks
    }));
    return sendJson(res, 200, { ok: true, posts });
  }

  // --- trainer hooks: create + list --------------------------------------
  if (p === '/api/content/hooks' && req.method === 'POST') {
    const user = await getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    await ensureSchema();
    const b = await readBody(req);
    const text = String(b.hookText || '').trim().slice(0, 400);
    if (text.length < 8) return sendJson(res, 400, { ok: false, error: 'Hook too short' });
    const r = await db.query(
      'INSERT INTO app_trainer_hooks (trainer_user_id, hook_text, topic_key, post_type) VALUES ($1,$2,$3,$4) RETURNING id;',
      [user.id, text, String(b.topicKey || '').slice(0, 80) || null, String(b.postType || '').slice(0, 24) || null]);
    return sendJson(res, 200, { ok: true, id: r.rows?.[0]?.id });
  }
  if (p === '/api/content/hooks' && req.method === 'GET') {
    const user = await getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    await ensureSchema();
    const r = await db.query(
      "SELECT id, hook_text, topic_key, post_type, times_used, total_clicks, total_leads, status FROM app_trainer_hooks WHERE trainer_user_id = $1 AND status <> 'retired' ORDER BY id DESC LIMIT 100;",
      [user.id]);
    return sendJson(res, 200, { ok: true, hooks: r.rows || [] });
  }

  // --- comparison rollup: house vs trainer (2.3, floor enforced client-side too) ---
  if (p === '/api/content/hook-stats' && req.method === 'GET') {
    const user = await getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    await ensureSchema();
    const r = await db.query(`
      SELECT hook_source,
             COUNT(*)::int AS posts,
             COALESCE((SELECT COUNT(*)::int FROM app_content_post_clicks c JOIN app_content_posts p2 ON p2.id = c.post_id
                        WHERE p2.trainer_user_id = $1 AND p2.hook_source = cp.hook_source), 0) AS clicks
      FROM app_content_posts cp
      WHERE trainer_user_id = $1 AND status = 'posted'
      GROUP BY hook_source;`, [user.id]);
    return sendJson(res, 200, { ok: true, stats: r.rows || [] });
  }

  // --- owner-only: a user's full onboarding record, aggregated ------------
  // (owner-accounts "Information" button). Read-only; renders whatever is on
  // file across the four stores rather than failing on shape.
  if (p === '/api/content/owner/onboarding-record' && req.method === 'GET') {
    const viewer = await getUserFromRequest(req);
    if (!viewer) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    if (!viewer.isOwner) return sendJson(res, 403, { ok: false, error: 'OWNER_ONLY' });
    const userId = String(url.searchParams.get('userId') || '').trim();
    if (!userId) return sendJson(res, 400, { ok: false, error: 'userId required' });
    const out = { ok: true, userId };
    try {
      const u = await db.query("SELECT username, display_name, email, COALESCE(admin_notes, '') AS admin_notes, created_at FROM app_users WHERE id = $1 LIMIT 1;", [userId]);
      const row = u.rows?.[0];
      if (!row) return sendJson(res, 404, { ok: false, error: 'Account not found' });
      out.account = { username: row.username, displayName: row.display_name, email: row.email, createdAt: row.created_at, roles: String(row.admin_notes || '').match(/\b(trainer|manager|client|demo)\b/gi) || [] };
    } catch (e) { return sendJson(res, 500, { ok: false, error: 'DB error' }); }
    try {
      const pr = await db.query('SELECT profile, updated_at FROM app_user_profiles WHERE user_id = $1 LIMIT 1;', [userId]);
      const prof = pr.rows?.[0]?.profile || {};
      out.profileUpdatedAt = pr.rows?.[0]?.updated_at || null;
      out.trainingIntake = prof.training_intake || null;
      const cp = prof.content_program_v2 || null;
      out.contentProgram = cp ? { answered: cp.answered || {}, path: cp.path || '', updatedAt: cp.updatedAt || null, setupDone: !!cp.setupDone } : null;
    } catch (e) {}
    try {
      const tp = await db.query('SELECT full_name, contact_email, meta, onboarding_completed_at, updated_at FROM app_trainer_profiles WHERE user_id = $1 LIMIT 1;', [userId]);
      const trow = tp.rows?.[0];
      if (trow) out.trainerOnboarding = { fullName: trow.full_name, contactEmail: trow.contact_email, completedAt: trow.onboarding_completed_at, updatedAt: trow.updated_at, meta: trow.meta || {} };
    } catch (e) {}
    try {
      const jsonStore = require('./jsonStore');
      const insights = await jsonStore.getJson('onboarding-insights', []);
      out.insights = (Array.isArray(insights) ? insights : []).find((r) => String(r.userId) === userId) || null;
    } catch (e) {}
    return sendJson(res, 200, out);
  }

  // --- Flow A -> Flow B pre-fill for the CURRENT trainer --------------------
  // Existing trainers have no local prefill blob, so content.js fetches their
  // signup answers here to seed the detailed questionnaire (outcome, specialties).
  if (p === '/api/content/signup-prefill' && req.method === 'GET') {
    const user = await getUserFromRequest(req);
    if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    try {
      const r = await db.query('SELECT full_name, brand_positioning, meta FROM app_trainer_profiles WHERE user_id = $1 LIMIT 1;', [user.id]);
      const row = r.rows?.[0];
      if (!row) return sendJson(res, 200, { ok: true, outcome: '', specialties: [], fullName: '' });
      const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
      const specialties = Array.isArray(meta.specialtyClients) ? meta.specialtyClients.filter(Boolean) : [];
      return sendJson(res, 200, {
        ok: true,
        outcome: String(row.brand_positioning || '').trim(),
        specialties,
        fullName: String(row.full_name || '').trim()
      });
    } catch (e) {
      return sendJson(res, 200, { ok: true, outcome: '', specialties: [], fullName: '' });
    }
  }

  return false;
};
