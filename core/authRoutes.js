const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { DbUnavailableError, isTransientPgError } = require('./dbErrors');
const {
  emitKlaviyoEvent,
  buildOnboardingEmailPayload
} = require('./emailEvents');

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sid';
const OWNER_BACKUP_COOKIE_NAME = process.env.OWNER_BACKUP_COOKIE_NAME || `${COOKIE_NAME}_owner_backup`;
const SESSION_TTL_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30));
const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.AUTH_MAX_BODY_BYTES || 200_000));
const ONLINE_WINDOW_MS = Math.max(30_000, Number(process.env.ONLINE_WINDOW_MS || 180_000));
const PASSWORD_RESET_TOKEN_TTL_MINUTES = Math.max(10, Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 60));

let schemaEnsured = false;
let schemaEnsurePromise = null;
let schemaTransientBackoffUntil = 0;
let lastSchemaTransientError = null;
const SCHEMA_RETRY_DELAYS_MS = [200, 600, 1400];
const AUTH_SCHEMA_BACKOFF_MS = Math.max(1000, Number(process.env.AUTH_SCHEMA_BACKOFF_MS || 15_000));
const AUTH_TRANSIENT_LOG_THROTTLE_MS = Math.max(1000, Number(process.env.AUTH_TRANSIENT_LOG_THROTTLE_MS || 10_000));
const authTransientLogByContext = new Map();
const TRIAL_DAYS = Math.max(1, Number(process.env.TRAINING_TRIAL_DAYS || 3));
const REFERRAL_GOAL_COUNT = Math.max(1, Number(process.env.REFERRAL_GOAL_COUNT || 2));
const DIRECT_UNLOCK_DAYS = Math.max(1, Number(process.env.DIRECT_UNLOCK_DAYS || 7));
const QUICK_UNLOCK_PRICE_CENTS = Math.max(0, Number(process.env.QUICK_UNLOCK_PRICE_CENTS || 100));
const MONTHLY_SUBSCRIPTION_PRICE_CENTS = Math.max(0, Number(process.env.MONTHLY_SUBSCRIPTION_PRICE_CENTS || 1500));
const ANNUAL_ACCESS_PRICE_CENTS = Math.max(0, Number(process.env.ANNUAL_ACCESS_PRICE_CENTS || 12000));
const ANNUAL_ACCESS_DAYS = Math.max(1, Number(process.env.ANNUAL_ACCESS_DAYS || 365));
const TRAINER_PAYOUT_CENTS_PER_SUBSCRIPTION = Math.max(0, Number(process.env.TRAINER_PAYOUT_CENTS_PER_SUBSCRIPTION || 500));
const TRAINER_REFERRAL_BONUS_CENTS = Math.max(0, Number(process.env.TRAINER_REFERRAL_BONUS_CENTS || 500));
const TRAINER_REFERRAL_BONUS_TRIGGER_RULE = String(process.env.TRAINER_REFERRAL_BONUS_TRIGGER_RULE || 'app_activation_threshold').trim() || 'app_activation_threshold';

function toEpochMs(raw) {
  if (!raw) return NaN;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isLastSeenOnline(lastSeenRaw) {
  const ts = toEpochMs(lastSeenRaw);
  if (!Number.isFinite(ts)) return false;
  return (Date.now() - ts) <= ONLINE_WINDOW_MS;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
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

function csvToSet(raw) {
  const out = new Set();
  String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((s) => out.add(s));
  return out;
}

const OWNER_USERNAMES = csvToSet(process.env.OWNER_USERNAMES || 'RiseForIt,RiseForIt,RiseForItOwner,jason,odeology,odeology_');
const OWNER_EMAILS = csvToSet(process.env.OWNER_EMAILS || '');
const OWNER_EMAIL_DOMAIN = String(process.env.OWNER_EMAIL_DOMAIN || 'RiseForIt.com').trim().toLowerCase();
const OWNER_DISPLAY_NAMES = csvToSet(process.env.OWNER_DISPLAY_NAMES || 'RiseForIt,RiseForIt,ODeology,ODEOLOGY,ODeology_,ODEOLOGY_');
const OWNER_USER_IDS = csvToSet(process.env.OWNER_USER_IDS || '');
const TECH_USERNAMES = csvToSet(process.env.TECH_USERNAMES || 'jason,odeology,odeology_');
const TECH_EMAILS = csvToSet(process.env.TECH_EMAILS || '');
const TECH_DISPLAY_NAMES = csvToSet(process.env.TECH_DISPLAY_NAMES || 'ODeology,ODEOLOGY,ODeology_,ODEOLOGY_');
const TECH_USER_IDS = csvToSet(process.env.TECH_USER_IDS || '');

function isOwnerUser(userLike) {
  const userId = String(userLike?.id || '').trim().toLowerCase();
  const username = String(userLike?.username || '').trim().toLowerCase();
  const email = String(userLike?.email || '').trim().toLowerCase();
  const displayName = String(userLike?.display_name || userLike?.displayName || '').trim().toLowerCase();
  const adminNotes = String(userLike?.admin_notes || userLike?.adminNotes || '').trim().toLowerCase();
  if (userId && OWNER_USER_IDS.has(userId)) return true;
  if (adminNotes.includes('owner')) return true;
  if (username && OWNER_USERNAMES.has(username)) return true;
  if (email && OWNER_EMAILS.has(email)) return true;
  if (displayName && OWNER_DISPLAY_NAMES.has(displayName)) return true;
  if (email && OWNER_EMAIL_DOMAIN && email.endsWith(`@${OWNER_EMAIL_DOMAIN}`)) return true;
  if (username.includes('riseforit') || displayName.includes('riseforit')) return true;
  if (username.includes('odeology') || displayName.includes('odeology')) return true;
  return false;
}

function isTechUser(userLike) {
  const userId = String(userLike?.id || '').trim().toLowerCase();
  const username = String(userLike?.username || '').trim().toLowerCase();
  const email = String(userLike?.email || '').trim().toLowerCase();
  const displayName = String(userLike?.display_name || userLike?.displayName || '').trim().toLowerCase();
  const adminNotes = String(userLike?.admin_notes || userLike?.adminNotes || '').trim().toLowerCase();
  if (userId && TECH_USER_IDS.has(userId)) return true;
  if (notesHasFlag(adminNotes, 'tech')) return true;
  if (username && TECH_USERNAMES.has(username)) return true;
  if (email && TECH_EMAILS.has(email)) return true;
  if (displayName && TECH_DISPLAY_NAMES.has(displayName)) return true;
  if (username.includes('odeology') || displayName.includes('odeology')) return true;
  return false;
}

function buildTrainerReviewNotice(metaRaw = {}) {
  const meta = cleanObject(metaRaw);
  const status = String(meta.reviewDecisionStatus || '').trim().toLowerCase();
  if (status !== 'approved' && status !== 'denied') return null;
  return {
    status,
    reason: String(meta.reviewDecisionReason || '').trim(),
    decidedAt: String(meta.reviewDecisionAt || '').trim(),
    seenAt: String(meta.reviewDecisionSeenAt || '').trim(),
    requiresResubmission: meta.reviewNeedsResubmission === true
  };
}

function safeReturnTo(raw) {
  const value = String(raw || '/').trim();
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
}

function requestProto(req) {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').trim().toLowerCase();
  if (forwarded === 'https' || forwarded === 'http') return forwarded;
  return isSecureRequest(req) ? 'https' : 'http';
}

function requestHost(req) {
  return String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
}

function resolveAppBaseUrl(req) {
  const configured = String(
    process.env.APP_BASE_URL
    || process.env.PUBLIC_APP_URL
    || process.env.SITE_URL
    || ''
  ).trim();
  if (configured) return configured.replace(/\/+$/, '');
  const host = requestHost(req);
  if (!host) return '';
  return `${requestProto(req)}://${host}`.replace(/\/+$/, '');
}

function buildPasswordResetUrl(req, token) {
  const base = resolveAppBaseUrl(req);
  const safeToken = encodeURIComponent(String(token || '').trim());
  if (!safeToken) return '';
  if (!base) return `/reset-password.html?token=${safeToken}`;
  return `${base}/reset-password.html?token=${safeToken}`;
}

function stripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function stripePublishableKey() {
  return String(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    || process.env.STRIPE_PUBLISHABLE_KEY
    || ''
  ).trim();
}

function stripePriceCurrency() {
  return String(process.env.STRIPE_CURRENCY || 'usd').trim().toLowerCase() || 'usd';
}

function stripeWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

function stripePlatformFeePercent() {
  const value = Number.parseFloat(String(process.env.STRIPE_PLATFORM_FEE_PERCENT || '10').trim());
  if (!Number.isFinite(value)) return 10;
  return Math.max(0, Math.min(100, value));
}

function buildCheckoutSuccessUrl(req) {
  const base = resolveAppBaseUrl(req);
  const path = `/training.html?unlock=success&session_id={CHECKOUT_SESSION_ID}`;
  return base ? `${base}${path}` : path;
}

function buildCheckoutCancelUrl(req) {
  const base = resolveAppBaseUrl(req);
  const path = '/training.html?unlock=cancel';
  return base ? `${base}${path}` : path;
}

function getOfferConfig(planCodeRaw) {
  const planCode = String(planCodeRaw || '').trim().toLowerCase();
  if (planCode === 'monthly_subscription') {
    return {
      planCode,
      mode: 'subscription',
      amountCents: MONTHLY_SUBSCRIPTION_PRICE_CENTS,
      days: 30,
      rewardKeyPrefix: 'stripe_subscription',
      productName: 'RiseForIt Monthly Training',
      description: '$15 per month for continued training access.',
      recurringInterval: 'month'
    };
  }
  if (planCode === 'annual_access') {
    return {
      planCode,
      mode: 'payment',
      amountCents: ANNUAL_ACCESS_PRICE_CENTS,
      days: ANNUAL_ACCESS_DAYS,
      rewardKeyPrefix: 'stripe_annual',
      productName: 'RiseForIt Annual Training Access',
      description: 'One-time annual training access.',
      recurringInterval: null
    };
  }
  return {
    planCode: 'quick_unlock',
    mode: 'payment',
    amountCents: QUICK_UNLOCK_PRICE_CENTS,
    days: DIRECT_UNLOCK_DAYS,
    rewardKeyPrefix: 'stripe_quick_unlock',
    productName: `RiseForIt ${DIRECT_UNLOCK_DAYS}-Day Training Unlock`,
    description: 'Continue your training system for 7 more days.',
    recurringInterval: null
  };
}

async function createStripeCheckoutSession(req, user, planCodeRaw) {
  const secret = stripeSecretKey();
  if (!secret) return { ok: false, error: 'Stripe is not configured.' };
  const offer = getOfferConfig(planCodeRaw);
  if (offer.planCode === 'quick_unlock') {
    const access = await getUserAccessState(user?.id);
    if (access?.quickUnlock?.redeemed) {
      return { ok: false, error: 'The $1 unlock can only be used once per account.' };
    }
  }
  const successUrl = buildCheckoutSuccessUrl(req);
  const cancelUrl = buildCheckoutCancelUrl(req);
  const params = new URLSearchParams();
  params.set('mode', offer.mode);
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', stripePriceCurrency());
  params.set('line_items[0][price_data][unit_amount]', String(offer.amountCents));
  params.set('line_items[0][price_data][product_data][name]', offer.productName);
  params.set('line_items[0][price_data][product_data][description]', offer.description);
  if (offer.recurringInterval) {
    params.set('line_items[0][price_data][recurring][interval]', offer.recurringInterval);
  }
  params.set('metadata[user_id]', String(user?.id || '').trim());
  params.set('metadata[plan_code]', offer.planCode);
  if (user?.email) params.set('customer_email', String(user.email).trim());

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.id || !json?.url) {
    return { ok: false, error: json?.error?.message || 'Could not create Stripe checkout session.' };
  }
  return {
    ok: true,
    sessionId: String(json.id || ''),
    url: String(json.url || '')
  };
}

async function getStoredStripeCustomerId(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return '';
  const result = await db.query(
    `
      SELECT COALESCE(stripe_customer_id, '') AS stripe_customer_id
      FROM app_users
      WHERE id = $1
      LIMIT 1;
    `,
    [uid]
  );
  return String(result.rows?.[0]?.stripe_customer_id || '').trim();
}

async function ensureStripeCustomer(user) {
  const uid = String(user?.id || '').trim();
  if (!uid) return '';
  const existing = await getStoredStripeCustomerId(uid);
  if (existing) return existing;

  const secret = stripeSecretKey();
  if (!secret) throw new Error('Stripe is not configured.');

  const params = new URLSearchParams();
  if (user?.email) params.set('email', String(user.email).trim());
  const name = String(user?.displayName || user?.display_name || user?.username || '').trim();
  if (name) params.set('name', name);
  params.set('metadata[user_id]', uid);

  const resp = await fetch('https://api.stripe.com/v1/customers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.id) {
    throw new Error(json?.error?.message || 'Could not create Stripe customer.');
  }
  const customerId = String(json.id || '').trim();
  if (customerId) {
    await syncUserBillingFields(uid, { stripeCustomerId: customerId });
  }
  return customerId;
}

async function createStripeInlinePayment(req, user, planCodeRaw) {
  const secret = stripeSecretKey();
  const publishableKey = stripePublishableKey();
  if (!secret || !publishableKey) return { ok: false, error: 'Stripe is not configured.' };

  const offer = getOfferConfig(planCodeRaw);
  if (offer.planCode === 'quick_unlock') {
    const access = await getUserAccessState(user?.id);
    if (access?.quickUnlock?.redeemed) {
      return { ok: false, error: 'The $1 unlock can only be used once per account.' };
    }
  }

  if (offer.mode === 'payment') {
    const customerId = await ensureStripeCustomer(user);
    const params = new URLSearchParams();
    params.set('amount', String(offer.amountCents));
    params.set('currency', stripePriceCurrency());
    params.set('payment_method_types[0]', 'card');
    params.set('description', offer.productName);
    params.set('metadata[user_id]', String(user?.id || '').trim());
    params.set('metadata[plan_code]', offer.planCode);
    if (customerId) params.set('customer', customerId);
    if (user?.email) params.set('receipt_email', String(user.email).trim());

    const resp = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.client_secret || !json?.id) {
      return { ok: false, error: json?.error?.message || 'Could not start payment.' };
    }
    return {
      ok: true,
      mode: 'payment',
      planCode: offer.planCode,
      clientSecret: String(json.client_secret || ''),
      paymentIntentId: String(json.id || ''),
      publishableKey
    };
  }

  const customerId = await ensureStripeCustomer(user);
  const params = new URLSearchParams();
  params.set('customer', customerId);
  params.set('payment_behavior', 'default_incomplete');
  params.set('payment_settings[save_default_payment_method]', 'on_subscription');
  params.set('items[0][price_data][currency]', stripePriceCurrency());
  params.set('items[0][price_data][unit_amount]', String(offer.amountCents));
  params.set('items[0][price_data][product_data][name]', offer.productName);
  params.set('items[0][price_data][product_data][description]', offer.description);
  params.set('items[0][price_data][recurring][interval]', String(offer.recurringInterval || 'month'));
  params.set('metadata[user_id]', String(user?.id || '').trim());
  params.set('metadata[plan_code]', offer.planCode);
  params.set('expand[0]', 'latest_invoice.payment_intent');

  const resp = await fetch('https://api.stripe.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const json = await resp.json().catch(() => ({}));
  const clientSecret = String(json?.latest_invoice?.payment_intent?.client_secret || '').trim();
  if (!resp.ok || !json?.id || !clientSecret) {
    return { ok: false, error: json?.error?.message || 'Could not start subscription.' };
  }
  return {
    ok: true,
    mode: 'subscription',
    planCode: offer.planCode,
    clientSecret,
    subscriptionId: String(json.id || ''),
    publishableKey
  };
}

async function verifyStripePaymentIntent(paymentIntentId, userId) {
  const secret = stripeSecretKey();
  const pid = String(paymentIntentId || '').trim();
  const uid = String(userId || '').trim();
  if (!secret) return { ok: false, error: 'Stripe is not configured.' };
  if (!pid) return { ok: false, error: 'Missing payment intent id.' };

  const resp = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pid)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` }
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, error: json?.error?.message || 'Could not verify payment.' };

  const status = String(json?.status || '').trim().toLowerCase();
  const metadataUserId = String(json?.metadata?.user_id || '').trim();
  const offer = getOfferConfig(String(json?.metadata?.plan_code || 'quick_unlock'));
  if (status !== 'succeeded') return { ok: false, error: 'Payment is not complete yet.' };
  if (metadataUserId && uid && metadataUserId !== uid) return { ok: false, error: 'Payment does not belong to this account.' };

  let rewardKey = `${offer.rewardKeyPrefix}_${pid}`;
  if (offer.planCode === 'quick_unlock') rewardKey = 'stripe_quick_unlock_once';

  await syncUserBillingFields(uid, {
    stripeCustomerId: String(json?.customer || '').trim() || null,
    accessType: offer.planCode,
    subscriptionStatus: 'paid'
  });

  const grant = await grantAccessGrant(uid, {
    source: 'stripe_payment_intent',
    rewardKey,
    days: offer.days,
    amountCents: offer.amountCents,
    meta: {
      planCode: offer.planCode,
      stripePaymentIntentId: pid,
      amountReceived: Number(json?.amount_received || offer.amountCents),
      currency: String(json?.currency || stripePriceCurrency())
    }
  });
  return { ok: true, grant };
}

async function savePaymentMethodFromPayload(userId, payload = {}) {
  const summary = payload && typeof payload === 'object' ? payload : {};
  const paymentType = String(summary.paymentType || 'card').trim().toLowerCase();
  const walletType = summary.walletType ? String(summary.walletType).trim().toLowerCase() : null;
  const brand = summary.brand ? String(summary.brand).trim() : null;
  const last4 = summary.last4 ? String(summary.last4).trim().slice(-4) : null;
  const expMonth = Number(summary.expMonth || 0) || null;
  const expYear = Number(summary.expYear || 0) || null;
  const displayLabel = summary.displayLabel
    ? String(summary.displayLabel).trim()
    : (paymentType === 'apple_pay'
        ? 'Apple Pay'
        : (brand && last4 ? `${brand.toUpperCase()} •••• ${last4}` : null));
  if (!displayLabel && !last4 && paymentType !== 'apple_pay') return null;
  return await saveUserPaymentMethod(userId, {
    paymentType,
    walletType,
    brand,
    last4,
    expMonth,
    expYear,
    displayLabel,
    isDemo: summary.isDemo === true,
    meta: {}
  });
}

async function verifyStripeSubscriptionById(subscriptionId, userId) {
  const secret = stripeSecretKey();
  const subId = String(subscriptionId || '').trim();
  const uid = String(userId || '').trim();
  if (!secret) return { ok: false, error: 'Stripe is not configured.' };
  if (!subId) return { ok: false, error: 'Missing subscription id.' };

  const resp = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` }
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, error: json?.error?.message || 'Could not verify subscription.' };

  const metadataUserId = String(json?.metadata?.user_id || '').trim();
  const offer = getOfferConfig(String(json?.metadata?.plan_code || 'monthly_subscription'));
  const status = String(json?.status || '').trim().toLowerCase();
  if (!['active', 'trialing'].includes(status)) {
    return { ok: false, error: 'Subscription is not active yet.' };
  }
  if (metadataUserId && uid && metadataUserId !== uid) {
    return { ok: false, error: 'Subscription does not belong to this account.' };
  }

  const periodEnd = Number(json?.current_period_end || 0);
  const grantEndsAt = periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : null;
  const subItem = Array.isArray(json?.items?.data) ? json.items.data[0] || null : null;

  await syncUserBillingFields(uid, {
    stripeCustomerId: String(json?.customer || '').trim() || null,
    stripeSubscriptionId: subId,
    stripePriceId: String(subItem?.price?.id || '').trim() || null,
    accessType: offer.planCode,
    accessEndsAt: grantEndsAt,
    subscriptionStatus: status || null
  });

  const grant = await grantAccessGrant(uid, {
    source: 'stripe_subscription',
    rewardKey: `stripe_subscription_${subId}`,
    days: offer.days,
    endsAt: grantEndsAt,
    amountCents: offer.amountCents,
    meta: {
      planCode: offer.planCode,
      stripeSubscriptionId: subId,
      status,
      currentPeriodEnd: grantEndsAt
    }
  });
  if (offer.planCode === 'monthly_subscription') {
    await qualifyReferralFromMonthlyMembership(uid, {
      subscriptionId: subId,
      source: 'stripe_subscription_verify'
    }).catch(() => null);
  }
  return { ok: true, grant };
}

async function confirmInlineAccessPayment(user, payload) {
  const planCode = String(payload?.planCode || 'quick_unlock').trim().toLowerCase();
  const offer = getOfferConfig(planCode);
  if (user?.isDemo) {
    await savePaymentMethodFromPayload(user.id, {
      ...(payload?.savedMethod || {}),
      isDemo: true
    });
    await syncUserBillingFields(user.id, {
      accessType: offer.planCode,
      subscriptionStatus: offer.mode === 'subscription' ? 'active' : 'paid'
    });
    const grant = await grantAccessGrant(user.id, {
      source: 'demo_inline_payment',
      rewardKey: `demo_${offer.planCode}_${Date.now()}`,
      days: offer.days,
      amountCents: offer.amountCents,
      meta: { planCode: offer.planCode, demo: true }
    });
    return { ok: true, grant };
  }
  if (offer.mode === 'subscription') {
    return verifyStripeSubscriptionById(payload?.subscriptionId, user.id);
  }
  return verifyStripePaymentIntent(payload?.paymentIntentId, user.id);
}

async function verifyStripeCheckoutSession(sessionId, userId) {
  const secret = stripeSecretKey();
  const sid = String(sessionId || '').trim();
  const uid = String(userId || '').trim();
  if (!secret) return { ok: false, error: 'Stripe is not configured.' };
  if (!sid) return { ok: false, error: 'Missing session id.' };
  const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secret}`
    }
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, error: json?.error?.message || 'Could not verify Stripe session.' };
  const paid = String(json?.payment_status || '').toLowerCase() === 'paid';
  const metadataUserId = String(json?.metadata?.user_id || '').trim();
  const planCode = String(json?.metadata?.plan_code || 'quick_unlock').trim().toLowerCase();
  const offer = getOfferConfig(planCode);
  if (!paid) return { ok: false, error: 'Payment is not complete yet.' };
  if (metadataUserId && uid && metadataUserId !== uid) return { ok: false, error: 'Checkout session does not belong to this account.' };
  let grantEndsAt = null;
  let rewardKey = `${offer.rewardKeyPrefix}_${sid}`;
  if (offer.planCode === 'quick_unlock') {
    rewardKey = 'stripe_quick_unlock_once';
  }
  if (offer.mode === 'subscription') {
    const subId = String(json?.subscription || '').trim();
    if (!subId) return { ok: false, error: 'Subscription id missing from checkout session.' };
    const subResp = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` }
    });
    const subJson = await subResp.json().catch(() => ({}));
    if (!subResp.ok) return { ok: false, error: subJson?.error?.message || 'Could not verify Stripe subscription.' };
    const periodEnd = Number(subJson?.current_period_end || 0);
    if (periodEnd > 0) grantEndsAt = new Date(periodEnd * 1000).toISOString();
    rewardKey = `stripe_subscription_${subId}`;
    const subItem = Array.isArray(subJson?.items?.data) ? subJson.items.data[0] || null : null;
    await syncUserBillingFields(uid, {
      stripeCustomerId: String(subJson?.customer || json?.customer || '').trim() || null,
      stripeSubscriptionId: subId,
      stripePriceId: String(subItem?.price?.id || '').trim() || null,
      accessType: offer.planCode,
      accessEndsAt: grantEndsAt,
      subscriptionStatus: String(subJson?.status || '').trim() || null
    });
  } else {
    await syncUserBillingFields(uid, {
      stripeCustomerId: String(json?.customer || '').trim() || null,
      accessType: offer.planCode,
      subscriptionStatus: 'paid'
    });
  }
  const grant = await grantAccessGrant(uid, {
    source: offer.mode === 'subscription' ? 'stripe_subscription' : 'stripe_checkout',
    rewardKey,
    days: offer.days,
    endsAt: grantEndsAt,
    amountCents: offer.amountCents,
    meta: {
      planCode: offer.planCode,
      stripeSessionId: sid,
      paymentStatus: json?.payment_status || '',
      amountTotal: Number(json?.amount_total || offer.amountCents),
      days: offer.days
    }
  });
  if (offer.planCode === 'monthly_subscription') {
    await qualifyReferralFromMonthlyMembership(uid, {
      sessionId: sid,
      source: 'stripe_checkout_verify'
    }).catch(() => null);
  }
  return { ok: true, grant };
}

function normalizeReferralCode(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return '';
  if (code.length < 4 || code.length > 24) return '';
  return code;
}

function buildReferralCodeCandidate(userLike, attempt = 0) {
  const source = String(userLike?.username || userLike?.display_name || userLike?.displayName || 'RiseForIt')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const base = (source || 'RiseForIt').slice(0, 10);
  const randomTail = crypto.randomBytes(2 + Math.min(4, Math.max(0, attempt))).toString('hex').toUpperCase();
  return normalizeReferralCode(`${base}${randomTail}`.slice(0, 24));
}

async function ensureReferralCode(userLike) {
  const userId = String(userLike?.id || '').trim();
  if (!userId) return '';
  const existing = await db.query(
    `
      SELECT code
      FROM app_referral_codes
      WHERE user_id = $1
      LIMIT 1;
    `,
    [userId]
  );
  const currentCode = normalizeReferralCode(existing.rows?.[0]?.code);
  if (currentCode) return currentCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = buildReferralCodeCandidate(userLike, attempt);
    if (!candidate) continue;
    try {
      const inserted = await db.query(
        `
          INSERT INTO app_referral_codes (user_id, code, active, updated_at)
          VALUES ($1, $2, true, now())
          ON CONFLICT (user_id) DO UPDATE SET
            code = app_referral_codes.code,
            updated_at = now()
          RETURNING code;
        `,
        [userId, candidate]
      );
      const code = normalizeReferralCode(inserted.rows?.[0]?.code);
      if (code) return code;
    } catch (err) {
      const msg = String(err?.message || '');
      if (!msg.includes('app_referral_codes_code_key')) throw err;
    }
  }

  throw new Error('Could not generate referral code');
}

async function claimReferralForNewUser({ referredUserId, referralCode, source = 'signup_local', req = null } = {}) {
  const userId = String(referredUserId || '').trim();
  const code = normalizeReferralCode(referralCode);
  if (!userId || !code) return { ok: false, reason: 'missing' };

  const referrerResult = await db.query(
    `
      SELECT user_id, code
      FROM app_referral_codes
      WHERE code = $1
        AND active = true
      LIMIT 1;
    `,
    [code]
  );
  const referrer = referrerResult.rows?.[0] || null;
  if (!referrer?.user_id) return { ok: false, reason: 'not_found' };
  if (String(referrer.user_id) === userId) return { ok: false, reason: 'self' };

  const referrerMeta = await db.query(
    `
      SELECT last_ip, last_user_agent_hash
      FROM app_users
      WHERE id = $1
      LIMIT 1;
    `,
    [referrer.user_id]
  );
  const referrerRow = referrerMeta.rows?.[0] || {};
  const signupIp = requestIp(req);
  const signupUaHash = hashUserAgent(req?.headers?.['user-agent']);

  const inserted = await db.query(
    `
      INSERT INTO app_referrals (
        referrer_user_id,
        referred_user_id,
        referral_code,
        source,
        status,
        signed_up_at,
        referred_signup_ip,
        referred_signup_user_agent_hash,
        referrer_signup_ip_snapshot,
        referrer_user_agent_hash_snapshot
      )
      VALUES ($1, $2, $3, $4, 'pending', now(), $5, $6, $7, $8)
      ON CONFLICT (referred_user_id) DO NOTHING
      RETURNING id;
    `,
    [
      referrer.user_id,
      userId,
      code,
      String(source || 'signup_local').slice(0, 80),
      signupIp,
      signupUaHash,
      referrerRow.last_ip || null,
      referrerRow.last_user_agent_hash || null
    ]
  );
  if (inserted.rows?.[0]?.id) {
    await recordTrainerEvent(referrer.user_id, 'referred_signup_completed', {
      subjectUserId: userId,
      metadata: {
        referralCode: code,
        source: String(source || 'signup_local').slice(0, 80)
      }
    }).catch(() => null);
    return { ok: true, referrerUserId: referrer.user_id, code };
  }
  return { ok: false, reason: 'already_claimed' };
}

async function qualifyReferralFromMonthlyMembership(referredUserId, details = {}) {
  const userId = String(referredUserId || '').trim();
  if (!userId) return null;
  const result = await db.query(
    `
      UPDATE app_referrals
      SET status = 'qualified',
          qualified_at = COALESCE(qualified_at, now()),
          qualified_reason = COALESCE(NULLIF(qualified_reason, ''), 'monthly_subscription')
      WHERE referred_user_id = $1
        AND qualified_at IS NULL
      RETURNING id, referrer_user_id, referral_code;
    `,
    [userId]
  ).catch(() => null);
  const row = result?.rows?.[0] || null;
  if (!row?.id) return null;
  await recordTrainerEvent(row.referrer_user_id, 'referred_user_activated', {
    subjectUserId: userId,
    metadata: {
      referralCode: row.referral_code || '',
      trigger: 'monthly_subscription',
      ...cleanObject(details)
    }
  }).catch(() => null);
  await recordTrainerEvent(row.referrer_user_id, 'referral_bonus_earned', {
    subjectUserId: userId,
    metadata: {
      referralCode: row.referral_code || '',
      bonusAmountCents: TRAINER_REFERRAL_BONUS_CENTS,
      status: 'qualified',
      trigger: 'monthly_subscription',
      ...cleanObject(details)
    }
  }).catch(() => null);
  return row;
}

