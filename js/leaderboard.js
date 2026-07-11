(() => {
    const $ = (sel, root = document) => root.querySelector(sel);

    const listEl = $('#lb-list');
    const youEl = $('#lb-you');
    const youSub = $('#lb-you-sub');
    const youRight = $('#lb-you-right');
    const youAvatar = $('#lb-you-avatar');
    const youAvatarImg = $('#lb-you-avatar-img');
    const youAvatarFallback = $('#lb-you-avatar-fallback');

    const modal = $('#lb-modal');
    const modalTitle = $('#lb-modal-title');
    const modalSub = $('#lb-modal-sub');
    const modalBody = $('#lb-modal-body');
    const openRulesBtn = $('#lb-rules-btn');
    const openAwardsBtn = $('#lb-awards-btn');
    const closeBtn = $('#lb-close');
    const backdrop = $('#lb-backdrop');
    const headerEyebrow = $('.lb-header .eyebrow');
    const headerTitle = $('.lb-header h1');
    const headerSub = $('.lb-header .ns-muted');

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

    const trainerMetricLine = (row) => {
        if (!row?.isTrainerClient && !row?.isManagerTrainer) return '';
        const b = row?.breakdown && typeof row.breakdown === 'object' ? row.breakdown : {};
        if (row?.isManagerTrainer) {
            const activeClients = Number(b.activeClients || 0);
            const newClients = Number(b.newClients || 0);
            const retainedClients = Number(b.retainedClients || activeClients);
            const workouts = Number(b.clientWorkouts || 0);
            const checkins = Number(b.clientCheckins || 0);
            const mealsOnPlan = Number(b.mealsOnPlanDays || 0);
            const clientsWithPlans = Number(b.clientsWithPlans || 0);
            const reviews = Number(b.approvedReviews || 0);
            const workoutRate = Number(b.workoutsPerClient || 0);
            const checkinRate = Number(b.checkinsPerClient || 0);
            return `
                <div class="lb-client-metrics">
                    <span>Retained clients <strong>${retainedClients}</strong></span>
                    <span>New clients <strong>${newClients}</strong></span>
                    <span>Active clients <strong>${activeClients}</strong></span>
                    <span>Client workouts <strong>${workouts}</strong> (${workoutRate.toFixed(1)}/client)</span>
                    <span>Daily check-ins <strong>${checkins}</strong> (${checkinRate.toFixed(1)}/client)</span>
                    <span>Meals on plan <strong>${mealsOnPlan}</strong></span>
                    <span>Clients with plans <strong>${clientsWithPlans}</strong></span>
                    <span>Workout reviews <strong>${reviews}</strong></span>
                </div>
            `;
        }
        const rate = Number(b.workoutRate || 0);
        const adherence = Number(b.workoutAdherence || 0);
        const checkins = Number(b.checkins || 0);
        const mealsOnPlan = Number(b.mealsOnPlanDays || 0);
        const mealTracked = Number(b.mealTrackedDays || 0);
        const missedMeals = Number(b.missedMealDays || 0);
        const missedCheckins = Number(b.missedCheckins || 0);
        const waterDays = Number(b.waterDays || 0);
        const measurements = Number(b.measurementDays || 0);
        const reviews = Number(b.approvedReviews || 0);
        const avgReadiness = b.avgReadiness == null ? '' : ` • Readiness ${Number(b.avgReadiness).toFixed(1)}/10`;
        return `
            <div class="lb-client-metrics">
                <span>Workout rate <strong>${rate.toFixed(1)}/wk</strong> (${Math.round(adherence)}%)</span>
                <span>Check-ins <strong>${checkins}</strong></span>
                <span>Meals on plan <strong>${mealsOnPlan}</strong></span>
                <span>Meals tracked <strong>${mealTracked}</strong></span>
                <span>Missed meals <strong>${missedMeals}</strong></span>
                <span>Missed check-ins <strong>${missedCheckins}</strong></span>
                <span>Water <strong>${waterDays}</strong></span>
                <span>Measurements <strong>${measurements}</strong></span>
                <span>Approved workouts <strong>${reviews}</strong>${avgReadiness}</span>
            </div>
        `;
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
            title: 'Rules of the Arena',
            sub: 'Points come from real actions. Points decide your rank. Rank decides your caste.',
            ariaLabel: 'Leaderboard rules'
        });

        modalBody.innerHTML = `
            <div class="ns-muted" style="font-size:12px;">${cadence} Ranks reshuffle every day.</div>
            ${pts.length ? `<div class="lb-rule-section">Earning points</div>` : ''}
            ${pts.map(r => `
                <div class="lb-rule">
                    <div>
                        <div class="lb-rule-title">${r.action}</div>
                        ${r.note ? `<div class="lb-rule-note">${r.note}</div>` : ''}
                    </div>
                    <div class="lb-rule-points">+${r.points}</div>
                </div>
            `).join('')}
            <div class="lb-rule-section">The castes</div>
            <div class="lb-rule"><div><div class="lb-rule-title">Your spider graph is your rank</div><div class="lb-rule-note">Each tier is a ring on your radar. Claim it by covering the ring — your whole web reaching past it — or by piercing it with one world-class stat. Balanced or specialist, both roads climb.</div></div></div>
            <div class="lb-rule"><div><div class="lb-rule-title">♛ King — 15 thrones, no more</div><div class="lb-rule-note">Web average 85+, or a single stat at 98. Thrones only open when a King slips.</div></div></div>
            <div class="lb-rule"><div><div class="lb-rule-title">♞ Knight — 150 seats</div><div class="lb-rule-note">Web average 70+, or one stat pierced to 92. Hard - as it should be.</div></div></div>
            <div class="lb-rule"><div><div class="lb-rule-title">➳ Ranger · ✦ Mage · ⚔ Berserker</div><div class="lb-rule-note">Web average 50+ or one stat at 78. One level, three shapes: Ranger runs on cardio and recovery, Mage is the balanced discipline build, Berserker is all strength and progress — your graph's shape decides which claims you, and switching between them is a sidestep, not a climb.</div></div></div>
            <div class="lb-rule"><div><div class="lb-rule-title">⚑ Squire &nbsp;·&nbsp; ⚒ Peasant</div><div class="lb-rule-note">Everyone starts as a Peasant. Web average 35 or one stat at 60 makes you a Squire. Consistency is the fastest way out.</div></div></div>
            <div class="lb-rule-section">Daily shifts</div>
            <div class="lb-rule"><div><div class="lb-rule-title">The ranks move every day</div><div class="lb-rule-note">Miss a day and someone passes you. Your ▲/▼ arrow shows what happened overnight. Slots up top are limited - climbing means someone else falls.</div></div></div>
        `;
    };

    const miniRadarSvg = (stats) => {
        const cx = 46;
        const cy = 46;
        const R = 36;
        const point = (i, v) => {
            const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
            const r = R * (Math.max(4, v) / 100);
            return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
        };
        const ring = (v) => CASTE_AXES.map((k, i) => point(i, v)).join(' ');
        const shape = CASTE_AXES.map((k, i) => point(i, stats[k])).join(' ');
        const spokes = CASTE_AXES.map((k, i) => {
            const [x, y] = point(i, 100).split(',');
            return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="spoke"/>`;
        }).join('');
        return `<svg class="lb-mini-radar" viewBox="0 0 92 92" aria-label="Stat spider chart">
            <polygon points="${ring(100)}" class="ring"/>
            <polygon points="${ring(62)}" class="ring"/>
            <polygon points="${ring(28)}" class="ring"/>
            ${spokes}
            <polygon points="${shape}" class="shape"/>
        </svg>`;
    };

    const deltaBadge = (delta) => {
        if (delta == null || !Number.isFinite(Number(delta))) return '';
        const d = Number(delta);
        if (d > 0) return `<div class="lb-delta is-up" title="Climbed ${d} places since yesterday">▲${d}</div>`;
        if (d < 0) return `<div class="lb-delta is-down" title="Dropped ${Math.abs(d)} places since yesterday">▼${Math.abs(d)}</div>`;
        return '<div class="lb-delta is-flat" title="Held position">—</div>';
    };

    const podiumCard = (r) => {
        const avatar = r.avatarUrl
            ? `<img src="${r.avatarUrl}" alt="${escapeAttr(r.displayName)}" loading="lazy" onerror="this.remove();">`
            : `<div class="lb-avatar-fallback" aria-hidden="true">${initialsFromName(r.displayName)}</div>`;
        return `
            <div class="lb-podium-card place-${r.rank}">
                ${Number(r.rank) === 1 ? '<div class="lb-podium-crown" aria-hidden="true">♛</div>' : ''}
                <div class="lb-podium-medal">#${r.rank}</div>
                <div class="lb-podium-avatar">${avatar}</div>
                <div class="lb-podium-name">${r.displayName}</div>
                <div class="lb-podium-pts">${Number(r.points || 0).toLocaleString()} pts</div>
                ${deltaBadge(r.delta)}
            </div>`;
    };

    const renderList = (rows) => {
        if (!listEl) return;
        const podium = rows.filter((r) => r.__podium);
        const podiumHtml = podium.length === 3
            ? `<div class="lb-podium" aria-label="Top three">${podium.map(podiumCard).join('')}</div>`
            : '';
        if (podium.length === 3) rows = rows.filter((r) => !r.__podium);
        listEl.innerHTML = podiumHtml + rows.map((r, rowIndex) => r.__gap ? `
            <div class="lb-gaprow" aria-hidden="true"><span></span><em>${Number(r.count || 0).toLocaleString()} more athletes</em><span></span></div>
        ` : (() => {
            const stats = r.__stats || casteStatsFromRow(r);
            const rowCaste = r.__caste && CASTE_MAP[r.__caste] ? CASTE_MAP[r.__caste] : pickCaste(stats);
            const isYou = !r.isBot && !r.isFriend && !r.isTrainerClient && !r.isManagerTrainer;
            return `
            <div class="lb-row ${Number(r.rank) === 1 ? 'is-gold' : ''} ${Number(r.rank) === 2 ? 'is-silver' : ''} ${Number(r.rank) === 3 ? 'is-bronze' : ''} ${isYou ? 'is-you-row' : ''}" style="animation-delay:${Math.min(rowIndex, 14) * 45}ms">
                <div class="lb-rankbox" aria-label="Rank ${r.rank}">
                    <div class="lb-ranknum">#${r.rank}</div>
                    ${deltaBadge(r.delta)}
                    <div class="lb-avatar ${r.avatarUrl ? '' : 'noimg'}">
                        ${r.avatarUrl ? `<img src="${r.avatarUrl}" alt="${escapeAttr(r.displayName)}" loading="lazy" onerror="this.parentElement.classList.add('noimg'); this.remove();">` : `<div class="lb-avatar-fallback" aria-hidden="true">${initialsFromName(r.displayName)}</div>`}
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
                            if (r.isFriend) base.push({ id: 'who', label: 'Friend', tone: 'violet', desc: '' });
                            if (isYou) base.push({ id: 'who', label: 'You', tone: 'teal', desc: '' });
                            base.push({ id: 'joined', label: `Joined ${fmtJoin(r.joinedAt)}`, tone: 'slate', desc: '' });
                            const shown = base.slice(0, 3);
                            const pills = castePill(rowCaste) + shown.map(badgePill).join('');
                            return pills;
                        })()}
                    </div>
                    ${trainerMetricLine(r)}
                    ${(() => {
                        if (!r.isTrainerClient) return '';
                        const caste = rowCaste;
                        const next = pickNextCaste(stats, caste);
                        if (!next) return `<div class="lb-caste-rowhint">${caste.emblem} Holds the crown - every stat 75+.</div>`;
                        if (!next.reqs.length) return `<div class="lb-caste-rowhint">${caste.emblem} Ready to rank up to <strong>${next.caste.name}</strong>.</div>`;
                        const biggest = next.reqs.slice().sort((a, b) => (b.target - stats[b.key]) - (a.target - stats[a.key]))[0];
                        return `<div class="lb-caste-rowhint">Next: <strong>${next.caste.emblem} ${next.caste.name}</strong> — needs ${CASTE_LABELS[biggest.key]} ${stats[biggest.key]}&rarr;${biggest.target}. ${AXIS_ADVICE[biggest.key]}</div>`;
                    })()}
                    ${r.bio ? `<div class="lb-bio">${escapeAttr(String(r.bio))}</div>` : ''}
                </div>
                <div class="lb-spider" data-caste="${rowCaste.id}" aria-hidden="true">${miniRadarSvg(stats)}</div>
                <div class="lb-right">
                    <div class="lb-points">${Number(r.points || 0).toLocaleString()}<span class="lb-points-unit">pts</span></div>
                    ${r.isTrainerClient ? '<div class="lb-points-note">client score</div>' : ''}
                    ${r.isManagerTrainer ? '<div class="lb-points-note">trainer score</div>' : ''}
                </div>
            </div>
        `;
        })()).join('');
    };

    const setLeaderboardMode = (data) => {
        const mode = String(data?.mode || 'community');
        if (mode === 'trainer_clients') {
            document.body.classList.add('leaderboard-trainer-clients');
            if (headerEyebrow) headerEyebrow.textContent = 'Trainer';
            if (headerTitle) headerTitle.textContent = 'Client Leaderboard';
            if (headerSub) {
                const summary = data?.summary && typeof data.summary === 'object' ? data.summary : {};
                const count = Number(summary.clientCount || 0);
                const avgRate = Number(summary.avgWorkoutRate || 0);
                const atRisk = Number(summary.atRiskCount || 0);
                headerSub.textContent = `${count} linked client${count === 1 ? '' : 's'} • Avg workout rate ${avgRate.toFixed(1)}/wk • ${atRisk} need attention`;
            }
            if (openAwardsBtn) openAwardsBtn.classList.add('hidden');
        } else if (mode === 'manager_trainers') {
            document.body.classList.add('leaderboard-trainer-clients');
            if (headerEyebrow) headerEyebrow.textContent = 'Manager';
            if (headerTitle) headerTitle.textContent = 'Trainer Leaderboard';
            if (headerSub) {
                const summary = data?.summary && typeof data.summary === 'object' ? data.summary : {};
                const trainerCount = Number(summary.trainerCount || 0);
                const activeClients = Number(summary.activeClients || 0);
                const atRisk = Number(summary.atRiskCount || 0);
                headerSub.textContent = `${trainerCount} trainer${trainerCount === 1 ? '' : 's'} • ${activeClients} active client${activeClients === 1 ? '' : 's'} • ${atRisk} need attention`;
            }
            if (openAwardsBtn) openAwardsBtn.classList.add('hidden');
        } else {
            document.body.classList.remove('leaderboard-trainer-clients');
            if (headerEyebrow) headerEyebrow.textContent = 'Tournament';
            if (headerTitle) headerTitle.textContent = 'The Arena';
            if (headerSub) headerSub.textContent = 'Resets monthly. Ranks shift every day.';
            if (openAwardsBtn) openAwardsBtn.classList.remove('hidden');
            document.title = 'The Arena — RiseForIt';
        }
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

    /* ================================================================
       MEDIEVAL CASTE LAYER
       Mirrors the character system in js/overview-identity.js (owned by
       the overview/onboarding work - that file is a closed IIFE, so the
       checks are duplicated here; keep them in sync with its
       CHARACTER_TYPES). Stats are six 0-100 axes. For the signed-in
       user we prefer the same localStorage stats the overview page
       uses ('ovIdentityStats'); for everyone else the axes are
       approximated from their leaderboard breakdown.
       ================================================================ */
    const CASTE_AXES = ['strength', 'cardio', 'consistency', 'nutrition', 'recovery', 'progress'];
    const CASTE_LABELS = {
        strength: 'Strength', cardio: 'Cardio', consistency: 'Consistency',
        nutrition: 'Nutrition', recovery: 'Recovery', progress: 'Progress'
    };
    const CASTES = [
        {
            id: 'king', name: 'King', emblem: '♛', prestige: 4, tone: 'amber',
            blurb: 'Everything high and balanced - or one stat the realm has never seen. You have mastered it.',
            check: (s, avg, min, max, spread) => min >= 75 && spread <= 22,
            requirements: (s) => CASTE_AXES.filter(k => s[k] < 75).map(k => ({ key: k, target: 75 }))
        },
        {
            id: 'berserker', name: 'Berserker', emblem: '⚔', prestige: 2, tone: 'rose',
            blurb: 'Strength and progress surge ahead - cardio, consistency and nutrition left behind.',
            check: (s) => s.strength >= 78 && s.recovery <= 45 && s.consistency <= 60,
            requirements: null
        },
        {
            id: 'knight', name: 'Knight', emblem: '♞', prestige: 3, tone: 'indigo',
            blurb: 'Strong everywhere and it shows. You show up and you deliver.',
            check: (s) => s.strength >= 62 && s.consistency >= 70,
            requirements: () => [{ key: 'strength', target: 62 }, { key: 'consistency', target: 70 }]
        },
        {
            id: 'ranger', name: 'Ranger', emblem: '➳', prestige: 2, tone: 'emerald',
            blurb: 'Cardio and recovery lead the way. Strength is the missing piece.',
            check: (s) => s.cardio >= 68 && s.cardio >= s.strength + 10,
            requirements: () => [{ key: 'cardio', target: 68 }]
        },
        {
            id: 'mage', name: 'Mage', emblem: '✦', prestige: 2, tone: 'violet',
            blurb: 'Balanced and disciplined - consistency and nutrition steer the build. The road to Knight.',
            check: (s) => s.nutrition >= 70 && s.progress >= 58 && s.strength < 58,
            requirements: () => [{ key: 'nutrition', target: 70 }, { key: 'progress', target: 58 }]
        },
        {
            id: 'peasant', name: 'Peasant', emblem: '⚒', prestige: 0, tone: 'slate',
            blurb: 'Early days. Not an insult - it is where everyone starts. You climb out.',
            check: (s, avg) => avg < 42,
            requirements: null
        },
        {
            id: 'squire', name: 'Squire', emblem: '⚑', prestige: 1, tone: 'sky',
            blurb: 'Decent across the board and still developing. On the path.',
            check: () => true,
            requirements: (s) => {
                const sorted = CASTE_AXES.map(k => ({ key: k, value: s[k] })).sort((a, b) => a.value - b.value);
                return sorted.slice(0, 2).map(e => ({ key: e.key, target: 45 }));
            }
        }
    ];
    const CASTE_MAP = Object.fromEntries(CASTES.map(c => [c.id, c]));

    const HIGH_PHRASES = {
        strength: 'moves serious weight',
        cardio: 'can go for miles without folding',
        consistency: 'shows up no matter what',
        nutrition: 'keeps the diet honest',
        recovery: 'respects rest and comes back sharp',
        progress: 'gets measurably better every month'
    };
    const LOW_PHRASES = {
        strength: 'still avoids the heavy barbell',
        cardio: 'dodges anything that spikes the heart rate',
        consistency: 'disappears for stretches at a time',
        nutrition: 'wings it at mealtime',
        recovery: 'runs on fumes',
        progress: 'has not logged proof of progress yet'
    };
    const AXIS_ADVICE = {
        strength: 'Log more strength workouts - heavier sessions move this fastest.',
        cardio: 'Add cardio each week - runs, bike, or intervals all count.',
        consistency: 'Be more consistent - daily check-ins and never skip a planned workout.',
        nutrition: 'Keep meals on plan and actually log them.',
        recovery: 'Protect recovery - sleep, rest days, and readiness check-ins.',
        progress: 'Log measurements so your progress is provable.'
    };

    const clampStat = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

    const casteStatsFromRow = (row) => {
        const b = row?.breakdown && typeof row.breakdown === 'object' ? row.breakdown : {};
        const streak = Number(row?.streakDays || 0);
        if (row?.isTrainerClient) {
            const mealTracked = Number(b.mealTrackedDays || 0);
            const mealsOnPlan = Number(b.mealsOnPlanDays || 0);
            const nutritionPct = mealTracked > 0 ? (mealsOnPlan / mealTracked) * 100 : mealsOnPlan * 6;
            return {
                strength: clampStat(Number(b.approvedReviews || 0) * 16 + Number(b.workoutRate || 0) * 9),
                cardio: clampStat(Number(b.workoutRate || 0) * 15),
                consistency: clampStat(Number(b.workoutAdherence || 0)),
                nutrition: clampStat(nutritionPct),
                recovery: clampStat(b.avgReadiness == null ? Number(b.waterDays || 0) * 5 + 25 : Number(b.avgReadiness) * 10),
                progress: clampStat(Number(b.measurementDays || 0) * 9 + Number(b.approvedReviews || 0) * 5)
            };
        }
        const workouts = Number(b.workouts || 0);
        const checkins = Number(b.checkins || 0);
        return {
            strength: clampStat(workouts * 5),
            cardio: clampStat(workouts * 2.5 + streak * 1.5),
            consistency: clampStat(streak * 3.5 + checkins * 2.4),
            nutrition: clampStat(Number(b.mealsOnPlanDays || 0) * 5 + Number(b.mealPrepDays || 0) * 2.5 + Number(b.groceryPlans || 0) * 3),
            recovery: clampStat(25 + streak * 1.6 + Number(b.mealPrepDays || 0) * 1.4),
            progress: clampStat(Number(b.measurementDays || 0) * 8 + Number(b.measurementBonus || 0) * 1.4)
        };
    };

    const readIdentityStats = () => {
        try {
            const raw = JSON.parse(localStorage.getItem('ovIdentityStats') || 'null');
            if (!raw || typeof raw !== 'object') return null;
            const clean = {};
            for (const key of CASTE_AXES) {
                const v = Number(raw[key]);
                if (!Number.isFinite(v)) return null;
                clean[key] = clampStat(v);
            }
            return clean;
        } catch {
            return null;
        }
    };

    /* ================================================================
       RADAR-TIER CLASSIFICATION - the spider graph IS the rank.
       Each tier is a ring on the radar. You claim a tier by either
       COVERING its ring (your web's average reach passes it) or
       PIERCING it (one world-class axis punches far beyond it). So a
       balanced athlete and a one-lift monster can both climb - the
       graph decides, not a formula the user can't see.
       Spike margins count double when holding a tier so a pierced-in
       King isn't permanently "critical".
       ================================================================ */
    const TIER_RINGS = [
        { id: 'squire', avg: 35, spike: 60 },
        { id: 'specialist', avg: 50, spike: 78 },
        { id: 'knight', avg: 70, spike: 92 },   // hard but possible
        { id: 'king', avg: 85, spike: 98 }      // really hard
    ];
    const TIER_ORDER = ['peasant', 'squire', 'specialist', 'knight', 'king'];

    const radarReach = (stats) => {
        const vals = CASTE_AXES.map((k) => Number(stats[k]) || 0);
        return {
            avg: vals.reduce((a, b) => a + b, 0) / vals.length,
            spike: Math.max(...vals)
        };
    };

    const radarTierId = (stats) => {
        const { avg, spike } = radarReach(stats);
        let tier = 'peasant';
        for (const ring of TIER_RINGS) {
            if (avg >= ring.avg || spike >= ring.spike) tier = ring.id;
        }
        return tier;
    };

    const pickCaste = (stats) => {
        const tier = radarTierId(stats);
        if (tier === 'specialist') return champSpecialistFor(stats);
        return CASTE_MAP[tier];
    };

    // Next level = the next ring out. Requirements show the CHEAPER path:
    // pierce the ring with your best axis, or lift your weakest axes until
    // the web covers it.
    const pickNextCaste = (stats, current) => {
        const curTier = TIER_ORDER.includes(current.id) ? current.id : 'specialist';
        const idx = TIER_ORDER.indexOf(curTier);
        if (idx >= TIER_ORDER.length - 1) return null;
        const ring = TIER_RINGS.find((r) => r.id === TIER_ORDER[idx + 1]);
        const target = ring.id === 'specialist' ? champSpecialistFor(stats) : CASTE_MAP[ring.id];
        const { avg, spike } = radarReach(stats);
        const entries = CASTE_AXES.map((k) => ({ key: k, value: Number(stats[k]) || 0 })).sort((a, b) => a.value - b.value);
        const spikeCost = Math.max(0, ring.spike - spike);
        const avgCost = Math.max(0, (ring.avg - avg) * CASTE_AXES.length);
        if (spikeCost <= 0 || avgCost <= 0) return { caste: target, reqs: [], gap: 0 };
        if (spikeCost * 3 <= avgCost) {
            const best = entries[entries.length - 1];
            return { caste: target, reqs: [{ key: best.key, target: ring.spike }], gap: spikeCost };
        }
        const reqs = entries.slice(0, 3)
            .filter((e) => e.value < ring.avg)
            .slice(0, 2)
            .map((e) => ({ key: e.key, target: ring.avg }));
        return { caste: target, reqs, gap: avgCost };
    };

    const personSentence = (stats, { secondPerson = true } = {}) => {
        const entries = CASTE_AXES.map(k => ({ key: k, value: stats[k] })).sort((a, b) => b.value - a.value);
        const subject = secondPerson ? 'You are the type of person who' : 'The type who';
        const highs = entries.filter(e => e.value >= 55).slice(0, 2);
        const low = entries[entries.length - 1];
        if (!highs.length) {
            return `${subject} is still writing chapter one - every stat is up for grabs.`;
        }
        const highText = highs.map(e => HIGH_PHRASES[e.key]).join(' and ');
        if (low.value <= 50 && !highs.some(h => h.key === low.key)) {
            return `${subject} ${highText}, but ${LOW_PHRASES[low.key]}.`;
        }
        return `${subject} ${highText}.`;
    };

    const castePill = (caste) => `<span class="lb-pill lb-caste-pill" data-tone="${caste.tone}" title="${escapeAttr(caste.blurb)}">${caste.emblem} ${caste.name}</span>`;

    const ensureCasteStyle = () => {
        if (document.getElementById('lb-caste-style')) return;
        const style = document.createElement('style');
        style.id = 'lb-caste-style';
        style.textContent = `
            .lb-caste-pill{font-weight:800}
            .lb-caste-rowhint{margin-top:6px;font-size:11.5px;color:rgba(120,113,108,.95);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
            .lb-caste-rowhint strong{color:inherit}
            .lb-caste-hero{position:relative;display:grid;grid-template-columns:auto 1fr;gap:16px 18px;margin:14px 0 18px;padding:20px 22px;
                border-radius:20px;overflow:hidden;color:#2b2214;
                background:linear-gradient(160deg,#fffaf0 0%,#faf1de 60%,#f5e8cd 100%);
                border:1px solid rgba(185,138,43,.4);box-shadow:0 18px 44px rgba(120,90,20,.14);
                animation:lbHeroIn .5s cubic-bezier(.2,.8,.3,1) backwards}
            @keyframes lbHeroIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
            .lb-caste-hero::before{content:'';position:absolute;inset:0;pointer-events:none;
                background:radial-gradient(120% 90% at 90% -10%,rgba(212,175,55,.18),transparent 55%)}
            .lb-caste-emblem{width:76px;height:76px;border-radius:18px;display:flex;align-items:center;justify-content:center;
                font-size:42px;line-height:1;color:#a1751f;background:rgba(212,175,55,.16);
                border:1.5px solid rgba(185,138,43,.5);box-shadow:inset 0 0 22px rgba(212,175,55,.2);
                animation:lbEmblemFloat 4.5s ease-in-out infinite}
            @keyframes lbEmblemFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
            .lb-caste-eyebrow{font:800 10px/1 'Space Grotesk',system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#a1751f;margin-bottom:6px}
            .lb-caste-hero h2{margin:0;font:800 24px/1.15 'Space Grotesk',system-ui,sans-serif;color:#241b0e}
            .lb-caste-title-line{display:block;margin-top:3px;font:700 13px/1.35 system-ui,sans-serif;color:#a1751f}
            .lb-caste-why{margin:9px 0 0;font:500 13.5px/1.55 system-ui,sans-serif;color:rgba(60,48,28,.8);max-width:560px}
            .lb-caste-next{grid-column:1 / -1;padding:15px 16px 13px;border-radius:14px;background:rgba(255,255,255,.65);
                border:1px solid rgba(185,138,43,.3)}
            .lb-caste-next-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font:800 13px/1.2 'Space Grotesk',system-ui,sans-serif;color:#241b0e;margin-bottom:12px}
            .lb-caste-next-head .next-emblem{color:#a1751f}
            .lb-caste-next-head .next-count{font:600 11px/1.2 system-ui,sans-serif;color:rgba(60,48,28,.55)}
            .lb-caste-req{display:grid;gap:5px;margin-bottom:12px}
            .lb-caste-req:last-child{margin-bottom:2px}
            .lb-caste-req-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
            .lb-caste-req-label{font:800 12px/1.2 system-ui,sans-serif;color:#241b0e}
            .lb-caste-req-nums{font:700 11.5px/1 ui-monospace,monospace;color:#a1751f}
            .lb-caste-req-advice{font:500 11.5px/1.45 system-ui,sans-serif;color:rgba(60,48,28,.62)}
            .lb-caste-bar{height:8px;border-radius:999px;background:rgba(120,90,20,.14);overflow:hidden}
            .lb-caste-bar i{display:block;height:100%;width:0;border-radius:999px;
                background:linear-gradient(90deg,#c69732,#e0b34a);
                transition:width 1.1s cubic-bezier(.2,.8,.3,1)}
            .lb-caste-crowned{font:600 12.5px/1.5 system-ui,sans-serif;color:rgba(60,48,28,.75)}
            .lb-friends-btn{display:inline-flex;align-items:center;gap:6px}
            .lb-friends-pop{position:fixed;z-index:120;width:min(340px,92vw);padding:16px;border-radius:16px;
                background:#fffdf7;border:1px solid rgba(10,31,47,.14);box-shadow:0 26px 60px rgba(7,20,31,.28)}
            .lb-friends-pop h3{margin:0 0 4px;font:800 15px/1.2 'Space Grotesk',system-ui,sans-serif}
            .lb-friends-pop p{margin:0 0 10px;font:500 12px/1.5 system-ui,sans-serif;color:rgba(13,34,50,.6)}
            .lb-friends-row{display:flex;gap:8px}
            .lb-friends-row input{flex:1 1 auto;min-width:0;min-height:40px;padding:0 12px;border-radius:10px;
                border:1px solid rgba(10,31,47,.16);font:600 13px/1 system-ui,sans-serif;outline:none}
            .lb-friends-row button{min-height:40px;padding:0 14px;border:0;border-radius:10px;background:#16344d;color:#fff;
                font:800 12.5px/1 system-ui,sans-serif;cursor:pointer}
            .lb-friends-result{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px;border-radius:12px;
                background:rgba(22,52,77,.05);border:1px solid rgba(10,31,47,.08)}
            .lb-friends-result img{width:38px;height:38px;border-radius:999px;object-fit:cover;background:#e2e8f0}
            .lb-friends-result .who{flex:1 1 auto;min-width:0}
            .lb-friends-result .who strong{display:block;font:800 13px/1.2 system-ui,sans-serif}
            .lb-friends-result .who span{font:600 11px/1.2 system-ui,sans-serif;color:rgba(13,34,50,.55)}
            .lb-friends-status{margin-top:9px;font:700 12px/1.4 system-ui,sans-serif;color:#16344d;min-height:16px}
            .lb-filter-chips{display:flex;gap:6px;margin:0 0 12px}
            .lb-filter-chips button{min-height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(10,31,47,.14);
                background:rgba(255,255,255,.9);color:rgba(13,34,50,.7);font:800 12px/1 system-ui,sans-serif;cursor:pointer}
            .lb-filter-chips button.is-active{background:#16344d;border-color:#16344d;color:#fff}
            .lb-rule-section{margin:16px 0 6px;font:800 10.5px/1 'Space Grotesk',system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#a1751f}
            body.leaderboard-page .lb-gaprow{color:rgba(161,117,31,.75)}
            body.leaderboard-page .lb-gaprow span{background:repeating-linear-gradient(90deg,rgba(161,117,31,.35) 0 6px,transparent 6px 12px)}
            .lb-gaprow{display:flex;align-items:center;gap:12px;padding:10px 4px;color:rgba(120,113,108,.75)}
            .lb-gaprow span{flex:1 1 auto;height:1px;background:repeating-linear-gradient(90deg,rgba(120,113,108,.35) 0 6px,transparent 6px 12px)}
            .lb-gaprow em{font:700 11px/1 system-ui,sans-serif;font-style:normal;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
            .lb-caste-pyramid{display:flex;flex-direction:column;align-items:center;gap:6px;margin:0 0 18px;padding:18px 14px 16px;
                border-radius:20px;background:linear-gradient(160deg,#fffaf0,#f7ecd6);border:1px solid rgba(185,138,43,.35);overflow:hidden}
            .lb-pyramid-title{font:800 10.5px/1 'Space Grotesk',system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#a1751f;margin-bottom:8px}
            .lb-pyramid-tier{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 12px;
                border-radius:10px;background:rgba(212,175,55,.13);border:1px solid rgba(185,138,43,.35);color:#2b2214;
                animation:lbTierIn .5s cubic-bezier(.2,.8,.3,1) backwards;transition:background .15s ease}
            .lb-pyramid-tier:hover{background:rgba(212,175,55,.22)}
            @keyframes lbTierIn{from{opacity:0;transform:translateY(-10px) scaleX(.7)}to{opacity:1;transform:none}}
            .lb-pyramid-tier.is-you{background:rgba(212,175,55,.28);border-color:#b98a2b;box-shadow:0 0 18px rgba(185,138,43,.3)}
            .lb-pyramid-emblem{color:#a1751f;font-size:15px}
            .lb-pyramid-label{font:800 11.5px/1.2 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .lb-pyramid-count{font:700 10.5px/1 ui-monospace,monospace;color:#a1751f;white-space:nowrap}
            .lb-pyramid-you{position:absolute;right:-6px;top:50%;transform:translate(100%,-50%);padding:3px 8px;border-radius:999px;
                background:#b98a2b;color:#fff;font:900 9px/1 system-ui,sans-serif;letter-spacing:.12em;
                animation:lbYouPulse 2s ease-in-out infinite}
            @keyframes lbYouPulse{0%,100%{box-shadow:0 0 0 0 rgba(232,199,102,.5)}50%{box-shadow:0 0 0 7px rgba(232,199,102,0)}}
            .lb-caste-slots-chip{display:inline-flex;align-items:center;gap:6px;margin-left:auto;padding:5px 11px;border-radius:999px;
                background:rgba(185,138,43,.12);border:1px solid rgba(185,138,43,.45);color:#a1751f;font:800 10.5px/1 system-ui,sans-serif;letter-spacing:.06em}
            #lb-shift-overlay{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;
                background:rgba(43,34,20,.5);backdrop-filter:blur(7px);animation:lbShiftFade .3s ease}
            @keyframes lbShiftFade{from{opacity:0}to{opacity:1}}
            .lb-shift-particles{position:absolute;inset:0;overflow:hidden;pointer-events:none}
            .lb-shift-particles i{position:absolute;top:-16px;width:5px;height:12px;border-radius:2px;background:#d9a93c;opacity:.95;
                animation:lbShiftFall linear forwards}
            @keyframes lbShiftFall{to{transform:translateY(110vh) rotate(400deg);opacity:0}}
            .lb-shift-card{position:relative;width:min(380px,92vw);padding:30px 24px 22px;border-radius:24px;text-align:center;color:#2b2214;
                background:linear-gradient(165deg,#fffaf0,#f5e8cd);border:1.5px solid rgba(185,138,43,.55);
                box-shadow:0 40px 90px rgba(60,45,15,.35);animation:lbShiftPop .45s cubic-bezier(.2,.9,.3,1.25)}
            @keyframes lbShiftPop{from{transform:scale(.8) translateY(16px);opacity:0}to{transform:none;opacity:1}}
            .lb-shift-crest{width:64px;height:64px;margin:0 auto 12px;border-radius:999px;display:flex;align-items:center;justify-content:center;
                font-size:30px;color:#a1751f;background:rgba(212,175,55,.18);border:1.5px solid rgba(185,138,43,.55);
                animation:lbYouPulse 2.4s ease-in-out infinite}
            .lb-shift-title{font:900 24px/1.15 'Space Grotesk',system-ui,sans-serif;color:#241b0e;margin-bottom:14px}
            .lb-shift-lines{display:grid;gap:8px;margin-bottom:18px}
            .lb-shift-line{font:600 13.5px/1.4 system-ui,sans-serif;color:rgba(60,48,28,.85);
                animation:lbShiftLine .5s cubic-bezier(.2,.8,.3,1) backwards}
            .lb-shift-line strong{color:#a1751f}
            @keyframes lbShiftLine{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}
            .lb-shift-cta{min-height:46px;padding:0 22px;border:0;border-radius:999px;cursor:pointer;
                background:linear-gradient(135deg,#b98a2b,#d9a93c);color:#fff;font:900 13.5px/1 system-ui,sans-serif}
            @media (prefers-reduced-motion: reduce){
                .lb-caste-emblem{animation:none}
                .lb-caste-hero{animation:none}
                .lb-caste-bar i{transition:none}
                .lb-pyramid-tier{animation:none}
                .lb-pyramid-you{animation:none}
            }
            @media (max-width:640px){
                .lb-caste-hero{grid-template-columns:1fr;padding:16px}
                .lb-caste-emblem{width:60px;height:60px;font-size:32px}
                .lb-caste-hero h2{font-size:20px}
            }
        `;
        document.head.appendChild(style);
    };

    const animateCount = (el, target, { duration = 900, prefix = '', suffix = '' } = {}) => {
        if (!el) return;
        const start = performance.now();
        const from = 0;
        const step = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = `${prefix}${Math.round(from + (target - from) * eased).toLocaleString()}${suffix}`;
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    /* ================================================================
       LIVING CHAMPION - the "keep the flower alive" idea, medieval
       edition. An animated SVG vignette of your fighter that loops
       forever like a tiny movie and gets more glorious as your caste
       climbs: peasant digs in the mud, squire drills on a dummy, the
       class tiers get their weapon, the knight duels a shadow, the
       king sits a throne. Pure SVG/CSS - no assets, no requests.
       ================================================================ */
    const ensureChampionStyle = () => {
        if (document.getElementById('lb-champion-style')) return;
        const style = document.createElement('style');
        style.id = 'lb-champion-style';
        style.textContent = `
            /* Phone overflow guards: the hero and you-strip are grid/flex
               items whose min-width:auto lets long lines force the panel
               wider than the card on small screens. */
            body.leaderboard-page .plan-card.lb-card>*{min-width:0;max-width:100%}
            body.leaderboard-page .lb-row .lb-main{min-width:0}
            .lb-pyramid-tier{min-width:max-content}
            @media (max-width:720px){
                .lb-podium{gap:8px}
                .lb-podium-card{min-width:0;padding:12px 6px 10px}
                .lb-podium-avatar{width:44px;height:44px}
                .lb-podium-card.place-1 .lb-podium-avatar{width:54px;height:54px}
                .lb-podium-name{font-size:12px}
                .lb-podium-pts{font-size:13px}
                body.leaderboard-page .lb-row{flex-wrap:wrap;gap:10px 12px;padding:12px}
                body.leaderboard-page .lb-row .lb-badges,body.leaderboard-page .lb-row .lb-topline{flex-wrap:wrap}
                body.leaderboard-page .lb-points{font-size:15px}
            }
            #lb-caste-hero.lb-caste-hero{min-width:0;max-width:100%}
            .lb-caste-hero *{min-width:0}
            body.leaderboard-page .lb-you{flex-wrap:wrap;min-width:0;max-width:100%}
            body.leaderboard-page .lb-you #lb-you-right{margin-left:auto}
            .lb-champion{grid-column:1/-1;position:relative;margin-top:6px;border-radius:16px;overflow:hidden;
                border:1px solid rgba(185,138,43,.35);background:#f8edd2;box-shadow:inset 0 0 30px rgba(185,138,43,.1)}
            .lb-champion svg{display:block;width:100%;height:clamp(170px,24vw,250px)}
            .ch-sky{fill:url(#chSky)}
            .ch-ground{fill:rgba(120,90,20,.16)}
            .ch-head{fill:#2b2214}
            .ch-body,.ch-limb{stroke:#2b2214;stroke-width:7;stroke-linecap:round;fill:none}
            .ch-tool{stroke:#6b4a12;stroke-width:4;stroke-linecap:round;fill:none}
            .ch-weapon{stroke:#8a6318;stroke-width:4;stroke-linecap:round;fill:none}
            .ch-blade{stroke:#b5b0a3}
            .ch-shadow{fill:rgba(60,45,15,.16)}
            .ch-mud{fill:rgba(90,66,20,.3)}
            .ch-banner path{fill:#b98a2b;opacity:.7;animation:chBanner 3.4s ease-in-out infinite;transform-origin:top center}
            .ch-banner2 path{animation-delay:1.1s}
            @keyframes chBanner{50%{transform:skewX(7deg)}}
            .ch-ember{fill:#d9a93c;opacity:0;animation:chEmber var(--t,3s) linear var(--d,0s) infinite}
            @keyframes chEmber{0%{opacity:0;transform:translateY(0)}14%{opacity:.85}100%{opacity:0;transform:translateY(-130px)}}
            .ch-swing{animation:chSwing 1.9s ease-in-out infinite}
            .ch-swing-slow{animation-duration:2.8s}
            .ch-swing-fast{animation-duration:1.1s}
            @keyframes chSwing{0%,100%{transform:rotate(-16deg)}42%{transform:rotate(30deg)}55%{transform:rotate(26deg)}}
            .ch-dust circle{fill:rgba(120,90,20,.55);opacity:0;animation:chDust 2.8s ease-in-out infinite}
            @keyframes chDust{0%,40%{opacity:0}48%{opacity:.7}72%{opacity:0;transform:translateY(-8px)}100%{opacity:0}}
            .ch-dummy{animation:chWobble 1.9s ease-in-out infinite;transform-origin:bottom center}
            @keyframes chWobble{0%,38%,100%{transform:rotate(0)}46%{transform:rotate(6deg)}58%{transform:rotate(-3deg)}}
            .ch-spark path{fill:#e0b34a;opacity:0;animation:chSpark 1.9s linear infinite}
            @keyframes chSpark{0%,42%{opacity:0;transform:scale(.4)}47%{opacity:1;transform:scale(1.15)}56%{opacity:0;transform:scale(.5)}100%{opacity:0}}
            .ch-duel-hero{animation:chLunge 2.4s ease-in-out infinite}
            @keyframes chLunge{0%,100%{transform:translate(128px,172px)}38%{transform:translate(150px,172px)}52%{transform:translate(146px,172px)}}
            .ch-duel-foe{opacity:.5;animation:chRecoil 2.4s ease-in-out infinite}
            @keyframes chRecoil{0%,34%,100%{transform:translate(244px,172px) scale(-1,1)}44%{transform:translate(258px,170px) scale(-1,1)}60%{transform:translate(250px,172px) scale(-1,1)}}
            .ch-clash path{fill:#f2ddaa;stroke:#c8931b;stroke-width:1;opacity:0;animation:chClash 2.4s linear infinite}
            @keyframes chClash{0%,38%{opacity:0;transform:scale(.3)}43%{opacity:1;transform:scale(1.3)}52%{opacity:0;transform:scale(.4)}100%{opacity:0}}
            .ch-orb{fill:#e0b34a;animation:chOrb 2.2s ease-in-out infinite}
            @keyframes chOrb{0%,100%{opacity:.55;r:4}50%{opacity:1;r:5.5}}
            .ch-glow{fill:rgba(224,179,74,.35);animation:chGlow 2.6s ease-in-out infinite}
            @keyframes chGlow{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.8;transform:scale(1.25)}}
            .ch-hover{animation:chHover 3s ease-in-out infinite}
            @keyframes chHover{0%,100%{transform:translate(180px,166px)}50%{transform:translate(180px,160px)}}
            .ch-arrow{stroke:#8a6318;stroke-width:2.5;stroke-linecap:round;opacity:0;animation:chArrow 2.6s linear infinite}
            @keyframes chArrow{0%,54%{opacity:0;transform:translateX(0)}58%{opacity:1}80%{opacity:0;transform:translateX(90px)}100%{opacity:0}}
            .ch-crown{fill:#e0b34a;stroke:#a1751f;stroke-width:1}
            .ch-throne{fill:#8a6318;opacity:.85}
            .lb-champion-cap{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
                padding:9px 14px;background:rgba(120,90,20,.08);border-top:1px solid rgba(185,138,43,.25)}
            .lb-champion-cap span:first-child{font:700 11.5px/1.4 system-ui,sans-serif;color:#6b4a12}
            .lb-champion-streak{flex:0 0 auto;padding:4px 10px;border-radius:999px;background:rgba(212,175,55,.2);
                border:1px solid rgba(185,138,43,.45);font:800 10.5px/1 system-ui,sans-serif;color:#a1751f}
            /* The web grows with the tier: higher ranks get bigger, richer
               radars. King's web is gold. */
            body.leaderboard-page .lb-spider{flex:0 0 auto;min-width:70px}
            .lb-spider .lb-mini-radar{width:70px;height:70px;transition:width .2s,height .2s}
            .lb-spider[data-caste="squire"] .lb-mini-radar{width:78px;height:78px}
            .lb-spider[data-caste="ranger"] .lb-mini-radar,
            .lb-spider[data-caste="mage"] .lb-mini-radar,
            .lb-spider[data-caste="berserker"] .lb-mini-radar{width:86px;height:86px}
            .lb-spider[data-caste="knight"] .lb-mini-radar{width:94px;height:94px}
            .lb-spider[data-caste="king"] .lb-mini-radar{width:104px;height:104px}
            .lb-spider[data-caste="king"] .lb-mini-radar .shape{fill:rgba(212,160,30,.32);stroke:#c8931b;stroke-width:2}
            .lb-spider[data-caste="king"] .lb-mini-radar .ring{stroke:rgba(200,147,27,.35)}
            .lb-spider[data-caste="knight"] .lb-mini-radar .shape{stroke-width:1.9}
            /* Champion state layer: video slots + per-state tints. */
            .lb-champion-stage{position:relative}
            .lb-champion-stage svg{display:block;width:100%;height:clamp(170px,24vw,250px)}
            /* Clips are 9:16 vertical, character centered: letterbox them on
               a dark stage instead of stretching to the landscape strip. */
            .lb-champion-stage.has-video{display:flex;justify-content:center;background:#1c150a}
            .lb-champion-stage.has-video svg{visibility:hidden;position:absolute;inset:0}
            .lb-champion-video{display:block;aspect-ratio:9/16;height:clamp(240px,52vw,440px);width:auto;max-width:100%;object-fit:cover}
            .lb-champ-state{font:900 10px/1 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;
                padding:3px 8px;border-radius:999px;background:rgba(120,90,20,.12);color:#6b4a12;margin-right:6px}
            .lb-champion[data-state="dominant"] .lb-champ-state{background:rgba(212,160,30,.28);color:#8a6318}
            .lb-champion[data-state="thriving"] .lb-champ-state{background:rgba(34,197,94,.16);color:#15803d}
            .lb-champion[data-state="struggling"] .lb-champ-state{background:rgba(234,140,50,.18);color:#b45309}
            .lb-champion[data-state="critical"] .lb-champ-state{background:rgba(239,68,68,.16);color:#b91c1c}
            .lb-champion[data-state="dominant"] .lb-champion-stage svg{filter:saturate(1.18) brightness(1.05)}
            .lb-champion[data-state="thriving"] .lb-champion-stage svg{filter:saturate(1.08)}
            .lb-champion[data-state="struggling"] .lb-champion-stage svg{filter:saturate(.62) brightness(.93) sepia(.12)}
            .lb-champion[data-state="critical"] .lb-champion-stage svg{filter:saturate(.35) brightness(.8) sepia(.28)}
            .lb-champion[data-state="critical"]{border-color:rgba(190,70,45,.55)}
            /* Rank-change takeover */
            #lb-champ-trans{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;
                padding:18px;background:rgba(43,34,20,.55);backdrop-filter:blur(7px);animation:lbShiftFade .3s ease}
            .lb-champ-trans-card{width:min(480px,94vw);border-radius:24px;overflow:hidden;text-align:center;
                background:linear-gradient(165deg,#fffaf0,#f5e8cd);border:1.5px solid rgba(185,138,43,.55);
                box-shadow:0 40px 90px rgba(60,45,15,.35);animation:lbIntroPop .5s cubic-bezier(.2,.9,.3,1.15)}
            .lb-champ-trans-stage{position:relative}
            .lb-champ-trans-stage .lb-champion{border:0;border-radius:0;margin:0}
            .lb-champ-trans-stage .lb-champion-cap{display:none}
            .lb-champ-trans-stage .lb-champion-stage svg{height:220px}
            .lb-champ-trans-body{padding:16px 20px 20px}
            .lb-champ-trans-kicker{font:800 10.5px/1 system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#a1751f;margin-bottom:8px}
            #lb-champ-trans[data-kind="demote"] .lb-champ-trans-kicker{color:#b45309}
            .lb-champ-trans-title{font:900 24px/1.15 'Space Grotesk',system-ui,sans-serif;color:#241b0e;margin-bottom:8px}
            .lb-champ-trans-line{font:600 13px/1.5 system-ui,sans-serif;color:rgba(60,48,28,.8);margin-bottom:14px}
            .lb-champ-trans-cta{min-height:44px;padding:0 22px;border-radius:999px;border:0;cursor:pointer;
                background:linear-gradient(135deg,#b98a2b,#d9a93c);color:#fff;font:900 13.5px/1 system-ui,sans-serif}
            /* Dev preview panel (?champdev=1) */
            #lb-champ-dev{position:fixed;right:14px;bottom:14px;z-index:210;display:flex;flex-direction:column;gap:8px;
                padding:12px;border-radius:14px;background:#241b0e;color:#f2ddaa;font:700 12px/1 system-ui,sans-serif;
                box-shadow:0 14px 40px rgba(0,0,0,.4)}
            #lb-champ-dev .row{display:flex;gap:6px}
            #lb-champ-dev select,#lb-champ-dev button{flex:1;font:700 11.5px/1.2 system-ui,sans-serif;padding:7px 8px;
                border-radius:8px;border:1px solid rgba(224,179,74,.4);background:#3a2c12;color:#f2ddaa;cursor:pointer}
            /* Cinematic gate intro - overrides the plain fade version. */
            #lb-arena-intro{position:fixed;inset:0;z-index:190;display:flex;align-items:center;justify-content:center;overflow:hidden;
                background:radial-gradient(130% 100% at 50% 115%,#3a2a10,#191307 62%);pointer-events:none;
                animation:lbIntroLift .6s ease 2.6s forwards}
            .lb-intro-gate{position:absolute;top:0;bottom:0;width:51%;z-index:3;
                background:linear-gradient(90deg,#241a0c,#2e2110);box-shadow:inset 0 0 46px rgba(0,0,0,.55)}
            .lb-intro-gate.is-left{left:0;border-right:2px solid rgba(224,179,74,.5);animation:lbGateL .9s cubic-bezier(.7,0,.3,1) .55s forwards}
            .lb-intro-gate.is-right{right:0;border-left:2px solid rgba(224,179,74,.5);animation:lbGateR .9s cubic-bezier(.7,0,.3,1) .55s forwards}
            @keyframes lbGateL{to{transform:translateX(-102%)}}
            @keyframes lbGateR{to{transform:translateX(102%)}}
            .lb-intro-embers i{position:absolute;bottom:-8px;width:4px;height:4px;border-radius:50%;background:#e0b34a;opacity:0;
                animation-name:lbEmberUp;animation-iteration-count:infinite;animation-timing-function:linear}
            @keyframes lbEmberUp{0%{opacity:0;transform:translateY(0) scale(1)}12%{opacity:.9}100%{opacity:0;transform:translateY(-72vh) scale(.35)}}
            .lb-intro-inner{position:relative;z-index:2;text-align:center;animation:lbIntroPop .7s cubic-bezier(.2,.9,.3,1.15) .15s backwards}
            .lb-intro-shield{width:86px;height:auto;display:block;margin:0 auto 14px;filter:drop-shadow(0 0 26px rgba(224,179,74,.35))}
            .lb-intro-shield .shield{fill:#241b0e;stroke:#e0b34a;stroke-width:2.5}
            .lb-intro-shield .swords{stroke:#e0b34a;stroke-width:3.5;stroke-linecap:round}
            .lb-intro-shield .shine{fill:rgba(255,240,200,.3);animation:lbShine 1.7s ease .8s infinite}
            @keyframes lbShine{0%{transform:skewX(-18deg) translateX(-20px)}55%,100%{transform:skewX(-18deg) translateX(120px)}}
            .lb-intro-title{font:900 34px/1.05 'Space Grotesk',system-ui,sans-serif;color:#f2ddaa;letter-spacing:.14em;
                animation:lbTitleSpread 1.1s ease .35s backwards}
            @keyframes lbTitleSpread{from{letter-spacing:.42em;opacity:0}to{letter-spacing:.14em;opacity:1}}
            .lb-intro-sub{margin-top:8px;font:700 11px/1 system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#c9a24a}
            .lb-intro-tag{margin-top:14px;font:700 11.5px/1 system-ui,sans-serif;color:rgba(242,221,170,.6)}
            @media (max-width:720px){.lb-intro-title{font-size:26px}}
            @media (prefers-reduced-motion: reduce){
                .lb-champion [class^="ch-"],.lb-champion [class*=" ch-"]{animation:none !important}
                #lb-arena-intro,.lb-intro-gate,.lb-intro-embers i{animation:none !important;display:none}
            }
        `;
        document.head.appendChild(style);
    };

    const CHAMPION_CAPTIONS = {
        base: 'Every legend starts in the mud. Show up today and he stands a little taller.',
        squire: 'He drills while you train. Skip a week and the dummy starts winning.',
        ranger: 'Eyes sharp from your cardio. Keep the miles coming and the arrows fly true.',
        mage: 'Your nutrition feeds the spellwork. Keep the orb burning.',
        berserker: 'All fury, no rest. He fights harder than he recovers - careful.',
        knight: 'Your knight holds the line. Every workout is another parry.',
        king: 'The crown is rented, never owned. 75+ everywhere keeps him on the throne.'
    };

    const championStage = (casteId) => (CHAMPION_CAPTIONS[casteId] ? casteId : 'base');

    const championScene = (caste, streak, state = 'steady') => {
        const stage = championStage(caste.id);
        const skies = {
            base: ['#eee1c2', '#e0cea6'], squire: ['#f4e8ca', '#eadab2'],
            knight: ['#f8edd2', '#eeddb6'], king: ['#fdf3d2', '#f3e2ae']
        };
        const [s1, s2] = skies[stage] || ['#f6ebcd', '#ecdcb4'];
        const emberCount = stage === 'base' ? 4 : stage === 'king' ? 14 : 9;
        const embers = Array.from({ length: emberCount }, (_, i) =>
            `<circle class="ch-ember" cx="${18 + ((i * 41) % 330)}" cy="${170 - (i % 3) * 9}" r="${(1.5 + (i % 3) * 0.7).toFixed(1)}" style="--t:${(2.5 + (i % 5) * 0.5).toFixed(1)}s;--d:${(i * 0.37).toFixed(2)}s"/>`).join('');
        const baseFig = (extra) => `
            <ellipse class="ch-shadow" cx="8" cy="4" rx="30" ry="6"/>
            <path class="ch-limb" d="M0,0 L4,-30"/><path class="ch-limb" d="M16,0 L12,-30"/>
            <path class="ch-body" d="M8,-30 L8,-52"/>
            <circle class="ch-head" cx="8" cy="-62" r="9"/>${extra}`;
        const scenes = {
            base: `
                <g transform="translate(168,172)">
                    <ellipse class="ch-shadow" cx="8" cy="4" rx="30" ry="6"/>
                    <path class="ch-limb" d="M0,0 L-2,-28"/><path class="ch-limb" d="M14,0 L12,-28"/>
                    <path class="ch-body" d="M5,-28 Q6,-46 18,-52"/>
                    <circle class="ch-head" cx="24" cy="-58" r="9"/>
                    <g class="ch-swing ch-swing-slow" style="transform-origin:14px -46px">
                        <path class="ch-limb" d="M14,-46 L38,-32"/>
                        <path class="ch-tool" d="M38,-32 L58,4"/><path class="ch-tool" d="M58,4 l13,-6"/>
                    </g>
                    <g class="ch-dust"><circle cx="64" cy="0" r="3"/><circle cx="72" cy="-6" r="2"/><circle cx="58" cy="-8" r="1.6"/></g>
                    <ellipse class="ch-mud" cx="68" cy="6" rx="17" ry="3.5"/>
                </g>`,
            squire: `
                <g class="ch-dummy" transform="translate(248,174)">
                    <path class="ch-tool" d="M0,0 L0,-52"/><path class="ch-tool" d="M-16,-40 L16,-40"/>
                    <circle class="ch-head" cx="0" cy="-60" r="8" opacity=".75"/>
                </g>
                <g transform="translate(150,172)">
                    ${baseFig(`
                    <g class="ch-swing" style="transform-origin:8px -48px">
                        <path class="ch-limb" d="M8,-48 L34,-40"/>
                        <path class="ch-weapon" d="M34,-40 L66,-54"/>
                    </g>`)}
                </g>
                <g class="ch-spark" transform="translate(242,122)"><path d="M0,-8 L2,-2 L8,0 L2,2 L0,8 L-2,2 L-8,0 L-2,-2 Z"/></g>`,
            ranger: `
                <g transform="translate(160,172)">
                    ${baseFig(`
                    <path class="ch-limb" d="M8,-48 L36,-50"/>
                    <path class="ch-weapon" d="M40,-72 q20,24 0,46"/>
                    <path class="ch-weapon" d="M40,-72 L40,-26" stroke-width="1.6"/>
                    <path class="ch-arrow" d="M42,-50 h28 m-5,-4 l5,4 l-5,4"/>`)}
                </g>`,
            mage: `
                <g transform="translate(162,172)">
                    ${baseFig(`
                    <path class="ch-limb" d="M8,-48 L34,-46"/>
                    <path class="ch-weapon" d="M38,-76 L38,-24"/>
                    <circle class="ch-orb" cx="38" cy="-80" r="4"/>
                    <circle class="ch-glow" cx="38" cy="-80" r="10" style="transform-origin:200px 92px"/>`)}
                </g>`,
            berserker: `
                <g transform="translate(166,172)">
                    ${baseFig(`
                    <g class="ch-swing ch-swing-fast" style="transform-origin:8px -48px">
                        <path class="ch-limb" d="M8,-48 L32,-40"/>
                        <path class="ch-weapon" d="M32,-40 L54,-56"/><path class="ch-weapon" d="M48,-62 q10,6 2,14" stroke-width="6"/>
                    </g>
                    <g class="ch-swing ch-swing-fast" style="transform-origin:8px -48px;animation-delay:.55s">
                        <path class="ch-limb" d="M8,-48 L-16,-38"/>
                        <path class="ch-weapon" d="M-16,-38 L-38,-52"/><path class="ch-weapon" d="M-32,-58 q-10,6 -2,14" stroke-width="6"/>
                    </g>`)}
                </g>
                <path class="ch-tool" d="M120,176 l14,-3 m8,4 l12,-2" stroke-width="2" opacity=".5"/>`,
            knight: `
                <g class="ch-duel-hero">
                    <ellipse class="ch-shadow" cx="9" cy="4" rx="30" ry="6"/>
                    <path class="ch-limb" d="M0,0 L6,-30"/><path class="ch-limb" d="M18,0 L12,-30"/>
                    <path class="ch-body" d="M9,-30 L9,-54"/>
                    <circle class="ch-head" cx="9" cy="-64" r="9"/>
                    <path class="ch-weapon" d="M9,-73 q10,-6 17,-2" stroke-width="3"/>
                    <path class="ch-limb" d="M9,-50 L-12,-44"/>
                    <path class="ch-crown" d="M-22,-52 q-10,4 -8,16 q7,5 12,0 q4,-10 -4,-16 Z"/>
                    <g class="ch-swing" style="transform-origin:9px -50px">
                        <path class="ch-limb" d="M9,-50 L36,-46"/>
                        <path class="ch-weapon ch-blade" d="M36,-46 L72,-62"/>
                    </g>
                </g>
                <g class="ch-duel-foe">
                    <ellipse class="ch-shadow" cx="9" cy="4" rx="28" ry="6"/>
                    <path class="ch-limb" d="M0,0 L6,-30"/><path class="ch-limb" d="M18,0 L12,-30"/>
                    <path class="ch-body" d="M9,-30 L9,-54"/>
                    <circle class="ch-head" cx="9" cy="-64" r="9"/>
                    <g class="ch-swing ch-swing-slow" style="transform-origin:9px -50px">
                        <path class="ch-limb" d="M9,-50 L36,-44"/>
                        <path class="ch-weapon ch-blade" d="M36,-44 L68,-58"/>
                    </g>
                </g>
                <g class="ch-clash" transform="translate(188,106)"><path d="M0,-11 L3,-3 L11,0 L3,3 L0,11 L-3,3 L-11,0 L-3,-3 Z"/></g>`,
            king: `
                <g transform="translate(180,176)">
                    <path class="ch-throne" d="M-36,0 L-36,-78 L-24,-66 L-24,-32 L24,-32 L24,-66 L36,-78 L36,0 Z"/>
                    <ellipse class="ch-shadow" cx="0" cy="4" rx="44" ry="6"/>
                    <path class="ch-limb" d="M-9,-32 L-9,-6"/><path class="ch-limb" d="M9,-32 L9,-6"/>
                    <path class="ch-body" d="M0,-32 L0,-58"/>
                    <circle class="ch-head" cx="0" cy="-68" r="9"/>
                    <circle class="ch-glow" cx="0" cy="-82" r="14" style="transform-origin:180px 94px"/>
                    <path class="ch-crown" d="M-9,-78 L-9,-86 L-4,-80 L0,-88 L4,-80 L9,-86 L9,-78 Z"/>
                    <path class="ch-limb" d="M0,-52 L22,-46"/>
                    <path class="ch-weapon" d="M25,-72 L25,-40"/><circle class="ch-orb" cx="25" cy="-75" r="4"/>
                </g>`
        };
        const streakLine = streak > 0
            ? `${FIRE} ${streak}d streak keeps him fighting`
            : 'Log today to wake him up';
        return `
            <div class="lb-champion" data-stage="${stage}" data-state="${state}" aria-label="Your champion">
                <div class="lb-champion-stage">
                    <svg viewBox="0 0 360 190" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
                        <defs><linearGradient id="chSky" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/>
                        </linearGradient></defs>
                        <rect class="ch-sky" width="360" height="190" rx="0"/>
                        <ellipse class="ch-ground" cx="180" cy="184" rx="205" ry="20"/>
                        <g class="ch-banner" transform="translate(26,14)"><path d="M0,0 h18 v32 l-9,-7 l-9,7 Z"/></g>
                        <g class="ch-banner ch-banner2" transform="translate(316,14)"><path d="M0,0 h18 v32 l-9,-7 l-9,7 Z"/></g>
                        ${embers}
                        ${scenes[stage] || scenes.base}
                    </svg>
                </div>
                <div class="lb-champion-cap">
                    <span><b class="lb-champ-state">${CHAMP_STATE_LABELS[state] || 'Steady'}</b> ${CHAMP_STATE_CAPTIONS[state] || CHAMPION_CAPTIONS[stage]}</span>
                    <span class="lb-champion-streak" title="${CHAMPION_CAPTIONS[stage]}">${streakLine}</span>
                </div>
            </div>`;
    };

    /* ================================================================
       CHAMPION STATE ENGINE + MEDIA SLOTS (approved spec 2026-07-10)
       Every caste maps to 7 clip slots: 5 trajectory-state loops
       (dominant/thriving/steady/struggling/critical) + 2 one-shot
       transitions (promote/demote, owned by the caste you ARRIVE in).
       Files follow `<caste>_<slot>.mp4` under CHAMP_MEDIA.base. A null
       slot falls back to the built-in SVG scene, tinted per state, so
       the system is complete before a single MP4 exists.
       ================================================================ */
    const CHAMP_STATES = ['dominant', 'thriving', 'steady', 'struggling', 'critical'];
    const CHAMP_TUNING = {
        criticalMargin: 3,        // pts above the caste's demotion line -> critical
        strugglingMargin: 8,
        strugglingRankDrop: 12,   // overnight rank fall
        strugglingTrendDown: -6,  // summed 6-stat day-over-day drop
        dominantPromoGap: 5,      // worst promotion requirement within N pts
        dominantMargin: 12,
        dominantStreak: 3,
        thrivingRankClimb: 12,
        thrivingStreak: 7,
        thrivingTrendUp: 4,
        thrivingPromoProgress: 0.8,
        kingDominantMin: 88,      // king has no promotion: dominant = untouchable
        kingDominantSpread: 16,
        videoTimeoutMs: 2500      // slow clip -> SVG fallback
    };
    const CHAMP_MEDIA = {
        base: 'media/arena/',
        // Conventions (2026-07-10 ladder):
        //  - idle loops: `<caste>_<state>.mp4`
        //  - promote one-shots belong to the tier you ARRIVE in
        //    (squire_promote, specialist_promote shared by all three,
        //    knight_promote, king_promote)
        //  - demote one-shots belong to the tier you FALL FROM
        //    (squire_demote, knight_demote, king_demote; specialists
        //    demote with a message only, no clip)
        //  - peasant_reveal plays once for every new user
        // null = file not present yet (SVG fallback). Set to true once the
        // file exists on disk, or to a full URL string.
        clips: {
            king: { dominant: null, thriving: null, steady: null, struggling: null, critical: null, promote: null, demote: null },
            knight: { dominant: null, thriving: null, steady: null, struggling: null, critical: null, promote: null, demote: null },
            berserker: { thriving: null, struggling: null },
            ranger: { thriving: null, struggling: null },
            mage: { thriving: null, struggling: null },
            specialist: { promote: null },
            squire: { dominant: null, thriving: null, steady: null, struggling: null, critical: null, promote: null, demote: null },
            peasant: { dominant: null, thriving: null, steady: null, struggling: null, critical: null, reveal: null }
        }
    };
    const champClipUrl = (casteId, slot) => {
        const v = CHAMP_MEDIA.clips[casteId]?.[slot];
        if (!v) return null;
        return typeof v === 'string' ? v : `${CHAMP_MEDIA.base}${casteId}_${slot}.mp4`;
    };

    const CHAMP_STATE_LABELS = { dominant: 'Dominant', thriving: 'Thriving', steady: 'Steady', struggling: 'Struggling', critical: 'Critical' };
    const CHAMP_STATE_CAPTIONS = {
        dominant: 'Untouchable today. The next rank is already in sight.',
        thriving: 'Momentum is with you - keep pushing.',
        steady: 'Holding your ground in the ranks.',
        struggling: 'You slipped. Claw it back - one session turns this around.',
        critical: 'One bad week from losing this rank. Defend it today.'
    };

    // Points above your tier's ring - the better of the two ways you can
    // hold it (web coverage, or a spike counted double so pierced-in
    // holders aren't permanently on the edge). Peasant IS the floor.
    const casteHoldMargin = (casteId, s) => {
        const tierId = CHAMP_SPECIALISTS.includes(casteId) ? 'specialist' : casteId;
        const ring = TIER_RINGS.find((r) => r.id === tierId);
        if (!ring) return Infinity;
        const { avg, spike } = radarReach(s);
        return Math.max(avg - ring.avg, (spike - ring.spike) * 2);
    };

    const CHAMP_SPECIALISTS = ['ranger', 'mage', 'berserker'];
    // Specialists only have a good and a bad state - collapse the 5-state
    // read into thriving/struggling for them.
    const champEffectiveState = (casteId, state) => {
        if (!CHAMP_SPECIALISTS.includes(casteId)) return state;
        return (state === 'struggling' || state === 'critical') ? 'struggling' : 'thriving';
    };

    // meta.trend is null on cold start (no yesterday snapshot): trend and
    // streak-broken clauses are disabled so new users fall through honestly.
    const championState = (caste, stats, meta) => {
        const T = CHAMP_TUNING;
        const margin = casteHoldMargin(caste.id, stats);
        const streak = Number(meta.streak || 0);
        const rankDelta = Number(meta.rankDelta || 0);
        const hasTrend = Number.isFinite(meta.trend);
        const trend = hasTrend ? Number(meta.trend) : 0;
        const next = pickNextCaste(stats, caste);
        let promoGap = Infinity;
        let promoProgress = 0;
        if (!next) {
            const vals = CASTE_AXES.map((k) => Number(stats[k]) || 0);
            const min = Math.min(...vals);
            const spread = Math.max(...vals) - min;
            promoGap = (min >= T.kingDominantMin && spread <= T.kingDominantSpread) ? 0 : Infinity;
            promoProgress = min / 100;
        } else if (next.reqs.length) {
            promoGap = Math.max(0, ...next.reqs.map((r) => r.target - (Number(stats[r.key]) || 0)));
            promoProgress = next.reqs.reduce((a, r) => a + Math.min(1, (Number(stats[r.key]) || 0) / r.target), 0) / next.reqs.length;
        } else {
            promoGap = 0;
            promoProgress = 1;
        }
        if (margin <= T.criticalMargin) return 'critical';
        if (margin <= T.strugglingMargin
            || rankDelta <= -T.strugglingRankDrop
            || (hasTrend && trend <= T.strugglingTrendDown)
            || (hasTrend && streak === 0 && trend <= 0)) return 'struggling';
        if (promoGap <= T.dominantPromoGap
            && (margin >= T.dominantMargin || caste.id === 'king')
            && streak >= T.dominantStreak) return 'dominant';
        if (rankDelta >= T.thrivingRankClimb
            || streak >= T.thrivingStreak
            || (hasTrend && trend >= T.thrivingTrendUp)
            || promoProgress >= T.thrivingPromoProgress) return 'thriving';
        return 'steady';
    };

    // Daily snapshot: {today, prev} so revisits within a day keep comparing
    // against yesterday rather than five minutes ago.
    const champUpdateSnapshot = (casteId, stats, rank) => {
        const day = todayKey(new Date());
        let cur = null;
        try { cur = JSON.parse(localStorage.getItem('lbChampSnap') || 'null'); } catch {}
        let prev = cur?.prev || null;
        if (cur?.today && cur.today.day !== day) prev = cur.today;
        try {
            localStorage.setItem('lbChampSnap', JSON.stringify({ today: { day, casteId, stats, rank }, prev }));
        } catch {}
        return prev;
    };

    /* Which specialist shape fits these stats (one level, three shapes):
       Berserker - strength/progress surge, cardio+consistency+nutrition
       way off the pace. Ranger - cardio/recovery engine without the
       strength. Mage - the balanced consistency+nutrition build, the
       road to Knight. Synced with js/overview-identity.js. */
    const champSpecialistFor = (stats) => {
        const s = (k) => Number(stats[k]) || 0;
        const fury = (s('strength') + s('progress')) / 2;
        const engine = (s('cardio') + s('recovery')) / 2;
        const trio = (s('cardio') + s('consistency') + s('nutrition')) / 3;
        if (fury >= engine && fury - trio >= 18) return CASTE_MAP.berserker;
        if (engine >= 58 && s('strength') <= engine - 12) return CASTE_MAP.ranger;
        return CASTE_MAP.mage;
    };

    /* Held-tier engine. The tier you HOLD is sticky:
       - brand-new user -> Peasant + one-time reveal, then the grind
       - stats above your tier -> promote one tier per day (cutscene each)
       - same prestige, different shape -> lateral specialist swap, silent
       - stats below your tier for 3+ active days -> demote straight to
         whatever the stats now match */
    const champResolveTier = (matched, stats) => {
        const day = todayKey(new Date());
        let held = null;
        try { held = JSON.parse(localStorage.getItem('lbChampHeld') || 'null'); } catch {}
        const save = (h) => { try { localStorage.setItem('lbChampHeld', JSON.stringify(h)); } catch {} };
        if (!held?.casteId || !CASTE_MAP[held.casteId]) {
            save({ casteId: 'peasant', dropDays: 0, dropDay: '' });
            let revealSeen = false;
            try { revealSeen = localStorage.getItem('lbChampRevealSeen') === '1'; localStorage.setItem('lbChampRevealSeen', '1'); } catch {}
            return { caste: CASTE_MAP.peasant, event: revealSeen ? null : { kind: 'reveal', from: CASTE_MAP.peasant, to: CASTE_MAP.peasant } };
        }
        const heldCaste = CASTE_MAP[held.casteId];
        if (matched.prestige > heldCaste.prestige) {
            const nextPrestige = heldCaste.prestige + 1;
            const to = matched.prestige === nextPrestige
                ? matched
                : (nextPrestige === 2 ? champSpecialistFor(stats) : CASTES.find((c) => c.prestige === nextPrestige) || matched);
            save({ casteId: to.id, dropDays: 0, dropDay: '' });
            return { caste: to, event: { kind: 'promote', from: heldCaste, to } };
        }
        if (matched.prestige === heldCaste.prestige) {
            if (matched.id !== heldCaste.id || held.dropDays) save({ casteId: matched.id, dropDays: 0, dropDay: '' });
            return { caste: matched, event: null };
        }
        // Below the line: count active days, demote on the third.
        let dropDays = Number(held.dropDays || 0);
        if (held.dropDay !== day) dropDays += 1;
        if (dropDays >= 3) {
            save({ casteId: matched.id, dropDays: 0, dropDay: '' });
            return { caste: matched, event: { kind: 'demote', from: heldCaste, to: matched } };
        }
        save({ ...held, dropDays, dropDay: day });
        return { caste: heldCaste, event: null };
    };

    // Try a clip; only reveal it once it can actually play, otherwise the
    // SVG scene underneath simply stays. Never fights reduced-motion.
    const champTryVideo = (container, url, { loop } = {}) => {
        if (!url || !container) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        const v = document.createElement('video');
        v.className = 'lb-champion-video';
        v.muted = true;
        v.playsInline = true;
        v.autoplay = true;
        v.loop = !!loop;
        v.preload = 'auto';
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        let settled = false;
        const timer = window.setTimeout(() => { settled = true; v.remove(); }, CHAMP_TUNING.videoTimeoutMs);
        v.addEventListener('error', () => { if (!settled) { settled = true; window.clearTimeout(timer); v.remove(); } });
        v.addEventListener('canplay', () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            container.classList.add('has-video');
            container.appendChild(v);
            v.play().catch(() => {});
        });
        v.src = url;
    };

    const playChampionTransition = (trans) => {
        ensureChampionStyle();
        if (!trans || document.getElementById('lb-champ-trans')) return;
        const { kind, from, to } = trans;
        const overlay = document.createElement('div');
        overlay.id = 'lb-champ-trans';
        overlay.dataset.kind = kind;
        const copy = kind === 'reveal' ? {
            kicker: '⚒ Your story begins',
            title: 'You enter the Arena as a Peasant',
            line: 'Everyone starts in the mud. Train, log, and climb - the realm is watching.',
            cta: 'Begin the climb',
            sceneState: 'steady'
        } : kind === 'promote' ? {
            kicker: '☆ Rank up',
            title: `You rose to ${to.name}`,
            line: `${from.name} no more. The realm watched you climb - now hold the new ground.`,
            cta: 'Claim it',
            sceneState: 'dominant'
        } : {
            kicker: 'Rank lost',
            title: `You fell to ${to.name}`,
            line: `The ${from.name} rank slipped away. Weary, not beaten - claw it back.`,
            cta: 'Back to the fight',
            sceneState: 'struggling'
        };
        overlay.innerHTML = `
            <div class="lb-champ-trans-card" role="dialog" aria-label="Rank change">
                <div class="lb-champ-trans-stage">${championScene(to, 0, champEffectiveState(to.id, copy.sceneState))}</div>
                <div class="lb-champ-trans-body">
                    <div class="lb-champ-trans-kicker">${copy.kicker}</div>
                    <div class="lb-champ-trans-title">${to.emblem} ${copy.title}</div>
                    <div class="lb-champ-trans-line">${copy.line}</div>
                    <button type="button" class="lb-champ-trans-cta" data-champ-trans-close>${copy.cta}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        // Clip ownership: promote = the tier you arrive in (specialists share
        // one), demote = the tier you fall FROM (specialists have none),
        // reveal = peasant only.
        const clipUrl = kind === 'promote'
            ? champClipUrl(CHAMP_SPECIALISTS.includes(to.id) ? 'specialist' : to.id, 'promote')
            : kind === 'demote'
                ? champClipUrl(from.id, 'demote')
                : champClipUrl('peasant', 'reveal');
        champTryVideo(overlay.querySelector('.lb-champ-trans-stage'), clipUrl, { loop: false });
        overlay.querySelector('[data-champ-trans-close]')?.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    };

    /* Dev preview: ?champdev=1 shows a picker to force any caste+state and
       fire promote/demote overlays; ?champ=king.critical is a quick force;
       ?champdev=0 clears everything. Hidden from normal users. */
    let lastHeroData = null;
    const champForce = () => {
        try {
            const raw = localStorage.getItem('lbChampForce');
            const f = raw ? JSON.parse(raw) : null;
            return f && CASTE_MAP[f.caste] && CHAMP_STATES.includes(f.state) ? f : null;
        } catch { return null; }
    };
    // Runs before the first render so ?champ= and ?champdev= take effect on
    // the initial paint, not the next one.
    const champApplyUrlFlags = () => {
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('champdev') === '0') {
            try { localStorage.removeItem('lbChampDev'); localStorage.removeItem('lbChampForce'); } catch {}
            return;
        }
        const quick = String(params.get('champ') || '');
        if (quick.includes('.')) {
            const [c, st] = quick.split('.');
            if (CASTE_MAP[c] && CHAMP_STATES.includes(st)) {
                try { localStorage.setItem('lbChampForce', JSON.stringify({ caste: c, state: st })); } catch {}
            }
        }
        if (params.get('champdev') === '1') { try { localStorage.setItem('lbChampDev', '1'); } catch {} }
    };
    const setupChampDevPanel = () => {
        if (new URLSearchParams(window.location.search || '').get('champdev') === '0') {
            document.getElementById('lb-champ-dev')?.remove();
            return;
        }
        let on = false;
        try { on = localStorage.getItem('lbChampDev') === '1'; } catch {}
        if (!on || document.getElementById('lb-champ-dev')) return;
        const panel = document.createElement('div');
        panel.id = 'lb-champ-dev';
        const casteOpts = CASTES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
        const stateOpts = CHAMP_STATES.map((s) => `<option value="${s}">${CHAMP_STATE_LABELS[s]}</option>`).join('');
        panel.innerHTML = `
            <span>Champion preview</span>
            <div class="row"><select data-dev-caste>${casteOpts}</select><select data-dev-state>${stateOpts}</select></div>
            <div class="row"><button data-dev-apply>Apply</button><button data-dev-promote>Promote</button><button data-dev-demote>Demote</button></div>
            <div class="row"><button data-dev-reveal>Reveal</button><button data-dev-clear>Clear force</button><button data-dev-off>Hide panel</button></div>`;
        document.body.appendChild(panel);
        const sel = () => ({
            caste: panel.querySelector('[data-dev-caste]').value,
            state: panel.querySelector('[data-dev-state]').value
        });
        const rerender = () => { if (lastHeroData) renderCasteHero(lastHeroData); };
        panel.querySelector('[data-dev-apply]').addEventListener('click', () => {
            try { localStorage.setItem('lbChampForce', JSON.stringify(sel())); } catch {}
            rerender();
        });
        panel.querySelector('[data-dev-promote]').addEventListener('click', () => {
            // Promotes arrive INTO the selected tier.
            const to = CASTE_MAP[sel().caste];
            const from = CASTES.find((c) => c.prestige === to.prestige - 1) || CASTE_MAP.peasant;
            playChampionTransition({ kind: 'promote', from, to });
        });
        panel.querySelector('[data-dev-demote]').addEventListener('click', () => {
            // Demotes fall FROM the selected tier (that caste owns the clip).
            const from = CASTE_MAP[sel().caste];
            const to = CASTES.find((c) => c.prestige === from.prestige - 1) || CASTE_MAP.peasant;
            playChampionTransition({ kind: 'demote', from, to });
        });
        panel.querySelector('[data-dev-reveal]').addEventListener('click', () => {
            playChampionTransition({ kind: 'reveal', from: CASTE_MAP.peasant, to: CASTE_MAP.peasant });
        });
        panel.querySelector('[data-dev-clear]').addEventListener('click', () => {
            try { localStorage.removeItem('lbChampForce'); } catch {}
            rerender();
        });
        panel.querySelector('[data-dev-off]').addEventListener('click', () => {
            try { localStorage.removeItem('lbChampDev'); } catch {}
            panel.remove();
        });
    };

    const renderCasteHero = (data) => {
        ensureCasteStyle();
        ensureChampionStyle();
        lastHeroData = data;
        document.getElementById('lb-caste-hero')?.remove();
        const you = data?.you || null;
        if (!you || !listEl) return;
        const stats = readIdentityStats() || casteStatsFromRow(you);
        const matched = pickCaste(stats);
        // The tier you hold is sticky (3-day demotion grace, one-tier-per-day
        // climbs); the hero shows the held tier, not the raw stat match.
        const resolved = champResolveTier(matched, stats);
        const caste = resolved.caste;
        const next = pickNextCaste(stats, caste);
        const hero = document.createElement('section');
        hero.id = 'lb-caste-hero';
        hero.className = 'lb-caste-hero';
        hero.setAttribute('aria-label', 'Your caste and next level');
        const reqsMarkup = next && next.reqs.length
            ? next.reqs.slice(0, 3).map(r => `
                <div class="lb-caste-req" data-req-key="${r.key}">
                    <div class="lb-caste-req-top">
                        <span class="lb-caste-req-label">${CASTE_LABELS[r.key]}</span>
                        <span class="lb-caste-req-nums"><span data-req-now>0</span> / ${r.target}</span>
                    </div>
                    <div class="lb-caste-bar"><i data-req-bar data-now="${stats[r.key]}" data-target="${r.target}"></i></div>
                    <div class="lb-caste-req-advice">${AXIS_ADVICE[r.key]}</div>
                </div>
            `).join('')
            : '';
        const nextBlock = !next
            ? `<div class="lb-caste-next"><div class="lb-caste-next-head"><span class="next-emblem">${CASTE_MAP.king.emblem}</span> You hold the crown</div><div class="lb-caste-crowned">There is no caste above King - keep every stat at 75+ or the court will notice.</div></div>`
            : (next.reqs.length
                ? `<div class="lb-caste-next">
                       <div class="lb-caste-next-head">
                           <span>Next level:</span>
                           <span class="next-emblem">${next.caste.emblem}</span>
                           <strong>${next.caste.name}</strong>
                           <span class="next-count">${next.reqs.length} requirement${next.reqs.length === 1 ? '' : 's'} to go</span>
                       </div>
                       ${reqsMarkup}
                   </div>`
                : `<div class="lb-caste-next"><div class="lb-caste-next-head"><span>Next level:</span> <span class="next-emblem">${next.caste.emblem}</span> <strong>${next.caste.name}</strong></div><div class="lb-caste-crowned">You already meet the requirements - your caste updates as your stats refresh.</div></div>`);
        hero.innerHTML = `
            <div class="lb-caste-emblem" aria-hidden="true"><span>${caste.emblem}</span></div>
            <div class="lb-caste-main">
                <div class="lb-caste-eyebrow">Your caste</div>
                <h2>${caste.name}<span class="lb-caste-title-line">${personSentence(stats)}</span></h2>
                <p class="lb-caste-why">${caste.blurb}</p>
            </div>
            ${nextBlock}
            ${(() => {
                const streak = Number(you.streakDays || 0);
                const prev = champUpdateSnapshot(matched.id, stats, Number(you.rank || 0));
                const trend = prev?.stats
                    ? CASTE_AXES.reduce((a, k) => a + ((Number(stats[k]) || 0) - (Number(prev.stats[k]) || 0)), 0)
                    : null;
                let champCaste = caste;
                let champState = champEffectiveState(caste.id, championState(caste, stats, { streak, rankDelta: Number(you.__rankDelta || 0), trend }));
                const forced = champForce();
                if (forced) { champCaste = CASTE_MAP[forced.caste]; champState = champEffectiveState(champCaste.id, forced.state); }
                hero.dataset.champCaste = champCaste.id;
                hero.dataset.champState = champState;
                if (!forced && resolved.event) {
                    window.setTimeout(() => playChampionTransition(resolved.event), 400);
                }
                return championScene(champCaste, streak, champState);
            })()}
        `;
        listEl.parentElement?.insertBefore(hero, listEl);
        champTryVideo(
            hero.querySelector('.lb-champion-stage'),
            champClipUrl(hero.dataset.champCaste, hero.dataset.champState),
            { loop: true }
        );
        // Animate: bars sweep to their value, numbers count up.
        requestAnimationFrame(() => {
            hero.querySelectorAll('[data-req-bar]').forEach((bar) => {
                const now = Number(bar.getAttribute('data-now')) || 0;
                const target = Number(bar.getAttribute('data-target')) || 100;
                requestAnimationFrame(() => {
                    bar.style.width = `${Math.min(100, (now / target) * 100).toFixed(1)}%`;
                });
                const numEl = bar.closest('.lb-caste-req')?.querySelector('[data-req-now]');
                animateCount(numEl, now);
            });
        });
    };

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

    /* ================================================================
       THE GAME POPULATION
       ~2,400 deterministic community athletes so the board feels like a
       living game. Points skew toward the middle-upper ranks, the top
       castes have hard slot caps (only so many thrones), and the whole
       population reshuffles every day - same seed for everyone, so all
       players see the same world.
       ================================================================ */
    const GAME_POPULATION_SIZE = 2400;
    const CASTE_SLOTS = { king: 15, knight: 150 };

    const syncSeed = (str) => {
        let h = 1779033703 ^ String(str).length;
        for (let i = 0; i < String(str).length; i += 1) {
            h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return () => {
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            return ((h ^= h >>> 16) >>> 0) / 4294967296;
        };
    };

    const GAME_FIRST_NAMES = ['Marcus', 'Lena', 'Diego', 'Priya', 'Cole', 'Amara', 'Felix', 'Nadia', 'Owen', 'Zara', 'Bruno', 'Ivy', 'Dante', 'Freya', 'Silas', 'Mara', 'Theo', 'Alina', 'Rocco', 'Wren', 'Kai', 'Esme', 'Jonas', 'Talia', 'Ezra', 'Nova', 'Luca', 'Sage', 'Mateo', 'Iris', 'Axel', 'Remy', 'Nash', 'Vera', 'Otto', 'Lyra', 'Enzo', 'Cleo', 'Hugo', 'Isla'];
    const GAME_LAST_NAMES = ['Steele', 'Varga', 'Okafor', 'Lindqvist', 'Moreau', 'Castillo', 'Novak', 'Ferrer', 'Haas', 'Iversen', 'Kowalski', 'Tanaka', 'Reyes', 'Bishop', 'Drummond', 'Ashford', 'Vance', 'Holt', 'Mercer', 'Quinn', 'Sato', 'Lombardi', 'Petrov', 'Nyström', 'Delacroix', 'Barros', 'Kessler', 'Whitlock', 'Aldana', 'Brandt', 'Falk', 'Grimaldi', 'Hale', 'Ibarra', 'Joric', 'Katz', 'Larkin', 'Madsen', 'North', 'Pryor', 'Roan', 'Sylvan', 'Thorne', 'Ulrich', 'Voss', 'Winters', 'Yates', 'Zamora', 'Bergström', 'Calloway', 'Duval', 'Eastwood', 'Farrow', 'Giannis', 'Hollis', 'Ingram', 'Juno', 'Kirby', 'Lowe', 'Marsh'];

    /* Each athlete is a stable PERSON (index) with a stable base score and a
       join date proportional to that score - veterans have the points to show
       for it. Daily jitter reshuffles ranks each day, and evaluating
       yesterday's points gives every athlete a real rise/drop delta. */
    const yesterdayKey = (day) => {
        const d = new Date(`${day}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    };

    const gamePersonBase = (index) => {
        const rnd = syncSeed(`lb_person_${index}`);
        const bell = (rnd() + rnd() + rnd()) / 3;
        const skewed = Math.pow(bell, 0.82);
        return Math.round(40 + skewed * 1460);
    };

    const gamePersonPoints = (index, base, day) => {
        const rnd = syncSeed(`lb_daily_${day}_${index}`);
        return Math.max(10, Math.round(base + rnd() * 170 - 85));
    };

    const gamePersonIdentity = (index, day) => {
        const rnd = syncSeed(`lb_person_id_${index}`);
        const first = GAME_FIRST_NAMES[Math.floor(rnd() * GAME_FIRST_NAMES.length)];
        const last = GAME_LAST_NAMES[Math.floor(rnd() * GAME_LAST_NAMES.length)];
        const displayName = `${first} ${last}`;
        const handle = `@${first}${last}`.toLowerCase().replace(/[^a-z0-9@]/g, '').slice(0, 18);
        const palette = [['#e8c766', '#b98a2b'], ['#a78bfa', '#f472b6'], ['#f97316', '#facc15'], ['#60a5fa', '#34d399'], ['#fb7185', '#f59e0b'], ['#38bdf8', '#a3e635']];
        const [a, b] = palette[index % palette.length];
        // Realistic tenure: the more points an athlete accrues, the longer
        // they have been around. Top scorers joined many months ago.
        const base = gamePersonBase(index);
        const daysAgo = Math.round(12 + (base / 1500) * 330 + rnd() * 30);
        const joined = new Date(`${day}T00:00:00Z`);
        joined.setUTCDate(joined.getUTCDate() - daysAgo);
        return { displayName, handle, colors: [a, b], joinedAt: joined.toISOString() };
    };

    const casteForGameRank = (rank, rnd) => {
        if (rank <= 12) return 'king';
        if (rank <= 12 + 138) return 'knight';
        if (rank <= 12 + 138 + 640) {
            const classes = ['ranger', 'mage', 'berserker'];
            return classes[Math.floor(rnd() * classes.length)];
        }
        if (rank <= 12 + 138 + 640 + 1020) return 'squire';
        return 'peasant';
    };

    const gameFakeRow = (personIndex, rank, pts, delta, day) => {
        const identity = gamePersonIdentity(personIndex, day);
        const rowRnd = syncSeed(`lb_fake_row_${day}_${personIndex}`);
        const casteId = casteForGameRank(rank, rowRnd);
        const streakDays = Math.max(0, Math.round(pts / 90) + Math.floor(rowRnd() * 6) - 2);
        const workouts = Math.max(0, Math.round(pts / 80) + Math.floor(rowRnd() * 4) - 1);
        const checkins = Math.max(streakDays, Math.round(pts / 45));
        return {
            id: `game_p${personIndex}`,
            rank,
            delta,
            displayName: identity.displayName,
            handle: identity.handle,
            // Local SVG avatars only: remote portrait services made the page slow.
            avatarUrl: encodeSvgDataUrl(avatarSvg({ initials: initialsFromName(identity.displayName), a: identity.colors[0], b: identity.colors[1] })),
            joinedAt: identity.joinedAt,
            points: pts,
            breakdown: {
                workouts,
                checkins,
                groceryPlans: Math.floor(rowRnd() * 6),
                mealPrepDays: Math.floor(checkins * rowRnd() * 0.6),
                mealsOnPlanDays: Math.floor(checkins * rowRnd() * 0.7),
                measurementDays: Math.floor(rowRnd() * 8),
                measurementBonus: Math.floor(rowRnd() * 10)
            },
            bio: '',
            streakDays,
            isBot: true,
            badges: [],
            __caste: casteId
        };
    };

    const buildGameBoard = (serverEntries, day) => {
        const prevDay = yesterdayKey(day);
        const people = [];
        for (let i = 0; i < GAME_POPULATION_SIZE; i += 1) {
            const base = gamePersonBase(i);
            people.push({
                index: i,
                points: gamePersonPoints(i, base, day),
                prevPoints: gamePersonPoints(i, base, prevDay)
            });
        }
        // Yesterday's ranks by yesterday's points.
        const prevOrder = people.slice().sort((a, b) => b.prevPoints - a.prevPoints);
        const prevRankByIndex = new Map();
        prevOrder.forEach((p, i) => prevRankByIndex.set(p.index, i + 1));

        const real = (Array.isArray(serverEntries) ? serverEntries : []).filter((r) => !r.isBot);
        const todaySorted = people.slice().sort((a, b) => b.points - a.points);
        const merged = [];
        const realQueue = real.slice().sort((a, b) => Number(b.points || 0) - Number(a.points || 0));
        let fakeCursor = 0;
        while (fakeCursor < todaySorted.length || realQueue.length) {
            const nextFake = fakeCursor < todaySorted.length ? todaySorted[fakeCursor].points : -1;
            const nextReal = realQueue.length ? Number(realQueue[0].points || 0) : -1;
            if (nextReal >= nextFake && realQueue.length) merged.push({ src: 'real', row: realQueue.shift() });
            else { merged.push({ src: 'fake', person: todaySorted[fakeCursor] }); fakeCursor += 1; }
        }
        const rows = merged.map((slot, i) => {
            const rank = i + 1;
            if (slot.src === 'real') {
                const stats = slot.row.isFriend ? casteStatsFromRow(slot.row) : (readIdentityStats() || casteStatsFromRow(slot.row));
                // Real people's delta: where yesterday's points would have
                // landed them in yesterday's population.
                const prevWouldRank = 1 + prevOrder.filter((p) => p.prevPoints > Number(slot.row.points || 0)).length;
                return { ...slot.row, rank, delta: prevWouldRank - rank, __caste: pickCaste(stats).id, __stats: stats };
            }
            const prevRank = prevRankByIndex.get(slot.person.index) || rank;
            return gameFakeRow(slot.person.index, rank, slot.person.points, prevRank - rank, day);
        });
        return { rows, total: rows.length };
    };

    // Curated window: the top 3 become podium cards, only ranks 4-10 get
    // full rows, then a gap and your own neighborhood. Nobody scrolls
    // through hundreds of strangers.
    const buildGameWindow = (rows, youId) => {
        const youIndex = rows.findIndex((r) => String(r.id) === String(youId));
        const LIST_END = 10;
        const visible = rows.slice(0, 3).map((r) => ({ ...r, __podium: true }));
        if (youIndex >= LIST_END + 3) {
            visible.push(...rows.slice(3, LIST_END));
            visible.push({ __gap: true, count: youIndex - 2 - LIST_END });
            visible.push(...rows.slice(youIndex - 2, Math.min(rows.length, youIndex + 3)));
            const remaining = rows.length - (youIndex + 3);
            if (remaining > 0) visible.push({ __gap: true, count: remaining });
        } else {
            const upper = Math.min(rows.length, Math.max(LIST_END, youIndex + 3));
            visible.push(...rows.slice(3, upper));
            if (rows.length > upper) visible.push({ __gap: true, count: rows.length - upper });
        }
        return visible;
    };

    /* ================================================================
       ARENA RESKIN - the whole page becomes a tournament hall: dark ink,
       gold trim, medal glows. Injected here so the page shell (owned by
       concurrent onboarding work) stays untouched.
       ================================================================ */
    const ensureArenaStyle = () => {
        if (document.getElementById('lb-arena-style')) return;
        const style = document.createElement('style');
        style.id = 'lb-arena-style';
        style.textContent = `
            body.leaderboard-page{background:#faf5ea !important;
                background-image:radial-gradient(120% 70% at 50% -10%,rgba(212,175,55,.16),transparent 60%),
                    radial-gradient(80% 50% at 100% 100%,rgba(185,138,43,.08),transparent 55%) !important;
                color:#2b2214}
            body.leaderboard-page .lb-header .eyebrow{color:#a1751f !important;letter-spacing:.26em}
            body.leaderboard-page .lb-header h1{color:#241b0e !important}
            body.leaderboard-page .lb-header .ns-muted{color:rgba(60,48,28,.55) !important}
            body.leaderboard-page .lb-header button,
            body.leaderboard-page .lb-header .lb-friends-btn{background:rgba(212,175,55,.12) !important;
                border:1px solid rgba(185,138,43,.45) !important;color:#a1751f !important;border-radius:999px}
            body.leaderboard-page .lb-header button:hover{background:rgba(212,175,55,.22) !important}
            body.leaderboard-page .lb-you{background:linear-gradient(160deg,#fffaf0,#f7ecd6) !important;
                border:1px solid rgba(185,138,43,.45) !important;color:#2b2214 !important;border-radius:16px;
                box-shadow:0 12px 28px rgba(120,90,20,.12)}
            body.leaderboard-page .lb-you *{color:#2b2214}
            body.leaderboard-page .lb-you #lb-you-sub,body.leaderboard-page .lb-you #lb-you-right{color:#a1751f !important;font-weight:800}
            body.leaderboard-page .lb-row{display:flex;align-items:center;gap:14px;margin-bottom:10px;padding:14px 16px;
                border-radius:16px;background:#fffdf7 !important;
                border:1px solid rgba(150,110,35,.18) !important;color:#2b2214;
                box-shadow:0 8px 20px rgba(120,90,20,.08);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;
                animation:lbRowIn .45s cubic-bezier(.2,.8,.3,1) backwards}
            @keyframes lbRowIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
            body.leaderboard-page .lb-row:hover{transform:translateY(-2px);border-color:rgba(185,138,43,.5) !important;box-shadow:0 14px 30px rgba(120,90,20,.16)}
            body.leaderboard-page .lb-row.is-gold{border-color:rgba(212,160,30,.85) !important;box-shadow:0 0 0 1px rgba(212,160,30,.4),0 14px 32px rgba(212,160,30,.22);
                background:linear-gradient(165deg,#fffdf5,#fdf4dc) !important}
            body.leaderboard-page .lb-row.is-silver{border-color:rgba(148,163,184,.7) !important}
            body.leaderboard-page .lb-row.is-bronze{border-color:rgba(196,112,32,.6) !important}
            body.leaderboard-page .lb-row.is-you-row{border-color:#b98a2b !important;
                box-shadow:0 0 0 1.5px rgba(185,138,43,.55),0 14px 34px rgba(185,138,43,.2);position:relative}
            body.leaderboard-page .lb-row.is-you-row::before{content:'YOU';position:absolute;top:-9px;left:16px;
                padding:3px 9px;border-radius:999px;background:#b98a2b;color:#fff;font:900 9px/1 system-ui,sans-serif;letter-spacing:.14em}
            body.leaderboard-page .lb-rankbox{display:flex;flex-direction:column;align-items:center;gap:4px;flex:0 0 64px}
            body.leaderboard-page .lb-ranknum{font:900 15px/1 'Space Grotesk',ui-monospace,monospace;color:#a1751f}
            body.leaderboard-page .lb-row.is-gold .lb-ranknum{font-size:19px;color:#c8931b}
            body.leaderboard-page .lb-avatar{width:44px;height:44px;border-radius:999px;overflow:hidden;border:2px solid rgba(185,138,43,.45)}
            body.leaderboard-page .lb-avatar img{width:100%;height:100%;object-fit:cover}
            body.leaderboard-page .lb-avatar-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                background:rgba(212,175,55,.16);color:#a1751f;font:800 14px/1 system-ui,sans-serif}
            body.leaderboard-page .lb-name{color:#241b0e !important;font-weight:800}
            body.leaderboard-page .lb-handle{color:rgba(60,48,28,.45) !important}
            body.leaderboard-page .lb-bio{color:rgba(60,48,28,.55) !important}
            body.leaderboard-page .lb-client-metrics,body.leaderboard-page .lb-client-metrics span{color:rgba(60,48,28,.62) !important}
            body.leaderboard-page .lb-client-metrics strong{color:#a1751f !important}
            body.leaderboard-page .lb-caste-rowhint{color:#8a6318 !important}
            body.leaderboard-page .lb-pill{background:rgba(120,90,20,.06) !important;border:1px solid rgba(120,90,20,.16) !important;color:rgba(60,48,28,.85) !important}
            body.leaderboard-page .lb-pill.lb-caste-pill{background:rgba(212,175,55,.16) !important;border-color:rgba(185,138,43,.5) !important;color:#a1751f !important}
            body.leaderboard-page .lb-points{font:900 17px/1 'Space Grotesk',ui-monospace,monospace;color:#241b0e;text-align:right}
            body.leaderboard-page .lb-points-unit{margin-left:4px;font:700 10px/1 system-ui,sans-serif;color:#a1751f}
            body.leaderboard-page .lb-points-note{font:600 10px/1.3 system-ui,sans-serif;color:rgba(60,48,28,.45);text-align:right;margin-top:3px}
            body.leaderboard-page .lb-right{flex:0 0 auto;margin-left:auto}
            .lb-delta{font:900 10.5px/1 ui-monospace,monospace;padding:2px 7px;border-radius:999px}
            .lb-delta.is-up{color:#15803d;background:rgba(34,197,94,.14)}
            .lb-delta.is-down{color:#b91c1c;background:rgba(239,68,68,.12)}
            .lb-delta.is-flat{color:rgba(60,48,28,.4)}
            .lb-spider{flex:0 0 92px;display:flex;align-items:center;justify-content:center}
            .lb-mini-radar{width:88px;height:88px}
            .lb-mini-radar .ring{fill:none;stroke:rgba(150,110,35,.2)}
            .lb-mini-radar .spoke{stroke:rgba(150,110,35,.14)}
            .lb-mini-radar .shape{fill:rgba(185,138,43,.24);stroke:#b98a2b;stroke-width:1.6;stroke-linejoin:round}
            /* Podium - only the champions get big cards */
            .lb-podium{display:flex;align-items:flex-end;justify-content:center;gap:12px;margin:0 0 16px}
            .lb-podium-card{flex:1 1 0;max-width:220px;display:flex;flex-direction:column;align-items:center;gap:6px;
                padding:16px 12px 14px;border-radius:18px;background:#fffdf7;border:1px solid rgba(185,138,43,.35);
                box-shadow:0 12px 28px rgba(120,90,20,.12);text-align:center;
                animation:lbRowIn .5s cubic-bezier(.2,.8,.3,1) backwards}
            .lb-podium-card.place-1{max-width:250px;padding-top:20px;border-color:rgba(212,160,30,.85);
                background:linear-gradient(170deg,#fffdf5,#fcf1d4);box-shadow:0 0 0 1px rgba(212,160,30,.35),0 18px 40px rgba(212,160,30,.22);order:2}
            .lb-podium-card.place-2{order:1;animation-delay:.08s}
            .lb-podium-card.place-3{order:3;animation-delay:.16s}
            .lb-podium-medal{font:900 13px/1 'Space Grotesk',system-ui,sans-serif;color:#a1751f}
            .lb-podium-card.place-1 .lb-podium-medal{font-size:16px;color:#c8931b}
            .lb-podium-avatar{width:56px;height:56px;border-radius:999px;overflow:hidden;border:2.5px solid rgba(185,138,43,.55)}
            .lb-podium-card.place-1 .lb-podium-avatar{width:68px;height:68px;border-color:#c8931b}
            .lb-podium-avatar img{width:100%;height:100%;object-fit:cover}
            .lb-podium-name{font:800 13.5px/1.2 system-ui,sans-serif;color:#241b0e;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .lb-podium-pts{font:900 15px/1 'Space Grotesk',ui-monospace,monospace;color:#a1751f}
            .lb-podium-crown{font-size:20px;line-height:1;color:#c8931b;margin-bottom:-2px}
            .lb-showmore{display:flex;justify-content:center;margin:4px 0 14px}
            .lb-showmore button{min-height:40px;padding:0 20px;border-radius:999px;border:1px solid rgba(185,138,43,.45);
                background:rgba(212,175,55,.1);color:#a1751f;font:800 12.5px/1 system-ui,sans-serif;cursor:pointer}
            .lb-showmore button:hover{background:rgba(212,175,55,.2)}
            /* Arrival intro */
            #lb-arena-intro{position:fixed;inset:0;z-index:190;display:flex;align-items:center;justify-content:center;
                background:#faf5ea;pointer-events:none;animation:lbIntroLift .5s ease 1.35s forwards}
            @keyframes lbIntroLift{to{opacity:0;visibility:hidden}}
            .lb-intro-inner{text-align:center;animation:lbIntroPop .6s cubic-bezier(.2,.9,.3,1.2)}
            @keyframes lbIntroPop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}
            .lb-intro-crest{font-size:44px;color:#b98a2b;margin-bottom:10px;display:block;animation:lbCrestPulse 1.4s ease-in-out infinite}
            @keyframes lbCrestPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
            .lb-intro-title{font:900 30px/1.1 'Space Grotesk',system-ui,sans-serif;color:#241b0e;letter-spacing:.06em}
            .lb-intro-sub{margin-top:8px;font:700 11px/1 system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#a1751f}
            /* Movers ticker */
            .lb-ticker{display:flex;overflow:hidden;margin:0 0 14px;padding:9px 0;border-radius:12px;
                background:rgba(212,175,55,.1);border:1px solid rgba(185,138,43,.3)}
            .lb-ticker-track{display:flex;gap:34px;white-space:nowrap;animation:lbTicker 36s linear infinite;padding-left:100%}
            @keyframes lbTicker{to{transform:translateX(-100%)}}
            .lb-ticker span{font:700 12px/1 system-ui,sans-serif;color:rgba(60,48,28,.8)}
            .lb-ticker b.up{color:#15803d}
            .lb-ticker b.down{color:#b91c1c}
            @media (prefers-reduced-motion: reduce){
                #lb-arena-intro{display:none}
                .lb-ticker-track{animation:none;padding-left:0}
                body.leaderboard-page .lb-row{animation:none}
                .lb-podium-card{animation:none}
            }
            @media (max-width:720px){
                .lb-spider{display:none}
                body.leaderboard-page .lb-rankbox{flex-basis:52px}
                .lb-podium{gap:8px}
            }
        `;
        document.head.appendChild(style);
    };

    const playArenaIntro = () => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        if (document.getElementById('lb-arena-intro')) return;
        ensureChampionStyle();
        const intro = document.createElement('div');
        intro.id = 'lb-arena-intro';
        const dayName = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        const embers = Array.from({ length: 16 }, (_, i) =>
            `<i style="left:${(i * 6.3 + 2).toFixed(1)}%;animation-duration:${(1.6 + (i % 5) * 0.4).toFixed(1)}s;animation-delay:${(i * 0.13).toFixed(2)}s"></i>`).join('');
        intro.innerHTML = `
            <div class="lb-intro-gate is-left"></div>
            <div class="lb-intro-gate is-right"></div>
            <div class="lb-intro-embers" aria-hidden="true">${embers}</div>
            <div class="lb-intro-inner">
                <svg class="lb-intro-shield" viewBox="0 0 64 72" aria-hidden="true">
                    <defs><clipPath id="lbShieldClip"><path d="M32 2 L60 12 V38 Q60 58 32 70 Q4 58 4 38 V12 Z"/></clipPath></defs>
                    <path class="shield" d="M32 2 L60 12 V38 Q60 58 32 70 Q4 58 4 38 V12 Z"/>
                    <path class="swords" d="M20 24 L44 48 M44 24 L20 48"/>
                    <rect class="shine" x="-26" y="-2" width="18" height="78" clip-path="url(#lbShieldClip)"/>
                </svg>
                <div class="lb-intro-title">THE ARENA</div>
                <div class="lb-intro-sub">${dayName}</div>
                <div class="lb-intro-tag">${GAME_POPULATION_SIZE.toLocaleString()} fighters · the gates open</div>
            </div>
        `;
        document.body.appendChild(intro);
        window.setTimeout(() => intro.remove(), 3300);
    };

    const renderMoversTicker = (rows) => {
        document.getElementById('lb-ticker')?.remove();
        if (!listEl) return;
        const movers = rows
            .filter((r) => !r.__gap && Number.isFinite(Number(r.delta)) && Math.abs(Number(r.delta)) >= 3 && Number(r.rank) <= 400)
            .sort((a, b) => Math.abs(Number(b.delta)) - Math.abs(Number(a.delta)))
            .slice(0, 10);
        if (movers.length < 4) return;
        const items = movers.map((r) => {
            const d = Number(r.delta);
            return `<span>${escapeAttr(r.displayName)} <b class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</b></span>`;
        }).join('');
        const ticker = document.createElement('div');
        ticker.id = 'lb-ticker';
        ticker.className = 'lb-ticker';
        ticker.setAttribute('aria-label', "Today's biggest movers");
        ticker.innerHTML = `<div class="lb-ticker-track">${items}${items}</div>`;
        listEl.parentElement?.insertBefore(ticker, listEl);
    };

    const gameTierCounts = (day) => {
        const tierRnd = syncSeed(`lb_tiers_${day}`);
        const king = 11 + Math.floor(tierRnd() * 4); // 11-14 of 15 thrones taken
        const knight = 136 + Math.floor(tierRnd() * 12); // 136-147 of 150 seats
        return {
            king,
            knight,
            class: 640,
            squire: 1020,
            base: GAME_POPULATION_SIZE - king - knight - 640 - 1020
        };
    };

    /* Caste pyramid - the shape of the realm, with slot caps up top. */
    const renderCastePyramid = (rows, total, youCasteId, mode) => {
        ensureCasteStyle();
        document.getElementById('lb-caste-pyramid')?.remove();
        if (!listEl) return;
        const counts = {};
        rows.forEach((r) => {
            if (r.__gap) return;
            const id = r.__caste || pickCaste(casteStatsFromRow(r)).id;
            counts[id] = (counts[id] || 0) + 1;
        });
        // For the community game the tier counts come from the full population
        // model, not just the rendered window.
        const communityCounts = gameTierCounts(todayKey(new Date()));
        const tiers = mode === 'community'
            ? [
                { id: 'king', label: 'King', emblem: '♛', width: 22, count: communityCounts.king, cap: CASTE_SLOTS.king },
                { id: 'knight', label: 'Knight', emblem: '♞', width: 36, count: communityCounts.knight, cap: CASTE_SLOTS.knight },
                { id: 'class', label: 'Specialists', emblem: '➳', width: 50, count: communityCounts.class, matches: ['ranger', 'mage', 'berserker'] },
                { id: 'squire', label: 'Squire', emblem: '⚑', width: 62, count: communityCounts.squire },
                { id: 'base', label: 'Peasant', emblem: '⚒', width: 72, count: communityCounts.base, matches: ['peasant'] }
            ]
            : [
                { id: 'king', label: 'King', emblem: '♛', width: 22, count: counts.king || 0 },
                { id: 'knight', label: 'Knight', emblem: '♞', width: 36, count: counts.knight || 0 },
                { id: 'class', label: 'Specialists', emblem: '➳', width: 50, count: (counts.ranger || 0) + (counts.mage || 0) + (counts.berserker || 0), matches: ['ranger', 'mage', 'berserker'] },
                { id: 'squire', label: 'Squire', emblem: '⚑', width: 62, count: counts.squire || 0 },
                { id: 'base', label: 'Peasant', emblem: '⚒', width: 72, count: counts.peasant || 0, matches: ['peasant'] }
            ];
        const youTier = tiers.find((t) => (t.matches ? t.matches.includes(youCasteId) : t.id === youCasteId));
        const pyramid = document.createElement('section');
        pyramid.id = 'lb-caste-pyramid';
        pyramid.className = 'lb-caste-pyramid';
        pyramid.setAttribute('aria-label', 'Caste pyramid');
        pyramid.innerHTML = `
            <div class="lb-pyramid-title">The Realm${mode === 'community' ? ` · ${total.toLocaleString()} athletes` : ''}</div>
            ${tiers.map((t, i) => `
                <div class="lb-pyramid-tier${youTier && t.id === youTier.id ? ' is-you' : ''}" style="width:${t.width}%;animation-delay:${i * 90}ms" data-tier="${t.id}">
                    <span class="lb-pyramid-emblem">${t.emblem}</span>
                    <span class="lb-pyramid-label">${t.label}</span>
                    <span class="lb-pyramid-count">${t.cap ? `${Math.min(t.count, t.cap)}/${t.cap} slots` : t.count.toLocaleString()}</span>
                    ${youTier && t.id === youTier.id ? '<span class="lb-pyramid-you">YOU</span>' : ''}
                </div>
            `).join('')}
        `;
        listEl.parentElement?.insertBefore(pyramid, listEl);
    };

    /* Daily shift event - plays once per day, everyone sees the same story. */
    const maybePlayDailyShift = (mode) => {
        if (mode !== 'community') return;
        const day = todayKey(new Date());
        try {
            if (localStorage.getItem('lbShiftSeen') === day) return;
            localStorage.setItem('lbShiftSeen', day);
        } catch {}
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        const rnd = syncSeed(`lb_shift_${day}`);
        const climbed = 160 + Math.floor(rnd() * 220);
        const fell = 140 + Math.floor(rnd() * 200);
        const crowned = 1 + Math.floor(rnd() * 3);
        const thronesOpen = Math.max(0, CASTE_SLOTS.king - gameTierCounts(day).king);
        const overlay = document.createElement('div');
        overlay.id = 'lb-shift-overlay';
        let particles = '';
        for (let i = 0; i < 30; i += 1) {
            particles += `<i style="left:${(rnd() * 100).toFixed(1)}%;animation-duration:${(1.8 + rnd() * 1.6).toFixed(2)}s;animation-delay:${(rnd() * 0.9).toFixed(2)}s"></i>`;
        }
        overlay.innerHTML = `
            <div class="lb-shift-particles" aria-hidden="true">${particles}</div>
            <div class="lb-shift-card" role="status">
                <div class="lb-shift-crest">⚔</div>
                <div class="lb-shift-title">The ranks have shifted</div>
                <div class="lb-shift-lines">
                    <div class="lb-shift-line" style="animation-delay:.25s">▲ <strong>${climbed}</strong> athletes climbed overnight</div>
                    <div class="lb-shift-line" style="animation-delay:.55s">▼ <strong>${fell}</strong> slipped down the pyramid</div>
                    <div class="lb-shift-line" style="animation-delay:.85s">♛ <strong>${crowned}</strong> new King${crowned === 1 ? '' : 's'} crowned — ${thronesOpen} throne${thronesOpen === 1 ? '' : 's'} open</div>
                </div>
                <button type="button" class="lb-shift-cta">See where you stand</button>
            </div>
        `;
        document.body.appendChild(overlay);
        const dismiss = () => overlay.remove();
        overlay.querySelector('.lb-shift-cta')?.addEventListener('click', dismiss);
        overlay.addEventListener('mousedown', (event) => {
            if (event.target === overlay) dismiss();
        });
        window.setTimeout(dismiss, 7000);
    };

    /* Add-friends: exact-username lookup + friend request, right from the
       leaderboard. Accepted friends then appear as real rows on the
       community board. */
    let friendsPopEl = null;
    const closeFriendsPop = () => {
        friendsPopEl?.remove();
        friendsPopEl = null;
    };
    const setupFriendsButton = () => {
        ensureCasteStyle();
        if (document.getElementById('lb-friends-btn')) return;
        const host = openRulesBtn?.parentElement;
        if (!host) return;
        const button = document.createElement('button');
        button.id = 'lb-friends-btn';
        button.type = 'button';
        button.className = `${openRulesBtn.className || ''} lb-friends-btn`.trim();
        button.innerHTML = '&#9876; Add friends';
        host.insertBefore(button, openRulesBtn);
        button.addEventListener('click', () => {
            if (friendsPopEl) {
                closeFriendsPop();
                return;
            }
            const rect = button.getBoundingClientRect();
            friendsPopEl = document.createElement('div');
            friendsPopEl.className = 'lb-friends-pop';
            friendsPopEl.style.top = `${Math.round(rect.bottom + 8)}px`;
            friendsPopEl.style.right = `${Math.max(10, Math.round(window.innerWidth - rect.right))}px`;
            friendsPopEl.innerHTML = `
                <h3>Add a friend to the board</h3>
                <p>Find them by username. Once they accept, they show up on your community leaderboard.</p>
                <div class="lb-friends-row">
                    <input type="text" placeholder="@username" aria-label="Friend username" data-friends-input>
                    <button type="button" data-friends-find>Find</button>
                </div>
                <div data-friends-result></div>
                <div class="lb-friends-status" data-friends-status></div>
            `;
            document.body.appendChild(friendsPopEl);
            const input = friendsPopEl.querySelector('[data-friends-input]');
            const statusEl = friendsPopEl.querySelector('[data-friends-status]');
            const resultEl = friendsPopEl.querySelector('[data-friends-result]');
            input?.focus();
            const runFind = async () => {
                const username = String(input?.value || '').trim();
                if (!username) return;
                statusEl.textContent = 'Searching...';
                resultEl.innerHTML = '';
                try {
                    const resp = await fetch(`/api/friends/find?username=${encodeURIComponent(username)}`, { credentials: 'include' });
                    const json = await resp.json().catch(() => ({}));
                    if (!resp.ok || !json?.ok) {
                        statusEl.textContent = json?.error || 'Could not search right now.';
                        return;
                    }
                    statusEl.textContent = '';
                    const found = json.user;
                    resultEl.innerHTML = `
                        <div class="lb-friends-result">
                            ${found.avatarUrl ? `<img src="${escapeAttr(found.avatarUrl)}" alt="">` : `<img alt="" style="display:none"><div class="lb-avatar-fallback" style="width:38px;height:38px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#e2e8f0;font:800 13px/1 system-ui">${initialsFromName(found.displayName)}</div>`}
                            <div class="who"><strong>${escapeAttr(found.displayName)}</strong><span>@${escapeAttr(found.username)}</span></div>
                            <button type="button" data-friends-add ${found.isFriend ? 'disabled' : ''}>${found.isFriend ? 'Friends ✓' : 'Add'}</button>
                        </div>
                    `;
                    resultEl.querySelector('[data-friends-add]')?.addEventListener('click', async (event) => {
                        const addButton = event.currentTarget;
                        addButton.disabled = true;
                        addButton.textContent = 'Sending...';
                        const addResp = await fetch('/api/friends/request', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ targetUserId: found.id })
                        });
                        const addJson = await addResp.json().catch(() => ({}));
                        if (!addResp.ok || !addJson?.ok) {
                            addButton.disabled = false;
                            addButton.textContent = 'Add';
                            statusEl.textContent = addJson?.error || 'Could not send the request.';
                            return;
                        }
                        addButton.textContent = 'Request sent ✓';
                        statusEl.textContent = `They'll appear on your board once they accept.`;
                    });
                } catch {
                    statusEl.textContent = 'Could not search right now.';
                }
            };
            friendsPopEl.querySelector('[data-friends-find]')?.addEventListener('click', runFind);
            input?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') runFind();
                event.stopPropagation();
            });
            window.setTimeout(() => {
                document.addEventListener('pointerdown', function dismiss(event) {
                    if (friendsPopEl && !friendsPopEl.contains(event.target) && event.target !== button) {
                        document.removeEventListener('pointerdown', dismiss, true);
                        closeFriendsPop();
                    }
                }, true);
            }, 0);
        });
    };

    /* Everyone / Friends filter for the community board. */
    const setupFriendFilter = (data, friendRows, everyoneRows) => {
        document.getElementById('lb-filter-chips')?.remove();
        const mode = String(data?.mode || 'community');
        if (mode !== 'community' || !listEl) return;
        if (!friendRows.length) return;
        const chips = document.createElement('div');
        chips.id = 'lb-filter-chips';
        chips.className = 'lb-filter-chips';
        chips.innerHTML = `
            <button type="button" data-filter="all" class="is-active">Everyone</button>
            <button type="button" data-filter="friends">Friends &amp; you</button>
        `;
        listEl.parentElement?.insertBefore(chips, listEl);
        chips.addEventListener('click', (event) => {
            const chip = event.target instanceof Element ? event.target.closest('[data-filter]') : null;
            if (!chip) return;
            chips.querySelectorAll('[data-filter]').forEach((el) => el.classList.toggle('is-active', el === chip));
            const filter = chip.getAttribute('data-filter');
            renderList(filter === 'friends' ? friendRows : everyoneRows);
        });
    };

    /* Scarcity chip in the hero: how many slots are open in the next caste. */
    const decorateHeroWithSlots = (youRow, day) => {
        const head = document.querySelector('#lb-caste-hero .lb-caste-next-head');
        if (!head || !youRow) return;
        const stats = readIdentityStats() || casteStatsFromRow(youRow);
        const next = pickNextCaste(stats, CASTE_MAP[youRow.__caste] || pickCaste(stats));
        if (!next || !CASTE_SLOTS[next.caste.id]) return;
        const counts = gameTierCounts(day);
        const cap = CASTE_SLOTS[next.caste.id];
        const taken = Math.min(cap, Number(counts[next.caste.id]) || 0);
        const open = Math.max(0, cap - taken);
        const chip = document.createElement('span');
        chip.className = 'lb-caste-slots-chip';
        chip.textContent = open > 0
            ? `${open} of ${cap} ${next.caste.id === 'king' ? 'thrones' : 'seats'} open today`
            : `All ${cap} ${next.caste.id === 'king' ? 'thrones' : 'seats'} taken — someone must fall first`;
        head.appendChild(chip);
    };

    // The sidebar/control-panel markup belongs to the concurrent onboarding
    // work, so the "Leaderboard" label is renamed at runtime instead of in
    // the shared HTML. Retries cover nav that renders after us.
    const renameControlPanelLinks = () => {
        let tries = 0;
        const sweep = () => {
            document.querySelectorAll('a[href*="leaderboard"]').forEach((a) => {
                const label = (a.textContent || '').trim();
                if (/leaderboard/i.test(label)) a.textContent = label.replace(/leaderboard/ig, 'The Arena');
            });
            tries += 1;
            if (tries < 12) setTimeout(sweep, 400);
        };
        sweep();
        new MutationObserver(() => sweep()).observe(document.body, { childList: true, subtree: false });
    };

    const load = async () => {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const view = String(params.get('view') || params.get('scope') || '').trim().toLowerCase();
            const scopedView = ['trainer', 'manager'].includes(view) ? view : '';
            const endpoint = scopedView ? `/api/leaderboard?view=${encodeURIComponent(scopedView)}` : '/api/leaderboard';
            // Paint the arena instantly - the population is client-side, so the
            // tournament appears before the network answers; the signed-in
            // user and friends merge in when the API returns.
            ensureArenaStyle();
            ensureCasteStyle();
            ensureChampionStyle();
            champApplyUrlFlags();
            playArenaIntro();
            renameControlPanelLinks();
            if (!scopedView && listEl) {
                const day = todayKey(new Date());
                const instantBoard = buildGameBoard([], day);
                renderMoversTicker(instantBoard.rows);
                renderCastePyramid(instantBoard.rows, instantBoard.total, '', 'community');
                renderList(buildGameWindow(instantBoard.rows, null));
            }
            const resp = await fetch(endpoint, { credentials: 'include' });
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
            setLeaderboardMode(data);
            setupFriendsButton();
            const mode = String(data?.mode || 'community');
            const rawEntries = Array.isArray(data?.entries) ? data.entries : [];
            let entries = rawEntries;
            let friendRows = rawEntries.filter((r) => !r.isBot);
            if (mode === 'community') {
                const day = todayKey(new Date());
                const board = buildGameBoard(rawEntries, day);
                const youRow = data?.you ? board.rows.find((r) => String(r.id) === String(data.you.id)) : null;
                if (youRow && data?.you) {
                    data.you.rank = youRow.rank;
                    data.you.__rankDelta = Number(youRow.delta || 0);
                }
                friendRows = board.rows.filter((r) => !r.isBot);
                entries = buildGameWindow(board.rows, data?.you?.id);
                renderCasteHero(data);
                decorateHeroWithSlots(youRow, day);
                renderMoversTicker(board.rows);
                renderCastePyramid(board.rows, board.total, youRow?.__caste || '', 'community');
                maybePlayDailyShift('community');
            } else {
                renderCasteHero(data);
                if (rawEntries.length) renderCastePyramid(rawEntries, rawEntries.length, '', 'trainer');
            }
            setupChampDevPanel();
            setupFriendFilter(data, friendRows, entries);
            if (entries.length) {
                renderList(entries);
            } else if (listEl && String(data?.mode || '') === 'trainer_clients') {
                const msg = data?.error
                    ? `Trainer leaderboard could not load: ${escapeAttr(data.error)}`
                    : 'No linked clients with app accounts yet. Clients appear here after they accept or connect to your trainer account.';
                listEl.innerHTML = `<div class="ns-muted">${msg}</div>`;
            } else if (listEl && String(data?.mode || '') === 'manager_trainers') {
                const msg = data?.error
                    ? `Manager leaderboard could not load: ${escapeAttr(data.error)}`
                    : 'No trainers are linked underneath this manager account yet.';
                listEl.innerHTML = `<div class="ns-muted">${msg}</div>`;
            } else {
                renderList(entries);
            }

            const you = data?.you || null;
            if (you && youEl && youSub && youRight) {
                youEl.classList.remove('hidden');
                youSub.textContent = `Rank #${you.rank} ${MID_DOT} ${Number(you.points || 0).toLocaleString()} pts`;
                youRight.textContent = `This month (${data?.month || ''})`;
                if (youAvatar && youAvatarImg && youAvatarFallback) {
                    const displayName = String(you.displayName || 'You');
                    const avatarUrl = String(you.avatarUrl || '').trim();
                    youAvatarFallback.textContent = initialsFromName(displayName);
                    if (avatarUrl) {
                        youAvatar.classList.remove('noimg');
                        youAvatarImg.src = avatarUrl;
                        youAvatarImg.alt = `${displayName} profile photo`;
                        youAvatarImg.onerror = () => {
                            youAvatar.classList.add('noimg');
                            youAvatarImg.removeAttribute('src');
                        };
                    } else {
                        youAvatar.classList.add('noimg');
                        youAvatarImg.removeAttribute('src');
                    }
                }
            } else if (youEl) {
                youEl.classList.add('hidden');
                if (youAvatar && youAvatarImg) {
                    youAvatar.classList.add('noimg');
                    youAvatarImg.removeAttribute('src');
                }
            }

            if (location.hash === '#awards') setModal('awards');
            else if (location.hash === '#rules') setModal('rules');
        } catch {
            if (listEl) listEl.innerHTML = `<div class="ns-muted">Failed to load leaderboard.</div>`;
        }
    };

    document.addEventListener('DOMContentLoaded', load);
})();
