/* ====================================================================
   ROLE GUARD — server-side access floor for client-only APIs.
   Hiding UI isn't access control: a trainer-only session must be
   rejected by the endpoints behind client features, not just lose the
   nav item. Roles come from app_users.admin_notes flags, mirroring
   core/authRoutes.js (buildSessionUserPayload):
     - trainer/manager: explicit flags
     - client: explicit flag OR the default state (no trainer/manager)
     - owner: floor, not filter — passes everything.
   Fail-open on DB trouble: these guards protect surface area, they
   must never take the app down.
   ==================================================================== */
const crypto = require('crypto');
const db = require('./db');
// Same owner definition as the session payload (username/email/notes based —
// there is no is_owner column).
const { isOwnerUser } = require('./authRoutes');

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

function notesHasFlag(adminNotesRaw, flag) {
  const target = String(flag || '').trim().toLowerCase();
  if (!target) return false;
  return String(adminNotesRaw || '')
    .split(/\s+/)
    .some((part) => String(part || '').trim().toLowerCase() === target);
}

/**
 * Resolve the requesting session's role flags. Returns null when there is
 * no valid session (caller decides whether that matters — most guarded
 * endpoints already 401 on their own).
 */
async function resolveSessionRoleFlags(req) {
  if (!db.isConfigured()) return null;
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  try {
    const result = await db.query(
      `
        SELECT u.id, u.username, u.email, u.display_name, COALESCE(u.admin_notes, '') AS admin_notes
        FROM app_sessions s
        JOIN app_users u ON u.id = s.user_id
        WHERE s.session_token_hash = $1
          AND s.expires_at > now()
        LIMIT 1;
      `,
      [sha256Hex(token)]
    );
    const row = result.rows?.[0];
    if (!row) return null;
    const owner = isOwnerUser(row);
    const trainer = notesHasFlag(row.admin_notes, 'trainer') || owner;
    const manager = notesHasFlag(row.admin_notes, 'manager') || owner;
    const explicitClient = notesHasFlag(row.admin_notes, 'client') || owner;
    return {
      userId: row.id,
      owner,
      trainer,
      manager,
      explicitClient,
      clientAccess: owner || explicitClient || (!trainer && !manager),
      trainerOnly: trainer && !explicitClient && !owner
    };
  } catch {
    return null; // fail open — the endpoint's own auth still applies
  }
}

/**
 * True when this request must be rejected because the session belongs to a
 * trainer/manager-only account hitting a client-only API. Owner always
 * passes; unauthenticated passes (endpoint 401s on its own).
 */
async function rejectsClientOnlyApi(req) {
  const flags = await resolveSessionRoleFlags(req);
  if (!flags) return false;
  return !flags.clientAccess;
}

module.exports = {
  resolveSessionRoleFlags,
  rejectsClientOnlyApi
};