async function getReferralOverview(req, userLike) {
  const userId = String(userLike?.id || '').trim();
  if (!userId) return null;
  const code = await ensureReferralCode(userLike);
  const access = await getUserAccessState(userId);
  const base = resolveAppBaseUrl(req) || '';
  const link = `${base || ''}/index.html?ref=${encodeURIComponent(code)}#signup`;

  const countsResult = await db.query(
    `
      SELECT
        COUNT(*)::int AS signup_count,
        COUNT(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS qualified_count
      FROM app_referrals
      WHERE referrer_user_id = $1;
    `,
    [userId]
  );
  const countsRow = countsResult.rows?.[0] || {};
  const signupCount = Number(countsRow.signup_count || 0);
  const qualifiedCount = Number(countsRow.qualified_count || 0);

  const recentResult = await db.query(
    `
      SELECT
        r.id,
        r.status,
        r.source,
        r.created_at,
        r.signed_up_at,
        r.qualified_at,
        r.qualified_reason,
        r.rejected_reason,
        r.rewarded_at,
        r.reward_key,
        u.username,
        u.display_name,
        u.email
      FROM app_referrals r
      LEFT JOIN app_users u ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = $1
      ORDER BY COALESCE(r.qualified_at, r.signed_up_at, r.created_at) DESC, r.created_at DESC
      LIMIT 8;
    `,
    [userId]
  );

  return {
    ok: true,
    code,
    link,
    goal: access?.referrals?.nextTier?.required || REFERRAL_GOAL_COUNT,
    signupCount,
    qualifiedCount,
    remainingToGoal: Number(access?.referrals?.nextRemainingCount || Math.max(0, REFERRAL_GOAL_COUNT - qualifiedCount)),
    recent: (recentResult.rows || []).map((row) => ({
      id: row.id,
      status: row.rewarded_at
        ? 'rewarded'
        : (row.qualified_at ? 'qualified' : String(row.status || 'pending')),
      source: row.source || '',
      createdAt: row.created_at || null,
      signedUpAt: row.signed_up_at || null,
      qualifiedAt: row.qualified_at || null,
      qualifiedReason: row.qualified_reason || null,
      rejectedReason: row.rejected_reason || null,
      rewardedAt: row.rewarded_at || null,
      rewardKey: row.reward_key || null,
      username: row.username || null,
      displayName: row.display_name || row.username || 'New member',
      email: row.email || null
    })),
    access: access || null
  };
}

function notesHasFlag(adminNotesRaw, flag) {
  const target = String(flag || '').trim().toLowerCase();
  if (!target) return false;
  return String(adminNotesRaw || '')
    .split(/\s+/)
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .includes(target);
}

function setAdminNoteFlag(adminNotesRaw, flag, enabled) {
  const target = String(flag || '').trim().toLowerCase();
  const parts = String(adminNotesRaw || '')
    .split(/\s+/)
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  const next = parts.filter((part) => part.toLowerCase() !== target);
  if (enabled && target) next.push(target);
  return next.join(' ').trim();
}

function cleanShortText(raw, max = 120) {
  return String(raw || '').trim().slice(0, Math.max(0, Number(max) || 0));
}

function cleanLongText(raw, max = 1200) {
  return String(raw || '').trim().slice(0, Math.max(0, Number(max) || 0));
}

function cleanHandle(raw) {
  return cleanShortText(String(raw || '').replace(/^@+/, ''), 80);
}

function cleanBoolean(raw) {
  return raw === true || raw === 'true' || raw === '1' || raw === 1 || raw === 'yes' || raw === 'on';
}

function cleanMoneyAmount(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function cleanStringArray(raw, { maxItems = 14, maxLen = 80 } = {}) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => cleanShortText(item, maxLen))
    .filter(Boolean)
    .slice(0, Math.max(0, Number(maxItems) || 0));
}

function cleanInteger(raw, { min = 0, max = 9999 } = {}) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(Math.round(value), min), max);
}

function cleanUrl(raw, max = 4096) {
  const value = cleanLongText(raw, max);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\//i.test(value)) return value;
  return '';
}

function cleanObject(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function cleanBooleanDefault(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return Boolean(fallback);
  return cleanBoolean(raw);
}

function uniqueStringArray(raw, { maxItems = 14, maxLen = 80 } = {}) {
  return Array.from(new Set(cleanStringArray(raw, { maxItems, maxLen })));
}

function extractHandleFromUrl(raw, hostPattern) {
  const value = cleanUrl(raw, 2048);
  if (!value) return '';
  const match = value.match(hostPattern);
  return cleanHandle(match?.[1] || '');
}

function formatMonthKey(raw) {
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthLabel(raw) {
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function resolveTrainerTier(countRaw) {
  const count = Math.max(0, Number(countRaw || 0));
  if (count >= 20) return { name: 'Elite', min: 20, nextAt: null };
  if (count >= 8) return { name: 'Growth', min: 8, nextAt: 20 };
  if (count >= 3) return { name: 'Builder', min: 3, nextAt: 8 };
  return { name: 'Starter', min: 0, nextAt: 3 };
}

function moneyAmountToCents(raw) {
  const amount = cleanMoneyAmount(raw);
  if (amount == null) return 0;
  return Math.max(0, Math.round(amount * 100));
}

function normalizeInviteType(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'coaching' || value === 'coaching_invite') return 'coaching_invite';
  return 'app_invite';
}

function normalizeBillingFrequency(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'one-time' || value === 'one_time' || value === 'once') return 'one_time';
  if (value === 'monthly' || value === 'month' || value === 'subscription') return 'monthly';
  if (value === 'custom recurring' || value === 'custom_recurring' || value === 'recurring') return 'custom_recurring';
  return '';
}

function buildTrainerStripeReadiness(stripeRaw = {}) {
  const stripe = cleanObject(stripeRaw);
  const accountId = String(stripe.connectedAccountId || stripe.accountId || '').trim();
  const payoutEmail = String(stripe.payoutEmail || '').trim();
  const dashboardUrl = String(stripe.dashboardUrl || '').trim();
  const savedStatus = String(stripe.onboardingState || stripe.status || '').trim().toLowerCase();
  const chargesEnabled = cleanBooleanDefault(stripe.chargesEnabled, false);
  const payoutsEnabled = cleanBooleanDefault(stripe.payoutsEnabled, false);
  const detailsSubmitted = cleanBooleanDefault(stripe.detailsSubmitted, false);
  const currentlyDue = uniqueStringArray(stripe.requirementsCurrentlyDue, { maxItems: 40, maxLen: 120 });
  const pastDue = uniqueStringArray(stripe.requirementsPastDue, { maxItems: 40, maxLen: 120 });
  const hasCriticalRequirements = currentlyDue.length > 0 || pastDue.length > 0;
  const hasAny = Boolean(accountId || payoutEmail || dashboardUrl || savedStatus || detailsSubmitted);
  const ready = Boolean(accountId && chargesEnabled && payoutsEnabled && !hasCriticalRequirements);
  const pending = Boolean(accountId && detailsSubmitted && !chargesEnabled && !payoutsEnabled && !hasCriticalRequirements);
  const state = ready
    ? 'ready'
    : (pending ? 'pending' : (hasAny ? 'incomplete' : 'not_connected'));
  const nextAction = state === 'not_connected'
    ? 'Connect Stripe before sending paid coaching invites.'
    : (state === 'pending'
      ? 'Stripe is reviewing the account before live payments can be accepted.'
      : (state === 'incomplete'
        ? (currentlyDue[0] || pastDue[0] || (!detailsSubmitted
            ? 'Finish Stripe onboarding to submit your account details.'
            : (!chargesEnabled
              ? 'Stripe still needs to enable charges on your account.'
              : (!payoutsEnabled
                ? 'Stripe still needs to enable payouts on your account.'
                : 'Complete the remaining Stripe requirements.'))))
        : ''));
  return {
    state,
    label: state === 'ready'
      ? 'Payments Active'
      : (state === 'pending'
        ? 'Verification pending'
        : (state === 'incomplete' ? 'Finish Setup' : 'Not connected')),
    accountId,
    connectedAccountId: accountId,
    payoutEmail,
    dashboardUrl,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsCurrentlyDue: currentlyDue,
    requirementsPastDue: pastDue,
    nextAction,
    lastCheckedAt: stripe.lastSyncAt || new Date().toISOString()
  };
}

function stripeApiHeaders() {
  return {
    Authorization: `Bearer ${stripeSecretKey()}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
}

async function stripeFormRequest(path, form = null, method = 'POST') {
  const secret = stripeSecretKey();
  if (!secret) throw new Error('Stripe is not configured.');
  const body = form instanceof URLSearchParams ? form.toString() : null;
  const resp = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: stripeApiHeaders(),
    body
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || 'Stripe request failed.');
  }
  return json;
}

async function stripeFormRequestForAccount(path, form = null, method = 'POST', connectedAccountIdRaw = '') {
  const secret = stripeSecretKey();
  if (!secret) throw new Error('Stripe is not configured.');
  const connectedAccountId = String(connectedAccountIdRaw || '').trim();
  if (!connectedAccountId) throw new Error('Stripe connected account is missing.');
  const body = form instanceof URLSearchParams ? form.toString() : null;
  const headers = {
    ...stripeApiHeaders(),
    'Stripe-Account': connectedAccountId
  };
  const resp = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error?.message || 'Stripe request failed.');
  }
  return json;
}

async function createStripeExpressLoginLink(accountIdRaw = '') {
  const accountId = String(accountIdRaw || '').trim();
  if (!accountId) throw new Error('Stripe connected account is missing.');
  const loginLink = await stripeFormRequest(`/v1/accounts/${encodeURIComponent(accountId)}/login_links`, new URLSearchParams(), 'POST');
  return String(loginLink?.url || '').trim();
}

async function ensureStripeConnectedAccountCapabilities(accountIdRaw = '') {
  const accountId = String(accountIdRaw || '').trim();
  if (!accountId) throw new Error('Stripe connected account is missing.');
  const form = new URLSearchParams();
  form.set('capabilities[card_payments][requested]', 'true');
  form.set('capabilities[transfers][requested]', 'true');
  return await stripeFormRequest(`/v1/accounts/${encodeURIComponent(accountId)}`, form, 'POST');
}

async function listStripeCollectionForAccount(basePath, connectedAccountIdRaw = '', limitPerPage = 100, maxItems = 500) {
  const connectedAccountId = String(connectedAccountIdRaw || '').trim();
  if (!connectedAccountId) throw new Error('Stripe connected account is missing.');
  const out = [];
  let startingAfter = '';
  while (out.length < maxItems) {
    const url = new URL(`https://api.stripe.com${basePath}`);
    url.searchParams.set('limit', String(Math.min(limitPerPage, Math.max(1, maxItems - out.length))));
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);
    const json = await stripeFormRequestForAccount(`${url.pathname}${url.search}`, null, 'GET', connectedAccountId);
    const items = Array.isArray(json?.data) ? json.data : [];
    out.push(...items);
    if (!json?.has_more || !items.length) break;
    startingAfter = String(items[items.length - 1]?.id || '').trim();
    if (!startingAfter) break;
  }
  return out;
}

function centsFromStripeAmount(raw) {
  return Math.max(0, Math.round(Number(raw || 0)));
}

function buildStripePaymentRow(charge = {}) {
  const billingDetails = charge?.billing_details && typeof charge.billing_details === 'object'
    ? charge.billing_details
    : {};
  const created = Number(charge?.created || 0);
  return {
    id: String(charge?.id || '').trim(),
    customerName: String(billingDetails.name || charge?.customer_name || '').trim(),
    customerEmail: normalizeEmail(billingDetails.email || charge?.receipt_email || '') || '',
    amountCents: centsFromStripeAmount(charge?.amount),
    currency: String(charge?.currency || '').trim().toLowerCase() || 'usd',
    status: String(charge?.status || '').trim().toLowerCase() || 'pending',
    paid: charge?.paid === true,
    createdAt: created > 0 ? new Date(created * 1000).toISOString() : null,
    description: String(charge?.description || '').trim()
  };
}

function buildStripeTransactionRow(charge = {}) {
  const grossAmountCents = centsFromStripeAmount(charge?.amount);
  const feeAmountCents = Math.max(0, centsFromStripeAmount(charge?.application_fee_amount || 0));
  const netAmountCents = Math.max(0, grossAmountCents - feeAmountCents);
  const status = String(charge?.status || '').trim().toLowerCase();
  const paid = charge?.paid === true && status === 'succeeded';
  const outcome = charge?.outcome && typeof charge.outcome === 'object' ? charge.outcome : {};
  const billingDetails = charge?.billing_details && typeof charge.billing_details === 'object'
    ? charge.billing_details
    : {};
  const metadata = charge?.metadata && typeof charge.metadata === 'object' ? charge.metadata : {};
  const productName = cleanShortText(
    metadata.product_name
    || charge?.description
    || billingDetails.name
    || 'Product',
    160
  );
  return {
    id: String(charge?.id || '').trim(),
    type: paid ? 'Payment' : 'Failed Payment',
    grossAmountCents,
    feeAmountCents,
    netAmountCents: paid ? netAmountCents : null,
    currency: String(charge?.currency || '').trim().toLowerCase() || 'usd',
    productName,
    transactionDate: Number(charge?.created || 0) > 0 ? new Date(Number(charge.created) * 1000).toISOString() : null,
    status: paid ? 'Succeeded' : cleanShortText(outcome?.seller_message || 'Failed', 120)
  };
}

