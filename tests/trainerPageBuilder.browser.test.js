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
      id: 'page-results',
      siteSlug: 'avery',
      pageSlug: 'results',
      pageName: 'Results',
      navLabel: 'Results',
      navOrder: 1,
      isHome: false,
      isPublished: true
    },
    {
      id: 'page-apply',
      siteSlug: 'avery',
      pageSlug: 'apply',
      pageName: 'Apply',
      navLabel: 'Apply',
      navOrder: 2,
      isHome: false,
      isPublished: true
    },
    {
      id: 'page-book',
      siteSlug: 'avery',
      pageSlug: 'book',
      pageName: 'Book',
      navLabel: 'Book',
      navOrder: 3,
      isHome: false,
      isPublished: true
    }
  ];

  const pagesBySlug = {
    '': {
      id: 'page-home',
      siteSlug: 'avery',
      pageSlug: '',
      pageName: 'Home',
      mode: 'custom_code',
      seo: {
        title: 'Avery Stone Coaching',
        description: 'Published home page for Avery coaching.',
        noIndex: false
      },
      publishedContent: {
        mode: 'custom_code',
        customCode: {
          html: '<section class="home-page"><h1>Avery Stone coaching</h1><p>Remote coaching for busy lifters.</p><a href="/coach/avery/results" data-public-builder-cta="1">See results</a></section>',
          css: '.home-page{padding:32px;background:#fff;color:#10283c}.home-page h1{font-size:clamp(2.4rem,5vw,4.4rem)}',
          javascript: '',
          iframes: [],
          embedScripts: []
        }
      }
    },
    results: {
      id: 'page-results',
      siteSlug: 'avery',
      pageSlug: 'results',
      pageName: 'Results',
      mode: 'custom_code',
      seo: {
        title: 'Avery Stone Results',
        description: 'Published results page.',
        noIndex: false
      },
      draftContent: {
        mode: 'custom_code',
        customCode: {
          html: '<section><h1>Draft should not show</h1></section>',
          css: '',
          javascript: '',
          iframes: [],
          embedScripts: []
        }
      },
      publishedContent: {
        mode: 'custom_code',
        customCode: {
          html: '<section class="results-page"><h1>Real client transformations</h1><p>A published trainer site page.</p><a href="/coach/avery/apply" data-public-builder-cta="1">Start here</a></section>',
          css: '.results-page{padding:32px;background:#fff;color:#10283c}',
          javascript: '',
          iframes: [],
          embedScripts: []
        }
      }
    },
    apply: {
      id: 'page-apply',
      siteSlug: 'avery',
      pageSlug: 'apply',
      pageName: 'Apply',
      mode: 'custom_code',
      seo: {
        title: 'Apply for Coaching | Avery Stone',
        description: 'Published application page for coaching.',
        noIndex: false
      },
      draftContent: {
        mode: 'custom_code',
        customCode: {
          html: '<section><h1>Draft apply headline</h1></section>',
          css: '',
          javascript: '',
          iframes: [],
          embedScripts: []
        }
      },
      publishedContent: {
        mode: 'custom_code',
        customCode: {
          html: '<section class="apply-page"><h1>Apply for coaching</h1><p>Tell us about your goals.</p><a href="/coach/avery/book" data-public-builder-cta="1">Book a consult</a></section>',
          css: '.apply-page{padding:32px;background:#fff;color:#10283c}',
          javascript: '',
          iframes: [],
          embedScripts: []
        }
      }
    },
    book: {
      id: 'page-book',
      siteSlug: 'avery',
      pageSlug: 'book',
      pageName: 'Book',
      mode: 'custom_code',
      seo: {
        title: 'Book With Avery Stone',
        description: 'Published booking page.',
        noIndex: false
      },
      publishedContent: {
        mode: 'custom_code',
        customCode: {
          html: '<section class="custom-booking"><h1>Book a consult</h1><p>Pick your slot.</p><div id="sandbox-status">pending</div></section>',
          css: '.custom-booking{padding:24px;background:#fff;color:#111827}',
          javascript: `
            window.customBookingReady = true;
            const statusEl = document.getElementById('sandbox-status');
            try {
              parent.document.body.setAttribute('data-parent-touched', '1');
              if (statusEl) statusEl.textContent = 'parent-access-allowed';
              document.body.setAttribute('data-sandbox-parent', 'allowed');
            } catch (err) {
              if (statusEl) statusEl.textContent = 'parent-access-blocked';
              document.body.setAttribute('data-sandbox-parent', 'blocked');
              document.body.setAttribute('data-sandbox-error', String(err && err.name ? err.name : 'Error'));
            }
            try {
              const value = localStorage.getItem('ode_test_auth');
              document.body.setAttribute('data-sandbox-storage', value ? 'readable' : 'empty');
            } catch (err) {
              document.body.setAttribute('data-sandbox-storage', 'blocked');
              document.body.setAttribute('data-sandbox-storage-error', String(err && err.name ? err.name : 'Error'));
            }
            try {
              document.body.setAttribute('data-sandbox-cookie', document.cookie ? 'present' : 'empty');
            } catch (err) {
              document.body.setAttribute('data-sandbox-cookie', 'blocked');
              document.body.setAttribute('data-sandbox-cookie-error', String(err && err.name ? err.name : 'Error'));
            }
          `,
          iframes: [],
          embedScripts: []
        }
      }
    }
  };

  return { trainer, navigation, pagesBySlug };
}

async function startFixtureServer({
  qualificationEnabled = false,
  publicApiDelayMs = 0,
  publicApiStatus = 200,
  trainersOverride = null,
  authUser = null,
  mutateFixture = null
} = {}) {
  const fixture = buildFixture();
  if (typeof mutateFixture === 'function') mutateFixture(fixture);
  const jsTrainerProfile = readFile(path.join('js', 'trainer-profile.js'));
  const externalShield = readFile(path.join('js', 'external-keydown-shield.js'));
  const shell = Buffer.from(trainerProfileShell(), 'utf8');

  const server = http.createServer((req, res) => {
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
      res.end(JSON.stringify({ ok: true, user: authUser }));
      return;
    }
    if (url.pathname === '/api/auth/trainers') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, trainers: Array.isArray(trainersOverride) ? trainersOverride : [fixture.trainer] }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      const siteSlug = String(url.searchParams.get('siteSlug') || '').trim().toLowerCase();
      const pageSlug = String(url.searchParams.get('pageSlug') || '').trim().toLowerCase();
      const page = siteSlug === 'avery' ? fixture.pagesBySlug[pageSlug] : null;
      if (publicApiStatus >= 500) {
        res.writeHead(publicApiStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'DB_UNAVAILABLE', message: 'Service temporarily unavailable. Try again.' }));
        return;
      }
      if (publicApiDelayMs > 0) {
        setTimeout(() => {
          if (res.writableEnded || res.destroyed) return;
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
              enabled: qualificationEnabled,
              questions: qualificationEnabled ? [
                { id: 'gender', label: 'Gender', type: 'radio', required: true, options: ['Female', 'Male', 'Other'] },
                { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' },
                { id: 'name_and_phone', label: 'Name and phone', type: 'contact', required: true, fields: ['full_name', 'phone'] }
              ] : []
            }
          }));
        }, publicApiDelayMs);
        return;
      }
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
          enabled: qualificationEnabled,
          questions: qualificationEnabled ? [
            { id: 'gender', label: 'Gender', type: 'radio', required: true, options: ['Female', 'Male', 'Other'] },
            { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' },
            { id: 'name_and_phone', label: 'Name and phone', type: 'contact', required: true, fields: ['full_name', 'phone'] }
          ] : []
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
          qualification: {
            enabled: qualificationEnabled
          },
          publicPage: {
            pageId: 'page-apply',
            siteSlug: 'avery',
            pageSlug: 'apply'
          }
        }));
      });
      return;
    }
    if (url.pathname === '/api/coach/pages/lead') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, lead: { id: 'lead-1' }, automation: {} }));
      return;
    }
    if (url.pathname === '/api/coach/pages/event') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, automation: {} }));
      return;
    }
    if (url.pathname.startsWith('/coach/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shell);
      return;
    }
    if (url.pathname === '/' || url.pathname === '/trainer-profile.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shell);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return { server, origin };
}

async function startEditorFixtureServer({ pages = null } = {}) {
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
      res.end(JSON.stringify({ ok: true, pages: Array.isArray(pages) ? pages : [] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/pages' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      const savedPage = {
        id: String(payload.id || 'page-new').trim() || 'page-new',
        siteSlug: payload.siteSlug || 'avery',
        pageSlug: payload.pageSlug || '',
        pageName: payload.pageName || 'Home',
        navLabel: payload.navLabel || payload.pageName || 'Home',
        navOrder: Number(payload.navOrder || 0) || 0,
        mode: payload.mode || payload?.draftContent?.mode || 'custom_code',
        isHome: payload.isHome !== false,
        isPublished: false,
        draftContent: payload.draftContent || {},
        publishedContent: {},
        seo: payload.seo || {},
        settings: payload.settings || {}
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: savedPage, pages: [savedPage] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/versions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, versions: [] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/publish' || url.pathname === '/api/auth/trainer/page/unpublish' || url.pathname === '/api/auth/trainer/page/version/restore') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: null, pages: [] }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/trainer-profile.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shell);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return { server, origin };
}

async function startNonOwnerViewerServer() {
  const trainer = {
    id: 'trainer-1',
    username: 'avery',
    displayName: 'Avery Stone',
    fullName: 'Avery Stone',
    publicHandle: 'avery',
    brandPositioning: 'Remote coaching for busy lifters'
  };
  const viewer = {
    id: 'viewer-2',
    username: 'jamie',
    displayName: 'Jamie Viewer',
    publicHandle: 'jamie'
  };
  const jsTrainerProfile = readFile(path.join('js', 'trainer-profile.js'));
  const externalShield = readFile(path.join('js', 'external-keydown-shield.js'));
  const shell = Buffer.from(trainerProfileShell(), 'utf8');

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
    if (url.pathname === '/api/auth/trainer/pages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, pages: [] }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/trainer-profile.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(shell);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return { server, origin };
}

async function startPublicNonOwnerFixtureServer() {
  const fixture = buildFixture();
  const viewer = {
    id: 'viewer-2',
    username: 'jamie',
    displayName: 'Jamie Viewer',
    publicHandle: 'jamie'
  };
  const jsTrainerProfile = readFile(path.join('js', 'trainer-profile.js'));
  const externalShield = readFile(path.join('js', 'external-keydown-shield.js'));
  const shell = Buffer.from(trainerProfileShell(), 'utf8');

  const server = http.createServer((req, res) => {
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
      res.end(JSON.stringify({ ok: true, trainers: [fixture.trainer] }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      const siteSlug = String(url.searchParams.get('siteSlug') || '').trim().toLowerCase();
      const pageSlug = String(url.searchParams.get('pageSlug') || '').trim().toLowerCase();
      if (siteSlug === 'avery' && pageSlug === 'draft-only') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        return;
      }
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
        navigation: fixture.navigation
      }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/pages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, pages: [] }));
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
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return { server, origin };
}

async function startPublicInteractionServer() {
  const fixture = buildFixture();
  const jsTrainerProfile = readFile(path.join('js', 'trainer-profile.js'));
  const externalShield = readFile(path.join('js', 'external-keydown-shield.js'));
  const shell = Buffer.from(trainerProfileShell(), 'utf8');
  const leadRequests = [];
  const eventRequests = [];

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
        navigation: fixture.navigation
      }));
      return;
    }
    if (url.pathname === '/api/coach/pages/event' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      eventRequests.push(JSON.parse(JSON.stringify(payload)));
      const redirectTarget = String(payload.eventType || '').trim() === 'button_clicked'
        ? '/coach/avery/apply?from=cta'
        : '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, automation: { redirectTarget } }));
      return;
    }
    if (url.pathname === '/api/coach/pages/lead' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      leadRequests.push(JSON.parse(JSON.stringify(payload)));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, lead: { id: 'lead-1' }, automation: { redirectTarget: '/coach/avery/book' } }));
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
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    server,
    origin,
    getLeadRequests: () => JSON.parse(JSON.stringify(leadRequests)),
    getEventRequests: () => JSON.parse(JSON.stringify(eventRequests))
  };
}

