const crypto = require('crypto');
const db = require('./db');

const ADMIN_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME || 'asid';
const ADMIN_SESSION_TTL_DAYS = Math.max(1, Number(process.env.ADMIN_SESSION_TTL_DAYS || 7));
const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.ADMIN_MAX_BODY_BYTES || 200_000));

let schemaEnsured = false;
let schemaEnsurePromise = null;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
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

function isSecureRequest(req) {
  if (String(process.env.COOKIE_SECURE || '') === '1') return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (proto === 'https') return true;
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function setCookieHeader(value, req) {
  const parts = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieHeader(req) {
  const parts = [
    `${ADMIN_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
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
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function isAdminConfigured() {
  return Boolean(
    process.env.ADMIN_USERNAME &&
      process.env.ADMIN_PASSCODE
  );
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;
  if (!db.isConfigured()) return;

  const safeQuery = async (sql) => {
    try {
      await db.query(sql);
    } catch (err) {
      const code = String(err?.code || '');
      if (code === '23505' || code === '42P07') return;
      throw err;
    }
  };

  schemaEnsurePromise = (async () => {
    await safeQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    await safeQuery(`
    CREATE TABLE IF NOT EXISTS app_admin_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_token_hash text UNIQUE NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
  `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_admin_sessions_expires_at ON app_admin_sessions(expires_at);');

	    await safeQuery(`
	    CREATE TABLE IF NOT EXISTS app_guests (
	      id uuid PRIMARY KEY,
	      created_at timestamptz NOT NULL DEFAULT now(),
	      last_seen timestamptz NOT NULL DEFAULT now(),
	      user_agent text,
	      ip_hash text,
	      inferred_user_id uuid,
	      email text,
	      phone text,
	      events_pruned integer NOT NULL DEFAULT 0
	    );
	  `);
	    await safeQuery('ALTER TABLE app_guests ADD COLUMN IF NOT EXISTS email text;');
	    await safeQuery('ALTER TABLE app_guests ADD COLUMN IF NOT EXISTS phone text;');
	    await safeQuery('ALTER TABLE app_guests ADD COLUMN IF NOT EXISTS events_pruned integer NOT NULL DEFAULT 0;');
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_guests_last_seen ON app_guests(last_seen);');
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_guests_inferred_user_id ON app_guests(inferred_user_id);');
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_guests_email ON app_guests(email);');
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_guests_phone ON app_guests(phone);');

    await safeQuery(`
    CREATE TABLE IF NOT EXISTS app_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      event_name text NOT NULL,
      path text,
      user_id uuid,
      guest_id uuid,
      props jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_events_created_at ON app_events(created_at);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_events_user_id ON app_events(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_events_guest_id ON app_events(guest_id);');

    await safeQuery(`
    CREATE TABLE IF NOT EXISTS app_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      source text NOT NULL DEFAULT 'intake',
      first_name text,
      last_name text,
      email text,
      phone text,
      wants jsonb NOT NULL DEFAULT '[]'::jsonb,
      snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      user_id uuid,
      guest_id uuid,
      email_optin boolean NOT NULL DEFAULT true,
      notes text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'new'
    );
  `);
    await safeQuery("ALTER TABLE app_leads ADD COLUMN IF NOT EXISTS email_optin boolean NOT NULL DEFAULT true;");
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_leads_created_at ON app_leads(created_at);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_leads_status ON app_leads(status);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_leads_user_id ON app_leads(user_id);');
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_leads_guest_id ON app_leads(guest_id);');

	    await safeQuery(`
	    CREATE TABLE IF NOT EXISTS app_orders (
	      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	      created_at timestamptz NOT NULL DEFAULT now(),
	      status text NOT NULL DEFAULT 'paid',
	      title text,
	      amount_cents integer,
	      currency text NOT NULL DEFAULT 'usd',
	      email text,
	      phone text,
	      image_url text,
	      snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
	      user_id uuid,
	      guest_id uuid
	    );
	  `);
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_orders_created_at ON app_orders(created_at);');
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_orders_status ON app_orders(status);');
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_orders_user_id ON app_orders(user_id);');
	    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_orders_guest_id ON app_orders(guest_id);');

    await safeQuery(`
    CREATE TABLE IF NOT EXISTS app_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      name text,
      email text,
      subject text,
      message text,
      path text,
      user_id uuid,
      guest_id uuid,
      status text NOT NULL DEFAULT 'new'
    );
  `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_messages_created_at ON app_messages(created_at);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_messages_status ON app_messages(status);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_messages_user_id ON app_messages(user_id);');
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_messages_guest_id ON app_messages(guest_id);');

    schemaEnsured = true;
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

async function getAdminSession(req) {
  if (!db.isConfigured()) return false;
  await ensureSchema();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return false;
  const tokenHash = sha256Hex(token);
  const result = await db.query(
    'SELECT 1 FROM app_admin_sessions WHERE session_token_hash = $1 AND expires_at > now() LIMIT 1;',
    [tokenHash]
  );
  return Boolean(result.rows?.[0]);
}

async function createAdminSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.query('INSERT INTO app_admin_sessions (session_token_hash, expires_at) VALUES ($1, $2);', [tokenHash, expiresAt]);
  return token;
}

async function deleteAdminSession(req) {
  if (!db.isConfigured()) return;
  await ensureSchema();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return;
  const tokenHash = sha256Hex(token);
  await db.query('DELETE FROM app_admin_sessions WHERE session_token_hash = $1;', [tokenHash]);
}

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizePhone(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;
  const hasPlus = value.startsWith('+');
  value = value.replace(/[^\d+]/g, '');
  if (hasPlus) value = '+' + value.replace(/[^\d]/g, '');
  else value = value.replace(/[^\d]/g, '');
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  return value;
}

async function cleanupExpired() {
  if (!db.isConfigured()) return;
  await ensureSchema();
  await db.query('DELETE FROM app_admin_sessions WHERE expires_at <= now();');
}

let lastCleanupAt = 0;
async function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanupAt < 30 * 60 * 1000) return;
  lastCleanupAt = now;
  try {
    await cleanupExpired();
  } catch {
    // ignore
  }
}

async function handleAdminLogin(req, res) {
  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  if (!isAdminConfigured()) return sendJson(res, 501, { error: 'Admin not configured' });

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const username = String(payload?.username || '').trim().toLowerCase();
  const passcode = String(payload?.passcode || '');

  const ok =
    username &&
    passcode &&
    timingSafeEqualStr(username, String(process.env.ADMIN_USERNAME).trim().toLowerCase()) &&
    timingSafeEqualStr(passcode, String(process.env.ADMIN_PASSCODE));

  if (!ok) return sendJson(res, 401, { error: 'Invalid credentials' });

  const token = await createAdminSession();
  return sendJson(res, 200, { ok: true }, { 'Set-Cookie': setCookieHeader(token, req) });
}

async function requireAdmin(req, res) {
  if (!db.isConfigured()) {
    sendJson(res, 501, { error: 'Database not configured' });
    return false;
  }
  await ensureSchema();
  const ok = await getAdminSession(req);
  if (!ok) {
    sendJson(res, 401, { error: 'Not authenticated' });
    return false;
  }
  return true;
}

async function listUsers(res) {
  const result = await db.query(
    `
      SELECT
        id,
        created_at,
        username,
        email,
        phone,
        display_name,
        COALESCE(last_seen, created_at) AS last_seen,
        COALESCE(last_login, created_at) AS last_login,
        COALESCE(admin_notes, '') AS admin_notes
      FROM app_users
      ORDER BY created_at DESC
      LIMIT 2000;
    `
  );
  sendJson(res, 200, { users: result.rows || [] });
}

async function getUserDetail(res, userId) {
  const userRes = await db.query(
    `
      SELECT
        id,
        created_at,
        username,
        email,
        phone,
        display_name,
        COALESCE(last_seen, created_at) AS last_seen,
        COALESCE(last_login, created_at) AS last_login,
        COALESCE(admin_notes, '') AS admin_notes
      FROM app_users
      WHERE id = $1
      LIMIT 1;
    `,
    [userId]
  );
  const user = userRes.rows?.[0] || null;

  const leadsRes = await db.query(
    `
      SELECT id, created_at, source, first_name, last_name, email, phone, wants, snapshot, status, notes
      FROM app_leads
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 200;
    `,
    [userId]
  );

  const eventsRes = await db.query(
    `
      SELECT id, created_at, event_name, path, props, guest_id
      FROM app_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 500;
    `,
    [userId]
  );

  sendJson(res, 200, { user, leads: leadsRes.rows || [], events: eventsRes.rows || [] });
}

async function updateUserNotes(req, res, userId) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const notes = String(payload?.notes || '').slice(0, 50_000);
  await db.query('UPDATE app_users SET admin_notes = $2 WHERE id = $1;', [userId, notes]);
  sendJson(res, 200, { ok: true });
}

async function listLeads(res) {
  const result = await db.query(
    `
      SELECT
        l.id,
        l.created_at,
        l.source,
        l.first_name,
        l.last_name,
        l.email,
        l.phone,
        l.wants,
        l.status,
        COALESCE(l.notes, '') AS notes,
        l.user_id,
        l.guest_id,
        u.display_name AS user_display_name
      FROM app_leads l
      LEFT JOIN app_users u ON u.id = l.user_id
      WHERE COALESCE(NULLIF(l.email, ''), NULLIF(l.phone, '')) IS NOT NULL
      ORDER BY l.created_at DESC
      LIMIT 2000;
    `
  );
  sendJson(res, 200, { leads: result.rows || [] });
}

async function getAnalytics(res) {
  const days = 30;
  const startRes = await db.query(`SELECT date_trunc('day', now()) - ($1::int * interval '1 day') AS start;`, [days - 1]);
  const start = startRes.rows?.[0]?.start || null;
  const monthStartRes = await db.query(`SELECT date_trunc('month', now()) AS month_start;`);
  const monthStart = monthStartRes.rows?.[0]?.month_start || null;

  const visitorsRes = await db.query(
    `
      SELECT
        date_trunc('day', created_at) AS day,
        COUNT(DISTINCT guest_id) FILTER (WHERE guest_id IS NOT NULL) AS visitors,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS signed_in
      FROM app_events
      WHERE created_at >= $1
      GROUP BY 1
      ORDER BY 1;
    `,
    [start]
  );

  const accountsRes = await db.query(
    `
      SELECT date_trunc('day', created_at) AS day, COUNT(*) AS accounts_created
      FROM app_users
      WHERE created_at >= $1
      GROUP BY 1
      ORDER BY 1;
    `,
    [start]
  );

  const leadsRes = await db.query(
    `
      SELECT date_trunc('day', created_at) AS day, COUNT(*) AS leads_created
      FROM app_leads
      WHERE created_at >= $1
      GROUP BY 1
      ORDER BY 1;
    `,
    [start]
  );

  const todayRes = await db.query(
    `
      WITH today AS (SELECT date_trunc('day', now()) AS d)
      SELECT
        (SELECT COUNT(DISTINCT guest_id) FROM app_events e, today WHERE e.created_at >= today.d AND e.guest_id IS NOT NULL) AS visitors_today,
        (SELECT COUNT(*) FROM app_users u, today WHERE u.created_at >= today.d) AS accounts_today,
        (SELECT COUNT(*) FROM app_leads l, today WHERE l.created_at >= today.d) AS leads_today,
        (SELECT COUNT(*) FROM app_events e, today WHERE e.created_at >= today.d) AS events_today;
    `
  );

  const topEventsTodayRes = await db.query(
    `
      WITH today AS (SELECT date_trunc('day', now()) AS d)
      SELECT event_name, COUNT(*) AS count
      FROM app_events e, today
      WHERE e.created_at >= today.d
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 12;
    `
  );

  const monthVisitorsRes = await db.query(
    `
      SELECT COUNT(DISTINCT guest_id) FILTER (WHERE guest_id IS NOT NULL) AS visitors_month
      FROM app_events
      WHERE created_at >= $1::timestamptz
        AND created_at < ($1::timestamptz + interval '1 month');
    `,
    [monthStart]
  );

  const monthUsersRes = await db.query(
    `
      SELECT COUNT(*) AS users_month
      FROM app_users
      WHERE created_at >= $1::timestamptz
        AND created_at < ($1::timestamptz + interval '1 month');
    `,
    [monthStart]
  );

  const prevMonthUsersRes = await db.query(
    `
      SELECT COUNT(*) AS users_prev_month
      FROM app_users
      WHERE created_at >= ($1::timestamptz - interval '1 month')
        AND created_at < $1::timestamptz;
    `,
    [monthStart]
  );

  // Approximate "surfers" as guests with no inferred user and no user_id event today.
  const surfersTodayRes = await db.query(
    `
      WITH today AS (SELECT date_trunc('day', now()) AS d),
      guests_today AS (
        SELECT DISTINCT e.guest_id
        FROM app_events e, today
        WHERE e.created_at >= today.d AND e.guest_id IS NOT NULL
      ),
      guests_with_user AS (
        SELECT DISTINCT e.guest_id
        FROM app_events e, today
        WHERE e.created_at >= today.d AND e.guest_id IS NOT NULL AND e.user_id IS NOT NULL
        UNION
        SELECT DISTINCT g.id
        FROM app_guests g
        JOIN guests_today gt ON gt.guest_id = g.id
        WHERE g.inferred_user_id IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*) FROM guests_today) AS guests_today,
        (SELECT COUNT(*) FROM guests_with_user) AS guests_with_user_today;
    `
  );

  sendJson(res, 200, {
    ok: true,
    windowDays: days,
    visitorsByDay: visitorsRes.rows || [],
    accountsByDay: accountsRes.rows || [],
    leadsByDay: leadsRes.rows || [],
    today: todayRes.rows?.[0] || {},
    todayTopEvents: topEventsTodayRes.rows || [],
    todayGuestBreakdown: surfersTodayRes.rows?.[0] || {},
    monthVisitors: Number(monthVisitorsRes.rows?.[0]?.visitors_month) || 0,
    monthUsers: Number(monthUsersRes.rows?.[0]?.users_month) || 0,
    monthUsersPrev: Number(prevMonthUsersRes.rows?.[0]?.users_prev_month) || 0
  });
}

async function listOrders(res) {
  const result = await db.query(
    `
      SELECT
        id,
        created_at,
        status,
        title,
        amount_cents,
        currency,
        email,
        phone,
        image_url,
        user_id,
        guest_id
      FROM app_orders
      ORDER BY created_at DESC
      LIMIT 2000;
    `
  );
  sendJson(res, 200, { orders: result.rows || [] });
}

async function listMessages(res) {
  const result = await db.query(
    `
      SELECT
        id,
        created_at,
        name,
        email,
        subject,
        status,
        path
      FROM app_messages
      ORDER BY created_at DESC
      LIMIT 2000;
    `
  );
  sendJson(res, 200, { messages: result.rows || [] });
}

async function getOrderDetail(res, orderId) {
  const r = await db.query(
    `
      SELECT
        id,
        created_at,
        status,
        title,
        amount_cents,
        currency,
        email,
        phone,
        image_url,
        snapshot,
        user_id,
        guest_id
      FROM app_orders
      WHERE id = $1
      LIMIT 1;
    `,
    [orderId]
  );
  sendJson(res, 200, { order: r.rows?.[0] || null });
}

async function getMessageDetail(res, messageId) {
  const r = await db.query(
    `
      SELECT
        id,
        created_at,
        name,
        email,
        subject,
        message,
        status,
        path,
        user_id,
        guest_id
      FROM app_messages
      WHERE id = $1
      LIMIT 1;
    `,
    [messageId]
  );
  sendJson(res, 200, { message: r.rows?.[0] || null });
}

async function getLeadDetail(res, leadId) {
  const leadRes = await db.query(
    `
      SELECT
        l.id,
        l.created_at,
        l.source,
        l.first_name,
        l.last_name,
        l.email,
        l.phone,
        l.wants,
        l.snapshot,
        l.status,
        COALESCE(l.notes, '') AS notes,
        l.user_id,
        l.guest_id,
        u.username AS user_username,
        u.email AS user_email,
        u.phone AS user_phone,
        u.display_name AS user_display_name
      FROM app_leads l
      LEFT JOIN app_users u ON u.id = l.user_id
      WHERE l.id = $1
      LIMIT 1;
    `,
    [leadId]
  );
  const lead = leadRes.rows?.[0] || null;

  let guest = null;
  if (lead?.guest_id) {
    const gRes = await db.query(
      `
        SELECT
          g.id,
          g.created_at,
          g.last_seen,
          g.user_agent,
          g.inferred_user_id,
          g.email,
          g.phone,
          u.username AS inferred_username,
          u.display_name AS inferred_display_name,
          u.email AS inferred_email,
          u.phone AS inferred_phone
        FROM app_guests g
        LEFT JOIN app_users u ON u.id = g.inferred_user_id
        WHERE g.id = $1
        LIMIT 1;
      `,
      [lead.guest_id]
    );
    guest = gRes.rows?.[0] || null;
  }

  let likelyUsers = [];
  try {
    const email = lead?.email ? String(lead.email).trim().toLowerCase() : '';
    const phone = lead?.phone ? String(lead.phone).trim() : '';
    if (email || phone) {
      const r = await db.query(
        `
          SELECT id, created_at, username, display_name, email, phone, COALESCE(last_seen, created_at) AS last_seen
          FROM app_users
          WHERE ($1 <> '' AND lower(email) = $1)
             OR ($2 <> '' AND phone = $2)
          ORDER BY created_at DESC
          LIMIT 5;
        `,
        [email, phone]
      );
      likelyUsers = r.rows || [];
    }
  } catch {
    likelyUsers = [];
  }

  let events = [];
  if (lead?.guest_id) {
    const evRes = await db.query(
      `
        SELECT id, created_at, event_name, path, props, user_id
        FROM app_events
        WHERE guest_id = $1
        ORDER BY created_at DESC
        LIMIT 500;
      `,
      [lead.guest_id]
    );
    events = evRes.rows || [];
  }

  sendJson(res, 200, { lead, guest, likelyUsers, events });
}

async function updateLead(req, res, leadId) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const notes = String(payload?.notes ?? '').slice(0, 50_000);
  const status = String(payload?.status ?? '').trim().toLowerCase();
  const allowed = new Set(['new', 'contacted', 'qualified', 'won', 'lost']);
  const nextStatus = allowed.has(status) ? status : 'new';
  await db.query('UPDATE app_leads SET notes = $2, status = $3 WHERE id = $1;', [leadId, notes, nextStatus]);
  sendJson(res, 200, { ok: true });
}

async function listGuests(res) {
  const result = await db.query(
    `
      SELECT
        g.id,
        g.created_at,
        g.last_seen,
        g.user_agent,
        g.email,
        g.phone,
        g.inferred_user_id,
        u.display_name AS inferred_user_name
      FROM app_guests g
      LEFT JOIN app_users u ON u.id = g.inferred_user_id
      ORDER BY g.last_seen DESC
      LIMIT 2000;
    `
  );
  sendJson(res, 200, { guests: result.rows || [] });
}

async function getGuestDetail(res, guestId) {
  const guestRes = await db.query(
    `
      SELECT
        g.id,
        g.created_at,
        g.last_seen,
        g.user_agent,
        g.email,
        g.phone,
        g.events_pruned,
        g.inferred_user_id,
        u.display_name AS inferred_user_name
      FROM app_guests g
      LEFT JOIN app_users u ON u.id = g.inferred_user_id
      WHERE g.id = $1
      LIMIT 1;
    `,
    [guestId]
  );
  const guest = guestRes.rows?.[0] || null;

  const leadsRes = await db.query(
    `
      SELECT
        id,
        created_at,
        source,
        first_name,
        last_name,
        email,
        phone,
        wants,
        snapshot,
        email_optin,
        status,
        notes
      FROM app_leads
      WHERE guest_id = $1
      ORDER BY created_at DESC
      LIMIT 100;
    `,
    [guestId]
  );
  const leads = leadsRes.rows || [];

  const eventsRes = await db.query(
    `
      SELECT id, created_at, event_name, path, props, user_id
      FROM app_events
      WHERE guest_id = $1
      ORDER BY created_at DESC
      LIMIT 50;
    `,
    [guestId]
  );
  const events = eventsRes.rows || [];

  // Simple time-on-page estimate from page_exit durationSec values (per-event capped at 360s).
  const durationSec = events.reduce((sum, ev) => {
    const d = Number(ev?.props?.durationSec);
    if (!Number.isFinite(d) || d <= 0) return sum;
    return sum + Math.min(360, d);
  }, 0);

  const pathCounts = {};
  for (const ev of events) {
    const p = String(ev?.path || '').slice(0, 500);
    if (!p) continue;
    pathCounts[p] = (pathCounts[p] || 0) + 1;
  }
  const topPaths = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  sendJson(res, 200, { guest, leads, events, summary: { durationSec, topPaths, eventsStored: events.length, eventsPruned: Number(guest?.events_pruned || 0) } });
}

async function deleteLead(res, leadId) {
  await db.query('DELETE FROM app_leads WHERE id = $1;', [leadId]);
  sendJson(res, 200, { ok: true });
}

async function deleteMessage(res, messageId) {
  await db.query('DELETE FROM app_messages WHERE id = $1;', [messageId]);
  sendJson(res, 200, { ok: true });
}

async function deleteGuest(res, guestId) {
  await db.query('DELETE FROM app_events WHERE guest_id = $1;', [guestId]);
  await db.query('DELETE FROM app_leads WHERE guest_id = $1;', [guestId]);
  await db.query('DELETE FROM app_messages WHERE guest_id = $1;', [guestId]);
  await db.query('DELETE FROM app_guests WHERE id = $1;', [guestId]);
  sendJson(res, 200, { ok: true });
}

async function deleteUser(res, userId) {
  // Remove non-FK linked rows first (events/leads reference user_id without FK).
  await db.query('DELETE FROM app_events WHERE user_id = $1;', [userId]);
  await db.query('DELETE FROM app_leads WHERE user_id = $1;', [userId]);
  await db.query('DELETE FROM app_messages WHERE user_id = $1;', [userId]);
  // FK cascades should handle sessions/identities.
  await db.query('DELETE FROM app_users WHERE id = $1;', [userId]);
  sendJson(res, 200, { ok: true });
}

function coerceUuidList(input, { max = 500 } = {}) {
  const src = Array.isArray(input) ? input : [];
  const trimmed = src.map((v) => String(v || '').trim()).filter(Boolean);
  const unique = Array.from(new Set(trimmed));
  const uuids = unique.filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v));
  return uuids.slice(0, Math.max(0, Number(max) || 0));
}