function formatStripeInvoiceStatus(raw) {
  const status = String(raw || '').trim().toLowerCase();
  if (!status) return 'Open';
  if (status === 'paid') return 'Paid';
  if (status === 'open') return 'Open';
  if (status === 'draft') return 'Draft';
  if (status === 'void') return 'Void';
  if (status === 'uncollectible') return 'Failed';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function buildStripeInvoiceRow(invoice = {}) {
  const lines = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  const firstLine = lines[0] && typeof lines[0] === 'object' ? lines[0] : {};
  const customerName = cleanShortText(
    invoice?.customer_name
    || invoice?.account_name
    || invoice?.customer_email
    || firstLine?.description
    || 'Customer',
    160
  );
  const productName = cleanShortText(
    firstLine?.description
    || invoice?.description
    || invoice?.metadata?.product_name
    || 'Product',
    160
  );
  return {
    id: String(invoice?.id || '').trim(),
    invoiceNumber: cleanShortText(invoice?.number || '', 40) || String(invoice?.id || '').trim().slice(-8),
    billedOn: Number(invoice?.created || 0) > 0 ? new Date(Number(invoice.created) * 1000).toISOString() : null,
    client: customerName,
    clientEmail: normalizeEmail(invoice?.customer_email || '') || '',
    productName,
    amountCents: centsFromStripeAmount(invoice?.amount_paid || invoice?.amount_due || invoice?.total || 0),
    currency: String(invoice?.currency || '').trim().toLowerCase() || 'usd',
    status: formatStripeInvoiceStatus(invoice?.status)
  };
}

function buildStripeInvoiceFallbackRow(charge = {}, index = 0) {
  const billingDetails = charge?.billing_details && typeof charge.billing_details === 'object'
    ? charge.billing_details
    : {};
  const metadata = charge?.metadata && typeof charge.metadata === 'object' ? charge.metadata : {};
  const createdTs = Number(charge?.created || 0);
  const createdAt = createdTs > 0 ? new Date(createdTs * 1000).toISOString() : null;
  const chargeId = String(charge?.id || '').trim();
  const paid = charge?.paid === true && String(charge?.status || '').trim().toLowerCase() === 'succeeded';
  return {
    id: chargeId,
    invoiceNumber: cleanShortText(`CHG-${chargeId.slice(-6) || String(index + 1)}`, 40),
    billedOn: createdAt,
    client: cleanShortText(billingDetails.name || charge?.customer_name || 'Customer', 160),
    clientEmail: normalizeEmail(billingDetails.email || charge?.receipt_email || '') || '',
    productName: cleanShortText(
      metadata.product_name
      || charge?.description
      || billingDetails.name
      || 'Product purchase',
      160
    ),
    amountCents: centsFromStripeAmount(charge?.amount),
    currency: String(charge?.currency || '').trim().toLowerCase() || 'usd',
    status: paid ? 'Paid' : 'Failed'
  };
}

function formatTrainerSalePaymentType(product = {}) {
  const paymentType = String(product?.paymentType || '').trim().toLowerCase();
  if (paymentType === 'free') return 'Free';
  if (paymentType === 'one_time') return 'One-time';
  const intervalCount = Math.max(1, Number(product?.billingIntervalCount || 1));
  const intervalUnit = String(product?.billingIntervalUnit || 'month').trim().toLowerCase();
  if (intervalUnit === 'year') return intervalCount === 1 ? 'Annual' : `Every ${intervalCount} years`;
  if (intervalUnit === 'week') return intervalCount === 1 ? 'Weekly' : `Every ${intervalCount} weeks`;
  return intervalCount === 12 ? 'Annual' : (intervalCount === 1 ? 'Recurring' : `Every ${intervalCount} months`);
}

function formatTrainerSaleStatus(orderStatusRaw, subStatusRaw, hasSubscription) {
  const orderStatus = String(orderStatusRaw || '').trim().toLowerCase();
  const subStatus = String(subStatusRaw || '').trim().toLowerCase();
  if (orderStatus === 'completed' && !hasSubscription) return 'Paid';
  if (orderStatus === 'pending') return 'Pending';
  if (orderStatus === 'failed') return 'Failed';
  if (subStatus === 'active' || subStatus === 'trialing') return 'Active';
  if (subStatus === 'past_due' || subStatus === 'unpaid') return 'Failed';
  if (subStatus === 'canceled') return 'Expired';
  if (subStatus === 'incomplete' || subStatus === 'pending') return 'Pending';
  return hasSubscription ? 'Expired' : 'Paid';
}

function addMonthsIso(baseIso, monthsRaw = 1) {
  const base = baseIso ? new Date(baseIso) : null;
  if (!base || Number.isNaN(base.getTime())) return null;
  const next = new Date(base);
  next.setMonth(next.getMonth() + Math.max(1, Number(monthsRaw || 1)));
  return next.toISOString();
}

function buildTrainerSaleRow(row = {}) {
  const product = {
    paymentType: row.payment_type,
    billingIntervalCount: row.billing_interval_count,
    billingIntervalUnit: row.billing_interval_unit
  };
  const dateAdded = row.order_created_at || row.subscription_created_at || row.order_updated_at || row.subscription_updated_at || null;
  const datePaid = row.order_updated_at || row.order_created_at || row.subscription_updated_at || row.subscription_created_at || null;
  const startDate = row.fixed_start_date
    ? new Date(`${row.fixed_start_date}T00:00:00Z`).toISOString()
    : (datePaid || dateAdded);
  const endDate = row.subscription_current_period_end
    || (String(row.duration_type || '').trim().toLowerCase() === 'lasts_for'
      ? addMonthsIso(startDate, row.duration_months)
      : null);
  const nextInvoice = String(row.payment_type || '').trim().toLowerCase() === 'recurring'
    ? row.subscription_current_period_end || null
    : null;
  const clientName = cleanShortText(
    row.client_display_name
    || row.client_email
    || row.client_user_email
    || row.client_user_name
    || 'Customer',
    160
  );
  return {
    saleId: String(row.order_id || row.subscription_id || '').trim(),
    productName: cleanShortText(row.product_name || 'Product', 160),
    client: clientName,
    paymentType: formatTrainerSalePaymentType(product),
    dateAdded,
    datePaid,
    productStart: startDate,
    productEnd: endDate,
    nextInvoice,
    status: formatTrainerSaleStatus(row.order_status, row.subscription_status, Boolean(row.subscription_id))
  };
}

function formatStripeDisputeStatus(raw) {
  const status = String(raw || '').trim().toLowerCase();
  if (!status) return 'Open';
  if (status === 'won') return 'Won';
  if (status === 'lost') return 'Lost';
  if (status === 'warning_needs_response') return 'Warning';
  if (status === 'warning_under_review') return 'Under Review';
  if (status === 'needs_response') return 'Needs Response';
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildStripeDisputeRow(dispute = {}, charge = {}) {
  const billingDetails = charge?.billing_details && typeof charge.billing_details === 'object'
    ? charge.billing_details
    : {};
  const evidence = dispute?.evidence_details && typeof dispute.evidence_details === 'object'
    ? dispute.evidence_details
    : {};
  const disputeCreated = Number(dispute?.created || 0);
  const dueBy = Number(evidence?.due_by || 0);
  return {
    id: String(dispute?.id || '').trim(),
    disputeOn: disputeCreated > 0 ? new Date(disputeCreated * 1000).toISOString() : null,
    respondBy: dueBy > 0 ? new Date(dueBy * 1000).toISOString() : null,
    customerName: cleanShortText(billingDetails.name || charge?.customer_name || 'Customer', 160),
    customerPhone: cleanShortText(billingDetails.phone || charge?.customer_phone || '', 40),
    customerEmail: normalizeEmail(billingDetails.email || charge?.receipt_email || '') || '',
    amountCents: centsFromStripeAmount(dispute?.amount || charge?.amount),
    currency: String(dispute?.currency || charge?.currency || '').trim().toLowerCase() || 'usd',
    invoiceNumber: cleanShortText(charge?.invoice || '', 80),
    reason: cleanShortText(String(dispute?.reason || '').replace(/_/g, ' '), 80),
    status: formatStripeDisputeStatus(dispute?.status)
  };
}

async function getTrainerStripeSummary(actor) {
  const trainerId = String(actor?.id || '').trim();
  const profile = await getTrainerProfile(trainerId);
  const stripeReadiness = buildTrainerStripeReadiness(profile?.stripe || {});
  const connectedAccountId = String(stripeReadiness.connectedAccountId || '').trim();
  console.log('[stripe-summary] request', {
    trainer_id: trainerId,
    stripe_account_id: connectedAccountId || null
  });

  if (!connectedAccountId) {
    const empty = {
      currency: 'usd',
      totalRevenueCents: 0,
      monthlyRevenueCents: 0,
      activeSubscriptionsCount: 0,
      failedPaymentsCount: 0,
      recentPayments: []
    };
    console.log('[stripe-summary] result', { trainer_id: trainerId, stripe_account_id: null, summary: empty });
    return {
      trainerId,
      stripeAccountId: '',
      stripe: stripeReadiness,
      summary: empty
    };
  }

  try {
    const [account, charges, subscriptions] = await Promise.all([
      fetchStripeConnectedAccount(connectedAccountId),
      listStripeCollectionForAccount('/v1/charges', connectedAccountId, 100, 500),
      listStripeCollectionForAccount('/v1/subscriptions?status=all', connectedAccountId, 100, 300)
    ]);

    const successfulCharges = charges.filter((charge) => charge?.paid === true && String(charge?.status || '').trim().toLowerCase() === 'succeeded');
    const failedCharges = charges.filter((charge) => String(charge?.status || '').trim().toLowerCase() === 'failed');
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartMs = monthStart.getTime();

    const totalRevenueCents = successfulCharges.reduce((sum, charge) => sum + centsFromStripeAmount(charge?.amount), 0);
    const monthlyRevenueCents = successfulCharges.reduce((sum, charge) => {
      const createdMs = Number(charge?.created || 0) * 1000;
      if (!createdMs || createdMs < monthStartMs) return sum;
      return sum + centsFromStripeAmount(charge?.amount);
    }, 0);
    const activeSubscriptionsCount = subscriptions.filter((subscription) => {
      const status = String(subscription?.status || '').trim().toLowerCase();
      return status === 'active' || status === 'trialing';
    }).length;
    const recentPayments = successfulCharges
      .sort((a, b) => Number(b?.created || 0) - Number(a?.created || 0))
      .slice(0, 12)
      .map((charge) => buildStripePaymentRow(charge));

    const nextStripe = buildTrainerStripeReadiness({
      ...(profile?.stripe || {}),
      ...(account && typeof account === 'object' ? buildTrainerStripeSyncPayload(account, profile || {}) : {})
    });
    const summary = {
      currency: String(account?.default_currency || recentPayments[0]?.currency || 'usd').trim().toLowerCase() || 'usd',
      totalRevenueCents,
      monthlyRevenueCents,
      activeSubscriptionsCount,
      failedPaymentsCount: failedCharges.length,
      recentPayments
    };
    console.log('[stripe-summary] result', {
      trainer_id: trainerId,
      stripe_account_id: connectedAccountId,
      summary
    });
    return {
      trainerId,
      stripeAccountId: connectedAccountId,
      stripe: nextStripe,
      summary
    };
  } catch (err) {
    console.error('[stripe-summary] error', {
      trainer_id: trainerId,
      stripe_account_id: connectedAccountId,
      error: err?.message || String(err)
    });
    throw err;
  }
}

async function getTrainerStripeDisputes(actor) {
  const trainerId = String(actor?.id || '').trim();
  const profile = await getTrainerProfile(trainerId);
  const stripeReadiness = buildTrainerStripeReadiness(profile?.stripe || {});
  const connectedAccountId = String(stripeReadiness.connectedAccountId || '').trim();

  if (!connectedAccountId) {
    return {
      trainerId,
      stripeAccountId: '',
      stripe: stripeReadiness,
      disputes: []
    };
  }

  try {
    const disputes = await listStripeCollectionForAccount('/v1/disputes', connectedAccountId, 100, 100);
    const chargeIds = Array.from(new Set(
      disputes
        .map((dispute) => String(dispute?.charge || '').trim())
        .filter(Boolean)
    ));
    const chargeMap = new Map();
    await Promise.all(chargeIds.map(async (chargeId) => {
      try {
        const charge = await stripeFormRequestForAccount(`/v1/charges/${encodeURIComponent(chargeId)}`, null, 'GET', connectedAccountId);
        if (charge?.id) chargeMap.set(String(charge.id).trim(), charge);
      } catch {
        // Leave missing charge details blank rather than failing the entire disputes page.
      }
    }));
    return {
      trainerId,
      stripeAccountId: connectedAccountId,
      stripe: stripeReadiness,
      disputes: disputes
        .slice()
        .sort((a, b) => Number(b?.created || 0) - Number(a?.created || 0))
        .map((dispute) => buildStripeDisputeRow(dispute, chargeMap.get(String(dispute?.charge || '').trim()) || {}))
    };
  } catch (err) {
    console.error('[stripe-disputes] error', {
      trainer_id: trainerId,
      stripe_account_id: connectedAccountId,
      error: err?.message || String(err)
    });
    throw err;
  }
}

async function getTrainerStripeTransactions(actor) {
  const trainerId = String(actor?.id || '').trim();
  const profile = await getTrainerProfile(trainerId);
  const stripeReadiness = buildTrainerStripeReadiness(profile?.stripe || {});
  const connectedAccountId = String(stripeReadiness.connectedAccountId || '').trim();

  if (!connectedAccountId) {
    return {
      trainerId,
      stripeAccountId: '',
      stripe: stripeReadiness,
      transactions: []
    };
  }

  try {
    const charges = await listStripeCollectionForAccount('/v1/charges', connectedAccountId, 100, 150);
    return {
      trainerId,
      stripeAccountId: connectedAccountId,
      stripe: stripeReadiness,
      transactions: charges
        .filter((charge) => {
          const status = String(charge?.status || '').trim().toLowerCase();
          return status === 'succeeded' || status === 'failed';
        })
        .slice()
        .sort((a, b) => Number(b?.created || 0) - Number(a?.created || 0))
        .map((charge) => buildStripeTransactionRow(charge))
    };
  } catch (err) {
    console.error('[stripe-transactions] error', {
      trainer_id: trainerId,
      stripe_account_id: connectedAccountId,
      error: err?.message || String(err)
    });
    throw err;
  }
}

async function getTrainerStripeInvoices(actor) {
  const trainerId = String(actor?.id || '').trim();
  const profile = await getTrainerProfile(trainerId);
  const stripeReadiness = buildTrainerStripeReadiness(profile?.stripe || {});
  const connectedAccountId = String(stripeReadiness.connectedAccountId || '').trim();

  if (!connectedAccountId) {
    return {
      trainerId,
      stripeAccountId: '',
      stripe: stripeReadiness,
      invoices: []
    };
  }

  try {
    const [invoices, charges] = await Promise.all([
      listStripeCollectionForAccount('/v1/invoices', connectedAccountId, 100, 150),
      listStripeCollectionForAccount('/v1/charges', connectedAccountId, 100, 150)
    ]);
    const invoiceRows = invoices
      .filter((invoice) => Number(invoice?.total || invoice?.amount_due || invoice?.amount_paid || 0) > 0)
      .map((invoice) => buildStripeInvoiceRow(invoice));
    const fallbackChargeRows = charges
      .filter((charge) => {
        const amount = Number(charge?.amount || 0);
        const status = String(charge?.status || '').trim().toLowerCase();
        return amount > 0 && (status === 'succeeded' || status === 'failed');
      })
      .filter((charge) => !String(charge?.invoice || '').trim())
      .map((charge, index) => buildStripeInvoiceFallbackRow(charge, index));
    return {
      trainerId,
      stripeAccountId: connectedAccountId,
      stripe: stripeReadiness,
      invoices: [...invoiceRows, ...fallbackChargeRows]
        .slice()
        .sort((a, b) => {
          const aTime = a?.billedOn ? new Date(a.billedOn).getTime() : 0;
          const bTime = b?.billedOn ? new Date(b.billedOn).getTime() : 0;
          return bTime - aTime;
        })
    };
  } catch (err) {
    console.error('[stripe-invoices] error', {
      trainer_id: trainerId,
      stripe_account_id: connectedAccountId,
      error: err?.message || String(err)
    });
    throw err;
  }
}

async function getTrainerSales(actor) {
  const trainerId = String(actor?.id || '').trim();
  if (!trainerId) return { trainerId: '', sales: [] };
  const result = await db.query(
    `
      SELECT
        o.id AS order_id,
        o.status AS order_status,
        o.created_at AS order_created_at,
        o.updated_at AS order_updated_at,
        s.id AS subscription_id,
        s.status AS subscription_status,
        s.created_at AS subscription_created_at,
        s.updated_at AS subscription_updated_at,
        s.current_period_end AS subscription_current_period_end,
        p.id AS product_id,
        p.name AS product_name,
        p.payment_type,
        p.billing_interval_count,
        p.billing_interval_unit,
        p.duration_type,
        p.duration_months,
        p.fixed_start_date,
        c.display_name AS client_display_name,
        c.email AS client_email,
        u.display_name AS client_user_name,
        u.email AS client_user_email
      FROM app_trainer_product_orders o
      JOIN app_trainer_products p ON p.id = o.trainer_product_id
      LEFT JOIN app_trainer_product_subscriptions s
        ON s.stripe_subscription_id = o.stripe_subscription_id
      LEFT JOIN app_trainer_clients c
        ON c.linked_user_id = o.client_user_id
       AND c.trainer_user_id = o.trainer_user_id
      LEFT JOIN app_users u
        ON u.id = o.client_user_id
      WHERE o.trainer_user_id = $1
      ORDER BY COALESCE(o.updated_at, o.created_at) DESC;
    `,
    [trainerId]
  );
  return {
    trainerId,
    sales: (Array.isArray(result.rows) ? result.rows : []).map((row) => buildTrainerSaleRow(row))
  };
}

function buildTrainerStripeUrls(req) {
  const base = resolveAppBaseUrl(req) || 'http://localhost:3000';
  const returnUrl = new URL('/trainer-dashboard.html', base);
  returnUrl.searchParams.set('stripe_return', '1');
  const refreshUrl = new URL('/api/stripe/connect/start', base);
  refreshUrl.searchParams.set('retry', '1');
  return {
    base,
    returnUrl: returnUrl.toString(),
    refreshUrl: refreshUrl.toString()
  };
}

function normalizeStripeRequirements(account = {}) {
  const requirements = account?.requirements && typeof account.requirements === 'object'
    ? account.requirements
    : {};
  return {
    currentlyDue: uniqueStringArray(requirements.currently_due, { maxItems: 40, maxLen: 120 }),
    pastDue: uniqueStringArray(requirements.past_due, { maxItems: 40, maxLen: 120 })
  };
}

function buildTrainerStripeSyncPayload(account = {}, profile = null) {
  const normalizedAccountId = cleanShortText(account?.id, 120);
  const email = normalizeEmail(
    account?.email
    || account?.settings?.dashboard?.display_name
    || profile?.email
    || ''
  ) || '';
  const requirements = normalizeStripeRequirements(account);
  const chargesEnabled = Boolean(account?.charges_enabled);
  const payoutsEnabled = Boolean(account?.payouts_enabled);
  const detailsSubmitted = Boolean(account?.details_submitted);
  const onboardingState = normalizedAccountId
    ? ((chargesEnabled && payoutsEnabled && requirements.currentlyDue.length === 0 && requirements.pastDue.length === 0)
      ? 'connected'
      : 'incomplete')
    : 'not_connected';
  return {
    connectedAccountId: normalizedAccountId,
    payoutEmail: email,
    dashboardUrl: 'https://dashboard.stripe.com/',
    status: onboardingState,
    onboardingState,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsCurrentlyDue: requirements.currentlyDue,
    requirementsPastDue: requirements.pastDue,
    lastSyncAt: new Date().toISOString()
  };
}

async function syncTrainerStripeFromAccount(userId, account = null) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const existingProfile = await getTrainerProfile(uid);
  const payload = buildTrainerStripeSyncPayload(account || {}, existingProfile || {});
  const result = await db.query(
    `
      INSERT INTO app_trainer_profiles (
        user_id,
        stripe_account_id,
        stripe_connected_account_id,
        stripe_payout_email,
        stripe_dashboard_url,
        stripe_status,
        stripe_onboarding_state,
        stripe_charges_enabled,
        stripe_payouts_enabled,
        stripe_details_submitted,
        stripe_requirements_currently_due,
        stripe_requirements_past_due,
        stripe_last_sync_at,
        updated_at
      )
      VALUES (
        $1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::timestamptz, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        stripe_account_id = EXCLUDED.stripe_account_id,
        stripe_connected_account_id = EXCLUDED.stripe_connected_account_id,
        stripe_payout_email = EXCLUDED.stripe_payout_email,
        stripe_dashboard_url = EXCLUDED.stripe_dashboard_url,
        stripe_status = EXCLUDED.stripe_status,
        stripe_onboarding_state = EXCLUDED.stripe_onboarding_state,
        stripe_charges_enabled = EXCLUDED.stripe_charges_enabled,
        stripe_payouts_enabled = EXCLUDED.stripe_payouts_enabled,
        stripe_details_submitted = EXCLUDED.stripe_details_submitted,
        stripe_requirements_currently_due = EXCLUDED.stripe_requirements_currently_due,
        stripe_requirements_past_due = EXCLUDED.stripe_requirements_past_due,
        stripe_last_sync_at = EXCLUDED.stripe_last_sync_at,
        updated_at = now()
      RETURNING
        user_id,
        onboarding_completed_at,
        full_name,
        contact_email,
        instagram_handle,
        tiktok_handle,
        brand_positioning,
        client_types,
        ideal_client,
        differentiator,
        online_coaching,
        in_person_training,
        monthly_coaching_price,
        coaching_includes,
        call_days,
        call_time_slots,
        call_timezone,
        stripe_account_id,
        stripe_connected_account_id,
        stripe_payout_email,
        stripe_dashboard_url,
        stripe_status,
        stripe_onboarding_state,
        stripe_charges_enabled,
        stripe_payouts_enabled,
        stripe_details_submitted,
        stripe_requirements_currently_due,
        stripe_requirements_past_due,
        stripe_last_sync_at,
        meta;
    `,
    [
      uid,
      payload.connectedAccountId || '',
      payload.payoutEmail || '',
      payload.dashboardUrl || '',
      payload.status || 'not_connected',
      payload.onboardingState || 'not_connected',
      payload.chargesEnabled,
      payload.payoutsEnabled,
      payload.detailsSubmitted,
      JSON.stringify(payload.requirementsCurrentlyDue || []),
      JSON.stringify(payload.requirementsPastDue || []),
      payload.lastSyncAt || new Date().toISOString()
    ]
  );
  return buildTrainerProfileFromRow(result.rows?.[0] || null);
}

async function getOrCreateTrainerStripeConnectedAccount(actor) {
  const profile = await getTrainerProfile(actor?.id);
  const existingId = cleanShortText(
    profile?.stripe?.connectedAccountId
    || profile?.stripe?.accountId,
    120
  );
  if (existingId) {
    await ensureStripeConnectedAccountCapabilities(existingId).catch(() => null);
    return existingId;
  }
  const form = new URLSearchParams();
  form.set('type', 'express');
  if (normalizeEmail(actor?.email || '')) form.set('email', normalizeEmail(actor.email));
  if (actor?.id) form.set('metadata[trainer_user_id]', String(actor.id));
  if (actor?.username) form.set('metadata[trainer_username]', String(actor.username));
  form.set('capabilities[card_payments][requested]', 'true');
  form.set('capabilities[transfers][requested]', 'true');
  const account = await stripeFormRequest('/v1/accounts', form, 'POST');
  await syncTrainerStripeFromAccount(actor?.id, account);
  return cleanShortText(account?.id, 120);
}

async function fetchStripeConnectedAccount(accountIdRaw) {
  const accountId = cleanShortText(accountIdRaw, 120);
  if (!accountId) throw new Error('Missing Stripe connected account id.');
  return await stripeFormRequest(`/v1/accounts/${encodeURIComponent(accountId)}`, null, 'GET');
}

async function createTrainerStripeOnboardingLink(req, actor, accountId) {
  const urls = buildTrainerStripeUrls(req);
  const form = new URLSearchParams();
  form.set('account', accountId);
  form.set('refresh_url', urls.refreshUrl);
  form.set('return_url', urls.returnUrl);
  form.set('type', 'account_onboarding');
  form.set('collection_options[fields]', 'currently_due');
  const link = await stripeFormRequest('/v1/account_links', form, 'POST');
  if (!String(link?.url || '').trim()) throw new Error('Could not create Stripe onboarding link.');
  return link.url;
}

function buildTrainerReferralLink(req, code) {
  const base = resolveAppBaseUrl(req) || '';
  return `${base || ''}/index.html?ref=${encodeURIComponent(String(code || '').trim())}#signup`;
}

function buildTrainerCoachingInviteLink(req, referralCode, inviteCode) {
  const base = resolveAppBaseUrl(req) || '';
  const url = new URL(`${base || ''}/index.html`, base || 'http://localhost:3000');
  if (referralCode) url.searchParams.set('ref', referralCode);
  if (inviteCode) url.searchParams.set('coachInvite', inviteCode);
  url.hash = 'signup';
  const built = url.toString();
  if (base) return built;
  return built.replace(/^https?:\/\/localhost:3000/i, '');
}

async function createTrainerInviteCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `TI${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const existing = await db.query(
      `
        SELECT 1
        FROM app_trainer_invites
        WHERE invite_code = $1
        LIMIT 1;
      `,
      [code]
    );
    if (!existing.rows?.length) return code;
  }
  throw new Error('Could not generate a trainer invite code.');
}

async function recordTrainerEvent(trainerUserId, eventType, {
  inviteId = null,
  subjectUserId = null,
  metadata = {}
} = {}) {
  const trainerId = String(trainerUserId || '').trim();
  const type = cleanShortText(eventType, 80);
  if (!trainerId || !type) return null;
  await db.query(
    `
      INSERT INTO app_trainer_invite_events (
        trainer_user_id,
        invite_id,
        event_type,
        subject_user_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5::jsonb);
    `,
    [
      trainerId,
      inviteId ? String(inviteId).trim() : null,
      type,
      subjectUserId ? String(subjectUserId).trim() : null,
      JSON.stringify(cleanObject(metadata))
    ]
  );
  return true;
}

async function createTrainerInvite(actor, req, payload = {}, typeRaw = 'app_invite') {
  const trainerUserId = String(actor?.id || '').trim();
  if (!trainerUserId) throw new Error('Trainer required.');
  const inviteType = normalizeInviteType(typeRaw);
  const referralCode = await ensureReferralCode(actor);
  const inviteCode = await createTrainerInviteCode();
  const firstName = cleanShortText(payload.firstName, 80);
  const lastName = cleanShortText(payload.lastName, 80);
  const displayName = cleanShortText(`${firstName} ${lastName}`.trim(), 120);
  const email = normalizeEmail(payload.email || '') || '';
  const phone = normalizePhone(payload.phone || '') || '';
  const packageName = inviteType === 'coaching_invite' ? cleanShortText(payload.packageName, 120) : '';
  const packagePriceCents = inviteType === 'coaching_invite' ? moneyAmountToCents(payload.packagePrice) : 0;
  const billingFrequency = inviteType === 'coaching_invite' ? normalizeBillingFrequency(payload.billingFrequency) : '';
  const startDate = inviteType === 'coaching_invite' ? cleanShortText(payload.startDate, 40) : '';
  const note = cleanLongText(payload.note, 800);
  const stripeReadiness = buildTrainerStripeReadiness((await getTrainerProfile(trainerUserId))?.stripe || {});

  if (inviteType === 'coaching_invite' && packagePriceCents > 0 && stripeReadiness.state !== 'ready') {
    throw new Error(stripeReadiness.nextAction || 'Connect Stripe before sending paid coaching invites.');
  }

  const status = 'sent';
  const paymentStatus = inviteType === 'coaching_invite'
    ? (packagePriceCents > 0 ? 'pending' : 'active')
    : 'not_applicable';
  const result = await db.query(
    `
      INSERT INTO app_trainer_invites (
        trainer_user_id,
        invite_type,
        invite_code,
        linked_referral_code,
        email,
        phone,
        first_name,
        last_name,
        package_name,
        package_price_cents,
        billing_frequency,
        start_date,
        note,
        status,
        payment_status,
        meta
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULLIF($12, '')::date, $13, $14, $15, $16::jsonb)
      RETURNING *;
    `,
    [
      trainerUserId,
      inviteType,
      inviteCode,
      referralCode,
      email || null,
      phone || null,
      firstName,
      lastName,
      packageName,
      packagePriceCents,
      billingFrequency,
      startDate,
      note,
      status,
      paymentStatus,
      JSON.stringify({
        displayName,
        inviteByEmail: email || null,
        inviteBySms: phone || null
      })
    ]
  );
  const invite = result.rows?.[0] || null;
  if (inviteType === 'coaching_invite') {
    await addTrainerClient(actor, {
      displayName: displayName || email || 'Coaching client',
      email,
      phone,
      notes: [packageName, note].filter(Boolean).join(' - '),
      source: 'coaching_invite',
      status: 'invited'
    }).catch(() => null);
  }
  await recordTrainerEvent(trainerUserId, inviteType === 'coaching_invite' ? 'trainer_coaching_invite_sent' : 'trainer_app_invite_sent', {
    inviteId: invite?.id || null,
    metadata: {
      email: email || null,
      phone: phone || null,
      packageName,
      packagePriceCents
    }
  });
  return {
    invite,
    referralCode,
    referralLink: buildTrainerReferralLink(req, referralCode),
    coachingInviteLink: buildTrainerCoachingInviteLink(req, referralCode, inviteCode)
  };
}

async function findTrainerInviteByCode(inviteCodeRaw) {
  const inviteCode = cleanShortText(inviteCodeRaw, 120);
  if (!inviteCode) return null;
  const result = await db.query(
    `
      SELECT *
      FROM app_trainer_invites
      WHERE invite_code = $1
      LIMIT 1;
    `,
    [inviteCode]
  );
  return result.rows?.[0] || null;
}

async function attachCoachingSignupToTrainerInvite({ inviteCode, user, req } = {}) {
  const invite = await findTrainerInviteByCode(inviteCode);
  if (!invite?.id || String(invite.invite_type || '') !== 'coaching_invite') return { ok: false, reason: 'not_found' };
  const userId = String(user?.id || '').trim();
  if (!userId) return { ok: false, reason: 'missing_user' };
  await db.query(
    `
      UPDATE app_trainer_invites
      SET linked_user_id = $2,
          accepted_at = now(),
          status = 'signed_up',
          payment_status = CASE
            WHEN COALESCE(package_price_cents, 0) > 0 THEN 'ready_to_collect'
            ELSE 'active'
          END,
          last_event_at = now(),
          updated_at = now()
      WHERE id = $1;
    `,
    [invite.id, userId]
  );
  await db.query(
    `
      UPDATE app_trainer_clients
      SET linked_user_id = $3,
          status = CASE
            WHEN EXISTS (
              SELECT 1 FROM app_trainer_invites ti
              WHERE ti.id = $1
                AND COALESCE(ti.package_price_cents, 0) > 0
            ) THEN 'payment_pending'
            ELSE 'active'
          END,
          updated_at = now()
      WHERE trainer_user_id = $2
        AND LOWER(COALESCE(email, '')) = LOWER($4);
    `,
    [invite.id, invite.trainer_user_id, userId, String(user?.email || invite.email || '').trim()]
  );
  await recordTrainerEvent(invite.trainer_user_id, 'coaching_signup_completed', {
    inviteId: invite.id,
    subjectUserId: userId,
    metadata: {
      inviteCode: invite.invite_code,
      source: 'signup'
    }
  });
  return { ok: true, invite };
}

async function getTrainerGrowthSnapshot(req, userLike, trainerProfile = null) {
  const uid = String(userLike?.id || '').trim();
  if (!uid) return null;
  const profile = trainerProfile || await getTrainerProfile(uid);
  const stripe = buildTrainerStripeReadiness(profile?.stripe || {});
  const referralCode = await ensureReferralCode(userLike);
  const referralLink = buildTrainerReferralLink(req, referralCode);

  const summaryResult = await db.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE invite_type = 'app_invite')::int AS app_invites_sent,
        COUNT(*) FILTER (WHERE invite_type = 'coaching_invite')::int AS coaching_invites_sent,
        COUNT(*) FILTER (WHERE invite_type = 'coaching_invite' AND linked_user_id IS NOT NULL)::int AS coaching_signups,
        COUNT(*) FILTER (WHERE invite_type = 'coaching_invite' AND status IN ('signed_up', 'active'))::int AS coaching_clients_total,
        COUNT(*) FILTER (WHERE invite_type = 'coaching_invite' AND payment_status = 'failed')::int AS failed_payments,
        COUNT(*) FILTER (WHERE invite_type = 'coaching_invite' AND billing_frequency IN ('monthly', 'custom_recurring') AND linked_user_id IS NOT NULL)::int AS paid_subscriptions,
        COALESCE(SUM(CASE
          WHEN invite_type = 'coaching_invite'
           AND payment_status IN ('ready_to_collect', 'active')
          THEN package_price_cents
          ELSE 0
        END), 0)::bigint AS coaching_lifetime_cents,
        COALESCE(SUM(CASE
          WHEN invite_type = 'coaching_invite'
           AND payment_status IN ('ready_to_collect', 'active')
           AND date_trunc('month', COALESCE(accepted_at, created_at)) = date_trunc('month', now())
          THEN package_price_cents
          ELSE 0
        END), 0)::bigint AS coaching_month_cents
      FROM app_trainer_invites
      WHERE trainer_user_id = $1;
    `,
    [uid]
  );

  const eventsResult = await db.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'trainer_profile_view')::int AS profile_clicks,
        COUNT(*) FILTER (WHERE event_type = 'trainer_referral_link_copied')::int AS link_copies
      FROM app_trainer_invite_events
      WHERE trainer_user_id = $1;
    `,
    [uid]
  );

  const referralsResult = await db.query(
    `
      SELECT
        COUNT(*)::int AS regular_signups,
        COUNT(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS activated_users,
        COUNT(*) FILTER (WHERE rewarded_at IS NOT NULL)::int AS paid_bonus_users
      FROM app_referrals
      WHERE referrer_user_id = $1;
    `,
    [uid]
  );

  const referredUsersResult = await db.query(
    `
      SELECT
        r.id,
        r.status,
        r.created_at,
        r.signed_up_at,
        r.qualified_at,
        r.rewarded_at,
        u.display_name,
        u.email
      FROM app_referrals r
      LEFT JOIN app_users u ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = $1
      ORDER BY COALESCE(r.signed_up_at, r.created_at) DESC
      LIMIT 100;
    `,
    [uid]
  );

  const coachingClientsResult = await db.query(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        package_name,
        package_price_cents,
        billing_frequency,
        created_at,
        accepted_at,
        status,
        payment_status
      FROM app_trainer_invites
      WHERE trainer_user_id = $1
        AND invite_type = 'coaching_invite'
      ORDER BY created_at DESC
      LIMIT 100;
    `,
    [uid]
  );

  const clientActivity = await (async () => {
    try {
      const rosterResult = await db.query(
        `
          WITH roster AS (
            SELECT
              'coaching'::text AS source_type,
              ti.id::text AS source_id,
              ti.linked_user_id,
              COALESCE(NULLIF(BTRIM(CONCAT(COALESCE(ti.first_name, ''), ' ', COALESCE(ti.last_name, ''))), ''), ti.email, 'Client') AS display_name,
              ti.email,
              ti.package_name,
              ti.package_price_cents,
              ti.billing_frequency,
              COALESCE(ti.payment_status, ti.status, 'pending') AS payment_status,
              COALESCE(ti.accepted_at, ti.created_at) AS joined_at
            FROM app_trainer_invites ti
            WHERE ti.trainer_user_id = $1
              AND ti.invite_type = 'coaching_invite'
            UNION ALL
            SELECT
              'manual'::text AS source_type,
              c.id::text AS source_id,
              c.linked_user_id,
              c.display_name,
              c.email,
              ''::text AS package_name,
              0::bigint AS package_price_cents,
              ''::text AS billing_frequency,
              c.status AS payment_status,
              c.created_at AS joined_at
            FROM app_trainer_clients c
            WHERE c.trainer_user_id = $1
              AND c.status <> 'removed'
          ),
          deduped AS (
            SELECT DISTINCT ON (
              COALESCE(linked_user_id::text, LOWER(COALESCE(email, '')), CONCAT(source_type, ':', source_id))
            )
              source_type,
              source_id,
              linked_user_id,
              display_name,
              email,
              package_name,
              package_price_cents,
              billing_frequency,
              payment_status,
              joined_at
            FROM roster
            ORDER BY
              COALESCE(linked_user_id::text, LOWER(COALESCE(email, '')), CONCAT(source_type, ':', source_id)),
              CASE WHEN source_type = 'coaching' THEN 0 ELSE 1 END,
              joined_at DESC
          )
          SELECT
            source_type,
            source_id,
            linked_user_id,
            display_name,
            email,
            package_name,
            package_price_cents,
            billing_frequency,
            payment_status,
            joined_at
          FROM deduped
          ORDER BY joined_at DESC NULLS LAST, display_name ASC;
        `,
        [uid]
      );

      const roster = (rosterResult.rows || []).map((row) => ({
        id: `${row.source_type}:${row.source_id}`,
        source: row.source_type || 'manual',
        linkedUserId: row.linked_user_id || null,
        name: cleanShortText(row.display_name || row.email || 'Client', 120),
        email: row.email || '',
        packageName: row.package_name || '',
        packagePriceCents: Number(row.package_price_cents || 0),
        billingFrequency: row.billing_frequency || '',
        paymentStatus: row.payment_status || 'pending',
        joinedAt: row.joined_at || null
      }));

      const linkedIds = Array.from(new Set(
        roster
          .map((item) => String(item.linkedUserId || '').trim())
          .filter(Boolean)
      ));

      if (!linkedIds.length) {
        return {
          clientRoster: roster,
          warnings: []
        };
      }

      const healthResult = await db.query(
        `
          SELECT
            u.id,
            u.display_name,
            u.email,
            dc.day AS checkin_day,
            dc.data AS checkin_data,
            EXISTS (
              SELECT 1
              FROM app_training_workouts tw
              WHERE tw.user_id = u.id
                AND COALESCE(tw.performed_at::date, tw.created_at::date) = CURRENT_DATE
            ) AS worked_out_today
          FROM app_users u
          LEFT JOIN app_daily_checkins dc
            ON dc.user_id = u.id
           AND dc.day = CURRENT_DATE
          WHERE u.id = ANY($1::uuid[]);
        `,
        [linkedIds]
      );

      const healthByUserId = new Map();
      (healthResult.rows || []).forEach((row) => {
        healthByUserId.set(String(row.id || ''), row);
      });

      const warnings = roster.flatMap((client) => {
        const userId = String(client.linkedUserId || '').trim();
        if (!userId) return [];
        const health = healthByUserId.get(userId);
        if (!health) return [];
        const issues = [];
        const checkinData = health.checkin_data && typeof health.checkin_data === 'object'
          ? health.checkin_data
          : {};
        const meals = Array.isArray(checkinData.meals) ? checkinData.meals : [];
        const calories = Number(checkinData?.macros?.calories);
        const waterOz = Number(checkinData?.waterOz);
        const mealPrep = String(checkinData?.mealPrep || '').trim().toLowerCase();
        const mealsOnPlan = String(checkinData?.mealsOnPlan || '').trim().toLowerCase();

        if (!health.worked_out_today) issues.push('No workout today');
        if (!health.checkin_day) {
          issues.push('No check-in today');
        } else {
          if (!meals.length && !(Number.isFinite(calories) && calories > 0)) issues.push('No meals tracked');
          if (!(Number.isFinite(waterOz) && waterOz > 0)) issues.push('No water tracked');
          if (!mealsOnPlan) {
            issues.push('Meals on plan not logged');
          } else if (mealsOnPlan === 'no') {
            issues.push('Meals on plan marked no');
          }
          if (mealPrep === 'no') issues.push('Meal prep marked no');
        }

        if (!issues.length) return [];
        return [{
          clientId: client.id,
          linkedUserId: client.linkedUserId,
          name: client.name,
          email: client.email || health.email || '',
          packageName: client.packageName || '',
          packagePriceCents: client.packagePriceCents,
          billingFrequency: client.billingFrequency || '',
          paymentStatus: client.paymentStatus || 'pending',
          issues: issues.slice(0, 4)
        }];
      });

      return {
        clientRoster: roster,
        warnings
      };
    } catch {
      return {
        clientRoster: [],
        warnings: []
      };
    }
  })();

  const summary = summaryResult.rows?.[0] || {};
  const events = eventsResult.rows?.[0] || {};
  const referrals = referralsResult.rows?.[0] || {};
  const regularSignups = Number(referrals.regular_signups || 0);
  const coachingSignups = Number(summary.coaching_signups || 0);
  const totalInviteLinksSent = Number(summary.app_invites_sent || 0) + Number(summary.coaching_invites_sent || 0);
  const totalSignups = regularSignups + coachingSignups;
  const activatedUsers = Number(referrals.activated_users || 0);
  const paidBonusUsers = Number(referrals.paid_bonus_users || 0);
  const pendingUsers = Math.max(0, regularSignups - activatedUsers);
  const qualifiedBonusCents = activatedUsers * TRAINER_REFERRAL_BONUS_CENTS;
  const paidBonusCents = paidBonusUsers * TRAINER_REFERRAL_BONUS_CENTS;
  const pendingBonusCents = pendingUsers * TRAINER_REFERRAL_BONUS_CENTS;

  return {
    stripe,
    inviteCenter: {
      referralCode,
      referralLink
    },
    performance: {
      profileClicks: Number(events.profile_clicks || 0),
      regularSignups,
      coachingSignups,
      inviteLinksSent: totalInviteLinksSent,
      conversionRate: totalInviteLinksSent > 0 ? Number(((totalSignups / totalInviteLinksSent) * 100).toFixed(1)) : 0
    },
    coaching: {
      activeClients: Number(summary.coaching_clients_total || 0),
      totalCoachingSignups: coachingSignups,
      monthlyRevenueCents: Number(summary.coaching_month_cents || 0),
      lifetimeRevenueCents: Number(summary.coaching_lifetime_cents || 0),
      paidSubscriptions: Number(summary.paid_subscriptions || 0),
      failedPayments: Number(summary.failed_payments || 0)
    },
    bonus: {
      bonusAmountCents: TRAINER_REFERRAL_BONUS_CENTS,
      triggerRule: TRAINER_REFERRAL_BONUS_TRIGGER_RULE,
      activatedUsers,
      qualifiedUsers: activatedUsers,
      pendingUsers,
      paidUsers: paidBonusUsers,
      earnedCents: qualifiedBonusCents,
      pendingCents: pendingBonusCents,
      paidOutCents: paidBonusCents
    },
    earnings: {
      coachingRevenueCents: Number(summary.coaching_lifetime_cents || 0),
      referralBonusCents: qualifiedBonusCents,
      totalEarningsCents: Number(summary.coaching_lifetime_cents || 0) + qualifiedBonusCents
    },
    referredUsers: (referredUsersResult.rows || []).map((row) => ({
      id: row.id,
      name: row.display_name || row.email || 'Member',
      email: row.email || '',
      signupDate: row.signed_up_at || row.created_at || null,
      activationStatus: row.qualified_at ? 'activated' : 'pending',
      bonusStatus: row.rewarded_at ? 'paid' : (row.qualified_at ? 'qualified' : 'pending')
    })),
    coachingClients: (coachingClientsResult.rows || []).map((row) => ({
      id: row.id,
      name: cleanShortText(`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email || 'Client', 120),
      email: row.email || '',
      packageName: row.package_name || '',
      signupDate: row.accepted_at || row.created_at || null,
      paymentStatus: row.payment_status || row.status || 'pending',
      revenueCents: Number(row.package_price_cents || 0)
    })),
    clientRoster: Array.isArray(clientActivity.clientRoster) ? clientActivity.clientRoster : [],
    warnings: Array.isArray(clientActivity.warnings) ? clientActivity.warnings : []
  };
}

async function syncUserAdminFlag(userId, flag, enabled) {
  const uid = String(userId || '').trim();
  const target = String(flag || '').trim().toLowerCase();
  if (!uid || !target) return null;
  const result = await db.query(
    `
      UPDATE app_users
      SET admin_notes = $2,
          updated_at = now()
      WHERE id = $1
      RETURNING id, username, email, display_name, COALESCE(admin_notes, '') AS admin_notes;
    `,
    [
      uid,
      setAdminNoteFlag(
        (
          await db.query('SELECT COALESCE(admin_notes, \'\') AS admin_notes FROM app_users WHERE id = $1 LIMIT 1;', [uid])
        ).rows?.[0]?.admin_notes || '',
        target,
        enabled
      )
    ]
  );
  return result.rows?.[0] || null;
}

function normalizeTrainerMeta(payload = {}) {
  const coachBadgeType = uniqueStringArray(
    Array.isArray(payload.coachBadgeType) ? payload.coachBadgeType : [payload.coachBadgeType],
    { maxItems: 2, maxLen: 40 }
  );
  const coachCustomTags = uniqueStringArray(Array.isArray(payload.coachCustomTags) ? payload.coachCustomTags : [], {
    maxItems: 6,
    maxLen: 40
  });
  const specialtyClients = uniqueStringArray(Array.isArray(payload.specialtyClients) ? payload.specialtyClients : [], {
    maxItems: 12,
    maxLen: 80
  });
  const specialtyClientsCustom = uniqueStringArray(Array.isArray(payload.specialtyClientsCustom) ? payload.specialtyClientsCustom : [], {
    maxItems: 8,
    maxLen: 80
  });
  const includedItems = uniqueStringArray(Array.isArray(payload.includedItems) ? payload.includedItems : [], {
    maxItems: 16,
    maxLen: 120
  });
  const includedItemsCustom = uniqueStringArray(Array.isArray(payload.includedItemsCustom) ? payload.includedItemsCustom : [], {
    maxItems: 10,
    maxLen: 120
  });
  const transformations = (Array.isArray(payload.results) ? payload.results : [])
    .map((item) => {
      const next = cleanObject(item);
      return {
        result: cleanLongText(next.result, 140),
        person: cleanShortText(next.person, 80),
        timeline: cleanShortText(next.timeline, 80),
        copy: cleanLongText(next.copy, 480),
        beforeImage: cleanUrl(next.beforeImage, 4096),
        afterImage: cleanUrl(next.afterImage, 4096)
      };
    })
    .filter((item) => item.result || item.person || item.beforeImage || item.afterImage || item.copy)
    .slice(0, 12);
  const rawDayWindows = cleanObject(payload.dayWindows);
  const dayWindows = {};
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach((day) => {
    dayWindows[day] = uniqueStringArray(Array.isArray(rawDayWindows[day]) ? rawDayWindows[day] : [], {
      maxItems: 8,
      maxLen: 80
    });
  });
  return {
    displayName: cleanShortText(payload.displayName, 120),
    publicHandle: cleanHandle(payload.publicHandle),
    photoDataUrl: cleanUrl(payload.photoDataUrl, 2_000_000),
    reviewStatus: cleanShortText(payload.reviewStatus, 20),
    reviewSubmittedAt: cleanShortText(payload.reviewSubmittedAt, 80),
    reviewDecisionStatus: cleanShortText(payload.reviewDecisionStatus, 20),
    reviewDecisionReason: cleanLongText(payload.reviewDecisionReason, 800),
    reviewDecisionAt: cleanShortText(payload.reviewDecisionAt, 80),
    reviewDecisionSeenAt: cleanShortText(payload.reviewDecisionSeenAt, 80),
    reviewNeedsResubmission: cleanBooleanDefault(payload.reviewNeedsResubmission, false),
    coachBadgeType,
    coachCustomTags,
    topSectionLabel: cleanShortText(payload.topSectionLabel, 140),
    heroHeadline: cleanLongText(payload.heroHeadline, 240),
    heroSubheadline: cleanLongText(payload.heroSubheadline, 320),
    city: cleanShortText(payload.city, 80),
    state: cleanShortText(payload.state, 80),
    coachingFormat: cleanShortText(payload.coachingFormat, 40),
    yearsCoaching: cleanInteger(payload.yearsCoaching, { min: 0, max: 80 }),
    activeClients: cleanInteger(payload.activeClients, { min: 0, max: 50000 }),
    bookingEnabled: cleanBooleanDefault(payload.bookingEnabled, true),
    consultationLengthMinutes: cleanInteger(payload.consultationLength || payload.consultationLengthMinutes, { min: 5, max: 180 }),
    dateRangeDays: cleanInteger(payload.dateRangeDays, { min: 1, max: 60 }),
    maxConsultsPerDay: cleanInteger(payload.maxConsultsPerDay, { min: 1, max: 20 }),
    bufferMinutes: cleanInteger(payload.bufferMinutes, { min: 0, max: 120 }),
    bookingNoticeHours: cleanInteger(payload.bookingNoticeHours, { min: 0, max: 168 }),
    bookingApprovalMode: cleanShortText(payload.bookingApprovalMode, 20) || 'manual',
    bookingCtaText: cleanLongText(payload.bookingCtaText, 160),
    bookingUrgency: cleanLongText(payload.bookingUrgency, 160),
    dayWindows,
    transformations,
    specialtyClients,
    specialtyClientsCustom,
    includedItems,
    includedItemsCustom,
    bio: cleanLongText(payload.coachBio || payload.bio, 2400),
    coachingPhilosophy: cleanLongText(payload.coachingPhilosophy, 1600),
    instagramUrl: cleanUrl(payload.instagramUrl, 2048),
    tiktokUrl: cleanUrl(payload.tiktokUrl, 2048),
    linkedinUrl: cleanUrl(payload.linkedinUrl, 2048),
    youtubeUrl: cleanUrl(payload.youtubeUrl, 2048),
    websiteUrl: cleanUrl(payload.websiteUrl, 2048),
    accentColor: /^#[0-9a-f]{6}$/i.test(String(payload.accentColor || '').trim()) ? String(payload.accentColor).trim() : '',
    priceRangeLabel: cleanLongText(payload.priceRangeLabel, 120),
    sectionOrder: uniqueStringArray(Array.isArray(payload.sectionOrder) ? payload.sectionOrder : [], {
      maxItems: 12,
      maxLen: 60
    }),
    showPricePublic: cleanBooleanDefault(payload.showPricePublic, true),
    showClientsPublic: cleanBooleanDefault(payload.showClientsPublic, true),
    showYearsPublic: cleanBooleanDefault(payload.showYearsPublic, true),
    showBookingPublic: cleanBooleanDefault(payload.showBookingPublic, true),
    showResultsPublic: cleanBooleanDefault(payload.showResultsPublic, true)
  };
}

function applyTrainerMetaToProfile(baseProfile, metaRaw = {}) {
  const meta = cleanObject(metaRaw);
  const reviewNotice = buildTrainerReviewNotice(meta);
  return {
    ...baseProfile,
    displayName: meta.displayName || baseProfile.displayName || baseProfile.fullName || '',
    publicHandle: meta.publicHandle || baseProfile.publicHandle || '',
    photoDataUrl: meta.photoDataUrl || baseProfile.photoDataUrl || '',
    reviewStatus: String(meta.reviewStatus || baseProfile.reviewStatus || '').trim(),
    reviewSubmittedAt: String(meta.reviewSubmittedAt || '').trim(),
    reviewDecisionStatus: String(meta.reviewDecisionStatus || '').trim(),
    reviewDecisionReason: String(meta.reviewDecisionReason || '').trim(),
    reviewDecisionAt: String(meta.reviewDecisionAt || '').trim(),
    reviewDecisionSeenAt: String(meta.reviewDecisionSeenAt || '').trim(),
    reviewNeedsResubmission: meta.reviewNeedsResubmission === true,
    reviewNotice,
    coachBadgeType: Array.isArray(meta.coachBadgeType) ? meta.coachBadgeType : [],
    coachCustomTags: Array.isArray(meta.coachCustomTags) ? meta.coachCustomTags : [],
    topSectionLabel: meta.topSectionLabel || '',
    heroHeadline: meta.heroHeadline || '',
    heroSubheadline: meta.heroSubheadline || '',
    city: meta.city || '',
    state: meta.state || '',
    priceRangeLabel: String(meta.priceRangeLabel || baseProfile.priceRangeLabel || '').trim(),
    coachingFormat: meta.coachingFormat || '',
    yearsCoaching: Number.isFinite(Number(meta.yearsCoaching)) ? Number(meta.yearsCoaching) : null,
    activeClients: Number.isFinite(Number(meta.activeClients)) ? Number(meta.activeClients) : null,
    bookingEnabled: meta.bookingEnabled !== false,
    consultationLengthMinutes: Number.isFinite(Number(meta.consultationLengthMinutes)) ? Number(meta.consultationLengthMinutes) : null,
    dateRangeDays: Number.isFinite(Number(meta.dateRangeDays)) ? Number(meta.dateRangeDays) : null,
    maxConsultsPerDay: Number.isFinite(Number(meta.maxConsultsPerDay)) ? Number(meta.maxConsultsPerDay) : null,
    bufferMinutes: Number.isFinite(Number(meta.bufferMinutes)) ? Number(meta.bufferMinutes) : null,
    bookingNoticeHours: Number.isFinite(Number(meta.bookingNoticeHours)) ? Number(meta.bookingNoticeHours) : null,
    bookingApprovalMode: String(meta.bookingApprovalMode || '').trim() || 'manual',
    bookingCtaText: String(meta.bookingCtaText || '').trim(),
    bookingUrgency: String(meta.bookingUrgency || '').trim(),
    specialtyClients: Array.isArray(meta.specialtyClients) ? meta.specialtyClients : [],
    specialtyClientsCustom: Array.isArray(meta.specialtyClientsCustom) ? meta.specialtyClientsCustom : [],
    includedItems: Array.isArray(meta.includedItems) ? meta.includedItems : [],
    includedItemsCustom: Array.isArray(meta.includedItemsCustom) ? meta.includedItemsCustom : [],
    transformations: Array.isArray(meta.transformations) ? meta.transformations : [],
    bio: String(meta.bio || '').trim(),
    coachingPhilosophy: String(meta.coachingPhilosophy || '').trim(),
    instagramUrl: String(meta.instagramUrl || '').trim(),
    tiktokUrl: String(meta.tiktokUrl || '').trim(),
    linkedinUrl: String(meta.linkedinUrl || '').trim(),
    youtubeUrl: String(meta.youtubeUrl || '').trim(),
    websiteUrl: String(meta.websiteUrl || '').trim(),
    accentColor: String(meta.accentColor || '').trim(),
    sectionOrder: Array.isArray(meta.sectionOrder) ? meta.sectionOrder : [],
    showPricePublic: meta.showPricePublic !== false,
    showClientsPublic: meta.showClientsPublic !== false,
    showYearsPublic: meta.showYearsPublic !== false,
    showBookingPublic: meta.showBookingPublic !== false,
    showResultsPublic: meta.showResultsPublic !== false,
    availability: {
      ...(baseProfile.availability || {}),
      dayWindows: cleanObject(meta.dayWindows)
    },
    meta
  };
}

function buildTrainerProfileFromRow(row) {
  if (!row) return null;
  const baseProfile = {
    active: true,
    onboarded: Boolean(row.onboarding_completed_at),
    onboardingCompletedAt: row.onboarding_completed_at || null,
    fullName: row.full_name || '',
    email: row.contact_email || '',
    instagramHandle: row.instagram_handle || '',
    tiktokHandle: row.tiktok_handle || '',
    brandPositioning: row.brand_positioning || '',
    clientTypes: row.client_types || '',
    idealClient: row.ideal_client || '',
    differentiator: row.differentiator || '',
    offer: {
      onlineCoaching: Boolean(row.online_coaching),
      inPersonTraining: Boolean(row.in_person_training),
      monthlyCoachingPrice: row.monthly_coaching_price == null ? null : Number(row.monthly_coaching_price),
      included: row.coaching_includes || ''
    },
    availability: {
      daysAvailable: Array.isArray(row.call_days) ? row.call_days : [],
      timeSlotsAvailable: Array.isArray(row.call_time_slots) ? row.call_time_slots : [],
      timeZone: row.call_timezone || ''
    },
    stripe: {
      status: row.stripe_status || 'not_connected',
      onboardingState: row.stripe_onboarding_state || row.stripe_status || 'not_connected',
      accountId: row.stripe_connected_account_id || row.stripe_account_id || '',
      connectedAccountId: row.stripe_connected_account_id || row.stripe_account_id || '',
      payoutEmail: row.stripe_payout_email || '',
      dashboardUrl: row.stripe_dashboard_url || '',
      chargesEnabled: Boolean(row.stripe_charges_enabled),
      payoutsEnabled: Boolean(row.stripe_payouts_enabled),
      detailsSubmitted: Boolean(row.stripe_details_submitted),
      requirementsCurrentlyDue: Array.isArray(row.stripe_requirements_currently_due) ? row.stripe_requirements_currently_due : [],
      requirementsPastDue: Array.isArray(row.stripe_requirements_past_due) ? row.stripe_requirements_past_due : [],
      lastSyncAt: row.stripe_last_sync_at || null
    },
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {}
  };
  return applyTrainerMetaToProfile(baseProfile, row.meta);
}

async function getTrainerProfile(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const result = await db.query(
    `
      SELECT
        user_id,
        onboarding_completed_at,
        full_name,
        contact_email,
        instagram_handle,
        tiktok_handle,
        brand_positioning,
        client_types,
        ideal_client,
        differentiator,
        online_coaching,
        in_person_training,
        monthly_coaching_price,
        coaching_includes,
        call_days,
        call_time_slots,
        call_timezone,
        stripe_account_id,
        stripe_connected_account_id,
        stripe_payout_email,
        stripe_dashboard_url,
        stripe_status,
        stripe_onboarding_state,
        stripe_charges_enabled,
        stripe_payouts_enabled,
        stripe_details_submitted,
        stripe_requirements_currently_due,
        stripe_requirements_past_due,
        stripe_last_sync_at,
        meta
      FROM app_trainer_profiles
      WHERE user_id = $1
      LIMIT 1;
    `,
    [uid]
  );
  return buildTrainerProfileFromRow(result.rows?.[0] || null);
}

function normalizeDataUrlImage(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!s.startsWith('data:image/')) return null;
  if (s.length > 1_000_000) return null;
  return s;
}

function generatePublicToken() {
  return crypto.randomBytes(8).toString('hex');
}

async function createUniqueTrainerProductPublicToken() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const token = generatePublicToken();
    const existing = await db.query(
      `
        SELECT 1
        FROM app_trainer_products
        WHERE public_token = $1
        LIMIT 1;
      `,
      [token]
    );
    if (!existing.rows?.length) return token;
  }
  throw new Error('Could not generate a public product link.');
}

function normalizeTrainerProductPayload(payload = {}) {
  const productType = String(payload?.productType || 'main_product').trim().toLowerCase() || 'main_product';
  const name = cleanShortText(payload?.name, 100);
  const description = cleanLongText(payload?.description, 10000);
  const imageDataUrl = normalizeDataUrlImage(payload?.imageDataUrl);
  const paymentTypeRaw = String(payload?.paymentType || 'recurring').trim().toLowerCase();
  const paymentType = paymentTypeRaw === 'one_time' || paymentTypeRaw === 'free'
    ? paymentTypeRaw
    : 'recurring';
  const price = cleanMoneyAmount(payload?.price);
  const billingIntervalCount = paymentType === 'recurring'
    ? Math.max(1, Math.min(60, Number.parseInt(String(payload?.billingIntervalCount || '1'), 10) || 1))
    : 1;
  const billingIntervalUnitRaw = String(payload?.billingIntervalUnit || 'month').trim().toLowerCase();
  const billingIntervalUnit = billingIntervalUnitRaw === 'week' || billingIntervalUnitRaw === 'weeks' ? 'week' : 'month';
  const durationTypeRaw = String(payload?.durationType || 'until_canceled').trim().toLowerCase();
  const durationType = paymentType === 'recurring'
    ? (durationTypeRaw === 'lasts_for' ? 'lasts_for' : 'until_canceled')
    : 'until_canceled';
  const durationMonths = paymentType === 'recurring' && durationType === 'lasts_for'
    ? Math.max(1, Math.min(60, Number.parseInt(String(payload?.durationMonths || '1'), 10) || 1))
    : null;
  const startTypeRaw = String(payload?.startType || 'immediate').trim().toLowerCase();
  const startType = startTypeRaw === 'next_monday' || startTypeRaw === 'fixed'
    ? startTypeRaw
    : 'immediate';
  const fixedStartDateRaw = String(payload?.fixedStartDate || '').trim();
  const fixedStartDate = startType === 'fixed' && /^\d{4}-\d{2}-\d{2}$/.test(fixedStartDateRaw)
    ? fixedStartDateRaw
    : null;
  const currentClients = Math.max(0, Number.parseInt(String(payload?.currentClients || '0'), 10) || 0);
  const upcomingClients = Math.max(0, Number.parseInt(String(payload?.upcomingClients || '0'), 10) || 0);
  const meta = cleanObject(payload?.meta);
  if (!name) throw new Error('Product name is required.');
  if (startType === 'fixed' && !fixedStartDate) {
    throw new Error('Pick a valid fixed start date.');
  }
  if (paymentType === 'free') {
    return {
      productType,
      name,
      description,
      imageDataUrl,
      paymentType,
      price: 0,
      billingIntervalCount,
      billingIntervalUnit,
      durationType,
      durationMonths,
      startType,
      fixedStartDate,
      sellOnRiseForIt: cleanBooleanDefault(payload?.sellOnRiseForIt, true),
      allowSelfCancellation: cleanBooleanDefault(payload?.allowSelfCancellation, true),
      limitNewClientsOnly: cleanBooleanDefault(payload?.limitNewClientsOnly, false),
      currentClients,
      upcomingClients,
      meta
    };
  }
  if (price == null || !Number.isFinite(Number(price)) || Number(price) < 0) {
    throw new Error('A valid price is required.');
  }
  return {
    productType,
    name,
    description,
    imageDataUrl,
    paymentType,
    price: Number(price),
    billingIntervalCount,
    billingIntervalUnit,
    durationType,
    durationMonths,
    startType,
    fixedStartDate,
    sellOnRiseForIt: cleanBooleanDefault(payload?.sellOnRiseForIt, true),
    allowSelfCancellation: cleanBooleanDefault(payload?.allowSelfCancellation, true),
    limitNewClientsOnly: cleanBooleanDefault(payload?.limitNewClientsOnly, false),
    currentClients,
    upcomingClients,
    meta
  };
}

function buildTrainerProductFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    trainerUserId: row.trainer_user_id,
    productType: row.product_type || 'main_product',
    stripeProductId: row.stripe_product_id || '',
    stripePriceId: row.stripe_price_id || '',
    name: row.name || '',
    description: row.description || '',
    imageDataUrl: row.image_data_url || null,
    paymentType: row.payment_type || 'recurring',
    price: row.price == null ? 0 : Number(row.price),
    billingIntervalCount: Number(row.billing_interval_count || 1),
    billingIntervalUnit: row.billing_interval_unit || 'month',
    durationType: row.duration_type || 'until_canceled',
    durationMonths: row.duration_months == null ? null : Number(row.duration_months),
    startType: row.start_type || 'immediate',
    fixedStartDate: row.fixed_start_date || null,
    publicToken: row.public_token || '',
    sellOnRiseForIt: Boolean(row.sell_on_riseforit),
    allowSelfCancellation: Boolean(row.allow_self_cancellation),
    limitNewClientsOnly: Boolean(row.limit_new_clients_only),
    currentClients: Number(row.current_clients || 0),
    upcomingClients: Number(row.upcoming_clients || 0),
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function createTrainerProduct(trainerUserId, payload) {
  const trainerId = String(trainerUserId || '').trim();
  if (!trainerId) throw new Error('Trainer required.');
  const normalized = normalizeTrainerProductPayload(payload);
  const publicToken = await createUniqueTrainerProductPublicToken();
  const result = await db.query(
    `
      INSERT INTO app_trainer_products (
        trainer_user_id,
        public_token,
        stripe_product_id,
        stripe_price_id,
        product_type,
        name,
        description,
        image_data_url,
        payment_type,
        price,
        billing_interval_count,
        billing_interval_unit,
        duration_type,
        duration_months,
        start_type,
        fixed_start_date,
        sell_on_riseforit,
        allow_self_cancellation,
        limit_new_clients_only,
        current_clients,
        upcoming_clients,
        meta
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::date, $17, $18, $19, $20, $21, $22::jsonb
      )
      RETURNING
        id,
        trainer_user_id,
        public_token,
        stripe_product_id,
        stripe_price_id,
        product_type,
        name,
        description,
        image_data_url,
        payment_type,
        price,
        billing_interval_count,
        billing_interval_unit,
        duration_type,
        duration_months,
        start_type,
        fixed_start_date,
        sell_on_riseforit,
        allow_self_cancellation,
        limit_new_clients_only,
        current_clients,
        upcoming_clients,
        meta,
        created_at,
        updated_at;
    `,
    [
      trainerId,
      publicToken,
      cleanShortText(payload?.stripeProductId, 120) || '',
      cleanShortText(payload?.stripePriceId, 120) || '',
      normalized.productType,
      normalized.name,
      normalized.description,
      normalized.imageDataUrl,
      normalized.paymentType,
      normalized.price,
      normalized.billingIntervalCount,
      normalized.billingIntervalUnit,
      normalized.durationType,
      normalized.durationMonths,
      normalized.startType,
      normalized.fixedStartDate,
      normalized.sellOnRiseForIt,
      normalized.allowSelfCancellation,
      normalized.limitNewClientsOnly,
      normalized.currentClients,
      normalized.upcomingClients,
      JSON.stringify(normalized.meta || {})
    ]
  );
  return buildTrainerProductFromRow(result.rows?.[0] || null);
}

async function createStripeCatalogForTrainerProduct(connectedAccountIdRaw, payload = {}) {
  const connectedAccountId = cleanShortText(connectedAccountIdRaw, 120);
  if (!connectedAccountId) throw new Error('Stripe connected account is missing.');
  const normalized = normalizeTrainerProductPayload(payload);
  const productForm = new URLSearchParams();
  productForm.set('name', normalized.name);
  if (normalized.description) productForm.set('description', normalized.description);
  productForm.set('metadata[payment_type]', String(normalized.paymentType || ''));
  productForm.set('metadata[start_type]', String(normalized.startType || ''));
  productForm.set('metadata[duration_type]', String(normalized.durationType || ''));
  if (normalized.fixedStartDate) productForm.set('metadata[fixed_start_date]', normalized.fixedStartDate);
  if (normalized.durationMonths != null) productForm.set('metadata[duration_months]', String(normalized.durationMonths));
  productForm.set('metadata[sell_on_riseforit]', normalized.sellOnRiseForIt ? 'true' : 'false');
  productForm.set('metadata[allow_self_cancellation]', normalized.allowSelfCancellation ? 'true' : 'false');
  productForm.set('metadata[limit_new_clients_only]', normalized.limitNewClientsOnly ? 'true' : 'false');
  const stripeProduct = await stripeFormRequestForAccount('/v1/products', productForm, 'POST', connectedAccountId);
  const paymentType = String(normalized.paymentType || '').trim().toLowerCase();
  let stripePriceId = '';
  if (paymentType !== 'free') {
    const priceForm = new URLSearchParams();
    priceForm.set('product', String(stripeProduct?.id || '').trim());
    priceForm.set('currency', stripePriceCurrency());
    priceForm.set('unit_amount', String(Math.max(0, Math.round(Number(normalized.price || 0) * 100))));
    if (paymentType === 'recurring') {
      const unit = String(normalized.billingIntervalUnit || 'month').trim().toLowerCase();
      priceForm.set('recurring[interval]', unit === 'week' || unit === 'year' ? unit : 'month');
      priceForm.set('recurring[interval_count]', String(Math.max(1, Number(normalized.billingIntervalCount || 1))));
    }
    priceForm.set('metadata[payment_type]', String(normalized.paymentType || ''));
    priceForm.set('metadata[start_type]', String(normalized.startType || ''));
    priceForm.set('metadata[duration_type]', String(normalized.durationType || ''));
    if (normalized.fixedStartDate) priceForm.set('metadata[fixed_start_date]', normalized.fixedStartDate);
    if (normalized.durationMonths != null) priceForm.set('metadata[duration_months]', String(normalized.durationMonths));
    const stripePrice = await stripeFormRequestForAccount('/v1/prices', priceForm, 'POST', connectedAccountId);
    stripePriceId = cleanShortText(stripePrice?.id, 120) || '';
  }
  return {
    stripeProductId: cleanShortText(stripeProduct?.id, 120) || '',
    stripePriceId
  };
}

async function createTrainerProductWithStripe(trainerUserId, payload = {}) {
  const normalized = normalizeTrainerProductPayload(payload);
  if (String(normalized.paymentType || '').trim().toLowerCase() === 'free') {
    return await createTrainerProduct(trainerUserId, normalized);
  }
  const profile = await getTrainerProfile(trainerUserId);
  const readiness = buildTrainerStripeReadiness(profile?.stripe || {});
  if (!readiness.chargesEnabled || !readiness.payoutsEnabled) {
    throw new Error('Connect Stripe and finish verification before creating paid products.');
  }
  const catalog = await createStripeCatalogForTrainerProduct(readiness.connectedAccountId, normalized);
  return await createTrainerProduct(trainerUserId, {
    ...normalized,
    stripeProductId: catalog.stripeProductId,
    stripePriceId: catalog.stripePriceId
  });
}

async function listTrainerProducts(trainerUserId) {
  const trainerId = String(trainerUserId || '').trim();
  if (!trainerId) return [];
  const result = await db.query(
    `
      SELECT
        p.id,
        p.trainer_user_id,
        p.public_token,
        p.stripe_product_id,
        p.stripe_price_id,
        p.product_type,
        p.name,
        p.description,
        p.image_data_url,
        p.payment_type,
        p.price,
        p.billing_interval_count,
        p.billing_interval_unit,
        p.duration_type,
        p.duration_months,
        p.start_type,
        p.fixed_start_date,
        p.sell_on_riseforit,
        p.allow_self_cancellation,
        p.limit_new_clients_only,
        CASE
          WHEN p.payment_type = 'recurring' THEN COALESCE(sub_stats.active_count, 0)
          ELSE COALESCE(order_stats.completed_count, 0)
        END AS current_clients,
        CASE
          WHEN p.payment_type = 'recurring' THEN COALESCE(sub_stats.pending_count, 0)
          ELSE COALESCE(p.upcoming_clients, 0)
        END AS upcoming_clients,
        p.meta,
        p.created_at,
        p.updated_at
      FROM app_trainer_products p
      LEFT JOIN (
        SELECT
          trainer_product_id,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count
        FROM app_trainer_product_orders
        WHERE trainer_user_id = $1
        GROUP BY trainer_product_id
      ) AS order_stats ON order_stats.trainer_product_id = p.id
      LEFT JOIN (
        SELECT
          trainer_product_id,
          COUNT(*) FILTER (WHERE status IN ('active', 'trialing'))::int AS active_count,
          COUNT(*) FILTER (WHERE status IN ('pending', 'incomplete', 'past_due', 'unpaid'))::int AS pending_count
        FROM app_trainer_product_subscriptions
        WHERE trainer_user_id = $1
        GROUP BY trainer_product_id
      ) AS sub_stats ON sub_stats.trainer_product_id = p.id
      WHERE p.trainer_user_id = $1
      ORDER BY p.created_at ASC, p.name ASC;
    `,
    [trainerId]
  );
  const rows = Array.isArray(result.rows) ? result.rows.slice() : [];
  for (const row of rows) {
    if (String(row?.public_token || '').trim()) continue;
    const nextToken = await createUniqueTrainerProductPublicToken();
    await db.query(
      `
        UPDATE app_trainer_products
        SET public_token = $2,
            updated_at = now()
        WHERE id = $1;
      `,
      [row.id, nextToken]
    );
    row.public_token = nextToken;
  }
  return rows.map(buildTrainerProductFromRow).filter(Boolean);
}

async function deleteTrainerProducts(trainerUserId, ids = []) {
  const trainerId = String(trainerUserId || '').trim();
  if (!trainerId) return 0;
  const normalizedIds = Array.isArray(ids)
    ? ids.map((id) => String(id || '').trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    : [];
  if (!normalizedIds.length) return 0;
  const result = await db.query(
    `
      DELETE FROM app_trainer_products
      WHERE trainer_user_id = $1
        AND id = ANY($2::uuid[]);
    `,
    [trainerId, normalizedIds]
  );
  return Number(result.rowCount || 0);
}

function buildTrainerProductPublicUrls(req, tokenRaw) {
  const token = String(tokenRaw || '').trim();
  const base = resolveAppBaseUrl(req) || '';
  const root = base || '';
  const productPath = `/product-buy.html?product=${encodeURIComponent(token)}`;
  const checkoutPath = `${productPath}&checkout=1`;
  const discountPath = `${productPath}&discount=1`;
  return {
    productUrl: `${root}${productPath}`,
    checkoutUrl: `${root}${checkoutPath}`,
    discountUrl: `${root}${discountPath}`
  };
}

function normalizeDiscountPercent(raw) {
  const value = Number.parseFloat(String(raw ?? '').trim());
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

async function getPublicTrainerProductByToken(tokenRaw) {
  const token = String(tokenRaw || '').trim().toLowerCase();
  if (!/^[a-f0-9]{16}$/i.test(token)) return null;
  const result = await db.query(
    `
      SELECT
        p.id,
        p.trainer_user_id,
        p.public_token,
        p.stripe_product_id,
        p.stripe_price_id,
        p.product_type,
        p.name,
        p.description,
        p.image_data_url,
        p.payment_type,
        p.price,
        p.billing_interval_count,
        p.billing_interval_unit,
        p.duration_type,
        p.duration_months,
        p.start_type,
        p.fixed_start_date,
        p.sell_on_riseforit,
        p.allow_self_cancellation,
        p.limit_new_clients_only,
        p.current_clients,
        p.upcoming_clients,
        p.meta,
        p.created_at,
        p.updated_at,
        u.display_name AS trainer_display_name,
        u.username AS trainer_username,
        tp.full_name AS trainer_full_name,
        tp.contact_email AS trainer_contact_email,
        tp.stripe_connected_account_id,
        tp.stripe_account_id,
        tp.stripe_charges_enabled,
        tp.stripe_payouts_enabled,
        tp.stripe_details_submitted
      FROM app_trainer_products p
      JOIN app_users u ON u.id = p.trainer_user_id
      LEFT JOIN app_trainer_profiles tp ON tp.user_id = p.trainer_user_id
      WHERE p.public_token = $1
      LIMIT 1;
    `,
    [token]
  );
  const row = result.rows?.[0] || null;
  if (!row) return null;
  const product = buildTrainerProductFromRow(row);
  const trainerName = cleanShortText(
    row.trainer_full_name || row.trainer_display_name || row.trainer_username || 'RiseForIt Coach',
    160
  );
  const stripeAccountId = cleanShortText(row.stripe_connected_account_id || row.stripe_account_id, 120);
  return {
    ...product,
    trainer: {
      id: row.trainer_user_id,
      name: trainerName,
      username: cleanShortText(row.trainer_username, 80),
      email: normalizeEmail(row.trainer_contact_email || '') || ''
    },
    stripe: {
      connectedAccountId: stripeAccountId,
      chargesEnabled: Boolean(row.stripe_charges_enabled),
      payoutsEnabled: Boolean(row.stripe_payouts_enabled),
      detailsSubmitted: Boolean(row.stripe_details_submitted)
    }
  };
}

function buildProductCheckoutUrls(req, tokenRaw, discountPercentRaw = 0) {
  const base = resolveAppBaseUrl(req) || '';
  const token = encodeURIComponent(String(tokenRaw || '').trim());
  const discountPercent = normalizeDiscountPercent(discountPercentRaw);
  const discountPart = discountPercent > 0 ? `&discountPct=${encodeURIComponent(String(discountPercent))}` : '';
  const successPath = `/product-thank-you.html?product=${token}${discountPart}&status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelPath = `/product-buy.html?product=${token}${discountPart}&status=cancel`;
  return {
    successUrl: `${base}${successPath}`,
    cancelUrl: `${base}${cancelPath}`
  };
}

async function createPublicTrainerProductCheckoutSession(req, publicProduct, options = {}) {
  if (!publicProduct) throw new Error('Product not found.');
  if (!publicProduct.sellOnRiseForIt) throw new Error('This product is not currently available for checkout.');
  if (String(publicProduct.paymentType || '').trim().toLowerCase() === 'free') {
    return { ok: true, mode: 'free', url: '', sessionId: '' };
  }
  const connectedAccountId = cleanShortText(publicProduct?.stripe?.connectedAccountId, 120);
  if (!connectedAccountId) throw new Error('This coach has not connected Stripe yet.');
  if (!publicProduct?.stripe?.chargesEnabled) throw new Error('This coach cannot accept card payments yet.');

  const discountPercent = normalizeDiscountPercent(options?.discountPercent);
  const urls = buildProductCheckoutUrls(req, publicProduct.publicToken, discountPercent);
  const form = new URLSearchParams();
  form.set('success_url', urls.successUrl);
  form.set('cancel_url', urls.cancelUrl);
  const paymentType = String(publicProduct.paymentType || '').trim().toLowerCase();
  const fullAmountCents = Math.max(0, Math.round(Number(publicProduct.price || 0) * 100));
  const unitAmountCents = Math.max(0, Math.round(fullAmountCents * ((100 - discountPercent) / 100)));
  const platformFeePercent = stripePlatformFeePercent();
  const productName = cleanShortText(publicProduct.name, 120) || 'RiseForIt Product';
  const description = cleanLongText(publicProduct.description, 400);
  const metadata = {
    trainer_user_id: String(publicProduct.trainerUserId || ''),
    trainer_product_id: String(publicProduct.id || ''),
    product_public_token: String(publicProduct.publicToken || ''),
    client_user_id: String(options?.clientUserId || '').trim(),
    discount_percent: String(discountPercent),
    original_amount_cents: String(fullAmountCents),
    final_amount_cents: String(unitAmountCents)
  };
  Object.entries(metadata).forEach(([key, value]) => {
    if (!value) return;
    form.set(`metadata[${key}]`, value);
  });
  if (discountPercent === 0 && String(publicProduct.stripePriceId || '').trim()) {
    form.set('line_items[0][price]', String(publicProduct.stripePriceId || '').trim());
    form.set('line_items[0][quantity]', '1');
  } else {
    form.set('line_items[0][price_data][currency]', stripePriceCurrency());
    if (String(publicProduct.stripeProductId || '').trim()) form.set('line_items[0][price_data][product]', String(publicProduct.stripeProductId || '').trim());
    else {
      form.set('line_items[0][price_data][product_data][name]', productName);
      if (description) form.set('line_items[0][price_data][product_data][description]', description);
    }
    form.set('line_items[0][price_data][unit_amount]', String(unitAmountCents));
    form.set('line_items[0][quantity]', '1');
  }
  if (paymentType === 'recurring') {
    form.set('mode', 'subscription');
    if (!(discountPercent === 0 && String(publicProduct.stripePriceId || '').trim())) {
      const intervalUnit = String(publicProduct.billingIntervalUnit || 'month').trim().toLowerCase();
      form.set('line_items[0][price_data][recurring][interval]', intervalUnit === 'week' || intervalUnit === 'year' ? intervalUnit : 'month');
      form.set('line_items[0][price_data][recurring][interval_count]', String(Math.max(1, Number(publicProduct.billingIntervalCount || 1))));
    }
    form.set('subscription_data[application_fee_percent]', String(platformFeePercent));
  } else {
    form.set('mode', 'payment');
    form.set('payment_intent_data[application_fee_amount]', String(Math.max(0, Math.round(unitAmountCents * (platformFeePercent / 100)))));
  }
  const session = await stripeFormRequestForAccount('/v1/checkout/sessions', form, 'POST', connectedAccountId);
  return {
    ok: true,
    mode: session?.mode || form.get('mode') || 'payment',
    discountPercent,
    url: String(session?.url || '').trim(),
    sessionId: String(session?.id || '').trim()
  };
}

async function upsertTrainerProductOrder(payload = {}) {
  const result = await db.query(
    `
      INSERT INTO app_trainer_product_orders (
        trainer_user_id,
        trainer_product_id,
        client_user_id,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        stripe_customer_id,
        stripe_subscription_id,
        amount_cents,
        currency,
        status,
        metadata,
        updated_at
      )
      VALUES (
        NULLIF($1, '')::uuid,
        NULLIF($2, '')::uuid,
        NULLIF($3, '')::uuid,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb,
        now()
      )
      ON CONFLICT (stripe_checkout_session_id) DO UPDATE SET
        stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        amount_cents = EXCLUDED.amount_cents,
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        metadata = COALESCE(app_trainer_product_orders.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        updated_at = now()
      RETURNING *;
    `,
    [
      String(payload.trainerUserId || '').trim(),
      String(payload.trainerProductId || '').trim(),
      String(payload.clientUserId || '').trim(),
      String(payload.stripeCheckoutSessionId || '').trim(),
      String(payload.stripePaymentIntentId || '').trim(),
      String(payload.stripeCustomerId || '').trim(),
      String(payload.stripeSubscriptionId || '').trim(),
      Math.max(0, Number(payload.amountCents || 0)),
      String(payload.currency || stripePriceCurrency()).trim().toLowerCase() || stripePriceCurrency(),
      String(payload.status || 'pending').trim().toLowerCase() || 'pending',
      JSON.stringify(cleanObject(payload.metadata))
    ]
  );
  return result.rows?.[0] || null;
}

async function upsertTrainerProductSubscription(payload = {}) {
  const subscriptionId = String(payload.stripeSubscriptionId || '').trim();
  if (!subscriptionId) return null;
  const result = await db.query(
    `
      INSERT INTO app_trainer_product_subscriptions (
        trainer_user_id,
        trainer_product_id,
        client_user_id,
        stripe_subscription_id,
        stripe_customer_id,
        stripe_price_id,
        status,
        current_period_end,
        metadata,
        updated_at
      )
      VALUES (
        NULLIF($1, '')::uuid,
        NULLIF($2, '')::uuid,
        NULLIF($3, '')::uuid,
        $4,
        $5,
        $6,
        $7,
        $8::timestamptz,
        $9::jsonb,
        now()
      )
      ON CONFLICT (stripe_subscription_id) DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_price_id = EXCLUDED.stripe_price_id,
        status = EXCLUDED.status,
        current_period_end = EXCLUDED.current_period_end,
        metadata = COALESCE(app_trainer_product_subscriptions.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        updated_at = now()
      RETURNING *;
    `,
    [
      String(payload.trainerUserId || '').trim(),
      String(payload.trainerProductId || '').trim(),
      String(payload.clientUserId || '').trim(),
      subscriptionId,
      String(payload.stripeCustomerId || '').trim(),
      String(payload.stripePriceId || '').trim(),
      String(payload.status || 'pending').trim().toLowerCase() || 'pending',
      payload.currentPeriodEnd || null,
      JSON.stringify(cleanObject(payload.metadata))
    ]
  );
  return result.rows?.[0] || null;
}

async function verifyPublicTrainerProductCheckoutSession(tokenRaw, sessionIdRaw) {
  const token = String(tokenRaw || '').trim();
  const sessionId = String(sessionIdRaw || '').trim();
  if (!token) return { ok: false, error: 'Missing product token.' };
  if (!sessionId) return { ok: false, error: 'Missing session id.' };

  const product = await getPublicTrainerProductByToken(token);
  if (!product) return { ok: false, error: 'Product not found.' };
  const connectedAccountId = cleanShortText(product?.stripe?.connectedAccountId, 120);
  if (!connectedAccountId) return { ok: false, error: 'This coach has not connected Stripe yet.' };

  const session = await stripeFormRequestForAccount(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    null,
    'GET',
    connectedAccountId
  );
  const paid = String(session?.payment_status || '').trim().toLowerCase() === 'paid';
  if (!paid) return { ok: false, error: 'Payment is not complete yet.' };

  const metadata = cleanObject(session?.metadata);
  const sessionProductId = String(metadata?.trainer_product_id || '').trim();
  if (sessionProductId && sessionProductId !== String(product.id || '').trim()) {
    return { ok: false, error: 'Checkout session does not belong to this product.' };
  }

  const order = await upsertTrainerProductOrder({
    trainerUserId: metadata.trainer_user_id || product.trainerUserId,
    trainerProductId: metadata.trainer_product_id || product.id,
    clientUserId: metadata.client_user_id,
    stripeCheckoutSessionId: String(session.id || '').trim(),
    stripePaymentIntentId: String(session.payment_intent || '').trim(),
    stripeCustomerId: String(session.customer || '').trim(),
    stripeSubscriptionId: String(session.subscription || '').trim(),
    amountCents: Math.max(0, Number(session.amount_total || 0)),
    currency: String(session.currency || stripePriceCurrency()).trim().toLowerCase(),
    status: 'completed',
    metadata
  });
  if (String(session.subscription || '').trim()) {
    await upsertTrainerProductSubscription({
      trainerUserId: metadata.trainer_user_id || product.trainerUserId,
      trainerProductId: metadata.trainer_product_id || product.id,
      clientUserId: metadata.client_user_id,
      stripeSubscriptionId: String(session.subscription || '').trim(),
      stripeCustomerId: String(session.customer || '').trim(),
      stripePriceId: String(product.stripePriceId || '').trim(),
      status: 'active',
      metadata
    });
  }
  await grantTrainerProductAccess(metadata.client_user_id, order);
  return {
    ok: true,
    order,
    product: {
      id: product.id,
      name: product.name,
      publicToken: product.publicToken
    }
  };
}

async function grantTrainerProductAccess(userIdRaw, orderRow = null) {
  const userId = String(userIdRaw || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !orderRow?.id) return null;
  const rewardKey = `trainer_product_order_${orderRow.id}`;
  await db.query(
    `
      INSERT INTO app_access_grants (
        user_id,
        source,
        reward_key,
        days,
        starts_at,
        ends_at,
        amount_cents,
        meta
      )
      VALUES (
        $1,
        'trainer_product_purchase',
        $2,
        3650,
        now(),
        now() + interval '3650 days',
        $3,
        $4::jsonb
      )
      ON CONFLICT (reward_key) DO NOTHING;
    `,
    [
      userId,
      rewardKey,
      Math.max(0, Number(orderRow.amount_cents || 0)),
      JSON.stringify({
        trainerProductOrderId: orderRow.id,
        trainerProductId: orderRow.trainer_product_id || null,
        stripeCheckoutSessionId: orderRow.stripe_checkout_session_id || ''
      })
    ]
  );
  return true;
}

function verifyStripeWebhookSignature(rawBodyBuffer, sigHeaderRaw, secretRaw) {
  const secret = String(secretRaw || '').trim();
  const sigHeader = String(sigHeaderRaw || '').trim();
  if (!secret || !sigHeader) return false;
  const parts = sigHeader.split(',').map((part) => part.trim()).filter(Boolean);
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) || '';
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const payload = `${timestamp}.${rawBodyBuffer.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return signatures.some((candidate) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  });
}

async function handleStripeWebhookEvent(event = {}) {
  const type = String(event?.type || '').trim();
  const object = event?.data?.object && typeof event.data.object === 'object' ? event.data.object : {};
  if (!type) return;
  if (type === 'checkout.session.completed') {
    const metadata = cleanObject(object.metadata);
    const order = await upsertTrainerProductOrder({
      trainerUserId: metadata.trainer_user_id,
      trainerProductId: metadata.trainer_product_id,
      clientUserId: metadata.client_user_id,
      stripeCheckoutSessionId: object.id,
      stripePaymentIntentId: String(object.payment_intent || '').trim(),
      stripeCustomerId: String(object.customer || '').trim(),
      stripeSubscriptionId: String(object.subscription || '').trim(),
      amountCents: Math.max(0, Number(object.amount_total || 0)),
      currency: String(object.currency || stripePriceCurrency()).trim().toLowerCase(),
      status: 'completed',
      metadata
    });
    if (String(object.subscription || '').trim()) {
      await upsertTrainerProductSubscription({
        trainerUserId: metadata.trainer_user_id,
        trainerProductId: metadata.trainer_product_id,
        clientUserId: metadata.client_user_id,
        stripeSubscriptionId: String(object.subscription || '').trim(),
        stripeCustomerId: String(object.customer || '').trim(),
        status: 'active',
        metadata
      });
    }
    await grantTrainerProductAccess(metadata.client_user_id, order);
    return;
  }
  if (type === 'invoice.paid' || type === 'invoice.payment_failed') {
    const metadata = cleanObject(object.metadata);
    const subscriptionId = String(object.subscription || '').trim();
    const clientUserId = String(metadata.client_user_id || '').trim();
    await upsertTrainerProductSubscription({
      trainerUserId: metadata.trainer_user_id,
      trainerProductId: metadata.trainer_product_id,
      clientUserId,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: String(object.customer || '').trim(),
      stripePriceId: String(object.lines?.data?.[0]?.price?.id || '').trim(),
      status: type === 'invoice.paid' ? 'active' : 'past_due',
      currentPeriodEnd: object.lines?.data?.[0]?.period?.end ? new Date(Number(object.lines.data[0].period.end) * 1000).toISOString() : null,
      metadata
    });
    if (type === 'invoice.paid' && clientUserId) {
      const existingOrder = await db.query(
        `SELECT * FROM app_trainer_product_orders WHERE stripe_subscription_id = $1 ORDER BY created_at DESC LIMIT 1;`,
        [subscriptionId]
      );
      await grantTrainerProductAccess(clientUserId, existingOrder.rows?.[0] || null);
    }
    return;
  }
  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const metadata = cleanObject(object.metadata);
    await upsertTrainerProductSubscription({
      trainerUserId: metadata.trainer_user_id,
      trainerProductId: metadata.trainer_product_id,
      clientUserId: metadata.client_user_id,
      stripeSubscriptionId: String(object.id || '').trim(),
      stripeCustomerId: String(object.customer || '').trim(),
      stripePriceId: String(object.items?.data?.[0]?.price?.id || '').trim(),
      status: type === 'customer.subscription.deleted' ? 'canceled' : String(object.status || 'pending').trim().toLowerCase(),
      currentPeriodEnd: object.current_period_end ? new Date(Number(object.current_period_end) * 1000).toISOString() : null,
      metadata
    });
  }
}

function normalizeTrainerOnboardingPayload(payload = {}, userLike = null) {
  const fullName = cleanShortText(payload.fullName || userLike?.displayName || userLike?.username || '', 120);
  const email = normalizeEmail(payload.email || userLike?.email || '') || '';
  const meta = normalizeTrainerMeta(payload);
  const instagramHandle = cleanHandle(payload.instagramHandle) || extractHandleFromUrl(meta.instagramUrl, /instagram\.com\/([^/?#]+)/i);
  const tiktokHandle = cleanHandle(payload.tiktokHandle) || extractHandleFromUrl(meta.tiktokUrl, /tiktok\.com\/@?([^/?#]+)/i);
  const brandPositioning = cleanLongText(payload.brandPositioning, 400);
  const clientTypes = cleanLongText(
    payload.clientTypes || [...meta.specialtyClients, ...meta.specialtyClientsCustom].join(', '),
    240
  );
  const idealClient = cleanLongText(payload.idealClient, 240);
  const differentiator = cleanLongText(payload.differentiator || meta.coachingPhilosophy, 360);
  const coachingFormat = String(meta.coachingFormat || '').trim();
  const onlineCoaching = coachingFormat
    ? coachingFormat !== 'in_person_only'
    : cleanBoolean(payload.onlineCoaching);
  const inPersonTraining = coachingFormat
    ? coachingFormat !== 'remote_only'
    : cleanBoolean(payload.inPersonTraining);
  const monthlyCoachingPrice = cleanMoneyAmount(payload.monthlyCoachingPrice || payload.startingPrice);
  const coachingIncludes = cleanLongText(
    payload.coachingIncludes || [...meta.includedItems, ...meta.includedItemsCustom].join(', '),
    800
  );
  const daysAvailable = uniqueStringArray(payload.daysAvailable, { maxItems: 7, maxLen: 40 });
  const timeSlotsAvailable = uniqueStringArray(payload.timeSlotsAvailable, { maxItems: 42, maxLen: 80 });
  const timeZone = cleanShortText(payload.timeZone, 80);
  if (!fullName) throw new Error('Full name is required.');
  if (!email) throw new Error('Email is required.');
  return {
    fullName,
    email,
    instagramHandle,
    tiktokHandle,
    brandPositioning,
    clientTypes,
    idealClient,
    differentiator,
    onlineCoaching,
    inPersonTraining,
    monthlyCoachingPrice,
    coachingIncludes,
    daysAvailable,
    timeSlotsAvailable,
    timeZone,
    meta
  };
}

async function upsertTrainerProfile(userLike, payload = {}) {
  const uid = String(userLike?.id || '').trim();
  if (!uid) return null;
  const normalized = normalizeTrainerOnboardingPayload(payload, userLike);
  const result = await db.query(
    `
      INSERT INTO app_trainer_profiles (
        user_id,
        onboarding_completed_at,
        full_name,
        contact_email,
        instagram_handle,
        tiktok_handle,
        brand_positioning,
        client_types,
        ideal_client,
        differentiator,
        online_coaching,
        in_person_training,
        monthly_coaching_price,
        coaching_includes,
        call_days,
        call_time_slots,
        call_timezone,
        meta,
        updated_at
      )
      VALUES (
        $1, now(), $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14::text[], $15::text[], $16, $17::jsonb, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        onboarding_completed_at = COALESCE(app_trainer_profiles.onboarding_completed_at, now()),
        full_name = EXCLUDED.full_name,
        contact_email = EXCLUDED.contact_email,
        instagram_handle = EXCLUDED.instagram_handle,
        tiktok_handle = EXCLUDED.tiktok_handle,
        brand_positioning = EXCLUDED.brand_positioning,
        client_types = EXCLUDED.client_types,
        ideal_client = EXCLUDED.ideal_client,
        differentiator = EXCLUDED.differentiator,
        online_coaching = EXCLUDED.online_coaching,
        in_person_training = EXCLUDED.in_person_training,
        monthly_coaching_price = EXCLUDED.monthly_coaching_price,
        coaching_includes = EXCLUDED.coaching_includes,
        call_days = EXCLUDED.call_days,
        call_time_slots = EXCLUDED.call_time_slots,
        call_timezone = EXCLUDED.call_timezone,
        meta = EXCLUDED.meta,
        updated_at = now()
      RETURNING
        user_id,
        onboarding_completed_at,
        full_name,
        contact_email,
        instagram_handle,
        tiktok_handle,
        brand_positioning,
        client_types,
        ideal_client,
        differentiator,
        online_coaching,
        in_person_training,
        monthly_coaching_price,
        coaching_includes,
        call_days,
        call_time_slots,
        call_timezone,
        stripe_account_id,
        stripe_payout_email,
        stripe_dashboard_url,
        stripe_status,
        meta;
    `,
    [
      uid,
      normalized.fullName,
      normalized.email,
      normalized.instagramHandle,
      normalized.tiktokHandle,
      normalized.brandPositioning,
      normalized.clientTypes,
      normalized.idealClient,
      normalized.differentiator,
      normalized.onlineCoaching,
      normalized.inPersonTraining,
      normalized.monthlyCoachingPrice,
      normalized.coachingIncludes,
      normalized.daysAvailable,
      normalized.timeSlotsAvailable,
      normalized.timeZone,
      JSON.stringify(normalized.meta)
    ]
  );
  await syncUserAdminFlag(uid, 'trainer', true);
  return buildTrainerProfileFromRow(result.rows?.[0] || null);
}

async function saveTrainerStripeProfile(userId, payload = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const payoutEmail = normalizeEmail(payload.payoutEmail || '') || '';
  const accountId = cleanShortText(payload.accountId, 120);
  const dashboardUrl = cleanShortText(payload.dashboardUrl, 320);
  const status = accountId && payoutEmail
    ? 'connected'
    : ((accountId || payoutEmail || dashboardUrl) ? 'incomplete' : 'not_connected');
  const result = await db.query(
    `
      INSERT INTO app_trainer_profiles (
        user_id,
        stripe_account_id,
        stripe_payout_email,
        stripe_dashboard_url,
        stripe_status,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (user_id) DO UPDATE SET
        stripe_account_id = EXCLUDED.stripe_account_id,
        stripe_payout_email = EXCLUDED.stripe_payout_email,
        stripe_dashboard_url = EXCLUDED.stripe_dashboard_url,
        stripe_status = EXCLUDED.stripe_status,
        updated_at = now()
      RETURNING
        user_id,
        onboarding_completed_at,
        full_name,
        contact_email,
        instagram_handle,
        tiktok_handle,
        brand_positioning,
        client_types,
        ideal_client,
        differentiator,
        online_coaching,
        in_person_training,
        monthly_coaching_price,
        coaching_includes,
        call_days,
        call_time_slots,
        call_timezone,
        stripe_account_id,
        stripe_payout_email,
        stripe_dashboard_url,
        stripe_status,
        meta;
    `,
    [uid, accountId, payoutEmail, dashboardUrl, status]
  );
  return buildTrainerProfileFromRow(result.rows?.[0] || null);
}

async function addTrainerClient(userLike, payload = {}) {
  const trainerUserId = String(userLike?.id || '').trim();
  if (!trainerUserId) return null;
  const displayName = cleanShortText(payload.displayName, 120);
  const email = normalizeEmail(payload.email || '') || null;
  const phone = normalizePhone(payload.phone || '') || null;
  const notes = cleanLongText(payload.notes, 400);
  if (!displayName) throw new Error('Client name is required.');
  const linkedUser = email ? await findUserByIdentifier(email) : null;
  const result = await db.query(
    `
      INSERT INTO app_trainer_clients (
        trainer_user_id,
        linked_user_id,
        display_name,
        email,
        phone,
        notes,
        status,
        source,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'active', 'manual', now())
      RETURNING
        id,
        trainer_user_id,
        linked_user_id,
        display_name,
        email,
        phone,
        notes,
        status,
        source,
        created_at,
        updated_at;
    `,
    [trainerUserId, linkedUser?.id || null, displayName, email, phone, notes]
  );
  return result.rows?.[0] || null;
}

async function removeTrainerClient(userLike, clientIdRaw) {
  const trainerUserId = String(userLike?.id || '').trim();
  const clientId = String(clientIdRaw || '').trim();
  if (!trainerUserId || !clientId) return false;
  const result = await db.query(
    `
      UPDATE app_trainer_clients
      SET status = 'removed',
          updated_at = now()
      WHERE id = $1
        AND trainer_user_id = $2
      RETURNING id;
    `,
    [clientId, trainerUserId]
  );
  return Boolean(result.rows?.[0]?.id);
}

async function listTrainerClients(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const result = await db.query(
    `
      SELECT
        id,
        trainer_user_id,
        linked_user_id,
        display_name,
        email,
        phone,
        notes,
        status,
        source,
        created_at,
        updated_at
      FROM app_trainer_clients
      WHERE trainer_user_id = $1
        AND status <> 'removed'
      ORDER BY created_at DESC;
    `,
    [uid]
  );
  return (result.rows || []).map((row) => ({
    id: row.id,
    linkedUserId: row.linked_user_id || null,
    displayName: row.display_name || 'Client',
    email: row.email || null,
    phone: row.phone || null,
    notes: row.notes || '',
    status: row.status || 'active',
    source: row.source || 'manual',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }));
}

async function getTrainerBillingSummary(req, userLike) {
  const uid = String(userLike?.id || '').trim();
  if (!uid) return null;
  const code = await ensureReferralCode(userLike);
  const base = resolveAppBaseUrl(req) || '';
  const referralLink = `${base || ''}/index.html?ref=${encodeURIComponent(code)}#signup`;

  const signupsResult = await db.query(
    `
      SELECT
        r.id,
        r.status,
        r.source,
        r.created_at,
        r.signed_up_at,
        r.qualified_at,
        u.id AS user_id,
        u.username,
        u.display_name,
        u.email
      FROM app_referrals r
      LEFT JOIN app_users u ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = $1
      ORDER BY COALESCE(r.signed_up_at, r.created_at) DESC, r.created_at DESC
      LIMIT 80;
    `,
    [uid]
  );

  const paidResult = await db.query(
    `
      SELECT
        r.referred_user_id,
        paid.first_paid_at,
        u.username,
        u.display_name,
        u.email
      FROM app_referrals r
      JOIN LATERAL (
        SELECT MIN(g.created_at) AS first_paid_at
        FROM app_access_grants g
        WHERE g.user_id = r.referred_user_id
          AND COALESCE(g.amount_cents, 0) > 0
      ) paid ON paid.first_paid_at IS NOT NULL
      LEFT JOIN app_users u ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = $1
      ORDER BY paid.first_paid_at DESC;
    `,
    [uid]
  );

  const paidRows = (paidResult.rows || []).map((row) => ({
    userId: row.referred_user_id,
    displayName: row.display_name || row.username || row.email || 'Client',
    email: row.email || null,
    paidAt: row.first_paid_at || null
  }));

  const monthsMap = new Map();
  for (const row of paidRows) {
    const monthKey = formatMonthKey(row.paidAt);
    if (!monthKey) continue;
    if (!monthsMap.has(monthKey)) {
      monthsMap.set(monthKey, {
        monthKey,
        label: formatMonthLabel(row.paidAt),
        count: 0,
        payoutCents: 0,
        conversions: []
      });
    }
    const bucket = monthsMap.get(monthKey);
    bucket.count += 1;
    bucket.payoutCents += TRAINER_PAYOUT_CENTS_PER_SUBSCRIPTION;
    bucket.conversions.push(row);
  }

  const currentMonthKey = formatMonthKey(new Date().toISOString());
  const currentMonth = monthsMap.get(currentMonthKey) || {
    monthKey: currentMonthKey,
    label: formatMonthLabel(new Date().toISOString()),
    count: 0,
    payoutCents: 0,
    conversions: []
  };
  const tier = resolveTrainerTier(currentMonth.count);

  return {
    referral: {
      code,
      link: referralLink
    },
    payingSubscribers: paidRows,
    signups: (signupsResult.rows || []).map((row) => ({
      id: row.id,
      userId: row.user_id || null,
      displayName: row.display_name || row.username || row.email || 'Client',
      email: row.email || null,
      status: row.status || 'pending',
      source: row.source || '',
      signedUpAt: row.signed_up_at || row.created_at || null,
      qualifiedAt: row.qualified_at || null
    })),
    monthly: Array.from(monthsMap.values()).sort((a, b) => String(b.monthKey).localeCompare(String(a.monthKey))),
    currentMonth: {
      ...currentMonth,
      tier: {
        name: tier.name,
        min: tier.min,
        nextAt: tier.nextAt,
        remainingToNext: tier.nextAt == null ? 0 : Math.max(0, tier.nextAt - currentMonth.count)
      }
    },
    payoutPerPaidCents: TRAINER_PAYOUT_CENTS_PER_SUBSCRIPTION
  };
}

async function getTrainerDashboard(req, userLike) {
  const uid = String(userLike?.id || '').trim();
  if (!uid) return null;
  const profile = await getTrainerProfile(uid);
  const clients = await listTrainerClients(uid);
  const billing = await getTrainerBillingSummary(req, userLike);
  const growth = await getTrainerGrowthSnapshot(req, userLike, profile);
  const trainerActive = notesHasFlag(userLike?.admin_notes || '', 'trainer') || Boolean(profile) || isOwnerUser(userLike);
  return {
    ok: true,
    isTrainer: trainerActive,
    trainer: profile || {
      active: trainerActive,
      onboarded: false,
      onboardingCompletedAt: null,
      fullName: cleanShortText(userLike?.displayName || '', 120),
      email: normalizeEmail(userLike?.email || '') || '',
      instagramHandle: '',
      tiktokHandle: '',
      brandPositioning: '',
      clientTypes: '',
      idealClient: '',
      differentiator: '',
      offer: {
        onlineCoaching: false,
        inPersonTraining: false,
        monthlyCoachingPrice: null,
        included: ''
      },
      availability: {
        daysAvailable: [],
        timeSlotsAvailable: [],
        timeZone: ''
      },
      stripe: {
        status: 'not_connected',
        accountId: '',
        payoutEmail: '',
        dashboardUrl: ''
      },
      meta: {}
    },
    clients: {
      manual: clients,
      referred: billing?.signups || []
    },
    growth: growth || {
      stripe: buildTrainerStripeReadiness(profile?.stripe || {}),
      inviteCenter: {
        referralCode: billing?.referral?.code || '',
        referralLink: billing?.referral?.link || ''
      },
      performance: {
        profileClicks: 0,
        regularSignups: 0,
        coachingSignups: 0,
        inviteLinksSent: 0,
        conversionRate: 0
      },
      coaching: {
        activeClients: 0,
        totalCoachingSignups: 0,
        monthlyRevenueCents: 0,
        lifetimeRevenueCents: 0,
        paidSubscriptions: 0,
        failedPayments: 0
      },
      bonus: {
        bonusAmountCents: TRAINER_REFERRAL_BONUS_CENTS,
        triggerRule: TRAINER_REFERRAL_BONUS_TRIGGER_RULE,
        activatedUsers: 0,
        qualifiedUsers: 0,
        pendingUsers: 0,
        paidUsers: 0,
        earnedCents: 0,
        pendingCents: 0,
        paidOutCents: 0
      },
      earnings: {
        coachingRevenueCents: 0,
        referralBonusCents: 0,
        totalEarningsCents: 0
      },
      referredUsers: [],
      coachingClients: [],
      clientRoster: [],
      warnings: []
    },
    billing: billing || {
      referral: { code: '', link: '' },
      signups: [],
      payingSubscribers: [],
      monthly: [],
      currentMonth: {
        monthKey: formatMonthKey(new Date().toISOString()),
        label: formatMonthLabel(new Date().toISOString()),
        count: 0,
        payoutCents: 0,
        conversions: [],
        tier: {
          name: 'Starter',
          min: 0,
          nextAt: 3,
          remainingToNext: 3
        }
      },
      payoutPerPaidCents: TRAINER_PAYOUT_CENTS_PER_SUBSCRIPTION
    }
  };
}

async function listTrainerDirectory() {
  const result = await db.query(
    `
      SELECT
        u.id,
        u.username,
        u.display_name,
        rc.code AS referral_code,
        COALESCE(tp.full_name, u.display_name, u.username, 'Trainer') AS full_name,
        COALESCE(tp.contact_email, u.email, '') AS contact_email,
        tp.instagram_handle,
        tp.tiktok_handle,
        tp.brand_positioning,
        tp.client_types,
        tp.ideal_client,
        tp.differentiator,
        tp.online_coaching,
        tp.in_person_training,
        tp.monthly_coaching_price,
        tp.coaching_includes,
        tp.call_days,
        tp.call_time_slots,
        tp.call_timezone,
        tp.meta,
        tp.onboarding_completed_at,
        tp.updated_at,
        p.profile->'profile'->>'photoDataUrl' AS photo,
        (
          SELECT COUNT(*)::int
          FROM app_trainer_clients c
          WHERE c.trainer_user_id = u.id
            AND c.status <> 'removed'
        ) AS manual_client_count,
        (
          SELECT COUNT(*)::int
          FROM app_referrals r
          WHERE r.referrer_user_id = u.id
        ) AS signup_count,
        (
          SELECT COUNT(*)::int
          FROM app_referrals r
          JOIN LATERAL (
            SELECT MIN(g.created_at) AS first_paid_at
            FROM app_access_grants g
            WHERE g.user_id = r.referred_user_id
              AND COALESCE(g.amount_cents, 0) > 0
          ) paid ON paid.first_paid_at IS NOT NULL
          WHERE r.referrer_user_id = u.id
        ) AS paid_signup_count,
        (
          SELECT COUNT(*)::int
          FROM app_referrals r
          JOIN LATERAL (
            SELECT MIN(g.created_at) AS first_paid_at
            FROM app_access_grants g
            WHERE g.user_id = r.referred_user_id
              AND COALESCE(g.amount_cents, 0) > 0
          ) paid ON paid.first_paid_at IS NOT NULL
          WHERE r.referrer_user_id = u.id
            AND date_trunc('month', paid.first_paid_at) = date_trunc('month', now())
        ) AS current_month_paid_count
      FROM app_trainer_profiles tp
      JOIN app_users u ON u.id = tp.user_id
      LEFT JOIN app_referral_codes rc ON rc.user_id = u.id AND rc.active = true
      LEFT JOIN app_user_profiles p ON p.user_id = u.id
      WHERE tp.onboarding_completed_at IS NOT NULL
      ORDER BY tp.updated_at DESC, tp.onboarding_completed_at DESC
      LIMIT 120;
    `
  );

  return (result.rows || []).map((row) => {
    const currentMonthPaidCount = Math.max(0, Number(row.current_month_paid_count || 0));
    const tier = resolveTrainerTier(currentMonthPaidCount);
    const trainer = applyTrainerMetaToProfile({
      id: row.id,
      username: row.username || null,
      displayName: row.display_name || row.username || 'Trainer',
      fullName: row.full_name || row.display_name || row.username || 'Trainer',
      email: row.contact_email || '',
      instagramHandle: row.instagram_handle || '',
      tiktokHandle: row.tiktok_handle || '',
      brandPositioning: row.brand_positioning || '',
      clientTypes: row.client_types || '',
      idealClient: row.ideal_client || '',
      differentiator: row.differentiator || '',
      offer: {
        onlineCoaching: Boolean(row.online_coaching),
        inPersonTraining: Boolean(row.in_person_training),
        monthlyCoachingPrice: row.monthly_coaching_price == null ? null : Number(row.monthly_coaching_price),
        included: row.coaching_includes || ''
      },
      availability: {
        daysAvailable: Array.isArray(row.call_days) ? row.call_days : [],
        timeSlotsAvailable: Array.isArray(row.call_time_slots) ? row.call_time_slots : [],
        timeZone: row.call_timezone || ''
      },
      photoDataUrl: row.photo || null,
      proof: {
        manualClientCount: Math.max(0, Number(row.manual_client_count || 0)),
        signupCount: Math.max(0, Number(row.signup_count || 0)),
        paidSignupCount: Math.max(0, Number(row.paid_signup_count || 0)),
        currentMonthPaidCount,
        tier: {
          name: tier.name,
          nextAt: tier.nextAt,
          remainingToNext: tier.nextAt == null ? 0 : Math.max(0, tier.nextAt - currentMonthPaidCount)
        }
      },
      onboardingCompletedAt: row.onboarding_completed_at || null,
      updatedAt: row.updated_at || null,
      referralCode: normalizeReferralCode(row.referral_code || ''),
      meta: row.meta && typeof row.meta === 'object' ? row.meta : {}
    }, row.meta);
    const referralCode = normalizeReferralCode(row.referral_code || '');
    trainer.referralCode = referralCode;
    trainer.referralLink = referralCode ? `${process.env.APP_BASE_URL || ''}/index.html?ref=${encodeURIComponent(referralCode)}#signup` : '';
    trainer.photoDataUrl = trainer.photoDataUrl || row.photo || null;
    return trainer;
  });
}

function buildAuthUserFromRow(row) {
  if (!row) return null;
  const adminNotes = String(row.admin_notes || '').trim();
  const isDemo = notesHasFlag(adminNotes, 'demo');
  const isTech = isTechUser(row);
  const owner = isOwnerUser(row);
  const isTrainer = notesHasFlag(adminNotes, 'trainer') || owner;
  return {
    id: row.id,
    username: row.username || null,
    email: row.email || null,
    displayName: row.display_name || row.username || 'User',
    isOwner: owner,
    isTech,
    tech: { active: isTech },
    isDemo,
    demo: isDemo ? { active: true } : { active: false },
    isTrainer,
    trainer: { active: isTrainer }
  };
}

async function getTrainerReviewState(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return { reviewStatus: '', reviewNotice: null };
  const result = await db.query(
    `
      SELECT meta
      FROM app_trainer_profiles
      WHERE user_id = $1
      LIMIT 1;
    `,
    [uid]
  );
  const meta = cleanObject(result.rows?.[0]?.meta || {});
  return {
    reviewStatus: String(meta.reviewStatus || '').trim().toLowerCase(),
    reviewNotice: buildTrainerReviewNotice(meta)
  };
}

async function buildAuthUserFromRowAsync(row) {
  const user = buildAuthUserFromRow(row);
  if (!user?.id || !db.isConfigured()) return user;
  try {
    const trainerState = await getTrainerReviewState(user.id);
    user.trainer = {
      ...(user.trainer || {}),
      reviewStatus: trainerState.reviewStatus || '',
      reviewNotice: trainerState.reviewNotice || null
    };
  } catch {
    // ignore trainer review lookup failures
  }
  return user;
}

function formatAccessRemainingLabel(secondsRaw) {
  const seconds = Math.max(0, Math.floor(Number(secondsRaw) || 0));
  if (seconds <= 0) return 'expired';
  const hours = Math.floor(seconds / 3600);
  if (hours >= 48) return `${Math.ceil(hours / 24)} days`;
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.ceil(seconds / 60))}m`;
}

function buildReferralTier(qualifiedCountRaw) {
  const qualifiedCount = Math.max(0, Number(qualifiedCountRaw || 0));
  if (qualifiedCount >= 8) {
    return {
      grantDays: 365,
      nextTier: null,
      nextRemainingCount: 0
    };
  }
  if (qualifiedCount >= 4) {
    return {
      grantDays: 30,
      nextTier: { rewardKey: 'referral_8', required: 8, days: 365, label: '1 year' },
      nextRemainingCount: Math.max(0, 8 - qualifiedCount)
    };
  }
  if (qualifiedCount >= 2) {
    return {
      grantDays: 7,
      nextTier: { rewardKey: 'referral_4', required: 4, days: 30, label: '30 days' },
      nextRemainingCount: Math.max(0, 4 - qualifiedCount)
    };
  }
  return {
    grantDays: 0,
    nextTier: { rewardKey: 'referral_2', required: REFERRAL_GOAL_COUNT, days: 7, label: '7 days' },
    nextRemainingCount: Math.max(0, REFERRAL_GOAL_COUNT - qualifiedCount)
  };
}

async function syncUserBillingFields(userId, fields = {}) {
  const uid = String(userId || '').trim();
  if (!uid || !fields || typeof fields !== 'object') return null;
  const columnMap = {
    stripeCustomerId: 'stripe_customer_id',
    stripeSubscriptionId: 'stripe_subscription_id',
    stripePriceId: 'stripe_price_id',
    accessType: 'access_type',
    accessEndsAt: 'access_ends_at',
    subscriptionStatus: 'subscription_status',
    billingName: 'billing_name',
    billingEmail: 'billing_email',
    billingZip: 'billing_zip',
    billingLine1: 'billing_line1',
    billingCity: 'billing_city',
    billingCountry: 'billing_country'
  };
  const sets = [];
  const values = [uid];
  for (const [key, column] of Object.entries(columnMap)) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    values.push(fields[key] == null ? null : fields[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (!sets.length) return null;
  sets.push('updated_at = now()');
  await db.query(
    `
      UPDATE app_users
      SET ${sets.join(', ')}
      WHERE id = $1;
    `,
    values
  );
  return true;
}

async function saveUserPaymentMethod(userId, payload = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const result = await db.query(
    `
      INSERT INTO app_user_payment_methods (
        user_id,
        payment_type,
        wallet_type,
        brand,
        last4,
        exp_month,
        exp_year,
        display_label,
        is_demo,
        meta,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
      RETURNING
        id,
        user_id,
        payment_type,
        wallet_type,
        brand,
        last4,
        exp_month,
        exp_year,
        display_label,
        is_demo,
        meta,
        created_at,
        updated_at;
    `,
    [
      uid,
      String(payload.paymentType || 'card').trim().toLowerCase(),
      payload.walletType ? String(payload.walletType).trim().toLowerCase() : null,
      payload.brand ? String(payload.brand).trim() : null,
      payload.last4 ? String(payload.last4).trim().slice(-4) : null,
      Number.isFinite(Number(payload.expMonth)) ? Number(payload.expMonth) : null,
      Number.isFinite(Number(payload.expYear)) ? Number(payload.expYear) : null,
      payload.displayLabel ? String(payload.displayLabel).trim() : null,
      payload.isDemo === true,
      JSON.stringify(payload.meta && typeof payload.meta === 'object' ? payload.meta : {})
    ]
  );
  const row = result.rows?.[0] || null;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    paymentType: row.payment_type,
    walletType: row.wallet_type,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    displayLabel: row.display_label,
    isDemo: Boolean(row.is_demo),
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function grantAccessGrant(userId, options = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const rewardKey = String(options.rewardKey || '').trim() || null;
  const days = Math.max(0, Number(options.days || 0));
  const amountCents = Number.isFinite(Number(options.amountCents)) ? Number(options.amountCents) : null;
  const meta = options.meta && typeof options.meta === 'object' ? options.meta : {};
  const existingAccess = await getUserAccessState(uid);
  const nowMs = Date.now();
  const currentEndsMs = Date.parse(String(existingAccess?.currentAccessEndsAt || ''));
  const startsAtMs = Number.isFinite(currentEndsMs) && currentEndsMs > nowMs ? currentEndsMs : nowMs;
  const endsAt = String(options.endsAt || '').trim() || new Date(startsAtMs + (days * 24 * 60 * 60 * 1000)).toISOString();

  let result;
  if (rewardKey) {
    result = await db.query(
      `
        INSERT INTO app_access_grants (
          user_id,
          source,
          reward_key,
          days,
          starts_at,
          ends_at,
          amount_cents,
          meta,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
        ON CONFLICT (reward_key) DO UPDATE SET
          days = EXCLUDED.days,
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          amount_cents = EXCLUDED.amount_cents,
          meta = EXCLUDED.meta,
          updated_at = now()
        RETURNING id, user_id, source, reward_key, days, starts_at, ends_at, amount_cents, meta, created_at, updated_at;
      `,
      [
        uid,
        String(options.source || 'manual').trim().slice(0, 80) || 'manual',
        rewardKey,
        days,
        new Date(startsAtMs).toISOString(),
        endsAt,
        amountCents,
        JSON.stringify({ ...meta, days })
      ]
    );
  } else {
    result = await db.query(
      `
        INSERT INTO app_access_grants (
          user_id,
          source,
          days,
          starts_at,
          ends_at,
          amount_cents,
          meta,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
        RETURNING id, user_id, source, reward_key, days, starts_at, ends_at, amount_cents, meta, created_at, updated_at;
      `,
      [
        uid,
        String(options.source || 'manual').trim().slice(0, 80) || 'manual',
        days,
        new Date(startsAtMs).toISOString(),
        endsAt,
        amountCents,
        JSON.stringify({ ...meta, days })
      ]
    );
  }

  await syncUserBillingFields(uid, {
    accessType: meta.planCode ? String(meta.planCode).trim().toLowerCase() : undefined,
    accessEndsAt: endsAt
  });

  const row = result.rows?.[0] || null;
  if (!row) return null;
  const planCode = String(meta.planCode || '').trim().toLowerCase();
  const source = String(options.source || '').trim().toLowerCase();
  if (planCode === 'monthly_subscription' || source === 'stripe_subscription') {
    await qualifyReferralFromMonthlyMembership(uid, {
      planCode,
      source: source || 'monthly_subscription'
    }).catch(() => null);
  }
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    rewardKey: row.reward_key || null,
    days: Number(row.days || days || 0),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || endsAt,
    amountCents: Number(row.amount_cents || amountCents || 0),
    amount_cents: Number(row.amount_cents || amountCents || 0),
    meta: row.meta && typeof row.meta === 'object'
      ? row.meta
      : { ...meta, days }
  };
}

async function getUserAccessState(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;

  const userResult = await db.query(
    `
      SELECT
        id,
        created_at,
        COALESCE(access_type, '') AS access_type,
        access_ends_at,
        COALESCE(subscription_status, '') AS subscription_status,
        COALESCE(admin_notes, '') AS admin_notes
      FROM app_users
      WHERE id = $1
      LIMIT 1;
    `,
    [uid]
  );
  const userRow = userResult.rows?.[0] || null;
  if (!userRow) return null;

  const referralCountsResult = await db.query(
    `
      SELECT
        COUNT(*)::int AS signup_count,
        COUNT(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS qualified_count
      FROM app_referrals
      WHERE referrer_user_id = $1;
    `,
    [uid]
  );
  const referralCounts = referralCountsResult.rows?.[0] || {};
  const signupCount = Number(referralCounts.signup_count || 0);
  const qualifiedCount = Number(referralCounts.qualified_count || 0);
  const referralTier = buildReferralTier(qualifiedCount);

  const grantSummaryResult = await db.query(
    `
      SELECT
        MAX(ends_at) AS max_ends_at,
        BOOL_OR(
          reward_key = 'stripe_quick_unlock_once'
          OR COALESCE(meta->>'planCode', '') = 'quick_unlock'
        ) AS quick_unlock_redeemed
      FROM app_access_grants
      WHERE user_id = $1;
    `,
    [uid]
  );
  const grantSummary = grantSummaryResult.rows?.[0] || {};

  const latestGrantResult = await db.query(
    `
      SELECT
        ends_at,
        amount_cents,
        reward_key,
        meta,
        COALESCE(meta->>'planCode', '') AS plan_code
      FROM app_access_grants
      WHERE user_id = $1
      ORDER BY COALESCE(ends_at, created_at) DESC, created_at DESC
      LIMIT 1;
    `,
    [uid]
  );
  const latestGrant = latestGrantResult.rows?.[0] || null;

  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const createdMs = Date.parse(String(userRow.created_at || ''));
  const trialStartedMs = Number.isFinite(createdMs) ? createdMs : nowMs;
  const trialEndsMs = trialStartedMs + (TRIAL_DAYS * dayMs);
  const storedGrantEndsMs = Date.parse(String(userRow.access_ends_at || ''));
  const rowGrantEndsMs = Date.parse(String(grantSummary.max_ends_at || ''));
  const referralEndsMs = referralTier.grantDays > 0 ? (trialStartedMs + (referralTier.grantDays * dayMs)) : NaN;
  const activeGrantEndsMs = Math.max(
    Number.isFinite(storedGrantEndsMs) ? storedGrantEndsMs : 0,
    Number.isFinite(rowGrantEndsMs) ? rowGrantEndsMs : 0,
    Number.isFinite(referralEndsMs) ? referralEndsMs : 0
  );
  const ownerFreeTraining = isOwnerUser(userRow) || notesHasFlag(userRow.admin_notes, 'free_training');
  const trialActive = trialEndsMs > nowMs;
  const grantActive = activeGrantEndsMs > nowMs;
  const hasAccess = ownerFreeTraining || trialActive || grantActive;
  const currentEndsMs = Math.max(
    Number.isFinite(trialEndsMs) ? trialEndsMs : 0,
    Number.isFinite(activeGrantEndsMs) ? activeGrantEndsMs : 0
  );
  const accessRemainingSeconds = hasAccess && Number.isFinite(currentEndsMs)
    ? Math.max(0, Math.floor((currentEndsMs - nowMs) / 1000))
    : 0;
  const accessSource = ownerFreeTraining
    ? 'free_training'
    : (grantActive && activeGrantEndsMs >= trialEndsMs ? 'grant' : 'trial');
  const accessType = ownerFreeTraining
    ? 'free_training'
    : ((grantActive && activeGrantEndsMs >= trialEndsMs)
        ? (String(latestGrant?.plan_code || userRow.access_type || (referralTier.grantDays > 0 ? 'referral' : 'access')).trim().toLowerCase() || 'access')
        : 'trial');

  return {
    ok: true,
    hasAccess,
    trialActive,
    trialDays: TRIAL_DAYS,
    trialStartedAt: new Date(trialStartedMs).toISOString(),
    trialEndsAt: new Date(trialEndsMs).toISOString(),
    currentAccessEndsAt: hasAccess && Number.isFinite(currentEndsMs) ? new Date(currentEndsMs).toISOString() : null,
    accessEndsAt: hasAccess && Number.isFinite(currentEndsMs) ? new Date(currentEndsMs).toISOString() : null,
    accessRemainingSeconds,
    accessRemainingLabel: ownerFreeTraining ? 'active' : formatAccessRemainingLabel(accessRemainingSeconds),
    accessSource,
    accessType,
    freeTrainingEnabled: ownerFreeTraining,
    quickUnlock: {
      redeemed: Boolean(grantSummary.quick_unlock_redeemed),
      days: DIRECT_UNLOCK_DAYS,
      amountCents: QUICK_UNLOCK_PRICE_CENTS
    },
    referrals: {
      signupCount,
      qualifiedCount,
      nextTier: referralTier.nextTier,
      nextRemainingCount: referralTier.nextRemainingCount
    },
    offers: {
      quickUnlock: { amountCents: QUICK_UNLOCK_PRICE_CENTS },
      monthlySubscription: { amountCents: MONTHLY_SUBSCRIPTION_PRICE_CENTS },
      annualAccess: { amountCents: ANNUAL_ACCESS_PRICE_CENTS }
    },
    billing: {
      accessType: userRow.access_type || null,
      subscriptionStatus: userRow.subscription_status || null
    }
  };
}

function buildOwnerDemoCredentials() {
  const suffix = crypto.randomBytes(4).toString('hex');
  return {
    username: `demo_${suffix}`,
    password: `Demo!${crypto.randomBytes(6).toString('base64url')}`
  };
}
function queueOnboardingEmails(userLike, source = 'signup_local') {
  const email = normalizeEmail(userLike?.email);
  if (!email) return;
  const displayName = String(userLike?.display_name || userLike?.displayName || userLike?.username || '').trim();
  const onboarding = buildOnboardingEmailPayload({ displayName });
  const profileProps = {
    ode_lifecycle_stage: 'member_free',
    ode_nurture_channel: 'self_paced_to_coaching',
    ode_signup_source: String(source || 'signup_local')
  };
  const eventProps = {
    source: String(source || 'signup_local'),
    onboarding
  };
  emitKlaviyoEvent({
    eventName: 'Account Created',
    email,
    phone: userLike?.phone || '',
    displayName,
    eventProps,
    profileProps
  }).catch(() => {});
  emitKlaviyoEvent({
    eventName: 'Lead Nurture Channel Enrolled',
    email,
    phone: userLike?.phone || '',
    displayName,
    eventProps: {
      channel: 'self_paced_to_coaching',
      lifecycleStage: 'member_free',
      source: String(source || 'signup_local')
    },
    profileProps
  }).catch(() => {});
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
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearCookieHeader(req) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function setNamedCookieHeader(name, value, req, maxAgeSeconds) {
  const cookieName = String(name || '').trim();
  if (!cookieName) return '';
  const maxAge = Number.isFinite(Number(maxAgeSeconds))
    ? Math.max(0, Math.floor(Number(maxAgeSeconds)))
    : SESSION_TTL_DAYS * 24 * 60 * 60;
  const parts = [
    `${cookieName}=${encodeURIComponent(String(value || ''))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearNamedCookieHeader(name, req) {
  const cookieName = String(name || '').trim();
  if (!cookieName) return '';
  const parts = [
    `${cookieName}=`,
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

async function readRawBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function logTransientDbError(err, context) {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return;
  const key = String(context || 'unknown');
  const now = Date.now();
  const last = Number(authTransientLogByContext.get(key) || 0);
  if (now - last < AUTH_TRANSIENT_LOG_THROTTLE_MS) return;
  authTransientLogByContext.set(key, now);
  const d = db.getDiagnostics ? db.getDiagnostics() : {};
  console.warn('[auth][db-transient]', {
    context: key,
    code: err?.code || null,
    message: err?.message || String(err),
    sslEnabled: Boolean(d?.sslEnabled),
    totalCount: Number(d?.totalCount || 0),
    idleCount: Number(d?.idleCount || 0),
    waitingCount: Number(d?.waitingCount || 0)
  });
}

function sendDbUnavailable(res) {
  return sendJson(res, 503, {
    ok: false,
    error: 'DB_UNAVAILABLE',
    message: 'Service temporarily unavailable. Try again.'
  });
}

async function handleAccountsList(req, res, url) {
  const user = await getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return true;
  }

  const q = String(url.searchParams.get('q') || '').trim();
  const limitParam = Number(url.searchParams.get('limit') || 0);
  const searchLimit = Math.min(250, Math.max(1, limitParam || 50));
  let rows = [];
  if (q) {
    const pattern = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.display_name,
               u.last_seen,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE u.id <> $2
          AND (
            username ILIKE $1
            OR display_name ILIKE $1
          )
        ORDER BY display_name ASC, username ASC
        LIMIT $3;
      `,
      [pattern, user.id, searchLimit]
    );
    rows = result.rows || [];
  } else {
    const countResult = await db.query('SELECT COUNT(*)::int AS count FROM app_users;');
    const totalCountRaw = Number(countResult.rows?.[0]?.count || 0);
    const totalCount = Math.max(0, totalCountRaw - 1);
    const cap = 5000;
    const listLimit = totalCount >= cap ? 250 : Math.min(totalCount || 0, cap);
    const result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.display_name,
               u.last_seen,
               p.profile->'profile'->>'photoDataUrl' AS photo
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        WHERE u.id <> $1
        ORDER BY u.created_at DESC
        LIMIT $2;
      `,
      [user.id, listLimit]
    );
    rows = result.rows || [];
    sendJson(res, 200, {
      ok: true,
      count: rows.length,
      total: totalCount,
      capped: totalCount >= cap,
      accounts: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        photoDataUrl: row.photo || null,
        lastSeen: row.last_seen || null,
        isOnline: isLastSeenOnline(row.last_seen)
      }))
    });
    return true;
  }

  sendJson(res, 200, {
    ok: true,
    count: rows.length,
    total: rows.length,
    capped: false,
    accounts: rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      photoDataUrl: row.photo || null,
      lastSeen: row.last_seen || null,
      isOnline: isLastSeenOnline(row.last_seen)
    }))
  });
  return true;
}

async function requireOwnerActor(req, res) {
  const actor = await getUserFromRequest(req);
  if (!actor) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return null;
  }
  if (!actor.isOwner) {
    sendJson(res, 403, { ok: false, error: 'OWNER_REQUIRED' });
    return null;
  }
  return actor;
}

async function requireTrainerActor(req, res) {
  const actor = await getUserFromRequest(req);
  if (!actor) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return null;
  }
  const profile = await getTrainerProfile(actor.id);
  if (!actor?.isTrainer && !profile) {
    sendJson(res, 403, { ok: false, error: 'TRAINER_REQUIRED' });
    return null;
  }
  return actor;
}

async function handleTrainerDashboard(req, res) {
  const actor = await getUserFromRequest(req);
  if (!actor) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
  const dashboard = await getTrainerDashboard(req, actor);
  return sendJson(res, 200, dashboard || { ok: true, isTrainer: false });
}

async function handleTrainerDirectoryList(req, res) {
  const trainers = await listTrainerDirectory();
  return sendJson(res, 200, { ok: true, trainers });
}

async function requireReviewAdminActor(req, res) {
  const actor = await getUserFromRequest(req);
  if (!actor) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return null;
  }
  if (!actor.isOwner && !actor.isTech) {
    sendJson(res, 403, { ok: false, error: 'OWNER_OR_ADMIN_REQUIRED' });
    return null;
  }
  return actor;
}

