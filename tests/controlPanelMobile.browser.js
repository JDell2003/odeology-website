/* Mobile control-panel toggle verification (browser).
   Regression guard: trainer-only accounts must get the "Control Panel" FAB on
   a phone (it is the only way to open the panel there), with trainer-scoped
   links inside and no owner-only links leaking. Owner behaviour unchanged.
   Run: node tests/controlPanelMobile.browser.js */
const puppeteer = require('../node_modules/puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.CONTROL_PANEL_TEST_PORT || 4179);
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// etavisf is a trainer-only account: isTrainer, no client access, not owner.
const USERS = {
  etavisf: { id: '55555555-5555-4555-8555-555555555555', username: 'etavisf', displayName: 'etavisf', isOwner: false, isTrainer: true, isManager: false, isClient: false, trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: false } },
  owner: { id: '44444444-4444-4444-8444-444444444444', username: 'riseforit', displayName: 'RiseForIt', isOwner: true, isTrainer: true, isManager: false, isClient: true, trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: true } }
};

const OWNER_ONLY_HREFS = ['owner-accounts.html', 'owner-messaging.html', 'owner-doors.html', 'owner-analytics.html', 'owner-calendar.html', 'workout-database.html'];

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`);
  if (!cond) failures += 1;
};

async function newRolePage(browser, user) {
  const page = await browser.newPage();
  page.on('pageerror', () => {});
  await page.setViewport(PHONE);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ user, impersonation: null }) }).catch(() => {});
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
    // Suppress the intro cutscene + once-a-day recap so their full-screen
    // video/overlay doesn't sit on top of the FAB during the test.
    localStorage.setItem('ode_intro_seen_v1', '1');
    localStorage.setItem(`ode_daily_overview_day_v1:${hintUser.id}`, new Date().toISOString().slice(0, 10));
  }, user);
  return page;
}

// A control link counts as visible only if it and every ancestor render.
const readPanel = (page) => page.evaluate(() => {
  const panel = document.getElementById('control-panel');
  if (!panel) return null;
  const shown = (el) => Boolean(el.offsetParent || el.getClientRects().length);
  return {
    open: panel.classList.contains('open') && !panel.classList.contains('collapsed'),
    panelVisible: shown(panel),
    links: Array.from(panel.querySelectorAll('.control-link'))
      .filter(shown)
      .map((l) => ({
        href: String(l.getAttribute('href') || '').trim(),
        text: String(l.querySelector('.text')?.textContent || l.textContent || '').trim()
      }))
  };
});

const readFab = (page) => page.evaluate(() => {
  const fab = document.getElementById('control-mobile-fab');
  if (!fab) return { present: false };
  const rect = fab.getBoundingClientRect();
  const cs = getComputedStyle(fab);
  return {
    present: true,
    inDock: fab.parentElement?.id === 'control-mobile-fab-dock',
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    zIndex: getComputedStyle(document.getElementById('control-mobile-fab-dock') || fab).zIndex,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    onScreen: rect.width > 0 && rect.height > 0
      && rect.top < window.innerHeight && rect.bottom > 0
      && rect.left < window.innerWidth && rect.right > 0,
    // Nothing painted over it: the topmost element at its centre is the button.
    topmost: (() => {
      const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return el === fab || fab.contains(el);
    })(),
    navPresent: Boolean(document.getElementById('control-mobile-fab-nav'))
  };
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // ---- 1. trainer-only (etavisf) on their home page: FAB present + opens panel ----
  {
    const page = await newRolePage(browser, USERS.etavisf);
    await page.goto(`http://localhost:${PORT}/content.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1400));

    const fab = await readFab(page);
    check('etavisf @390px content.html: Control Panel button exists', fab.present, JSON.stringify(fab));
    check('etavisf: button is rendered (not display:none/hidden)',
      fab.present && fab.display !== 'none' && fab.visibility !== 'hidden' && Number(fab.opacity) > 0, JSON.stringify(fab));
    check('etavisf: button is on-screen', Boolean(fab.onScreen), JSON.stringify(fab.rect));
    check('etavisf: button is the topmost element at its centre (tappable)', Boolean(fab.topmost), JSON.stringify(fab));
    check('etavisf: no client quick-nav strip in the dock', fab.present && !fab.navPresent, JSON.stringify(fab));

    const before = await readPanel(page);
    check('etavisf: panel starts collapsed', Boolean(before) && !before.open, JSON.stringify(before?.open));

    await page.click('#control-mobile-fab');
    await new Promise((r) => setTimeout(r, 500));
    const after = await readPanel(page);
    check('etavisf: tapping the button opens the control panel', Boolean(after?.open), JSON.stringify(after?.open));

    const hrefs = (after?.links || []).map((l) => l.href);
    const texts = (after?.links || []).map((l) => l.text);
    const leaked = hrefs.filter((h) => OWNER_ONLY_HREFS.includes(h));
    check('etavisf: no owner-only links inside the panel', leaked.length === 0, JSON.stringify(leaked));
    check('etavisf: panel shows trainer tools',
      ['Clients', 'Content', 'Website', 'Calendar'].every((t) => texts.includes(t)), JSON.stringify(texts));
    const clientPortal = hrefs.filter((h) => ['training.html', 'nutrition.html', 'grocery-calendar.html'].includes(h));
    check('etavisf: no client training-portal links', clientPortal.length === 0, JSON.stringify(clientPortal));
    console.log('      etavisf panel links:', JSON.stringify(texts));
    await page.screenshot({ path: path.join(ROOT, 'tmp-cp-mobile-trainer.png') });
    await page.close();
  }

  // ---- 2. trainer-only on another trainer page (dashboard) ----
  {
    const page = await newRolePage(browser, USERS.etavisf);
    await page.goto(`http://localhost:${PORT}/trainer-dashboard.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1400));
    const fab = await readFab(page);
    check('etavisf @390px trainer-dashboard.html: button present + on-screen',
      fab.present && fab.onScreen, JSON.stringify(fab));
    await page.click('#control-mobile-fab');
    await new Promise((r) => setTimeout(r, 400));
    const after = await readPanel(page);
    check('etavisf trainer-dashboard: panel opens', Boolean(after?.open));
    await page.close();
  }

  // ---- 3. owner on mobile: unchanged (button + client quick-nav strip) ----
  {
    const page = await newRolePage(browser, USERS.owner);
    await page.goto(`http://localhost:${PORT}/overview.html`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 1600));
    const fab = await readFab(page);
    check('owner @390px overview.html: button present + on-screen', fab.present && fab.onScreen, JSON.stringify(fab));
    check('owner @390px: client quick-nav strip still rendered (unchanged)', Boolean(fab.navPresent), JSON.stringify(fab));
    check('owner @390px: button is the topmost element at its centre (tappable)', Boolean(fab.topmost), JSON.stringify(fab));
    await page.click('#control-mobile-fab');
    await new Promise((r) => setTimeout(r, 400));
    const after = await readPanel(page);
    check('owner: panel opens', Boolean(after?.open), JSON.stringify({ open: after?.open, visible: after?.panelVisible }));
    const ownerHrefs = (after?.links || []).map((l) => l.href);
    check('owner: still sees owner tooling', ownerHrefs.some((h) => OWNER_ONLY_HREFS.includes(h)), JSON.stringify(ownerHrefs));
    await page.screenshot({ path: path.join(ROOT, 'tmp-cp-mobile-owner.png') });
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
