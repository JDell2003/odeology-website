const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const puppeteer = require('puppeteer');

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function trainerProfileHtmlFixture() {
  return readFile('trainer-profile.html')
    .toString('utf8')
    .replace(/<script src="js\/main\.js[^"]*"><\/script>/i, '')
    .replace(/<script src="js\/avatar-cropper\.js"><\/script>/i, '');
}

function serveStaticAsset(reqPath, res) {
  const cleanPath = String(reqPath || '').split('?')[0];
  const relPath = cleanPath.replace(/^\/+/, '');
  if (!relPath || relPath.includes('..')) return false;
  const absPath = path.join(__dirname, '..', relPath);
  if (!absPath.startsWith(path.join(__dirname, '..'))) return false;
  if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) return false;
  res.writeHead(200, { 'Content-Type': contentTypeFor(absPath) });
  res.end(fs.readFileSync(absPath));
  return true;
}

function buildFixture() {
  const trainer = {
    id: 'trainer-1',
    username: 'avery',
    displayName: 'Avery Stone',
    fullName: 'Avery Stone',
    publicHandle: 'avery',
    brandPositioning: 'Remote coaching for busy lifters'
  };

  const navigation = [
    {
      id: 'page-home',
      siteSlug: 'avery',
      pageSlug: '',
      pageName: 'Home',
      navLabel: 'Home',
      navOrder: 0,
      isHome: true,
      isPublished: true
    },
    {
      id: 'page-apply',
      siteSlug: 'avery',
      pageSlug: 'apply',
      pageName: 'Apply',
      navLabel: 'Apply',
      navOrder: 1,
      isHome: false,
      isPublished: true
    }
  ];

  const homePage = {
    id: 'page-home',
    siteSlug: 'avery',
    pageSlug: '',
    pageName: 'Home',
    navLabel: 'Home',
    navOrder: 0,
    isHome: true,
    isPublished: true,
    mode: 'custom_code',
    seo: {
      title: 'Avery Stone Coaching',
      description: 'Published home page for Avery coaching.',
      noIndex: false
    },
    publishedContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section class="home-page"><div class="band"><p class="eyebrow">Avery Stone</p><h1>Coach site inside the platform</h1><p>Qualification unlocks this page before a visitor can view the public trainer website.</p><a href="/coach/avery/apply" data-public-builder-cta="1">Apply now</a></div></section><section><div class="band"><h2>Results</h2><p>Visible sections flow like a real site, not stacked admin boxes.</p></div></section>',
        css: '.home-page,.band{padding:32px}.home-page{background:linear-gradient(135deg,#10283c,#214d6f);color:#fff}.eyebrow{letter-spacing:.18em;text-transform:uppercase;font:800 .72rem system-ui}.home-page h1{margin:10px 0 12px;font-size:clamp(2.6rem,6vw,4.8rem);line-height:.9;letter-spacing:-.07em;max-width:8ch}.home-page p,section p{max-width:52ch;line-height:1.7}a{display:inline-flex;margin-top:18px;padding:14px 20px;border-radius:999px;background:#fff;color:#10283c;text-decoration:none;font:800 .85rem system-ui}section{background:#f8f3eb;color:#10283c;border-top:1px solid rgba(16,40,60,.08)}section h2{margin:0;font-size:clamp(1.8rem,4vw,3rem)}',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    }
  };

  const applyPage = {
    id: 'page-apply',
    siteSlug: 'avery',
    pageSlug: 'apply',
    pageName: 'Apply',
    navLabel: 'Apply',
    navOrder: 1,
    isHome: false,
    isPublished: true,
    mode: 'custom_code',
    seo: {
      title: 'Apply for Coaching | Avery Stone',
      description: 'Published application page for coaching.',
      noIndex: false
    },
    publishedContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section class="apply-page"><div class="band"><p class="eyebrow">Apply</p><h1>Apply for coaching</h1><p>Tell us about your goals and schedule before you step into the full page.</p><a href="/coach/avery" data-public-builder-cta="1">Back to home</a></div></section>',
        css: '.apply-page,.band{padding:32px}.apply-page{background:linear-gradient(135deg,#10283c,#214d6f);color:#fff}.eyebrow{letter-spacing:.18em;text-transform:uppercase;font:800 .72rem system-ui}.apply-page h1{margin:10px 0 12px;font-size:clamp(2.6rem,6vw,4.8rem);line-height:.9;letter-spacing:-.07em;max-width:8ch}.apply-page p{max-width:52ch;line-height:1.7}a{display:inline-flex;margin-top:18px;padding:14px 20px;border-radius:999px;background:#fff;color:#10283c;text-decoration:none;font:800 .85rem system-ui}',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    }
  };

  return {
    trainer,
    navigation,
    pagesBySlug: {
      '': homePage,
      apply: applyPage
    }
  };
}

