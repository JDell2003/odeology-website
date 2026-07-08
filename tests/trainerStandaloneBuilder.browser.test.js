const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const puppeteer = require('puppeteer');

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath));
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

async function startStandaloneOwnerServer({
  delayAutosaveMs = 0,
  delayManualSaveMs = 0,
  initialCustomCodeHtml = '',
  initialCustomCodeCss = '',
  initialCustomCodeJavascript = '',
  initialPublished = false
} = {}) {
  const trainer = {
    id: 'trainer-1',
    username: 'avery',
    displayName: 'Avery Stone',
    fullName: 'Avery Stone',
    publicHandle: 'avery',
    brandPositioning: 'Remote coaching for busy lifters'
  };
  const viewer = {
    id: 'trainer-1',
    username: 'avery',
    displayName: 'Avery Stone',
    publicHandle: 'avery'
  };
  const jsTrainerProfile = readFile(path.join('js', 'trainer-profile.js'));
  const externalShield = readFile(path.join('js', 'external-keydown-shield.js'));
  const shell = Buffer.from(trainerProfileShell(), 'utf8');
  const requestLog = [];
  const initialCustomCode = {
    html: String(initialCustomCodeHtml || ''),
    css: String(initialCustomCodeCss || ''),
    javascript: String(initialCustomCodeJavascript || ''),
    iframes: [],
    embedScripts: []
  };
  const pageRecord = {
    id: 'page-home',
    siteSlug: 'avery',
    pageSlug: '',
    pageName: 'Home',
    navLabel: 'Home',
    navOrder: 0,
    mode: '',
    isHome: true,
    isPublished: initialPublished === true,
    draftContent: {
      mode: '',
      customCode: JSON.parse(JSON.stringify(initialCustomCode))
    },
    publishedContent: initialPublished === true
      ? { mode: '', customCode: JSON.parse(JSON.stringify(initialCustomCode)) }
      : {},
    seo: {},
    settings: {}
  };

  const normalizePage = (raw = {}) => ({
    id: String(raw.id || pageRecord.id).trim() || pageRecord.id,
    siteSlug: String(raw.siteSlug || pageRecord.siteSlug).trim() || 'avery',
    pageSlug: raw.isHome === true || !String(raw.pageSlug ?? pageRecord.pageSlug).trim()
      ? ''
      : String(raw.pageSlug ?? pageRecord.pageSlug).trim(),
    pageName: String(raw.pageName || pageRecord.pageName).trim() || 'Home',
    navLabel: String(raw.navLabel || raw.pageName || pageRecord.navLabel).trim() || 'Home',
    navOrder: Number.isFinite(Number(raw.navOrder)) ? Number(raw.navOrder) : 0,
    mode: String(raw.mode || raw?.draftContent?.mode || '').trim(),
    isHome: raw.isHome === true || !String(raw.pageSlug ?? pageRecord.pageSlug).trim(),
    isPublished: raw.isPublished === true,
    draftContent: raw.draftContent && typeof raw.draftContent === 'object' ? raw.draftContent : {},
    publishedContent: raw.publishedContent && typeof raw.publishedContent === 'object' ? raw.publishedContent : {},
    seo: raw.seo && typeof raw.seo === 'object' ? raw.seo : {},
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {}
  });

  const clonePage = () => JSON.parse(JSON.stringify(pageRecord));

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
      res.end(JSON.stringify({ ok: true, pages: [clonePage()] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/pages' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      requestLog.push({ kind: 'save', autosave: payload.autosave === true, payload: JSON.parse(JSON.stringify(payload)) });
      const delayMs = payload.autosave === true ? Number(delayAutosaveMs || 0) : Number(delayManualSaveMs || 0);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      Object.assign(pageRecord, normalizePage(payload));
      if (payload.publish === true && payload.autosave !== true) {
        pageRecord.isPublished = true;
        pageRecord.publishedContent = JSON.parse(JSON.stringify(pageRecord.draftContent || {}));
        requestLog.push({ kind: 'publish', via: 'save' });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: clonePage(), pages: [clonePage()] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/versions') {
      requestLog.push({ kind: 'versions_get' });
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Service unavailable' }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/publish' && req.method === 'POST') {
      requestLog.push({ kind: 'publish' });
      pageRecord.isPublished = true;
      pageRecord.publishedContent = JSON.parse(JSON.stringify(pageRecord.draftContent || {}));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: clonePage(), pages: [clonePage()] }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      requestLog.push({ kind: 'public_get' });
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
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

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    getPage: clonePage,
    getRequestLog: () => JSON.parse(JSON.stringify(requestLog))
  };
}

test('standalone owner builder keeps user script tags after a live drag save', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('trainer-route-loading'));
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<h1 id="headline">Build strength</h1>',
        '<script>document.getElementById("headline").dataset.boot="1";</script>'
      ].join('\n');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForFunction(() => document.querySelector('#headline')?.dataset.boot === '1');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 70, clientY: r.top + 40 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.left + 70, clientY: r.top + 40 }));
    }, rect);

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    assert.match(String(getPage()?.publishedContent?.customCode?.html || ''), /<script>/i);
    assert.match(String(getPage()?.publishedContent?.customCode?.html || ''), /dataset\.boot="1"/);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder persists dragged overlay coordinates after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('trainer-route-loading'));
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero" style="position:relative;min-height:320px"><div id="headline" style="position:absolute;left:12px;top:14px;padding:18px;background:#dbeafe">Build strength</div></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    await frame.evaluate(() => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 72, clientY: 64 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 72, clientY: 64 }));
    });

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      const leftMatch = value.match(/id="headline"[\s\S]*?left:\s*(\d+)px/i);
      const topMatch = value.match(/id="headline"[\s\S]*?top:\s*(\d+)px/i);
      return Number(leftMatch?.[1] || 0) > 12 && Number(topMatch?.[1] || 0) > 14;
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const style = await renderedFrame.$eval('#headline', (el) => {
      const computed = window.getComputedStyle(el);
      return {
        left: String(computed.left || ''),
        top: String(computed.top || ''),
        position: String(computed.position || '')
      };
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const leftMatch = savedHtml.match(/id="headline"[\s\S]*?left:\s*(\d+)px/i);
    const topMatch = savedHtml.match(/id="headline"[\s\S]*?top:\s*(\d+)px/i);
    assert.ok(Number(leftMatch?.[1] || 0) > 12);
    assert.ok(Number(topMatch?.[1] || 0) > 14);
    assert.equal(style.position, 'absolute');
    assert.notEqual(style.left, '12px');
    assert.notEqual(style.top, '14px');
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder keeps freely dragged overlays in place instead of re-parenting them into hovered sections', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<section id="left-zone" style="min-height:220px;padding:24px;background:#dbeafe"><h2>Left</h2><h1 id="headline" style="position:relative">Build strength</h1></section>',
        '<section id="right-zone" style="min-height:220px;padding:24px;background:#dcfce7;margin-top:32px"><h2>Right</h2></section>'
      ].join('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const metrics = await frame.evaluate(() => {
      const headline = document.querySelector('#headline');
      const target = document.querySelector('#right-zone');
      const headlineRect = headline.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return {
        startX: headlineRect.left + 18,
        startY: headlineRect.top + 18,
        endX: targetRect.left + 60,
        endY: targetRect.top + 80
      };
    });
    await frame.evaluate((m) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: m.startX, clientY: m.startY }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: m.endX, clientY: m.endY }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: m.endX, clientY: m.endY }));
    }, metrics);

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const leftSectionIndex = savedHtml.indexOf('id="left-zone"');
    const headlineIndex = savedHtml.indexOf('id="headline"');
    const rightSectionIndex = savedHtml.indexOf('id="right-zone"');
    assert.notEqual(leftSectionIndex, -1);
    assert.notEqual(headlineIndex, -1);
    assert.notEqual(rightSectionIndex, -1);
    assert.ok(headlineIndex > leftSectionIndex && headlineIndex < rightSectionIndex);
    assert.match(savedHtml, /id="headline"[\s\S]*position:\s*absolute/i);
    assert.match(savedHtml, /id="headline"[\s\S]*left:\s*\d+px/i);
    assert.match(savedHtml, /id="headline"[\s\S]*top:\s*\d+px/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder can marquee-select multiple elements and move them together', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero" style="position:relative;min-height:320px"><div id="one" style="position:absolute;left:40px;top:40px;width:80px;height:80px;background:#ef4444"></div><div id="two" style="position:absolute;left:170px;top:50px;width:80px;height:80px;background:#2563eb"></div></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#one');
    await frame.evaluate(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 280, clientY: 170 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 280, clientY: 170 }));
    });
    await frame.waitForFunction(() => document.querySelectorAll('[data-standalone-selected="1"]').length >= 2);

    const metrics = await frame.evaluate(() => {
      const one = document.querySelector('#one');
      const rect = one.getBoundingClientRect();
      return {
        startX: rect.left + (rect.width / 2),
        startY: rect.top + (rect.height / 2)
      };
    });
    await frame.evaluate((m) => {
      const one = document.querySelector('#one');
      one.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: m.startX, clientY: m.startY }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: m.startX + 50, clientY: m.startY + 30 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: m.startX + 50, clientY: m.startY + 30 }));
    }, metrics);

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /id="one"[\s\S]*left:\s*90px/i.test(value)
        && /id="one"[\s\S]*top:\s*70px/i.test(value)
        && /id="two"[\s\S]*left:\s*220px/i.test(value)
        && /id="two"[\s\S]*top:\s*80px/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /id="one"[\s\S]*left:\s*90px/i);
    assert.match(savedHtml, /id="one"[\s\S]*top:\s*70px/i);
    assert.match(savedHtml, /id="two"[\s\S]*left:\s*220px/i);
    assert.match(savedHtml, /id="two"[\s\S]*top:\s*80px/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder clears stale absolute placement when a section is switched back to block mode', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1>Build strength</h1><p>Copy</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#hero');
    const rect = await frame.$eval('#hero', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const hero = document.querySelector('#hero');
      hero.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.click('button[data-menu-action="layout_over"]');
    await new Promise((resolve) => setTimeout(resolve, 150));

    const rect2 = await frame.$eval('#hero', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const hero = document.querySelector('#hero');
      hero.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect2);
    await frame.click('button[data-menu-action="layout_block"]');
    await new Promise((resolve) => setTimeout(resolve, 150));

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const heroStyleMatch = savedHtml.match(/<section id="hero"[^>]*style="([^"]*)"/i);
    const heroStyle = String(heroStyleMatch?.[1] || '');
    assert.match(savedHtml, /data-standalone-layout="block"/);
    assert.doesNotMatch(heroStyle, /position:\s*absolute/i);
    assert.doesNotMatch(heroStyle, /left:\s*-?\d+px/i);
    assert.doesNotMatch(heroStyle, /top:\s*-?\d+px/i);
    assert.doesNotMatch(heroStyle, /z-index:\s*\d+/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder can reopen and resave a full-document draft without leaking bridge markup', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<h1 id="headline">Build strength</h1>',
        '<script>document.getElementById("headline").dataset.boot="1";</script>'
      ].join('\n');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForFunction(() => document.querySelector('#headline')?.dataset.boot === '1');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 70, clientY: r.top + 40 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.left + 70, clientY: r.top + 40 }));
    }, rect);

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');
    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.equal((savedHtml.match(/id="standalone-bridge-style"/gi) || []).length, 0);
    assert.equal((savedHtml.match(/id="standalone-bridge-script"/gi) || []).length, 0);
    assert.equal((savedHtml.match(/id="standalone-context-menu"/gi) || []).length, 0);
    assert.equal((savedHtml.match(/id="standalone-hover-cursor-style"/gi) || []).length, 0);
    assert.equal((savedHtml.match(/dataset\.boot="1"/gi) || []).length >= 1, true);
    assert.equal((savedHtml.match(/document\.getElementById\("headline"\)\.dataset\.boot="1";/gi) || []).length, 1);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder persists deleted elements through save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section><h1 id="headline">Build strength</h1><p id="subcopy">Copy</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#subcopy');
    await frame.evaluate(() => {
      const subcopy = document.querySelector('#subcopy');
      const rect = subcopy.getBoundingClientRect();
      const x = rect.left + (rect.width / 2);
      const y = rect.top + (rect.height / 2);
      subcopy.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      subcopy.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      subcopy.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    });
    await frame.waitForFunction(() => {
      const node = document.querySelector('#subcopy');
      return node && node.getAttribute('data-standalone-selected') === '1';
    });
    await frame.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return !/id="subcopy"/i.test(value) && /id="headline"/i.test(value);
    });
    await page.click('[data-standalone-done]');
    {
      const startedAt = Date.now();
      while (!getRequestLog().some((entry) => entry.kind === 'publish') && (Date.now() - startedAt) < 4000) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.doesNotMatch(savedHtml, /id="subcopy"/i);
    assert.match(savedHtml, /id="headline"/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder keeps div containers in block layout when resized', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<div id="hero" style="min-height:220px;padding:0;background:#dbeafe"><div id="fill" style="min-height:220px;padding:24px;background:rgba(255,255,255,.35)"><h1>Build strength</h1><p>Copy</p></div></div>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#fill');
    const rect = await frame.evaluate(() => {
      const hero = document.querySelector('#hero');
      const heroRect = hero.getBoundingClientRect();
      return {
        targetX: heroRect.right - 3,
        targetY: heroRect.bottom - 3
      };
    });
    await frame.evaluate((r) => {
      const fill = document.querySelector('#fill');
      fill.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.targetX, clientY: r.targetY }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.targetX + 80, clientY: r.targetY + 50 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.targetX + 80, clientY: r.targetY + 50 }));
    }, rect);

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const heroStyleMatch = savedHtml.match(/<div id="hero"[^>]*style="([^"]*)"/i);
    const heroStyle = String(heroStyleMatch?.[1] || '');
    assert.match(heroStyle, /width:\s*\d+px/i);
    assert.match(heroStyle, /height:\s*\d+px/i);
    assert.doesNotMatch(heroStyle, /position:\s*absolute/i);
    assert.doesNotMatch(heroStyle, /left:\s*-?\d+px/i);
    assert.doesNotMatch(heroStyle, /top:\s*-?\d+px/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder does not force structural div containers into overlay drag mode', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<div id="hero" style="min-height:220px;padding:24px;background:#dbeafe"><h1>Build strength</h1><p>Copy</p></div>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#hero');
    const rect = await frame.$eval('#hero', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const hero = document.querySelector('#hero');
      hero.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 40, clientY: r.top + 40 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 120, clientY: r.top + 90 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.left + 120, clientY: r.top + 90 }));
    }, rect);

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const heroStyleMatch = savedHtml.match(/<div id="hero"[^>]*style="([^"]*)"/i);
    const heroStyle = String(heroStyleMatch?.[1] || '');
    assert.doesNotMatch(heroStyle, /position:\s*absolute/i);
    assert.doesNotMatch(heroStyle, /left:\s*-?\d+px/i);
    assert.doesNotMatch(heroStyle, /top:\s*-?\d+px/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder freely drags nested content cards with child elements', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<section id="hero" style="min-height:320px;padding:24px;background:#dbeafe;position:relative">',
        '<div id="card" style="padding:24px;background:#ffffff;border-radius:20px;box-shadow:0 12px 30px rgba(0,0,0,.12)">',
        '<h2 style="margin:0 0 8px">Card title</h2>',
        '<p style="margin:0">Drag me around.</p>',
        '</div>',
        '</section>'
      ].join('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#card');
    const rect = await frame.$eval('#card', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    await frame.evaluate((r) => {
      const card = document.querySelector('#card');
      card.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: r.left + (r.width / 2),
        clientY: r.top + (r.height / 2)
      }));
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: r.left + (r.width / 2) + 96,
        clientY: r.top + (r.height / 2) + 72
      }));
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        clientX: r.left + (r.width / 2) + 96,
        clientY: r.top + (r.height / 2) + 72
      }));
    }, rect);

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /id="card"[\s\S]*position:\s*absolute/i.test(value)
        && /id="card"[\s\S]*left:\s*\d+px/i.test(value)
        && /id="card"[\s\S]*top:\s*\d+px/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /id="card"[\s\S]*position:\s*absolute/i);
    assert.match(savedHtml, /id="card"[\s\S]*left:\s*\d+px/i);
    assert.match(savedHtml, /id="card"[\s\S]*top:\s*\d+px/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder resizes a section from its rim even when the pointer starts on child content', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero" style="min-height:220px;padding:24px;background:#dbeafe"><h1 id="headline" style="margin:0">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.evaluate(() => {
      const hero = document.querySelector('#hero');
      const headline = document.querySelector('#headline');
      const heroRect = hero.getBoundingClientRect();
      const headlineRect = headline.getBoundingClientRect();
      return {
        startX: headlineRect.left + 14,
        startY: heroRect.bottom - 4,
        endX: headlineRect.left + 14,
        endY: heroRect.bottom + 90
      };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.startX, clientY: r.startY }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.endX, clientY: r.endY }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.endX, clientY: r.endY }));
    }, rect);

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /<section id="hero"[^>]*height:\s*3\d{2}px/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const heroMetrics = await renderedFrame.evaluate(() => {
      const hero = document.querySelector('#hero');
      const style = hero ? window.getComputedStyle(hero) : null;
      return {
        height: String(style?.height || ''),
        position: String(style?.position || ''),
        layout: String(hero?.getAttribute('data-standalone-layout') || '')
      };
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /<section id="hero"[^>]*height:\s*3\d{2}px/i);
    assert.match(heroMetrics.height, /3\d{2}px/i);
    assert.equal(heroMetrics.position, 'relative');
    assert.equal(heroMetrics.layout, 'block');
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder persists inline layout mode after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><div id="card" style="padding:24px;background:#dbeafe">Build strength</div></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#card');
    const rect = await frame.$eval('#card', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const card = document.querySelector('#card');
      card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 14, clientY: r.top + 14, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="layout_inline"]');
      if (button) button.click();
    });

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /id="card"[\s\S]*display:\s*inline-block/i.test(value)
        && /id="card"[\s\S]*data-standalone-layout="inline"/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const metrics = await renderedFrame.evaluate(() => {
      const card = document.querySelector('#card');
      const style = card ? window.getComputedStyle(card) : null;
      return {
        display: String(style?.display || ''),
        layout: String(card?.getAttribute('data-standalone-layout') || '')
      };
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /data-standalone-layout="inline"/i);
    assert.match(savedHtml, /display:\s*inline-block/i);
    assert.equal(metrics.display, 'inline-block');
    assert.equal(metrics.layout, 'inline');
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder persists over layout mode after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero" style="min-height:320px;position:relative"><div id="card" style="padding:24px;background:#dbeafe">Build strength</div></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#card');
    const rect = await frame.$eval('#card', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const card = document.querySelector('#card');
      card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 14, clientY: r.top + 14, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="layout_over"]');
      if (button) button.click();
    });

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /id="card"[\s\S]*position:\s*absolute/i.test(value)
        && /id="card"[\s\S]*data-standalone-layout="over"/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const metrics = await renderedFrame.evaluate(() => {
      const card = document.querySelector('#card');
      const style = card ? window.getComputedStyle(card) : null;
      return {
        position: String(style?.position || ''),
        layout: String(card?.getAttribute('data-standalone-layout') || '')
      };
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /data-standalone-layout="over"/i);
    assert.match(savedHtml, /position:\s*absolute/i);
    assert.equal(metrics.position, 'absolute');
    assert.equal(metrics.layout, 'over');
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder keeps sections in block flow when moved', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<section id="hero" style="min-height:220px;padding:24px;background:#dbeafe">',
        '<h1 id="headline">Build strength</h1>',
        '</section>',
        '<section id="proof" style="min-height:220px;padding:24px;background:#dcfce7">',
        '<p>Proof block</p>',
        '</section>'
      ].join('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#hero');
    const rect = await frame.$eval('#hero', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const hero = document.querySelector('#hero');
      hero.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 48, clientY: r.top + 48 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 144, clientY: r.top + 120 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.left + 144, clientY: r.top + 120 }));
    }, rect);

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /id="hero"/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const heroStyleMatch = savedHtml.match(/<section id="hero"[^>]*style="([^"]*)"/i);
    const heroStyle = String(heroStyleMatch?.[1] || '');
    assert.doesNotMatch(heroStyle, /position:\s*absolute/i);
    assert.doesNotMatch(heroStyle, /display:\s*inline-block/i);
    assert.doesNotMatch(heroStyle, /left:\s*-?\d+px/i);
    assert.doesNotMatch(heroStyle, /top:\s*-?\d+px/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder overwrites the previously published site after a full code replacement', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="site-a"><h1>Website One</h1><p>Original copy</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    let renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForSelector('#site-a');
    await renderedFrame.waitForFunction(() => /Website One/i.test(String(document.body.innerText || '')));

    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="site-b"><h1>Website Two</h1><p>Replacement copy</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForSelector('#site-b');
    await renderedFrame.waitForFunction(() => /Website Two/i.test(String(document.body.innerText || '')));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForSelector('#site-b');
    await renderedFrame.waitForFunction(() => /Website Two/i.test(String(document.body.innerText || '')));

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /id="site-b"/i);
    assert.match(savedHtml, /Website Two/i);
    assert.doesNotMatch(savedHtml, /id="site-a"/i);
    assert.doesNotMatch(savedHtml, /Website One/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder saves the latest code when Done is clicked immediately before autosave fires', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="latest-site"><h1>Latest Version</h1><p>Immediate done</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForSelector('#latest-site');
    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const autosaveRequests = getRequestLog().filter((entry) => entry.kind === 'save' && entry.autosave === true);
    assert.match(savedHtml, /id="latest-site"/i);
    assert.match(savedHtml, /Immediate done/i);
    assert.equal(autosaveRequests.length, 0);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'publish'), true);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder keeps the latest code when Done is clicked during an in-flight autosave', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer({ delayAutosaveMs: 900 });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="autosave-site"><h1>First Version</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await new Promise((resolve) => setTimeout(resolve, 1550));
    {
      const startedAt = Date.now();
      while (!getRequestLog().some((entry) => entry.kind === 'save' && entry.autosave === true) && (Date.now() - startedAt) < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="final-site"><h1>Final Version</h1><p>Wins after autosave</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForSelector('#final-site');
    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /id="final-site"/i);
    assert.match(savedHtml, /Wins after autosave/i);
    assert.doesNotMatch(savedHtml, /id="autosave-site"/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'save' && entry.autosave === true), true);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'publish'), true);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder undo restores the previous edit without leaving the editor or changing the route', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer({
    initialPublished: true,
    initialCustomCodeHtml: '<section id="site-a" style="height:2200px;padding-top:900px"><h1>Website One</h1></section>'
  });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('trainer-route-loading'));
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');

    let frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#site-a');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="site-b" style="height:2200px;padding-top:900px"><h1>Website Two</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await frame.waitForSelector('#site-b');
    await frame.evaluate(() => window.scrollTo(0, 700));
    await frame.waitForFunction(() => Number(window.scrollY || document.documentElement?.scrollTop || 0) >= 650);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await page.click('[data-standalone-undo]');

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      return input && /id="site-a"/.test(String(input.value || '')) && !/id="site-b"/.test(String(input.value || ''));
    });
    frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#site-a');
    const restoredScrollY = await frame.evaluate(() => Number(window.scrollY || document.documentElement?.scrollTop || 0));
    assert.ok(restoredScrollY >= 650, `expected undo to preserve preview scroll, got ${restoredScrollY}`);
    assert.equal(page.url(), `${origin}/coach/avery`);

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-page-code-html');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /id="site-a"/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder cancel discards unsaved edits and keeps the last published site', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="published-site"><h1>Published Version</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="draft-site"><h1>Draft Version</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('[data-standalone-cancel]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForSelector('#published-site');
    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /Published Version/i);
    assert.doesNotMatch(savedHtml, /Draft Version/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder cut and paste persists the reordered element after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Headline</h1><p id="copy">Copy block</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#copy');
    await frame.click('#copy');
    await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
    await page.keyboard.press('x');
    await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
    await frame.click('#headline');
    await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
    await page.keyboard.press('v');
    await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      const value = String(input?.value || '');
      const headlineIndex = value.indexOf('id="headline"');
      const copyIndex = value.indexOf('id="copy"');
      return headlineIndex >= 0 && copyIndex > headlineIndex;
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const order = await renderedFrame.evaluate(() => {
      const hero = document.querySelector('#hero');
      return Array.from(hero?.children || []).map((node) => node.id || node.tagName.toLowerCase());
    });
    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.deepEqual(order, ['headline', 'copy']);
    assert.match(savedHtml, /id="headline"/i);
    assert.match(savedHtml, /id="copy"/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder send-to-back persists layer order after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<section id="hero" style="position:relative;min-height:320px">',
        '<div id="back-card" style="position:absolute;left:40px;top:40px;width:180px;height:180px;background:#22c55e;z-index:1"></div>',
        '<div id="front-card" style="position:absolute;left:90px;top:90px;width:180px;height:180px;background:#2563eb;z-index:2"></div>',
        '</section>'
      ].join('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#front-card');
    const rect = await frame.$eval('#front-card', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const front = document.querySelector('#front-card');
      front.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 16, clientY: r.top + 16, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="back"]');
      if (button) button.click();
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      const value = String(input?.value || '');
      const heroStart = value.indexOf('id="hero"');
      const backIndex = value.indexOf('id="back-card"');
      const frontIndex = value.indexOf('id="front-card"');
      return heroStart >= 0 && frontIndex >= 0 && backIndex >= 0 && frontIndex < backIndex;
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const order = await renderedFrame.evaluate(() => {
      const hero = document.querySelector('#hero');
      return Array.from(hero?.children || []).map((node) => node.id || node.tagName.toLowerCase());
    });
    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const frontStyleMatch = savedHtml.match(/<div id="front-card"[^>]*style="([^"]*)"/i);
    const frontStyle = String(frontStyleMatch?.[1] || '');
    assert.deepEqual(order, ['front-card', 'back-card']);
    assert.match(frontStyle, /z-index:\s*0/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder bring-to-front persists layer order after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<section id="hero" style="position:relative;min-height:320px">',
        '<div id="front-card" style="position:absolute;left:40px;top:40px;width:180px;height:180px;background:#22c55e;z-index:0"></div>',
        '<div id="back-card" style="position:absolute;left:90px;top:90px;width:180px;height:180px;background:#2563eb;z-index:2"></div>',
        '</section>'
      ].join('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#front-card');
    const rect = await frame.$eval('#front-card', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const front = document.querySelector('#front-card');
      front.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 16, clientY: r.top + 16, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="front"]');
      if (button) button.click();
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      const value = String(input?.value || '');
      const backIndex = value.indexOf('id="back-card"');
      const frontIndex = value.indexOf('id="front-card"');
      return frontIndex >= 0 && backIndex >= 0 && frontIndex > backIndex;
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const order = await renderedFrame.evaluate(() => {
      const hero = document.querySelector('#hero');
      return Array.from(hero?.children || []).map((node) => node.id || node.tagName.toLowerCase());
    });
    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    const frontStyleMatch = savedHtml.match(/<div id="front-card"[^>]*style="([^"]*)"/i);
    const frontStyle = String(frontStyleMatch?.[1] || '');
    assert.deepEqual(order, ['back-card', 'front-card']);
    assert.match(frontStyle, /z-index:\s*[1-9]\d*/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inspector text and style edits persist after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    await frame.click('#headline');
    await page.waitForFunction(() => {
      const wrap = document.querySelector('#trainer-standalone-inspector');
      return wrap && wrap.classList.contains('is-active');
    });
    await page.$eval('#trainer-standalone-text', (el) => {
      el.value = 'Stronger every week';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.$eval('#trainer-standalone-font-size', (el) => {
      el.value = '42';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.$eval('#trainer-standalone-color', (el) => {
      el.value = '#ff0000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await frame.waitForFunction(() => {
      const headline = document.querySelector('#headline');
      const style = headline ? window.getComputedStyle(headline) : null;
      return headline
        && /Stronger every week/i.test(String(headline.textContent || ''))
        && /^42px$/i.test(String(style?.fontSize || ''))
        && /rgb\(255,\s*0,\s*0\)/i.test(String(style?.color || ''));
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      const headline = document.querySelector('#headline');
      const style = headline ? window.getComputedStyle(headline) : null;
      return headline
        && /Stronger every week/i.test(String(headline.textContent || ''))
        && /^42px$/i.test(String(style?.fontSize || ''))
        && /rgb\(255,\s*0,\s*0\)/i.test(String(style?.color || ''));
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /Stronger every week/i);
    assert.match(savedHtml, /font-size:\s*42px/i);
    assert.match(savedHtml, /color:\s*#ff0000|color:\s*rgb\(255,\s*0,\s*0\)/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inspector font family weight and style persist after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    await frame.click('#headline');

    await page.select('#trainer-standalone-family', 'Georgia, serif');
    await page.select('#trainer-standalone-weight', '800');
    await page.select('#trainer-standalone-style', 'italic');

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /font-family:\s*Georgia,\s*serif/i.test(value)
        && /font-weight:\s*800/i.test(value)
        && /font-style:\s*italic/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const styles = await renderedFrame.evaluate(() => {
      const headline = document.querySelector('#headline');
      const style = headline ? window.getComputedStyle(headline) : null;
      return {
        fontFamily: String(style?.fontFamily || ''),
        fontWeight: String(style?.fontWeight || ''),
        fontStyle: String(style?.fontStyle || '')
      };
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /font-family:\s*Georgia,\s*serif/i);
    assert.match(savedHtml, /font-weight:\s*800/i);
    assert.match(savedHtml, /font-style:\s*italic/i);
    assert.match(styles.fontFamily, /Georgia/i);
    assert.equal(styles.fontWeight, '800');
    assert.equal(styles.fontStyle, 'italic');
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder direct inline text edit persists after blur save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1><p id="copy">Original copy</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    await frame.click('#headline');
    await frame.click('#headline', { clickCount: 2 });
    await frame.evaluate(() => {
      const headline = document.querySelector('#headline');
      headline.textContent = 'Edited on the page';
      headline.dispatchEvent(new Event('input', { bubbles: true }));
      headline.blur();
    });

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /Edited on the page/i.test(value) && !/Build strength/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      return /Edited on the page/i.test(String(document.body.innerText || ''));
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /Edited on the page/i);
    assert.doesNotMatch(savedHtml, /Build strength/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inserted shape with inspector color persists after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="shape_circle"]');
      if (button) button.click();
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      return /data-standalone-shape="circle"/i.test(String(input?.value || ''));
    });
    await page.waitForFunction(() => {
      const wrap = document.querySelector('#trainer-standalone-inspector');
      return wrap && wrap.classList.contains('is-active');
    });
    await page.$eval('#trainer-standalone-color', (el) => {
      el.value = '#00ff00';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await frame.waitForFunction(() => {
      const shape = document.querySelector('[data-standalone-shape="circle"]');
      const style = shape ? window.getComputedStyle(shape) : null;
      return shape && /rgb\(0,\s*255,\s*0\)/i.test(String(style?.backgroundColor || ''));
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      const shape = document.querySelector('[data-standalone-shape="circle"]');
      const style = shape ? window.getComputedStyle(shape) : null;
      return shape && /rgb\(0,\s*255,\s*0\)/i.test(String(style?.backgroundColor || ''));
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /data-standalone-shape="circle"/i);
    assert.match(savedHtml, /#00ff00|rgb\(0,\s*255,\s*0\)/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inserted custom polygon persists after point edit save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="shape_custom"]');
      if (button) button.click();
    });

    await frame.waitForSelector('[data-standalone-custom-shape="1"]');
    await frame.evaluate(() => {
      const shape = document.querySelector('[data-standalone-custom-shape="1"]');
      const handle = shape?.querySelector('[data-shape-handle="0"]');
      if (!shape || !handle) return;
      const shapeRect = shape.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const startX = handleRect.left + (handleRect.width / 2);
      const startY = handleRect.top + (handleRect.height / 2);
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX, clientY: startY }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: shapeRect.left + 40, clientY: shapeRect.top + 42 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: shapeRect.left + 40, clientY: shapeRect.top + 42 }));
    });

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /data-standalone-custom-shape="1"/i.test(value)
        && /data-shape-points=/i.test(value);
    });

    const beforeSavePoints = await frame.evaluate(() => {
      const shape = document.querySelector('[data-standalone-custom-shape="1"]');
      return String(shape?.getAttribute('data-shape-points') || '');
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    const afterSavePoints = await renderedFrame.evaluate(() => {
      const shape = document.querySelector('[data-standalone-custom-shape="1"]');
      return String(shape?.getAttribute('data-shape-points') || '');
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /data-standalone-custom-shape="1"/i);
    assert.match(savedHtml, /data-shape-points=/i);
    assert.equal(afterSavePoints, beforeSavePoints);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inserted consultation form persists after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="form"]');
      if (button) button.click();
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      const value = String(input?.value || '');
      return /Book a consultation/i.test(value) && /Request consultation/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      return /Book a consultation/i.test(String(document.body.innerText || ''))
        && /Request consultation/i.test(String(document.body.innerText || ''));
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /Book a consultation/i);
    assert.match(savedHtml, /Request consultation/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inserted custom message persists after inline edit save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="message"]');
      if (button) button.click();
    });

    await frame.waitForFunction(() => {
      return Boolean(document.querySelector('[contenteditable="plaintext-only"]'));
    });
    await frame.evaluate(() => {
      const editable = document.querySelector('[contenteditable="plaintext-only"]');
      editable.textContent = 'Built in the editor';
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      editable.blur();
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      return /Built in the editor/i.test(String(input?.value || ''));
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      return /Built in the editor/i.test(String(document.body.innerText || ''));
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /Built in the editor/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder writes inline text edits into the synced code buffer before blur', async () => {
  const { server, origin } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="message"]');
      if (button) button.click();
    });

    await frame.waitForFunction(() => {
      return Boolean(document.querySelector('[contenteditable="plaintext-only"]'));
    });
    await frame.evaluate(() => {
      const editable = document.querySelector('[contenteditable="plaintext-only"]');
      editable.textContent = 'Live buffer update';
      editable.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      return /Live buffer update/i.test(String(input?.value || ''));
    });

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inserted button persists after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.waitForSelector('#standalone-route-picker');
    await frame.evaluate(() => {
      document.querySelector('button[data-menu-action="button"]')?.click();
      document.querySelector('[data-route-add-toggle="1"]')?.click();
      const hrefInput = document.querySelector('[data-route-url-input="1"]');
      const labelInput = document.querySelector('[data-route-label-input="1"]');
      if (hrefInput) {
        hrefInput.value = 'https://example.com/apply';
        hrefInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (labelInput) {
        labelInput.value = 'Apply now';
        labelInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.querySelector('[data-route-create="1"]')?.click();
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      const value = String(input?.value || '');
      return /Apply now/i.test(value) && /https:\/\/example\.com\/apply/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      const link = Array.from(document.querySelectorAll('a')).find((node) => /Apply now/i.test(String(node.textContent || '')));
      return link && /https:\/\/example\.com\/apply/i.test(String(link.href || ''));
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /Apply now/i);
    assert.match(savedHtml, /https:\/\/example\.com\/apply/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder route picker creates saved same-page buttons that smooth scroll after reload', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero" style="min-height:220px"><h1 id="headline">Build strength</h1></section><section style="height:900px"></section><section id="pricing"><h2>Pricing</h2><p>Plans</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.waitForSelector('#standalone-route-picker');
    await frame.evaluate(() => {
      document.querySelector('button[data-menu-action="button"]')?.click();
    });
    await frame.waitForFunction(() => {
      return Array.from(document.querySelectorAll('[data-route-select]')).some((node) => /Pricing/i.test(String(node.textContent || '')));
    });
    await frame.evaluate(() => {
      const button = Array.from(document.querySelectorAll('[data-route-select]')).find((node) => /Pricing/i.test(String(node.textContent || '')));
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      const value = String(input?.value || '');
      return /Pricing/i.test(value) && /data-standalone-route-href=\"#pricing\"/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      return Array.from(document.querySelectorAll('[data-standalone-route-href],a[href="#pricing"]')).some((node) => /Pricing/i.test(String(node.textContent || '')));
    });
    await renderedFrame.evaluate(() => {
      window.scrollTo(0, 0);
      const cta = Array.from(document.querySelectorAll('[data-standalone-route-href],a[href="#pricing"]')).find((node) => /Pricing/i.test(String(node.textContent || '')));
      cta?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await renderedFrame.waitForFunction(() => {
      return String(window.location.hash || '') === '#pricing'
        && Number(document.getElementById('pricing')?.getBoundingClientRect().top || 9999) < 80;
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /data-standalone-route-href="#pricing"/i);
    assert.match(savedHtml, />Pricing</i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner route with saved code reveals Edit after route loading, then opens the editor with typing and route picker working', async () => {
  const { server, origin } = await startStandaloneOwnerServer({
    initialPublished: true,
    initialCustomCodeHtml: [
      '<section id="hero" style="min-height:220px">',
      '<h1 id="headline">Build strength</h1>',
      '<p>Remote coaching for busy lifters.</p>',
      '</section>',
      '<section style="height:900px"></section>',
      '<section id="pricing"><h2>Pricing</h2><p>Plans</p></section>'
    ].join('')
  });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.classList.contains('trainer-route-loading'));

    const loadingState = await page.evaluate(() => ({
      bodyClass: document.body.className,
      hasEditToggle: Boolean(document.querySelector('#trainer-profile-edit-toggle')),
      shareHtml: document.querySelector('.trainer-profile-share-wrap')?.innerHTML || ''
    }));
    assert.match(loadingState.bodyClass, /trainer-route-loading/);

    await page.waitForFunction(() => !document.body.classList.contains('trainer-route-loading'));
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');

    await page.type('#trainer-page-code-html', '\n<!-- typing check -->');
    const inputState = await page.evaluate(() => ({
      hasInput: Boolean(document.querySelector('#trainer-page-code-html')),
      valueIncludesTyping: String(document.querySelector('#trainer-page-code-html')?.value || '').includes('typing check')
    }));
    assert.equal(inputState.hasInput, true);
    assert.equal(inputState.valueIncludesTyping, true);

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      document.querySelector('#headline')?.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: r.left + 12,
        clientY: r.top + 12,
        button: 2
      }));
    }, rect);
    await frame.waitForFunction(() => {
      const menu = document.querySelector('#standalone-context-menu');
      return Boolean(menu) && getComputedStyle(menu).display !== 'none';
    });
    await frame.evaluate(() => {
      document.querySelector('button[data-menu-action="button"]')?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });
    await frame.waitForFunction(() => {
      const picker = document.querySelector('#standalone-route-picker');
      return Boolean(picker) && getComputedStyle(picker).display !== 'none';
    });
    const routeState = await frame.evaluate(() => ({
      hasPicker: Boolean(document.querySelector('#standalone-route-picker')),
      optionCount: document.querySelectorAll('[data-route-select]').length,
      runtimeError: document.querySelector('#standalone-runtime-error')?.textContent || ''
    }));
    assert.equal(routeState.hasPicker, true);
    assert.equal(routeState.optionCount > 0, true);
    assert.equal(routeState.runtimeError, '');

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inserted image persists after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.on('dialog', async (dialog) => {
      await dialog.accept('https://example.com/coach-image.jpg');
    });

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="image"]');
      if (button) button.click();
    });

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /coach-image\.jpg/i.test(value) && /<img\b/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      const image = document.querySelector('img[src="https://example.com/coach-image.jpg"]');
      return Boolean(image);
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /coach-image\.jpg/i);
    assert.match(savedHtml, /<img\b/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder inserted video persists after save and reload', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.on('dialog', async (dialog) => {
      await dialog.accept('https://example.com/coach-video.mp4');
    });

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#headline');
    const rect = await frame.$eval('#headline', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await frame.evaluate((r) => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.top + 12, button: 2 }));
    }, rect);
    await frame.evaluate(() => {
      const button = document.querySelector('button[data-menu-action="video"]');
      if (button) button.click();
    });

    await page.waitForFunction(() => {
      const value = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return /coach-video\.mp4/i.test(value) && /<video\b/i.test(value);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForFunction(() => {
      const video = document.querySelector('video[src="https://example.com/coach-video.mp4"]');
      return Boolean(video);
    });

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /coach-video\.mp4/i);
    assert.match(savedHtml, /<video\b/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder preview device toggle does not alter saved site code', async () => {
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section id="hero"><h1 id="headline">Build strength</h1></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.evaluate(() => {
      document.querySelector('[data-trainer-preview-device="mobile"]')?.click();
    });
    await page.waitForFunction(() => {
      const preview = document.querySelector('.trainer-builder-setup-preview');
      return preview && preview.classList.contains('is-mobile');
    });
    await page.evaluate(() => {
      document.querySelector('[data-trainer-preview-device="desktop"]')?.click();
    });
    await page.waitForFunction(() => {
      const preview = document.querySelector('.trainer-builder-setup-preview');
      return preview && !preview.classList.contains('is-mobile');
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const renderedFrame = await (await page.$('iframe[data-builder-preview-frame="1"]')).contentFrame();
    await renderedFrame.waitForSelector('#headline');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /id="headline"/i);
    assert.doesNotMatch(savedHtml, /trainer-builder-setup-preview|is-mobile/i);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'public_get'), false);
    assert.equal(getRequestLog().some((entry) => entry.kind === 'versions_get'), false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner builder drops uploaded media into designated placeholder boxes responsively', async () => {
  const { server, origin, getPage } = await startStandaloneOwnerServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('trainer-route-loading'));
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<section id="hero" style="position:relative;min-height:460px;padding:20px">',
        '<div id="photo-box" class="photo-spot" style="width:320px;height:240px;border-radius:18px;background:#e2e8f0"><span>PHOTO SPOT</span></div>',
        '<img id="uploaded-media" src="data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=" alt="Custom image" style="position:absolute;left:12px;top:320px;width:120px;height:90px">',
        '</section>'
      ].join('');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const frame = await (await page.$('iframe[data-standalone-live-preview="1"]')).contentFrame();
    await frame.waitForSelector('#uploaded-media');
    await frame.evaluate(() => {
      const img = document.querySelector('#uploaded-media');
      const box = document.querySelector('#photo-box');
      const imgRect = img.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      const targetX = boxRect.left + (boxRect.width / 2);
      const targetY = boxRect.top + (boxRect.height / 2);
      img.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: imgRect.left + 10, clientY: imgRect.top + 10 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: imgRect.left + 44, clientY: imgRect.top - 36 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: targetX, clientY: targetY }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: targetX, clientY: targetY }));
    });

    await frame.waitForFunction(() => {
      const img = document.querySelector('#uploaded-media');
      return Boolean(img && img.parentElement && img.parentElement.id === 'photo-box');
    });
    const fit = await frame.evaluate(() => {
      const img = document.querySelector('#uploaded-media');
      const box = document.querySelector('#photo-box');
      const imgRect = img.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      const label = box.querySelector('span');
      return {
        parentId: String(img.parentElement?.id || ''),
        objectFit: window.getComputedStyle(img).objectFit,
        widthDelta: Math.abs(imgRect.width - boxRect.width),
        heightDelta: Math.abs(imgRect.height - boxRect.height),
        labelHidden: !label || window.getComputedStyle(label).display === 'none'
      };
    });
    assert.equal(fit.parentId, 'photo-box');
    assert.equal(fit.objectFit, 'cover');
    assert.ok(fit.widthDelta <= 2, `image width should track the box (delta ${fit.widthDelta})`);
    assert.ok(fit.heightDelta <= 2, `image height should track the box (delta ${fit.heightDelta})`);
    assert.equal(fit.labelHidden, true);

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');

    const savedHtml = String(getPage()?.publishedContent?.customCode?.html || '');
    assert.match(savedHtml, /id="photo-box"[^>]*>[\s\S]*?<img[^>]*id="uploaded-media"/i);
    assert.match(savedHtml, /id="uploaded-media"[^>]*data-standalone-media-fit="1"/i);
    assert.doesNotMatch(savedHtml, /data-standalone-drop-target/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone owner settings modal shares the live link, renders a scannable QR code, and renames the site URL', async () => {
  const jsQR = require('jsqr');
  const { server, origin, getPage, getRequestLog } = await startStandaloneOwnerServer({
    initialPublished: true,
    initialCustomCodeHtml: '<section id="hero" style="min-height:220px"><h1 id="headline">Build strength</h1></section>'
  });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('trainer-route-loading'));
    await page.waitForSelector('#trainer-profile-settings-toggle');
    await page.click('#trainer-profile-settings-toggle');
    await page.waitForSelector('#trainer-settings-overlay');

    const liveUrl = await page.$eval('[data-settings-live-url]', (el) => String(el.textContent || '').trim());
    assert.equal(liveUrl, `${origin}/coach/avery`);

    const qrInfo = await page.evaluate((url) => {
      const matrix = window.__trainerQrMatrix(url);
      const canvas = document.querySelector('[data-settings-qr]');
      return {
        matrix,
        canvasPainted: canvas instanceof HTMLCanvasElement && canvas.width > 0
      };
    }, liveUrl);
    assert.equal(qrInfo.canvasPainted, true);
    assert.ok(Array.isArray(qrInfo.matrix) && qrInfo.matrix.length >= 21);
    const scale = 4;
    const quiet = 4;
    const qrSize = qrInfo.matrix.length;
    const pixelSize = (qrSize + (quiet * 2)) * scale;
    const rgba = new Uint8ClampedArray(pixelSize * pixelSize * 4).fill(255);
    for (let y = 0; y < qrSize; y += 1) {
      for (let x = 0; x < qrSize; x += 1) {
        if (!qrInfo.matrix[y][x]) continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const px = ((quiet * scale) + (x * scale) + dx);
            const py = ((quiet * scale) + (y * scale) + dy);
            const offset = ((py * pixelSize) + px) * 4;
            rgba[offset] = 0;
            rgba[offset + 1] = 0;
            rgba[offset + 2] = 0;
          }
        }
      }
    }
    const decoded = jsQR(rgba, pixelSize, pixelSize);
    assert.ok(decoded, 'QR code should decode');
    assert.equal(decoded.data, liveUrl);

    await page.evaluate(() => {
      const input = document.querySelector('[data-settings-slug-input]');
      input.value = 'avery-fit';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('[data-settings-slug-save]');
    await page.waitForFunction(() => {
      const link = document.querySelector('[data-settings-live-url]');
      return link && /\/coach\/avery-fit$/.test(String(link.textContent || '').trim());
    });
    const routedPath = await page.evaluate(() => window.location.pathname);
    assert.equal(routedPath, '/coach/avery-fit');
    assert.equal(getPage().siteSlug, 'avery-fit');

    await page.evaluate(() => {
      const title = document.querySelector('[data-settings-seo-title]');
      title.value = 'Avery Stone - Strength Coaching';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const serpPreview = await page.$eval('[data-settings-serp-title]', (el) => String(el.textContent || '').trim());
    assert.equal(serpPreview, 'Avery Stone - Strength Coaching');
    await page.click('[data-settings-seo-save]');
    await page.waitForFunction(() => {
      const note = document.querySelector('[data-settings-seo-feedback]');
      return note && /saved/i.test(String(note.textContent || ''));
    });
    const seoSave = getRequestLog().filter((entry) => entry.kind === 'save').pop();
    assert.equal(String(seoSave?.payload?.seo?.title || ''), 'Avery Stone - Strength Coaching');

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#trainer-settings-overlay'));

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('standalone editor nav links scroll to sections and warn about missing pages instead of reloading the preview', async () => {
  const { server, origin } = await startStandaloneOwnerServer({
    initialPublished: true,
    initialCustomCodeHtml: [
      '<nav id="site-nav" style="display:flex;gap:16px;padding:16px;background:#0f172a;color:#fff">',
      '<a id="nav-missing" href="/coach/avery/about" style="color:#fff">About</a>',
      '<a id="nav-pricing" href="#pricing" style="color:#fff">Pricing</a>',
      '<a id="nav-top" href="/coach/avery/about" target="_top" style="color:#fff">About _top</a>',
      '</nav>',
      '<section id="hero" style="min-height:900px;padding:40px">Hero</section>',
      '<section id="pricing" style="min-height:600px;padding:40px">Pricing section</section>'
    ].join('')
  });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('trainer-route-loading'));
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('iframe[data-standalone-live-preview="1"]');
    await new Promise((resolve) => setTimeout(resolve, 900));

    const clickPreviewLink = async (selector) => {
      const frameEl = await page.$('iframe[data-standalone-live-preview="1"]');
      const frame = await frameEl.contentFrame();
      await frame.waitForSelector(selector);
      await frame.evaluate((sel) => {
        const link = document.querySelector(sel);
        const rect = link.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, clientX: rect.left + (rect.width / 2), clientY: rect.top + (rect.height / 2) };
        link.dispatchEvent(new MouseEvent('mousedown', opts));
        link.dispatchEvent(new MouseEvent('mouseup', opts));
        link.dispatchEvent(new MouseEvent('click', opts));
      }, selector);
      return frame;
    };

    // Hash link scrolls the preview to the section without navigating anything.
    const scrolledFrame = await clickPreviewLink('#nav-pricing');
    await scrolledFrame.waitForFunction(() => (window.scrollY || 0) > 300);
    let state = await page.evaluate(() => ({
      path: window.location.pathname,
      editing: Boolean(document.querySelector('#trainer-page-code-html')),
      unavailable: /has not published a page yet/i.test(document.body.innerText || '')
    }));
    assert.equal(state.path, '/coach/avery');
    assert.equal(state.editing, true);
    assert.equal(state.unavailable, false);

    // Link to a page that does not exist warns instead of reloading into the
    // logged-out "not published" shell.
    await clickPreviewLink('#nav-missing');
    await page.waitForFunction(() => /have not created a page at \/coach\/avery\/about/i.test(document.body.innerText || ''));
    state = await page.evaluate(() => ({
      path: window.location.pathname,
      editing: Boolean(document.querySelector('#trainer-page-code-html')),
      unavailable: /has not published a page yet/i.test(document.body.innerText || '')
    }));
    assert.equal(state.path, '/coach/avery');
    assert.equal(state.editing, true);
    assert.equal(state.unavailable, false);

    // target="_top" links can no longer yank the whole editor away either.
    await clickPreviewLink('#nav-top');
    await new Promise((resolve) => setTimeout(resolve, 900));
    state = await page.evaluate(() => ({
      path: window.location.pathname,
      editing: Boolean(document.querySelector('#trainer-page-code-html')),
      unavailable: /has not published a page yet/i.test(document.body.innerText || '')
    }));
    assert.equal(state.path, '/coach/avery');
    assert.equal(state.editing, true);
    assert.equal(state.unavailable, false);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });
