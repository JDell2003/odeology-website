const crypto = require('crypto');
const db = require('./db');

const GUEST_COOKIE_NAME = process.env.GUEST_COOKIE_NAME || 'gid';
const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.TRACK_MAX_BODY_BYTES || 400_000));

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

function isSecureRequest(req) {
  if (String(process.env.COOKIE_SECURE || '') === '1') return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (proto === 'https') return true;
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function setCookieHeader(name, value, req, { maxAgeSeconds } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax'
  ];
  if (Number.isFinite(maxAgeSeconds)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
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

function normalizeLeadSource(raw) {
  const src = String(raw || '').trim().toLowerCase();
  if (!src) return null;
  // Keep it simple and index-friendly.
  if (!/^[a-z0-9_]{1,32}$/.test(src)) return null;
  return src;
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
      // CREATE ... IF NOT EXISTS is not race-proof; ignore duplicates under concurrency.
      if (code === '23505' || code === '42P07') return;
      throw err;
    }
  };

  schemaEnsurePromise = (async () => {
    await safeQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

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

async function resolveUserIdFromSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  const tokenHash = sha256Hex(token);
  const result = await db.query(
    `
      SELECT user_id
      FROM app_sessions
      WHERE session_token_hash = $1
        AND expires_at > now()
      LIMIT 1;
    `,
    [tokenHash]
  );
  return result.rows?.[0]?.user_id || null;
}

function getIpHash(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || '';
  if (!ip) return null;
  return sha256Hex(ip);
}

async function ensureGuest(req, res) {
  if (!db.isConfigured()) return { guestId: null, setCookie: null };
  await ensureSchema();

  const cookies = parseCookies(req.headers.cookie);
  let guestId = cookies[GUEST_COOKIE_NAME] || null;
  let setCookie = null;

  if (!guestId) {
    guestId = crypto.randomUUID();
    setCookie = setCookieHeader(GUEST_COOKIE_NAME, guestId, req, { maxAgeSeconds: 365 * 24 * 60 * 60 });
  }

  const ua = String(req.headers['user-agent'] || '').slice(0, 600);
  const ipHash = getIpHash(req);

  await db.query(
    `
      INSERT INTO app_guests (id, last_seen, user_agent, ip_hash)
      VALUES ($1, now(), $2, $3)
      ON CONFLICT (id) DO UPDATE
      SET last_seen = now(),
          user_agent = COALESCE(NULLIF($2, ''), app_guests.user_agent),
          ip_hash = COALESCE(app_guests.ip_hash, $3);
    `,
    [guestId, ua, ipHash]
  );

  return { guestId, setCookie };
}

async function insertEvent({ eventName, path, userId, guestId, props }) {
  const safeName = String(eventName || '').trim().slice(0, 80);
  if (!safeName) throw new Error('Missing event name');
  const safePath = String(path || '').slice(0, 500);
  const safeProps = props && typeof props === 'object' ? props : {};
  await db.query(
    `
      INSERT INTO app_events (event_name, path, user_id, guest_id, props)
      VALUES ($1, $2, $3, $4, $5::jsonb);
    `,
    [safeName, safePath, userId, guestId, JSON.stringify(safeProps)]
  );

  // Cap event history to keep storage + admin review lightweight.
  // Keep the 50 most recent events per guest (or per user when guest is missing).
  try {
    if (guestId) {
      const del = await db.query(
        `
          WITH doomed AS (
            SELECT id
            FROM app_events
            WHERE guest_id = $1
            ORDER BY created_at DESC
            OFFSET 50
          )
          DELETE FROM app_events
          WHERE id IN (SELECT id FROM doomed)
          RETURNING id;
        `,
        [guestId]
      );
      const pruned = Number(del?.rowCount || 0);
      if (pruned > 0) {
        await db.query(
          `
            UPDATE app_guests
            SET events_pruned = COALESCE(events_pruned, 0) + $2
            WHERE id = $1;
          `,
          [guestId, pruned]
        );
      }
      return;
    }

    if (userId) {
      await db.query(
        `
          WITH doomed AS (
            SELECT id
            FROM app_events
            WHERE user_id = $1 AND guest_id IS NULL
            ORDER BY created_at DESC
            OFFSET 50
          )
          DELETE FROM app_events
          WHERE id IN (SELECT id FROM doomed);
        `,
        [userId]
      );
    }
  } catch {
    // ignore
  }
}

async function updateGuestIdentifiers({ guestId, email, phone }) {
  if (!guestId) return;
  const safeEmail = normalizeEmail(email);
  const safePhone = normalizePhone(phone);
  if (!safeEmail && !safePhone) return;
  await db.query(
    `
      UPDATE app_guests
      SET email = COALESCE(NULLIF($2, ''), app_guests.email),
          phone = COALESCE(NULLIF($3, ''), app_guests.phone)
      WHERE id = $1;
    `,
    [guestId, safeEmail || '', safePhone || '']
  );
}

async function createOrUpdateLead({ lead, userId, guestId }) {
  const source = normalizeLeadSource(lead?.source) || 'intake';
  const firstName = lead?.firstName ? String(lead.firstName).trim().slice(0, 120) : null;
  const lastName = lead?.lastName ? String(lead.lastName).trim().slice(0, 120) : null;
  const emailOptIn = lead?.emailOptIn === false ? false : true;
  let email = normalizeEmail(lead?.email);
  let phone = normalizePhone(lead?.phone);
  const wants = Array.isArray(lead?.wants) ? lead.wants.slice(0, 60) : [];
  const snapshot = lead?.snapshot && typeof lead.snapshot === 'object' ? lead.snapshot : {};

  let inferredUserId = userId;
  if (!inferredUserId && (email || phone)) {
    const r = await db.query(
      `
        SELECT id
        FROM app_users
        WHERE ($1 IS NOT NULL AND email = $1)
           OR ($2 IS NOT NULL AND phone = $2)
        LIMIT 1;
      `,
      [email, phone]
    );
    inferredUserId = r.rows?.[0]?.id || null;
  }

  // Only create leads if we have a way to contact them. If the client didn't send
  // contact info but the visitor is signed in, pull contact info from the account.
  if (!email && !phone && inferredUserId) {
    const r = await db.query(
      `
        SELECT email, phone
        FROM app_users
        WHERE id = $1
        LIMIT 1;
      `,
      [inferredUserId]
    );
    email = normalizeEmail(r.rows?.[0]?.email);
    phone = normalizePhone(r.rows?.[0]?.phone);
  }

  if (!email && !phone) return;

  if (guestId && inferredUserId) {
    await db.query('UPDATE app_guests SET inferred_user_id = $2 WHERE id = $1;', [guestId, inferredUserId]);
  }

  // Persist identifiers directly on the guest profile for quick admin visibility.
  await updateGuestIdentifiers({ guestId, email, phone });

  // De-dupe: don’t create infinite leads if the same guest repeats the same identifier.
  // (We still update app_guests above so admin can see the latest identifier.)
  if (guestId && (email || phone)) {
    const dup = await db.query(
      `
        SELECT 1
        FROM app_leads
        WHERE guest_id = $1
          AND created_at > (now() - interval '7 days')
          AND (
            ($2 IS NOT NULL AND email = $2)
            OR ($3 IS NOT NULL AND phone = $3)
          )
        LIMIT 1;
      `,
      [guestId, email, phone]
    );
    if (dup.rows?.[0]) return;
  }

  await db.query(
    `
      INSERT INTO app_leads (source, first_name, last_name, email, phone, wants, snapshot, user_id, guest_id, email_optin)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10);
    `,
    [source, firstName, lastName, email, phone, JSON.stringify(wants), JSON.stringify(snapshot), inferredUserId, guestId, emailOptIn]
  );
}

module.exports = async function trackRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/track')) return false;

  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  try {
    await ensureSchema();
  } catch (err) {
    console.error('[track-schema]', err?.message || err);
    return sendJson(res, 500, { error: 'Tracking unavailable' });
  }

  const { guestId, setCookie } = await ensureGuest(req, res);
  const userId = await resolveUserIdFromSession(req);

  if (url.pathname === '/api/track/message' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const name = body?.name ? String(body.name).trim().slice(0, 160) : null;
      const email = normalizeEmail(body?.email);
      const subject = body?.subject ? String(body.subject).trim().slice(0, 200) : null;
      const message = body?.message ? String(body.message).trim().slice(0, 4000) : null;
      const path = body?.path ? String(body.path).trim().slice(0, 240) : null;

      if (!message || (!email && !name)) {
        return sendJson(res, 400, { error: 'Missing required fields' }, setCookie ? { 'Set-Cookie': setCookie } : {});
      }

      await updateGuestIdentifiers({ guestId, email });

      await db.query(
        `
          INSERT INTO app_messages (name, email, subject, message, path, user_id, guest_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `,
        [name, email, subject, message, path, userId, guestId]
      );

      await db.query(
        `
          INSERT INTO app_events (event_name, path, user_id, guest_id, props)
          VALUES ($1, $2, $3, $4, $5::jsonb);
        `,
        ['contact_message', path, userId, guestId, JSON.stringify({ name, email, subject })]
      );

      return sendJson(res, 200, { ok: true }, setCookie ? { 'Set-Cookie': setCookie } : {});
    } catch (err) {
      return sendJson(res, 500, { error: err?.message || 'Failed to save message' }, setCookie ? { 'Set-Cookie': setCookie } : {});
    }
  }

  if (url.pathname === '/api/track/ping' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, guestIdPresent: Boolean(guestId), userIdPresent: Boolean(userId) }, setCookie ? { 'Set-Cookie': setCookie } : {});
  }

  if (url.pathname === '/api/track/event' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message }, setCookie ? { 'Set-Cookie': setCookie } : {});
    }

    try {
      // If the client sends identifiers as part of any event, store them on the guest profile.
      await updateGuestIdentifiers({
        guestId,
        email: payload?.props?.email || payload?.email,
        phone: payload?.props?.phone || payload?.phone
      });
      await insertEvent({
        eventName: payload?.event,
        path: payload?.path || url.pathname,
        userId,
        guestId,
        props: payload?.props
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message }, setCookie ? { 'Set-Cookie': setCookie } : {});
    }

    return sendJson(res, 200, { ok: true }, setCookie ? { 'Set-Cookie': setCookie } : {});
  }

  if (url.pathname === '/api/track/lead' && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message }, setCookie ? { 'Set-Cookie': setCookie } : {});
    }

    try {
      await createOrUpdateLead({ lead: payload, userId, guestId });
      await insertEvent({ eventName: 'lead_submitted', path: payload?.path || url.pathname, userId, guestId, props: { wants: payload?.wants || [] } });
    } catch (err) {
      return sendJson(res, 500, { error: 'Failed to save lead' }, setCookie ? { 'Set-Cookie': setCookie } : {});
    }

    return sendJson(res, 200, { ok: true }, setCookie ? { 'Set-Cookie': setCookie } : {});
  }

  sendJson(res, 404, { error: 'Not found' }, setCookie ? { 'Set-Cookie': setCookie } : {});
  return true;
};
