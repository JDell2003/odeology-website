/* MailerLite integration (connect.mailerlite.com, new API, Bearer JWT).
   MailerLite has no one-off transactional send — the supported pattern is:
     1. upsert the person as a subscriber with custom fields filled in
       (reset link, CTA, subject line, inviter name...),
     2. drop them into a per-event group ("RiseForIt - Password Reset
        Requested"), which fires a MailerLite automation ("subscriber joins
        group") that sends the actual email using those fields.
   Re-triggering works because we remove them from the group before adding
   them back — a re-join fires the automation again.
   Groups and custom fields are auto-created on first use and cached. */

const API_BASE = 'https://connect.mailerlite.com/api';

function mailerLiteToken() {
  return String(process.env.MAILERLITE_API_TOKEN || '').trim();
}

function isMailerLiteConfigured() {
  return Boolean(mailerLiteToken());
}

async function mlFetch(path, { method = 'GET', body } = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${mailerLiteToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (resp.status === 204) return null;
  const text = await resp.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!resp.ok) {
    const message = json?.message || text.slice(0, 200) || `HTTP ${resp.status}`;
    const err = new Error(`MailerLite ${method} ${path}: ${message}`);
    err.status = resp.status;
    throw err;
  }
  return json;
}

/* ---- per-event groups ---- */
const groupIdCache = new Map(); // name -> id

function groupNameForEvent(eventName) {
  return `RiseForIt - ${String(eventName || '').trim()}`.slice(0, 250);
}

async function ensureGroup(name) {
  if (groupIdCache.has(name)) return groupIdCache.get(name);
  const found = await mlFetch(`/groups?filter[name]=${encodeURIComponent(name)}&limit=50`);
  const match = (found?.data || []).find((g) => String(g?.name || '') === name);
  if (match?.id) {
    groupIdCache.set(name, match.id);
    return match.id;
  }
  const created = await mlFetch('/groups', { method: 'POST', body: { name } });
  const id = created?.data?.id;
  if (!id) throw new Error('MailerLite group create returned no id');
  groupIdCache.set(name, id);
  return id;
}

/* ---- custom fields (created once, then cached) ---- */
const STANDARD_FIELDS = [
  'ode_last_event',
  'ode_event_at',
  'ode_email_subject',
  'ode_email_preheader',
  'ode_cta_label',
  'ode_cta_url',
  'ode_email_variant'
];
let fieldsEnsured = null;

async function ensureStandardFields() {
  if (fieldsEnsured) return fieldsEnsured;
  fieldsEnsured = (async () => {
    const existing = await mlFetch('/fields?limit=250');
    const keys = new Set((existing?.data || []).map((f) => String(f?.key || '').trim()));
    for (const key of STANDARD_FIELDS) {
      if (keys.has(key)) continue;
      try {
        await mlFetch('/fields', { method: 'POST', body: { name: key, type: 'text' } });
      } catch (err) {
        // Racing another process that just created it is fine.
        if (err?.status !== 422) throw err;
      }
    }
  })();
  try {
    await fieldsEnsured;
  } catch (err) {
    fieldsEnsured = null; // retry on the next event
    throw err;
  }
  return fieldsEnsured;
}

const clip = (v, max = 250) => String(v == null ? '' : v).trim().slice(0, max);

/* Upsert the subscriber with the event's fields, then (re)join the event
   group so the matching MailerLite automation fires. */
async function recordMailerLiteEvent({
  email,
  firstName = '',
  lastName = '',
  phone = '',
  eventName,
  subject = '',
  preheader = '',
  ctaLabel = '',
  ctaUrl = '',
  variant = ''
} = {}) {
  if (!isMailerLiteConfigured()) return { ok: false, skipped: 'not_configured' };
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
    return { ok: false, skipped: 'no_email' };
  }
  const metric = String(eventName || '').trim();
  if (!metric) return { ok: false, skipped: 'no_event_name' };

  await ensureStandardFields();
  const groupId = await ensureGroup(groupNameForEvent(metric));
  // New signups (onboarding collects the email) also join the main mailing
  // list, permanently — that's the audience for newsletters and campaigns.
  let mailingListId = null;
  if (metric === 'Account Created' || metric === 'Lead Nurture Channel Enrolled') {
    try { mailingListId = await ensureGroup('RiseForIt Mailing List'); } catch { mailingListId = null; }
  }

  const fields = {
    ode_last_event: clip(metric),
    ode_event_at: new Date().toISOString(),
    ode_email_subject: clip(subject),
    ode_email_preheader: clip(preheader),
    ode_cta_label: clip(ctaLabel),
    ode_cta_url: clip(ctaUrl, 500),
    ode_email_variant: clip(variant, 4)
  };
  if (firstName) fields.name = clip(firstName, 120);
  if (lastName) fields.last_name = clip(lastName, 120);
  if (phone) fields.phone = clip(phone, 40);

  // 1. upsert with fields (no group yet) so the data lands first
  const upserted = await mlFetch('/subscribers', {
    method: 'POST',
    body: { email: safeEmail, fields }
  });
  const subscriberId = upserted?.data?.id;

  // 2. leave the group if already in it — a fresh join re-fires automations
  if (subscriberId) {
    try {
      await mlFetch(`/subscribers/${subscriberId}/groups/${groupId}`, { method: 'DELETE' });
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
  }

  // 3. join the event group (+ the mailing list for new signups)
  await mlFetch('/subscribers', {
    method: 'POST',
    body: { email: safeEmail, groups: mailingListId ? [groupId, mailingListId] : [groupId] }
  });

  return { ok: true, subscriberId: subscriberId || null, groupId, mailingListId };
}