async function bulkDeleteUsers(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const ids = coerceUuidList(payload?.ids, { max: 1000 });
  if (ids.length === 0) return sendJson(res, 400, { error: 'No valid ids' });

  await db.query('DELETE FROM app_events WHERE user_id = ANY($1::uuid[]);', [ids]);
  await db.query('DELETE FROM app_leads WHERE user_id = ANY($1::uuid[]);', [ids]);
  await db.query('DELETE FROM app_messages WHERE user_id = ANY($1::uuid[]);', [ids]);
  const r = await db.query('DELETE FROM app_users WHERE id = ANY($1::uuid[]);', [ids]);
  return sendJson(res, 200, { ok: true, deleted: r.rowCount || 0 });
}

async function bulkDeleteLeads(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const ids = coerceUuidList(payload?.ids, { max: 2000 });
  if (ids.length === 0) return sendJson(res, 400, { error: 'No valid ids' });
  const r = await db.query('DELETE FROM app_leads WHERE id = ANY($1::uuid[]);', [ids]);
  return sendJson(res, 200, { ok: true, deleted: r.rowCount || 0 });
}

async function bulkDeleteMessages(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const ids = coerceUuidList(payload?.ids, { max: 2000 });
  if (ids.length === 0) return sendJson(res, 400, { error: 'No valid ids' });
  const r = await db.query('DELETE FROM app_messages WHERE id = ANY($1::uuid[]);', [ids]);
  return sendJson(res, 200, { ok: true, deleted: r.rowCount || 0 });
}

