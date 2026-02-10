(() => {
    const CART_KEY = 'ode_store_cart_v1';
    const RECENT_KEY = 'ode_store_recent_v1';

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const money = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return '—';
        return num.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
    };

    const getParams = () => new URLSearchParams(window.location.search);
    const getParam = (key, fallback = '') => getParams().get(key) || fallback;
    const liveMode = getParam('live', '0') === '1';

    const MARKUP = 1.2;

    const roundMoney = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        return Math.round((num + Number.EPSILON) * 100) / 100;
    };

    const svgDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const placeholderImage = (label, accent = '#7C3AED') => {
        const safe = String(label || 'odeology_').slice(0, 24);
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
                <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stop-color="#0b0b10"/>
                        <stop offset="1" stop-color="${accent}"/>
                    </linearGradient>
                    <radialGradient id="r" cx="0.25" cy="0.2" r="0.9">
                        <stop offset="0" stop-color="rgba(255,255,255,0.12)"/>
                        <stop offset="1" stop-color="rgba(255,255,255,0)"/>
                    </radialGradient>
                </defs>
                <rect width="800" height="800" rx="48" fill="url(#g)"/>
                <rect width="800" height="800" rx="48" fill="url(#r)"/>
                <g fill="rgba(255,255,255,0.9)" font-family="Space Grotesk, system-ui, -apple-system, Segoe UI, Roboto, Arial" text-anchor="middle">
                    <text x="400" y="380" font-size="34" font-weight="700" letter-spacing="1.2">${safe}</text>
                    <text x="400" y="430" font-size="16" opacity="0.75">Preview product</text>
                </g>
            </svg>
        `.trim();
        return svgDataUrl(svg);
    };

    const PLACEHOLDERS = (() => {
        const base = [
            {
                id: 'ph_essentials_scale',
                category_key: 'equipment',
                name: 'Digital Food Scale',
                original_price: 15.0,
                our_price: 15.0,
                image: 'https://m.media-amazon.com/images/I/41gdcA2HWHL._SL1100_.jpg',
                short_description: 'Precision weighing for accurate portion control.',
                why_recommend: 'Why we recommend it: consistent portions, easy cleanup, daily use.'
            },
            {
                id: 'ph_essentials_measuring',
                category_key: 'equipment',
                name: '1-Cup Measuring Cup',
                original_price: 11.25,
                our_price: 11.25,
                image: 'https://m.media-amazon.com/images/I/61zRCsefyjL._AC_SL1500_.jpg',
                short_description: 'Clear markings for rice, liquids, and quick meal prep.',
                why_recommend: 'Why we recommend it: fast measuring, fewer tracking errors.'
            },
            {
                id: 'ph_essentials_containers',
                category_key: 'equipment',
                name: 'Meal Prep Containers',
                original_price: 16.5,
                our_price: 16.5,
                image: 'https://m.media-amazon.com/images/I/71hvLPhU1gL._AC_SL1500_.jpg',
                short_description: '35oz stackable containers for grab-and-go meals.',
                why_recommend: 'Why we recommend it: portion control, easy storage, microwave safe.'
            },
            { category_key: 'protein', name: 'Whey Protein (Isolate)', market: 39.99, tag: 'Recommended', accent: '#22c55e' },
            { category_key: 'protein', name: 'Whey Protein (Blend)', market: 29.99, tag: 'Best Value', accent: '#16a34a' },
            { category_key: 'protein', name: 'Plant Protein', market: 34.99, tag: null, accent: '#10b981' },
            { category_key: 'creatine', name: 'Creatine Monohydrate', market: 19.99, tag: 'Best Value', accent: '#60a5fa' },
            { category_key: 'creatine', name: 'Micronized Creatine', market: 24.99, tag: null, accent: '#3b82f6' },
            { category_key: 'supplements', name: 'Electrolytes (Training)', market: 17.99, tag: null, accent: '#a78bfa' },
            { category_key: 'supplements', name: 'Pre-Workout (Focus)', market: 27.99, tag: 'Recommended', accent: '#8b5cf6' },
            { category_key: 'supplements', name: 'Omega-3 Fish Oil', market: 16.99, tag: null, accent: '#7c3aed' },
            { category_key: 'supplements', name: 'Magnesium Glycinate', market: 18.99, tag: null, accent: '#6d28d9' },
            { category_key: 'equipment', name: 'Resistance Bands Set', market: 18.99, tag: 'Best Value', accent: '#f59e0b' },
            { category_key: 'equipment', name: 'Adjustable Dumbbells', market: 199.99, tag: 'Recommended', accent: '#f97316' },
            { category_key: 'equipment', name: 'Kettlebell', market: 34.99, tag: null, accent: '#fb923c' },
            { category_key: 'equipment', name: 'Pull-Up Bar', market: 29.99, tag: null, accent: '#fbbf24' },
            { category_key: 'equipment', name: 'Foam Roller', market: 14.99, tag: null, accent: '#facc15' }
        ];

        const categoryLabel = (k) => ({
            protein: 'Protein',
            creatine: 'Creatine',
            supplements: 'Supplements',
            equipment: 'Workout Equipment',
            deals: 'Deals'
        }[k] || 'Supplements');

        const describe = (k, name) => {
            const n = String(name || '').toLowerCase();
            if (k === 'protein') return n.includes('isolate')
                ? 'Lean, fast-digesting protein to help you hit daily targets.'
                : 'Convenient protein to support muscle-building and recovery.';
            if (k === 'creatine') return 'Creatine support for strength and performance with simple daily dosing.';
            if (k === 'equipment') return 'Reliable home-gym gear built for consistent progressive overload.';
            return 'A clean supplement pick focused on value and simplicity.';
        };

        const why = (k) => {
            if (k === 'protein') return 'Why we recommend it: simple ingredients, practical serving size, good value.';
            if (k === 'creatine') return 'Why we recommend it: proven ingredient, easy routine fit, strong value.';
            if (k === 'equipment') return 'Why we recommend it: durable, high-utility, low clutter.';
            return 'Why we recommend it: covers common gaps without overcomplication.';
        };

        const out = base.map((p, idx) => {
            const original = Number.isFinite(Number(p.original_price))
                ? roundMoney(Number(p.original_price))
                : roundMoney(p.market);
            const our = Number.isFinite(Number(p.our_price))
                ? roundMoney(Number(p.our_price))
                : (original != null ? roundMoney(original * MARKUP) : null);
            const id = p.id || `ph_${p.category_key}_${idx + 1}`;
            return {
                id,
                source: 'placeholder',
                name: p.name,
                category_key: p.category_key,
                category: categoryLabel(p.category_key),
                image: p.image || placeholderImage(p.name, p.accent),
                original_price: original,
                our_price: our,
                rating: 4.6,
                reviews: 1200 + idx * 17,
                short_description: p.short_description || describe(p.category_key, p.name),
                why_recommend: p.why_recommend || why(p.category_key),
                tag: p.tag
            };
        });

        const deals = out
            .slice()
            .sort((a, b) => (a.our_price || 0) - (b.our_price || 0))
            .slice(0, 10)
            .map((p, i) => ({ ...p, id: `ph_deals_${i + 1}`, category_key: 'deals', category: 'Deals', tag: p.tag || 'Best Value' }));

        return [...out, ...deals];
    })();

    const getPlaceholderById = (id) => PLACEHOLDERS.find((p) => String(p.id) === String(id)) || null;
    const getPlaceholdersByCategory = (categoryKey) => {
        const key = String(categoryKey || '').toLowerCase();
        if (key === 'all') return PLACEHOLDERS.filter((p) => p.category_key !== 'deals');
        if (key === 'deals') return PLACEHOLDERS.filter((p) => p.category_key === 'deals');
        return PLACEHOLDERS.filter((p) => p.category_key === key);
    };

    const readCart = () => {
        try {
            const raw = localStorage.getItem(CART_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    const writeCart = (items) => {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
        syncCartBadges();
    };

    const readRecent = () => {
        try {
            const raw = localStorage.getItem(RECENT_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    const writeRecent = (items) => {
        try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(items));
        } catch {
            // ignore
        }
    };

    const rememberRecentlyViewed = (product) => {
        if (!product || !product.id) return;
        const entry = {
            id: String(product.id),
            name: product.name,
            image: product.image,
            our_price: product.our_price,
            original_price: product.original_price,
            category: product.category,
            brand: product.brand || product.category
        };
        const list = readRecent().filter((p) => String(p?.id || '') !== entry.id);
        list.unshift(entry);
        writeRecent(list.slice(0, 12));
    };

    const renderRecentlyViewed = ({ excludeId } = {}) => {
        const grid = $('#store-recent-grid');
        const section = $('#store-recent');
        if (!grid || !section) return;
        const list = readRecent().filter((p) => p && p.id && String(p.id) !== String(excludeId || ''));
        if (list.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        grid.innerHTML = list.slice(0, 6).map(buildCard).join('\n');
        wireGridActions(grid);
    };

    const prefersReducedMotion = () => {
        try {
            return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch {
            return false;
        }
    };

    const animateCards = (grid) => {
        if (!grid || prefersReducedMotion()) return;
        const cards = Array.from(grid.querySelectorAll('.store-card'));
        cards.forEach((card, idx) => {
            card.classList.add('store-card-anim');
            card.style.transitionDelay = `${Math.min(180, idx * 18)}ms`;
            window.requestAnimationFrame(() => card.classList.add('in'));
        });
    };

    const wireRowArrows = () => {
        const arrows = $$('.store-row-arrow[data-row-target]');
        if (arrows.length === 0) return;
        arrows.forEach((btn) => {
            btn.addEventListener('click', () => {
                const sel = btn.getAttribute('data-row-target') || '';
                const row = sel ? document.querySelector(sel) : null;
                if (!row) return;
                const dir = btn.classList.contains('left') ? -1 : 1;
                const amt = Math.max(220, Math.floor((row.clientWidth || 600) * 0.8));
                row.scrollBy({ left: dir * amt, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            });
        });
    };

    const cartCount = () => readCart().reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const cartSubtotal = () => readCart().reduce((sum, item) => sum + (Number(item.our_price) || 0) * (Number(item.qty) || 0), 0);
    const cartMarketSubtotal = () => readCart().reduce((sum, item) => sum + (Number(item.original_price) || 0) * (Number(item.qty) || 0), 0);

    const syncCartBadges = () => {
        const count = cartCount();
        $$('#store-cart-count, .store-cart-count').forEach((el) => { el.textContent = String(count); });
    };

    const notice = (message) => {
        const el = $('#store-notice');
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
        window.clearTimeout(notice._t);
        notice._t = window.setTimeout(() => el.classList.add('hidden'), 2500);
    };

    const apiGet = async (path) => {
        const resp = await fetch(path, { headers: { 'Accept': 'application/json' } });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const msg = data?.error || `Request failed (${resp.status})`;
            throw new Error(msg);
        }
        return data;
    };

    const renderGridSkeleton = (grid, count = 8) => {
        if (!grid) return;
        const cards = Array.from({ length: count }).map(() => `
            <div class="store-skeleton-card" aria-hidden="true">
                <div class="store-skel-img"></div>
                <div class="store-skel-line w-80"></div>
                <div class="store-skel-line w-55"></div>
                <div class="store-skel-line w-90"></div>
                <div class="store-skel-btn"></div>
            </div>
        `.trim());
        grid.innerHTML = cards.join('\n');
    };

    const renderUnavailable = (grid, payload) => {
        if (!grid) return;
        const reason = String(payload?.reason || 'unavailable');
        const message = (() => {
            if (reason === 'quota_exceeded') return 'Store is temporarily unavailable (provider quota exceeded).';
            if (reason === 'missing_key') return 'Store is not configured yet (missing provider key).';
            return 'Store is temporarily unavailable.';
        })();
        const skeleton = Array.from({ length: 8 }).map(() => `
            <div class="store-skeleton-card" aria-hidden="true">
                <div class="store-skel-img"></div>
                <div class="store-skel-line w-80"></div>
                <div class="store-skel-line w-55"></div>
                <div class="store-skel-line w-90"></div>
                <div class="store-skel-btn"></div>
            </div>
        `.trim()).join('\n');
        grid.innerHTML = `
            <div class="store-empty-panel">
                <h3>${message}</h3>
                <p>When the provider is back online, products auto-load and prices update automatically.</p>
                <div class="store-empty-actions">
                    <a class="btn btn-primary" href="store-category.html?category=protein">Browse categories</a>
                    <a class="btn btn-ghost" href="store.html">Reload</a>
                </div>
            </div>
            ${skeleton}
        `.trim();
    };

    const buildCard = (p) => {
        const tag = p.tag ? `<span class="store-tag">${p.tag}</span>` : '';
        const safeBrand = String(p.brand || p.category || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeName = String(p.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeDesc = String(p.short_description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const meta = (() => {
            const hasRating = Number.isFinite(p.rating);
            const hasReviews = Number.isFinite(p.reviews);
            if (!hasRating && !hasReviews) return '';
            if (hasRating) {
                const reviewBit = hasReviews ? ` <span class="muted">(${Number(p.reviews).toLocaleString()})</span>` : '';
                return `<div class="store-card-meta">★ ${Number(p.rating).toFixed(1)}${reviewBit}</div>`;
            }
            return `<div class="store-card-meta"><span class="muted">${Number(p.reviews).toLocaleString()} reviews</span></div>`;
        })();
        return `
            <article class="store-card" data-id="${p.id}">
                <a class="store-card-link" href="store-product.html?id=${encodeURIComponent(p.id)}">
                    <div class="store-card-media">
                        <img class="store-card-img" src="${p.image}" alt="${safeName}">
                        ${tag}
                    </div>
                    <div class="store-card-body">
                        ${safeBrand ? `<div class="store-card-brand">${safeBrand}</div>` : ''}
                        <div class="store-card-title">${safeName}</div>
                        <div class="store-card-price">
                            <span class="store-card-our">${money(p.our_price)}</span>
                            <span class="store-card-market">${money(p.original_price)}</span>
                        </div>
                        ${meta}
                        <div class="store-card-desc">${safeDesc}</div>
                    </div>
                </a>
                <div class="store-card-actions">
                    <button class="btn btn-primary store-add-btn store-add-btn-gnc" type="button"
                        data-id="${p.id}"
                        data-name="${safeName.replace(/\"/g, '&quot;')}"
                        data-image="${p.image}"
                        data-our="${p.our_price}"
                        data-market="${p.original_price}"
                        data-category="${p.category}">
                        Add to Cart
                    </button>
                </div>
            </article>
        `.trim();
    };

    const wireGridActions = (root) => {
        if (!root) return;
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('.store-add-btn');
            if (!btn) return;
            const id = btn.dataset.id || '';
            if (!id) return;

            const items = readCart();
            const idx = items.findIndex((it) => String(it.id) === String(id));
            if (idx >= 0) {
                items[idx].qty = (Number(items[idx].qty) || 0) + 1;
            } else {
                items.push({
                    id,
                    name: btn.dataset.name || 'Item',
                    image: btn.dataset.image || '',
                    our_price: Number(btn.dataset.our) || 0,
                    original_price: Number(btn.dataset.market) || 0,
                    category: btn.dataset.category || '',
                    qty: 1
                });
            }
            writeCart(items);
            notice('Added to cart.');
        });
    };

    const loadHome = async () => {
        const grid = $('#store-featured-grid');
        if (!grid) return;
        renderRecentlyViewed();
        wireGridActions(grid);
        renderGridSkeleton(grid, 16);
        if (!liveMode) {
            const picked = PLACEHOLDERS.filter((p) => p.category_key !== 'deals').slice(0, 16);
            grid.innerHTML = picked.map(buildCard).join('\n');
            animateCards(grid);
            return;
        }

        try {
            const data = await apiGet('/api/store/home?limit=16');
            if (data?.unavailable) return renderUnavailable(grid, data);
            const picked = Array.isArray(data?.results) ? data.results : [];
            if (picked.length === 0) return renderUnavailable(grid, { reason: 'unavailable' });
            grid.innerHTML = picked.map(buildCard).join('\n');
            animateCards(grid);
        } catch {
            renderUnavailable(grid, { reason: 'unavailable' });
        }
    };

    const loadCategory = () => {
        const grid = $('#store-category-grid');
        if (!grid) return;
        const title = $('#store-category-title');
        const subtitle = $('#store-category-subtitle');
        const search = $('#store-search');
        const refresh = $('#store-refresh');
        const loadMore = $('#store-load-more');

        let category = String(getParam('category', 'protein')).toLowerCase();
        const allowed = new Set(['protein', 'creatine', 'supplements', 'equipment', 'deals', 'all']);
        if (!allowed.has(category)) category = 'protein';
        const effectiveCategory = category === 'all' ? 'protein' : category;
        const initialQ = String(getParam('q', '')).trim();

        const pretty = {
            protein: 'Protein',
            creatine: 'Creatine',
            supplements: 'Supplements',
            equipment: 'Workout Equipment',
            deals: 'Deals',
            all: 'Search'
        }[category];

        $$('.store-cat').forEach((a) => {
            const href = String(a.getAttribute('href') || '');
            a.classList.toggle('active', category !== 'all' && href.includes(`category=${category}`));
        });

        if (title) {
            if (initialQ) title.textContent = `Results for "${initialQ}"`;
            else title.textContent = pretty;
        }
        if (subtitle) {
            if (initialQ) subtitle.textContent = 'Search results pulled live from retailers.';
            else subtitle.textContent = category === 'deals'
                ? 'Best-value picks pulled live from retailers.'
                : 'Curated picks pulled live from retailers.';
        }

        wireGridActions(grid);

        let page = 1;
        let currentQuery = initialQ || '';
        let inFlight = false;

        const fetchPage = async ({ reset = false, refresh = false } = {}) => {
            if (inFlight) return;
            inFlight = true;
            loadMore && (loadMore.disabled = true);

            if (reset) {
                page = 1;
                renderGridSkeleton(grid, 12);
            }

            try {
                if (!liveMode) {
                    const q = String(currentQuery || '').trim().toLowerCase();
                    const list = getPlaceholdersByCategory(category);
                    const filtered = q
                        ? list.filter((p) => String(p.name || '').toLowerCase().includes(q))
                        : list;
                    const pageSize = 24;
                    const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
                    if (reset) grid.innerHTML = '';
                    if (slice.length === 0 && page === 1) {
                        grid.innerHTML = `<div class="store-grid-loading">No results.</div>`;
                    } else {
                        grid.insertAdjacentHTML('beforeend', slice.map(buildCard).join('\n'));
                        animateCards(grid);
                    }
                    page += 1;
                    return;
                }

                const q = String(currentQuery || '').trim();
                const url = `/api/store/products?category=${encodeURIComponent(effectiveCategory)}&limit=24&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}${!q ? '&seed=1' : ''}${refresh ? '&refresh=1' : ''}`;
                const data = await apiGet(url);
                if (data?.unavailable) {
                    if (page === 1) return renderUnavailable(grid, data);
                    notice('Store is temporarily unavailable.');
                    return;
                }
                const results = Array.isArray(data?.results) ? data.results : [];

                if (reset) grid.innerHTML = '';
                if (results.length === 0 && page === 1) {
                    grid.innerHTML = `<div class="store-grid-loading">No results.</div>`;
                } else {
                    grid.insertAdjacentHTML('beforeend', results.map(buildCard).join('\n'));
                    animateCards(grid);
                }
                page += 1;
            } catch (err) {
                if (page === 1) {
                    renderUnavailable(grid, { reason: 'unavailable' });
                } else {
                    notice('Could not load more items.');
                }
            } finally {
                inFlight = false;
                loadMore && (loadMore.disabled = false);
            }
        };

        fetchPage({ reset: true, refresh: false });
        renderRecentlyViewed();

        if (search && initialQ) {
            search.value = initialQ;
        }

        if (loadMore) {
            loadMore.addEventListener('click', () => fetchPage());
        }
        if (refresh) {
            refresh.addEventListener('click', () => fetchPage({ reset: true, refresh: liveMode }));
        }
        if (search) {
            let t = null;
            search.addEventListener('input', () => {
                window.clearTimeout(t);
                t = window.setTimeout(() => {
                    currentQuery = search.value;
                    fetchPage({ reset: true, refresh: false });
                }, 300);
            });
        }
    };

    const loadProduct = async () => {
        const root = $('#store-product');
        if (!root) return;
        const id = String(getParam('id', '')).trim();
        if (!id) {
            notice('Missing product id.');
            return;
        }

        const titleEl = $('#store-product-title');
        const catEl = $('#store-product-category');
        const imgEl = $('#store-product-image');
        const thumbsEl = $('#store-product-thumbs');
        const ourEl = $('#store-our-price');
        const marketEl = $('#store-market-price');
        const descEl = $('#store-product-desc');
        const whyEl = $('#store-product-why');
        const qtyEl = $('#store-qty');
        const addBtn = $('#store-add-to-cart');
        const stickyTitle = $('#store-sticky-title');
        const stickyPrice = $('#store-sticky-price');
        const stickyAdd = $('#store-sticky-add');
        const viewLink = $('#store-view-on-retailer');
        const metaEl = $('#store-product-meta');

        const addToCart = (product, qty) => {
            const q = Math.max(1, Math.floor(Number(qty) || 1));
            const items = readCart();
            const idx = items.findIndex((it) => String(it.id) === String(product.id));
            if (idx >= 0) {
                items[idx].qty = (Number(items[idx].qty) || 0) + q;
            } else {
                items.push({
                    id: product.id,
                    name: product.name,
                    image: product.image,
                    our_price: Number(product.our_price) || 0,
                    original_price: Number(product.original_price) || 0,
                    category: product.category || '',
                    qty: q
                });
            }
            writeCart(items);
            notice('Added to cart.');
        };

        try {
            if (titleEl) titleEl.textContent = 'Loading…';
            const product = (!liveMode || String(id).startsWith('ph_'))
                ? (getPlaceholderById(id) || getPlaceholderById('ph_protein_1'))
                : await apiGet(`/api/store/product?id=${encodeURIComponent(id)}`);

            rememberRecentlyViewed(product);
            renderRecentlyViewed({ excludeId: id });

            document.title = `${product.name} · odeology_`;
            if (titleEl) titleEl.textContent = product.name;
            if (catEl) catEl.textContent = product.category || 'Product';
            if (descEl) descEl.textContent = product.short_description || '';
            if (whyEl) whyEl.textContent = product.why_recommend || '';
            if (ourEl) ourEl.textContent = money(product.our_price);
            if (marketEl) marketEl.textContent = money(product.original_price);
            if (stickyTitle) stickyTitle.textContent = product.name;
            if (stickyPrice) stickyPrice.textContent = money(product.our_price);

            if (imgEl) {
                imgEl.src = product.image;
                imgEl.alt = product.name;
            }

            if (thumbsEl) {
                const imgs = Array.isArray(product.images) ? product.images.slice(0, 6) : [];
                thumbsEl.innerHTML = imgs.map((src) => `
                    <button class="store-thumb" type="button" data-src="${src}">
                        <img src="${src}" alt="">
                    </button>
                `.trim()).join('\n');

                thumbsEl.addEventListener('click', (e) => {
                    const btn = e.target.closest('.store-thumb');
                    if (!btn || !imgEl) return;
                    const src = btn.dataset.src || '';
                    if (!src) return;
                    imgEl.src = src;
                });
            }

            if (metaEl) {
                const bits = [];
                if (Number.isFinite(product.rating)) bits.push(`Rating: ${product.rating}`);
                if (Number.isFinite(product.reviews)) bits.push(`Reviews: ${product.reviews.toLocaleString()}`);
                if (product.in_stock === false) bits.push('Out of stock');
                metaEl.textContent = bits.join(' · ');
            }

            if (viewLink) {
                if (!liveMode || product.source === 'placeholder') {
                    viewLink.classList.add('hidden');
                } else {
                    viewLink.href = `/api/store/redirect?id=${encodeURIComponent(product.id)}`;
                    viewLink.classList.remove('hidden');
                }
            }

            const onAdd = () => addToCart(product, qtyEl ? qtyEl.value : 1);
            addBtn && addBtn.addEventListener('click', onAdd);
            stickyAdd && stickyAdd.addEventListener('click', onAdd);
        } catch (err) {
            notice(`Store is unavailable: ${String(err.message || err)}`);
            if (titleEl) titleEl.textContent = 'Unavailable';
        }
    };

    const loadCart = () => {
        const root = $('#store-cart');
        if (!root) return;
        renderRecentlyViewed();
        const itemsEl = $('#store-cart-items');
        const subtotalEl = $('#store-cart-subtotal');
        const marketSubtotalEl = $('#store-cart-market-subtotal');
        const premiumEl = $('#store-cart-premium');
        const clearBtn = $('#store-cart-clear');
        if (!itemsEl || !subtotalEl) return;

        const clampQty = (value) => Math.max(1, Math.floor(Number(value) || 1));

        const render = () => {
            const items = readCart();
            const subtotal = cartSubtotal();
            const marketSubtotal = cartMarketSubtotal();
            const premium = roundMoney(subtotal - marketSubtotal);

            subtotalEl.textContent = money(subtotal);
            if (marketSubtotalEl) marketSubtotalEl.textContent = money(marketSubtotal);
            if (premiumEl) {
                if (!Number.isFinite(premium)) premiumEl.textContent = '—';
                else premiumEl.textContent = premium >= 0 ? `+${money(premium)}` : money(premium);
            }

            if (items.length === 0) {
                itemsEl.innerHTML = `
                    <div class="store-empty-panel">
                        <h3>Your cart is empty.</h3>
                        <p>Go grab a few essentials and come back here to checkout.</p>
                        <div class="store-empty-actions">
                            <a class="btn btn-primary" href="store-category.html?category=protein">Shop protein</a>
                            <a class="btn btn-ghost" href="store.html">Store home</a>
                        </div>
                    </div>
                `.trim();
                return;
            }
            itemsEl.innerHTML = items.map((it) => {
                const safeName = String(it.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const safeNameAttr = safeName.replace(/\"/g, '&quot;');
                const qty = clampQty(it.qty);
                const productHref = `store-product.html?id=${encodeURIComponent(it.id)}`;
                const lineTotal = (Number(it.our_price) || 0) * qty;
                return `
                    <div class="store-cart-item" data-id="${it.id}">
                        <a class="store-cart-media" href="${productHref}" aria-label="View ${safeNameAttr}">
                            <img class="store-cart-img" src="${it.image}" alt="${safeName}">
                        </a>
                        <div class="store-cart-mid">
                            <div class="store-cart-head">
                                <a class="store-cart-name" href="${productHref}">${safeName}</a>
                                <button class="store-cart-remove" type="button" title="Remove" aria-label="Remove ${safeNameAttr}">×</button>
                            </div>
                            <div class="store-cart-prices">
                                <span class="store-cart-our">${money(it.our_price)}</span>
                                <span class="store-cart-market">${money(it.original_price)}</span>
                            </div>
                            <div class="store-cart-row">
                                <div class="store-qty-stepper" role="group" aria-label="Quantity">
                                    <button class="store-qty-btn" type="button" data-qty-step="dec" aria-label="Decrease quantity">−</button>
                                    <label class="store-cart-qty">
                                        <span class="sr-only">Quantity</span>
                                        <input type="number" inputmode="numeric" min="1" value="${qty}">
                                    </label>
                                    <button class="store-qty-btn" type="button" data-qty-step="inc" aria-label="Increase quantity">+</button>
                                </div>
                                <div class="store-cart-line" aria-label="Line total">${money(lineTotal)}</div>
                            </div>
                        </div>
                    </div>
                `.trim();
            }).join('\n');
        };

        itemsEl.addEventListener('click', (e) => {
            const row = e.target.closest('.store-cart-item');
            if (!row) return;
            const id = row.dataset.id;

            if (e.target.closest('.store-cart-remove')) {
                const items = readCart().filter((it) => String(it.id) !== String(id));
                writeCart(items);
                render();
                notice('Removed.');
                return;
            }

            const step = e.target.closest('[data-qty-step]')?.dataset?.qtyStep;
            if (step) {
                const items = readCart();
                const idx = items.findIndex((it) => String(it.id) === String(id));
                if (idx < 0) return;
                const current = clampQty(items[idx].qty);
                const next = step === 'inc' ? current + 1 : Math.max(1, current - 1);
                items[idx].qty = next;
                writeCart(items);
                render();
            }
        });

        itemsEl.addEventListener('change', (e) => {
            const input = e.target.closest('input[type="number"]');
            if (!input) return;
            const row = e.target.closest('.store-cart-item');
            if (!row) return;
            const id = row.dataset.id;
            const qty = clampQty(input.value);
            input.value = String(qty);
            const items = readCart();
            const idx = items.findIndex((it) => String(it.id) === String(id));
            if (idx >= 0) {
                items[idx].qty = qty;
                writeCart(items);
                render();
            }
        });

        clearBtn && clearBtn.addEventListener('click', () => {
            writeCart([]);
            render();
            notice('Cart cleared.');
        });

        render();
    };

    const loadCheckout = () => {
        const root = $('#store-checkout');
        if (!root) return;
        renderRecentlyViewed();
        const subtotalEl = $('#store-checkout-subtotal');
        const itemsEl = $('#store-checkout-items');
        const form = $('#store-checkout-form');
        const handoff = $('#store-handoff');
        const list = $('#store-handoff-list');

        const items = readCart();
        if (subtotalEl) subtotalEl.textContent = money(cartSubtotal());
        if (itemsEl) itemsEl.textContent = String(items.reduce((s, it) => s + (Number(it.qty) || 0), 0));

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                if (!handoff || !list) return;
                if (items.length === 0) {
                    notice('Your cart is empty.');
                    return;
                }
                handoff.classList.remove('hidden');
                list.innerHTML = items.map((it) => {
                    const safeName = String(it.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    return `
                        <a class="store-handoff-link" href="/api/store/redirect?id=${encodeURIComponent(it.id)}" target="_blank" rel="nofollow noopener">
                            ${safeName} <span class="store-handoff-qty">×${Number(it.qty) || 1}</span>
                        </a>
                    `.trim();
                }).join('\n');
                notice('Ready. Open each item to complete purchase.');
            });
        }
    };

    const wireGlobalSearch = () => {
        const form = $('#store-global-search-form');
        const input = $('#store-global-search');
        if (!form || !input) return;

        const existingQ = String(getParam('q', '')).trim();
        if (existingQ) input.value = existingQ;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const q = String(input.value || '').trim();
            const target = q
                ? `store-category.html?category=all&q=${encodeURIComponent(q)}`
                : 'store-category.html?category=protein';
            window.location.href = target;
        });
    };

    const wireShopDrawer = () => {
        const trigger = $('#store-shop-trigger');
        const overlay = $('#store-drawer-overlay');
        const closeBtn = $('#store-drawer-close');
        if (!trigger || !overlay || !closeBtn) return;

        const open = () => {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
        };
        const close = () => {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        };

        trigger.addEventListener('click', open);
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        syncCartBadges();
        wireGlobalSearch();
        wireShopDrawer();
        wireRowArrows();
        loadHome();
        loadCategory();
        loadProduct();
        loadCart();
        loadCheckout();
    });
})();
