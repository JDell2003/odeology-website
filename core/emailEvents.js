const db = require('./db');
const { buildEmailTemplate } = require('./emailTemplates');
const { isMailerLiteConfigured, recordMailerLiteEvent, sendCampaignEmail } = require('./mailerLiteClient');
const { applyOwnerEmailOverride } = require('./emailTemplateOverrides');

/* Default send list = the emails that matter, none of the daily-volume ones.
   Deactivated by default (they'd burn the send quota and annoy people):
   Message Received, Daily Check-In Saved, Weekly Weigh-In Logged, Workout
   Logged, Pain Report Submitted, Pain Follow-Up Submitted, and everything
   else not listed. Re-enable any of them with the EMAIL_ENABLED_EVENTS
   env var (comma-separated event names) or EMAIL_EVENT_PROFILE=all.
   The old KLAVIYO_* names still work so nothing set in Railway breaks. */
const FREE_PLAN_EVENT_ALLOWLIST = new Set([
  'Account Created',
  'Lead Submitted',
  'Lead Nurture Channel Enrolled',
  'Support Request Received',
  'Password Reset Requested',
  'Password Reset Completed',
  'Friend Request Received',
  'Workout Share Invite Received',
  'High Pain Report Submitted',
  // Owner-provisioned account invite (temp password) + its test send.
  'Trainer Account Invite'
]);

function parseEventList(raw) {
  const out = new Set();
  String(raw || '')
    .split(',')
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .forEach((name) => out.add(name));
  return out;
}

function isEventAllowedByPlan(eventName) {
  const metric = String(eventName || '').trim();
  if (!metric) return false;

  const enabledOverride = parseEventList(
    process.env.EMAIL_ENABLED_EVENTS || process.env.KLAVIYO_ENABLED_EVENTS || ''
  );
  if (enabledOverride.size) return enabledOverride.has(metric);

  const mode = String(
    process.env.EMAIL_EVENT_PROFILE || process.env.KLAVIYO_EVENT_PROFILE || 'free'
  ).trim().toLowerCase();
  if (mode === 'all' || mode === 'full' || mode === 'unlimited') return true;
  if (mode === 'none' || mode === 'off' || mode === 'disabled') return false;

  // Default mode is free-plan-safe.
  return FREE_PLAN_EVENT_ALLOWLIST.has(metric);
}

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function normalizePhone(raw) {
  const src = String(raw || '').trim();
  if (!src) return '';
  const hasPlus = src.startsWith('+');
  const digits = src.replace(/[^\d]/g, '');
  if (digits.length < 10) return '';
  return hasPlus ? `+${digits}` : digits;
}

function splitDisplayName(displayName) {
  const full = String(displayName || '').trim();
  if (!full) return { firstName: '', lastName: '' };
  const parts = full.split(/\s+/g).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
}

function logEmailEventError(err, context) {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return;
  console.warn('[email-events]', context, err?.message || err);
}

function buildTemplateBackedProps({
  metric = '',
  displayName = '',
  baseEventProps = {}
} = {}) {
  const safeProps = baseEventProps && typeof baseEventProps === 'object' && !Array.isArray(baseEventProps)
    ? { ...baseEventProps }
    : {};
  const template = buildEmailTemplate({
    eventName: metric,
    displayName,
    eventProps: safeProps
  });
  if (!template) return safeProps;
  return {
    ...safeProps,
    ode_email_template_key: template.key,
    ode_email_template_version: template.version,
    ode_email_subject: template.subject,
    ode_email_preheader: template.preheader,
    ode_email_cta_label: template.ctaLabel,
    ode_email_cta_url: template.ctaUrl,
    ode_email_html: template.html,
    ode_email_text: template.text
  };
}

