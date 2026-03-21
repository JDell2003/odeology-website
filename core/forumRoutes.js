const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.FORUM_MAX_BODY_BYTES || 1_500_000));
const FORUM_DATA_PATH = path.join(process.cwd(), 'data', 'forum-posts.json');
const DEFAULT_FORUM_IMAGE = 'https://STRYVE.up.railway.app/assets/images/exercises/muscle_arms.svg';

let schemaEnsured = false;
let schemaEnsurePromise = null;
let seededCache = { mtimeMs: 0, payload: null };

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

function sendText(res, status, contentType, body) {
  res.writeHead(status, {
    'Content-Type': contentType
  });
  res.end(body);
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

function slugify(raw) {
  const cleaned = String(raw || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return cleaned || 'forum-post';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function canonicalBaseUrl(req) {
  const explicit = String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.SITE_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (number >= 1000) {
    const compact = Math.round(number / 100) / 10;
    return `${compact % 1 === 0 ? compact.toFixed(0) : compact}K`;
  }
  return String(number);
}

function formatRelativeAge(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  if (value < 3) return 'just now';
  if (value < 60) return `${Math.max(1, Math.round(value))}m ago`;
  if (value < 1440) return `${Math.round(value / 60)}h ago`;
  if (value < 2880) return 'yesterday';
  return `${Math.round(value / 1440)} days ago`;
}

function computeAgeMinutesFromDate(raw) {
  const ts = Date.parse(String(raw || ''));
  if (!Number.isFinite(ts)) return null;
  return Math.max(1, Math.round((Date.now() - ts) / 60000));
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
        slug text,
        title text NOT NULL,
        body text NOT NULL,
        image_url text,
        image_alt text
      );
    `);
    await db.query('ALTER TABLE app_forum_posts ADD COLUMN IF NOT EXISTS slug text;');
    await db.query('CREATE INDEX IF NOT EXISTS idx_app_forum_posts_created_at ON app_forum_posts(created_at DESC);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_app_forum_posts_user_id ON app_forum_posts(user_id, created_at DESC);');
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_app_forum_posts_slug ON app_forum_posts(slug) WHERE slug IS NOT NULL;');
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

function getSeededPayload() {
  try {
    const stat = fs.statSync(FORUM_DATA_PATH);
    if (seededCache.payload && seededCache.mtimeMs === stat.mtimeMs) {
      return seededCache.payload;
    }
    const parsed = JSON.parse(fs.readFileSync(FORUM_DATA_PATH, 'utf8'));
    seededCache = { mtimeMs: stat.mtimeMs, payload: parsed };
    return parsed;
  } catch {
    return { generatedAt: null, items: [] };
  }
}

function formatForumPost(row) {
  const slug = String(row.slug || `${slugify(row.title)}-${String(row.id || '').slice(0, 8)}`).trim();
  return {
    id: `user-forum-${row.id}`,
    rawId: row.id,
    slug,
    title: row.title,
    body: row.body,
    category: row.category,
    scope: row.category,
    community: 'r/STRYVEforum',
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
    ageMinutes: computeAgeMinutesFromDate(row.created_at),
    isSeeded: false
  };
}

async function buildUniqueSlug(baseSlug) {
  if (!db.isConfigured()) return baseSlug;
  await ensureSchema();
  const rows = await db.query(
    `
      SELECT slug
      FROM app_forum_posts
      WHERE slug = $1 OR slug LIKE $2;
    `,
    [baseSlug, `${baseSlug}-%`]
  );
  const used = new Set((rows.rows || []).map((row) => String(row.slug || '').trim()).filter(Boolean));
  if (!used.has(baseSlug)) return baseSlug;
  let counter = 2;
  while (used.has(`${baseSlug}-${counter}`)) counter += 1;
  return `${baseSlug}-${counter}`;
}

async function listSharedPosts(limit = 80) {
  if (!db.isConfigured()) return [];
  await ensureSchema();
  try {
    const result = await db.query(
      `
        SELECT p.id, p.slug, p.created_at, p.category, p.title, p.body, p.image_url, p.image_alt,
               u.username, u.display_name
        FROM app_forum_posts p
        JOIN app_users u ON u.id = p.user_id
        ORDER BY p.created_at DESC
        LIMIT $1;
      `,
      [limit]
    );
    return result.rows.map(formatForumPost);
  } catch {
    return [];
  }
}

async function findSharedPostBySlug(slug) {
  if (!db.isConfigured()) return null;
  await ensureSchema();
  try {
    const result = await db.query(
      `
        SELECT p.id, p.slug, p.created_at, p.category, p.title, p.body, p.image_url, p.image_alt,
               u.username, u.display_name
        FROM app_forum_posts p
        JOIN app_users u ON u.id = p.user_id
        WHERE p.slug = $1
        LIMIT 1;
      `,
      [slug]
    );
    const row = result.rows?.[0];
    return row ? formatForumPost(row) : null;
  } catch {
    return null;
  }
}

function findSeededPostBySlug(slug) {
  const payload = getSeededPayload();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const post = items.find((item) => String(item.slug || '').trim() === slug);
  if (!post) return null;
  return {
    ...post,
    ageMinutes: Number.isFinite(Number(post.ageMinutes)) ? Number(post.ageMinutes) : null,
    createdAt: payload.generatedAt || null,
    isSeeded: post.isSeeded !== false
  };
}

function buildForumPostHtml(post, req) {
  const baseUrl = canonicalBaseUrl(req);
  const postUrl = `${baseUrl}/forum/${encodeURIComponent(post.slug)}`;
  const imageUrl = post.imageUrl || DEFAULT_FORUM_IMAGE;
  const description = truncate(post.body || post.title || '', 160) || 'Forum discussion on STRYVE.';
  const pageTitle = `${post.title} | STRYVE Forum`;
  const author = post.author || 'STRYVEmember';
  const community = post.community || 'r/STRYVEforum';
  const ageLabel = formatRelativeAge(post.ageMinutes);
  const categoryLabel = String(post.category || 'training');
  const imageMarkup = post.imageUrl
    ? `<div class="forum-post-page-media"><img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.imageAlt || post.title)}"></div>`
    : '';
  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: post.title,
    articleBody: post.body,
    datePublished: post.createdAt || new Date().toISOString(),
    dateModified: post.createdAt || new Date().toISOString(),
    author: {
      '@type': 'Person',
      name: author
    },
    url: postUrl,
    image: imageUrl,
    articleSection: categoryLabel,
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: Number(post.score || 0)
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: Number(post.comments || 0)
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(postUrl)}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(postUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <script type="application/ld+json">${JSON.stringify(ldJson)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body{margin:0;background:#f5f7fa;color:#18212a;font-family:"IBM Plex Sans","Segoe UI",sans-serif}
    .shell{width:min(920px,calc(100vw - 1.5rem));margin:96px auto 56px}
    .back{display:inline-flex;align-items:center;gap:.5rem;margin-bottom:1rem;color:#27485d;text-decoration:none;font-weight:700}
    .card{background:#fff;border:1px solid #dde3e8;border-radius:28px;box-shadow:0 18px 42px rgba(15,23,35,.08);padding:clamp(1.1rem,2vw,1.8rem);display:grid;gap:1rem}
    .meta{display:flex;flex-wrap:wrap;gap:.55rem;color:#677482;font-size:.9rem}
    .pill{display:inline-flex;align-items:center;padding:.34rem .72rem;border-radius:999px;background:#edf2f6;color:#27485d;font-size:.78rem;font-weight:800;text-transform:capitalize}
    h1{margin:0;font:700 clamp(1.8rem,4vw,3.1rem)/.98 "Space Grotesk",sans-serif;letter-spacing:-.05em}
    .body{margin:0;color:#31414f;line-height:1.7;font-size:1rem;white-space:pre-wrap}
    .forum-post-page-media{border-radius:24px;overflow:hidden;background:#e8edf2}
    .forum-post-page-media img{display:block;width:100%;height:auto;max-height:780px;object-fit:cover}
    .stats{display:flex;flex-wrap:wrap;gap:.6rem;color:#677482;font-size:.9rem}
    .section{padding-top:.6rem;border-top:1px solid #e6ebf0}
    .section h2{margin:0 0 .4rem;font:700 1.05rem/1.2 "Space Grotesk",sans-serif}
    .section p{margin:0;color:#51606d;line-height:1.65}
    @media (max-width:640px){.shell{width:min(100vw - .8rem,100vw - .8rem);margin-top:84px}.card{border-radius:22px}}
  </style>
</head>
<body>
  <main class="shell">
    <a class="back" href="/forum.html">← Back to forum</a>
    <article class="card">
      <div class="meta">
        <span class="pill">${escapeHtml(categoryLabel)}</span>
        <span>u/${escapeHtml(author)}</span>
        <span>•</span>
        <span>${escapeHtml(community)}</span>
        <span>•</span>
        <span>${escapeHtml(ageLabel)}</span>
      </div>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="body">${escapeHtml(post.body)}</p>
      ${imageMarkup}
      <div class="stats">
        <span>${escapeHtml(formatCompactNumber(post.score || 0))} upvotes</span>
        <span>•</span>
        <span>${escapeHtml(formatCompactNumber(post.comments || 0))} comments</span>
        <span>•</span>
        <span>${escapeHtml(formatCompactNumber(post.viewCount || 0))} views</span>
      </div>
      <section class="section">
        <h2>Forum Thread</h2>
        <p>This is a standalone forum post page for indexing, sharing, and direct linking inside STRYVE.</p>
      </section>
    </article>
  </main>
</body>
</html>`;
}

async function buildForumSitemap(req) {
  const baseUrl = canonicalBaseUrl(req);
  const seeded = getSeededPayload();
  const seededItems = Array.isArray(seeded.items) ? seeded.items : [];
  const sharedItems = await listSharedPosts(500);
  const urls = [
    {
      loc: `${baseUrl}/forum.html`,
      lastmod: seeded.generatedAt || new Date().toISOString()
    }
  ];

  seededItems.forEach((item) => {
    if (!item?.slug) return;
    urls.push({
      loc: `${baseUrl}/forum/${encodeURIComponent(item.slug)}`,
      lastmod: seeded.generatedAt || new Date().toISOString()
    });
  });

  sharedItems.forEach((item) => {
    if (!item?.slug) return;
    urls.push({
      loc: `${baseUrl}/forum/${encodeURIComponent(item.slug)}`,
      lastmod: item.createdAt || new Date().toISOString()
    });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((entry) => `  <url>\n    <loc>${xmlEscape(entry.loc)}</loc>\n    <lastmod>${xmlEscape(String(entry.lastmod).slice(0, 10))}</lastmod>\n  </url>`).join('\n')}\n</urlset>`;
  return xml;
}

module.exports = async function forumRoutes(req, res, url) {
  if (url.pathname === '/forum-sitemap.xml' && req.method === 'GET') {
    const xml = await buildForumSitemap(req);
    return sendText(res, 200, 'application/xml; charset=utf-8', xml);
  }

  if (url.pathname.startsWith('/forum/') && req.method === 'GET') {
    const slug = decodeURIComponent(url.pathname.replace(/^\/forum\//, '').replace(/\/+$/, '')).trim();
    if (!slug) return sendText(res, 404, 'text/plain; charset=utf-8', 'Not found');
    const post = await findSharedPostBySlug(slug) || findSeededPostBySlug(slug);
    if (!post) return sendText(res, 404, 'text/plain; charset=utf-8', 'Not found');
    return sendText(res, 200, 'text/html; charset=utf-8', buildForumPostHtml(post, req));
  }

  if (!url.pathname.startsWith('/api/forum/posts')) return false;

  if (!db.isConfigured()) {
    return sendJson(res, 501, { error: 'Database not configured' });
  }

  await ensureSchema();

  if (url.pathname === '/api/forum/posts' && req.method === 'GET') {
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 80)));
    const items = await listSharedPosts(limit);
    return sendJson(res, 200, { items });
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
      const slug = await buildUniqueSlug(slugify(title));
      const inserted = await db.query(
        `
          INSERT INTO app_forum_posts (user_id, category, slug, title, body, image_url, image_alt)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, slug, created_at, category, title, body, image_url, image_alt;
        `,
        [user.id, category, slug, title, body, imageUrl, imageAlt]
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
