/* Role-based nav + access verification (browser).
   Serves the repo statically, mocks /api/auth/me per role (with delay to
   catch wrong-nav flashes), seeds the auth hint, and drives real pages.
   Run: node tests/role-nav.browser.js */
const puppeteer = require('../node_modules/puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.ROLE_NAV_TEST_PORT || 4173);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const USERS = {
  trainerOnly: { id: '11111111-1111-4111-8111-111111111111', username: 'coach_t', displayName: 'Coach T', isOwner: false, isTrainer: true, isManager: false, isClient: false, trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: false } },
  clientOnly: { id: '22222222-2222-4222-8222-222222222222', username: 'client_c', displayName: 'Client C', isOwner: false, isTrainer: false, isManager: false, isClient: true, trainer: { active: false }, manager: { active: false }, client: { active: true } },
  dual: { id: '33333333-3333-4333-8333-333333333333', username: 'dual_d', displayName: 'Dual D', isOwner: false, isTrainer: true, isManager: false, isClient: true, trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: true } },
  owner: { id: '44444444-4444-4444-8444-444444444444', username: 'riseforit', displayName: 'RiseForIt', isOwner: true, isTrainer: true, isManager: false, isClient: true, trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: true } }
};

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`);
  if (!cond) failures += 1;
};

async function newRolePage(browser, user, { meDelay = 400 } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', () => {});
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/auth/me')) {
      setTimeout(() => {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ user, impersonation: null }) }).catch(() => {});
      }, meDelay);
      return;
    }
    if (u.includes('/api/')) {
      req.respond({ status: 200, contentType: 'application/json', body: '{}' }).catch(() => {});
      return;
    }
    req.continue().catch(() => {});
  });
  await page.evaluateOnNewDocument((hintUser) => {
    localStorage.setItem('ode_auth_user_hint_v1', JSON.stringify({ ts: Date.now(), user: hintUser }));
    localStorage.setItem('ode_onboarding_done_v1', '1');
    localStorage.setItem('ode_onboarding_version', '99');
  }, user);
  return page;
}

const navLabels = async (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('#nav-menu a')).map((a) => a.textContent.trim())
);

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // ---- 1. trainer-only on a client page: offer, and no client tabs (flash check) ----
  {
    const page = await newRolePage(browser, USERS.trainerOnly, { meDelay: 1200 });
    await page.goto(`http://localhost:${PORT}/nutrition.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 120)); // BEFORE /api/auth/me resolves
    const early = await navLabels(page);
    check('trainer-only nutrition: pre-auth nav has NO client tabs (no flash)',
      !early.some((l) => ['Nutrition', 'Training', 'Cardio', 'Dashboard', 'Macro Calculator'].includes(l)), JSON.stringify(early));
    check('trainer-only nutrition: pre-auth nav is trainer surface',
      early.includes('Content') && early.includes('Clients'), JSON.stringify(early));
    const offerEarly = await page.$('#ode-enable-client-offer');
    check('trainer-only nutrition: offer overlay shown (not the page)', Boolean(offerEarly));
    await new Promise((r) => setTimeout(r, 1600)); // after authoritative pass
    const offerLate = await page.$('#ode-enable-client-offer');
    check('trainer-only nutrition: offer still present after auth resolves', Boolean(offerLate));
    const late = await navLabels(page);
    check('trainer-only nutrition: post-auth nav still trainer-only',
      !late.some((l) => ['Nutrition', 'Training', 'Cardio', 'Dashboard'].includes(l)), JSON.stringify(late));
    await page.close();
  }

  // ---- 2. trainer-only on content.html: allowed, trainer nav ----
  {
    const page = await newRolePage(browser, USERS.trainerOnly);
    await page.goto(`http://localhost:${PORT}/content.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 900));
    check('trainer-only content.html: stays on content', page.url().includes('content.html'));
    const labels = await navLabels(page);
    check('trainer-only content.html: trainer nav rendered',
      labels.includes('Content') && labels.includes('Clients') && !labels.includes('Cardio'), JSON.stringify(labels));
    check('trainer-only content.html: no offer overlay', !(await page.$('#ode-enable-client-offer')));
    await page.close();
  }

  // ---- 3. client-only on overview: client nav, no trainer tabs ----
  {
    const page = await newRolePage(browser, USERS.clientOnly);
    await page.goto(`http://localhost:${PORT}/overview.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 900));
    const labels = await navLabels(page);
    check('client-only overview: client nav present',
      labels.includes('Cardio') && labels.includes('Dashboard'), JSON.stringify(labels));
    check('client-only overview: no trainer tabs',
      !labels.includes('Content') && !labels.includes('Clients') && !labels.includes('Website'), JSON.stringify(labels));
    await page.close();
  }

  // ---- 4. client-only typing a trainer page: redirected ----
  {
    const page = await newRolePage(browser, USERS.clientOnly);
    await page.goto(`http://localhost:${PORT}/content.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1200));
    check('client-only content.html: redirected to client home', page.url().includes('overview.html'), page.url());
    await page.close();
  }

  // ---- 5. dual-role: client page allowed + switcher present ----
  {
    const page = await newRolePage(browser, USERS.dual);
    await page.goto(`http://localhost:${PORT}/nutrition.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 900));
    check('dual on nutrition: allowed (no offer overlay)', !(await page.$('#ode-enable-client-offer')));
    const view = await page.evaluate(() => sessionStorage.getItem('ode_active_view_v1'));
    check('dual on nutrition: active view auto-set to client', view === 'client', String(view));
    const labels = await navLabels(page);
    check('dual on nutrition: client nav in client view', labels.includes('Cardio'), JSON.stringify(labels));
    const switcher = await page.evaluate(() => Boolean(document.querySelector('[data-set-view="trainer"]')));
    check('dual on nutrition: view switcher exists in account menu', switcher);
    await page.close();
  }

  // ---- 6. dual-role on trainer page: view flips to trainer ----
  {
    const page = await newRolePage(browser, USERS.dual);
    await page.goto(`http://localhost:${PORT}/trainer-dashboard.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 900));
    const view = await page.evaluate(() => sessionStorage.getItem('ode_active_view_v1'));
    check('dual on trainer-dashboard: view auto-set to trainer', view === 'trainer', String(view));
    const labels = await navLabels(page);
    check('dual on trainer-dashboard: trainer nav rendered', labels.includes('Content') && !labels.includes('Cardio'), JSON.stringify(labels));
    await page.close();
  }

  // ---- 7. owner: union nav + full access + View-as switcher ----
  {
    const page = await newRolePage(browser, USERS.owner);
    await page.goto(`http://localhost:${PORT}/overview.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 900));
    const labels = await navLabels(page);
    check('owner overview: union nav (client + trainer tabs)',
      labels.includes('Cardio') && labels.includes('Dashboard') && labels.includes('Content') && labels.includes('Clients'), JSON.stringify(labels));
    const switcher = await page.evaluate(() => ({
      owner: Boolean(document.querySelector('[data-set-view="owner"]')),
      trainer: Boolean(document.querySelector('[data-set-view="trainer"]')),
      client: Boolean(document.querySelector('[data-set-view="client"]'))
    }));
    check('owner: View-as switcher (Owner/Trainer/Client)', switcher.owner && switcher.trainer && switcher.client, JSON.stringify(switcher));
    await page.close();
  }
  {
    const page = await newRolePage(browser, USERS.owner);
    await page.goto(`http://localhost:${PORT}/content.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 900));
    check('owner content.html: full access (no redirect, no offer)',
      page.url().includes('content.html') && !(await page.$('#ode-enable-client-offer')), page.url());
    await page.close();
  }

  // ---- 8. trainer-only landing: entry router sends to content.html ----
  {
    const page = await newRolePage(browser, USERS.trainerOnly);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2000));
    check('trainer-only on index: routed to content.html', page.url().includes('content.html'), page.url());
    await page.close();
  }
  // client-only landing check
  {
    const page = await newRolePage(browser, USERS.clientOnly);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2000));
    check('client-only on index: routed to overview', page.url().includes('overview.html'), page.url());
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(failures === 0 ? 'ROLE-NAV: ALL PASS' : `ROLE-NAV: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => { console.error('SUITE CRASH:', err); process.exit(1); });
