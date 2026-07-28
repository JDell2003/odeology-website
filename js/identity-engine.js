/* ====================================================================
   RiseForIt — IDENTITY ENGINE
   --------------------------------------------------------------------
   Turns a user's real inputs into the six spider-graph stats that both
   the Overview radar (js/overview-identity.js) and The Arena
   (js/leaderboard.js) read from localStorage 'ovIdentityStats'.

   Before this existed, that key was never written and both pages fell
   back to hardcoded DEMO_STATS — which is why the graph never matched
   the user (consistent while inactive, nutrition 60 with zero logs...).

   Design (approved 2026-07-11):
     - EVERYONE STARTS A PEASANT. Onboarding answers seed the six axes
       LOW (weak / regular / strong peasant); a strong peasant is still
       a peasant and is rare. The weaker the seed, the longer the climb.
     - GOAL-WEIGHTED. The user picks >=2 goals. A goal axis is scored on
       a STRICT curve (needs ~2x the effort per point) but is UNCAPPED —
       it can reach 100 and, combined with breadth, carry you up. A
       non-goal axis is LENIENT (quick early points, "leeway") but
       SOFT-CAPPED ~70, so a stat you never prioritized can't secretly
       carry you to the top.
     - CONSISTENCY GATES EVERYTHING. A 500-lb bencher grows strength a
       bit faster (talent bonus) but still slowly, because the growth of
       every axis is throttled by how consistent you are. Show-up beats
       one big day.
     - EXPONENTIALLY HARDER. Growth diminishes sharply as a stat rises,
       so 80->90 costs far more than 20->30.
     - DECAY. Stop logging and stats erode (consistency fastest) but
       never below your honest onboarding seed.

   Reads (all localStorage):
     ode_identity_profile_v1  — written by onboarding: { goals:[axisIds],
                                answers:{...}, ... }  (see onboarding prompt)
     ode_identity_activity_v1 — rolling recent activity the app's logging
                                writes: { lastActiveDay, streak, totals:{...} }
     ode_identity_engine_v1   — this engine's own persisted state.
   Writes:
     ovIdentityStats, ovIdentityStatsPrev  (consumed by both pages)

   Exposes window.RiseIdentityEngine = { refresh, simulate, seedFrom,
     AXES, config } for wiring and tests.
   ==================================================================== */
