'use strict';
/**
 * Recording: a trainer films against a script, the file lands in their account.
 *
 * WHY CHUNKS AND NOT ONE UPLOAD
 * Two hours at 1080p30 is roughly four to seven gigabytes. A browser holding
 * that in memory until the take ends does not survive - the tab dies and so
 * does the recording, which is the worst possible moment to lose it. So
 * MediaRecorder is given a five second timeslice and every piece leaves as soon
 * as it exists. Nothing large is ever held anywhere.
 *
 * WHY RAW BYTES AND NOT MULTIPART
 * This server has no multipart parser and adding one to receive a single
 * unnamed blob would be a lot of surface for no benefit. The metadata rides in
 * the query string and the body is the bytes.
 *
 * WHERE IT GOES, AND THE HONEST PROBLEM WITH THAT
 * Railway's filesystem does not survive a redeploy. Writing multi-gigabyte
 * recordings there means they are gone the next time the app ships, which is
 * not a place to keep somebody's only copy of a two hour take. RECORDING_DIR
 * points this somewhere durable - a mounted volume, or a machine that keeps
 * its disk. Until that is set the app still works and still says, out loud,
 * that the storage is temporary. Silently losing a trainer's footage is the one
 * outcome worth writing code to prevent.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.RECORDING_DIR
  || path.join(__dirname, '..', 'data', 'recordings');

// A piece bigger than this is not a five second chunk of video, it is either a
// mistake or somebody poking at the endpoint.
const MAX_CHUNK = 64 * 1024 * 1024;
const MAX_TOTAL = 12 * 1024 * 1024 * 1024;   // 12GB, well past a 2h take

const sessions = new Map();

function ok(res, body, code = 200) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

function safeId(s) {
    return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function durable() {
    // Stated rather than assumed. If nobody has pointed this at a real volume,
    // the recordings live somewhere a redeploy will erase.
    return Boolean(process.env.RECORDING_DIR);
}

function sessionDir(id) {
    return path.join(ROOT, safeId(id));
}

async function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const parts = [];
        let size = 0;
        req.on('data', (c) => {
            size += c.length;
            if (size > limit) {
                reject(new Error('chunk too large'));
                req.destroy();
                return;
            }
            parts.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(parts)));
        req.on('error', reject);
    });
}

/**
 * Every route here needs to know WHOSE recording this is, so a signed-out
 * request cannot open a session and a trainer cannot write into someone
 * else's folder.
 */
async function whoIs(req) {
    try {
        const authRoutes = require('./authRoutes');
        const get = authRoutes && authRoutes._private
            && authRoutes._private.getUserFromRequest;
        if (typeof get !== 'function') return null;
        return await get(req);
    } catch (err) {
        return null;
    }
}