async function applyTrainerReviewDecision(trainerUserId, decision, reason = '') {
  const uid = String(trainerUserId || '').trim();
  const status = String(decision || '').trim().toLowerCase();
  if (!uid) throw new Error('Trainer id required.');
  if (status !== 'approved' && status !== 'denied') throw new Error('Invalid review decision.');
  const current = await db.query(
    `
      SELECT meta
      FROM app_trainer_profiles
      WHERE user_id = $1
      LIMIT 1;
    `,
    [uid]
  );
  const currentRow = current.rows?.[0];
  if (!currentRow) throw new Error('Trainer profile not found.');
  const currentMeta = currentRow.meta && typeof currentRow.meta === 'object' ? currentRow.meta : {};
  const currentReviewStatus = String(currentMeta.reviewStatus || '').trim().toLowerCase();
  const currentDecision = String(currentMeta.reviewDecisionStatus || '').trim().toLowerCase();
  if (currentReviewStatus !== 'review') {
    if (currentDecision === 'approved') throw new Error('This trainer has already been approved.');
    if (currentDecision === 'denied') throw new Error('This trainer has already been denied.');
    throw new Error('This trainer is not waiting for review.');
  }
  if (status === 'denied' && !String(reason || '').trim()) {
    throw new Error('A denial reason is required.');
  }
  const timestamp = new Date().toISOString();
  const nextMeta = normalizeTrainerMeta({
    ...currentMeta,
    reviewStatus: status === 'approved' ? '' : 'denied',
    reviewSubmittedAt: '',
    reviewDecisionStatus: status,
    reviewDecisionReason: status === 'denied' ? String(reason || '').trim() : '',
    reviewDecisionAt: timestamp,
    reviewDecisionSeenAt: '',
    reviewNeedsResubmission: status === 'denied'
  });
  await db.query(
    `
      UPDATE app_trainer_profiles
      SET meta = $2::jsonb,
          onboarding_completed_at = CASE
            WHEN $3 = 'denied' THEN NULL
            ELSE COALESCE(onboarding_completed_at, now())
          END,
          updated_at = now()
      WHERE user_id = $1;
    `,
    [uid, JSON.stringify(nextMeta), status]
  );
  await syncUserAdminFlag(uid, 'trainer', status === 'approved');
  return await getTrainerProfile(uid);
}