(function () {
    'use strict';

    var AXES = ['strength', 'cardio', 'consistency', 'nutrition', 'recovery', 'progress'];

    var CONFIG = {
        // Peasant seed band (all axes seed here so avg stays < squire ring 35).
        seedMin: 4,
        seedSpan: 26,            // seed value = seedMin + readiness*seedSpan  -> 4..30
        progressSeedSpan: 10,    // progress starts lower: nobody has "progressed" yet
        // Growth
        baseRate: 6,             // pts/day per axis at full activity signal, before modifiers
        goalFactor: 0.5,         // goal axes gain half as fast per unit effort (strict)...
        nonGoalFactor: 1.0,      // ...non-goal axes gain full rate (lenient)
        nonGoalSoftCap: 70,      // above this, non-goal growth is throttled hard
        nonGoalOverCap: 0.15,    // growth multiplier once a non-goal is past the soft cap
        talentSignal: 0.85,      // activity signal above this = elite -> talent bonus
        talentBonus: 1.4,        // elite axes climb a bit faster (the 500-lb bencher)
        consistFloor: 0.25,      // growth gate at consistency 0 (still 25% so you can start)
        diminishPow: 1.5,        // (1 - v/100)^pow — higher = steeper late-game
        // Decay (per idle day, once past the grace days below)
        consistDecay: 4.0, consistGrace: 2,
        otherDecay: 1.2, otherGrace: 5,
        maxCatchupDays: 30       // cap the days simulated in one refresh
    };

    var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
    var round = function (v) { return Math.round(clamp(v, 0, 100)); };

    /* ---- answer -> 0..1 readiness -------------------------------------
       Onboarding options are free-text and owned by the other bot, so we
       score by keyword rather than by exact option strings — resilient to
       wording changes. */
    var HIGH = ['very active', 'very', 'daily', 'every day', 'always', 'often', 'advanced',
        'athletic', 'muscular', 'several', 'high', 'strong', 'excellent', 'great', 'lot',
        '5', '6', '7', 'more than', 'consistently'];
    var LOW = ['sedentary', 'never', 'rarely', 'none', 'not ', 'no ', 'low', 'poor',
        'beginner', 'out of shape', 'overweight', 'little', 'seldom', 'hardly', 'once', 'barely'];
    var MID = ['sometimes', 'moderate', 'occasionally', 'average', 'few', 'couple', '2', '3', 'okay', 'ok'];

    var scoreText = function (text) {
        var t = String(text || '').toLowerCase();
        if (!t) return 0.35;
        var i;
        for (i = 0; i < LOW.length; i++) { if (t.indexOf(LOW[i]) === 0 || t.indexOf(' ' + LOW[i]) >= 0 || t.indexOf(LOW[i]) === 0) { if (t.indexOf(LOW[i]) >= 0) return 0.12; } }
        for (i = 0; i < HIGH.length; i++) { if (t.indexOf(HIGH[i]) >= 0) return 0.9; }
        for (i = 0; i < MID.length; i++) { if (t.indexOf(MID[i]) >= 0) return 0.45; }
        return 0.4;
    };

    var scoreAnswer = function (val) {
        if (val == null) return null;
        if (Array.isArray(val)) {
            if (!val.length) return 0.2;
            var s = 0;
            for (var i = 0; i < val.length; i++) s += scoreText(val[i]);
            return clamp(s / val.length, 0, 1);
        }
        return scoreText(val);
    };

    // Which answer keys feed each axis (best-effort; missing keys are skipped).
    var AXIS_INPUTS = {
        strength: ['build', 'exerciseFreq', 'workoutFreq', 'targetZones'],
        cardio: ['walks', 'exerciseFreq', 'exerciseTime'],
        consistency: ['exerciseFreq', 'workoutFreq', 'walks'],
        nutrition: ['mealPrep', 'knowCalories'],
        recovery: ['sleepHours'],
        progress: ['bodyGoal', 'pillarGoals']
    };
    // The old inverse keys (breath / discomfort / badHabits) were questions cut
    // from onboarding; nothing left in AXIS_INPUTS scores backwards.
    var INVERSE_KEYS = {};

    /* ---- direct "history" seed (js/client-quiz.js `history` section) -----
       Six questions, one per axis, where the user states their current level
       outright. When answered, these OWN the seed for that axis — they beat
       the keyword-inferred readiness because the user told us plainly. Option
       strings MUST match client-quiz.js verbatim. */
    var HISTORY_KEY = {
        strength: 'histStrength', cardio: 'histCardio', consistency: 'histConsistency',
        nutrition: 'histNutrition', recovery: 'histSleep', progress: 'histProgress'
    };
    var HISTORY_READINESS = {
        "I'm just getting started": 0.08, 'I can handle the basics': 0.35, "I'm pretty strong": 0.62, "I'm advanced / very strong": 0.9,
        'I get winded fast': 0.08, 'I can do light cardio': 0.35, "I'm fairly conditioned": 0.62, 'I have great endurance': 0.9,
        'I keep falling off': 0.08, 'On and off': 0.35, 'Mostly consistent': 0.62, 'Locked in every week': 0.9,
        'I eat whatever': 0.08, 'I try but slip': 0.35, 'Mostly clean': 0.62, 'Very dialed in': 0.9,
        'Poor and restless': 0.08, 'Hit or miss': 0.35, 'Usually solid': 0.62, 'Great — I wake up refreshed': 0.9,
        'Starting from scratch': 0.08, 'A little progress': 0.35, 'Solid progress': 0.62, "I'm already in great shape": 0.9
    };
    var historyReadiness = function (answers, axis) {
        var k = HISTORY_KEY[axis];
        if (!k || !answers || !(k in answers)) return null;
        var v = answers[k];
        return (v in HISTORY_READINESS) ? HISTORY_READINESS[v] : null;
    };

    var axisReadiness = function (answers, axis) {
        var keys = AXIS_INPUTS[axis] || [];
        var sum = 0, n = 0;
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (!(k in (answers || {}))) continue;
            var r = scoreAnswer(answers[k]);
            if (r == null) continue;
            if (INVERSE_KEYS[k]) r = 1 - r;
            sum += r; n++;
        }
        return n ? sum / n : 0.35; // no signal -> low-regular default
    };

    /* ---- seed (weak / regular / strong peasant) ---------------------- */
    var seedFrom = function (profile) {
        var answers = (profile && profile.answers) || {};
        var seed = {};
        var readinessSum = 0;
        for (var i = 0; i < AXES.length; i++) {
            var axis = AXES[i];
            // A direct history answer owns the seed; otherwise infer from the
            // broader quiz answers by keyword.
            var hist = historyReadiness(answers, axis);
            var hasHistory = hist != null;
            var r = hasHistory ? hist : axisReadiness(answers, axis);
            readinessSum += r;
            // Progress normally seeds lower (nobody has "progressed" yet), but
            // when the user explicitly rates their progress, honor it fully.
            var span = (axis === 'progress' && !hasHistory) ? CONFIG.progressSeedSpan : CONFIG.seedSpan;
            seed[axis] = clamp(CONFIG.seedMin + r * span, 0, 34); // always still a peasant
        }
        var overall = readinessSum / AXES.length;
        seed.__band = overall < 0.33 ? 'weak' : overall < 0.66 ? 'regular' : 'strong';
        return seed;
    };

    /* ---- one day of growth from activity ----------------------------
       Consistency-gated (show-up beats one big day), goal-weighted, with
       a talent bonus for elite signals and diminishing returns near the
       top. Idle decay is handled by the callers, not here. */
    var advanceOneDay = function (stats, seed, goals, activity) {
        var goalSet = {};
        (goals || []).forEach(function (g) { goalSet[g] = true; });
        var consistGate = CONFIG.consistFloor + (1 - CONFIG.consistFloor) * (clamp(stats.consistency, 0, 100) / 100);
        var totals = (activity && activity.totals) || {};
        var signalFor = {
            strength: (totals.strengthWorkouts != null ? totals.strengthWorkouts : totals.workouts) || 0,
            cardio: totals.cardioSessions || 0,
            consistency: Math.max(totals.checkins || 0, totals.activeDays || 0),
            nutrition: totals.mealsOnPlan || 0,
            recovery: totals.sleepLogs || 0,
            progress: totals.measurements || 0
        };

        for (var i = 0; i < AXES.length; i++) {
            var axis = AXES[i];
            var v = stats[axis];
            // ~10 logged actions in the window = full (1.0) signal.
            var signal = clamp(signalFor[axis] / 10, 0, 1);
            if (signal > 0) {
                var isGoal = !!goalSet[axis];
                var factor = isGoal ? CONFIG.goalFactor : CONFIG.nonGoalFactor;
                if (!isGoal && v >= CONFIG.nonGoalSoftCap) factor *= CONFIG.nonGoalOverCap;
                var talent = signal >= CONFIG.talentSignal ? CONFIG.talentBonus : 1;
                var diminish = Math.pow(1 - clamp(v, 0, 100) / 100, CONFIG.diminishPow);
                v += CONFIG.baseRate * signal * factor * talent * consistGate * diminish;
            }
            stats[axis] = clamp(v, 0, 100);
        }
        return stats;
    };

    /* ---- pure simulation (used by tests and by refresh) --------------
       Deterministic: given the same inputs it returns the same stats. */
    var simulate = function (opts) {
        opts = opts || {};
        var profile = opts.profile || null;
        var activity = opts.activity || null;
        var seed = opts.seed || seedFrom(profile);
        var stats = {};
        AXES.forEach(function (a) { stats[a] = (opts.start && opts.start[a] != null) ? opts.start[a] : seed[a]; });

        var idleDays = opts.idleDays != null ? opts.idleDays : 0;
        var activeDays = opts.activeDays != null ? opts.activeDays : 0;
        var d;
        for (d = 0; d < Math.min(activeDays, CONFIG.maxCatchupDays); d++) {
            advanceOneDay(stats, seed, (profile && profile.goals) || [], activity);
        }
        // Decay respects grace: only idle days beyond the grace window bite.
        for (d = 0; d < Math.min(idleDays, CONFIG.maxCatchupDays); d++) {
            var past = {};
            AXES.forEach(function (a) {
                var grace = a === 'consistency' ? CONFIG.consistGrace : CONFIG.otherGrace;
                if (d < grace) { past[a] = stats[a]; return; }
                var rate = a === 'consistency' ? CONFIG.consistDecay : CONFIG.otherDecay;
                past[a] = Math.max(seed[a], stats[a] - rate);
            });
            AXES.forEach(function (a) { stats[a] = past[a]; });
        }
        var out = {};
        AXES.forEach(function (a) { out[a] = round(stats[a]); });
        return out;
    };

    /* ---- localStorage plumbing -------------------------------------- */
    var readJSON = function (key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    };
    var writeJSON = function (key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    };
    var dayKey = function (d) { return (d || new Date()).toISOString().slice(0, 10); };
    var daysBetween = function (a, b) {
        var ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
        return Number.isFinite(ms) ? Math.round(ms / 86400000) : 0;
    };

    /* ---- v2 server-authoritative mode (SCORING_ENGINE_V2) ------------
       When the backend flag is on, GET /api/score is the truth: its axes are
       rendered into ovIdentityStats and this local growth model becomes an
       offline fallback only, tagged __estimated so consumers can tell it is
       non-authoritative. Flag off -> the legacy behavior is untouched. */
    var SERVER_MODE_KEY = 'ode_scoring_v2_mode';
    var serverModeCached = function () {
        try { return localStorage.getItem(SERVER_MODE_KEY) === 'server'; } catch (e) { return false; }
    };
    var lastServerStats = null;
    var serverFetchPromise = null;
    var fetchServerScore = function () {
        if (serverFetchPromise) return serverFetchPromise;
        if (typeof fetch !== 'function') return Promise.resolve(null);
        serverFetchPromise = fetch('/api/score', { credentials: 'same-origin' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || data.ok !== true) return null;
                if (!data.enabled) {
                    try { localStorage.setItem(SERVER_MODE_KEY, 'local'); } catch (e) { /* ignore */ }
                    return null;
                }
                try { localStorage.setItem(SERVER_MODE_KEY, 'server'); } catch (e) { /* ignore */ }
                if (!data.ready || !data.axes) return null;
                var prev = readJSON('ovIdentityStats');
                var stats = {};
                var serverSum = 0;
                var serverMax = 0;
                AXES.forEach(function (a) {
                    var v = round(Number(data.axes[a]) || 0);
                    stats[a] = v;
                    serverSum += v;
                    if (v > serverMax) serverMax = v;
                });
                // GLITCH GUARD: a fresh user with no logged lifts gets a snapshot
                // whose axes are ~0 the moment one is created (e.g. after a
                // check-in bumps consistency by a single point). Writing that
                // collapses the radar to nothing and buries the user's honest
                // onboarding-seeded peasant graph. A snapshot with essentially no
                // signal — total below a few points and no axis meaningfully off
                // the floor — carries nothing real, so keep the local graph until
                // the server actually has something to say. (The old guard only
                // caught an EXACT all-zero sum, so a lone consistency=1 slipped
                // through and flickered the radar to empty.)
                if (serverSum < 8 || serverMax < 5) return null;
                stats.__server = true;                       // authoritative marker
                stats.__serverRank = data.rank || null;
                stats.__serverCaste = data.caste || null;
                stats.__serverDay = data.day || null;
                lastServerStats = stats;
                writeStats(stats, prev && prev.__server ? null : prev);
                try { window.dispatchEvent(new CustomEvent('rise-identity-server-score', { detail: stats })); } catch (e) { /* ignore */ }
                return stats;
            })
            .catch(function () { return null; });
        return serverFetchPromise;
    };

    var writeStats = function (stats, prev) {
        // In server mode any locally-computed stats are only an offline
        // estimate — label them so the UI/browser can never pass a local
        // guess off as the authoritative score.
        if (stats && !stats.__server && serverModeCached()) stats.__estimated = true;
        if (prev) writeJSON('ovIdentityStatsPrev', prev);
        writeJSON('ovIdentityStats', stats);
    };

    /* refresh(): recompute from stored profile + activity, advancing the
       engine's own state by however many days have passed since it last
       ran, and write ovIdentityStats. Idempotent within a day. */
    var refresh = function (opts) {
        opts = opts || {};
        // Freeze flag: when a caller has deliberately pinned ovIdentityStats
        // (dev/champ preview, or a test), don't overwrite it.
        if (window.__riseIdentityFrozen) return readJSON('ovIdentityStats');
        // v2 server mode: the server score is authoritative. A forced refresh
        // (something was just logged) re-polls the server, which has its own
        // on-write recompute; the local model below only fills offline gaps.
        if (serverModeCached()) {
            if (opts.force) {
                serverFetchPromise = null;
                setTimeout(function () { try { fetchServerScore(); } catch (e) { /* ignore */ } }, 1200);
            }
            if (lastServerStats) return lastServerStats;
        }
        var today = dayKey(new Date());
        var profile = readJSON('ode_identity_profile_v1');
        var activity = readJSON('ode_identity_activity_v1');
        var seed = seedFrom(profile);
        var state = readJSON('ode_identity_engine_v1');

        // First ever run: start at the seed (weak/regular/strong peasant).
        if (!state || !state.stats || opts.reset) {
            var start = {};
            AXES.forEach(function (a) { start[a] = round(seed[a]); });
            writeStats(start, null);
            writeJSON('ode_identity_engine_v1', { day: today, stats: start, seedBand: seed.__band });
            return start;
        }

        var gap = clamp(daysBetween(state.day, today), 0, CONFIG.maxCatchupDays);
        if (gap === 0 && !opts.force) {
            // Already current today — just make sure the consumers see it.
            writeStats(state.stats, null);
            return state.stats;
        }

        var lastActive = activity && activity.lastActiveDay ? activity.lastActiveDay : null;
        var dayBuckets = (activity && activity.days) || {};
        var stats = {};
        AXES.forEach(function (a) { stats[a] = state.stats[a]; });

        // Walk every day that has fully ENDED since the last refresh:
        // [state.day .. today-1]. A day's logged activity is folded in on
        // the first refresh AFTER that day (yesterday moves today's graph),
        // judged by that day's own activity bucket. Days with no bucket
        // are idle and decay once past the grace window. (The old walk
        // started at state.day+1, so for daily visitors the day they
        // actually logged on was never revisited — activity never grew
        // the stats at all.)
        var dayHasSignal = function (d) {
            var bucket = dayBuckets[d];
            if (!bucket) return false;
            for (var k in bucket) { if (Number(bucket[k]) > 0) return true; }
            return false;
        };
        var lastActiveSeen = (lastActive && daysBetween(lastActive, state.day) >= 0) ? lastActive : null;
        for (var i = 0; i < gap; i++) {
            var theDay = new Date(Date.parse(state.day + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
            if (dayHasSignal(theDay)) {
                advanceOneDay(stats, seed, (profile && profile.goals) || [], activity);
                lastActiveSeen = theDay;
            } else {
                var idleSoFar = lastActiveSeen ? daysBetween(lastActiveSeen, theDay) : (i + 1);
                AXES.forEach(function (a) {
                    var grace = a === 'consistency' ? CONFIG.consistGrace : CONFIG.otherGrace;
                    if (idleSoFar <= grace) return;
                    var rate = a === 'consistency' ? CONFIG.consistDecay : CONFIG.otherDecay;
                    stats[a] = Math.max(seed[a], stats[a] - rate);
                });
            }
        }

        var out = {};
        AXES.forEach(function (a) { out[a] = round(stats[a]); });
        writeStats(out, state.stats);
        writeJSON('ode_identity_engine_v1', { day: today, stats: out, seedBand: seed.__band });
        return out;
    };

    window.RiseIdentityEngine = {
        AXES: AXES,
        config: CONFIG,
        seedFrom: seedFrom,
        simulate: simulate,
        refresh: refresh,
        fetchServerScore: fetchServerScore,
        serverMode: serverModeCached
    };

    // Auto-run on load so the pages that include this file get real stats
    // before their radar reads localStorage. Never throws into the page.
    try { refresh(); } catch (e) { /* keep the page alive */ }
    // v2: ask the server for the authoritative score (no-op / cached 'local'
    // when SCORING_ENGINE_V2 is off server-side).
    try { fetchServerScore(); } catch (e) { /* keep the page alive */ }
})();
