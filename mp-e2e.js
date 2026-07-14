// mp-e2e.js — scratch E2E driver (Meal Program Part 2), v2.
// Creates throwaway QA accounts via /api/auth/signup (usernames prefixed mp_e2e_ for cleanup),
// then walks (A) a fresh CLIENT onboarding and (B) a fresh TRAINER onboarding in REAL mode,
// asserting: meal plan + legacy snapshot + grocery list on the account + training intake +
// autobuild flag + identity graph — all present the moment onboarding finishes.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3217;
const BASE = `http://localhost:${PORT}`;
const TS = Date.now().toString(36);
const LOG = [];
function log(...args) {
    const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    LOG.push(line);
    console.log(line);
}

const EXCLUDE = /sign ?up|sign ?in|log ?in|log ?out|privacy|copy|qr code|preview|back$|go back|i.m a client|i.m a trainer|manage clients and generate plans|request a gym|submit for review|^all$|^commercial gym$|^online coaching company$|^private training studio$|^ .$|^cancel$|^×$/i;

const CLIENT_PRIORITIES = [
    /get my free plan/i,
    /^next step$/i, /^continue$/i, /^next$/i, /^done$/i, /^finish/i, /^save/i,
    /just me|train myself|on my own|by myself|solo|no trainer|without a trainer|skip for now|i.?ll do it myself/i,
    /none of the above/i,
    /^male$/i,
    /^yes\b/i,
    /^skip/i,
    /^not right now$/i,
    /build my workout|go to dashboard|save and go/i
];
const TRAINER_PRIORITIES = [
    /go to trainer dashboard/i,
    /independent|on my own|solo/i,
    /online$/i, /^remote/i,
    /^next step$/i, /^continue$/i, /^next$/i, /^done$/i, /^finish/i, /^save/i,
    /none of the above/i,
    /^skip/i, /^not right now$/i, /^no$/i, /^yes\b/i,
    /complete profile/i
];

async function visibleCandidates(page) {
    return page.evaluate(() => {
        const out = [];
        const els = document.querySelectorAll(
            'button, a.btn, [role="button"], [data-bm-choice], [data-bm-next], [data-bm-scale], ' +
            '[data-finish-action], [data-path-card], .path-card, .bm-option, .bm-cta, .mp-card'
        );
        const seen = new Set();
        for (const el of els) {
            if (seen.has(el)) continue;
            seen.add(el);
            const r = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (r.width < 4 || r.height < 4 || style.visibility === 'hidden' || style.display === 'none') continue;
            if (el.classList.contains('is-disabled') || el.disabled) continue;
            if (r.bottom < 0 || r.top > innerHeight + 400) continue;
            const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90);
            if (!text) continue; // icon-only buttons (back chevrons, logo cards) are never walk targets
            if (/back/i.test(el.getAttribute('aria-label') || '')) continue;
            const tag = el.getAttribute('data-path-card') ? `[path:${el.getAttribute('data-path-card')}]` : '';
            const selected = /(^| )(is-selected|is-active|selected|active)( |$)/.test(el.className || '') ? '*' : '';
            out.push({ text: (selected + tag + ' ' + text).trim(), x: r.x + r.width / 2, y: Math.min(r.y + r.height / 2, innerHeight - 4) });
        }
        return out.slice(0, 80);
    });
}

async function fillVisibleInputs(page) {
    await page.evaluate((ts) => {
        const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        document.querySelectorAll('input, textarea').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return;
            if (el.value) return;
            const t = (el.getAttribute('type') || 'text').toLowerCase();
            const key = ((el.getAttribute('data-bm-field') || '') + ' ' + (el.id || '') + ' ' + (el.name || '') + ' ' + (el.placeholder || '')).toLowerCase();
            if (/search/.test(key)) return; // never type into directory search boxes
            if (t === 'number') {
                let v = 30;
                if (/heightft|(^|\W)ft(\W|$)/.test(key)) v = 5;
                else if (/heightin/.test(key)) v = 10;
                else if (/heightcm/.test(key)) v = 178;
                else if (/goalweight/.test(key)) v = 190;
                else if (/weight/.test(key)) v = 180;
                else if (/age/.test(key)) v = 27;
                el.value = String(v); fire(el);
            } else if (t === 'email') { el.value = `mp.e2e.${ts}@example.com`; fire(el); }
            else if (t === 'tel') { el.value = '7065551234'; fire(el); }
            else if (t === 'time') { el.value = '07:00'; fire(el); }
            else if (t === 'password') { el.value = 'E2e!Pass123'; fire(el); }
            else if (t === 'text' || el.tagName === 'TEXTAREA') {
                if (/state/.test(key)) { el.value = 'GA'; fire(el); }
                else if (/name/.test(key)) { el.value = 'MP E2E Test'; fire(el); }
                else if (/city/.test(key)) { el.value = 'Augusta'; fire(el); }
                else if (/zip/.test(key)) { el.value = '30901'; fire(el); }
                else if (/gym|brand|company|studio/.test(key)) { el.value = 'E2E Test Gym'; fire(el); }
                else if (/summary|bio|about/.test(key)) { el.value = 'E2E summary'; fire(el); }
            }
        });
        // Entry-flow steps use RADIO/CHECKBOX groups (renderRadioGroup /
        // renderCheckboxGroup) — the walker's button scan never sees them.
        // Pick a sane option for every unchecked group; prefer the solo/simple
        // paths so the flow stays short.
        const scope = document.querySelector('#entry-step-body') || document;
        const names = new Set();
        scope.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((r) => { if (r.name) names.add(r.name); });
        names.forEach((name) => {
            if (scope.querySelector(`input[name="${name}"]:checked`)) return;
            const preferred = scope.querySelector(`input[name="${name}"][value="solo"]`)
                || scope.querySelector(`input[name="${name}"][value="generate"]`)
                || scope.querySelector(`input[name="${name}"][value="independent"]`)
                || scope.querySelector(`input[name="${name}"][value="online"]`)
                || scope.querySelector(`input[name="${name}"][value="No pain"]`)
                || scope.querySelector(`input[name="${name}"]`);
            if (preferred) preferred.click();
        });
        // If a category filter emptied the gym grid, reset it to All first.
        if (!scope.querySelector('[data-select-workspace]') && scope.querySelector('[data-workspace-filter]')) {
            const allChip = scope.querySelector('[data-workspace-filter="all"]');
            if (allChip && !allChip.classList.contains('is-selected')) allChip.click();
        }
        // Directory pickers are card BUTTONS, not inputs (trainer workspace/location).
        const ws = scope.querySelector('[data-select-workspace]');
        if (ws && !scope.querySelector('[data-select-workspace].is-selected')) ws.click();
        const loc = scope.querySelector('[data-select-location]');
        if (loc && !scope.querySelector('[data-select-location].is-selected')) loc.click();
        // Selects (e.g. stress/mood/state) — choose the first real option.
        scope.querySelectorAll('select').forEach((s) => {
            if (!s.value && s.options.length > 1) { s.value = s.options[1].value; fire(s); }
        });
    }, TS);
}

// Multi screens with a disabled NEXT: select the first unselected options until enabled.
async function handleMultiOrGrid(page) {
    return page.evaluate(() => {
        const cta = document.querySelector('.bm-cta.is-disabled, [data-bm-next].is-disabled');
        if (!cta) return false;
        const grid = document.querySelector('.bm-mealgrid');
        if (grid) {
            const unpicked = grid.querySelectorAll('[data-bm-mealpick]:not(.selected)');
            let clicks = 0;
            for (const c of unpicked) { if (clicks >= 3) break; c.click(); clicks++; }
            return clicks > 0;
        }
        const opts = document.querySelectorAll('.bm-option.is-multi:not(.is-selected)');
        let clicks = 0;
        for (const o of opts) { if (clicks >= 2) break; o.click(); clicks++; }
        return clicks > 0;
    });
}

async function walk(page, priorities, { maxSteps = 160, doneWhen, label }) {
    let lastSig = '';
    let stall = 0;
    let lastClickedText = '';
    let altIdx = 0;
    for (let step = 0; step < maxSteps; step++) {
        await new Promise((r) => setTimeout(r, 650));
        if (await doneWhen(page).catch(() => false)) { log(`[${label}] WALK DONE at step ${step} url=${page.url()}`); return true; }
        await fillVisibleInputs(page).catch(() => {});
        // Long screens (meal photo grid) push the advance CTA below the fold —
        // bring it into view so the candidate scan can see and click it.
        await page.evaluate(() => {
            const adv = document.querySelector('[data-bm-surprise], [data-bm-next]:not(.is-disabled), .bm-footer .bm-cta:not(.is-disabled)');
            if (adv) {
                const r = adv.getBoundingClientRect();
                if (r.top > innerHeight - 30 || r.bottom < 0) adv.scrollIntoView({ block: 'center' });
            }
        }).catch(() => {});
        if (await handleMultiOrGrid(page).catch(() => false)) { log(`[${label}] step ${step}: selected multi/grid options`); continue; }
        const candidates = await visibleCandidates(page).catch(() => []);
        const sig = page.url() + '|' + candidates.map((c) => c.text).join(';');
        stall = sig === lastSig ? stall + 1 : 0;
        lastSig = sig;
        if (stall === 5) {
            log(`[${label}] step ${step}: STALLING — candidates:`, candidates.map((c) => c.text).slice(0, 30));
        }
        if (stall >= 14) {
            const diag = await page.evaluate(() => ({
                bodyClasses: document.body.className,
                headings: Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => h.innerText.trim()).filter(Boolean).slice(0, 6),
                text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 600)
            })).catch(() => ({}));
            log(`[${label}] STUCK at step ${step} url=${page.url()}`);
            log(`[${label}] diag:`, diag);
            return false;
        }
        let clicked = null;
        const stalledOnAdvance = stall >= 1 && /continue|next|save|finish|done/i.test(lastClickedText);
        if (!stalledOnAdvance) {
            for (const re of priorities) {
                const hit = candidates.find((c) => re.test(c.text) && !EXCLUDE.test(c.text));
                if (hit) { clicked = hit; break; }
            }
        }
        if (!clicked) {
            // The screen isn't advancing: make a selection first (rotate through
            // non-advance candidates so multi-field steps eventually satisfy validation).
            const choices = candidates.filter((c) =>
                !EXCLUDE.test(c.text) && !/continue|next step|^next$|save|finish|done/i.test(c.text) && !c.text.startsWith('*'));
            if (choices.length) {
                clicked = choices[altIdx % choices.length];
                altIdx++;
            } else {
                // nothing to select — try the advance button again anyway
                clicked = candidates.find((c) => /continue|next|save|finish|done/i.test(c.text) && !EXCLUDE.test(c.text));
            }
        }
        if (!clicked) continue;
        lastClickedText = clicked.text;
        if (step % 5 === 0) {
            const ctx = await page.evaluate(({ x, y }) => {
                const el = document.elementFromPoint(x, y);
                const h = document.querySelector('.bm-title, #entry-panel-title, h2, h1');
                return {
                    heading: h ? (h.innerText || '').replace(/s+/g, ' ').slice(0, 70) : '',
                    hit: el ? el.tagName + '.' + String(el.className || '').slice(0, 70) : 'none'
                };
            }, clicked).catch(() => ({}));
            log(`[${label}] ctx heading="${ctx.heading}" hit=${ctx.hit}`);
        }
        log(`[${label}] step ${step}: click "${clicked.text}"`);
        try { await page.mouse.click(clicked.x, clicked.y); } catch (e) { log('click error', String(e.message || e)); }
    }
    log(`[${label}] WALK exhausted maxSteps`);
    return false;
}

async function signup(page, role, suffix) {
    const username = `mp_e2e_${role}_${TS}${suffix || ''}`;
    const body = {
        username,
        email: `mp.e2e.${role}.${TS}${suffix || ''}@example.com`,
        phone: `70655${String(Math.floor(10000 + Math.random() * 89999))}`,
        displayName: `MP E2E ${role}`,
        password: `E2e!${TS}${Math.random().toString(36).slice(2, 10)}`,
        onboardingRole: role === 'client' ? 'user' : role
    };
    const result = await page.evaluate(async (payload) => {
        const r = await fetch('/api/auth/signup', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, status: r.status, error: j.error || null, hasUser: !!(j.user || j.id) };
    }, body);
    log(`signup ${username}:`, result);
    return { username, ok: result.ok };
}

