const db = require('./db');
const {
  isKlaviyoConfigured,
  createOrUpdateKlaviyoProfile,
  createKlaviyoEvent
} = require('./klaviyoClient');

const FREE_PLAN_EVENT_ALLOWLIST = new Set([
  'Account Created',
  'Lead Nurture Channel Enrolled',
  'Password Reset Requested',
  'Password Reset Completed',
  'Friend Request Received',
  'Message Received',
  'Workout Share Invite Received',
  'Daily Check-In Saved',
  'Weekly Weigh-In Logged',
  'Workout Logged',
  'Pain Report Submitted',
  'High Pain Report Submitted',
  'Pain Follow-Up Submitted'
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

  const enabledOverride = parseEventList(process.env.KLAVIYO_ENABLED_EVENTS || '');
  if (enabledOverride.size) return enabledOverride.has(metric);

  const mode = String(process.env.KLAVIYO_EVENT_PROFILE || 'free').trim().toLowerCase();
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

async function emitKlaviyoEvent({
  eventName,
  email,
  phone,
  displayName = '',
  firstName = '',
  lastName = '',
  eventProps = {},
  profileProps = {}
} = {}) {
  if (!isKlaviyoConfigured()) return { ok: false, skipped: 'not_configured' };
  const safeEmail = normalizeEmail(email);
  const safePhone = normalizePhone(phone);
  if (!safeEmail && !safePhone) return { ok: false, skipped: 'no_identity' };

  const split = splitDisplayName(displayName);
  const fName = String(firstName || split.firstName || '').trim().slice(0, 120);
  const lName = String(lastName || split.lastName || '').trim().slice(0, 120);
  const metric = String(eventName || '').trim();
  if (!metric) return { ok: false, skipped: 'no_event_name' };
  if (!isEventAllowedByPlan(metric)) return { ok: false, skipped: 'event_not_enabled_for_profile' };

  try {
    await createOrUpdateKlaviyoProfile({
      email: safeEmail || undefined,
      phone: safePhone || undefined,
      firstName: fName,
      lastName: lName,
      properties: profileProps && typeof profileProps === 'object' ? profileProps : {}
    });
  } catch (err) {
    logEmailEventError(err, `${metric}:profile`);
  }

  try {
    await createKlaviyoEvent({
      eventName: metric,
      email: safeEmail || undefined,
      phone: safePhone || undefined,
      properties: eventProps && typeof eventProps === 'object' ? eventProps : {},
      time: new Date().toISOString()
    });
    return { ok: true };
  } catch (err) {
    logEmailEventError(err, `${metric}:event`);
    return { ok: false, error: err?.message || 'event_failed' };
  }
}

async function emitUserEvent({
  userId,
  eventName,
  eventProps = {},
  profileProps = {}
} = {}) {
  const id = String(userId || '').trim();
  if (!id) return { ok: false, skipped: 'no_user_id' };
  if (!isKlaviyoConfigured()) return { ok: false, skipped: 'not_configured' };
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
    return await emitKlaviyoEvent({
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
    subject: 'Welcome to ODEOLOGY - your training dashboard is live',
    preheader: 'Your free account is active. Start with Dash, Training, Meals, and Progress tracking.',
    greeting: `Hey ${greetingName}, welcome to ODEOLOGY.`,
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

module.exports = {
  emitKlaviyoEvent,
  emitUserEvent,
  buildOnboardingEmailPayload,
  FREE_PLAN_EVENT_ALLOWLIST,
  isEventAllowedByPlan
};
