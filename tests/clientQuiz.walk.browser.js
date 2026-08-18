/* Client onboarding quiz — render + walk (browser).

   Engine v2, onboarding Slice 0. The quiz is the surface we are consolidating
   every question onto, so "every screen still renders" needs to be a fact we
   can re-check rather than something eyeballed after each edit.

   1. Every screen in SCREENS renders at its own index without throwing.
   2. The quiz walks front to back and arrives at the plan screen.
   3. No screen shows a promise the engine cannot keep: a computed goal date,
      a star rating, or an outcome claim about users we do not have.

   Run: node tests/clientQuiz.walk.browser.js */
const puppeteer = require('../node_modules/puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.QUIZ_WALK_TEST_PORT || 4187);
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/harness') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/client-quiz.css">'
      + '<div id="host"></div><script src="/js/client-quiz.js"></script>');
    return;
  }
  const file = path.join(ROOT, urlPath);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ' + extra}`);
  if (!cond) failures += 1;
};

/* Enough of a filled-in run that screens whose titles are functions of earlier
   answers have something to read. */
const SEED = {
  gender: 'Male', build: 'Medium build', weightChange: 'I gain and lose weight easily',
  heightUnit: 'ft', heightFt: 5, heightIn: 10, weightUnit: 'lbs', weightValue: 205,
  goalWeightUnit: 'lbs', goalWeightValue: 185, ageYears: 34,
  dailyActivity: 'I take active breaks', exerciseFreq: 'Several times a week',
  event: 'Vacation', eventDate: '2026-12-01', state: 'Louisiana'
};

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport(PHONE);
    // Reduced motion collapses the tap-feedback delays and shortens the loading
    // ring from 3.4s to 400ms, so the walk is fast and deterministic.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto('http://127.0.0.1:' + PORT + '/harness', { waitUntil: 'load' });

    const total = await page.evaluate(() => window.OdeClientQuiz.SCREENS.length);
    console.log('\n  ' + total + ' screens\n');

    // 1. every screen renders at its own index
    const bad = await page.evaluate((seed) => {
      const out = [];
      const { SCREENS, mount } = window.OdeClientQuiz;
      for (let i = 0; i < SCREENS.length; i += 1) {
        const host = document.getElementById('host');
        try {
          const inst = mount(host, { startIndex: i, answers: Object.assign({}, seed) });
          const html = host.innerHTML || '';
          if (html.length < 40) out.push({ id: SCREENS[i].id, why: 'rendered ' + html.length + ' chars' });
          inst.destroy();
        } catch (err) {
          out.push({ id: SCREENS[i].id, why: String((err && err.message) || err).slice(0, 120) });
        }
      }
      return out;
    }, SEED);
    check('all ' + total + ' screens render', bad.length === 0,
      bad.map((b) => b.id + ': ' + b.why).join(' | '));

    // 2. the quiz walks front to back
    const walk = await page.evaluate(async () => {
      const host = document.getElementById('host');
      host.innerHTML = '';
      window.OdeClientQuiz.mount(host, { startIndex: 0, answers: {} });
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const fieldValue = (k) => ({
        heightFt: '5', heightIn: '10', heightCm: '178', weightValue: '205',
        goalWeightValue: '185', ageYears: '34'
      }[k] || '3');
      const seen = [];
      for (let step = 0; step < 400; step += 1) {
        await sleep(12);
        const titleEl = host.querySelector('.bm-title');
        seen.push((titleEl ? titleEl.textContent : '').slice(0, 40));
        if (host.querySelector('.bm-plan-chip, .bm-plan')) return { reached: 'plan', steps: step, seen };
        const inputs = Array.from(host.querySelectorAll('input[data-bm-field]'));
        if (inputs.length) {
          for (const el of inputs) {
            el.value = fieldValue(el.getAttribute('data-bm-field'));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          await sleep(12);
        }
        const dated = host.querySelector('input[type="time"], input[type="date"]');
        if (dated) {
          dated.value = dated.type === 'time' ? '07:00' : '2026-12-01';
          dated.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(12);
        }
        // On a multi-select, only ever click something not already chosen —
        // clicking a selected option toggles it back off and the walk stalls.
        const pick = host.querySelector('[data-bm-choice]:not(.is-disabled):not([disabled])')
          || host.querySelector('[data-bm-scale]:not(.is-selected)')
          || host.querySelector('[data-bm-multi]:not(.is-selected)');
        if (pick) { pick.click(); await sleep(30); }
        const next = host.querySelector('[data-bm-next]:not(.is-disabled)');
        if (next) { next.click(); await sleep(30); continue; }
        const skip = host.querySelector('[data-bm-skip]');
        if (skip) { skip.click(); await sleep(30); continue; }
        if (!pick) {
          // Some screens advance on a timer rather than a tap (the loading
          // ring). Give those a chance before calling the walk stuck.
          let waited = 0;
          while (waited < 6000 && !host.querySelector('[data-bm-choice],[data-bm-scale],[data-bm-multi],[data-bm-next],[data-bm-skip],.bm-plan-chip,.bm-plan')) {
            await sleep(100); waited += 100;
          }
          if (waited >= 6000) {
            const t = host.querySelector('.bm-title');
            return { reached: 'stuck', steps: step, title: t ? t.textContent : '(no title)', seen };
          }
        }
      }
      return { reached: 'ranout', seen };
    });
    check('walks front to back to the plan screen', walk.reached === 'plan',
      'stopped at "' + (walk.title || walk.reached) + '" after ' + walk.steps + ' steps'
      + '; last seen: ' + (walk.seen || []).slice(-6).map((s) => JSON.stringify(s)).join(' -> '));

    check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    // 3. nothing on screen promises what the engine cannot deliver
    const promises = await page.evaluate((seed) => {
      const { SCREENS, mount } = window.OdeClientQuiz;
      const host = document.getElementById('host');
      const hits = [];
      for (let i = 0; i < SCREENS.length; i += 1) {
        try {
          const inst = mount(host, { startIndex: i, answers: Object.assign({}, seed) });
          const t = host.textContent || '';
          if (/you could be .+ by /i.test(t)) hits.push(SCREENS[i].id + ': goal-date promise');
          if (/★★★/.test(t)) hits.push(SCREENS[i].id + ': star rating');
          if (/Based on users who log/i.test(t)) hits.push(SCREENS[i].id + ': user-outcome claim');
          inst.destroy();
        } catch (err) { /* covered by check 1 */ }
      }
      return hits;
    }, SEED);
    check('no goal-date promise, star rating, or user-outcome claim on any screen',
      promises.length === 0, promises.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
})();
