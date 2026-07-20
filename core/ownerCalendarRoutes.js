/* ====================================================================
   OWNER CALENDAR — standalone owner planning calendar (no external
   calendar integrations). Events persist in app_owner_calendar_events.
   Owner-only: same owner definition as every other owner endpoint
   (authRoutes.isOwnerUser via core/roleGuard's session resolution).

   Routes:
     GET    /api/owner/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
     POST   /api/owner/calendar            { title, date, time?, type, note? }
     PATCH  /api/owner/calendar/:id        any of the above fields
     DELETE /api/owner/calendar/:id
   ==================================================================== */
const db = require('./db');
const { resolveSessionRoleFlags } = require('./roleGuard');

const EVENT_TYPES = new Set(['call', 'content', 'outreach', 'follow-up']);
const ID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_owner_calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id uuid NOT NULL,
      title text NOT NULL,
      event_date date NOT NULL,
      event_time text NOT NULL DEFAULT '',
      event_type text NOT NULL DEFAULT 'call',
      note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_app_owner_calendar_events_date ON app_owner_calendar_events(owner_user_id, event_date);');
  schemaReady = true;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJsonBody(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function cleanText(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    date: typeof row.event_date === 'string' ? row.event_date.slice(0, 10) : new Date(row.event_date).toISOString().slice(0, 10),
    time: row.event_time || '',
    type: row.event_type || 'call',
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ownerCalendarRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/owner/calendar')) return false;
  try {
    const flags = await resolveSessionRoleFlags(req);
    if (!flags?.userId) return sendJson(res, 401, { ok: false, error: 'Not signed in' }), true;
    if (!flags.owner) return sendJson(res, 403, { ok: false, error: 'Owner only' }), true;
    await ensureSchema();

    const idMatch = url.pathname.match(/^\/api\/owner\/calendar\/([0-9a-f-]{36})$/i);

    if (url.pathname === '/api/owner/calendar' && req.method === 'GET') {
      const from = String(url.searchParams.get('from') || '').trim();
      const to = String(url.searchParams.get('to') || '').trim();
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) return sendJson(res, 400, { ok: false, error: 'from/to required (YYYY-MM-DD)' }), true;
      const result = await db.query(
        `SELECT * FROM app_owner_calendar_events
         WHERE owner_user_id = $1 AND event_date BETWEEN $2 AND $3
         ORDER BY event_date, event_time, created_at;`,
        [flags.userId, from, to]
      );
      return sendJson(res, 200, { ok: true, events: (result.rows || []).map(mapRow) }), true;
    }

    if (url.pathname === '/api/owner/calendar' && req.method === 'POST') {
      let payload;
      try { payload = await readJsonBody(req); } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }), true; }
      const title = cleanText(payload.title, 160);
      const date = cleanText(payload.date, 10);
      const time = cleanText(payload.time, 20);
      const type = EVENT_TYPES.has(String(payload.type)) ? String(payload.type) : 'call';
      const note = cleanText(payload.note, 2000);
      if (!title) return sendJson(res, 400, { ok: false, error: 'Title required' }), true;
      if (!DATE_RE.test(date)) return sendJson(res, 400, { ok: false, error: 'Valid date required (YYYY-MM-DD)' }), true;
      const result = await db.query(
        `INSERT INTO app_owner_calendar_events (owner_user_id, title, event_date, event_time, event_type, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`,
        [flags.userId, title, date, time, type, note]
      );
      return sendJson(res, 200, { ok: true, event: mapRow(result.rows[0]) }), true;
    }

    if (idMatch && req.method === 'PATCH') {
      let payload;
      try { payload = await readJsonBody(req); } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }), true; }
      const sets = [];
      const values = [flags.userId, idMatch[1]];
      const push = (sqlCol, val) => { values.push(val); sets.push(`${sqlCol} = $${values.length}`); };
      if (payload.title != null) {
        const title = cleanText(payload.title, 160);
        if (!title) return sendJson(res, 400, { ok: false, error: 'Title cannot be empty' }), true;
        push('title', title);
      }
      if (payload.date != null) {
        const date = cleanText(payload.date, 10);
        if (!DATE_RE.test(date)) return sendJson(res, 400, { ok: false, error: 'Valid date required' }), true;
        push('event_date', date);
      }
      if (payload.time != null) push('event_time', cleanText(payload.time, 20));
      if (payload.type != null) push('event_type', EVENT_TYPES.has(String(payload.type)) ? String(payload.type) : 'call');
      if (payload.note != null) push('note', cleanText(payload.note, 2000));
      if (!sets.length) return sendJson(res, 400, { ok: false, error: 'Nothing to update' }), true;
      const result = await db.query(
        `UPDATE app_owner_calendar_events SET ${sets.join(', ')}, updated_at = now()
         WHERE owner_user_id = $1 AND id = $2 RETURNING *;`,
        values
      );
      if (!result.rows?.length) return sendJson(res, 404, { ok: false, error: 'Event not found' }), true;
      return sendJson(res, 200, { ok: true, event: mapRow(result.rows[0]) }), true;
    }

    if (idMatch && req.method === 'DELETE') {
      const result = await db.query(
        'DELETE FROM app_owner_calendar_events WHERE owner_user_id = $1 AND id = $2 RETURNING id;',
        [flags.userId, idMatch[1]]
      );
      if (!result.rows?.length) return sendJson(res, 404, { ok: false, error: 'Event not found' }), true;
      return sendJson(res, 200, { ok: true }), true;
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' }), true;
  } catch (err) {
    console.error('[owner-calendar]', err?.message || err);
    return sendJson(res, 500, { ok: false, error: 'Owner calendar error' }), true;
  }
}

module.exports = ownerCalendarRoutes;
module.exports.ensureSchemaForTests = ensureSchema;
