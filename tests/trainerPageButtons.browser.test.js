const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const puppeteer = require('puppeteer');

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function trainerProfileShell() {
  return `
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Trainer Profile - RiseForIt</title>
      <meta name="description" content="Initial trainer description">
      <link rel="canonical" href="http://localhost/trainer-profile.html">
    </head>
    <body class="trainer-profile-page">
      <nav class="navbar">Main nav</nav>
      <aside id="control-panel" class="control-panel">Control panel</aside>
      <section id="trainer-profile-hero"></section>
      <section id="trainer-profile-content"></section>
      <div class="trainer-profile-top-actions">
        <a class="trainer-profile-back" href="#">Back</a>
        <div class="trainer-profile-share-wrap">
          <button id="trainer-profile-share-toggle" type="button">Share</button>
          <div id="trainer-profile-share-actions"></div>
        </div>
        <div id="trainer-profile-status"></div>
      </div>
      <script src="/js/trainer-profile.js"></script>
    </body>
    </html>
  `;
}

function createPublicPageServer({
  siteSlug = 'avery',
  pageSlug = '',
  customCode = { html: '', css: '', javascript: '', iframes: [], embedScripts: [] },
  pagesBySlug = null
} = {}) {
  const trainer = {
    id: 'trainer-1',
    username: siteSlug,
    displayName: 'Avery Stone',
    fullName: 'Avery Stone',
    publicHandle: siteSlug,
    brandPositioning: 'Remote coaching for busy lifters'
  };
  const jsTrainerProfile = readFile(path.join('js', 'trainer-profile.js'));
  const externalShield = readFile(path.join('js', 'external-keydown-shield.js'));
  const shell = Buffer.from(trainerProfileShell(), 'utf8');
  const normalizedPagesBySlug = pagesBySlug && typeof pagesBySlug === 'object'
    ? pagesBySlug
    : {
        [pageSlug || 'home']: {
          pageName: pageSlug ? 'Details' : 'Home',
          navLabel: pageSlug ? 'Details' : 'Home',
          customCode
        }
      };
  const buildPage = (slugValue = '') => {
    const key = String(slugValue || '').trim() || 'home';
    const entry = normalizedPagesBySlug[key] || normalizedPagesBySlug.home || { customCode };
    const code = entry.customCode || customCode;
    return {
      id: `page-${key}`,
      siteSlug,
      pageSlug: key === 'home' ? '' : key,
      pageName: String(entry.pageName || (key === 'home' ? 'Home' : 'Details')).trim(),
      navLabel: String(entry.navLabel || entry.pageName || (key === 'home' ? 'Home' : 'Details')).trim(),
      navOrder: Number.isFinite(Number(entry.navOrder)) ? Number(entry.navOrder) : 0,
      mode: 'custom_code',
      isHome: key === 'home',
      isPublished: true,
      draftContent: {
        mode: 'custom_code',
        customCode: code
      },
      publishedContent: {
        mode: 'custom_code',
        customCode: code
      },
      seo: {},
      settings: {}
    };
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

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
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    if (url.pathname === '/api/auth/trainers') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, trainers: [trainer] }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      const requestedPageSlug = String(url.searchParams.get('pageSlug') || '').trim();
      const page = buildPage(requestedPageSlug);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        trainer,
        page,
        navigation: Object.keys(normalizedPagesBySlug).map((key, index) => {
          const navPage = buildPage(key === 'home' ? '' : key);
          return {
            siteSlug,
            pageSlug: navPage.pageSlug,
            pageName: navPage.pageName,
            navLabel: navPage.navLabel,
            navOrder: index,
            publicPath: `/coach/${siteSlug}${navPage.pageSlug ? `/${navPage.pageSlug}` : ''}`
          };
        })
      }));
      return;
    }
    if (url.pathname === '/api/coach/pages/event' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, automation: {} }));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/trainer-profile.html' || url.pathname.startsWith('/coach/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shell);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  return { server };
}

