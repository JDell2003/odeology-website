/* The gates on a live coach page (browser).
   A trainer with SAVED qualification settings gets the multi-step gate; a
   trainer who never configured it gets the simple non-dismissable consult
   capture (first/last/email/phone) whose submit lands in their Consult Form
   Hits (/api/coach/pages/lead); an explicitly disabled gate means no gate at
   all. The owner always bypasses both on their own route, and the standalone
   shell must not inherit main.css's 5rem <section> padding (white bar).
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
// The style block carries a brand palette (dark ground + bronze accent) so the
// consult capture's brand theming has something real to derive from.
const CUSTOM_HTML = '<style>:root{--black:#141210;--bone:#e8e2d8;--bronze:#a8845c}'
  + 'body{background:var(--black);color:var(--bone)}.cta{color:#a8845c;border-color:#a8845c}</style>'
  + '<section id="inquire"><h1>ETAVIS</h1><p>Remote coaching, done properly.</p>'
  + '<input type="email" placeholder="email"><a class="cta">Request</a></section>';

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

async function visit(browser, viewer, qualification = QUALIFICATION, leadPosts = null, opts = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('      pageerror:', String(e).slice(0, 160)));
  await page.setViewport(opts.viewport || { width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (b) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) }).catch(() => {});
    if (u.includes('/api/auth/me')) return json({ user: viewer || null, impersonation: null });
    if (u.includes('/api/auth/trainers')) return json({ ok: true, trainers: [TRAINER] });
    if (new URL(u, 'http://x').pathname === '/api/coach/pages/lead') {
      if (Array.isArray(leadPosts)) {
        try { leadPosts.push(JSON.parse(req.postData() || '{}')); } catch {}
      }
      return json({ ok: true, lead: { id: 'lead-capture-1' } });
    }
    if (u.includes('/api/training/funnel-event')) {
      if (Array.isArray(opts.funnelPosts)) {
        try { opts.funnelPosts.push(JSON.parse(req.postData() || '{}')); } catch {}
      }
      return json({ ok: true });
    }
    if (u.includes('/api/coach/pages/public')) {
      if (opts.publicNotFound) {
        return req.respond({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Published coach page not found.' }) }).catch(() => {});
      }
      return json({ ok: true, page: PAGE, trainer: TRAINER, navigation: {}, qualification });
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
  await page.goto(`http://localhost:${PORT}${opts.path || `/coach/${HANDLE}`}`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 4000));
  return page;
}

const readGate = (page) => page.evaluate(() => {
  const dbg = window.__trainerQualificationGateDebug || null;
  const text = document.body.innerText || '';
  // The gate lives in the parent document; the coach page itself is in an iframe.
  const gateNode = document.querySelector('[data-qualification-step], .trainer-qualification-gate, [class*="qualification"]');
  const captureNode = document.querySelector('[data-trainer-consult-capture="1"]');
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
    captureVisible: shown(captureNode),
    captureCopyShown: /One more step until the offer/i.test(text),
    captureInputCount: captureNode ? captureNode.querySelectorAll('input').length : 0,
    // The capture must be inescapable: no close/dismiss control of any kind.
    captureDismissControls: captureNode
      ? captureNode.querySelectorAll('[data-qualification-dismiss], [data-consult-capture-dismiss], .trainer-qualification-close, button[type="button"]').length
      : 0,
    // While locked, the page behind must be inert (no keyboard tabbing into it).
    mainInert: (() => {
      const main = document.querySelector('.trainer-builder-public-main');
      return main ? main.hasAttribute('inert') : false;
    })(),
    // A live coach site must be square-cornered — the in-app card look
    // (border-radius 34px) must not leak onto the standalone route.
    mainRadius: (() => {
      const main = document.querySelector('.trainer-builder-public-main');
      return main ? getComputedStyle(main).borderTopLeftRadius : '';
    })(),
    captureBrandStyle: (() => {
      const card = document.querySelector('[data-consult-capture-form]');
      return card ? String(card.getAttribute('style') || '') : '';
    })(),
    frameExists: Boolean(frame),
    frameGated: Boolean(document.querySelector('.trainer-builder-public-main.is-gated')),
    shellExists: Boolean(document.querySelector('.trainer-builder-public-shell')),
    // main.css pads every bare <section>; unpatched, this painted an 80px
    // white bar above the coach page on the standalone route.
    shellPaddingTop: (() => {
      const shell = document.querySelector('.trainer-builder-public-shell');
      return shell ? getComputedStyle(shell).paddingTop : '';
    })(),
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
    check('visitor: no white bar above the page (shell padding-top is 0)', g.shellPaddingTop === '0px', g.shellPaddingTop);
    await page.screenshot({ path: path.join(ROOT, 'tmp-coach-gate-visitor.png') });
    await page.close();
  }

  // ---- 1b. trainer never configured the gate: the simple consult capture ----
  // qualification is stubbed as null so qualificationConfig() actually falls
  // through to page.settings and the client's opt-in logic runs — a stubbed
  // enabled:false object would pass even with the client fix reverted.
  {
    const leadPosts = [];
    const funnelPosts = [];
    const page = await visit(browser, null, null, leadPosts, { funnelPosts });
    const g = await readGate(page);
    check('unconfigured: page renders through the public shell', g.shellExists, JSON.stringify(g));
    check('unconfigured: coach page iframe renders', g.frameExists, JSON.stringify(g));
    check('unconfigured: stock 14-question gate stays hidden', !g.gateVisible && !g.hasQuestionText, JSON.stringify(g));
    check('unconfigured: simple consult capture is on screen', g.captureVisible, JSON.stringify(g));
    check('unconfigured: no rounded corners on the live site', g.mainRadius === '0px', g.mainRadius);
    check('unconfigured: capture is themed from the trainer brand (dark bg + bronze accent)',
      /--cc-bg:/.test(g.captureBrandStyle) && /--cc-accent:#a8845c/.test(g.captureBrandStyle), g.captureBrandStyle);
    check('unconfigured: gate_view analytics beacon fired', funnelPosts.some((p) => p.type === 'gate_view' && p.handle === HANDLE), JSON.stringify(funnelPosts));
    check('unconfigured: capture shows the offer copy', g.captureCopyShown, JSON.stringify(g));
    check('unconfigured: capture asks first/last/email/phone', g.captureInputCount === 4, String(g.captureInputCount));
    check('unconfigured: capture has no way to close it', g.captureDismissControls === 0, String(g.captureDismissControls));
    check('unconfigured: page behind the capture is blurred/inert', g.frameGated, JSON.stringify(g));
    check('unconfigured: page behind is inert to keyboard focus', g.mainInert, JSON.stringify(g));
    check('unconfigured: no white bar above the page', g.shellPaddingTop === '0px', g.shellPaddingTop);
    await page.screenshot({ path: path.join(ROOT, 'tmp-coach-capture-visitor.png') });

    // A phone under 10 digits would be silently discarded by the server's
    // normalizePhone — the client must reject it before it posts.
    await page.type('[data-consult-capture-input="firstName"]', 'Jordan');
    await page.type('[data-consult-capture-input="lastName"]', 'Fields');
    await page.type('[data-consult-capture-input="email"]', 'jordan@example.com');
    await page.type('[data-consult-capture-input="phone"]', '555-0123');
    await page.click('[data-consult-capture-submit]');
    await new Promise((r) => setTimeout(r, 400));
    const shortPhone = await page.evaluate(() => {
      const el = document.querySelector('[data-consult-capture-error]');
      return { text: el ? el.textContent : '', hidden: el ? el.hidden : true };
    });
    check('short phone: rejected client-side with area-code hint', !shortPhone.hidden && /area code/i.test(shortPhone.text), JSON.stringify(shortPhone));
    check('short phone: nothing was POSTed', leadPosts.length === 0, JSON.stringify(leadPosts));

    // Submitting sends the visitor to this trainer's Consult Form Hits and
    // unlocks the page.
    await page.$eval('[data-consult-capture-input="phone"]', (el) => { el.value = ''; });
    await page.type('[data-consult-capture-input="phone"]', '555 010 9999');
    await page.click('[data-consult-capture-submit]');
    await new Promise((r) => setTimeout(r, 1500));
    const after = await readGate(page);
    const post = leadPosts[0] || null;
    check('submit: POSTs the visitor to /api/coach/pages/lead', Boolean(post), JSON.stringify(leadPosts));
    check('submit: lead is trainer-specific (site slug)', post?.siteSlug === HANDLE, JSON.stringify(post));
    check('submit: lead carries name, email, and phone', post?.fullName === 'Jordan Fields' && post?.email === 'jordan@example.com' && String(post?.phone || '').replace(/\D/g, '').length >= 7, JSON.stringify(post));
    check('submit: hit is tagged with the capture form id', post?.formId === 'consult-capture', JSON.stringify(post));
    check('submit: capture closes and the page unlocks', !after.captureVisible && !after.frameGated, JSON.stringify(after));
    check('submit: gate_submit analytics beacon fired', funnelPosts.some((p) => p.type === 'gate_submit' && p.handle === HANDLE), JSON.stringify(funnelPosts));
    const persisted = await page.evaluate(() => localStorage.getItem(`trainer-consult-capture:${'etavisf'}`));
    let persistedOk = false;
    try { persistedOk = JSON.parse(persisted || 'null')?.completed === true; } catch {}
    check('submit: completion persists so they are not re-asked', persistedOk, String(persisted));
    await page.close();
  }

  // ---- 1c. production-shaped payload for an unconfigured trainer ----
  // The fixed server sends { configured:false, enabled:false, questions:[14
  // stock] }; the enabled/configured flags — not the questions — must decide.
  {
    const page = await visit(browser, null, { configured: false, enabled: false, questions: QUALIFICATION.questions });
    const g = await readGate(page);
    check('server-shape: stock gate stays hidden', !g.gateVisible && !g.hasQuestionText, JSON.stringify(g));
    check('server-shape: simple consult capture shows instead', g.captureVisible, JSON.stringify(g));
    await page.close();
  }

  // ---- 1d. a trainer who explicitly disabled their configured gate gets ----
  // no gate of any kind: no stock questions, no capture.
  {
    const page = await visit(browser, null, { configured: true, enabled: false, questions: QUALIFICATION.questions });
    const g = await readGate(page);
    check('disabled: no gate on screen', !g.gateVisible, JSON.stringify(g));
    check('disabled: no consult capture either', !g.captureVisible, JSON.stringify(g));
    check('disabled: page is not blurred', !g.frameGated, JSON.stringify(g));
    await page.close();
  }

  // ---- 1e. legacy ?trainer= route whose public page lookup 404s ----
  // The client fabricates a blank placeholder page there; a non-dismissable
  // capture whose POST can never resolve would lock the visitor out forever.
  {
    const page = await visit(browser, null, null, null, { publicNotFound: true, path: `/trainer-profile.html?trainer=${HANDLE}` });
    const g = await readGate(page);
    check('legacy 404: no capture trap on a page that cannot deliver leads', !g.captureVisible, JSON.stringify(g));
    check('legacy 404: profile not blurred', !g.frameGated, JSON.stringify(g));
    await page.close();
  }

  // ---- 1f. small phone viewport: the capture must stay reachable ----
  {
    const page = await visit(browser, null, null, null, { viewport: { width: 360, height: 640 } });
    const m = await page.evaluate(() => {
      const overlay = document.querySelector('[data-trainer-consult-capture="1"]');
      const btn = overlay ? overlay.querySelector('[data-consult-capture-submit]') : null;
      if (!overlay || !btn) return null;
      btn.scrollIntoView({ block: 'nearest' });
      const r = btn.getBoundingClientRect();
      return {
        overflowY: getComputedStyle(overlay).overflowY,
        submitReachable: r.top >= 0 && r.bottom <= window.innerHeight + 1
      };
    });
    check('small phone: overlay is scrollable', Boolean(m && m.overflowY === 'auto'), JSON.stringify(m));
    check('small phone: submit button reachable', Boolean(m && m.submitReachable), JSON.stringify(m));
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

  // ---- 2b. the owner of an UNCONFIGURED page bypasses the capture too ----
  {
    const page = await visit(browser, TRAINER, null);
    const g = await readGate(page);
    check('owner: no consult capture on their own unconfigured page', !g.captureVisible, JSON.stringify(g));
    check('owner: unconfigured page not blurred for them', !g.frameGated, JSON.stringify(g));
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
