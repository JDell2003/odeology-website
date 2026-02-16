(() => {
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const parseMoney = (text) => {
        const n = Number(String(text || '').replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) ? n : null;
    };

    const parseFloatLoose = (text) => {
        const n = Number(String(text || '').replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) ? n : null;
    };

    const toOz = (qtyText) => {
        const raw = String(qtyText || '').toLowerCase().trim();
        const num = Number(raw.replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(num) || num <= 0) return null;
        if (raw.includes('kg')) return num * 35.274;
        if (raw.includes('g')) return num / 28.3495;
        if (raw.includes('lb')) return num * 16;
        if (raw.includes('oz')) return num;
        return null;
    };

    const getStartDate = () => {
        try {
            const prefs = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
            const stored = prefs?.startDate || sessionStorage.getItem('groceryStartDate');
            const parsed = stored ? new Date(stored) : new Date();
            return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
        } catch {
            return new Date();
        }
    };

    const monthLabel = (date) => date.toLocaleString('default', { month: 'long' });

    let cachedWeeklySchedule = null;
    let cachedProfileGroceryItems = [];
    let mealFallbackResizeBound = false;

    const waitFor = async (predicate, { timeoutMs = 10000, intervalMs = 200 } = {}) => {
        const start = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (predicate()) return true;
            if (Date.now() - start > timeoutMs) return false;
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, intervalMs));
        }
    };

    const parseItemsFromBaselineCards = () => {
        const cards = $$('.grocery-card');
        if (!cards.length) return [];
        return cards.map(card => {
            const name = ($('.grocery-card-title', card)?.textContent || '').trim();
            const rows = $$('.detail-row', card);
            const findRow = (label) => rows.find(r => ($('.detail-label', r)?.textContent || '').trim().toLowerCase() === label);
            const dailyRow = findRow('daily use');
            const priceRow = findRow('price');
            const dailyServings = parseFloatLoose($('.detail-value', dailyRow)?.textContent || null);
            const price = parseMoney($('.detail-value', priceRow)?.textContent || null);

            const durationText = ($('.duration-text', card)?.textContent || '').toLowerCase();
            const days = durationText.includes('n/a') ? null : parseFloatLoose(durationText);

            const img = $('.grocery-card-image img', card)?.getAttribute('src') || '';

            return {
                name,
                daily: Number.isFinite(dailyServings) ? dailyServings : null,
                daysPerContainer: Number.isFinite(days) ? days : null,
                price,
                image: img
            };
        }).filter(item => item.name);
    };

    const parseItemsFromLegacyRows = () => {
        const rows = $$('.grocery-item-row');
        if (!rows.length) return [];
        return rows.map(row => {
            const name = ($('.grocery-popup', row)?.textContent || '').trim();
            const dailyText = ($('.consumption-daily', row)?.textContent || '');
            const containerSizeText = ($('.grocery-item-container-size', row)?.textContent || '').replace(/container/i, '').trim();
            const priceText = ($('.purchase-price', row)?.textContent || '');
            const dailyOz = toOz(dailyText);
            const containerOz = toOz(containerSizeText);
            const price = parseMoney(priceText);
            const daysPerContainer = (Number.isFinite(dailyOz) && Number.isFinite(containerOz) && dailyOz > 0)
                ? (containerOz / dailyOz)
                : null;
            return {
                name,
                daily: Number.isFinite(dailyOz) ? dailyOz : null,
                daysPerContainer,
                price,
                unit: 'oz'
            };
        }).filter(item => item.name);
    };

    const parsePlanItems = () => {
        const baseline = parseItemsFromBaselineCards();
        if (baseline.length) return { items: baseline, unit: 'servings' };
        const legacy = parseItemsFromLegacyRows();
        if (legacy.length) return { items: legacy, unit: 'oz' };
        return { items: [], unit: null };
    };

    const updateMealHeaderMacros = () => {
        const dailyText = ($('.daily-total-value', $('#meal-grid'))?.textContent || '').trim();
        if (!dailyText) return;
        const kcal = dailyText.match(/(\d+)\s*kcal/i)?.[1] || null;
        const pro = dailyText.match(/(\d+)\s*g\s*p/i)?.[1] || null;
        const car = dailyText.match(/(\d+)\s*g\s*c/i)?.[1] || null;
        const fat = dailyText.match(/(\d+)\s*g\s*f/i)?.[1] || null;
        const line = $('#overview-macros-line');
        if (line) {
            const parts = [];
            if (kcal) parts.push(`${kcal} kcal`);
            if (pro) parts.push(`${pro}g protein`);
            if (car) parts.push(`${car}g carbs`);
            if (fat) parts.push(`${fat}g fats`);
            line.textContent = parts.length ? `Daily macros: ${parts.join(' • ')}` : 'Daily macros: —';
        }
    };

    const buildWeekEvents = (items, startDate) => {
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            return d;
        });

        const events = days.map(() => []);
        const lowDaysThreshold = 2;

        items.forEach(item => {
            const daily = Number(item.daily);
            const daysPerContainer = Number(item.daysPerContainer);
            if (!Number.isFinite(daily) || daily <= 0) return;
            if (!Number.isFinite(daysPerContainer) || daysPerContainer <= 0) return;

            let remainingDays = daysPerContainer;
            for (let i = 0; i < 7; i += 1) {
                if (remainingDays <= lowDaysThreshold) {
                    events[i].push({
                        name: item.name,
                        price: item.price
                    });
                    remainingDays = daysPerContainer;
                }
                remainingDays -= 1;
            }
        });

        return { days, events };
    };

    const renderTrackerDetail = ({ days, events, idx }) => {
        const titleEl = $('#overview-tracker-detail-title');
        const subEl = $('#overview-tracker-detail-sub');
        const bodyEl = $('#overview-tracker-detail-body');
        if (!bodyEl) return;

        const date = days?.[idx] || null;
        const dateText = date
            ? date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
            : '—';
        if (titleEl) titleEl.textContent = `Day ${idx + 1} · ${dateText}`;

        const dayEvents = Array.isArray(events?.[idx]) ? events[idx] : [];
        if (!dayEvents.length) {
            if (subEl) subEl.textContent = 'No restocks scheduled.';
            bodyEl.innerHTML = `
                <div class="tracker-empty">
                    <div class="tracker-empty-title">All good.</div>
                    <div class="tracker-empty-sub ns-muted">No items predicted to run low today.</div>
                </div>
            `;
            return;
        }

        const total = dayEvents.reduce((sum, ev) => sum + (Number.isFinite(ev.price) ? ev.price : 0), 0);
        if (subEl) subEl.textContent = `${dayEvents.length} item${dayEvents.length === 1 ? '' : 's'} · ≈ $${total.toFixed(0)}`;

        const sorted = dayEvents
            .slice()
            .sort((a, b) => {
                const pa = Number.isFinite(a?.price) ? a.price : 0;
                const pb = Number.isFinite(b?.price) ? b.price : 0;
                return pb - pa;
            });

        bodyEl.innerHTML = `
            <div class="tracker-items">
                ${sorted.map(ev => {
                    const safe = String(ev?.name || '').replace(/[^\x20-\x7E]/g, '').trim() || 'Item';
                    const priceText = Number.isFinite(ev?.price) ? `$${ev.price.toFixed(0)}` : '$—';
                    return `
                        <div class="tracker-item">
                            <div class="tracker-item-name" title="${safe}">${safe}</div>
                            <div class="tracker-item-price">${priceText}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    };

    const renderWeekGrid = ({ days, events }) => {
        const grid = $('#overview-week-grid');
        if (!grid) return;

        const weekday = (d) => d.toLocaleDateString(undefined, { weekday: 'short' });
        const monthDay = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const nextIdx = (events || []).findIndex(list => (list || []).length);

        const safeEvents = Array.isArray(events) ? events : [];
        const safeDays = Array.isArray(days) ? days : [];

        let selected = nextIdx >= 0 ? nextIdx : 0;

        const render = () => {
            grid.innerHTML = safeDays.map((date, idx) => {
                const dayEvents = safeEvents[idx] || [];
                const total = dayEvents.reduce((sum, ev) => sum + (Number.isFinite(ev.price) ? ev.price : 0), 0);
                const count = dayEvents.length;
                const isNext = nextIdx === idx;
                const isSelected = selected === idx;

                const cls = [
                    'tracker-day',
                    count ? 'has-restock' : '',
                    isNext ? 'is-next' : '',
                    isSelected ? 'is-selected' : ''
                ].filter(Boolean).join(' ');

                return `
                    <button class="${cls}" type="button" data-idx="${idx}" aria-label="Day ${idx + 1}">
                        <div class="tracker-day-head">
                            <div class="tracker-day-date">
                                <span class="tracker-dow">${weekday(date)}</span>
                                <span class="tracker-md">${monthDay(date)}</span>
                            </div>
                            <div class="tracker-day-badges">
                                ${isNext ? '<span class="tracker-badge next">Next</span>' : ''}
                                ${count ? `<span class="tracker-badge count" title="${count} restock${count === 1 ? '' : 's'}">${count}</span>` : '<span class="tracker-badge ok" title="All good">OK</span>'}
                            </div>
                        </div>
                        <div class="tracker-day-sub ns-muted">
                            ${count ? `Restocks: ${count}${total > 0 ? ` · ≈ $${total.toFixed(0)}` : ''}` : 'No restocks'}
                        </div>
                    </button>
                `;
            }).join('');

            const btn = grid.querySelector(`.tracker-day[data-idx="${selected}"]`);
            btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            renderTrackerDetail({ days: safeDays, events: safeEvents, idx: selected });
        };

        grid.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('.tracker-day[data-idx]');
            if (!btn) return;
            const idx = Number(btn.getAttribute('data-idx'));
            if (!Number.isFinite(idx)) return;
            selected = idx;
            render();
        }, { passive: true });

        render();
    };

    const toggleEmptyState = (hasItems) => {
        const empty = $('#overview-empty');
        const toolbar = $('#overview-grocery-toolbar');
        const hint = $('#overview-grocery-toggle-hint');
        const views = $('#overview-grocery-views');
        if (empty) empty.classList.toggle('hidden', !!hasItems);
        if (toolbar) toolbar.classList.toggle('hidden', !hasItems);
        if (hint) hint.classList.toggle('hidden', !hasItems);
        if (views) views.classList.toggle('hidden', !hasItems);
    };

    const renderGroceryCards = ({ items = [], meta = {}, totals = {}, source = 'local' } = {}) => {
        const listTarget = $('#grocery-list-items');
        if (!listTarget || !Array.isArray(items) || !items.length) return false;
        if (listTarget.querySelector('.grocery-card, .grocery-item-row')) return true;
        cachedProfileGroceryItems = items.slice();

        const fmtMoney = (n) => (Number.isFinite(Number(n)) ? `$${Number(n).toFixed(2)}` : null);
        const computedWeekly = (() => {
            let sum = 0;
            let any = false;
            items.forEach((it) => {
                const w = Number(it?.estimatedWeeklyCost);
                if (Number.isFinite(w) && w >= 0) {
                    sum += w;
                    any = true;
                }
            });
            return any ? sum : null;
        })();
        const computedMonthly = (() => {
            let sum = 0;
            let any = false;
            items.forEach((it) => {
                const m = Number(it?.estimatedCost);
                if (Number.isFinite(m) && m >= 0) {
                    sum += m;
                    any = true;
                }
            });
            if (any) return sum;
            if (Number.isFinite(computedWeekly)) return (computedWeekly * 30) / 7;
            return null;
        })();

        const weekly = Number.isFinite(Number(totals?.totalEstimatedWeeklyCost))
            ? Number(totals.totalEstimatedWeeklyCost)
            : computedWeekly;
        const monthly = Number.isFinite(Number(totals?.totalEstimatedCost))
            ? Number(totals.totalEstimatedCost)
            : computedMonthly;

        const store = String(meta?.store || '').trim();
        const storePill = $('#store-pill');
        if (storePill) storePill.textContent = store || 'Saved';

        $('#overview-grocery-count') && ($('#overview-grocery-count').textContent = `${items.length || 0} items`);
        $('#overview-month-days') && ($('#overview-month-days').textContent = 'Saved to your account');
        $('#overview-month-projected') && ($('#overview-month-projected').textContent = fmtMoney(monthly) || '—');

        const mt = meta?.macroTargets && typeof meta.macroTargets === 'object' ? meta.macroTargets : null;
        if (mt) {
            const setText = (id, v) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.textContent = String(v ?? '');
            };
            setText('target-cal', Number(mt.calories) || '');
            setText('target-pro', Number(mt.proteinG) || '');
            setText('target-carb', Number(mt.carbG) || '');
            setText('target-fat', Number(mt.fatG) || '');
            updateMealHeaderMacros();
        }

        const safe = (s) => String(s || '').replace(/[^\x20-\x7E]/g, '').trim();
        const escape = (s) => String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        listTarget.innerHTML = `
            <div class="grocery-items-grid" data-source="${escape(source)}">
                ${items.slice(0, 500).map((it) => {
                    const name = safe(it?.name) || 'Item';
                    const quantity = safe(it?.quantity) || '';
                    const category = safe(it?.category) || 'Misc';
                    const img = String(it?.image || '').trim();
                    const url = String(it?.url || '').trim();
                    const daily = Number(it?.daily);
                    const unit = safe(it?.unit) || 'servings';
                    const days = Number(it?.daysPerContainer);
                    const price = Number(it?.containerPrice);

                    const dailyText = Number.isFinite(daily) ? `${daily.toFixed(2)} ${unit}` : `— ${unit}`;
                    const daysLabel = Number.isFinite(days)
                        ? (days >= 30 ? `${Math.round(days)} days (1+ month)` : `${Math.max(0, Math.round(days))} days`)
                        : 'N/A';
                    const priceText = Number.isFinite(price) ? `$${price.toFixed(2)}` : '—';
                    const footer = fmtMoney(it?.estimatedWeeklyCost ?? it?.estimatedCost) ? `${fmtMoney(it?.estimatedWeeklyCost ?? it?.estimatedCost)} est` : '';

                    return `
                        <div class="grocery-card" data-query="${escape(name.toLowerCase())}">
                            <div class="grocery-card-image ${img ? '' : 'no-image'}">
                                ${img ? `<img src="${escape(img)}" alt="${escape(name)}" onerror="this.style.display='none'; this.parentElement.classList.add('no-image');">` : ''}
                                ${url ? `
                                    <a href="${escape(url)}" target="_blank" class="grocery-card-link" rel="noopener" title="View item">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                    </a>
                                ` : ''}
                            </div>
                            <div class="grocery-card-body">
                                <h4 class="grocery-card-title">${escape(name)}</h4>
                                <div class="grocery-card-duration">
                                    <span class="duration-icon">⏱</span>
                                    <span class="duration-text">Container lasts <strong>${escape(daysLabel)}</strong></span>
                                </div>
                                <div class="grocery-card-details">
                                    <div class="detail-row">
                                        <span class="detail-label">Qty</span>
                                        <span class="detail-value">${escape(quantity || '—')}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Category</span>
                                        <span class="detail-value">${escape(category || 'Misc')}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Daily use</span>
                                        <span class="detail-value">${escape(dailyText)}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Price</span>
                                        <span class="detail-value">${escape(priceText)}</span>
                                    </div>
                                </div>
                                <div class="grocery-card-footer">
                                    <span class="container-price">${escape(footer)}</span>
                                    <label class="grocery-check-modern">
                                        <input type="checkbox" class="grocery-check-input" data-query="${escape(name.toLowerCase())}">
                                        <span class="checkmark"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        return true;
    };

    const hydrateGroceryFromDraft = () => {
        const listTarget = $('#grocery-list-items');
        if (!listTarget) return false;
        if (listTarget.querySelector('.grocery-card, .grocery-item-row')) return true;

        let draft = null;
        try {
            draft = window.__ode_latest_grocery_list_draft || null;
        } catch {
            draft = null;
        }

        if (!draft) {
            try {
                draft = JSON.parse(sessionStorage.getItem('ode_latest_grocery_list_draft_v1') || 'null');
            } catch {
                draft = null;
            }
        }

        if (!draft) {
            try {
                draft = JSON.parse(localStorage.getItem('ode_grocery_calendar_items_v1') || 'null');
            } catch {
                draft = null;
            }
        }

        const items = Array.isArray(draft?.items) ? draft.items : [];
        if (!items.length) return false;

        const meta = draft?.meta && typeof draft.meta === 'object' ? draft.meta : {};
        const totals = draft?.totals && typeof draft.totals === 'object' ? draft.totals : {};
        return renderGroceryCards({ items, meta, totals, source: 'draft' });
    };

    const initCollapsible = (headEl, contentEl, { expanded = false } = {}) => {
        if (!headEl || !contentEl) return;

        const setExpanded = (next) => {
            headEl.setAttribute('aria-expanded', next ? 'true' : 'false');
            contentEl.classList.toggle('hidden', !next);
        };

        const toggle = () => {
            const current = headEl.getAttribute('aria-expanded') === 'true';
            setExpanded(!current);
        };

        headEl.addEventListener('click', (e) => {
            const tag = String(e.target?.tagName || '').toLowerCase();
            if (tag === 'a' || tag === 'button' || e.target?.closest('a,button')) return;
            toggle();
        });
        headEl.querySelector('.collapse-toggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            toggle();
        });

        setExpanded(expanded);
    };

    const initOverviewMiniNav = () => {
        const nav = document.getElementById('overview-mini-nav');
        if (!nav) return;
        const buttons = Array.from(nav.querySelectorAll('[data-filter]'));
        const items = Array.from(document.querySelectorAll('[data-overview-section]'));
        if (!buttons.length || !items.length) return;

        const mql = window.matchMedia('(max-width: 700px)');
        const isMobile = () => !!mql.matches;

        const applyFilter = (filter) => {
            const active = filter || 'all';
            items.forEach((el) => {
                const section = el.getAttribute('data-overview-section');
                const show = active === 'all' || section === active;
                el.classList.toggle('is-hidden', !show);
            });
            const photoHistory = document.getElementById('overview-photo-history');
            if (photoHistory) {
                photoHistory.classList.toggle('is-hidden', active !== 'photos');
            }
            buttons.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.filter === active);
            });
            document.body.classList.toggle('overview-restock-focus', active === 'restock');

            if (active === 'all') {
                const groceryHead = document.getElementById('overview-grocery-head');
                const groceryCard = document.getElementById('grocery-list');
                if (groceryHead && groceryCard) {
                    groceryHead.setAttribute('aria-expanded', 'true');
                    groceryCard.classList.add('is-expanded');
                }
            }
        };

        buttons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter || 'all';
                applyFilter(filter);
                if (isMobile() && filter !== 'all') {
                    nav.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        mql.addEventListener('change', () => {
            applyFilter('all');
        });

        applyFilter('all');
    };

    const initGroceryExpand = () => {
        const headEl = $('#overview-grocery-head');
        const cardEl = $('#grocery-list');
        if (!headEl || !cardEl) return;

        const setExpanded = (next) => {
            const on = !!next;
            headEl.setAttribute('aria-expanded', on ? 'true' : 'false');
            cardEl.classList.toggle('is-expanded', on);
        };

        const toggle = () => {
            const current = headEl.getAttribute('aria-expanded') === 'true';
            setExpanded(!current);
        };

        headEl.addEventListener('click', (e) => {
            const tag = String(e.target?.tagName || '').toLowerCase();
            if (tag === 'a' || tag === 'button' || e.target?.closest('a,button')) return;
            toggle();
        });
        headEl.querySelector('.collapse-toggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            toggle();
        });

        setExpanded(false);
    };

    const predictRunouts = (items, startDate, { horizonDays = 28 } = {}) => {
        const base = new Date(startDate);
        base.setHours(0, 0, 0, 0);

        const events = [];
        items.forEach((item) => {
            const daysPerContainer = Number(item.daysPerContainer);
            const price = Number(item.price);
            const image = String(item.image || '').trim();
            if (!Number.isFinite(daysPerContainer) || daysPerContainer <= 0) return;

            let remainingDays = daysPerContainer;
            for (let dayIdx = 0; dayIdx < horizonDays; dayIdx += 1) {
                remainingDays -= 1;
                if (remainingDays > 0) continue;

                const runout = new Date(base);
                runout.setDate(runout.getDate() + dayIdx + 1);
                events.push({
                    name: item.name,
                    qty: 1,
                    price: Number.isFinite(price) ? price : null,
                    image: image || null,
                    runoutDate: runout.toISOString().slice(0, 10)
                });

                remainingDays += daysPerContainer;
            }
        });

        return events;
    };

    const buildWeeklySchedule = (items, startDate, { weeks = 4 } = {}) => {
        const base = new Date(startDate);
        base.setHours(0, 0, 0, 0);

        const firstSunday = new Date(base);
        const delta = (0 - firstSunday.getDay() + 7) % 7;
        firstSunday.setDate(firstSunday.getDate() + delta);

        const horizonDays = Math.max(7, weeks * 7);
        const runouts = predictRunouts(items, base, { horizonDays: horizonDays + 7 });

        const toDate = (iso) => {
            const d = new Date(String(iso || ''));
            if (Number.isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const buckets = Array.from({ length: weeks }, (_, idx) => {
            const buyDate = new Date(firstSunday);
            buyDate.setDate(buyDate.getDate() + idx * 7);

            const coverStart = new Date(buyDate);
            const coverEnd = new Date(buyDate);
            coverEnd.setDate(coverEnd.getDate() + 6);

            const inRange = runouts.filter((evt) => {
                const d = toDate(evt.runoutDate);
                if (!d) return false;
                return d >= coverStart && d <= coverEnd;
            });

            const aggregated = new Map();
            inRange.forEach((evt) => {
                const key = String(evt.name || '').trim() || 'Item';
                const existing = aggregated.get(key) || { name: key, qty: 0, price: evt.price, image: evt.image || null };
                existing.qty += Number(evt.qty || 1) || 1;
                if (!Number.isFinite(existing.price) && Number.isFinite(evt.price)) existing.price = evt.price;
                if (!existing.image && evt.image) existing.image = evt.image;
                aggregated.set(key, existing);
            });

            const list = Array.from(aggregated.values())
                .sort((a, b) => a.name.localeCompare(b.name));

            return {
                week: idx + 1,
                buyDate,
                coverStart,
                coverEnd,
                items: list
            };
        });

        return buckets;
    };

    const getWeeklyScheduleForPdf = () => {
        if (Array.isArray(cachedWeeklySchedule) && cachedWeeklySchedule.length) return cachedWeeklySchedule;
        const parsed = parsePlanItems();
        const items = Array.isArray(parsed?.items) ? parsed.items : [];
        if (!items.length) return null;
        const startDate = getStartDate();
        cachedWeeklySchedule = buildWeeklySchedule(items, startDate, { weeks: 4 });
        return cachedWeeklySchedule;
    };

    const buildNext7DayBuySchedule = (items, startDate) => {
        const horizonDays = 7;
        const days = Array.from({ length: horizonDays }, (_, i) => {
            const d = new Date(startDate);
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() + i);
            return d;
        });
        const events = days.map(() => []);
        const lowDaysThreshold = 2;

        items.forEach((item) => {
            const daysPerContainer = Number(item.daysPerContainer);
            const price = Number(item.price);
            if (!Number.isFinite(daysPerContainer) || daysPerContainer <= 0) return;

            let remainingDays = daysPerContainer;
            for (let i = 0; i < horizonDays; i += 1) {
                if (remainingDays <= lowDaysThreshold) {
                    const runout = new Date(days[i]);
                    runout.setDate(runout.getDate() + Math.max(0, Math.round(remainingDays)));
                    events[i].push({
                        name: item.name,
                        qty: 1,
                        price: Number.isFinite(price) ? price : null,
                        runoutDate: runout.toISOString().slice(0, 10)
                    });
                    remainingDays = daysPerContainer;
                }
                remainingDays -= 1;
            }
        });

        return days.map((date, idx) => ({
            date,
            items: events[idx] || []
        }));
    };

    const buildListSchedule = (items, startDate, { horizonDays = 28, maxDates = 5 } = {}) => {
        const days = Array.from({ length: horizonDays }, (_, i) => {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            return d;
        });
        const events = days.map(() => []);
        const lowDaysThreshold = 2;

        items.forEach((item) => {
            const daysPerContainer = Number(item.daysPerContainer);
            const price = Number(item.price);
            if (!Number.isFinite(daysPerContainer) || daysPerContainer <= 0) return;

            let remainingDays = daysPerContainer;
            for (let i = 0; i < horizonDays; i += 1) {
                if (remainingDays <= lowDaysThreshold) {
                    const runout = new Date(days[i]);
                    runout.setDate(runout.getDate() + Math.max(0, Math.round(remainingDays)));
                    events[i].push({
                        name: item.name,
                        qty: 1,
                        price: Number.isFinite(price) ? price : null,
                        runoutDate: runout.toISOString().slice(0, 10)
                    });
                    remainingDays = daysPerContainer;
                }
                remainingDays -= 1;
            }
        });

        const used = [];
        for (let i = 0; i < days.length; i += 1) {
            const dayEvents = events[i] || [];
            if (!dayEvents.length) continue;
            used.push({ date: days[i], items: dayEvents });
            if (used.length >= maxDates) break;
        }

        if (!used.length) {
            used.push({ date: days[0], items: [] });
        }

        return used;
    };

    const renderGroceryListView = ({ schedule, targetEl }) => {
        if (!targetEl) return;
        const fmtLong = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

        targetEl.innerHTML = schedule.map((bucket) => {
            const list = Array.isArray(bucket.items) ? bucket.items : [];
            const total = list.reduce((sum, row) => sum + (Number.isFinite(row.price) ? row.price * (Number(row.qty) || 1) : 0), 0);
            const sub = list.length
                ? `${list.length} item${list.length === 1 ? '' : 's'} · ≈ $${total.toFixed(0)}`
                : 'No restocks predicted (next 28 days)';

            return `
                <div class="overview-grocery-date">
                    <div class="overview-grocery-date-head">
                        <div class="overview-grocery-date-title">${fmtLong(bucket.date)}</div>
                        <div class="overview-grocery-date-right">${list.length ? `≈ $${total.toFixed(0)}` : ''}</div>
                    </div>
                    <div class="overview-grocery-date-sub ns-muted">${sub}</div>
                    <div class="overview-grocery-bullets">
                        ${list.length ? list.map((row) => {
                            const name = String(row?.name || 'Item').trim();
                            const qty = Number(row?.qty || 1) || 1;
                            const priceText = Number.isFinite(row?.price) ? `$${(row.price * qty).toFixed(2)}` : '$—';
                            const runout = String(row?.runoutDate || '');
                            const meta = `Buy ${qty}× · Runs out ~ ${runout || '—'}`;
                            return `
                                <div class="overview-grocery-bullet">
                                    <div class="overview-grocery-bullet-left">
                                        <div class="overview-grocery-bullet-name" title="${name}">${name}</div>
                                        <div class="overview-grocery-bullet-meta ns-muted">${meta}</div>
                                    </div>
                                    <div class="overview-grocery-bullet-right">${priceText}</div>
                                </div>
                            `;
                        }).join('') : `
                            <div class="overview-grocery-bullet">
                                <div class="overview-grocery-bullet-left">
                                    <div class="overview-grocery-bullet-name">All good.</div>
                                    <div class="overview-grocery-bullet-meta ns-muted">Your current containers should last beyond this window.</div>
                                </div>
                                <div class="overview-grocery-bullet-right"></div>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderGroceryWeeklyView = ({ schedule, targetEl }) => {
        if (!targetEl) return;
        const fmtLong = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const fmtShort = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const chunk = (arr, size) => {
            const out = [];
            for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
            return out;
        };

        targetEl.innerHTML = schedule.map((bucket) => {
            const list = Array.isArray(bucket.items) ? bucket.items : [];
            const total = list.reduce((sum, row) => sum + (Number.isFinite(row.price) ? row.price * (Number(row.qty) || 1) : 0), 0);
            const sub = list.length
                ? `Buy on ${fmtLong(bucket.buyDate)} · Covers ${fmtShort(bucket.coverStart)}–${fmtShort(bucket.coverEnd)} · ${list.length} item${list.length === 1 ? '' : 's'}`
                : `Buy on ${fmtLong(bucket.buyDate)} · Covers ${fmtShort(bucket.coverStart)}–${fmtShort(bucket.coverEnd)} · No predicted runouts`;

            const lines = list.length ? chunk(list, 6) : [];
            return `
                <div class="overview-grocery-date">
                    <div class="overview-grocery-date-head">
                        <div class="overview-grocery-date-title">Week ${bucket.week}</div>
                        <div class="overview-grocery-date-right">${list.length ? `≈ $${total.toFixed(0)}` : ''}</div>
                    </div>
                    <div class="overview-grocery-date-sub ns-muted">${sub}</div>
                    <div class="overview-grocery-bullets">
                        ${list.length ? lines.map((group) => {
                            const groupTotal = group.reduce((sum, row) => sum + (Number.isFinite(row.price) ? row.price * (Number(row.qty) || 1) : 0), 0);
                            const label = group.map((row) => {
                                const name = String(row?.name || 'Item').trim();
                                const qty = Number(row?.qty || 1) || 1;
                                return `${name} (${qty}×)`;
                            }).join(', ');
                            const meta = `${group.length} item${group.length === 1 ? '' : 's'}`;
                            return `
                                <div class="overview-grocery-bullet">
                                    <div class="overview-grocery-bullet-left">
                                        <div class="overview-grocery-bullet-name" title="${label}">${label}</div>
                                        <div class="overview-grocery-bullet-meta ns-muted">${meta}</div>
                                    </div>
                                    <div class="overview-grocery-bullet-right">${Number.isFinite(groupTotal) && groupTotal > 0 ? `≈ $${groupTotal.toFixed(0)}` : ''}</div>
                                </div>
                            `;
                        }).join('') : `
                            <div class="overview-grocery-bullet">
                                <div class="overview-grocery-bullet-left">
                                    <div class="overview-grocery-bullet-name">All good.</div>
                                    <div class="overview-grocery-bullet-meta ns-muted">Nothing is predicted to run out this week.</div>
                                </div>
                                <div class="overview-grocery-bullet-right"></div>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    };

    const exportLinesAsImage = async ({ lines, filenameBase, shareTitle }) => {
        const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        const bg = theme === 'light' ? '#ffffff' : '#0b0b0f';
        const ink = theme === 'light' ? '#121212' : '#f3f4f6';
        const muted = theme === 'light' ? 'rgba(0,0,0,0.58)' : 'rgba(255,255,255,0.70)';

        const width = 1080;
        const pad = 64;
        const lineH = 34;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.font = '28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        const wrap = (text, maxWidth) => {
            const words = String(text).split(' ');
            const out = [];
            let cur = '';
            for (let i = 0; i < words.length; i += 1) {
                const next = cur ? `${cur} ${words[i]}` : words[i];
                if (ctx.measureText(next).width <= maxWidth) cur = next;
                else {
                    if (cur) out.push(cur);
                    cur = words[i];
                }
            }
            if (cur) out.push(cur);
            return out;
        };

        const maxTextW = width - pad * 2;
        const wrapped = (Array.isArray(lines) ? lines : []).flatMap((l) => wrap(l, maxTextW));
        const height = Math.max(720, pad * 2 + wrapped.length * lineH + 60);

        canvas.width = width;
        canvas.height = height;

        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = ink;
        ctx.font = '44px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillText('odeology_', pad, pad);

        let y = pad + 56;
        ctx.font = '28px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        wrapped.forEach((l) => {
            const isHeader = l
                && !l.startsWith('  •')
                && !l.startsWith('Generated:')
                && !l.startsWith('Grocery List')
                && !l.startsWith('Weekly Grocery List')
                && !l.startsWith('');
            if (l.startsWith('Generated:')) ctx.fillStyle = muted;
            else if (l === 'Grocery List' || l === 'Weekly Grocery List') ctx.fillStyle = ink;
            else if (isHeader) ctx.fillStyle = ink;
            else ctx.fillStyle = muted;
            ctx.fillText(l, pad, y);
            y += lineH;
        });

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) return;
        const file = new File([blob], `${filenameBase || 'grocery-list'}-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
            await navigator.share({ files: [file], title: shareTitle || 'Grocery List' });
            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const exportScheduleAsImage = async ({ schedule }) => {
        const fmtHeader = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const lines = [];
        lines.push(`Grocery List`);
        lines.push(`Generated: ${new Date().toLocaleDateString()}`);
        lines.push('');

        schedule.forEach((bucket) => {
            lines.push(fmtHeader(bucket.date));
            const list = Array.isArray(bucket.items) ? bucket.items : [];
            if (!list.length) {
                lines.push('  • All good (no restocks predicted)');
                lines.push('');
                return;
            }
            list.forEach((row) => {
                const name = String(row?.name || 'Item').trim();
                const qty = Number(row?.qty || 1) || 1;
                const priceText = Number.isFinite(row?.price) ? `$${(row.price * qty).toFixed(2)}` : '$—';
                const runout = String(row?.runoutDate || '').trim() || '—';
                lines.push(`  • ${name} — ${qty}× — runs out ~ ${runout} — ${priceText}`);
            });
            lines.push('');
        });

        await exportLinesAsImage({ lines, filenameBase: 'grocery-list', shareTitle: 'Grocery List' });
    };

    const exportWeeklyScheduleAsImage = async ({ schedule }) => {
        const fmtHeader = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const fmtRange = (a, b) => `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}–${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

        const lines = [];
        lines.push('Weekly Grocery List');
        lines.push(`Generated: ${new Date().toLocaleDateString()}`);
        lines.push('');

        (Array.isArray(schedule) ? schedule : []).forEach((bucket, idx) => {
            const buyDate = bucket?.buyDate instanceof Date ? bucket.buyDate : null;
            const coverStart = bucket?.coverStart instanceof Date ? bucket.coverStart : null;
            const coverEnd = bucket?.coverEnd instanceof Date ? bucket.coverEnd : null;

            lines.push(buyDate ? `Week ${idx + 1} (buy ${fmtHeader(buyDate)})` : `Week ${idx + 1}`);
            if (coverStart && coverEnd) lines.push(`  Covers: ${fmtRange(coverStart, coverEnd)}`);

            const list = Array.isArray(bucket?.items) ? bucket.items : [];
            if (!list.length) {
                lines.push('  • All good (no restocks predicted)');
                lines.push('');
                return;
            }
            list.forEach((row) => {
                const name = String(row?.name || 'Item').trim();
                const qty = Number(row?.qty || 1) || 1;
                const priceText = Number.isFinite(row?.price) ? `$${(row.price * qty).toFixed(2)}` : '$—';
                lines.push(`  • ${name} — ${qty}× — ${priceText}`);
            });
            lines.push('');
        });

        await exportLinesAsImage({ lines, filenameBase: 'grocery-weekly-list', shareTitle: 'Weekly Grocery List' });
    };

    const printSchedule = ({ schedule }) => {
        const fmt = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const escaped = (s) => String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');

        const body = schedule.map((bucket) => {
            const list = Array.isArray(bucket.items) ? bucket.items : [];
            return `
                <section class="day">
                    <h2>${escaped(fmt(bucket.date))}</h2>
                    ${list.length ? `
                        <ul>
                            ${list.map((row) => {
                                const name = escaped(String(row?.name || 'Item').trim());
                                const qty = Number(row?.qty || 1) || 1;
                                const runout = escaped(String(row?.runoutDate || '—'));
                                const priceText = Number.isFinite(row?.price) ? `$${(row.price * qty).toFixed(2)}` : '—';
                                return `<li><span class="name">${name}</span><span class="meta">${qty}× · runs out ~ ${runout}</span><span class="price">${priceText}</span></li>`;
                            }).join('')}
                        </ul>
                    ` : `<div class="muted">All good (no restocks predicted)</div>`}
                </section>
            `;
        }).join('');

        const w = window.open('', '_blank');
        if (!w) return;
        try { w.opener = null; } catch {}
        w.document.open();
        w.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>Grocery List</title>
                <style>
                    :root { color-scheme: light; }
                    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; color: #111; }
                     h1 { margin: 0 0 6px; font-size: 22px; }
                     .muted { color: rgba(0,0,0,0.62); }
                     .header { margin-bottom: 16px; }
                     .actions { display:flex; gap:10px; align-items:center; justify-content: space-between; flex-wrap: wrap; margin: 12px 0 18px; }
                     .print-btn { appearance:none; border: 1px solid rgba(0,0,0,0.12); background: #111; color: #fff; padding: 10px 12px; border-radius: 12px; font-weight: 800; cursor: pointer; }
                     .print-btn:hover { opacity: 0.92; }
                     .day { margin: 14px 0 18px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.10); }
                     h2 { margin: 0 0 8px; font-size: 16px; }
                     ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
                     li { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.10); border-radius: 12px; }
                     .name { font-weight: 800; }
                     .meta { grid-column: 1 / -1; color: rgba(0,0,0,0.62); font-size: 12px; }
                     .price { font-weight: 800; white-space: nowrap; }
                     @media print { body { margin: 14mm; } a { color: inherit; text-decoration: none; } }
                 </style>
            </head>
            <body>
                <div class="header">
                    <h1>Grocery List</h1>
                    <div class="muted">Generated ${escaped(new Date().toLocaleDateString())}</div>
                </div>
                <div class="actions">
                    <button class="print-btn" type="button" onclick="window.print()">Print / Save as PDF</button>
                    <div class="muted">Tip: In the print dialog choose “Save as PDF”.</div>
                </div>
                ${body}
                <script>
                    window.addEventListener('load', () => {
                        try {
                            window.focus();
                            setTimeout(() => { try { window.print(); } catch (e) {} }, 80);
                        } catch (e) {}
                    });
                </script>
            </body>
            </html>
        `);
        w.document.close();
        try { w.focus(); } catch {}
        try { w.print(); } catch {}
    };

    const printWeeklySchedule = ({ schedule }) => {
        const fmt = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const fmtRange = (a, b) => `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}–${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        const escaped = (s) => String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');

        const body = (Array.isArray(schedule) ? schedule : []).map((bucket, idx) => {
            const list = Array.isArray(bucket?.items) ? bucket.items : [];
            const buyDate = bucket?.buyDate instanceof Date ? bucket.buyDate : null;
            const coverStart = bucket?.coverStart instanceof Date ? bucket.coverStart : null;
            const coverEnd = bucket?.coverEnd instanceof Date ? bucket.coverEnd : null;
            const sub = coverStart && coverEnd ? `Covers ${fmtRange(coverStart, coverEnd)}` : '';
            const total = list.reduce((sum, row) => {
                const qty = Number(row?.qty || 1) || 1;
                const price = Number(row?.price);
                if (!Number.isFinite(price)) return sum;
                return sum + price * qty;
            }, 0);
            const totalText = Number.isFinite(total) && total > 0 ? ` • Est. $${total.toFixed(2)}` : '';
            return `
                <section class="day">
                    <h2>Week ${idx + 1}${buyDate ? ` — buy ${escaped(fmt(buyDate))}` : ''}${totalText}</h2>
                    ${sub ? `<div class="muted">${escaped(sub)}</div>` : ''}
                    ${list.length ? `
                        <ul>
                            ${list.map((row) => {
                                                                const name = escaped(String(row?.name || 'Item').trim());
                                const qty = Number(row?.qty || 1) || 1;
                                const priceText = Number.isFinite(row?.price) ? `$${(row.price * qty).toFixed(2)}` : '—';
                                const img = String(row?.image || '').trim();
                                return `<li>
                                    <span class="thumb">${img ? `<img src="${escaped(img)}" alt="">` : ''}</span>
                                    <span class="name">${name}</span>
                                    <span class="meta">${qty}×</span>
                                    <span class="price">${priceText}</span>
                                </li>`;
                            }).join('')}
                        </ul>
                    ` : `<div class="muted">All good (no restocks predicted)</div>`}
                </section>
            `;
        }).join('');

        const w = window.open('', '_blank');
        if (!w) return;
        try { w.opener = null; } catch {}
        w.document.open();
        w.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>Weekly Grocery List</title>
                <style>
                    :root { color-scheme: light; }
                    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; color: #111; }
                     h1 { margin: 0 0 6px; font-size: 22px; }
                     .muted { color: rgba(0,0,0,0.62); }
                     .header { margin-bottom: 16px; }
                     .actions { display:flex; gap:10px; align-items:center; justify-content: space-between; flex-wrap: wrap; margin: 12px 0 18px; }
                     .print-btn { appearance:none; border: 1px solid rgba(0,0,0,0.12); background: #111; color: #fff; padding: 10px 12px; border-radius: 12px; font-weight: 800; cursor: pointer; }
                     .print-btn:hover { opacity: 0.92; }
                     .day { margin: 14px 0 18px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.10); }
                     h2 { margin: 0 0 8px; font-size: 16px; }
                     ul { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 8px; }
                     li { display: grid; grid-template-columns: 52px 1fr auto auto; gap: 6px 12px; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.10); border-radius: 12px; align-items: center; }
                     .thumb { width: 44px; height: 44px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.12); overflow: hidden; background: #f2f2f2; display: grid; place-items: center; }
                     .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
                     .name { font-weight: 800; }
                     .meta { color: rgba(0,0,0,0.62); font-size: 12px; white-space: nowrap; }
                     .price { font-weight: 800; white-space: nowrap; }
                     @media print { body { margin: 14mm; } a { color: inherit; text-decoration: none; } }
                 </style>
            </head>
            <body>
                <div class="header">
                    <h1>Weekly Grocery List</h1>
                    <div class="muted">Generated ${escaped(new Date().toLocaleDateString())}</div>
                </div>
                <div class="actions">
                    <button class="print-btn" type="button" onclick="window.print()">Print / Save as PDF</button>
                    <div class="muted">Tip: In the print dialog choose “Save as PDF”.</div>
                </div>
                ${body}
                <script>
                    window.addEventListener('load', () => {
                        try {
                            window.focus();
                            setTimeout(() => { try { window.print(); } catch (e) {} }, 80);
                        } catch (e) {}
                    });
                </script>
            </body>
            </html>
        `);
        w.document.close();
        try { w.focus(); } catch {}
        try { w.print(); } catch {}
    };

    const printCombinedGroceryMeals = ({ schedule, meals }) => {
        const safeSchedule = Array.isArray(schedule) ? schedule : [];
        const safeMeals = Array.isArray(meals) ? meals : [];
        const normalize = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

        const groceryCards = Array.from(document.querySelectorAll('#grocery-list-items .grocery-card'));
        const groceryItemsFromCards = groceryCards.map((card) => {
            const name = String(card.querySelector('.grocery-card-title')?.textContent || '').trim();
            const image = String(card.querySelector('.grocery-card-image img')?.getAttribute('src') || '').trim();
            const rows = Array.from(card.querySelectorAll('.detail-row'));
            const read = (label) => {
                const row = rows.find((r) => String(r.querySelector('.detail-label')?.textContent || '').trim().toLowerCase() === label);
                return String(row?.querySelector('.detail-value')?.textContent || '').trim();
            };
            return {
                name,
                image,
                qty: read('qty'),
                category: read('category'),
                daily: read('daily use'),
                price: read('price')
            };
        }).filter((it) => it.name);

        const groceryItems = groceryItemsFromCards.length
            ? groceryItemsFromCards
            : safeSchedule.flatMap((bucket) => (Array.isArray(bucket?.items) ? bucket.items : []).map((row) => {
                const qty = Number(row?.qty || 1) || 1;
                const price = Number(row?.price);
                return {
                    name: String(row?.name || 'Item').trim(),
                    image: String(row?.image || '').trim(),
                    qty: `${qty}x`,
                    category: '',
                    daily: '',
                    price: Number.isFinite(price) ? `$${(price * qty).toFixed(2)}` : ''
                };
            }));

        const imageByName = new Map();
        groceryItems.forEach((it) => {
            const key = normalize(it.name);
            if (!key) return;
                if (!imageByName.has(key) && it.image) imageByName.set(key, it.image);
        });

        const parsed = parsePlanItems();
        const weekItems = Array.isArray(parsed?.items) ? parsed.items : [];
        const weekSchedule = buildNext7DayBuySchedule(weekItems, getStartDate());

        const resolveMealImage = (foodName) => {
            const key = normalize(foodName);
            if (!key) return '';
            if (imageByName.has(key)) return imageByName.get(key);
            for (const [nameKey, src] of imageByName.entries()) {
                if (nameKey.includes(key) || key.includes(nameKey)) return src;
            }
            return '';
        };

        const aggregated7Day = (() => {
            const map = new Map();
            weekSchedule.forEach((day) => {
                const rows = Array.isArray(day?.items) ? day.items : [];
                rows.forEach((it) => {
                    const key = normalize(it?.name || 'item');
                    if (!key) return;
                    const existing = map.get(key) || {
                        name: String(it?.name || 'Item'),
                        qty: 0,
                        price: null,
                        earliestRunout: null
                    };
                    const qty = Number(it?.qty || 1) || 1;
                    existing.qty += qty;
                    if (!Number.isFinite(existing.price) && Number.isFinite(it?.price)) {
                        existing.price = Number(it.price);
                    }
                    const runout = String(it?.runoutDate || '');
                    if (runout) {
                        if (!existing.earliestRunout || runout < existing.earliestRunout) {
                            existing.earliestRunout = runout;
                        }
                    }
                    map.set(key, existing);
                });
            });
            return Array.from(map.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        })();

        const avgWeeklyList = (() => {
            if (safeSchedule.length) {
                const weeks = safeSchedule.length;
                const map = new Map();
                safeSchedule.forEach((bucket) => {
                    const rows = Array.isArray(bucket?.items) ? bucket.items : [];
                    rows.forEach((it) => {
                        const key = normalize(it?.name || 'item');
                        if (!key) return;
                        const existing = map.get(key) || {
                            name: String(it?.name || 'Item'),
                            totalQty: 0,
                            price: null,
                            image: ''
                        };
                        existing.totalQty += Number(it?.qty || 1) || 1;
                        if (!Number.isFinite(existing.price) && Number.isFinite(it?.price)) {
                            existing.price = Number(it.price);
                        }
                        if (!existing.image && it?.image) existing.image = String(it.image);
                        map.set(key, existing);
                    });
                });
                return Array.from(map.values())
                    .map((it) => ({
                        name: it.name,
                        qty: Math.max(1, Math.round(it.totalQty / Math.max(1, weeks))),
                        price: it.price,
                        image: it.image
                    }))
                    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            }

            if (groceryItems.length) {
                return groceryItems.map((it) => ({
                    name: String(it?.name || 'Item'),
                    qty: 1,
                    price: Number.isFinite(parseFloat(String(it?.price || '').replace(/[^0-9.]/g, '')))
                        ? parseFloat(String(it.price).replace(/[^0-9.]/g, ''))
                        : null,
                    image: String(it?.image || '')
                }));
            }

            return [];
        })();

        const groceryBody = aggregated7Day.length ? `
            <section class="print-section">
                <div class="muted">Items projected to run out in the next 7 days.</div>
                <ul class="print-list">
                    ${aggregated7Day.map((it) => {
                        const runoutLabel = it?.earliestRunout
                            ? new Date(it.earliestRunout).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            : '';
                        const thumb = resolveMealImage(it?.name || '');
                        return `
                            <li class="print-list-card">
                                <span class="thumb">${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : ''}</span>
                                <span>
                                    <strong>${escapeHtml(String(it?.name || 'Item'))}</strong>
                                    <span class="meta-line">${escapeHtml(`Buy ${it.qty}x | Runs out soon: ${runoutLabel || '-'}`)}</span>
                                </span>
                                <span class="price">${Number.isFinite(it?.price) ? `$${(Number(it.price) * Number(it.qty || 1)).toFixed(2)}` : ''}</span>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </section>
        ` : (avgWeeklyList.length ? `
            <section class="print-section">
                <div class="muted">No urgent buys in the next 7 days. Average weekly grocery list:</div>
                <ul class="print-list">
                    ${avgWeeklyList.map((it) => {
                        const thumb = it?.image ? String(it.image) : resolveMealImage(it?.name || '');
                        return `
                            <li class="print-list-card">
                                <span class="thumb">${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : ''}</span>
                                <span>
                                    <strong>${escapeHtml(String(it?.name || 'Item'))}</strong>
                                    <span class="meta-line">${escapeHtml(`Avg weekly qty: ${Number(it?.qty || 1)}x`)}</span>
                                </span>
                                <span class="price">${Number.isFinite(it?.price) ? `$${(Number(it.price) * Number(it?.qty || 1)).toFixed(2)}` : ''}</span>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </section>
        ` : '<div class="muted">No grocery list available.</div>');

        const mealsBody = safeMeals.map((meal) => {
            const items = Array.isArray(meal?.items) ? meal.items : [];
            return `
                <section class="print-section">
                    <h3>${escapeHtml(String(meal?.title || 'Meal'))}</h3>
                    ${meal?.totals ? `<div class="muted">${escapeHtml(String(meal.totals))}</div>` : ''}
                    ${items.length ? `
                        <ul class="print-list">
                            ${items.map((it) => {
                                const name = String(it?.name || 'Food');
                                const src = resolveMealImage(name);
                                return `<li class="print-list-card">
                                    <span class="thumb">${src ? `<img src="${escapeHtml(src)}" alt="">` : ''}</span>
                                    <span>
                                        <strong>${escapeHtml(name)}</strong>
                                        <span class="meta-line">${escapeHtml([String(it?.measurement || '').trim(), String(it?.macros || '').trim()].filter(Boolean).join(' | '))}</span>
                                    </span>
                                    <span></span>
                                </li>`;
                            }).join('')}
                        </ul>
                    ` : '<div class="muted">No meal items.</div>'}
                </section>
            `;
        }).join('');

        const w = window.open('', '_blank');
        if (!w) return;
        try { w.opener = null; } catch {}
        w.document.open();
        w.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>Grocery and Meals</title>
                <style>
                    :root { color-scheme: light; }
                    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; color: #111; }
                    h1 { margin: 0 0 8px; font-size: 24px; }
                    h2 { margin: 22px 0 10px; font-size: 18px; }
                    h3 { margin: 0 0 6px; font-size: 15px; }
                    .muted { color: rgba(0,0,0,0.62); }
                    .actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 12px 0 16px; flex-wrap: wrap; }
                    .print-btn { appearance: none; border: 1px solid rgba(0,0,0,0.12); background: #111; color: #fff; padding: 10px 12px; border-radius: 12px; font-weight: 800; cursor: pointer; }
                    .print-section { margin: 12px 0; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.10); }
                    .print-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
                    .print-list-card { display: grid; grid-template-columns: 52px 1fr auto; gap: 10px; border: 1px solid rgba(0,0,0,0.10); border-radius: 10px; padding: 8px 10px; align-items: center; }
                    .thumb { width: 44px; height: 44px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.12); overflow: hidden; background: #f3f3f3; display: grid; place-items: center; }
                    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
                    .meta-line { display: block; color: rgba(0,0,0,0.62); font-size: 12px; margin-top: 3px; }
                    .page-break { break-before: page; page-break-before: always; }
                    @media print { body { margin: 14mm; } .actions { display: none; } }
                </style>
            </head>
            <body>
                <h1>Grocery and Meals</h1>
                <div class="muted">Generated ${escapeHtml(new Date().toLocaleDateString())}</div>
                <div class="actions">
                    <button class="print-btn" type="button" onclick="window.print()">Print / Save as PDF</button>
                    <div class="muted">Page 1: next 7-day grocery list. Page 2: meals with images.</div>
                </div>
                <h2>Weekly Grocery List (Next 7 Days)</h2>
                ${groceryBody}
                <div class="page-break"></div>
                <h2>Meals</h2>
                ${mealsBody || '<div class="muted">No meals available.</div>'}
                <script>
                    window.addEventListener('load', () => {
                        try {
                            window.focus();
                            setTimeout(() => { try { window.print(); } catch (e) {} }, 80);
                        } catch (e) {}
                    });
                </script>
            </body>
            </html>
        `);
        w.document.close();
        try { w.focus(); } catch {}
        try { w.print(); } catch {}
    };

    const initGroceryViewToggle = ({ items, startDate, unit }) => {
        const toolbar = $('#overview-grocery-toolbar');
        const cardsView = $('#overview-grocery-view-cards');
        const listView = $('#overview-grocery-view-list');
        const listTarget = $('#overview-grocery-listview');
        const weeklyView = $('#overview-grocery-view-weekly');
        const weeklyTarget = $('#overview-grocery-weeklyview');
        const hintEl = $('#overview-grocery-toggle-hint');
        const exportBtn = $('#overview-grocery-export');
        const exportWeeklyBtn = $('#overview-grocery-export-weekly');
        const printBtn = $('#overview-grocery-print');
        const pdfBtn = $('#overview-grocery-pdf-phone');
        if (!toolbar || !cardsView || !listView || !weeklyView) return;

        try {
            localStorage.setItem('ode_grocery_calendar_items_v1', JSON.stringify({
                items: Array.isArray(items) ? items : [],
                unit: unit || null,
                startDate: startDate ? new Date(startDate).toISOString().slice(0, 10) : null,
                savedAt: new Date().toISOString()
            }));
        } catch {
            // ignore
        }

        const buttons = Array.from(toolbar.querySelectorAll('[data-grocery-view]'));
        const key = 'ode_overview_grocery_view_v1';
        const saved = (() => {
            try { return localStorage.getItem(key); } catch { return null; }
        })();

        let scheduleCache = null;
        let weeklyCache = null;
        let activeView = 'cards';

        const mql = window.matchMedia('(max-width: 700px)');
        const isPhone = () => !!mql.matches;

        const forceCardsForPhone = () => {
            activeView = 'cards';
            cardsView.classList.remove('hidden');
            listView.classList.add('hidden');
            weeklyView.classList.add('hidden');
            buttons.forEach((b) => {
                const on = b.getAttribute('data-grocery-view') === 'cards';
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            if (printBtn) printBtn.classList.add('hidden');
            exportBtn?.classList.add('hidden');
            exportWeeklyBtn?.classList.add('hidden');
            if (hintEl) hintEl.textContent = 'Grocery Cards: Quick view of items and restock timing.';
        };

        const setView = (view) => {
            const v = view === 'list' || view === 'weekly' || view === 'cards' ? view : 'cards';
            const next = isPhone() ? 'cards' : v;
            activeView = next;
            try { localStorage.setItem(key, v); } catch {}

            buttons.forEach((b) => {
                const on = b.getAttribute('data-grocery-view') === next;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });

            cardsView.classList.toggle('hidden', next !== 'cards');
            listView.classList.toggle('hidden', next !== 'list');
            weeklyView.classList.toggle('hidden', next !== 'weekly');
            if (printBtn) printBtn.classList.toggle('hidden', !(next === 'list' || next === 'weekly'));
            exportBtn?.classList.toggle('hidden', next !== 'list');
            exportWeeklyBtn?.classList.toggle('hidden', next !== 'weekly');
            if (hintEl) {
                hintEl.textContent = next === 'weekly'
                    ? 'Weekly Buy List: For those who buy groceries once per week (Sunday plan).'
                    : (next === 'list'
                        ? 'Daily Buy List: For those who buy groceries when they run out.'
                        : 'Grocery Cards: Quick view of items and restock timing.');
            }

            if (next === 'list') {
                if (!scheduleCache) scheduleCache = buildListSchedule(items, startDate, { horizonDays: 28, maxDates: 5 });
                renderGroceryListView({ schedule: scheduleCache, targetEl: listTarget });
            }
            if (next === 'weekly') {
                if (!weeklyCache) weeklyCache = buildWeeklySchedule(items, startDate, { weeks: 4 });
                cachedWeeklySchedule = weeklyCache;
                renderGroceryWeeklyView({ schedule: weeklyCache, targetEl: weeklyTarget });
            }
        };

        buttons.forEach((b) => {
            b.addEventListener('click', () => setView(b.getAttribute('data-grocery-view')));
        });

        exportBtn?.addEventListener('click', async () => {
            if (!scheduleCache) scheduleCache = buildListSchedule(items, startDate, { horizonDays: 28, maxDates: 5 });
            try {
                await exportScheduleAsImage({ schedule: scheduleCache });
            } catch {
                // ignore
            }
        });

        exportWeeklyBtn?.addEventListener('click', async () => {
            if (!weeklyCache) weeklyCache = buildWeeklySchedule(items, startDate, { weeks: 4 });
            cachedWeeklySchedule = weeklyCache;
            try {
                await exportWeeklyScheduleAsImage({ schedule: weeklyCache });
            } catch {
                // ignore
            }
        });

        printBtn?.addEventListener('click', () => {
            if (activeView === 'weekly') {
                if (!weeklyCache) weeklyCache = buildWeeklySchedule(items, startDate, { weeks: 4 });
                cachedWeeklySchedule = weeklyCache;
                try { printWeeklySchedule({ schedule: weeklyCache }); } catch {}
                return;
            }
            if (!scheduleCache) scheduleCache = buildListSchedule(items, startDate, { horizonDays: 28, maxDates: 5 });
            try { printSchedule({ schedule: scheduleCache }); } catch {}
        });

        pdfBtn?.addEventListener('click', () => {
            const schedule = getWeeklyScheduleForPdf();
            if (!schedule) return;
            try { printWeeklySchedule({ schedule }); } catch {}
        });

        setView(saved || 'cards');
        if (isPhone()) forceCardsForPhone();

        mql.addEventListener('change', () => {
            if (isPhone()) {
                forceCardsForPhone();
                return;
            }
            setView(saved || 'cards');
        });
    };

    const initMealsViewToggle = () => {
        const toolbar = $('#overview-meals-toolbar');
        const summary = $('#overview-meals-summary');
        const details = $('#overview-meals-details');
        const pdfBtn = $('#overview-meals-pdf');
        if (!toolbar || !summary || !details) return;

        const buttons = Array.from(toolbar.querySelectorAll('[data-meals-view]'));
        if (!buttons.length) return;

        const setView = (view) => {
            const v = view === 'cards' ? 'cards' : 'list';
            buttons.forEach((b) => {
                const on = b.getAttribute('data-meals-view') === v;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });

            if (v === 'cards') {
                syncMealCardsWithProfileGroceries();
                summary.classList.add('hidden');
                details.classList.remove('hidden');
                $('#overview-meals-head')?.setAttribute('aria-expanded', 'true');
            } else {
                renderDetailedMealsBreakdown(summary);
                summary.classList.remove('hidden');
                details.classList.add('hidden');
                $('#overview-meals-head')?.setAttribute('aria-expanded', 'false');
            }
        };

        buttons.forEach((b) => {
            b.addEventListener('click', () => setView(b.getAttribute('data-meals-view')));
        });

        pdfBtn?.addEventListener('click', () => {
            const schedule = getWeeklyScheduleForPdf();
            const meals = getMealsForOverview();
            if (!schedule && !meals.length) return;
            try { printCombinedGroceryMeals({ schedule, meals }); } catch {}
        });

        setView('cards');
    };

    const renderSummaryList = (targetEl, rows) => {
        if (!targetEl) return;
        targetEl.innerHTML = rows.map(row => `
            <div class="overview-summary-item">
                <div class="overview-summary-left">
                    <div class="overview-summary-title">${row.title}</div>
                    ${row.sub ? `<div class="overview-summary-sub">${row.sub}</div>` : ''}
                </div>
                ${row.right ? `<div class="overview-summary-right">${row.right}</div>` : ''}
            </div>
        `).join('');
    };

    const buildGrocerySummary = ({ items, unit }) => {
        const top = items
            .slice()
            .sort((a, b) => {
                const pa = Number(a.price);
                const pb = Number(b.price);
                const aa = Number.isFinite(pa) ? pa : -1;
                const bb = Number.isFinite(pb) ? pb : -1;
                return bb - aa;
            })
            .slice(0, 3);

        const rows = top.map(item => {
            const daily = Number(item.daily);
            const days = Number(item.daysPerContainer);
            const dailyText = Number.isFinite(daily) ? `Daily: ${daily.toFixed(2)} ${unit || 'units'}` : 'Daily: —';
            const daysText = Number.isFinite(days) ? `Restock every ~${Math.max(1, Math.round(days))} days` : 'Restock: —';
            const right = Number.isFinite(Number(item.price)) ? `$${Number(item.price).toFixed(0)}` : '';
            return {
                title: item.name,
                sub: `${dailyText} · ${daysText}`,
                right
            };
        });

        if (items.length > 3) {
            rows.push({
                title: `+${items.length - 3} more items`,
                sub: 'Expand to see everything',
                right: '▼'
            });
        }
        if (!rows.length) {
            rows.push({
                title: 'No items yet',
                sub: 'Build a grocery plan to populate this overview.',
                right: ''
            });
        }
        return rows;
    };

    const buildMealsSummary = () => {
        const mealBlocks = $$('.meal-block');
        if (!mealBlocks.length) {
            const readSnapshot = () => {
                try {
                    const raw = localStorage.getItem('ode_meal_plan_snapshot_v1');
                    const snap = raw ? JSON.parse(raw) : null;
                    const meals = Array.isArray(snap?.meals) ? snap.meals : [];
                    return meals;
                } catch {
                    return [];
                }
            };

            const snapMeals = readSnapshot();
            if (!snapMeals.length) {
                return [{
                    title: 'No meals yet',
                    sub: 'Build a grocery plan to generate meals.',
                    right: ''
                }];
            }

            const projected = snapMeals.slice(0, 4).map((meal, idx) => {
                const title = `Meal ${Number(meal?.index) || (idx + 1)}`;
                const items = Array.isArray(meal?.items) ? meal.items.slice(0, 2) : [];
                const sub = items.length
                    ? items.map((it) => String(it?.foodName || '').trim()).filter(Boolean).join(' · ')
                    : 'Projected foods';
                return { title, sub, right: '' };
            });

            return projected;
        }

        const take = mealBlocks.slice(0, 2);
        const rows = take.map(block => {
            const title = ($('.meal-title', block)?.textContent || 'Meal').trim();
            const items = $$('.meal-item-name', block)
                .slice(0, 2)
                .map(el => String(el.textContent || '').replace(/^[•\s]+/, '').trim())
                .filter(Boolean);
            const sub = items.length ? items.join(' · ') : '—';
            return { title, sub, right: '' };
        });

        if (mealBlocks.length > 2) {
            rows.push({
                title: `+${mealBlocks.length - 2} more meals`,
                sub: 'Expand to see full meal breakdowns',
                right: '▼'
            });
        }
        return rows;
    };

    const escapeHtml = (s) => String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const getMealsForOverview = () => {
        const mealBlocks = $$('.meal-block');
        if (mealBlocks.length) {
            return mealBlocks.map((block, idx) => {
                const title = ($('.meal-title', block)?.textContent || `Meal ${idx + 1}`).trim();
                const totals = ($('.meal-summary', block)?.textContent || '').trim();
                const items = $$('.meal-item', block).map((row) => ({
                    name: String($('.meal-item-name', row)?.textContent || '').replace(/^[^A-Za-z0-9]+/, '').trim(),
                    measurement: String($('.meal-item-measurement', row)?.textContent || '').trim(),
                    macros: String($('.meal-item-macros', row)?.textContent || '').trim()
                })).filter((it) => it.name);
                return { title, totals, items };
            }).filter((meal) => meal.title);
        }

        try {
            const raw = localStorage.getItem('ode_meal_plan_snapshot_v1');
            const snap = raw ? JSON.parse(raw) : null;
            const meals = Array.isArray(snap?.meals) ? snap.meals : [];
            return meals.map((meal, idx) => {
                const title = `Meal ${Number(meal?.index) || (idx + 1)}`;
                const items = Array.isArray(meal?.items) ? meal.items.map((it) => {
                    const p = Number(it?.protein_g);
                    const c = Number(it?.carbs_g);
                    const f = Number(it?.fat_g);
                    const macroBits = [];
                    if (Number.isFinite(p)) macroBits.push(`${p}g P`);
                    if (Number.isFinite(c)) macroBits.push(`${c}g C`);
                    if (Number.isFinite(f)) macroBits.push(`${f}g F`);
                    return {
                        name: String(it?.foodName || '').trim(),
                        measurement: String(it?.measurementText || '').trim(),
                        macros: macroBits.join(' | ')
                    };
                }).filter((it) => it.name) : [];
                return { title, totals: '', items };
            }).filter((meal) => meal.title);
        } catch {
            return [];
        }
    };

    const renderDetailedMealsBreakdown = (targetEl) => {
        if (!targetEl) return;
        const meals = getMealsForOverview();
        if (!meals.length) {
            targetEl.innerHTML = `
                <div class="overview-summary-item">
                    <div class="overview-summary-left">
                        <div class="overview-summary-title">No meals yet</div>
                        <div class="overview-summary-sub">Build a grocery plan to generate meals.</div>
                    </div>
                </div>
            `;
            return;
        }

        targetEl.innerHTML = meals.map((meal) => {
            const items = Array.isArray(meal?.items) ? meal.items : [];
            const list = items.length
                ? `
                    <div class="overview-meal-detail-items">
                        ${items.map((it) => `
                            <div class="overview-meal-detail-row">
                                <div class="overview-meal-detail-food">${escapeHtml(it.name)}</div>
                                <div class="overview-meal-detail-meta">
                                    ${it.measurement ? `<span>${escapeHtml(it.measurement)}</span>` : ''}
                                    ${it.macros ? `<span>${escapeHtml(it.macros)}</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `
                : `<div class="overview-summary-sub">No meal items yet.</div>`;
            return `
                <div class="overview-summary-item overview-meal-detail">
                    <div class="overview-summary-left">
                        <div class="overview-summary-title">${escapeHtml(meal.title)}</div>
                        ${meal.totals ? `<div class="overview-summary-sub">${escapeHtml(meal.totals)}</div>` : ''}
                        ${list}
                    </div>
                </div>
            `;
        }).join('');
    };

    const syncMealCardsWithProfileGroceries = () => {
        const mealGrid = $('#meal-grid');
        if (!mealGrid) return;

        const applyMealFallbackViewportLimit = () => {
            const fallbackGrid = mealGrid.querySelector('.grocery-items-grid[data-source="profile-grocery"]');
            if (!fallbackGrid) return;

            const isPhone = window.matchMedia('(max-width: 700px)').matches;
            if (!isPhone) {
                fallbackGrid.style.maxHeight = '';
                return;
            }

            const cards = Array.from(fallbackGrid.querySelectorAll('.grocery-card'));
            if (cards.length <= 2) {
                fallbackGrid.style.maxHeight = '';
                return;
            }

            const firstRowTop = Math.round(cards[0].offsetTop);
            const firstRowCards = cards.filter((card) => Math.round(card.offsetTop) === firstRowTop);
            const firstRowBottom = firstRowCards.reduce((max, card) => Math.max(max, card.offsetTop + card.offsetHeight), 0);
            if (!firstRowBottom) return;

            fallbackGrid.style.maxHeight = `${Math.ceil(firstRowBottom)}px`;
        };

        const hasMealCards = !!mealGrid.querySelector('.meal-block, .meal-blocks');
        if (hasMealCards) return;

        const escape = (s) => String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        let items = Array.isArray(cachedProfileGroceryItems) ? cachedProfileGroceryItems.slice() : [];

        if (!items.length) {
            const sourceCards = Array.from(document.querySelectorAll('#grocery-list-items .grocery-card'));
            items = sourceCards.map((card) => {
                const rowMap = {};
                Array.from(card.querySelectorAll('.detail-row')).forEach((row) => {
                    const k = (row.querySelector('.detail-label')?.textContent || '').trim().toLowerCase();
                    const v = (row.querySelector('.detail-value')?.textContent || '').trim();
                    if (k) rowMap[k] = v;
                });
                return {
                    name: (card.querySelector('.grocery-card-title')?.textContent || '').trim(),
                    quantity: rowMap.qty || '',
                    category: rowMap.category || '',
                    image: card.querySelector('.grocery-card-image img')?.getAttribute('src') || '',
                    url: card.querySelector('.grocery-card-link')?.getAttribute('href') || '',
                    dailyText: rowMap['daily use'] || '',
                    priceText: rowMap.price || '',
                    daysText: (card.querySelector('.duration-text strong')?.textContent || '').trim() || 'N/A'
                };
            }).filter((x) => x.name);
        }

        if (!items.length) return;

        const gridHtml = items.map((it) => {
            const name = String(it?.name || '').trim() || 'Item';
            const quantity = String(it?.quantity || '').trim() || '—';
            const category = String(it?.category || '').trim() || 'Misc';
            const img = String(it?.image || '').trim();
            const url = String(it?.url || '').trim();
            const dailyNum = Number(it?.daily);
            const dailyUnit = String(it?.unit || '').trim() || 'servings';
            const dailyText = String(it?.dailyText || '').trim() || (Number.isFinite(dailyNum) ? `${dailyNum.toFixed(2)} ${dailyUnit}` : `— ${dailyUnit}`);
            const daysNum = Number(it?.daysPerContainer);
            const daysText = String(it?.daysText || '').trim() || (Number.isFinite(daysNum) ? `${Math.round(daysNum)} days` : 'N/A');
            const priceNum = Number(it?.containerPrice);
            const priceText = String(it?.priceText || '').trim() || (Number.isFinite(priceNum) ? `$${priceNum.toFixed(2)}` : '—');
            const footerNum = Number(it?.estimatedWeeklyCost ?? it?.estimatedCost);
            const footerText = Number.isFinite(footerNum) ? `$${footerNum.toFixed(2)} est` : '';

            return `
                <div class="grocery-card" data-query="${escape(name.toLowerCase())}">
                    <div class="grocery-card-image ${img ? '' : 'no-image'}">
                        ${img ? `<img src="${escape(img)}" alt="${escape(name)}" onerror="this.style.display='none'; this.parentElement.classList.add('no-image');">` : ''}
                        ${url ? `
                            <a href="${escape(url)}" target="_blank" class="grocery-card-link" rel="noopener" title="View item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </a>
                        ` : ''}
                    </div>
                    <div class="grocery-card-body">
                        <h4 class="grocery-card-title">${escape(name)}</h4>
                        <div class="grocery-card-duration">
                            <span class="duration-icon">⏱</span>
                            <span class="duration-text">Container lasts <strong>${escape(daysText)}</strong></span>
                        </div>
                        <div class="grocery-card-details">
                            <div class="detail-row">
                                <span class="detail-label">Qty</span>
                                <span class="detail-value">${escape(quantity)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Category</span>
                                <span class="detail-value">${escape(category)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Daily use</span>
                                <span class="detail-value">${escape(dailyText)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Price</span>
                                <span class="detail-value">${escape(priceText)}</span>
                            </div>
                        </div>
                        <div class="grocery-card-footer">
                            <span class="container-price">${escape(footerText)}</span>
                            <label class="grocery-check-modern">
                                <input type="checkbox" class="grocery-check-input" data-query="${escape(name.toLowerCase())}">
                                <span class="checkmark"></span>
                            </label>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        mealGrid.innerHTML = `<div class="grocery-items-grid" data-source="profile-grocery">${gridHtml}</div>`;
        const cloneGrid = mealGrid.querySelector('.grocery-items-grid[data-source="profile-grocery"]');
        if (!cloneGrid) return;

        applyMealFallbackViewportLimit();
        requestAnimationFrame(applyMealFallbackViewportLimit);
        setTimeout(applyMealFallbackViewportLimit, 120);
        Array.from(cloneGrid.querySelectorAll('img')).forEach((img) => {
            img.addEventListener('load', applyMealFallbackViewportLimit, { once: true });
            img.addEventListener('error', applyMealFallbackViewportLimit, { once: true });
        });

        if (!mealFallbackResizeBound) {
            mealFallbackResizeBound = true;
            window.addEventListener('resize', applyMealFallbackViewportLimit, { passive: true });
        }
    };

    const buildTrackerSummary = ({ days, events }) => {
        const total = (events || []).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
        const daysWithRestock = (events || []).reduce((sum, list) => sum + ((list || []).length ? 1 : 0), 0);
        const nextIdx = (events || []).findIndex(list => (list || []).length);
        const nextText = nextIdx >= 0 ? `Day ${nextIdx + 1}` : '—';

        const rows = [];
        rows.push({
            title: nextIdx >= 0 ? `Next restock: Day ${nextIdx + 1}` : 'Next restock: —',
            sub: nextIdx >= 0 && days?.[nextIdx]
                ? days[nextIdx].toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                : 'No restocks in the next 7 days.',
            right: nextIdx >= 0 ? `${total} total` : ''
        });

        if (nextIdx >= 0) {
            const first = (events[nextIdx] || [])[0];
            const when = days?.[nextIdx] ? days[nextIdx].toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
            rows.push({
                title: first?.name ? `Buy: ${first.name}` : 'Buy: —',
                sub: when ? `On ${when}` : '—',
                right: ''
            });
        } else {
            rows.push({
                title: `This week: ${total} restock${total === 1 ? '' : 's'}`,
                sub: `${daysWithRestock} day${daysWithRestock === 1 ? '' : 's'} with restocks`,
                right: ''
            });
        }

        return { rows, nextText };
    };

    const buildRestockHorizonRows = ({ items, startDate, horizonDays }) => {
        const events = predictRunouts(Array.isArray(items) ? items : [], startDate, { horizonDays });
        const byDate = new Map();
        events.forEach((evt) => {
            const key = String(evt?.runoutDate || '');
            if (!key) return;
            const list = byDate.get(key) || [];
            list.push(evt);
            byDate.set(key, list);
        });

        const sortedDates = Array.from(byDate.keys()).sort((a, b) => new Date(a) - new Date(b));
        const total = events.length;
        const next = sortedDates[0] || null;
        const nextDate = next ? new Date(next) : null;

        const rows = [];
        rows.push({
            title: nextDate ? `Next restock: ${nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Next restock: —',
            sub: `Total restocks in ${horizonDays} days: ${total}`,
            right: nextDate ? `${Math.ceil((nextDate - new Date(startDate)) / 86400000)}d` : ''
        });

        sortedDates.slice(0, 4).forEach((iso) => {
            const d = new Date(iso);
            const list = byDate.get(iso) || [];
            const names = list.slice(0, 2).map((x) => x.name).filter(Boolean);
            rows.push({
                title: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
                sub: names.length ? names.join(' · ') : `${list.length} item${list.length === 1 ? '' : 's'}`,
                right: `${list.length} item${list.length === 1 ? '' : 's'}`
            });
        });

        if (rows.length === 1) {
            rows.push({
                title: 'No restocks predicted',
                sub: `Nothing is projected to run out in the next ${horizonDays} days.`,
                right: ''
            });
        }

        return rows;
    };

    const renderExtendedRestockSections = ({ items, startDate }) => {
        renderSummaryList(
            $('#overview-tracker-summary-14'),
            buildRestockHorizonRows({ items, startDate, horizonDays: 14 })
        );
        renderSummaryList(
            $('#overview-tracker-summary-30'),
            buildRestockHorizonRows({ items, startDate, horizonDays: 30 })
        );
    };

    document.addEventListener('DOMContentLoaded', async () => {
        initGroceryExpand();
        initCollapsible($('#overview-meals-head'), $('#overview-meals-details'), { expanded: false });
        initCollapsible($('#overview-tracker-head'), $('#overview-tracker-details'), { expanded: false });
        initCollapsible($('#overview-training-head'), $('#overview-training-details'), { expanded: false });
        initMealsViewToggle();

        $('#overview-tracker-month') && ($('#overview-tracker-month').textContent = 'Restock Alert Next 7 days.');

        const hydrateGroceryFromAccount = async () => {
            const listTarget = $('#grocery-list-items');
            if (!listTarget) return false;
            if (listTarget.querySelector('.grocery-card, .grocery-item-row')) return false;

            const api = async (path) => {
                try {
                    const resp = await fetch(path, { credentials: 'include' });
                    const json = await resp.json().catch(() => ({}));
                    return { ok: resp.ok, status: resp.status, json };
                } catch {
                    return { ok: false, status: 0, json: null };
                }
            };

            const me = await api('/api/auth/me');
            if (!me.ok || !me.json?.user) return false;

            const latest = await api('/api/groceries/latest');
            if (!latest.ok || !latest.json?.list) return false;

            const row = latest.json.list || {};
            const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
            const totals = row?.totals && typeof row.totals === 'object' ? row.totals : {};
            const items = Array.isArray(row?.items) ? row.items : [];

            if (!items.length) return false;

            const fmtMoney = (n) => (Number.isFinite(Number(n)) ? `$${Number(n).toFixed(2)}` : null);
            const computedWeekly = (() => {
                let sum = 0;
                let any = false;
                items.forEach((it) => {
                    const w = Number(it?.estimatedWeeklyCost);
                    if (Number.isFinite(w) && w >= 0) {
                        sum += w;
                        any = true;
                    }
                });
                return any ? sum : null;
            })();
            const computedMonthly = (() => {
                let sum = 0;
                let any = false;
                items.forEach((it) => {
                    const m = Number(it?.estimatedCost);
                    if (Number.isFinite(m) && m >= 0) {
                        sum += m;
                        any = true;
                    }
                });
                if (any) return sum;
                if (Number.isFinite(computedWeekly)) return (computedWeekly * 30) / 7;
                return null;
            })();

            const weekly = Number.isFinite(Number(totals?.totalEstimatedWeeklyCost))
                ? Number(totals.totalEstimatedWeeklyCost)
                : computedWeekly;
            const monthly = Number.isFinite(Number(totals?.totalEstimatedCost))
                ? Number(totals.totalEstimatedCost)
                : computedMonthly;

            const store = String(meta?.store || '').trim();
            const storePill = $('#store-pill');
            if (storePill) storePill.textContent = store || 'Saved';

            $('#overview-grocery-count') && ($('#overview-grocery-count').textContent = `${items.length || 0} items`);
            $('#overview-month-days') && ($('#overview-month-days').textContent = 'Saved to your account');
            $('#overview-month-projected') && ($('#overview-month-projected').textContent = fmtMoney(monthly) || '—');

            const mt = meta?.macroTargets && typeof meta.macroTargets === 'object' ? meta.macroTargets : null;
            if (mt) {
                const setText = (id, v) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.textContent = String(v ?? '');
                };
                setText('target-cal', Number(mt.calories) || '');
                setText('target-pro', Number(mt.proteinG) || '');
                setText('target-carb', Number(mt.carbG) || '');
                setText('target-fat', Number(mt.fatG) || '');
                updateMealHeaderMacros();
            }

            const safe = (s) => String(s || '').replace(/[^\x20-\x7E]/g, '').trim();
            const escape = (s) => String(s || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');

            listTarget.innerHTML = `
                <div class="grocery-items-grid" data-source="account">
                    ${items.slice(0, 500).map((it) => {
                        const name = safe(it?.name) || 'Item';
                        const quantity = safe(it?.quantity) || '';
                        const category = safe(it?.category) || 'Misc';
                        const img = String(it?.image || '').trim();
                        const url = String(it?.url || '').trim();
                        const daily = Number(it?.daily);
                        const unit = safe(it?.unit) || 'servings';
                        const days = Number(it?.daysPerContainer);
                        const price = Number(it?.containerPrice);

                        const dailyText = Number.isFinite(daily) ? `${daily.toFixed(2)} ${unit}` : `— ${unit}`;
                        const daysLabel = Number.isFinite(days)
                            ? (days >= 30 ? `${Math.round(days)} days (1+ month)` : `${Math.max(0, Math.round(days))} days`)
                            : 'N/A';
                        const priceText = Number.isFinite(price) ? `$${price.toFixed(2)}` : '—';
                        const footer = fmtMoney(it?.estimatedWeeklyCost ?? it?.estimatedCost) ? `${fmtMoney(it?.estimatedWeeklyCost ?? it?.estimatedCost)} est` : '';

                        return `
                            <div class="grocery-card" data-query="${escape(name.toLowerCase())}">
                                <div class="grocery-card-image ${img ? '' : 'no-image'}">
                                    ${img ? `<img src="${escape(img)}" alt="${escape(name)}" onerror="this.style.display='none'; this.parentElement.classList.add('no-image');">` : ''}
                                    ${url ? `
                                        <a href="${escape(url)}" target="_blank" class="grocery-card-link" rel="noopener" title="View item">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                        </a>
                                    ` : ''}
                                </div>
                                <div class="grocery-card-body">
                                    <h4 class="grocery-card-title">${escape(name)}</h4>
                                    <div class="grocery-card-duration">
                                        <span class="duration-icon">&#x23F1;</span>
                                        <span class="duration-text">Container lasts <strong>${escape(daysLabel)}</strong></span>
                                    </div>
                                    <div class="grocery-card-details">
                                        <div class="detail-row">
                                            <span class="detail-label">Qty</span>
                                            <span class="detail-value">${escape(quantity || '—')}</span>
                                        </div>
                                        <div class="detail-row">
                                            <span class="detail-label">Category</span>
                                            <span class="detail-value">${escape(category)}</span>
                                        </div>
                                        <div class="detail-row">
                                            <span class="detail-label">Daily use</span>
                                            <span class="detail-value">${escape(dailyText)}</span>
                                        </div>
                                        <div class="detail-row">
                                            <span class="detail-label">Price</span>
                                            <span class="detail-value">${escape(priceText)}</span>
                                        </div>
                                    </div>
                                    <div class="grocery-card-footer">
                                        <span class="container-price">${escape(footer)}</span>
                                        <label class="grocery-check-modern">
                                            <input type="checkbox" class="grocery-check-input" data-query="${escape(name.toLowerCase())}">
                                            <span class="checkmark"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            return true;
        };

        await hydrateGroceryFromAccount();
        hydrateGroceryFromDraft();

        await waitFor(() => {
            const hasAnyGrocery = document.querySelector('.grocery-card, .grocery-item-row');
            const hasMeals = !!$('.meal-block', $('#meal-grid')) || !!$('.meal-blocks', $('#meal-grid'));
            return !!hasAnyGrocery || !!hasMeals;
        }, { timeoutMs: 12000 });

        const parsed = parsePlanItems();
        const { items, unit } = parsed;
        toggleEmptyState(items.length > 0);
        syncMealCardsWithProfileGroceries();

        updateMealHeaderMacros();

        $('#overview-grocery-count') && ($('#overview-grocery-count').textContent = `${items.length || 0} items`);
        renderSummaryList($('#overview-meals-summary'), buildMealsSummary());

        const startDate = getStartDate();
        $('#overview-tracker-month') && ($('#overview-tracker-month').textContent = 'Restock Alert Next 7 days.');
        const hasAnyGrocery = !!document.querySelector('.grocery-card, .grocery-item-row');
        const week = buildWeekEvents(hasAnyGrocery ? items : [], startDate);
        renderWeekGrid(week);

        const tracker = buildTrackerSummary(week);
        renderSummaryList($('#overview-tracker-summary'), tracker.rows);
        $('#overview-tracker-next') && ($('#overview-tracker-next').textContent = `Next: ${tracker.nextText}`);
        renderExtendedRestockSections({ items: hasAnyGrocery ? items : [], startDate });

        initGroceryViewToggle({ items, startDate, unit });

        // Progress snapshot (key bits from Progress page)
        const trainingSummaryEl = $('#overview-training-summary');
        const trainingDetailsEl = $('#overview-training-details-list');
        const trainingLastPill = $('#overview-training-last');
        const trainingWeekPill = $('#overview-training-week');

        const api = async (path) => {
            try {
                const resp = await fetch(path, { credentials: 'include' });
                const json = await resp.json().catch(() => ({}));
                return { ok: resp.ok, status: resp.status, json };
            } catch {
                return { ok: false, status: 0, json: null };
            }
        };

        const fmtDate = (raw) => {
            const d = new Date(String(raw || ''));
            if (Number.isNaN(d.getTime())) return '—';
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        };

        const toNum = (v) => {
            const n = Number(String(v ?? '').trim());
            return Number.isFinite(n) ? n : null;
        };

        const workoutCountLast7Days = (logs) => {
            const list = Array.isArray(logs) ? logs : [];
            const now = Date.now();
            const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
            return list.filter(row => {
                const t = new Date(row?.performed_at || row?.updated_at || 0).getTime();
                return Number.isFinite(t) && t >= weekAgo && t <= now;
            }).length;
        };

        const lastWorkoutDate = (logs) => {
            const list = Array.isArray(logs) ? logs : [];
            const best = list.reduce((acc, row) => {
                const t = new Date(row?.performed_at || row?.updated_at || 0).getTime();
                return t > acc ? t : acc;
            }, 0);
            return best ? new Date(best).toISOString() : null;
        };

        const goalSettings = () => {
            const start = toNum(localStorage.getItem('ode_ts_start_weight_lb'));
            const current = toNum(localStorage.getItem('ode_ts_current_weight_lb'));
            const goal = toNum(localStorage.getItem('ode_ts_goal_weight_lb'));
            const pace = toNum(localStorage.getItem('ode_ts_pace_lb_per_week'));
            return { start, current, goal, pace: Number.isFinite(pace) && pace > 0 ? pace : 1 };
        };

        const weightLost = ({ start, current }) => {
            if (!Number.isFinite(start) || !Number.isFinite(current)) return null;
            return start - current;
        };

        const daysToGoal = ({ current, goal, pace }) => {
            if (!Number.isFinite(current) || !Number.isFinite(goal) || !Number.isFinite(pace) || pace <= 0) return null;
            const remaining = Math.abs(current - goal);
            return Math.max(0, Math.ceil((remaining / pace) * 7));
        };

        const setPill = (el, text) => {
            if (!el) return;
            el.textContent = text || '—';
        };

        const renderLeaderboard = async () => {
            const lbList = $('#overview-lb-list');
            const lbRankEl = $('#overview-lb-rank');
            const lbSubEl = $('#overview-lb-sub');
            if (!lbList) return;

            // Local fallback (static hosting / no Node server).
            const xmur3 = (str) => {
                let h = 1779033703 ^ str.length;
                for (let i = 0; i < str.length; i += 1) {
                    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
                    h = (h << 13) | (h >>> 19);
                }
                return () => {
                    h = Math.imul(h ^ (h >>> 16), 2246822507);
                    h = Math.imul(h ^ (h >>> 13), 3266489909);
                    h ^= h >>> 16;
                    return h >>> 0;
                };
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
            const seedFromString = (s) => xmur3(String(s || ''))();
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
            const makeLocalBots = ({ month, day }) => {
                const rnd = mulberry32(seedFromString(`ode_leaderboard_${month}`));
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

                const bots = names.map((n, idx) => {
                    const [a, b] = palette[idx % palette.length];
                    const initials = n.displayName.split(' ').map(s => s.slice(0, 1)).join('').slice(0, 2);
                    const base = 420 + Math.floor(rnd() * 280) + idx * 8;
                    const dr = mulberry32(seedFromString(`ode_leaderboard_${month}_${day}_${n.handle}`));
                    const delta = Math.floor(dr() * 31) - 15;
                    const avatarSeed = seedFromString(`ode_leaderboard_avatar_${n.handle}`);
                    const genderRnd = mulberry32(seedFromString(`ode_leaderboard_avatar_gender_${n.handle}`));
                    const gender = genderRnd() > 0.5 ? 'women' : 'men';
                    const joinDaysAgo = joinList[idx] ?? idx;
                    const joinedAt = new Date(today);
                    joinedAt.setUTCDate(joinedAt.getUTCDate() - joinDaysAgo);
                    const sr = mulberry32(seedFromString(`ode_leaderboard_streak_${month}_${day}_${n.handle}`));
                    const streakDays = 2 + Math.floor(sr() * 18);
                    return {
                        id: `bot_${month}_${idx}`,
                        displayName: n.displayName,
                        handle: n.handle,
                        avatarUrl: portraitUrl({ seed: avatarSeed, gender }),
                        joinedAt: joinedAt.toISOString(),
                        points: Math.max(0, base + delta),
                        bio: bios[idx] || '',
                        streakDays,
                        isBot: true
                    };
                });

                const sr = mulberry32(seedFromString(`ode_leaderboard_shuffle_${month}`));
                for (let i = bots.length - 1; i > 0; i -= 1) {
                    const j = Math.floor(sr() * (i + 1));
                    [bots[i], bots[j]] = [bots[j], bots[i]];
                }

                return bots
                    .slice()
                    .sort((a, b) => b.points - a.points)
                    .map((row, i) => ({ ...row, rank: i + 1 }));
            };

            const fmtJoin = (iso) => {
                const d = new Date(String(iso || ''));
                if (Number.isNaN(d.getTime())) return 'Joined —';
                return `Joined ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
            };

            try {
                const lb = await api('/api/leaderboard');
                if (lb.status === 404) {
                    const entries = makeLocalBots({ month: monthKey(new Date()), day: todayKey(new Date()) }).slice(0, 5);
                    if (lbRankEl) lbRankEl.textContent = '—';
                    if (lbSubEl) lbSubEl.textContent = 'Start logging workouts/check-ins to rank.';
                    lbList.innerHTML = entries.map((r) => {
                        const name = String(r.displayName || 'Member');
                        const handle = String(r.handle || '');
                        const pts = Number(r.points || 0);
                        const joined = fmtJoin(r.joinedAt);
                        const streakDays = Number(r.streakDays || 0);
                        const bio = String(r.bio || '').trim();
                        const avatar = String(r.avatarUrl || '');
                        const safeAvatar = avatar.replace(/\"/g, '&quot;');
                        return `
                            <div class="overview-lb-row" role="listitem">
                                <div class="overview-lb-row-left">
                                    <div class="overview-lb-pos">#${r.rank}</div>
                                    <div class="overview-lb-avatar"><img src="${safeAvatar}" alt="${name}" onerror="this.onerror=null; this.src='assets/images/placeholders/profile-placeholder.jpg';"></div>
                                    <div style="min-width:0;">
                                        <div class="overview-lb-name">${name}</div>
                                        <div class="overview-lb-meta ns-muted">${handle}${streakDays > 1 ? ` · 🔥 ${streakDays}d` : ''}</div>
                                        ${bio ? `<div class="overview-lb-bio ns-muted">${bio}</div>` : ''}
                                    </div>
                                </div>
                                <div class="overview-lb-row-right">
                                    <div class="overview-lb-points">${pts.toLocaleString()} pts</div>
                                    <div class="overview-lb-joined ns-muted">${joined}</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                    return;
                }

                if (!lb.ok || !Array.isArray(lb.json?.entries)) {
                    lbList.innerHTML = `
                        <div class="overview-summary-item">
                            <div class="overview-summary-left">
                                <div class="overview-summary-title">Leaderboard unavailable</div>
                                <div class="overview-summary-sub">Try again in a moment.</div>
                            </div>
                        </div>
                    `;
                    if (lbRankEl) lbRankEl.textContent = '—';
                    if (lbSubEl) lbSubEl.textContent = 'Earn points by logging workouts + check-ins.';
                    return;
                }

                const entries = lb.json.entries.slice(0, 5);
                const you = lb.json?.you || null;

                if (lbRankEl) lbRankEl.textContent = you?.rank ? `#${you.rank}` : '—';
                if (lbSubEl) {
                    lbSubEl.textContent = you?.rank
                        ? `${Number(you?.points || 0).toLocaleString()} pts · Resets monthly`
                        : 'Sign in + log workouts/check-ins to rank.';
                }

                lbList.innerHTML = entries.map((r) => {
                    const name = String(r.displayName || 'Member');
                    const handle = String(r.handle || '');
                    const pts = Number(r.points || 0);
                    const joined = fmtJoin(r.joinedAt);
                    const streakDays = Number(r.streakDays || 0);
                    const bio = String(r.bio || '').trim();
                    const avatar = String(r.avatarUrl || '');
                    const safeAvatar = avatar.replace(/"/g, '&quot;');
                    return `
                        <div class="overview-lb-row" role="listitem">
                            <div class="overview-lb-row-left">
                                <div class="overview-lb-pos">#${r.rank}</div>
                                <div class="overview-lb-avatar"><img src="${safeAvatar}" alt="${name}"></div>
                                <div style="min-width:0;">
                                    <div class="overview-lb-name">${name}</div>
                                    <div class="overview-lb-meta ns-muted">${handle}${streakDays > 1 ? ` · 🔥 ${streakDays}d` : ''}</div>
                                    ${bio ? `<div class="overview-lb-bio ns-muted">${bio}</div>` : ''}
                                </div>
                            </div>
                            <div class="overview-lb-row-right">
                                <div class="overview-lb-points">${pts.toLocaleString()} pts</div>
                                <div class="overview-lb-joined ns-muted">${joined}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            } catch {
                lbList.innerHTML = `
                    <div class="overview-summary-item">
                        <div class="overview-summary-left">
                            <div class="overview-summary-title">Leaderboard unavailable</div>
                            <div class="overview-summary-sub">Check your connection.</div>
                        </div>
                    </div>
                `;
                if (lbRankEl) lbRankEl.textContent = '—';
                if (lbSubEl) lbSubEl.textContent = 'Earn points by logging workouts + check-ins.';
            }
        };


    const renderTraining = async () => {
            const me = await api('/api/auth/me');
            const user = me.ok ? (me.json?.user || null) : null;
            const cta = $('#overview-training-cta');
            if (!user) {
                setPill(trainingLastPill, 'Last: —');
                setPill(trainingWeekPill, '7d: —');
                if (cta) cta.classList.add('hidden');
                const rows = [{
                    title: 'Sign in to see training status',
                    sub: 'Workouts, weigh-ins, and auto-adjust warnings show here.',
                    right: ''
                }];
                renderSummaryList(trainingSummaryEl, rows);
                renderSummaryList(trainingDetailsEl, rows);
                return;
            }

            const state = await api('/api/training/state');
            const planRow = state.ok ? (state.json?.plan || null) : null;
            const hasPlan = !!planRow?.id;
            if (!state.ok || !hasPlan) {
                setPill(trainingLastPill, 'Last: —');
                setPill(trainingWeekPill, '7d: —');
                if (cta) cta.classList.remove('hidden');
                const rows = [{
                    title: 'No training plan yet',
                    sub: 'Click “Get your free training plan” to generate one.',
                    right: ''
                }];
                renderSummaryList(trainingSummaryEl, rows);
                renderSummaryList(trainingDetailsEl, rows);
                return;
            }

            if (cta) cta.classList.add('hidden');
            const profile = state.json?.profile || null;
            const planId = planRow?.id || null;
            const daysPerWeek = Number(profile?.days_per_week || planRow?.days_per_week || planRow?.plan?.meta?.daysPerWeek || 0) || 0;

            let logs = [];
            if (planId) {
                const logsResp = await api(`/api/training/logs?planId=${encodeURIComponent(planId)}`);
                logs = logsResp.ok ? (logsResp.json?.logs || []) : [];
            }

            const done7 = workoutCountLast7Days(logs);
            const expected7 = daysPerWeek ? Math.max(0, Math.round(daysPerWeek)) : null;
            const missedW = expected7 == null ? null : Math.max(0, expected7 - done7);
            const lastIso = lastWorkoutDate(logs);

            setPill(trainingLastPill, `Last: ${lastIso ? fmtDate(lastIso) : '—'}`);
            setPill(trainingWeekPill, `7d: ${expected7 == null ? done7 : `${done7}/${expected7}`}`);

            const offset = Number(profile?.calorie_offset) || 0;
            const iterations = Number(profile?.no_progress_iterations) || 0;
            const flagged = !!profile?.flagged;

            const goals = goalSettings();
            const lost = weightLost(goals);
            const d2g = daysToGoal({ current: goals.current, goal: goals.goal, pace: goals.pace });

            const meta = planRow?.plan?.meta || {};
            const discipline = String(meta?.discipline || planRow?.discipline || '').trim() || 'Training';
            const equip = profile?.equipment_access && typeof profile.equipment_access === 'object' ? profile.equipment_access : {};
            const equipLabels = [
                equip.bodyweight ? 'Bodyweight' : null,
                equip.dumbbell ? 'Dumbbells' : null,
                equip.barbell ? 'Barbell' : null,
                equip.cable ? 'Cable' : null,
                equip.machine ? 'Machines' : null
            ].filter(Boolean);

            const topRows = [
                {
                    title: `Plan: ${discipline}${daysPerWeek ? ` · ${daysPerWeek} days/week` : ''}`,
                    sub: equipLabels.length ? `Equipment: ${equipLabels.join(', ')}` : 'Equipment: —',
                    right: '›'
                },
                {
                    title: `Workouts (7d): ${expected7 == null ? done7 : `${done7}/${expected7}`}`,
                    sub: missedW == null ? 'Set your training frequency to compute misses.' : `Missed workouts (7d): ${missedW}`,
                    right: lastIso ? fmtDate(lastIso) : ''
                },
                {
                    title: `Weight lost: ${Number.isFinite(lost) ? `${lost.toFixed(1)} lb` : '—'}`,
                    sub: Number.isFinite(d2g) ? `Days till goal: ${d2g}` : 'Set goal weights in Progress to compute days till goal.',
                    right: ''
                }
            ];

            const warningRow = flagged
                ? {
                    title: '⚠️ Profile flagged',
                    sub: '4+ auto-adjusts without progress. Consider a deeper check-in.',
                    right: ''
                }
                : (iterations > 0
                    ? {
                        title: 'Auto-adjust active',
                        sub: `Streak: ${iterations} week${iterations === 1 ? '' : 's'} · Offset: ${offset > 0 ? '+' : ''}${offset} kcal`,
                        right: ''
                    }
                    : null);

            const rows = warningRow ? [warningRow, ...topRows] : topRows;
            renderSummaryList(trainingSummaryEl, rows);

            renderSummaryList(trainingDetailsEl, rows);
        };

        renderLeaderboard();
        renderTraining();
        window.addEventListener('ode:checkin-saved', () => {
            renderTraining();
            renderLeaderboard();
        });

        initOverviewMiniNav();
    });
})();