async function handleTrainerReviewApprove(req, res) {
  const actor = await requireReviewAdminActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  try {
    const trainer = await applyTrainerReviewDecision(payload?.trainerUserId || payload?.trainerId, 'approved');
    return sendJson(res, 200, { ok: true, trainer });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not approve trainer.' });
  }
}

async function handleTrainerReviewDeny(req, res) {
  const actor = await requireReviewAdminActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  try {
    const trainer = await applyTrainerReviewDecision(
      payload?.trainerUserId || payload?.trainerId,
      'denied',
      payload?.reason
    );
    return sendJson(res, 200, { ok: true, trainer });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not deny trainer.' });
  }
}

async function handleTrainerReviewNoticeSeen(req, res) {
  const actor = await getUserFromRequest(req);
  if (!actor) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
  const current = await db.query(
    `
      SELECT meta
      FROM app_trainer_profiles
      WHERE user_id = $1
      LIMIT 1;
    `,
    [actor.id]
  );
  const currentRow = current.rows?.[0];
  if (!currentRow) return sendJson(res, 200, { ok: true, reviewNotice: null });
  const nextMeta = normalizeTrainerMeta({
    ...(currentRow.meta && typeof currentRow.meta === 'object' ? currentRow.meta : {}),
    reviewDecisionSeenAt: new Date().toISOString()
  });
  await db.query(
    `
      UPDATE app_trainer_profiles
      SET meta = $2::jsonb,
          updated_at = now()
      WHERE user_id = $1;
    `,
    [actor.id, JSON.stringify(nextMeta)]
  );
  return sendJson(res, 200, { ok: true, reviewNotice: buildTrainerReviewNotice(nextMeta) });
}

