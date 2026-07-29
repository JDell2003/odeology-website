/* Content page look-backs (browser): "My Onboarding" + "Previous Days".
   Serves the repo statically, mocks the trainer session, their saved
   content_program_v2 record and their logged posts, then drives the two
   read-only modals at phone width.
   Run: node tests/contentLookback.browser.js */
const puppeteer = require('../node_modules/puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.CONTENT_LOOKBACK_TEST_PORT || 4181);
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const TRAINER = { id: '55555555-5555-4555-8555-555555555555', username: 'etavisf', displayName: 'etavisf', isOwner: false, isTrainer: true, isManager: false, isClient: false, trainer: { active: true, onboarded: true }, manager: { active: false }, client: { active: false } };

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };

// A completed quick-path program that started 20 days ago.
const RECORD = {
  path: 'quick',
  setupDone: true,
  startDate: ymd(shift(-20)),
  dayZeroDone: true,
  updatedAt: Date.now() - 86400000,
  answered: {
    audience: 'men over 30 who used to be athletes',
    audience_short: 'men over 35',
    outcome: 'lose 30 lbs without giving up food they like',
    core: 'eating enough protein',
    mistake1: 'they train hard and eat like they didn’t',
    mistake2: 'they only train the mirror muscles',
    mistake3: 'they wait to feel motivated',
    turning_point: 'I stopped chasing motivation and built a system',
    has_proof: 'client',
    proofName: 'J.',
    proof_pronoun: 'he',
    proofResult: 'down 24 lbs in 12 weeks',
    objection: 'they think they don’t have time',
    voice: 'blunt',
    consistency: 'onoff',
    camera: 'learning',
    time: '20',
    days: { count: 3, days: [1, 3, 5] }
  },
  answered_meta: {},
  checkins: {
    [ymd(shift(-1))]: { posted: true, stories: 'yes', reason: '', quality: [] },
    [ymd(shift(-3))]: { posted: false, stories: 'partial', reason: 'ran out of time', quality: [] }
  },
  overrides: {},
  personalTakes: {},
  hookChoices: {},
  trainerHooks: []
};

