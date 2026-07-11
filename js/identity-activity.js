/* ====================================================================
   RiseForIt — IDENTITY ACTIVITY BRIDGE
   --------------------------------------------------------------------
   Collects the app's real logging signals into the rolling activity
   record the identity engine consumes:

     localStorage 'ode_identity_activity_v1' = {
       version: 1,
       lastActiveDay: 'YYYY-MM-DD',
       streak: <consecutive active days ending today/yesterday>,
       totals: {                 // rolling window (last WINDOW_DAYS days)
         workouts, strengthWorkouts, cardioSessions,
         checkins, activeDays, mealsOnPlan, sleepLogs, measurements
       },
       days: { 'YYYY-MM-DD': { ...same counters, per day... } }
     }

   Wired sources (no polling — event driven):
     - 'ode:checkin-saved' (main.js Daily Dash): checkins, sleepLogs,
       mealsOnPlan, measurements — set idempotently per day so editing
       a check-in never double counts.
     - js/training.js workout finish -> RiseActivity.log('workouts').

   FUTURE HOOKUPS (call window.RiseActivity.log(kind) from):
     - step sync (ode_tracking_prefs_v1.steps): log('cardioSessions')
       when a day hits its step goal.
     - sleep app sync (ode_tracking_prefs_v1.sleep): log('sleepLogs').
     - wake-time alarm check-in (ode_tracking_prefs_v1.wakeTime):
       log('checkins') when the user checks in within the window.
   ==================================================================== */
(function () {
    'use strict';

    var KEY = 'ode_identity_activity_v1';
    var WINDOW_DAYS = 14;
    var KINDS = ['workouts', 'strengthWorkouts', 'cardioSessions', 'checkins', 'activeDays', 'mealsOnPlan', 'sleepLogs', 'measurements'];

    var dayKey = function (d) { return (d || new Date()).toISOString().slice(0, 10); };
    var readStore = function () {
        try {
            var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (raw && typeof raw === 'object' && raw.days && typeof raw.days === 'object') return raw;
        } catch (e) { /* fallthrough */ }
        return { version: 1, lastActiveDay: '', streak: 0, totals: {}, days: {} };
    };

    var rebuild = function (store) {
        var days = Object.keys(store.days).sort();
        // Trim outside the rolling window.
        var cutoff = dayKey(new Date(Date.now() - WINDOW_DAYS * 86400000));
        days.forEach(function (d) { if (d < cutoff) delete store.days[d]; });
        days = Object.keys(store.days).sort();

        var totals = {};
        KINDS.forEach(function (k) { totals[k] = 0; });
        days.forEach(function (d) {
            var bucket = store.days[d] || {};
            var active = false;
            KINDS.forEach(function (k) {
                var v = Number(bucket[k]) || 0;
                if (v > 0 && k !== 'activeDays') active = true;
                totals[k] += v;
            });
            if (active) totals.activeDays += 1;
        });
        store.totals = totals;
        store.lastActiveDay = days.length ? days[days.length - 1] : '';

        // Streak: consecutive active days ending today (or yesterday).
        var streak = 0;
        var cursor = new Date();
        if (!store.days[dayKey(cursor)]) cursor = new Date(Date.now() - 86400000);
        while (store.days[dayKey(cursor)]) {
            streak += 1;
            cursor = new Date(cursor.getTime() - 86400000);
        }
        store.streak = streak;
        return store;
    };

    var write = function (store) {
        try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
        // Let the engine fold today's activity in right away.
        try { window.RiseIdentityEngine && window.RiseIdentityEngine.refresh({ force: true }); } catch (e) { /* ignore */ }
    };

    /* log(kind, count?, opts?) — increment a counter for today.
       opts.set = true records an idempotent per-day value instead of
       incrementing (used by check-in re-saves). */
    var log = function (kind, count, opts) {
        if (KINDS.indexOf(kind) < 0) return;
        var n = Number(count);
        if (!Number.isFinite(n)) n = 1;
        var store = readStore();
        var today = dayKey();
        var bucket = store.days[today] = store.days[today] || {};
        if (opts && opts.set) bucket[kind] = Math.max(0, n);
        else bucket[kind] = (Number(bucket[kind]) || 0) + n;
        write(rebuild(store));
    };

    /* Daily Dash: one event carries sleep, meals, and measurements.
       Everything from the dash is SET per day (editing a check-in should
       never double count). */
    window.addEventListener('ode:checkin-saved', function (event) {
        var payload = event && event.detail && event.detail.payload;
        if (!payload || typeof payload !== 'object') return;
        var store = readStore();
        var day = String(payload.day || dayKey()).slice(0, 10);
        var bucket = store.days[day] = store.days[day] || {};
        bucket.checkins = 1;
        bucket.sleepLogs = Number(payload.sleepHours) > 0 ? 1 : 0;
        var mealsVal = String(payload.mealsOnPlan || '').toLowerCase();
        bucket.mealsOnPlan = (mealsVal === 'yes' || mealsVal === 'true' || mealsVal === '1') ? 1
            : (Number(payload.macros && payload.macros.calories) > 0 ? 1 : 0);
        var circ = payload.circumferences || {};
        bucket.measurements = (Number(payload.weightLb) > 0 || Number(payload.bodyfatPct) > 0
            || Number(circ.waistIn) > 0 || Number(circ.chestIn) > 0 || Number(circ.hipsIn) > 0) ? 1 : 0;
        // Cardio: no dedicated capture exists in the app yet, so this is
        // forward-wired — the moment a check-in carries steps, distance, or
        // cardio minutes (or a step-goal sync fires), the cardio axis grows.
        var stepGoal = 8000;
        bucket.cardioSessions = (Number(payload.cardioSessions) > 0
            || Number(payload.cardioMinutes) >= 15
            || Number(payload.distanceMiles) > 0
            || Number(payload.steps) >= stepGoal) ? 1 : 0;
        write(rebuild(store));
    });

    window.RiseActivity = {
        KEY: KEY,
        log: log,
        summary: function () { return rebuild(readStore()); }
    };
})();