async function handleTrainerOnboarding(req, res) {
  const actor = await getUserFromRequest(req);
  if (!actor) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  try {
    const trainer = await upsertTrainerProfile(actor, {
      ...(payload && typeof payload === 'object' ? payload : {}),
      reviewStatus: 'review',
      reviewSubmittedAt: new Date().toISOString(),
      reviewDecisionStatus: '',
      reviewDecisionReason: '',
      reviewDecisionAt: '',
      reviewDecisionSeenAt: '',
      reviewNeedsResubmission: false
    });
    return sendJson(res, 200, {
      ok: true,
      trainer,
      user: {
        ...actor,
        isTrainer: true,
        trainer: { active: true, reviewStatus: 'review' }
      }
    });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not save trainer onboarding.' });
  }
}

async function handleTrainerStripeSave(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  const trainer = await saveTrainerStripeProfile(actor.id, payload);
  return sendJson(res, 200, { ok: true, trainer });
}

async function startTrainerStripeConnectFlow(req, actor, modeRaw = '') {
  const mode = String(modeRaw || '').trim().toLowerCase();
  const accountId = await getOrCreateTrainerStripeConnectedAccount(actor);
  const account = await fetchStripeConnectedAccount(accountId);
  const trainer = await syncTrainerStripeFromAccount(actor.id, account);
  const readiness = buildTrainerStripeReadiness(trainer?.stripe || {});

  if (mode === 'manage' && readiness.state === 'ready') {
    const loginUrl = await createStripeExpressLoginLink(accountId).catch(() => '');
    return {
      trainer,
      stripe: readiness,
      url: loginUrl || trainer?.stripe?.dashboardUrl || 'https://dashboard.stripe.com/',
      mode: 'manage'
    };
  }

  const onboardingUrl = await createTrainerStripeOnboardingLink(req, actor, accountId);
  return {
    trainer,
    stripe: readiness,
    url: onboardingUrl,
    mode: readiness.state === 'not_connected' ? 'connect' : 'continue'
  };
}

async function handleStripeSummary(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const payload = await getTrainerStripeSummary(actor);
    return sendJson(res, 200, { ok: true, ...payload });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not load Stripe summary.' });
  }
}

async function handleStripeDisputes(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const payload = await getTrainerStripeDisputes(actor);
    return sendJson(res, 200, { ok: true, ...payload });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not load Stripe disputes.' });
  }
}

async function handleStripeTransactions(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const payload = await getTrainerStripeTransactions(actor);
    return sendJson(res, 200, { ok: true, ...payload });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not load Stripe transactions.' });
  }
}

async function handleStripeInvoices(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const payload = await getTrainerStripeInvoices(actor);
    return sendJson(res, 200, { ok: true, ...payload });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not load Stripe invoices.' });
  }
}

async function handleTrainerSales(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const payload = await getTrainerSales(actor);
    return sendJson(res, 200, { ok: true, ...payload });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not load sales.' });
  }
}

async function handleTrainerStripeConnect(req, res, url) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const mode = String(url.searchParams.get('mode') || '').trim().toLowerCase();
    const next = await startTrainerStripeConnectFlow(req, actor, mode);
    res.writeHead(302, { Location: next.url });
    res.end();
    return true;
  } catch (err) {
    const message = cleanShortText(err?.message || 'Stripe setup failed.', 220) || 'Stripe setup failed.';
    const redirect = `/trainer-dashboard.html?stripe_error=${encodeURIComponent(message)}`;
    res.writeHead(302, { Location: redirect });
    res.end();
    return true;
  }
}

async function handleStripeConnectStart(req, res, url) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const mode = String(
      url.searchParams.get('mode')
      || (req.method === 'POST'
        ? (await readJsonBody(req).catch(() => ({})))?.mode
        : '')
      || ''
    ).trim().toLowerCase();
    const next = await startTrainerStripeConnectFlow(req, actor, mode);
    if (req.method === 'GET') {
      res.writeHead(302, { Location: next.url });
      res.end();
      return true;
    }
    return sendJson(res, 200, {
      ok: true,
      onboardingUrl: next.url,
      stripe: next.stripe,
      trainer: next.trainer
    });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Stripe setup failed.' });
  }
}

async function handleTrainerStripeRefresh(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const profile = await getTrainerProfile(actor.id);
    const accountId = cleanShortText(profile?.stripe?.connectedAccountId || profile?.stripe?.accountId, 120);
    if (!accountId) {
      const trainer = await syncTrainerStripeFromAccount(actor.id, {});
      return sendJson(res, 200, { ok: true, trainer, stripe: buildTrainerStripeReadiness(trainer?.stripe || {}) });
    }
    const account = await fetchStripeConnectedAccount(accountId);
    const trainer = await syncTrainerStripeFromAccount(actor.id, account);
    return sendJson(res, 200, { ok: true, trainer, stripe: buildTrainerStripeReadiness(trainer?.stripe || {}) });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not refresh Stripe status.' });
  }
}

async function handleStripeConnectStatus(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  try {
    const profile = await getTrainerProfile(actor.id);
    const accountId = cleanShortText(profile?.stripe?.connectedAccountId || profile?.stripe?.accountId, 120);
    if (!accountId) {
      const trainer = await syncTrainerStripeFromAccount(actor.id, {});
      return sendJson(res, 200, {
        ok: true,
        trainer,
        stripe: buildTrainerStripeReadiness(trainer?.stripe || {})
      });
    }
    const account = await fetchStripeConnectedAccount(accountId);
    const trainer = await syncTrainerStripeFromAccount(actor.id, account);
    return sendJson(res, 200, {
      ok: true,
      trainer,
      stripe: buildTrainerStripeReadiness(trainer?.stripe || {})
    });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not read Stripe status.' });
  }
}

async function handleTrainerClientCreate(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  try {
    const client = await addTrainerClient(actor, payload);
    const clients = await listTrainerClients(actor.id);
    return sendJson(res, 200, { ok: true, client, clients });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not add client.' });
  }
}

async function handleTrainerClientDelete(req, res, clientId) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  const ok = await removeTrainerClient(actor, clientId);
  if (!ok) return sendJson(res, 404, { ok: false, error: 'Client not found.' });
  const clients = await listTrainerClients(actor.id);
  return sendJson(res, 200, { ok: true, clients });
}

