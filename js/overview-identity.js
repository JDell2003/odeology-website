(() => {
    const $ = (sel, root = document) => root.querySelector(sel);

    /* ================================================================
       DATA
       Stats are 0-100. This object is the single input for the chart,
       the character type, the title, and the rank. Replace the demo
       values with real data later: app-tracked history (workouts,
       check-ins, grocery/meal adherence) plus integrations
       (Apple Health, Fitbit, Google Fit).
       Anything written to localStorage under 'ovIdentityStats' /
       'ovIdentityStatsPrev' overrides the demo values, so the backend
       can start feeding this without touching the render code.
       ================================================================ */
    const DEMO_STATS = { strength: 72, cardio: 45, consistency: 88, nutrition: 60, recovery: 55, progress: 70 };
    const DEMO_STATS_PREV = { strength: 64, cardio: 41, consistency: 80, nutrition: 57, recovery: 52, progress: 56 };

    const AXES = [
        { key: 'strength', label: 'Strength' },
        { key: 'cardio', label: 'Cardio' },
        { key: 'consistency', label: 'Consistency' },
        { key: 'nutrition', label: 'Nutrition' },
        { key: 'recovery', label: 'Recovery' },
        { key: 'progress', label: 'Progress' }
    ];

    const readStoredStats = (storageKey) => {
        try {
            const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (!raw || typeof raw !== 'object') return null;
            const clean = {};
            for (const axis of AXES) {
                const v = Number(raw[axis.key]);
                if (!Number.isFinite(v)) return null;
                clean[axis.key] = Math.max(0, Math.min(100, v));
            }
            return clean;
        } catch {
            return null;
        }
    };

    /* ================================================================
       CHARACTER TYPES — editable config.
       Matched top to bottom; the FIRST type whose check() passes wins,
       so order is part of the tuning. Each check receives:
         s      — the stats object
         avg    — mean of the six stats
         min    — lowest stat
         max    — highest stat
         spread — max minus min (balance measure)
       rankWeights bias the rank score toward the stats that define
       the type (they are normalised, so any positive numbers work).
       ================================================================ */
    /* Radar-tier rules (synced with js/leaderboard.js TIER_RINGS,
       2026-07-11): each tier is a ring on the radar - you claim it by
       COVERING it (average reach) or PIERCING it (one stat past the
       spike gate). Ghost and Monk are removed from the ladder.
       Specialist shapes: Ranger = cardio/recovery engine without the
       strength; Berserker = strength/progress surge with cardio,
       consistency and nutrition way off; Mage = the balanced,
       consistency+nutrition build - the road to Knight. */
    const specialistTier = (s, avg, max) => avg >= 50 || max >= 78;
    const CHARACTER_TYPES = [
        {
            id: 'king', name: 'King', emblem: '♛',
            blurb: 'Everything high and balanced - or one stat the realm has never seen. You have mastered it.',
            rankWeights: { strength: 1, cardio: 1, consistency: 1, nutrition: 1, recovery: 1, progress: 1 },
            check: (s, avg, min, max) => avg >= 85 || max >= 98
        },
        {
            id: 'knight', name: 'Knight', emblem: '♞',
            blurb: 'Strong everywhere and it shows. You show up and you deliver.',
            rankWeights: { strength: 2, cardio: 0.75, consistency: 2, nutrition: 1, recovery: 1, progress: 1 },
            check: (s, avg, min, max) => avg >= 70 || max >= 92
        },
        {
            id: 'berserker', name: 'Berserker', emblem: '⚔',
            blurb: 'Strength and progress surge ahead - cardio, consistency and nutrition left behind.',
            rankWeights: { strength: 2.5, cardio: 0.75, consistency: 1, nutrition: 0.75, recovery: 1.25, progress: 1.75 },
            check: (s, avg, min, max) => specialistTier(s, avg, max)
                && (s.strength + s.progress) / 2 >= (s.cardio + s.recovery) / 2
                && (s.strength + s.progress) / 2 - (s.cardio + s.consistency + s.nutrition) / 3 >= 18
        },
        {
            id: 'ranger', name: 'Ranger', emblem: '➳',
            blurb: 'Cardio and recovery lead the way. Strength is the missing piece.',
            rankWeights: { strength: 0.75, cardio: 2.5, consistency: 1.25, nutrition: 1, recovery: 1.5, progress: 1 },
            check: (s, avg, min, max) => specialistTier(s, avg, max)
                && (s.cardio + s.recovery) / 2 >= 58
                && s.strength <= (s.cardio + s.recovery) / 2 - 12
        },
        {
            id: 'mage', name: 'Mage', emblem: '✦',
            blurb: 'Balanced and disciplined - consistency and nutrition steer the build. The road to Knight.',
            rankWeights: { strength: 0.75, cardio: 1, consistency: 1.75, nutrition: 1.75, recovery: 1.25, progress: 1.25 },
            check: (s, avg, min, max) => specialistTier(s, avg, max)
        },
        {
            id: 'squire', name: 'Squire', emblem: '⚑',
            blurb: 'Decent across the board and still developing. On the path.',
            rankWeights: { strength: 1, cardio: 1, consistency: 1, nutrition: 1, recovery: 1, progress: 1.5 },
            check: (s, avg, min, max) => avg >= 35 || max >= 60
        },
        {
            id: 'peasant', name: 'Peasant', emblem: '⚒',
            blurb: 'Early days. Not an insult — it is where everyone starts. You climb out.',
            rankWeights: { strength: 1, cardio: 1, consistency: 1, nutrition: 1, recovery: 1, progress: 1.5 },
            check: () => true
        }
    ];

    /* ================================================================
       TITLES — editable config.
       Rule: every title must NAME the stat it is judging, so the
       meaning is instantly obvious. Two layers:
       1. TITLE_OVERRIDES — hand-tuned titles for specific top/bottom
          stat combos past a gap threshold; first match wins.
       2. The generated matrix — STRONG_WORD[top] + a gap-tier phrase
          naming the bottom stat. 6 tops x 5 bottoms x 3 gap tiers
          = 90 generated titles, plus overrides and the balanced set,
          which puts the pool well past 100.
       ================================================================ */
    const TITLE_OVERRIDES = [
        { top: 'strength', bottom: 'consistency', minGap: 28, title: 'The Absent Powerhouse' },
        { top: 'consistency', bottom: 'strength', minGap: 28, title: 'Dedicated Lightweight' },
        { top: 'nutrition', bottom: 'strength', minGap: 28, title: 'Well-Fed, Untrained' },
        { top: 'nutrition', bottom: 'consistency', minGap: 28, title: 'Perfect Diet, No-Show Athlete' },
        { top: 'cardio', bottom: 'strength', minGap: 28, title: 'All Engine, No Muscle' },
        { top: 'strength', bottom: 'cardio', minGap: 28, title: 'Strong but Gassed in Minutes' },
        { top: 'strength', bottom: 'recovery', minGap: 28, title: 'Powerhouse Running on No Sleep' },
        { top: 'consistency', bottom: 'nutrition', minGap: 28, title: 'Never Misses a Session, Always Misses a Meal' },
        { top: 'recovery', bottom: 'consistency', minGap: 28, title: 'Fully Rested, Rarely Present' },
        { top: 'progress', bottom: 'consistency', minGap: 28, title: 'Rising Fast on Borrowed Consistency' },
        { top: 'cardio', bottom: 'nutrition', minGap: 28, title: 'Big Engine, Junk Fuel' },
        { top: 'strength', bottom: 'nutrition', minGap: 28, title: 'Strong Despite the Diet' }
    ];

    const STRONG_WORD = {
        strength: 'The Powerhouse',
        cardio: 'The Engine',
        consistency: 'The Ever-Present',
        nutrition: 'The Well-Fed',
        recovery: 'The Well-Rested',
        progress: 'The Fast Riser'
    };

    // Gap tiers: how hard the weak stat gets roasted. Each phrase names the stat.
    const GAP_TIERS = [
        { minGap: 40, phrase: (label) => `Allergic to ${label}` },
        { minGap: 25, phrase: (label) => `Dodging ${label}` },
        { minGap: 0, phrase: (label) => `Working on ${label}` }
    ];

    // When the stats are flat (no meaningful gap), the title reads the level instead.
    const BALANCED_TITLES = [
        { minAvg: 75, title: 'The Complete Athlete' },
        { minAvg: 45, title: 'The All-Rounder in Training' },
        { minAvg: 0, title: 'The Blank Slate' }
    ];

    const pickTitle = (stats) => {
        const entries = AXES.map(a => ({ key: a.key, label: a.label, value: stats[a.key] }));
        const sorted = [...entries].sort((a, b) => b.value - a.value);
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];
        const gap = top.value - bottom.value;
        const avg = entries.reduce((sum, e) => sum + e.value, 0) / entries.length;

        if (gap < 15) {
            const t = BALANCED_TITLES.find(b => avg >= b.minAvg);
            return t ? t.title : BALANCED_TITLES[BALANCED_TITLES.length - 1].title;
        }
        const override = TITLE_OVERRIDES.find(o => o.top === top.key && o.bottom === bottom.key && gap >= o.minGap);
        if (override) return override.title;
        const tier = GAP_TIERS.find(t => gap >= t.minGap) || GAP_TIERS[GAP_TIERS.length - 1];
        return `${STRONG_WORD[top.key]}, ${tier.phrase(bottom.label)}`;
    };

    /* ================================================================
       RANK — score within your character type.
       Weighted average of the six stats (weighted toward the stats
       that define the type) + a balance bonus (no glaring weak stat)
       + a momentum bonus (Progress trending up vs last month).

       BACKEND HOOKUP: replace simulateRank() with a leaderboard API
       call that returns { rank, totalInType, deltaThisWeek } for all
       users sharing this character type. computeScore() is the number
       the backend should sort by.
       ================================================================ */
    const computeScore = (stats, type, prevStats) => {
        let weightSum = 0;
        let score = 0;
        for (const axis of AXES) {
            const w = type.rankWeights[axis.key] || 1;
            score += stats[axis.key] * w;
            weightSum += w;
        }
        score /= weightSum;
        const min = Math.min(...AXES.map(a => stats[a.key]));
        const balanceBonus = min >= 60 ? 4 : min >= 45 ? 2 : 0;
        const momentum = prevStats ? Math.max(0, stats.progress - prevStats.progress) : 0;
        const momentumBonus = Math.min(4, momentum * 0.25);
        return Math.min(100, score + balanceBonus + momentumBonus);
    };

    // Deterministic stand-in populations until the real leaderboard connects.
    const TYPE_POPULATION = {
        king: 3120, knight: 18450, berserker: 9870, ranger: 14220,
        mage: 14670, squire: 26410, peasant: 31880
    };

    const simulateRank = (score, type, prevScore) => {
        const total = TYPE_POPULATION[type.id] || 10000;
        // Map score to a percentile with a soft curve so mid scores don't feel bottom-tier.
        const pct = Math.pow(Math.max(0, Math.min(100, score)) / 100, 1.6);
        const rank = Math.max(1, Math.round(total * (1 - pct)));
        const prevPct = Math.pow(Math.max(0, Math.min(100, prevScore)) / 100, 1.6);
        const prevRank = Math.max(1, Math.round(total * (1 - prevPct)));
        return { rank, total, delta: prevRank - rank };
    };

    const pickType = (stats) => {
        const values = AXES.map(a => stats[a.key]);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const spread = max - min;
        return CHARACTER_TYPES.find(t => t.check(stats, avg, min, max, spread)) || CHARACTER_TYPES[CHARACTER_TYPES.length - 1];
    };

    /* ================================================================
       RADAR CHART — plain SVG, no libraries.
       ================================================================ */
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const VB_W = 500;
    const VB_H = 380;
    const CX = VB_W / 2;
    const CY = VB_H / 2 + 4;
    const R = 128;
    const LABEL_R = R + 26;

    const svgEl = (tag, attrs = {}) => {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        return el;
    };

    const axisPoint = (i, value, radius = R) => {
        const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
        const r = radius * (value / 100);
        return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
    };

    const polygonPoints = (stats, t = 1, radius = R) =>
        AXES.map((a, i) => axisPoint(i, stats[a.key] * t, radius).map(n => n.toFixed(2)).join(',')).join(' ');

    const buildRadar = (host, stats, prevStats) => {
        const svg = svgEl('svg', {
            viewBox: `0 0 ${VB_W} ${VB_H}`,
            class: 'ov-radar-svg',
            role: 'img',
            'aria-label': 'Radar chart of your six stats: ' + AXES.map(a => `${a.label} ${stats[a.key]}`).join(', ')
        });

        const defs = svgEl('defs');
        defs.innerHTML = `
            <radialGradient id="ov-radar-fill" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.06"></stop>
                <stop offset="70%" stop-color="var(--accent)" stop-opacity="0.28"></stop>
                <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.5"></stop>
            </radialGradient>
            <filter id="ov-radar-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="6" result="blur"></feGaussianBlur>
                <feMerge>
                    <feMergeNode in="blur"></feMergeNode>
                    <feMergeNode in="SourceGraphic"></feMergeNode>
                </feMerge>
            </filter>`;
        svg.appendChild(defs);

        // Grid rings + spokes (recessive)
        const grid = svgEl('g', { class: 'ov-radar-grid' });
        for (const ring of [25, 50, 75, 100]) {
            grid.appendChild(svgEl('polygon', {
                points: AXES.map((a, i) => axisPoint(i, ring).map(n => n.toFixed(2)).join(',')).join(' '),
                class: 'ov-radar-ring'
            }));
        }
        AXES.forEach((a, i) => {
            const [x, y] = axisPoint(i, 100);
            grid.appendChild(svgEl('line', { x1: CX, y1: CY, x2: x, y2: y, class: 'ov-radar-spoke' }));
        });
        svg.appendChild(grid);

        // Last-month overlay (neutral, dashed) — hidden until compare is on
        const prevPoly = svgEl('polygon', { points: polygonPoints(prevStats, 0), class: 'ov-radar-prev hidden' });
        svg.appendChild(prevPoly);

        // Current shape
        const poly = svgEl('polygon', { points: polygonPoints(stats, 0), class: 'ov-radar-shape', filter: 'url(#ov-radar-glow)', fill: 'url(#ov-radar-fill)' });
        svg.appendChild(poly);

        // Vertex dots: dim near center, bright/glowing as scores climb
        const dots = AXES.map((a, i) => {
            const dot = svgEl('circle', { r: 5, class: 'ov-radar-dot', 'data-axis': a.key });
            dot.style.opacity = String(0.35 + 0.65 * (stats[a.key] / 100));
            if (stats[a.key] >= 70) dot.classList.add('is-bright');
            svg.appendChild(dot);
            return dot;
        });

        // Axis labels: name + value, value tinted by score
        AXES.forEach((a, i) => {
            const [x, y] = axisPoint(i, 100, LABEL_R);
            const anchor = Math.abs(x - CX) < 12 ? 'middle' : x > CX ? 'start' : 'end';
            const label = svgEl('text', { x: x.toFixed(1), y: (y - 4).toFixed(1), 'text-anchor': anchor, class: 'ov-radar-label' });
            label.textContent = a.label;
            const value = svgEl('text', { x: x.toFixed(1), y: (y + 12).toFixed(1), 'text-anchor': anchor, class: 'ov-radar-value' });
            value.textContent = stats[a.key];
            if (stats[a.key] >= 70) value.classList.add('is-high');
            if (stats[a.key] < 40) value.classList.add('is-low');
            svg.appendChild(label);
            svg.appendChild(value);
        });

        // Invisible hover targets (bigger than the dots) driving the tooltip
        const tip = $('#ov-radar-tip');
        AXES.forEach((a, i) => {
            const [x, y] = axisPoint(i, stats[a.key]);
            const hit = svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 16, class: 'ov-radar-hit' });
            const show = () => {
                if (!tip) return;
                const compare = host.closest('.ov-identity')?.classList.contains('is-comparing');
                tip.innerHTML = compare
                    ? `<strong>${a.label}</strong> ${stats[a.key]} <span class="ov-tip-prev">was ${prevStats[a.key]}</span>`
                    : `<strong>${a.label}</strong> ${stats[a.key]} / 100`;
                tip.classList.remove('hidden');
                const rect = host.getBoundingClientRect();
                const scale = rect.width / VB_W;
                tip.style.left = `${x * scale}px`;
                tip.style.top = `${(y - 18) * scale}px`;
            };
            const hide = () => tip && tip.classList.add('hidden');
            hit.addEventListener('mouseenter', show);
            hit.addEventListener('mouseleave', hide);
            hit.addEventListener('focus', show);
            hit.addEventListener('blur', hide);
            hit.setAttribute('tabindex', '0');
            hit.setAttribute('role', 'img');
            hit.setAttribute('aria-label', `${a.label}: ${stats[a.key]} out of 100`);
            svg.appendChild(hit);
        });

        host.appendChild(svg);

        const setShape = (t) => {
            poly.setAttribute('points', polygonPoints(stats, t));
            AXES.forEach((a, i) => {
                const [x, y] = axisPoint(i, stats[a.key] * t);
                dots[i].setAttribute('cx', x.toFixed(2));
                dots[i].setAttribute('cy', y.toFixed(2));
            });
        };

        return { setShape, prevPoly };
    };

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const animate = (draw, duration = 950) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            draw(1);
            return;
        }
        const start = performance.now();
        const frame = (now) => {
            const t = Math.min(1, (now - start) / duration);
            draw(easeOutCubic(t));
            if (t < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    };

    /* ================================================================
       NEXT-LEVEL EXPLAINER — "here's exactly what to do to climb"
       Turns the abstract tier rings into concrete, personalized targets:
       not "get strength to 55" but "bench ~155, squat ~210, deadlift
       ~250 for your 175 lb bodyweight". A rank slider walks every tier
       so the user always has something to aim at, and both the balanced
       (cover the ring) and spike (pierce it) paths are spelled out.
       Ring numbers mirror js/leaderboard.js TIER_RINGS.
       ================================================================ */
    /* Every slider stop. Specialist is split into its three real subclasses
       (Ranger / Berserker / Mage — same gate, different spike identity).
       `shape` + `base` describe the SPIKED example build for that rank: the
       radar alternates between the balanced ring and this lopsided-but-legal
       shape so people see both roads. Knight/King shapes still clear the
       floor — spiking is allowed, skipping the fundamentals is not. */
    const NEXT_TIERS = [
        { id: 'peasant', name: 'Peasant', emblem: '⚒' },
        {
            id: 'squire', name: 'Squire', emblem: '⚑', avg: 35, floor: 12, spike: 60, pierce: true,
            shape: null, base: 18 // squire's spike follows the user's strongest stat (dynamic)
        },
        {
            id: 'ranger', name: 'Ranger', emblem: '➳', avg: 50, floor: 20, spike: 78, pierce: true,
            spikeAxis: 'cardio', shape: { cardio: 85, recovery: 68, consistency: 48 }, base: 24,
            spikeNote: 'Ranger is the engine build — cardio carries you, recovery keeps the engine running.'
        },
        {
            id: 'berserker', name: 'Berserker', emblem: '⚔', avg: 50, floor: 20, spike: 78, pierce: true,
            spikeAxis: 'strength', shape: { strength: 85, progress: 65, nutrition: 45 }, base: 24,
            spikeNote: 'Berserker is the raw-strength build — big lifts and logged overload, everything else lags.'
        },
        {
            id: 'mage', name: 'Mage', emblem: '✦', avg: 50, floor: 20, spike: 78, pierce: true,
            spikeAxis: 'consistency', shape: { consistency: 78, nutrition: 74, recovery: 60 }, base: 35,
            spikeNote: 'Mage is the discipline build — consistency and nutrition steer it. Usually the strongest road to Knight.'
        },
        {
            id: 'knight', name: 'Knight', emblem: '♞', avg: 68, floor: 45, pierce: false,
            shape: { strength: 88, cardio: 80 }, base: 60,
            spikeNote: 'You can still spike — but every axis must clear the floor first.'
        },
        {
            id: 'king', name: 'King', emblem: '♛', avg: 82, floor: 60, pierce: false,
            shape: { strength: 95, cardio: 92 }, base: 76,
            spikeNote: 'Kings spike strength AND cardio on top of a web that never dips below 60.'
        }
    ];

    // Spiked example build for a tier: explicit shape values, everything else
    // at the base. Squire has no fixed identity — spike the user's best stat.
    const tierSpikeShape = (tier, curStats) => {
        if (!tier.avg) return null;
        const out = {};
        if (tier.shape) {
            AXES.forEach((a) => { out[a.key] = tier.shape[a.key] || tier.base || tier.floor || 20; });
            return out;
        }
        const best = AXES.slice().sort((x, y) => curStats[y.key] - curStats[x.key])[0].key;
        AXES.forEach((a) => { out[a.key] = a.key === best ? Math.max(tier.spike || 60, 60) : (tier.base || 18); });
        return out;
    };

    const interp = (anchors, x) => {
        if (x <= anchors[0][0]) return anchors[0][1];
        for (let i = 1; i < anchors.length; i++) {
            const [x0, y0] = anchors[i - 1];
            const [x1, y1] = anchors[i];
            if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
        }
        return anchors[anchors.length - 1][1];
    };
    const nearest = (rows, target) => rows.reduce((best, r) => (Math.abs(r[0] - target) < Math.abs(best[0] - target) ? r : best), rows[0]);
    const round5 = (n) => Math.round(n / 5) * 5;

    const readUserCtx = () => {
        let a = {};
        try { const p = JSON.parse(localStorage.getItem('ode_identity_profile_v1') || 'null'); if (p && p.answers) a = p.answers; } catch (e) { /* ignore */ }
        let bw = Number(a.weightValue) > 0 ? (a.weightUnit === 'kg' ? Number(a.weightValue) * 2.20462 : Number(a.weightValue)) : null;
        if (!bw) { const w = Number(localStorage.getItem('ode_ts_current_weight_lb')); if (w > 0) bw = w; }
        let hin = null;
        if (a.heightUnit === 'cm' && Number(a.heightCm) > 0) hin = Number(a.heightCm) / 2.54;
        else if (Number(a.heightFt) > 0) hin = Number(a.heightFt) * 12 + Number(a.heightIn || 0);
        const sex = String(a.gender || '').toLowerCase().charAt(0) === 'f' ? 'female' : 'male';
        return { bw: bw || null, hin: hin || null, sex };
    };

    // Bench multiple of bodyweight by strength stat; squat ~1.35x, DL ~1.6x.
    const BENCH_MULT = [[20, 0.4], [40, 0.7], [55, 0.95], [70, 1.2], [85, 1.5], [100, 1.8]];
    const CARDIO = [[20, 45, 'a brisk 15-min walk without getting winded'], [40, 90, 'jogging 1 mile nonstop'], [55, 120, 'running 1.5 miles nonstop (~12-min mile)'], [70, 150, 'running 3 miles (~10-min mile)'], [85, 200, 'running 5 miles or a sub-9-min mile'], [100, 250, 'running a 10K comfortably']];
    const CONSIST = [[20, 'log 2 days a week'], [40, 'log 3 days a week for a couple weeks'], [55, 'log 4 days a week for 3 weeks straight'], [70, 'log 5 days a week, most weeks'], [85, 'log 6 days a week, month after month'], [100, 'a near-daily streak that never breaks']];
    const NUTR = [[20, 2, 0.5], [40, 4, 0.6], [55, 5, 0.7], [70, 6, 0.85], [85, 6, 1.0], [100, 7, 1.0]];
    const RECOV = [[20, '6 h sleep, hit or miss'], [40, '7 h sleep 4 nights a week'], [55, '7 h sleep 5 nights a week + 1 real rest day'], [70, '7.5 h sleep 6 nights + 2 planned rest days'], [85, '8 h nightly plus active recovery'], [100, '8+ h locked in every night']];
    const PROG = [[20, 'log your weight once a week'], [40, 'log weight weekly plus one measurement'], [55, 'weekly weigh-ins + a measurement — enough to see a 3-week trend'], [70, 'weekly weigh-ins, monthly photos + measurements with a clear trend'], [85, 'full tracking plus logged progressive overload on your lifts'], [100, 'complete data with a steady trend toward your goal']];

    const axisTargetText = (axis, target, ctx) => {
        target = Math.round(target);
        if (axis === 'strength') {
            let mult = interp(BENCH_MULT, target);
            if (ctx.sex === 'female') mult *= 0.72;
            if (ctx.bw) return `bench ~${round5(ctx.bw * mult)} lb, squat ~${round5(ctx.bw * mult * 1.35)} lb, deadlift ~${round5(ctx.bw * mult * 1.6)} lb (for your ${Math.round(ctx.bw)} lb bodyweight)`;
            return `bench ~${mult.toFixed(2)}× bodyweight, squat ~${(mult * 1.35).toFixed(2)}×, deadlift ~${(mult * 1.6).toFixed(2)}× — add your weight in onboarding for exact numbers`;
        }
        if (axis === 'cardio') {
            const mark = nearest(CARDIO, target)[2];
            const mins = Math.round(interp(CARDIO.map((r) => [r[0], r[1]]), target) / 5) * 5;
            return `about ${mins} cardio min/week — think ${mark}`;
        }
        if (axis === 'consistency') return nearest(CONSIST, target)[1];
        if (axis === 'nutrition') {
            const row = nearest(NUTR, target);
            const days = row[1]; const perLb = row[2];
            const pro = ctx.bw ? ` (~${Math.round(ctx.bw * perLb)}g protein/day, about ${perLb.toFixed(2)}g per lb)` : ` (~${perLb.toFixed(2)}g protein per lb of bodyweight)`;
            return `hit your macros ${days} day${days === 1 ? '' : 's'}/week${pro}`;
        }
        if (axis === 'recovery') return nearest(RECOV, target)[1];
        if (axis === 'progress') return nearest(PROG, target)[1];
        return '';
    };

    const tierRadarSvg = (targetVal, curStats, spikeShape) => {
        const size = 168; const c = size / 2; const rr = size / 2 - 22;
        const pt = (i, v) => {
            const ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
            const r = rr * (v / 100);
            return [(c + Math.cos(ang) * r).toFixed(1), (c + Math.sin(ang) * r).toFixed(1)].join(',');
        };
        const rings = [25, 50, 75, 100].map((g) => `<polygon points="${AXES.map((a, i) => pt(i, g)).join(' ')}" class="nl-ring"/>`).join('');
        const spokes = AXES.map((a, i) => { const [x, y] = pt(i, 100).split(','); return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" class="nl-spoke"/>`; }).join('');
        const balancedPoly = AXES.map((a, i) => pt(i, targetVal)).join(' ');
        const spikePoly = spikeShape ? AXES.map((a, i) => pt(i, spikeShape[a.key])).join(' ') : '';
        const curPoly = AXES.map((a, i) => pt(i, curStats[a.key])).join(' ');
        const labels = AXES.map((a, i) => { const [x, y] = pt(i, 122).split(','); return `<text x="${x}" y="${y}" class="nl-axis-label">${a.label.slice(0, 4)}</text>`; }).join('');
        return `<svg viewBox="0 0 ${size} ${size}" class="nl-radar" aria-hidden="true">${rings}${spokes}
            <polygon points="${balancedPoly}" class="nl-target nl-shape-balanced"/>
            ${spikePoly ? `<polygon points="${spikePoly}" class="nl-target nl-shape-spike"/>` : ''}
            <polygon points="${curPoly}" class="nl-current"/>${labels}</svg>`;
    };

    const injectNextLevelStyle = () => {
        if (document.getElementById('ov-nextlevel-style')) return;
        const s = document.createElement('style');
        s.id = 'ov-nextlevel-style';
        s.textContent = `
            .ov-nl-btn{margin-left:8px}
            #ov-nl-modal{position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;padding:18px;
                background:rgba(10,16,26,.55);backdrop-filter:blur(6px)}
            #ov-nl-modal[hidden]{display:none}
            .ov-nl-card{width:min(760px,96vw);max-height:92vh;overflow:auto;border-radius:20px;background:#ffffff;
                border:1px solid rgba(13,34,50,.1);box-shadow:0 40px 90px rgba(10,20,32,.4);color:#102334}
            .ov-nl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(13,34,50,.08)}
            .ov-nl-head h3{margin:0;font:800 18px/1.2 'Space Grotesk',system-ui,sans-serif;color:#102334}
            .ov-nl-head p{margin:2px 0 0;font:500 12px/1.4 system-ui,sans-serif;color:rgba(13,34,50,.55)}
            .ov-nl-close{border:0;background:rgba(13,34,50,.06);width:32px;height:32px;border-radius:999px;cursor:pointer;font-size:16px;color:#102334}
            .ov-nl-close:hover{background:rgba(13,34,50,.12)}
            .ov-nl-slider{padding:14px 20px 4px}
            .ov-nl-ticks{display:flex;justify-content:space-between;margin-top:6px;gap:2px}
            .ov-nl-ticks button{border:0;background:none;cursor:pointer;font:700 10.5px/1.2 system-ui,sans-serif;color:rgba(13,34,50,.45);padding:2px 3px;white-space:nowrap}
            .ov-nl-ticks button.is-on{color:#b9782d}
            .ov-nl-slider input[type=range]{width:100%;accent-color:#b9782d}
            .ov-nl-body{display:grid;grid-template-columns:190px 1fr;gap:16px;padding:8px 20px 20px}
            .nl-radar{width:100%;height:auto}
            .nl-ring{fill:none;stroke:rgba(13,34,50,.1)}
            .nl-spoke{stroke:rgba(13,34,50,.07)}
            .nl-target{fill:rgba(217,161,92,.16);stroke:#b9782d;stroke-width:2;stroke-dasharray:4 3;transition:opacity .55s ease}
            .nl-shape-spike{opacity:0}
            .nl-radar.is-spike .nl-shape-balanced{opacity:0}
            .nl-radar.is-spike .nl-shape-spike{opacity:1}
            .nl-current{fill:rgba(16,35,52,.12);stroke:#243a52;stroke-width:1.6}
            .nl-axis-label{fill:rgba(13,34,50,.55);font:700 8px/1 system-ui,sans-serif;text-anchor:middle;dominant-baseline:middle}
            .ov-nl-shape-note{margin-top:4px;font:700 10.5px/1.3 system-ui,sans-serif;color:#b9782d;min-height:2.6em;transition:opacity .3s ease}
            .ov-nl-target-title{font:800 16px/1.2 'Space Grotesk',system-ui,sans-serif;margin:0 0 2px;color:#102334}
            .ov-nl-legend{display:flex;gap:14px;margin:6px 0 6px;font:600 10.5px/1 system-ui,sans-serif;color:rgba(13,34,50,.55)}
            .ov-nl-legend i{display:inline-block;width:16px;height:0;border-top:2px solid;vertical-align:middle;margin-right:5px}
            .ov-nl-legend .t{border-color:#b9782d;border-top-style:dashed}
            .ov-nl-legend .c{border-color:#243a52}
            .ov-nl-path{border:1px solid rgba(13,34,50,.1);border-radius:12px;padding:10px 12px;margin-bottom:10px;background:rgba(247,250,253,.7)}
            .ov-nl-path h5{margin:0 0 6px;font:800 12px/1.2 system-ui,sans-serif;color:#b9782d}
            .ov-nl-path.locked{opacity:.78}
            .ov-nl-req{display:flex;gap:8px;padding:5px 0;border-top:1px dashed rgba(13,34,50,.1);font:500 12px/1.45 system-ui,sans-serif}
            .ov-nl-req:first-of-type{border-top:0}
            .ov-nl-req .k{flex:0 0 78px;font-weight:800;color:#102334}
            .ov-nl-req .k.done{color:#15803d}
            .ov-nl-req .v{color:rgba(16,35,52,.8)}
            .ov-nl-req .n{color:#b9782d;font-weight:800;white-space:nowrap}
            @media (max-width:640px){
                #ov-nl-modal{padding:0;align-items:flex-end}
                .ov-nl-card{width:100%;max-width:100%;max-height:94vh;border-radius:22px 22px 0 0;border-bottom:0;
                    padding-bottom:env(safe-area-inset-bottom,0)}
                .ov-nl-card::before{content:"";display:block;width:44px;height:4px;border-radius:999px;
                    background:rgba(13,34,50,.18);margin:10px auto 0}
                .ov-nl-head{padding:10px 18px 14px}
                .ov-nl-head h3{font-size:20px}
                .ov-nl-head p{font-size:12.5px}
                .ov-nl-slider{padding:12px 18px 4px}
                .ov-nl-ticks{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}
                .ov-nl-ticks button{padding:8px 4px;border-radius:11px;background:rgba(13,34,50,.05);
                    font-size:12px;color:rgba(13,34,50,.6)}
                .ov-nl-ticks button.is-on{background:rgba(217,161,92,.16);color:#b9782d}
                .ov-nl-body{grid-template-columns:1fr;gap:8px;padding:8px 18px 28px}
                .nl-radar{max-width:256px;margin:0 auto;display:block}
                .ov-nl-legend{justify-content:center;margin-bottom:2px}
                .ov-nl-shape-note{text-align:center;min-height:1.5em;font-size:11.5px}
                .ov-nl-target-title{font-size:18px;margin:6px 0 8px;text-align:center}
                .ov-nl-req{font-size:13px;padding:7px 0}
                .ov-nl-req .k{flex:0 0 88px}
                .ov-nl-path{padding:11px 13px}
                .ov-nl-path h5{font-size:12.5px}
            }
        `;
        document.head.appendChild(s);
    };

    const openNextLevel = (curStats) => {
        injectNextLevelStyle();
        const ctx = readUserCtx();
        const curAvg = AXES.reduce((s, a) => s + curStats[a.key], 0) / AXES.length;
        // Which tier are they in now? The first climbable target is the next one up.
        let curIdx = 0;
        NEXT_TIERS.forEach((t, i) => {
            if (!t.avg) return;
            const min = Math.min(...AXES.map((a) => curStats[a.key]));
            const coversAvg = curAvg >= t.avg && min >= (t.floor || 0);
            const coversPierce = t.pierce && Math.max(...AXES.map((a) => curStats[a.key])) >= t.spike;
            if (coversAvg || coversPierce) curIdx = i;
        });
        const firstTarget = Math.min(curIdx + 1, NEXT_TIERS.length - 1);

        let modal = document.getElementById('ov-nl-modal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'ov-nl-modal';
        modal.innerHTML = `
            <div class="ov-nl-card" role="dialog" aria-label="Your climb to the next level">
                <div class="ov-nl-head">
                    <div><h3>Your climb</h3><p>Slide through the ranks to see exactly what each one takes.</p></div>
                    <button type="button" class="ov-nl-close" data-nl-close aria-label="Close">✕</button>
                </div>
                <div class="ov-nl-slider">
                    <input type="range" min="1" max="${NEXT_TIERS.length - 1}" value="${firstTarget}" step="1" data-nl-range aria-label="Target rank">
                    <div class="ov-nl-ticks">${NEXT_TIERS.slice(1).map((t, i) => `<button type="button" data-nl-tick="${i + 1}">${t.emblem} ${t.name}</button>`).join('')}</div>
                </div>
                <div class="ov-nl-body" data-nl-body></div>
            </div>`;
        document.body.appendChild(modal);

        const renderTarget = (idx) => {
            const tier = NEXT_TIERS[idx];
            const A = tier.avg;
            const belowFloor = AXES.filter((a) => curStats[a.key] < (tier.floor || 0));
            const pierceAxis = tier.pierce ? AXES.slice().sort((x, y) => curStats[y.key] - curStats[x.key])[0].key : null;
            const balancedReqs = AXES.map((a) => {
                const done = curStats[a.key] >= A;
                return `<div class="ov-nl-req"><span class="k ${done ? 'done' : ''}">${a.label}${done ? ' ✓' : ''}</span>
                    <span class="v">${done ? 'already there' : `<span class="n">${curStats[a.key]} → ${A}</span> — ${axisTargetText(a.key, A, ctx)}`}</span></div>`;
            }).join('');
            const spikeShape = tierSpikeShape(tier, curStats);
            const spikeReqAxis = tier.spikeAxis || pierceAxis;
            const spikeBlock = tier.pierce
                ? `<div class="ov-nl-path"><h5>Spike path — ${tier.spikeNote ? tier.name + "'s identity" : 'go elite at one thing'}</h5>
                       ${tier.spikeNote ? `<div class="ov-nl-req"><span class="v">${tier.spikeNote}</span></div>` : ''}
                       <div class="ov-nl-req"><span class="k">${AXES.find((a) => a.key === spikeReqAxis).label}</span>
                       <span class="v">Push it to <span class="n">${tier.spike}</span> — ${axisTargetText(spikeReqAxis, tier.spike, ctx)}. One world-class stat pierces this rank even if the rest lag.</span></div></div>`
                : `<div class="ov-nl-path locked"><h5>No shortcut here</h5><div class="ov-nl-req"><span class="v">${tier.name} is a breadth rank — a single big stat won't cut it. Every axis has to clear ${tier.floor}, and your whole web has to average ${A}. ${tier.spikeNote || ''}</span></div></div>`;
            const floorNote = (tier.floor && belowFloor.length)
                ? `<div class="ov-nl-req"><span class="k">Floor</span><span class="v">No axis below <span class="n">${tier.floor}</span>. Lagging: ${belowFloor.map((a) => a.label).join(', ')}.</span></div>`
                : '';
            const body = modal.querySelector('[data-nl-body]');
            body.innerHTML = `
                <div>
                    ${tierRadarSvg(A, curStats, spikeShape)}
                    <div class="ov-nl-legend"><span><i class="t"></i>target</span><span><i class="c"></i>you now</span></div>
                    <div class="ov-nl-shape-note" data-nl-shape-note>Balanced build — cover the whole ring</div>
                </div>
                <div>
                    <div class="ov-nl-target-title">${tier.emblem} Reach ${tier.name}</div>
                    <div class="ov-nl-path"><h5>Balanced path — cover the ring (avg ${A})</h5>${balancedReqs}${floorNote}</div>
                    ${spikeBlock}
                </div>`;
            modal.querySelectorAll('[data-nl-tick]').forEach((b) => b.classList.toggle('is-on', Number(b.getAttribute('data-nl-tick')) === idx));

            // Alternate the target shape: balanced ring for 3s, then the
            // spiked example build for that rank, back and forth.
            if (modal.__shapeTimer) clearInterval(modal.__shapeTimer);
            const radarEl = body.querySelector('.nl-radar');
            const noteEl = body.querySelector('[data-nl-shape-note]');
            if (spikeShape && radarEl) {
                let spiked = false;
                modal.__shapeTimer = setInterval(() => {
                    spiked = !spiked;
                    radarEl.classList.toggle('is-spike', spiked);
                    if (noteEl) {
                        noteEl.textContent = spiked
                            ? (tier.pierce
                                ? `Spiked build — ${AXES.find((a) => a.key === spikeReqAxis).label.toLowerCase()} carries you through`
                                : 'Spiked-but-legal build — peaks on top of a floor that never breaks')
                            : 'Balanced build — cover the whole ring';
                    }
                }, 3000);
            }
        };

        const closeModal = () => {
            if (modal.__shapeTimer) clearInterval(modal.__shapeTimer);
            modal.remove();
        };
        const range = modal.querySelector('[data-nl-range]');
        range.addEventListener('input', () => renderTarget(Number(range.value)));
        modal.querySelectorAll('[data-nl-tick]').forEach((b) => b.addEventListener('click', () => { range.value = b.getAttribute('data-nl-tick'); renderTarget(Number(range.value)); }));
        modal.querySelector('[data-nl-close]').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        renderTarget(firstTarget);
    };

    /* ================================================================
       SHOWCASE MODE — when the ambient rank video plays behind the page
       (body.rf-has-bg-video from js/cutscenes.js), the top of the
       overview belongs to the character art: the hero card is pushed
       down a viewport, the radar rides small in the bottom-left, and as
       you scroll it flies/morphs into its usual slot in the card while
       the veil dims the art back down for readability.
       ================================================================ */
    const setupShowcase = (card, host, type, rank) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let tries = 0;
        const arm = () => {
            // cutscenes.js decides (~400ms in) whether a background video runs.
            if (!document.body.classList.contains('rf-has-bg-video')) {
                tries += 1;
                if (tries < 8) window.setTimeout(arm, 250);
                return;
            }
            if (document.querySelector('.ov-radar-dock')) return;
            document.body.classList.add('rf-showcase');

            const dock = document.createElement('div');
            dock.className = 'ov-radar-dock';
            const svg = host.querySelector('svg');
            // Full graph, labels and numbers included — the dock CSS bumps
            // the SVG text sizes so they stay readable this small, and the
            // widened viewBox keeps the enlarged edge labels from clipping.
            const crop = { x: -40, y: -14, w: 580, h: 410 };
            if (svg) {
                const svgClone = svg.cloneNode(true);
                svgClone.setAttribute('viewBox', `${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
                svgClone.setAttribute('data-dock-crop', '1');
                dock.appendChild(svgClone);
            }
            const label = document.createElement('div');
            label.className = 'ov-radar-dock-label';
            label.innerHTML = `<span>${type.emblem}</span> ${type.name} · #${rank.toLocaleString()}`;
            dock.appendChild(label);
            document.body.appendChild(dock);

            const themeDefaultVeil = () =>
                (document.documentElement.getAttribute('data-theme') === 'light' ? 0.86 : 0.78);
            const ease = (x) => 1 - Math.pow(1 - x, 2);
            // The overview lays out with main.overview-main as its own
            // overflow-y:auto scroller, so window.scrollY stays 0 forever —
            // drive the morph from whichever element actually scrolls.
            const scroller = (() => {
                const m = document.querySelector('main.overview-main') || card.closest('main');
                if (m) {
                    const ov = getComputedStyle(m).overflowY;
                    if ((ov === 'auto' || ov === 'scroll') && m.scrollHeight > m.clientHeight) return m;
                }
                return null;
            })();
            const scrollTop = () => (scroller ? scroller.scrollTop : window.scrollY);
            const headerEl = document.querySelector('.overview-header');
            const miniNavEl = document.querySelector('#overview-mini-nav');
            let base = null;
            let raf = 0;
            const measureBase = () => {
                dock.style.transform = 'none';
                base = dock.getBoundingClientRect();
            };
            const update = () => {
                raf = 0;
                if (!base) measureBase();
                const morphDist = Math.max(220, window.innerHeight * 0.55);
                const p = Math.max(0, Math.min(1, scrollTop() / morphDist));
                const e = ease(p);
                const target = host.getBoundingClientRect();
                const scale = 1 + ((target.width / Math.max(1, base.width)) - 1) * e;
                dock.style.transformOrigin = 'top left';
                dock.style.transform = `translate(${(target.left - base.left) * e}px, ${(target.top - base.top) * e}px) scale(${scale})`;
                // Hand off to the card's own radar early — with labels
                // visible on both, a long overlap reads as doubled text.
                dock.style.opacity = p < 0.5 ? '1' : String(Math.max(0, 1 - (p - 0.5) / 0.3));
                dock.style.visibility = p >= 0.82 ? 'hidden' : 'visible';
                dock.classList.toggle('is-morphing', p > 0.35);
                // Ease the widened dock viewBox back to the host's exact
                // 0 0 500 380 so the clone lands matching the card radar.
                const dockSvg = dock.querySelector('svg[data-dock-crop]');
                if (dockSvg) {
                    dockSvg.setAttribute('viewBox',
                        `${(crop.x * (1 - e)).toFixed(1)} ${(crop.y * (1 - e)).toFixed(1)} ${(crop.w + (500 - crop.w) * e).toFixed(1)} ${(crop.h + (380 - crop.h) * e).toFixed(1)}`);
                }
                label.style.opacity = String(Math.max(0, 1 - p * 2.2));
                // Crossfade: the card's own radar takes over as the clone lands.
                host.style.opacity = p < 0.55 ? '0' : String(Math.min(1, (p - 0.55) / 0.4));
                // At the very top the page belongs to the art: page header,
                // mini-nav and the hero card itself only fade in on scroll.
                [headerEl, miniNavEl].forEach((el) => {
                    if (!el) return;
                    el.style.opacity = String(Math.min(1, p / 0.3));
                    el.style.pointerEvents = p < 0.15 ? 'none' : '';
                });
                card.style.opacity = p < 0.12 ? '0' : String(Math.min(1, (p - 0.12) / 0.4));
                card.style.pointerEvents = p < 0.3 ? 'none' : '';
                // Veil: fully clear art at the top, dim back as content arrives.
                const def = themeDefaultVeil();
                document.documentElement.style.setProperty('--rf-veil-alpha', String((0.04 + (def - 0.04) * e).toFixed(3)));
            };
            const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
            (scroller || window).addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', () => { base = null; onScroll(); });
            update();
        };
        window.setTimeout(arm, 500);
    };

    /* ================================================================
       WIRE IT UP
       ================================================================ */
    const init = () => {
        const host = $('#ov-radar');
        const card = $('#overview-identity');
        if (!host || !card) return;

        const stats = readStoredStats('ovIdentityStats') || DEMO_STATS;
        const prevStats = readStoredStats('ovIdentityStatsPrev') || DEMO_STATS_PREV;

        const type = pickType(stats);
        const prevType = pickType(prevStats);
        const score = computeScore(stats, type, prevStats);
        const prevScore = computeScore(prevStats, prevType, null);
        const { rank, total, delta } = simulateRank(score, type, type.id === prevType.id ? prevScore : prevScore - 2);
        const title = pickTitle(stats);

        const emblem = $('#ov-emblem');
        if (emblem) emblem.textContent = type.emblem;
        const typeEl = $('#ov-type');
        if (typeEl) typeEl.textContent = type.name;
        const titleEl = $('#ov-title');
        if (titleEl) titleEl.textContent = '“' + title + '”';
        const blurbEl = $('#ov-blurb');
        if (blurbEl) blurbEl.textContent = type.blurb;
        const rankEl = $('#ov-rank');
        if (rankEl) rankEl.textContent = `#${rank.toLocaleString()} ${type.name}`;
        const rankSubEl = $('#ov-rank-sub');
        if (rankSubEl) rankSubEl.textContent = `of ${total.toLocaleString()} ${type.name}s`;
        const deltaEl = $('#ov-rank-delta');
        if (deltaEl) {
            if (delta > 0) {
                deltaEl.textContent = `▲ up ${delta.toLocaleString()} spots this week`;
                deltaEl.classList.add('is-up');
            } else if (delta < 0) {
                deltaEl.textContent = `▼ down ${Math.abs(delta).toLocaleString()} spots this week`;
                deltaEl.classList.add('is-down');
            } else {
                deltaEl.textContent = 'holding steady this week';
            }
        }

        const radar = buildRadar(host, stats, prevStats);
        animate(radar.setShape);

        // "Next level" — concrete, personalized targets for every rank.
        const compareBtn = $('#ov-compare-btn');
        if (compareBtn && !$('#ov-nl-btn')) {
            const nlBtn = document.createElement('button');
            nlBtn.id = 'ov-nl-btn';
            nlBtn.type = 'button';
            nlBtn.className = (compareBtn.className || '') + ' ov-nl-btn';
            nlBtn.textContent = 'Next level ›';
            nlBtn.addEventListener('click', () => openNextLevel(stats));
            compareBtn.insertAdjacentElement('afterend', nlBtn);
        }

        // Compare toggle: overlays last month; default view is the current snapshot only.
        const legend = $('#ov-radar-legend');
        if (compareBtn) {
            compareBtn.addEventListener('click', () => {
                const on = !card.classList.contains('is-comparing');
                card.classList.toggle('is-comparing', on);
                compareBtn.setAttribute('aria-pressed', String(on));
                compareBtn.textContent = on ? 'Hide last month' : 'Compare last month';
                if (legend) legend.classList.toggle('hidden', !on);
                radar.prevPoly.classList.toggle('hidden', !on);
                if (on) {
                    animate((t) => radar.prevPoly.setAttribute('points', polygonPoints(prevStats, t)), 650);
                }
            });
        }

        setupShowcase(card, host, type, rank);
    };

    // Shared identity engine: the onboarding finale on index.html reuses the
    // same types/titles/rank math so the reveal always matches the overview.
    window.OdeIdentity = {
        AXES,
        CHARACTER_TYPES,
        pickType,
        pickTitle,
        computeScore,
        simulateRank,
        readStoredStats
    };

    // Ensure the identity engine has turned the user's real onboarding +
    // activity into ovIdentityStats BEFORE we read it, so the radar shows
    // real numbers instead of the DEMO_STATS fallback. The engine lives in
    // js/identity-engine.js; inject it if the host page didn't include it.
    // Fully defensive: if it can't load, init() still runs on the fallback.
    const bootWithEngine = () => {
        const go = () => { try { init(); } catch (e) { /* keep page alive */ } };
        // v2 scoring (SCORING_ENGINE_V2): when the server score is
        // authoritative, give the (memoized) /api/score fetch a beat to land
        // so the first paint shows the server axes, not the local estimate.
        const goAfterServerScore = () => {
            try {
                const eng = window.RiseIdentityEngine;
                if (eng && typeof eng.fetchServerScore === 'function' && eng.serverMode && eng.serverMode()) {
                    Promise.race([
                        eng.fetchServerScore(),
                        new Promise((resolve) => setTimeout(resolve, 900))
                    ]).then(go, go);
                    return;
                }
            } catch (e) { /* fall through */ }
            go();
        };
        try {
            if (window.RiseIdentityEngine) { try { window.RiseIdentityEngine.refresh(); } catch (e) {} return goAfterServerScore(); }
            const s = document.createElement('script');
            s.src = 'js/identity-engine.js';
            s.async = false;
            s.onload = goAfterServerScore; // engine auto-runs refresh() on load
            s.onerror = go;     // missing engine -> demo fallback, page still works
            document.head.appendChild(s);
        } catch (e) { go(); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootWithEngine);
    } else {
        bootWithEngine();
    }
})();