// The shared email-event pipe. MailerLite is the only provider — Klaviyo was
// removed after its key went stale and it 401'd on every send. profileProps is
// still accepted so call sites didn't all have to change; MailerLite carries
// identity on the subscriber record instead.
async function emitEmailEvent({
  eventName,
  email,
  phone,
  displayName = '',
  firstName = '',
  lastName = '',
  eventProps = {},
  profileProps = {}
} = {}) {
  if (!isMailerLiteConfigured()) {
    return { ok: false, skipped: 'not_configured' };
  }
  const safeEmail = normalizeEmail(email);
  const safePhone = normalizePhone(phone);
  if (!safeEmail && !safePhone) return { ok: false, skipped: 'no_identity' };

  const split = splitDisplayName(displayName);
  const fName = String(firstName || split.firstName || '').trim().slice(0, 120);
  const lName = String(lastName || split.lastName || '').trim().slice(0, 120);
  const metric = String(eventName || '').trim();
  if (!metric) return { ok: false, skipped: 'no_event_name' };
  if (!isEventAllowedByPlan(metric)) return { ok: false, skipped: 'event_not_enabled_for_profile' };
  const fullDisplayName = String(displayName || `${fName} ${lName}`).trim();
  const finalEventProps = buildTemplateBackedProps({
    metric,
    displayName: fullDisplayName,
    baseEventProps: eventProps
  });

  // Owner-edited version (and A/B split) replaces the built-in template.
  let emailVariant = '';
  try {
    emailVariant = await applyOwnerEmailOverride({
      db,
      eventName: metric,
      displayName: fullDisplayName,
      eventProps,
      props: finalEventProps
    }) || '';
  } catch (err) {
    logEmailEventError(err, `${metric}:override`);
  }

  // MailerLite: upsert subscriber + per-event group join (fires their
  // automation).
  let mailerLiteOk = false;
  if (safeEmail) {
    try {
      const mlResult = await recordMailerLiteEvent({
        email: safeEmail,
        phone: safePhone,
        firstName: fName,
        lastName: lName,
        eventName: metric,
        subject: finalEventProps.ode_email_subject || '',
        preheader: finalEventProps.ode_email_preheader || '',
        ctaLabel: finalEventProps.ode_email_cta_label || '',
        ctaUrl: finalEventProps.ode_email_cta_url || '',
        variant: emailVariant
      });
      mailerLiteOk = Boolean(mlResult?.ok);
    } catch (err) {
      logEmailEventError(err, `${metric}:mailerlite`);
    }
  }

  return mailerLiteOk ? { ok: true, provider: 'mailerlite' } : { ok: false, error: 'mailerlite_failed' };
}

async function emitUserEvent({
  userId,
  eventName,
  eventProps = {},
  profileProps = {}
} = {}) {
  const id = String(userId || '').trim();
  if (!id) return { ok: false, skipped: 'no_user_id' };
  if (!isMailerLiteConfigured()) return { ok: false, skipped: 'not_configured' };
  try {
    const result = await db.query(
      `
        SELECT email, phone, display_name
        FROM app_users
        WHERE id = $1
        LIMIT 1;
      `,
      [id]
    );
    const row = result.rows?.[0] || null;
    if (!row) return { ok: false, skipped: 'user_not_found' };
    return await emitEmailEvent({
      eventName,
      email: row.email || '',
      phone: row.phone || '',
      displayName: row.display_name || '',
      eventProps,
      profileProps
    });
  } catch (err) {
    logEmailEventError(err, `${String(eventName || 'unknown')}:lookup`);
    return { ok: false, error: err?.message || 'lookup_failed' };
  }
}

function buildOnboardingEmailPayload({ displayName = '' } = {}) {
  const name = String(displayName || '').trim();
  const first = name ? name.split(/\s+/g)[0] : '';
  const greetingName = first || 'there';
  return {
    subject: 'Welcome to RiseForIt - your training dashboard is live',
    preheader: 'Your free account is active. Start with Dash, Training, Meals, and Progress tracking.',
    greeting: `Hey ${greetingName}, welcome to RiseForIt.`,
    intro: 'Your free account is ready. You can run your training, nutrition, and accountability from one place.',
    perks: [
      'Daily Dash check-ins (weight, sleep, stress, water, meal adherence, progress photos)',
      'Training plan generation plus custom workout builder',
      'Workout sharing, invites, and teammate messaging',
      'Grocery and meal planning with projected runout tracking',
      'Progress logs, weekly trends, and accountability warnings'
    ],
    ctaPrimary: 'Open your dashboard and complete today\'s check-in',
    ctaSecondary: 'Build your workout or generate one in seconds',
    tone: 'professional_warm_v1',
    freePlan: true
  };
}