async function handleTrainerAppInviteCreate(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  try {
    const created = await createTrainerInvite(actor, req, payload, 'app_invite');
    return sendJson(res, 200, { ok: true, ...created });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not create app invite.' });
  }
}

async function handleTrainerCoachingInviteCreate(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  try {
    const created = await createTrainerInvite(actor, req, payload, 'coaching_invite');
    return sendJson(res, 200, { ok: true, ...created });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not create coaching invite.' });
  }
}

async function handleTrainerProfileViewTrack(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  const trainerUserId = String(payload?.trainerUserId || '').trim();
  if (!trainerUserId) return sendJson(res, 400, { ok: false, error: 'Trainer id required.' });
  const actor = await getUserFromRequest(req);
  if (actor && String(actor.id || '').trim() === trainerUserId) {
    return sendJson(res, 200, { ok: true, ignored: true });
  }
  await recordTrainerEvent(trainerUserId, 'trainer_profile_view', {
    subjectUserId: actor?.id || null,
    metadata: {
      trainerHandle: cleanShortText(payload?.trainerHandle, 80) || null
    }
  });
  return sendJson(res, 200, { ok: true });
}

async function handleTrainerEventTrack(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  const eventType = cleanShortText(payload?.eventType, 80);
  if (!eventType) return sendJson(res, 400, { ok: false, error: 'Event type required.' });
  await recordTrainerEvent(actor.id, eventType, {
    inviteId: payload?.inviteId || null,
    subjectUserId: payload?.subjectUserId || null,
    metadata: cleanObject(payload?.metadata)
  });
  return sendJson(res, 200, { ok: true });
}

async function handleTrainerProductsList(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  const products = (await listTrainerProducts(actor.id)).map((product) => ({
    ...product,
    links: buildTrainerProductPublicUrls(req, product.publicToken)
  }));
  return sendJson(res, 200, { ok: true, products });
}

async function handleTrainerProductCreate(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  try {
    const product = await createTrainerProductWithStripe(actor.id, payload);
    const products = (await listTrainerProducts(actor.id)).map((entry) => ({
      ...entry,
      links: buildTrainerProductPublicUrls(req, entry.publicToken)
    }));
    return sendJson(res, 200, {
      ok: true,
      product: product ? { ...product, links: buildTrainerProductPublicUrls(req, product.publicToken) } : null,
      products
    });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not create product.' });
  }
}

async function handleTrainerProductsDelete(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  const ids = Array.isArray(payload?.ids) ? payload.ids : [];
  const deleted = await deleteTrainerProducts(actor.id, ids);
  const products = (await listTrainerProducts(actor.id)).map((product) => ({
    ...product,
    links: buildTrainerProductPublicUrls(req, product.publicToken)
  }));
  return sendJson(res, 200, { ok: true, deleted, products });
}

async function handlePublicTrainerProductGet(req, res, url) {
  const token = String(url.searchParams.get('token') || '').trim();
  if (!token) return sendJson(res, 400, { ok: false, error: 'Missing product token.' });
  const product = await getPublicTrainerProductByToken(token);
  if (!product) return sendJson(res, 404, { ok: false, error: 'Product not found.' });
  return sendJson(res, 200, {
    ok: true,
    product: {
      ...product,
      links: buildTrainerProductPublicUrls(req, product.publicToken)
    }
  });
}

async function handlePublicTrainerProductCheckout(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  const token = String(payload?.token || '').trim();
  if (!token) return sendJson(res, 400, { ok: false, error: 'Missing product token.' });
  const product = await getPublicTrainerProductByToken(token);
  if (!product) return sendJson(res, 404, { ok: false, error: 'Product not found.' });
  try {
    const discountPercent = normalizeDiscountPercent(payload?.discountPercent);
    const checkout = await createPublicTrainerProductCheckoutSession(req, product, {
      discountPercent,
      clientUserId: payload?.clientUserId || payload?.client_user_id || ''
    });
    if (checkout?.sessionId) {
      await upsertTrainerProductOrder({
        trainerUserId: product.trainerUserId,
        trainerProductId: product.id,
        clientUserId: payload?.clientUserId || payload?.client_user_id || '',
        stripeCheckoutSessionId: checkout.sessionId,
        amountCents: Math.max(0, Math.round(Number(product.price || 0) * ((100 - discountPercent) / 100) * 100)),
        currency: stripePriceCurrency(),
        status: 'pending',
        metadata: {
          discountPercent
        }
      });
    }
    return sendJson(res, 200, {
      ok: true,
      checkout,
      product: {
        id: product.id,
        publicToken: product.publicToken,
        name: product.name,
        paymentType: product.paymentType,
        discountPercent
      }
    });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not start checkout.' });
  }
}

async function handlePublicTrainerProductCheckoutVerify(req, res, url) {
  const token = String(url.searchParams.get('token') || '').trim();
  const sessionId = String(url.searchParams.get('session_id') || '').trim();
  if (!token) return sendJson(res, 400, { ok: false, error: 'Missing product token.' });
  if (!sessionId) return sendJson(res, 400, { ok: false, error: 'Missing session id.' });
  try {
    const result = await verifyPublicTrainerProductCheckoutSession(token, sessionId);
    if (!result?.ok) {
      return sendJson(res, 400, { ok: false, error: result?.error || 'Could not verify checkout.' });
    }
    return sendJson(res, 200, { ok: true, order: result.order, product: result.product });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not verify checkout.' });
  }
}

async function handleTrainerProductsCreateAlias(req, res) {
  const actor = await requireTrainerActor(req, res);
  if (!actor) return true;
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  try {
    const product = await createTrainerProductWithStripe(actor.id, {
      name: payload?.name,
      description: payload?.description,
      price: payload?.price,
      paymentType: payload?.billing_type === 'recurring' ? 'recurring' : 'one_time',
      billingIntervalUnit: payload?.interval || 'month',
      billingIntervalCount: 1
    });
    const products = await listTrainerProducts(actor.id);
    return sendJson(res, 200, { ok: true, product, products });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not create product.' });
  }
}

async function handleCheckoutCreateSession(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  const trainerId = String(payload?.trainer_id || payload?.trainerId || '').trim();
  const productId = String(payload?.product_id || payload?.productId || '').trim();
  if (!trainerId || !productId) {
    return sendJson(res, 400, { ok: false, error: 'trainer_id and product_id are required.' });
  }
  const result = await db.query(
    `
      SELECT
        p.id,
        p.trainer_user_id,
        p.public_token
      FROM app_trainer_products p
      WHERE p.id = $1
        AND p.trainer_user_id = $2
      LIMIT 1;
    `,
    [productId, trainerId]
  );
  const row = result.rows?.[0] || null;
  if (!row) return sendJson(res, 404, { ok: false, error: 'Product not found.' });
  const product = await getPublicTrainerProductByToken(row.public_token);
  if (!product) return sendJson(res, 404, { ok: false, error: 'Product not found.' });
  try {
    const checkout = await createPublicTrainerProductCheckoutSession(req, product, {
      clientUserId: payload?.client_user_id || payload?.clientUserId || ''
    });
    if (checkout?.sessionId) {
      await upsertTrainerProductOrder({
        trainerUserId: product.trainerUserId,
        trainerProductId: product.id,
        clientUserId: payload?.client_user_id || payload?.clientUserId || '',
        stripeCheckoutSessionId: checkout.sessionId,
        amountCents: Math.max(0, Math.round(Number(product.price || 0) * 100)),
        currency: stripePriceCurrency(),
        status: 'pending',
        metadata: {
          createdVia: 'api_checkout_create_session'
        }
      });
    }
    return sendJson(res, 200, { ok: true, checkout_url: checkout.url, sessionId: checkout.sessionId });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Could not create checkout session.' });
  }
}

async function handleStripeWebhook(req, res) {
  const secret = stripeWebhookSecret();
  if (!secret) return sendJson(res, 501, { ok: false, error: 'Stripe webhook secret not configured.' });
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err?.message || 'Invalid webhook body.' });
  }
  const sigHeader = req.headers['stripe-signature'];
  if (!verifyStripeWebhookSignature(rawBody, sigHeader, secret)) {
    return sendJson(res, 400, { ok: false, error: 'Invalid Stripe signature.' });
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Invalid webhook payload.' });
  }
  await handleStripeWebhookEvent(event);
  return sendJson(res, 200, { ok: true, received: true });
}

async function handleOwnerAccountsList(req, res, url) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;

  const q = String(url.searchParams.get('q') || '').trim();
  const limitParam = Number(url.searchParams.get('limit') || 0);
  const limit = Math.max(1, Math.min(10000, limitParam || 2000));
  const values = [actor.id];
  let whereSql = '';
  if (q) {
    const qIndex = values.push(`%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
    whereSql = `WHERE (u.username ILIKE $${qIndex} OR u.display_name ILIKE $${qIndex} OR u.email ILIKE $${qIndex})`;
  }
  values.push(limit);
  const limitIndex = values.length;

  let result;
  try {
    result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.email,
               u.display_name,
               u.created_at,
               u.last_seen,
               u.last_login,
               p.profile->'profile'->>'photoDataUrl' AS photo,
               tp.onboarding_complete,
               tp.discipline,
               tp.days_per_week,
               tp.updated_at AS training_updated_at,
               plan.id AS active_plan_id,
               plan.updated_at AS active_plan_updated_at,
               (
                 SELECT MAX(m.created_at)
                 FROM app_messages m
                 WHERE m.sender_id = $1
                   AND m.receiver_id = u.id
               ) AS last_owner_message_at,
               (
                 SELECT COUNT(*)::int
                 FROM app_messages m
                 WHERE m.sender_id = $1
                   AND m.receiver_id = u.id
               ) AS owner_message_count
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        LEFT JOIN app_training_profiles tp ON tp.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT id, updated_at
          FROM app_training_plans t
          WHERE t.user_id = u.id
            AND t.active = true
          ORDER BY t.updated_at DESC
          LIMIT 1
        ) AS plan ON true
        ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT $${limitIndex};
      `,
      values
    );
  } catch (err) {
    const code = String(err?.code || '');
    if (code !== '42P01') throw err;
    result = await db.query(
      `
        SELECT u.id,
               u.username,
               u.email,
               u.display_name,
               u.created_at,
               u.last_seen,
               u.last_login,
               p.profile->'profile'->>'photoDataUrl' AS photo,
               NULL::boolean AS onboarding_complete,
               NULL::text AS discipline,
               NULL::int AS days_per_week,
               NULL::timestamptz AS training_updated_at,
               NULL::uuid AS active_plan_id,
               NULL::timestamptz AS active_plan_updated_at,
               (
                 SELECT MAX(m.created_at)
                 FROM app_messages m
                 WHERE m.sender_id = $1
                   AND m.receiver_id = u.id
               ) AS last_owner_message_at,
               (
                 SELECT COUNT(*)::int
                 FROM app_messages m
                 WHERE m.sender_id = $1
                   AND m.receiver_id = u.id
               ) AS owner_message_count
        FROM app_users u
        LEFT JOIN app_user_profiles p ON p.user_id = u.id
        ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT $${limitIndex};
      `,
      values
    );
  }

  const accounts = (result.rows || []).map((row) => ({
    id: row.id,
    username: row.username || null,
    email: row.email || null,
    displayName: row.display_name || row.username || 'Account',
    photoDataUrl: row.photo || null,
    createdAt: row.created_at || null,
    lastSeen: row.last_seen || null,
    isOnline: isLastSeenOnline(row.last_seen),
    lastLogin: row.last_login || null,
    onboardingComplete: Boolean(row.onboarding_complete),
    discipline: row.discipline || null,
    daysPerWeek: Number.isFinite(Number(row.days_per_week)) ? Number(row.days_per_week) : null,
    trainingUpdatedAt: row.training_updated_at || null,
    hasActivePlan: Boolean(row.active_plan_id),
    activePlanUpdatedAt: row.active_plan_updated_at || null,
    ownerMessageCount: Number(row.owner_message_count || 0),
    lastOwnerMessageAt: row.last_owner_message_at || null
  }));

  return sendJson(res, 200, { ok: true, count: accounts.length, accounts });
}

async function getUserFromSessionToken(token) {
  const sessionToken = String(token || '').trim();
  if (!sessionToken) return null;
  const tokenHash = sha256Hex(sessionToken);
  const result = await db.query(
    `
      SELECT u.id, u.username, u.email, u.display_name, COALESCE(u.admin_notes, '') AS admin_notes
      FROM app_sessions s
      JOIN app_users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
        AND s.expires_at > now()
      LIMIT 1;
    `,
    [tokenHash]
  );
  const row = result.rows?.[0];
  if (!row) return null;
  return await buildAuthUserFromRowAsync(row);
}

async function getOwnerImpersonationContext(req, activeUser) {
  const user = activeUser && typeof activeUser === 'object' ? activeUser : null;
  if (!user?.id) return null;
  const cookies = parseCookies(req.headers.cookie);
  const backupToken = String(cookies[OWNER_BACKUP_COOKIE_NAME] || '').trim();
  if (!backupToken) return null;

  const ownerUser = await getUserFromSessionToken(backupToken);
  if (!ownerUser?.isOwner) return null;
  if (String(ownerUser.id) === String(user.id)) return null;

  return {
    active: true,
    owner: {
      id: ownerUser.id,
      username: ownerUser.username || null,
      displayName: ownerUser.displayName || ownerUser.username || 'Owner'
    },
    viewing: {
      id: user.id,
      username: user.username || null,
      displayName: user.displayName || user.username || 'Account'
    }
  };
}

async function handleOwnerImpersonateStart(req, res, url, targetUserId) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;

  const userId = String(targetUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendJson(res, 400, { ok: false, error: 'Invalid account id' });
  if (userId === actor.id) return sendJson(res, 400, { ok: false, error: 'Choose a different account to view' });

  const target = await db.query('SELECT id FROM app_users WHERE id = $1 LIMIT 1;', [userId]);
  if (!target.rows?.[0]?.id) return sendJson(res, 404, { ok: false, error: 'Account not found' });

  const cookies = parseCookies(req.headers.cookie);
  const ownerToken = String(cookies[COOKIE_NAME] || '').trim();
  if (!ownerToken) return sendJson(res, 401, { ok: false, error: 'No active owner session' });

  const targetToken = await createSession(userId, { updateLogin: false });
  const returnTo = safeReturnTo(url.searchParams.get('returnTo') || '/overview.html');
  const cookieHeaders = [
    setCookieHeader(targetToken, req),
    setNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, ownerToken, req)
  ].filter(Boolean);

  res.writeHead(302, {
    Location: returnTo,
    'Set-Cookie': cookieHeaders
  });
  res.end();
  return true;
}

async function handleOwnerCreateDemoAccount(req, res, url, options = {}) {
  try {
    const redirect = options?.redirect === true;
    const actor = await requireOwnerActor(req, res);
    if (!actor) return true;

    const cookies = parseCookies(req.headers.cookie);
    const ownerToken = String(cookies[COOKIE_NAME] || '').trim();
    if (!ownerToken) return sendJson(res, 401, { ok: false, error: 'No active owner session' });

    let row = null;
    let creds = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      creds = buildOwnerDemoCredentials();
      const passwordHash = await bcrypt.hash(creds.password, 12);
      try {
        const inserted = await db.query(
          `
            INSERT INTO app_users (username, email, phone, display_name, password_hash, auth_provider, admin_notes)
            VALUES ($1, $2, $3, $4, $5, 'local', $6)
            RETURNING id, username, email, display_name, admin_notes;
          `,
          [
            creds.username,
            `${creds.username}@demo.local`,
            null,
            'Demo User',
            passwordHash,
            'demo temp owner_demo'
          ]
        );
        row = inserted.rows?.[0] || null;
        if (row?.id) break;
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || '');
        if (!msg.includes('app_users_username_key') && !msg.includes('app_users_email_key')) {
          throw err;
        }
      }
    }
    if (!row?.id || !creds) {
      if (lastErr) throw lastErr;
      return sendJson(res, 500, { ok: false, error: 'Could not create demo account.' });
    }

    const demoToken = await createSession(row.id, { updateLogin: false });
    const returnTo = safeReturnTo(url.searchParams.get('returnTo') || '/training.html');
    if (redirect) {
      res.writeHead(302, {
        Location: returnTo,
        'Set-Cookie': [
          setCookieHeader(demoToken, req),
          setNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, ownerToken, req)
        ]
      });
      res.end();
      return true;
    }
    return sendJson(
      res,
      200,
      {
        ok: true,
        user: await buildAuthUserFromRowAsync(row),
        credentials: creds,
        returnTo
      },
      {
        'Set-Cookie': [
          setCookieHeader(demoToken, req),
          setNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, ownerToken, req)
        ]
      }
    );
  } catch (err) {
    console.error('[owner-demo-account]', err?.message || err);
    return sendJson(res, 500, { ok: false, error: 'Could not create demo account.' });
  }
}

async function handleOwnerImpersonateExit(req, res, url) {
  const cookies = parseCookies(req.headers.cookie);
  const backupToken = String(cookies[OWNER_BACKUP_COOKIE_NAME] || '').trim();
  const returnTo = safeReturnTo(url.searchParams.get('returnTo') || '/owner-accounts.html');
  const cleanupMode = String(url.searchParams.get('cleanup') || '').trim().toLowerCase();
  const cleanupUserId = String(url.searchParams.get('cleanupUserId') || '').trim();
  if (!backupToken) {
    res.writeHead(302, {
      Location: returnTo,
      'Set-Cookie': clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req)
    });
    res.end();
    return true;
  }

  const backupUser = await getUserFromSessionToken(backupToken);
  if (!backupUser || !backupUser.isOwner) {
    return sendJson(
      res,
      403,
      { ok: false, error: 'Owner backup session is invalid' },
      { 'Set-Cookie': clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req) }
    );
  }

  const currentToken = String(cookies[COOKIE_NAME] || '').trim();
  const currentUser = currentToken && currentToken !== backupToken
    ? await getUserFromSessionToken(currentToken)
    : null;
  if (currentToken && currentToken !== backupToken) {
    try {
      await deleteSessionByToken(currentToken);
    } catch {
      // ignore cleanup failure
    }
  }
  if (
    cleanupMode === 'demo'
    && cleanupUserId
    && currentUser?.id
    && String(currentUser.id) === cleanupUserId
    && currentToken
    && currentToken !== backupToken
  ) {
    try {
      await db.query('DELETE FROM app_users WHERE id = $1;', [cleanupUserId]);
    } catch {
      // ignore demo cleanup failure
    }
  }

  res.writeHead(302, {
    Location: returnTo,
    'Set-Cookie': [
      setCookieHeader(backupToken, req),
      clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req)
    ]
  });
  res.end();
  return true;
}

async function handleOwnerAccountDetail(req, res, targetUserId) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;
  const userId = String(targetUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendJson(res, 400, { ok: false, error: 'Invalid account id' });

  const userResult = await db.query(
    `
      SELECT u.id, u.username, u.email, u.display_name, u.created_at, u.last_seen, u.last_login,
             p.profile AS profile_json
      FROM app_users u
      LEFT JOIN app_user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1;
    `,
    [userId]
  );
  const userRow = userResult.rows?.[0];
  if (!userRow) return sendJson(res, 404, { ok: false, error: 'Account not found' });

  let trainingProfile = null;
  try {
    const trainingProfileResult = await db.query(
      `
        SELECT onboarding_complete, discipline, experience, days_per_week, goals, injuries, updated_at
        FROM app_training_profiles
        WHERE user_id = $1
        LIMIT 1;
      `,
      [userId]
    );
    trainingProfile = trainingProfileResult.rows?.[0] || null;
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
  }

  let activePlan = null;
  try {
    const activePlanResult = await db.query(
      `
        SELECT id, discipline, days_per_week, updated_at
        FROM app_training_plans
        WHERE user_id = $1
          AND active = true
        ORDER BY updated_at DESC
        LIMIT 1;
      `,
      [userId]
    );
    activePlan = activePlanResult.rows?.[0] || null;
  } catch (err) {
    if (String(err?.code || '') !== '42P01') throw err;
  }

  let workoutStats = { totalLoggedWorkouts: 0, lastWorkoutAt: null };
  if (activePlan?.id) {
    try {
      const logsResult = await db.query(
        `
          SELECT COUNT(*)::int AS total_logged_workouts, MAX(updated_at) AS last_workout_at
          FROM app_training_workouts
          WHERE user_id = $1
            AND plan_id = $2;
        `,
        [userId, activePlan.id]
      );
      workoutStats = {
        totalLoggedWorkouts: Number(logsResult.rows?.[0]?.total_logged_workouts || 0),
        lastWorkoutAt: logsResult.rows?.[0]?.last_workout_at || null
      };
    } catch (err) {
      if (String(err?.code || '') !== '42P01') throw err;
    }
  }

  const ownerMessageStatsResult = await db.query(
    `
      SELECT COUNT(*)::int AS owner_message_count, MAX(created_at) AS last_owner_message_at
      FROM app_messages
      WHERE sender_id = $1
        AND receiver_id = $2;
    `,
    [actor.id, userId]
  );

  return sendJson(res, 200, {
    ok: true,
    account: {
      id: userRow.id,
      username: userRow.username || null,
      email: userRow.email || null,
      displayName: userRow.display_name || userRow.username || 'Account',
      createdAt: userRow.created_at || null,
      lastSeen: userRow.last_seen || null,
      lastLogin: userRow.last_login || null,
      profile: userRow.profile_json && typeof userRow.profile_json === 'object' ? userRow.profile_json : {},
      trainingProfile: trainingProfile ? {
        onboardingComplete: Boolean(trainingProfile.onboarding_complete),
        discipline: trainingProfile.discipline || null,
        experience: trainingProfile.experience || null,
        daysPerWeek: Number.isFinite(Number(trainingProfile.days_per_week)) ? Number(trainingProfile.days_per_week) : null,
        goals: trainingProfile.goals || null,
        injuries: trainingProfile.injuries || null,
        updatedAt: trainingProfile.updated_at || null
      } : null,
      activePlan: activePlan ? {
        id: activePlan.id,
        discipline: activePlan.discipline || null,
        daysPerWeek: Number.isFinite(Number(activePlan.days_per_week)) ? Number(activePlan.days_per_week) : null,
        updatedAt: activePlan.updated_at || null
      } : null,
      workoutStats,
      ownerMessageStats: {
        count: Number(ownerMessageStatsResult.rows?.[0]?.owner_message_count || 0),
        lastAt: ownerMessageStatsResult.rows?.[0]?.last_owner_message_at || null
      }
    }
  });
}

async function handleOwnerAccountPasswordUpdate(req, res, targetUserId) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;
  const userId = String(targetUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendJson(res, 400, { ok: false, error: 'Invalid account id' });

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
  }
  const nextPassword = String(payload?.password || '');
  if (!nextPassword || nextPassword.length < 8) return sendJson(res, 400, { ok: false, error: 'Password must be at least 8 characters' });
  if (nextPassword.length > 128) return sendJson(res, 400, { ok: false, error: 'Password is too long' });

  const passwordHash = await bcrypt.hash(nextPassword, 12);
  const updated = await db.query(
    `
      UPDATE app_users
      SET password_hash = $2, auth_provider = 'local'
      WHERE id = $1
      RETURNING id;
    `,
    [userId, passwordHash]
  );
  if (!updated.rows?.[0]?.id) return sendJson(res, 404, { ok: false, error: 'Account not found' });

  // Invalidate all sessions so new password takes effect immediately.
  await db.query('DELETE FROM app_sessions WHERE user_id = $1;', [userId]);
  return sendJson(res, 200, { ok: true });
}