async function startPublicPageServer(options = {}) {
  const { server } = createPublicPageServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`
  };
}

test('public standalone route button from add button looks like a CTA and smooth scrolls to same-page section', async () => {
  const customCode = {
    html: '<section style="padding:48px 24px"><a data-standalone-route-button="1" data-standalone-route-href="#pricing" href="#pricing">See pricing</a><div style="height:900px"></div><section id="pricing"><h2>Pricing</h2><p>Plans</p></section></section>',
    css: '',
    javascript: '',
    iframes: [],
    embedScripts: []
  };
  const { server, origin } = await startPublicPageServer({ customCode });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('iframe[data-builder-preview-frame="1"]');
    const frame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await frame.waitForSelector('[data-standalone-route-button="1"]');

    const styles = await frame.$eval('[data-standalone-route-button="1"]', (node) => {
      const style = window.getComputedStyle(node);
      return {
        borderRadius: style.borderRadius,
        backgroundImage: style.backgroundImage,
        minHeight: style.minHeight,
        color: style.color
      };
    });
    assert.match(styles.borderRadius, /999/);
    assert.notEqual(styles.backgroundImage, 'none');
    assert.equal(styles.minHeight, '52px');
    assert.match(styles.color, /255,\s*255,\s*255/);

    const before = await frame.evaluate(() => ({
      top: Number(document.getElementById('pricing')?.getBoundingClientRect().top || 0)
    }));
    await frame.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector('[data-standalone-route-button="1"]')?.click();
    });
    await frame.waitForFunction((initialTop) => {
      const target = document.getElementById('pricing');
      return String(window.location.hash || '') === '#pricing'
        && Number(window.scrollY || 0) > 0
        && Number(target?.getBoundingClientRect().top || 9999) < Number(initialTop || 0);
    }, {}, before.top);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('template-one buttons render as stronger CTAs and keep their intended navigation behavior', async () => {
  const customCode = {
    html: readFile(path.join('data', 'trainer-page-templates', 'template-one.html')),
    css: '',
    javascript: '',
    iframes: [],
    embedScripts: []
  };
  const { server, origin } = await startPublicPageServer({ customCode });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('iframe[data-builder-preview-frame="1"]');
    const frame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await frame.waitForSelector('.cv-main-btn');

    const ctaStyles = await frame.$eval('.cv-main-btn', (node) => {
      const style = window.getComputedStyle(node);
      return {
        borderRadius: style.borderRadius,
        backgroundImage: style.backgroundImage,
        minHeight: style.minHeight
      };
    });
    assert.match(ctaStyles.borderRadius, /999/);
    assert.notEqual(ctaStyles.backgroundImage, 'none');
    assert.equal(ctaStyles.minHeight, '52px');

    await frame.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector('.cv-link-btn')?.click();
    });
    await frame.waitForFunction(() => {
      return Number(document.getElementById('cvVsl')?.getBoundingClientRect().top || 9999) < 80;
    });

    await frame.evaluate(() => {
      document.querySelector('.cv-main-btn')?.click();
    });
    await frame.waitForFunction(() => {
      return document.querySelector('#apply.cv-page.active') instanceof HTMLElement;
    });

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('public add-button route can navigate to another coach page and preserve the section hash', async () => {
  const { server, origin } = await startPublicPageServer({
    pagesBySlug: {
      home: {
        pageName: 'Home',
        navLabel: 'Home',
        customCode: {
          html: '<section style="padding:48px 24px"><a data-standalone-route-button="1" data-standalone-route-href="/coach/avery/details#plans" href="/coach/avery/details#plans">View plans</a></section>',
          css: '',
          javascript: '',
          iframes: [],
          embedScripts: []
        }
      },
      details: {
        pageName: 'Details',
        navLabel: 'Details',
        customCode: {
          html: '<section style="padding:48px 24px"><div style="height:400px"></div><section id="plans"><h2>Plans</h2><p>Details page content</p></section></section>',
          css: '',
          javascript: '',
          iframes: [],
          embedScripts: []
        }
      }
    }
  });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('iframe[data-builder-preview-frame="1"]');
    let frame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await frame.waitForSelector('[data-standalone-route-button="1"]');
    await frame.evaluate(() => {
      document.querySelector('[data-standalone-route-button="1"]')?.click();
    });

    await page.waitForFunction(() => {
      return window.location.pathname.endsWith('/coach/avery/details')
        && window.location.hash === '#plans';
    });

    await page.waitForSelector('iframe[data-builder-preview-frame="1"]');
    frame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await frame.waitForFunction(() => {
      return document.getElementById('plans') instanceof HTMLElement;
    });

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });
