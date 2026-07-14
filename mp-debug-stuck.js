// mp-debug-stuck.js — scratch: reproduce the E2E stall with screenshots.
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3218;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, 'tmp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const server = spawn(process.execPath, ['--env-file', '.env', 'server.js'], {
        cwd: __dirname,
        env: Object.assign({}, process.env, { PORT: String(PORT) }),
        stdio: ['ignore', 'ignore', 'pipe']
    });
    await sleep(6000);
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 430, height: 900 });
        page.on('dialog', (d) => { console.log('[dialog]', d.message()); d.dismiss().catch(() => {}); });
        page.on('pageerror', (e) => console.log('[pageerror]', String(e.message || e).slice(0, 200)));
        await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => localStorage.clear());
        const ts = Date.now().toString(36);
        const signup = await page.evaluate(async (t) => {
            const r = await fetch('/api/auth/signup', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: `mp_e2e_debug_${t}`, email: `mp.e2e.debug.${t}@example.com`,
                    phone: '7065550000', displayName: 'MP Debug', password: `E2e!${t}Aa1`,
                    onboardingRole: 'user'
                })
            });
            return { ok: r.ok, status: r.status };
        }, ts);
        console.log('signup:', JSON.stringify(signup), 'user:', `mp_e2e_debug_${ts}`);
        await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
        await sleep(9000); // let preloader finish
        await page.screenshot({ path: path.join(OUT, 'dbg-0-after-load.png') });
        const s0 = await page.evaluate(() => ({
            url: location.href,
            stage: document.getElementById('entry-home')?.getAttribute('data-entry-stage'),
            rolesActive: !!document.querySelector('#entry-role-stage.is-active'),
            authActive: !!document.querySelector('#entry-auth-stage.is-active, [data-entry-stage="auth"].is-active'),
            bodyCls: document.body.className,
            visibleHeadings: Array.from(document.querySelectorAll('h1,h2,h3')).filter((h) => h.getBoundingClientRect().height > 0).map((h) => h.innerText.trim()).slice(0, 5)
        }));
        console.log('state after load:', JSON.stringify(s0, null, 1));
        await page.evaluate(() => document.querySelector('[data-path-card="user"] .path-visual, [data-open-path="user"]')?.click());
        await sleep(2500);
        await page.screenshot({ path: path.join(OUT, 'dbg-1-after-client-click.png') });
        const s1 = await page.evaluate(() => ({
            stage: document.getElementById('entry-home')?.getAttribute('data-entry-stage'),
            rolesActive: !!document.querySelector('#entry-role-stage.is-active'),
            panelActive: !!document.querySelector('#onboarding-panel.is-active'),
            quizActive: document.body.classList.contains('client-quiz-active'),
            visibleHeadings: Array.from(document.querySelectorAll('h1,h2,h3')).filter((h) => h.getBoundingClientRect().height > 0).map((h) => h.innerText.trim()).slice(0, 5),
            visibleButtons: Array.from(document.querySelectorAll('button')).filter((b) => b.getBoundingClientRect().height > 3 && getComputedStyle(b).visibility !== 'hidden').map((b) => (b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).slice(0, 12)
        }));
        console.log('state after client click:', JSON.stringify(s1, null, 1));
        // click the topmost CONTINUE-ish thing 3 times with shots
        for (let i = 1; i <= 3; i++) {
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button, [role="button"]'))
                    .filter((b) => /^(continue|next step|next)$/i.test((b.innerText || '').trim()))
                    .filter((b) => b.getBoundingClientRect().height > 3);
                if (btns[0]) {
                    const r = btns[0].getBoundingClientRect();
                    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                    console.log('would hit: ' + (el ? el.tagName + '.' + el.className : 'none'));
                    btns[0].click(); // direct DOM click, bypasses overlays
                }
            });
            await sleep(1600);
            await page.screenshot({ path: path.join(OUT, 'dbg-2-continue-' + i + '.png') });
        }
        const s2 = await page.evaluate(() => ({
            quizActive: document.body.classList.contains('client-quiz-active'),
            bmTitle: document.querySelector('.bm-quiz .bm-title')?.innerText || null,
            visibleHeadings: Array.from(document.querySelectorAll('h1,h2,h3')).filter((h) => h.getBoundingClientRect().height > 0).map((h) => h.innerText.trim()).slice(0, 5)
        }));
        console.log('state after 3 continues:', JSON.stringify(s2, null, 1));
    } finally {
        await browser.close().catch(() => {});
        server.kill('SIGTERM');
    }
})().catch((e) => { console.error('fatal', e); process.exit(1); });