async function bulkDeleteGuests(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const ids = coerceUuidList(payload?.ids, { max: 2000 });
  if (ids.length === 0) return sendJson(res, 400, { error: 'No valid ids' });

  await db.query('DELETE FROM app_events WHERE guest_id = ANY($1::uuid[]);', [ids]);
  await db.query('DELETE FROM app_leads WHERE guest_id = ANY($1::uuid[]);', [ids]);
  await db.query('DELETE FROM app_messages WHERE guest_id = ANY($1::uuid[]);', [ids]);
  const r = await db.query('DELETE FROM app_guests WHERE id = ANY($1::uuid[]);', [ids]);
  return sendJson(res, 200, { ok: true, deleted: r.rowCount || 0 });
}

module.exports = async function adminRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/admin/')) return false;

  await maybeCleanup();

  if (url.pathname === '/api/admin/ready' && req.method === 'GET') {
    const missing = [];
    if (!db.isConfigured()) missing.push('DATABASE_URL');
    if (!process.env.ADMIN_USERNAME) missing.push('ADMIN_USERNAME');
    if (!process.env.ADMIN_PASSCODE) missing.push('ADMIN_PASSCODE');
    return sendJson(res, 200, { ok: missing.length === 0, missing });
  }

  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });

  try {
    await ensureSchema();
  } catch (err) {
    console.error('[admin-schema]', err?.message || err);
    return sendJson(res, 500, { error: 'Admin unavailable' });
  }

  if (url.pathname === '/api/admin/login' && req.method === 'POST') {
    await handleAdminLogin(req, res);
    return true;
  }

  if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
    await deleteAdminSession(req);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookieHeader(req) });
  }

  if (url.pathname === '/api/admin/me' && req.method === 'GET') {
    const ok = await getAdminSession(req);
    return sendJson(res, 200, { ok });
  }

  if (!(await requireAdmin(req, res))) return true;

  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    await listUsers(res);
    return true;
  }

  if (url.pathname === '/api/admin/users/bulk-delete' && req.method === 'POST') {
    await bulkDeleteUsers(req, res);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/users/') && req.method === 'GET') {
    const userId = url.pathname.split('/').pop();
    await getUserDetail(res, userId);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/users/') && url.pathname.endsWith('/notes') && req.method === 'POST') {
    const parts = url.pathname.split('/');
    const userId = parts[parts.length - 2];
    await updateUserNotes(req, res, userId);
    return true;
  }

  if (url.pathname === '/api/admin/leads' && req.method === 'GET') {
    await listLeads(res);
    return true;
  }

  if (url.pathname === '/api/admin/analytics' && req.method === 'GET') {
    await getAnalytics(res);
    return true;
  }

  if (url.pathname === '/api/admin/orders' && req.method === 'GET') {
    await listOrders(res);
    return true;
  }

  if (url.pathname === '/api/admin/messages' && req.method === 'GET') {
    await listMessages(res);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/orders/') && req.method === 'GET') {
    const orderId = url.pathname.split('/')[4] || '';
    await getOrderDetail(res, orderId);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/messages/') && req.method === 'GET') {
    const messageId = url.pathname.split('/')[4] || '';
    await getMessageDetail(res, messageId);
    return true;
  }

  if (url.pathname === '/api/admin/leads/bulk-delete' && req.method === 'POST') {
    await bulkDeleteLeads(req, res);
    return true;
  }

  if (url.pathname === '/api/admin/messages/bulk-delete' && req.method === 'POST') {
    await bulkDeleteMessages(req, res);
    return true;
  }

  if (url.pathname === '/api/admin/guests' && req.method === 'GET') {
    await listGuests(res);
    return true;
  }

  if (url.pathname === '/api/admin/guests/bulk-delete' && req.method === 'POST') {
    await bulkDeleteGuests(req, res);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/guests/') && req.method === 'GET') {
    const guestId = url.pathname.split('/').pop();
    await getGuestDetail(res, guestId);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/leads/') && req.method === 'GET') {
    const leadId = url.pathname.split('/').pop();
    await getLeadDetail(res, leadId);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/leads/') && url.pathname.endsWith('/delete') && req.method === 'POST') {
    const parts = url.pathname.split('/');
    const leadId = parts[parts.length - 2];
    await deleteLead(res, leadId);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/guests/') && url.pathname.endsWith('/delete') && req.method === 'POST') {
    const parts = url.pathname.split('/');
    const guestId = parts[parts.length - 2];
    await deleteGuest(res, guestId);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/users/') && url.pathname.endsWith('/delete') && req.method === 'POST') {
    const parts = url.pathname.split('/');
    const userId = parts[parts.length - 2];
    await deleteUser(res, userId);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/messages/') && url.pathname.endsWith('/delete') && req.method === 'POST') {
    const parts = url.pathname.split('/');
    const messageId = parts[parts.length - 2];
    await deleteMessage(res, messageId);
    return true;
  }

  if (url.pathname.startsWith('/api/admin/leads/') && url.pathname.endsWith('/update') && req.method === 'POST') {
    const parts = url.pathname.split('/');
    const leadId = parts[parts.length - 2];
    await updateLead(req, res, leadId);
    return true;
  }

  sendJson(res, 404, { error: 'Not found' });
  return true;
};