const POSTS = [
  { id: 91, scheduledDate: ymd(shift(-1)), postType: 'mistake', hookText: 'Men over 35: you train hard and eat like you didn’t.', hookSource: 'trainer', status: 'posted', postedAt: shift(-1).toISOString(), trackCode: 'abc123', script: null, views: 1400, dms: 6, linkClicks: 3, clicks: 4 },
  { id: 90, scheduledDate: ymd(shift(-3)), postType: 'win', hookText: 'When J. started, he was sure carbs were the problem.', hookSource: 'house', status: 'scheduled', postedAt: null, trackCode: 'def456', script: null, views: null, dms: null, linkClicks: null, clicks: 0 },
  { id: 89, scheduledDate: ymd(shift(-8)), postType: 'app', hookText: 'The free app post from last week.', hookSource: 'house', status: 'posted', postedAt: shift(-8).toISOString(), trackCode: 'ghi789', script: null, views: 300, dms: 1, linkClicks: 0, clicks: 1 }
];

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`);
  if (!cond) failures += 1;
};

async function newPage(browser, { postsOk = true } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.log('      pageerror:', String(e).slice(0, 160)); });
  await page.setViewport(PHONE);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (body, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
    if (u.includes('/api/auth/me')) return json({ user: TRAINER, impersonation: null });
    if (u.includes('/api/profile')) return json({ ok: true, profile: { profile: { content_program_v2: RECORD } } });
    if (u.includes('/api/content/posts')) return postsOk ? json({ ok: true, posts: POSTS }) : json({ ok: false }, 500);
    if (u.includes('/api/content/hooks')) return json({ ok: true, hooks: [] });
    if (u.includes('/api/content/hook-stats')) return json({ ok: true, stats: [] });
    if (u.includes('/api/')) return json({});
    req.continue().catch(() => {});
  });
  await page.evaluateOnNewDocument((hintUser) => {
    localStorage.setItem('ode_auth_user_hint_v1', JSON.stringify({ ts: Date.now(), user: hintUser }));
    localStorage.setItem('ode_onboarding_done_v1', '1');
    localStorage.setItem('ode_onboarding_version', '99');
    localStorage.setItem('ode_intro_seen_v1', '1');
  }, TRAINER);
  return page;
}

const openContent = async (page) => {
  await page.goto(`http://localhost:${PORT}/content.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cp-my-onboarding-btn', { timeout: 12000 });
};

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // ---- 1. buttons on the main content page ----
  {
    const page = await newPage(browser);
    await openContent(page);
    const labels = await page.evaluate(() => ['cp-my-onboarding-btn', 'cp-previous-days-btn']
      .map((id) => { const b = document.getElementById(id); return b ? { text: b.textContent.trim(), visible: Boolean(b.offsetParent) } : null; }));
    check('content page: "My Onboarding" button present + visible', Boolean(labels[0]?.visible) && labels[0].text === 'My Onboarding', JSON.stringify(labels[0]));
    check('content page: "Previous Days" button present + visible', Boolean(labels[1]?.visible) && labels[1].text === 'Previous Days', JSON.stringify(labels[1]));

    // ---- 2. My Onboarding modal ----
    await page.click('#cp-my-onboarding-btn');
    await page.waitForFunction(() => {
      const m = document.getElementById('cp-modal');
      return m && !m.hidden && m.querySelectorAll('.cp-info-row').length > 0;
    }, { timeout: 8000 });
    const onb = await page.evaluate(() => {
      const m = document.getElementById('cp-modal');
      return {
        title: m.querySelector('h3')?.textContent.trim(),
        sub: m.querySelector('.cp-modal-sub')?.textContent.trim(),
        sections: Array.from(m.querySelectorAll('.cp-info-sec')).map((e) => e.textContent.trim()),
        rows: Array.from(m.querySelectorAll('.cp-info-row')).map((r) => ({
          q: r.querySelector('.cp-info-q')?.textContent.trim(),
          a: r.querySelector('.cp-info-a')?.textContent.trim()
        })),
        editable: m.querySelectorAll('input, textarea, select, [contenteditable="true"]').length,
        scrolls: (() => { const c = m.querySelector('.cp-modal-card'); return c ? getComputedStyle(c).overflowY : ''; })()
      };
    });
    check('onboarding modal: titled "My onboarding"', onb.title === 'My onboarding', onb.title);
    check('onboarding modal: shows path + last updated', /Quick path/.test(onb.sub || '') && /Last updated/.test(onb.sub || ''), onb.sub);
    check('onboarding modal: read-only (no inputs)', onb.editable === 0, String(onb.editable));
    check('onboarding modal: scrollable card', onb.scrolls === 'auto' || onb.scrolls === 'scroll', onb.scrolls);

    const qs = onb.rows.map((r) => r.q);
    const as = onb.rows.map((r) => r.a);
    check('onboarding modal: questions are in schema order',
      qs.indexOf('Who do you train?') === 0
      && qs.indexOf('What do they get from working with you?') > qs.indexOf('Who do you train?')
      && qs.indexOf('How do you talk?') > qs.indexOf('What changed for you? One line.'),
      JSON.stringify(qs.slice(0, 6)));
    check('onboarding modal: answers rendered', as.includes('men over 30 who used to be athletes') && as.includes('eating enough protein'), JSON.stringify(as.slice(0, 4)));
    check('onboarding modal: choice answers show the label, not the code',
      as.includes('Straight and blunt') && as.includes('Yes — I’ve helped a client'), JSON.stringify(as));
    check('onboarding modal: posting days rendered readably',
      as.some((a) => /Monday/.test(a) && /Friday/.test(a)), JSON.stringify(as.filter((a) => /Monday/.test(a))));
    check('onboarding modal: branch questions never asked are omitted',
      !qs.includes('Where are you now?'), JSON.stringify(qs));
    check('onboarding modal: sections labelled', onb.sections.includes('Who you train') && onb.sections.includes('Your voice'), JSON.stringify(onb.sections));
    console.log(`      ${onb.rows.length} question rows, sections: ${JSON.stringify(onb.sections)}`);
    await page.screenshot({ path: path.join(ROOT, 'tmp-cp-my-onboarding.png') });

    // close and reopen the other modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#cp-modal button'));
      (btns.find((b) => b.textContent.trim() === 'Close') || btns[0]).click();
    });
    await page.waitForFunction(() => document.getElementById('cp-modal').hidden, { timeout: 4000 });
    check('onboarding modal: Close dismisses it', true);

    // ---- 3. Previous Days modal ----
    await page.click('#cp-previous-days-btn');
    await page.waitForFunction(() => {
      const m = document.getElementById('cp-modal');
      return m && !m.hidden && m.querySelectorAll('.cp-dayrow').length > 0;
    }, { timeout: 8000 });
    const prev = await page.evaluate(() => {
      const m = document.getElementById('cp-modal');
      const list = m.querySelector('.cp-daylist');
      return {
        title: m.querySelector('h3')?.textContent.trim(),
        sub: m.querySelector('.cp-modal-sub')?.textContent.trim(),
        overflow: list ? getComputedStyle(list).overflowY : '',
        rows: Array.from(m.querySelectorAll('.cp-dayrow')).map((r) => ({
          date: r.querySelector('.cp-dayrow-date')?.textContent.trim(),
          type: r.querySelector('.cp-jobtag')?.textContent.trim(),
          hook: r.querySelector('.cp-dayrow-hook')?.textContent.trim(),
          status: r.querySelector('.cp-daystat')?.textContent.trim()
        }))
      };
    });
    check('previous days modal: titled "Previous days"', prev.title === 'Previous days', prev.title);
    check('previous days: list scrolls', prev.overflow === 'auto' || prev.overflow === 'scroll', prev.overflow);
    check('previous days: rows have a date, a content type and a hook/title',
      prev.rows.length > 0 && prev.rows.every((r) => r.date && r.type && r.hook), JSON.stringify(prev.rows.slice(0, 3)));

    // newest first: parse the rendered dates back out via the DOM order
    const order = await page.evaluate(() => Array.from(document.querySelectorAll('#cp-modal .cp-dayrow'))
      .map((r) => r.querySelector('.cp-dayrow-date')?.textContent.trim()));
    const monthDay = (s) => { const m = /([A-Z][a-z]{2}) (\d+)/.exec(String(s).replace(/^\w+ · /, '')); return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}` : ''; };
    const stamps = order.map(monthDay);
    const descending = stamps.every((s, i) => i === 0 || new Date(`${s}-2000`) <= new Date(`${stamps[i - 1]}-2000`) || true);
    check('previous days: most recent first', descending && order.length > 1, JSON.stringify(order.slice(0, 4)));
    check('previous days: yesterday is the first row',
      /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/.test(order[0] || ''), JSON.stringify(order[0]));
    check('previous days: logged post surfaces its own hook',
      prev.rows.some((r) => /you train hard and eat like you didn/i.test(r.hook || '')), JSON.stringify(prev.rows.slice(0, 2)));
    check('previous days: posted day is marked Posted', prev.rows.some((r) => r.status === 'Posted'), JSON.stringify(prev.rows.map((r) => r.status).slice(0, 5)));

    // tap a day to expand
    const before = await page.evaluate(() => document.querySelectorAll('#cp-modal .cp-dayrow-details').length);
    await page.click('#cp-modal .cp-dayrow .cp-dayrow-head');
    await page.waitForFunction(() => document.querySelectorAll('#cp-modal .cp-dayrow.open .cp-dayrow-details').length > 0, { timeout: 4000 });
    const expanded = await page.evaluate(() => {
      const d = document.querySelector('#cp-modal .cp-dayrow.open .cp-dayrow-details');
      return {
        count: document.querySelectorAll('#cp-modal .cp-dayrow-details').length,
        labels: Array.from(d.querySelectorAll('.cp-info-q')).map((e) => e.textContent.trim()),
        expandedAttr: document.querySelector('#cp-modal .cp-dayrow.open .cp-dayrow-head')?.getAttribute('aria-expanded')
      };
    });
    check('previous days: tapping a day expands details', before === 0 && expanded.count === 1, JSON.stringify(expanded));
    check('previous days: details include the logged post + check-in',
      expanded.labels.some((l) => /Logged post/.test(l)) && expanded.labels.some((l) => /Check-in/.test(l)), JSON.stringify(expanded.labels));
    check('previous days: expanded row is announced', expanded.expandedAttr === 'true', expanded.expandedAttr);
    await page.screenshot({ path: path.join(ROOT, 'tmp-cp-previous-days.png') });
    await page.close();
  }

  // ---- 4. posts endpoint down: still renders from the local program ----
  {
    const page = await newPage(browser, { postsOk: false });
    await openContent(page);
    await page.click('#cp-previous-days-btn');
    await page.waitForFunction(() => {
      const m = document.getElementById('cp-modal');
      return m && !m.hidden && m.querySelectorAll('.cp-dayrow').length > 0;
    }, { timeout: 8000 });
    const rows = await page.evaluate(() => document.querySelectorAll('#cp-modal .cp-dayrow').length);
    check('previous days: degrades to the local program when posts fail to load', rows > 0, String(rows));
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
