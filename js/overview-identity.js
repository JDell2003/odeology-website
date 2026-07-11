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

        // Compare toggle: overlays last month; default view is the current snapshot only.
        const compareBtn = $('#ov-compare-btn');
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