async function lsSnapshot(page, keys) {
    return page.evaluate((ks) => {
        const out = {};
        ks.forEach((k) => { const v = localStorage.getItem(k); out[k] = v ? v.length : null; });
        return out;
    }, keys);
}

(async () => {
    let server = null;
    let browser = null;
    let exitCode = 1;
    const createdAccounts = [];
    try {
        server = spawn(process.execPath, ['--env-file', '.env', 'server.js'], {
            cwd: __dirname,
            env: Object.assign({}, process.env, { PORT: String(PORT) }),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        server.stderr.on('data', (d) => log('[server:err]', String(d).trim().slice(0, 200)));
        server.on('exit', (code, sig) => log('[server EXITED]', 'code=' + code, 'sig=' + sig));
        await new Promise((r) => setTimeout(r, 6000));

        const puppeteer = require('puppeteer');
        browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--window-size=430,900'] });
        const results = {};

        // ================= Scenario A: fresh CLIENT (real mode, authenticated) =================
        {
            const page = await browser.newPage();
            await page.setViewport({ width: 430, height: 900 });
            page.on('pageerror', (e) => log('[A pageerror]', String(e.message || e).slice(0, 200)));
            page.on('dialog', (d) => { log('[A dialog]', d.message().slice(0, 140)); d.dismiss().catch(() => {}); });
            await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.evaluate(() => localStorage.clear());
            log('=== SCENARIO A: client onboarding (real mode) ===');
            const acct = await signup(page, 'client');
            createdAccounts.push(acct.username);
            results.clientSignup = acct.ok;
            await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise((r) => setTimeout(r, 1500));
            // Enter the client path from the roles screen.
            const rolePicked = await page.evaluate(() => {
                const card = document.querySelector('[data-path-card="user"] .path-visual, [data-open-path="user"]');
                if (card) { card.click(); return true; }
                return false;
            });
            log('A role card user clicked:', rolePicked);
            await page.waitForSelector('#onboarding-panel.is-active', { timeout: 15000 }).catch(() => log('A panel never activated'));
            const done = await walk(page, CLIENT_PRIORITIES, {
                label: 'A', maxSteps: 200,
                doneWhen: async (p) => /overview\.html|training\.html|trainer-dashboard\.html/.test(p.url())
            });
            await new Promise((r) => setTimeout(r, 2500));
            const snap = await lsSnapshot(page, [
                'ode_meal_program_plan_v1', 'ode_meal_plan_snapshot_v1', 'ode_meal_picks_v1',
                'ode_training_intake_v2', 'ode_training_autobuild_v1',
                'ode_identity_profile_v1', 'ovIdentityStats'
            ]);
            log('A localStorage:', snap);
            const grocery = await page.evaluate(async () => {
                const r = await fetch('/api/groceries/latest', { credentials: 'include' });
                const j = await r.json().catch(() => ({}));
                const meta = j?.list?.meta;
                return { ok: r.ok, hasList: !!j?.list, notes: (typeof meta === 'string' ? JSON.parse(meta) : meta || {}).notes || null };
            }).catch(() => ({ ok: false }));
            log('A /api/groceries/latest:', grocery);
            results.clientWalkFinished = done;
            results.clientMealPlan = !!snap.ode_meal_program_plan_v1;
            results.clientMealSnapshot = !!snap.ode_meal_plan_snapshot_v1;
            results.clientIntake = !!snap.ode_training_intake_v2;
            // training.js consumes ode_training_autobuild_v1 the moment it
            // auto-builds — a built plan draft is the proof it fired.
            results.clientAutobuild = !!snap.ode_training_autobuild_v1 || await page.evaluate(() =>
                localStorage.getItem('ode_training_autobuild_v1') === '1'
                || Object.keys(localStorage).some((k) => k.startsWith('ode_training_draft_v1:'))
            ).catch(() => false);
            results.clientIdentity = !!snap.ode_identity_profile_v1 || !!snap.ovIdentityStats;
            results.clientGroceryOnAccount = !!grocery.hasList && grocery.notes === 'meal_program_onboarding';

            if (done) {
                await page.goto(`${BASE}/training.html?from=intake`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise((r) => setTimeout(r, 12000));
                const training = await page.evaluate(() => ({
                    keys: Object.keys(localStorage).filter((k) => /train|workout|blueprint/i.test(k)),
                    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300)
                }));
                log('A training keys:', training.keys);
                log('A training text:', training.text);
                results.clientWorkouts = training.keys.some((k) => k !== 'ode_training_intake_v2' && k !== 'ode_training_autobuild_v1');

                await page.goto(`${BASE}/overview.html#control-panel`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise((r) => setTimeout(r, 8000));
                const overview = await page.evaluate(() => ({
                    stats: !!localStorage.getItem('ovIdentityStats'),
                    mealGridChildren: (document.getElementById('meal-grid') || {}).childElementCount || 0,
                    groceryCount: (document.getElementById('overview-grocery-count') || {}).textContent || '',
                    hasRadar: !!document.querySelector('canvas, svg polygon')
                }));
                log('A overview:', overview);
                results.clientGraph = overview.stats && overview.hasRadar;
                results.clientOverviewMeals = overview.mealGridChildren > 0 || !!snap.ode_meal_plan_snapshot_v1;
            }
            await page.close();
        }

        // ================= Scenario B: fresh TRAINER (real mode, authenticated) =================
        {
            // Isolated context: scenario A's session cookie must not leak in —
            // a signed-in index.html redirects (daily gate) mid-signup-fetch.
            const ctxB = await browser.createBrowserContext();
            const page = await ctxB.newPage();
            await page.setViewport({ width: 430, height: 900 });
            page.on('pageerror', (e) => log('[B pageerror]', String(e.message || e).slice(0, 200)));
            page.on('dialog', (d) => { log('[B dialog]', d.message().slice(0, 140)); d.dismiss().catch(() => {}); });
            await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.evaluate(() => localStorage.clear());
            log('=== SCENARIO B: trainer onboarding (real mode) ===');
            const acct = await signup(page, 'trainer');
            createdAccounts.push(acct.username);
            results.trainerSignup = acct.ok;
            await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise((r) => setTimeout(r, 1500));
            const rolePicked = await page.evaluate(() => {
                const card = document.querySelector('[data-path-card="trainer"] .path-visual, [data-open-path="trainer"]');
                if (card) { card.click(); return true; }
                return false;
            });
            log('B role card trainer clicked:', rolePicked);
            await page.waitForSelector('#onboarding-panel.is-active', { timeout: 15000 }).catch(() => log('B panel never activated'));
            const done = await walk(page, TRAINER_PRIORITIES, {
                label: 'B', maxSteps: 160,
                doneWhen: async (p) => /trainer-dashboard\.html/.test(p.url()) ||
                    p.evaluate(() => !!localStorage.getItem('ode_meal_program_plan_v1')).catch(() => false)
            });
            await new Promise((r) => setTimeout(r, 2500));
            const snap = await lsSnapshot(page, ['ode_meal_program_plan_v1', 'ode_meal_plan_snapshot_v1']);
            log('B localStorage:', snap);
            results.trainerWalkFinished = done;
            results.trainerMealPlan = !!snap.ode_meal_program_plan_v1;
            await page.close();
        }

        log('=== CREATED QA ACCOUNTS (for cleanup) ===', createdAccounts);
        log('=== RESULTS ===');
        log(JSON.stringify(results, null, 2));
        const required = ['clientSignup', 'clientWalkFinished', 'clientMealPlan', 'clientMealSnapshot',
            'clientIntake', 'clientAutobuild', 'clientIdentity', 'clientGroceryOnAccount', 'trainerMealPlan'];
        const failed = required.filter((k) => !results[k]);
        if (failed.length) { log('E2E FAILED checks:', failed); exitCode = 1; }
        else { log('E2E PASSED all required checks'); exitCode = 0; }
    } catch (err) {
        log('E2E fatal:', String(err && err.stack || err).slice(0, 800));
        exitCode = 1;
    } finally {
        try { if (browser) await browser.close(); } catch {}
        try { if (server) server.kill('SIGTERM'); } catch {}
        try { fs.writeFileSync(path.join(__dirname, 'mp-e2e-log.txt'), LOG.join('\n') + '\nEXITCODE=' + exitCode + '\n'); } catch {}
        process.exit(exitCode);
    }
})();
