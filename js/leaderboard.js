(() => {
    const $ = (sel, root = document) => root.querySelector(sel);

    const listEl = $('#lb-list');
    const youEl = $('#lb-you');
    const youSub = $('#lb-you-sub');
    const youRight = $('#lb-you-right');

    const modal = $('#lb-modal');
    const modalTitle = $('#lb-modal-title');
    const modalSub = $('#lb-modal-sub');
    const modalBody = $('#lb-modal-body');
    const openRulesBtn = $('#lb-rules-btn');
    const openAwardsBtn = $('#lb-awards-btn');
    const closeBtn = $('#lb-close');
    const backdrop = $('#lb-backdrop');

    const openModal = () => modal?.classList.remove('hidden');
    const closeModal = () => modal?.classList.add('hidden');

    let lastRules = null;
    const setModal = (mode) => {
        if (mode === 'awards') renderAwards();
        else renderRules(lastRules);
        openModal();
    };

    openRulesBtn?.addEventListener('click', () => setModal('rules'));
    openAwardsBtn?.addEventListener('click', () => setModal('awards'));
    closeBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    const EM_DASH = '\u2014';
    const MID_DOT = '\u00B7';
    const FIRE = '\uD83D\uDD25';

    const fmtJoin = (iso) => {
        const d = new Date(String(iso || ''));
        if (Number.isNaN(d.getTime())) return EM_DASH;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const initialsFromName = (name) => String(name || '')
        .trim()
        .split(/\s+/)
        .map(s => s.slice(0, 1))
        .join('')
        .slice(0, 2)
        .toUpperCase() || '??';

    const normalizeBadges = (raw) => {
        const list = Array.isArray(raw) ? raw : [];
        const out = [];
        const seen = new Set();
        list.forEach((b) => {
            const id = String(b?.id || b?.label || '').trim();
            const label = String(b?.label || '').trim();
            if (!label) return;
            if (id && seen.has(id)) return;
            if (id) seen.add(id);
            out.push({
                id,
                label,
                tone: String(b?.tone || 'slate'),
                desc: String(b?.desc || '')
            });
        });
        return out;
    };

    const escapeAttr = (s) => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const badgePill = (b) => {
        const id = String(b?.id || '').trim();
        const label = String(b?.label || '').trim();
        if (!label) return '';
        const tone = String(b?.tone || 'slate').trim().toLowerCase();
        const title = String(b?.desc || '').trim();
        const award = id ? (AWARD_MAP?.[id] || null) : null;
        const iconAttr = award?.icon ? ` data-icon="${escapeAttr(award.icon)}"` : '';
        const awardAttr = award ? ` data-award="${escapeAttr(id)}"` : '';
        return `<span class="lb-pill" data-tone="${tone}"${awardAttr}${iconAttr} ${title ? `title="${escapeAttr(title)}"` : ''}>${label}</span>`;
    };

    const setModalHead = ({ title, sub, ariaLabel } = {}) => {
        if (modalTitle) modalTitle.textContent = String(title || '');
        if (modalSub) modalSub.textContent = String(sub || '');
        if (modal && ariaLabel) modal.setAttribute('aria-label', String(ariaLabel));
    };

    const renderRules = (rules) => {
        if (!modalBody) return;
        lastRules = rules || lastRules;

        const src = rules || lastRules || {};
        const pts = Array.isArray(src?.points) ? src.points : [];
        const cadence = String(src?.cadence || 'Leaderboard resets monthly.');

        setModalHead({
            title: 'Rules',
            sub: 'Points are based on actions you can take on this website.',
            ariaLabel: 'Leaderboard rules'
        });

        modalBody.innerHTML = `
            <div class="ns-muted" style="font-size:12px;">${cadence}</div>
            ${pts.map(r => `
                <div class="lb-rule">
                    <div>
                        <div class="lb-rule-title">${r.action}</div>
                        ${r.note ? `<div class="lb-rule-note">${r.note}</div>` : ''}
                    </div>
                    <div class="lb-rule-points">+${r.points}</div>
                </div>
            `).join('')}
        `;
    };

    const renderList = (rows) => {
        if (!listEl) return;
        listEl.innerHTML = rows.map(r => `
            <div class="lb-row ${Number(r.rank) === 1 ? 'is-gold' : ''} ${Number(r.rank) === 2 ? 'is-silver' : ''} ${Number(r.rank) === 3 ? 'is-bronze' : ''}">
                <div class="lb-rankbox" aria-label="Rank ${r.rank}">
                    <div class="lb-ranknum">#${r.rank}</div>
                    <div class="lb-avatar ${r.avatarUrl ? '' : 'noimg'}">
                        ${r.avatarUrl ? `<img src="${r.avatarUrl}" alt="${escapeAttr(r.displayName)}" onerror="this.parentElement.classList.add('noimg'); this.remove();">` : `<div class="lb-avatar-fallback" aria-hidden="true">${initialsFromName(r.displayName)}</div>`}
                    </div>
                </div>
                <div class="lb-main">
                    <div class="lb-topline">
                        <div class="lb-name">${r.displayName}</div>
                        <div class="lb-handle ns-muted">${r.handle || ''}</div>
                    </div>
                    <div class="lb-badges" aria-label="Badges">
                        ${(() => {
                            const base = normalizeBadges(r.badges);
                            if (Number(r.streakDays || 0) > 1) base.push({ id: 'streak', label: `${FIRE} ${Number(r.streakDays)}d`, tone: 'amber', desc: 'Daily logging streak.' });
                            base.push({ id: 'who', label: r.isBot ? 'Community' : 'You', tone: r.isBot ? 'slate' : 'teal', desc: '' });
                            base.push({ id: 'joined', label: `Joined ${fmtJoin(r.joinedAt)}`, tone: 'slate', desc: '' });
                            const max = 7;
                            const shown = base.slice(0, max);
                            const extra = base.length > max ? base.length - max : 0;
                            const pills = shown.map(badgePill).join('');
                            const more = extra ? `<span class="lb-pill" data-tone="slate" title="${extra} more badges">+${extra}</span>` : '';
                            return pills + more;
                        })()}
                    </div>
                    ${r.bio ? `<div class="lb-bio">${String(r.bio)}</div>` : ''}
                </div>
                <div class="lb-right">
                    <div class="lb-points">${Number(r.points || 0).toLocaleString()} pts</div>
                </div>
            </div>
        `).join('');
    };

    // Local fallback (for static hosting / no Node server).
    const sha256Hex = async (input) => {
        const msgUint8 = new TextEncoder().encode(String(input));
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const seedFromString = async (str) => {
        const h = await sha256Hex(str);
        return (parseInt(h.slice(0, 8), 16) >>> 0) || 1;
    };

    const mulberry32 = (seed) => {
        let t = seed >>> 0;
        return () => {
            t += 0x6D2B79F5;
            let x = t;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    };

    const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);

    const encodeSvgDataUrl = (svg) => {
        const bytes = new TextEncoder().encode(String(svg || ''));
        let bin = '';
        bytes.forEach((b) => { bin += String.fromCharCode(b); });
        return `data:image/svg+xml;base64,${btoa(bin)}`;
    };

    const portraitUrl = ({ seed, gender = 'men' } = {}) => {
        const g = gender === 'women' ? 'women' : 'men';
        const n = Math.abs(Number(seed) || 1) % 100; // randomuser portraits: 0..99
        return `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
    };

    const avatarSvg = ({ initials, a, b }) => `
      <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${String(a || '#2dd4bf')}"/>
            <stop offset="1" stop-color="${String(b || '#f59e0b')}"/>
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="62" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="4"/>
        <text x="64" y="72" text-anchor="middle" font-family="Space Grotesk, Arial" font-size="42" font-weight="800" fill="rgba(16,12,10,0.86)">${String(initials || '?').slice(0, 3).toUpperCase()}</text>
      </svg>
    `.trim();

    const AWARDS = Object.freeze([
        { id: 'streak_3', label: 'Spark', tone: 'sky', icon: '✨', desc: 'Momentum starts here.', how: 'Log a daily check-in 3 days in a row.' },
        { id: 'streak_7', label: 'Week Warrior', tone: 'amber', icon: '🔥', desc: 'A full week locked in.', how: 'Log a daily check-in 7 days in a row.' },
        { id: 'streak_14', label: 'Two-Week Titan', tone: 'violet', icon: '⚡', desc: 'Consistency is real now.', how: 'Log a daily check-in 14 days in a row.' },
        { id: 'streak_30', label: 'Month Locked', tone: 'indigo', icon: '🏆', desc: 'Elite consistency.', how: 'Log a daily check-in 30 days in a row.' },

        { id: 'workout_1', label: 'First Workout', tone: 'teal', icon: '💪', desc: 'Day one done.', how: 'Save 1 workout (Training) this month.' },
        { id: 'workout_5', label: '5 Workouts', tone: 'emerald', icon: '🏋️', desc: 'Building a habit.', how: 'Save 5 workouts (Training) this month.' },
        { id: 'workout_10', label: '10 Workouts', tone: 'indigo', icon: '🧱', desc: 'Stacking sessions.', how: 'Save 10 workouts (Training) this month.' },
        { id: 'workout_15', label: '15 Workouts', tone: 'rose', icon: '🦾', desc: 'Work ethic on display.', how: 'Save 15 workouts (Training) this month.' },
        { id: 'workout_20', label: '20 Workouts', tone: 'amber', icon: '🏔️', desc: 'Serious volume.', how: 'Save 20 workouts (Training) this month.' },

        { id: 'checkin_1', label: 'First Check-in', tone: 'slate', icon: '📝', desc: 'Start tracking.', how: 'Save 1 daily check-in this month.' },
        { id: 'checkin_7', label: '7 Check-ins', tone: 'sky', icon: '📆', desc: 'Week of awareness.', how: 'Save 7 daily check-ins this month.' },
        { id: 'checkin_14', label: '14 Check-ins', tone: 'violet', icon: '🧾', desc: 'Tracking becomes normal.', how: 'Save 14 daily check-ins this month.' },
        { id: 'checkin_20', label: '20 Check-ins', tone: 'emerald', icon: '✅', desc: 'Relentless.', how: 'Save 20 daily check-ins this month.' },

        { id: 'grocery_1', label: 'First Grocery Plan', tone: 'lime', icon: '🛒', desc: 'Plan beats impulse.', how: 'Save 1 grocery plan this month.' },
        { id: 'grocery_3', label: 'Grocery Routine', tone: 'teal', icon: '🧺', desc: 'Shopping with intention.', how: 'Save 3 grocery plans this month.' },
        { id: 'grocery_6', label: 'Grocery Strategist', tone: 'indigo', icon: '🧭', desc: 'Systems win.', how: 'Save 6 grocery plans this month.' },
        { id: 'grocery_10', label: 'Grocery Architect', tone: 'amber', icon: '🏗️', desc: 'Meal planning pro.', how: 'Save 10 grocery plans this month.' },

        { id: 'mealprep_1', label: 'Meal Prep: Yes', tone: 'rose', icon: '🥗', desc: 'Prep starts now.', how: 'Mark Meal Prep = Yes on a daily check-in.' },
        { id: 'mealprep_7', label: 'Meal Prep Week', tone: 'emerald', icon: '🍱', desc: 'Prepared beats stressed.', how: 'Mark Meal Prep = Yes on 7 check-ins this month.' },
        { id: 'mealprep_14', label: 'Meal Prep Machine', tone: 'amber', icon: '🥘', desc: 'Kitchen consistency.', how: 'Mark Meal Prep = Yes on 14 check-ins this month.' },

        { id: 'planmeals_1', label: 'Meals On Plan', tone: 'teal', icon: '🎯', desc: 'Execute the plan.', how: 'Mark Meals On Plan = Yes on a daily check-in.' },
        { id: 'planmeals_7', label: 'On-Plan Week', tone: 'violet', icon: '📅', desc: 'Routine clicks.', how: 'Mark Meals On Plan = Yes on 7 check-ins this month.' },
        { id: 'planmeals_14', label: 'On-Plan Operator', tone: 'indigo', icon: '🧠', desc: 'Discipline on demand.', how: 'Mark Meals On Plan = Yes on 14 check-ins this month.' },

        { id: 'measures_1', label: 'Measurements Logged', tone: 'sky', icon: '📏', desc: 'Data > vibes.', how: 'Log at least 1 measurement field on a check-in.' },
        { id: 'triple_measures_1', label: 'Full Set', tone: 'amber', icon: '🎯', desc: 'All three tracked.', how: 'Log waist + chest + hips on the same check-in.' },
        { id: 'measures_7', label: 'Metrics Week', tone: 'teal', icon: '📐', desc: 'Tracking habit formed.', how: 'Log measurements on 7 different days this month.' },
        { id: 'measures_21', label: 'Metrics Master', tone: 'violet', icon: '📊', desc: 'Serious tracking.', how: 'Log 21 total measurement fields this month.' },

        { id: 'points_100', label: '100 Points Club', tone: 'lime', icon: '💯', desc: 'First milestone.', how: 'Earn 100 leaderboard points this month.' },
        { id: 'points_500', label: '500 Points', tone: 'amber', icon: '🥇', desc: 'Big month.', how: 'Earn 500 leaderboard points this month.' },
        { id: 'points_1000', label: '1,000 Points', tone: 'indigo', icon: '👑', desc: 'Monster month.', how: 'Earn 1,000 leaderboard points this month.' }
    ]);

    const AWARD_MAP = Object.freeze(Object.fromEntries(AWARDS.map((a) => [a.id, a])));

    const renderAwards = () => {
        if (!modalBody) return;

        setModalHead({
            title: 'Awards',
            sub: '30 achievements anyone can earn — each one is tied to real actions on this site.',
            ariaLabel: 'Leaderboard awards'
        });

        modalBody.innerHTML = `
            <div class="lb-awards-grid" aria-label="Awards list">
                ${AWARDS.map((a) => `
                    <div class="lb-award" data-award="${escapeAttr(a.id)}" data-tone="${escapeAttr(a.tone)}" data-icon="${escapeAttr(a.icon)}" role="group" aria-label="${escapeAttr(a.label)}">
                        <div class="lb-award-top">
                            <span class="lb-pill lb-award-pill" data-tone="${escapeAttr(a.tone)}" data-award="${escapeAttr(a.id)}" data-icon="${escapeAttr(a.icon)}" title="${escapeAttr(a.desc)}">${a.label}</span>
                        </div>
                        <div class="lb-award-how">${a.how}</div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const pickAward = (id) => AWARD_MAP[String(id || '').trim()] || null;

    const tierPick = (n, tiers) => {
        const value = Number(n || 0);
        for (const t of (Array.isArray(tiers) ? tiers : [])) {
            if (value >= Number(t.min || 0)) return t.id;
        }
        return '';
    };

    const computeBadgesLocal = (entry) => {
        const points = Number(entry?.points || 0);
        const streakDays = Number(entry?.streakDays || 0);
        const b = entry?.breakdown && typeof entry.breakdown === 'object' ? entry.breakdown : {};
        const workouts = Number(b.workouts || 0);
        const checkins = Number(b.checkins || 0);
        const groceryPlans = Number(b.groceryPlans || 0);
        const mealPrepDays = Number(b.mealPrepDays || Math.floor(Number(b.mealPrepBonus || 0) / 5));
        const mealsOnPlanDays = Number(b.mealsOnPlanDays || Math.floor(Number(b.mealsOnPlanBonus || 0) / 5));
        const measurementFields = Number(b.measurementBonus || 0);
        const measurementDays = Number(b.measurementDays || 0);
        const tripleMeasureDays = Number(b.tripleMeasureDays || 0);

        const picks = [];
        const add = (id) => { if (id) picks.push(id); };

        add(tierPick(points, [
            { id: 'points_1000', min: 1000 },
            { id: 'points_500', min: 500 },
            { id: 'points_100', min: 100 }
        ]));

        add(tierPick(streakDays, [
            { id: 'streak_30', min: 30 },
            { id: 'streak_14', min: 14 },
            { id: 'streak_7', min: 7 },
            { id: 'streak_3', min: 3 }
        ]));

        add(tierPick(workouts, [
            { id: 'workout_20', min: 20 },
            { id: 'workout_15', min: 15 },
            { id: 'workout_10', min: 10 },
            { id: 'workout_5', min: 5 },
            { id: 'workout_1', min: 1 }
        ]));

        add(tierPick(checkins, [
            { id: 'checkin_20', min: 20 },
            { id: 'checkin_14', min: 14 },
            { id: 'checkin_7', min: 7 },
            { id: 'checkin_1', min: 1 }
        ]));

        const utilities = [];
        const pushUtil = (id, score) => { if (id) utilities.push({ id, score: Number(score || 0) }); };

        pushUtil(tierPick(groceryPlans, [
            { id: 'grocery_10', min: 10 },
            { id: 'grocery_6', min: 6 },
            { id: 'grocery_3', min: 3 },
            { id: 'grocery_1', min: 1 }
        ]), groceryPlans);

        pushUtil(tierPick(mealPrepDays, [
            { id: 'mealprep_14', min: 14 },
            { id: 'mealprep_7', min: 7 },
            { id: 'mealprep_1', min: 1 }
        ]), mealPrepDays);

        pushUtil(tierPick(mealsOnPlanDays, [
            { id: 'planmeals_14', min: 14 },
            { id: 'planmeals_7', min: 7 },
            { id: 'planmeals_1', min: 1 }
        ]), mealsOnPlanDays);

        let measuresId = '';
        if (measurementFields >= 21) measuresId = 'measures_21';
        else if (measurementDays >= 7) measuresId = 'measures_7';
        else if (measurementFields >= 1) measuresId = 'measures_1';
        pushUtil(measuresId, measurementFields + measurementDays);

        if (tripleMeasureDays >= 1) pushUtil('triple_measures_1', 10_000);

        utilities.sort((a, b) => b.score - a.score);
        add(utilities[0]?.id || '');

        const seen = new Set();
        const out = [];
        for (const id of picks) {
            const award = pickAward(id);
            if (!award?.id || seen.has(award.id)) continue;
            seen.add(award.id);
            out.push({ id: award.id, label: award.label, tone: award.tone, desc: award.how || award.desc || '' });
            if (out.length >= 5) break;
        }
        return out;
    };

    const makeLocalBotPool = async ({ month, day }) => {
        const seed = await seedFromString(`ode_leaderboard_${month}`);
        const rnd = mulberry32(seed);
        const palette = [
            ['#22c55e', '#06b6d4'],
            ['#a78bfa', '#f472b6'],
            ['#f97316', '#facc15'],
            ['#60a5fa', '#34d399'],
            ['#fb7185', '#f59e0b'],
            ['#38bdf8', '#a3e635'],
            ['#fda4af', '#93c5fd']
        ];

        const names = [
            { displayName: 'Mia Carter', handle: '@miacarter' },
            { displayName: 'Jordan Lee', handle: '@jlee' },
            { displayName: 'Noah Patel', handle: '@noahpatel' },
            { displayName: 'Ava Nguyen', handle: '@ava.ng' },
            { displayName: 'Elijah Brooks', handle: '@ebrooks' },
            { displayName: 'Sofia Ramirez', handle: '@sofiaram' },
            { displayName: 'Caleb Johnson', handle: '@calebj' }
        ];
        const bios = [
            'Cutting season. Steps daily. Protein first.',
            'Strength focus. Sleep locked in.',
            'Recomp in progress. Consistency > perfection.',
            'Meal prep Sundays. Gym before work.',
            'Tracking macros, lifting heavy, staying humble.',
            'New PRs this month. Showing up anyway.',
            'Bulking clean. Mobility every session.'
        ];

        const joinOffsets = new Set();
        while (joinOffsets.size < 7) joinOffsets.add(Math.floor(rnd() * 7));
        const joinList = Array.from(joinOffsets).sort((a, b) => a - b);
        const today = new Date(`${day}T00:00:00Z`);

        const bots = [];
        for (let idx = 0; idx < names.length; idx += 1) {
            const n = names[idx];
            const [a, b] = palette[idx % palette.length];
            const initials = n.displayName.split(' ').map(s => s.slice(0, 1)).join('').slice(0, 2);
            const base = 420 + Math.floor(rnd() * 280) + idx * 8;

            const daySeed = await seedFromString(`ode_leaderboard_${month}_${day}_${n.handle}`);
            const dr = mulberry32(daySeed);
            const delta = Math.floor(dr() * 31) - 15;

            const joinDaysAgo = joinList[idx] ?? idx;
            const joinedAt = new Date(today);
            joinedAt.setUTCDate(joinedAt.getUTCDate() - joinDaysAgo);

            const streakSeed = await seedFromString(`ode_leaderboard_streak_${month}_${day}_${n.handle}`);
            const sr = mulberry32(streakSeed);
            const streakDays = 2 + Math.floor(sr() * 18);

            const avatarSeed = await seedFromString(`ode_leaderboard_avatar_${month}_${day}_${n.handle}`);
            const ar = mulberry32(avatarSeed);
            const gender = ar() > 0.5 ? 'women' : 'men';
            const hasAvatar = true;

            const points = Math.max(0, base + delta);
            const workouts = Math.min(24, Math.max(1, Math.round(points / 85)));
            const checkins = Math.min(26, Math.max(streakDays, Math.round(points / 35)));
            const groceryPlans = Math.min(12, Math.max(0, Math.round(points / 180)));
            const mealPrepDays = Math.min(checkins, Math.max(0, Math.round(checkins * (0.30 + dr() * 0.30))));
            const mealsOnPlanDays = Math.min(checkins, Math.max(0, Math.round(checkins * (0.35 + dr() * 0.35))));
            const measurementDays = Math.min(checkins, Math.max(0, Math.round(checkins * (0.20 + dr() * 0.30))));
            const fieldsPerMeasureDay = 1 + Math.floor(dr() * 3);
            const measurementBonus = Math.min(measurementDays * 3, measurementDays * fieldsPerMeasureDay);
            const tripleMeasureDays = measurementDays > 0 && dr() > 0.62 ? 1 : 0;

            bots.push({
                id: `bot_${month}_${idx}`,
                displayName: n.displayName,
                handle: n.handle,
                avatarUrl: hasAvatar ? portraitUrl({ seed: avatarSeed, gender }) : '',
                joinedAt: joinedAt.toISOString(),
                points,
                breakdown: {
                    workouts,
                    checkins,
                    groceryPlans,
                    mealPrepDays,
                    mealsOnPlanDays,
                    measurementDays,
                    measurementBonus,
                    tripleMeasureDays
                },
                bio: bios[idx] || '',
                streakDays,
                isBot: true
            });
        }

        const shuffleSeed = await seedFromString(`ode_leaderboard_shuffle_${month}`);
        const sr = mulberry32(shuffleSeed);
        for (let i = bots.length - 1; i > 0; i -= 1) {
            const j = Math.floor(sr() * (i + 1));
            [bots[i], bots[j]] = [bots[j], bots[i]];
        }

        const ranked = bots
            .slice()
            .sort((a, b) => b.points - a.points)
            .map((row, i) => ({ ...row, rank: i + 1 }));

        const withBadges = [];
        for (const row of ranked) {
            withBadges.push({ ...row, badges: await computeBadgesLocal(row, { month, day }) });
        }

        return withBadges;
    };

    const load = async () => {
        try {
            const resp = await fetch('/api/leaderboard', { credentials: 'include' });
            if (resp.status === 404) {
                const month = monthKey(new Date());
                const day = todayKey(new Date());
                const entries = await makeLocalBotPool({ month, day });
                renderRules({ cadence: 'Leaderboard resets monthly.', points: [] });
                renderList(entries);
                if (youEl) youEl.classList.add('hidden');
                if (location.hash === '#awards') setModal('awards');
                else if (location.hash === '#rules') setModal('rules');
                return;
            }

            const data = await resp.json();
            if (!resp.ok) {
                if (listEl) listEl.innerHTML = `<div class="ns-muted">Failed to load leaderboard.</div>`;
                return;
            }

            renderRules(data?.rules);
            const entries = Array.isArray(data?.entries) ? data.entries : [];
            renderList(entries);

            const you = data?.you || null;
            if (you && youEl && youSub && youRight) {
                youEl.classList.remove('hidden');
                youSub.textContent = `Rank #${you.rank} ${MID_DOT} ${Number(you.points || 0).toLocaleString()} pts`;
                youRight.textContent = `This month (${data?.month || ''})`;
            } else if (youEl) {
                youEl.classList.add('hidden');
            }

            if (location.hash === '#awards') setModal('awards');
            else if (location.hash === '#rules') setModal('rules');
        } catch {
            if (listEl) listEl.innerHTML = `<div class="ns-muted">Failed to load leaderboard.</div>`;
        }
    };

    document.addEventListener('DOMContentLoaded', load);
})();