function qualificationQuestions() {
  return [
    { id: 'gender', label: 'Gender', type: 'radio', required: true, options: ['Female', 'Male', 'Other'] },
    { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' },
    { id: 'name_and_phone', label: 'Name and phone', type: 'contact', required: true, fields: ['full_name', 'phone'] }
  ];
}

async function startPublicFixtureServer() {
  const fixture = buildFixture();
  const jsTrainerProfile = readFile(path.join('js', 'trainer-profile.js'));
  const externalShield = readFile(path.join('js', 'external-keydown-shield.js'));
  const pageHtml = Buffer.from(trainerProfileHtmlFixture(), 'utf8');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (serveStaticAsset(url.pathname, res)) return;
    if (url.pathname === '/js/trainer-profile.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(jsTrainerProfile);
      return;
    }
    if (url.pathname === '/js/external-keydown-shield.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(externalShield);
      return;
    }
    if (url.pathname === '/api/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, user: null }));
      return;
    }
    if (url.pathname === '/api/auth/trainers') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, trainers: [fixture.trainer] }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      const siteSlug = String(url.searchParams.get('siteSlug') || '').trim().toLowerCase();
      const pageSlug = String(url.searchParams.get('pageSlug') || '').trim().toLowerCase();
      const page = siteSlug === 'avery' ? fixture.pagesBySlug[pageSlug] : null;
      if (!page) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        trainer: fixture.trainer,
        page,
        navigation: fixture.navigation,
        qualification: {
          enabled: true,
          questions: qualificationQuestions()
        }
      }));
      return;
    }
    if (url.pathname === '/api/coach/pages/qualification') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const payload = body ? JSON.parse(body) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          session: {
            id: 'qualification-session-1',
            sessionKey: payload.sessionKey || 'qualification-session-key',
            currentStep: Number(payload.currentStep || 0),
            status: payload.completed ? 'completed' : 'draft'
          },
          lead: payload.completed ? { id: 'lead-qualified-1' } : null,
          automation: {},
          qualification: { enabled: true },
          publicPage: {
            pageId: fixture.pagesBySlug.apply.id,
            siteSlug: 'avery',
            pageSlug: 'apply'
          }
        }));
      });
      return;
    }
    if (url.pathname === '/api/coach/pages/lead' || url.pathname === '/api/coach/pages/event') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, lead: { id: 'lead-1' }, automation: {} }));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/trainer-profile.html' || url.pathname.startsWith('/coach/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pageHtml);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin };
}

