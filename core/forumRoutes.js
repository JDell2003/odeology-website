const crypto = require('crypto');
const db = require('./db');

const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.FORUM_MAX_BODY_BYTES || 1_500_000));

let schemaEnsured = false;
let schemaEnsurePromise = null;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
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

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
  return true;
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', () => reject(new Error('Invalid request body')));
  });
}

function normalizeText(raw, max) {
  const value = String(raw || '').trim();
  if (!value) return null;
  return value.slice(0, max);
}

function normalizeCategory(raw) {
  const value = String(raw || '').trim().toLowerCase();
  const allowed = new Set(['training', 'nutrition', 'recovery', 'cutting', 'bulking', 'supplements', 'lifestyle']);
  return allowed.has(value) ? value : 'training';
}

function normalizeImageUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) {
    if (value.length > 1_200_000) return null;
    return value;
  }
  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;
  if (!db.isConfigured()) return;

  schemaEnsurePromise = (async () => {
    await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_forum_posts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        category text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        image_url text,
        image_alt text
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_app_forum_posts_created_at ON app_forum_posts(created_at DESC);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_app_forum_posts_user_id ON app_forum_posts(user_id, created_at DESC);');
    schemaEnsured = true;
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

async function resolveUserFromSession(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  try {
    const result = await db.query(
      `
        SELECT u.id, u.username, u.display_name, u.email
        FROM app_sessions s
        JOIN app_users u ON u.id = s.user_id
        WHERE s.session_token_hash = $1
          AND s.expires_at > now()
        LIMIT 1;
      `,
      [tokenHash]
    );
    return result.rows?.[0] || null;
  } catch {
    return null;
  }
}

function formatForumPost(row) {
  return {
    id: `user-forum-${row.id}`,
    slug: `user-forum-${row.id}`,
    title: row.title,
    body: row.body,
    category: row.category,
    scope: row.category,
    community: 'r/odeology_forum',
    author: row.username || row.display_name || 'member',
    postType: 'personal',
    format: row.image_url ? 'image' : 'text',
    imageUrl: row.image_url || null,
    imageAlt: row.image_alt || row.title || null,
    imageType: row.image_url ? 'general_gym' : null,
    imageSubject: row.image_url ? 'member post' : null,
    imageMainObject: row.image_url ? 'member post' : null,
    imageMuscleGroup: null,
    score: 1,
    comments: 0,
    viewCount: 1,
    saveCount: 0,
    createdAt: row.created_at,
    ageMinutes: null,
    isSeeded: false
  };
}

module.exports = async function forumRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/forum/posts')) return false;

  if (!db.isConfigured()) {
    return sendJson(res, 501, { error: 'Database not configured' });
  }

  await ensureSchema();

  if (url.pathname === '/api/forum/posts' && req.method === 'GET') {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 60)));
    try {
      const result = await db.query(
        `
          SELECT p.id, p.created_at, p.category, p.title, p.body, p.image_url, p.image_alt,
                 u.username, u.display_name
          FROM app_forum_posts p
          JOIN app_users u ON u.id = p.user_id
          ORDER BY p.created_at DESC
          LIMIT $1;
        `,
        [limit]
      );
      return sendJson(res, 200, { items: result.rows.map(formatForumPost) });
    } catch (err) {
      console.error('[forum-posts-list]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to load forum posts' });
    }
  }

  if (url.pathname === '/api/forum/posts' && req.method === 'POST') {
    const user = await resolveUserFromSession(req);
    if (!user) return sendJson(res, 401, { error: 'Not signed in' });

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const title = normalizeText(payload?.title, 140);
    const body = normalizeText(payload?.body, 1200);
    const category = normalizeCategory(payload?.category);
    const imageUrl = normalizeImageUrl(payload?.imageUrl || payload?.imageDataUrl);
    const imageAlt = normalizeText(payload?.imageAlt || title, 160);

    if (!title || !body) {
      return sendJson(res, 400, { error: 'Title and description are required' });
    }

    try {
      const inserted = await db.query(
        `
          INSERT INTO app_forum_posts (user_id, category, title, body, image_url, image_alt)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, created_at, category, title, body, image_url, image_alt;
        `,
        [user.id, category, title, body, imageUrl, imageAlt]
      );
      const row = inserted.rows?.[0];
      return sendJson(res, 201, {
        ok: true,
        item: formatForumPost({
          ...row,
          username: user.username,
          display_name: user.display_name
        })
      });
    } catch (err) {
      console.error('[forum-posts-create]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to create forum post' });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
};