async function startStatefulEditorLifecycleServer() {
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

  let versionSeq = 0;
  const requestLog = [];
  const pageRecord = {
    id: 'page-home',
    siteSlug: 'avery',
    pageSlug: '',
    pageName: 'Home',
    navLabel: 'Home',
    navOrder: 0,
    mode: '',
    isHome: true,
    isPublished: false,
    draftContent: {
      mode: '',
      templateKey: 'legacy_landing_page',
      theme: {},
      blocks: [],
      forms: [],
      automations: { nodes: [], edges: [] },
      customCode: { html: '', css: '', javascript: '', iframes: [], embedScripts: [] }
    },
    publishedContent: {},
    seo: {},
    settings: {}
  };
  const versions = [];

  const normalizePage = (raw = {}) => ({
    id: String(raw.id || pageRecord.id).trim() || pageRecord.id,
    siteSlug: String(raw.siteSlug || pageRecord.siteSlug).trim() || 'avery',
    pageSlug: (() => {
      const requestedHome = raw.isHome === true || !String(raw.pageSlug ?? pageRecord.pageSlug).trim();
      return requestedHome ? '' : String(raw.pageSlug ?? pageRecord.pageSlug).trim();
    })(),
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

  const snapshotFromPage = (versionKind) => ({
    id: `version-${++versionSeq}`,
    pageId: pageRecord.id,
    versionKind,
    createdAt: new Date(Date.UTC(2026, 5, 16, 0, 0, versionSeq)).toISOString(),
    snapshot: JSON.parse(JSON.stringify(pageRecord))
  });

  const clonePage = () => JSON.parse(JSON.stringify(pageRecord));
  const cloneVersions = () => versions.map((entry) => ({
    id: entry.id,
    pageId: entry.pageId,
    versionKind: entry.versionKind,
    createdAt: entry.createdAt,
    snapshot: JSON.parse(JSON.stringify(entry.snapshot))
  }));

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
      requestLog.push({
        kind: 'save',
        autosave: payload.autosave === true,
        payload: JSON.parse(JSON.stringify(payload))
      });
      const nextPage = normalizePage(payload);
      Object.assign(pageRecord, nextPage);
      versions.unshift(snapshotFromPage(payload.autosave === true ? 'autosave' : 'manual_save'));
      if (payload.publish === true && payload.autosave !== true) {
        pageRecord.isPublished = true;
        pageRecord.publishedContent = JSON.parse(JSON.stringify(pageRecord.draftContent || {}));
        versions.unshift(snapshotFromPage('publish'));
        requestLog.push({ kind: 'publish', via: 'save' });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: clonePage(), pages: [clonePage()] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/versions') {
      requestLog.push({ kind: 'versions_get' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, versions: cloneVersions() }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/publish' && req.method === 'POST') {
      requestLog.push({ kind: 'publish' });
      pageRecord.isPublished = true;
      pageRecord.publishedContent = JSON.parse(JSON.stringify(pageRecord.draftContent || {}));
      versions.unshift(snapshotFromPage('publish'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: clonePage(), pages: [clonePage()] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/unpublish' && req.method === 'POST') {
      requestLog.push({ kind: 'unpublish' });
      pageRecord.isPublished = false;
      versions.unshift(snapshotFromPage('unpublish'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: clonePage(), pages: [clonePage()] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/version/restore' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      const versionId = String(payload.versionId || '').trim();
      const target = versions.find((entry) => entry.id === versionId) || null;
      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Version not found' }));
        return;
      }
      requestLog.push({ kind: 'restore', versionId });
      Object.assign(pageRecord, JSON.parse(JSON.stringify(target.snapshot)));
      versions.unshift(snapshotFromPage('restore'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: clonePage(), pages: [clonePage()], versions: cloneVersions() }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      requestLog.push({
        kind: 'public_get',
        siteSlug: String(url.searchParams.get('siteSlug') || ''),
        pageSlug: String(url.searchParams.get('pageSlug') || '')
      });
      const siteSlug = String(url.searchParams.get('siteSlug') || '').trim().toLowerCase();
      const pageSlug = String(url.searchParams.get('pageSlug') || '').trim().toLowerCase();
      if (!pageRecord.isPublished || siteSlug !== String(pageRecord.siteSlug || '').trim().toLowerCase() || pageSlug !== String(pageRecord.pageSlug || '').trim().toLowerCase()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        trainer,
        page: clonePage(),
        navigation: [clonePage()]
      }));
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
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    server,
    origin,
    getRequestLog: () => JSON.parse(JSON.stringify(requestLog)),
    getVersions: cloneVersions,
    getPage: clonePage
  };
}

async function startMultiPageNavigationServer() {
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

  let pageSeq = 1;
  const pages = [{
    id: 'page-home',
    siteSlug: 'avery',
    pageSlug: '',
    pageName: 'Home',
    navLabel: 'Home',
    navOrder: 0,
    mode: 'template',
    isHome: true,
    isPublished: true,
    draftContent: {
      mode: 'template',
      templateKey: 'legacy_landing_page',
      theme: {
        headline: 'Avery Stone coaching',
        subheadline: 'Remote coaching for busy lifters.',
        body: 'Start here.'
      },
      blocks: [],
      forms: [],
      automations: { nodes: [], edges: [] },
      customCode: { html: '', css: '', javascript: '', iframes: [], embedScripts: [] }
    },
    publishedContent: {
      mode: 'template',
      templateKey: 'legacy_landing_page',
      theme: {
        headline: 'Avery Stone coaching',
        subheadline: 'Remote coaching for busy lifters.',
        body: 'Start here.'
      }
    },
    seo: {},
    settings: {}
  }];

  const normalizePage = (raw = {}, fallback = {}) => {
    const requestedHome = raw.isHome === true || !String(raw.pageSlug ?? fallback.pageSlug ?? '').trim();
    return {
      id: String(raw.id || fallback.id || `page-${++pageSeq}`).trim() || `page-${pageSeq}`,
      siteSlug: String(raw.siteSlug || fallback.siteSlug || 'avery').trim() || 'avery',
      pageSlug: requestedHome ? '' : String(raw.pageSlug ?? fallback.pageSlug ?? '').trim(),
      pageName: String(raw.pageName || fallback.pageName || 'Home').trim() || 'Home',
      navLabel: String(raw.navLabel || raw.pageName || fallback.navLabel || 'Home').trim() || 'Home',
      navOrder: Number.isFinite(Number(raw.navOrder)) ? Number(raw.navOrder) : Number(fallback.navOrder || 0),
      mode: String(raw.mode || raw?.draftContent?.mode || fallback.mode || '').trim(),
      isHome: requestedHome,
      isPublished: raw.isPublished === true || fallback.isPublished === true,
      draftContent: raw.draftContent && typeof raw.draftContent === 'object' ? raw.draftContent : (fallback.draftContent || {}),
      publishedContent: raw.publishedContent && typeof raw.publishedContent === 'object' ? raw.publishedContent : (fallback.publishedContent || {}),
      seo: raw.seo && typeof raw.seo === 'object' ? raw.seo : (fallback.seo || {}),
      settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : (fallback.settings || {})
    };
  };

  const clonePages = () => pages.map((page) => JSON.parse(JSON.stringify(page)));

  const publishedNavigation = () => clonePages()
    .filter((page) => page.isPublished)
    .sort((a, b) => {
      const left = Number.isFinite(Number(a.navOrder)) ? Number(a.navOrder) : 0;
      const right = Number.isFinite(Number(b.navOrder)) ? Number(b.navOrder) : 0;
      if (left !== right) return left - right;
      return String(a.pageName || '').localeCompare(String(b.pageName || ''));
    });

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
      res.end(JSON.stringify({ ok: true, pages: clonePages() }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/pages' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      const existingIndex = pages.findIndex((page) => String(page.id || '').trim() === String(payload.id || '').trim());
      const existing = existingIndex >= 0 ? pages[existingIndex] : null;
      const nextPage = normalizePage(payload, existing || {});
      if (existingIndex >= 0) pages[existingIndex] = nextPage;
      else pages.push(nextPage);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: JSON.parse(JSON.stringify(nextPage)), pages: clonePages() }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/versions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, versions: [] }));
      return;
    }
    if (url.pathname === '/api/auth/trainer/page/publish' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      const targetId = String(payload.pageId || '').trim();
      const pageIndex = pages.findIndex((page) => String(page.id || '').trim() === targetId);
      const target = pageIndex >= 0 ? pages[pageIndex] : null;
      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Page not found' }));
        return;
      }
      target.isPublished = true;
      target.publishedContent = JSON.parse(JSON.stringify(target.draftContent || {}));
      pages[pageIndex] = target;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, page: JSON.parse(JSON.stringify(target)), pages: clonePages() }));
      return;
    }
    if (url.pathname === '/api/coach/pages/public') {
      const siteSlug = String(url.searchParams.get('siteSlug') || '').trim().toLowerCase();
      const pageSlug = String(url.searchParams.get('pageSlug') || '').trim().toLowerCase();
      const target = pages.find((page) => (
        page.isPublished
        && String(page.siteSlug || '').trim().toLowerCase() === siteSlug
        && String(page.pageSlug || '').trim().toLowerCase() === pageSlug
      )) || null;
      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        trainer,
        page: JSON.parse(JSON.stringify(target)),
        navigation: publishedNavigation()
      }));
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
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    server,
    origin,
    getPages: clonePages
  };
}

