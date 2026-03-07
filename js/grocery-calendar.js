(() => {
    const calendarEl = document.getElementById('food-calendar');
    const monthEl = document.getElementById('calendar-month-1');
    if (!calendarEl || !monthEl) return;

    const calendarRange = document.getElementById('calendar-range');
    const calendarPrev = document.getElementById('calendar-prev');
    const calendarNext = document.getElementById('calendar-next');
    const detailDate = document.getElementById('calendar-detail-date');
    const detailBody = document.getElementById('calendar-detail-body');

    const STORAGE_PREFS = 'ode_grocery_calendar_prefs_v1';
    const STORAGE_HISTORY = 'ode_grocery_calendar_history_v1';

    const formatDateKey = (date) => date.toISOString().slice(0, 10);
    const formatMonthTitle = (date) => date.toLocaleString('default', { month: 'long', year: 'numeric' });
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    function escapeHtml(input) {
        const s = String(input ?? '');
        return s
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    const loadStartDate = () => {
        try {
            const prefs = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
            const stored = prefs?.startDate || sessionStorage.getItem('groceryStartDate');
            const parsed = stored ? new Date(stored) : new Date();
            return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
        } catch {
            return new Date();
        }
    };

    const loadCalendarData = () => {
        try {
            const raw = localStorage.getItem('ode_grocery_calendar_items_v1');
            const parsed = raw ? JSON.parse(raw) : null;
            const items = Array.isArray(parsed?.items) ? parsed.items : [];
            const unit = parsed?.unit || null;
            const startDate = parsed?.startDate ? new Date(parsed.startDate) : null;
            const savedAt = parsed?.savedAt ? new Date(parsed.savedAt) : null;
            return { items, unit, startDate, savedAt };
        } catch {
            return { items: [], unit: null, startDate: null, savedAt: null };
        }
    };

    const defaultPrefs = () => ({ mode: 'daily', lowDaysThreshold: 2 });

    const loadPrefs = () => {
        try {
            const raw = localStorage.getItem(STORAGE_PREFS);
            const parsed = raw ? JSON.parse(raw) : null;
            const mode = parsed?.mode === 'daily' || parsed?.mode === 'sunday' ? parsed.mode : 'daily';
            const lowDaysThreshold = Number(parsed?.lowDaysThreshold);
            return {
                mode,
                lowDaysThreshold: Number.isFinite(lowDaysThreshold) && lowDaysThreshold >= 0 ? Math.round(lowDaysThreshold) : 2
            };
        } catch {
            return defaultPrefs();
        }
    };

    const savePrefs = (prefs) => {
        try {
            localStorage.setItem(STORAGE_PREFS, JSON.stringify(prefs));
        } catch {
            // ignore
        }
    };

    const loadHistory = () => {
        try {
            const raw = localStorage.getItem(STORAGE_HISTORY);
            const parsed = raw ? JSON.parse(raw) : null;
            const past = Array.isArray(parsed?.past) ? parsed.past : [];
            const future = Array.isArray(parsed?.future) ? parsed.future : [];
            return { past, future };
        } catch {
            return { past: [], future: [] };
        }
    };

    const saveHistory = (history) => {
        try {
            localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
        } catch {
            // ignore
        }
    };

    const normalizeItemName = (name) => String(name || '').trim();

    const keyForAction = (action) => `${action.type}::${action.dateKey}::${normalizeItemName(action.itemName).toLowerCase()}`;

    const buildActionIndex = (actions) => {
        const skipped = new Map(); // dateKey -> Set(itemNameLower)
        const expired = new Map();
        const bought = new Map();
        const noBuy = new Map();
        (actions || []).forEach((a) => {
            const dateKey = String(a?.dateKey || '').trim();
            const type = String(a?.type || '').trim();
            const itemName = normalizeItemName(a?.itemName);
            if (!dateKey || !itemName) return;

            const bucket = type === 'expired'
                ? expired
                : type === 'skip'
                    ? skipped
                    : type === 'buy'
                        ? bought
                        : type === 'no-buy'
                            ? noBuy
                            : null;
            if (!bucket) return;

            const lower = itemName.toLowerCase();
            if (!bucket.has(dateKey)) bucket.set(dateKey, new Set());
            bucket.get(dateKey).add(lower);
        });
        return { skipped, expired, bought, noBuy };
    };

    const actionApplies = (index, { type, dateKey, itemName }) => {
        const lower = normalizeItemName(itemName).toLowerCase();
        if (!lower || !dateKey) return false;
        if (type === 'skip') return index.skipped.get(dateKey)?.has(lower) || false;
        if (type === 'expired') return index.expired.get(dateKey)?.has(lower) || false;
        if (type === 'buy') return index.bought.get(dateKey)?.has(lower) || false;
        if (type === 'no-buy') return index.noBuy.get(dateKey)?.has(lower) || false;
        return false;
    };

    const buildEventsSmart = ({ items, startDate, horizonDays, lowDaysThreshold, index }) => {
        const events = {};
        const startKey = formatDateKey(startDate);
        const days = Array.from({ length: horizonDays }, (_, i) => {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            return d;
        });

        items.forEach((item) => {
            const name = normalizeItemName(item?.name);
            const daysPerContainer = Number(item?.daysPerContainer);
            const price = Number(item?.price);
            if (!name) return;
            if (!Number.isFinite(daysPerContainer) || daysPerContainer <= 0) return;

            let remaining = daysPerContainer;

            for (let i = 0; i < days.length; i += 1) {
                const dayDate = days[i];
                const key = formatDateKey(dayDate);
                if (!events[key]) events[key] = [];

                const isExpired = actionApplies(index, { type: 'expired', dateKey: key, itemName: name });
                const isSkip = actionApplies(index, { type: 'skip', dateKey: key, itemName: name });
                const isBuy = actionApplies(index, { type: 'buy', dateKey: key, itemName: name });
                const isNoBuy = actionApplies(index, { type: 'no-buy', dateKey: key, itemName: name });

                if (isExpired) {
                    events[key].push({
                        name,
                        status: 'expired',
                        runoutDate: key,
                        qty: 1,
                        price: Number.isFinite(price) ? `$${price.toFixed(2)}` : null,
                        meta: 'Expired'
                    });
                    remaining = daysPerContainer;
                } else if (isBuy) {
                    remaining = daysPerContainer;
                } else if (remaining <= lowDaysThreshold && !isNoBuy) {
                    const runout = new Date(dayDate);
                    runout.setDate(runout.getDate() + Math.max(0, Math.round(remaining)));
                    const runoutKey = formatDateKey(runout);
                    events[key].push({
                        name,
                        status: 'buy',
                        runoutDate: runoutKey,
                        qty: 1,
                        price: Number.isFinite(price) ? `$${price.toFixed(2)}` : null,
                        meta: 'Buy (buffer)'
                    });
                    remaining = daysPerContainer;
                }

                if (!isSkip && key !== startKey && !isBuy) remaining = Math.max(0, remaining - 1);
            }
        });

        return events;
    };

    const predictRunoutsDaily = ({ items, startDate, horizonDays, index }) => {
        const runouts = [];
        const base = new Date(startDate);
        base.setHours(0, 0, 0, 0);
        const startKey = formatDateKey(base);

        items.forEach((item) => {
            const name = normalizeItemName(item?.name);
            const daysPerContainer = Number(item?.daysPerContainer);
            const price = Number(item?.price);
            if (!name) return;
            if (!Number.isFinite(daysPerContainer) || daysPerContainer <= 0) return;

            let remaining = Math.round(daysPerContainer);
            for (let dayIdx = 0; dayIdx < horizonDays; dayIdx += 1) {
                const day = new Date(base);
                day.setDate(day.getDate() + dayIdx);
                const key = formatDateKey(day);

                const isExpired = actionApplies(index, { type: 'expired', dateKey: key, itemName: name });
                const isSkip = actionApplies(index, { type: 'skip', dateKey: key, itemName: name });
                const isBuy = actionApplies(index, { type: 'buy', dateKey: key, itemName: name });

                if (isExpired) {
                    runouts.push({
                        name,
                        runoutDate: key,
                        forced: true,
                        price: Number.isFinite(price) ? `$${price.toFixed(2)}` : null
                    });
                    remaining = Math.round(daysPerContainer);
                    continue;
                }

                if (isBuy) {
                    remaining = Math.round(daysPerContainer);
                    continue;
                }

                if (!isSkip && key !== startKey) remaining = Math.max(0, remaining - 1);
                if (remaining > 0) continue;

                const runout = new Date(day);
                runout.setDate(runout.getDate() + 1);
                const runoutKey = formatDateKey(runout);
                runouts.push({
                    name,
                    runoutDate: runoutKey,
                    forced: false,
                    price: Number.isFinite(price) ? `$${price.toFixed(2)}` : null
                });
                remaining = Math.round(daysPerContainer);
            }
        });

        return runouts;
    };

    const buildEventsDaily = ({ items, startDate, horizonDays, index }) => {
        const events = {};
        const runouts = predictRunoutsDaily({ items, startDate, horizonDays, index });

        runouts.forEach((evt) => {
            const key = String(evt.runoutDate || '').trim();
            if (!key) return;
            if (!events[key]) events[key] = [];
            events[key].push({
                name: evt.name,
                status: evt.forced ? 'expired' : 'buy',
                runoutDate: key,
                qty: 1,
                price: evt.price || null,
                meta: evt.forced ? 'Expired (forced)' : 'Runs out'
            });
        });

        return events;
    };

    const buildEventsSunday = ({ items, startDate, horizonDays, index }) => {
        const events = {};

        const base = new Date(startDate);
        base.setHours(0, 0, 0, 0);

        const runouts = predictRunoutsDaily({ items, startDate: base, horizonDays, index })
            .filter((r) => !r.forced);

        // Forced "expired" events always stay on their exact day.
        predictRunoutsDaily({ items, startDate: base, horizonDays, index })
            .filter((r) => r.forced)
            .forEach((forced) => {
                const key = String(forced.runoutDate || '').trim();
                if (!key) return;
                if (!events[key]) events[key] = [];
                events[key].push({
                    name: forced.name,
                    status: 'expired',
                    runoutDate: key,
                    qty: 1,
                    price: forced.price || null,
                    meta: 'Expired (forced)'
                });
            });

        const firstSunday = new Date(base);
        const delta = (0 - firstSunday.getDay() + 7) % 7;
        firstSunday.setDate(firstSunday.getDate() + delta);

        const horizonEnd = new Date(base);
        horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

        const toDate = (iso) => {
            const d = new Date(String(iso || ''));
            if (Number.isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        };

        for (let weekStart = new Date(firstSunday); weekStart <= horizonEnd; weekStart.setDate(weekStart.getDate() + 7)) {
            const buyDate = new Date(weekStart);
            const coverStart = new Date(buyDate);
            const coverEnd = new Date(buyDate);
            coverEnd.setDate(coverEnd.getDate() + 6);

            const inRange = runouts.filter((evt) => {
                const d = toDate(evt.runoutDate);
                if (!d) return false;
                return d >= coverStart && d <= coverEnd;
            });

            if (!inRange.length) continue;

            const aggregated = new Map();
            inRange.forEach((evt) => {
                const key = normalizeItemName(evt.name || 'Item') || 'Item';
                const existing = aggregated.get(key) || { name: key, qty: 0, price: evt.price || null };
                existing.qty += 1;
                if (!existing.price && evt.price) existing.price = evt.price;
                aggregated.set(key, existing);
            });

            const buyKey = formatDateKey(buyDate);
            if (!events[buyKey]) events[buyKey] = [];
            Array.from(aggregated.values())
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach((agg) => {
                    events[buyKey].push({
                        name: agg.name,
                        status: 'buy',
                        runoutDate: formatDateKey(coverEnd),
                        qty: agg.qty,
                        price: agg.price || null,
                        meta: `Covers ${formatDateKey(coverStart)} -> ${formatDateKey(coverEnd)}`
                    });
                });
        }

        return events;
    };

    const applyInitialPurchase = ({ events: baseEvents, items: itemList, startDate }) => {
        if (!startDate || Number.isNaN(new Date(startDate).getTime())) return baseEvents;
        const key = formatDateKey(new Date(startDate));
        if (!key) return baseEvents;
        if (!baseEvents[key]) baseEvents[key] = [];
        const existing = new Set(baseEvents[key].map((ev) => normalizeItemName(ev?.name).toLowerCase()));
        (itemList || []).forEach((item) => {
            const name = normalizeItemName(item?.name);
            if (!name) return;
            const lower = name.toLowerCase();
            if (existing.has(lower)) return;
            const priceNum = Number(item?.price);
            baseEvents[key].push({
                name,
                status: 'buy',
                runoutDate: key,
                qty: 1,
                price: Number.isFinite(priceNum) ? `$${priceNum.toFixed(2)}` : null,
                meta: 'Initial purchase'
            });
            existing.add(lower);
        });
        return baseEvents;
    };

    const buildEvents = ({ items, startDate, horizonDays, prefs, history }) => {
        const index = buildActionIndex(history.past);
        const mode = prefs.mode;
        let built = null;
        if (mode === 'daily') {
            built = buildEventsDaily({ items, startDate, horizonDays, index });
        } else if (mode === 'sunday') {
            built = buildEventsSunday({ items, startDate, horizonDays, index });
        } else {
            built = buildEventsSmart({ items, startDate, horizonDays, lowDaysThreshold: prefs.lowDaysThreshold, index });
        }
        const itemIndex = new Map();
        (items || []).forEach((it) => {
            const name = normalizeItemName(it?.name);
            if (!name) return;
            itemIndex.set(name.toLowerCase(), { name, price: it?.price });
        });
        (history?.past || []).forEach((a) => {
            const type = String(a?.type || '').trim();
            if (type !== 'buy' && type !== 'no-buy') return;
            const dateKey = String(a?.dateKey || '').trim();
            const itemName = normalizeItemName(a?.itemName);
            if (!dateKey || !itemName) return;
            if (!built[dateKey]) built[dateKey] = [];
            const lower = itemName.toLowerCase();
            const meta = type === 'buy' ? 'Bought' : "Didn't buy";
            const status = type === 'buy' ? 'bought' : 'no-buy';
            const itemInfo = itemIndex.get(lower);
            const displayName = itemInfo?.name || itemName;
            const price = type === 'buy' && itemInfo?.price ? `$${Number(itemInfo.price).toFixed(2)}` : null;
            const exists = built[dateKey].some((ev) => String(ev.name).toLowerCase() === lower && ev.status === status);
            if (exists) return;
            built[dateKey].push({
                name: displayName,
                status,
                runoutDate: dateKey,
                qty: 1,
                price,
                meta
            });
        });
        return applyInitialPurchase({ events: built, items, startDate });
    };

    const modal = (() => {
        let el = document.getElementById('gc-adjust-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'gc-adjust-modal';
        el.className = 'checkin-modal hidden';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.innerHTML = `
            <div class="checkin-backdrop" data-gc-close="1"></div>
            <div class="checkin-card" style="max-width: 520px;">
                <div class="meal-log-head-actions" style="justify-content: space-between;">
                    <div>
                        <div style="font-weight: 900; letter-spacing: -0.02em;" id="gc-adjust-title">Update day</div>
                        <div class="ns-muted tiny" id="gc-adjust-sub">Select a food item.</div>
                    </div>
                    <button class="btn btn-ghost" type="button" data-gc-close="1">Close</button>
                </div>
                <div style="height: 10px;"></div>
                <label class="ns-muted tiny" for="gc-adjust-item">Food item</label>
                <select class="meal-log-input" id="gc-adjust-item"></select>
                <div style="height: 12px;"></div>
                <div style="display:flex; gap: 10px; justify-content:flex-end; flex-wrap: wrap;">
                    <button class="btn btn-ghost" type="button" data-gc-close="1">Cancel</button>
                    <button class="btn btn-primary" type="button" id="gc-adjust-save">Save</button>
                </div>
            </div>
        `.trim();
        document.body.appendChild(el);
        return el;
    })();

    const openAdjustModal = ({ dateKey, type, items, onSave }) => {
        const titleEl = modal.querySelector('#gc-adjust-title');
        const subEl = modal.querySelector('#gc-adjust-sub');
        const selectEl = modal.querySelector('#gc-adjust-item');
        const saveBtn = modal.querySelector('#gc-adjust-save');

        if (!selectEl || !saveBtn) return;

        const dt = new Date(String(dateKey || ''));
        const prettyDate = Number.isNaN(dt.getTime())
            ? String(dateKey || '')
            : dt.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });

        const modeTitle = type === 'expired'
            ? 'Mark expired'
            : type === 'buy'
                ? 'Mark bought'
                : type === 'no-buy'
                    ? "Didn't buy"
                    : "Didn't eat today";

        if (titleEl) titleEl.textContent = `${modeTitle}`;
        if (subEl) subEl.textContent = `For ${prettyDate} - pick the food item (or apply to all).`;

        const names = (items || []).map((it) => normalizeItemName(it?.name)).filter(Boolean);
        names.sort((a, b) => a.localeCompare(b));
        const options = [
            `<option value="__all__">All groceries</option>`,
            ...names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
        ];
        selectEl.innerHTML = options.join('');

        let active = true;
        const close = () => {
            if (!active) return;
            active = false;
            modal.classList.add('hidden');
            document.body.classList.remove('modal-open');
            saveBtn.replaceWith(saveBtn.cloneNode(true));
        };

        const saveNow = () => {
            const raw = String(selectEl.value || '').trim();
            if (!raw) return;
            if (raw === '__all__') {
                try { onSave?.({ dateKey, type, itemName: '__all__', applyAll: true }); } catch { /* ignore */ }
                close();
                return;
            }
            const itemName = normalizeItemName(raw);
            if (!itemName) return;
            try { onSave?.({ dateKey, type, itemName }); } catch { /* ignore */ }
            close();
        };

        const saveBtnFresh = modal.querySelector('#gc-adjust-save');
        saveBtnFresh?.addEventListener('click', saveNow);

        modal.querySelectorAll('[data-gc-close="1"]').forEach((btn) => {
            btn.addEventListener('click', close, { once: true });
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        }, { once: true });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        }, { once: true });

        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        window.setTimeout(() => selectEl.focus(), 40);
    };

    let monthOffset = 0;
    const minOffset = -2;
    const maxOffset = 10;
    let selectedKey = null;

    const { items: rawItems, startDate: storedStartDate, savedAt } = loadCalendarData();
    let startDate = storedStartDate || savedAt || loadStartDate();
    const items = Array.isArray(rawItems) ? rawItems : [];

    let prefs = loadPrefs();
    let history = loadHistory();
    let events = buildEvents({ items, startDate, horizonDays: 240, prefs, history });

    const persistStartDate = (dateObj) => {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return;
        const iso = dateObj.toISOString().slice(0, 10);
        try {
            const raw = localStorage.getItem('ode_grocery_calendar_items_v1');
            const parsed = raw ? JSON.parse(raw) : {};
            localStorage.setItem('ode_grocery_calendar_items_v1', JSON.stringify({
                ...parsed,
                startDate: iso
            }));
        } catch {
            // ignore
        }
        try { sessionStorage.setItem('groceryStartDate', iso); } catch { /* ignore */ }
    };

    const updateUndoRedoUi = (root) => {
        const undoBtn = root.querySelector('[data-gc-action="undo"]');
        const redoBtn = root.querySelector('[data-gc-action="redo"]');
        if (undoBtn) {
            const disabled = history.past.length === 0;
            undoBtn.disabled = disabled;
            undoBtn.setAttribute('aria-disabled', String(disabled));
        }
        if (redoBtn) {
            const disabled = history.future.length === 0;
            redoBtn.disabled = disabled;
            redoBtn.setAttribute('aria-disabled', String(disabled));
        }
    };

    const renderDetailForKey = (key) => {
        if (!detailBody) return;
        if (!key) {
            if (detailDate) detailDate.textContent = 'Select a day';
            detailBody.innerHTML = '<div class="calendar-detail-empty">Click a day to see predicted restocks.</div>';
            return;
        }

        const dayEvents = Array.isArray(events[key]) ? events[key] : [];

        if (detailDate) {
            const dateObj = new Date(String(key || ''));
            detailDate.textContent = Number.isNaN(dateObj.getTime())
                ? 'Selected day'
                : dateObj.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
        }

        if (!dayEvents.length) {
            detailBody.innerHTML = '<div class="calendar-detail-empty">No restocks predicted for this day.</div>';
            return;
        }

        const rows = [];
        let totalCost = 0;
        const toPrice = (value) => {
            const num = Number(String(value || '').replace(/[^0-9.]/g, ''));
            return Number.isFinite(num) ? num : null;
        };
        dayEvents
            .slice()
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
            .forEach((ev) => {
                const qty = Math.max(1, Number(ev.qty || 1));
                const qtyText = prefs.mode === 'sunday' ? ` x${qty}` : (qty > 1 ? ` x${qty}` : '');
                const metaText = ev.meta
                    ? escapeHtml(ev.meta)
                    : (ev.runoutDate ? `Runs out ~ ${escapeHtml(ev.runoutDate)}` : 'Restock');
                const priceValue = toPrice(ev.price);
                if (priceValue != null) totalCost += priceValue * qty;
                const priceText = ev.price ? ` - ${escapeHtml(ev.price)}${qty > 1 ? ` x${qty}` : ''}` : '';

                const badgeClass = ev.status === 'no-buy'
                    ? 'no-buy'
                    : ev.status === 'bought'
                        ? 'bought'
                        : ev.status === 'expired'
                            ? 'expired'
                            : 'buy';
                const badgeLabel = ev.status === 'no-buy'
                    ? 'No buy'
                    : ev.status === 'bought'
                        ? 'Bought'
                        : ev.status === 'expired'
                            ? 'Expired'
                            : 'Buy';

                rows.push(`
                    <div class="calendar-detail-item">
                        <div class="calendar-detail-name">${escapeHtml(ev.name)}${qtyText}</div>
                        <div class="calendar-detail-meta">
                            ${metaText}${priceText}
                            <div class="calendar-detail-badge ${badgeClass}">${badgeLabel}</div>
                        </div>
                    </div>
                `);
            });
        if (totalCost > 0) {
            rows.push(`
                <div class="calendar-detail-item calendar-detail-total">
                    <div class="calendar-detail-name">Total</div>
                    <div class="calendar-detail-meta">
                        $${totalCost.toFixed(2)}
                    </div>
                </div>
            `);
        }
        detailBody.innerHTML = rows.join('');
    };

    const renderMonth = ({ targetEl, year, monthIndex, startDateKey, todayKey }) => {
        if (!targetEl) return;
        const monthStart = new Date(year, monthIndex, 1);
        const monthEnd = new Date(year, monthIndex + 1, 0);
        const startWeekday = monthStart.getDay();
        const daysInMonth = monthEnd.getDate();
        const monthTitle = formatMonthTitle(monthStart);

        const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const cells = [];
        cells.push(...weekdayLabels.map((label) => `<div class="calendar-weekday">${label}</div>`));

        for (let i = 0; i < startWeekday; i += 1) {
            cells.push('<div class="calendar-cell is-empty"></div>');
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(year, monthIndex, day);
            const key = formatDateKey(date);
            const dayEvents = Array.isArray(events[key]) ? events[key] : [];

            const classes = ['calendar-cell'];
            if (key === startDateKey) classes.push('is-start');
            if (key === todayKey) classes.push('is-today');
            if (key === selectedKey) classes.push('is-selected');
            const hasExpired = dayEvents.some((ev) => ev.status === 'expired');
            const hasBuy = dayEvents.some((ev) => ev.status === 'buy');
            const hasLow = dayEvents.some((ev) => ev.status === 'low');
            const hasNoBuy = dayEvents.some((ev) => ev.status === 'no-buy');
            const hasBought = dayEvents.some((ev) => ev.status === 'bought');
            if (hasExpired) classes.push('has-expired');
            if (hasBuy) classes.push('has-buy');
            if (!hasBuy && !hasExpired && hasLow) classes.push('has-low');
            if (hasNoBuy) classes.push('has-no-buy');
            if (hasBought) classes.push('has-bought');

            const itemsPreview = dayEvents
                .slice(0, 2)
                .map((ev) => {
                    const qtyText = Number(ev.qty || 1) > 1 ? ` &times;${Number(ev.qty || 1)}` : '';
                    const meta = ev.status === 'expired'
                        ? 'Expired'
                        : ev.status === 'no-buy'
                            ? 'No buy'
                            : ev.status === 'bought'
                                ? 'Bought'
                                : 'Buy';
                    return `<div class="calendar-item">${escapeHtml(ev.name)}${qtyText}: ${escapeHtml(meta)}</div>`;
                })
                .join('');
            const more = dayEvents.length > 2 ? `<div class="calendar-item calendar-more">+${dayEvents.length - 2} more</div>` : '';

            const statusLabel = hasExpired
                ? 'Expired'
                : hasNoBuy
                    ? 'No buy'
                    : hasBought
                        ? 'Bought'
                        : hasBuy
                            ? 'Buy'
                            : (hasLow ? 'Low' : '');
            cells.push(`
                <div class="${classes.join(' ')}" data-key="${escapeHtml(key)}">
                    <div class="calendar-day">${day}</div>
                    ${statusLabel ? `<div class="calendar-status">${statusLabel}</div>` : ''}
                    <div class="calendar-items">
                        ${itemsPreview}
                        ${more}
                    </div>
                </div>
            `);
        }

        const modePill = (mode, label) => {
            const active = prefs.mode === mode;
            return `
                <button type="button"
                    class="calendar-pill calendar-mode ${active ? 'is-active' : ''}"
                    data-gc-mode="${escapeHtml(mode)}"
                    aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(label)}</button>
            `.trim();
        };

        targetEl.innerHTML = `
            <div class="calendar-month-head">
                <div class="calendar-month-title">${escapeHtml(monthTitle)}</div>
                <div class="calendar-month-tools">
                    ${modePill('daily', 'Daily')}
                    ${modePill('sunday', 'Sundays')}
                    <span class="calendar-pill calendar-action" draggable="true" data-gc-pill="buy" title="Drag onto a day you bought groceries.">Bought</span>
                    <span class="calendar-pill calendar-action" draggable="true" data-gc-pill="no-buy" title="Drag onto a day you did not buy groceries.">Didn't buy</span>
                    <span class="calendar-pill skip" draggable="true" data-gc-pill="skip" title="Drag onto a day you didn’t eat this item.">Didn't eat</span>
                    <span class="calendar-pill expired" draggable="true" data-gc-pill="expired" title="Drag onto a day this item expired.">Expired</span>
                    <button class="calendar-pill calendar-action" type="button" data-gc-action="undo">Undo</button>
                    <button class="calendar-pill calendar-action" type="button" data-gc-action="redo">Redo</button>
                </div>
            </div>
            <div class="calendar-grid">${cells.join('')}</div>
        `.trim();

        updateUndoRedoUi(targetEl);
    };

    const applyAction = ({ dateKey, type, itemName, applyAll }) => {
        const date = String(dateKey || '').trim();
        const actionType = type === 'expired'
            ? 'expired'
            : type === 'skip'
                ? 'skip'
                : type === 'buy'
                    ? 'buy'
                    : type === 'no-buy'
                        ? 'no-buy'
                        : 'skip';
        if (!date) return;

        const names = applyAll
            ? (items || []).map((it) => normalizeItemName(it?.name)).filter(Boolean)
            : [normalizeItemName(itemName)];

        if (!names.length) return;

        const existingKeys = new Set(history.past.map(keyForAction));
        const additions = [];
        for (const name of names) {
            if (!name) continue;
            const next = {
                id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
                type: actionType,
                dateKey: date,
                itemName: name,
                createdAt: new Date().toISOString()
            };
            const key = keyForAction(next);
            if (existingKeys.has(key)) continue;
            existingKeys.add(key);
            additions.push(next);
        }

        if (!additions.length) return;
        history = {
            past: [...history.past, ...additions],
            future: []
        };
        saveHistory(history);
        events = buildEvents({ items, startDate, horizonDays: 240, prefs, history });
    };

    const undo = () => {
        if (!history.past.length) return;
        const past = history.past.slice();
        const last = past.pop();
        history = { past, future: [last, ...(history.future || [])] };
        saveHistory(history);
        events = buildEvents({ items, startDate, horizonDays: 240, prefs, history });
    };

    const redo = () => {
        if (!history.future.length) return;
        const future = history.future.slice();
        const next = future.shift();
        history = { past: [...history.past, next], future };
        saveHistory(history);
        events = buildEvents({ items, startDate, horizonDays: 240, prefs, history });
    };

    const render = () => {
        const current = new Date();
        current.setMonth(current.getMonth() + monthOffset);
        const year = current.getFullYear();
        const monthIndex = current.getMonth();

        const startDateKey = formatDateKey(startDate);
        const todayKey = formatDateKey(new Date());

        if (calendarRange) {
            const label = prefs.mode === 'sunday' ? 'Restock Sundays' : prefs.mode === 'daily' ? 'Restock daily' : 'Smart restock';
            calendarRange.textContent = label;
        }

        if (calendarPrev) {
            const disabled = monthOffset <= minOffset;
            calendarPrev.disabled = disabled;
            calendarPrev.setAttribute('aria-disabled', String(disabled));
        }
        if (calendarNext) {
            const disabled = monthOffset >= maxOffset;
            calendarNext.disabled = disabled;
            calendarNext.setAttribute('aria-disabled', String(disabled));
        }

        if (!items.length && detailBody) {
            detailBody.innerHTML = '<div class="calendar-detail-empty">No grocery data yet. Open the Groceries page once to sync.</div>';
        }

        renderMonth({ targetEl: monthEl, year, monthIndex, startDateKey, todayKey });

        monthEl.querySelectorAll('.calendar-cell[data-key]').forEach((cell) => {
            cell.addEventListener('click', () => {
                monthEl.querySelectorAll('.calendar-cell').forEach((el) => el.classList.remove('is-selected'));
                cell.classList.add('is-selected');
                selectedKey = cell.getAttribute('data-key');
                renderDetailForKey(selectedKey);
            });

            cell.addEventListener('dragover', (event) => {
                event.preventDefault();
                cell.classList.add('is-drop');
            });
            cell.addEventListener('dragleave', () => cell.classList.remove('is-drop'));
            cell.addEventListener('drop', (event) => {
                event.preventDefault();
                cell.classList.remove('is-drop');
                const dateKey = cell.getAttribute('data-key');
                const type = event.dataTransfer?.getData('text/plain') || '';
                const actionType = type === 'gc-expired'
                    ? 'expired'
                    : type === 'gc-buy'
                        ? 'buy'
                        : type === 'gc-no-buy'
                            ? 'no-buy'
                            : 'skip';
                openAdjustModal({
                    dateKey,
                    type: actionType,
                    items,
                    onSave: (payload) => {
                        applyAction(payload);
                        render();
                        if (selectedKey) renderDetailForKey(selectedKey);
                    }
                });
            });
        });

        // Delegated: month tool pills + modes.
        monthEl.querySelectorAll('[data-gc-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-gc-mode');
                if (mode !== 'smart' && mode !== 'daily' && mode !== 'sunday') return;
                prefs = { ...prefs, mode };
                savePrefs(prefs);
                events = buildEvents({ items, startDate, horizonDays: 240, prefs, history });
                render();
                if (selectedKey) renderDetailForKey(selectedKey);
            });
        });

        monthEl.querySelectorAll('[data-gc-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-gc-action');
                if (action === 'undo') undo();
                if (action === 'redo') redo();
                render();
                if (selectedKey) renderDetailForKey(selectedKey);
            });
        });

        monthEl.querySelectorAll('[data-gc-pill]').forEach((pill) => {
            pill.addEventListener('dragstart', (event) => {
                const kind = pill.getAttribute('data-gc-pill');
                const tag = kind === 'expired'
                    ? 'gc-expired'
                    : kind === 'buy'
                        ? 'gc-buy'
                        : kind === 'no-buy'
                            ? 'gc-no-buy'
                            : 'gc-skip';
                event.dataTransfer?.setData('text/plain', tag);
                event.dataTransfer && (event.dataTransfer.effectAllowed = 'copy');
            });
        });

        if (selectedKey) renderDetailForKey(selectedKey);
    };

    calendarPrev?.addEventListener('click', () => {
        monthOffset = clamp(monthOffset - 1, minOffset, maxOffset);
        render();
    });
    calendarNext?.addEventListener('click', () => {
        monthOffset = clamp(monthOffset + 1, minOffset, maxOffset);
        render();
    });

    render();
})();



