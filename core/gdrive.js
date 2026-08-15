'use strict';
/**
 * Google Drive as the place a trainer's footage lives.
 *
 * WHY DRIVE AND NOT YOUTUBE
 * YouTube throws away what you upload and keeps only its own re-encode, so the
 * original 1080p file is unrecoverable by anyone - including the person who
 * uploaded it. For a system whose job is to EDIT that footage, losing the
 * master before editing starts is the wrong end to lose. Drive hands the exact
 * bytes back. YouTube also meters uploads hard: 1600 units of a 10,000/day
 * allowance, which is about six videos a day shared across every trainer,
 * because the allowance belongs to the app rather than to the account the video
 * lands in.
 *
 * WHY THE drive.file SCOPE SPECIFICALLY
 * It grants access ONLY to files this app itself created. That is the whole
 * difference between shipping and not shipping: the broad Drive scopes are
 * "sensitive" and need a Google review, a published privacy policy and a
 * verification screen, and cap an unverified app at about a hundred users.
 * drive.file needs none of it. It also means the app can never see a trainer's
 * own documents, which is the correct answer when the alternative is asking a
 * stranger for their whole Drive.
 *
 * STORAGE IS THEIRS
 * The file counts against the trainer's own 15GB, not against anything of
 * Jason's. Nothing to pay for and nothing to run out of centrally.
 */

const crypto = require('crypto');
const db = require('./db');

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'RiseForIt Recordings';

let schemaReady = false;

async function ensureSchema() {
    if (schemaReady) return;
    await db.query(`
    CREATE TABLE IF NOT EXISTS app_drive_accounts (
      user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      refresh_token text NOT NULL,
      email text,
      folder_id text,
      connected_at timestamptz NOT NULL DEFAULT now(),
      last_error text
    );
  `);
    schemaReady = true;
}

function cfg() {
    return {
        // The same Google project as the sign-in flow. One OAuth client can
        // hold several redirect URIs, so nothing new needs creating.
        id: String(process.env.GOOGLE_CLIENT_ID || '').trim(),
        secret: String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
        // Its OWN variable, deliberately. GOOGLE_REDIRECT_URI already points at
        // /api/auth/google/callback and is what signs everybody in - pointing
        // it here would break login for every user on the site. Google returns
        // the user to whichever URI the request was made with, so the two flows
        // need two values.
        redirect: String(process.env.GOOGLE_DRIVE_REDIRECT_URI || '').trim(),
    };
}

function configured() {
    const c = cfg();
    return Boolean(c.id && c.secret && c.redirect);
}

async function post(url, params) {
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
    });
    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch (err) { j = { raw: text }; }
    if (!r.ok) {
        const e = new Error(j.error_description || j.error || `http ${r.status}`);
        e.status = r.status;
        throw e;
    }
    return j;
}

/** A short-lived access token from the stored refresh token. */
async function accessToken(userId) {
    await ensureSchema();
    const q = await db.query(
        'SELECT refresh_token FROM app_drive_accounts WHERE user_id = $1', [userId]);
    const row = q.rows && q.rows[0];
    if (!row) return null;
    const c = cfg();
    const t = await post(TOKEN, {
        client_id: c.id,
        client_secret: c.secret,
        refresh_token: row.refresh_token,
        grant_type: 'refresh_token',
    });
    return t.access_token || null;
}

async function api(userId, path, opts = {}) {
    const tok = await accessToken(userId);
    if (!tok) throw new Error('Drive is not connected for this account');
    const r = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${tok}`, ...(opts.headers || {}) },
    });
    if (!r.ok) throw new Error(`Drive said ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r;
}

/** The trainer's recordings folder, made once and remembered. */
async function folder(userId) {
    await ensureSchema();
    const q = await db.query(
        'SELECT folder_id FROM app_drive_accounts WHERE user_id = $1', [userId]);
    const known = q.rows && q.rows[0] && q.rows[0].folder_id;
    if (known) return known;

    // drive.file can only see what this app made, so a folder it created
    // earlier is findable and one the trainer made by hand is not - which is
    // exactly why the id is remembered rather than searched for by name.
    const r = await api(userId, 'files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const j = await r.json();
    await db.query(
        'UPDATE app_drive_accounts SET folder_id = $2 WHERE user_id = $1',
        [userId, j.id]);
    return j.id;
}

/**
 * Open a resumable upload and hand the URL to the browser.
 *
 * The bytes go from the trainer's machine straight to Google. They never pass
 * through this server, which is the entire point - a two hour recording is
 * several gigabytes and Railway is the wrong place for it to land, even in
 * transit.
 */
async function beginUpload(userId, { name, mime }) {
    const parent = await folder(userId);
    const tok = await accessToken(userId);
    const r = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tok}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mime || 'video/webm',
            },
            body: JSON.stringify({ name, parents: [parent] }),
        });
    if (!r.ok) throw new Error(`could not start the upload: ${r.status}`);
    const url = r.headers.get('location');
    if (!url) throw new Error('Google did not return an upload URL');
    return { url, folder: parent };
}

async function list(userId) {
    const parent = await folder(userId);
    const q = encodeURIComponent(`'${parent}' in parents and trashed = false`);
    const r = await api(userId,
        `files?q=${q}&orderBy=createdTime desc&pageSize=50`
        + '&fields=files(id,name,size,createdTime,mimeType,videoMediaMetadata)');
    const j = await r.json();
    return j.files || [];
}

/** The original bytes, unmodified - the thing YouTube cannot give back. */
async function download(userId, fileId) {
    return api(userId, `files/${encodeURIComponent(fileId)}?alt=media`);
}

module.exports = {
    AUTH, TOKEN, SCOPE, FOLDER,
    cfg, configured, ensureSchema, accessToken, api,
    folder, beginUpload, list, download,
    newState: () => crypto.randomBytes(16).toString('hex'),
};
