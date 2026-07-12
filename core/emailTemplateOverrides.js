/* Owner-editable email templates + A/B split testing.
   The owner edits each event's email on owner-emails.html — either the
   branded block layout (subject / preview text / greeting / intro / bullets /
   button label) or full custom HTML. Saved versions override the built-in
   template at send time; with a Version B saved, sends split by the owner's
   chosen percentage and the variant used is recorded on the event (and as a
   MailerLite field) so results can be measured. */

const {
  eventTemplateSpec,
  renderEmailHtml,
  renderEmailText,
  EMAIL_EVENT_NAMES
} = require('./klaviyoEmailTemplates');

const OVERRIDE_SCHEMA_SQL = [
  `
    CREATE TABLE IF NOT EXISTS app_email_template_overrides (
      event_name text PRIMARY KEY,
      enabled boolean NOT NULL DEFAULT true,
      variant_a jsonb NOT NULL DEFAULT '{}'::jsonb,
      variant_b jsonb,
      split_percent int NOT NULL DEFAULT 100,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `
];

/* ---- sample props so previews show realistic content per event ---- */
function samplePropsFor(eventName) {
  return {
    resetUrl: 'https://riseforit.app/reset-password.html?token=SAMPLE',
    expiresInMinutes: 30,
    preview: 'Hey! Ready for tomorrow morning’s session?',
    fromDisplayName: 'Avery Stone',
    fromName: 'Avery Stone',
    day: 'Monday',
    weightLb: 182,
    severity: 6,
    location: 'Lower back',
    totalWarnings: 3,
    highSeverityWarnings: 1,
    topWarnings: ['Missed 2 check-ins this week', 'Sleep under 6 hours twice'],
    updatedAt: Date.now(),
    eventNameHint: eventName
  };
}

const clip = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function sanitizeVariant(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mode = raw.mode === 'code' ? 'code' : 'blocks';
  const out = {
    mode,
    subject: clip(raw.subject, 200),
    preheader: clip(raw.preheader, 250),
    greeting: clip(raw.greeting, 300),
    intro: clip(raw.intro, 1200),
    bullets: Array.isArray(raw.bullets)
      ? raw.bullets.map((b) => clip(b, 300)).filter(Boolean).slice(0, 8)
      : [],
    ctaLabel: clip(raw.ctaLabel, 120),
    html: mode === 'code' ? String(raw.html || '').slice(0, 200000) : ''
  };
  const hasContent = out.subject || out.preheader || out.greeting || out.intro
    || out.bullets.length || out.ctaLabel || out.html;
  return hasContent ? out : null;
}

function substitutePlaceholders(text, ctx) {
  return String(text || '')
    .replace(/\{\{\s*first_name\s*\}\}/gi, ctx.firstName || 'there')
    .replace(/\{\{\s*display_name\s*\}\}/gi, ctx.displayName || 'there')
    .replace(/\{\{\s*cta_url\s*\}\}/gi, ctx.ctaUrl || '')
    .replace(/\{\{\s*cta_label\s*\}\}/gi, ctx.ctaLabel || '')
    .replace(/\{\{\s*subject\s*\}\}/gi, ctx.subject || '')
    .replace(/\{\{\s*greeting\s*\}\}/gi, ctx.greeting || '')
    .replace(/\{\{\s*event_name\s*\}\}/gi, ctx.eventName || '');
}

/* Merge an owner variant over the built-in spec and render the final email.
   Blocks mode: empty fields fall back to the default copy. Code mode: the
   owner HTML wins, with {{placeholders}} substituted. */
function renderVariant({ eventName, displayName = '', eventProps = {}, variant }) {
  const spec = eventTemplateSpec({ eventName, displayName, eventProps });
  const firstName = String(displayName || '').trim().split(/\s+/)[0] || '';
  const merged = {
    ...spec,
    subject: variant?.subject || spec.subject,
    preheader: variant?.preheader || spec.preheader,
    greeting: variant?.greeting || spec.greeting,
    intro: variant?.intro || spec.intro,
    bullets: variant && variant.mode === 'blocks' && variant.bullets.length ? variant.bullets : spec.bullets,
    ctaLabel: variant?.ctaLabel || spec.ctaLabel
  };
  const ctx = {
    firstName,
    displayName: String(displayName || '').trim(),
    ctaUrl: spec.ctaUrl,
    ctaLabel: merged.ctaLabel,
    subject: merged.subject,
    greeting: merged.greeting,
    eventName
  };
  merged.subject = substitutePlaceholders(merged.subject, ctx);
  merged.preheader = substitutePlaceholders(merged.preheader, ctx);
  merged.greeting = substitutePlaceholders(merged.greeting, ctx);
  merged.intro = substitutePlaceholders(merged.intro, ctx);
  merged.bullets = (merged.bullets || []).map((b) => substitutePlaceholders(b, ctx));

  let html;
  let text;
  if (variant && variant.mode === 'code' && variant.html) {
    html = substitutePlaceholders(variant.html, ctx);
    text = renderEmailText(merged);
  } else {
    html = renderEmailHtml(merged);
    text = renderEmailText(merged);
  }
  return {
    subject: merged.subject,
    preheader: merged.preheader,
    ctaLabel: merged.ctaLabel,
    ctaUrl: spec.ctaUrl,
    html,
    text
  };
}

/* ---- override rows, cached briefly so sends stay fast ---- */
const cache = new Map(); // event_name -> { row, at }
const CACHE_MS = 30000;

async function loadOverrideRow(db, eventName) {
  const key = String(eventName || '').trim();
  if (!key) return null;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_MS) return hit.row;
  let row = null;
  try {
    const result = await db.query(
      'SELECT event_name, enabled, variant_a, variant_b, split_percent FROM app_email_template_overrides WHERE event_name = $1 LIMIT 1;',
      [key]
    );
    row = result.rows?.[0] || null;
  } catch {
    row = null; // table missing / db down: default template wins
  }
  cache.set(key, { row, at: now });
  return row;
}

function invalidateOverrideCache(eventName) {
  if (eventName) cache.delete(String(eventName).trim());
  else cache.clear();
}

/* Roll the split and mutate the event props to the owner's version.
   Returns the variant label used ('A' | 'B') or null when the default ran. */
async function applyOwnerEmailOverride({ db, eventName, displayName = '', eventProps = {}, props }) {
  const row = await loadOverrideRow(db, eventName);
  if (!row || row.enabled !== true) return null;
  const variantA = sanitizeVariant(row.variant_a);
  const variantB = sanitizeVariant(row.variant_b);
  if (!variantA && !variantB) return null;
  let variant = variantA || variantB;
  let label = variantA ? 'A' : 'B';
  if (variantA && variantB) {
    const pctA = Math.max(1, Math.min(99, Number(row.split_percent) || 50));
    if (Math.random() * 100 >= pctA) {
      variant = variantB;
      label = 'B';
    }
  }
  const rendered = renderVariant({ eventName, displayName, eventProps, variant });
  props.ode_email_subject = rendered.subject;
  props.ode_email_preheader = rendered.preheader;
  props.ode_email_cta_label = rendered.ctaLabel;
  props.ode_email_html = rendered.html;
  props.ode_email_text = rendered.text;
  props.ode_email_template_key = `owner_override_${label.toLowerCase()}`;
  props.ode_email_variant = label;
  return label;
}

module.exports = {
  OVERRIDE_SCHEMA_SQL,
  EMAIL_EVENT_NAMES,
  samplePropsFor,
  sanitizeVariant,
  renderVariant,
  loadOverrideRow,
  invalidateOverrideCache,
  applyOwnerEmailOverride
};
