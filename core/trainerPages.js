const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Appointment Booked',
  'Showed',
  'Offer Sent',
  'Won',
  'Lost',
  'Waitlist'
];

// Media bytes live on disk, not in Postgres: streaming videos out of the
// database burns hosted-DB data transfer quota extremely fast.
const TRAINER_MEDIA_DIR = path.join(__dirname, '..', 'data', 'trainer-media');
const TRAINER_MEDIA_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov'
};

function trainerMediaFileName(mediaId, mimeType) {
  const ext = TRAINER_MEDIA_EXTENSIONS[String(mimeType || '').toLowerCase()] || 'bin';
  return `${String(mediaId)}.${ext}`;
}

async function writeTrainerMediaFile(fileName, bytes) {
  await fs.promises.mkdir(TRAINER_MEDIA_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(TRAINER_MEDIA_DIR, fileName), bytes);
  return fileName;
}

async function readTrainerMediaFile(fileName) {
  const safe = path.basename(String(fileName || ''));
  if (!safe) return null;
  try {
    return await fs.promises.readFile(path.join(TRAINER_MEDIA_DIR, safe));
  } catch {
    return null;
  }
}

const MAX_TRAINER_PAGES = 5;
const MAX_LEAD_UPLOAD_GROUPS = 10;
const MAX_LEAD_UPLOAD_FILES_PER_GROUP = 4;
const MAX_LEAD_UPLOAD_SIZE_BYTES = Math.max(250_000, Number(process.env.TRAINER_PAGE_UPLOAD_MAX_BYTES || 5_000_000));
const MAX_LEAD_RECENT_EVENTS = 10;
const MAX_QUALIFICATION_QUESTIONS = 24;
const DEFAULT_QUALIFICATION_QUESTIONS = [
  { id: 'gender', label: 'Gender', type: 'radio', required: true, options: ['Female', 'Male', 'Other'] },
  { id: 'age', label: 'Age', type: 'radio', required: true, options: ['Under 18', '18-20', '21-30', '31-40', '41-50', '51-59', '60+', 'Other'] },
  { id: 'trainer_gender_preference', label: 'Trainer gender preference', type: 'radio', required: true, options: ['Female', 'Male', 'No preference', 'Other'] },
  { id: 'session_frequency', label: 'Session frequency', type: 'radio', required: true, options: ['Several weekly', 'Twice weekly', 'Once weekly', 'Twice monthly', 'Once monthly', 'One-off', 'Unsure', 'Other'] },
  { id: 'exercise_routine', label: 'Exercise routine', type: 'radio', required: true, options: ['None', 'About 1 hour weekly', 'A couple times weekly', '3+ times weekly', 'Prefer not to say', 'Other'] },
  { id: 'goals', label: 'Goals', type: 'checkbox', required: true, options: ['Aerobic fitness', 'Bodybuilding', 'Endurance', 'Toning', 'Strength', 'Nutrition', 'Weight loss', 'Discuss with trainer'] },
  { id: 'motivation', label: 'Motivation', type: 'radio', required: true, options: ['Health condition', 'Appearance', 'Physical event', 'Special event', 'Other'] },
  { id: 'open_to_online_training', label: 'Open to online training', type: 'radio', required: true, options: ['Yes', 'No'] },
  { id: 'preferred_days', label: 'Preferred days', type: 'checkbox', required: true, options: ['Any day', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  { id: 'preferred_times', label: 'Preferred times', type: 'checkbox', required: true, options: ['Any time', 'Early morning', 'Morning', 'Early afternoon', 'Late afternoon', 'Evening', 'Other'] },
  { id: 'start_date', label: 'Start date', type: 'radio', required: true, options: ['ASAP', 'Within weeks', 'Within a month', 'Other'] },
  { id: 'zip_or_town', label: 'ZIP code or town', type: 'text', required: true, placeholder: 'ZIP code or town' },
  { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' },
  { id: 'name_and_phone', label: 'Name and phone', type: 'contact', required: true, fields: ['full_name', 'phone'] }
];

const TRAINER_PAGE_SCHEMA_SQL = [
  `
    CREATE TABLE IF NOT EXISTS app_trainer_pages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      site_slug text NOT NULL DEFAULT '',
      page_slug text NOT NULL DEFAULT '',
      page_name text NOT NULL DEFAULT '',
      nav_label text NOT NULL DEFAULT '',
      nav_order integer NOT NULL DEFAULT 0,
      mode text NOT NULL DEFAULT 'custom_code',
      is_home boolean NOT NULL DEFAULT false,
      is_published boolean NOT NULL DEFAULT false,
      seo jsonb NOT NULL DEFAULT '{}'::jsonb,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      draft_content jsonb NOT NULL DEFAULT '{}'::jsonb,
      published_content jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz
    );
  `,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS site_slug text NOT NULL DEFAULT '';`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS page_slug text NOT NULL DEFAULT '';`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS page_name text NOT NULL DEFAULT '';`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS nav_label text NOT NULL DEFAULT '';`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS nav_order integer NOT NULL DEFAULT 0;`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'custom_code';`,
  `ALTER TABLE app_trainer_pages ALTER COLUMN mode SET DEFAULT 'custom_code';`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS is_home boolean NOT NULL DEFAULT false;`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS seo jsonb NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS draft_content jsonb NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS published_content jsonb NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE app_trainer_pages ADD COLUMN IF NOT EXISTS published_at timestamptz;`,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_pages_trainer_user_id ON app_trainer_pages(trainer_user_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_app_trainer_pages_site_page ON app_trainer_pages(site_slug, page_slug);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_app_trainer_pages_home_per_site ON app_trainer_pages(site_slug) WHERE is_home = true;`,
  `
    CREATE TABLE IF NOT EXISTS app_trainer_page_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES app_trainer_pages(id) ON DELETE CASCADE,
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      version_kind text NOT NULL DEFAULT 'manual_save',
      snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_versions_page_id ON app_trainer_page_versions(page_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_versions_trainer_user_id ON app_trainer_page_versions(trainer_user_id, created_at DESC);`,
  `
    CREATE TABLE IF NOT EXISTS app_trainer_page_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      page_id uuid REFERENCES app_trainer_pages(id) ON DELETE SET NULL,
      source_site_slug text NOT NULL DEFAULT '',
      source_page_slug text NOT NULL DEFAULT '',
      source_page_name text NOT NULL DEFAULT '',
      form_id text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'New Lead',
      tag_list text[] NOT NULL DEFAULT ARRAY[]::text[],
      full_name text NOT NULL DEFAULT '',
      email text NOT NULL DEFAULT '',
      phone text NOT NULL DEFAULT '',
      goal text NOT NULL DEFAULT '',
      budget text NOT NULL DEFAULT '',
      location text NOT NULL DEFAULT '',
      coaching_type text NOT NULL DEFAULT '',
      availability text NOT NULL DEFAULT '',
      injuries text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      answers jsonb NOT NULL DEFAULT '{}'::jsonb,
      uploads jsonb NOT NULL DEFAULT '[]'::jsonb,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_leads_trainer_user_id ON app_trainer_page_leads(trainer_user_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_leads_page_id ON app_trainer_page_leads(page_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_leads_status ON app_trainer_page_leads(trainer_user_id, status);`,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_leads_email ON app_trainer_page_leads(trainer_user_id, lower(email));`,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_leads_phone ON app_trainer_page_leads(trainer_user_id, phone);`,
  `
    CREATE TABLE IF NOT EXISTS app_trainer_page_lead_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id uuid NOT NULL REFERENCES app_trainer_page_leads(id) ON DELETE CASCADE,
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      event_type text NOT NULL DEFAULT 'note',
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_lead_events_lead_id ON app_trainer_page_lead_events(lead_id, created_at DESC);`,
  `
    CREATE TABLE IF NOT EXISTS app_trainer_page_qualification_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      page_id uuid REFERENCES app_trainer_pages(id) ON DELETE SET NULL,
      source_site_slug text NOT NULL DEFAULT '',
      source_page_slug text NOT NULL DEFAULT '',
      session_key text NOT NULL DEFAULT '',
      visitor_email text NOT NULL DEFAULT '',
      visitor_phone text NOT NULL DEFAULT '',
      lead_id uuid REFERENCES app_trainer_page_leads(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'draft',
      current_step integer NOT NULL DEFAULT 0,
      answers jsonb NOT NULL DEFAULT '{}'::jsonb,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_app_trainer_page_qualification_sessions_key ON app_trainer_page_qualification_sessions(trainer_user_id, page_id, session_key);`,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_qualification_sessions_contact_email ON app_trainer_page_qualification_sessions(trainer_user_id, lower(visitor_email));`,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_qualification_sessions_contact_phone ON app_trainer_page_qualification_sessions(trainer_user_id, visitor_phone);`,
  `
    CREATE TABLE IF NOT EXISTS app_trainer_page_media (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trainer_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      media_type text NOT NULL DEFAULT 'image',
      mime_type text NOT NULL DEFAULT '',
      file_name text NOT NULL DEFAULT '',
      byte_size integer NOT NULL DEFAULT 0,
      data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `,
  `CREATE INDEX IF NOT EXISTS idx_app_trainer_page_media_trainer_user_id ON app_trainer_page_media(trainer_user_id, created_at DESC);`,
  `ALTER TABLE app_trainer_page_media ADD COLUMN IF NOT EXISTS file_path text;`,
  `ALTER TABLE app_trainer_page_media ALTER COLUMN data DROP NOT NULL;`
];

const TRAINER_PAGE_MEDIA_IMAGE_MAX_BYTES = Math.max(250_000, Number(process.env.TRAINER_PAGE_MEDIA_IMAGE_MAX_BYTES || 10_000_000));
const TRAINER_PAGE_MEDIA_VIDEO_MAX_BYTES = Math.max(1_000_000, Number(process.env.TRAINER_PAGE_MEDIA_VIDEO_MAX_BYTES || 80_000_000));
const TRAINER_PAGE_MEDIA_MAX_ITEMS = Math.max(10, Number(process.env.TRAINER_PAGE_MEDIA_MAX_ITEMS || 300));
const TRAINER_PAGE_MEDIA_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const TRAINER_PAGE_MEDIA_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);

function cleanShortText(raw, max = 120) {
  return String(raw || '').trim().slice(0, Math.max(0, Number(max) || 0));
}

function cleanLongText(raw, max = 4000) {
  return String(raw || '').trim().slice(0, Math.max(0, Number(max) || 0));
}

function cleanObject(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function cleanArray(raw, { maxItems = 40 } = {}) {
  return Array.isArray(raw) ? raw.slice(0, Math.max(0, Number(maxItems) || 0)) : [];
}

function uniqueStringArray(raw, { maxItems = 40, maxLen = 120 } = {}) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const next = cleanShortText(item, maxLen);
    const key = next.toLowerCase();
    if (!next || seen.has(key)) continue;
    seen.add(key);
    out.push(next);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cleanNullableShortText(raw, max = 120) {
  const text = cleanShortText(raw, max);
  return text || null;
}

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function normalizePhone(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';
  const hasPlus = value.startsWith('+');
  value = value.replace(/[^\d+]/g, '');
  if (hasPlus) value = `+${value.replace(/[^\d]/g, '')}`;
  else value = value.replace(/[^\d]/g, '');
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 10) return '';
  return value;
}

function slugify(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeSiteSlug(raw, fallback = 'coach') {
  const slug = slugify(raw);
  return slug || slugify(fallback) || 'coach';
}

function normalizePageSlug(raw, fallback = 'page') {
  return slugify(raw || fallback);
}

function normalizePageMode(raw) {
  return 'custom_code';
}

function normalizeSeo(raw) {
  const seo = cleanObject(raw);
  return {
    title: cleanShortText(seo.title, 120),
    description: cleanLongText(seo.description, 300),
    imageUrl: cleanLongText(seo.imageUrl, 4000),
    noIndex: seo.noIndex === true
  };
}

function normalizeCustomCode(raw) {
  const code = cleanObject(raw);
  return {
    html: cleanLongText(code.html, 120_000),
    css: cleanLongText(code.css, 120_000),
    javascript: cleanLongText(code.javascript, 120_000),
    iframes: cleanArray(code.iframes, { maxItems: 20 }).map((entry) => cleanObject(entry)),
    embedScripts: cleanArray(code.embedScripts, { maxItems: 20 }).map((entry) => cleanObject(entry))
  };
}

function customCodeHasRenderableData(raw) {
  const code = cleanObject(raw);
  return Boolean(
    cleanLongText(code.html, 120_000)
    || cleanLongText(code.css, 120_000)
    || cleanLongText(code.javascript, 120_000)
    || cleanArray(code.iframes, { maxItems: 20 }).length
    || cleanArray(code.embedScripts, { maxItems: 20 }).length
  );
}

function escapeHtml(raw) {
  return String(raw || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildLegacyCustomCodeFromContent(content, { pageName = 'Coach page', coachName = 'Coach' } = {}) {
  const src = cleanObject(content);
  const mode = String(src.mode || '').trim().toLowerCase();
  const safeCoachName = escapeHtml(cleanShortText(coachName, 120) || 'Coach');
  const safePageName = escapeHtml(cleanShortText(pageName, 120) || 'Coach page');
  const theme = cleanObject(src.theme);
  const blocks = cleanArray(src.blocks, { maxItems: 120 });
  const forms = cleanArray(src.forms, { maxItems: 25 });
  const templateKey = cleanShortText(src.templateKey, 120).replace(/[_-]+/g, ' ').trim();
  if (mode === 'template' || templateKey || Object.keys(theme).length) {
    const headline = escapeHtml(cleanShortText(theme.headline || pageName, 200) || pageName);
    const subheadline = escapeHtml(cleanLongText(theme.subheadline, 400) || 'Custom coaching website');
    const body = escapeHtml(cleanLongText(theme.body, 1200) || 'This legacy page was converted into the custom code editor.');
    const ctaLabel = escapeHtml(cleanShortText(theme.ctaLabel || 'Apply now', 80) || 'Apply now');
    const templateLabel = escapeHtml(templateKey || 'Legacy template');
    return {
      html: `<section class="legacy-site legacy-hero"><div class="legacy-shell"><p class="legacy-kicker">${safeCoachName}</p><p class="legacy-template-label">${templateLabel}</p><h1>${headline}</h1><p class="legacy-sub">${subheadline}</p><p class="legacy-body">${body}</p><a class="legacy-btn" href="#trainer-public-lead-section">${ctaLabel}</a></div></section>`,
      css: '.legacy-site{padding:48px 24px}.legacy-shell{max-width:1100px;margin:0 auto}.legacy-kicker{margin:0 0 12px;font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;opacity:.62}.legacy-template-label{margin:0 0 18px;font-size:.82rem;font-weight:700;letter-spacing:.06em;color:rgba(16,36,52,.58)}.legacy-hero h1{margin:0;font-size:clamp(2.6rem,6vw,5rem);line-height:.92;letter-spacing:-.07em;color:#10283c;max-width:10ch}.legacy-sub{margin:18px 0 0;font-size:1.1rem;line-height:1.7;color:rgba(16,36,52,.72);max-width:58ch}.legacy-body{margin:12px 0 0;font-size:1rem;line-height:1.8;color:rgba(16,36,52,.76);max-width:56ch}.legacy-btn{display:inline-flex;margin-top:20px;padding:14px 20px;border-radius:999px;background:#10283c;color:#fff;text-decoration:none;font-weight:800}',
      javascript: '',
      iframes: [],
      embedScripts: []
    };
  }
  if (blocks.length) {
    const sections = blocks.map((rawBlock) => {
      const block = cleanObject(rawBlock);
      const blockType = cleanShortText(block.type || 'section', 80).toLowerCase() || 'section';
      const contentObj = cleanObject(block.content);
      const kicker = escapeHtml(cleanShortText(contentObj.kicker || block.label || blockType, 120));
      const headline = escapeHtml(cleanShortText(contentObj.headline || block.label || pageName, 220) || pageName);
      const body = escapeHtml(cleanLongText(contentObj.body || contentObj.copy, 1400));
      const items = cleanArray(contentObj.items, { maxItems: 8 }).map((item) => `<div class="legacy-panel"><p>${escapeHtml(cleanLongText(item, 240) || '')}</p></div>`).join('');
      const ctaLabel = escapeHtml(cleanShortText(contentObj.ctaLabel, 80));
      const ctaHref = escapeHtml(cleanLongText(contentObj.ctaHref || '#trainer-public-lead-section', 400) || '#trainer-public-lead-section');
      const ctaMarkup = ctaLabel ? `<a class="legacy-btn${blockType === 'hero' ? ' dark' : ''}" href="${ctaHref}">${ctaLabel}</a>` : '';
      return `<section class="legacy-site legacy-section type-${escapeHtml(blockType)}"><div class="legacy-shell"><p class="legacy-kicker">${kicker}</p><h2>${headline}</h2>${body ? `<p class="legacy-body">${body}</p>` : ''}${items ? `<div class="legacy-grid">${items}</div>` : ''}${ctaMarkup}</div></section>`;
    }).join('');
    return {
      html: sections,
      css: '.legacy-site{padding:24px}.legacy-shell{max-width:1100px;margin:0 auto}.legacy-section{border-top:1px solid rgba(16,36,52,.1)}.legacy-section:first-child{border-top:none}.legacy-section h2{margin:0;color:#10283c;font-size:clamp(1.9rem,3vw,3rem);line-height:1;letter-spacing:-.06em;max-width:16ch}.legacy-kicker{margin:0 0 10px;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;opacity:.6}.legacy-body{margin:16px 0 0;max-width:56ch;color:rgba(16,36,52,.76);line-height:1.8}.legacy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:18px}.legacy-panel{padding:18px;border:1px solid rgba(16,36,52,.08);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(244,239,231,.94))}.legacy-panel p{margin:0;font-weight:700;color:#10283c;line-height:1.6}.legacy-btn{display:inline-flex;margin-top:18px;padding:14px 20px;border-radius:999px;background:#fff;color:#10283c;border:1px solid rgba(16,36,52,.12);text-decoration:none;font-weight:800}.legacy-btn.dark{background:#10283c;border-color:#10283c;color:#fff}',
      javascript: '',
      iframes: [],
      embedScripts: []
    };
  }
  if (forms.length) {
    const form = cleanObject(forms[0]);
    const formName = cleanShortText(form.name || 'lead form', 120) || 'lead form';
    return {
      html: `<section class="legacy-site"><div class="legacy-shell"><p class="legacy-kicker">${safeCoachName}</p><h1>${safePageName}</h1><p class="legacy-body">This page includes the ${escapeHtml(formName)} form.</p></div></section>`,
      css: '.legacy-site{padding:48px 24px}.legacy-shell{max-width:1100px;margin:0 auto}.legacy-kicker{margin:0 0 12px;font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;opacity:.62}.legacy-site h1{margin:0;color:#10283c;font-size:clamp(2.5rem,5vw,4.5rem);line-height:.94;letter-spacing:-.07em}.legacy-body{margin:18px 0 0;max-width:56ch;color:rgba(16,36,52,.76);line-height:1.8}',
      javascript: '',
      iframes: [],
      embedScripts: []
    };
  }
  return {
    html: `<section class="legacy-site"><div class="legacy-shell"><p class="legacy-kicker">${safeCoachName}</p><h1>${safePageName}</h1><p class="legacy-body">This legacy page was converted into the custom code editor.</p></div></section>`,
    css: '.legacy-site{padding:48px 24px}.legacy-shell{max-width:1100px;margin:0 auto}.legacy-kicker{margin:0 0 12px;font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;opacity:.62}.legacy-site h1{margin:0;color:#10283c;font-size:clamp(2.5rem,5vw,4.5rem);line-height:.94;letter-spacing:-.07em}.legacy-body{margin:18px 0 0;max-width:56ch;color:rgba(16,36,52,.76);line-height:1.8}',
    javascript: '',
    iframes: [],
    embedScripts: []
  };
}

function normalizeBlock(raw) {
  const block = cleanObject(raw);
  return {
    id: cleanShortText(block.id || block.blockId || '', 120),
    type: cleanShortText(block.type, 80),
    label: cleanShortText(block.label, 120),
    content: cleanObject(block.content),
    style: cleanObject(block.style),
    settings: cleanObject(block.settings),
    layout: cleanObject(block.layout),
    mobile: cleanObject(block.mobile)
  };
}

function normalizeFormField(raw) {
  const field = cleanObject(raw);
  return {
    id: cleanShortText(field.id || field.key || '', 120),
    type: cleanShortText(field.type, 80),
    label: cleanShortText(field.label, 120),
    name: cleanShortText(field.name || field.id || field.key, 120),
    placeholder: cleanShortText(field.placeholder, 160),
    required: field.required === true,
    options: uniqueStringArray(field.options, { maxItems: 40, maxLen: 120 }),
    accept: uniqueStringArray(field.accept, { maxItems: 10, maxLen: 40 }),
    meta: cleanObject(field.meta)
  };
}

function normalizeLeadUploads(raw) {
  const groups = [];
  for (const entry of cleanArray(raw, { maxItems: MAX_LEAD_UPLOAD_GROUPS })) {
    const group = cleanObject(entry);
    const key = cleanShortText(group.key || group.field || group.name, 120);
    if (!key) continue;
    const files = [];
    for (const file of cleanArray(group.files, { maxItems: MAX_LEAD_UPLOAD_FILES_PER_GROUP })) {
      const item = cleanObject(file);
      const size = Math.max(0, Number(item.size || 0) || 0);
      if (!size || size > MAX_LEAD_UPLOAD_SIZE_BYTES) continue;
      const dataUrl = cleanLongText(item.dataUrl, Math.min(MAX_LEAD_UPLOAD_SIZE_BYTES * 2, 8_000_000));
      if (!dataUrl.startsWith('data:')) continue;
      files.push({
        name: cleanShortText(item.name || 'upload', 160) || 'upload',
        type: cleanShortText(item.type, 120),
        size,
        dataUrl
      });
    }
    if (!files.length) continue;
    groups.push({ key, files });
  }
  return groups;
}

function normalizeQualificationQuestion(raw, index = 0) {
  const question = cleanObject(raw);
  const id = slugify(question.id || question.key || question.label || `question-${index + 1}`) || `question-${index + 1}`;
  const type = cleanShortText(question.type || 'radio', 40).toLowerCase() || 'radio';
  const fields = uniqueStringArray(question.fields, { maxItems: 4, maxLen: 60 }).map((entry) => slugify(entry) || cleanShortText(entry, 60));
  return {
    id,
    label: cleanShortText(question.label || question.title || `Question ${index + 1}`, 140) || `Question ${index + 1}`,
    type,
    required: question.required !== false,
    placeholder: cleanShortText(question.placeholder, 160),
    helperText: cleanLongText(question.helperText || question.description, 320),
    options: uniqueStringArray(question.options, { maxItems: 20, maxLen: 120 }),
    fields
  };
}

function normalizeQualificationSettings(raw) {
  const settings = cleanObject(raw);
  const questions = cleanArray(settings.questions, { maxItems: MAX_QUALIFICATION_QUESTIONS })
    .map((question, index) => normalizeQualificationQuestion(question, index))
    .filter((question) => question.label);
  return {
    enabled: settings.enabled !== false,
    title: cleanShortText(settings.title || 'A few quick questions before you view this coach page', 140),
    subtitle: cleanLongText(settings.subtitle || 'This helps the trainer qualify the right leads and tailor the follow-up.', 320),
    ctaLabel: cleanShortText(settings.ctaLabel || 'Continue', 40) || 'Continue',
    completedLabel: cleanShortText(settings.completedLabel || 'Thanks. Opening the page...', 120),
    questions: questions.length ? questions : DEFAULT_QUALIFICATION_QUESTIONS.map((question, index) => normalizeQualificationQuestion(question, index))
  };
}

function normalizeAutomationNode(raw) {
  const node = cleanObject(raw);
  return {
    id: cleanShortText(node.id || '', 120),
    type: cleanShortText(node.type, 80),
    config: cleanObject(node.config),
    position: cleanObject(node.position)
  };
}

function matchingAutomationNodes(page, eventType) {
  const nodes = Array.isArray(page?.publishedContent?.automations?.nodes)
    ? page.publishedContent.automations.nodes
    : Array.isArray(page?.draftContent?.automations?.nodes)
      ? page.draftContent.automations.nodes
      : [];
  const expected = cleanShortText(eventType, 80);
  return nodes.filter((node) => cleanShortText(node?.type, 80) === expected);
}

function automationNodesForPage(page) {
  return Array.isArray(page?.publishedContent?.automations?.nodes)
    ? page.publishedContent.automations.nodes
    : Array.isArray(page?.draftContent?.automations?.nodes)
      ? page.draftContent.automations.nodes
      : [];
}

function normalizeAutomationType(raw) {
  return cleanShortText(raw, 80).toLowerCase();
}

function isAutomationTriggerType(raw) {
  return ['form_submitted', 'button_clicked', 'page_viewed'].includes(normalizeAutomationType(raw));
}

function normalizeLeadTag(raw) {
  return cleanShortText(raw, 60);
}

function isLeadStage(raw) {
  return LEAD_STAGES.includes(String(raw || '').trim());
}

function resolveAutomationDetailsValue(raw, context = {}) {
  if (typeof raw === 'string') {
    return raw
      .replace(/\{\{\s*lead\.name\s*\}\}/gi, String(context?.lead?.fullName || ''))
      .replace(/\{\{\s*lead\.email\s*\}\}/gi, String(context?.lead?.email || ''))
      .replace(/\{\{\s*page\.slug\s*\}\}/gi, String(context?.page?.pageSlug || ''))
      .replace(/\{\{\s*page\.siteSlug\s*\}\}/gi, String(context?.page?.siteSlug || ''));
  }
  return raw;
}

async function recordLeadAutomationEvent(db, trainerUserId, leadId, eventType, details = {}) {
  if (!leadId || !trainerUserId) return;
  await db.query(
    `
      INSERT INTO app_trainer_page_lead_events (
        lead_id,
        trainer_user_id,
        event_type,
        details
      )
      VALUES ($1, $2, $3, $4::jsonb);
    `,
    [
      leadId,
      trainerUserId,
      cleanShortText(eventType, 80) || 'automation',
      JSON.stringify(cleanObject(details))
    ]
  );
}

function automationFieldValue(fieldKey, context = {}) {
  const key = cleanShortText(fieldKey, 120).toLowerCase();
  if (!key) return '';
  const answers = cleanObject(context?.payload?.answers);
  const lead = cleanObject(context?.lead);
  const meta = cleanObject(context?.payload);
  const direct = {
    name: lead.fullName || meta.fullName || answers.fullName || answers.name || '',
    full_name: lead.fullName || meta.fullName || answers.fullName || answers.name || '',
    fullname: lead.fullName || meta.fullName || answers.fullName || answers.name || '',
    email: lead.email || meta.email || answers.email || '',
    phone: lead.phone || meta.phone || answers.phone || '',
    goal: lead.goal || meta.goal || answers.goal || '',
    budget: lead.budget || meta.budget || answers.budget || '',
    location: lead.location || meta.location || answers.location || '',
    coaching_type: lead.coachingType || meta.coachingType || answers.coachingType || answers.coaching_type || '',
    availability: lead.availability || meta.availability || answers.availability || '',
    injuries: lead.injuries || meta.injuries || answers.injuries || '',
    form_id: lead.formId || meta.formId || '',
    page_slug: context?.page?.pageSlug || meta.pageSlug || '',
    site_slug: context?.page?.siteSlug || meta.siteSlug || ''
  };
  if (Object.prototype.hasOwnProperty.call(direct, key)) return direct[key];
  const answerMatch = Object.entries(answers).find(([entryKey]) => cleanShortText(entryKey, 120).toLowerCase() === key);
  return answerMatch ? answerMatch[1] : '';
}

function normalizeAutomationScalar(raw) {
  if (Array.isArray(raw)) return raw.map((entry) => String(entry || '').trim()).filter(Boolean);
  if (raw == null) return '';
  return String(raw).trim();
}

function evaluateAutomationFieldCondition(config = {}, context = {}) {
  const fieldKey = cleanShortText(config.field || config.label || config.name || config.source, 120);
  const operator = cleanShortText(config.operator || config.comparator || 'contains', 40).toLowerCase() || 'contains';
  const expectedRaw = resolveAutomationDetailsValue(config.target || config.value || '', context);
  const actualRaw = automationFieldValue(fieldKey, context);
  const actual = normalizeAutomationScalar(actualRaw);
  const expected = normalizeAutomationScalar(expectedRaw);
  if (!fieldKey) return true;
  if (Array.isArray(actual)) {
    const actualLower = actual.map((entry) => entry.toLowerCase());
    const expectedList = Array.isArray(expected) ? expected : [String(expected || '')];
    if (operator === 'equals' || operator === 'is') {
      return expectedList.some((entry) => actualLower.includes(String(entry || '').toLowerCase()));
    }
    return expectedList.some((entry) => actualLower.some((actualEntry) => actualEntry.includes(String(entry || '').toLowerCase())));
  }
  const actualText = String(actual || '').toLowerCase();
  const expectedText = Array.isArray(expected)
    ? String(expected[0] || '').toLowerCase()
    : String(expected || '').toLowerCase();
  if (!expectedText) return Boolean(actualText);
  if (operator === 'equals' || operator === 'is') return actualText === expectedText;
  if (operator === 'not_equals' || operator === 'is_not') return actualText !== expectedText;
  if (operator === 'starts_with') return actualText.startsWith(expectedText);
  if (operator === 'ends_with') return actualText.endsWith(expectedText);
  return actualText.includes(expectedText);
}

function triggerMatchesAutomationNode(config = {}, context = {}) {
  const eventType = normalizeAutomationType(context?.eventType);
  const expectedTarget = cleanLongText(
    resolveAutomationDetailsValue(config.target || config.value || config.formId || '', context),
    2000
  ).toLowerCase();
  if (!expectedTarget) return true;
  if (eventType === 'form_submitted') {
    const formId = cleanShortText(context?.payload?.formId || context?.lead?.formId || '', 120).toLowerCase();
    return formId === expectedTarget;
  }
  if (eventType === 'button_clicked') {
    const target = cleanLongText(context?.eventTarget || context?.payload?.eventTarget || '', 2000).toLowerCase();
    return target === expectedTarget || target.includes(expectedTarget);
  }
  if (eventType === 'page_viewed') {
    const currentPath = buildPublicPath(context?.page?.siteSlug || '', context?.page?.pageSlug || '').toLowerCase();
    const currentPageSlug = cleanShortText(context?.page?.pageSlug || '', 120).toLowerCase();
    return currentPath === expectedTarget || currentPageSlug === expectedTarget || currentPath.includes(expectedTarget);
  }
  return true;
}

function createAutomationSummary(eventType = '') {
  return {
    eventType: normalizeAutomationType(eventType),
    redirectTarget: '',
    assignedOffer: '',
    notifications: [],
    webhooks: [],
    emails: [],
    tagsAdded: [],
    stageChangedTo: '',
    createOrUpdateLead: false,
    delays: [],
    integrations: [],
    matchedTriggers: 0,
    conditions: []
  };
}

function executeTrainerPageAutomationNodes(page, context = {}) {
  const nodes = automationNodesForPage(page);
  const summary = createAutomationSummary(context?.eventType);
  let sequenceActive = false;
  let gate = true;
  let lastConditionResult = true;
  for (const node of nodes) {
    const nodeType = normalizeAutomationType(node?.type);
    const config = cleanObject(node?.config);
    if (isAutomationTriggerType(nodeType)) {
      sequenceActive = nodeType === summary.eventType && triggerMatchesAutomationNode(config, context);
      gate = sequenceActive;
      lastConditionResult = sequenceActive;
      if (sequenceActive) summary.matchedTriggers += 1;
      continue;
    }
    if (!sequenceActive) continue;
    if (nodeType === 'field_condition') {
      lastConditionResult = evaluateAutomationFieldCondition(config, context);
      gate = lastConditionResult;
      summary.conditions.push({
        field: cleanShortText(config.field || config.label || config.name || '', 120),
        result: lastConditionResult
      });
      continue;
    }
    if (nodeType === 'if_else') {
      const branch = cleanShortText(config.target || config.value || config.label || 'if', 40).toLowerCase();
      if (branch === 'else' || branch === 'false' || branch === 'no') gate = !lastConditionResult;
      else gate = lastConditionResult;
      continue;
    }
    if (!gate) continue;
    const resolvedValue = resolveAutomationDetailsValue(config.target || config.value || '', context);
    if (nodeType === 'add_tag') {
      const tag = normalizeLeadTag(resolvedValue);
      if (tag && !summary.tagsAdded.includes(tag)) summary.tagsAdded.push(tag);
      continue;
    }
    if (nodeType === 'change_stage') {
      if (isLeadStage(resolvedValue)) summary.stageChangedTo = String(resolvedValue).trim();
      continue;
    }
    if (nodeType === 'assign_offer') {
      summary.assignedOffer = cleanShortText(resolvedValue, 160);
      continue;
    }
    if (nodeType === 'redirect') {
      if (!summary.redirectTarget) summary.redirectTarget = cleanLongText(resolvedValue, 2000);
      continue;
    }
    if (nodeType === 'notify_trainer') {
      const note = cleanLongText(resolvedValue || config.label || 'Trainer notification queued.', 500);
      if (note) summary.notifications.push(note);
      continue;
    }
    if (nodeType === 'email') {
      const emailTarget = cleanLongText(resolvedValue || config.label, 500);
      if (emailTarget) summary.emails.push(emailTarget);
      continue;
    }
    if (nodeType === 'webhook') {
      const hook = cleanLongText(resolvedValue, 2000);
      if (hook) summary.webhooks.push(hook);
      continue;
    }
    if (nodeType === 'wait_delay') {
      const delayValue = cleanShortText(resolvedValue || config.label, 120);
      if (delayValue) summary.delays.push(delayValue);
      continue;
    }
    if (nodeType === 'google_sheets' || nodeType === 'google_calendar') {
      summary.integrations.push({
        type: nodeType,
        target: cleanLongText(resolvedValue || config.label, 500)
      });
      continue;
    }
    if (nodeType === 'create_update_lead') {
      summary.createOrUpdateLead = true;
    }
  }
  return summary;
}

async function applyAutomationSummaryToLead(db, lead, summary) {
  if (!lead?.id || !lead?.trainerUserId) return lead;
  const nextTags = uniqueStringArray([...(lead.tags || []), ...(summary?.tagsAdded || [])], { maxItems: 20, maxLen: 60 });
  const nextStatus = isLeadStage(summary?.stageChangedTo) ? String(summary.stageChangedTo).trim() : lead.status;
  const nextMeta = {
    ...(lead.meta || {}),
    assignedOffer: summary?.assignedOffer || lead.meta?.assignedOffer || '',
    automationRedirectTarget: summary?.redirectTarget || '',
    automationNotifications: cleanArray(summary?.notifications, { maxItems: 10 }),
    automationWebhooks: cleanArray(summary?.webhooks, { maxItems: 10 }),
    automationEmails: cleanArray(summary?.emails, { maxItems: 10 }),
    automationDelays: cleanArray(summary?.delays, { maxItems: 10 }),
    automationIntegrations: cleanArray(summary?.integrations, { maxItems: 10 }),
    automationCreateOrUpdateLead: summary?.createOrUpdateLead === true
  };
  const tagsChanged = JSON.stringify(nextTags) !== JSON.stringify(lead.tags || []);
  const statusChanged = nextStatus !== lead.status;
  const metaChanged = JSON.stringify(nextMeta) !== JSON.stringify(lead.meta || {});
  if (!tagsChanged && !statusChanged && !metaChanged) return lead;
  const updated = await db.query(
    `
      UPDATE app_trainer_page_leads
      SET status = $3,
          tag_list = $4::text[],
          meta = $5::jsonb,
          updated_at = now()
      WHERE id = $1
        AND trainer_user_id = $2
      RETURNING *;
    `,
    [lead.id, lead.trainerUserId, nextStatus, nextTags, JSON.stringify(nextMeta)]
  );
  const refreshed = mapLeadRow(updated.rows?.[0] || null);
  if (!refreshed) return lead;
  if (summary?.tagsAdded?.length) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_add_tag', {
      tags: summary.tagsAdded
    });
  }
  if (summary?.stageChangedTo && summary.stageChangedTo !== lead.status) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_change_stage', {
      status: summary.stageChangedTo
    });
  }
  if (summary?.assignedOffer) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_assign_offer', {
      offer: summary.assignedOffer
    });
  }
  if (summary?.redirectTarget) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_redirect', {
      target: summary.redirectTarget
    });
  }
  if (summary?.notifications?.length) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_notify_trainer', {
      notifications: summary.notifications
    });
  }
  if (summary?.webhooks?.length) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_webhook', {
      webhooks: summary.webhooks
    });
  }
  if (summary?.emails?.length) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_email', {
      emails: summary.emails
    });
  }
  if (summary?.delays?.length) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_wait_delay', {
      delays: summary.delays
    });
  }
  if (summary?.integrations?.length) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_integration', {
      integrations: summary.integrations
    });
  }
  if (summary?.createOrUpdateLead) {
    await recordLeadAutomationEvent(db, lead.trainerUserId, lead.id, 'automation_create_update_lead', {
      applied: true
    });
  }
  return refreshed;
}

function normalizeDraftContent(raw, mode, { pageName = 'Coach page', coachName = 'Coach' } = {}) {
  const content = cleanObject(raw);
  const normalized = {
    mode: normalizePageMode(mode || content.mode),
    navigation: cleanObject(content.navigation),
    customCode: normalizeCustomCode(content.customCode),
    assets: cleanArray(content.assets, { maxItems: 80 }).map((asset) => cleanObject(asset)),
    settings: cleanObject(content.settings),
    resultsPage: cleanObject(content.resultsPage)
  };
  const blocks = cleanArray(content.blocks, { maxItems: 120 }).map(normalizeBlock);
  const forms = cleanArray(content.forms, { maxItems: 25 }).map((form) => {
    const next = cleanObject(form);
    return {
      id: cleanShortText(next.id, 120),
      name: cleanShortText(next.name, 120),
      submitLabel: cleanShortText(next.submitLabel, 80),
      successMode: cleanShortText(next.successMode, 80),
      successTarget: cleanLongText(next.successTarget, 2000),
      fields: cleanArray(next.fields, { maxItems: 60 }).map(normalizeFormField)
    };
  });
  const automationNodes = cleanArray(content.automations?.nodes, { maxItems: 250 }).map(normalizeAutomationNode);
  const automationEdges = cleanArray(content.automations?.edges, { maxItems: 400 }).map((edge) => cleanObject(edge));
  const theme = cleanObject(content.theme);
  const legacyTemplateKey = cleanShortText(content.templateKey, 120);
  if (forms.length) normalized.forms = forms;
  if (automationNodes.length || automationEdges.length) {
    normalized.automations = {
      nodes: automationNodes,
      edges: automationEdges
    };
  }
  if (!customCodeHasRenderableData(normalized.customCode)) {
    normalized.customCode = buildLegacyCustomCodeFromContent({
      ...normalized,
      mode: normalizePageMode(mode || content.mode),
      templateKey: legacyTemplateKey,
      theme,
      blocks,
      forms: normalized.forms
    }, { pageName, coachName });
  }
  return normalized;
}

function normalizePagePayload(payload = {}, fallbackSiteSlug = '') {
  const src = cleanObject(payload);
  const pageName = cleanShortText(src.pageName || src.title || 'Untitled page', 120) || 'Untitled page';
  const requestedHome = src.isHome === true || String(src.pageSlug || '').trim() === '';
  const pageSlug = requestedHome ? '' : normalizePageSlug(src.pageSlug || pageName, 'page');
  const mode = normalizePageMode(src.mode);
  const siteSlug = normalizeSiteSlug(src.siteSlug || fallbackSiteSlug || src.publicHandle || src.username || 'coach');
  const navOrderRaw = Number(src.navOrder);
  return {
    id: cleanShortText(src.id, 80),
    siteSlug,
    pageSlug,
    pageName,
    navLabel: cleanShortText(src.navLabel || pageName, 80) || pageName,
    navOrder: Number.isFinite(navOrderRaw) ? Math.max(0, Math.floor(navOrderRaw)) : null,
    mode,
    isHome: requestedHome,
    seo: normalizeSeo(src.seo),
    settings: cleanObject(src.settings),
    draftContent: normalizeDraftContent(src.draftContent || src.content, mode, {
      pageName
    })
  };
}

function stageIsValid(raw) {
  return LEAD_STAGES.includes(String(raw || '').trim());
}

function buildPublicPath(siteSlug, pageSlug = '') {
  const site = normalizeSiteSlug(siteSlug, 'coach');
  const page = normalizePageSlug(pageSlug, '');
  return page ? `/coach/${site}/${page}` : `/coach/${site}`;
}

function mapTrainerPageRow(row) {
  if (!row) return null;
  const coachName = row.full_name || row.display_name || row.username || 'Coach';
  return {
    id: row.id,
    trainerUserId: row.trainer_user_id,
    siteSlug: row.site_slug || '',
    pageSlug: row.page_slug || '',
    pageName: row.page_name || 'Untitled page',
    navLabel: row.nav_label || row.page_name || 'Page',
    navOrder: Number.isFinite(Number(row.nav_order)) ? Number(row.nav_order) : 0,
    mode: normalizePageMode(row.mode),
    isHome: row.is_home === true,
    isPublished: row.is_published === true,
    seo: cleanObject(row.seo),
    settings: cleanObject(row.settings),
    draftContent: normalizeDraftContent(row.draft_content, row.mode, {
      pageName: row.page_name || 'Untitled page',
      coachName
    }),
    publishedContent: normalizeDraftContent(row.published_content, row.mode, {
      pageName: row.page_name || 'Untitled page',
      coachName
    }),
    publicPath: buildPublicPath(row.site_slug || '', row.page_slug || ''),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    publishedAt: row.published_at || null
  };
}

function mapLeadRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    trainerUserId: row.trainer_user_id,
    pageId: row.page_id || null,
    sourceSiteSlug: row.source_site_slug || '',
    sourcePageSlug: row.source_page_slug || '',
    sourcePageName: row.source_page_name || '',
    formId: row.form_id || '',
    status: row.status || 'New Lead',
    tags: Array.isArray(row.tag_list) ? row.tag_list : [],
    fullName: row.full_name || '',
    email: row.email || '',
    phone: row.phone || '',
    goal: row.goal || '',
    budget: row.budget || '',
    location: row.location || '',
    coachingType: row.coaching_type || '',
    availability: row.availability || '',
    injuries: row.injuries || '',
    notes: row.notes || '',
    answers: cleanObject(row.answers),
    uploads: Array.isArray(row.uploads) ? row.uploads : [],
    meta: cleanObject(row.meta),
    recentEvents: Array.isArray(row.recent_events) ? row.recent_events : [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapQualificationSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    trainerUserId: row.trainer_user_id,
    pageId: row.page_id,
    sourceSiteSlug: row.source_site_slug || '',
    sourcePageSlug: row.source_page_slug || '',
    sessionKey: row.session_key || '',
    visitorEmail: row.visitor_email || '',
    visitorPhone: row.visitor_phone || '',
    leadId: row.lead_id || null,
    status: row.status || 'draft',
    currentStep: Number.isFinite(Number(row.current_step)) ? Number(row.current_step) : 0,
    answers: cleanObject(row.answers),
    meta: cleanObject(row.meta),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null
  };
}

function mapTrainerPageVersionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    pageId: row.page_id,
    trainerUserId: row.trainer_user_id,
    versionKind: row.version_kind || 'manual_save',
    snapshot: cleanObject(row.snapshot),
    createdAt: row.created_at || null
  };
}

async function resolveTrainerSiteSlug(db, trainerUserId) {
  const result = await db.query(
    `
      SELECT
        u.username,
        u.display_name,
        tp.meta
      FROM app_users u
      LEFT JOIN app_trainer_profiles tp ON tp.user_id = u.id
      WHERE u.id = $1
      LIMIT 1;
    `,
    [trainerUserId]
  );
  const row = result.rows?.[0] || null;
  const meta = cleanObject(row?.meta);
  return normalizeSiteSlug(
    meta.pageSiteSlug
      || meta.publicHandle
      || row?.username
      || row?.display_name
      || 'coach'
  );
}

async function persistTrainerSiteSlug(db, trainerUserId, siteSlug) {
  const normalized = normalizeSiteSlug(siteSlug, 'coach');
  await db.query(
    `
      INSERT INTO app_trainer_profiles (user_id, meta, updated_at)
      VALUES ($1, jsonb_build_object('pageSiteSlug', $2::text), now())
      ON CONFLICT (user_id) DO UPDATE SET
        meta = jsonb_set(COALESCE(app_trainer_profiles.meta, '{}'::jsonb), '{pageSiteSlug}', to_jsonb($2::text), true),
        updated_at = now();
    `,
    [trainerUserId, normalized]
  );
  return normalized;
}

async function assertSiteSlugAvailable(db, trainerUserId, siteSlug) {
  const result = await db.query(
    `
      SELECT trainer_user_id
      FROM app_trainer_pages
      WHERE site_slug = $1
      GROUP BY trainer_user_id
      LIMIT 2;
    `,
    [siteSlug]
  );
  const owners = (result.rows || []).map((row) => String(row.trainer_user_id || '').trim()).filter(Boolean);
  if (!owners.length) return;
  if (owners.every((owner) => owner === String(trainerUserId || '').trim())) return;
  throw new Error('That public coach slug is already taken.');
}

async function listTrainerPages(db, trainerUserId) {
  const result = await db.query(
    `
      SELECT *
      FROM app_trainer_pages
      WHERE trainer_user_id = $1
      ORDER BY nav_order ASC, created_at ASC;
    `,
    [trainerUserId]
  );
  return (result.rows || []).map(mapTrainerPageRow);
}

function sortPagesForNavigation(rawPages) {
  return (Array.isArray(rawPages) ? rawPages.slice() : []).sort((a, b) => {
    const left = Number.isFinite(Number(a?.navOrder)) ? Number(a.navOrder) : 0;
    const right = Number.isFinite(Number(b?.navOrder)) ? Number(b.navOrder) : 0;
    if (left !== right) return left - right;
    const leftCreated = Date.parse(String(a?.createdAt || ''));
    const rightCreated = Date.parse(String(b?.createdAt || ''));
    if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) {
      return leftCreated - rightCreated;
    }
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

async function rebalanceTrainerPageOrder(db, trainerUserId, pageId, requestedOrder, currentPages = []) {
  const pageKey = String(pageId || '').trim();
  if (!pageKey) return;
  const pages = sortPagesForNavigation(currentPages);
  const target = pages.find((page) => String(page?.id || '').trim() === pageKey) || null;
  if (!target) return;
  const others = pages.filter((page) => String(page?.id || '').trim() !== pageKey);
  const insertAt = Math.max(0, Math.min(others.length, Number.isFinite(Number(requestedOrder)) ? Math.floor(Number(requestedOrder)) : others.length));
  others.splice(insertAt, 0, target);
  for (let index = 0; index < others.length; index += 1) {
    const row = others[index];
    await db.query(
      `
        UPDATE app_trainer_pages
        SET nav_order = $3,
            updated_at = CASE WHEN id = $2 THEN now() ELSE updated_at END
        WHERE trainer_user_id = $1
          AND id = $2;
      `,
      [trainerUserId, row.id, index]
    );
  }
}

async function getTrainerPageById(db, trainerUserId, pageId) {
  const result = await db.query(
    `
      SELECT *
      FROM app_trainer_pages
      WHERE trainer_user_id = $1
        AND id = $2
      LIMIT 1;
    `,
    [trainerUserId, pageId]
  );
  return mapTrainerPageRow(result.rows?.[0] || null);
}

async function insertTrainerPageVersion(db, trainerUserId, pageId, versionKind, snapshot) {
  await db.query(
    `
      INSERT INTO app_trainer_page_versions (
        page_id,
        trainer_user_id,
        version_kind,
        snapshot
      )
      VALUES ($1, $2, $3, $4::jsonb);
    `,
    [pageId, trainerUserId, cleanShortText(versionKind, 40) || 'manual_save', JSON.stringify(cleanObject(snapshot))]
  );
}

async function listTrainerPageVersions(db, trainerUserId, pageId, { limit = 25 } = {}) {
  const max = Math.max(1, Math.min(100, Number(limit) || 25));
  const result = await db.query(
    `
      SELECT id, page_id, trainer_user_id, version_kind, snapshot, created_at
      FROM app_trainer_page_versions
      WHERE trainer_user_id = $1
        AND page_id = $2
      ORDER BY created_at DESC
      LIMIT $3;
    `,
    [trainerUserId, pageId, max]
  );
  return (result.rows || []).map(mapTrainerPageVersionRow);
}

async function restoreTrainerPageVersion(db, trainerUserId, versionId) {
  const result = await db.query(
    `
      SELECT id, page_id, trainer_user_id, version_kind, snapshot, created_at
      FROM app_trainer_page_versions
      WHERE trainer_user_id = $1
        AND id = $2
      LIMIT 1;
    `,
    [trainerUserId, versionId]
  );
  const version = mapTrainerPageVersionRow(result.rows?.[0] || null);
  if (!version?.pageId) throw new Error('Trainer page version not found.');
  const snapshotPage = cleanObject(version.snapshot?.page);
  const current = await getTrainerPageById(db, trainerUserId, version.pageId);
  if (!current) throw new Error('Trainer page not found.');
  const restoredPayload = {
    id: current.id,
    siteSlug: snapshotPage.siteSlug || current.siteSlug,
    pageSlug: snapshotPage.pageSlug || current.pageSlug,
    pageName: snapshotPage.pageName || current.pageName,
    navLabel: snapshotPage.navLabel || current.navLabel,
    navOrder: Number.isFinite(Number(snapshotPage.navOrder)) ? Number(snapshotPage.navOrder) : current.navOrder,
    mode: snapshotPage.mode || current.mode,
    isHome: snapshotPage.isHome === true || current.isHome === true,
    seo: cleanObject(snapshotPage.seo),
    settings: cleanObject(snapshotPage.settings),
    draftContent: cleanObject(snapshotPage.draftContent)
  };
  const restored = await saveTrainerPage(db, trainerUserId, restoredPayload, {
    versionKind: 'restore'
  });
  return {
    page: restored,
    restoredFrom: version
  };
}

const RESERVED_SITE_SLUGS = new Set(['averystone', 'demo', 'demo-trainer-layout']);

async function saveTrainerPage(db, trainerUserId, payload, { versionKind = 'manual_save', publish = false } = {}) {
  const fallbackSiteSlug = await resolveTrainerSiteSlug(db, trainerUserId);
  const normalized = normalizePagePayload(payload, fallbackSiteSlug);
  // A save that arrives without a real site name (or with the generic 'coach'
  // default) must never move an existing site to a new URL - keep the
  // trainer's current site slug instead.
  const requestedSiteSlug = slugify(String(payload?.siteSlug || payload?.slug || ''));
  if (!requestedSiteSlug || normalized.siteSlug === 'coach') {
    const existingSite = await db.query(
      'SELECT site_slug FROM app_trainer_pages WHERE trainer_user_id = $1 ORDER BY created_at ASC LIMIT 1;',
      [trainerUserId]
    );
    const currentSiteSlug = String(existingSite.rows?.[0]?.site_slug || '').trim();
    if (currentSiteSlug) normalized.siteSlug = currentSiteSlug;
  }
  if (RESERVED_SITE_SLUGS.has(normalized.siteSlug)) {
    throw new Error('That coach site name is reserved.');
  }
  await assertSiteSlugAvailable(db, trainerUserId, normalized.siteSlug);
  await persistTrainerSiteSlug(db, trainerUserId, normalized.siteSlug);

  const currentPages = await listTrainerPages(db, trainerUserId);
  const existing = normalized.id
    ? currentPages.find((page) => page.id === normalized.id) || null
    : null;

  if (normalized.id && !existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized.id)) {
    const foreign = await db.query(
      'SELECT trainer_user_id FROM app_trainer_pages WHERE id = $1 LIMIT 1;',
      [normalized.id]
    );
    const foreignOwnerId = foreign.rows?.[0]?.trainer_user_id;
    if (foreignOwnerId && String(foreignOwnerId) !== String(trainerUserId)) {
      throw new Error('That page belongs to another trainer.');
    }
  }

  if (!existing && currentPages.length >= MAX_TRAINER_PAGES) {
    throw new Error(`Only ${MAX_TRAINER_PAGES} trainer pages are allowed per account.`);
  }

  if (normalized.isHome) {
    const homeConflict = currentPages.find((page) => (
      page.id !== existing?.id
      && page.siteSlug === normalized.siteSlug
      && page.isHome
    ));
    if (homeConflict) {
      throw new Error('This coach site already has a home page.');
    }
  }

  const pageSlugConflict = currentPages.find((page) => (
    page.id !== existing?.id
    && page.siteSlug === normalized.siteSlug
    && page.pageSlug === normalized.pageSlug
  ));
  if (pageSlugConflict) {
    throw new Error('That page slug is already in use on this coach site.');
  }

  if (currentPages.length && currentPages.some((page) => page.siteSlug !== normalized.siteSlug)) {
    await db.query(
      `
        UPDATE app_trainer_pages
        SET site_slug = $2,
            updated_at = now()
        WHERE trainer_user_id = $1;
      `,
      [trainerUserId, normalized.siteSlug]
    );
  }

  const requestedNavOrder = Number.isFinite(Number(normalized.navOrder))
    ? Math.max(0, Math.floor(Number(normalized.navOrder)))
    : Number.isFinite(Number(existing?.navOrder))
      ? Math.max(0, Math.floor(Number(existing.navOrder)))
      : currentPages.length;

  const result = await db.query(
    `
      INSERT INTO app_trainer_pages (
        id,
        trainer_user_id,
        site_slug,
        page_slug,
        page_name,
        nav_label,
        nav_order,
        mode,
        is_home,
        is_published,
        seo,
        settings,
        draft_content,
        published_content,
        published_at,
        updated_at
      )
      VALUES (
        COALESCE(NULLIF($1, '')::uuid, gen_random_uuid()),
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb,
        $12::jsonb,
        $13::jsonb,
        CASE WHEN $10 THEN $13::jsonb ELSE '{}'::jsonb END,
        CASE WHEN $10 THEN now() ELSE NULL END,
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        site_slug = EXCLUDED.site_slug,
        page_slug = EXCLUDED.page_slug,
        page_name = EXCLUDED.page_name,
        nav_label = EXCLUDED.nav_label,
        nav_order = EXCLUDED.nav_order,
        mode = EXCLUDED.mode,
        is_home = EXCLUDED.is_home,
        is_published = CASE
          WHEN $10 THEN true
          ELSE app_trainer_pages.is_published
        END,
        seo = EXCLUDED.seo,
        settings = EXCLUDED.settings,
        draft_content = EXCLUDED.draft_content,
        published_content = CASE
          WHEN $10 THEN EXCLUDED.draft_content
          ELSE app_trainer_pages.published_content
        END,
        published_at = CASE
          WHEN $10 THEN now()
          ELSE app_trainer_pages.published_at
        END,
        updated_at = now()
      RETURNING *;
    `,
    [
      existing?.id || normalized.id || '',
      trainerUserId,
      normalized.siteSlug,
      normalized.pageSlug,
      normalized.pageName,
      normalized.navLabel,
      requestedNavOrder,
      normalized.mode,
      normalized.isHome,
      publish === true,
      JSON.stringify(normalized.seo),
      JSON.stringify(normalized.settings),
      JSON.stringify(normalized.draftContent)
    ]
  );
  const savedRow = result.rows?.[0] || null;
  if (savedRow?.id) {
    const pagesForOrder = [
      ...currentPages.filter((page) => page.id !== savedRow.id),
      mapTrainerPageRow(savedRow)
    ];
    await rebalanceTrainerPageOrder(db, trainerUserId, savedRow.id, requestedNavOrder, pagesForOrder);
  }
  const refreshed = await getTrainerPageById(db, trainerUserId, savedRow?.id || '');
  const page = refreshed || mapTrainerPageRow(savedRow);
  if (page) {
    await insertTrainerPageVersion(db, trainerUserId, page.id, versionKind, {
      source: 'draft',
      page
    });
    if (publish === true) {
      await insertTrainerPageVersion(db, trainerUserId, page.id, 'publish', {
        source: 'published',
        page
      });
    }
  }
  return page;
}

async function publishTrainerPage(db, trainerUserId, pageId) {
  const current = await getTrainerPageById(db, trainerUserId, pageId);
  if (!current) throw new Error('Trainer page not found.');
  const result = await db.query(
    `
      UPDATE app_trainer_pages
      SET is_published = true,
          published_content = draft_content,
          published_at = now(),
          updated_at = now()
      WHERE trainer_user_id = $1
        AND id = $2
      RETURNING *;
    `,
    [trainerUserId, pageId]
  );
  const page = mapTrainerPageRow(result.rows?.[0] || null);
  if (page) {
    await insertTrainerPageVersion(db, trainerUserId, page.id, 'publish', {
      source: 'published',
      page
    });
  }
  return page;
}

async function unpublishTrainerPage(db, trainerUserId, pageId) {
  const current = await getTrainerPageById(db, trainerUserId, pageId);
  if (!current) throw new Error('Trainer page not found.');
  const result = await db.query(
    `
      UPDATE app_trainer_pages
      SET is_published = false,
          updated_at = now()
      WHERE trainer_user_id = $1
        AND id = $2
      RETURNING *;
    `,
    [trainerUserId, pageId]
  );
  const page = mapTrainerPageRow(result.rows?.[0] || null);
  if (page) {
    await insertTrainerPageVersion(db, trainerUserId, page.id, 'unpublish', {
      source: 'published',
      page
    });
  }
  return page;
}

async function getPublicTrainerPage(db, siteSlugRaw, pageSlugRaw = '') {
  const siteSlug = normalizeSiteSlug(siteSlugRaw, 'coach');
  const pageSlug = pageSlugRaw ? normalizePageSlug(pageSlugRaw, '') : '';
  const result = await db.query(
    `
      SELECT
        p.*,
        u.username,
        u.display_name,
        tp.full_name,
        tp.contact_email,
        tp.meta
      FROM app_trainer_pages p
      JOIN app_users u ON u.id = p.trainer_user_id
      LEFT JOIN app_trainer_profiles tp ON tp.user_id = p.trainer_user_id
      WHERE p.site_slug = $1
        AND p.page_slug = $2
        AND p.is_published = true
      LIMIT 1;
    `,
    [siteSlug, pageSlug]
  );
  const row = result.rows?.[0] || null;
  if (!row) return null;
  const navigation = await db.query(
    `
      SELECT id, site_slug, page_slug, page_name, nav_label, nav_order, is_home, mode, is_published, published_at
      FROM app_trainer_pages
      WHERE trainer_user_id = $1
        AND site_slug = $2
        AND is_published = true
      ORDER BY nav_order ASC, created_at ASC;
    `,
    [row.trainer_user_id, row.site_slug]
  );
  return {
    page: mapTrainerPageRow(row),
    trainer: {
      id: row.trainer_user_id,
      username: row.username || '',
      displayName: row.display_name || row.full_name || row.username || 'Coach',
      fullName: row.full_name || row.display_name || row.username || 'Coach',
      contactEmail: row.contact_email || '',
      meta: cleanObject(row.meta)
    },
    navigation: (navigation.rows || []).map((entry) => ({
      id: entry.id,
      siteSlug: entry.site_slug || '',
      pageSlug: entry.page_slug || '',
      pageName: entry.page_name || '',
      navLabel: entry.nav_label || entry.page_name || '',
      navOrder: Number.isFinite(Number(entry.nav_order)) ? Number(entry.nav_order) : 0,
      isHome: entry.is_home === true,
      publicPath: buildPublicPath(entry.site_slug || '', entry.page_slug || '')
    }))
  };
}

async function resolveLeadCaptureTarget(db, siteSlugRaw, pageSlugRaw = '', fallbackPageName = '') {
  const publicPage = await getPublicTrainerPage(db, siteSlugRaw, pageSlugRaw);
  if (publicPage?.page?.trainerUserId) {
    return {
      publicPage,
      trainerUserId: publicPage.page.trainerUserId,
      pageId: publicPage.page.id || null,
      siteSlug: publicPage.page.siteSlug || normalizeSiteSlug(siteSlugRaw, 'coach'),
      pageSlug: publicPage.page.pageSlug || (pageSlugRaw ? normalizePageSlug(pageSlugRaw, '') : ''),
      pageName: publicPage.page.pageName || cleanShortText(fallbackPageName || 'Coach page', 120) || 'Coach page',
      qualification: normalizeQualificationSettings(publicPage.page?.settings?.qualification)
    };
  }

  const siteSlug = normalizeSiteSlug(siteSlugRaw, 'coach');
  const pageSlug = pageSlugRaw ? normalizePageSlug(pageSlugRaw, '') : '';
  const result = await db.query(
    `
      SELECT
        u.id AS trainer_user_id,
        u.username,
        u.display_name,
        tp.full_name,
        tp.contact_email,
        tp.meta,
        page.id AS page_id,
        page.site_slug,
        page.page_slug,
        page.page_name,
        page.settings
      FROM app_users u
      JOIN app_trainer_profiles tp ON tp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT p.id, p.site_slug, p.page_slug, p.page_name, p.settings, p.is_home, p.is_published, p.updated_at, p.created_at
        FROM app_trainer_pages p
        WHERE p.trainer_user_id = u.id
          AND p.site_slug = $1
        ORDER BY
          CASE WHEN $2 <> '' AND p.page_slug = $2 THEN 0 ELSE 1 END,
          CASE WHEN p.is_home THEN 0 ELSE 1 END,
          CASE WHEN p.is_published THEN 0 ELSE 1 END,
          p.updated_at DESC NULLS LAST,
          p.created_at DESC NULLS LAST
        LIMIT 1
      ) page ON true
      WHERE tp.onboarding_completed_at IS NOT NULL
        AND (
          LOWER(COALESCE(tp.meta->>'publicHandle', '')) = LOWER($1)
          OR LOWER(COALESCE(tp.meta->>'pageSiteSlug', '')) = LOWER($1)
          OR LOWER(COALESCE(u.username, '')) = LOWER($1)
          OR page.id IS NOT NULL
        )
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(tp.meta->>'publicHandle', '')) = LOWER($1) THEN 0
          WHEN LOWER(COALESCE(tp.meta->>'pageSiteSlug', '')) = LOWER($1) THEN 1
          WHEN LOWER(COALESCE(u.username, '')) = LOWER($1) THEN 2
          ELSE 3
        END,
        COALESCE(tp.full_name, u.display_name, u.username, 'Coach') ASC
      LIMIT 1;
    `,
    [siteSlug, pageSlug]
  );
  const row = result.rows?.[0] || null;
  if (!row?.trainer_user_id) return null;

  const fallbackPage = {
    id: row.page_id || null,
    trainerUserId: row.trainer_user_id,
    siteSlug: row.site_slug || siteSlug,
    pageSlug: row.page_slug || pageSlug,
    pageName: row.page_name || cleanShortText(fallbackPageName || 'Coach page', 120) || 'Coach page',
    settings: cleanObject(row.settings)
  };

  return {
    publicPage: {
      page: fallbackPage,
      trainer: {
        id: row.trainer_user_id,
        username: row.username || '',
        displayName: row.display_name || row.full_name || row.username || 'Coach',
        fullName: row.full_name || row.display_name || row.username || 'Coach',
        contactEmail: row.contact_email || '',
        meta: cleanObject(row.meta)
      },
      navigation: []
    },
    trainerUserId: row.trainer_user_id,
    pageId: row.page_id || null,
    siteSlug: fallbackPage.siteSlug,
    pageSlug: fallbackPage.pageSlug,
    pageName: fallbackPage.pageName,
    qualification: normalizeQualificationSettings(fallbackPage.settings?.qualification)
  };
}

async function findExistingTrainerLead(db, trainerUserId, { email = '', phone = '' } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedEmail && !normalizedPhone) return null;
  const result = await db.query(
    `
      SELECT *
      FROM app_trainer_page_leads
      WHERE trainer_user_id = $1
        AND (
          ($2 <> '' AND lower(email) = $2)
          OR ($3 <> '' AND phone = $3)
        )
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1;
    `,
    [trainerUserId, normalizedEmail, normalizedPhone]
  );
  return mapLeadRow(result.rows?.[0] || null);
}

function mergeLeadUploads(existingUploads, nextUploads) {
  const merged = [];
  const seen = new Set();
  for (const group of [...normalizeLeadUploads(existingUploads), ...normalizeLeadUploads(nextUploads)]) {
    const key = cleanShortText(group?.key, 120);
    if (!key) continue;
    const files = [];
    for (const file of cleanArray(group.files, { maxItems: MAX_LEAD_UPLOAD_FILES_PER_GROUP })) {
      const sig = `${key}:${String(file?.name || '').trim().toLowerCase()}:${Number(file?.size || 0)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      files.push(file);
    }
    if (!files.length) continue;
    const existingGroup = merged.find((entry) => entry.key === key);
    if (existingGroup) {
      existingGroup.files = existingGroup.files.concat(files).slice(0, MAX_LEAD_UPLOAD_FILES_PER_GROUP);
      continue;
    }
    merged.push({ key, files: files.slice(0, MAX_LEAD_UPLOAD_FILES_PER_GROUP) });
  }
  return merged.slice(0, MAX_LEAD_UPLOAD_GROUPS);
}

function qualificationLeadSnapshot(src = {}, answers = {}) {
  const contact = answers.name_and_phone && typeof answers.name_and_phone === 'object' ? answers.name_and_phone : {};
  const goalValue = answers.goals || answers.goal || src.goal || '';
  const dayValue = answers.preferred_days || '';
  const timeValue = answers.preferred_times || '';
  const frequencyValue = answers.session_frequency || answers.availability || '';
  const locationValue = answers.zip_or_town || src.location || '';
  return {
    fullName: String(src.fullName || contact.full_name || answers.full_name || answers.name || '').trim(),
    phone: String(src.phone || contact.phone || answers.phone || '').trim(),
    email: String(src.email || answers.email || '').trim(),
    goal: Array.isArray(goalValue) ? goalValue.join(', ') : String(goalValue || '').trim(),
    budget: '',
    location: String(locationValue || '').trim(),
    coachingType: String(answers.open_to_online_training || src.coachingType || '').trim(),
    availability: [
      Array.isArray(dayValue) ? dayValue.join(', ') : String(dayValue || '').trim(),
      Array.isArray(timeValue) ? timeValue.join(', ') : String(timeValue || '').trim(),
      Array.isArray(frequencyValue) ? frequencyValue.join(', ') : String(frequencyValue || '').trim()
    ].filter(Boolean).join(' • '),
    injuries: ''
  };
}

async function upsertPublicQualificationSession(db, payload = {}) {
  const src = cleanObject(payload);
  const siteSlug = normalizeSiteSlug(src.siteSlug || src.slug || 'coach', 'coach');
  const pageSlug = src.pageSlug ? normalizePageSlug(src.pageSlug, '') : '';
  const target = await resolveLeadCaptureTarget(db, siteSlug, pageSlug, src.pageName || 'Coach page');
  if (!target?.trainerUserId) throw new Error('Published coach page not found.');
  const publicPage = target.publicPage;

  const sessionKey = cleanShortText(src.sessionKey, 120);
  if (!sessionKey) throw new Error('Qualification session key is required.');
  const answers = cleanObject(src.answers);
  const meta = cleanObject(src.meta);
  const currentStep = Math.max(0, Math.floor(Number(src.currentStep || 0) || 0));
  const normalizedEmail = normalizeEmail(src.email || answers.email || meta.email || '');
  const normalizedPhone = normalizePhone(src.phone || answers.phone || meta.phone || '');
  const completed = src.completed === true;

  const result = await db.query(
    `
      INSERT INTO app_trainer_page_qualification_sessions (
        trainer_user_id,
        page_id,
        source_site_slug,
        source_page_slug,
        session_key,
        visitor_email,
        visitor_phone,
        status,
        current_step,
        answers,
        meta,
        completed_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
        CASE WHEN $12 THEN now() ELSE NULL END,
        now()
      )
      ON CONFLICT (trainer_user_id, page_id, session_key) DO UPDATE SET
        visitor_email = CASE WHEN EXCLUDED.visitor_email <> '' THEN EXCLUDED.visitor_email ELSE app_trainer_page_qualification_sessions.visitor_email END,
        visitor_phone = CASE WHEN EXCLUDED.visitor_phone <> '' THEN EXCLUDED.visitor_phone ELSE app_trainer_page_qualification_sessions.visitor_phone END,
        status = CASE WHEN $12 THEN 'completed' ELSE 'draft' END,
        current_step = GREATEST(app_trainer_page_qualification_sessions.current_step, EXCLUDED.current_step),
        answers = app_trainer_page_qualification_sessions.answers || EXCLUDED.answers,
        meta = app_trainer_page_qualification_sessions.meta || EXCLUDED.meta,
        completed_at = CASE
          WHEN $12 THEN COALESCE(app_trainer_page_qualification_sessions.completed_at, now())
          ELSE app_trainer_page_qualification_sessions.completed_at
        END,
        updated_at = now()
      RETURNING *;
    `,
    [
      target.trainerUserId,
      target.pageId,
      target.siteSlug,
      target.pageSlug,
      sessionKey,
      normalizedEmail,
      normalizedPhone,
      completed ? 'completed' : 'draft',
      currentStep,
      JSON.stringify(answers),
      JSON.stringify(meta),
      completed
    ]
  );

  let session = mapQualificationSessionRow(result.rows?.[0] || null);
  let leadResult = null;
  if (completed) {
    const snapshot = qualificationLeadSnapshot(src, session?.answers || answers);
    leadResult = await createPublicLead(db, {
      siteSlug: target.siteSlug,
      pageSlug: target.pageSlug,
      pageName: target.pageName,
      formId: 'qualification-gate',
      status: 'Qualified',
      tags: ['Qualified', 'Trainer page'],
      fullName: snapshot.fullName || src.fullName || session?.answers?.full_name || session?.answers?.name || '',
      email: normalizedEmail || snapshot.email || session?.answers?.email || '',
      phone: normalizedPhone || snapshot.phone || session?.answers?.phone || '',
      goal: snapshot.goal,
      location: snapshot.location,
      coachingType: snapshot.coachingType,
      availability: snapshot.availability,
      answers: session?.answers || answers,
      meta: {
        ...meta,
        qualificationRequired: true,
        qualificationSessionKey: sessionKey,
        qualificationCompletedAt: new Date().toISOString()
      }
    });
    if (leadResult?.lead?.id && session?.id) {
      const linkResult = await db.query(
        `
          UPDATE app_trainer_page_qualification_sessions
          SET lead_id = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING *;
        `,
        [session.id, leadResult.lead.id]
      );
      session = mapQualificationSessionRow(linkResult.rows?.[0] || null) || session;
    }
  }

  return {
    session,
    lead: leadResult?.lead || null,
    automation: leadResult?.automation || {},
    publicPage,
    qualification: target.qualification || normalizeQualificationSettings(publicPage?.page?.settings?.qualification)
  };
}

function forwardLeadToConsultWebhook(page, lead, rawPayload = {}) {
  const consult = page?.settings?.consultForm && typeof page.settings.consultForm === 'object'
    ? page.settings.consultForm
    : null;
  const webhookUrl = String(consult?.webhookUrl || '').trim();
  if (!/^https?:\/\//i.test(webhookUrl) || typeof fetch !== 'function' || !lead) return;
  const body = JSON.stringify({
    event: 'consult_form_submitted',
    submittedAt: new Date().toISOString(),
    coachPage: {
      siteSlug: lead.sourceSiteSlug || page?.siteSlug || '',
      pageSlug: lead.sourcePageSlug || page?.pageSlug || '',
      pageName: lead.sourcePageName || page?.pageName || '',
      publicPath: buildPublicPath(lead.sourceSiteSlug || page?.siteSlug || '', lead.sourcePageSlug || page?.pageSlug || '')
    },
    lead: {
      id: lead.id,
      formId: lead.formId || '',
      fullName: lead.fullName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      goal: lead.goal || '',
      budget: lead.budget || '',
      location: lead.location || '',
      coachingType: lead.coachingType || '',
      availability: lead.availability || '',
      injuries: lead.injuries || '',
      answers: cleanObject(lead.answers),
      tags: Array.isArray(lead.tags) ? lead.tags : []
    },
    raw: cleanObject(rawPayload.answers)
  });
  // Fire-and-forget: a slow or broken webhook must never block or fail the
  // lead submission itself.
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: controller?.signal
  }).catch(() => {}).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function createPublicLead(db, payload = {}) {
  const src = cleanObject(payload);
  const siteSlug = normalizeSiteSlug(src.siteSlug || src.slug || 'coach', 'coach');
  const pageSlug = src.pageSlug ? normalizePageSlug(src.pageSlug, '') : '';
  const target = await resolveLeadCaptureTarget(db, siteSlug, pageSlug, src.pageName || 'Coach page');
  if (!target?.trainerUserId) throw new Error('Published coach page not found.');
  const publicPage = target.publicPage;

  const answers = cleanObject(src.answers);
  const leadStatus = stageIsValid(src.status) ? String(src.status).trim() : 'New Lead';
  const tagList = uniqueStringArray(src.tags, { maxItems: 20, maxLen: 60 });
  const uploads = normalizeLeadUploads(src.uploads);
  const contact = answers.name_and_phone && typeof answers.name_and_phone === 'object' ? answers.name_and_phone : {};
  const fullName = cleanShortText(src.fullName || answers.name || answers.fullName || answers.full_name || contact.full_name, 160);
  const email = normalizeEmail(src.email || answers.email);
  const phone = normalizePhone(src.phone || answers.phone || contact.phone);
  if (!fullName && !email && !phone) {
    throw new Error('Lead submission requires at least one contact field.');
  }
  const goal = cleanLongText(src.goal || answers.goal, 1000);
  const budget = cleanLongText(src.budget || answers.budget, 500);
  const location = cleanLongText(src.location || answers.location, 1000);
  const coachingType = cleanLongText(src.coachingType || answers.coachingType, 500);
  const availability = cleanLongText(src.availability || answers.availability, 1000);
  const injuries = cleanLongText(src.injuries || answers.injuries, 2000);
  const meta = cleanObject(src.meta);
  const existingLead = await findExistingTrainerLead(db, target.trainerUserId, { email, phone });

  let lead = null;
  if (existingLead?.id) {
    const nextAnswers = {
      ...cleanObject(existingLead.answers),
      ...answers
    };
    const nextMeta = {
      ...cleanObject(existingLead.meta),
      ...meta
    };
    const nextUploads = mergeLeadUploads(existingLead.uploads, uploads);
    const nextTags = uniqueStringArray([...(existingLead.tags || []), ...tagList], { maxItems: 20, maxLen: 60 });
    const nextStatus = isLeadStage(existingLead.status) && existingLead.status !== 'New Lead'
      ? existingLead.status
      : leadStatus;
    const result = await db.query(
      `
        UPDATE app_trainer_page_leads
        SET page_id = $3,
            source_site_slug = $4,
            source_page_slug = $5,
            source_page_name = $6,
            form_id = CASE WHEN $7 <> '' THEN $7 ELSE form_id END,
            status = $8,
            tag_list = $9::text[],
            full_name = CASE WHEN $10 <> '' THEN $10 ELSE full_name END,
            email = CASE WHEN $11 <> '' THEN $11 ELSE email END,
            phone = CASE WHEN $12 <> '' THEN $12 ELSE phone END,
            goal = CASE WHEN $13 <> '' THEN $13 ELSE goal END,
            budget = CASE WHEN $14 <> '' THEN $14 ELSE budget END,
            location = CASE WHEN $15 <> '' THEN $15 ELSE location END,
            coaching_type = CASE WHEN $16 <> '' THEN $16 ELSE coaching_type END,
            availability = CASE WHEN $17 <> '' THEN $17 ELSE availability END,
            injuries = CASE WHEN $18 <> '' THEN $18 ELSE injuries END,
            answers = $19::jsonb,
            uploads = $20::jsonb,
            meta = $21::jsonb,
            updated_at = now()
        WHERE id = $1
          AND trainer_user_id = $2
        RETURNING *;
      `,
      [
        existingLead.id,
        target.trainerUserId,
        target.pageId,
        target.siteSlug,
        target.pageSlug,
        target.pageName,
        cleanShortText(src.formId, 120),
        nextStatus,
        nextTags,
        fullName,
        email,
        phone,
        goal,
        budget,
        location,
        coachingType,
        availability,
        injuries,
        JSON.stringify(nextAnswers),
        JSON.stringify(nextUploads),
        JSON.stringify(nextMeta)
      ]
    );
    lead = mapLeadRow(result.rows?.[0] || null);
  } else {
    const result = await db.query(
      `
        INSERT INTO app_trainer_page_leads (
          trainer_user_id,
          page_id,
          source_site_slug,
          source_page_slug,
          source_page_name,
          form_id,
          status,
          tag_list,
          full_name,
          email,
          phone,
          goal,
          budget,
          location,
          coaching_type,
          availability,
          injuries,
          answers,
          uploads,
          meta,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18::jsonb, $19::jsonb, $20::jsonb, now()
        )
        RETURNING *;
      `,
      [
        target.trainerUserId,
        target.pageId,
        target.siteSlug,
        target.pageSlug,
        target.pageName,
        cleanShortText(src.formId, 120),
        leadStatus,
        tagList,
        fullName,
        email,
        phone,
        goal,
        budget,
        location,
        coachingType,
        availability,
        injuries,
        JSON.stringify(answers),
        JSON.stringify(uploads),
        JSON.stringify(meta)
      ]
    );
    lead = mapLeadRow(result.rows?.[0] || null);
  }

  const automationSummary = createAutomationSummary('form_submitted');
  if (lead) {
    await db.query(
      `
        INSERT INTO app_trainer_page_lead_events (
          lead_id,
          trainer_user_id,
          event_type,
          details
        )
        VALUES ($1, $2, 'submitted', $3::jsonb);
      `,
        [
          lead.id,
          lead.trainerUserId,
          JSON.stringify({
            deduped: Boolean(existingLead?.id),
            sourceSiteSlug: lead.sourceSiteSlug,
            sourcePageSlug: lead.sourcePageSlug,
            formId: lead.formId,
            fullName: lead.fullName || undefined,
            email: lead.email || undefined,
          phone: lead.phone || undefined
        })
      ]
    );
    const summary = executeTrainerPageAutomationNodes(publicPage.page, {
      eventType: 'form_submitted',
      lead,
      page: publicPage.page,
      payload: src
    });
    Object.assign(automationSummary, summary);
    try {
      forwardLeadToConsultWebhook(publicPage.page, lead, src);
    } catch {}
    const refreshed = await applyAutomationSummaryToLead(db, lead, automationSummary);
    return {
      lead: refreshed,
      publicPage,
      automation: automationSummary
    };
  }
  return {
    lead,
    publicPage,
    automation: automationSummary
  };
}

async function processPublicTrainerPageEvent(db, payload = {}) {
  const src = cleanObject(payload);
  const siteSlug = normalizeSiteSlug(src.siteSlug || src.slug || 'coach', 'coach');
  const pageSlug = src.pageSlug ? normalizePageSlug(src.pageSlug, '') : '';
  const publicPage = await getPublicTrainerPage(db, siteSlug, pageSlug);
  if (!publicPage?.page?.id) throw new Error('Published coach page not found.');
  const eventType = normalizeAutomationType(src.eventType || src.type);
  if (!isAutomationTriggerType(eventType)) throw new Error('Unsupported automation event.');
  const automation = executeTrainerPageAutomationNodes(publicPage.page, {
    eventType,
    eventTarget: cleanLongText(src.eventTarget || src.target || '', 2000),
    page: publicPage.page,
    payload: src
  });
  return {
    publicPage,
    automation
  };
}

async function listTrainerLeads(db, trainerUserId, filters = {}) {
  const status = stageIsValid(filters.status) ? String(filters.status).trim() : '';
  const query = cleanShortText(filters.query, 120).toLowerCase();
  const result = await db.query(
    `
      SELECT *
      FROM app_trainer_page_leads
      WHERE trainer_user_id = $1
        AND ($2 = '' OR status = $2)
        AND (
          $3 = ''
          OR LOWER(full_name) LIKE $4
          OR LOWER(email) LIKE $4
          OR LOWER(phone) LIKE $4
          OR LOWER(goal) LIKE $4
        )
      ORDER BY created_at DESC
      LIMIT 300;
    `,
    [trainerUserId, status, query, `%${query}%`]
  );
  const leads = (result.rows || []).map(mapLeadRow);
  return await attachRecentEventsToLeads(db, trainerUserId, leads);
}

async function listRecentLeadEventsByLeadId(db, trainerUserId, leadIds = []) {
  const ids = Array.isArray(leadIds) ? leadIds.map((leadId) => String(leadId || '').trim()).filter(Boolean) : [];
  if (!ids.length) return new Map();
  const eventsResult = await db.query(
    `
      SELECT
        lead_id,
        event_type,
        details,
        created_at
      FROM app_trainer_page_lead_events
      WHERE trainer_user_id = $1
        AND lead_id = ANY($2::uuid[])
      ORDER BY created_at DESC;
    `,
    [trainerUserId, ids]
  );
  const eventsByLeadId = new Map();
  for (const row of eventsResult.rows || []) {
    const leadId = String(row?.lead_id || '').trim();
    if (!leadId) continue;
    const current = eventsByLeadId.get(leadId) || [];
    if (current.length >= MAX_LEAD_RECENT_EVENTS) continue;
    current.push({
      eventType: cleanShortText(row?.event_type, 80) || 'note',
      details: cleanObject(row?.details),
      createdAt: row?.created_at || null
    });
    eventsByLeadId.set(leadId, current);
  }
  return eventsByLeadId;
}

async function attachRecentEventsToLeads(db, trainerUserId, leads = []) {
  const list = Array.isArray(leads) ? leads : [];
  if (!list.length) return list;
  const leadIds = list.map((lead) => String(lead?.id || '').trim()).filter(Boolean);
  if (!leadIds.length) return list;
  const eventsByLeadId = await listRecentLeadEventsByLeadId(db, trainerUserId, leadIds);
  return list.map((lead) => ({
    ...lead,
    recentEvents: eventsByLeadId.get(String(lead?.id || '').trim()) || []
  }));
}

async function updateTrainerLead(db, trainerUserId, leadId, payload = {}) {
  const src = cleanObject(payload);
  const hasStatus = Object.prototype.hasOwnProperty.call(src, 'status');
  const hasNotes = Object.prototype.hasOwnProperty.call(src, 'notes');
  const hasTags = Object.prototype.hasOwnProperty.call(src, 'tags');
  if (hasStatus && !stageIsValid(src.status)) throw new Error('Invalid lead stage.');
  const status = hasStatus ? String(src.status).trim() : '';
  const notes = hasNotes ? cleanLongText(src.notes, 5000) : '';
  const tags = hasTags ? uniqueStringArray(src.tags, { maxItems: 20, maxLen: 60 }) : [];
  const existingResult = await db.query(
    `
      SELECT *
      FROM app_trainer_page_leads
      WHERE trainer_user_id = $1
        AND id = $2
      LIMIT 1;
    `,
    [trainerUserId, leadId]
  );
  const previousLead = mapLeadRow(existingResult.rows?.[0] || null);
  if (!previousLead) return null;
  const result = await db.query(
    `
      UPDATE app_trainer_page_leads
      SET status = CASE WHEN $3 THEN $4 ELSE status END,
          notes = CASE WHEN $5 THEN $6 ELSE notes END,
          tag_list = CASE WHEN $7 THEN $8::text[] ELSE tag_list END,
          updated_at = now()
      WHERE trainer_user_id = $1
        AND id = $2
      RETURNING *;
    `,
    [trainerUserId, leadId, hasStatus, status, hasNotes, notes, hasTags, tags]
  );
  const lead = mapLeadRow(result.rows?.[0] || null);
  if (!lead) return null;
  const statusChanged = hasStatus && previousLead.status !== lead.status;
  const notesChanged = hasNotes && previousLead.notes !== lead.notes;
  const tagsChanged = hasTags && JSON.stringify(previousLead.tags || []) !== JSON.stringify(lead.tags || []);
  if (statusChanged || notesChanged || tagsChanged) {
    await db.query(
      `
        INSERT INTO app_trainer_page_lead_events (
          lead_id,
          trainer_user_id,
          event_type,
          details
        )
        VALUES ($1, $2, 'updated', $3::jsonb);
      `,
      [
        lead.id,
        trainerUserId,
        JSON.stringify({
          status: statusChanged ? lead.status : undefined,
          notes: notesChanged ? lead.notes : undefined,
          tags: tagsChanged ? lead.tags : undefined
        })
      ]
    );
  }
  const [enrichedLead] = await attachRecentEventsToLeads(db, trainerUserId, [lead]);
  return enrichedLead;
}

function normalizeTrainerMediaType(rawMediaType, mimeType = '') {
  const value = String(rawMediaType || '').trim().toLowerCase();
  if (value === 'image' || value === 'video') return value;
  if (String(mimeType || '').toLowerCase().startsWith('video/')) return 'video';
  return 'image';
}

async function saveTrainerPageMedia(db, trainerUserId, { mediaType, mimeType, fileName, data } = {}) {
  const mime = String(mimeType || '').trim().toLowerCase();
  const kind = normalizeTrainerMediaType(mediaType, mime);
  const allowedMimeTypes = kind === 'video' ? TRAINER_PAGE_MEDIA_VIDEO_MIME_TYPES : TRAINER_PAGE_MEDIA_IMAGE_MIME_TYPES;
  if (!allowedMimeTypes.has(mime)) {
    throw new Error(`Unsupported ${kind} type. Allowed: ${Array.from(allowedMimeTypes).join(', ')}.`);
  }
  const bytes = Buffer.isBuffer(data) ? data : null;
  if (!bytes || !bytes.length) {
    throw new Error('Media upload is empty.');
  }
  const maxBytes = kind === 'video' ? TRAINER_PAGE_MEDIA_VIDEO_MAX_BYTES : TRAINER_PAGE_MEDIA_IMAGE_MAX_BYTES;
  if (bytes.length > maxBytes) {
    throw new Error(`${kind === 'video' ? 'Video' : 'Image'} is too large. Max ${(maxBytes / 1_000_000).toFixed(0)}MB.`);
  }
  const countResult = await db.query(
    'SELECT COUNT(*)::int AS total FROM app_trainer_page_media WHERE trainer_user_id = $1;',
    [trainerUserId]
  );
  if (Number(countResult.rows?.[0]?.total || 0) >= TRAINER_PAGE_MEDIA_MAX_ITEMS) {
    throw new Error(`Media library limit reached (${TRAINER_PAGE_MEDIA_MAX_ITEMS} files).`);
  }
  const mediaId = crypto.randomUUID();
  const storedFileName = await writeTrainerMediaFile(trainerMediaFileName(mediaId, mime), bytes);
  let result;
  try {
    result = await db.query(
      `
        INSERT INTO app_trainer_page_media (id, trainer_user_id, media_type, mime_type, file_name, byte_size, data, file_path)
        VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
        RETURNING id, media_type, mime_type, file_name, byte_size, created_at;
      `,
      [mediaId, trainerUserId, kind, mime, cleanShortText(fileName, 160), bytes.length, storedFileName]
    );
  } catch (err) {
    fs.promises.unlink(path.join(TRAINER_MEDIA_DIR, storedFileName)).catch(() => {});
    throw err;
  }
  const row = result.rows?.[0] || null;
  if (!row) {
    fs.promises.unlink(path.join(TRAINER_MEDIA_DIR, storedFileName)).catch(() => {});
    throw new Error('Could not store media.');
  }
  return {
    id: row.id,
    url: `/api/coach/media/${row.id}`,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    fileName: row.file_name,
    byteSize: Number(row.byte_size) || 0,
    createdAt: row.created_at
  };
}

async function getTrainerPageMedia(db, mediaIdRaw) {
  const mediaId = String(mediaIdRaw || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId)) return null;
  const result = await db.query(
    'SELECT id, media_type, mime_type, file_name, byte_size, data, file_path FROM app_trainer_page_media WHERE id = $1 LIMIT 1;',
    [mediaId]
  );
  const row = result.rows?.[0] || null;
  if (!row) return null;
  let bytes = null;
  if (row.file_path) {
    bytes = await readTrainerMediaFile(row.file_path);
  }
  if (!bytes && row.data) {
    bytes = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data || '');
    // Lazily migrate database-stored media to disk so serving it stops
    // consuming hosted-database data transfer.
    if (bytes.length) {
      const migratedName = trainerMediaFileName(row.id, row.mime_type);
      writeTrainerMediaFile(migratedName, bytes)
        .then(() => db.query(
          'UPDATE app_trainer_page_media SET file_path = $2, data = NULL WHERE id = $1;',
          [row.id, migratedName]
        ))
        .catch(() => {});
    }
  }
  if (!bytes || !bytes.length) return null;
  return {
    id: row.id,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    fileName: row.file_name,
    byteSize: Number(row.byte_size) || bytes.length,
    data: bytes
  };
}

module.exports = {
  LEAD_STAGES,
  MAX_TRAINER_PAGES,
  MAX_LEAD_UPLOAD_GROUPS,
  MAX_LEAD_UPLOAD_FILES_PER_GROUP,
  MAX_LEAD_UPLOAD_SIZE_BYTES,
  TRAINER_PAGE_SCHEMA_SQL,
  normalizeSiteSlug,
  normalizePageSlug,
  normalizePageMode,
  normalizePagePayload,
  normalizeQualificationSettings,
  normalizeLeadUploads,
  buildPublicPath,
  executeTrainerPageAutomationNodes,
  listTrainerPages,
  getTrainerPageById,
  listTrainerPageVersions,
  saveTrainerPage,
  publishTrainerPage,
  unpublishTrainerPage,
  restoreTrainerPageVersion,
  getPublicTrainerPage,
  upsertPublicQualificationSession,
  createPublicLead,
  processPublicTrainerPageEvent,
  listTrainerLeads,
  updateTrainerLead,
  TRAINER_PAGE_MEDIA_IMAGE_MAX_BYTES,
  TRAINER_PAGE_MEDIA_VIDEO_MAX_BYTES,
  saveTrainerPageMedia,
  getTrainerPageMedia
};