async function handleOwnerAccountDelete(req, res, targetUserId) {
  const actor = await requireOwnerActor(req, res);
  if (!actor) return true;
  const userId = String(targetUserId || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return sendJson(res, 400, { ok: false, error: 'Invalid account id' });
  if (userId === actor.id) return sendJson(res, 400, { ok: false, error: 'Cannot delete your own owner account' });

  const deleted = await db.query(
    `
      DELETE FROM app_users
      WHERE id = $1
      RETURNING id;
    `,
    [userId]
  );
  if (!deleted.rows?.[0]?.id) return sendJson(res, 404, { ok: false, error: 'Account not found' });
  return sendJson(res, 200, { ok: true });
}

async function ensureSchema(options = {}) {
  if (schemaEnsured) return;
  if (!db.isConfigured()) return;
  const fastFail = options?.fastFail === true;
  if (schemaEnsurePromise) {
    if (!fastFail) return await schemaEnsurePromise;
    throw new DbUnavailableError('Database unavailable while ensuring auth schema', lastSchemaTransientError || null);
  }
  const retryDelays = fastFail ? [] : SCHEMA_RETRY_DELAYS_MS;
  if (schemaTransientBackoffUntil > Date.now()) {
    throw new DbUnavailableError('Database unavailable while ensuring auth schema', lastSchemaTransientError || null);
  }
  const schemaStatements = [
    'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    `
    CREATE TABLE IF NOT EXISTS app_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      username text UNIQUE,
      email text UNIQUE,
      phone text,
      display_name text NOT NULL,
      password_hash text,
      auth_provider text NOT NULL DEFAULT 'local',
      last_seen timestamptz,
      last_login timestamptz,
      admin_notes text NOT NULL DEFAULT ''
    );
  `,
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_seen timestamptz;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login timestamptz;',
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();",
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';",
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_customer_id text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_subscription_id text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_price_id text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS access_type text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS access_ends_at timestamptz;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS subscription_status text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS billing_name text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS billing_email text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS billing_zip text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS billing_line1 text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS billing_city text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS billing_country text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_ip text;',
    'ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_user_agent_hash text;',
    'CREATE UNIQUE INDEX IF NOT EXISTS app_users_phone_key ON app_users(phone) WHERE phone IS NOT NULL;',
    `
    CREATE TABLE IF NOT EXISTS app_identities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      provider text NOT NULL,
      provider_user_id text NOT NULL,
      email text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(provider, provider_user_id)
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_identities_user_id ON app_identities(user_id);',
    `
    CREATE TABLE IF NOT EXISTS app_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_token_hash text UNIQUE NOT NULL,
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
    `,
    'CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at);',
    `
    CREATE TABLE IF NOT EXISTS app_password_reset_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_password_reset_tokens_user_id ON app_password_reset_tokens(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_app_password_reset_tokens_expires_at ON app_password_reset_tokens(expires_at);',
    `
    CREATE TABLE IF NOT EXISTS app_oauth_states (
      state_hash text PRIMARY KEY,
      return_to text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_oauth_states_expires_at ON app_oauth_states(expires_at);'
    ,
    `
    CREATE TABLE IF NOT EXISTS app_user_profiles (
      user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      profile jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `
    ,
    `
    CREATE TABLE IF NOT EXISTS app_access_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      source text NOT NULL,
      reward_key text UNIQUE,
      days int NOT NULL DEFAULT 0,
      starts_at timestamptz,
      ends_at timestamptz,
      amount_cents int,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_access_grants_user_id ON app_access_grants(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_app_access_grants_ends_at ON app_access_grants(ends_at);',
    `
    CREATE TABLE IF NOT EXISTS app_user_payment_methods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      payment_type text NOT NULL,
      wallet_type text,
      brand text,
      last4 text,
      exp_month int,
      exp_year int,
      display_label text,
      is_demo boolean NOT NULL DEFAULT false,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_user_payment_methods_user_id ON app_user_payment_methods(user_id);',
    `
    CREATE TABLE IF NOT EXISTS app_trainer_profiles (
      user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      onboarding_completed_at timestamptz,
      full_name text NOT NULL DEFAULT '',
      contact_email text NOT NULL DEFAULT '',
      instagram_handle text NOT NULL DEFAULT '',
      tiktok_handle text NOT NULL DEFAULT '',
      brand_positioning text NOT NULL DEFAULT '',
      client_types text NOT NULL DEFAULT '',
      ideal_client text NOT NULL DEFAULT '',
      differentiator text NOT NULL DEFAULT '',
      online_coaching boolean NOT NULL DEFAULT false,
      in_person_training boolean NOT NULL DEFAULT false,
      monthly_coaching_price numeric(10,2),
      coaching_includes text NOT NULL DEFAULT '',
      call_days text[] NOT NULL DEFAULT ARRAY[]::text[],
      call_time_slots text[] NOT NULL DEFAULT ARRAY[]::text[],
      call_timezone text NOT NULL DEFAULT '',
      stripe_account_id text NOT NULL DEFAULT '',
      stripe_connected_account_id text NOT NULL DEFAULT '',
      stripe_payout_email text NOT NULL DEFAULT '',
      stripe_dashboard_url text NOT NULL DEFAULT '',
      stripe_status text NOT NULL DEFAULT 'not_connected',
      stripe_onboarding_state text NOT NULL DEFAULT 'not_connected',
      stripe_charges_enabled boolean NOT NULL DEFAULT false,
      stripe_payouts_enabled boolean NOT NULL DEFAULT false,
      stripe_details_submitted boolean NOT NULL DEFAULT false,
      stripe_requirements_currently_due jsonb NOT NULL DEFAULT '[]'::jsonb,
      stripe_requirements_past_due jsonb NOT NULL DEFAULT '[]'::jsonb,
      stripe_last_sync_at timestamptz,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `,
    `ALTER TABLE app_trainer_profiles ADD COLUMN IF NOT EXISTS stripe_connected_account_id text NOT NULL DEFAULT '';`,
    `ALTER TABLE app_trainer_profiles ADD COLUMN IF NOT EXISTS stripe_onboarding_state text NOT NULL DEFAULT 'not_connected';`,
    `ALTER TABLE app_trainer_profiles ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false;`,
    `ALTER TABLE app_trainer_profiles ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false;`,
    `ALTER TABLE app_trainer_profiles ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false;`,
    `ALTER TABLE app_trainer_profiles ADD COLUMN IF NOT EXISTS stripe_requirements_currently_due jsonb NOT NULL DEFAULT '[]'::jsonb;`,
    `ALTER TABLE app_trainer_profiles ADD COLUMN IF NOT EXISTS stripe_requirements_past_due jsonb NOT NULL DEFAULT '[]'::jsonb;`,
    `ALTER TABLE app_trainer_profiles ADD COLUMN IF NOT EXISTS stripe_last_sync_at timestamptz;`,
    `
    CREATE TABLE IF NOT EXISTS app_trainer_products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      public_token text NOT NULL DEFAULT '',
      stripe_product_id text NOT NULL DEFAULT '',
      stripe_price_id text NOT NULL DEFAULT '',
      product_type text NOT NULL DEFAULT 'main_product',
      name text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      image_data_url text,
      payment_type text NOT NULL DEFAULT 'recurring',
      price numeric(10,2) NOT NULL DEFAULT 0,
      billing_interval_count int NOT NULL DEFAULT 1,
      billing_interval_unit text NOT NULL DEFAULT 'month',
      duration_type text NOT NULL DEFAULT 'until_canceled',
      duration_months int,
      start_type text NOT NULL DEFAULT 'immediate',
      fixed_start_date date,
      sell_on_riseforit boolean NOT NULL DEFAULT true,
      allow_self_cancellation boolean NOT NULL DEFAULT true,
      limit_new_clients_only boolean NOT NULL DEFAULT false,
      current_clients int NOT NULL DEFAULT 0,
      upcoming_clients int NOT NULL DEFAULT 0,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `,
    `ALTER TABLE app_trainer_products ADD COLUMN IF NOT EXISTS public_token text NOT NULL DEFAULT '';`,
    `ALTER TABLE app_trainer_products ADD COLUMN IF NOT EXISTS stripe_product_id text NOT NULL DEFAULT '';`,
    `ALTER TABLE app_trainer_products ADD COLUMN IF NOT EXISTS stripe_price_id text NOT NULL DEFAULT '';`,
    `ALTER TABLE app_trainer_products ADD COLUMN IF NOT EXISTS fixed_start_date date;`,
    `CREATE INDEX IF NOT EXISTS idx_app_trainer_products_trainer_user_id ON app_trainer_products(trainer_user_id);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_app_trainer_products_public_token ON app_trainer_products(public_token) WHERE public_token <> '';`,
    `
    CREATE TABLE IF NOT EXISTS app_trainer_product_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
      trainer_product_id uuid REFERENCES app_trainer_products(id) ON DELETE SET NULL,
      client_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
      stripe_checkout_session_id text UNIQUE NOT NULL,
      stripe_payment_intent_id text NOT NULL DEFAULT '',
      stripe_customer_id text NOT NULL DEFAULT '',
      stripe_subscription_id text NOT NULL DEFAULT '',
      amount_cents integer NOT NULL DEFAULT 0,
      currency text NOT NULL DEFAULT 'usd',
      status text NOT NULL DEFAULT 'pending',
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `,
    `CREATE INDEX IF NOT EXISTS idx_app_trainer_product_orders_trainer_user_id ON app_trainer_product_orders(trainer_user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_app_trainer_product_orders_client_user_id ON app_trainer_product_orders(client_user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_app_trainer_product_orders_subscription_id ON app_trainer_product_orders(stripe_subscription_id);`,
    `
    CREATE TABLE IF NOT EXISTS app_trainer_product_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
      trainer_product_id uuid REFERENCES app_trainer_products(id) ON DELETE SET NULL,
      client_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
      stripe_subscription_id text UNIQUE NOT NULL,
      stripe_customer_id text NOT NULL DEFAULT '',
      stripe_price_id text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'pending',
      current_period_end timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `,
    `CREATE INDEX IF NOT EXISTS idx_app_trainer_product_subscriptions_trainer_user_id ON app_trainer_product_subscriptions(trainer_user_id);`,
    `
    CREATE TABLE IF NOT EXISTS app_trainer_clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      linked_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
      display_name text NOT NULL,
      email text,
      phone text,
      notes text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'active',
      source text NOT NULL DEFAULT 'manual',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_trainer_clients_trainer_user_id ON app_trainer_clients(trainer_user_id);',
    'CREATE INDEX IF NOT EXISTS idx_app_trainer_clients_linked_user_id ON app_trainer_clients(linked_user_id);',
    `
    CREATE TABLE IF NOT EXISTS app_referral_codes (
      user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      code text NOT NULL UNIQUE,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `,
    `
    CREATE TABLE IF NOT EXISTS app_referrals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      referred_user_id uuid NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
      referral_code text NOT NULL,
      source text,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      signed_up_at timestamptz,
      qualified_at timestamptz,
      qualified_reason text,
      rejected_reason text,
      rewarded_at timestamptz,
      reward_key text,
      referred_signup_ip text,
      referred_signup_user_agent_hash text,
      referrer_signup_ip_snapshot text,
      referrer_user_agent_hash_snapshot text
    );
    `,
    'CREATE INDEX IF NOT EXISTS idx_app_referrals_referrer_user_id ON app_referrals(referrer_user_id);',
    'CREATE INDEX IF NOT EXISTS idx_app_referrals_qualified_at ON app_referrals(qualified_at);',
    `
    CREATE TABLE IF NOT EXISTS app_trainer_invites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      invite_type text NOT NULL DEFAULT 'app_invite',
      invite_code text NOT NULL UNIQUE,
      linked_referral_code text NOT NULL DEFAULT '',
      email text,
      phone text,
      first_name text NOT NULL DEFAULT '',
      last_name text NOT NULL DEFAULT '',
      package_name text NOT NULL DEFAULT '',
      package_price_cents integer NOT NULL DEFAULT 0,
      billing_frequency text NOT NULL DEFAULT '',
      start_date date,
      note text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'sent',
      payment_status text NOT NULL DEFAULT 'not_applicable',
      linked_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
      accepted_at timestamptz,
      last_event_at timestamptz NOT NULL DEFAULT now(),
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_trainer_invites_trainer_user_id ON app_trainer_invites(trainer_user_id);',
    'CREATE INDEX IF NOT EXISTS idx_app_trainer_invites_invite_type ON app_trainer_invites(invite_type);',
    'CREATE INDEX IF NOT EXISTS idx_app_trainer_invites_linked_user_id ON app_trainer_invites(linked_user_id);',
    `
    CREATE TABLE IF NOT EXISTS app_trainer_invite_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      invite_id uuid REFERENCES app_trainer_invites(id) ON DELETE SET NULL,
      event_type text NOT NULL,
      subject_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `,
    'CREATE INDEX IF NOT EXISTS idx_app_trainer_invite_events_trainer_user_id ON app_trainer_invite_events(trainer_user_id);',
    'CREATE INDEX IF NOT EXISTS idx_app_trainer_invite_events_event_type ON app_trainer_invite_events(event_type);'
  ];

  schemaEnsurePromise = (async () => {
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        for (const sql of schemaStatements) {
          await db.query(sql);
        }
        schemaEnsured = true;
        schemaTransientBackoffUntil = 0;
        lastSchemaTransientError = null;
        return;
      } catch (err) {
        if (!isTransientPgError(err)) throw err;
        logTransientDbError(err, `ensureSchema:attempt_${attempt + 1}${fastFail ? ':fast' : ''}`);
        if (attempt >= retryDelays.length) {
          lastSchemaTransientError = err;
          schemaTransientBackoffUntil = Date.now() + AUTH_SCHEMA_BACKOFF_MS;
          throw new DbUnavailableError('Database unavailable while ensuring auth schema', err);
        }
        await sleep(retryDelays[attempt]);
      }
    }
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

async function getUserFromRequest(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = sha256Hex(token);

  const result = await db.query(
    `
      SELECT u.id, u.username, u.email, u.display_name
           , COALESCE(u.admin_notes, '') AS admin_notes
      FROM app_sessions s
      JOIN app_users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
        AND s.expires_at > now()
      LIMIT 1;
    `,
    [tokenHash]
  );

  const row = result.rows?.[0];
  if (!row) return null;
  try {
    await db.query('UPDATE app_users SET last_seen = now() WHERE id = $1;', [row.id]);
  } catch {
    // ignore
  }
  return await buildAuthUserFromRowAsync(row);
}

async function createSession(userId, options = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.query(
    `
      INSERT INTO app_sessions (session_token_hash, user_id, expires_at)
      VALUES ($1, $2, $3);
    `,
    [tokenHash, userId, expiresAt]
  );

  if (options.updateLogin !== false) {
    await db.query('UPDATE app_users SET last_login = now(), last_seen = now() WHERE id = $1;', [userId]);
  }

  return token;
}

async function deleteSessionByToken(token) {
  if (!token) return;
  const tokenHash = sha256Hex(token);
  await db.query('DELETE FROM app_sessions WHERE session_token_hash = $1;', [tokenHash]);
}

async function findUserByIdentifier(identifierRaw) {
  const identifier = String(identifierRaw || '').trim();
  if (!identifier) return null;
  const username = identifier.toLowerCase();
  const email = normalizeEmail(identifier);
  const phone = normalizePhone(identifier);
  const result = await db.query(
    `
      SELECT id, username, email, phone, display_name
      FROM app_users
      WHERE username = $1
         OR email = $2
         OR phone = $3
      LIMIT 1;
    `,
    [username, email, phone]
  );
  return result.rows?.[0] || null;
}

async function handlePasswordForgot(req, res) {
  if (!db.isConfigured()) return sendJson(res, 200, { ok: true });
  await ensureSchema();

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message });
  }

  const identifier = String(payload?.email || payload?.identifier || '').trim();
  if (!identifier) {
    return sendJson(res, 200, {
      ok: true,
      message: 'If an account matches, we sent a password reset link.'
    });
  }

  const user = await findUserByIdentifier(identifier);
  if (!user || !normalizeEmail(user.email)) {
    return sendJson(res, 200, {
      ok: true,
      message: 'If an account matches, we sent a password reset link.'
    });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
  await db.query(
    `
      INSERT INTO app_password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3);
    `,
    [user.id, tokenHash, expiresAt]
  );

  const resetUrl = buildPasswordResetUrl(req, rawToken);
  emitKlaviyoEvent({
    eventName: 'Password Reset Requested',
    email: user.email,
    phone: user.phone || '',
    displayName: user.display_name || user.username || '',
    eventProps: {
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES
    },
    profileProps: {
      ode_password_reset_pending: true
    }
  }).catch(() => {});

  return sendJson(res, 200, {
    ok: true,
    message: 'If an account matches, we sent a password reset link.'
  });
}

async function handlePasswordReset(req, res) {
  if (!db.isConfigured()) return sendJson(res, 501, { ok: false, error: 'Database not configured' });
  await ensureSchema();

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message });
  }

  const token = String(payload?.token || '').trim();
  const password = String(payload?.password || '');
  if (!token) return sendJson(res, 400, { ok: false, error: 'Missing token' });
  if (!password || password.length < 8) return sendJson(res, 400, { ok: false, error: 'Password must be at least 8 characters' });
  if (password.length > 128) return sendJson(res, 400, { ok: false, error: 'Password is too long' });

  const tokenHash = sha256Hex(token);
  const tokenResult = await db.query(
    `
      SELECT t.id, t.user_id, u.email, u.phone, u.display_name, u.username
      FROM app_password_reset_tokens t
      JOIN app_users u ON u.id = t.user_id
      WHERE t.token_hash = $1
        AND t.used_at IS NULL
        AND t.expires_at > now()
      LIMIT 1;
    `,
    [tokenHash]
  );
  const row = tokenResult.rows?.[0] || null;
  if (!row) return sendJson(res, 400, { ok: false, error: 'Invalid or expired reset link' });

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await db.query('BEGIN');
    await db.query(
      `
        UPDATE app_users
        SET password_hash = $2,
            auth_provider = 'local'
        WHERE id = $1;
      `,
      [row.user_id, passwordHash]
    );
    await db.query('DELETE FROM app_sessions WHERE user_id = $1;', [row.user_id]);
    await db.query(
      `
        UPDATE app_password_reset_tokens
        SET used_at = now()
        WHERE id = $1;
      `,
      [row.id]
    );
    await db.query(
      `
        DELETE FROM app_password_reset_tokens
        WHERE user_id = $1
          AND id <> $2;
      `,
      [row.user_id, row.id]
    );
    await db.query('COMMIT');
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    return sendJson(res, 500, { ok: false, error: 'Could not reset password' });
  }

  emitKlaviyoEvent({
    eventName: 'Password Reset Completed',
    email: row.email,
    phone: row.phone || '',
    displayName: row.display_name || row.username || '',
    eventProps: {
      status: 'success'
    },
    profileProps: {
      ode_password_reset_pending: false
    }
  }).catch(() => {});

  return sendJson(res, 200, { ok: true });
}

async function handleLocalSignup(req, res) {
  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const username = String(payload?.username || '').trim().toLowerCase();
  const email = normalizeEmail(payload?.email);
  const phoneRaw = String(payload?.phone || '').trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const displayName = String(payload?.displayName || '').trim();
  const password = String(payload?.password || '');
  const referralCode = normalizeReferralCode(payload?.referralCode || payload?.ref || '');
  const coachingInviteCode = cleanShortText(payload?.coachingInviteCode || payload?.coachInvite, 120);

  if (!username || username.length < 3) return sendJson(res, 400, { error: 'Username must be at least 3 characters' });
  if (!/^[a-z0-9_]+$/.test(username)) return sendJson(res, 400, { error: 'Username can only use letters, numbers, underscores' });
  if (!email) return sendJson(res, 400, { error: 'Enter a valid email address' });
  if (phoneRaw && !phone) return sendJson(res, 400, { error: 'Enter a valid phone number (or leave it blank)' });
  if (!displayName || displayName.length < 2) return sendJson(res, 400, { error: 'Display name must be at least 2 characters' });
  if (!password || password.length < 8) return sendJson(res, 400, { error: 'Password must be at least 8 characters' });

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const created = await db.query(
      `
        INSERT INTO app_users (username, email, phone, display_name, password_hash, auth_provider)
        VALUES ($1, $2, $3, $4, $5, 'local')
        RETURNING id, username, email, display_name, COALESCE(admin_notes, '') AS admin_notes;
      `,
      [username, email, phone, displayName, passwordHash]
    );
    const user = created.rows[0];
    if (referralCode) {
      await claimReferralForNewUser({
        referredUserId: user.id,
        referralCode,
        source: coachingInviteCode ? 'trainer_coaching_invite_signup' : 'trainer_referral_signup',
        req
      }).catch(() => null);
    }
    if (coachingInviteCode) {
      await attachCoachingSignupToTrainerInvite({
        inviteCode: coachingInviteCode,
        user,
        req
      }).catch(() => null);
    }
    queueOnboardingEmails(user, 'signup_local');
    const token = await createSession(user.id);
    return sendJson(
      res,
      200,
      { user: await buildAuthUserFromRowAsync(user) },
      { 'Set-Cookie': setCookieHeader(token, req) }
    );
  } catch (err) {
    const msg = String(err?.message || '');
    if (msg.includes('app_users_username_key')) return sendJson(res, 409, { error: 'Username already taken' });
    if (msg.includes('app_users_email_key')) return sendJson(res, 409, { error: 'Email already in use' });
    if (msg.includes('app_users_phone_key')) return sendJson(res, 409, { error: 'Phone number already in use' });
    return sendJson(res, 500, { error: 'Failed to create user' });
  }
}

async function handleLocalLogin(req, res) {
  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const identifierRaw = String(payload?.username || payload?.identifier || '').trim();
  const identifierLower = identifierRaw.toLowerCase();
  const username = identifierLower;
  const email = normalizeEmail(identifierRaw);
  const phone = normalizePhone(identifierRaw);
  const password = String(payload?.password || '');
  if (!identifierRaw || !password) return sendJson(res, 400, { error: 'Missing sign-in info or password' });

  const result = await db.query(
    `
      SELECT id, username, email, display_name, password_hash
           , COALESCE(admin_notes, '') AS admin_notes
      FROM app_users
      WHERE username = $1
         OR email = $2
         OR phone = $3
      LIMIT 1;
    `,
    [username, email, phone]
  );
  const row = result.rows?.[0];
  if (!row || !row.password_hash) return sendJson(res, 401, { error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return sendJson(res, 401, { error: 'Invalid credentials' });

  const token = await createSession(row.id);
  return sendJson(
    res,
    200,
    { user: await buildAuthUserFromRowAsync(row) },
    { 'Set-Cookie': setCookieHeader(token, req) }
  );
}

async function handleLogout(req, res) {
  if (!db.isConfigured()) {
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': [clearCookieHeader(req), clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req)] }
    );
  }
  await ensureSchema();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  try {
    await deleteSessionByToken(token);
  } catch {
    // ignore
  }
  return sendJson(
    res,
    200,
    { ok: true },
    { 'Set-Cookie': [clearCookieHeader(req), clearNamedCookieHeader(OWNER_BACKUP_COOKIE_NAME, req)] }
  );
}

async function handleGoogleStart(req, res, url) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) return sendJson(res, 501, { error: 'Google auth not configured' });
  if (!db.isConfigured()) return sendJson(res, 501, { error: 'Database not configured' });
  await ensureSchema();

  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  const state = crypto.randomBytes(16).toString('hex');
  const stateHash = sha256Hex(state);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.query(
    'INSERT INTO app_oauth_states (state_hash, return_to, expires_at) VALUES ($1, $2, $3) ON CONFLICT (state_hash) DO UPDATE SET return_to = EXCLUDED.return_to, expires_at = EXCLUDED.expires_at;',
    [stateHash, returnTo, expiresAt]
  );

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}

async function handleGoogleCallback(req, res, url) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    res.writeHead(302, { Location: '/?auth=google_config_missing' });
    return res.end();
  }
  if (!db.isConfigured()) {
    res.writeHead(302, { Location: '/?auth=db_missing' });
    return res.end();
  }
  await ensureSchema();

  const code = String(url.searchParams.get('code') || '');
  const state = String(url.searchParams.get('state') || '');
  if (!code || !state) {
    res.writeHead(302, { Location: '/?auth=google_failed' });
    return res.end();
  }

  const stateHash = sha256Hex(state);
  const stateRow = await db.query(
    `
      SELECT return_to
      FROM app_oauth_states
      WHERE state_hash = $1
        AND expires_at > now()
      LIMIT 1;
    `,
    [stateHash]
  );
  const returnTo = safeReturnTo(stateRow.rows?.[0]?.return_to);
  await db.query('DELETE FROM app_oauth_states WHERE state_hash = $1;', [stateHash]);

  if (!stateRow.rows?.[0]) {
    res.writeHead(302, { Location: '/?auth=google_state' });
    return res.end();
  }

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString()
  });

  if (!tokenResp.ok) {
    res.writeHead(302, { Location: '/?auth=google_token' });
    return res.end();
  }

  const tokenJson = await tokenResp.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    res.writeHead(302, { Location: '/?auth=google_token' });
    return res.end();
  }

  const userInfoResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!userInfoResp.ok) {
    res.writeHead(302, { Location: '/?auth=google_userinfo' });
    return res.end();
  }

  const info = await userInfoResp.json();
  const providerUserId = String(info.sub || '');
  const email = info.email ? String(info.email).toLowerCase() : null;
  const emailVerified = Boolean(info.email_verified);
  const displayName = String(info.name || info.given_name || (email ? email.split('@')[0] : 'Member'));

  if (!providerUserId || !email || !emailVerified) {
    res.writeHead(302, { Location: '/?auth=google_profile' });
    return res.end();
  }

  let userId = null;
  let createdNewUser = false;

  const existingIdentity = await db.query(
    `
      SELECT u.id
      FROM app_identities i
      JOIN app_users u ON u.id = i.user_id
      WHERE i.provider = 'google'
        AND i.provider_user_id = $1
      LIMIT 1;
    `,
    [providerUserId]
  );
  userId = existingIdentity.rows?.[0]?.id || null;

  if (!userId) {
    const existingByEmail = await db.query('SELECT id FROM app_users WHERE email = $1 LIMIT 1;', [email]);
    userId = existingByEmail.rows?.[0]?.id || null;
  }

  if (!userId) {
    const created = await db.query(
      `
        INSERT INTO app_users (email, display_name, auth_provider)
        VALUES ($1, $2, 'google')
        RETURNING id;
      `,
      [email, displayName]
    );
    userId = created.rows?.[0]?.id || null;
    createdNewUser = Boolean(userId);
  }

  if (!userId) {
    res.writeHead(302, { Location: '/?auth=google_user_create' });
    return res.end();
  }

  await db.query(
    `
      INSERT INTO app_identities (user_id, provider, provider_user_id, email)
      VALUES ($1, 'google', $2, $3)
      ON CONFLICT (provider, provider_user_id) DO UPDATE SET email = EXCLUDED.email;
    `,
    [userId, providerUserId, email]
  );

  if (createdNewUser) {
    queueOnboardingEmails({
      id: userId,
      email,
      display_name: displayName
    }, 'signup_google');
  }

  const token = await createSession(userId);
  res.writeHead(302, {
    'Set-Cookie': setCookieHeader(token, req),
    Location: returnTo || '/'
  });
  res.end();
}

async function cleanupExpired() {
  if (!db.isConfigured()) return;
  await ensureSchema();
  await db.query('DELETE FROM app_sessions WHERE expires_at <= now();');
  await db.query('DELETE FROM app_oauth_states WHERE expires_at <= now();');
  await db.query(
    `
      DELETE FROM app_password_reset_tokens
      WHERE expires_at <= now()
         OR used_at <= now() - interval '2 days';
    `
  );
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

module.exports = async function authRoutes(req, res, url) {
  if (
    !url.pathname.startsWith('/api/auth/')
    && !url.pathname.startsWith('/api/stripe/')
    && url.pathname !== '/api/trainer-products'
    && url.pathname !== '/api/trainer/sales'
    && url.pathname !== '/api/checkout/create-session'
  ) return false;
  try {
    maybeCleanup().catch(() => {});
    const ownerAccountMatch = url.pathname.match(/^\/api\/auth\/owner\/account\/([0-9a-fA-F-]{36})$/);
    const ownerAccountPasswordMatch = url.pathname.match(/^\/api\/auth\/owner\/account\/([0-9a-fA-F-]{36})\/password$/);
    const ownerImpersonateMatch = url.pathname.match(/^\/api\/auth\/owner\/impersonate\/([0-9a-fA-F-]{36})$/);
    const trainerClientMatch = url.pathname.match(/^\/api\/auth\/trainer\/clients\/([0-9a-fA-F-]{36})$/);

    if (url.pathname === '/api/auth/google/ready' && req.method === 'GET') {
      const missing = [];
      if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
      if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
      if (!process.env.GOOGLE_REDIRECT_URI) missing.push('GOOGLE_REDIRECT_URI');
      return sendJson(res, 200, { ok: missing.length === 0, missing });
    }

    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      try {
        const user = await getUserFromRequest(req);
        const impersonation = user ? await getOwnerImpersonationContext(req, user) : null;
        sendJson(res, 200, { user, impersonation });
      } catch (err) {
        if (err instanceof DbUnavailableError || isTransientPgError(err)) {
          logTransientDbError(err, `authRoutes:${req.method}:${url.pathname}`);
          sendJson(res, 200, { user: null, impersonation: null, dbUnavailable: true });
          return true;
        }
        throw err;
      }
      return true;
    }

    if (url.pathname === '/api/auth/access' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const access = await getUserAccessState(user.id);
      const referral = await getReferralOverview(req, user);
      return sendJson(res, 200, {
        ok: true,
        access,
        referral,
        referredReferralState: null
      });
    }

    if (url.pathname === '/api/auth/access/inline-payment' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      let payload;
      try {
        payload = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
      }
      const result = await createStripeInlinePayment(req, user, payload?.planCode);
      return sendJson(res, result?.ok ? 200 : 400, result);
    }

    if (url.pathname === '/api/auth/access/inline-confirm' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      let payload;
      try {
        payload = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message || 'Invalid JSON' });
      }
      const result = await confirmInlineAccessPayment(user, payload);
      if (!result?.ok) {
        return sendJson(res, 400, { ok: false, error: result?.error || 'Could not apply payment.' });
      }
      const access = await getUserAccessState(user.id);
      return sendJson(res, 200, { ok: true, grant: result.grant, access });
    }

    if (url.pathname === '/api/auth/access/checkout/verify' && req.method === 'GET') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const sessionId = String(url.searchParams.get('session_id') || '').trim();
      if (!sessionId) return sendJson(res, 400, { ok: false, error: 'Missing session id.' });
      const result = await verifyStripeCheckoutSession(sessionId, user.id);
      if (!result?.ok) {
        return sendJson(res, 400, { ok: false, error: result?.error || 'Could not verify checkout.' });
      }
      const access = await getUserAccessState(user.id);
      return sendJson(res, 200, { ok: true, grant: result.grant, access });
    }

    if (url.pathname === '/api/auth/access/activity' && req.method === 'POST') {
      const user = await getUserFromRequest(req);
      if (!user) return sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
      const access = await getUserAccessState(user.id);
      return sendJson(res, 200, { ok: true, access, referralState: null });
    }

    if (url.pathname === '/api/auth/product-public' && req.method === 'GET') {
      return await handlePublicTrainerProductGet(req, res, url);
    }

    if (url.pathname === '/api/auth/product-public/checkout' && req.method === 'POST') {
      return await handlePublicTrainerProductCheckout(req, res);
    }

    if (url.pathname === '/api/auth/product-public/checkout/verify' && req.method === 'GET') {
      return await handlePublicTrainerProductCheckoutVerify(req, res, url);
    }

    if (url.pathname === '/api/auth/trainer/dashboard' && req.method === 'GET') {
      return await handleTrainerDashboard(req, res);
    }

    if (url.pathname === '/api/auth/trainers' && req.method === 'GET') {
      return await handleTrainerDirectoryList(req, res);
    }

    if (url.pathname === '/api/auth/trainer/review/approve' && req.method === 'POST') {
      return await handleTrainerReviewApprove(req, res);
    }

    if (url.pathname === '/api/auth/trainer/review/deny' && req.method === 'POST') {
      return await handleTrainerReviewDeny(req, res);
    }

    if (url.pathname === '/api/auth/trainer/review-notice/seen' && req.method === 'POST') {
      return await handleTrainerReviewNoticeSeen(req, res);
    }

    if (url.pathname === '/api/auth/trainer/onboarding' && req.method === 'POST') {
      return await handleTrainerOnboarding(req, res);
    }

    if (url.pathname === '/api/auth/trainer/stripe' && req.method === 'POST') {
      return await handleTrainerStripeSave(req, res);
    }

    if (url.pathname === '/api/auth/trainer/stripe/connect' && req.method === 'GET') {
      return await handleTrainerStripeConnect(req, res, url);
    }

    if (url.pathname === '/api/auth/trainer/stripe/refresh' && req.method === 'POST') {
      return await handleTrainerStripeRefresh(req, res);
    }

    if (url.pathname === '/api/stripe/connect/start' && (req.method === 'POST' || req.method === 'GET')) {
      return await handleStripeConnectStart(req, res, url);
    }

    if (url.pathname === '/api/stripe/connect/status' && req.method === 'GET') {
      return await handleStripeConnectStatus(req, res);
    }

    if (url.pathname === '/api/stripe/summary' && req.method === 'GET') {
      return await handleStripeSummary(req, res);
    }

    if (url.pathname === '/api/stripe/disputes' && req.method === 'GET') {
      return await handleStripeDisputes(req, res);
    }

    if (url.pathname === '/api/stripe/transactions' && req.method === 'GET') {
      return await handleStripeTransactions(req, res);
    }

    if (url.pathname === '/api/stripe/invoices' && req.method === 'GET') {
      return await handleStripeInvoices(req, res);
    }

    if (url.pathname === '/api/trainer/sales' && req.method === 'GET') {
      return await handleTrainerSales(req, res);
    }

    if (url.pathname === '/api/stripe/webhook' && req.method === 'POST') {
      return await handleStripeWebhook(req, res);
    }

    if (url.pathname === '/api/trainer-products' && req.method === 'POST') {
      return await handleTrainerProductsCreateAlias(req, res);
    }

    if (url.pathname === '/api/checkout/create-session' && req.method === 'POST') {
      return await handleCheckoutCreateSession(req, res);
    }

    if (url.pathname === '/api/auth/trainer/invite/app' && req.method === 'POST') {
      return await handleTrainerAppInviteCreate(req, res);
    }

    if (url.pathname === '/api/auth/trainer/products' && req.method === 'GET') {
      return await handleTrainerProductsList(req, res);
    }

    if (url.pathname === '/api/auth/trainer/products' && req.method === 'POST') {
      return await handleTrainerProductCreate(req, res);
    }

    if (url.pathname === '/api/auth/trainer/products/delete' && req.method === 'POST') {
      return await handleTrainerProductsDelete(req, res);
    }

    if (url.pathname === '/api/auth/trainer/invite/coaching' && req.method === 'POST') {
      return await handleTrainerCoachingInviteCreate(req, res);
    }

    if (url.pathname === '/api/auth/trainer/profile-view' && req.method === 'POST') {
      return await handleTrainerProfileViewTrack(req, res);
    }

    if (url.pathname === '/api/auth/trainer/event' && req.method === 'POST') {
      return await handleTrainerEventTrack(req, res);
    }

    if (url.pathname === '/api/auth/trainer/clients' && req.method === 'POST') {
      return await handleTrainerClientCreate(req, res);
    }

    if (trainerClientMatch && req.method === 'DELETE') {
      return await handleTrainerClientDelete(req, res, trainerClientMatch[1]);
    }

    if (url.pathname === '/api/auth/accounts' && req.method === 'GET') {
      return await handleAccountsList(req, res, url);
    }

    if (url.pathname === '/api/auth/owner/accounts' && req.method === 'GET') {
      return await handleOwnerAccountsList(req, res, url);
    }

    if (url.pathname === '/api/auth/owner/demo-account' && req.method === 'POST') {
      return await handleOwnerCreateDemoAccount(req, res, url);
    }

    if (url.pathname === '/api/auth/owner/demo-account/start' && req.method === 'GET') {
      return await handleOwnerCreateDemoAccount(req, res, url, { redirect: true });
    }

    if (ownerAccountMatch && req.method === 'GET') {
      return await handleOwnerAccountDetail(req, res, ownerAccountMatch[1]);
    }

    if (ownerAccountPasswordMatch && req.method === 'PATCH') {
      return await handleOwnerAccountPasswordUpdate(req, res, ownerAccountPasswordMatch[1]);
    }

    if (ownerAccountMatch && req.method === 'DELETE') {
      return await handleOwnerAccountDelete(req, res, ownerAccountMatch[1]);
    }

    if (ownerImpersonateMatch && req.method === 'GET') {
      return await handleOwnerImpersonateStart(req, res, url, ownerImpersonateMatch[1]);
    }

    if (url.pathname === '/api/auth/owner/impersonation/exit' && req.method === 'GET') {
      return await handleOwnerImpersonateExit(req, res, url);
    }

    if (url.pathname === '/api/auth/password/forgot' && req.method === 'POST') {
      await handlePasswordForgot(req, res);
      return true;
    }

    if (url.pathname === '/api/auth/password/reset' && req.method === 'POST') {
      await handlePasswordReset(req, res);
      return true;
    }

    if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
      await handleLocalSignup(req, res);
      return true;
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      await handleLocalLogin(req, res);
      return true;
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      await handleLogout(req, res);
      return true;
    }

    if (url.pathname === '/api/auth/google/start' && req.method === 'GET') {
      await handleGoogleStart(req, res, url);
      return true;
    }

    if (url.pathname === '/api/auth/google/callback' && req.method === 'GET') {
      await handleGoogleCallback(req, res, url);
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
    return true;
  } catch (err) {
    if (err instanceof DbUnavailableError || isTransientPgError(err)) {
      logTransientDbError(err, `authRoutes:${req.method}:${url.pathname}`);
      sendDbUnavailable(res);
      return true;
    }
    throw err;
  }
};