async function startEditorFixtureServer() {
  const fixture = buildFixture();
  const trainer = fixture.trainer;
  const viewer = {
    id: 'trainer-1',
    username: 'avery',
    displayName: 'Avery Stone',
    publicHandle: 'avery'
  };
  const jsTrainerProfile = readFile(path.join('js', 'trainer-profile.js'));
  const externalShield = readFile(path.join('js', 'external-keydown-shield.js'));
  const pageHtml = Buffer.from(trainerProfileHtmlFixture(), 'utf8');

  const pageRecord = {
    id: 'page-home',
    siteSlug: 'avery',
    pageSlug: '',
    pageName: 'Home',
    navLabel: 'Home',
    navOrder: 0,
    mode: 'custom_code',
    legacyMode: '',
    isHome: true,
    isPublished: false,
    draftContent: fixture.pagesBySlug[''].publishedContent,
    publishedContent: {},
    seo: fixture.pagesBySlug[''].seo,
    settings: {}
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (serveStaticAsset(url.pathname, res)) return;
    if (url.pathname === '/js/trainer-profile.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(jsTrainerProfile);
      return;
    }
    if (url.pathname === '/js/external-keydown-shield.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(externalShield);
      return;
    }
    if (url.pathname === '/api/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, user: viewer }));
      return;
    }
    if (url.pathname === '/api/auth/trainers') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, trainers: [trainer] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/pages' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, pages: [pageRecord] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/pages' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      pageRecord.draftContent = payload.draftContent || pageRecord.draftContent;
      pageRecord.pageName = payload.pageName || pageRecord.pageName;
      pageRecord.navLabel = payload.navLabel || pageRecord.navLabel;
      pageRecord.siteSlug = payload.siteSlug || pageRecord.siteSlug;
      pageRecord.pageSlug = payload.pageSlug || pageRecord.pageSlug;
      pageRecord.isHome = payload.isHome !== false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: pageRecord, pages: [pageRecord] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/versions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, versions: [] }));
      return;
    }
    if (
      url.pathname === '/api/auth/trainer/page/publish'
      || url.pathname === '/api/auth/trainer/page/unpublish'
      || url.pathname === '/api/auth/trainer/page/version/restore'
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: pageRecord, pages: [pageRecord] }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/trainer-profile.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pageHtml);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin };
}

async function captureSnapshots() {
  const outDir = path.join(__dirname, '..', 'snapshots', 'trainer-page');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const publicFixture = await startPublicFixtureServer();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1600, deviceScaleFactor: 1 });
      await page.goto(`${publicFixture.origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-trainer-qualification="1"]');
      await page.screenshot({
        path: path.join(outDir, 'public-qualification-gate-2026-06-17.png'),
        fullPage: true
      });

      await page.click('[data-qualification-radio="gender"][value="Male"]');
      await page.click('[data-qualification-next]');
      await page.waitForSelector('[data-qualification-text="email"]');
      await page.type('[data-qualification-text="email"]', 'jordan@example.com');
      await page.click('[data-qualification-next]');
      await page.waitForSelector('[data-qualification-contact="name_and_phone:full_name"]');
      await page.type('[data-qualification-contact="name_and_phone:full_name"]', 'Jordan Lead');
      await page.type('[data-qualification-contact="name_and_phone:phone"]', '5551234567');
      await page.click('[data-qualification-next]');
      await page.waitForFunction(() => !document.querySelector('[data-trainer-qualification="1"]'));
      await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
      await page.screenshot({
        path: path.join(outDir, 'public-revealed-2026-06-17.png'),
        fullPage: true
      });
      await page.close();
    } finally {
      await new Promise((resolve) => publicFixture.server.close(resolve));
    }

    const editorFixture = await startEditorFixtureServer();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1600, height: 1700, deviceScaleFactor: 1 });
      await page.goto(`${editorFixture.origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#trainer-profile-edit-toggle');
      await page.click('#trainer-profile-edit-toggle');
      await page.waitForSelector('.trainer-builder-workspace');
      await page.screenshot({
        path: path.join(outDir, 'editor-website-studio-2026-06-17.png'),
        fullPage: true
      });
      await page.close();
    } finally {
      await new Promise((resolve) => editorFixture.server.close(resolve));
    }
  } finally {
    await browser.close();
  }
}

captureSnapshots().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
