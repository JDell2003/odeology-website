/* ====================================================================
   OWNER FORM HITS — the owner-side mirror of the trainer's Consult Form
   Hits: everyone who landed on a RiseForIt-owned landing page and everyone
   who filled its form, in one triage list.

   "Hit" and "fill" are two different tables:
     - fills  = app_leads rows whose source is one of LANDING_SOURCES
     - hits   = app_events rows named partner_page_view
   A fill is matched back to its hit by guest_id, so a visitor who looked
   twice and then filled shows as one person, not three rows.

   Owner-only: same session/role resolution as every other owner endpoint.

   Routes:
     GET   /api/owner/form-hits?q=&status=&days=
     PATCH /api/owner/form-hits/:id     { status?, notes? }
   ==================================================================== */
const db = require('./db');
const { resolveSessionRoleFlags } = require('./roleGuard');

// Sources that belong to the owner's own landing pages. Trainer coach-page
// leads are deliberately NOT here — those belong to the trainer.
const LANDING_SOURCES = ['trainer_gate'];
const VIEW_EVENTS = ['partner_page_view'];
const STATUSES = new Set(['new', 'contacted', 'booked', 'client', 'dead']);
const ID_RE = /^[0-9a-f-]{36}$/i;
const MAX_DAYS = 365;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJsonBody(req, maxBytes = 60_000) {
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

function mapLead(row) {
  const snapshot = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {};
  const first = String(row.first_name || '').trim();
  const last = String(row.last_name || '').trim();
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source || '',
    firstName: first,
    lastName: last,
    fullName: [first, last].filter(Boolean).join(' ').trim(),
    email: String(row.email || '').trim(),
    phone: String(row.phone || '').trim(),
    wants: Array.isArray(row.wants) ? row.wants : [],
    status: row.status || 'new',
    notes: row.notes || '',
    emailOptIn: row.email_optin !== false,
    referrer: String(snapshot.ref || '').trim(),
    page: String(snapshot.page || '').trim(),
    linkedUserId: row.user_id || null,
    // how many times this person loaded the page before filling it in
    views: Number(row.view_count || 0)
  };
}

async function ownerFormHitsRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/owner/form-hits')) return false;
  try {
    const flags = await resolveSessionRoleFlags(req);
    if (!flags?.userId) return sendJson(res, 401, { ok: false, error: 'Not signed in' }), true;
    if (!flags.owner) return sendJson(res, 403, { ok: false, error: 'Owner only' }), true;

    const idMatch = url.pathname.match(/^\/api\/owner\/form-hits\/([0-9a-f-]{36})$/i);

    if (url.pathname === '/api/owner/form-hits' && req.method === 'GET') {
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 120);
      const status = String(url.searchParams.get('status') || '').trim().toLowerCase();
      let days = parseInt(url.searchParams.get('days') || '90', 10);
      if (!Number.isFinite(days) || days <= 0) days = 90;
      if (days > MAX_DAYS) days = MAX_DAYS;

      const values = [LANDING_SOURCES, days];
      const where = ["l.source = ANY($1)", "l.created_at > now() - ($2 || ' days')::interval"];
      if (q) {
        values.push(`%${q.toLowerCase()}%`);
        where.push(`(
          lower(coalesce(l.first_name,'')) LIKE $${values.length}
          OR lower(coalesce(l.last_name,'')) LIKE $${values.length}
          OR lower(coalesce(l.email,'')) LIKE $${values.length}
          OR coalesce(l.phone,'') LIKE $${values.length}
        )`);
      }
      if (STATUSES.has(status)) {
        values.push(status);
        where.push(`l.status = $${values.length}`);
      }

      const leads = await db.query(
        `
          SELECT l.*,
                 (SELECT count(*) FROM app_events e
                   WHERE e.event_name = ANY($${values.length + 1})
                     AND l.guest_id IS NOT NULL
                     AND e.guest_id = l.guest_id) AS view_count
          FROM app_leads l
          WHERE ${where.join(' AND ')}
          ORDER BY l.created_at DESC
          LIMIT 500;
        `,
        [...values, VIEW_EVENTS]
      );

      // Page hits over the same window, and how many of them converted.
      const totals = await db.query(
        `
          SELECT
            (SELECT count(*) FROM app_events
              WHERE event_name = ANY($1) AND created_at > now() - ($2 || ' days')::interval) AS hits,
            (SELECT count(DISTINCT coalesce(guest_id::text, id::text)) FROM app_events
              WHERE event_name = ANY($1) AND created_at > now() - ($2 || ' days')::interval) AS visitors,
            (SELECT count(*) FROM app_leads
              WHERE source = ANY($3) AND created_at > now() - ($2 || ' days')::interval) AS fills;
        `,
        [VIEW_EVENTS, days, LANDING_SOURCES]
      );
      const t = totals.rows?.[0] || {};

      return sendJson(res, 200, {
        ok: true,
        days,
        totals: {
          hits: Number(t.hits || 0),
          visitors: Number(t.visitors || 0),
          fills: Number(t.fills || 0)
        },
        hits: (leads.rows || []).map(mapLead)
      }), true;
    }

    if (idMatch && req.method === 'PATCH') {
      let payload;
      try { payload = await readJsonBody(req); } catch (err) { return sendJson(res, 400, { ok: false, error: err.message }), true; }
      const sets = [];
      const values = [idMatch[1], LANDING_SOURCES];
      if (payload.status != null) {
        const next = String(payload.status).trim().toLowerCase();
        if (!STATUSES.has(next)) return sendJson(res, 400, { ok: false, error: 'Unknown status' }), true;
        values.push(next);
        sets.push(`status = $${values.length}`);
      }
      if (payload.notes != null) {
        values.push(String(payload.notes).slice(0, 4000));
        sets.push(`notes = $${values.length}`);
      }
      if (!sets.length) return sendJson(res, 400, { ok: false, error: 'Nothing to update' }), true;

      const result = await db.query(
        `UPDATE app_leads SET ${sets.join(', ')}
         WHERE id = $1 AND source = ANY($2) RETURNING *;`,
        values
      );
      if (!result.rows?.length) return sendJson(res, 404, { ok: false, error: 'Form hit not found' }), true;
      return sendJson(res, 200, { ok: true, hit: mapLead(result.rows[0]) }), true;
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' }), true;
  } catch (err) {
    console.error('[owner-form-hits]', err?.message || err);
    return sendJson(res, 500, { ok: false, error: 'Owner form hits error' }), true;
  }
}

module.exports = ownerFormHitsRoutes;
module.exports._private = { LANDING_SOURCES, VIEW_EVENTS, STATUSES, mapLead };
