/* The qualification gate on a live coach page (browser).
   /coach/<handle> rendered the custom-code page straight into its iframe,
   skipping renderBuilderPublicShell() — the only place the qualification gate
   is attached. Every visitor walked into the page ungated and no lead was ever
   captured. Guards: visitors get the gate, the owner previewing their own route
   still bypasses it.
   Run: node tests/coachPageGate.browser.js */
const puppeteer = require('../node_modules/puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.COACH_GATE_TEST_PORT || 4185);
const HANDLE = 'etavisf';

const TRAINER = {
  id: 'c2e3974d-c2b7-47cb-8660-cc4bb67fb15c',
  username: HANDLE,
  displayName: HANDLE,
  fullName: HANDLE,
  publicHandle: HANDLE,
  isTrainer: true,
  trainer: { active: true, onboarded: true },
  meta: { city: 'Augusta', state: 'GA' }
};

// A real-shaped custom_code page: the trainer's own HTML, no platform form.
const CUSTOM_HTML = '<section id="inquire"><h1>ETAVIS</h1><p>Remote coaching, done properly.</p>'
  + '<input type="email" placeholder="email"></section>';

const QUALIFICATION = {
  enabled: true,
  title: 'A few quick questions before you view this coach page',
  subtitle: 'This helps the trainer qualify the right leads.',
  ctaLabel: 'Continue',
  completedLabel: 'Thanks. Opening the page...',
  questions: [
    { id: 'gender', label: 'Gender', type: 'radio', required: true, options: ['Female', 'Male', 'Other'], fields: [] },
    { id: 'goals', label: 'Goals', type: 'checkbox', required: true, options: ['Strength', 'Weight loss'], fields: [] },
    { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com', options: [], fields: [] }
  ]
};

const PAGE = {
  id: '2a2229b5-e9e2-4d41-bb8f-be83ec0741c4',
  trainerUserId: TRAINER.id,
  siteSlug: HANDLE,
  pageSlug: 'home',
  pageName: `${HANDLE} page`,
  navLabel: 'Home',
  navOrder: 0,
  mode: 'custom_code',
  isHome: true,
  isPublished: true,
  seo: {},
  settings: {},
  publishedContent: {
    mode: 'custom_code',
    navigation: {},
    customCode: { html: CUSTOM_HTML, css: '', javascript: '' },
    assets: [],
    settings: {},
    resultsPage: {}
  },
  draftContent: {
    mode: 'custom_code',
    customCode: { html: CUSTOM_HTML, css: '', javascript: '' }
  },
  publicPath: `/coach/${HANDLE}`
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Same rewrite the real server does for /coach/:slug.
  if (/^\/coach\/[^/]+(?:\/[^/]+)?$/i.test(urlPath)) urlPath = '/trainer-profile.html';
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`);
  if (!cond) failures += 1;
};

async function visit(browser, viewer) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('      pageerror:', String(e).slice(0, 160)));
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (b) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) }).catch(() => {});
    if (u.includes('/api/auth/me')) return json({ user: viewer || null, impersonation: null });
    if (u.includes('/api/auth/trainers')) return json({ ok: true, trainers: [TRAINER] });
    if (u.includes('/api/coach/pages/public')) {
      return json({ ok: true, page: PAGE, trainer: TRAINER, navigation: {}, qualification: QUALIFICATION });
    }
    if (u.includes('/api/auth/trainer/pages')) return json({ ok: true, pages: [PAGE] });
    if (u.includes('/api/')) return json({ ok: true });
    req.continue().catch(() => {});
  });
  if (viewer) {
    await page.evaluateOnNewDocument((v) => {
      localStorage.setItem('ode_auth_user_hint_v1', JSON.stringify({ ts: Date.now(), user: v }));
    }, viewer);
  } else {
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch {} });
  }
  await page.goto(`http://localhost:${PORT}/coach/${HANDLE}`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 4000));
  return page;
}

const readGate = (page) => page.evaluate(() => {
  const dbg = window.__trainerQualificationGateDebug || null;
  const text = document.body.innerText || '';
  // The gate lives in the parent document; the coach page itself is in an iframe.
  const gateNode = document.querySelector('[data-qualification-step], .trainer-qualification-gate, [class*="qualification"]');
  const frame = document.querySelector('iframe[data-builder-preview-frame="1"]');
  // NB: the gate is position:fixed, so offsetParent is null even when it is
  // perfectly visible — measure it instead.
  const shown = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0
      && r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
  };
  return {
    debug: dbg,
    gateRendered: Boolean(gateNode),
    gateVisible: shown(gateNode),
    hasQuestionText: /quick questions before you view/i.test(text),
    firstQuestionShown: /Gender/i.test(text),
    frameExists: Boolean(frame),
    frameGated: Boolean(document.querySelector('.trainer-builder-public-main.is-gated')),
    shellExists: Boolean(document.querySelector('.trainer-builder-public-shell')),
    // The builder's own nav must never appear on a real coach site.
    builderNav: Boolean(document.querySelector('.trainer-builder-public-nav, [data-builder-nav]'))
  };
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // ---- 1. anonymous visitor: the gate must appear ----
  {
    const page = await visit(browser, null);
    const g = await readGate(page);
    check('visitor: page renders through the public shell', g.shellExists, JSON.stringify(g));
    check('visitor: the coach page iframe is still rendered', g.frameExists, JSON.stringify(g));
    check('visitor: qualification gate was evaluated at all (debug hook set)', Boolean(g.debug), JSON.stringify(g.debug));
    check('visitor: gate is in the DOM', g.gateRendered, JSON.stringify(g));
    check('visitor: gate is on screen', g.gateVisible, JSON.stringify(g));
    check('visitor: gate shows its intro copy', g.hasQuestionText, JSON.stringify(g));
    check('visitor: first question is shown', g.firstQuestionShown, JSON.stringify(g));
    check('visitor: the page behind the gate is blurred/inert', g.frameGated, JSON.stringify(g));
    await page.screenshot({ path: path.join(ROOT, 'tmp-coach-gate-visitor.png') });
    await page.close();
  }

  // ---- 2. the owner previewing their own route still walks straight in ----
  {
    const page = await visit(browser, TRAINER);
    const g = await readGate(page);
    check('owner: no gate blocking their own page', !g.gateVisible, JSON.stringify(g));
    check('owner: their page still renders', g.frameExists || g.shellExists, JSON.stringify(g));
    check('owner: no builder nav bolted onto their live site', !g.builderNav, JSON.stringify(g));
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