test('browser renders published trainer pages through the custom-code preview lane, including mobile', async () => {
  const { server, origin } = await startFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    const requestUrls = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
    page.on('request', (req) => requestUrls.push(req.url()));

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');

    const homeState = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      srcdoc: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || '',
      hasEditToggle: Boolean(document.querySelector('#trainer-profile-edit-toggle'))
    }));

    assert.equal(homeState.title, 'Avery Stone Coaching');
    assert.equal(homeState.description, 'Published home page for Avery coaching.');
    assert.equal(homeState.canonical, `${origin}/coach/avery`);
    assert.match(homeState.srcdoc, /Avery Stone coaching/);
    assert.doesNotMatch(homeState.srcdoc, /Draft home headline/);
    assert.equal(homeState.hasEditToggle, false);

    await page.goto(`${origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');

    const applyState = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      srcdoc: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || '',
      consultLink: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || ''
    }));

    assert.equal(applyState.title, 'Apply for Coaching | Avery Stone');
    assert.equal(applyState.description, 'Published application page for coaching.');
    assert.equal(applyState.canonical, `${origin}/coach/avery/apply`);
    assert.match(applyState.srcdoc, /Apply for coaching/);
    assert.doesNotMatch(applyState.srcdoc, /Draft apply headline/);
    assert.match(applyState.consultLink, /Book a consult/);

    await page.goto(`${origin}/coach/avery/results`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const resultsState = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      srcdoc: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || ''
    }));
    assert.equal(resultsState.title, 'Avery Stone Results');
    assert.equal(resultsState.description, 'Published results page.');
    assert.equal(resultsState.canonical, `${origin}/coach/avery/results`);
    assert.match(resultsState.srcdoc, /Real client transformations/);
    assert.doesNotMatch(resultsState.srcdoc, /Draft should not show/);

    await page.goto(`${origin}/coach/avery/book`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const customState = await page.evaluate(() => {
      const frame = document.querySelector('.trainer-profile-builder-custom-code iframe');
      return {
        sandbox: frame?.getAttribute('sandbox') || '',
        srcdoc: frame?.getAttribute('srcdoc') || ''
      };
    });
    assert.match(customState.sandbox, /allow-scripts/);
    assert.match(customState.srcdoc, /Content-Security-Policy/);
    assert.match(customState.srcdoc, /Book a consult/);

    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true });
    await mobilePage.goto(`${origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const mobileState = await mobilePage.evaluate(() => ({
      iframePresent: Boolean(document.querySelector('.trainer-profile-builder-custom-code iframe'))
    }));
    assert.equal(mobileState.iframePresent, true);
    await mobilePage.close();

    const privateTrainerEndpointCalls = requestUrls.filter((url) => (
      url.includes('/api/auth/trainer/pages')
      || url.includes('/api/auth/trainer/page')
      || url.includes('/api/auth/trainer/leads')
    ));
    assert.deepEqual(privateTrainerEndpointCalls, []);

    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor exposes the code workspace and mobile preview inside the existing edit flow', async () => {
  const { server, origin } = await startEditorFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');
    const chooserState = await page.evaluate(() => ({
      toolbarText: document.querySelector('#trainer-profile-status')?.innerText || '',
      editorText: document.querySelector('#trainer-profile-hero')?.innerText || '',
      previewTitle: document.querySelector('.trainer-builder-workspace-head h2')?.textContent || ''
    }));

    assert.match(chooserState.toolbarText, /Undo[\s\S]*Redo[\s\S]*Preview[\s\S]*Desktop[\s\S]*Mobile/);
    assert.match(chooserState.editorText, /HTML, CSS, and JavaScript/);
    assert.match(chooserState.previewTitle, /Live page preview/);

    await page.click('#trainer-page-preview');
    await page.click('[data-trainer-preview-device="mobile"]');
    await page.waitForFunction(() => document.body.innerText.includes('Mobile preview'));

    const previewState = await page.evaluate(() => {
      const previewCard = document.querySelector('.trainer-builder-preview-canvas');
      const iframe = document.querySelector('.trainer-builder-preview-canvas .trainer-profile-builder-custom-code iframe');
      return {
        previewTitle: document.querySelector('.trainer-builder-workspace-head h2')?.textContent || '',
        previewWidthStyle: previewCard?.getAttribute('style') || '',
        iframePresent: Boolean(iframe),
        iframeSandbox: iframe?.getAttribute('sandbox') || ''
      };
    });

    assert.match(previewState.previewTitle, /Mobile preview/);
    assert.match(previewState.previewWidthStyle, /width:430px/);
    assert.equal(previewState.iframePresent, true);
    assert.match(previewState.iframeSandbox, /allow-scripts/);

    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor exits back to the rendered trainer page and hides the code workspace', async () => {
  const { server, origin } = await startEditorFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('.trainer-builder-workspace');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForFunction(() => {
      return !document.querySelector('.trainer-builder-workspace')
        && Boolean(document.querySelector('.trainer-profile-builder-custom-code iframe'))
        && /Edit page/i.test(document.querySelector('#trainer-profile-status')?.innerText || '');
    });

    const state = await page.evaluate(() => ({
      hasWorkspace: Boolean(document.querySelector('.trainer-builder-workspace')),
      hasRenderedIframe: Boolean(document.querySelector('.trainer-profile-builder-custom-code iframe')),
      statusText: document.querySelector('#trainer-profile-status')?.innerText || '',
      bodyClass: document.body.className || ''
    }));

    assert.equal(state.hasWorkspace, false);
    assert.equal(state.hasRenderedIframe, true);
    assert.match(state.statusText, /Edit page/);
    assert.doesNotMatch(state.bodyClass, /trainer-builder-editor-page/);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor preloads migrated HTML for legacy builder pages', async () => {
  const legacyPage = {
    id: 'page-legacy',
    siteSlug: 'avery',
    pageSlug: '',
    pageName: 'Home',
    navLabel: 'Home',
    navOrder: 0,
    mode: 'custom_code',
    legacyMode: 'template',
    isHome: true,
    isPublished: true,
    seo: {},
    settings: {},
    draftContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section><h1>Legacy editor headline</h1><p>Legacy editor subheadline</p></section>',
        css: '.legacy-site{color:#10283c}',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    },
    publishedContent: {}
  };
  const { server, origin } = await startEditorFixtureServer({ pages: [legacyPage] });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');

    const state = await page.evaluate(() => ({
      html: String(document.querySelector('#trainer-page-code-html')?.value || ''),
      css: String(document.querySelector('#trainer-page-code-css')?.value || ''),
      helpText: Array.from(document.querySelectorAll('.trainer-profile-editor-help')).map((node) => node.textContent || '').join(' ')
    }));

    assert.match(state.html, /Legacy editor headline/);
    assert.match(state.css, /legacy-site/);
    assert.match(state.helpText, /Build the full trainer website here with HTML/i);
    assert.doesNotMatch(state.helpText, /template/i);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser blank trainer editor keeps the website studio centered on sections and code only', async () => {
  const { server, origin } = await startEditorFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');

    const editorState = await page.evaluate(() => ({
      railText: document.querySelector('.trainer-builder-editor-shell')?.innerText || '',
      toolbarText: document.querySelector('#trainer-profile-status')?.innerText || '',
      hasCodeForm: Boolean(document.querySelector('#trainer-page-code-form')),
      hasMetaForm: Boolean(document.querySelector('#trainer-page-meta-form'))
    }));

    assert.equal(editorState.hasCodeForm, true);
    assert.equal(editorState.hasMetaForm, true);
    assert.match(editorState.railText, /Trainer website studio/i);
    assert.match(editorState.railText, /HTML, CSS, and JavaScript/i);
    assert.match(editorState.railText, /code-first website editor/i);
    assert.doesNotMatch(editorState.railText, /drag\s*drop/i);
    assert.doesNotMatch(editorState.railText, /block library/i);
    assert.doesNotMatch(editorState.railText, /Website structure/i);
    assert.doesNotMatch(editorState.railText, /Theme/i);
    assert.doesNotMatch(editorState.railText, /Leads/i);
    assert.doesNotMatch(editorState.railText, /Automations/i);
    assert.doesNotMatch(editorState.toolbarText, /mode/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor seeds a starter custom-code page for blank editors', async () => {
  const { server, origin } = await startEditorFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');
    const customCodeState = await page.evaluate(() => ({
      htmlValue: document.querySelector('#trainer-page-code-html')?.value || '',
      iframePresent: Boolean(document.querySelector('.trainer-builder-preview-canvas .trainer-profile-builder-custom-code iframe'))
    }));
    assert.match(customCodeState.htmlValue, /Avery Stone/);
    assert.match(customCodeState.htmlValue, /Apply for coaching/);
    assert.equal(customCodeState.iframePresent, true);

    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor stays code-first without section-builder controls', async () => {
  const { server, origin } = await startEditorFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    const state = await page.evaluate(() => ({
      hasSectionList: Boolean(document.querySelector('[data-builder-section-list="1"]')),
      hasAddSection: Boolean(document.querySelector('[data-builder-add-section="1"]')),
      hasInlineCopy: Boolean(document.querySelector('#trainer-builder-inline-copy-form')),
      codeTabs: Array.from(document.querySelectorAll('[data-builder-code-tab]')).map((node) => node.textContent || '').join(' ')
    }));

    assert.equal(state.hasSectionList, false);
    assert.equal(state.hasAddSection, false);
    assert.equal(state.hasInlineCopy, false);
    assert.match(state.codeTabs, /HTML/);
    assert.match(state.codeTabs, /CSS/);
    assert.match(state.codeTabs, /JS/);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor updates the live custom-code preview when the HTML draft changes', async () => {
  const { server, origin } = await startEditorFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      if (!input) return;
      input.value = '<section class="custom-test"><h1>Updated custom page</h1><p>Live preview sync</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const frame = document.querySelector('.trainer-builder-preview-canvas .trainer-profile-builder-custom-code iframe');
      return /Updated custom page/.test(String(frame?.getAttribute('srcdoc') || ''));
    });

    const canvasState = await page.evaluate(() => {
      const frame = document.querySelector('.trainer-builder-preview-canvas .trainer-profile-builder-custom-code iframe');
      return {
        srcdoc: frame?.getAttribute('srcdoc') || '',
        noteText: document.querySelector('#trainer-profile-builder-note')?.textContent || ''
      };
    });

    assert.match(canvasState.srcdoc, /Updated custom page/);
    assert.match(canvasState.srcdoc, /Live preview sync/);
    assert.match(canvasState.noteText, /Unsaved changes|Saved/);

    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor renders seeded iframe and script embeds inside the sandboxed preview', async () => {
  const embedPage = {
    id: 'page-embeds',
    siteSlug: 'avery',
    pageSlug: '',
    pageName: 'Home',
    navLabel: 'Home',
    navOrder: 0,
    mode: 'custom_code',
    isHome: true,
    isPublished: true,
    seo: {},
    settings: {},
    draftContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section><h1>Embed support</h1><p>Calendly and widget scripts.</p></section>',
        css: '',
        javascript: '',
        iframes: [{ src: 'https://calendly.com/avery/demo-call' }],
        embedScripts: [{ src: 'https://widgets.example.com/form.js' }]
      }
    },
    publishedContent: {}
  };
  const { server, origin } = await startEditorFixtureServer({ pages: [embedPage] });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-iframes');

    const previewState = await page.evaluate(() => {
      const frame = document.querySelector('.trainer-builder-preview-canvas .trainer-profile-builder-custom-code iframe');
      const iframeInput = document.querySelector('#trainer-page-code-iframes');
      const embedInput = document.querySelector('#trainer-page-code-embeds');
      return {
        srcdoc: String(frame?.getAttribute('srcdoc') || ''),
        sandbox: String(frame?.getAttribute('sandbox') || ''),
        iframeValue: String(iframeInput?.value || ''),
        embedValue: String(embedInput?.value || '')
      };
    });

    assert.match(previewState.iframeValue, /calendly\.com\/avery\/demo-call/);
    assert.match(previewState.embedValue, /widgets\.example\.com\/form\.js/);
    assert.match(previewState.srcdoc, /calendly\.com\/avery\/demo-call/);
    assert.match(previewState.srcdoc, /widgets\.example\.com\/form\.js/);
    assert.match(previewState.sandbox, /allow-scripts/);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser custom-code preview stays sandboxed away from the parent DOM', async () => {
  const { server, origin } = await startFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
    await page.evaluateOnNewDocument(() => {
      try {
        window.localStorage.setItem('ode_test_auth', 'secret-token');
      } catch {}
      try {
        document.cookie = 'ode_test_cookie=secret-cookie; path=/';
      } catch {}
    });

    await page.goto(`${origin}/coach/avery/book`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const iframeHandle = await page.$('.trainer-profile-builder-custom-code iframe');
    const frame = await iframeHandle.contentFrame();
    assert.ok(frame);
    await frame.waitForSelector('#sandbox-status');

    const sandboxState = await frame.evaluate(() => ({
      bodyFlag: document.body.getAttribute('data-sandbox-parent') || '',
      errorName: document.body.getAttribute('data-sandbox-error') || '',
      statusText: document.getElementById('sandbox-status')?.textContent || '',
      storageState: document.body.getAttribute('data-sandbox-storage') || '',
      storageError: document.body.getAttribute('data-sandbox-storage-error') || '',
      cookieState: document.body.getAttribute('data-sandbox-cookie') || '',
      cookieError: document.body.getAttribute('data-sandbox-cookie-error') || ''
    }));
    const parentTouched = await page.evaluate(() => document.body.getAttribute('data-parent-touched') || '');

    assert.equal(parentTouched, '');
    assert.equal(sandboxState.bodyFlag, 'blocked');
    assert.match(sandboxState.errorName, /SecurityError|TypeError|Error/);
    assert.equal(sandboxState.statusText, 'parent-access-blocked');
    assert.match(sandboxState.storageState, /blocked|empty/);
    if (sandboxState.storageState === 'blocked') {
      assert.match(sandboxState.storageError, /SecurityError|TypeError|Error/);
    }
    assert.match(sandboxState.cookieState, /blocked|empty/);
    if (sandboxState.cookieState === 'blocked') {
      assert.match(sandboxState.cookieError, /SecurityError|TypeError|Error/);
    }
    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser surfaces trainer JavaScript runtime errors inside the sandboxed preview without crashing the page', async () => {
  const { server, origin } = await startFixtureServer({
    mutateFixture: (fixture) => {
      fixture.pagesBySlug.book.publishedContent.customCode.javascript = `
        const statusEl = document.getElementById('sandbox-status');
        if (statusEl) statusEl.textContent = 'running';
        throw new Error('Trainer script exploded');
      `;
    }
  });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/coach/avery/book`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const iframeHandle = await page.$('.trainer-profile-builder-custom-code iframe');
    const frame = await iframeHandle.contentFrame();
    assert.ok(frame);
    await frame.waitForFunction(() => {
      const errorEl = document.querySelector('#builder-runtime-error');
      return Boolean(errorEl && /Trainer script exploded/.test(errorEl.textContent || ''));
    }, { timeout: 12000 });

    const runtimeError = await frame.evaluate(() => document.querySelector('#builder-runtime-error')?.textContent || '');
    const state = await page.evaluate(() => ({
      frameSrcdoc: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || '',
      frameStillMounted: Boolean(document.querySelector('.trainer-profile-builder-custom-code iframe')?.isConnected)
    }));

    assert.equal(state.frameStillMounted, true);
    assert.match(state.frameSrcdoc, /Book a consult/i);
    assert.match(runtimeError, /Trainer script exploded/);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser hides trainer edit controls for a non-owner viewer', async () => {
  const { server, origin } = await startNonOwnerViewerServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');

    const visibilityState = await page.evaluate(() => ({
      editToggle: Boolean(document.querySelector('#trainer-profile-edit-toggle')),
      statusText: document.querySelector('#trainer-profile-status')?.innerText || ''
    }));

    assert.equal(visibilityState.editToggle, false);
    assert.equal(visibilityState.statusText.trim(), '');
    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser serves only published public pages to unrelated viewers with no edit controls or draft leakage', async () => {
  const { server, origin } = await startPublicNonOwnerFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const publicState = await page.evaluate(() => ({
      editToggle: Boolean(document.querySelector('#trainer-profile-edit-toggle')),
      srcdoc: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || ''
    }));

    assert.equal(publicState.editToggle, false);
    assert.match(publicState.srcdoc, /Apply for coaching/);
    assert.doesNotMatch(publicState.srcdoc, /Draft apply headline/);

    await page.goto(`${origin}/coach/avery/draft-only`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Could not load that trainer profile.'));
    const missingState = await page.evaluate(() => ({
      editToggle: Boolean(document.querySelector('#trainer-profile-edit-toggle')),
      statusText: document.querySelector('#trainer-profile-status')?.innerText || ''
    }));

    assert.equal(missingState.editToggle, false);
    assert.match(missingState.statusText, /Could not load that trainer profile\./);
    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser does not fall back to another trainer when a query-param public trainer slug is invalid', async () => {
  const { server, origin } = await startFixtureServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=missing`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.includes('Could not load that trainer profile.'));

    const state = await page.evaluate(() => ({
      statusText: document.querySelector('#trainer-profile-status')?.innerText || '',
      leakedTrainerName: document.body.innerText.includes('Avery Stone'),
      hasUnavailableShell: Boolean(document.querySelector('.trainer-builder-public-shell-unavailable'))
    }));

    assert.match(state.statusText, /Could not load that trainer profile\./);
    assert.equal(state.leakedTrainerName, false);
    assert.equal(state.hasUnavailableShell, false);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser falls back to a visible trainer page when the public page API stalls', async () => {
  const { server, origin } = await startFixtureServer({ publicApiDelayMs: 12000 });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe', { timeout: 12000 });
    const iframeHandle = await page.$('.trainer-profile-builder-custom-code iframe');
    const frame = await iframeHandle.contentFrame();
    assert.ok(frame);
    await frame.waitForFunction(() => {
      const text = document.body?.innerText || '';
      return /apply for coaching|inside this page|real coaching page|legacy page was converted/i.test(text);
    }, { timeout: 12000 });

    const state = await page.evaluate(() => ({
      heroHtmlPresent: Boolean(String(document.querySelector('#trainer-profile-hero')?.innerHTML || '').trim()),
      frameStillMounted: Boolean(document.querySelector('.trainer-profile-builder-custom-code iframe'))
    }));
    const frameText = await frame.evaluate(() => document.body?.innerText || '');

    assert.equal(state.heroHtmlPresent, true);
    assert.equal(state.frameStillMounted, true);
    assert.match(frameText, /Avery Stone/i);
    assert.match(frameText, /Apply for coaching|Inside this page|real coaching page|legacy page was converted/i);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser falls back to a starter public site when the public API is unavailable and the trainer slug is not in the directory list', async () => {
  const { server, origin } = await startFixtureServer({
    qualificationEnabled: true,
    publicApiStatus: 503,
    trainersOverride: []
  });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=jasonodell`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-trainer-qualification="1"]', { timeout: 12000 });

    const gateState = await page.evaluate(() => ({
      statusText: document.querySelector('#trainer-profile-status')?.textContent?.trim() || '',
      gateLabel: document.querySelector('.trainer-qualification-label')?.textContent?.trim() || ''
    }));
    assert.equal(gateState.statusText, '');
    assert.match(gateState.gateLabel, /gender/i);

    await page.click('[data-qualification-radio="gender"][value="Male"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="age"][value="21-30"]');
    await page.click('[data-qualification-radio="age"][value="21-30"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="trainer_gender_preference"][value="No preference"]');
    await page.click('[data-qualification-radio="trainer_gender_preference"][value="No preference"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="session_frequency"][value="Once weekly"]');
    await page.click('[data-qualification-radio="session_frequency"][value="Once weekly"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="exercise_routine"][value="A couple times weekly"]');
    await page.click('[data-qualification-radio="exercise_routine"][value="A couple times weekly"]');
    await page.click('[data-qualification-next]');
    await page.click('[data-qualification-checkbox="goals"][value="Strength"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="motivation"][value="Appearance"]');
    await page.click('[data-qualification-radio="motivation"][value="Appearance"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="open_to_online_training"][value="Yes"]');
    await page.click('[data-qualification-radio="open_to_online_training"][value="Yes"]');
    await page.click('[data-qualification-next]');
    await page.click('[data-qualification-checkbox="preferred_days"][value="Monday"]');
    await page.click('[data-qualification-next]');
    await page.click('[data-qualification-checkbox="preferred_times"][value="Evening"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="start_date"][value="ASAP"]');
    await page.click('[data-qualification-radio="start_date"][value="ASAP"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-text="zip_or_town"]');
    await page.type('[data-qualification-text="zip_or_town"]', '10001');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-text="email"]');
    await page.type('[data-qualification-text="email"]', 'fallback@example.com');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-contact="name_and_phone:full_name"]');
    await page.type('[data-qualification-contact="name_and_phone:full_name"]', 'Fallback Lead');
    await page.type('[data-qualification-contact="name_and_phone:phone"]', '5551234567');
    await page.click('[data-qualification-next]');

    await page.waitForSelector('.trainer-profile-builder-custom-code iframe', { timeout: 12000 });
    const frameSrcdoc = await page.$eval('.trainer-profile-builder-custom-code iframe', (iframe) => iframe.getAttribute('srcdoc') || '');
    assert.match(frameSrcdoc, /Jasonodell|Start your application|Apply for coaching|Inside this page/i);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser public page interactions send page-view and CTA events through the sandboxed trainer code', async () => {
  const { server, origin, getLeadRequests, getEventRequests } = await startPublicInteractionServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/coach/avery/results`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const iframeHandle = await page.$('.trainer-profile-builder-custom-code iframe');
    const resultsFrame = await iframeHandle.contentFrame();
    assert.ok(resultsFrame);
    await resultsFrame.waitForSelector('a[href="/coach/avery/apply"]');
    await resultsFrame.click('a[href="/coach/avery/apply"]');
    await page.waitForFunction(() => window.location.pathname === '/coach/avery/apply');
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');

    const eventRequests = getEventRequests();
    const leadRequests = getLeadRequests();
    assert.ok(eventRequests.some((entry) => entry.eventType === 'page_viewed' && entry.pageSlug === 'results'));
    assert.ok(eventRequests.some((entry) => entry.eventType === 'button_clicked' && entry.pageSlug === 'results'));
    assert.equal(leadRequests.length, 0);
    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor runs autosave, undo redo, save, publish, unpublish, and version restore through the existing page flow', async () => {
  const { server, origin, getRequestLog, getVersions, getPage } = await startStatefulEditorLifecycleServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');
    const initialCustomCodeHtml = await page.$eval('#trainer-page-code-html', (node) => String(node.value || ''));

    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section><h1>Alpha plan</h1><p>First draft</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const note = document.querySelector('#trainer-profile-builder-note');
      return note && /Unsaved changes/.test(note.textContent || '');
    });

    await page.evaluate(() => {
      const button = document.querySelector('#trainer-page-undo');
      if (button) button.click();
    });
    await page.waitForFunction((expectedValue) => {
      const input = document.querySelector('#trainer-page-code-html');
      return input && String(input.value || '') === String(expectedValue || '');
    }, {}, initialCustomCodeHtml);
    await page.evaluate(() => {
      const button = document.querySelector('#trainer-page-redo');
      if (button) button.click();
    });
    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      return input && /Alpha plan/.test(String(input.value || ''));
    });

    await page.waitForFunction(() => {
      const note = document.querySelector('#trainer-profile-builder-note');
      return note && /Saved/.test(note.textContent || '');
    }, { timeout: 6000 });

    await page.evaluate(() => {
      const button = document.querySelector('#trainer-profile-edit-save');
      if (button) button.click();
    });
    await page.waitForFunction(() => {
      const note = document.querySelector('#trainer-profile-builder-note');
      return note && /Saved/.test(note.textContent || '');
    });

    await page.evaluate(() => {
      const button = document.querySelector('#trainer-page-publish');
      if (button) button.click();
    });
    await page.waitForSelector('#trainer-page-unpublish');
    await page.waitForFunction(() => /Published/i.test(JSON.stringify(window.__trainerProfileViewer || {})) === false);

    await page.evaluate(() => {
      const button = document.querySelector('#trainer-page-unpublish');
      if (button) button.click();
    });
    await page.waitForFunction(() => !document.querySelector('#trainer-page-unpublish'));

    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section><h1>Beta plan</h1><p>Second draft</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      return input && /Beta plan/.test(String(input.value || ''));
    });
    await page.evaluate(() => {
      const button = document.querySelector('#trainer-profile-edit-save');
      if (button) button.click();
    });
    await page.waitForFunction(() => {
      const note = document.querySelector('#trainer-profile-builder-note');
      return note && /Saved/.test(note.textContent || '');
    });
    const alphaRestoreVersion = getVersions().find((entry) => (
      entry.versionKind === 'manual_save'
      && /Alpha plan/.test(String(entry?.snapshot?.draftContent?.customCode?.html || ''))
      && !/Beta plan/.test(String(entry?.snapshot?.draftContent?.customCode?.html || ''))
    ));
    assert.ok(alphaRestoreVersion);

    await page.evaluate(() => {
      const button = document.querySelector('#trainer-profile-edit-toggle');
      if (button) button.click();
    });
    await page.waitForFunction(() => {
      const button = document.querySelector('#trainer-profile-edit-toggle');
      return button && /Edit page/i.test(button.textContent || '');
    });
    await page.evaluate(() => {
      const button = document.querySelector('#trainer-profile-edit-toggle');
      if (button) button.click();
    });
    await page.waitForSelector('#trainer-page-code-html');
    assert.ok(getRequestLog().filter((entry) => entry.kind === 'versions_get').length >= 2);
    const versionPanelState = await page.evaluate(() => ({
      hasRestoreButton: Boolean(document.querySelector('[data-builder-version-restore]')),
      heroText: document.querySelector('#trainer-profile-hero')?.innerText || '',
      bodyText: document.body.innerText || ''
    }));
    assert.equal(versionPanelState.hasRestoreButton, true);
    await page.waitForSelector('[data-builder-version-restore]');
    const renderedVersionIds = await page.$$eval('[data-builder-version-restore]', (nodes) => nodes.map((node) => node.getAttribute('data-builder-version-restore') || ''));
    assert.ok(renderedVersionIds.length > 0);
    assert.ok(renderedVersionIds.includes(alphaRestoreVersion.id));
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('[data-builder-version-restore]'));
      const button = buttons[buttons.length - 1];
      if (button) button.click();
    });
    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      return input && /Alpha plan/.test(String(input.value || '')) && !/Beta plan/.test(String(input.value || ''));
    });

    const requestLog = getRequestLog();
    const saveKinds = requestLog.filter((entry) => entry.kind === 'save');
    assert.ok(saveKinds.some((entry) => entry.autosave === true));
    assert.ok(saveKinds.some((entry) => entry.autosave === false));
    assert.ok(requestLog.some((entry) => entry.kind === 'publish'));
    assert.ok(requestLog.some((entry) => entry.kind === 'unpublish'));
    assert.ok(requestLog.some((entry) => entry.kind === 'restore'));

    const versionKinds = getVersions().map((entry) => entry.versionKind);
    assert.ok(versionKinds.includes('autosave'));
    assert.ok(versionKinds.includes('manual_save'));
    assert.ok(versionKinds.includes('publish'));
    assert.ok(versionKinds.includes('unpublish'));
    assert.ok(versionKinds.includes('restore'));

    const finalPage = getPage();
    assert.match(String(finalPage?.draftContent?.customCode?.html || ''), /Alpha plan/);
    assert.doesNotMatch(String(finalPage?.draftContent?.customCode?.html || ''), /Beta plan/);

    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor restores autosaved custom code after a reload', async () => {
  const { server, origin, getPage } = await startStatefulEditorLifecycleServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');

    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = '<section><h1>Reload plan</h1><p>Autosaved before refresh.</p></section>';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForFunction(() => {
      const note = document.querySelector('#trainer-profile-builder-note');
      return note && /Saved/.test(note.textContent || '');
    }, { timeout: 6000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForFunction(() => {
      const input = document.querySelector('#trainer-page-code-html');
      return input && /Reload plan/.test(String(input.value || ''));
    });

    assert.match(String(getPage()?.draftContent?.customCode?.html || ''), /Reload plan/);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser standalone owner route shows the bottom code dock, runs combined html css js live, syncs drag edits, and switches from Done to Edit after save', async () => {
  const { server, origin, getPage, getRequestLog } = await startStatefulEditorLifecycleServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/coach/avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-code-html');
    await page.waitForSelector('[data-standalone-done]');

    const initialState = await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      const doneButton = document.querySelector('[data-standalone-done]');
      const back = document.querySelector('.trainer-profile-back');
      const inputRect = input ? input.getBoundingClientRect() : null;
      return {
        backText: back?.textContent || '',
        hasDone: Boolean(doneButton),
        hasEdit: Boolean(document.querySelector('#trainer-profile-edit-toggle')),
        placeholder: input?.getAttribute('placeholder') || '',
        position: input ? window.getComputedStyle(input.parentElement).position : '',
        dockBottom: inputRect ? Math.round(window.innerHeight - inputRect.bottom) : null,
        dockWidth: inputRect ? Math.round(inputRect.width) : 0,
        viewportWidth: window.innerWidth
      };
    });

    assert.equal(initialState.backText, 'Back to coaches');
    assert.equal(initialState.hasDone, true);
    assert.equal(initialState.hasEdit, false);
    assert.equal(initialState.placeholder, 'Paste your custom website code here...');
    assert.equal(initialState.position, 'fixed');
    assert.ok(initialState.dockBottom <= 24);
    assert.ok(initialState.dockWidth >= initialState.viewportWidth - 64);

    await page.evaluate(() => {
      const input = document.querySelector('#trainer-page-code-html');
      input.value = [
        '<style>',
        'body{margin:0;background:#fff}',
        '#headline{color:rgb(220,38,38);position:relative}',
        '</style>',
        '<h1 id="headline">Build strength</h1>',
        '<script>',
        'document.getElementById("headline").dataset.boot="1";',
        '</script>'
      ].join('\n');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForSelector('iframe[data-standalone-live-preview="1"]');
    const iframeHandle = await page.$('iframe[data-standalone-live-preview="1"]');
    const previewFrame = await iframeHandle.contentFrame();
    assert.ok(previewFrame);
    await previewFrame.waitForFunction(() => {
      const headline = document.querySelector('#headline');
      if (!headline) return false;
      const style = window.getComputedStyle(headline);
      return headline.textContent === 'Build strength'
        && headline.dataset.boot === '1'
        && /220,\s*38,\s*38/.test(style.color || '');
    });

    await previewFrame.evaluate(() => {
      const headline = document.querySelector('#headline');
      headline.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 72, clientY: 64 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 72, clientY: 64 }));
    });

    await page.waitForFunction(() => {
      const inspector = document.querySelector('#trainer-standalone-inspector');
      const textInput = document.querySelector('#trainer-standalone-text');
      const code = String(document.querySelector('#trainer-page-code-html')?.value || '');
      return inspector?.classList.contains('is-active')
        && String(textInput?.value || '') === 'Build strength'
        && /left:\s*52px/i.test(code)
        && /top:\s*44px/i.test(code);
    });

    await page.click('[data-standalone-done]');
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.waitForFunction(() => !document.querySelector('#trainer-page-code-html'));
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');

    const savedState = await page.evaluate(() => ({
      editText: document.querySelector('#trainer-profile-edit-toggle')?.textContent || '',
      backText: document.querySelector('.trainer-profile-back')?.textContent || '',
      hasTextarea: Boolean(document.querySelector('#trainer-page-code-html')),
      hasDone: Boolean(document.querySelector('[data-standalone-done]')),
      bodyClass: document.body.className,
      renderedSrcdoc: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || ''
    }));

    assert.equal(savedState.editText, 'Edit');
    assert.equal(savedState.backText, 'Back to coaches');
    assert.equal(savedState.hasTextarea, false);
    assert.equal(savedState.hasDone, false);
    assert.match(savedState.bodyClass, /trainer-public-standalone-route/);
    assert.match(savedState.renderedSrcdoc, /Build strength/);

    const savedPage = getPage();
    assert.equal(savedPage.isPublished, true);
    assert.match(String(savedPage?.publishedContent?.customCode?.html || ''), /Build strength/);
    assert.match(String(savedPage?.publishedContent?.customCode?.html || ''), /left:\s*52px/i);

    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');
    const editedCode = await page.$eval('#trainer-page-code-html', (node) => String(node.value || ''));
    assert.match(editedCode, /Build strength/);
    assert.match(editedCode, /left:\s*52px/i);
    assert.match(editedCode, /top:\s*44px/i);

    const requestLog = getRequestLog();
    assert.equal(requestLog.some((entry) => entry.kind === 'public_get'), false);

    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor publishes edited site slug, page slug, and nav label to the public route', async () => {
  const { server, origin, getPage } = await startStatefulEditorLifecycleServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-profile-edit-toggle');
    await page.click('#trainer-profile-edit-toggle');
    await page.waitForSelector('#trainer-page-code-html');

    await page.evaluate(() => {
      const setValue = (selector, value) => {
        const input = document.querySelector(selector);
        if (!input) return;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue('#trainer-page-name', 'VIP Intake');
      setValue('#trainer-page-nav-label', 'VIP Intake');
      setValue('#trainer-page-site-slug', 'avery-stone-fit');
      setValue('#trainer-page-slug', 'vip-intake');
      const homeSelect = document.querySelector('#trainer-page-is-home');
      if (homeSelect) {
        homeSelect.value = 'false';
        homeSelect.dispatchEvent(new Event('input', { bubbles: true }));
      }
      setValue('#trainer-page-code-html', '<section><h1>VIP Coaching Intake</h1><p>Apply for a premium coaching slot.</p></section>');
    });

    await page.evaluate(() => {
      document.querySelector('#trainer-profile-edit-save')?.click();
    });
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#trainer-profile-builder-note')?.textContent || ''));
    await page.evaluate(() => {
      document.querySelector('#trainer-page-publish')?.click();
    });
    await page.waitForSelector('#trainer-page-unpublish');

    const savedPage = getPage();
    assert.equal(savedPage.siteSlug, 'avery-stone-fit');
    assert.equal(savedPage.pageSlug, 'vip-intake');
    assert.equal(savedPage.navLabel, 'VIP Intake');
    assert.equal(savedPage.isPublished, true);

    await page.goto(`${origin}/coach/avery-stone-fit/vip-intake`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const publicState = await page.evaluate(() => ({
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      srcdoc: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || '',
      hasEditButton: Boolean(document.querySelector('#trainer-profile-edit-toggle'))
    }));

    assert.match(publicState.srcdoc, /VIP Coaching Intake/);
    assert.equal(publicState.canonical, `${origin}/coach/avery-stone-fit/vip-intake`);
    assert.equal(publicState.hasEditButton, true);
    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser trainer editor creates an additional page and public navigation reflects both published pages', async () => {
  const { server, origin, getPages } = await startMultiPageNavigationServer();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#trainer-page-new');
    await page.click('#trainer-page-new');
    await page.waitForSelector('#trainer-page-code-html');
    await page.evaluate(() => {
      const setValue = (selector, value) => {
        const input = document.querySelector(selector);
        if (!input) return;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue('#trainer-page-name', 'VIP Intake');
      setValue('#trainer-page-nav-label', 'VIP Intake');
      setValue('#trainer-page-slug', 'vip-intake');
      const homeSelect = document.querySelector('#trainer-page-is-home');
      if (homeSelect) {
        homeSelect.value = 'false';
        homeSelect.dispatchEvent(new Event('input', { bubbles: true }));
      }
      setValue('#trainer-page-code-html', '<section><h1>VIP Coaching Intake</h1><p>Apply for a premium coaching slot.</p></section>');
    });

    await page.evaluate(() => {
      document.querySelector('#trainer-profile-edit-save')?.click();
    });
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#trainer-profile-builder-note')?.textContent || ''));
    await page.waitForFunction(() => {
      const select = document.querySelector('#trainer-page-select');
      return select && select.options.length === 2;
    });
    await page.evaluate(() => {
      document.querySelector('#trainer-page-publish')?.click();
    });
    await page.waitForSelector('#trainer-page-unpublish');

    const pages = getPages();
    assert.equal(pages.length, 2);
    assert.ok(pages.some((entry) => entry.pageSlug === 'vip-intake' && entry.isPublished));

    await page.goto(`${origin}/coach/avery/vip-intake`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const publicState = await page.evaluate(() => ({
      srcdoc: document.querySelector('.trainer-profile-builder-custom-code iframe')?.getAttribute('srcdoc') || '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
    }));

    assert.match(publicState.srcdoc, /VIP Coaching Intake/);
    assert.equal(publicState.canonical, `${origin}/coach/avery/vip-intake`);
    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser public trainer pages require qualification before reveal and remember completed visitors', async () => {
  const { server, origin } = await startFixtureServer({ qualificationEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
    });
    await page.goto(`${origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-trainer-qualification="1"]');

    const gatedState = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('[data-trainer-qualification="1"]')),
      bodyText: document.body.innerText || ''
    }));
    assert.equal(gatedState.hasModal, true);

    await page.click('[data-qualification-radio="gender"][value="Male"]');
    await page.evaluate(() => document.querySelector('[data-qualification-next]')?.click());
    await page.waitForSelector('[data-qualification-text="email"]');
    await page.waitForFunction(() => !/Saving/i.test(document.querySelector('[data-qualification-next]')?.textContent || ''));
    await page.type('[data-qualification-text="email"]', 'jordan@example.com');
    await page.evaluate(() => document.querySelector('[data-qualification-next]')?.click());
    await page.waitForSelector('[data-qualification-contact="name_and_phone:full_name"]');
    await page.waitForFunction(() => !/Saving/i.test(document.querySelector('[data-qualification-next]')?.textContent || ''));
    await page.type('[data-qualification-contact="name_and_phone:full_name"]', 'Jordan Lead');
    await page.type('[data-qualification-contact="name_and_phone:phone"]', '5551234567');
    await page.evaluate(() => document.querySelector('[data-qualification-next]')?.click());
    await page.waitForFunction(() => !document.querySelector('[data-trainer-qualification="1"]'));
    await page.waitForSelector('.trainer-standalone-public-name');

    const revealedState = await page.evaluate(() => ({
      nameText: document.querySelector('.trainer-standalone-public-name')?.textContent || '',
      hasModal: Boolean(document.querySelector('[data-trainer-qualification="1"]')),
      stored: Object.keys(localStorage).find((key) => key.includes('trainer-page-qualification-v1:avery:apply')) || ''
    }));
    assert.equal(revealedState.nameText, 'Avery Stone');
    assert.equal(revealedState.hasModal, false);
    assert.match(revealedState.stored, /trainer-page-qualification-v1:avery:apply/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-standalone-public-name');
    const returningState = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('[data-trainer-qualification="1"]')),
      nameText: document.querySelector('.trainer-standalone-public-name')?.textContent || ''
    }));
    assert.equal(returningState.hasModal, false);
    assert.equal(returningState.nameText, 'Avery Stone');
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser signed-in visitors can dismiss the qualification gate for six hours with the close button', async () => {
  const { server, origin } = await startFixtureServer({
    qualificationEnabled: true,
    authUser: {
      id: 'viewer-1',
      username: 'signedinviewer',
      displayName: 'Signed In Viewer'
    }
  });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-trainer-qualification="1"]');
    await page.click('[data-qualification-dismiss]');
    await page.waitForFunction(() => !document.querySelector('[data-trainer-qualification="1"]'));

    const dismissedState = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((entry) => entry.includes('trainer-page-qualification-v1:avery:apply')) || '';
      const stored = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
      return {
        key,
        hasModal: Boolean(document.querySelector('[data-trainer-qualification="1"]')),
        dismissedUntil: Number(stored?.dismissedUntil || 0) || 0
      };
    });
    assert.equal(dismissedState.hasModal, false);
    assert.match(dismissedState.key, /trainer-page-qualification-v1:avery:apply/);
    assert.ok(dismissedState.dismissedUntil > Date.now());

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-standalone-public-name');
    const returningState = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('[data-trainer-qualification="1"]')),
      nameText: document.querySelector('.trainer-standalone-public-name')?.textContent || ''
    }));
    assert.equal(returningState.hasModal, false);
    assert.equal(returningState.nameText, 'Avery Stone');

    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((entry) => entry.includes('trainer-page-qualification-v1:avery:apply')) || '';
      if (!key) return;
      const stored = JSON.parse(localStorage.getItem(key) || 'null') || {};
      stored.dismissedUntil = Date.now() - 1000;
      localStorage.setItem(key, JSON.stringify(stored));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-trainer-qualification="1"]');
    const expiredState = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('[data-trainer-qualification="1"]'))
    }));
    assert.equal(expiredState.hasModal, true);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser public trainer pages render as a site canvas without preview chrome and expand iframe height', async () => {
  const { server, origin } = await startFixtureServer({ qualificationEnabled: false });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.trainer-standalone-public-name');

    const state = await page.evaluate(() => {
      const nameEl = document.querySelector('.trainer-standalone-public-name');
      const frame = document.querySelector('.trainer-profile-builder-custom-code iframe');
      const pageNav = document.querySelector('.trainer-profile-builder-nav');
      const navbar = document.querySelector('.navbar');
      const controlPanel = document.querySelector('#control-panel');
      const topActions = document.querySelector('.trainer-profile-top-actions');
      return {
        standaloneText: nameEl?.textContent || '',
        hasIframe: Boolean(frame),
        bodyClass: document.body.className,
        hasPlatformPageNav: Boolean(pageNav),
        topActionsDisplay: topActions ? window.getComputedStyle(topActions).display : '',
        navbarHidden: Boolean(navbar?.hidden),
        controlPanelHidden: Boolean(controlPanel?.hidden),
        pageBackground: window.getComputedStyle(document.body).backgroundColor
      };
    });

    assert.equal(state.standaloneText, 'Avery Stone');
    assert.equal(state.hasIframe, false);
    assert.match(state.bodyClass, /trainer-public-standalone-route/);
    assert.equal(state.hasPlatformPageNav, false);
    assert.equal(state.topActionsDisplay, 'none');
    assert.equal(state.navbarHidden, true);
    assert.equal(state.controlPanelHidden, true);
    assert.match(state.pageBackground, /rgb\(255,\s*255,\s*255\)/);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser fallback public trainer pages still require qualification before revealing the starter site', async () => {
  const { server, origin } = await startFixtureServer({
    qualificationEnabled: false,
    mutateFixture: (fixture) => {
      delete fixture.pagesBySlug[''];
      fixture.navigation = fixture.navigation.filter((entry) => entry.pageSlug !== '');
    }
  });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/trainer-profile.html?trainer=avery`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-trainer-qualification="1"]');

    let state = await page.evaluate(() => ({
      hasModal: Boolean(document.querySelector('[data-trainer-qualification="1"]')),
      gateText: document.querySelector('.trainer-qualification-label')?.textContent || ''
    }));
    assert.equal(state.hasModal, true);
    assert.match(state.gateText, /gender/i);

    await page.click('[data-qualification-radio="gender"][value="Male"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="age"][value="21-30"]');
    await page.click('[data-qualification-radio="age"][value="21-30"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="trainer_gender_preference"][value="No preference"]');
    await page.click('[data-qualification-radio="trainer_gender_preference"][value="No preference"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="session_frequency"][value="Once weekly"]');
    await page.click('[data-qualification-radio="session_frequency"][value="Once weekly"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="exercise_routine"][value="A couple times weekly"]');
    await page.click('[data-qualification-radio="exercise_routine"][value="A couple times weekly"]');
    await page.click('[data-qualification-next]');
    await page.click('[data-qualification-checkbox="goals"][value="Strength"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="motivation"][value="Appearance"]');
    await page.click('[data-qualification-radio="motivation"][value="Appearance"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="open_to_online_training"][value="Yes"]');
    await page.click('[data-qualification-radio="open_to_online_training"][value="Yes"]');
    await page.click('[data-qualification-next]');
    await page.click('[data-qualification-checkbox="preferred_days"][value="Monday"]');
    await page.click('[data-qualification-next]');
    await page.click('[data-qualification-checkbox="preferred_times"][value="Evening"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-radio="start_date"][value="ASAP"]');
    await page.click('[data-qualification-radio="start_date"][value="ASAP"]');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-text="zip_or_town"]');
    await page.type('[data-qualification-text="zip_or_town"]', '33101');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-text="email"]');
    await page.type('[data-qualification-text="email"]', 'fallback@example.com');
    await page.click('[data-qualification-next]');
    await page.waitForSelector('[data-qualification-contact="name_and_phone:full_name"]');
    await page.type('[data-qualification-contact="name_and_phone:full_name"]', 'Fallback Lead');
    await page.type('[data-qualification-contact="name_and_phone:phone"]', '5551234567');
    await page.click('[data-qualification-next]');
    await page.waitForFunction(() => !document.querySelector('[data-trainer-qualification="1"]'));
    await page.waitForSelector('.trainer-profile-builder-custom-code iframe');
    const iframeHandle = await page.$('.trainer-profile-builder-custom-code iframe');
    const frame = await iframeHandle.contentFrame();
    assert.ok(frame);
    await frame.waitForFunction(() => /apply for coaching|inside this page/i.test(document.body?.innerText || ''));
    state = await page.evaluate(() => ({
      bodyClass: document.body.className,
      storedKey: Object.keys(localStorage).find((key) => key.includes('trainer-page-qualification-v1:avery:home')) || ''
    }));
    const frameText = await frame.evaluate(() => document.body?.innerText || '');

    assert.match(state.bodyClass, /trainer-builder-public-page/);
    assert.match(state.storedKey, /trainer-page-qualification-v1:avery:home/);
    assert.match(frameText, /Apply for coaching/i);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser qualification flow validates required fields and preserves answers when moving back', async () => {
  const { server, origin } = await startFixtureServer({ qualificationEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
    });
    await page.goto(`${origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-trainer-qualification="1"]');

    await page.click('[data-qualification-next]');
    await page.waitForFunction(() => /Select an option to continue/i.test(document.querySelector('.trainer-qualification-error')?.textContent || ''));
    let state = await page.evaluate(() => ({
      error: document.querySelector('.trainer-qualification-error')?.textContent || '',
      step: document.querySelector('.trainer-qualification-main .trainer-qualification-step')?.textContent || ''
    }));
    assert.match(state.error, /Select an option to continue/i);
    assert.match(state.step, /1 of/i);

    await page.click('[data-qualification-radio="gender"][value="Female"]');
    await page.evaluate(() => document.querySelector('[data-qualification-next]')?.click());
    await page.waitForSelector('[data-qualification-text="email"]');

    await page.type('[data-qualification-text="email"]', 'bad-email');
    await page.evaluate(() => document.querySelector('[data-qualification-next]')?.click());
    await page.waitForFunction(() => /Enter a valid email address/i.test(document.querySelector('.trainer-qualification-error')?.textContent || ''));
    state = await page.evaluate(() => ({
      error: document.querySelector('.trainer-qualification-error')?.textContent || '',
      hasEmail: Boolean(document.querySelector('[data-qualification-text="email"]'))
    }));
    assert.match(state.error, /Enter a valid email address/i);
    assert.equal(state.hasEmail, true);

    await page.evaluate(() => document.querySelector('[data-qualification-back]')?.click());
    await page.waitForSelector('[data-qualification-radio="gender"][value="Female"]');
    state = await page.evaluate(() => ({
      checked: Boolean(document.querySelector('[data-qualification-radio="gender"][value="Female"]')?.checked),
      chip: document.querySelector('.trainer-qualification-answer-chip')?.textContent || ''
    }));
    assert.equal(state.checked, true);
    assert.match(state.chip, /Female/i);

    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });

test('browser qualification flow persists in-progress step answers across reloads before submit', async () => {
  const { server, origin } = await startFixtureServer({ qualificationEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
    });
    await page.goto(`${origin}/coach/avery/apply`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-trainer-qualification="1"]');

    await page.click('[data-qualification-radio="gender"][value="Female"]');
    await page.evaluate(() => document.querySelector('[data-qualification-next]')?.click());
    await page.waitForSelector('[data-qualification-text="email"]');

    await page.type('[data-qualification-text="email"]', 'draft@example.com');
    await page.waitForFunction(() => {
      try {
        const key = Object.keys(localStorage).find((entry) => entry.includes('trainer-page-qualification-v1:avery:apply'));
        if (!key) return false;
        const stored = JSON.parse(localStorage.getItem(key) || 'null');
        return String(stored?.answers?.email || '') === 'draft@example.com';
      } catch {
        return false;
      }
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-trainer-qualification="1"]');
    await page.waitForSelector('[data-qualification-text="email"]');

    const state = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((entry) => entry.includes('trainer-page-qualification-v1:avery:apply')) || '';
      let stored = null;
      try {
        stored = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
      } catch {
        stored = null;
      }
      return {
        emailValue: document.querySelector('[data-qualification-text="email"]')?.value || '',
        progressStep: document.querySelector('.trainer-qualification-main .trainer-qualification-step')?.textContent || '',
        storedEmail: String(stored?.answers?.email || ''),
        currentStep: Number(stored?.currentStep || 0)
      };
    });

    assert.equal(state.emailValue, 'draft@example.com');
    assert.equal(state.storedEmail, 'draft@example.com');
    assert.match(state.progressStep, /2 of/i);
    assert.equal(state.currentStep, 1);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}, { timeout: 120000 });