async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/recording/')) return false;

    // ---------------------------------------------------- the Content Machine
    //
    // These two are called by a program, not a person. They carry a shared key
    // instead of a session cookie, so they are answered before the sign-in gate
    // below - putting them behind it would mean they could never work.
    if (url.pathname.startsWith('/api/recording/pull/')) {
        const want = String(process.env.RISEFORIT_PULL_KEY || '');
        const got = String(req.headers['x-cm-key'] || '');
        // Length-safe compare so a wrong key cannot be discovered by timing.
        const okKey = want && got && want.length === got.length
            && require('crypto').timingSafeEqual(Buffer.from(want), Buffer.from(got));
        if (!okKey) { ok(res, { ok: false, reason: 'bad key' }, 403); return true; }

        const drive = require('./gdrive');
        const db = require('./db');

        if (url.pathname === '/api/recording/pull/list' && req.method === 'GET') {
            try {
                await drive.ensureSchema();
                const q = await db.query(
                    `SELECT d.user_id, COALESCE(u.display_name, u.username, '') AS who
                       FROM app_drive_accounts d
                       JOIN app_users u ON u.id = d.user_id`);
                const out = [];
                for (const row of (q.rows || [])) {
                    let files = [];
                    // One trainer's expired token must not hide every other
                    // trainer's footage, so each is tried on its own.
                    try { files = await drive.list(row.user_id); }
                    catch (err) { continue; }
                    for (const f of files) {
                        out.push({ id: f.id, name: f.name, size: f.size,
                                   created: f.createdTime, mime: f.mimeType,
                                   user_id: row.user_id, trainer: row.who });
                    }
                }
                ok(res, { ok: true, files: out, trainers: (q.rows || []).length });
            } catch (err) {
                ok(res, { ok: false, reason: err.message }, 500);
            }
            return true;
        }

        if (url.pathname === '/api/recording/pull/file' && req.method === 'GET') {
            const id = String(url.searchParams.get('id') || '');
            const uid = String(url.searchParams.get('user') || '');
            if (!id || !uid) { ok(res, { ok: false, reason: 'need id and user' }, 400); return true; }
            try {
                const upstream = await drive.download(uid, id);
                const head = { 'Content-Type': upstream.headers.get('content-type') || 'video/webm' };
                const len = upstream.headers.get('content-length');
                if (len) head['Content-Length'] = len;
                res.writeHead(200, head);
                // Piped, never buffered - a two hour file must not sit in this
                // process's memory on its way past.
                const reader = upstream.body.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (!res.write(Buffer.from(value))) {
                        await new Promise((r) => res.once('drain', r));
                    }
                }
                res.end();
            } catch (err) {
                ok(res, { ok: false, reason: err.message }, 400);
            }
            return true;
        }
        ok(res, { ok: false, reason: 'unknown pull route' }, 404);
        return true;
    }

    const user = await whoIs(req);
    if (!user || !user.id) {
        ok(res, { ok: false, reason: 'sign in first' }, 401);
        return true;
    }
    const owner = String(user.id);

    // ------------------------------------------------------------- start
    if (url.pathname === '/api/recording/start' && req.method === 'POST') {
        let body = {};
        try { body = JSON.parse((await readBody(req, 64 * 1024)).toString() || '{}'); }
        catch (err) { body = {}; }
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const dir = sessionDir(id);
        try { fs.mkdirSync(dir, { recursive: true }); }
        catch (err) {
            ok(res, { ok: false, reason: `cannot write recordings: ${err.message}` }, 500);
            return true;
        }
        sessions.set(id, {
            id, owner, dir, bytes: 0, parts: 0,
            mime: String(body.mime || 'video/webm'),
            started: Date.now(),
        });
        fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
            id, owner, mime: body.mime || 'video/webm',
            started: new Date().toISOString(),
            display_name: user.display_name || user.username || '',
        }, null, 1));
        ok(res, {
            ok: true, id,
            durable: durable(),
            warning: durable() ? '' :
                'RECORDING_DIR is not set, so these files live on a disk that a '
                + 'redeploy erases. Fine for a test, not for a real take.',
        });
        return true;
    }

    // ------------------------------------------------------------- chunk
    if (url.pathname === '/api/recording/chunk' && req.method === 'POST') {
        const id = safeId(url.searchParams.get('id'));
        const n = parseInt(url.searchParams.get('n') || '-1', 10);
        const s = sessions.get(id);
        if (!s) { ok(res, { ok: false, reason: 'unknown recording' }, 404); return true; }
        if (s.owner !== owner) { ok(res, { ok: false, reason: 'not yours' }, 403); return true; }
        if (!(n >= 0)) { ok(res, { ok: false, reason: 'bad part number' }, 400); return true; }
        if (s.bytes > MAX_TOTAL) {
            ok(res, { ok: false, reason: 'recording is too large' }, 413);
            return true;
        }
        let buf;
        try { buf = await readBody(req, MAX_CHUNK); }
        catch (err) { ok(res, { ok: false, reason: err.message }, 413); return true; }

        // Numbered and zero padded so the order is unambiguous when they are
        // joined - part 10 must never sort between 1 and 2.
        const name = `part-${String(n).padStart(5, '0')}`;
        try { fs.writeFileSync(path.join(s.dir, name), buf); }
        catch (err) { ok(res, { ok: false, reason: err.message }, 500); return true; }
        s.bytes += buf.length;
        s.parts = Math.max(s.parts, n + 1);
        ok(res, { ok: true, n, bytes: s.bytes });
        return true;
    }

    // ------------------------------------------------------------ finish
    if (url.pathname === '/api/recording/finish' && req.method === 'POST') {
        let body = {};
        try { body = JSON.parse((await readBody(req, 64 * 1024)).toString() || '{}'); }
        catch (err) { body = {}; }
        const id = safeId(body.id);
        const s = sessions.get(id);
        if (!s) { ok(res, { ok: false, reason: 'unknown recording' }, 404); return true; }
        if (s.owner !== owner) { ok(res, { ok: false, reason: 'not yours' }, 403); return true; }

        const files = fs.readdirSync(s.dir)
            .filter((f) => f.startsWith('part-')).sort();
        const expected = Number(body.parts || 0);
        const ext = s.mime.includes('mp4') ? 'mp4' : 'webm';
        const out = path.join(s.dir, `recording.${ext}`);

        // Concatenated in order. WebM and MP4 both tolerate this for pieces cut
        // by the same MediaRecorder, because every piece after the first is a
        // continuation of one stream rather than an independent file.
        try {
            const w = fs.createWriteStream(out);
            for (const f of files) w.write(fs.readFileSync(path.join(s.dir, f)));
            w.end();
            await new Promise((r) => w.on('finish', r));
            for (const f of files) {
                try { fs.unlinkSync(path.join(s.dir, f)); } catch (err) { /* keep going */ }
            }
        } catch (err) {
            // The parts are left on disk deliberately - a failed join must not
            // also destroy the only copy of the footage.
            ok(res, { ok: false, reason: `could not join the pieces: ${err.message}`,
                      parts_kept: files.length }, 500);
            return true;
        }

        const size = fs.statSync(out).size;
        fs.writeFileSync(path.join(s.dir, 'meta.json'), JSON.stringify({
            id, owner, mime: s.mime, file: `recording.${ext}`,
            bytes: size, parts: files.length,
            started: new Date(s.started).toISOString(),
            finished: new Date().toISOString(),
            seconds: Math.round((Date.now() - s.started) / 1000),
            display_name: user.display_name || user.username || '',
        }, null, 1));
        sessions.delete(id);

        ok(res, {
            ok: true, id, parts: files.length, bytes: size,
            missing: expected && files.length < expected
                ? expected - files.length : 0,
            durable: durable(),
        });
        return true;
    }

    // -------------------------------------------------------------- drive
    if (url.pathname === '/api/recording/drive/status' && req.method === 'GET') {
        const drive = require('./gdrive');
        if (!drive.configured()) {
            ok(res, { ok: true, connected: false, configurable: false,
                      reason: 'GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI are not set' });
            return true;
        }
        try {
            await drive.ensureSchema();
            const db = require('./db');
            const q = await db.query(
                'SELECT email, connected_at FROM app_drive_accounts WHERE user_id = $1',
                [owner]);
            const row = q.rows && q.rows[0];
            ok(res, { ok: true, connected: Boolean(row), configurable: true,
                      email: row ? row.email : '', since: row ? row.connected_at : null });
        } catch (err) {
            ok(res, { ok: false, reason: err.message }, 500);
        }
        return true;
    }

    if (url.pathname === '/api/recording/drive/connect' && req.method === 'GET') {
        const drive = require('./gdrive');
        if (!drive.configured()) {
            ok(res, { ok: false, reason: 'Google is not configured on the server' }, 400);
            return true;
        }
        const c = drive.cfg();
        // The user id rides in the state parameter, so the callback knows whose
        // account this token belongs to without trusting anything the browser
        // sends back.
        const crypto = require('crypto');
        const nonce = crypto.randomBytes(12).toString('hex');
        const state = Buffer.from(JSON.stringify({ u: owner, n: nonce })).toString('base64url');
        const q = new URLSearchParams({
            client_id: c.id,
            redirect_uri: c.redirect,
            response_type: 'code',
            scope: drive.SCOPE,
            // Both are required to get a refresh token at all - without them
            // Google returns only a one-hour access token and the connection
            // dies quietly an hour later.
            access_type: 'offline',
            prompt: 'consent',
            include_granted_scopes: 'true',
            state,
        });
        res.writeHead(302, { Location: `${drive.AUTH}?${q}` });
        res.end();
        return true;
    }

    if (url.pathname === '/api/recording/drive/callback' && req.method === 'GET') {
        const drive = require('./gdrive');
        const code = String(url.searchParams.get('code') || '');
        const raw = String(url.searchParams.get('state') || '');
        const back = '/recording.html';
        if (!code) {
            res.writeHead(302, { Location: back + '?drive=denied' });
            res.end();
            return true;
        }
        let claimed = '';
        try { claimed = JSON.parse(Buffer.from(raw, 'base64url').toString()).u || ''; }
        catch (err) { claimed = ''; }
        // The state says whose account this is. It is checked against the
        // session rather than trusted, so a returned link cannot attach
        // somebody else's Drive to this login.
        if (!claimed || claimed !== owner) {
            res.writeHead(302, { Location: back + '?drive=mismatch' });
            res.end();
            return true;
        }
        try {
            const c = drive.cfg();
            const t = await (async () => {
                const r = await fetch(drive.TOKEN, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        code, client_id: c.id, client_secret: c.secret,
                        redirect_uri: c.redirect, grant_type: 'authorization_code',
                    }).toString(),
                });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error_description || j.error || 'token exchange failed');
                return j;
            })();
            if (!t.refresh_token) {
                // Google only sends one on the first consent. Without it the
                // connection dies in an hour, so this is a failure, not a
                // detail - prompt=consent exists to force it.
                throw new Error('Google did not return a refresh token - revoke '
                    + 'the app at myaccount.google.com and connect again');
            }
            let email = '';
            try {
                const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo',
                    { headers: { Authorization: `Bearer ${t.access_token}` } });
                email = ((await me.json()) || {}).email || '';
            } catch (err) { /* cosmetic */ }

            await drive.ensureSchema();
            const db = require('./db');
            await db.query(
                `INSERT INTO app_drive_accounts (user_id, refresh_token, email)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id) DO UPDATE
                   SET refresh_token = EXCLUDED.refresh_token,
                       email = EXCLUDED.email,
                       connected_at = now(),
                       last_error = NULL`,
                [owner, t.refresh_token, email]);
            res.writeHead(302, { Location: back + '?drive=connected' });
            res.end();
        } catch (err) {
            res.writeHead(302, {
                Location: back + '?drive=error&why=' + encodeURIComponent(err.message.slice(0, 140)),
            });
            res.end();
        }
        return true;
    }

    if (url.pathname === '/api/recording/drive/upload' && req.method === 'POST') {
        const drive = require('./gdrive');
        let body = {};
        try { body = JSON.parse((await readBody(req, 64 * 1024)).toString() || '{}'); }
        catch (err) { body = {}; }
        try {
            // The browser uploads straight to Google with this URL. Several
            // gigabytes never touching this server is the whole reason Drive
            // was chosen over storing the file here.
            const r = await drive.beginUpload(owner, {
                name: String(body.name || `recording-${Date.now()}.webm`),
                mime: String(body.mime || 'video/webm'),
            });
            ok(res, { ok: true, upload_url: r.url, folder: r.folder });
        } catch (err) {
            ok(res, { ok: false, reason: err.message }, 400);
        }
        return true;
    }

    if (url.pathname === '/api/recording/drive/list' && req.method === 'GET') {
        const drive = require('./gdrive');
        try { ok(res, { ok: true, files: await drive.list(owner) }); }
        catch (err) { ok(res, { ok: false, reason: err.message }, 400); }
        return true;
    }

    // The Content Machine calls this to collect footage by itself. It streams
    // the ORIGINAL bytes - the thing YouTube could never have given back.
    if (url.pathname === '/api/recording/drive/file' && req.method === 'GET') {
        const drive = require('./gdrive');
        const id = String(url.searchParams.get('id') || '');
        if (!id) { ok(res, { ok: false, reason: 'no file id' }, 400); return true; }
        try {
            const upstream = await drive.download(owner, id);
            res.writeHead(200, {
                'Content-Type': upstream.headers.get('content-type') || 'video/webm',
                'Content-Length': upstream.headers.get('content-length') || undefined,
            });
            // Piped rather than buffered: a two hour file must not be held in
            // this process's memory on its way past.
            const reader = upstream.body.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(Buffer.from(value));
            }
            res.end();
        } catch (err) {
            ok(res, { ok: false, reason: err.message }, 400);
        }
        return true;
    }

    // ------------------------------------------------------------ scripts
    if (url.pathname === '/api/recording/scripts' && req.method === 'GET') {
        // Placeholder shape, deliberately: the real source is the trainer's own
        // Content Machine account, and the connection between the two does not
        // exist yet. Returning a believable-looking fake script would make this
        // page LOOK finished, which is the last thing it should do.
        ok(res, {
            ok: true, scripts: [],
            reason: 'not connected to a Content Machine account yet',
        });
        return true;
    }

    // ------------------------------------------------------------- list
    if (url.pathname === '/api/recording/list' && req.method === 'GET') {
        const out = [];
        try {
            for (const d of fs.readdirSync(ROOT)) {
                const m = path.join(ROOT, d, 'meta.json');
                if (!fs.existsSync(m)) continue;
                const meta = JSON.parse(fs.readFileSync(m, 'utf8'));
                if (String(meta.owner) !== owner) continue;
                out.push(meta);
            }
        } catch (err) { /* no recordings yet */ }
        out.sort((a, b) => String(b.started).localeCompare(String(a.started)));
        ok(res, { ok: true, recordings: out, durable: durable() });
        return true;
    }

    return false;
}

module.exports = handle;
module.exports._private = { ROOT, durable, safeId };