function escapeHtml(raw) {
  return String(raw == null ? '' : raw)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Branded HTML for the owner-provisioned account invite. Used for both the
// real invite and the "send test" button so they look identical.
function buildInviteEmailHtml({ displayName = '', roleLabel = 'trainer', username = '', tempPassword = '', loginUrl = '', message = '', isTest = false } = {}) {
  const greeting = String(displayName || '').trim().split(/\s+/)[0] || 'there';
  const url = loginUrl || 'https://riseforit.com/';
  const intro = message
    || `Your RiseForIt ${roleLabel} account is ready. Log in with the temporary password below and finish your setup whenever you're ready.`;
  const testBanner = isTest
    ? '<div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;border-radius:10px;padding:10px 14px;font:600 13px/1.5 system-ui,Arial,sans-serif;margin:0 0 18px">This is a <b>test</b> of the account-invite email. If you can read this, invites are wired up.</div>'
    : '';
  return `<div style="background:#f6f7f9;padding:28px 0;font-family:system-ui,Segoe UI,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e8eb">
      <div style="background:linear-gradient(135deg,#d4a537,#b98a2b);padding:22px 26px">
        <div style="font:800 20px/1 system-ui,Arial,sans-serif;color:#1a1206">RiseForIt</div>
      </div>
      <div style="padding:26px">
        ${testBanner}
        <h1 style="margin:0 0 8px;font:800 22px/1.25 system-ui,Arial,sans-serif;color:#14212e">Hey ${escapeHtml(greeting)} — your account is ready</h1>
        <p style="margin:0 0 20px;font:400 15px/1.6 system-ui,Arial,sans-serif;color:#475569">${escapeHtml(intro)}</p>
        <div style="background:#f8fafc;border:1px solid #e6e8eb;border-radius:12px;padding:16px 18px;margin:0 0 22px">
          <div style="font:700 11px/1 system-ui,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin:0 0 4px">Username</div>
          <div style="font:800 16px/1.3 ui-monospace,Menlo,Consolas,monospace;color:#14212e;margin:0 0 14px">${escapeHtml(username)}</div>
          <div style="font:700 11px/1 system-ui,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin:0 0 4px">Temporary password</div>
          <div style="font:800 16px/1.3 ui-monospace,Menlo,Consolas,monospace;color:#14212e">${escapeHtml(tempPassword)}</div>
        </div>
        <a href="${escapeHtml(url)}" style="display:inline-block;background:linear-gradient(135deg,#d4a537,#b98a2b);color:#1a1206;text-decoration:none;font:800 15px/1 system-ui,Arial,sans-serif;padding:14px 24px;border-radius:10px">Log in &amp; finish setup</a>
        <p style="margin:22px 0 0;font:400 13px/1.6 system-ui,Arial,sans-serif;color:#94a3b8">Change your password after logging in. If you weren't expecting this, you can ignore this email.</p>
      </div>
    </div>
  </div>`;
}

// Send the owner-provisioned invite as a REAL email (MailerLite campaign,
// instant delivery). Returns { ok, provider, status, ... } for a UI check/X.
async function sendInviteEmail({ email, displayName = '', roleLabel = 'trainer', username = '', tempPassword = '', loginUrl = '', message = '', isTest = false } = {}) {
  const subject = isTest ? '[TEST] Your RiseForIt account is ready' : 'Your RiseForIt account is ready';
  const html = buildInviteEmailHtml({ displayName, roleLabel, username, tempPassword, loginUrl, message, isTest });
  return sendCampaignEmail({
    email,
    firstName: String(displayName || '').trim().split(/\s+/)[0] || '',
    subject,
    html,
    tag: isTest ? 'invite-test' : 'invite'
  });
}

/* ------------------------------------------------------------------
   OWNER LEAD ALERT — a real email to the owner the moment someone fills
   out a landing-page form. This is a notification, not marketing: it goes
   to one fixed inbox, so it deliberately skips the plan allowlist that
   gates emitEmailEvent.
   ------------------------------------------------------------------ */
const OWNER_ALERT_SOURCES = new Set(['trainer_gate']);

function ownerAlertRecipient() {
  return String(process.env.OWNER_LEAD_ALERT_EMAIL || 'jodellpersonal@gmail.com').trim();
}

function buildOwnerLeadAlertHtml({ lead = {}, sourceLabel = 'Landing page', when = '' } = {}) {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() || 'No name given';
  const email = String(lead.email || '').trim();
  const phone = String(lead.phone || '').trim();
  const row = (label, value, href) => {
    if (!String(value || '').trim()) return '';
    const inner = href
      ? `<a href="${escapeHtml(href)}" style="color:#b8790a;text-decoration:none">${escapeHtml(value)}</a>`
      : escapeHtml(value);
    return `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #ece7dc;font:700 11px/1.4 system-ui,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#9b937f;width:120px;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #ece7dc;font:600 15px/1.5 system-ui,Arial,sans-serif;color:#1f1c17">${inner}</td>
    </tr>`;
  };
  const snapshot = lead.snapshot && typeof lead.snapshot === 'object' ? lead.snapshot : {};
  return `<div style="background:#f5f1e8;padding:28px 0;font-family:system-ui,Segoe UI,Arial,sans-serif">
    <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e4ddcd">
      <div style="background:#0d0c0a;padding:20px 26px">
        <div style="font:800 13px/1 system-ui,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#f59e0b">New form hit</div>
        <div style="font:400 22px/1.3 Georgia,serif;color:#fff;margin-top:6px">${escapeHtml(name)}</div>
      </div>
      <div style="padding:22px 26px">
        <table style="width:100%;border-collapse:collapse">
          ${row('Name', name)}
          ${row('Email', email, email ? `mailto:${email}` : '')}
          ${row('Phone', phone, phone ? `tel:${phone}` : '')}
          ${row('Source', sourceLabel)}
          ${row('Page', lead.path || snapshot.page || '')}
          ${row('Referrer', snapshot.ref || '')}
          ${row('Submitted', when)}
        </table>
        <p style="margin:20px 0 0;font:400 13px/1.6 system-ui,Arial,sans-serif;color:#6f6a5e">
          They asked for the 15-Minute Client-Getting Script. Everyone who hits the page is listed under
          <b style="color:#1f1c17">Owner Form Hits</b> in your control panel.
        </p>
      </div>
    </div>
  </div>`;
}

// Fire-and-forget: a failed notification must never fail the visitor's submit.
async function sendOwnerLeadAlert({ lead = {}, source = '' } = {}) {
  const src = String(source || lead.source || '').trim().toLowerCase();
  if (!OWNER_ALERT_SOURCES.has(src)) return { ok: false, skipped: 'source_not_alertable' };
  const to = ownerAlertRecipient();
  if (!to) return { ok: false, skipped: 'no_recipient' };

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() || 'Someone';
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';
  return sendCampaignEmail({
    email: to,
    subject: `New trainer lead — ${name}`,
    html: buildOwnerLeadAlertHtml({ lead, sourceLabel: 'Trainer landing page (/partner)', when }),
    tag: 'owner-lead-alert'
  });
}

module.exports = {
  emitEmailEvent,
  emitUserEvent,
  buildOnboardingEmailPayload,
  buildInviteEmailHtml,
  sendInviteEmail,
  sendOwnerLeadAlert,
  buildOwnerLeadAlertHtml,
  OWNER_ALERT_SOURCES,
  FREE_PLAN_EVENT_ALLOWLIST,
  isEventAllowedByPlan
};
