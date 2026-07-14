// js/meal-program-data.js
// Phase 0 (Meal Program Work Order): fetch-once loader for data/riseforit_meal_data.json.
// Only ever loaded on meal-program pages — never index.html (work order rule / discovery Q36).
(function () {
    'use strict';

    var DATA_URL = 'data/riseforit_meal_data.json';
    var cache = null;
    var inflight = null;

    function load() {
        if (cache) return Promise.resolve(cache);
        if (inflight) return inflight;
        inflight = fetch(DATA_URL)
            .then(function (res) {
                if (!res.ok) throw new Error('meal data HTTP ' + res.status);
                return res.json();
            })
            .then(function (json) {
                if (!json || !Array.isArray(json.meals) || !Array.isArray(json.ingredient_prices)) {
                    throw new Error('meal data: unexpected shape');
                }
                // Route external recipe photos through the server image proxy so
                // hotlink/CORS/mixed-content quirks can't stop them rendering.
                json.meals.forEach(function (m) {
                    var u = String(m && m.image_url || '').trim();
                    if (/^https?:\/\//i.test(u) && u.indexOf('/api/img') < 0) {
                        m.image_url_original = u;
                        m.image_url = '/api/img?u=' + encodeURIComponent(u);
                    }
                });
                cache = json;
                inflight = null;
                return cache;
            })
            .catch(function (err) {
                inflight = null;
                throw err;
            });
        return inflight;
    }

    window.MealProgramData = { load: load, url: DATA_URL };
})();