/* ---- real one-off send (campaign to a single-recipient group) ----
   MailerLite has no transactional endpoint, but a "regular" campaign sent
   with delivery:instant to a group containing only the target reaches the
   inbox right away. We build a throwaway group per send so a campaign never
   re-mails a previous recipient, and prune old throwaway groups opportunis-
   tically so they don't pile up. The from-address must be a verified sender
   on the account (account.sender_email). */
const TX_GROUP_PREFIX = 'RiseForIt TX';
let senderCache = null; // { email, name } cached from /account

async function resolveVerifiedSender() {
  if (senderCache) return senderCache;
  const acct = await mlFetch('/account');
  const data = acct?.data || {};
  senderCache = {
    email: String(data.sender_email || '').trim(),
    name: String(data.sender_name || 'RiseForIt').trim() || 'RiseForIt'
  };
  return senderCache;
}

async function pruneOldTxGroups() {
  // Best-effort: delete throwaway send-groups older than 2 hours.
  try {
    const found = await mlFetch(`/groups?filter[name]=${encodeURIComponent(TX_GROUP_PREFIX)}&limit=50`);
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const g of (found?.data || [])) {
      if (!String(g?.name || '').startsWith(TX_GROUP_PREFIX)) continue;
      const created = Date.parse(g?.created_at || '') || 0;
      if (created && created < cutoff && g.id) {
        try { await mlFetch(`/groups/${g.id}`, { method: 'DELETE' }); } catch { /* ignore */ }
      }
    }
  } catch { /* pruning is best-effort */ }
}

async function sendCampaignEmail({ email, firstName = '', lastName = '', subject, html, tag = 'send' } = {}) {
  if (!isMailerLiteConfigured()) return { ok: false, skipped: 'not_configured' };
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) return { ok: false, skipped: 'no_email' };
  if (!String(subject || '').trim() || !String(html || '').trim()) return { ok: false, skipped: 'no_content' };

  const sender = await resolveVerifiedSender();
  if (!sender.email) return { ok: false, skipped: 'no_verified_sender' };

  pruneOldTxGroups(); // fire-and-forget

  // 1. throwaway group holding only this recipient
  const groupName = `${TX_GROUP_PREFIX} ${clip(tag, 24)} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.slice(0, 250);
  const group = await mlFetch('/groups', { method: 'POST', body: { name: groupName } });
  const groupId = group?.data?.id;
  if (!groupId) return { ok: false, error: 'group_create_failed' };

  // 2. upsert the subscriber straight into that group
  const fields = {};
  if (firstName) fields.name = clip(firstName, 120);
  if (lastName) fields.last_name = clip(lastName, 120);
  await mlFetch('/subscribers', { method: 'POST', body: { email: safeEmail, fields, groups: [groupId] } });

  // 3. create + instant-send the campaign to that group
  const campaign = await mlFetch('/campaigns', {
    method: 'POST',
    body: {
      name: `RiseForIt ${clip(tag, 40)} ${new Date().toISOString()}`.slice(0, 250),
      type: 'regular',
      groups: [groupId],
      emails: [{ subject: clip(subject, 250), from_name: sender.name, from: sender.email, content: String(html) }]
    }
  });
  const campaignId = campaign?.data?.id;
  if (!campaignId) return { ok: false, error: 'campaign_create_failed' };

  const scheduled = await mlFetch(`/campaigns/${campaignId}/schedule`, { method: 'POST', body: { delivery: 'instant' } });
  const status = String(scheduled?.data?.status || '').trim();
  const ok = ['ready', 'sending', 'sent'].includes(status);
  return { ok, provider: 'mailerlite-campaign', campaignId, status, from: sender.email };
}

module.exports = {
  isMailerLiteConfigured,
  recordMailerLiteEvent,
  sendCampaignEmail,
  groupNameForEvent,
  // exposed for testing/cleanup
  mlFetch
};
