/* Entry escape hatch + role-aware brand link (browser).
   1. The RiseForIt wordmark is "home", and home follows the role.
   2. Onboarding always offers a way out for someone who already has an
      account: "Have an account? Log in" when signed out, "Back to my account"
      when signed in and already set up, nothing when a signed-in user genuinely
      hasn't onboarded (their overview would bounce them straight back).
   Run: node tests/entryEscapeBrand.browser.js */
const puppeteer = require('../node_modules/puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.ENTRY_ESCAPE_TEST_PORT || 4183);
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const USERS = {
  client: { id: '22222222-2222-4222-8222-222222222222', username: 'client_c', displayName: 'Client C', isOwner: false, isTrainer: false, isManager: false, isClient: true, trainer: { active: false }, manager: { active: false }, client: { active: true }, onboarded: true },
  trainer: { id: '11111111-1111-4111-8111-111111111111', username: 'coach_t', displayName: 'Coach T', isOwner: false, isTrainer: true, isManager: false, isClient: false, trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: false }, onboarded: true },
  owner: { id: '44444444-4444-4444-8444-444444444444', username: 'riseforit', displayName: 'RiseForIt', isOwner: true, isTrainer: true, isManager: false, isClient: true, trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: true }, onboarded: true }
};

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`);
  if (!cond) failures += 1;
};

async function newPage(browser, user, seed = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('      pageerror:', String(e).slice(0, 160)));
  await page.setViewport(PHONE);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (b) => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(b) }).catch(() => {});
    if (u.includes('/api/auth/me')) return json({ user: user || null, impersonation: null });
    if (u.includes('/api/')) return json({});
    req.continue().catch(() => {});
  });
  await page.evaluateOnNewDocument((hintUser, extra) => {
    localStorage.clear();
    if (hintUser) localStorage.setItem('ode_auth_user_hint_v1', JSON.stringify({ ts: Date.now(), user: hintUser }));
    // Suppress the intro cutscene and the once-a-day recap redirect
    // (js/daily-recap.js sends the first app page of the day to the overview).
    localStorage.setItem('ode_intro_seen_v1', '1');
    if (hintUser?.id) {
      localStorage.setItem(`ode_daily_overview_day_v1:${hintUser.id}`, new Date().toISOString().slice(0, 10));
    }
    Object.entries(extra || {}).forEach(([k, v]) => localStorage.setItem(k, v));
  }, user, seed);
  return page;
}

const brandHref = (page) => page.evaluate(() => {
  const b = document.querySelector('.navbar-brand');
  if (!b) return null;
  return { tag: b.tagName, href: b.getAttribute('href') || b.dataset.odeHome || '', role: b.getAttribute('role') || '' };
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // ---- 1. brand wordmark points at the role's home ----
  const brandCases = [
    ['signed out', null, 'index.html'],
    ['client', USERS.client, 'overview.html#control-panel'],
    ['trainer-only', USERS.trainer, 'content.html'],
    ['owner', USERS.owner, 'overview.html#control-panel']
  ];
  for (const [label, user, expected] of brandCases) {
    const page = await newPage(browser, user, { ode_onboarding_done_v1: '1', ode_onboarding_version: '99' });
    await page.goto(`http://localhost:${PORT}/coaches.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1200));
    const b = await brandHref(page);
    check(`brand @coaches.html (${label}) -> ${expected}`, b && b.href === expected, JSON.stringify(b));
    await page.close();
  }

  // brand on an <a> stays a real link (no JS needed to work)
  {
    const page = await newPage(browser, USERS.trainer, { ode_onboarding_done_v1: '1', ode_onboarding_version: '99' });
    await page.goto(`http://localhost:${PORT}/content.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1200));
    const b = await brandHref(page);
    check('brand keeps <a> semantics where the markup is a link', b && b.tag === 'A', JSON.stringify(b));
    await page.close();
  }

  // index renders the brand as a div — it must gain link semantics
  {
    const page = await newPage(browser, USERS.client, { ode_onboarding_done_v1: '1', ode_onboarding_version: '99' });
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1400));
    const b = await brandHref(page);
    check('brand on index gets role="link" + a resolved home',
      b && b.role === 'link' && b.href === 'overview.html#control-panel', JSON.stringify(b));
    await page.close();
  }

  // ---- 2. the quiz top bar renders whatever escape hatch the host gives it ----
  {
    const page = await newPage(browser, null);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.OdeClientQuiz), { timeout: 8000 });
    const quiz = await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'quiz-probe';
      document.body.appendChild(host);
      const seen = [];
      document.addEventListener('click', (e) => {
        if (e.target.closest('[data-entry-escape]')) seen.push('clicked');
      });
      const api = window.OdeClientQuiz.mount(host, {
        answers: {},
        startIndex: 0,
        escape: () => ({ kind: 'login', lead: 'Have an account?', strong: 'Log in' })
      });
      const btn = host.querySelector('.bm-topbar [data-entry-escape]');
      const text = btn ? btn.textContent.replace(/\s+/g, ' ').trim() : '';
      btn?.click();
      // and with no hatch offered, the slot falls back to the plain spacer
      const host2 = document.createElement('div');
      document.body.appendChild(host2);
      const api2 = window.OdeClientQuiz.mount(host2, { answers: {}, startIndex: 0, escape: () => null });
      const none = !host2.querySelector('[data-entry-escape]');
      const spacer = Boolean(host2.querySelector('.bm-topbar .bm-topbar-spacer'));
      const out = { present: Boolean(btn), text, clicks: seen.length, none, spacer };
      api.destroy(); api2.destroy();
      host.remove(); host2.remove();
      return out;
    });
    check('quiz top bar renders the escape hatch', quiz.present, JSON.stringify(quiz));
    check('quiz escape hatch uses the host-supplied wording',
      /Have an account\?/.test(quiz.text) && /Log in/.test(quiz.text), quiz.text);
    check('quiz escape hatch click reaches the delegated handler', quiz.clicks === 1, String(quiz.clicks));
    check('no hatch offered -> quiz falls back to the spacer', quiz.none && quiz.spacer, JSON.stringify(quiz));
    await page.close();
  }

  // ---- 3. what the entry flow offers, per state ----
  const escapeCases = [
    ['signed out', null, {}, 'login'],
    // force flag = "Restart onboarding": set up, but deliberately back in the
    // questions (without it the entry page just redirects them to their app).
    ['signed in + already set up', USERS.client, { ode_onboarding_done_v1: '1', ode_onboarding_force_v1: '1' }, 'switch'],
    ['signed in, not onboarded yet', { ...USERS.client, onboarded: false }, {}, 'switch']
  ];
  for (const [label, user, seed, kind] of escapeCases) {
    const page = await newPage(browser, user, seed);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.odeEntryEscape === 'function', { timeout: 8000 });
    const esc = await page.evaluate(() => window.odeEntryEscape());
    check(`entry escape (${label}) -> ${kind}, always offers Log in`,
      esc && esc.kind === kind && esc.strong === 'Log in', JSON.stringify(esc));
    await page.close();
  }

  // ---- 4. the control is actually on screen during onboarding ----
  {
    const page = await newPage(browser, USERS.client, {
      ode_onboarding_done_v1: '1',
      ode_onboarding_force_v1: '1' // "Restart onboarding": set up, but back in the questions
    });
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-open-path="user"]', { timeout: 9000 });
    // JS click: the entry hero stacks decorative layers over the path cards, so
    // a synthetic mouse click can land on the wrong element in headless.
    await page.evaluate(() => document.querySelector('[data-open-path="user"]').click());
    await page.waitForFunction(
      () => document.getElementById('entry-home')?.classList.contains('is-onboarding-active'),
      { timeout: 8000 }
    );
    const shown = await page.evaluate(() => {
      const btn = document.querySelector('#onboarding-panel [data-entry-escape]');
      if (!btn) return { present: false };
      const rect = btn.getBoundingClientRect();
      return {
        present: true,
        visible: Boolean(btn.offsetParent),
        text: btn.textContent.replace(/\s+/g, ' ').trim(),
        tall: rect.height >= 44,
        onScreen: rect.width > 0 && rect.top < window.innerHeight && rect.bottom > 0
      };
    });
    check('onboarding panel shows the escape control', shown.present && shown.visible, JSON.stringify(shown));
    check('onboarding escape offers Log in', /Log in/.test(shown.text || ''), shown.text);
    check('onboarding escape meets the 44px tap target', Boolean(shown.tall), JSON.stringify(shown));
    check('onboarding escape is on screen', Boolean(shown.onScreen), JSON.stringify(shown));

    // Clicking it ends the wrong session and lands on the login screen —
    // never a jump to an app the onboarding gate would bounce.
    let loggedOut = false;
    page.on('request', (req) => { if (/\/api\/auth\/logout/.test(req.url())) loggedOut = true; });
    await Promise.all([
      page.waitForNavigation({ timeout: 9000 }).catch(() => null),
      page.evaluate(() => document.querySelector('#onboarding-panel [data-entry-escape]').click())
    ]);
    check('clicking it lands on the login screen', /authMode=login/.test(page.url()), page.url());
    check('clicking it ends the wrong session', loggedOut, 'no /api/auth/logout seen');
    await page.close();
  }

  // ---- 4b. the promise on the other side: an onboarded account lands on its
  //          own overview, which is where logging in takes them ----
  {
    const page = await newPage(browser, USERS.client, { ode_onboarding_done_v1: '1', ode_onboarding_version: '99' });
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2000));
    check('an onboarded client on the entry page is routed to their overview',
      /overview\.html/.test(page.url()), page.url());
    await page.close();
  }

  // ---- 5. signed-out log-in interrupt keeps the setup recoverable ----
  {
    const page = await newPage(browser, null);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.odeEntryLogin === 'function', { timeout: 8000 });
    const flow = await page.evaluate(() => {
      window.odeEntryLogin();
      const authOn = document.getElementById('entry-auth-stage')?.classList.contains('is-active');
      const resume = document.getElementById('entry-auth-resume');
      return {
        authOn: Boolean(authOn),
        resumeExists: Boolean(resume),
        // no path chosen yet, so there is nothing to go back to
        resumeHidden: Boolean(resume?.classList.contains('entry-hidden')),
        onboardingOff: !document.getElementById('entry-home')?.classList.contains('is-onboarding-active')
      };
    });
    check('odeEntryLogin() shows the auth stage', flow.authOn, JSON.stringify(flow));
    check('odeEntryLogin() takes the onboarding overlay down', flow.onboardingOff, JSON.stringify(flow));
    check('"Back to setup" stays hidden when there is no setup', flow.resumeExists && flow.resumeHidden, JSON.stringify(flow));
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
