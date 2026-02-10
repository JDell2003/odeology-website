/* ============================================
   CONFIG
   ============================================ */

const YOUTUBE_SHORTS_CONFIG = [
    {
        title: "Pull-day: scap control in 30 seconds",
        url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    },
    {
        title: "Macro guardrails for late lifters",
        url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    },
    {
        title: "Bench setup: 3 cues to stop drifting",
        url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    },
    {
        title: "Hypertrophy density finisher",
        url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    },
    {
        title: "Sleep stack that actually moves HRV",
        url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    },
    {
        title: "How to progress goblet squats weekly",
        url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    }
];

const YOUTUBE_SHORTS_ENDPOINT = "/api/shorts";
const YOUTUBE_SHORTS_MAX_RESULTS = 6;

const FORM_ENDPOINTS = {
    resources: "https://formspree.io/f/YOUR_FORM_ID",
    contact: "https://formspree.io/f/YOUR_FORM_ID"
};

const CHECKOUT_URLS = {
    training: "https://your-checkout-link.com/training",
    notebook: "https://your-checkout-link.com/notebook"
};

const RESOURCE_LINKS = {
    nutrition: "assets/nutrition-simplified.pdf", // replace with your real PDF
    tracker: "assets/workout-tracker.pdf"        // replace with your real PDF
};

const DISCIPLINE_PROFILES = {
    STRENGTH: {
        label: "Strength training",
        proteinBoost: 0.06,
        fatPreference: 0.26,
        carbBias: 1.05,
        mealSkew: "balanced",
        allowLiquid: true
    },
    MIXED: {
        label: "Mixed training",
        proteinBoost: 0.03,
        fatPreference: 0.24,
        carbBias: 1.0,
        mealSkew: "balanced",
        allowLiquid: true
    },
    CALISTHENICS: {
        label: "Bodyweight / calisthenics",
        proteinBoost: 0.02,
        fatPreference: 0.22,
        carbBias: 0.95,
        mealSkew: "protein",
        allowLiquid: false
    },
    DEFAULT: {
        label: "General fitness",
        proteinBoost: 0.03,
        fatPreference: 0.24,
        carbBias: 1.0,
        mealSkew: "balanced",
        allowLiquid: true
    }
};

const GOAL_FAT_PCTS = { CUT: 0.23, BULK: 0.28, RECOMP: 0.24, STRENGTH: 0.26 };
const SUPPLEMENT_MAP = { protein: 'Protein powder', carbs: 'Carb powder', fat: 'Fish oil' };
const MAX_MACRO_UNDERSHOOT = 0.15;
const SUPPLEMENT_RECOMMEND_PCT = 0.10;
const MAINTENANCE_RANGE = { min: 1.2, max: 1.35 };
const FAT_MIN_PER_LB = 0.25;
const LONG_TERM_NOTE = 'This is a starting estimate; real maintenance is validated by scale trends.';
const EM_DASH = '\u2014';

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
    const lo = Number(min);
    const hi = Number(max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return lo;
    return lo + Math.random() * (hi - lo);
}

function stableRandomInRange(sel, cacheKey, min, max) {
    if (!sel) return randomBetween(min, max);
    const key = String(cacheKey || 'default');
    const lo = Number(min);
    const hi = Number(max);
    sel._randCache = sel._randCache && typeof sel._randCache === 'object' ? sel._randCache : {};
    const existing = sel._randCache[key];
    if (existing && existing.min === lo && existing.max === hi && Number.isFinite(existing.value)) {
        return existing.value;
    }
    const value = randomBetween(lo, hi);
    sel._randCache[key] = { min: lo, max: hi, value };
    return value;
}

function flashElement(el, className, durationMs = 2200) {
    if (!el) return;
    const cls = String(className || '').trim();
    if (!cls) return;
    el.classList.add(cls);
    window.setTimeout(() => el.classList.remove(cls), Math.max(0, Number(durationMs) || 0));
}

function scrollToPlanCtaAndFlash() {
    const cta = document.getElementById('plan-cta');
    if (!cta) return;

    cta.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Flash after scrolling starts so the user sees it even if they're mid-scroll.
    window.setTimeout(() => flashElement(cta, 'cta-jump', 2200), 350);
}

function addSpinGlowToButton(btn) {
    if (!btn || btn.dataset.glowInit === '1') return;
    btn.dataset.glowInit = '1';
    btn.classList.add('btn-glow-spin');

    const glow = document.createElement('div');
    glow.className = 'btn-glow';

    // Wrap existing contents so the glow sits behind the label without changing sizing.
    const label = document.createElement('span');
    label.className = 'btn-label';
    while (btn.firstChild) label.appendChild(btn.firstChild);
    btn.appendChild(glow);
    btn.appendChild(label);
}

function inferDiscipline(selections) {
    const key = String(selections?.style || 'DEFAULT').toUpperCase();
    const profile = DISCIPLINE_PROFILES[key] || DISCIPLINE_PROFILES.DEFAULT;
    return { ...profile, key };
}

function leanBodyMass(weightLbs, sex, goal) {
    if (!Number.isFinite(weightLbs) || weightLbs <= 0) return 150;
    const baseBodyFat = sex === 'FEMALE' ? 0.26 : 0.18;
    const goalAdjustment = goal === 'CUT' ? -0.02 : goal === 'BULK' ? 0.01 : 0;
    const estimatedBodyFat = clamp(baseBodyFat + goalAdjustment, 0.12, 0.32);
    return Math.max(1, Math.round(weightLbs * (1 - estimatedBodyFat)));
}

function isLiquidFood(food) {
    if (!food) return false;
    const unit = String(food.macros?.serving_unit || '').toLowerCase();
    if (unit === 'ml') return true;
    const text = String(food.query || food.name || food.foodName || '').toLowerCase();
    const liquidTerms = ['milk', 'broth', 'shake', 'smoothie', 'juice', 'chocolate'];
    return liquidTerms.some(term => text.includes(term));
}

function normalizeGoal(value) {
    const g = String(value || '').toUpperCase();
    if (g === 'CUT' || g === 'LOSE' || g === 'FAT-LOSS') return 'CUT';
    if (g === 'BULK' || g === 'GAIN' || g === 'MUSCLE-GAIN') return 'BULK';
    if (g === 'STRENGTH') return 'STRENGTH';
    return 'RECOMP';
}

function normalizeMacroTargets(input) {
    const src = input || {};
    return {
        calories: Math.max(0, Math.round(Number(src.calories ?? src.kcal ?? 0) || 0)),
        protein_g: Math.max(0, Math.round(Number(src.protein_g ?? src.proteinG ?? src.protein ?? 0) || 0)),
        carbs_g: Math.max(0, Math.round(Number(src.carbs_g ?? src.carbG ?? src.carbs ?? 0) || 0)),
        fat_g: Math.max(0, Math.round(Number(src.fat_g ?? src.fatG ?? src.fat ?? 0) || 0))
    };
}

function scaledTargetsForPlanner(targets, scale) {
    const t = normalizeMacroTargets(targets);
    const s = Number(scale);
    if (!Number.isFinite(s) || s <= 0) return t;
    if (s === 1) return t;
    // Scale targets down to scale servings/cost proportionally, while keeping "no overshoot" safe.
    return {
        calories: Math.max(0, Math.floor(t.calories * s)),
        protein_g: Math.max(0, Math.floor(t.protein_g * s)),
        carbs_g: Math.max(0, Math.floor(t.carbs_g * s)),
        fat_g: Math.max(0, Math.floor(t.fat_g * s))
    };
}

function macroShortfallPct(target, actual) {
    const t = Number(target) || 0;
    const a = Number(actual) || 0;
    if (t <= 0) return 0;
    return Math.max(0, (t - a) / t);
}

function recommendedSupplementsForTotals({ macroTargets, dailyTotals }) {
    const target = (key) => Number(macroTargets?.[key]) || 0;
    const actual = (key) => Number(dailyTotals?.[key]) || 0;
    const deficit = (key) => Math.max(0, target(key) - actual(key));

    const rec = new Set();

    // Only recommend supplements we can actually render in the "Optional supplements" section.
    // Protein/carbs are meaningful gap fillers; fats are better handled via food selection / reconfigure.
    if (macroShortfallPct(target('protein_g'), actual('protein_g')) >= SUPPLEMENT_RECOMMEND_PCT || deficit('protein_g') >= 20) {
        rec.add('protein');
    }
    if (macroShortfallPct(target('carbs_g'), actual('carbs_g')) >= SUPPLEMENT_RECOMMEND_PCT || deficit('carbs_g') >= 50) {
        rec.add('carbs');
    }

    return rec;
}

// Single macro hierarchy scoring used everywhere (daily plans and meal candidates):
// Protein -> Calories -> Carbs -> Fat.
function scoreTotals(targets, totals, discipline) {
    const d = discipline || DISCIPLINE_PROFILES.DEFAULT;
    const p = macroShortfallPct(targets.protein_g, totals.protein_g);
    const cal = macroShortfallPct(targets.calories, totals.calories);
    const c = macroShortfallPct(targets.carbs_g, totals.carbs_g);
    const f = macroShortfallPct(targets.fat_g, totals.fat_g);

    // Calisthenics / relative strength: carbs can undershoot a bit more gracefully.
    const carbWeight = d.key === 'CALISTHENICS' ? 250 : 350;

    return (
        p * 1000 +
        cal * 650 +
        c * carbWeight +
        f * 200
    );
}

function scoreMeal(mealTargets, mealTotals, discipline) {
    return scoreTotals(mealTargets, mealTotals, discipline);
}

function servingsPerContainerFromFood(food) {
    const container = food?.container;
    if (!container) return null;

    // If the container is already described in "servings", honor it.
    if (String(container.unit || '').toLowerCase() === 'servings' && Number.isFinite(container.size)) {
        return Math.max(0, Number(container.size));
    }

    const serving = food?.serving;
    const size = Number(container.size);
    const amount = Number(serving?.amount);
    if (!Number.isFinite(size) || size <= 0) return null;
    if (!Number.isFinite(amount) || amount <= 0) return size;

    const containerUnit = String(container.unit || '').toLowerCase();
    const servingUnit = String(serving?.unit || '').toLowerCase();

    const unitMatches = containerUnit && servingUnit && (
        containerUnit === servingUnit ||
        (containerUnit === 'eggs' && servingUnit === 'egg') ||
        (containerUnit === 'eggs' && servingUnit === 'eggs') ||
        (containerUnit === 'cups' && servingUnit === 'cup')
    );

    // When units match, convert container size into "number of servings" for cost/inventory math.
    if (unitMatches) return size / amount;
    return size;
}

// Control panel elements
const controlPanel = document.getElementById('control-panel');
const controlCloseBtn = document.getElementById('control-close');

/* ============================================
   NAVIGATION
   ============================================ */

// Ã¢â€ºâ€ FOOD WIZARD KILL SWITCH - PERMANENTLY DISABLED
// These functions exist in legacy code but are permanently disabled
const FOOD_WIZARD_ENABLED = false;

// GROCERY FLOW - Navigate to grocery planning page when user clicks "Start Grocery List"
// HARD-WIRED: Direct navigation, no conditions, no state checks
function launchGroceryFlow() {
    // Save macros to sessionStorage before navigating
    if (typeof nutritionState !== 'undefined' && nutritionState.results) {
        const grocerySession = {
            macros: {
                calories: nutritionState.results.calories,
                proteinG: nutritionState.results.proteinG,
                carbG: nutritionState.results.carbG,
                fatG: nutritionState.results.fatG
            },
            proteinTarget: nutritionState.results.proteinG,
            timing: 'balanced',
            prep: 'batch'
        };
        sessionStorage.setItem('grocerySession', JSON.stringify(grocerySession));
    }
    window.location.href = 'grocery-final.html';
}

// Legacy functions (no-op for compatibility)
function openGroceryPage() { return; }    // Permanently disabled
function closeGroceryPage() { return; }   // Permanently disabled
function persistGrocerySession() { return; } // Permanently disabled
// Any attempt to open food wizard will silently fail

function setupNav() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    if (!hamburger || !navMenu) return;

    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });

    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => navMenu.classList.remove('active'));
    });
}

function setupMacroNavLink() {
    const navMenu = document.getElementById('nav-menu');
    if (!navMenu) return;
    const macroLink = navMenu.querySelector('a[href="macro-calculator.html"], a[data-macro-nav="1"]');
    if (!macroLink) return;

    const isIndexPage = () => {
        const path = String(location.pathname || '');
        return path === '/' || path.endsWith('/index.html') || path.endsWith('index.html') || !path.includes('.html');
    };

    const targetId = 'resources';
    const targetSelector = `#${targetId}`;
    const targetEl = document.querySelector(targetSelector);

    macroLink.dataset.macroNav = '1';
    macroLink.addEventListener('click', (e) => {
        const onIndex = isIndexPage();
        if (onIndex && targetEl) {
            e.preventDefault();
            try {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch {
                location.hash = targetSelector;
            }
            return;
        }
        macroLink.setAttribute('href', `index.html${targetSelector}`);
    });
}

/* ============================================
   SMOOTH SCROLL
   ============================================ */

function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

/* ============================================
   TRAINING HANDOFF (BLUEPRINT -> TRAINING)
   ============================================ */

function initTrainingHandoffOneOnOne() {
    if (!document.body?.classList?.contains('training-page')) return;

    const KEY = 'ode_training_handoff_1on1';
    if (sessionStorage.getItem(KEY) !== '1') return;
    try { sessionStorage.removeItem(KEY); } catch {}

    const root = document.getElementById('training-root');
    if (!root || !root.parentElement) return;

    const card = document.createElement('div');
    card.className = 'resource-card reveal';
    card.style.marginBottom = '1rem';
    card.innerHTML = `
        <div class="card-top">
            <h3>Next: Training</h3>
            <p class="ns-muted" id="ode-training-handoff-copy">Create an account to keep everything in one place. Training will still provide value now while we prep your call, and it helps us get the basics about your goals out of the way.</p>
        </div>
        <div class="blueprint-card-actions" style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" id="ode-training-handoff-cta">Create account</button>
            <button type="button" class="btn btn-ghost" id="ode-training-handoff-dismiss">Dismiss</button>
        </div>
        <p class="ns-muted" style="margin-top:0.75rem;">If you already have an account, sign in and stand by for a call within 24 hours.</p>
    `;

    root.parentElement.insertBefore(card, root);

    const copyEl = card.querySelector('#ode-training-handoff-copy');
    const cta = card.querySelector('#ode-training-handoff-cta');
    const dismiss = card.querySelector('#ode-training-handoff-dismiss');

    const openSignup = () => {
        try {
            document.getElementById('training')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
            // ignore
        }
        window.setTimeout(() => {
            const signupTab = document.querySelector('[data-tab="signup"]');
            if (signupTab && typeof signupTab.click === 'function') signupTab.click();
        }, 150);
    };

    const render = (user) => {
        const signedIn = Boolean(user);
        if (signedIn) {
            if (copyEl) copyEl.textContent = 'Thanks — you’re all set. Stand by for a call within 24 hours.';
            if (cta) {
                cta.textContent = 'You’re signed in';
                cta.setAttribute('disabled', 'true');
                cta.setAttribute('aria-disabled', 'true');
            }
        } else {
            if (copyEl) copyEl.textContent = 'Create an account to keep everything in one place. Training will still provide value now while we prep your call, and it helps us get the basics about your goals out of the way.';
            if (cta) {
                cta.textContent = 'Create account';
                cta.removeAttribute('disabled');
                cta.removeAttribute('aria-disabled');
            }
        }
    };

    cta?.addEventListener('click', openSignup);
    dismiss?.addEventListener('click', () => card.remove());

    // Default to signed-out copy; update when auth state arrives.
    render(null);
    window.addEventListener('odeauth', (e) => render(e?.detail?.user || null));
    fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.json())
        .then((data) => render(data?.user || null))
        .catch(() => {});
}

/* ============================================
   GROCERY RETURN HANDOFF
   ============================================ */

function checkGroceryReturn() {
    if (sessionStorage.getItem('groceryReturn') !== '1') return;
    sessionStorage.removeItem('groceryReturn');
    // Trigger the grocery page after return
    const openBtn = document.getElementById('ns-grocery-start');
    if (openBtn) openBtn.click();
}

/* ============================================
   YOUTUBE SHORTS
   ============================================ */

function renderYouTubeShortsGrid(shorts = YOUTUBE_SHORTS_CONFIG) {
    const shortsGrid = document.getElementById('shorts-grid');
    if (!shortsGrid) return;

    shortsGrid.innerHTML = '';
    shortsGrid.scrollLeft = 0;

    shorts.forEach(short => {
        const thumb = short.thumbnail || '';
        const card = document.createElement('div');
        card.className = 'short-card reveal';
        card.innerHTML = `
            <div class="short-thumbnail">
                <span class="short-badge">Short</span>
                <img src="${thumb}" alt="${short.title}" onerror="this.src='https://via.placeholder.com/360x640/1c1610/ffffff?text=Short'; this.dataset.fallback='1';">
                <div class="short-overlay"></div>
                <div class="short-play-icon"></div>
            </div>
            <div class="short-info">
                <p class="short-title">${short.title}</p>
                ${short.description ? `<p class="short-desc">${truncateText(short.description, 110)}</p>` : ''}
            </div>
        `;
        card.addEventListener('click', () => window.open(short.url, '_blank'));
        shortsGrid.appendChild(card);
    });

    setupShortsCarousel(true);
}

function truncateText(str, maxLength = 110) {
    if (!str) return '';
    return str.length > maxLength ? `${str.slice(0, maxLength).trim()}...` : str;
}

function setupShortsCarousel(force = false) {
    const track = document.getElementById('shorts-grid');
    const prev = document.getElementById('shorts-prev');
    const next = document.getElementById('shorts-next');
    if (!track || !prev || !next) return;

    const gap = () => {
        const styles = getComputedStyle(track);
        return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    };

    const cardWidth = () => {
        const card = track.querySelector('.short-card');
        if (!card) return track.clientWidth;
        const rect = card.getBoundingClientRect();
        return rect.width + gap();
    };

    const scrollStep = () => Math.max(cardWidth() * 2, track.clientWidth * 0.6);

    const updateButtons = () => {
        const maxScroll = track.scrollWidth - track.clientWidth - 2;
        prev.disabled = track.scrollLeft <= 0;
        next.disabled = track.scrollLeft >= maxScroll;
    };

    if (track.dataset.carouselInit === '1' && !force) {
        updateButtons();
        return;
    }
    track.dataset.carouselInit = '1';

    prev.addEventListener('click', () => {
        track.scrollBy({ left: -scrollStep(), behavior: 'smooth' });
    });
    next.addEventListener('click', () => {
        track.scrollBy({ left: scrollStep(), behavior: 'smooth' });
    });

    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);

    updateButtons();
}

async function fetchYouTubeShorts() {
        const params = new URLSearchParams({
            maxResults: String(YOUTUBE_SHORTS_MAX_RESULTS)
        });

    const response = await fetch(`${YOUTUBE_SHORTS_ENDPOINT}?${params.toString()}`, {
        headers: {
            "Accept": "application/json"
        }
    });

    if (!response.ok) throw new Error("Shorts API error");

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Unexpected shorts payload");

    return data.map(short => ({
        title: short.title || "Short",
        url: short.url || "#",
        thumbnail: short.thumbnail || (short.videoId ? `https://img.youtube.com/vi/${short.videoId}/hqdefault.jpg` : ""),
        description: short.description || "",
        videoId: short.videoId
    }));
}

async function loadYouTubeShorts() {
    const shortsGrid = document.getElementById('shorts-grid');
    if (!shortsGrid) return;

    shortsGrid.innerHTML = '<p class="section-subtitle">Loading shorts...</p>';

    try {
        const shorts = await fetchYouTubeShorts();
        if (shorts.length) {
            renderYouTubeShortsGrid(shorts);
            return;
        }
        throw new Error("No shorts returned");
    } catch (err) {
        console.warn("Falling back to static shorts config:", err.message);
        renderYouTubeShortsGrid();
    }
}

/* ============================================
   BUDGET TIER & CONSTRAINT SYSTEM
   ============================================ */

// Budget tiers with protein multipliers (g per lb bodyweight)
const BUDGET_TIERS = {
    survival: { maxWeekly: 45, proteinMultiplier: 0.7, label: 'Survival' },
    realistic: { maxWeekly: 70, proteinMultiplier: 0.85, label: 'Realistic' },
    comfortable: { maxWeekly: Infinity, proteinMultiplier: 1.0, label: 'Comfortable' }
};

/**
 * Determine budget tier from weekly budget
 */
function getBudgetTier(weeklyBudget) {
    if (weeklyBudget < 45) return 'survival';
    if (weeklyBudget < 70) return 'realistic';
    return 'comfortable';
}

/**
 * Calculate maximum achievable protein based on budget and cheapest protein sources
 * Uses eggs (cheapest protein per gram) as the baseline
 */
function calculateMaxAchievableProtein(weeklyBudget) {
    // Cheapest protein sources in our baseline:
    // Eggs: $4.82 for 12 eggs = 72g protein = $0.067/g protein
    // Ground turkey: $1.98/lb = 60g protein = $0.033/g protein (even cheaper!)
    // Chicken breast: $12.18/80oz = ~500g protein = $0.024/g protein (cheapest!)
    
    // Use weighted average of available cheap proteins
    // Assume 70% from chicken ($0.024/g), 20% from turkey ($0.033/g), 10% from eggs ($0.067/g)
    const avgCostPerGramProtein = 0.70 * 0.024 + 0.20 * 0.033 + 0.10 * 0.067;
    // = 0.0168 + 0.0066 + 0.0067 = $0.0301/g protein
    
    // Weekly budget, but need to reserve ~40% for carb sources
    const proteinBudget = weeklyBudget * 0.60;
    const maxDailyProtein = Math.floor((proteinBudget / avgCostPerGramProtein) / 7);
    
    console.log(`Max achievable protein: ${maxDailyProtein}g/day with $${weeklyBudget}/week budget`);
    return maxDailyProtein;
}

/**
 * Calculate fat floor based on bodyweight and calories (not hardcoded)
 */
function showBudgetWarningModal(userProtein, maxProtein, weeklyBudget, tier) {
    return new Promise((resolve) => {
        // Create modal HTML
        const modalHtml = `
            <div class="budget-warning-modal" id="budget-warning-modal">
                <div class="budget-warning-content">
                    <h3>Ã¢Å¡Â Ã¯Â¸Â Budget vs Protein Mismatch</h3>
                    <p class="warning-text">
                        Your protein target of <strong>${userProtein}g/day</strong> exceeds what's achievable 
                        with your <strong>$${weeklyBudget}/week</strong> budget.
                    </p>
                    <p class="tier-info">
                        Budget tier: <strong>${BUDGET_TIERS[tier].label}</strong><br>
                        Max achievable protein: <strong>${maxProtein}g/day</strong>
                    </p>
                    <div class="warning-options">
                        <button class="btn btn-primary" id="budget-lower-protein">
                            Ã¢Å“â€¦ Lower protein to ${maxProtein}g
                        </button>
                        <button class="btn btn-secondary" id="budget-increase">
                            Ã°Å¸â€™Â° I'll increase my budget
                        </button>
                        <button class="btn btn-warning" id="budget-continue-anyway">
                            Ã¢Å¡Â Ã¯Â¸Â Continue anyway (survival mode)
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to DOM
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);
        
        const modal = document.getElementById('budget-warning-modal');
        
        // Add click handlers
        document.getElementById('budget-lower-protein').addEventListener('click', () => {
            modal.remove();
            resolve({ action: 'lower-protein', newProtein: maxProtein });
        });
        
        document.getElementById('budget-increase').addEventListener('click', () => {
            modal.remove();
            resolve({ action: 'increase-budget' });
        });
        
        document.getElementById('budget-continue-anyway').addEventListener('click', () => {
            modal.remove();
            resolve({ action: 'continue-survival', tier: 'survival' });
        });
    });
}

/**
 * Apply price adjustment percentage to a base price
 * @param {number} basePrice - Original price
 * @param {number} adjustmentPercent - Adjustment percentage (-20 to +20)
 * @returns {number} Adjusted price
 */
function applyPriceAdjustment(basePrice, adjustmentPercent = 0) {
    if (!adjustmentPercent) return basePrice;
    return basePrice * (1 + adjustmentPercent / 100);
}

/**
 * Get the current price adjustment from prefs
 */
function getPriceAdjustment() {
    try {
        const prefs = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
        return Number(prefs?.priceAdjustment || 0);
    } catch (e) {
        return 0;
    }
}

/* ============================================
   NUTRITION SIMPLIFIED: BASELINE PROTOCOL
   ============================================ */

const nutritionState = {
    step: 0,
    selections: {
        goal: null,
        style: null,
        frequency: null,
        sex: null,
        ageRange: '25-34',
        heightIn: null,
        weightLbs: null,
        intensity: null,
        mealsOut: null
    },
    tags: {},
    results: null,
    emailCaptured: false,
    macrosUnlocked: false,
    hasUnlockedMacros: false
};

// Walmart baseline foods with container info
const WALMART_BASELINE_FOODS = [
  {
    id: "ground_beef_80_20",
    name: "80/20 Ground Beef",
    store: "Walmart",
    category: "protein_fat",
    url: "https://www.walmart.com/ip/80-Lean-20-Fat-Ground-Beef-Chuck-5-lb-Roll-Fresh-All-Natural/15136796",
    image: "assets/images/products/ground-beef.jpg",
    serving: { amount: 4, unit: "oz" },
    macros: { calories: 290, protein: 19, carbs: 0, fat: 23 },
    container: { size: 80, unit: "oz", price: 26.43 }
  },
  {
    id: "eggs_large",
    name: "Large Eggs (60ct)",
    store: "Walmart",
    category: "protein_fat",
    url: "https://www.walmart.com/ip/Great-Value-Large-White-Eggs-60-Count/193637719",
    image: "assets/images/products/eggs.jpg",
    serving: { amount: 1, unit: "egg" },
    macros: { calories: 70, protein: 6, carbs: 0, fat: 5 },
    container: { size: 60, unit: "eggs", price: 9.56 }
  },
  {
    id: "tilapia_fillet",
    name: "Tilapia Fillets (4lb)",
    store: "Walmart",
    category: "protein",
    url: "https://www.walmart.com/ip/Great-Value-Frozen-Tilapia-Skinless-Boneless-Fillets-4-lb/123210797",
    image: "assets/images/products/tilapia.jpg",
    serving: { amount: 4, unit: "oz" },
    macros: { calories: 90, protein: 20, carbs: 0, fat: 2 },
    container: { size: 64, unit: "oz", price: 19.68 }
  },
  {
    id: "white_rice_dry",
    name: "White Rice - Measure Dry (20lb)",
    store: "Walmart",
    category: "carb",
    url: "https://www.walmart.com/ip/Great-Value-Long-Grain-Enriched-Rice-20-lb/10315883",
    image: "assets/images/products/rice.jpg",
    serving: { amount: 0.25, unit: "cup" },
    macros: { calories: 160, protein: 3, carbs: 36, fat: 0 },
    container: { size: 40, unit: "cups", price: 11.46 }
  },
  {
    id: "chocolate_milk_lowfat",
    name: "Chocolate Milk (1gal)",
    store: "Walmart",
    category: "carb_protein",
    url: "https://www.walmart.com/ip/Great-Value-1-Low-fat-Chocolate-Milk-Gallon-Plastic-Jug-128-Fl-Oz/17248403",
    image: "assets/images/products/chocolate-milk.jpg",
    serving: { amount: 1, unit: "cup" },
    macros: { calories: 150, protein: 8, carbs: 24, fat: 2.5 },
    container: { size: 16, unit: "cups", price: 4.34 }
  },
  {
    id: "olive_oil",
    name: "Extra Virgin Olive Oil (8.5oz)",
    store: "Walmart",
    category: "fat",
    url: "https://www.walmart.com/ip/GEM-Extra-Virgin-Olive-Oil-for-Seasoning-and-Finishing-8-5-fl-oz/16627927",
    image: "https://i5.walmartimages.com/seo/GEM-Extra-Virgin-Olive-Oil-for-Seasoning-and-Finishing-8-5-fl-oz_ddf17157-471d-45ab-817f-6c2919582cb2_2.ebf3e610553d4219641ba6f3a8160cae.png?odnHeight=2000&odnWidth=2000&odnBg=FFFFFF",
    serving: { amount: 1, unit: "tbsp" },
    macros: { calories: 120, protein: 0, carbs: 0, fat: 14 },
    container: { size: 17, unit: "tbsp", price: 4.48 }
  },
  {
    id: "chicken_breast",
    name: "Boneless Skinless Chicken Breast",
    store: "Walmart",
    category: "lean_protein",
    url: "https://www.walmart.com/ip/Boneless-Skinless-Chicken-Breasts-4-7-6-1-lb-Tray/27935840",
    image: "https://i5.walmartimages.com/seo/Boneless-Skinless-Chicken-Breasts-4-7-6-1-lb-Tray_4693e429-b926-4913-984c-dd29d4bdd586.780145c264e407b17e86cd4a7106731f.jpeg?odnHeight=2000&odnWidth=2000&odnBg=FFFFFF",
    serving: { amount: 4, unit: "oz" },
    macros: { calories: 140, protein: 25, carbs: 0, fat: 4 },
    container: { size: 80, unit: "oz", price: 12.18 } // ~5lb avg
  },
  {
    id: "instant_oats",
    name: "Instant Oats (18oz)",
    store: "Walmart",
    category: "carb",
    url: "https://www.walmart.com/ip/Great-Value-Instant-Oats-Tube-18-oz/10315248",
    image: "https://i5.walmartimages.com/asr/1338f1da-87d4-4675-883f-227bddb100a7.59b9ae461fe7b7df9d71054793ab75fa.jpeg?odnHeight=2000&odnWidth=2000&odnBg=FFFFFF",
    serving: { amount: 0.5, unit: "cup" },
    macros: { calories: 150, protein: 5, carbs: 27, fat: 2.5 },
    container: { size: 13, unit: "servings", price: 2.66 }
  },
  {
    id: "russet_potatoes",
    name: "Russet Potatoes (5lb)",
    store: "Walmart",
    category: "carb",
    url: "https://www.walmart.com/ip/Fresh-Idaho-Russet-Potatoes-5-lb-Bag/10447839",
    image: "https://i5.walmartimages.com/asr/88647cbf-3bae-4864-b88c-4b027deb19a5.51c4d6dffee051f6c7a779f789cbfa22.png?odnHeight=573&odnWidth=573&odnBg=FFFFFF",
    serving: { amount: 1, unit: "potato" },
    macros: { calories: 110, protein: 3, carbs: 26, fat: 0 },
    container: { size: 15, unit: "potatoes", price: 2.84 } // ~15 medium potatoes per 5lb
  },
  {
    id: "ground_turkey_93_7",
    name: "93/7 Ground Turkey (1lb)",
    store: "Walmart",
    category: "lean_protein",
    url: "https://www.walmart.com/ip/FESTIVE-Ground-Turkey-Frozen-1-lb-Roll/22210558",
    image: "https://i5.walmartimages.com/asr/a2dca5b3-72ef-4d48-8b32-ab4026f16845.7d220019febb7f47e3b0d80708fc876a.jpeg?odnHeight=2000&odnWidth=2000&odnBg=FFFFFF",
    serving: { amount: 4, unit: "oz" },
    macros: { calories: 200, protein: 15, carbs: 0, fat: 15 },
    container: { size: 16, unit: "oz", price: 1.98 }
  }
];

/**
 * Calculate grocery costs using inventory depletion model
 * @param {Array} groceryItems - Array of food items with daily consumption and container info
 * @param {Date} startDate - The date groceries are purchased (defaults to today)
 * @returns {Object} { thisMonthCost, avgMonthlyCost, itemBreakdown }
 */
function calculateInventoryCosts(groceryItems, startDate = new Date()) {
    // Get days remaining in current month (including start date)
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const currentDay = startDate.getDate();
    const daysRemainingInMonth = lastDayOfMonth - currentDay + 1; // +1 to include start day
    
    let thisMonthCost = 0;
    let avgMonthlyCost = 0;
    const itemBreakdown = [];
    
    groceryItems.forEach(item => {
        const dailyConsumption = item.daily || 0;
        const containerSize = Number(item.servingsPerContainer) || Number(item.container?.servings) || Number(item.container?.size) || 1;
        const pricePerContainer = item.container?.price || 0;
        
        if (dailyConsumption <= 0 || containerSize <= 0) {
            itemBreakdown.push({
                ...item,
                purchasesThisMonth: 0,
                thisMonthCost: 0,
                avgMonthlyCost: 0,
                daysPerContainer: Infinity,
                nextPurchaseDay: null
            });
            return;
        }
        
        // How many days does one container last?
        const daysPerContainer = containerSize / dailyConsumption;

        // === THIS MONTH CALCULATION ===
        // Use a direct model (not a day-by-day loop) so it stays correct even when
        // dailyConsumption > containerSize (which can require multiple containers per day).
        const totalNeededThisMonth = dailyConsumption * daysRemainingInMonth;
        const purchasesThisMonth = Math.max(1, Math.ceil(totalNeededThisMonth / containerSize));
        const purchaseDays = []; // legacy debug only; not used in UI
        
        const itemThisMonthCost = purchasesThisMonth * pricePerContainer;
        thisMonthCost += itemThisMonthCost;
        
        // === AVG MONTHLY CALCULATION ===
        // Based on 30-day normalized consumption
        const avgDaysPerMonth = 30;
        const containersPerMonth = (dailyConsumption * avgDaysPerMonth) / containerSize;
        const itemAvgMonthlyCost = containersPerMonth * pricePerContainer;
        avgMonthlyCost += itemAvgMonthlyCost;
        
        itemBreakdown.push({
            ...item,
            purchasesThisMonth,
            purchaseDays,
            thisMonthCost: itemThisMonthCost,
            avgMonthlyCost: itemAvgMonthlyCost,
            daysPerContainer: Math.round(daysPerContainer * 10) / 10,
            daysRemainingInMonth
        });
    });
    
    return {
        thisMonthCost: Math.round(thisMonthCost * 100) / 100,
        avgMonthlyCost: Math.round(avgMonthlyCost * 100) / 100,
        itemBreakdown,
        daysRemainingInMonth,
        startDate
    };
}

const groceryFoods = {
    protein: [
        { id: 'chicken', name: 'Chicken breast', macros: '31g P / 0g C / 3g F per 100g' },
        { id: 'turkey', name: 'Lean ground turkey', macros: '27g P / 0g C / 4g F per 100g' },
        { id: 'eggs', name: 'Eggs', macros: '13g P / 1g C / 11g F per 2 eggs' },
        { id: 'salmon', name: 'Salmon', macros: '25g P / 0g C / 14g F per 100g' },
        { id: 'greek-yogurt', name: 'Greek yogurt (0%)', macros: '10g P / 6g C / 0g F per 100g' },
        { id: 'tofu', name: 'Tofu', macros: '8g P / 2g C / 5g F per 100g' },
        { id: 'shrimp', name: 'Shrimp', macros: '24g P / 0g C / 1g F per 100g' },
        { id: 'pork-loin', name: 'Pork loin', macros: '26g P / 0g C / 5g F per 100g' },
        { id: 'cottage', name: 'Cottage cheese (low-fat)', macros: '12g P / 4g C / 2g F per 100g' },
        { id: 'whey', name: 'Whey isolate', macros: '25g P / 1g C / 0g F per scoop' },
        { id: 'edamame', name: 'Edamame', macros: '11g P / 10g C / 5g F per 100g' }
    ],
    carb: [
        { id: 'rice', name: 'Jasmine rice (measure dry)', macros: '2g P / 45g C / 0g F per cup cooked' },
        { id: 'oats', name: 'Rolled oats', macros: '10g P / 54g C / 6g F per cup' },
        { id: 'potato', name: 'Russet potato', macros: '4g P / 37g C / 0g F per 200g' },
        { id: 'pasta', name: 'Whole wheat pasta', macros: '8g P / 37g C / 2g F per cup cooked' },
        { id: 'beans', name: 'Black beans', macros: '15g P / 41g C / 1g F per cup' },
        { id: 'quinoa', name: 'Quinoa', macros: '8g P / 39g C / 4g F per cup cooked' },
        { id: 'bagel', name: 'Plain bagel', macros: '11g P / 56g C / 2g F each' },
        { id: 'tortilla', name: 'Flour tortilla', macros: '5g P / 25g C / 4g F each' },
        { id: 'cereal', name: 'High-fiber cereal', macros: '10g P / 40g C / 2g F per cup' },
        { id: 'fruit', name: 'Mixed berries', macros: '1g P / 21g C / 0g F per cup' }
    ],
    fat: [
        { id: 'olive', name: 'Olive oil', macros: '0g P / 0g C / 14g F per tbsp' },
        { id: 'avocado', name: 'Avocado', macros: '3g P / 12g C / 21g F per fruit' },
        { id: 'almonds', name: 'Almonds', macros: '6g P / 6g C / 14g F per 28g' },
        { id: 'peanut-butter', name: 'Peanut butter', macros: '8g P / 6g C / 16g F per 2 tbsp' },
        { id: 'cashews', name: 'Cashews', macros: '5g P / 9g C / 12g F per 28g' },
        { id: 'butter', name: 'Grass-fed butter', macros: '0g P / 0g C / 11g F per tbsp' },
        { id: 'walnuts', name: 'Walnuts', macros: '4g P / 4g C / 18g F per 28g' },
        { id: 'chia', name: 'Chia seeds', macros: '5g P / 12g C / 9g F per 28g' },
        { id: 'dark-choc', name: 'Dark chocolate (85%)', macros: '3g P / 13g C / 12g F per 30g' },
        { id: 'bacon', name: 'Turkey bacon', macros: '6g P / 0g C / 4g F per slice' },
        { id: 'cheddar', name: 'Cheddar cheese', macros: '7g P / 1g C / 9g F per 28g' }
    ]
};

const NS_LOADER_LINES = [
    'Calculating caloriesÃ¢â‚¬Â¦',
    'Adjusting for your training styleÃ¢â‚¬Â¦',
    'Finalizing baseline protocolÃ¢â‚¬Â¦'
];

let nsLoaderInterval = null;

function initNutritionFunnel() {
    const entry = document.getElementById('ns-entry');
    const flow = document.getElementById('ns-flow');
    if (!entry || !flow) return;

    // Allow deep-linking into the nutrition + grocery generator funnel.
    // Used by the left control panel "Grocery List Generator" to restart from the beginning.
    try {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        const shouldResetGrocery = params.get('reset') === 'grocery';
        const shouldStart = params.get('ns') === 'start' || url.hash === '#ns-entry';

        if (shouldResetGrocery) {
            try {
                [
                    'grocerySession',
                    'groceryPrefs',
                    'groceryPurchaseOverrides',
                    'groceryExpiredOverrides',
                    'groceryStartDate',
                    'groceryReturn',
                    'groceryItemChoice',
                    'adjustedBaselineFoods',
                    'ode_hint_update_macros'
                ].forEach(k => sessionStorage.removeItem(k));
            } catch {
                // ignore
            }
            resetNutritionFlow();
        }

        if (shouldStart) {
            window.setTimeout(() => {
                try {
                    document.getElementById('ns-entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch {
                    // ignore
                }
            }, 60);
        }

        if (shouldResetGrocery || shouldStart) {
            // Prevent re-running on refresh/back.
            params.delete('reset');
            params.delete('ns');
            const nextUrl = `${url.pathname}${params.toString() ? `?${params.toString()}` : ''}${url.hash || ''}`;
            history.replaceState(null, '', nextUrl);
        }
    } catch {
        // ignore
    }

    const startBtn = document.getElementById('ns-start');
    const progressFill = document.getElementById('ns-progress-fill');
    const progressLabel = document.getElementById('ns-progress-label');
    const progressStatus = document.getElementById('ns-progress-status');
    const loader = document.getElementById('ns-loader');
    const loaderText = document.getElementById('ns-loader-text');

    const steps = {
        1: document.getElementById('ns-step-1'),
        2: document.getElementById('ns-step-2'),
        3: document.getElementById('ns-step-3')
    };

    const next1 = document.getElementById('ns-next-1');
    const next2 = document.getElementById('ns-next-2');
    const back2 = document.getElementById('ns-back-2');

    const unlockBtn = document.getElementById('ns-unlock-btn');
    const emailForm = document.getElementById('ns-email-form');
    const emailInput = document.getElementById('ns-email');
    const emailSubmit = document.getElementById('ns-email-submit');
    const emailOptin = document.getElementById('ns-email-optin');
    const macrosBlock = document.getElementById('ns-macros');
    const downloadBlock = document.getElementById('ns-download-block');
    const unlockBlock = document.getElementById('ns-unlock-block');
    const downloadBtn = document.getElementById('ns-download');
    const printBtn = document.getElementById('ns-print');
    const handoff = document.getElementById('ns-handoff');
    const handoffGoal = document.getElementById('ns-handoff-goal');
    const buildPlanBtn = document.getElementById('ns-build-plan');
    const restartBtn = document.getElementById('ns-restart');
    const startGroceryPrimary = document.getElementById('ns-start-grocery-primary');
    const redoCalculationBtn = document.getElementById('ns-redo-calculation');
    const groceryGateModal = document.getElementById('ns-grocery-gate-modal');
    const groceryGateUnlockBtn = document.getElementById('ns-grocery-gate-unlock');
    const startGrocery = document.getElementById('ns-start-grocery');
    const groceryStart = document.getElementById('ns-grocery-start');
    const groceryGate = document.getElementById('ns-grocery-gate');
    const groceryGateBtn = document.getElementById('ns-grocery-unlock');
    const groceryPage = document.getElementById('grocery-page');
    const groceryBack = document.getElementById('grocery-back');
    const groceryNext = document.getElementById('grocery-next');
    const groceryFinal = document.getElementById('grocery-final');
    const finalBack = document.getElementById('g-final-back');
    const finalSave = document.getElementById('g-final-save');
    const loopRows = {
        protein: [document.getElementById('loop-protein-1'), document.getElementById('loop-protein-2')],
        carb: [document.getElementById('loop-carb-1'), document.getElementById('loop-carb-2')],
        fat: [document.getElementById('loop-fat')]
    };
    const loopMacros = {
        cal: document.getElementById('g-mac-cal'),
        pro: document.getElementById('g-mac-pro'),
        car: document.getElementById('g-mac-car'),
        fat: document.getElementById('g-mac-fat')
    };
    const gInputs = {
        store: document.getElementById('g-store'),
        meals: document.getElementById('g-meals'),
        workout: document.getElementById('g-workout'), // legacy fallback
        workoutTime: document.getElementById('g-workout-time'),
        timing: document.getElementById('g-timing'),
        prep: document.getElementById('g-prep'),
        proteinPerMeal: document.getElementById('g-protein-per-meal'),
        budgetTotal: document.getElementById('g-budget-total'),
        wakeTime: document.getElementById('g-wake-time'),
        zip: document.getElementById('g-zip'),
        dietaryPref: document.getElementById('g-dietary-pref'),
        allergies: document.getElementById('g-allergies'),
        tasteCost: document.getElementById('g-taste-cost')
    };

    // FOOD WIZARD DISABLED - All references permanently removed

    const startFlow = () => {
        entry.classList.add('hidden');
        flow.classList.remove('hidden');
        nutritionState.step = 1;
        showStep(1);
        try {
            flow.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
            // ignore
        }
    };

    startBtn?.addEventListener('click', startFlow);

    // Deep-link support: allow other pages to send users straight into the questions flow.
    try {
        const u = new URL(window.location.href);
        const wantsStart = (u.searchParams.get('ns') || '').toLowerCase() === 'start';
        if (wantsStart) startFlow();
    } catch {
        // ignore
    }

    let nsAuthUser = null;
    const isSignedIn = () => Boolean(nsAuthUser);
    const setSignedInMode = (user) => {
        nsAuthUser = user || null;
        if (!nsAuthUser) return;
        try {
            emailInput?.removeAttribute('required');
        } catch {
            // ignore
        }
        emailForm?.classList.add('hidden');
    };

    window.addEventListener('odeauth', (e) => setSignedInMode(e?.detail?.user || null));
    fetch('/api/auth/me', { credentials: 'include' })
        .then(r => r.json())
        .then((data) => setSignedInMode(data?.user || null))
        .catch(() => {});

    const unlockMacrosUi = (reason) => {
        if (!nutritionState?.results) return;
        if (nutritionState.macrosUnlocked) return;

        nutritionState.emailCaptured = true;
        nutritionState.macrosUnlocked = true;
        nutritionState.hasUnlockedMacros = true;

        try {
            postTrackEvent('nutrition_unlock', { method: isSignedIn() ? 'account' : 'email', reason: String(reason || '') });
        } catch {
            // ignore
        }

        unlockBlock?.classList.add('hidden');
        macrosBlock?.classList.remove('locked');
        macrosBlock?.querySelector('.ns-lock-overlay')?.classList.add('hidden');

        downloadBlock?.classList.add('hidden');
        handoff?.classList.remove('hidden');
        groceryGate?.classList.add('hidden');

        if (startGroceryPrimary) {
            startGroceryPrimary.focus();
            setTimeout(() => handoff?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    };

    groceryGateUnlockBtn?.addEventListener('click', () => {
        // Hide modal
        groceryGateModal?.classList.add('hidden');
        
        // Reveal email form (same as clicking unlock button)
        if (isSignedIn()) {
            unlockMacrosUi('signed_in_gate');
            return;
        }
        emailForm.classList.remove('hidden');
        
        // Scroll to unlock section
        unlockBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    startGrocery?.addEventListener('click', () => {
        launchGroceryFlow();
    });
    
    const groceryStartModal = document.getElementById('ns-grocery-start-modal');
    const groceryStartUnlock = document.getElementById('ns-grocery-start-unlock');
    const groceryStartClose = document.getElementById('ns-grocery-start-close');
    
    groceryStart?.addEventListener('click', () => {
        // Check if macros have been unlocked
        if (!nutritionState.macrosUnlocked) {
            // Show custom popup instead of navigating
            groceryStartModal?.classList.remove('hidden');
            return;
        }
        
        // Save macros to sessionStorage before navigating
        if (nutritionState.results) {
            const grocerySession = {
                macros: {
                    calories: nutritionState.results.calories,
                    proteinG: nutritionState.results.proteinG,
                    carbG: nutritionState.results.carbG,
                    fatG: nutritionState.results.fatG
                },
                proteinTarget: nutritionState.results.proteinG,
                timing: 'balanced',
                prep: 'batch'
            };
            sessionStorage.setItem('grocerySession', JSON.stringify(grocerySession));
        }
        
        // Navigate to grocery flow
        window.location.href = 'grocery-final.html';
    });
    
    groceryStartUnlock?.addEventListener('click', () => {
        // Hide the modal
        groceryStartModal?.classList.add('hidden');
        
        // Reveal email form
        if (isSignedIn()) {
            unlockMacrosUi('signed_in_start_grocery');
            return;
        }
        emailForm.classList.remove('hidden');
        
        // Scroll to unlock section
        unlockBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    
    groceryStartClose?.addEventListener('click', () => {
        groceryStartModal?.classList.add('hidden');
    });
    
    // Close modal on overlay click
    groceryStartModal?.addEventListener('click', (e) => {
        if (e.target === groceryStartModal) {
            groceryStartModal.classList.add('hidden');
        }
    });
    gInputs.meals?.addEventListener('input', () => {
        gInputs.meals.dataset.userSet = '1';
        updateProteinRecommendation(true);
    });

    // Handle dietary preference buttons
    document.querySelectorAll('.diet-options .diet-btn')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.diet-options .diet-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gInputs.dietaryPref.value = btn.dataset.diet;
            console.log('Dietary preference selected:', btn.dataset.diet);
        });
    });

    // Handle allergies checkboxes
    document.querySelectorAll('.allergy-input')?.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const selected = Array.from(document.querySelectorAll('.allergy-input:checked'))
                .map(c => c.value)
                .join(',');
            gInputs.allergies.value = selected;
            console.log('Allergies selected:', selected);
        });
    });

    // Handle taste vs cost preference buttons
    document.querySelectorAll('.taste-cost-options .taste-cost-btn')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.taste-cost-options .taste-cost-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gInputs.tasteCost.value = btn.dataset.preference;
            console.log('Taste vs cost preference selected:', btn.dataset.preference);
        });
    });

    // Handle budget buttons
    document.querySelectorAll('.budget-options .budget-btn')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.budget-options .budget-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gInputs.budgetTotal.value = btn.dataset.budget;
            console.log('Budget selected:', btn.dataset.budget);
        });
    });

    // Handle meal buttons
    document.querySelectorAll('.meal-options .meal-btn')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.meal-options .meal-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gInputs.meals.value = btn.dataset.meals;
            console.log('Meals per day selected:', btn.dataset.meals);
        });
    });

    // Handle prep buttons
    document.querySelectorAll('.prep-options .prep-btn')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.prep-options .prep-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gInputs.prep.value = btn.dataset.prep;
            console.log('Prep style selected:', btn.dataset.prep);
        });
    });

    // Handle store dropdown
    gInputs.store?.addEventListener('change', () => {
        console.log('Store selected:', gInputs.store.value);
    });

    document.querySelectorAll('.ns-button-grid, .ns-icon-grid').forEach(group => {
        group.addEventListener('click', e => {
            const btn = e.target.closest('button[data-value]');
            if (!btn) return;
            const groupName = group.dataset.group;
            selectPill(group, btn);
            nutritionState.selections[groupName] = btn.dataset.value;
            updateTagsFromSelections();
        });
    });

    next1?.addEventListener('click', () => {
        if (!nutritionState.selections.goal || !nutritionState.selections.style || !nutritionState.selections.frequency) {
            alert('Select a goal, training style, and frequency to continue.');
            return;
        }
        setProgress(2, 'Step 2 of 3', 'Body & Training');
        switchStep(1, 2);
    });

    back2?.addEventListener('click', () => {
        setProgress(1, 'Step 1 of 3', 'Goals & Training');
        switchStep(2, 1);
    });

    next2?.addEventListener('click', () => {
        if (!collectStep2()) return;
        runLoader(() => {
            nutritionState.results = calculateNutritionPlan(nutritionState.selections);
            paintResults(nutritionState.results);
            try {
                const r = nutritionState.results || {};
                postTrackEvent('nutrition_results', {
                    calories: r.calories,
                    proteinG: r.proteinG,
                    carbG: r.carbG,
                    fatG: r.fatG,
                    selections: nutritionState.selections || {}
                });
            } catch {
                // ignore
            }
            if (isSignedIn()) unlockMacrosUi('signed_in_auto');
            setProgress(3, 'Step 3 of 3', 'Results');
            switchStep(2, 3);
        });
    });

    unlockBtn?.addEventListener('click', () => {
        if (isSignedIn()) {
            unlockMacrosUi('signed_in_click');
            return;
        }
        emailForm.classList.remove('hidden');
    });

    const captureNutritionEmail = (reason) => {
        try {
            if (!emailInput) return;
            const email = String(emailInput.value || '').trim();
            if (!email) return;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
            if (nutritionState.lastCapturedEmail === email) return;
            nutritionState.lastCapturedEmail = email;

            const emailOptInOk = emailOptin ? Boolean(emailOptin.checked) : true;
            const snapshot = {
                flow: 'nutrition',
                reason: String(reason || ''),
                selections: nutritionState.selections || {},
                tags: nutritionState.tags || [],
                results: nutritionState.results || null
            };

            // Always attach the identifier to the guest profile immediately.
            postTrackEvent('guest_identify', { email, source: 'nutrition_email', emailOptIn: emailOptInOk });

            fetch('/api/track/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    source: 'nutrition',
                    email,
                    emailOptIn: emailOptInOk,
                    wants: ['nutrition_macros'],
                    snapshot,
                    path: `${location.pathname}${location.search}${location.hash}`
                })
            }).catch(() => {});
        } catch {
            // ignore
        }
    };

    groceryGateBtn?.addEventListener('click', () => {
        unlockBtn?.click();
        unlockBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    emailInput?.addEventListener('blur', () => captureNutritionEmail('blur'));
    emailInput?.addEventListener('change', () => captureNutritionEmail('change'));

    emailSubmit?.addEventListener('click', () => {
        const email = (emailInput.value || '').trim();
        if (isSignedIn() && !email) {
            unlockMacrosUi('signed_in_unlock_now');
            return;
        }
        if (!email || !email.includes('@')) {
            alert('Enter a valid email to unlock your macros.');
            return;
        }
        const emailOptInOk = emailOptin ? Boolean(emailOptin.checked) : true;
        nutritionState.lastCapturedEmail = email;

        try {
            postTrackEvent('guest_identify', { email, source: 'nutrition_unlock', emailOptIn: emailOptInOk });
        } catch {
            // ignore
        }

        // Capture lead info for the admin dashboard (only if user opts-in).
        try {
            const snapshot = {
                flow: 'nutrition',
                selections: nutritionState.selections || {},
                tags: nutritionState.tags || [],
                results: nutritionState.results || null
            };

            fetch('/api/track/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    source: 'nutrition',
                    email,
                    emailOptIn: emailOptInOk,
                    wants: ['nutrition_macros'],
                    snapshot,
                    path: `${location.pathname}${location.search}${location.hash}`
                })
            }).catch(() => {});
        } catch {
            // ignore
        }

        unlockMacrosUi('email_unlock_now');
    });

    downloadBtn?.addEventListener('click', () => {
        openPlanWindow(buildPlanHtml(nutritionState.results, nutritionState.selections));
        if (handoffGoal) handoffGoal.textContent = readableGoal(nutritionState.selections.goal);
        downloadBlock.classList.add('hidden');
        handoff.classList.remove('hidden');
    });

    printBtn?.addEventListener('click', () => {
        openPlanWindow(buildPlanHtml(nutritionState.results, nutritionState.selections), true);
        if (handoffGoal) handoffGoal.textContent = readableGoal(nutritionState.selections.goal);
        downloadBlock.classList.add('hidden');
        handoff.classList.remove('hidden');
    });

    redoCalculationBtn?.addEventListener('click', () => {
        resetNutritionFlow();
        document.getElementById('ns-entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    startGroceryPrimary?.addEventListener('click', () => {
        launchGroceryFlow();
    });

    // Old event listener - superseded by setupGroceryFinalPage()
    // finalSave?.addEventListener('click', () => {
    //     saveFinalPrefs();
    //     alert('Preferences saved. Next step will generate your plan.');
    // });

    groceryBack?.addEventListener('click', () => closeGroceryPage());

    
    // ===== FOOD WIZARD COMPLETELY REMOVED =====
    // All the following grocery functions have been permanently deleted:
    // - renderGroceryFoods
    // - groceryCounts
    // - updateGChecks
    // - setGProgress
    // - launchGroceryFlow
    // - openGroceryPage / closeGroceryPage
    // - persistGrocerySession
    // - updateGroceryMacros
    // - buildLoopRows / pauseLoop
    // - updateRemainingBadge
    // - restoreSelections
    // - saveFinalPrefs
    // - updateProteinRecommendation
    // - updateTimingStrategy
    // - syncLoopPills
    
    function showStep(step) {
        Object.values(steps).forEach(s => s?.classList.add('hidden'));
        steps[step]?.classList.remove('hidden');
    }

    function switchStep(from, to) {
        steps[from]?.classList.add('hidden');
        steps[to]?.classList.remove('hidden');
        nutritionState.step = to;
    }

    function setProgress(stepNumber, label, status) {
        const percent = stepNumber === 1 ? 33 : stepNumber === 2 ? 66 : 100;
        progressFill.style.width = `${percent}%`;
        progressLabel.textContent = label;
        progressStatus.textContent = status;
    }

    function selectPill(groupEl, btn) {
        groupEl.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    function collectStep2() {
        const sex = nutritionState.selections.sex;
        const intensity = nutritionState.selections.intensity;
        const heightIn = Number(document.getElementById('ns-height').value);
        const weightLbs = Number(document.getElementById('ns-weight').value);
        const goalWeightLbs = Number(document.getElementById('ns-goal-weight')?.value);

        if (!sex || !intensity || !heightIn || !weightLbs || !goalWeightLbs) {
            alert('Fill in sex, height, current bodyweight, goal bodyweight, and training intensity.');
            return false;
        }

        nutritionState.selections.ageRange = nutritionState.selections.ageRange || '25-34';
        nutritionState.selections.heightIn = heightIn;
        nutritionState.selections.weightLbs = weightLbs;
        nutritionState.selections.goalWeightLbs = goalWeightLbs;

        try {
            postTrackEvent('nutrition_body_stats', {
                heightIn,
                weightLbs,
                goalWeightLbs,
                goal: nutritionState.selections.goal || null,
                sex: nutritionState.selections.sex || null,
                intensity: nutritionState.selections.intensity || null,
                ageRange: nutritionState.selections.ageRange || null
            });
        } catch {
            // ignore
        }

        updateTagsFromSelections();
        return true;
    }

    function runLoader(done) {
        loader.classList.remove('hidden');
        let idx = 0;
        loaderText.textContent = NS_LOADER_LINES[idx];
        clearInterval(nsLoaderInterval);
        nsLoaderInterval = setInterval(() => {
            idx = (idx + 1) % NS_LOADER_LINES.length;
            loaderText.textContent = NS_LOADER_LINES[idx];
        }, 1200);

        setTimeout(() => {
            clearInterval(nsLoaderInterval);
            loader.classList.add('hidden');
            done();
        }, 2000);
    }
}

function calculateNutritionPlan(sel) {
    console.group('%cÃ°Å¸Â§Â® NUTRITION CALCULATION - Thought Process', 'font-size: 14px; font-weight: bold; color: #c58d4f;');
    const age = midAge(sel.ageRange || '30-34');
    const heightCm = (sel.heightIn || 0) * 2.54;
    const weightKg = (sel.weightLbs || 0) * 0.453592;
    const weightLbs = sel.weightLbs || 0;
    const sexConst = sel.sex === 'FEMALE' ? -161 : 5;

    console.group('Ã°Å¸â€œÅ  Step 1: Inputs');
    console.log(`Age (midpoint of range): ${age} years`);
    console.log(`Height: ${sel.heightIn || 0}" = ${heightCm.toFixed(1)} cm`);
    console.log(`Weight: ${weightLbs} lbs = ${weightKg.toFixed(1)} kg`);
    console.log(`Sex: ${sel.sex || EM_DASH} Ã¢â€ â€™ Mifflin-St Jeor constant: ${sexConst > 0 ? '+' : ''}${sexConst}`);
    console.log(`Goal: ${sel.goal || 'RECOMP'}`);
    console.log(`Training intensity: ${sel.intensity || 'AVERAGE'}`);
    console.log(`Training style: ${sel.style || 'GENERAL FITNESS'}`);
    console.groupEnd();

    let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConst;
    console.group('Ã°Å¸â€Â¥ Step 2: BMR');
    console.log('Mifflin-St Jeor (modern populations) Ã¢â€ â€™');
    console.log(`BMR = 10 x ${weightKg.toFixed(1)} + 6.25 x ${heightCm.toFixed(1)} - 5 x ${age} + ${sexConst}`);
    console.log(`%cBMR = ${bmr.toFixed(0)} kcal/day`, 'font-weight: bold');
    console.groupEnd();

    const intensityKey = sel.intensity || 'AVERAGE';
    const discipline = inferDiscipline(sel);

    // Free tier maintenance is intentionally conservative and approximate.
    // Requirement: Maintenance = BMR Ã— random(1.20â€“1.35). We keep it stable per input set to avoid UI jitter.
    const bands = {
        AVERAGE: [1.20, 1.30],
        INTENSE: [1.24, 1.33],
        VERY_INTENSE: [1.27, 1.35]
    };
    const band = bands[intensityKey] || [MAINTENANCE_RANGE.min, MAINTENANCE_RANGE.max];
    const bandMin = clamp(band[0], MAINTENANCE_RANGE.min, MAINTENANCE_RANGE.max);
    const bandMax = clamp(band[1], MAINTENANCE_RANGE.min, MAINTENANCE_RANGE.max);
    const maintenanceFactor = clamp(
        stableRandomInRange(sel, `maintenance:${sel.sex}:${sel.ageRange}:${sel.heightIn}:${sel.weightLbs}:${intensityKey}`, bandMin, bandMax),
        MAINTENANCE_RANGE.min,
        MAINTENANCE_RANGE.max
    );
    const maintenanceCalories = Math.round(bmr * maintenanceFactor);

    console.group('Ã°Å¸Â§Â® Step 3: Maintenance');
    console.log(`Discipline inferred: ${discipline.label}`);
    console.log(`Intensity modifier: ${intensityKey} (chooses a conservative band inside 1.20Ã¢â‚¬â€œ1.35)`);
    console.log(`Maintenance factor used (randomized): ${maintenanceFactor.toFixed(2)}`);
    console.log(`Maintenance calories = ${bmr.toFixed(0)} x ${maintenanceFactor.toFixed(2)} = ${maintenanceCalories} kcal`);
    console.log(LONG_TERM_NOTE);
    console.groupEnd();

    const goal = normalizeGoal(sel.goal);
    const heightM = heightCm ? heightCm / 100 : 0;
    const bmi = heightM > 0 ? weightKg / (heightM * heightM) : null;
    const leanIndicator = Number.isFinite(bmi) ? (bmi <= (sel.sex === 'FEMALE' ? 23 : 24)) : false;
    let delta = 0;
    let goalReasoning = '';
    if (goal === 'CUT') {
        if (leanIndicator) {
            delta = -Math.round(stableRandomInRange(sel, 'cut:lean:kcal', 200, 300));
            goalReasoning = 'Lean cut (Ã¢Ë†â€™200 to Ã¢Ë†â€™300 kcal)';
        } else {
            const pct = stableRandomInRange(sel, 'cut:pct', 0.15, 0.20);
            delta = -Math.round(maintenanceCalories * pct);
            goalReasoning = 'Standard cut (Ã¢Ë†â€™15Ã¢â‚¬â€™20%)';
        }
    } else if (goal === 'BULK') {
        const pct = stableRandomInRange(sel, 'bulk:pct', 0.05, 0.10);
        const pctDelta = Math.round(maintenanceCalories * pct);
        const kcalDelta = Math.round(stableRandomInRange(sel, 'bulk:kcal', 200, 400));
        delta = leanIndicator ? kcalDelta : pctDelta;

        // Calisthenics/relative-strength: cap surplus at +5%.
        if (discipline.key === 'CALISTHENICS') {
            delta = Math.min(delta, Math.round(maintenanceCalories * 0.05));
            goalReasoning = 'Calisthenics bulk (capped at +5%)';
        } else {
            goalReasoning = leanIndicator ? 'Lean bulk (+200 to +400 kcal)' : 'Moderate bulk (+5Ã¢â‚¬â€™10%)';
        }
    } else if (goal === 'STRENGTH') {
        delta = Math.round(maintenanceCalories * 0.04);
        goalReasoning = 'Strength focus (small surplus for recovery)';
    } else {
        delta = 0;
        goalReasoning = 'Maintenance / recomposition (start at maintenance, validate with scale trends)';
    }
    delta = clamp(delta, -Math.round(maintenanceCalories * 0.25), Math.round(maintenanceCalories * 0.25));
    const targetCalories = Math.max(1200, Math.round(maintenanceCalories + delta));

    console.group('Ã°Å¸Å½Â¯ Step 4: Goal Adjustment');
    console.log(`Selected goal: ${goal}`);
    console.log(`Reasoning: ${goalReasoning}`);
    console.log(`Delta: ${delta > 0 ? '+' : ''}${delta} kcal`);
    console.log(`Target calories = ${maintenanceCalories} + (${delta}) = ${targetCalories} kcal`);
    console.groupEnd();

    const leanMass = leanBodyMass(weightLbs, sel.sex, goal);
    const intensityProtein = intensityKey === 'VERY_INTENSE' ? 0.15 : intensityKey === 'INTENSE' ? 0.08 : 0.0;
    let proteinG = 0;
    let proteinFloorDesc = '';
    let proteinMinFloor = 0;
    if (goal === 'CUT') {
        // Cutting: 1.0Ã¢â‚¬â€œ1.5 g / lb lean body mass (fixed first).
        const perLb = clamp(1.0 + intensityProtein + discipline.proteinBoost, 1.0, 1.5);
        proteinG = Math.round(leanMass * perLb);
        proteinMinFloor = Math.round(leanMass * 1.0);
        proteinFloorDesc = `${leanMass} lbs LBM x ${perLb.toFixed(2)} g/lb`;
    } else if (goal === 'BULK') {
        // Bulking: ~1.0 g / lb bodyweight.
        const perLb = clamp(1.0 + discipline.proteinBoost, 0.9, 1.1);
        proteinG = Math.round(Math.max(1, weightLbs || 170) * perLb);
        proteinFloorDesc = `${Math.max(1, weightLbs || 170)} lbs BW x ${perLb.toFixed(2)} g/lb`;
    } else {
        const perLb = clamp(1.0 + discipline.proteinBoost, 0.9, 1.2);
        proteinG = Math.round(Math.max(1, weightLbs || 170) * perLb);
        proteinFloorDesc = `${Math.max(1, weightLbs || 170)} lbs BW x ${perLb.toFixed(2)} g/lb`;
    }

    const maxProteinFromCalories = Math.floor(targetCalories / 4);
    proteinG = Math.min(proteinG, maxProteinFromCalories);
    const proteinCalories = proteinG * 4;

    console.group('Ã°Å¸Â¥Â© Step 5: Protein');
    console.log(`Protein floor: ${proteinFloorDesc}`);
    console.log(`Settled protein: ${proteinG}g Ã¢â€ â€™ ${proteinCalories} kcal`);
    console.groupEnd();

    const fatPercentBase = GOAL_FAT_PCTS[goal] || GOAL_FAT_PCTS.RECOMP;
    const fatPercent = clamp(fatPercentBase + (discipline.fatPreference - 0.24), 0.2, 0.3);
    const fatFloor = Math.round(Math.max(weightLbs * FAT_MIN_PER_LB, 18));
    const remainingForFat = Math.max(0, targetCalories - proteinCalories);
    let fatG = Math.min(
        Math.round((targetCalories * fatPercent) / 9),
        Math.floor(remainingForFat / 9)
    );
    fatG = Math.max(0, fatG);
    let fatShortfall = false;
    if (fatG < fatFloor) {
        if (remainingForFat >= fatFloor * 9) {
            fatG = fatFloor;
        } else {
            fatG = Math.max(0, Math.floor(remainingForFat / 9));
            fatShortfall = true;
        }
    }
    const fatCalories = fatG * 9;

    console.group('Ã°Å¸Â¥â€˜ Step 6: Fat');
    console.log(`Fat target: ${(fatPercent * 100).toFixed(1)}%`);
    console.log(`Fat floor required: ${fatFloor}g`);
    console.log(`Allocated fat: ${fatG}g (${fatCalories} kcal)`);
    if (fatShortfall) console.warn('Fat floor could not fit inside the budget; flagging supplement.');
    console.groupEnd();

    const carbFloorCalories = Math.max(60, Math.round(targetCalories * 0.2));
    const carbCalories = Math.max(0, targetCalories - (proteinCalories + fatCalories));
    const carbShortfall = carbCalories < carbFloorCalories;
    const carbG = Math.round(carbCalories / 4);

    console.group('Ã°Å¸ÂÅ¡ Step 7: Carbs');
    console.log(`Remaining calories for carbs: ${carbCalories}`);
    if (carbShortfall) console.warn(`Carbs sit below 20% guardrail (${Math.round((carbCalories / targetCalories) * 100 || 0)}%).`);
    console.log(`Carbs: ${carbG}g`);
    console.groupEnd();

    const actualCalories = proteinCalories + fatCalories + carbG * 4;
    const calorieDelta = actualCalories - targetCalories;
    const proteinPct = actualCalories ? Math.round((proteinCalories / actualCalories) * 100) : 0;
    const fatPct = actualCalories ? Math.round((fatCalories / actualCalories) * 100) : 0;
    const carbPct = actualCalories ? Math.max(0, 100 - proteinPct - fatPct) : 0;

    const warnings = [];
    const supplements = new Set();
    const addWarning = (macroKey, text) => {
        warnings.push(text);
        const supplement = SUPPLEMENT_MAP[macroKey];
        if (supplement) supplements.add(supplement);
    };

    if (carbShortfall) {
        addWarning('carbs', 'Carbs are under the 20% guardrail. This is good enough given your constraints.');
    }
    if (fatShortfall) {
        addWarning('fat', 'Fat floor could not fit inside the target; consider fish oil or an olive oil drizzle.');
    }
    if (goal === 'CUT' && proteinMinFloor && proteinG < proteinMinFloor) {
        addWarning('protein', 'Protein floor could not fit inside your calorie target. Protein powder is optional.');
    }
    if (calorieDelta < -Math.round(targetCalories * 0.06)) {
        addWarning('calories', `Calories are ${Math.abs(Math.round(calorieDelta))} kcal below target after respecting macros.`);
    }

    console.group('Ã¢Å“â€¦ Final Recommendation');
    console.log(`Target: ${targetCalories} kcal (maintenance ${maintenanceCalories} kcal, delta ${delta > 0 ? '+' : ''}${delta})`);
    console.log(`Actual: ${actualCalories} kcal (delta ${calorieDelta >= 0 ? '+' : ''}${calorieDelta})`);
    console.log(`Protein: ${proteinG}g Ã‚Â· Carbs: ${carbG}g Ã‚Â· Fat: ${fatG}g`);
    if (warnings.length) {
        warnings.forEach(text => console.warn(text));
        console.log('Supplements flagged:', Array.from(supplements).join(', ') || 'None');
    } else {
        console.log('All macros satisfied by whole food.');
    }
    console.groupEnd();
    console.groupEnd();

    const confidence = buildConfidence(sel);

    return {
        calories: targetCalories,
        actualCalories,
        calorieDelta,
        maintenanceCalories,
        maintenanceFactor,
        proteinG,
        carbG,
        fatG,
        proteinPct,
        carbPct,
        fatPct,
        goalReasoning,
        note: LONG_TERM_NOTE,
        warnings,
        supplements: Array.from(supplements),
        confidence
    };
}


function buildConfidence(sel) {
    let score = 70;
    if (sel.goal) score += 8;
    if (sel.style) score += 6;
    if (sel.frequency) score += 6;
    if (sel.sex && sel.ageRange && sel.heightIn && sel.weightLbs) score += 8;
    if (sel.intensity) score += 6;
    if (sel.frequency === '1-2' && sel.goal === 'BULK') score -= 4;
    return `${Math.min(98, Math.max(72, score))}%`;
}

function paintResults(res) {
    if (!res) return;
    setText('ns-calories', `${res.calories.toLocaleString()} kcal`);
    setText('ns-confidence', res.confidence);
    setText('ns-protein', `${res.proteinG} g`);
    setText('ns-carbs', `${res.carbG} g`);
    setText('ns-fats', `${res.fatG} g`);
    setText('ns-protein-pct', `${res.proteinPct}% of calories`);
    setText('ns-carbs-pct', `${res.carbPct}% of calories`);
    setText('ns-fats-pct', `${res.fatPct}% of calories`);

    const sel = nutritionState?.selections || {};
    const currentWeight = Number(sel.weightLbs || 0);
    const goalWeight = Number(sel.goalWeightLbs || 0);

    if (Number.isFinite(currentWeight) && currentWeight > 0) setText('ns-current-weight', String(Math.round(currentWeight)));
    if (Number.isFinite(goalWeight) && goalWeight > 0) setText('ns-goal-weight-display', String(Math.round(goalWeight)));

    if (Number.isFinite(currentWeight) && currentWeight > 0 && Number.isFinite(goalWeight) && goalWeight > 0) {
        const gap = Math.abs(currentWeight - goalWeight);
        const isBulk = goalWeight > currentWeight;
        const timeRow = document.getElementById('ns-time-to-goal-row');
        if (timeRow) timeRow.classList.toggle('hidden', gap === 0);

        if (isBulk) {
            setText('ns-time-to-goal-prefix', 'If you gain');
            setText('ns-target-rate', '0.5–1');
            const weeksAtOne = gap > 0 ? Math.max(1, Math.ceil(gap / 1)) : 0;
            const weeksAtHalf = gap > 0 ? Math.max(1, Math.ceil(gap / 0.5)) : 0;
            const weeks = gap === 0 ? '0' : weeksAtOne === weeksAtHalf ? String(weeksAtOne) : `${weeksAtOne}–${weeksAtHalf}`;
            setText('ns-weeks-to-goal', weeks);
        } else {
            setText('ns-time-to-goal-prefix', 'If you lose');
            setText('ns-target-rate', '2');
            const weeks = gap > 0 ? Math.max(1, Math.ceil(gap / 2)) : 0;
            setText('ns-weeks-to-goal', String(weeks));
        }
        setText('ns-weight-gap', String(Math.round(gap)));
    } else {
        const timeRow = document.getElementById('ns-time-to-goal-row');
        if (timeRow) timeRow.classList.add('hidden');
    }
}

function buildPlanHtml(res, selections) {
    if (!res) return '<p>No plan calculated.</p>';

    const nice = {
        goal: { CUT: 'Cut fat', BULK: 'Build muscle', RECOMP: 'Lose fat + build muscle', STRENGTH: 'Prioritize strength' },
        style: {
            STRENGTH: 'Strength Training',
            MIXED: 'Mixed Training',
            CALISTHENICS: 'Bodyweight / Calisthenics'
        },
        frequency: { '1-2': '1Ã¢â‚¬â€œ2 days/week', '3-4': '3Ã¢â‚¬â€œ4 days/week', '5-6': '5Ã¢â‚¬â€œ6 days/week' },
        sex: { MALE: 'Male', FEMALE: 'Female' },
        intensity: { AVERAGE: 'Average', INTENSE: 'Intense', VERY_INTENSE: 'Very intense' }
    };

    const sel = selections || {};
    const heightIn = sel.heightIn || 0;
    const heightCm = heightIn ? Math.round(heightIn * 2.54) : '';
    const weightLbs = sel.weightLbs || 0;
    const weightKg = weightLbs ? Math.round(weightLbs * 0.453592) : '';
    const ageRange = sel.ageRange || '25-34';

    const meta = [
        { label: 'Goal', value: nice.goal[sel.goal] || EM_DASH },
        { label: 'Training Style', value: nice.style[sel.style] || EM_DASH },
        { label: 'Frequency', value: nice.frequency[sel.frequency] || EM_DASH },
        { label: 'Sex', value: nice.sex[sel.sex] || EM_DASH },
        { label: 'Age Range', value: ageRange || EM_DASH },
        { label: 'Height', value: heightCm ? `${heightCm} cm` : EM_DASH },
        { label: 'Weight', value: weightKg ? `${weightKg} kg (${Math.round(weightKg*2.20462)} lb)` : EM_DASH },
        { label: 'Training Intensity', value: nice.intensity[sel.intensity] || EM_DASH }
    ];

    return `
    <html>
    <head>
      <title>Nutrition Simplified - Baseline Protocol</title>
      <style>
        :root { --ink:#1b120c; --muted:#5a5147; --accent:#c58d4f; --bg:#f7f2ea; --card:#fffaf4; --line:#e6d7c4; }
        *{box-sizing:border-box;} body{margin:0; padding:32px; font-family:'Space Grotesk',system-ui,-apple-system,sans-serif; color:var(--ink); background:var(--bg);}
        h1{margin:0 0 4px;font-family:'Playfair Display','Space Grotesk',serif;}
        h2{margin:0;font-size:1rem;color:var(--muted);}
        .pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;font-size:0.85rem;color:var(--muted);background:#fff;}
        .grid{display:grid;gap:12px;}
        .meta-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:14px;}
        .card-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:12px;}
        .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 14px 32px rgba(0,0,0,0.08);}
        .title{display:flex;justify-content:space-between;align-items:center;gap:12px;}
        .number{font-size:1.6rem;font-weight:700;}
        .muted{color:var(--muted);margin:6px 0 0;}
        .section{margin-top:20px;}
        .badge{font-size:0.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;}
        .row{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;}
        .stat{padding:10px 12px;border-radius:10px;border:1px dashed var(--line);background:#fff;}
        @media print {
            body{padding:18px;}
            .card{box-shadow:none;}
        }
      </style>
    </head>
    <body>
      <div class="title">
        <div>
          <h1>Nutrition Simplified: Baseline Protocol</h1>
          <h2>Personalized output with your exact inputs and math trail.</h2>
        </div>
        <span class="pill">odeology_ &#8226; Baseline</span>
      </div>

      <div class="section">
        <div class="badge">Profile answers</div>
        <div class="grid meta-grid">
            ${meta.map(m => `<div class="card"><div class="muted">${m.label}</div><div class="number">${m.value}</div></div>`).join('')}
        </div>
      </div>

      <div class="section">
        <div class="badge">Calorie & macro plan</div>
        <div class="grid card-grid">
          <div class="card"><div class="muted">Calories</div><div class="number">${res.calories.toLocaleString()} kcal</div></div>
          <div class="card"><div class="muted">Protein</div><div class="number">${res.proteinG} g</div><div class="muted">${res.proteinPct}% of kcal</div></div>
          <div class="card"><div class="muted">Carbs</div><div class="number">${res.carbG} g</div><div class="muted">${res.carbPct}% of kcal</div></div>
          <div class="card"><div class="muted">Fats</div><div class="number">${res.fatG} g</div><div class="muted">${res.fatPct}% of kcal</div></div>
          <div class="card"><div class="muted">Real-World Check</div><div class="muted">Good starting point. Use for 7 days.</div><div class="muted" style="margin-top:8px; font-size:0.9em;">&#8226; Weight not dropping? Cut 100 calories<br>&#8226; Weight not rising? Add 100 calories</div><div class="muted" style="margin-top:8px; font-size:0.85em;">We build it in 60 seconds. Check portions if you do it yourself.</div><div class="muted" style="margin-top:8px; opacity:0.7; font-size:0.85em;">Used by 150+ lifters</div></div>
        </div>
      </div>

      <div class="section">
        <div class="badge">Math trail</div>
        <div class="row">
          <div class="stat">BMR: Mifflin-St Jeor with sex + age + height + weight</div>
          <div class="stat">TDEE = BMR &times; intensity (${sel.intensity || EM_DASH})</div>
          <div class="stat">Protein: goal-adjusted (${sel.goal || EM_DASH})</div>
          <div class="stat">Fat set to sustainable floor, carbs fill remainder</div>
          <div class="stat">Calorie shift capped at Ã‚Â±2 lb/week</div>
        </div>
      </div>

      <div class="section">
        <div class="badge">Coach notes</div>
        <div class="macro-note">
          <p>${res.note || 'This is a starting estimate; track the scale for confirmation.'}</p>
          <p>Maintenance estimate: ${res.maintenanceCalories?.toLocaleString() || '—'} kcal (factor ${res.maintenanceFactor?.toFixed(2) || '—'})</p>
          <p>Adjustment reasoning: ${res.goalReasoning || '—'}</p>
          ${(res.warnings || []).map(w => `<p class="macro-warning warning">${w}</p>`).join('') || ''}
          ${(res.supplements || []).length ? `<p class="macro-warning supplement">Supplements flagged: ${res.supplements.join(', ')}</p>` : ''}
        </div>
      </div>

      <script>window.onload = () => window.print();</script>
    </body>
    </html>
    `;
}

// Grocery planning placeholders (USDA + pricing hooks)
async function planGroceryList(state, nutritionResults) {
    const { selections, prefs } = state;
    const macroTargets = nutritionResults || {};
    const foods = mergeSelectedFoods(selections);

    // Placeholder: fetch macro data from USDA when wired
    const enriched = await annotateWithUSDA(foods);

    // Placeholder: calculate quantities (keep within Ã‚Â±10% of targets)
    const quantities = allocateQuantities(enriched, macroTargets, prefs);

    // Placeholder: pricing lookups / scraping
    const priced = await attachPricing(quantities, prefs.store);

    return {
        store: prefs.store,
        days: prefs.days,
        meals: prefs.meals,
        timing: prefs.timing,
        prep: prefs.prep,
        items: priced,
        meta: { macroTargets, tolerance: 'Ã‚Â±10%' }
    };
}

async function annotateWithUSDA(foods) {
    try {
        if (typeof fetchUSDAFood === 'function') {
            const lookups = await Promise.all(
                foods.map(async f => {
                    const data = await fetchUSDAFood(f.name, { pageSize: 1 });
                    return { ...f, usda: data };
                })
            );
            return lookups;
        }
    } catch (err) {
        console.warn('USDA lookup not available yet', err);
    }
    return foods;
}

function allocateQuantities(foods, targets, prefs) {
    // Minimal stub: return foods with a default quantity; real math will balance to macros Ã‚Â±10%
    return foods.map(f => ({
        ...f,
        quantity: prefs.days ? `${prefs.days} day supply` : '1 unit',
        mealsCovered: prefs.meals || 4
    }));
}

async function attachPricing(foods, store) {
    // Placeholder for store API / scraping integration
    return foods.map(f => ({
        ...f,
        store: store || 'Walmart',
        price: 'TBD',
        link: '#'
    }));
}

const FOOD_QUERY_MAP = {
    'chicken breast': 'Chicken breasts',
    'lean ground turkey': 'Ground turkey',
    'eggs': 'Eggs',
    'salmon': 'Salmon',
    'shrimp': 'Shrimp',
    'ground beef': 'Ground beef',
    'cottage cheese (low-fat)': 'Cottage cheese',
    'greek yogurt (0%)': 'Greek yogurt',
    'milk': 'Milk',
    'cheddar cheese': 'Cheddar cheese',
    'grass-fed butter': 'Butter',
    'butter': 'Butter',
    'oat milk': 'Oat milk',
    'apples': 'Apples',
    'bananas': 'Bananas',
    'mixed berries': 'Mixed berries',
    'spinach': 'Spinach',
    'lettuce': 'Lettuce',
    'jasmine rice': 'Jasmine rice (measure dry)',
    'rolled oats': 'Oats',
    'russet potato': 'Potatoes',
    'whole wheat pasta': 'Whole wheat pasta',
    'quinoa': 'Quinoa',
    'flour tortilla': 'Tortillas',
    'olive oil': 'Olive oil',
    'peanut butter': 'Peanut butter',
    'black beans': 'Black beans',
    'chickpeas': 'Chickpeas',
    'tomatoes': 'Tomatoes',
    'chicken broth': 'Chicken broth',
    'almonds': 'Almonds',
    'mixed nuts': 'Mixed nuts',
    'popcorn': 'Popcorn',
    'dark chocolate (85%)': 'Dark chocolate',
    'dark chocolate': 'Dark chocolate',
    'avocado': 'Avocados'
};

const SERVING_GRAMS_FALLBACK = {
    'apples': 182,
    'bananas': 118,
    'mixed berries': 140,
    'spinach': 85,
    'lettuce': 85,
    'black beans': 130,
    'chickpeas': 125,
    'tomatoes': 122,
    'mixed nuts': 30,
    'popcorn': 24,
    'dark chocolate': 28
};

const normalizeKey = (value) => String(value || '').toLowerCase().trim();

const mapFoodNameToQuery = (name) => {
    const key = normalizeKey(name);
    return FOOD_QUERY_MAP[key] || name;
};

const formatCurrency = (value) => {
    if (!Number.isFinite(value)) return EM_DASH;
    return `$${value.toFixed(2)}`;
};

const resolveServingGrams = (macros, queryKey) => {
    const size = Number(macros?.serving_size);
    const unit = String(macros?.serving_unit || '').toLowerCase();
    if (Number.isFinite(size)) {
        if (unit === 'g') return size;
        if (unit === 'ml') return size;
    }
    const fallback = SERVING_GRAMS_FALLBACK[queryKey];
    return Number.isFinite(fallback) ? fallback : null;
};

const pickCheapestItem = (items) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    return items.slice().sort((a, b) => {
        const aKey = Number.isFinite(a.normalized_price_per_gram) ? a.normalized_price_per_gram : Number.POSITIVE_INFINITY;
        const bKey = Number.isFinite(b.normalized_price_per_gram) ? b.normalized_price_per_gram : Number.POSITIVE_INFINITY;
        return aKey - bKey;
    })[0];
};

const pricePerGramFromItem = (item, servingGrams) => {
    if (!item) return null;
    if (Number.isFinite(item.normalized_price_per_gram)) return item.normalized_price_per_gram;
    if (Number.isFinite(item.price_per_oz)) return item.price_per_oz / 28.3495;
    const unit = String(item.price_per_unit_unit || '').toLowerCase();
    if (unit === 'count' && Number.isFinite(item.price_per_unit) && Number.isFinite(servingGrams)) {
        return item.price_per_unit / servingGrams;
    }
    return null;
};

const getContainerInfo = (item) => {
    if (!item) return null;
    const price = Number(item.price);
    const pricePerOz = Number(item.price_per_oz);
    const unit = String(item.price_per_unit_unit || '').toLowerCase();
    
    // Calculate ounces from price data
    let containerOz = null;
    if (Number.isFinite(price) && Number.isFinite(pricePerOz) && pricePerOz > 0) {
        containerOz = price / pricePerOz;
    } else if (unit === 'lb' && Number.isFinite(item.price_per_lb)) {
        const pricePerLb = Number(item.price_per_lb);
        const price = Number(item.price);
        if (Number.isFinite(price) && Number.isFinite(pricePerLb) && pricePerLb > 0) {
            const lbs = price / pricePerLb;
            containerOz = lbs * 16;
        }
    }
    
    // Extract size from product name if available
    let displaySize = null;
    const name = String(item.name || '');
    const sizeMatch = name.match(/(\d+[\.\d]*)\s*[-Ã¢â‚¬â€œ]\s*(\d+[\.\d]*)\s*(lbs?|oz|g|kg)/i);
    if (sizeMatch) {
        displaySize = `${sizeMatch[1]}-${sizeMatch[2]} ${sizeMatch[3]}`;
    } else {
        const singleMatch = name.match(/(\d+[\.\d]*)\s*(lbs?|oz|g|kg)(?:\s|$)/i);
        if (singleMatch) {
            displaySize = `${singleMatch[1]} ${singleMatch[2]}`;
        }
    }
    
    return {
        containerOz: containerOz,
        displaySize: displaySize || `~${Math.round(containerOz || 0)} oz`,
        pricePerContainer: Number(item.price) || null
    };
};

const fetchWalmartLatest = async () => {
    const resp = await fetch('/api/prices/walmart/latest');
    if (!resp.ok) return null;
    return resp.json();
};

const MACRO_FIELD_MAP = {
    protein: 'protein_g',
    carb: 'carbs_g',
    fat: 'fat_g'
};

const buildWorkoutPlan = (selection, prefs) => {
    const frequency = selection?.frequency || '3-4';
    const style = selection?.style || 'FITNESS';
    const goal = selection?.goal || 'RECOMP';
    const days = frequency === '1-2' ? 2 : frequency === '5-6' ? 5 : 4;

    const styleTemplates = {
        POWERLIFT: [
            { title: 'Lower: Squat focus', notes: 'Heavy triples + back-off sets' },
            { title: 'Upper: Bench focus', notes: 'Bench volume + rows' },
            { title: 'Lower: Deadlift focus', notes: 'Deadlift doubles + posterior chain' },
            { title: 'Upper: Overhead + assistance', notes: 'Press, pull, triceps' },
            { title: 'Full body: technique + accessories', notes: 'Speed work + core' }
        ],
        BODYBUILD: [
            { title: 'Push', notes: 'Chest, shoulders, triceps' },
            { title: 'Pull', notes: 'Back, biceps, rear delts' },
            { title: 'Legs', notes: 'Quads, hams, glutes' },
            { title: 'Upper', notes: 'Volume + weak points' },
            { title: 'Lower', notes: 'Posterior chain + calves' }
        ],
        CALISTHENICS: [
            { title: 'Push skills', notes: 'Push-ups, dips, pike press' },
            { title: 'Pull skills', notes: 'Pull-ups, rows, hangs' },
            { title: 'Lower + core', notes: 'Split squats, bridges, core' },
            { title: 'Full body circuit', notes: 'Density + conditioning' },
            { title: 'Skill + mobility', notes: 'Tempo work + stretching' }
        ],
        MIL_PREP: [
            { title: 'Strength + carries', notes: 'Compound lifts + loaded carries' },
            { title: 'Intervals', notes: 'Sprints or rower intervals' },
            { title: 'Strength + endurance', notes: 'Circuit with short rests' },
            { title: 'Ruck or steady cardio', notes: 'Zone 2 conditioning' },
            { title: 'Full body + core', notes: 'Chassis integrity work' }
        ],
        FITNESS: [
            { title: 'Upper body', notes: 'Push + pull balance' },
            { title: 'Lower body', notes: 'Squat, hinge, core' },
            { title: 'Full body', notes: 'Compound focus' },
            { title: 'Conditioning', notes: 'Intervals or steady state' },
            { title: 'Mobility + accessories', notes: 'Recovery emphasis' }
        ]
    };

    const templates = styleTemplates[style] || styleTemplates.FITNESS;
    const planDays = templates.slice(0, days);
    const timingNote = prefs?.workoutTime ? `Train at ${prefs.workoutTime}.` : 'Train when you are most consistent.';
    const goalNote = goal === 'CUT'
        ? 'Keep rest tight, finish with light conditioning.'
        : goal === 'BULK'
            ? 'Push volume and keep rest 90Ã¢â‚¬â€œ150s on compounds.'
            : goal === 'STRENGTH'
                ? 'Prioritize heavy sets and long rest.'
                : 'Balance load and density.';

    return {
        summary: `${days} days/week Ã‚Â· ${style.replace('_', ' ').toLowerCase()} Ã‚Â· ${goal.toLowerCase()}`,
        notes: [timingNote, goalNote],
        days: planDays
    };
};

function mergeSelectedFoods(selections) {
    const all = [];
    Object.entries(selections).forEach(([type, set]) => {
        set.forEach(id => {
            all.push({ id, type, name: lookupFoodName(id) });
        });
    });
    return all;
}

function lookupFoodName(id) {
    const pool = { ...foodMapFromOptions(groceryFoods) };
    return pool[id] || id;
}

function foodMapFromOptions(options) {
    return Object.values(options).flat().reduce((acc, item) => {
        acc[item.id] = item.name;
        return acc;
    }, {});
}

function openPlanWindow(html, skipPrint) {
    const w = window.open('', '_blank', 'width=900,height=900');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    if (!skipPrint) {
        w.focus();
    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function midAge(range) {
    const [a, b] = (range || '30-34').split('-').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
    return 32;
}

function readableGoal(goal) {
    const map = { CUT: 'fat loss', BULK: 'muscle gain', RECOMP: 'recomposition', STRENGTH: 'strength' };
    return map[goal] || 'your goal';
}

function updateTagsFromSelections() {
    const sel = nutritionState.selections;
    const tags = {};
    if (sel.goal) tags.GOAL = `GOAL_${sel.goal}`;
    if (sel.style) tags.STYLE = `STYLE_${sel.style}`;
    if (sel.frequency) {
        tags.LEVEL = sel.frequency === '1-2' ? 'BEGINNER' : sel.frequency === '3-4' ? 'INTERMEDIATE' : 'ADVANCED';
    }
    if (sel.goal === 'CUT' && sel.frequency === '5-6') tags.RISK = 'UNDEREAT';
    nutritionState.tags = tags;
}

function resetNutritionFlow() {
    nutritionState.step = 0;
    nutritionState.selections = {
        goal: null, style: null, frequency: null, sex: null,
        ageRange: '25-34', heightIn: null, weightLbs: null, intensity: null, mealsOut: null
    };
    nutritionState.results = null;
    nutritionState.emailCaptured = false;
    nutritionState.macrosUnlocked = false;

    const entry = document.getElementById('ns-entry');
    const flow = document.getElementById('ns-flow');
    const steps = [document.getElementById('ns-step-1'), document.getElementById('ns-step-2'), document.getElementById('ns-step-3')];
    entry?.classList.remove('hidden');
    flow?.classList.add('hidden');
    steps.forEach(s => s?.classList.add('hidden'));

    document.querySelectorAll('.ns-button-grid button, .ns-icon-grid button').forEach(btn => btn.classList.remove('active'));

    ['ns-height','ns-weight','ns-goal-weight','ns-email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['ns-calories','ns-confidence','ns-protein','ns-carbs','ns-fats','ns-protein-pct','ns-carbs-pct','ns-fats-pct']
        .forEach(id => setText(id, EM_DASH));

    const macrosBlock = document.getElementById('ns-macros');
    macrosBlock?.classList.add('locked');
    macrosBlock?.querySelector('.ns-lock-overlay')?.classList.remove('hidden');

    const unlockBlock = document.getElementById('ns-unlock-block');
    const emailForm = document.getElementById('ns-email-form');
    const downloadBlock = document.getElementById('ns-download-block');
    const handoff = document.getElementById('ns-handoff');
    unlockBlock?.classList.remove('hidden');
    emailForm?.classList.add('hidden');
    downloadBlock?.classList.add('hidden');
    handoff?.classList.add('hidden');

    const progressFill = document.getElementById('ns-progress-fill');
    const progressLabel = document.getElementById('ns-progress-label');
    const progressStatus = document.getElementById('ns-progress-status');
    if (progressFill) progressFill.style.width = '33%';
    if (progressLabel) progressLabel.textContent = 'Step 1 of 3';
    if (progressStatus) progressStatus.textContent = 'Goals & Training';
}

/* ============================================
   FITNESS INTEL LAB
   ============================================ */

/* ============================================
   PRICING TOGGLE
   ============================================ */

function setupPricingToggle() {
    const options = document.querySelectorAll('.price-option');
    options.forEach(option => {
        option.addEventListener('click', function () {
            const parent = this.parentElement;
            parent.querySelectorAll('.price-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
}

/* ============================================
   RESOURCE FORM
   ============================================ */

function setupResourceForm() {
    const form = document.getElementById('resource-form');
    if (!form) return;

    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;

        console.log('Resource form submitted:', { name, email });

        // Replace with your real endpoint
        // fetch(FORM_ENDPOINTS.resources, { ...payload })

        alert(`Stack sent to ${email}. Watch for the download links.`);
        form.reset();
    });
}

/* ============================================
   CONTACT FORM
   ============================================ */

function setupContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('contact-name').value;
        const email = document.getElementById('contact-email').value;
        const subject = document.getElementById('contact-subject').value;
        const message = document.getElementById('contact-message').value;

        const payload = {
            name,
            email,
            subject,
            message,
            path: location.pathname
        };

        try {
            const resp = await fetch('/api/track/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error('Failed to send');
            alert('Message submitted. Thank you.');
            form.reset();
            return;
        } catch {
            alert('Message could not be sent. Please try again in a moment.');
        }
    });
}

/* ============================================
   PRODUCT CHECKOUT
   ============================================ */

function setupProductCheckouts() {
    const checkoutButtons = document.querySelectorAll('.product-checkout');
    checkoutButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            const product = this.getAttribute('data-product');
            if (product === 'training') {
                const selected = document.querySelector('.price-option.selected');
                const price = selected?.getAttribute('data-price') || '320';
                const billing = selected?.getAttribute('data-billing') || 'month';
                alert(`Redirecting to coaching checkout: $${price}/${billing}`);
                // window.location.href = `${CHECKOUT_URLS.training}?price=${price}&billing=${billing}`;
            } else if (product === 'notebook') {
                alert('Redirecting to notebook checkout...');
                // window.location.href = CHECKOUT_URLS.notebook;
            }
        });
    });
}

/* ============================================
   RESOURCE DOWNLOADS
   ============================================ */

function setupResourceDownloads() {
    const buttons = document.querySelectorAll('.resource-download');
    buttons.forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            const key = btn.getAttribute('data-resource');
            const link = RESOURCE_LINKS[key];

            if (link && link !== '#') {
                window.open(link, '_blank');
            } else {
                alert('Link coming soon. Drop your email and we will send it the moment it is live.');
            }
        });
    });
}

/* ============================================
   BUILDER MODAL
   ============================================ */

function setupBuilderModal() {
    const launch = document.getElementById('builder-launch');
    const modal = document.getElementById('builder-modal');
    const close = document.getElementById('builder-close');
    const form = document.getElementById('builder-form');
    const output = document.getElementById('builder-output');

    if (!modal || !close || !form || !output) return;

    const openModal = () => {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    };

    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    };

    if (launch) launch.addEventListener('click', openModal);
    close.addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });

    window.odeOpenBuilderModal = openModal;

    try {
        const params = new URLSearchParams(window.location.search || '');
        const shouldOpen = params.get('open') === 'builder' || window.location.hash === '#builder';
        if (shouldOpen) {
            window.setTimeout(() => {
                try { openModal(); } catch {}
            }, 60);
        }
    } catch {
        // ignore
    }

    form.addEventListener('submit', e => {
        e.preventDefault();
        const goal = document.getElementById('builder-goal').value;
        const days = document.getElementById('builder-days').value;
        const equipment = document.getElementById('builder-equipment').value;

        const split = buildSplit(goal, days, equipment);

        output.innerHTML = `
            <div class="plan">
                <p><strong>Focus:</strong> ${goal}</p>
                <p><strong>Days:</strong> ${days}</p>
                <p><strong>Equipment:</strong> ${equipment}</p>
                <p><strong>Recommended split:</strong> ${split.splitLabel}</p>
                <p><strong>Starter progressions:</strong> ${split.progression}</p>
                <a class="btn btn-ghost" href="${RESOURCE_LINKS.tracker}" target="_blank">Download tracker</a>
            </div>
        `;
    });
}

/* ============================================
   SAVE RESULTS (INLINE)
   ============================================ */

 function setupGetStartedIntakeLegacy() {
    const form = document.getElementById('intake-form');
    const trust = document.getElementById('intake-trust');
    const nextBtn = document.getElementById('intake-next');

    if (!form) return;

    const ODE_BLUEPRINT_LS_KEY = 'ode_blueprint_v1';
    const PIPELINE_BY_WANT = {
        track_calories_macros: 'free_tools',
        lower_grocery_costs: 'free_tools',
        get_workout_plan: 'free_tools',
        train_online_self_paced: 'diy',
        train_at_home: 'diy',
        coaching_1on1: 'done_for_you',
        supplements_done_for_me: 'done_for_you',
        meals_planned_or_cooked: 'done_for_you',
    };

    const safeJsonParse = (value) => {
        try {
            return value ? JSON.parse(value) : null;
        } catch {
            return null;
        }
    };

    const readText = (id) => {
        const el = document.getElementById(id);
        const t = (el?.textContent || '').trim();
        return t && t !== '—' ? t : null;
    };

    const scrollToResourcesAndGlow = () => {
        const resources = document.getElementById('resources');
        if (!resources) return;
        resources.scrollIntoView({ behavior: 'smooth', block: 'start' });
        resources.classList.add('ode-glow');
        setTimeout(() => resources.classList.remove('ode-glow'), 2400);
    };

    const collectWants = () => {
        return Array.from(form.querySelectorAll('input[name="wants"]:checked')).map(i => i.value);
    };

    const buildBlueprint = () => {
        const wants = collectWants();
        const freeTools = [];
        const diy = [];
        const doneForYou = [];

        wants.forEach((w) => {
            const pipeline = PIPELINE_BY_WANT[w] || 'free_tools';
            if (pipeline === 'diy') diy.push(w);
            else if (pipeline === 'done_for_you') doneForYou.push(w);
            else freeTools.push(w);
        });

        return {
            submittedAt: new Date().toISOString(),
            wants,
            pipelines: { freeTools, diy, doneForYou },
        };
    };

    const wantInputs = Array.from(form.querySelectorAll('input[name="wants"]'));
    const syncWantUi = () => {
        wantInputs.forEach((input) => {
            const row = input.closest('label.intake-check');
            if (!row) return;
            row.classList.toggle('is-checked', Boolean(input.checked));
        });
    };
    syncWantUi();
    wantInputs.forEach((input) => input.addEventListener('change', syncWantUi));

    const buildSnapshot = () => {
        return {
            savedAt: new Date().toISOString(),
            wants: collectWants(),
            profile: {
                firstName: String(document.getElementById('intake-first')?.value || '').trim() || null,
                lastName: String(document.getElementById('intake-last')?.value || '').trim() || null,
                email: String(document.getElementById('intake-email')?.value || '').trim() || null,
                phone: String(document.getElementById('intake-phone')?.value || '').trim() || null,
                emailOptIn: Boolean(document.getElementById('intake-email-optin')?.checked),
            },
            nutrition: {
                calories: readText('ns-calories'),
                protein: readText('ns-protein'),
                carbs: readText('ns-carbs'),
                fats: readText('ns-fats'),
            },
            grocerySession: safeJsonParse(sessionStorage.getItem('grocerySession')),
            groceryPrefs: safeJsonParse(sessionStorage.getItem('groceryPrefs')),
        };
    };

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const blueprint = buildBlueprint();
        try {
            localStorage.setItem(ODE_BLUEPRINT_LS_KEY, JSON.stringify(blueprint));
            sessionStorage.setItem(ODE_BLUEPRINT_LS_KEY, JSON.stringify(blueprint));
        } catch {
            // ignore
        }

        const email = String(document.getElementById('intake-email')?.value || '').trim();
        if (email) {
            localStorage.setItem('ode_saved_results_email', email);
            localStorage.setItem('ode_saved_results_email_at', new Date().toISOString());
        }
        localStorage.setItem('ode_saved_results_snapshot', JSON.stringify(buildSnapshot()));

        // Save lead to Neon (server-side) for admin dashboard.
        try {
            const wants = Array.from(form.querySelectorAll('input[name="wants"]:checked')).map((el) => el.value);
            const payload = {
                firstName: String(document.getElementById('intake-first')?.value || '').trim() || null,
                lastName: String(document.getElementById('intake-last')?.value || '').trim() || null,
                email: String(document.getElementById('intake-email')?.value || '').trim() || null,
                phone: String(document.getElementById('intake-phone')?.value || '').trim() || null,
                emailOptIn: Boolean(document.getElementById('intake-email-optin')?.checked),
                wants,
                snapshot: buildSnapshot(),
                path: `${location.pathname}${location.search}${location.hash}`
            };
            fetch('/api/track/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            }).catch(() => {});
        } catch {
            // ignore
        }

        const wants = blueprint.wants || [];
        const hasFreeTools = wants.some((w) => PIPELINE_BY_WANT[w] === 'free_tools');
        const hasDoneForYou = wants.some((w) => PIPELINE_BY_WANT[w] === 'done_for_you');
        const wantsWorkoutPlan = wants.includes('get_workout_plan') || wants.includes('train_at_home');

        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.textContent = 'Building...';
        }

        if (hasFreeTools) {
            scrollToResourcesAndGlow();
        } else if (hasDoneForYou) {
            const contact = document.getElementById('contact');
            if (contact) contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            scrollToResourcesAndGlow();
        }

        if (wantsWorkoutPlan && typeof window.odeOpenBuilderModal === 'function') {
            setTimeout(() => window.odeOpenBuilderModal(), 350);
        }

        setTimeout(() => {
            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.textContent = 'Build My Plan';
            }
            if (trust) trust.textContent = 'No account. No credit card. Start now.';
        }, 1200);
    });

}

function setupGetStartedIntake() {
    const form = document.getElementById('intake-form');
    const track = document.getElementById('intake-track');
    const viewport = document.getElementById('intake-viewport');
    const trust = document.getElementById('intake-trust');
    const submitBtn = document.getElementById('intake-next');

    const progressWrap = document.querySelector('.intake-progress');
    const progressLabel = document.getElementById('intake-progress-label');
    const progressStatus = document.getElementById('intake-progress-status');
    const progressFill = document.getElementById('intake-progress-fill');

    if (!form) return;

    const ODE_BLUEPRINT_LS_KEY = 'ode_blueprint_v2';

    const state = {
        step: 1,
    };

    const safeJsonParse = (value) => {
        try {
            return value ? JSON.parse(value) : null;
        } catch {
            return null;
        }
    };

    const readStored = () => safeJsonParse(localStorage.getItem(ODE_BLUEPRINT_LS_KEY));

    const writeStored = (payload) => {
        try {
            localStorage.setItem(ODE_BLUEPRINT_LS_KEY, JSON.stringify(payload));
            sessionStorage.setItem(ODE_BLUEPRINT_LS_KEY, JSON.stringify(payload));
        } catch {
            // ignore
        }
    };

    const collectPrimaryIntents = () => {
        return Array.from(form.querySelectorAll('input[name="primary_intents"]:checked')).map(i => i.value);
    };

    const collectSupportPreferences = () => {
        return Array.from(form.querySelectorAll('input[name="support_preferences"]:checked')).map(i => i.value);
    };

    const readExecutionStyle = () => {
        const checked = form.querySelector('input[name="execution_style"]:checked');
        const v = String(checked?.value || '').trim();
        return v === 'diy' || v === 'structured' ? v : null;
    };

    const buildBlueprint = () => {
        const primaryIntents = collectPrimaryIntents();
        const supportPreferences = collectSupportPreferences();
        const executionStyle = primaryIntents.includes('get_workout_plan') ? readExecutionStyle() : null;

        return {
            submittedAt: new Date().toISOString(),
            primary_intents: primaryIntents,
            execution_style: executionStyle,
            support_preferences: supportPreferences,
        };
    };

    const allInputs = Array.from(form.querySelectorAll('label.intake-check input'));
	    const syncCheckUi = () => {
	        allInputs.forEach((input) => {
	            const row = input.closest('label.intake-check');
	            if (!row) return;
	            row.classList.toggle('is-checked', Boolean(input.checked));
	        });
	    };

	    const stepStatusByStep = {
	        1: 'Intent',
	        2: 'Execution style',
	        3: 'Support',
	    };

	    const getActiveFlowSteps = () => {
	        const intents = collectPrimaryIntents();
	        const needsExecutionStyle = intents.includes('get_workout_plan');
	        return needsExecutionStyle ? [1, 2, 3] : [1, 3];
	    };

	    const getProgressMeta = (step) => {
	        const flow = getActiveFlowSteps();
	        const idx = flow.indexOf(step);
	        if (idx === -1) return null;

	        const pos = idx + 1;
	        const total = flow.length;
	        const fill = Math.floor((pos / total) * 100);

	        return {
	            label: `Step ${pos} of ${total}`,
	            status: stepStatusByStep[step] || '',
	            fill,
	        };
	    };

	    const syncProgress = () => {
	        if (progressWrap) progressWrap.style.display = state.step === 4 ? 'none' : '';
	        const meta = getProgressMeta(state.step);
	        if (!meta) return;
	        if (progressLabel) progressLabel.textContent = meta.label;
	        if (progressStatus) progressStatus.textContent = meta.status;
	        if (progressFill) progressFill.style.width = `${meta.fill}%`;
	    };

	    const setStep = (step) => {
	        state.step = step;
	        form.dataset.step = String(step);
	        if (track) track.style.transform = `translateX(-${(step - 1) * 100}%)`;
	        syncProgress();

	        updateCtas();
	        resizeViewport();
	    };

    const step1Next = form.querySelector('[data-step="1"] [data-intake-next]');
    const step2Next = form.querySelector('[data-step="2"] [data-intake-next]');

	    const updateCtas = () => {
	        const primaryIntents = collectPrimaryIntents();
	        const hasPrimary = primaryIntents.length > 0;
	        const needsExecutionStyle = primaryIntents.includes('get_workout_plan');
	        const hasStyle = Boolean(readExecutionStyle());

        if (step1Next) step1Next.disabled = !hasPrimary;
	        if (step2Next) step2Next.disabled = needsExecutionStyle ? !hasStyle : true;
	        if (submitBtn) submitBtn.disabled = false;

	        if (trust) trust.textContent = 'This just controls what we show you — nothing is locked.';

	        const subhead = form.closest('.offer-save-card')?.querySelector('.intake-subhead');
	        if (subhead) subhead.textContent = `${needsExecutionStyle ? '3' : '2'} questions. Takes about 30 seconds.`;
	    };

    const resizeViewport = () => {
        if (!viewport) return;
        const active = form.querySelector(`.intake-screen[data-step="${state.step}"]`);
        if (!active) return;
        const h = Math.ceil(active.scrollHeight);
        if (h > 0) viewport.style.height = `${h}px`;
    };

	    syncCheckUi();
	    updateCtas();
	    syncProgress();
	    window.requestAnimationFrame(() => {
	        resizeViewport();
	        window.requestAnimationFrame(resizeViewport);
	    });

	    allInputs.forEach((input) => input.addEventListener('change', () => {
	        syncCheckUi();
	        updateCtas();
	        syncProgress();
	        resizeViewport();
	    }));

    form.querySelectorAll('[data-intake-next]')?.forEach((btn) => {
        btn.addEventListener('click', () => {
            const primaryIntents = collectPrimaryIntents();
            if (state.step === 1) {
                if (primaryIntents.length === 0) return;
                const needsExecutionStyle = primaryIntents.includes('get_workout_plan');
                setStep(needsExecutionStyle ? 2 : 3);
                return;
            }
            if (state.step === 2) {
                if (!readExecutionStyle()) return;
                setStep(3);
                return;
            }
        });
    });

    form.querySelectorAll('[data-intake-redo]')?.forEach((btn) => {
        btn.addEventListener('click', () => {
            allInputs.forEach((i) => (i.checked = false));
            syncCheckUi();
            updateCtas();
            try { localStorage.removeItem(ODE_BLUEPRINT_LS_KEY); } catch {}
            setStep(1);
        });
    });

    const hydrate = () => {
        const storedV2 = readStored();
        const stored = storedV2 && typeof storedV2 === 'object' ? storedV2 : safeJsonParse(localStorage.getItem('ode_blueprint_v1'));
        if (!stored || typeof stored !== 'object') return;

        const intents = Array.isArray(stored.primary_intents) ? stored.primary_intents : Array.isArray(stored.wants) ? stored.wants : [];
        form.querySelectorAll('input[name="primary_intents"]').forEach((i) => (i.checked = intents.includes(i.value)));

        const support = Array.isArray(stored.support_preferences) ? stored.support_preferences : [];
        form.querySelectorAll('input[name="support_preferences"]').forEach((i) => (i.checked = support.includes(i.value)));

        const style = String(stored.execution_style || '').trim();
        if (style) {
            const radio = form.querySelector(`input[name="execution_style"][value="${style}"]`);
            if (radio) radio.checked = true;
        }

	        syncCheckUi();
	        updateCtas();
	        syncProgress();
	        resizeViewport();
	    };
    hydrate();

    window.addEventListener('resize', () => {
        resizeViewport();
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const intents = collectPrimaryIntents();
        if (intents.length === 0) return;
        if (intents.includes('get_workout_plan') && !readExecutionStyle()) {
            setStep(2);
            return;
        }

        const payload = buildBlueprint();
        writeStored(payload);

        try {
            fetch('/api/track/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    intake: payload,
                    path: `${location.pathname}${location.search}${location.hash}`,
                })
            }).catch(() => {});
        } catch {}

        window.location.href = 'blueprint.html';
    });
}

function buildSplit(goal, days, equipment) {
    let splitLabel = 'Upper / Lower';
    let progression = 'Add 1-2% load weekly or +1 rep until RIR 1, then deload.';

    if (goal === 'strength') {
        splitLabel = days === '3' ? 'Full body x3' : 'Upper / Lower with heavy priority';
        progression = 'Double progression: add 5-10 lbs when you hit top reps at RIR 1-2.';
    } else if (goal === 'hypertrophy') {
        splitLabel = days === '5' ? 'Push / Pull / Legs / Upper / Accessories' : 'Upper / Lower / Push / Pull';
        progression = 'Add 1-2 reps per set until RIR 1-2, then +2.5-5 lbs and reset reps.';
    } else if (goal === 'recomp') {
        splitLabel = 'Full body with conditioning finishers';
        progression = 'Alternate load and density focus weekly; keep RIR 2-3 on compounds.';
    }

    if (equipment === 'home') {
        progression = `${progression} Use tempo (3-1-1) and pause reps; add sets before load.`;
    }

    return { splitLabel, progression };
}

function setupNsNextBoxTyping() {
    const el = document.getElementById('ns-next-typed');
    if (!el) return;

    const fullText = [
        "Most people fail because they use a macro calculator,",
        "but don't know how to turn those numbers into food.",
        "",
        "In under 60 seconds, we build a grocery list",
        "that matches your macros."
    ].join('\n');

    const prefersReducedMotion = (() => {
        try {
            return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch {
            return false;
        }
    })();

    const typeInto = (node, text) => {
        if (prefersReducedMotion) {
            node.textContent = text;
            return;
        }
        if (node.dataset.typed === '1') return;
        node.dataset.typed = '1';
        node.textContent = '';

        let idx = 0;
        const tick = () => {
            if (idx >= text.length) return;
            node.textContent += text[idx];
            idx += 1;
            window.setTimeout(tick, 14);
        };
        tick();
    };

    if (prefersReducedMotion) {
        typeInto(el, fullText);
        return;
    }

    try {
        const observer = new IntersectionObserver((entries) => {
            const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.35);
            if (!visible) return;
            observer.disconnect();
            typeInto(el, fullText);
        }, { threshold: [0, 0.35, 1] });
        observer.observe(el);
    } catch {
        typeInto(el, fullText);
    }
}

/* ============================================
   SCROLL REVEAL
   ============================================ */

function setupReveal() {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('visible');
        });
    }, { threshold: 0.18 });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* ============================================
   STAT COUNTERS
   ============================================ */

function setupCounters() {
    const counters = document.querySelectorAll('.stat-number[data-target]');
    counters.forEach(counter => {
        const target = Number(counter.dataset.target || 0);
        const start = 0;
        const duration = 1400;
        const startTime = performance.now();

        const tick = now => {
            const progress = Math.min((now - startTime) / duration, 1);
            const value = Math.floor(progress * (target - start) + start);
            counter.textContent = counter.dataset.suffix ? `${value}${counter.dataset.suffix}` : value.toLocaleString();
            if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    });
}

/* ============================================
   TRIAL BADGE
   ============================================ */

function setupTrialBadge() {
    const shouldShow = document.body.classList.contains('training-page') || document.body.classList.contains('training-status-page');
    if (!shouldShow) {
        const existing = document.getElementById('trial-badge');
        if (existing) existing.remove();
        return;
    }

    const hasTrainingNav = !!document.querySelector('.nav-training, a[href="training.html"]');
    if (!hasTrainingNav) return;

    // Remove legacy/duplicate badge if present (older Training UI injected this).
    document.querySelectorAll('.training-free-badge').forEach((n) => n.remove());

    if (document.getElementById('trial-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'trial-badge';
    badge.className = 'trial-badge';
    badge.textContent = 'Coming soon';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', 'Trial badge');
    document.body.appendChild(badge);
}

function setupComingSoonLinks() {
    const message = "We'll be done with it by next week.";
    const showComingSoon = () => {
        if (typeof odeConfirm === 'function') {
            odeConfirm({
                title: 'Coming soon',
                message,
                confirmText: 'Got it',
                cancelText: 'Close'
            });
            return;
        }
        alert(`Coming soon. ${message}`);
    };

    const addSubtext = (link, text) => {
        if (!link) return;
        const textEl = link.querySelector('.text') || link;
        let sub = textEl.querySelector('.control-sub');
        if (!sub) {
            sub = document.createElement('span');
            sub.className = 'control-sub';
            textEl.appendChild(sub);
        }
        sub.textContent = text;
    };

    const lockLink = (link, { addSub = false } = {}) => {
        if (!link) return;
        if (addSub) addSubtext(link, 'Coming soon');
        link.classList.add('coming-soon-item', 'is-locked', 'coming-soon-link');
        link.setAttribute('aria-disabled', 'true');
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            } else {
                e.stopPropagation();
            }
            showComingSoon();
        });
    };

    const trainingControl = document.querySelector('.control-panel a.control-link[href="training.html"]');
    const storeControl = document.querySelector('.control-panel a.control-link[href="store.html"]');
    const progressControl = document.querySelector('.control-panel a.control-link[href="training-status.html"]');
    const dashControl = document.querySelector('.control-panel .control-link#control-checkin');
    const leaderboardControl = document.querySelector('.control-panel a.control-link[href="leaderboard.html"]');
    lockLink(trainingControl, { addSub: true });
    lockLink(storeControl, { addSub: true });
    lockLink(progressControl, { addSub: true });
    lockLink(dashControl, { addSub: true });
    lockLink(leaderboardControl, { addSub: true });

    document.querySelectorAll('.nav-training-sub').forEach((el) => {
        el.textContent = 'Coming soon';
    });
    document.querySelectorAll('.nav-training').forEach((el) => {
        el.classList.add('coming-soon-link');
    });
    const trainingNav = document.querySelector('.nav-training');
    if (trainingNav) {
        lockLink(trainingNav);
    }

    const navMenu = document.getElementById('nav-menu');
    if (navMenu && !navMenu.querySelector('a[href="macro-calculator.html"]')) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'macro-calculator.html';
        a.textContent = 'Macro Calculator';
        li.appendChild(a);
        navMenu.appendChild(li);
    }

    const storeNav = document.querySelector('.nav-menu a[href="store.html"]');
    if (storeNav) {
        if (!storeNav.classList.contains('nav-training')) {
            storeNav.classList.add('nav-training');
        }
        let main = storeNav.querySelector('.nav-training-main');
        if (!main) {
            const mainSpan = document.createElement('span');
            mainSpan.className = 'nav-training-main';
            mainSpan.textContent = storeNav.textContent.trim() || 'Store';
            storeNav.textContent = '';
            storeNav.appendChild(mainSpan);
            main = mainSpan;
        }
        let sub = storeNav.querySelector('.nav-training-sub');
        if (!sub) {
            sub = document.createElement('span');
            sub.className = 'nav-training-sub';
            storeNav.appendChild(sub);
        }
        sub.textContent = 'Coming soon';
        lockLink(storeNav);
    }
}

/* ============================================
   INIT
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initAuthUi();
    initAuthGate();
    initTracking();
    setupPreloader();
    setupNav();
    setupMacroNavLink();
    setupTrialBadge();
    setupComingSoonLinks();
    setupSmoothScroll();
    initTrainingHandoffOneOnOne();
    initNutritionFunnel();
    setupNsNextBoxTyping();
    setupGroceryFinalPage();
    setupGroceryPlanPage();
    checkGroceryReturn();
    loadYouTubeShorts();
    setupPricingToggle();
    setupResourceForm();
    setupContactForm();
    setupProductCheckouts();
    setupResourceDownloads();
    setupBuilderModal();
    setupGetStartedIntake();
    setupReveal();
    setupCounters();
    setupControlPanel();
    setupBasicCheckin();
    setupProgressPhotos();
    setupOnboardingTour();

    console.log('odeology_ site initialized');
});

function ensureBasicCheckinModal() {
    let modal = document.getElementById('checkin-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'checkin-modal';
    modal.className = 'checkin-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="checkin-backdrop" data-checkin-close></div>
        <div class="checkin-card dash-checkin-card" role="document">
            <div class="checkin-head">
                <div>
                    <h3 class="checkin-title">Daily Dash</h3>
                    <p class="checkin-sub">Quick win for today. Log what matters, keep momentum.</p>
                </div>
                <button type="button" class="checkin-close" data-checkin-close aria-label="Close">&times;</button>
            </div>
            <div class="checkin-alert hidden" id="checkin-alert" role="status" aria-live="polite"></div>

            <div class="checkin-weekbar" aria-label="Week navigation">
                <div class="checkin-weekbar-top">
                    <div class="checkin-weekbar-center">
                        <div class="checkin-selected" id="checkin-selected-label">&mdash;</div>
                        <div class="checkin-weekmeta" id="checkin-week-meta">&mdash;</div>
                        <div class="checkin-lock hidden" id="checkin-lock-note"></div>
                    </div>
                </div>
                <div class="checkin-weekbar-days" id="checkin-week-days" role="group" aria-label="Days in week"></div>
            </div>

            <div class="checkin-tabs" role="tablist" aria-label="Check-in sections">
                <button class="checkin-tab active" type="button" data-checkin-tab="0" role="tab" aria-selected="true">Weight</button>
                <button class="checkin-tab" type="button" data-checkin-tab="1" role="tab" aria-selected="false">Measurements</button>
                <button class="checkin-tab" type="button" data-checkin-tab="2" role="tab" aria-selected="false">Progress pictures</button>
                <button class="checkin-tab" type="button" data-checkin-tab="3" role="tab" aria-selected="false">Meals</button>
                <button class="checkin-tab" type="button" data-checkin-tab="4" role="tab" aria-selected="false">Extras</button>
            </div>

            <div class="checkin-flow" role="group" aria-label="Check-in questions">
                <input id="checkin-date" type="date" class="checkin-date-hidden" tabindex="-1" aria-hidden="true">
                <section class="checkin-step" data-checkin-step data-step-title="Weight">
                    <h4 class="checkin-step-title">Weight</h4>
                    <p class="checkin-step-sub">Weight is the only field most people need daily.</p>
                    <div class="checkin-grid">
                        <label class="ns-field">
                            <span>Weight (lb)</span>
                            <input id="checkin-weight" type="number" inputmode="decimal" placeholder="e.g. 198.4">
                        </label>
                    </div>
                </section>

                <section class="checkin-step checkin-step-hidden" data-checkin-step data-step-title="Measurements">
                    <h4 class="checkin-step-title">Measurements (optional)</h4>
                    <p class="checkin-step-sub">If you donâ€™t measure today, leave these blank.</p>
                    <div class="checkin-grid">
                        <label class="ns-field">
                            <span>Waist (in)</span>
                            <input id="checkin-waist" type="number" inputmode="decimal" step="0.1" placeholder="e.g. 34.0">
                        </label>
                        <label class="ns-field">
                            <span>Body fat (%)</span>
                            <input id="checkin-bodyfat" type="number" inputmode="decimal" step="0.1" placeholder="e.g. 18.5">
                        </label>
                        <label class="ns-field">
                            <span>Chest (in)</span>
                            <input id="checkin-chest" type="number" inputmode="decimal" step="0.1" placeholder="e.g. 41.0">
                        </label>
                        <label class="ns-field">
                            <span>Hips (in)</span>
                            <input id="checkin-hips" type="number" inputmode="decimal" step="0.1" placeholder="e.g. 38.0">
                        </label>
                    </div>
                </section>

                <section class="checkin-step checkin-step-hidden" data-checkin-step data-step-title="Progress pictures">
                    <h4 class="checkin-step-title">Progress pictures</h4>
                    <p class="checkin-step-sub">Same lighting, same pose. 30 seconds now saves weeks of second-guessing later.</p>
                    <div class="checkin-grid">
                        <div class="ns-field checkin-pp-field">
                            <span>Today’s photos (recommended)</span>
                            <div class="ns-muted tiny">Front + side + back. Relaxed posture. Camera at chest height.</div>
                            <button class="btn btn-primary" type="button" id="checkin-progress-photos">Add / compare photos</button>
                            <div class="ns-muted tiny">You can compare past dates inside the photo screen.</div>
                        </div>
                    </div>
                </section>

                <section class="checkin-step checkin-step-hidden" data-checkin-step data-step-title="Meals">
                    <h4 class="checkin-step-title">Meals</h4>
                    <p class="checkin-step-sub">Tap a meal box to see the premade plan, then log what you actually ate.</p>
                    <div class="checkin-grid">
                        <div class="ns-field checkin-meals-field">
                            <span>Log meals</span>
                            <div class="ns-muted tiny">If you didn’t eat the planned meal, use “Didn’t eat” / “Clear all” inside the popup.</div>
                            <div class="checkin-meals-head">
                                <div class="ns-muted tiny" id="checkin-meals-summary">—</div>
                            </div>
                            <div class="checkin-meal-buttons" id="checkin-meal-buttons" aria-label="Meal buttons"></div>

                            <input type="hidden" id="checkin-meals-ok" value="">
                        </div>
                    </div>
                </section>

                <section class="checkin-step checkin-step-hidden" data-checkin-step data-step-title="Extras">
                    <h4 class="checkin-step-title">Extras</h4>
                    <p class="checkin-step-sub">Optional context that helps you spot patterns (and forgive yourself faster).</p>
                    <div class="checkin-grid">
                        <label class="ns-field">
                            <span>Did you meal prep?</span>
                            <select id="checkin-mealprep">
                                <option value="">—</option>
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                            </select>
                            <div class="ns-muted tiny">If “No”, add a quick note — it becomes your playbook.</div>
                        </label>
                        <div class="ns-field hidden" id="checkin-mealprep-note-wrap">
                            <span>What got in the way?</span>
                            <textarea id="checkin-mealprep-note" rows="3" placeholder="e.g. ran out of groceries, travel, time, stress..."></textarea>
                        </div>
                        <label class="ns-field">
                            <span>Mood (1–5)</span>
                            <select id="checkin-mood">
                                <option value="">—</option>
                                <option value="1">1 (low)</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                                <option value="5">5 (great)</option>
                            </select>
                        </label>
                        <div class="ns-field" id="checkin-mood-note-wrap">
                            <span>Why that mood?</span>
                            <textarea id="checkin-mood-note" rows="3" placeholder="Quick note (sleep, work, stress, wins, etc.)"></textarea>
                            <div class="ns-muted tiny">This is private — it’s just for your trend awareness.</div>
                        </div>
                    </div>
                </section>
            </div>
            <div class="checkin-actions">
                <div class="checkin-actions-left">
                    <button class="btn btn-ghost" type="button" id="checkin-clear">Clear</button>
                    <button class="btn btn-ghost" type="button" id="checkin-load">Load last</button>
                </div>
                <div class="checkin-actions-right">
                    <button class="btn btn-ghost checkin-btn-hidden" type="button" id="checkin-prev">Back</button>
                    <button class="btn btn-ghost" type="button" id="checkin-next">Continue</button>
                    <button class="btn btn-primary" type="button" id="checkin-save">Save check-in</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function ensureCheckinMealModal() {
    let modal = document.getElementById('checkin-meal-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'checkin-meal-modal';
    modal.className = 'checkin-modal hidden checkin-meal-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="checkin-backdrop" data-cmm-close></div>
        <div class="checkin-card meal-log-card" role="document">
            <div class="checkin-head">
                <div>
                    <h3 class="checkin-title" id="cmm-title">Meal</h3>
                    <p class="checkin-sub" id="cmm-sub">Planned vs. actual. Clear it if you didn’t eat it.</p>
                </div>
                <div class="meal-log-head-actions">
                    <button class="btn btn-ghost" type="button" id="cmm-skip">Didn’t eat</button>
                    <button class="btn btn-ghost" type="button" id="cmm-clear">Clear all</button>
                    <button type="button" class="checkin-close" data-cmm-close aria-label="Close">&times;</button>
                </div>
            </div>
            <div class="checkin-alert hidden" id="cmm-alert" role="status" aria-live="polite"></div>

            <div class="meal-log-plan" id="cmm-plan" aria-label="Planned meal"></div>

            <div class="meal-log-table" aria-label="Meal rows">
                <div class="meal-log-row meal-log-row-head" aria-hidden="true">
                    <div>Food</div>
                    <div>Qty (oz)</div>
                    <div>Kcal</div>
                    <div>P</div>
                    <div>C</div>
                    <div>F</div>
                </div>
                <div id="cmm-rows"></div>
            </div>

            <div class="meal-log-actions">
                <button class="btn btn-ghost" type="button" id="cmm-add">Add row</button>
                <div style="flex: 1 1 auto;"></div>
                <button class="btn btn-ghost" type="button" id="cmm-cancel">Cancel</button>
                <button class="btn btn-primary" type="button" id="cmm-save">Save</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

function ensureProgressPhotosModal() {
    let modal = document.getElementById('progress-photos-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'progress-photos-modal';
    modal.className = 'checkin-modal hidden progress-photos-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="checkin-backdrop" data-pp-close></div>
        <div class="checkin-card pp-card" role="document">
            <div class="checkin-head">
                <div>
                    <h3 class="checkin-title">Progress photos</h3>
                    <p class="checkin-sub">Front + side + back photos help you see changes that the scale canâ€™t.</p>
                </div>
                <button type="button" class="checkin-close" data-pp-close aria-label="Close">&times;</button>
            </div>
            <div class="checkin-alert hidden" id="pp-alert" role="status" aria-live="polite"></div>

            <div class="pp-tabs" role="tablist" aria-label="Photo pose">
                <button class="pp-tab active" type="button" data-pp-pose="front" role="tab" aria-selected="true">Front</button>
                <button class="pp-tab" type="button" data-pp-pose="side" role="tab" aria-selected="false">Side</button>
                <button class="pp-tab" type="button" data-pp-pose="back" role="tab" aria-selected="false">Back</button>
            </div>

            <div class="pp-grid">
                <div class="pp-left">
                    <div class="pp-preview">
                        <img id="pp-preview-img" class="hidden" alt="Preview">
                        <div class="pp-preview-empty" id="pp-preview-empty">
                            <div class="pp-preview-title">No photo yet</div>
                            <div class="pp-preview-sub ns-muted">Add one for today, or compare past dates.</div>
                        </div>
                        <div class="pp-preview-meta" id="pp-preview-meta"></div>
                    </div>

                    <div class="pp-actions">
                        <input id="pp-file" class="hidden" type="file" accept="image/*" capture="user">
                        <button class="btn btn-primary" type="button" id="pp-upload">Upload photo</button>
                        <button class="btn btn-ghost" type="button" id="pp-compare">Compare</button>
                    </div>
                    <div class="pp-tip">
                        <div class="pp-tip-title">Framing (quick)</div>
                        <div class="pp-tip-sub ns-muted">Same lighting, same distance, relaxed posture. Use these references:</div>
                        <div class="pp-tip-images">
                            <img src="assets/images/progress-guides/front-reference.webp" alt="Front photo framing reference">
                            <img src="assets/images/progress-guides/side-reference.webp" alt="Side photo framing reference">
                        </div>
                    </div>
                </div>

                <div class="pp-right">
                    <div class="pp-list-head">
                        <div class="pp-list-title">Your photos</div>
                        <div class="ns-muted tiny" id="pp-list-sub">Saved to your account when signed in.</div>
                    </div>
                    <div class="pp-list" id="pp-list"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function ensureProgressCompareModal() {
    let modal = document.getElementById('progress-compare-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'progress-compare-modal';
    modal.className = 'checkin-modal hidden progress-compare-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="checkin-backdrop" data-pc-close></div>
        <div class="checkin-card pc-card" role="document">
            <div class="checkin-head">
                <div>
                    <h3 class="checkin-title">Compare photos</h3>
                    <p class="checkin-sub">Pick two dates and compare side-by-side.</p>
                </div>
                <button type="button" class="checkin-close" data-pc-close aria-label="Close">&times;</button>
            </div>
            <div class="pc-controls">
                <label class="ns-field">
                    <span>Pose</span>
                    <select id="pc-pose">
                        <option value="front">Front</option>
                        <option value="side">Side</option>
                        <option value="back">Back</option>
                    </select>
                </label>
                <label class="ns-field">
                    <span>Date A</span>
                    <select id="pc-a"></select>
                </label>
                <label class="ns-field">
                    <span>Date B</span>
                    <select id="pc-b"></select>
                </label>
            </div>
            <div class="pc-grid" id="pc-grid">
                <div class="pc-slot">
                    <div class="pc-label" id="pc-a-label">—</div>
                    <img id="pc-a-img" alt="Photo A">
                </div>
                <div class="pc-slot">
                    <div class="pc-label" id="pc-b-label">—</div>
                    <img id="pc-b-img" alt="Photo B">
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function ensureProgressPhotosGalleryModal() {
    let modal = document.getElementById('progress-photos-gallery-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'progress-photos-gallery-modal';
    modal.className = 'checkin-modal hidden progress-photos-gallery-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="checkin-backdrop" data-ppg-close></div>
        <div class="checkin-card ppg-card" role="document">
            <div class="checkin-head">
                <div>
                    <h3 class="checkin-title">All progress photos</h3>
                    <p class="checkin-sub" id="ppg-sub">Loading...</p>
                </div>
                <button type="button" class="checkin-close" data-ppg-close aria-label="Close">&times;</button>
            </div>
            <div class="ppg-list" id="ppg-list" aria-label="All progress photos"></div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function setupBasicCheckin() {
    const checkinControl = document.getElementById('control-checkin');
    if (!checkinControl) return;
    const modal = ensureBasicCheckinModal();
    const mealModal = ensureCheckinMealModal();
    const alertEl = modal.querySelector('#checkin-alert');

    const showAlert = (msg) => {
        if (!alertEl) return;
        if (!msg) {
            alertEl.classList.add('hidden');
            alertEl.textContent = '';
            return;
        }
        alertEl.textContent = String(msg);
        alertEl.classList.remove('hidden');
    };

    const byId = (id) => modal.querySelector(`#${id}`);
    const mmById = (id) => mealModal.querySelector(`#${id}`);
    const dateEl = byId('checkin-date');
    const weightEl = byId('checkin-weight');
    const bodyfatEl = byId('checkin-bodyfat');
    const waistEl = byId('checkin-waist');
    const chestEl = byId('checkin-chest');
    const hipsEl = byId('checkin-hips');
    const kcalEl = byId('checkin-kcal');
    const proteinEl = byId('checkin-protein');
    const carbsEl = byId('checkin-carbs');
    const fatsEl = byId('checkin-fats');
    const moodEl = byId('checkin-mood');
    const mealPrepEl = byId('checkin-mealprep');
    const mealPrepNoteWrapEl = byId('checkin-mealprep-note-wrap');
    const mealPrepNoteEl = byId('checkin-mealprep-note');
    const moodNoteEl = byId('checkin-mood-note');
    const mealsOkEl = byId('checkin-meals-ok');
    const mealsSummaryEl = byId('checkin-meals-summary');
    const mealButtonsEl = byId('checkin-meal-buttons');
    const progressPhotosBtn = byId('checkin-progress-photos');
    const mealEditorEl = byId('checkin-meal-editor'); // legacy (removed from modal markup)
    const mealHideBtn = null;
    const mealCloseBtn = null;
    const mealTitleEl = null;
    const mealStatusEl = null;
    const mealPlannedEl = null;
    const mealActualEl = null;
    const mealServingsEl = null;
    const mealNotesEl = null;
    const mealOverrideBtn = null;
    const mealClearBtn = null;
    const mealSaveBtn = null;
    const selectedLabelEl = byId('checkin-selected-label');
    const weekMetaEl = byId('checkin-week-meta');
    const lockNoteEl = byId('checkin-lock-note');
    const weekDaysEl = byId('checkin-week-days');
    const prevBtn = byId('checkin-prev');
    const nextBtn = byId('checkin-next');

    const stepEls = Array.from(modal.querySelectorAll('[data-checkin-step]'));
    const tabEls = Array.from(modal.querySelectorAll('[data-checkin-tab]'));
    let stepIndex = 0;

    const mealPlanSnap = readMealPlanSnapshotForLogging();
    const mealsPerDay = (() => {
        try {
            const prefs = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
            const n = Number(prefs?.mealsPerDay);
            if (Number.isFinite(n) && n >= 2 && n <= 5) return Math.round(n);
        } catch {
            // ignore
        }
        const n = Number(mealPlanSnap?.mealsPerDay);
        if (Number.isFinite(n) && n >= 2 && n <= 5) return Math.round(n);
        return 3;
    })();

    let mealEntries = {};
    let activeMealIndex = null;
    let activeOverride = false;

    const cmmTitleEl = mmById('cmm-title');
    const cmmSubEl = mmById('cmm-sub');
    const cmmAlertEl = mmById('cmm-alert');
    const cmmPlanEl = mmById('cmm-plan');
    const cmmRowsEl = mmById('cmm-rows');
    const cmmSkipBtn = mmById('cmm-skip');
    const cmmClearBtn = mmById('cmm-clear');
    const cmmAddBtn = mmById('cmm-add');
    const cmmCancelBtn = mmById('cmm-cancel');
    const cmmSaveBtn = mmById('cmm-save');

    let cmmState = { mealIndex: null, dirty: false, hasPlan: false, rows: [] };

    const plannedMealText = (index) => {
        const entry = Array.isArray(mealPlanSnap?.meals)
            ? mealPlanSnap.meals.find((m) => Number(m?.index) === Number(index))
            : null;
        return entry?.plannedText ? String(entry.plannedText) : '';
    };

    const plannedMealRows = (index) => {
        const entry = Array.isArray(mealPlanSnap?.meals)
            ? mealPlanSnap.meals.find((m) => Number(m?.index) === Number(index))
            : null;
        const items = Array.isArray(entry?.items) ? entry.items : [];
        return items.map((i) => ({
            name: String(i?.foodName || '').trim(),
            qty: String(i?.measurementText || '').trim(),
            kcal: i?.calories ?? '',
            p: i?.protein_g ?? '',
            c: i?.carbs_g ?? '',
            f: i?.fat_g ?? ''
        })).filter((r) => r.name);
    };

    const cmmShowAlert = (msg) => {
        if (!cmmAlertEl) return;
        if (!msg) {
            cmmAlertEl.classList.add('hidden');
            cmmAlertEl.textContent = '';
            return;
        }
        cmmAlertEl.textContent = String(msg);
        cmmAlertEl.classList.remove('hidden');
    };

    const normalizeCmmRows = (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.map((r) => ({
            name: String(r?.name || '').trim(),
            qty: String(r?.qty || '').trim(),
            kcal: String(r?.kcal ?? '').trim(),
            p: String(r?.p ?? '').trim(),
            c: String(r?.c ?? '').trim(),
            f: String(r?.f ?? '').trim()
        })).filter((r) => r.name || r.qty || r.kcal || r.p || r.c || r.f);
    };

    const cmmRenderRows = () => {
        if (!cmmRowsEl) return;
        const rows = Array.isArray(cmmState.rows) ? cmmState.rows : [];
        const safeRows = rows.length ? rows : [{ name: '', qty: '', kcal: '', p: '', c: '', f: '' }];
        cmmState.rows = safeRows;

        cmmRowsEl.innerHTML = safeRows.map((r, i) => `
            <div class="meal-log-row" data-cmm-row="${i}">
                <input class="meal-log-input meal-log-name" data-cmm-field="name" data-cmm-i="${i}" placeholder="e.g. Chicken breast" value="${escapeHtml(r.name || '')}">
                <input class="meal-log-input meal-log-qty" data-cmm-field="qty" data-cmm-i="${i}" placeholder="e.g. 6 oz" value="${escapeHtml(r.qty || '')}">
                <input class="meal-log-input meal-log-num" data-cmm-field="kcal" data-cmm-i="${i}" inputmode="numeric" placeholder="—" value="${escapeHtml(r.kcal ?? '')}">
                <input class="meal-log-input meal-log-num" data-cmm-field="p" data-cmm-i="${i}" inputmode="numeric" placeholder="—" value="${escapeHtml(r.p ?? '')}">
                <input class="meal-log-input meal-log-num" data-cmm-field="c" data-cmm-i="${i}" inputmode="numeric" placeholder="—" value="${escapeHtml(r.c ?? '')}">
                <input class="meal-log-input meal-log-num" data-cmm-field="f" data-cmm-i="${i}" inputmode="numeric" placeholder="—" value="${escapeHtml(r.f ?? '')}">
                <button class="meal-log-del" type="button" data-cmm-del="${i}" aria-label="Remove row">&times;</button>
            </div>
        `).join('');

        cmmRowsEl.querySelectorAll('[data-cmm-field]').forEach((inp) => {
            inp.addEventListener('input', () => {
                const i = Number(inp.getAttribute('data-cmm-i'));
                const field = inp.getAttribute('data-cmm-field');
                if (!Number.isFinite(i) || i < 0) return;
                if (!field) return;
                cmmState.dirty = true;
                const next = String(inp.value || '');
                cmmState.rows[i] = cmmState.rows[i] || { name: '', qty: '', kcal: '', p: '', c: '', f: '' };
                cmmState.rows[i][field] = next;
            });
        });

        cmmRowsEl.querySelectorAll('[data-cmm-del]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.getAttribute('data-cmm-del'));
                if (!Number.isFinite(i) || i < 0) return;
                cmmState.dirty = true;
                cmmState.rows = cmmState.rows.filter((_, idx) => idx !== i);
                cmmRenderRows();
            });
        });
    };

    const renderMealSummary = () => {
        const keys = Object.keys(mealEntries || {});
        const logged = keys.length;
        const onPlan = keys.filter((k) => String(mealEntries[k]?.mode) === 'planned').length;
        const offPlan = keys.filter((k) => String(mealEntries[k]?.mode) === 'override').length;
        const summary = logged
            ? `Logged: ${logged}/${mealsPerDay} â€¢ On plan: ${onPlan} â€¢ Off plan: ${offPlan}`
            : `Logged: 0/${mealsPerDay}`;
        if (mealsSummaryEl) mealsSummaryEl.textContent = summary;

        // Keep compatibility field for other UI: yes/no derived.
        if (mealsOkEl) {
            mealsOkEl.value = logged === 0 ? '' : (offPlan > 0 ? 'no' : 'yes');
        }
    };

    const renderMealButtons = () => {
        if (!mealButtonsEl) return;
        mealButtonsEl.innerHTML = Array.from({ length: mealsPerDay }).map((_, i) => {
            const idx = i + 1;
            const done = !!mealEntries[String(idx)];
            const planned = plannedMealRows(idx);
            const plannedNames = planned.slice(0, 2).map((r) => String(r?.name || '').trim()).filter(Boolean);
            const plannedPreview = plannedNames.join(', ');
            const plannedMore = planned.length > plannedNames.length;
            const sub = plannedPreview
                ? `${escapeHtml(plannedPreview)}${plannedMore ? '…' : ''}`
                : 'No premade meal';
            const cls = `btn btn-ghost checkin-meal-btn ${done ? 'done' : ''}`;
            return `
                <button type="button" class="${cls}" data-meal-btn="${idx}" aria-label="Meal ${idx}">
                    <div class="checkin-meal-top">
                        <div class="checkin-meal-label">Meal ${idx}</div>
                        <div class="checkin-meal-badge" aria-hidden="true">${done ? 'Logged' : 'Tap'}</div>
                    </div>
                    <div class="checkin-meal-sub ns-muted tiny">${sub}</div>
                </button>
            `;
        }).join('');
        mealButtonsEl.querySelectorAll('[data-meal-btn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-meal-btn'));
                if (!idx) return;
                openMealEditor(idx);
            });
        });
        renderMealSummary();
    };

    const cmmClose = () => {
        mealModal.classList.add('hidden');
        cmmShowAlert('');
    };

    const cmmOpen = (idx) => {
        const mealIndex = Number(idx) || null;
        if (!mealIndex) return;

        const plannedRows = plannedMealRows(mealIndex);
        const saved = mealEntries[String(mealIndex)] || null;
        const savedRows = Array.isArray(saved?.rows) ? saved.rows : null;

        cmmState = {
            mealIndex,
            dirty: false,
            hasPlan: plannedRows.length > 0,
            rows: savedRows || plannedRows || []
        };

        if (cmmTitleEl) cmmTitleEl.textContent = `Meal ${mealIndex}`;
        if (cmmSubEl) {
            cmmSubEl.textContent = cmmState.hasPlan
                ? 'Premade plan loaded. Edit if needed, or tap “Didn’t eat”.'
                : 'No plan found yet — add what you ate.';
        }
        if (cmmPlanEl) {
            if (!plannedRows.length) {
                cmmPlanEl.innerHTML = `
                    <div class="meal-log-plan-title">Premade plan</div>
                    <div class="ns-muted tiny">No premade meal found for this slot yet.</div>
                `;
            } else {
                const itemsHtml = plannedRows.map((r) => `
                    <div class="meal-log-plan-item">
                        <div class="meal-log-plan-name">${escapeHtml(r.name || '')}</div>
                        ${r.qty ? `<div class="meal-log-plan-qty ns-muted tiny">${escapeHtml(r.qty)}</div>` : ''}
                    </div>
                `).join('');
                cmmPlanEl.innerHTML = `
                    <div class="meal-log-plan-title">Premade plan</div>
                    <div class="meal-log-plan-items">${itemsHtml}</div>
                `;
            }
        }

        cmmShowAlert('');
        cmmRenderRows();
        mealModal.classList.remove('hidden');
        mealEditorEl?.classList?.add('hidden');

        const first = cmmRowsEl?.querySelector('input');
        first?.focus?.();
    };

    const openMealEditor = (idx) => {
        cmmOpen(idx);
    };

    cmmSkipBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(cmmState.mealIndex) || null;
        if (!idx) return;
        delete mealEntries[String(idx)];
        cmmClose();
        renderMealButtons();
        showAlert('Cleared meal.');
    });

    cmmClearBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        cmmState.dirty = true;
        cmmState.rows = [{ name: '', qty: '', kcal: '', p: '', c: '', f: '' }];
        cmmRenderRows();
        cmmShowAlert('Cleared. Add what you ate.');
    });

    cmmAddBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        cmmState.dirty = true;
        cmmState.rows = Array.isArray(cmmState.rows) ? cmmState.rows : [];
        cmmState.rows.push({ name: '', qty: '', kcal: '', p: '', c: '', f: '' });
        cmmRenderRows();
        const inputs = cmmRowsEl?.querySelectorAll('input');
        inputs?.[inputs.length - 6]?.focus?.();
    });

    cmmCancelBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        cmmClose();
    });

    cmmSaveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(cmmState.mealIndex) || null;
        if (!idx) return;

        const rows = normalizeCmmRows(cmmState.rows);
        if (!rows.length) {
            delete mealEntries[String(idx)];
            cmmClose();
            renderMealButtons();
            return;
        }

        const planned = plannedMealText(idx);
        const hasPlan = plannedMealRows(idx).length > 0;
        const mode = !hasPlan || cmmState.dirty ? 'override' : 'planned';
        const actualText = rows.map((r) => `â€¢ ${r.name}${r.qty ? ` — ${r.qty}` : ''}`).join('\n');

        mealEntries[String(idx)] = {
            index: idx,
            mode,
            plannedText: planned || null,
            actualText,
            servingsText: null,
            notes: null,
            rows
        };

        cmmClose();
        renderMealButtons();
        showAlert('Saved meal log.');
    });

    mealModal.querySelectorAll('[data-cmm-close]').forEach((el) => el.addEventListener('click', cmmClose));
    mealModal.addEventListener('keydown', (e) => { if (e.key === 'Escape') cmmClose(); });

    const closeMealEditor = () => {
        activeMealIndex = null;
        activeOverride = false;
        mealEditorEl?.classList.add('hidden');
    };

    mealHideBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        closeMealEditor();
    });
    mealCloseBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        closeMealEditor();
    });

    mealOverrideBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!activeMealIndex) return;
        activeOverride = true;
        if (mealStatusEl) mealStatusEl.textContent = 'Override — type what you ate (servings optional).';
        if (mealActualEl) mealActualEl.focus();
    });

    mealClearBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!activeMealIndex) return;
        delete mealEntries[String(activeMealIndex)];
        renderMealButtons();
        closeMealEditor();
    });

    mealSaveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!activeMealIndex) return;
        const planned = plannedMealText(activeMealIndex);
        const actual = String(mealActualEl?.value || '').trim();
        const servingsText = String(mealServingsEl?.value || '').trim();
        const notes = String(mealNotesEl?.value || '').trim();

        if (!actual && !planned) {
            showAlert('Add a meal note, or build a grocery plan to enable auto-fill.');
            return;
        }

        const mode = activeOverride ? 'override' : (planned ? 'planned' : 'override');
        const actualText = actual || planned;

        mealEntries[String(activeMealIndex)] = {
            index: activeMealIndex,
            mode,
            plannedText: planned || null,
            actualText,
            servingsText: servingsText || null,
            notes: notes || null
        };
        renderMealButtons();
        closeMealEditor();
        showAlert('Saved meal log.');
    });

    const setStep = (nextIndex, opts = {}) => {
        const { focus = true } = opts;
        if (!stepEls.length) return;

        stepIndex = Math.max(0, Math.min(Number(nextIndex) || 0, stepEls.length - 1));
        const isFirst = stepIndex === 0;
        const isLast = stepIndex === stepEls.length - 1;

        stepEls.forEach((el, i) => el.classList.toggle('checkin-step-hidden', i !== stepIndex));
        tabEls.forEach((el, i) => {
            const active = i === stepIndex;
            el.classList.toggle('active', active);
            el.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        if (prevBtn) prevBtn.classList.toggle('checkin-btn-hidden', isFirst);
        if (nextBtn) nextBtn.classList.toggle('checkin-btn-hidden', isLast);

        if (focus) {
            const focusable = stepEls[stepIndex]?.querySelector('input, select, textarea, button');
            focusable?.focus?.();
        }
    };

    prevBtn?.addEventListener('click', () => setStep(stepIndex - 1));
    nextBtn?.addEventListener('click', () => setStep(stepIndex + 1));
    tabEls.forEach((tab) => {
        tab.addEventListener('click', () => setStep(Number(tab.getAttribute('data-checkin-tab'))));
    });

    const todayIso = () => new Date().toISOString().slice(0, 10);
    let selectedDayIso = todayIso();
    if (dateEl) dateEl.value = selectedDayIso;

    const lsKey = 'ode_checkins_v1';
    const readGuestStore = () => {
        try {
            const raw = localStorage.getItem(lsKey);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    };
    const writeGuestStore = (store) => {
        try {
            localStorage.setItem(lsKey, JSON.stringify(store || {}));
        } catch {
            // ignore
        }
    };

    const toNum = (v) => {
        const n = Number(String(v ?? '').trim());
        return Number.isFinite(n) ? n : null;
    };

    const inferGoalMode = () => {
        try {
            const raw = localStorage.getItem('ode_saved_results_snapshot');
            const snap = raw ? JSON.parse(raw) : null;
            const goal = String(snap?.selections?.goal || '').trim().toLowerCase();
            if (goal === 'cut') return 'cut';
            if (goal === 'bulk') return 'bulk';
        } catch {}
        try {
            const prefs = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
            const mode = String(prefs?.mode || '').trim().toLowerCase();
            if (mode === 'cut') return 'cut';
            if (mode === 'bulk') return 'bulk';
        } catch {}
        return null;
    };

    const collect = () => {
        const day = String(dateEl?.value || '').trim() || todayIso();
        const mealList = Object.keys(mealEntries || {})
            .map((k) => mealEntries[k])
            .filter(Boolean)
            .sort((a, b) => Number(a.index) - Number(b.index));
        const mealPrepVal = String(mealPrepEl?.value || '').trim().toLowerCase();
        const mealPrepWhyRaw = String(mealPrepNoteEl?.value || '').trim();
        const moodWhyRaw = String(moodNoteEl?.value || '').trim();
        return {
            day,
            weightLb: toNum(weightEl?.value),
            bodyfatPct: toNum(bodyfatEl?.value),
            circumferences: {
                waistIn: toNum(waistEl?.value),
                chestIn: toNum(chestEl?.value),
                hipsIn: toNum(hipsEl?.value)
            },
            macros: {
                calories: toNum(kcalEl?.value),
                proteinG: toNum(proteinEl?.value),
                carbG: toNum(carbsEl?.value),
                fatG: toNum(fatsEl?.value)
            },
            mood: toNum(moodEl?.value),
            mealPrep: mealPrepEl?.value || null,
            mealPrepWhy: mealPrepVal === 'no' ? (mealPrepWhyRaw || null) : null,
            moodWhy: moodWhyRaw || null,
            mealsOnPlan: mealsOkEl?.value || null,
            meals: mealList
        };
    };

    const fill = (data) => {
        const d = data || {};
        if (dateEl && d.day) dateEl.value = String(d.day).slice(0, 10);
        if (weightEl) weightEl.value = d.weightLb ?? '';
        if (bodyfatEl) bodyfatEl.value = d.bodyfatPct ?? '';
        if (waistEl) waistEl.value = d.circumferences?.waistIn ?? '';
        if (chestEl) chestEl.value = d.circumferences?.chestIn ?? '';
        if (hipsEl) hipsEl.value = d.circumferences?.hipsIn ?? '';
        if (kcalEl) kcalEl.value = d.macros?.calories ?? '';
        if (proteinEl) proteinEl.value = d.macros?.proteinG ?? '';
        if (carbsEl) carbsEl.value = d.macros?.carbG ?? '';
        if (fatsEl) fatsEl.value = d.macros?.fatG ?? '';
        if (moodEl) moodEl.value = d.mood ?? '';
        if (mealPrepEl) mealPrepEl.value = d.mealPrep ?? '';
        if (mealPrepNoteEl) mealPrepNoteEl.value = d.mealPrepWhy ?? d.extras?.mealPrepWhy ?? '';
        if (moodNoteEl) moodNoteEl.value = d.moodWhy ?? d.extras?.moodWhy ?? '';
        if (mealsOkEl) mealsOkEl.value = d.mealsOnPlan ?? '';
        syncExtrasVisibility();

        // Meals: accept array or object.
        mealEntries = {};
        const meals = d.meals;
        if (Array.isArray(meals)) {
            meals.forEach((m) => {
                const idx = Number(m?.index);
                if (!idx) return;
                mealEntries[String(idx)] = {
                    index: idx,
                    mode: m?.mode === 'planned' ? 'planned' : 'override',
                    plannedText: m?.plannedText || null,
                    actualText: m?.actualText || '',
                    servingsText: m?.servingsText || null,
                    notes: m?.notes || null,
                    rows: Array.isArray(m?.rows) ? m.rows : null
                };
            });
        } else if (meals && typeof meals === 'object') {
            Object.keys(meals).forEach((k) => {
                const m = meals[k];
                const idx = Number(m?.index || k);
                if (!idx) return;
                mealEntries[String(idx)] = {
                    index: idx,
                    mode: m?.mode === 'planned' ? 'planned' : 'override',
                    plannedText: m?.plannedText || null,
                    actualText: m?.actualText || '',
                    servingsText: m?.servingsText || null,
                    notes: m?.notes || null,
                    rows: Array.isArray(m?.rows) ? m.rows : null
                };
            });
        }
        renderMealButtons();
    };

    function syncExtrasVisibility() {
        const mealPrepVal = String(mealPrepEl?.value || '').trim().toLowerCase();
        const showMealPrepWhy = mealPrepVal === 'no';
        mealPrepNoteWrapEl?.classList?.toggle('hidden', !showMealPrepWhy);
        if (!showMealPrepWhy && mealPrepNoteEl) mealPrepNoteEl.value = '';
    }

    mealPrepEl?.addEventListener('change', syncExtrasVisibility);
    syncExtrasVisibility();

    const clear = () => {
        const day = String(dateEl?.value || '').trim() || todayIso();
        fill({ day });
    };

    const fetchMe = async () => {
        try {
            const resp = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await resp.json().catch(() => ({}));
            return data?.user || null;
        } catch {
            return null;
        }
    };

    const loadCheckin = async () => {
        showAlert('');
        const day = String(dateEl?.value || '').trim() || todayIso();

        const me = await fetchMe();
        if (!me) {
            const store = readGuestStore();
            fill(store[day] || { day });
            showAlert(store[day] ? 'Loaded (guest storage).' : 'No check-in saved for this day yet.');
            return;
        }

        try {
            const resp = await fetch(`/api/training/checkin?day=${encodeURIComponent(day)}`, { credentials: 'include' });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                showAlert(data?.error || 'Could not load check-in.');
                return;
            }
            fill(data?.checkin?.data || { day });
            showAlert(data?.checkin ? 'Loaded your check-in.' : 'No check-in saved for this day yet.');
        } catch {
            showAlert('Could not load check-in.');
        }
    };

    const toIsoLocal = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const isoToDateLocal = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`);

    const addDaysIso = (iso, days) => {
        const d = isoToDateLocal(iso);
        d.setDate(d.getDate() + Number(days || 0));
        return toIsoLocal(d);
    };

    // "Program week" = fixed 7-day blocks within the month (1â€“7, 8â€“14, 15â€“21, 22â€“28, 29â€“31).
    // This matches the "if I'm on the 2nd, show 1stâ€“7th" requirement.
    const startOfProgramWeekIso = (iso) => {
        const d = isoToDateLocal(iso);
        const dom = d.getDate();
        const startDom = (Math.floor((dom - 1) / 7) * 7) + 1;
        const s = new Date(d);
        s.setDate(startDom);
        return toIsoLocal(s);
    };

    const endOfProgramWeekIso = (weekStartIso) => addDaysIso(weekStartIso, 6);

    const fmtDayLong = (iso) => {
        const d = isoToDateLocal(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    };

    const fmtRange = (startIso, endIso) => {
        const s = isoToDateLocal(startIso);
        const e = isoToDateLocal(endIso);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '—';
        const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
        const left = s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const right = e.toLocaleDateString(undefined, { month: sameMonth ? 'short' : 'short', day: 'numeric' });
        return `${left}\u2013${right}`;
    };

    const currentWeekStartIso = startOfProgramWeekIso(todayIso());
    const currentWeekEndIso = endOfProgramWeekIso(currentWeekStartIso);

    let checkinLocked = false;

    const setLocked = (locked) => {
        checkinLocked = !!locked;
        const msg = locked
            ? 'Locked: you canâ€™t log future days.'
            : '';

        if (lockNoteEl) {
            lockNoteEl.textContent = msg;
            lockNoteEl.classList.toggle('hidden', !msg);
        }

        const controls = Array.from(modal.querySelectorAll('.checkin-flow input:not(.checkin-date-hidden), .checkin-flow select, .checkin-flow textarea, .checkin-flow button'));
        controls.forEach((el) => { el.disabled = checkinLocked; });

        byId('checkin-save') && (byId('checkin-save').disabled = checkinLocked);
        byId('checkin-clear') && (byId('checkin-clear').disabled = checkinLocked);
        if (nextBtn) nextBtn.disabled = false;
        if (prevBtn) prevBtn.disabled = false;
    };

    const isEditableDay = (iso) => iso >= currentWeekStartIso && iso <= currentWeekEndIso && iso <= todayIso();

    const renderWeekStrip = (weekStartIso) => {
        if (!weekDaysEl) return;
        const html = Array.from({ length: 7 }, (_, i) => {
            const iso = addDaysIso(weekStartIso, i);
            const dom = isoToDateLocal(iso).getDate();
            const dow = isoToDateLocal(iso).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);
            const active = iso === selectedDayIso ? 'active' : '';
            const future = iso > todayIso();
            const locked = future ? 'locked' : '';
            const disabled = future ? 'disabled' : '';
            return `<button type="button" class="checkin-day ${active} ${locked}" data-iso="${iso}" ${disabled} aria-label="${dow} ${iso}"><span class="dow">${dow}</span><span class="dom">${dom}</span></button>`;
        }).join('');
        weekDaysEl.innerHTML = html;
        weekDaysEl.querySelectorAll('[data-iso]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const iso = btn.getAttribute('data-iso');
                if (!iso) return;
                await setSelectedDay(iso, { load: true });
            });
        });
    };

    const setSelectedDay = async (iso, { load = true } = {}) => {
        const nextIso = String(iso || '').slice(0, 10);
        if (!nextIso) return;
        if (nextIso < currentWeekStartIso || nextIso > currentWeekEndIso) return;
        if (nextIso > todayIso()) {
            showAlert('You canâ€™t log future days.');
            return;
        }
        selectedDayIso = nextIso;
        if (dateEl) dateEl.value = selectedDayIso;

        setStep(0, { focus: false });

        if (selectedLabelEl) selectedLabelEl.textContent = fmtDayLong(selectedDayIso);

        const endsInDays = (() => {
            const today = isoToDateLocal(todayIso());
            const end = isoToDateLocal(currentWeekEndIso);
            const diff = Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
            return Number.isFinite(diff) ? Math.max(0, diff) : null;
        })();

        if (weekMetaEl) {
            const endsTxt = endsInDays == null ? '' : ` Â· ends in ${endsInDays} day${endsInDays === 1 ? '' : 's'}`;
            weekMetaEl.textContent = `Week: ${fmtRange(currentWeekStartIso, currentWeekEndIso)}${endsTxt}`;
        }

        setLocked(!isEditableDay(selectedDayIso));
        renderWeekStrip(currentWeekStartIso);

        if (load) await loadCheckin();
    };

    progressPhotosBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.odeProgressPhotos?.open !== 'function') {
            showAlert('Progress photos are still loading. Try again.');
            return;
        }
        window.odeProgressPhotos.open({ day: selectedDayIso, pose: 'front' });
    });

    setSelectedDay(selectedDayIso, { load: false });

    const saveCheckin = async () => {
        if (checkinLocked) {
            showAlert('Locked: you can edit check-ins for the current week only.');
            return;
        }
        showAlert('Savingâ€¦');
        const payload = collect();
        const me = await fetchMe();
        const goalMode = inferGoalMode();

        if (Number.isFinite(payload.weightLb) && payload.weightLb > 0) {
            try {
                localStorage.setItem('ode_ts_current_weight_lb', String(payload.weightLb));
            } catch {
                // ignore
            }
        }

        if (!me) {
            const store = readGuestStore();
            store[payload.day] = payload;
            writeGuestStore(store);
            showAlert('Saved (guest storage). Sign in to sync across devices.');
            try {
                window.dispatchEvent(new CustomEvent('ode:checkin-saved', { detail: { payload, mode: 'guest' } }));
            } catch {
                // ignore
            }
            return;
        }

        // 1) Save weigh-in to training logic (auto-adjust + flags)
        if (Number.isFinite(payload.weightLb) && payload.weightLb > 0) {
            try {
                const wResp = await fetch('/api/training/weighin', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weightLb: payload.weightLb, goalMode })
                });
                const wData = await wResp.json().catch(() => ({}));
                if (wResp.ok) {
                    const offset = Number(wData?.profile?.calorie_offset) || 0;
                    if (Number.isFinite(offset)) localStorage.setItem('ode_training_calorie_offset', String(offset));
                    if (wData?.adjusted && wData?.warning) {
                        showAlert(wData.warning);
                    }
                    if (wData?.flagged) {
                        showAlert('âš ï¸ Profile flagged: 4+ auto-adjusts without progress.');
                    }
                }
            } catch {
                // ignore weigh-in failures
            }
        }

        // 2) Save daily check-in record
        try {
            const resp = await fetch('/api/training/checkin', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ day: payload.day, data: payload })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                showAlert(data?.error || 'Could not save check-in.');
                return;
            }
            showAlert('Saved your check-in.');
            try {
                window.dispatchEvent(new CustomEvent('ode:checkin-saved', { detail: { payload, mode: 'server', checkin: data?.checkin || null } }));
            } catch {
                // ignore
            }
        } catch {
            showAlert('Could not save check-in.');
        }
    };

    const open = async () => {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        await setSelectedDay(String(dateEl?.value || '').trim() || selectedDayIso || todayIso(), { load: true });
        setStep(0, { focus: true });
    };

    const close = () => {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        showAlert('');
        setStep(0, { focus: false });
    };

    checkinControl.addEventListener('click', (e) => {
        e.preventDefault();
        open();
    });

    modal.querySelectorAll('[data-checkin-close]').forEach((el) => {
        el.addEventListener('click', close);
    });
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });

    byId('checkin-clear')?.addEventListener('click', () => {
        clear();
        showAlert('');
    });
    byId('checkin-load')?.addEventListener('click', loadCheckin);
    byId('checkin-save')?.addEventListener('click', saveCheckin);
}

function setupProgressPhotos() {
    const PHOTO_LS_KEY = 'ode_progress_photos_v1';

    const todayIso = () => new Date().toISOString().slice(0, 10);

    const readGuest = () => {
        try {
            const raw = localStorage.getItem(PHOTO_LS_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object') return { photos: [] };
            const photos = Array.isArray(parsed.photos) ? parsed.photos : [];
            return { photos };
        } catch {
            return { photos: [] };
        }
    };

    const writeGuest = (photos) => {
        try {
            localStorage.setItem(PHOTO_LS_KEY, JSON.stringify({ photos: Array.isArray(photos) ? photos : [] }));
        } catch {
            // ignore
        }
    };

    const fileToJpegDataUrl = async (file, { maxDim = 1280, maxBytes = 1_000_000 } = {}) => {
        if (!file) return '';
        if (!String(file.type || '').startsWith('image/')) return '';

        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('read_failed'));
            reader.readAsDataURL(file);
        });

        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('img_load_failed'));
            i.src = dataUrl;
        });

        const srcW = Number(img.naturalWidth || img.width || 0);
        const srcH = Number(img.naturalHeight || img.height || 0);
        if (!srcW || !srcH) return '';

        const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
        const w = Math.max(1, Math.round(srcW * scale));
        const h = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.drawImage(img, 0, 0, w, h);

        const bytes = (s) => {
            const b64 = String(s || '').split(',')[1] || '';
            return Math.floor((b64.length * 3) / 4);
        };

        let q = 0.88;
        let out = canvas.toDataURL('image/jpeg', q);
        while (bytes(out) > maxBytes && q > 0.58) {
            q -= 0.08;
            out = canvas.toDataURL('image/jpeg', q);
        }
        return out;
    };

    const apiList = async () => {
        const me = await odeFetchMe();
        if (!me) return { ok: true, photos: readGuest().photos, mode: 'guest' };
        const resp = await odeFetchJson('/api/training/progress-photos?limit=180', { method: 'GET' });
        if (!resp.ok) {
            // Fallback to local if DB not configured.
            return { ok: false, status: resp.status, error: resp.json?.error || 'Failed', photos: readGuest().photos, mode: 'guest' };
        }
        return { ok: true, photos: Array.isArray(resp.json?.photos) ? resp.json.photos : [], mode: 'account' };
    };

    const apiSave = async ({ day, pose, imageDataUrl }) => {
        const me = await odeFetchMe();
        if (!me) {
            const current = readGuest().photos;
            const next = current.filter((p) => !(p.day === day && p.pose === pose));
            next.unshift({ id: `guest:${pose}:${day}`, day, pose, imageDataUrl, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
            writeGuest(next);
            return { ok: true, photo: next[0], mode: 'guest' };
        }
        const resp = await odeFetchJson('/api/training/progress-photos', {
            method: 'POST',
            body: JSON.stringify({ day, pose, imageDataUrl })
        });
        if (!resp.ok) return { ok: false, status: resp.status, error: resp.json?.error || 'Failed to save' };
        return { ok: true, photo: resp.json?.photo || null, mode: 'account' };
    };

    const open = async ({ day = todayIso(), pose = 'front' } = {}) => {
        const modal = ensureProgressPhotosModal();
        const compareModal = ensureProgressCompareModal();

        const byId = (id) => modal.querySelector(`#${id}`);
        const alertEl = byId('pp-alert');
        const fileEl = byId('pp-file');
        const uploadBtn = byId('pp-upload');
        const compareBtn = byId('pp-compare');
        const previewImg = byId('pp-preview-img');
        const previewEmpty = byId('pp-preview-empty');
        const previewMeta = byId('pp-preview-meta');
        const listEl = byId('pp-list');
        const listSub = byId('pp-list-sub');

        const showAlert = (msg) => {
            if (!alertEl) return;
            if (!msg) {
                alertEl.classList.add('hidden');
                alertEl.textContent = '';
                return;
            }
            alertEl.textContent = String(msg);
            alertEl.classList.remove('hidden');
        };

        let activePose = (pose === 'side' || pose === 'back') ? pose : 'front';
        let activeDay = String(day || '').slice(0, 10) || todayIso();
        let photos = [];

        const setPose = (nextPose) => {
            activePose = (nextPose === 'side' || nextPose === 'back') ? nextPose : 'front';
            modal.querySelectorAll('[data-pp-pose]').forEach((btn) => {
                const isActive = btn.getAttribute('data-pp-pose') === activePose;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            render();
        };

        const fmt = (iso) => {
            const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
            if (Number.isNaN(d.getTime())) return String(iso || '—');
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        };

        const getLatestForPose = (p) => {
            const filtered = photos.filter((x) => x.pose === p).sort((a, b) => String(b.day).localeCompare(String(a.day)));
            return filtered[0] || null;
        };

        const render = () => {
            if (listEl) {
                const filtered = photos.filter((p) => p.pose === activePose).sort((a, b) => String(b.day).localeCompare(String(a.day)));
                listEl.innerHTML = filtered.length ? filtered.map((p) => `
                    <button type="button" class="pp-item" data-pp-day="${escapeHtml(p.day)}" aria-label="${escapeHtml(fmt(p.day))}">
                        <img src="${escapeHtml(p.imageDataUrl)}" alt="">
                        <div class="pp-item-meta">
                            <div class="pp-item-day">${escapeHtml(fmt(p.day))}</div>
                            <div class="pp-item-pose ns-muted">${escapeHtml(p.pose)}</div>
                        </div>
                    </button>
                `).join('') : `<div class="ns-muted" style="padding:10px 6px; font-size: 13px;">No ${activePose} photos yet.</div>`;

                listEl.querySelectorAll('[data-pp-day]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        activeDay = String(btn.getAttribute('data-pp-day') || '').slice(0, 10) || activeDay;
                        render();
                    });
                });
            }

            const selected = photos.find((p) => p.pose === activePose && p.day === activeDay) || getLatestForPose(activePose);
            if (!selected) {
                previewImg?.classList.add('hidden');
                previewImg?.removeAttribute('src');
                previewEmpty?.classList.remove('hidden');
                if (previewMeta) previewMeta.textContent = '';
                return;
            }
            previewEmpty?.classList.add('hidden');
            if (previewImg) {
                previewImg.src = selected.imageDataUrl;
                previewImg.classList.remove('hidden');
            }
            if (previewMeta) previewMeta.textContent = `${fmt(selected.day)} â€¢ ${selected.pose}`;
        };

        const openCompare = async () => {
            const pc = compareModal;
            const pcById = (id) => pc.querySelector(`#${id}`);
            const poseSel = pcById('pc-pose');
            const aSel = pcById('pc-a');
            const bSel = pcById('pc-b');
            const aImg = pcById('pc-a-img');
            const bImg = pcById('pc-b-img');
            const aLabel = pcById('pc-a-label');
            const bLabel = pcById('pc-b-label');

            const renderOptions = () => {
                const p = String(poseSel?.value || 'front');
                const list = photos.filter((x) => x.pose === p).sort((x, y) => String(y.day).localeCompare(String(x.day)));
                const opts = list.map((x) => `<option value="${escapeHtml(x.day)}">${escapeHtml(fmt(x.day))}</option>`).join('');
                if (aSel) aSel.innerHTML = opts;
                if (bSel) bSel.innerHTML = opts;
                if (list.length >= 2) {
                    if (aSel) aSel.value = list[list.length - 1].day;
                    if (bSel) bSel.value = list[0].day;
                }
                renderImages();
            };

            const renderImages = () => {
                const p = String(poseSel?.value || 'front');
                const aDay = String(aSel?.value || '');
                const bDay = String(bSel?.value || '');
                const a = photos.find((x) => x.pose === p && x.day === aDay) || null;
                const b = photos.find((x) => x.pose === p && x.day === bDay) || null;
                if (aImg) aImg.src = a?.imageDataUrl || '';
                if (bImg) bImg.src = b?.imageDataUrl || '';
                if (aLabel) aLabel.textContent = a ? fmt(a.day) : '—';
                if (bLabel) bLabel.textContent = b ? fmt(b.day) : '—';
            };

            pc.classList.remove('hidden');
            pc.querySelectorAll('[data-pc-close]').forEach((el) => el.addEventListener('click', () => pc.classList.add('hidden')));
            pc.addEventListener('keydown', (e) => { if (e.key === 'Escape') pc.classList.add('hidden'); });

            if (poseSel) poseSel.value = activePose;
            renderOptions();
            poseSel?.addEventListener('change', renderOptions);
            aSel?.addEventListener('change', renderImages);
            bSel?.addEventListener('change', renderImages);
        };

        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        showAlert('Loading...');

        const me = await odeFetchMe();
        if (listSub) listSub.textContent = me ? 'Saved to your account.' : 'Saved locally (sign in to sync).';

        const loaded = await apiList();
        photos = Array.isArray(loaded.photos) ? loaded.photos : [];
        showAlert('');
        setPose(activePose);

        uploadBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            fileEl?.click();
        });

        compareBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            openCompare();
        });

        modal.querySelectorAll('[data-pp-pose]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setPose(btn.getAttribute('data-pp-pose'));
            });
        });

        fileEl?.addEventListener('change', async () => {
            const file = fileEl.files?.[0];
            if (!file) return;
            showAlert('Processing image...');
            const dataUrl = await fileToJpegDataUrl(file);
            if (!dataUrl) {
                showAlert('Could not read that image.');
                return;
            }
            const save = await apiSave({ day: activeDay, pose: activePose, imageDataUrl: dataUrl });
            if (!save.ok) {
                showAlert(save.error || 'Could not save.');
                return;
            }
            // Refresh list view (best-effort).
            const nextList = await apiList();
            photos = Array.isArray(nextList.photos) ? nextList.photos : photos;
            showAlert('Saved.');
            render();
            window.setTimeout(() => showAlert(''), 900);
            if (fileEl) fileEl.value = '';
        });

        const close = () => {
            modal.classList.add('hidden');
            document.body.classList.remove('modal-open');
            showAlert('');
        };

        modal.querySelectorAll('[data-pp-close]').forEach((el) => el.addEventListener('click', close));
        modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    };

    const openGallery = async () => {
        const modal = ensureProgressPhotosGalleryModal();
        const listEl = modal.querySelector('#ppg-list');
        const subEl = modal.querySelector('#ppg-sub');

        const close = () => {
            modal.classList.add('hidden');
            document.body.classList.remove('modal-open');
        };

        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        if (subEl) subEl.textContent = 'Loading...';

        modal.querySelectorAll('[data-ppg-close]').forEach((el) => el.addEventListener('click', close));
        modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

        const fmtLong = (iso) => {
            const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
            if (Number.isNaN(d.getTime())) return String(iso || '\u2014');
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        };

        const res = await apiList();
        const photos = Array.isArray(res.photos) ? res.photos : [];

        if (!photos.length) {
            if (subEl) subEl.textContent = 'No photos yet.';
            if (listEl) {
                listEl.innerHTML = `
                    <div class="ppg-empty">
                        <div class="ppg-empty-title">No progress photos yet</div>
                        <div class="ppg-empty-sub ns-muted">Add one for today to start tracking visually.</div>
                        <button class="btn btn-primary" type="button" id="ppg-add-first">Add photo</button>
                    </div>
                `;
                listEl.querySelector('#ppg-add-first')?.addEventListener('click', () => {
                    close();
                    open({ day: todayIso(), pose: 'front' });
                });
            }
            return;
        }

        if (subEl) {
            const mode = res?.mode === 'account' ? 'Saved to your account.' : 'Saved locally (sign in to sync).';
            subEl.textContent = `${photos.length} photo${photos.length === 1 ? '' : 's'} \u00b7 ${mode}`;
        }

        const byDay = new Map();
        photos.forEach((p) => {
            const day = String(p?.day || '').slice(0, 10);
            const pose = (p?.pose === 'side' || p?.pose === 'back') ? p.pose : 'front';
            if (!day) return;
            const cur = byDay.get(day) || { day, front: null, side: null, back: null };
            cur[pose] = p;
            byDay.set(day, cur);
        });

        const days = Array.from(byDay.keys()).sort((a, b) => String(b).localeCompare(String(a)));

        const slot = (p, { day, pose, label }) => {
            if (!p?.imageDataUrl) {
                return `
                    <button class="ppg-thumb ppg-thumb-empty" type="button" data-ppg-open="1" data-day="${escapeHtml(day)}" data-pose="${escapeHtml(pose)}">
                        <div class="ppg-thumb-label">${escapeHtml(label)}</div>
                        <div class="ppg-thumb-sub ns-muted">Missing</div>
                    </button>
                `;
            }
            return `
                <button class="ppg-thumb" type="button" data-ppg-open="1" data-day="${escapeHtml(day)}" data-pose="${escapeHtml(pose)}">
                    <img src="${escapeHtml(p.imageDataUrl)}" alt="${escapeHtml(label)} photo for ${escapeHtml(day)}">
                    <div class="ppg-thumb-meta">${escapeHtml(label)}</div>
                </button>
            `;
        };

        if (listEl) {
            listEl.innerHTML = days.map((day) => {
                const row = byDay.get(day);
                return `
                    <section class="ppg-day" aria-label="Photos for ${escapeHtml(day)}">
                        <div class="ppg-day-head">
                            <div class="ppg-day-title">${escapeHtml(fmtLong(day))}</div>
                            <div class="ppg-day-sub ns-muted">${row?.front && row?.side && row?.back ? 'Front + side + back' : (row?.front && row?.side ? 'Front + side' : (row?.front ? 'Front only' : (row?.side ? 'Side only' : 'Back only')))}</div>
                        </div>
                        <div class="ppg-grid">
                            ${slot(row?.front, { day, pose: 'front', label: 'Front' })}
                            ${slot(row?.side, { day, pose: 'side', label: 'Side' })}
                            ${slot(row?.back, { day, pose: 'back', label: 'Back' })}
                        </div>
                    </section>
                `;
            }).join('');

            listEl.querySelectorAll('[data-ppg-open=\"1\"]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const day = btn.getAttribute('data-day');
                    const pose = btn.getAttribute('data-pose');
                    close();
                    open({ day, pose });
                });
            });
        }
    };

    // Expose for training/overview/check-in.
    window.odeProgressPhotos = {
        open,
        list: apiList,
        gallery: openGallery
    };

    // Overview hook (if present)
    const wireOverview = () => {
        const openBtn = document.getElementById('overview-photos-open');
        const viewAllBtn = document.getElementById('overview-photos-viewall');
        const latestEl = document.getElementById('overview-photos-latest');
        const frontImg = document.getElementById('overview-photo-front');
        const sideImg = document.getElementById('overview-photo-side');
        const backImg = document.getElementById('overview-photo-back');
        const frontMeta = document.getElementById('overview-photo-front-meta');
        const sideMeta = document.getElementById('overview-photo-side-meta');
        const backMeta = document.getElementById('overview-photo-back-meta');
        if (!openBtn || !frontImg || !sideImg) return;

        const fmt = (iso) => {
            const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
            if (Number.isNaN(d.getTime())) return String(iso || '—');
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        };

        const fmtLong = (iso) => {
            const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
            if (Number.isNaN(d.getTime())) return String(iso || '\u2014');
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        };

        const render = async () => {
            const res = await apiList();
            const photos = Array.isArray(res.photos) ? res.photos : [];
            const latest = (pose) => photos.filter((p) => p.pose === pose).sort((a, b) => String(b.day).localeCompare(String(a.day)))[0] || null;
            const f = latest('front');
            const s = latest('side');
            const b = latest('back');
            const latestDay = [f?.day, s?.day, b?.day]
                .filter(Boolean)
                .sort((a, b) => String(b).localeCompare(String(a)))[0] || null;
            const frontFallback = 'https://www.mypthub.net/wp-content/uploads/freepik__candid-photography-with-natural-textures-and-highl__48521.png';
            const sideFallback = 'https://www.mypthub.net/wp-content/uploads/freepik__candid-photography-with-natural-textures-and-highl__48522-1.png';
            const backFallback = 'https://www.mypthub.net/wp-content/uploads/freepik__candid-photography-with-natural-textures-and-highl__48523.png';
            frontImg.src = f?.imageDataUrl || frontFallback;
            sideImg.src = s?.imageDataUrl || sideFallback;
            if (backImg) backImg.src = b?.imageDataUrl || backFallback;
            if (frontMeta) frontMeta.textContent = f ? fmt(f.day) : 'No front photo yet';
            if (sideMeta) sideMeta.textContent = s ? fmt(s.day) : 'No side photo yet';
            if (backMeta) backMeta.textContent = b ? fmt(b.day) : 'No back photo yet';
            if (latestEl) latestEl.textContent = `Latest: ${latestDay ? fmtLong(latestDay) : '\u2014'}`;
        };

        if (openBtn.dataset.wired !== '1') {
            openBtn.dataset.wired = '1';
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                open({ day: todayIso(), pose: 'front' });
            });
        }

        if (viewAllBtn && viewAllBtn.dataset.wired !== '1') {
            viewAllBtn.dataset.wired = '1';
            viewAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openGallery();
            });
        }

        render();
        window.addEventListener('focus', render);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireOverview, { once: true });
    else wireOverview();
}

/* ============================================
   TRACKING (GUEST + EVENTS)
   ============================================ */

function initTracking() {
    // Ping server to get/set guest cookie + record a page view event.
    try {
        fetch('/api/track/ping', { credentials: 'include' }).catch(() => {});
        const startKey = `ode_track_start_${location.pathname}`;
        const startedAt = Number(sessionStorage.getItem(startKey)) || Date.now();
        sessionStorage.setItem(startKey, String(startedAt));
        postTrackEvent('page_view', { title: document.title });

        let sentExit = false;
        const sendExit = (reason) => {
            if (sentExit) return;
            sentExit = true;
            const durationSecRaw = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
            const capped = durationSecRaw > 360;
            const durationSec = Math.min(360, durationSecRaw);
            postTrackEvent('page_exit', { reason: String(reason || ''), durationSec, capped });
        };

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') sendExit('hidden');
        });
        window.addEventListener('beforeunload', () => sendExit('unload'));
        window.addEventListener('pagehide', () => sendExit('pagehide'));
    } catch {
        // ignore
    }
}

function postTrackEvent(event, props) {
    return fetch('/api/track/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            event,
            path: `${location.pathname}${location.search}${location.hash}`,
            props: props && typeof props === 'object' ? props : {}
        })
    }).catch(() => {});
}

/* ============================================
   GROCERIES (AUTO-SAVE FOR SIGNED-IN USERS)
   ============================================ */

function hashStringDjb2(input) {
    const str = String(input || '');
    let hash = 5381;
    for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

function stableStringify(value) {
    const seen = new WeakSet();
    const normalize = (v) => {
        if (v === null || typeof v !== 'object') return v;
        if (seen.has(v)) return null;
        seen.add(v);
        if (Array.isArray(v)) return v.map(normalize);
        const out = {};
        Object.keys(v).sort().forEach((k) => {
            out[k] = normalize(v[k]);
        });
        return out;
    };
    return JSON.stringify(normalize(value));
}

async function saveLatestGroceryList(payload) {
    try {
        const body = payload && typeof payload === 'object' ? payload : {};
        const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
        const hashBody = {
            ...body,
            meta: { ...meta, generatedAt: null }
        };
        const key = hashStringDjb2(stableStringify(hashBody));
        const lastKey = sessionStorage.getItem('ode_last_grocery_save_key');
        if (lastKey === key) return { ok: true, skipped: true };
        sessionStorage.setItem('ode_last_grocery_save_key', key);

        const res = await fetch('/api/groceries/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });
        if (!res.ok && res.status === 401) {
            sessionStorage.removeItem('ode_last_grocery_save_key');
        }
        return { ok: res.ok, status: res.status };
    } catch {
        // ignore
    }
    return { ok: false, status: 0 };
}

function stageLatestGroceryListDraft(payload) {
    try {
        const body = payload && typeof payload === 'object' ? payload : null;
        if (!body) return;
        window.__ode_latest_grocery_list_draft = body;
        sessionStorage.setItem('ode_latest_grocery_list_draft_v1', JSON.stringify(body));
    } catch {
        // ignore
    }
}

function parseJsonMaybe(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

async function fetchLatestGroceryListFromAccount() {
    try {
        const res = await fetch('/api/groceries/latest', { credentials: 'include' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, status: res.status, list: null };
        const list = json?.list || null;
        return { ok: !!list, status: res.status, list };
    } catch {
        return { ok: false, status: 0, list: null };
    }
}

function renderSavedGroceryListCards({ listEl, listRow }) {
    if (!listEl || !listRow) return false;

    const meta = parseJsonMaybe(listRow?.meta, {}) || {};
    const totals = parseJsonMaybe(listRow?.totals, {}) || {};
    const itemsRaw = parseJsonMaybe(listRow?.items, []) || [];
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    const fmtMoney = (n) => (Number.isFinite(Number(n)) ? formatCurrency(Number(n)) : null);

    const computedFromItems = (() => {
        let sumWeekly = 0;
        let anyWeekly = false;
        let sumMonthly = 0;
        let anyMonthly = false;

        items.forEach((it) => {
            if (!it || typeof it !== 'object') return;
            const w = Number(it.estimatedWeeklyCost);
            if (Number.isFinite(w) && w >= 0) {
                sumWeekly += w;
                anyWeekly = true;
            }
            const m = Number(it.estimatedCost);
            if (Number.isFinite(m) && m >= 0) {
                sumMonthly += m;
                anyMonthly = true;
            }
        });

        const weeklyNum = anyWeekly ? sumWeekly : null;
        const monthlyNum = anyMonthly ? sumMonthly : (Number.isFinite(weeklyNum) ? (weeklyNum * 30) / 7 : null);

        return { weeklyNum, monthlyNum };
    })();

    const weeklyNum = Number.isFinite(Number(totals?.totalEstimatedWeeklyCost))
        ? Number(totals.totalEstimatedWeeklyCost)
        : computedFromItems.weeklyNum;
    const monthlyNum = Number.isFinite(Number(totals?.totalEstimatedCost))
        ? Number(totals.totalEstimatedCost)
        : computedFromItems.monthlyNum;

    const weekly = fmtMoney(weeklyNum);
    const monthly = fmtMoney(monthlyNum);

    // Update shared UI bits when present (plan + overview share some ids).
    try {
        const store = String(meta?.store || '').trim();
        const storePill = document.getElementById('store-pill');
        if (storePill) storePill.textContent = store || 'Saved';
        const storeEl = document.getElementById('p-store');
        if (storeEl) storeEl.textContent = store || EM_DASH;

        const weeklyEl = document.getElementById('p-weekly-cost');
        if (weeklyEl) weeklyEl.textContent = weekly || EM_DASH;
        const monthlyEl = document.getElementById('p-monthly-cost');
        if (monthlyEl) monthlyEl.textContent = monthly || EM_DASH;

        const monthDaysEl = document.getElementById('overview-month-days');
        if (monthDaysEl) monthDaysEl.textContent = 'Saved to your account';
        const monthProjectedEl = document.getElementById('overview-month-projected');
        if (monthProjectedEl) monthProjectedEl.textContent = monthly || EM_DASH;

        const countEl = document.getElementById('overview-grocery-count');
        if (countEl) countEl.textContent = `${items.length || 0} items`;
    } catch {
        // ignore
    }

    const createdAt = listRow?.created_at || listRow?.createdAt || null;
    const createdLabel = (() => {
        if (!createdAt) return null;
        const d = new Date(String(createdAt));
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    })();

    const cardsHtml = items.slice(0, 500).map((item) => {
        const name = String(item?.name || '').trim();
        if (!name) return '';
        const quantity = String(item?.quantity || '').trim();
        const category = String(item?.category || '').trim();
        const est = fmtMoney(item?.estimatedWeeklyCost ?? item?.estimatedCost);

        const image = String(item?.image || '').trim();
        const url = String(item?.url || '').trim();
        const daily = Number(item?.daily);
        const daysPerContainer = Number(item?.daysPerContainer);
        const containerPrice = Number(item?.containerPrice);
        const unit = String(item?.unit || '').trim() || 'servings';

        const dailyText = Number.isFinite(daily) ? `${daily.toFixed(2)} ${unit}` : `${EM_DASH} ${unit}`;
        const daysLabel = Number.isFinite(daysPerContainer)
            ? (daysPerContainer >= 30 ? `${Math.round(daysPerContainer)} days (1+ month)` : `${Math.max(0, Math.round(daysPerContainer))} days`)
            : 'N/A';
        const priceText = Number.isFinite(containerPrice) ? formatCurrency(containerPrice) : EM_DASH;

        const footerText = est ? `${est} est` : (createdLabel ? `Saved ${createdLabel}` : 'Saved');

        return `
            <div class="grocery-card" data-query="${normalizeKey(name)}">
                <div class="grocery-card-image ${image ? '' : 'no-image'}">
                    ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" onerror="this.style.display='none'; this.parentElement.classList.add('no-image');">` : ''}
                    ${url ? `
                        <a href="${escapeHtml(url)}" target="_blank" class="grocery-card-link" rel="noopener" title="View item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>
                    ` : ''}
                </div>
                <div class="grocery-card-body">
                    <h4 class="grocery-card-title">${escapeHtml(name)}</h4>
                    <div class="grocery-card-duration">
                        <span class="duration-icon">&#x23F1;</span>
                        <span class="duration-text">Container lasts <strong>${escapeHtml(daysLabel)}</strong></span>
                    </div>
                    <div class="grocery-card-details">
                        <div class="detail-row">
                            <span class="detail-label">Qty</span>
                            <span class="detail-value">${escapeHtml(quantity || EM_DASH)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Category</span>
                            <span class="detail-value">${escapeHtml(category || 'Misc')}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Daily use</span>
                            <span class="detail-value">${escapeHtml(dailyText)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Price</span>
                            <span class="detail-value">${escapeHtml(priceText)}</span>
                        </div>
                    </div>
                    <div class="grocery-card-footer">
                        <span class="container-price">${escapeHtml(footerText)}</span>
                        <label class="grocery-check-modern">
                            <input type="checkbox" class="grocery-check-input" data-query="${normalizeKey(name)}">
                            <span class="checkmark"></span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (!cardsHtml.trim()) return false;

    listEl.innerHTML = `
        <div class="grocery-items-grid" data-source="account">
            ${cardsHtml}
        </div>
    `;
    return true;
}

async function hydrateSavedGroceryListIfPossible({ listEl } = {}) {
    if (!listEl) return false;
    if (listEl.querySelector('.grocery-card, .grocery-item-row')) return false;

    // Must be signed in.
    try {
        const meResp = await fetch('/api/auth/me', { credentials: 'include' });
        const me = await meResp.json().catch(() => ({}));
        if (!me?.user) return false;
    } catch {
        return false;
    }

    const latest = await fetchLatestGroceryListFromAccount();
    if (!latest?.ok || !latest?.list) return false;

    const listRow = latest.list;
    const itemsRaw = parseJsonMaybe(listRow?.items, []) || [];
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    const needsEnrich = items.some((it) => it && typeof it === 'object' && (!it.image || !it.url || it.containerPrice == null));
    if (needsEnrich) {
        try {
            const walmart = await fetchWalmartLatest();
            if (walmart && Array.isArray(walmart.items)) {
                const byQuery = new Map();
                walmart.items.forEach((entry) => {
                    const q = normalizeKey(entry?.query);
                    if (q) byQuery.set(q, entry);
                });

                const enriched = items.map((it) => {
                    if (!it || typeof it !== 'object') return it;
                    const key = normalizeKey(it.name);
                    const entry = key ? byQuery.get(key) : null;
                    const cheapest = pickCheapestItem(entry?.top_two_by_oz || []) || null;
                    if (!cheapest) return it;
                    const next = { ...it };
                    if (!next.image && cheapest.image) next.image = cheapest.image;
                    if ((!next.url || next.url === '#') && cheapest.url) next.url = cheapest.url;
                    if (next.containerPrice == null && Number.isFinite(Number(cheapest.price))) next.containerPrice = Number(cheapest.price);
                    return next;
                });

                const cloned = { ...listRow, items: enriched };
                return renderSavedGroceryListCards({ listEl, listRow: cloned });
            }
        } catch {
            // ignore
        }
    }

    return renderSavedGroceryListCards({ listEl, listRow });
}

function ensureOdeConfirmModal() {
    let modal = document.getElementById('ode-confirm');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'ode-confirm';
    modal.className = 'ode-confirm-backdrop hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Confirm');

    modal.innerHTML = `
        <div class="ode-confirm-card" role="document">
            <div class="ode-confirm-head">
                <div class="ode-confirm-title" id="ode-confirm-title"></div>
                <button type="button" class="ode-confirm-close" id="ode-confirm-close" aria-label="Close">&times;</button>
            </div>
            <div class="ode-confirm-body" id="ode-confirm-body"></div>
            <div class="ode-confirm-actions">
                <button type="button" class="btn btn-ghost" id="ode-confirm-cancel">Cancel</button>
                <button type="button" class="btn btn-primary" id="ode-confirm-ok">Confirm</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

function odeConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    const modal = ensureOdeConfirmModal();
    const titleEl = modal.querySelector('#ode-confirm-title');
    const bodyEl = modal.querySelector('#ode-confirm-body');
    const okBtn = modal.querySelector('#ode-confirm-ok');
    const cancelBtn = modal.querySelector('#ode-confirm-cancel');
    const closeBtn = modal.querySelector('#ode-confirm-close');

    const safeTitle = String(title || 'Confirm');
    const safeMsg = String(message || '');

    if (titleEl) titleEl.textContent = safeTitle;
    if (bodyEl) {
        const lines = safeMsg.split('\n').map((l) => l.trim()).filter(Boolean);
        bodyEl.innerHTML = lines.length
            ? lines.map((l) => `<div class="ode-confirm-line">${escapeHtml(l)}</div>`).join('')
            : '';
    }

    if (okBtn) okBtn.textContent = String(confirmText || 'Confirm');
    if (cancelBtn) cancelBtn.textContent = String(cancelText || 'Cancel');
    okBtn?.classList.toggle('btn-danger', !!danger);

    modal.classList.remove('hidden');
    document.body.classList.add('ode-modal-open');

    return new Promise((resolve) => {
        let done = false;

        const finish = (value) => {
            if (done) return;
            done = true;
            modal.classList.add('hidden');
            document.body.classList.remove('ode-modal-open');
            cleanup();
            resolve(!!value);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') finish(false);
            if (e.key === 'Enter') finish(true);
        };

        const onBackdrop = (e) => {
            if (e.target === modal) finish(false);
        };

        const cleanup = () => {
            okBtn?.removeEventListener('click', onOk);
            cancelBtn?.removeEventListener('click', onCancel);
            closeBtn?.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            window.removeEventListener('keydown', onKeyDown);
        };

        const onOk = () => finish(true);
        const onCancel = () => finish(false);

        okBtn?.addEventListener('click', onOk);
        cancelBtn?.addEventListener('click', onCancel);
        closeBtn?.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        window.addEventListener('keydown', onKeyDown);

        window.setTimeout(() => okBtn?.focus?.(), 0);
    });
}

function enablePlanCtaForSignedIn(user) {
    const cta = document.getElementById('plan-cta');
    if (!cta) return;
    if (cta.dataset.mode === 'signedin') return;
    cta.dataset.mode = 'signedin';

    const display =
        String(user?.displayName || '').trim()
        || String(user?.username || '').trim()
        || (String(user?.email || '').includes('@') ? String(user.email).split('@')[0] : 'Member');

    const handle = String(user?.username || '').trim();
    const badge = handle ? `@${handle}` : '';

    cta.innerHTML = `
        <div class="cta-signedin">
            <div class="cta-signedin-head">
                <div class="cta-signedin-title">Welcome back, <span class="cta-signedin-name">${escapeHtml(display)}</span></div>
                <div class="cta-signedin-sub ns-muted">Save this grocery plan to your account or jump to Overview.</div>
            </div>
            <div class="cta-signedin-actions">
                ${badge ? `<div class="cta-signedin-badge" aria-label="Signed in">${escapeHtml(badge)}</div>` : ''}
                <a class="cta-secondary-btn" id="plan-cta-secondary" href="overview.html#grocery-list">Go to Overview</a>
                <button class="cta-attention-btn" id="plan-save-account" type="button">
                    <span>Save New Grocery Plan</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
            </div>
        </div>
    `;

    const saveBtn = document.getElementById('plan-save-account');
    saveBtn?.addEventListener('click', async () => {
        const draft = window.__ode_latest_grocery_list_draft;
        if (!draft) {
            showAlert?.('No grocery list draft yet.');
            return;
        }

        const ok = await odeConfirm({
            title: 'Save grocery plan to account?',
            message: 'This will overwrite the grocery list shown on Overview.\n\nPress Confirm to continue.',
            confirmText: 'Confirm & Save',
            cancelText: 'Cancel'
        });
        if (!ok) return;

        saveBtn.disabled = true;
        saveBtn.setAttribute('aria-disabled', 'true');
        try {
            const saved = await saveLatestGroceryList(draft);
            if (!saved?.ok) {
                showAlert?.('Could not save your grocery list.');
                return;
            }
            window.location.href = 'overview.html#grocery-list';
        } finally {
            saveBtn.disabled = false;
            saveBtn.setAttribute('aria-disabled', 'false');
        }
    });
}

function wireSignedOutPlanCta() {
    const cta = document.getElementById('plan-cta');
    if (!cta) return;

    const primaryBtn = document.getElementById('plan-cta-primary');
    if (primaryBtn && primaryBtn.dataset.bound !== '1') {
        primaryBtn.dataset.bound = '1';
        primaryBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const resp = await fetch('/api/auth/me', { credentials: 'include' });
                const data = await resp.json().catch(() => ({}));
                if (data?.user) {
                    enablePlanCtaForSignedIn(data.user);
                    return;
                }
            } catch {
                // ignore
            }

            if (typeof odeOpenAuthModal === 'function') {
                odeOpenAuthModal('signup');
                return;
            }

            // Fallback: take the user to the home page (navbar sign-up works there).
            try {
                window.location.href = 'index.html';
            } catch {
                // ignore
            }
        });
    }

    const typewriterEl = document.getElementById('cta-typewriter');
    const sentences = [
        { text: 'Add ', highlight: 'custom foods', suffix: ' you eat' },
        { text: 'Save your ', highlight: 'grocery list', suffix: '' },
        { text: 'Track ', highlight: 'macros', suffix: ' over time' },
        { text: 'Get ', highlight: 'restock alerts', suffix: '' },
        { text: 'Download ', highlight: 'PDF lists', suffix: '' },
        { text: '100% ', highlight: 'free', suffix: ' forever' }
    ];

    const getFullText = (sentence) => String(sentence?.text || '') + String(sentence?.highlight || '') + String(sentence?.suffix || '');
    const renderWithHighlight = (sentence, currentLength) => {
        const s = sentence || { text: '', highlight: '', suffix: '' };
        const full = getFullText(s);
        const visible = full.substring(0, Math.max(0, Number(currentLength) || 0));

        const textLen = String(s.text).length;
        const highlightLen = String(s.highlight).length;

        if (visible.length <= textLen) return escapeHtml(visible);
        if (visible.length <= textLen + highlightLen) {
            return `${escapeHtml(s.text)}<span class="cta-highlight">${escapeHtml(visible.substring(textLen))}</span>`;
        }
        return `${escapeHtml(s.text)}<span class="cta-highlight">${escapeHtml(s.highlight)}</span>${escapeHtml(visible.substring(textLen + highlightLen))}`;
    };

    const startTypewriter = () => {
        if (!typewriterEl || !document.contains(typewriterEl)) return;
        if (cta.dataset.mode === 'signedin') return;
        if (typewriterEl.dataset.typing === '1') return;

        typewriterEl.dataset.typing = '1';
        let sentenceIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let pausedUntil = 0;
        let timer = null;

        const tick = () => {
            if (!document.contains(typewriterEl)) return;
            if (cta.dataset.mode === 'signedin') return;

            const now = Date.now();
            if (pausedUntil && now < pausedUntil) {
                timer = window.setTimeout(tick, 50);
                return;
            }

            const currentSentence = sentences[sentenceIndex] || sentences[0];
            const fullText = getFullText(currentSentence);

            if (!isDeleting) {
                charIndex = Math.min(fullText.length, charIndex + 1);
                typewriterEl.innerHTML = renderWithHighlight(currentSentence, charIndex);
                if (charIndex >= fullText.length) {
                    pausedUntil = Date.now() + 2000;
                    isDeleting = true;
                }
            } else {
                charIndex = Math.max(0, charIndex - 1);
                typewriterEl.innerHTML = renderWithHighlight(currentSentence, charIndex);
                if (charIndex <= 0) {
                    isDeleting = false;
                    pausedUntil = 0;
                    sentenceIndex = (sentenceIndex + 1) % sentences.length;
                }
            }

            const speed = isDeleting ? 25 : 45;
            timer = window.setTimeout(tick, speed);
        };

        // Keep a reference so we can stop if auth flips mid-loop.
        typewriterEl._odeStopTyping = () => {
            try {
                if (timer) window.clearTimeout(timer);
            } catch {
                // ignore
            }
        };

        tick();
    };

    const sync = async (hintUser) => {
        if (cta.dataset.mode === 'signedin') return;

        const user = hintUser || null;
        if (user) {
            try {
                typewriterEl?._odeStopTyping?.();
            } catch {
                // ignore
            }
            enablePlanCtaForSignedIn(user);
            return;
        }

        try {
            const resp = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await resp.json().catch(() => ({}));
            if (data?.user) {
                try {
                    typewriterEl?._odeStopTyping?.();
                } catch {
                    // ignore
                }
                enablePlanCtaForSignedIn(data.user);
                return;
            }
        } catch {
            // If we can't verify, fall back to signed-out behavior.
        }

        startTypewriter();
    };

    if (cta.dataset.planCtaWired !== '1') {
        cta.dataset.planCtaWired = '1';
        window.addEventListener('odeauth', (e) => {
            const user = e?.detail?.user || null;
            sync(user);
        });
        sync(null);
    }
}

async function enableGroceryAccountSaveButton() {
    const btn = document.getElementById('grocery-save-account');
    if (!btn) return;

    // Bind once; always read the latest draft at click-time.
        if (!btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', async () => {
                const draft = window.__ode_latest_grocery_list_draft;
            if (!draft) {
                showAlert?.('No grocery list draft yet.');
                return;
            }

            // Must be signed in.
            try {
                const meResp = await fetch('/api/auth/me', { credentials: 'include' });
                const me = await meResp.json();
                if (!me?.user) {
                    showAlert?.('Sign in to save your grocery list to your account.');
                    return;
                }
            } catch {
                showAlert?.('Could not verify sign-in status.');
                return;
            }

                // Confirm overwrite only if an existing list exists.
                try {
                    const latestResp = await fetch('/api/groceries/latest', { credentials: 'include' });
                    if (latestResp.ok) {
                        const latest = await latestResp.json();
                        if (latest?.list) {
                            const ok = await odeConfirm({
                                title: 'Overwrite grocery list?',
                                message: 'This will overwrite the grocery list shown on Overview.\n\nPress Confirm to continue.',
                                confirmText: 'Confirm & Overwrite',
                                cancelText: 'Cancel'
                            });
                            if (!ok) return;
                        }
                    }
                } catch {
                    // ignore: if we can't check, fall back to saving without the extra prompt.
                }

            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            try {
                const saved = await saveLatestGroceryList(draft);
                if (!saved?.ok) {
                    showAlert?.('Could not save your grocery list.');
                    return;
                }
                window.location.href = 'overview.html';
            } finally {
                btn.disabled = false;
                btn.setAttribute('aria-disabled', 'false');
            }
        });
    }

    // Show only for signed-in users.
    try {
        const resp = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await resp.json();
        const signedIn = !!data?.user;
        btn.classList.toggle('hidden', !signedIn);
        if (signedIn) enablePlanCtaForSignedIn(data?.user);
    } catch {
        btn.classList.add('hidden');
    }
}

/* ============================================
   THEME TOGGLE
   ============================================ */

function initThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    const root = document.documentElement;
    const saved = localStorage.getItem('ode_theme');
    if (saved) {
        root.setAttribute('data-theme', saved);
        if (toggle) {
            toggle.querySelector('.theme-icon').textContent = saved === 'light' ? '\u2600' : '\u263E';
        }
    }

    if (!toggle) return;

    toggle.addEventListener('click', () => {
        const current = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        const next = current === 'light' ? 'dark' : 'light';
        root.classList.add('theme-transition');
        document.body.classList.remove('theme-wipe-dark', 'theme-wipe-light');
        document.body.classList.add(next === 'light' ? 'theme-wipe-light' : 'theme-wipe-dark');
        root.setAttribute('data-theme', next);
        localStorage.setItem('ode_theme', next);
        toggle.querySelector('.theme-icon').textContent = next === 'light' ? '\u2600' : '\u263E';
        setTimeout(() => {
            root.classList.remove('theme-transition');
            document.body.classList.remove('theme-wipe-dark', 'theme-wipe-light');
        }, 900);
    });
}

/* ============================================
   AUTH (NEON-BACKED SESSIONS)
   ============================================ */

function initAuthUi() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    const navbarContainer = themeToggle.closest('.navbar-container') || themeToggle.parentElement;
    if (!navbarContainer) return;

    const { wrapper, signInBtn, signUpBtn, userBtn, menu } = ensureAuthNavbarUi(navbarContainer, themeToggle);
    const modal = ensureAuthModal();

    let currentUser = null;

    const emitAuthChanged = (user) => {
        try {
            window.dispatchEvent(new CustomEvent('odeauth', { detail: { user: user || null } }));
        } catch {
            // ignore
        }
    };

    const setSignedOutUi = () => {
        currentUser = null;
        signInBtn.classList.remove('hidden');
        signUpBtn.classList.remove('hidden');
        userBtn.classList.add('hidden');
        menu.classList.add('hidden');
        menu.innerHTML = '';
        syncControlPanelLabel(null);
        emitAuthChanged(null);
    };

    const setSignedInUi = (user) => {
        currentUser = user;
        const label = user?.displayName || user?.username || 'Account';
        signInBtn.classList.add('hidden');
        signUpBtn.classList.add('hidden');
        userBtn.classList.remove('hidden');
        userBtn.textContent = label;
        userBtn.setAttribute('aria-label', 'Account menu');
        syncControlPanelLabel(user);

        menu.innerHTML = `
            <button type="button" class="auth-menu-item" id="auth-menu-logout">Sign out</button>
        `;
        const logoutBtn = menu.querySelector('#auth-menu-logout');
        logoutBtn?.addEventListener('click', async () => {
            await authLogout();
            setSignedOutUi();
        });

        emitAuthChanged(user);
    };

    const redirectToTrainingAfterAuth = () => {
        try {
            if (document.body?.classList?.contains('training-page')) return;
            window.location.href = 'training.html';
        } catch {
            // ignore
        }
    };

    wireAuthModal(modal, {
        onSignedIn: (user) => {
            setSignedInUi(user);
            redirectToTrainingAfterAuth();
        }
    });

    const refreshMe = async () => {
        try {
            const resp = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await resp.json();
            if (data?.user) setSignedInUi(data.user);
            else setSignedOutUi();
        } catch {
            setSignedOutUi();
        }
    };

    const openModal = (mode) => {
        setAuthModalMode(modal, mode || 'login');
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        window.setTimeout(() => modal.querySelector('input')?.focus(), 40);
    };

    const toggleMenu = () => {
        if (!currentUser) return;
        menu.classList.toggle('hidden');
    };

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) menu.classList.add('hidden');
    });

    signInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal('login');
    });

    signUpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal('signup');
    });

    userBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleMenu();
    });

    const controlBtn = document.getElementById('control-signin');
    controlBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const panel = document.getElementById('control-panel');
        panel?.classList.remove('open');
        if (currentUser) {
            menu.classList.remove('hidden');
        } else {
            openModal('login');
        }
    });

    refreshMe();
}

function initAuthGate() {
    const requiresAuth = document.body?.dataset?.requireAuth === '1';
    if (!requiresAuth) return;

    const applyGate = () => {
        document.body.classList.add('auth-gated');
        if (typeof odeOpenAuthModal === 'function') odeOpenAuthModal('login');
        else document.getElementById('control-signin')?.click?.();
    };

    const clearGate = () => {
        document.body.classList.remove('auth-gated');
    };

    window.addEventListener('odeauth', (e) => {
        const user = e?.detail?.user || null;
        if (user) clearGate();
        else applyGate();
    });

    (async () => {
        try {
            const resp = await fetch('/api/auth/me', { credentials: 'include' });
            const data = await resp.json().catch(() => ({}));
            if (data?.user) clearGate();
            else applyGate();
        } catch {
            applyGate();
        }
    })();
}

function ensureAuthNavbarUi(navbarContainer, themeToggle) {
    let wrapper = document.getElementById('auth-wrap');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'auth-wrap';
        wrapper.className = 'auth-wrap';

        const signInBtn = document.createElement('button');
        signInBtn.type = 'button';
        signInBtn.id = 'auth-signin-btn';
        signInBtn.className = 'auth-nav-btn auth-nav-btn-primary';
        signInBtn.textContent = 'Sign in';

        const signUpBtn = document.createElement('button');
        signUpBtn.type = 'button';
        signUpBtn.id = 'auth-signup-btn';
        signUpBtn.className = 'auth-nav-btn auth-nav-btn-ghost';
        signUpBtn.textContent = 'Sign up';

        const userBtn = document.createElement('button');
        userBtn.type = 'button';
        userBtn.id = 'auth-user-btn';
        userBtn.className = 'auth-nav-btn auth-nav-btn-primary hidden';
        userBtn.textContent = 'Account';

        const menu = document.createElement('div');
        menu.id = 'auth-menu';
        menu.className = 'auth-menu hidden';

        wrapper.appendChild(signInBtn);
        wrapper.appendChild(signUpBtn);
        wrapper.appendChild(userBtn);
        wrapper.appendChild(menu);

        // User asked for Sign in / Sign up to the LEFT of the theme toggle.
        themeToggle.insertAdjacentElement('beforebegin', wrapper);
    }

    return {
        wrapper,
        signInBtn: wrapper.querySelector('#auth-signin-btn'),
        signUpBtn: wrapper.querySelector('#auth-signup-btn'),
        userBtn: wrapper.querySelector('#auth-user-btn'),
        menu: wrapper.querySelector('#auth-menu')
    };
}

function ensureAuthModal() {
    let modal = document.getElementById('auth-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.className = 'auth-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="auth-backdrop" data-auth-close></div>
        <div class="auth-card" role="document">
            <button type="button" class="auth-close" data-auth-close aria-label="Close">&times;</button>
            <h3 class="auth-title">Account</h3>
            <p class="auth-error hidden" id="auth-error"></p>
            <div class="auth-tabs">
                <button type="button" class="auth-tab active" data-auth-tab="login">Sign in</button>
                <button type="button" class="auth-tab" data-auth-tab="signup">Create account</button>
            </div>

            <form id="auth-login-form" class="auth-form">
                <label class="auth-label">Username / Email / Phone</label>
                <input id="auth-login-username" class="auth-input" autocomplete="username" required>
                <label class="auth-label">Password</label>
                <input id="auth-login-password" class="auth-input" type="password" autocomplete="current-password" required>
                <button type="submit" class="btn btn-primary auth-submit">Sign in</button>
            </form>

            <form id="auth-signup-form" class="auth-form hidden">
                <label class="auth-label">Username</label>
                <input id="auth-signup-username" class="auth-input" autocomplete="username" required>
                <label class="auth-label">Email</label>
                <input id="auth-signup-email" class="auth-input" type="email" autocomplete="email" required>
                <label class="auth-label">Phone (optional)</label>
                <input id="auth-signup-phone" class="auth-input" type="tel" autocomplete="tel" placeholder="e.g. 5551234567">
                <label class="auth-label">Display name</label>
                <input id="auth-signup-displayname" class="auth-input" autocomplete="name" required>
                <label class="auth-label">Password</label>
                <input id="auth-signup-password" class="auth-input" type="password" autocomplete="new-password" required>
                <button type="submit" class="btn btn-primary auth-submit">Create account</button>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

function wireAuthModal(modal, { onSignedIn } = {}) {
    if (!modal || modal.dataset.wiredAuthModal === '1') return;
    modal.dataset.wiredAuthModal = '1';

    const closeModal = () => {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        clearAuthModalError(modal);
    };

    modal.querySelectorAll('[data-auth-close]').forEach((el) => {
        el.addEventListener('click', closeModal);
    });

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.body.classList.contains('auth-gated')) closeModal();
    });

    modal.querySelectorAll('[data-auth-tab]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => setAuthModalMode(modal, tabBtn.dataset.authTab));
    });

    const loginForm = modal.querySelector('#auth-login-form');
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAuthModalError(modal);
        const username = modal.querySelector('#auth-login-username')?.value || '';
        const password = modal.querySelector('#auth-login-password')?.value || '';
        const result = await authLogin({ username, password });
        if (result?.ok && result.user) {
            closeModal();
            if (typeof onSignedIn === 'function') onSignedIn(result.user);
            else {
                try {
                    window.dispatchEvent(new CustomEvent('odeauth', { detail: { user: result.user } }));
                } catch {
                    // ignore
                }
            }
        } else {
            setAuthModalError(modal, result?.error || 'Sign in failed');
        }
    });

    const signupForm = modal.querySelector('#auth-signup-form');
    signupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAuthModalError(modal);
        const username = modal.querySelector('#auth-signup-username')?.value || '';
        const email = modal.querySelector('#auth-signup-email')?.value || '';
        const phone = modal.querySelector('#auth-signup-phone')?.value || '';
        const displayName = modal.querySelector('#auth-signup-displayname')?.value || '';
        const password = modal.querySelector('#auth-signup-password')?.value || '';
        const result = await authSignup({ username, email, phone, displayName, password });
        if (result?.ok && result.user) {
            closeModal();
            if (typeof onSignedIn === 'function') onSignedIn(result.user);
            else {
                try {
                    window.dispatchEvent(new CustomEvent('odeauth', { detail: { user: result.user } }));
                } catch {
                    // ignore
                }
            }
        } else {
            setAuthModalError(modal, result?.error || 'Sign up failed');
        }
    });
}

function setAuthModalMode(modal, mode) {
    const loginTab = modal.querySelector('[data-auth-tab="login"]');
    const signupTab = modal.querySelector('[data-auth-tab="signup"]');
    const loginForm = modal.querySelector('#auth-login-form');
    const signupForm = modal.querySelector('#auth-signup-form');

    const isSignup = mode === 'signup';
    loginTab?.classList.toggle('active', !isSignup);
    signupTab?.classList.toggle('active', isSignup);
    loginForm?.classList.toggle('hidden', isSignup);
    signupForm?.classList.toggle('hidden', !isSignup);
    clearAuthModalError(modal);
}

function odeOpenAuthModal(mode = 'login') {
    const modal = document.getElementById('auth-modal') || ensureAuthModal();
    wireAuthModal(modal);
    setAuthModalMode(modal, mode);
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    window.setTimeout(() => modal.querySelector('input')?.focus(), 40);
}

function setAuthModalError(modal, message) {
    const el = modal.querySelector('#auth-error');
    if (!el) return;
    el.textContent = String(message || 'Something went wrong');
    el.classList.remove('hidden');
}

function clearAuthModalError(modal) {
    const el = modal.querySelector('#auth-error');
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
}

function syncControlPanelLabel(user) {
    const btn = document.getElementById('control-signin');
    const textEl = btn?.querySelector('.text');
    if (!textEl) return;
    if (!user) textEl.textContent = 'Sign in';
    else textEl.textContent = 'Account';
}

async function authLogin({ username, password }) {
    try {
        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) return { ok: false, error: data?.error || 'Sign in failed' };
        return { ok: true, user: data?.user };
    } catch (err) {
        return { ok: false, error: err?.message || 'Sign in failed' };
    }
}

async function authSignup({ username, email, phone, displayName, password }) {
    try {
        const resp = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, email, phone, displayName, password })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) return { ok: false, error: data?.error || 'Sign up failed' };
        return { ok: true, user: data?.user };
    } catch (err) {
        return { ok: false, error: err?.message || 'Sign up failed' };
    }
}

async function authLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
        // ignore
    }
}

/* ============================================
   PRELOADER
   ============================================ */

function setupPreloader() {
    const preloader = document.getElementById('preloader');
    const word = document.getElementById('preloader-word');
    const brand = document.querySelector('.navbar-brand');
    const bar = document.querySelector('.preloader-bar');
    if (!preloader || !word) return;

    // Store pages: show the heavy preloader only once per session to avoid
    // re-running the full "screen format" animation on every store click.
    const isStorePage = document.body?.classList?.contains('store-page');
    if (isStorePage) {
        const KEY = 'ode_store_preloader_seen_v1';
        if (sessionStorage.getItem(KEY) === '1') {
            preloader.remove();
            return;
        }
        sessionStorage.setItem(KEY, '1');
    }

    const moveToBrand = () => {
        if (!brand) return;
        const brandRect = brand.getBoundingClientRect();
        const targetX = brandRect.left + brandRect.width / 2;
        const targetY = brandRect.top + brandRect.height / 2;
        word.style.animation = 'none'; // stop the pop-in so transitions apply cleanly
        // force reflow
        void word.offsetWidth;
        word.style.left = `${targetX}px`;
        word.style.top = `${targetY}px`;
        word.style.transform = `translate(-50%, -50%) scale(0.3)`;
        word.style.filter = 'drop-shadow(0 10px 22px rgba(0,0,0,0.22))';
    };

    // move after bar fills (slightly slower)
    setTimeout(moveToBrand, 2600);

    // fade bar as move begins
    setTimeout(() => {
        bar?.classList.add('fade');
    }, 2600);

    // fade overlay after move completes
    setTimeout(() => {
        preloader.classList.add('hidden');
        setTimeout(() => preloader.remove(), 600);
    }, 4200);
}

/* Helpers to update config if needed */
function updateYouTubeShortsConfig(newConfig) {
    YOUTUBE_SHORTS_CONFIG.length = 0;
    YOUTUBE_SHORTS_CONFIG.push(...newConfig);
    renderYouTubeShortsGrid();
}

function updateFormEndpoints(endpoints) {
    Object.assign(FORM_ENDPOINTS, endpoints);
}

function updateCheckoutURLs(urls) {
    Object.assign(CHECKOUT_URLS, urls);
}

// LEGACY REMOVED (Lockdown pass): deterministic meal planner and fixed meal-type combos.
// All meal generation goes through buildAllMeals().

/* ============================================
   BASELINE FOODS MACRO ADJUSTMENT (DEPRECATED)
   ============================================ */
function calculateAdjustedBaselineFoods(baselineArray, macroResults, mealsPerDay, dietaryPref, allergies, mode = 'maintain', bodyweightLbs = 170) {
    // Lockdown pass: deterministic baseline adjustment removed.
    // The single optimizer (buildAllMeals) sizes servings directly on the plan page.
    if (!Array.isArray(baselineArray)) return baselineArray;

    const pref = String(dietaryPref || 'no-restrictions').toLowerCase();
    const allergyList = Array.isArray(allergies) ? allergies : [];
    const allergySet = new Set(allergyList.map(a => String(a).trim().toLowerCase()).filter(Boolean));

    const canBeef = pref !== 'vegetarian' && pref !== 'vegan' && pref !== 'pescatarian' && pref !== 'no-red-meat';
    const canChicken = pref !== 'vegetarian' && pref !== 'vegan' && pref !== 'pescatarian';
    const canTurkey = pref !== 'vegetarian' && pref !== 'vegan' && pref !== 'pescatarian';
    const canFish = pref !== 'vegan' && !allergySet.has('fish');
    const canEggs = pref !== 'vegan' && !allergySet.has('eggs');
    const canMilk = pref !== 'vegan' && !allergySet.has('dairy');
    const canGluten = !allergySet.has('gluten');

    // Keep behavior consistent with prior filtering logic; sizing happens later via buildAllMeals().
    return baselineArray.filter(food => {
        const id = String(food?.id || '').toLowerCase();
        if (id.includes('beef')) return canBeef;
        if (id.includes('chicken')) return canChicken;
        if (id.includes('turkey')) return canTurkey;
        if (id.includes('tilapia') || id.includes('salmon') || id.includes('fish') || id.includes('tuna') || id.includes('shrimp')) return canFish;
        if (id.includes('egg')) return canEggs;
        if (id.includes('milk')) return canMilk;
        if (id.includes('oats')) return canGluten;
        return true;
    });
}

/* ============================================
   CONTROL PANEL (LEFT)
   ============================================ */
function setupControlPanel() {
    if (!controlPanel || !controlCloseBtn) return;

    controlPanel.classList.add('collapsed');
    document.body.classList.add('control-collapsed');

    controlCloseBtn.addEventListener('click', toggleControlPanel);

    document.querySelectorAll('.control-panel a, .control-link').forEach(link => {
        link.addEventListener('click', collapseControlPanel);
    });

    // (Intentionally no Account/Progress-photos buttons in the control panel UI.)
}

/* ============================================
   ONBOARDING TOUR
   ============================================ */

function setupOnboardingTour() {
    const TOUR_DONE_KEY = 'ode_onboarding_done_v1';
    const TOUR_STATE_KEY = 'ode_onboarding_state_v1';
    const TOUR_PROMPT_KEY = 'ode_tour_prompted_v1';
    const SIGNUP_PROMPT_KEY = 'ode_signup_prompted_v1';
    const SIGNUP_AFTER_TOUR_KEY = 'ode_signup_after_tour_v1';
    const TOUR_PROMPT_DELAY = 10000;

    const pageName = () => {
        const parts = String(location.pathname || '').split('/').filter(Boolean);
        return parts.length ? parts[parts.length - 1] : 'index.html';
    };

    const steps = [
        {
            key: 'blueprint',
            url: 'index.html',
            selector: '#mission .offer-save-card',
            title: 'Build your blueprint',
            body: 'Brief expo: answer this and it will show you what you are looking for.'
        },
        {
            key: 'macros',
            url: 'index.html',
            selector: '#ns-entry',
            title: 'Macro calculator',
            body: 'Here is the macro calculator.'
        },
        {
            key: 'signin',
            url: 'index.html',
            selector: '#auth-wrap',
            title: 'Make a free account',
            body: 'Save your custom meal plan and customize meals.'
        },
        {
            key: 'overview',
            url: 'overview.html',
            selector: '#overview-actions',
            title: 'Go to overview',
            body: 'This is where you see your saved data. Training will be added here soon.'
        }
    ];

    const prefersReducedMotion = (() => {
        try {
            return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch {
            return false;
        }
    })();

    const readState = () => {
        try {
            const raw = sessionStorage.getItem(TOUR_STATE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object') return null;
            if (!parsed.active) return null;
            const idx = Number(parsed.index);
            return { active: true, index: Number.isFinite(idx) ? idx : 0 };
        } catch {
            return null;
        }
    };

    const writeState = (state) => {
        try {
            sessionStorage.setItem(TOUR_STATE_KEY, JSON.stringify(state));
        } catch {
            // ignore
        }
    };

    const clearState = () => {
        try {
            sessionStorage.removeItem(TOUR_STATE_KEY);
        } catch {
            // ignore
        }
    };

    const markDone = () => {
        try {
            localStorage.setItem(TOUR_DONE_KEY, '1');
        } catch {
            // ignore
        }
    };

    const isDone = () => {
        try {
            return localStorage.getItem(TOUR_DONE_KEY) === '1';
        } catch {
            return false;
        }
    };

    const ensureControlTourButton = () => {
        const panel = document.getElementById('control-panel');
        if (!panel) return null;
        const existing = document.getElementById('control-tour');
        if (existing) return existing;

        const sections = Array.from(panel.querySelectorAll('.control-section'));
        let preferredSection =
            sections.find((sec) => String(sec.querySelector('.section-label')?.textContent || '').trim().toUpperCase() === 'HELP')
            || sections.find((sec) => String(sec.querySelector('.section-label')?.textContent || '').trim().toUpperCase() === 'ACCOUNT')
            || sections[0]
            || null;
        if (!preferredSection) {
            preferredSection = document.createElement('div');
            preferredSection.className = 'control-section';
            preferredSection.innerHTML = `<p class="section-label">HELP</p>`;
            panel.appendChild(preferredSection);
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'control-link';
        btn.id = 'control-tour';
        btn.innerHTML = `
            <span class="icon"><svg><use href="#icon-book"></use></svg></span>
            <span class="text">Quick tour</span>
        `.trim();
        preferredSection.appendChild(btn);
        return btn;
    };

    let overlayEl = null;
    let popoverEl = null;
    let activeIndex = 0;
    let highlightedEl = null;
    let tourPromptTimer = null;
    let tourPromptEl = null;
    let signupPromptEl = null;

    const teardown = () => {
        document.body?.classList?.remove('ode-tour-active');
        highlightedEl?.classList?.remove('ode-tour-highlight');
        highlightedEl = null;

        overlayEl?.remove();
        popoverEl?.remove();
        overlayEl = null;
        popoverEl = null;

        window.removeEventListener('resize', onReposition);
        window.removeEventListener('scroll', onReposition, true);
        document.removeEventListener('keydown', onKeydown);
    };

    const clearTourPromptTimer = () => {
        if (tourPromptTimer) {
            clearTimeout(tourPromptTimer);
            tourPromptTimer = null;
        }
    };

    const closePrompt = (el) => {
        if (!el) return;
        el.remove();
    };

    const ensureTourPrompt = () => {
        if (tourPromptEl) return tourPromptEl;
        const modal = document.createElement('div');
        modal.className = 'ode-prompt-modal';
        modal.innerHTML = `
            <div class="ode-prompt-backdrop" data-prompt-close></div>
            <div class="ode-prompt-card" role="dialog" aria-modal="true" aria-label="Quick tour">
                <button type="button" class="ode-prompt-close" data-prompt-close aria-label="Close">&times;</button>
                <h3 class="ode-prompt-title">Take a quick tour?</h3>
                <p class="ode-prompt-body">Get a 60-second walkthrough of the core tools.</p>
                <div class="ode-prompt-actions">
                    <button type="button" class="btn btn-ghost" data-tour-no>Not now</button>
                    <button type="button" class="btn btn-primary" data-tour-yes>Yes, show me</button>
                </div>
            </div>
        `.trim();
        document.body.appendChild(modal);
        tourPromptEl = modal;

        const close = (triggerSignup) => {
            closePrompt(tourPromptEl);
            tourPromptEl = null;
            if (triggerSignup) showSignupPrompt();
        };

        modal.querySelectorAll('[data-prompt-close]')?.forEach((btn) => {
            btn.addEventListener('click', () => close(true));
        });

        modal.querySelector('[data-tour-yes]')?.addEventListener('click', () => {
            close(false);
            start();
        });

        modal.querySelector('[data-tour-no]')?.addEventListener('click', () => {
            close(true);
        });

        return modal;
    };

    const ensureSignupPrompt = () => {
        if (signupPromptEl) return signupPromptEl;
        const modal = document.createElement('div');
        modal.className = 'ode-prompt-modal';
        modal.innerHTML = `
            <div class="ode-prompt-backdrop" data-prompt-close></div>
            <div class="ode-prompt-card" role="dialog" aria-modal="true" aria-label="Create an account">
                <button type="button" class="ode-prompt-close" data-prompt-close aria-label="Close">&times;</button>
                <h3 class="ode-prompt-title">Make a free account</h3>
                <p class="ode-prompt-body">Keep your progress in one place and unlock personalized tools.</p>
                <p class="ode-prompt-note">Save your grocery plan or customize it with your foods. It is free and will only help you.</p>
                <div class="ode-prompt-actions">
                    <button type="button" class="btn btn-ghost" data-signup-no>Not now</button>
                    <button type="button" class="btn btn-primary" data-signup-yes>Create account</button>
                </div>
            </div>
        `.trim();
        document.body.appendChild(modal);
        signupPromptEl = modal;

        const close = () => {
            closePrompt(signupPromptEl);
            signupPromptEl = null;
        };

        modal.querySelectorAll('[data-prompt-close]')?.forEach((btn) => {
            btn.addEventListener('click', () => close());
        });

        modal.querySelector('[data-signup-yes]')?.addEventListener('click', () => {
            close();
            if (typeof odeOpenAuthModal === 'function') odeOpenAuthModal('signup');
            else document.getElementById('control-signin')?.click?.();
        });

        modal.querySelector('[data-signup-no]')?.addEventListener('click', () => {
            close();
        });

        return modal;
    };

    const showSignupPrompt = async () => {
        if (signupPromptEl) return;
        try {
            if (sessionStorage.getItem(SIGNUP_PROMPT_KEY) === '1') return;
        } catch {
            // ignore
        }
        const me = await odeFetchMe();
        if (me) return;
        try {
            sessionStorage.setItem(SIGNUP_PROMPT_KEY, '1');
        } catch {
            // ignore
        }
        ensureSignupPrompt();
    };

    const ensureUi = () => {
        if (overlayEl && popoverEl) return;

        overlayEl = document.createElement('div');
        overlayEl.className = 'ode-tour-overlay';
        overlayEl.setAttribute('aria-hidden', 'true');
        overlayEl.innerHTML = `
            <div class="ode-tour-shade" data-ode-shade="top"></div>
            <div class="ode-tour-shade" data-ode-shade="left"></div>
            <div class="ode-tour-shade" data-ode-shade="right"></div>
            <div class="ode-tour-shade" data-ode-shade="bottom"></div>
        `.trim();

        popoverEl = document.createElement('div');
        popoverEl.className = 'ode-tour-popover';
        popoverEl.setAttribute('role', 'dialog');
        popoverEl.setAttribute('aria-modal', 'true');
        popoverEl.innerHTML = `
            <div class="ode-tour-title" id="ode-tour-title"></div>
            <div class="ode-tour-body" id="ode-tour-body"></div>
            <div class="ode-tour-footer">
                <div class="ode-tour-step" id="ode-tour-step"></div>
                <div class="ode-tour-actions">
                    <button type="button" class="ode-tour-btn" id="ode-tour-skip">Skip</button>
                    <button type="button" class="ode-tour-btn primary" id="ode-tour-next">Next</button>
                </div>
            </div>
        `.trim();

        document.body.appendChild(overlayEl);
        document.body.appendChild(popoverEl);

        popoverEl.querySelector('#ode-tour-skip')?.addEventListener('click', () => finish({ skipped: true }));
        popoverEl.querySelector('#ode-tour-next')?.addEventListener('click', () => next());

        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        document.addEventListener('keydown', onKeydown);
    };

    const setHighlight = (el) => {
        if (highlightedEl === el) return;
        highlightedEl?.classList?.remove('ode-tour-highlight');
        highlightedEl = el;
        highlightedEl?.classList?.add('ode-tour-highlight');
    };

    const positionOverlayHole = (target) => {
        if (!overlayEl || !target) return;
        const rect = target.getBoundingClientRect();
        const pad = 10;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const topEl = overlayEl.querySelector('[data-ode-shade="top"]');
        const leftEl = overlayEl.querySelector('[data-ode-shade="left"]');
        const rightEl = overlayEl.querySelector('[data-ode-shade="right"]');
        const bottomEl = overlayEl.querySelector('[data-ode-shade="bottom"]');

        const topH = Math.max(0, rect.top - pad);
        const holeTop = Math.max(0, rect.top - pad);
        const holeLeft = Math.max(0, rect.left - pad);
        const holeWidth = Math.min(vw, rect.width + pad * 2);
        const holeHeight = Math.min(vh, rect.height + pad * 2);
        const holeRight = holeLeft + holeWidth;
        const holeBottom = holeTop + holeHeight;

        if (topEl) {
            topEl.style.top = '0px';
            topEl.style.left = '0px';
            topEl.style.width = `${vw}px`;
            topEl.style.height = `${topH}px`;
        }

        if (leftEl) {
            leftEl.style.top = `${holeTop}px`;
            leftEl.style.left = '0px';
            leftEl.style.width = `${holeLeft}px`;
            leftEl.style.height = `${holeHeight}px`;
        }

        if (rightEl) {
            rightEl.style.top = `${holeTop}px`;
            rightEl.style.left = `${holeRight}px`;
            rightEl.style.width = `${Math.max(0, vw - holeRight)}px`;
            rightEl.style.height = `${holeHeight}px`;
        }

        if (bottomEl) {
            bottomEl.style.top = `${holeBottom}px`;
            bottomEl.style.left = '0px';
            bottomEl.style.width = `${vw}px`;
            bottomEl.style.height = `${Math.max(0, vh - holeBottom)}px`;
        }
    };

    const positionPopover = (target) => {
        if (!popoverEl || !target) return;
        const rect = target.getBoundingClientRect();
        const pad = 12;
        const gap = 14;

        const popRect = popoverEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

        const candidates = [
            {
                left: rect.right + gap,
                top: rect.top + rect.height / 2 - popRect.height / 2,
                placement: 'right'
            },
            {
                left: rect.left - popRect.width - gap,
                top: rect.top + rect.height / 2 - popRect.height / 2,
                placement: 'left'
            },
            {
                left: rect.left + rect.width / 2 - popRect.width / 2,
                top: rect.bottom + gap,
                placement: 'bottom'
            },
            {
                left: rect.left + rect.width / 2 - popRect.width / 2,
                top: rect.top - popRect.height - gap,
                placement: 'top'
            }
        ];

        const fits = (pos) =>
            pos.left >= pad &&
            pos.top >= pad &&
            pos.left + popRect.width <= vw - pad &&
            pos.top + popRect.height <= vh - pad;

        const chosen = candidates.find(fits) || candidates[2];
        const left = clamp(chosen.left, pad, vw - popRect.width - pad);
        const top = clamp(chosen.top, pad, vh - popRect.height - pad);

        popoverEl.dataset.placement = chosen.placement;
        popoverEl.style.left = `${Math.round(left)}px`;
        popoverEl.style.top = `${Math.round(top)}px`;
        popoverEl.classList.add('show');
        positionOverlayHole(target);
    };

    function onReposition() {
        if (!highlightedEl) return;
        positionOverlayHole(highlightedEl);
        positionPopover(highlightedEl);
    }

    function onKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            finish({ skipped: true });
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            next();
        }
    }

    const finish = ({ skipped } = {}) => {
        teardown();
        clearState();
        if (!skipped) markDone();
        if (skipped) markDone();
        const current = pageName();
        if (current !== 'index.html') {
            try {
                sessionStorage.setItem(SIGNUP_AFTER_TOUR_KEY, '1');
            } catch {
                // ignore
            }
            location.href = 'index.html#signup';
            return;
        }
        showSignupPrompt();
    };

    const goToStep = async (idx) => {
        if (idx >= steps.length) {
            finish({ skipped: false });
            return;
        }

        const step = steps[idx];
        if (!step) {
            finish({ skipped: false });
            return;
        }

        activeIndex = Math.max(0, idx);
        writeState({ active: true, index: activeIndex });

        const current = pageName();
        const stepUrl = step.url ? String(step.url) : '';
        const stepPage = stepUrl.split('#')[0];
        if (stepPage && current !== stepPage) {
            location.href = `${stepPage}#tour`;
            return;
        }

        if (step.selector.startsWith('#control-') || step.selector === '#control-panel') {
            try { openControlPanel(); } catch {}
        }

        const el = document.querySelector(step.selector);
        if (!el) {
            await goToStep(idx + 1);
            return;
        }

        ensureUi();
        document.body?.classList?.add('ode-tour-active');
        popoverEl?.classList?.remove('show');
        setHighlight(el);

        try {
            el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
        } catch {
            // ignore
        }

        const titleEl = popoverEl.querySelector('#ode-tour-title');
        const bodyEl = popoverEl.querySelector('#ode-tour-body');
        const stepEl = popoverEl.querySelector('#ode-tour-step');
        const nextBtn = popoverEl.querySelector('#ode-tour-next');

        if (titleEl) titleEl.textContent = step.title;
        if (bodyEl) bodyEl.textContent = step.body;
        if (stepEl) stepEl.textContent = `${activeIndex + 1} of ${steps.length}`;
        if (nextBtn) nextBtn.textContent = activeIndex >= steps.length - 1 ? 'Done' : 'Next';

        setTimeout(() => positionPopover(el), 50);
    };

    const next = () => {
        if (activeIndex >= steps.length - 1) {
            finish({ skipped: false });
            return;
        }
        goToStep(activeIndex + 1);
    };

    const start = () => {
        clearTourPromptTimer();
        closePrompt(tourPromptEl);
        tourPromptEl = null;
        teardown();
        clearState();
        writeState({ active: true, index: 0 });
        goToStep(0);
    };

    // Entry points (button + overview header).
    const panelBtn = ensureControlTourButton();
    panelBtn?.addEventListener('click', start);
    document.getElementById('overview-tour-btn')?.addEventListener('click', start);

    // Resume (multi-page) if already active.
    const state = readState();
    if (state?.active) {
        goToStep(state.index || 0);
        return;
    }

    // Auto-prompt after 10s on first visit (only if not signed in).
    const current = pageName();
    if (isDone()) return;

    Promise.resolve()
        .then(async () => {
            const me = await odeFetchMe();
            return !!me;
        })
        .then((signedIn) => {
            if (signedIn) return;
            try {
                if (sessionStorage.getItem(SIGNUP_AFTER_TOUR_KEY) === '1') {
                    sessionStorage.removeItem(SIGNUP_AFTER_TOUR_KEY);
                    showSignupPrompt();
                }
            } catch {
                // ignore
            }
            try {
                if (sessionStorage.getItem(TOUR_PROMPT_KEY) === '1') return;
                sessionStorage.setItem(TOUR_PROMPT_KEY, '1');
            } catch {
                // ignore
            }
            clearTourPromptTimer();
            tourPromptTimer = setTimeout(() => {
                ensureTourPrompt();
            }, TOUR_PROMPT_DELAY);
        })
        .catch(() => {
            clearTourPromptTimer();
            tourPromptTimer = setTimeout(() => {
                ensureTourPrompt();
            }, TOUR_PROMPT_DELAY);
        });
}

async function odeFetchJson(path, opts = {}) {
    const resp = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts
    });
    let json = null;
    try {
        json = await resp.json();
    } catch {
        json = null;
    }
    return { ok: resp.ok, status: resp.status, json };
}

async function odeFetchMe() {
    const me = await odeFetchJson('/api/auth/me', { method: 'GET' });
    return me.ok ? (me.json?.user || null) : null;
}

function escapeHtml(input) {
    const s = String(input ?? '');
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

const ODE_MEAL_PLAN_SNAPSHOT_KEY = 'ode_meal_plan_snapshot_v1';

function saveMealPlanSnapshotForLogging({ meals, mealsPerDay, macroTargets }) {
    try {
        const builtMeals = Array.isArray(meals) ? meals : [];
        if (!builtMeals.length) return false;

        const snapMeals = builtMeals.map((meal, idx) => {
            const items = (meal?.foods || []).map((item) => {
                const foodName = String(item?.foodName || '').trim();
                const measurementText = String(item?.measurementText || '').trim() || `${Number(item?.servings) || 0} servings`;
                return {
                    foodId: String(item?.foodId || ''),
                    foodName,
                    measurementText,
                    servings: Number(item?.servings) || 0,
                    grams: Number(item?.grams) || null,
                    calories: Number.isFinite(Number(item?.calories)) ? Number(item.calories) : null,
                    protein_g: Number.isFinite(Number(item?.protein_g)) ? Number(item.protein_g) : null,
                    carbs_g: Number.isFinite(Number(item?.carbs_g)) ? Number(item.carbs_g) : null,
                    fat_g: Number.isFinite(Number(item?.fat_g)) ? Number(item.fat_g) : null
                };
            }).filter((i) => i.foodName);

            const plannedText = items.length
                ? items.map((i) => `â€¢ ${i.foodName} — ${i.measurementText}`).join('\n')
                : '';

            return { index: idx + 1, items, plannedText };
        });

        const payload = {
            savedAt: new Date().toISOString(),
            mealsPerDay: Number(mealsPerDay) || snapMeals.length || 3,
            macroTargets: macroTargets && typeof macroTargets === 'object' ? macroTargets : null,
            meals: snapMeals
        };
        localStorage.setItem(ODE_MEAL_PLAN_SNAPSHOT_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

function readMealPlanSnapshotForLogging() {
    try {
        const raw = localStorage.getItem(ODE_MEAL_PLAN_SNAPSHOT_KEY);
        const snap = raw ? JSON.parse(raw) : null;
        if (!snap || typeof snap !== 'object') return null;
        const meals = Array.isArray(snap.meals) ? snap.meals : [];
        return {
            savedAt: String(snap.savedAt || ''),
            mealsPerDay: Number(snap.mealsPerDay) || meals.length || 0,
            macroTargets: snap.macroTargets || null,
            meals
        };
    } catch {
        return null;
    }
}

function ensureCustomFoodsModal() {
    let modal = document.getElementById('custom-foods-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'custom-foods-modal';
    modal.className = 'checkin-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="checkin-backdrop" data-foods-close></div>
        <div class="checkin-card foods-card" role="document">
            <div class="checkin-head">
                <div>
                    <h3 class="checkin-title">Customize your groceries</h3>
                    <p class="checkin-sub">Add foods with price + macros. We'll use them in calculations when you select them.</p>
                </div>
                <button type="button" class="checkin-close" data-foods-close aria-label="Close">&times;</button>
            </div>
            <div class="checkin-alert hidden" id="foods-alert" role="status" aria-live="polite"></div>

            <div class="foods-grid">
                <div class="foods-left">
                    <div class="foods-section-title">Your foods</div>
                    <div class="foods-list" id="foods-list"></div>
                </div>
                <div class="foods-right">
                    <div class="foods-section-title">Add a food</div>
                    <form class="foods-form" id="foods-form">
                        <label class="ns-field">
                            <span>Name *</span>
                            <input id="foods-name" required placeholder="e.g. 93/7 Ground Turkey (1lb)">
                        </label>
                        <div class="foods-row">
                            <label class="ns-field">
                                <span>Store *</span>
                                <input id="foods-store" required placeholder="e.g. Walmart">
                            </label>
                            <label class="ns-field">
                                <span>Category *</span>
                                <select id="foods-category" required>
                                    <option value="protein">Protein</option>
                                    <option value="lean_protein">Lean protein</option>
                                    <option value="protein_fat">Protein + fat</option>
                                    <option value="carb">Carb</option>
                                    <option value="fat">Fat</option>
                                    <option value="carb_protein">Carb + protein</option>
                                    <option value="misc">Misc</option>
                                </select>
                            </label>
                        </div>

                        <label class="ns-field">
                            <span>Product image * (upload or URL)</span>
                            <input id="foods-image-file" type="file" accept="image/*" capture="environment">
                        </label>
                        <label class="ns-field">
                            <span>Image URL (optional)</span>
                            <input id="foods-image-url" placeholder="https://...jpg (or assets/...)" inputmode="url">
                        </label>
                        <div class="foods-image-preview-wrap">
                            <img class="foods-image-preview hidden" id="foods-image-preview" alt="Preview">
                        </div>

                        <label class="ns-field">
                            <span>Product page URL (optional)</span>
                            <input id="foods-url" placeholder="https://...">
                        </label>

                        <div class="foods-row">
                            <label class="ns-field">
                                <span>Price per container ($) *</span>
                                <input id="foods-price" required inputmode="decimal" type="number" step="0.01" min="0" placeholder="e.g. 9.56">
                            </label>
                            <label class="ns-field">
                                <span>Container size *</span>
                                <input id="foods-container-size" required inputmode="decimal" type="number" step="0.01" min="0" placeholder="e.g. 60">
                            </label>
                            <label class="ns-field">
                                <span>Container unit *</span>
                                <input id="foods-container-unit" required placeholder="e.g. eggs, oz, cups, servings">
                            </label>
                        </div>

                        <div class="foods-row">
                            <label class="ns-field">
                                <span>Serving amount *</span>
                                <input id="foods-serving-amount" required inputmode="decimal" type="number" step="0.01" min="0" placeholder="e.g. 1">
                            </label>
                            <label class="ns-field">
                                <span>Serving unit *</span>
                                <input id="foods-serving-unit" required placeholder="e.g. egg, oz, cup, tbsp">
                            </label>
                        </div>

                        <div class="foods-row">
                            <label class="ns-field">
                                <span>Calories *</span>
                                <input id="foods-cal" required inputmode="numeric" type="number" step="1" min="0" placeholder="e.g. 70">
                            </label>
                            <label class="ns-field">
                                <span>Protein (g) *</span>
                                <input id="foods-pro" required inputmode="decimal" type="number" step="0.1" min="0" placeholder="e.g. 6">
                            </label>
                            <label class="ns-field">
                                <span>Carbs (g) *</span>
                                <input id="foods-car" required inputmode="decimal" type="number" step="0.1" min="0" placeholder="e.g. 0">
                            </label>
                            <label class="ns-field">
                                <span>Fat (g) *</span>
                                <input id="foods-fat" required inputmode="decimal" type="number" step="0.1" min="0" placeholder="e.g. 5">
                            </label>
                        </div>

                        <div class="foods-actions">
                            <button class="btn btn-ghost" type="button" id="foods-add-another">Save + add another</button>
                            <button class="btn btn-primary" type="submit" id="foods-save">Save food</button>
                        </div>
                        <div class="ns-muted tiny foods-tip">Tip: If container unit matches serving unit, we can calculate servings automatically. If not, set container unit to "servings".</div>
                    </form>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function setupCustomFoodsModal() {
    const modal = ensureCustomFoodsModal();
    const alertEl = modal.querySelector('#foods-alert');
    const listEl = modal.querySelector('#foods-list');
    const form = modal.querySelector('#foods-form');

    const byId = (id) => modal.querySelector(`#${id}`);
    const imgFileInput = byId('foods-image-file');
    const imgUrlInput = byId('foods-image-url');
    const imgPrev = byId('foods-image-preview');

    let latestFoods = [];
    let imageDataUrl = '';

    const fileToJpegDataUrl = async (file, { maxDim = 640, maxBytes = 950 * 1024 } = {}) => {
        if (!file) return '';
        if (!String(file.type || '').startsWith('image/')) return '';

        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('read_failed'));
            reader.readAsDataURL(file);
        });

        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('img_load_failed'));
            i.src = dataUrl;
        });

        const srcW = Number(img.naturalWidth || img.width || 0);
        const srcH = Number(img.naturalHeight || img.height || 0);
        if (!srcW || !srcH) return '';

        const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
        const w = Math.max(1, Math.round(srcW * scale));
        const h = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.drawImage(img, 0, 0, w, h);

        const bytes = (s) => {
            // Roughly estimate base64 -> bytes.
            const b64 = String(s || '').split(',')[1] || '';
            return Math.floor((b64.length * 3) / 4);
        };

        let q = 0.86;
        let out = canvas.toDataURL('image/jpeg', q);
        while (bytes(out) > maxBytes && q > 0.55) {
            q -= 0.08;
            out = canvas.toDataURL('image/jpeg', q);
        }
        return out;
    };

    const showAlert = (msg) => {
        if (!alertEl) return;
        if (!msg) {
            alertEl.classList.add('hidden');
            alertEl.textContent = '';
            return;
        }
        alertEl.textContent = String(msg);
        alertEl.classList.remove('hidden');
    };

    const close = () => {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        showAlert('');
    };

    const open = async () => {
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        showAlert('Loading...');

        const resp = await odeFetchJson('/api/groceries/custom-foods', { method: 'GET' });
        if (!resp.ok) {
            if (resp.status === 401) showAlert('Sign in to add custom foods.');
            else if (resp.status === 501) showAlert('Database is not set up yet, so custom foods cannot sync.');
            else showAlert(resp.json?.error || 'Could not load foods.');
            latestFoods = [];
            if (listEl) listEl.innerHTML = '';
            return;
        }
        latestFoods = Array.isArray(resp.json?.foods) ? resp.json.foods : [];
        showAlert('');
        renderList();
    };

    const renderList = () => {
        if (!listEl) return;
        if (!latestFoods.length) {
            listEl.innerHTML = `<div class="ns-muted" style="padding:8px 4px; font-size: 13px;">No custom foods yet.</div>`;
            return;
        }
        listEl.innerHTML = latestFoods.map((row) => {
            const f = row?.food || {};
            const name = String(f?.name || 'Food');
            const store = String(f?.store || '');
            const img = String(f?.image || '');
            return `
                <div class="food-source-item" data-custom-food-row="${row.id}">
                    <img class="food-source-thumb" src="${escapeHtml(img)}" alt="">
                    <div class="food-source-meta">
                        <div class="food-source-name">${escapeHtml(name)}</div>
                        <div class="food-source-sub">${escapeHtml(store)}</div>
                    </div>
                    <div class="food-source-actions">
                        <button class="food-source-trash" type="button" data-custom-food-del="${row.id}" aria-label="Delete">ðŸ—‘</button>
                    </div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('[data-custom-food-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-custom-food-del');
                if (!id) return;
                const ok = window.confirm('Delete this custom food?');
                if (!ok) return;
                showAlert('Deleting...');
                const del = await odeFetchJson(`/api/groceries/custom-foods/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (!del.ok) {
                    showAlert(del.json?.error || 'Could not delete.');
                    return;
                }
                latestFoods = latestFoods.filter((row) => row.id !== id);
                showAlert('');
                renderList();
                try {
                    window.dispatchEvent(new CustomEvent('ode:custom-foods-updated', { detail: { foods: latestFoods } }));
                } catch {
                    // ignore
                }
            });
        });
    };

    const collectFood = () => {
        const num = (id) => Number(byId(id)?.value);
        const text = (id) => String(byId(id)?.value || '').trim();
        const imageUrl = String(text('foods-image-url') || '').trim();
        const image = String(imageDataUrl || imageUrl || '').trim();
        return {
            name: text('foods-name'),
            store: text('foods-store'),
            category: text('foods-category'),
            image,
            url: text('foods-url'),
            serving: { amount: num('foods-serving-amount'), unit: text('foods-serving-unit') },
            macros: { calories: num('foods-cal'), protein: num('foods-pro'), carbs: num('foods-car'), fat: num('foods-fat') },
            container: { price: num('foods-price'), size: num('foods-container-size'), unit: text('foods-container-unit') }
        };
    };

    const clearForm = () => {
        ['foods-name', 'foods-store', 'foods-image-url', 'foods-url', 'foods-price', 'foods-container-size', 'foods-container-unit', 'foods-serving-amount', 'foods-serving-unit', 'foods-cal', 'foods-pro', 'foods-car', 'foods-fat']
            .forEach((id) => {
                const el = byId(id);
                if (el) el.value = '';
            });
        if (imgFileInput) imgFileInput.value = '';
        imageDataUrl = '';
        const cat = byId('foods-category');
        if (cat) cat.value = 'protein';
        if (imgPrev) {
            imgPrev.classList.add('hidden');
            imgPrev.removeAttribute('src');
        }
    };

    const saveFood = async ({ keepOpen }) => {
        if (form && typeof form.reportValidity === 'function' && !form.reportValidity()) return;
        const payload = collectFood();
        if (!payload.image) {
            showAlert('Product image is required (upload a photo or paste an image URL).');
            return;
        }

        showAlert('Saving...');
        const resp = await odeFetchJson('/api/groceries/custom-foods', {
            method: 'POST',
            body: JSON.stringify({ food: payload })
        });
        if (!resp.ok) {
            if (resp.status === 401) showAlert('Sign in to add custom foods.');
            else if (resp.status === 501) showAlert('Database is not set up yet, so custom foods cannot sync.');
            else showAlert(resp.json?.error || 'Could not save food.');
            return;
        }
        showAlert('Saved.');
        latestFoods = [resp.json?.item, ...latestFoods].filter(Boolean);
        renderList();
        try {
            window.dispatchEvent(new CustomEvent('ode:custom-foods-updated', { detail: { foods: latestFoods } }));
        } catch {
            // ignore
        }
        sessionStorage.setItem('ode_hint_update_macros', '1');
        if (keepOpen) {
            clearForm();
            window.setTimeout(() => showAlert(''), 800);
            return;
        }
        close();
    };

    imgUrlInput?.addEventListener('input', () => {
        const v = String(imgUrlInput.value || '').trim();
        if (!v) {
            if (!imageDataUrl && imgPrev) {
                imgPrev.classList.add('hidden');
                imgPrev.removeAttribute('src');
            }
            return;
        }
        imageDataUrl = '';
        if (imgFileInput) imgFileInput.value = '';
        if (imgPrev) {
            imgPrev.src = v;
            imgPrev.classList.remove('hidden');
        }
    });

    imgFileInput?.addEventListener('change', async () => {
        const file = imgFileInput?.files?.[0] || null;
        if (!file) return;
        showAlert('Processing image...');
        try {
            const out = await fileToJpegDataUrl(file);
            if (!out) {
                showAlert('Could not read that image. Try another photo.');
                return;
            }
            imageDataUrl = out;
            if (imgUrlInput) imgUrlInput.value = '';
            if (imgPrev) {
                imgPrev.src = out;
                imgPrev.classList.remove('hidden');
            }
            showAlert('');
        } catch {
            showAlert('Could not read that image. Try another photo.');
        }
    });

    modal.querySelectorAll('[data-foods-close]').forEach((el) => el.addEventListener('click', close));
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    modal.addEventListener('click', (e) => { if (e.target?.classList?.contains('checkin-backdrop')) close(); });

    byId('foods-add-another')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await saveFood({ keepOpen: true });
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveFood({ keepOpen: false });
    });

    return { open };
}

let odeCustomFoodsModalApi = null;

function openCustomFoodsModal() {
    if (!odeCustomFoodsModalApi) odeCustomFoodsModalApi = setupCustomFoodsModal();
    return odeCustomFoodsModalApi.open();
}

function ensureCustomMacroModal() {
    let modal = document.getElementById('custom-macro-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'custom-macro-modal';
    modal.className = 'checkin-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="checkin-backdrop" data-macro-close></div>
        <div class="checkin-card macro-card" role="document">
            <div class="checkin-head">
                <div>
                    <h3 class="checkin-title">Custom macro plan</h3>
                    <p class="checkin-sub">Set your targets and weâ€™ll rebuild your meals + groceries.</p>
                </div>
                <button type="button" class="checkin-close" data-macro-close aria-label="Close">&times;</button>
            </div>
            <div class="checkin-alert hidden" id="macro-alert" role="status" aria-live="polite"></div>
            <form id="macro-form" class="macro-form">
                <div class="foods-row">
                    <label class="ns-field">
                        <span>Calories *</span>
                        <input id="macro-cal" required type="number" min="800" step="1" inputmode="numeric" placeholder="e.g. 2300">
                    </label>
                    <label class="ns-field">
                        <span>Protein (g) *</span>
                        <input id="macro-pro" required type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 180">
                    </label>
                </div>
                <div class="foods-row">
                    <label class="ns-field">
                        <span>Carbs (g) *</span>
                        <input id="macro-car" required type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 220">
                    </label>
                    <label class="ns-field">
                        <span>Fat (g) *</span>
                        <input id="macro-fat" required type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 70">
                    </label>
                </div>
                <div class="foods-actions">
                    <button class="btn btn-ghost" type="button" data-macro-close>Cancel</button>
                    <button class="btn btn-primary" type="submit">Save & rebuild</button>
                </div>
                <div class="ns-muted tiny foods-tip">Tip: Protein is the most important target for results.</div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function openCustomMacroModal({ macros, onSave }) {
    const modal = ensureCustomMacroModal();
    const alertEl = modal.querySelector('#macro-alert');
    const form = modal.querySelector('#macro-form');
    const calEl = modal.querySelector('#macro-cal');
    const proEl = modal.querySelector('#macro-pro');
    const carEl = modal.querySelector('#macro-car');
    const fatEl = modal.querySelector('#macro-fat');

    const showAlert = (msg) => {
        if (!alertEl) return;
        if (!msg) {
            alertEl.classList.add('hidden');
            alertEl.textContent = '';
            return;
        }
        alertEl.textContent = String(msg);
        alertEl.classList.remove('hidden');
    };

    const close = () => {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        showAlert('');
    };

    const num = (v) => {
        const n = Number(String(v ?? '').trim());
        return Number.isFinite(n) ? n : null;
    };

    if (calEl) calEl.value = String(Math.round(Number(macros?.calories) || 2000));
    if (proEl) proEl.value = String(Math.round(Number(macros?.proteinG) || 150));
    if (carEl) carEl.value = String(Math.round(Number(macros?.carbG) || 200));
    if (fatEl) fatEl.value = String(Math.round(Number(macros?.fatG) || 65));

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    window.setTimeout(() => calEl?.focus(), 40);

    const cleanup = () => {
        modal.querySelectorAll('[data-macro-close]').forEach((el) => el.removeEventListener('click', close));
        modal.removeEventListener('keydown', onKey);
        modal.removeEventListener('click', onBackdrop);
        form?.removeEventListener('submit', onSubmit);
    };

    const onKey = (e) => { if (e.key === 'Escape') { cleanup(); close(); } };
    const onBackdrop = (e) => { if (e.target?.classList?.contains('checkin-backdrop')) { cleanup(); close(); } };
    const onSubmit = (e) => {
        e.preventDefault();
        const next = {
            calories: num(calEl?.value),
            proteinG: num(proEl?.value),
            carbG: num(carEl?.value),
            fatG: num(fatEl?.value)
        };
        if (!Number.isFinite(next.calories) || next.calories < 800) { showAlert('Enter a valid calorie target.'); return; }
        if (![next.proteinG, next.carbG, next.fatG].every((n) => Number.isFinite(n) && n >= 0)) {
            showAlert('Enter valid macro grams (0 or higher).');
            return;
        }
        cleanup();
        try { onSave?.(next); } catch { /* ignore */ }
        close();
    };

    modal.querySelectorAll('[data-macro-close]').forEach((el) => el.addEventListener('click', () => { cleanup(); close(); }));
    modal.addEventListener('keydown', onKey);
    modal.addEventListener('click', onBackdrop);
    form?.addEventListener('submit', onSubmit);
}

function ensureCustomMacroAuthPromptModal() {
    let modal = document.getElementById('custom-macro-auth-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'custom-macro-auth-modal';
    modal.className = 'checkin-modal hidden';
    modal.tabIndex = -1;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="checkin-backdrop" data-cm-auth-close></div>
        <div class="checkin-card macro-card" role="document">
            <div class="checkin-head">
                <div>
                    <h3 class="checkin-title">Custom access</h3>
                    <p class="checkin-sub">Make an account and youâ€™ll get free custom access.</p>
                </div>
                <button type="button" class="checkin-close" data-cm-auth-close aria-label="Close">&times;</button>
            </div>
            <div class="ns-muted" style="margin-top:10px;">
                Custom foods lets you pick the groceries you actually eat â€” then weâ€™ll re-generate your plan.
            </div>
            <div class="foods-actions" style="margin-top: 14px;">
                <button class="btn btn-ghost" type="button" data-cm-auth-close>Not now</button>
                <button class="btn btn-primary" type="button" id="cm-auth-signup">Make an account</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

function openCustomMacroAuthPromptModal() {
    const modal = ensureCustomMacroAuthPromptModal();

    const onBackdrop = (e) => {
        if (e.target?.classList?.contains('checkin-backdrop')) close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onSignup = () => {
        close();
        try {
            odeOpenAuthModal('signup');
        } catch {
            document.getElementById('control-signin')?.click?.();
        }
    };

    const cleanup = () => {
        modal.querySelectorAll('[data-cm-auth-close]').forEach((el) => el.removeEventListener('click', close));
        modal.removeEventListener('click', onBackdrop);
        modal.removeEventListener('keydown', onKey);
        modal.querySelector('#cm-auth-signup')?.removeEventListener('click', onSignup);
    };

    const close = () => {
        cleanup();
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    };

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    window.setTimeout(() => modal.querySelector('#cm-auth-signup')?.focus(), 40);

    modal.querySelectorAll('[data-cm-auth-close]').forEach((el) => {
        el.addEventListener('click', close);
    });
    modal.addEventListener('click', onBackdrop);
    modal.addEventListener('keydown', onKey);
    modal.querySelector('#cm-auth-signup')?.addEventListener('click', onSignup);
}

async function handleCustomMacroPlanCtaClick(e) {
    e?.preventDefault?.();
    const btn = e?.currentTarget || null;
    try { btn?.blur?.(); } catch { /* ignore */ }

    let me = null;
    try {
        me = await odeFetchMe();
    } catch {
        me = null;
    }

    if (!me) {
        openCustomMacroAuthPromptModal();
        return;
    }

    try {
        sessionStorage.setItem('ode_focus_custom_foods', '1');
    } catch {
        // ignore
    }
    window.location.href = 'grocery-final.html';
}

function setupGroceryFinalPage() {
        // Auto-check 'None' for allergies and disable all others
        document.querySelectorAll('.allergy-checkbox input[type="checkbox"]').forEach(input => {
            if (input.value === 'none') {
                input.checked = true;
            } else {
                input.checked = false;
                input.disabled = true;
            }
        });
        // Disable all dietary preferences except 'No restrictions'
        document.querySelectorAll('.diet-btn').forEach(btn => {
            if (btn.dataset.diet !== 'no-restrictions') {
                btn.disabled = true;
                btn.classList.remove('active');
                if (!btn.textContent.includes('coming soon')) btn.textContent += ' (coming soon)';
            } else {
                btn.classList.add('active');
            }
        });
    const form = document.getElementById('g-final-form');
    if (!form) return;

    populateTimeSelects();

    const session = sessionStorage.getItem('grocerySession');
    let sessionData = null;
    try {
        sessionData = session ? JSON.parse(session) : null;
    } catch (err) {
        sessionData = null;
    }

    const proteinTarget = sessionData?.proteinTarget || 0;
    const timing = sessionData?.timing || 'balanced';
    let prep = String(document.getElementById('g-prep')?.value || sessionData?.prep || 'batch');

    const mealsInput = document.getElementById('g-meals');
    const mealsAutoBtn = document.getElementById('g-meals-auto');
    const storeInput = document.getElementById('g-store');
    const budgetInput = document.getElementById('g-budget-total');
    const wakeInput = document.getElementById('g-wake-time');
    const workoutInput = document.getElementById('g-workout-time');
    const zipInput = document.getElementById('g-zip');
    const prepInput = document.getElementById('g-prep');
    const priceAdjustmentInput = document.getElementById('g-price-adjustment');
    const priceAdjustmentValue = document.getElementById('price-adjustment-value');

    // Mode display removed (requested).
    
    // ========================================
    // PHASE 5.6: Price adjustment slider
    // ========================================
    if (priceAdjustmentInput && priceAdjustmentValue) {
        priceAdjustmentInput.addEventListener('input', () => {
            const val = Number(priceAdjustmentInput.value);
            if (val === 0) {
                priceAdjustmentValue.textContent = 'Accurate';
            } else if (val > 0) {
                priceAdjustmentValue.textContent = `+${val}%`;
            } else {
                priceAdjustmentValue.textContent = `${val}%`;
            }
        });
    }

    // Budget button handlers
    document.querySelectorAll('.budget-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.budget-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (budgetInput) budgetInput.value = btn.dataset.budget;
        });
    });

    // Meals per day button handlers
    document.querySelectorAll('.meal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (mealsInput) mealsInput.value = btn.dataset.meals;
        });
    });

    // Prep style button handlers
    document.querySelectorAll('.prep-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.prep-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const next = String(btn.dataset.prep || '').trim();
            if (!next) return;
            prep = next;
            if (prepInput) prepInput.value = next;
            try {
                postTrackEvent('grocery_prep_set', { prep: next });
            } catch {
                // ignore
            }
        });
    });

    // Taste vs cost preference button handlers
    const tasteCostInput = document.getElementById('g-taste-cost');
    document.querySelectorAll('.taste-cost-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.taste-cost-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const next = String(btn.dataset.preference || '').trim();
            if (!next) return;
            if (tasteCostInput) tasteCostInput.value = next;
            try {
                postTrackEvent('grocery_taste_cost_set', { preference: next });
            } catch {
                // ignore
            }
        });
    });

    // Accordion toggle for advanced options
    const advancedToggle = document.getElementById('advanced-toggle');
    const advancedContent = document.getElementById('advanced-content');
    if (advancedToggle) {
        advancedToggle.addEventListener('click', (e) => {
            e.preventDefault();
            advancedContent?.classList.toggle('hidden');
            advancedToggle.classList.toggle('active');
        });
    }

    // Accordion toggle: food sources (default + custom)
    const foodToggle = document.getElementById('food-sources-toggle');
    const foodContent = document.getElementById('food-sources-content');
    const foodListEl = document.getElementById('food-source-list');
    const foodNoteEl = document.getElementById('food-source-note');
    const customFoodsOpenBtn = document.getElementById('custom-foods-open');
    const foodLoginHintEl = document.getElementById('food-sources-login-hint');

    const maybeFocusCustomFoods = () => {
        let flag = false;
        try {
            flag = sessionStorage.getItem('ode_focus_custom_foods') === '1';
            if (flag) sessionStorage.removeItem('ode_focus_custom_foods');
        } catch {
            flag = false;
        }
        if (!flag) return;

        try {
            foodContent?.classList.remove('hidden');
            foodToggle?.classList.add('active');
            customFoodsOpenBtn?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            customFoodsOpenBtn?.classList.add('is-pulsing');
            window.setTimeout(() => customFoodsOpenBtn?.classList.remove('is-pulsing'), 5200);
        } catch {
            // ignore
        }
    };

    window.setTimeout(maybeFocusCustomFoods, 120);

    const foodSelKey = (userId) => `ode_grocery_food_selection_v1:${userId || 'guest'}`;
    let meUser = null;
    let meUserResolved = false;
    let customFoodRows = [];
    let foodSel = { defaults: {}, custom: {} };

    const setFoodNote = (msg) => {
        if (!foodNoteEl) return;
        if (!msg) {
            foodNoteEl.classList.add('hidden');
            foodNoteEl.textContent = '';
            return;
        }
        foodNoteEl.textContent = String(msg);
        foodNoteEl.classList.remove('hidden');
    };

    const readFoodSelection = () => {
        try {
            const raw = localStorage.getItem(foodSelKey(meUser?.id));
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object') return { defaults: {}, custom: {} };
            return {
                defaults: parsed.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : {},
                custom: parsed.custom && typeof parsed.custom === 'object' ? parsed.custom : {}
            };
        } catch {
            return { defaults: {}, custom: {} };
        }
    };

    const writeFoodSelection = (next) => {
        foodSel = next && typeof next === 'object' ? next : { defaults: {}, custom: {} };
        try {
            localStorage.setItem(foodSelKey(meUser?.id), JSON.stringify(foodSel));
        } catch {
            // ignore
        }
    };

    const isDefaultSelected = (id) => foodSel?.defaults?.[id] !== false;
    const isCustomSelected = (rowId) => foodSel?.custom?.[rowId] !== false;

    const syncCustomFoodsButton = () => {
        if (!customFoodsOpenBtn) return;
        const locked = !meUser;
        customFoodsOpenBtn.classList.toggle('is-locked', locked);
        customFoodsOpenBtn.setAttribute('aria-disabled', locked ? 'true' : 'false');
        customFoodsOpenBtn.title = locked ? 'Create an account to add custom foods.' : '';
    };

    const syncFoodSourcesToggle = () => {
        if (!foodToggle) return;
        const locked = !meUser;
        foodToggle.classList.toggle('is-locked', locked);
        foodToggle.setAttribute('aria-disabled', locked ? 'true' : 'false');
        foodToggle.title = locked ? 'Make an account to use custom groceries.' : '';
        foodLoginHintEl?.classList?.toggle('hidden', !locked);

        if (locked) {
            foodContent?.classList.add('hidden');
            foodToggle.classList.remove('active');
        }
    };

    const loadMeUser = async () => {
        if (meUserResolved) return meUser;
        try {
            meUser = await odeFetchMe();
        } catch {
            meUser = null;
        } finally {
            meUserResolved = true;
        }
        syncCustomFoodsButton();
        syncFoodSourcesToggle();
        return meUser;
    };

    // Kick off early so signed-in users don't see a locked flicker.
    loadMeUser();

    const renderFoodSources = () => {
        if (!foodListEl) return;
        const parts = [];

        WALMART_BASELINE_FOODS.forEach((f) => {
            parts.push(`
                <label class="food-source-item" data-food-default="${escapeHtml(f.id)}">
                    <input class="fs-check" type="checkbox" ${isDefaultSelected(f.id) ? 'checked' : ''} data-food-default-check="${escapeHtml(f.id)}">
                    <img class="food-source-thumb" src="${escapeHtml(f.image || '')}" alt="">
                    <div class="food-source-meta">
                        <div class="food-source-name">${escapeHtml(f.name || '')}</div>
                        <div class="food-source-sub">${escapeHtml(f.store || 'Default')}</div>
                    </div>
                </label>
            `);
        });

        if (customFoodRows.length) {
            parts.push(`<div class="ns-muted" style="padding:6px 2px 0; font-size: 12px;">Your foods</div>`);
        }

        customFoodRows.forEach((row) => {
            const f = row?.food || {};
            parts.push(`
                <div class="food-source-item" data-food-custom="${escapeHtml(row.id)}">
                    <input class="fs-check" type="checkbox" ${isCustomSelected(row.id) ? 'checked' : ''} data-food-custom-check="${escapeHtml(row.id)}">
                    <img class="food-source-thumb" src="${escapeHtml(String(f.image || ''))}" alt="">
                    <div class="food-source-meta">
                        <div class="food-source-name">${escapeHtml(String(f.name || 'Food'))}</div>
                        <div class="food-source-sub">${escapeHtml(String(f.store || ''))}</div>
                    </div>
                    <div class="food-source-actions">
                        <button class="food-source-trash" type="button" data-food-custom-del="${escapeHtml(row.id)}" aria-label="Delete">ðŸ—‘</button>
                    </div>
                </div>
            `);
        });

        foodListEl.innerHTML = parts.join('');

        foodListEl.querySelectorAll('[data-food-default-check]').forEach((inp) => {
            inp.addEventListener('change', () => {
                const id = inp.getAttribute('data-food-default-check');
                if (!id) return;
                const next = readFoodSelection();
                next.defaults = next.defaults || {};
                next.defaults[id] = inp.checked ? true : false;
                writeFoodSelection(next);
            });
        });

        foodListEl.querySelectorAll('[data-food-custom-check]').forEach((inp) => {
            inp.addEventListener('change', () => {
                const id = inp.getAttribute('data-food-custom-check');
                if (!id) return;
                const next = readFoodSelection();
                next.custom = next.custom || {};
                next.custom[id] = inp.checked ? true : false;
                writeFoodSelection(next);
            });
        });

        foodListEl.querySelectorAll('[data-food-custom-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-food-custom-del');
                if (!id) return;
                if (!meUser) {
                    setFoodNote('Sign in to delete custom foods.');
                    return;
                }
                const ok = window.confirm('Delete this custom food?');
                if (!ok) return;
                setFoodNote('Deleting...');
                const del = await odeFetchJson(`/api/groceries/custom-foods/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (!del.ok) {
                    setFoodNote(del.json?.error || 'Could not delete.');
                    return;
                }
                customFoodRows = customFoodRows.filter((r) => r.id !== id);
                const next = readFoodSelection();
                if (next.custom) delete next.custom[id];
                writeFoodSelection(next);
                setFoodNote('');
                renderFoodSources();
            });
        });
    };

    if (foodToggle) {
        foodToggle.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!meUserResolved) {
                setFoodNote('Checking your account…');
                await loadMeUser();
                setFoodNote('');
            }
            if (!meUser) {
                setFoodNote('Make an account to use custom groceries.');
                syncFoodSourcesToggle();
                try {
                    odeOpenAuthModal('signup');
                } catch {
                    document.getElementById('control-signin')?.click?.();
                }
                return;
            }
            foodContent?.classList.toggle('hidden');
            foodToggle.classList.toggle('active');
        });
    }

    customFoodsOpenBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!meUser) {
            setFoodNote('Make an account for this access \u2014 it\u2019s free.');
            syncCustomFoodsButton();
            customFoodsOpenBtn.classList.add('is-pulsing');
            setTimeout(() => customFoodsOpenBtn.classList.remove('is-pulsing'), 650);
            try {
                odeOpenAuthModal('signup');
            } catch {
                document.getElementById('control-signin')?.click?.();
            }
            return;
        }
        await openCustomFoodsModal();
    });

    customFoodsOpenBtn?.addEventListener('pointerenter', () => {
        if (!meUser) setFoodNote('Make an account for this access \u2014 it\u2019s free.');
    });

    // Load and render custom foods if signed in + DB configured.
    (async () => {
        if (!foodListEl) return;
        syncCustomFoodsButton();
        syncFoodSourcesToggle();
        await loadMeUser();
        foodSel = readFoodSelection();

        if (!meUser) {
            setFoodNote('Make an account for this access \u2014 it\u2019s free.');
            renderFoodSources();
            return;
        }

        const resp = await odeFetchJson('/api/groceries/custom-foods', { method: 'GET' });
        if (!resp.ok) {
            if (resp.status === 501) setFoodNote('Custom foods need database sync (not set up yet).');
            else setFoodNote(resp.json?.error || 'Could not load your foods.');
            customFoodRows = [];
            renderFoodSources();
            return;
        }
        customFoodRows = Array.isArray(resp.json?.foods) ? resp.json.foods : [];
        setFoodNote('');
        renderFoodSources();
    })();

    window.addEventListener('ode:custom-foods-updated', (e) => {
        const next = Array.isArray(e?.detail?.foods) ? e.detail.foods : null;
        if (!next) return;
        customFoodRows = next;
        foodSel = readFoodSelection();
        renderFoodSources();
    });

    const macros = sessionData?.macros || null;
    const calEl = document.getElementById('g-final-cal');
    const proEl = document.getElementById('g-final-pro');
    const carEl = document.getElementById('g-final-car');
    const fatEl = document.getElementById('g-final-fat');
    if (calEl && macros) {
        calEl.textContent = `${macros.calories.toLocaleString()} kcal`;
        proEl.textContent = `${macros.proteinG} g`;
        carEl.textContent = `${macros.carbG} g`;
        fatEl.textContent = `${macros.fatG} g`;
    }

    if (mealsInput && !mealsInput.dataset.userSet) {
        mealsInput.value = proteinTarget >= 160 ? 4 : 3;
    }

    const finalBackBtn = document.getElementById('g-final-back');
    const finalSaveBtn = document.getElementById('g-final-save');

    finalBackBtn?.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    finalSaveBtn?.addEventListener('click', async () => {
        const existingStart = sessionStorage.getItem('groceryStartDate');
        const startDate = existingStart || new Date().toISOString();
        if (!existingStart) sessionStorage.setItem('groceryStartDate', startDate);
        
        // Get macros from nutritionState or from grocerySession (fallback)
        let macros = nutritionState.results;
        if (!macros) {
            try {
                const sess = JSON.parse(sessionStorage.getItem('grocerySession') || 'null');
                if (sess?.macros) {
                    macros = {
                        calories: sess.macros.calories,
                        proteinG: sess.macros.proteinG,
                        carbG: sess.macros.carbG,
                        fatG: sess.macros.fatG
                    };
                }
            } catch (e) {}
        }
        macros = macros || { calories: 2000, proteinG: 150, carbG: 200, fatG: 65 };

        // If the user has training auto-adjust enabled (signed-in), apply it here so the grocery plan adapts.
        // We keep protein stable and shift calories mostly via carbs (Â±50g per Â±200 kcal).
        let trainingCalorieOffset = 0;
        try {
            const resp = await fetch('/api/training/state', { credentials: 'include' });
            if (resp.ok) {
                const data = await resp.json();
                trainingCalorieOffset = Number(data?.profile?.calorie_offset) || 0;
                if (Number.isFinite(trainingCalorieOffset)) {
                    localStorage.setItem('ode_training_calorie_offset', String(trainingCalorieOffset));
                }
            }
        } catch {
            // ignore
        }
        if (!Number.isFinite(trainingCalorieOffset) || trainingCalorieOffset === 0) {
            const stored = Number(localStorage.getItem('ode_training_calorie_offset') || 0);
            trainingCalorieOffset = Number.isFinite(stored) ? stored : 0;
        }
        if (Number.isFinite(trainingCalorieOffset) && trainingCalorieOffset !== 0) {
            const nextCalories = Math.max(1200, Number(macros.calories) + trainingCalorieOffset);
            const carbDelta = Math.round(trainingCalorieOffset / 4);
            const nextCarbs = Math.max(0, Number(macros.carbG) + carbDelta);
            macros = {
                ...macros,
                calories: nextCalories,
                carbG: nextCarbs
            };
            sessionStorage.setItem('groceryAutoAdjustWarning', `Auto-adjust applied: ${trainingCalorieOffset > 0 ? '+' : ''}${trainingCalorieOffset} kcal`);
        } else {
            sessionStorage.removeItem('groceryAutoAdjustWarning');
        }

        const goalRaw = String(nutritionState.selections?.goal || '').trim().toLowerCase();
        const goalMode = goalRaw === 'cut' ? 'cut' : goalRaw === 'bulk' ? 'bulk' : 'maintain';
        
        // Get bodyweight from nutritionState
        const weightLbs = nutritionState.selections?.weightLbs || 170;
        
        const prefs = {
            budgetTotal: Number(budgetInput?.value || 0),
            store: storeInput?.value,
            mealsPerDay: Number(mealsInput?.value || 0),
            wakeTime: wakeInput?.value || '',
            workoutTime: workoutInput?.value || '',
            zipCode: (zipInput?.value || '').trim() || null,
            prep,
            timing,
            dietaryPref: document.getElementById('g-dietary-pref')?.value || 'no-restrictions',
            allergies: (document.getElementById('g-allergies')?.value || '').split(',').filter(a => a),
            tasteCost: document.getElementById('g-taste-cost')?.value || 'balance',
            startDate,
            weightLbs, // Store bodyweight for constraint calculations
            mode: goalMode,
            priceAdjustment: Number(priceAdjustmentInput?.value || 0), // Store price adjustment percentage
            // Store macros in prefs so they persist to grocery-plan.html
            macros: {
                calories: macros.calories,
                proteinG: macros.proteinG,
                carbG: macros.carbG,
                fatG: macros.fatG
            }
        };

        try {
            postTrackEvent('grocery_preferences_saved', {
                budgetTotal: prefs.budgetTotal,
                store: prefs.store,
                mealsPerDay: prefs.mealsPerDay,
                prep: prefs.prep,
                timing: prefs.timing,
                dietaryPref: prefs.dietaryPref,
                allergies: prefs.allergies,
                tasteCost: prefs.tasteCost,
                startDate: prefs.startDate,
                weightLbs: prefs.weightLbs,
                mode: prefs.mode,
                priceAdjustment: prefs.priceAdjustment,
                macros: prefs.macros
            });
        } catch {
            // ignore
        }
        
        // ========================================
        // PHASE 4.1: Budget tier detection + enforcement BEFORE generation
        // ========================================
        const weeklyBudget = prefs.budgetTotal;
        const budgetTier = getBudgetTier(weeklyBudget);
        const maxAchievableProtein = calculateMaxAchievableProtein(weeklyBudget);
        const userProteinTarget = macros.proteinG;
        
        console.group('%cÃ°Å¸â€™Â° BUDGET VALIDATION', 'font-size: 14px; font-weight: bold; color: #f59e0b');
        console.log(`Weekly budget: $${weeklyBudget}`);
        console.log(`Budget tier: ${budgetTier.toUpperCase()}`);
        console.log(`Max achievable protein: ${maxAchievableProtein}g/day`);
        console.log(`User protein target: ${userProteinTarget}g/day`);
        console.log(`Protein multiplier for tier: ${BUDGET_TIERS[budgetTier].proteinMultiplier}g/lb`);
        console.groupEnd();
        
        // Check if user's protein target exceeds what's achievable with budget
        if (userProteinTarget > maxAchievableProtein) {
            console.warn(`Ã¢Å¡Â Ã¯Â¸Â BUDGET MISMATCH: Protein target ${userProteinTarget}g exceeds max achievable ${maxAchievableProtein}g`);
            
            // Show budget warning modal and wait for user decision
            const decision = await showBudgetWarningModal(userProteinTarget, maxAchievableProtein, weeklyBudget, budgetTier);
            
            if (decision.action === 'lower-protein') {
                // Update macros with lowered protein
                macros.proteinG = decision.newProtein;
                prefs.macros.proteinG = decision.newProtein;
                console.log(`Ã¢Å“â€¦ Protein target lowered to ${decision.newProtein}g`);
            } else if (decision.action === 'increase-budget') {
                // User wants to go back and increase budget - don't proceed
                console.log('User chose to increase budget - staying on form');
                return; // Exit without navigating
            } else if (decision.action === 'continue-survival') {
                // Force survival tier rules
                prefs.budgetTier = 'survival';
                console.log('Ã¢Å¡Â Ã¯Â¸Â Continuing with survival tier rules');
            }
        }
        
        // Store budget tier in prefs
        prefs.budgetTier = prefs.budgetTier || budgetTier;
        sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs));
        
        const selectedDefaults = WALMART_BASELINE_FOODS.filter((f) => isDefaultSelected(f.id));
        const selectedCustom = customFoodRows
            .filter((row) => isCustomSelected(row.id))
            .map((row) => row.food)
            .filter(Boolean);

        const baselineFoods = [...selectedDefaults, ...selectedCustom].length
            ? [...selectedDefaults, ...selectedCustom]
            : WALMART_BASELINE_FOODS;

        const adjustedFoods = calculateAdjustedBaselineFoods(
            baselineFoods,
            macros,
            Math.max(2, Number(prefs.mealsPerDay) || 3),
            prefs.dietaryPref,
            prefs.allergies,
            prefs.mode || 'maintain',
            weightLbs
        );
        
        // Clear old selection data to force baseline foods usage
        sessionStorage.removeItem('grocerySession');
        sessionStorage.removeItem('groceryPurchaseOverrides');
        sessionStorage.removeItem('groceryExpiredOverrides');
        
        sessionStorage.setItem('adjustedBaselineFoods', JSON.stringify(adjustedFoods));
        console.log('Adjusted baseline foods set:', adjustedFoods.length, 'foods');
        
        window.location.href = 'grocery-plan.html';
    });
}

async function setupGroceryPlanPage() {
    const planPage = document.getElementById('plan-page');
    if (!planPage) return;

    // Wire CTA / close button even if we early-return (e.g. hydrating saved list).
    wireSignedOutPlanCta();

    // "Reconfigure Plan" minimum-viable mode (only toggled by pressing the Reconfigure button).
    // Default behavior must remain identical unless explicitly enabled by the user.
    let reconfigureMinModeEnabled = false;
    let reconfigureBaselineSnapshot = null;
    let reconfigurePrefsJsonSnapshot = null;
    let reconfigureChoiceMapSnapshot = null;

    const planCtaClose = document.getElementById('plan-cta-close');
    if (planCtaClose && planCtaClose.dataset.bound !== '1') {
        planCtaClose.dataset.bound = '1';
        planCtaClose.addEventListener('click', () => {
            window.location.href = 'training.html';
        });
    }

    // Image carousel functionality (grocery-plan page)
    (() => {
        const base = planPage || document;
        base.querySelectorAll('.image-carousel').forEach(carousel => {
            if (carousel.dataset.carouselInit === '1') return;
            const track = carousel.querySelector('.carousel-track');
            const dots = carousel.querySelectorAll('.dot');
            const prevBtn = carousel.querySelector('.carousel-prev');
            const nextBtn = carousel.querySelector('.carousel-next');
            if (!track || !dots.length || !prevBtn || !nextBtn) return;

            carousel.dataset.carouselInit = '1';
            let currentIndex = 0;
            const totalSlides = dots.length;

            const goToSlide = (index) => {
                let i = index;
                if (i < 0) i = totalSlides - 1;
                if (i >= totalSlides) i = 0;
                currentIndex = i;
                track.style.transform = `translateX(-${currentIndex * (100 / totalSlides)}%)`;
                dots.forEach((dot, di) => dot.classList.toggle('active', di === currentIndex));
            };

            prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
            nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));
            dots.forEach((dot, di) => dot.addEventListener('click', () => goToSlide(di)));
        });
    })();

    // Mobile-only: slide-out grocery list drawer.
    // Desktop layout stays unchanged via CSS media queries.
    (() => {
        const drawer = document.getElementById('grocery-list');
        const toggle = document.getElementById('mobile-grocery-toggle');
        const closeBtn = document.getElementById('mobile-grocery-close');
        const backdrop = document.getElementById('mobile-drawer-backdrop');
        if (!drawer || !toggle || !closeBtn || !backdrop) return;

        const mql = window.matchMedia('(max-width: 900px)');
        const isMobile = () => !!mql.matches;

        const open = () => {
            if (!isMobile()) return;
            drawer.classList.add('is-open');
            backdrop.classList.remove('hidden');
            backdrop.setAttribute('aria-hidden', 'false');
        };
        const close = () => {
            drawer.classList.remove('is-open');
            backdrop.classList.add('hidden');
            backdrop.setAttribute('aria-hidden', 'true');
        };

        // Default: open the drawer first on mobile.
        if (isMobile()) open();
        else close();

        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            if (!isMobile()) return;
            if (drawer.classList.contains('is-open')) close();
            else open();
        });
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            close();
        });
        backdrop.addEventListener('click', close);
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });
        mql.addEventListener('change', () => {
            // If user rotates / resizes into desktop, ensure the drawer isn't stuck open.
            if (!isMobile()) close();
        });
    })();

    // Mobile-only: auto-rotating macro essentials carousel (single card view).
    (() => {
        const section = document.getElementById('macro-essentials');
        if (!section) return;
        const grid = section.querySelector('.essentials-grid');
        const dotsWrap = section.querySelector('#macro-essentials-dots');
        const dots = dotsWrap ? Array.from(dotsWrap.querySelectorAll('.dot')) : [];
        if (!grid) return;
        const cards = Array.from(grid.querySelectorAll('.essential-card'));
        if (!cards.length) return;

        const mql = window.matchMedia('(max-width: 700px)');
        const isMobile = () => !!mql.matches;

        let index = 0;
        let pauseUntil = 0;
        let intervalId = null;

        const setDots = (activeIndex) => {
            if (!dots.length) return;
            dots.forEach((dot, i) => dot.classList.toggle('active', i === activeIndex));
        };

        const resetToFirst = () => {
            index = 0;
            grid.scrollTo({ left: 0, behavior: 'auto' });
            setDots(0);
        };

        const scrollToIndex = (nextIndex) => {
            if (!isMobile()) return;
            const i = ((nextIndex % cards.length) + cards.length) % cards.length;
            index = i;
            const left = cards[i].offsetLeft;
            grid.scrollTo({ left, behavior: 'smooth' });
            setDots(index);
        };

        const refreshIndexFromScroll = () => {
            let closest = 0;
            let closestDist = Infinity;
            const current = grid.scrollLeft;
            cards.forEach((card, i) => {
                const dist = Math.abs(card.offsetLeft - current);
                if (dist < closestDist) {
                    closest = i;
                    closestDist = dist;
                }
            });
            index = closest;
            setDots(index);
        };

        const pause = () => {
            pauseUntil = Date.now() + 8000;
        };

        const start = () => {
            if (intervalId) return;
            intervalId = window.setInterval(() => {
                if (!isMobile()) return;
                if (Date.now() < pauseUntil) return;
                scrollToIndex(index + 1);
            }, 5000);
        };

        const stop = () => {
            if (intervalId) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
        };

        grid.addEventListener('scroll', () => {
            pause();
            refreshIndexFromScroll();
        }, { passive: true });
        grid.addEventListener('pointerdown', pause, { passive: true });
        grid.addEventListener('touchstart', pause, { passive: true });
        dots.forEach((dot) => {
            dot.addEventListener('click', () => {
                const target = Number(dot.dataset.index || 0);
                pause();
                scrollToIndex(target);
            });
        });

        mql.addEventListener('change', () => {
            if (!isMobile()) {
                stop();
                return;
            }
            resetToFirst();
            start();
        });

        if (isMobile()) {
            resetToFirst();
            start();
        }
    })();

    let sessionData = null;
    let prefs = null;
    try {
        sessionData = JSON.parse(sessionStorage.getItem('grocerySession') || 'null');
        prefs = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
    } catch (err) {
        sessionData = null;
        prefs = null;
    }

    // If user is signed in and we have no local plan state, prefer showing their saved grocery list
    // instead of generating a default plan that makes it look like their old list disappeared.
    const listEl = document.getElementById('grocery-list-items');
    try {
        const hasPrefs = !!(prefs && typeof prefs === 'object' && Object.keys(prefs).length);
        const hasSession = !!(sessionData && typeof sessionData === 'object' && Object.keys(sessionData).length);
        const hasAdjusted = !!sessionStorage.getItem('adjustedBaselineFoods');
        if (!hasPrefs && !hasSession && !hasAdjusted && listEl) {
            const hydrated = await hydrateSavedGroceryListIfPossible({ listEl });
            if (hydrated) return;
        }
    } catch {
        // ignore
    }

    // Get macros from prefs (where we saved them from grocery-final.html)
    const macros = prefs?.macros || { calories: 2000, proteinG: 150, carbG: 200, fatG: 65 };
    const initialPrefsJson = (() => {
        try {
            return sessionStorage.getItem('groceryPrefs');
        } catch {
            return null;
        }
    })();
    const initialMacrosSnapshot = {
        calories: Number(macros?.calories) || 2000,
        proteinG: Number(macros?.proteinG) || 150,
        carbG: Number(macros?.carbG) || 200,
        fatG: Number(macros?.fatG) || 65
    };

    const deriveMacrosFromInputs = ({ calories, weightLbs, mode }) => {
        const cal = Math.max(1200, Math.round(Number(calories) || 0));
        const bw = Math.max(80, Math.round(Number(weightLbs) || 0));
        const m = String(mode || '').toLowerCase();

        const proteinPerLb = m === 'cut' ? 0.95 : m === 'bulk' ? 0.9 : 0.9;
        const fatPerLb = m === 'cut' ? 0.28 : m === 'bulk' ? 0.33 : 0.3;

        let proteinG = Math.round(clamp(bw * proteinPerLb, 110, 260));
        let fatG = Math.round(clamp(bw * fatPerLb, 40, 120));

        const minFat = 35;
        const minProtein = 90;

        let remaining = cal - proteinG * 4 - fatG * 9;
        if (remaining < 0) {
            fatG = Math.max(minFat, Math.floor((cal - proteinG * 4) / 9));
            remaining = cal - proteinG * 4 - fatG * 9;
        }
        if (remaining < 0) {
            proteinG = Math.max(minProtein, Math.floor((cal - fatG * 9) / 4));
            remaining = cal - proteinG * 4 - fatG * 9;
        }

        const carbsG = Math.max(0, Math.round(remaining / 4));
        return { calories: cal, proteinG, carbG: carbsG, fatG };
    };

    const deriveMinimumViableMacrosForReconfigureMode = ({ baselineMacros, goalRaw, weightLbs, sex }) => {
        const bw = Math.max(80, Math.round(Number(weightLbs) || 0));
        const goal = normalizeGoal(goalRaw);

        const b = baselineMacros || {};
        const baselineCalories = Math.max(0, Math.round(Number(b.calories) || 0));
        const baselineProtein = Math.max(0, Math.round(Number(b.proteinG) || 0));
        const baselineCarbs = Math.max(0, Math.round(Number(b.carbG) || 0));
        const baselineFat = Math.max(0, Math.round(Number(b.fatG) || 0));

        // 1) Calorie bounds: compression only (never increase calories, never drastically undercut baseline).
        const calUpper = baselineCalories || 0;
        const calLower = Math.max(
            Math.round((baselineCalories || 0) * 0.9),
            Math.round(bw * 9),
            1200
        );

        // 2) Protein min: baseline-anchored + goal/bodyweight floor.
        const lbm = goal === 'CUT' ? leanBodyMass(bw, sex, goal) : null;
        const proteinFloorFromGoal = goal === 'CUT'
            ? Math.round((lbm || bw) * 0.9)
            : Math.round(bw * 0.8);
        const proteinMin = Math.max(Math.round(baselineProtein * 0.85), proteinFloorFromGoal);
        const proteinG = Math.round(clamp(proteinMin, 90, 260));

        // 3) Fat min: hard floor (not a compression lever).
        const fatMin = Math.max(Math.round(bw * 0.25), 18);
        let fatG = fatMin;

        // 4) Carbs min: keep training-viable baseline-relative floor (compression lever above this).
        const carbMin = Math.round(bw * 0.5);

        // Start with the lowest calorie target within the allowed range.
        // If bounds are inconsistent (baseline already below floor), we cap at baseline and warn.
        const targetCalories = calUpper >= calLower ? calLower : calUpper;
        if (calUpper && calUpper < calLower) {
            console.warn('[RECONFIGURE] Baseline calories below minimum floor; capping at baseline.', { calUpper, calLower });
        }

        // Ensure we can at least fit protein+fat+carbMin inside the calorie cap.
        const requiredForMins = proteinG * 4 + fatG * 9 + carbMin * 4;
        if (calUpper && requiredForMins > calUpper) {
            // Not enough room under the "never increase calories" rule; fit as many carbs as we can.
            const remaining = calUpper - (proteinG * 4 + fatG * 9);
            const carbsFit = Math.max(0, Math.floor(remaining / 4));
            const carbsG = carbsFit;
            const calories = proteinG * 4 + fatG * 9 + carbsG * 4;
            console.warn('[RECONFIGURE] Could not fit carb floor under baseline calorie cap; compressing carbs to fit.', {
                baseline: { calories: baselineCalories, proteinG: baselineProtein, carbG: baselineCarbs, fatG: baselineFat },
                target: { calUpper, calLower, requiredForMins },
                result: { calories, proteinG, carbG: carbsG, fatG }
            });
            return { goal, calories, proteinG, carbG: carbsG, fatG };
        }

        // Pick the lowest calories that still satisfies macro floors (and stays <= baseline).
        const finalTarget = Math.max(targetCalories, requiredForMins);
        const extraCarbs = Math.max(0, Math.ceil((finalTarget - requiredForMins) / 4));
        const carbsG = carbMin + extraCarbs;

        // Re-enforce fat floor last (by spec).
        fatG = Math.max(fatG, fatMin);
        const calories = proteinG * 4 + fatG * 9 + carbsG * 4;

        return { goal, calories, proteinG, carbG: carbsG, fatG };
    };

    const updateMacroNoteText = ({ macroTargets, dailyTotals, neededSupplements = null }) => {
        const noteEl = document.getElementById('macro-note-text') || document.querySelector('.macro-note p');
        const headlineEl = document.getElementById('macro-note-headline') || noteEl?.querySelector?.('strong');
        const dynamicEl = document.getElementById('macro-note-dynamic');
        if (!noteEl || !headlineEl || !dynamicEl || !macroTargets || !dailyTotals) return;

        // Ensure we have a stable spot for the reconfigure-mode note at the *bottom* of this paragraph,
        // not inside the dynamic macro-gap span (which is phrasing-only content).
        let reconfigNoteEl = document.getElementById('macro-reconfigure-note');
        if (!reconfigNoteEl) {
            reconfigNoteEl = document.createElement('span');
            reconfigNoteEl.id = 'macro-reconfigure-note';
            reconfigNoteEl.className = 'macro-reconfigure-note hidden';
            noteEl.appendChild(reconfigNoteEl);
        }

        const parts = [
            { key: 'protein_g', label: 'Protein', unit: 'g', target: Number(macroTargets.protein_g) || 0, actual: Number(dailyTotals.protein_g) || 0 },
            { key: 'calories', label: 'Calories', unit: 'kcal', target: Number(macroTargets.calories) || 0, actual: Number(dailyTotals.calories) || 0 },
            { key: 'carbs_g', label: 'Carbs', unit: 'g', target: Number(macroTargets.carbs_g) || 0, actual: Number(dailyTotals.carbs_g) || 0 },
            { key: 'fat_g', label: 'Fat', unit: 'g', target: Number(macroTargets.fat_g) || 0, actual: Number(dailyTotals.fat_g) || 0 }
        ].map(p => {
            const diff = p.actual - p.target;
            const pct = p.target > 0 ? (diff / p.target) * 100 : 0;
            return { ...p, diff, pct };
        });

        const deficits = parts
            .filter(p => p.target > 0 && p.actual < p.target)
            .sort((a, b) => (a.pct - b.pct)); // most negative first

        const formatDelta = (p) => {
            const delta = Math.abs(Math.round(p.target - p.actual));
            return p.unit === 'kcal' ? `${delta.toLocaleString()} kcal/day` : `${delta}g/day`;
        };
        const formatPctShort = (p) => {
            const shortPct = p.target > 0 ? ((p.target - p.actual) / p.target) * 100 : 0;
            return `${Math.round(shortPct)}%`;
        };

        let headlineText = `You're on track!`;
        let bodyHtml = `We aim for tight targets: <strong>Protein ±5%</strong> (most important for muscle), <strong>Calories ±10–15%</strong>, and <strong>Carbs/Fat ±10%</strong>.`;

        if (deficits.length) {
            const top = deficits.slice(0, 2).map(p => `<strong>${p.label}</strong> by <strong>${formatDelta(p)}</strong> (${formatPctShort(p)})`);
            headlineText = `Macro gap:`;
            bodyHtml = `You're currently under on ${top.join(' and ')}${deficits.length > 2 ? ' (plus others)' : ''}.`;
        }

        const supplementSet = neededSupplements instanceof Set ? neededSupplements : null;
        const supplementList = supplementSet ? Array.from(supplementSet) : [];
        const supplementLabels = {
            protein: 'Protein',
            carbs: 'Carbs',
            fat: 'Fat'
        };
        const supplementSentence = supplementList.length
            ? `Solution: check <strong>Optional supplements</strong> below to help cover your ${supplementList.map(k => supplementLabels[k] || k).join(' + ')} gap, or press <strong>Reconfigure plan</strong> to rebuild with updated targets.`
            : `Solution: if you want a tighter match, scroll to <strong>Optional supplements</strong> (they appear when you're meaningfully under a target), or press <strong>Reconfigure plan</strong> to rebuild the plan from your current inputs.`;

        headlineEl.textContent = headlineText;
        dynamicEl.innerHTML = `${bodyHtml} ${supplementSentence}`;

        if (reconfigureMinModeEnabled) {
            reconfigNoteEl.classList.remove('hidden');
            reconfigNoteEl.textContent = 'Reconfigure plan is now using the lowest safe macros to move you toward your goal. The first plan is ideally what you want; this mode lowers macros to keep your budget cheaper. You can still get results, but likely not as fast.';
        } else {
            reconfigNoteEl.classList.add('hidden');
            reconfigNoteEl.textContent = '';
        }
    };

    const updateMacrosBtn = document.getElementById('update-macros-btn');
    const maybePulseUpdateMacros = () => {
        if (!updateMacrosBtn) return;
        const flag = sessionStorage.getItem('ode_hint_update_macros') === '1';
        if (!flag) return;
        sessionStorage.removeItem('ode_hint_update_macros');
        updateMacrosBtn.classList.add('is-pulsing');
        window.setTimeout(() => updateMacrosBtn.classList.remove('is-pulsing'), 5200);

        // Lightweight note (only when needed).
        if (!updateMacrosBtn.dataset.hintAdded) {
            updateMacrosBtn.dataset.hintAdded = '1';
            const note = document.createElement('div');
            note.className = 'ns-muted tiny';
            note.style.marginTop = '6px';
            note.textContent = 'Tip: After adding your own foods, click â€œUpdate macros manuallyâ€ to rebuild your plan.';
            updateMacrosBtn.parentElement?.appendChild(note);
        }
    };

    maybePulseUpdateMacros();
    window.addEventListener('ode:custom-foods-updated', () => {
        sessionStorage.setItem('ode_hint_update_macros', '1');
        maybePulseUpdateMacros();
    });
    
    const customMacroBtnGlobal = document.getElementById('custom-macro-btn');
    if (customMacroBtnGlobal && customMacroBtnGlobal.dataset.wiredMacro !== '1') {
        customMacroBtnGlobal.dataset.wiredMacro = '1';
        customMacroBtnGlobal.addEventListener('click', handleCustomMacroPlanCtaClick);
    }
    
    console.group('%cÃ°Å¸Å½Â¯ GROCERY PLAN - Macro Targets', 'font-size: 12px; font-weight: bold; color: #22c55e');
    console.log('Source:', prefs?.macros ? 'User calculated macros' : 'Default fallback values');
    console.log(`Calories: ${macros.calories} kcal`);
    console.log(`Protein: ${macros.proteinG}g`);
    console.log(`Carbs: ${macros.carbG}g`);
    console.log(`Fat: ${macros.fatG}g`);
    console.groupEnd();
    
    const calEl = document.getElementById('p-cal');
    const proEl = document.getElementById('p-pro');
    const carEl = document.getElementById('p-car');
    const fatEl = document.getElementById('p-fat');
    const storeEl = document.getElementById('p-store');
    const budgetEl = document.getElementById('p-budget');
    
    const updateMacroDisplay = (scale = 1) => {
        if (!macros) return;
        const scaled = {
            calories: Math.round(macros.calories * scale),
            proteinG: Math.round(macros.proteinG * scale),
            carbG: Math.round(macros.carbG * scale),
            fatG: Math.round(macros.fatG * scale)
        };
        if (calEl) calEl.textContent = `${scaled.calories.toLocaleString()} kcal`;
        if (proEl) proEl.textContent = `${scaled.proteinG} g`;
        if (carEl) carEl.textContent = `${scaled.carbG} g`;
        if (fatEl) fatEl.textContent = `${scaled.fatG} g`;
    };
    updateMacroDisplay(1);
    
    // Populate store and budget in top summary
    if (storeEl && prefs?.store) {
        storeEl.textContent = prefs.store;
    }
    if (budgetEl && prefs?.budgetTotal) {
        budgetEl.textContent = formatCurrency(Number(prefs.budgetTotal));
    }

    const redoBtn = document.getElementById('redo-plan-btn');
    redoBtn?.addEventListener('click', () => {
        const ok = window.confirm('Redo meal plan? Current plan data will be lost.');
        if (!ok) return;
        sessionStorage.removeItem('grocerySession');
        sessionStorage.removeItem('groceryPrefs');
        sessionStorage.removeItem('groceryPurchaseOverrides');
        sessionStorage.removeItem('groceryExpiredOverrides');
        sessionStorage.removeItem('groceryStartDate');
        window.location.href = 'overview.html';
    });

    const storePill = document.getElementById('store-pill');
    if (storePill && prefs?.store) {
        storePill.textContent = prefs.store;
    }

    const mealsPerDay = Math.max(2, Math.min(6, Number(prefs?.mealsPerDay || 4)));
    const mealGrid = document.getElementById('meal-grid');

    const latest = await fetchWalmartLatest();
    
    // Check if adjusted baseline foods are available from form submission
    let adjustedBaselineFoods = null;
    try {
        const stored = sessionStorage.getItem('adjustedBaselineFoods');
        adjustedBaselineFoods = stored ? JSON.parse(stored) : null;
        console.log('Loaded adjustedBaselineFoods from sessionStorage:', adjustedBaselineFoods?.length ? adjustedBaselineFoods.map(f => f.name) : 'none');
        
        // Ensure images, urls, and container prices are always present from fresh baseline (handles cached data)
        if (adjustedBaselineFoods && Array.isArray(adjustedBaselineFoods)) {
            adjustedBaselineFoods = adjustedBaselineFoods.map(food => {
                const fresh = WALMART_BASELINE_FOODS.find(f => f.id === food.id);
                return {
                    ...food,
                    image: fresh?.image || food.image || '',
                    url: fresh?.url || food.url || '',
                    container: fresh?.container || food.container
                };
            });
        }
    } catch (err) {
        adjustedBaselineFoods = null;
        console.error('Error parsing adjustedBaselineFoods:', err);
    }
    
    // If we have adjusted baseline foods, use them directly
    if (adjustedBaselineFoods && Array.isArray(adjustedBaselineFoods) && adjustedBaselineFoods.length > 0) {
        console.log('Using baseline foods:', adjustedBaselineFoods.map(f => f.name));
        
        // Get bodyweight from prefs
        const bodyweightLbs = prefs?.weightLbs || 170;

        // ============================================================
        // BASELINE PLAN (FREE): Use the unified optimizer (no overshoot, <=15% undershoot).
        // Do not use the legacy deterministic meal builder.
        // ============================================================
        const baselineServingGramsById = {
            ground_beef_80_20: 113.4, // 4oz
            chicken_breast: 113.4,
            tilapia_fillet: 113.4,
            ground_turkey_93_7: 113.4,
            eggs_large: 50,
            white_rice_dry: 45, // 1/4 cup dry
            instant_oats: 40,   // 1/2 cup
            russet_potatoes: 200,
            olive_oil: 13.5, // 1 tbsp
            chocolate_milk_lowfat: 240
        };

        const toPlannerType = (food) => {
            const cat = String(food?.category || '').toLowerCase();
            if (cat.includes('carb')) return 'carb';
            if (cat.includes('fat')) return 'fat';
            if (cat.includes('protein')) return 'protein';
            return 'other';
        };

        const baselineQualityScore = (food) => {
            const name = String(food?.name || '').toLowerCase();
            if (name.includes('chocolate milk')) return 1.5;
            if (name.includes('olive oil')) return 2.2;
            if (name.includes('rice')) return 2.4;
            if (name.includes('oats')) return 3.2;
            if (name.includes('potato')) return 3.2;
            if (name.includes('egg')) return 3.6;
            if (name.includes('tilapia') || name.includes('salmon') || name.includes('fish')) return 3.6;
            if (name.includes('chicken')) return 3.7;
            if (name.includes('turkey')) return 3.2;
            if (name.includes('beef')) return 3.0;
            return 2.8;
        };

        const buildBaselinePlannerFoods = () => adjustedBaselineFoods.map(food => {
            const type = toPlannerType(food);
            const servingGrams = Number(baselineServingGramsById[food.id]) || null;
            const servingsPerContainer = servingsPerContainerFromFood(food);
            const pricePerServing = (Number.isFinite(food?.container?.price) && Number.isFinite(servingsPerContainer) && servingsPerContainer > 0)
                ? food.container.price / servingsPerContainer
                : null;

            return {
                ...food,
                type,
                qualityScore: baselineQualityScore(food),
                servingGrams,
                pricePerServing,
                macros: {
                    calories: Number(food?.macros?.calories) || 0,
                    protein_g: Number(food?.macros?.protein) || 0,
                    carbs_g: Number(food?.macros?.carbs) || 0,
                    fat_g: Number(food?.macros?.fat) || 0
                }
            };
        });

        const baselineCheaperBtn = document.getElementById('make-cheaper-btn');
        const baselineCustomFoodsBtn = document.getElementById('custom-foods-btn');
        const baselineUndoBtn = document.getElementById('undo-btn');
        const baselinePlanCtaClose = document.getElementById('plan-cta-close');
        const accountLink = document.getElementById('account-link');

        const discipline = inferDiscipline(nutritionState.selections || {});
        const goal = normalizeGoal(nutritionState.selections?.goal || prefs?.mode || 'RECOMP');

        const macroTargetsBase = {
            calories: macros.calories || 2000,
            protein_g: macros.proteinG || 150,
            carbs_g: macros.carbG || 200,
            fat_g: macros.fatG || 65
        };

        let portionScale = 1;
        const initialMacroTargetsBaseSnapshot = { ...macroTargetsBase };
        const syncMacrosFromMacroTargetsBase = () => {
            macros.calories = macroTargetsBase.calories;
            macros.proteinG = macroTargetsBase.protein_g;
            macros.carbG = macroTargetsBase.carbs_g;
            macros.fatG = macroTargetsBase.fat_g;
        };
        const persistCurrentMacrosToPrefs = () => {
            prefs = prefs && typeof prefs === 'object' ? prefs : {};
            prefs.macros = {
                calories: macros.calories,
                proteinG: macros.proteinG,
                carbG: macros.carbG,
                fatG: macros.fatG
            };
            try {
                sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs));
            } catch {
                // ignore
            }
        };

        const customMacroBtn = document.getElementById('custom-macro-btn');
        const reconfigureBtn = document.getElementById('reconfigure-btn');
        if (customMacroBtn && customMacroBtn.dataset.wiredMacro !== '1') {
            customMacroBtn.dataset.wiredMacro = '1';
            customMacroBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openCustomMacroModal({
                    macros: {
                        calories: macroTargetsBase.calories,
                        proteinG: macroTargetsBase.protein_g,
                        carbG: macroTargetsBase.carbs_g,
                        fatG: macroTargetsBase.fat_g
                    },
                    onSave: (next) => {
                        macroTargetsBase.calories = next.calories;
                        macroTargetsBase.protein_g = next.proteinG;
                        macroTargetsBase.carbs_g = next.carbG;
                        macroTargetsBase.fat_g = next.fatG;

                        portionScale = 1;
                        syncMacrosFromMacroTargetsBase();
                        persistCurrentMacrosToPrefs();
                        updateMacroDisplay(1);
                        renderBaselinePlan();
                    }
                });
            });
        }

        if (reconfigureBtn && reconfigureBtn.dataset.wiredReconfig !== '1') {
            reconfigureBtn.dataset.wiredReconfig = '1';
            reconfigureBtn.addEventListener('click', (e) => {
                e.preventDefault();

                // Toggle: pressing again restores the original plan behavior.
                if (reconfigureMinModeEnabled) {
                    reconfigureMinModeEnabled = false;
                    const snap = reconfigureBaselineSnapshot || {
                        calories: initialMacroTargetsBaseSnapshot.calories,
                        protein_g: initialMacroTargetsBaseSnapshot.protein_g,
                        carbs_g: initialMacroTargetsBaseSnapshot.carbs_g,
                        fat_g: initialMacroTargetsBaseSnapshot.fat_g
                    };
                    macroTargetsBase.calories = snap.calories;
                    macroTargetsBase.protein_g = snap.protein_g;
                    macroTargetsBase.carbs_g = snap.carbs_g;
                    macroTargetsBase.fat_g = snap.fat_g;

                    reconfigureBaselineSnapshot = null;
                    try {
                        if (reconfigurePrefsJsonSnapshot === null) sessionStorage.removeItem('groceryPrefs');
                        else if (typeof reconfigurePrefsJsonSnapshot === 'string') sessionStorage.setItem('groceryPrefs', reconfigurePrefsJsonSnapshot);
                    } catch {
                        // ignore
                    }
                    reconfigurePrefsJsonSnapshot = null;

                    portionScale = 1;
                    syncMacrosFromMacroTargetsBase();
                    updateMacroDisplay(1);
                    renderBaselinePlan();
                    return;
                }

                reconfigureMinModeEnabled = true;
                reconfigureBaselineSnapshot = { ...macroTargetsBase };
                try {
                    reconfigurePrefsJsonSnapshot = sessionStorage.getItem('groceryPrefs');
                } catch {
                    reconfigurePrefsJsonSnapshot = null;
                }
                const next = deriveMinimumViableMacrosForReconfigureMode({
                    baselineMacros: {
                        calories: macroTargetsBase.calories,
                        proteinG: macroTargetsBase.protein_g,
                        carbG: macroTargetsBase.carbs_g,
                        fatG: macroTargetsBase.fat_g
                    },
                    goalRaw: nutritionState.selections?.goal || prefs?.mode || 'RECOMP',
                    weightLbs: prefs?.weightLbs || nutritionState.selections?.weightLbs || 170,
                    sex: nutritionState.selections?.sex || prefs?.sex || null
                });

                macroTargetsBase.calories = next.calories;
                macroTargetsBase.protein_g = next.proteinG;
                macroTargetsBase.carbs_g = next.carbG;
                macroTargetsBase.fat_g = next.fatG;

                portionScale = 1;
                syncMacrosFromMacroTargetsBase();
                updateMacroDisplay(1);
                renderBaselinePlan();
                console.log('[RECONFIGURE]', { calories: next.calories, protein: next.proteinG, carbs: next.carbG, fat: next.fatG });
            });
        }

        const renderBaselinePlan = () => {
            const macroTargets = { ...macroTargetsBase };
            const plannerTargets = scaledTargetsForPlanner(macroTargets, portionScale);

            const plannerFoods = buildBaselinePlannerFoods();
            const plan = buildAllMeals(plannerFoods, plannerTargets, mealsPerDay, goal, bodyweightLbs, discipline);
            const builtMeals = plan?.meals || [];
            const dailyTotals = plan?.dailyTotals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

            if (!builtMeals.length) {
                if (mealGrid) {
                    mealGrid.innerHTML = `
                        <div class="upgrade-message">
                            <h4>Ã¢Å¡Â Ã¯Â¸Â Cannot Generate Plan</h4>
                            <p>With the foods included in the free plan, we cannot fully match your macros.</p>
                        </div>
                    `;
                }
                if (listEl) listEl.innerHTML = '';
                return;
            }

            saveMealPlanSnapshotForLogging({ meals: builtMeals, mealsPerDay, macroTargets });

            // Render meals
            if (mealGrid) {
                const mealsHTML = builtMeals.map((meal, idx) => {
                    const itemList = (meal.foods || []).map(item => `
                        <div class="meal-item">
                            <span class="meal-item-name">&#8226; ${item.foodName}</span>
                            <span class="meal-item-macros">${item.protein_g}g P | ${item.carbs_g}g C | ${item.fat_g}g F</span>
                            <span class="meal-item-measurement">${item.measurementText || `${item.servings} servings`}</span>
                        </div>
                    `).join('');

                    return `
                        <div class="meal-block">
                            <div class="meal-title">Meal ${idx + 1}</div>
                            <div class="meal-items">
                                ${itemList}
                            </div>
                            <div class="meal-summary">
                                ${meal.totals.calories} kcal | ${meal.totals.protein_g}g P | ${meal.totals.carbs_g}g C | ${meal.totals.fat_g}g F
                            </div>
                        </div>
                    `;
                }).join('');

                mealGrid.innerHTML = `
                    <div class="meal-blocks">
                        ${mealsHTML}
                        <div class="meal-daily-total">
                            <div class="daily-total-label">Daily Total</div>
                            <div class="daily-total-value">${dailyTotals.calories} kcal | ${dailyTotals.protein_g}g P | ${dailyTotals.carbs_g}g C | ${dailyTotals.fat_g}g F</div>
                        </div>
                    </div>
                `;
            }

            // Macro summary row (targets vs actuals)
            const targetCalEl = document.getElementById('target-cal');
            const targetProEl = document.getElementById('target-pro');
            const targetCarbEl = document.getElementById('target-carb');
            const targetFatEl = document.getElementById('target-fat');
            const actualCalEl = document.getElementById('actual-cal');
            const actualProEl = document.getElementById('actual-pro');
            const actualCarbEl = document.getElementById('actual-carb');
            const actualFatEl = document.getElementById('actual-fat');
            if (targetCalEl) targetCalEl.textContent = `${macroTargets.calories}`;
            if (targetProEl) targetProEl.textContent = `${macroTargets.protein_g}g`;
            if (targetCarbEl) targetCarbEl.textContent = `${macroTargets.carbs_g}g`;
            if (targetFatEl) targetFatEl.textContent = `${macroTargets.fat_g}g`;
            if (actualCalEl) actualCalEl.textContent = `${dailyTotals.calories}`;
            if (actualProEl) actualProEl.textContent = `${dailyTotals.protein_g}g`;
            if (actualCarbEl) actualCarbEl.textContent = `${dailyTotals.carbs_g}g`;
            if (actualFatEl) actualFatEl.textContent = `${dailyTotals.fat_g}g`;

            // Bottom-row highlights (macro-actual): green <=15%, yellow 15-20%, red >20% off target.
            const applyActualHighlight = (targetEl, actualEl) => {
                if (!targetEl || !actualEl) return;
                const t = Number(String(targetEl.textContent || '').replace(/[^\d.]/g, '')) || 0;
                const a = Number(String(actualEl.textContent || '').replace(/[^\d.]/g, '')) || 0;
                const pct = t > 0 ? (Math.abs(a - t) / t) * 100 : 0;

                actualEl.classList.remove('on-target', 'caution', 'off-target');
                if (t <= 0) return;
                if (pct <= 15) actualEl.classList.add('on-target');
                else if (pct <= 20) actualEl.classList.add('caution');
                else actualEl.classList.add('off-target');
            };

            applyActualHighlight(targetCalEl, actualCalEl);
            applyActualHighlight(targetProEl, actualProEl);
            applyActualHighlight(targetCarbEl, actualCarbEl);
            applyActualHighlight(targetFatEl, actualFatEl);

            const macroPill = document.getElementById('macro-accuracy-pill');
            if (macroPill) {
                const pctOff = (target, actual) => target ? Math.abs((actual - target) / target) * 100 : 0;
                const proPct = pctOff(macroTargets.protein_g, dailyTotals.protein_g);
                const calPct = pctOff(macroTargets.calories, dailyTotals.calories);
                if (proPct <= 5 && calPct <= 15) {
                    macroPill.textContent = 'On target';
                    macroPill.classList.remove('over', 'caution');
                } else {
                    macroPill.textContent = proPct > 5 ? `Protein ${proPct.toFixed(0)}% off` : `Calories ${calPct.toFixed(0)}% off`;
                    macroPill.classList.remove('over', 'caution');
                    macroPill.classList.add(proPct > 5 ? 'over' : 'caution');
                }
            }

            const neededSupplementsForNote = recommendedSupplementsForTotals({ macroTargets, dailyTotals });
            updateMacroNoteText({ macroTargets, dailyTotals, neededSupplements: neededSupplementsForNote });

            // Macro warnings + supplement suggestions when >=15% short.
            const macroWarningsEl = document.getElementById('macro-warnings');
            if (macroWarningsEl) {
                const entries = [`<div class="macro-warning info">${LONG_TERM_NOTE}</div>`];
                [
                    { key: 'protein_g', label: 'Protein', supplement: 'protein' },
                    { key: 'carbs_g', label: 'Carbs', supplement: 'carbs' },
                    { key: 'fat_g', label: 'Fat', supplement: 'fat' }
                ].forEach(({ key, label, supplement }) => {
                    const target = macroTargets[key];
                    const actual = dailyTotals[key];
                    if (!target) return;
                    const pctShort = Math.max(0, (target - actual) / target);
                    if (pctShort >= MAX_MACRO_UNDERSHOOT) {
                        // Escalate to "recommended" if we're beyond the undershoot threshold.
                        if (supplement === 'protein' || supplement === 'carbs') neededSupplementsForNote.add(supplement);
                        const suggestion = SUPPLEMENT_MAP[supplement] ? ` Supplement suggestion: ${SUPPLEMENT_MAP[supplement]}.` : '';
                        entries.push(`<div class="macro-warning warning">${label} is ${(pctShort * 100).toFixed(0)}% under the target.${suggestion} This is good enough given your constraints.</div>`);
                    }
                });
                macroWarningsEl.innerHTML = entries.join('');
                macroWarningsEl.classList.toggle('hidden', entries.length === 0);

                // Supplement buy section: only show for configured items (protein/carbs) when a warning exists.
                const supplementSection = document.getElementById('supplement-shop');
                const supplementGrid = document.getElementById('supplement-shop-grid');
                if (supplementSection && supplementGrid) {
                    const supplementPills = document.getElementById('supplement-shop-pills');

                    const linkIcon = (url, title) => `
                        <a href="${url}" target="_blank" rel="noopener" class="grocery-card-link" title="${title}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                        </a>
                    `;

                    const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
                    const deficit = (key) => Math.max(0, num(macroTargets[key]) - num(dailyTotals[key]));
                    const pctShort = (key) => {
                        const t = num(macroTargets[key]);
                        if (t <= 0) return 0;
                        return (deficit(key) / t) * 100;
                    };

                    const formatSmall = (v, digits = 2) => {
                        const n = Number(v);
                        if (!Number.isFinite(n)) return '0';
                        const s = n.toFixed(digits);
                        return s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
                    };

                    const servingsPerDayForMacro = (gapG, perServingG) => {
                        const g = Number(gapG);
                        const per = Number(perServingG);
                        if (!Number.isFinite(g) || g <= 0) return 0;
                        if (!Number.isFinite(per) || per <= 0) return 0;
                        return g / per;
                    };

                    const daysLasts = (servingsPerContainer, servingsPerDay) => {
                        const spc = Number(servingsPerContainer);
                        const spd = Number(servingsPerDay);
                        if (!Number.isFinite(spc) || spc <= 0) return null;
                        if (!Number.isFinite(spd) || spd <= 0) return null;
                        return spc / spd;
                    };

                    const gramsToOz = (g) => (Number(g) / 28.349523125);

                    const initCarousels = (root) => {
                        const base = root || document;
                        base.querySelectorAll('.image-carousel').forEach(carousel => {
                            if (carousel.dataset.carouselInit === '1') return;
                            const track = carousel.querySelector('.carousel-track');
                            const dots = carousel.querySelectorAll('.dot');
                            const prevBtn = carousel.querySelector('.carousel-prev');
                            const nextBtn = carousel.querySelector('.carousel-next');
                            if (!track || !dots.length || !prevBtn || !nextBtn) return;

                            carousel.dataset.carouselInit = '1';
                            let currentIndex = 0;
                            const totalSlides = dots.length;

                            const goToSlide = (index) => {
                                let i = index;
                                if (i < 0) i = totalSlides - 1;
                                if (i >= totalSlides) i = 0;
                                currentIndex = i;
                                track.style.transform = `translateX(-${currentIndex * (100 / totalSlides)}%)`;
                                dots.forEach((dot, di) => dot.classList.toggle('active', di === currentIndex));
                            };

                            prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
                            nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));
                            dots.forEach((dot, di) => dot.addEventListener('click', () => goToSlide(di)));
                        });
                    };

                    const cards = [];
                    const pillBits = [];

                    if (neededSupplementsForNote.has('carbs')) {
                        const gap = deficit('carbs_g');
                        const pct = pctShort('carbs_g');
                        const servingsPerContainer = 9;
                        const perServingCarbs = 277;
                        const spd = servingsPerDayForMacro(gap, perServingCarbs);
                        const lasts = daysLasts(servingsPerContainer, spd);
                        const url = 'https://www.gnc.com/mass-gainers/414778.html';
                        const perServingGrams = (7 * 453.59237) / servingsPerContainer; // 7lb bag / 9 servings
                        const perDayGrams = spd > 0 ? spd * perServingGrams : 0;
                        const perDayOz = gramsToOz(perDayGrams);

                        pillBits.push({ type: 'strong', text: `Carbs -${Math.round(pct)}%` });
                        pillBits.push({ type: 'soft', text: `Gap ${Math.round(gap)}g/day` });

                        cards.push(`
                            <div class="essential-card supplement-card">
                                <div class="essential-image has-carousel">
                                    <div class="image-carousel">
                                        <div class="carousel-track">
                                            <img src="https://www.gnc.com/dw/image/v2/BBLB_PRD/on/demandware.static/-/Sites-master-catalog-gnc/default/dw8dc4f743/hi-res/414778_GNC_Pro_Performance_Bulk_1340_Double_Chocolate_9svgs_Bag_Front.jpg?sw=480&sh=480&sm=fit" alt="Carb powder - front">
                                            <img src="https://www.gnc.com/dw/image/v2/BBLB_PRD/on/demandware.static/-/Sites-master-catalog-gnc/default/dw2f2c285d/hi-res/Pro_Perf_Bulk1340/03_MuscleGrowth_Recovery.jpg?sw=1500&sh=1500&sm=fit" alt="Carb powder - info 1">
                                            <img src="https://www.gnc.com/dw/image/v2/BBLB_PRD/on/demandware.static/-/Sites-master-catalog-gnc/default/dwf9b8d359/hi-res/Pro_Perf_Bulk1340/05_AminoMax_ATP_Complex.jpg?sw=1500&sh=1500&sm=fit" alt="Carb powder - info 2">
                                        </div>
                                        ${linkIcon(url, 'View on GNC')}
                                        <button class="carousel-btn carousel-prev" aria-label="Previous image">&lsaquo;</button>
                                        <button class="carousel-btn carousel-next" aria-label="Next image">&rsaquo;</button>
                                        <div class="carousel-dots">
                                            <span class="dot active"></span>
                                            <span class="dot"></span>
                                            <span class="dot"></span>
                                        </div>
                                    </div>
                                </div>
                                <div class="essential-body">
                                    <h4>Bulk 1340 - Double Chocolate</h4>
                                    <p class="essential-desc">High-carb gainer to help close a <strong>carb deficit</strong> when food volume/budget makes it hard. Your gap: <span class="cta-highlight">${Math.round(gap)}g carbs/day</span> &middot; Take <span class="cta-highlight">${formatSmall(spd)} servings/day</span> (~<span class="cta-highlight">${formatSmall(perDayGrams, 0)}g</span> / <span class="cta-highlight">${formatSmall(perDayOz, 1)} oz</span> powder/day) &middot; Lasts <span class="cta-highlight">~${lasts ? Math.round(lasts) : 'N/A'} days</span>.</p>
                                    <p class="supplement-footnote">Mix with water to avoid extra calories from milk/juice.</p>
                                    <div class="supplement-buy-row">
                                        <div class="essential-meta">
                                            <span class="essential-price">$54.99</span>
                                            <span class="essential-shipping">${servingsPerContainer} official servings</span>
                                        </div>
                                        <a href="${url}" target="_blank" rel="noopener" class="btn btn-primary essential-cta">Purchase</a>
                                    </div>
                                </div>
                            </div>
                        `);
                    }

                    if (neededSupplementsForNote.has('protein')) {
                        const gap = deficit('protein_g');
                        const pct = pctShort('protein_g');
                        const servingsPerContainer = 29;
                        const servingSizeG = 41;
                        const perServingProtein = 30;
                        const spd = servingsPerDayForMacro(gap, perServingProtein);
                        const gramsPerDay = spd > 0 ? spd * servingSizeG : 0;
                        const ozPerDay = gramsToOz(gramsPerDay);
                        const lasts = daysLasts(servingsPerContainer, spd);
                        const url = 'https://www.gnc.com/bogo-dec25-5/364769.html';

                        pillBits.push({ type: 'strong', text: `Protein -${Math.round(pct)}%` });
                        pillBits.push({ type: 'soft', text: `Gap ${Math.round(gap)}g/day` });

                        cards.push(`
                            <div class="essential-card supplement-card">
                                <div class="essential-image has-carousel">
                                    <div class="image-carousel">
                                        <div class="carousel-track">
                                            <img src="https://www.gnc.com/dw/image/v2/BBLB_PRD/on/demandware.static/-/Sites-master-catalog-gnc/default/dw3cbac7ce/hi-res/364769_PremierProtein_29s_Tub_Chocolate_Front.jpg?sw=480&sh=480&sm=fit" alt="Protein powder - front">
                                            <img src="https://www.gnc.com/dw/image/v2/BBLB_PRD/on/demandware.static/-/Sites-master-catalog-gnc/default/dw376731bb/hi-res/364769_PremierProtein_29s_Tub_Chocolate_Back.jpg?sw=480&sh=480&sm=fit" alt="Protein powder - back">
                                            <img src="https://www.gnc.com/dw/image/v2/BBLB_PRD/on/demandware.static/-/Sites-master-catalog-gnc/default/dwbd028653/hi-res/364769_PremierProtein_29s_Tub_Chocolate_Side.jpg?sw=480&sh=480&sm=fit" alt="Protein powder - side">
                                        </div>
                                        ${linkIcon(url, 'View on GNC')}
                                        <button class="carousel-btn carousel-prev" aria-label="Previous image">&lsaquo;</button>
                                        <button class="carousel-btn carousel-next" aria-label="Next image">&rsaquo;</button>
                                        <div class="carousel-dots">
                                            <span class="dot active"></span>
                                            <span class="dot"></span>
                                            <span class="dot"></span>
                                        </div>
                                    </div>
                                </div>
                                <div class="essential-body">
                                    <h4>Whey Protein Powder</h4>
                                    <p class="essential-desc">Simple <strong>protein gap</strong> filler (does not replace whole-food meals). Your gap: <span class="cta-highlight">${Math.round(gap)}g protein/day</span> &middot; Take <span class="cta-highlight">${formatSmall(spd)} servings/day</span> (~<span class="cta-highlight">${formatSmall(gramsPerDay, 0)}g</span> / <span class="cta-highlight">${formatSmall(ozPerDay, 1)} oz</span> powder/day) &middot; Lasts <span class="cta-highlight">~${lasts ? Math.round(lasts) : 'N/A'} days</span>.</p>
                                    <p class="supplement-footnote">Mix with water to avoid extra calories from milk/juice.</p>
                                    <div class="supplement-buy-row">
                                        <div class="essential-meta">
                                            <span class="essential-price">$52.99</span>
                                            <span class="essential-shipping">${servingsPerContainer} official servings</span>
                                        </div>
                                        <a href="${url}" target="_blank" rel="noopener" class="btn btn-primary essential-cta">Purchase</a>
                                    </div>
                                </div>
                            </div>
                        `);
                    }

                    supplementGrid.innerHTML = cards.join('');
                    supplementSection.classList.toggle('hidden', cards.length === 0);
                    if (cards.length) initCarousels(supplementSection);

                    // Pills to the right of the section title (only when the section is visible).
                    if (supplementPills) {
                        supplementPills.innerHTML = '<span class="pill">Optional</span>';
                        if (cards.length) {
                            supplementPills.insertAdjacentHTML('beforeend', '<span class="pill pill-soft info">Only shows if under target</span>');
                            pillBits.forEach(p => {
                                const cls = p.type === 'strong' ? 'pill pill-soft strong' : 'pill pill-soft';
                                supplementPills.insertAdjacentHTML('beforeend', `<span class="${cls}">${p.text}</span>`);
                            });
                        }
                    }
                }
            }

            // Grocery list + inventory costs
            const dailyServingsById = {};
            builtMeals.forEach(meal => {
                (meal.foods || []).forEach(item => {
                    const id = item.foodId;
                    const servings = Number(item.servings) || 0;
                    if (!id || servings <= 0) return;
                    dailyServingsById[id] = (dailyServingsById[id] || 0) + servings;
                });
            });

            const priceAdjustment = getPriceAdjustment();
            const groceryItems = plannerFoods
                .filter(f => (Number(dailyServingsById[f.id]) || 0) > 0)
                .map(food => {
                    const dailyServings = Number(dailyServingsById[food.id]) || 0;
                    const servingsPerContainer = servingsPerContainerFromFood(food) || 1;
                    const basePrice = Number(food.container?.price) || 0;
                    const adjustedPrice = applyPriceAdjustment(basePrice, priceAdjustment);
                    return {
                        ...food,
                        daily: dailyServings,
                        weekly: dailyServings * 7,
                        monthly: dailyServings * 30,
                        servingsPerContainer,
                        container: { ...(food.container || {}), price: adjustedPrice }
                    };
                });

            const inventoryCosts = calculateInventoryCosts(groceryItems, new Date());
            const itemsWithDuration = inventoryCosts.itemBreakdown || [];

            // Overview summary: monthly snapshot
            // Keep weekly/monthly internally consistent: monthly is a 30-day normalized estimate.
            const avgWeeklyCost = (inventoryCosts.avgMonthlyCost * 7) / 30;
            const monthDaysEl = document.getElementById('overview-month-days');
            const monthProjectedEl = document.getElementById('overview-month-projected');
            if (monthDaysEl) monthDaysEl.textContent = `${inventoryCosts.daysRemainingInMonth} days remaining`;
            if (monthProjectedEl) monthProjectedEl.textContent = `$${inventoryCosts.thisMonthCost.toFixed(2)}`;

            // Plan page header: avg weekly/monthly totals.
            const weeklyCostEl = document.getElementById('p-weekly-cost');
            const monthlyCostEl = document.getElementById('p-monthly-cost');
            if (weeklyCostEl) weeklyCostEl.textContent = Number.isFinite(avgWeeklyCost) ? formatCurrency(avgWeeklyCost) : EM_DASH;
            if (monthlyCostEl) monthlyCostEl.textContent = Number.isFinite(inventoryCosts.avgMonthlyCost) ? formatCurrency(inventoryCosts.avgMonthlyCost) : EM_DASH;

            // Budget breakdown
            const budget = Number(prefs?.budgetTotal || 0);
            const taxRate = 0.08;
            const estimatedTax = inventoryCosts.avgMonthlyCost * taxRate;
            const monthlyTotalWithTax = inventoryCosts.avgMonthlyCost + estimatedTax;
            const budgetDelta = budget ? budget - monthlyTotalWithTax : null;

            const budgetAllocEl = document.getElementById('budget-allocated');
            const budgetEstEl = document.getElementById('budget-estimated');
            const budgetTaxesEl = document.getElementById('budget-taxes');
            const budgetTotalEl = document.getElementById('budget-total');
            const budgetStatusEl = document.getElementById('budget-status');

            if (budgetAllocEl) budgetAllocEl.textContent = budget ? formatCurrency(budget) : EM_DASH;
            if (budgetEstEl) budgetEstEl.textContent = formatCurrency(inventoryCosts.avgMonthlyCost);
            if (budgetTaxesEl) budgetTaxesEl.textContent = formatCurrency(estimatedTax);
            if (budgetTotalEl) budgetTotalEl.textContent = formatCurrency(monthlyTotalWithTax);
            if (budgetStatusEl) {
                const statusBadge = budgetStatusEl.querySelector('.status-badge');
                if (statusBadge) {
                    if (budgetDelta === null || !Number.isFinite(budgetDelta)) {
                        statusBadge.textContent = 'Set a budget to compare';
                    } else if (budgetDelta >= 0) {
                        statusBadge.textContent = `Under budget by ${formatCurrency(budgetDelta)}`;
                    } else {
                        statusBadge.textContent = `Over budget by ${formatCurrency(Math.abs(budgetDelta))}`;
                    }
                }
            }

            // Tracking: capture what the guest actually got (macros + costs + budget delta).
            try {
                const key = JSON.stringify({
                    avgMonthlyCost: Number(inventoryCosts.avgMonthlyCost || 0).toFixed(2),
                    priceAdjustment,
                    portionScale,
                    budget: Number(budget || 0),
                    macros
                });
                if (window.__ode_last_grocery_track_key !== key) {
                    window.__ode_last_grocery_track_key = key;
                    postTrackEvent('grocery_plan_built', {
                        macros,
                        priceAdjustment,
                        portionScale,
                        avgWeeklyCost: Number(avgWeeklyCost || 0),
                        avgMonthlyCost: Number(inventoryCosts.avgMonthlyCost || 0),
                        estimatedTax: Number(estimatedTax || 0),
                        monthlyTotalWithTax: Number(monthlyTotalWithTax || 0),
                        budgetTotal: Number(budget || 0) || null,
                        budgetDelta: budgetDelta === null || !Number.isFinite(budgetDelta) ? null : Number(budgetDelta),
                        daysRemainingInMonth: inventoryCosts.daysRemainingInMonth
                    });
                }
            } catch {
                // ignore
            }

            // Render grocery cards (keep existing style)
            const saveItems = itemsWithDuration.map((item) => {
                const purchasesThisMonth = Number(item.purchasesThisMonth) || 0;
                const qty = purchasesThisMonth > 0 ? `${purchasesThisMonth} container${purchasesThisMonth === 1 ? '' : 's'}` : '';
                const cat = String(item.category || item.type || '').toLowerCase();
                const category =
                    cat.includes('protein') ? 'Protein' :
                        cat.includes('carb') ? 'Carb' :
                            cat.includes('fat') ? 'Fat' :
                                cat.includes('produce') ? 'Produce' : 'Misc';
                return {
                    name: item.name,
                    quantity: qty,
                    category,
                    estimatedCost: Number.isFinite(Number(item.thisMonthCost)) ? Number(item.thisMonthCost) : null,
                    image: item.image || null,
                    url: item.url || null,
                    daily: Number.isFinite(Number(item.daily)) ? Number(item.daily) : null,
                    daysPerContainer: Number.isFinite(Number(item.daysPerContainer)) ? Number(item.daysPerContainer) : null,
                    containerPrice: Number.isFinite(Number(item.container?.price)) ? Number(item.container.price) : null,
                    unit: 'servings'
                };
            });

            const groceryListHTML = `
                <div class="grocery-items-grid">
                    ${itemsWithDuration.map(item => {
                        const daysLasts = item.daysPerContainer;
                        const daysLabel = daysLasts === Infinity ? 'N/A' :
                            daysLasts >= 30 ? `${Math.round(daysLasts)} days (1+ month)` :
                                `${Math.round(daysLasts)} days`;
                        const unit = 'servings';
                        return `
                            <div class="grocery-card" data-query="${normalizeKey(item.name)}">
                                <div class="grocery-card-image">
                                    <img src="${item.image || ''}" alt="${item.name}" onerror="this.style.display='none'; this.parentElement.classList.add('no-image');">
                                    <a href="${item.url}" target="_blank" class="grocery-card-link" title="View on Walmart">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    </a>
                                </div>
                                <div class="grocery-card-body">
                                    <h4 class="grocery-card-title">${item.name}</h4>
                                    <div class="grocery-card-duration">
                                        <span class="duration-icon">&#x23F1;</span>
                                        <span class="duration-text">Container lasts <strong>${daysLabel}</strong></span>
                                    </div>
                                    <div class="grocery-card-details">
                                        <div class="detail-row">
                                            <span class="detail-label">Daily use</span>
                                            <span class="detail-value">${(Number(item.daily) || 0).toFixed(2)} ${unit}</span>
                                        </div>
                                        <div class="detail-row">
                                            <span class="detail-label">Price</span>
                                            <span class="detail-value">$${(Number(item.container?.price) || 0).toFixed(2)}</span>
                                        </div>
                                        <div class="detail-row highlight">
                                            <span class="detail-label">Buys this month</span>
                                            <span class="detail-value">${item.purchasesThisMonth}&times;</span>
                                        </div>
                                    </div>
                                    <div class="grocery-card-footer">
                                        <span class="container-price">$${item.thisMonthCost.toFixed(2)} this month</span>
                                        <label class="grocery-check-modern">
                                            <input type="checkbox" class="grocery-check-input" data-query="${normalizeKey(item.name)}">
                                            <span class="checkmark"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            if (listEl) listEl.innerHTML = groceryListHTML;

            stageLatestGroceryListDraft({
                source: 'grocery_generator',
                items: saveItems,
                totals: {
                    totalEstimatedWeeklyCost: Number.isFinite(Number(avgWeeklyCost)) ? Number(avgWeeklyCost) : null,
                    totalEstimatedCost: Number.isFinite(Number(inventoryCosts?.thisMonthCost)) ? Number(inventoryCosts.thisMonthCost) : null,
                    currency: 'USD'
                },
                meta: {
                    generatedAt: new Date().toISOString(),
                    store: prefs?.store || null,
                    notes: 'baseline_plan',
                    macroTargets: {
                        calories: Number(macroTargetsBase.calories) || 0,
                        proteinG: Number(macroTargetsBase.protein_g) || 0,
                        carbG: Number(macroTargetsBase.carbs_g) || 0,
                        fatG: Number(macroTargetsBase.fat_g) || 0
                    }
                }
            });
            enableGroceryAccountSaveButton();
        };

        renderBaselinePlan();

        // "Make it cheaper": reduce portions by 10% (cost drops; macros drop proportionally).
        const cheaperModal = document.getElementById('cheaper-modal');
        const cheaperClose = document.getElementById('cheaper-close');
        const cheaperPortionsBtn = document.getElementById('cheaper-portions');
        const cheaperSwapBtn = document.getElementById('cheaper-swap');

        const openCheaperModal = () => cheaperModal?.classList.remove('hidden');
        const closeCheaperModal = () => cheaperModal?.classList.add('hidden');

        baselineCheaperBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            openCheaperModal();
        });

        cheaperClose?.addEventListener('click', closeCheaperModal);
        cheaperModal?.addEventListener('click', (event) => {
            if (event.target === cheaperModal) closeCheaperModal();
        });

        cheaperPortionsBtn?.addEventListener('click', () => {
            const ok = window.confirm('Reduce portions by 10% to lower cost?\n\nThis will rebuild your meals and grocery list with smaller servings. Your macro totals will decrease proportionally.\n\nPress OK to confirm.');
            if (!ok) return;
            portionScale = 0.9;
            updateMacroDisplay(portionScale);
            renderBaselinePlan();
            closeCheaperModal();
        });

        cheaperSwapBtn?.addEventListener('click', () => {
            alert('This option is not available in the free baseline plan. Use "Reduce portions 10%" or customize foods.');
        });

        baselineCustomFoodsBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            await openCustomFoodsModal();
        });

        accountLink?.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToPlanCtaAndFlash();
        });

        baselineUndoBtn?.addEventListener('click', () => {
            reconfigureMinModeEnabled = false;
            macroTargetsBase.calories = initialMacroTargetsBaseSnapshot.calories;
            macroTargetsBase.protein_g = initialMacroTargetsBaseSnapshot.protein_g;
            macroTargetsBase.carbs_g = initialMacroTargetsBaseSnapshot.carbs_g;
            macroTargetsBase.fat_g = initialMacroTargetsBaseSnapshot.fat_g;
            syncMacrosFromMacroTargetsBase();
            try {
                if (initialPrefsJson === null) sessionStorage.removeItem('groceryPrefs');
                else sessionStorage.setItem('groceryPrefs', initialPrefsJson);
            } catch {
                // ignore
            }
            portionScale = 1;
            updateMacroDisplay(1);
            renderBaselinePlan();
        });

        baselinePlanCtaClose?.addEventListener('click', () => {
            window.location.href = 'grocery-final.html';
        });

        return; // Exit early since we're using baseline foods (unified optimizer path)

    }
    
    // Normal flow: use selections from sessionData
    const selections = sessionData?.selections || { protein: [], carb: [], fat: [] };
    const pickedDetailed = [
        ...selections.protein.map(id => ({ id, type: 'protein' })),
        ...selections.carb.map(id => ({ id, type: 'carb' })),
        ...selections.fat.map(id => ({ id, type: 'fat' }))
    ];

    const pickedItems = pickedDetailed.map(({ id, type }) => {
        const name = lookupFoodName(id);
        const query = mapFoodNameToQuery(name);
        const queryKey = normalizeKey(query);
        const entry = Array.isArray(latest?.items)
            ? latest.items.find(item => normalizeKey(item.query) === queryKey)
            : null;
        const cheapest = pickCheapestItem(entry?.top_two_by_oz || []);
        const macrosData = entry?.macros || cheapest?.macros || null;
        const servingGrams = macrosData ? resolveServingGrams(macrosData, queryKey) : null;
        const pricePerGram = pricePerGramFromItem(cheapest, servingGrams);
        const qualityScore = Number.isFinite(cheapest?.quality_score)
            ? Number(cheapest.quality_score)
            : Number.isFinite(entry?.quality_score)
                ? Number(entry.quality_score)
                : 2;
        return {
            id,
            type,
            name,
            query,
            queryKey,
            entry,
            cheapest,
            macros: macrosData,
            servingGrams,
            pricePerGram,
            qualityScore
        };
    });

    const itemsByType = {
        protein: pickedItems.filter(item => item.type === 'protein'),
        carb: pickedItems.filter(item => item.type === 'carb'),
        fat: pickedItems.filter(item => item.type === 'fat')
    };

    /**
     * Validates if a food's macros match its stated calories.
     * Rejects foods with bad macro-calorie alignment.
     */
    function validateFoodDensity(food) {
        if (!food?.macros) return false;
        
        const p = Number(food.macros.protein_g) || 0;
        const c = Number(food.macros.carbs_g) || 0;
        const f = Number(food.macros.fat_g) || 0;
        const statedCalories = Number(food.macros.calories);
        
        // Calculate what calories SHOULD be based on macros
        const calculatedCalories = p * 4 + c * 4 + f * 9;
        
        if (!Number.isFinite(statedCalories) || statedCalories <= 0) return false;
        
        // Check if there's more than 15% error between stated and calculated
        const densityError = Math.abs(calculatedCalories - statedCalories);
        const errorPercent = (densityError / statedCalories) * 100;
        
        // Allow 15% tolerance for rounding and fiber adjustments
        return errorPercent <= 15;
    }

    /**
     * ============================================================
     * PRIORITY-DRIVEN MEAL OPTIMIZATION ENGINE (MOVED UP)
     * 
     * Philosophy: Calories decide. Protein builds. Carbs support. Fat is capped.
     * ============================================================
     */

    /**
     * Scores a meal candidate based on priority-weighted errors.
     */
    /**
     * PRIORITY-AWARE MEAL SELECTION ENGINE
     * 
     * Priority: Fat > Protein > Carbs > Calories
     * Calories are flexible (up to +150) when needed to fix fat accuracy
     */
 function buildAllMeals(selectedFoods, macroTargets, mealsPerDay, goalRaw, weightLbs, discipline) {
        const profile = discipline || inferDiscipline(nutritionState.selections || {});
        const goal = normalizeGoal(goalRaw);
        const targets = normalizeMacroTargets(macroTargets);
        const mins = {
            calories: targets.calories * (1 - MAX_MACRO_UNDERSHOOT),
            protein_g: targets.protein_g * (1 - MAX_MACRO_UNDERSHOOT),
            carbs_g: targets.carbs_g * (1 - MAX_MACRO_UNDERSHOOT),
            fat_g: targets.fat_g * (1 - MAX_MACRO_UNDERSHOOT)
        };
        const perMealTargets = {
            calories: mealsPerDay ? Math.round(targets.calories / mealsPerDay) : targets.calories,
            protein_g: mealsPerDay ? Math.round(targets.protein_g / mealsPerDay) : targets.protein_g,
            carbs_g: mealsPerDay ? Math.round(targets.carbs_g / mealsPerDay) : targets.carbs_g,
            fat_g: mealsPerDay ? Math.round(targets.fat_g / mealsPerDay) : targets.fat_g
        };

        if (!Array.isArray(selectedFoods) || selectedFoods.length === 0) {
            return { meals: [], dailyTotals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };
        }

        // Liquid calories are allowed only during bulks (and only if the discipline allows it).
        const allowLiquid = goal === 'BULK' && !!profile.allowLiquid;

        const normalizePlannerFood = (food) => {
            const raw = food || {};
            const macros = raw.macros || {};
            const calories = Number(macros.calories ?? macros.kcal ?? 0) || 0;
            const protein_g = Number(macros.protein_g ?? macros.protein ?? 0) || 0;
            const carbs_g = Number(macros.carbs_g ?? macros.carbs ?? 0) || 0;
            const fat_g = Number(macros.fat_g ?? macros.fat ?? 0) || 0;

            const servingGrams = Number(raw.servingGrams) || Number(macros.serving_size) || null;

            const containerServings = servingsPerContainerFromFood(raw);
            const pricePerServing = Number.isFinite(raw.pricePerServing)
                ? Number(raw.pricePerServing)
                : (Number.isFinite(raw.pricePerGram) && Number.isFinite(servingGrams) ? raw.pricePerGram * servingGrams : (
                    Number.isFinite(raw.container?.price) && Number.isFinite(containerServings) && containerServings > 0
                        ? raw.container.price / containerServings
                        : null
                ));

            const qualityScore = Number.isFinite(raw.qualityScore) ? Number(raw.qualityScore) : 2;

            return {
                ...raw,
                name: raw.query || raw.name || raw.foodName || 'Food',
                type: raw.type || raw.category || 'other',
                macros: { calories, protein_g, carbs_g, fat_g, serving_size: macros.serving_size },
                servingGrams,
                pricePerServing,
                qualityScore
            };
        };

        const foodsToUse = (allowLiquid ? selectedFoods : selectedFoods.filter(f => !isLiquidFood(f))).map(normalizePlannerFood);
        const proteins = foodsToUse.filter(f => f.type === 'protein');
        const carbs = foodsToUse.filter(f => f.type === 'carb');
        const fats = foodsToUse.filter(f => f.type === 'fat');

        if (!proteins.length || !carbs.length) {
            return { meals: [], dailyTotals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };
        }

        // Macro hierarchy enforcement (non-negotiable):
        // Protein (fixed first) -> Calories -> Carbs -> Fats.

        const isNoOvershoot = (totals) => (
            totals.calories <= targets.calories &&
            totals.protein_g <= targets.protein_g &&
            totals.carbs_g <= targets.carbs_g &&
            totals.fat_g <= targets.fat_g
        );

        const meetsMin = (totals) => (
            totals.calories >= mins.calories &&
            totals.protein_g >= mins.protein_g &&
            totals.carbs_g >= mins.carbs_g &&
            totals.fat_g >= mins.fat_g
        );

        const totalsForMeal = (foods) => ({
            // Floor (not round) to preserve the "no overshoot" rule.
            calories: foods.reduce((sum, f) => sum + Math.floor((f.macros.calories || 0) * f.servings), 0),
            protein_g: foods.reduce((sum, f) => sum + Math.floor((f.macros.protein_g || 0) * f.servings), 0),
            carbs_g: foods.reduce((sum, f) => sum + Math.floor((f.macros.carbs_g || 0) * f.servings), 0),
            fat_g: foods.reduce((sum, f) => sum + Math.floor((f.macros.fat_g || 0) * f.servings), 0)
        });

        const isEggServing = (food) => {
            const unit = String(food?.serving?.unit || '').toLowerCase();
            return unit === 'egg' || unit === 'eggs';
        };

        // Quantize foods that are not realistically measurable as fractions (eggs).
        // Preference: round UP to the next whole unit, but never exceed maxServings.
        const quantizeServings = (food, servings, maxServings) => {
            if (!isEggServing(food)) return servings;

            const unitsPerServing = Number(food?.serving?.amount);
            if (!Number.isFinite(unitsPerServing) || unitsPerServing <= 0) return servings;

            const s = Math.max(0, Number(servings) || 0);
            const maxS = Number.isFinite(maxServings) ? Math.max(0, Number(maxServings)) : s;

            const desiredUnits = Math.ceil(s * unitsPerServing - 1e-9);
            const maxUnits = Math.floor(maxS * unitsPerServing + 1e-9);
            const chosenUnits = Math.max(0, Math.min(desiredUnits, maxUnits));
            return chosenUnits / unitsPerServing;
        };

        const addFoodToMeal = (mealFoods, food, servings, maxServings) => {
            const s = Number(servings);
            if (!Number.isFinite(s) || s <= 0) return;
            const sQuant = quantizeServings(food, s, maxServings);
            if (!Number.isFinite(sQuant) || sQuant <= 0) return;
            mealFoods.push({ ...food, servings: sQuant });
        };

        const maxServingsByRemaining = (food, remaining) => {
            const per = food.macros || {};
            const caps = [];
            if (Number.isFinite(per.calories) && per.calories > 0) caps.push(remaining.calories / per.calories);
            if (Number.isFinite(per.protein_g) && per.protein_g > 0) caps.push(remaining.protein_g / per.protein_g);
            if (Number.isFinite(per.carbs_g) && per.carbs_g > 0) caps.push(remaining.carbs_g / per.carbs_g);
            if (Number.isFinite(per.fat_g) && per.fat_g > 0) caps.push(remaining.fat_g / per.fat_g);
            const cap = caps.length ? Math.min(...caps) : 0;
            return Math.max(0, cap);
        };

        const chooseTop = (list, limit, scorer) => {
            const src = list.slice();
            src.sort((a, b) => (scorer(b) - scorer(a)));
            return src.slice(0, Math.max(1, limit));
        };

        const proteinRank = (f) => {
            const p = Number(f.macros.protein_g) || 0;
            const cals = Number(f.macros.calories) || 1;
            return (p / cals) * 100 + (Number(f.qualityScore) || 0) * 10;
        };
        const carbRank = (f) => {
            const c = Number(f.macros.carbs_g) || 0;
            const cals = Number(f.macros.calories) || 1;
            return (c / cals) * 40 + (Number(f.qualityScore) || 0) * 10;
        };
        const fatRank = (f) => {
            const fat = Number(f.macros.fat_g) || 0;
            return fat + (Number(f.qualityScore) || 0) * 10;
        };

        const topProteins = chooseTop(proteins, 6, proteinRank);
        const topCarbs = chooseTop(carbs, 6, carbRank);
        const topFats = fats.length ? chooseTop(fats, 4, fatRank) : [];

        const planCandidates = [];
        const proteinPairs = [];
        for (let i = 0; i < topProteins.length; i++) {
            for (let j = i + 1; j < topProteins.length; j++) {
                proteinPairs.push([topProteins[i], topProteins[j]]);
            }
        }
        const carbPairs = [];
        for (let i = 0; i < topCarbs.length; i++) {
            for (let j = i + 1; j < topCarbs.length; j++) {
                carbPairs.push([topCarbs[i], topCarbs[j]]);
            }
        }

        // If the user selected only one source, we still attempt a plan, but variety will be flagged later.
        const fallbackProteinPair = proteinPairs.length ? null : [topProteins[0], topProteins[0]];
        const fallbackCarbPair = carbPairs.length ? null : [topCarbs[0], topCarbs[0]];
        const pairsToTry = proteinPairs.length ? proteinPairs.slice(0, 10) : [fallbackProteinPair];
        const carbsToTry = carbPairs.length ? carbPairs.slice(0, 10) : [fallbackCarbPair];

        const buildPlanWithPairs = (pPair, cPair) => {
            const meals = [];
            const running = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
            const usedProteins = new Set();
            const usedCarbs = new Set();

            for (let mealIdx = 0; mealIdx < mealsPerDay; mealIdx++) {
                const remainingMeals = mealsPerDay - mealIdx;
                const remaining = {
                    calories: Math.max(0, targets.calories - running.calories),
                    protein_g: Math.max(0, targets.protein_g - running.protein_g),
                    carbs_g: Math.max(0, targets.carbs_g - running.carbs_g),
                    fat_g: Math.max(0, targets.fat_g - running.fat_g)
                };

                const desired = {
                    calories: remainingMeals ? remaining.calories / remainingMeals : remaining.calories,
                    protein_g: remainingMeals ? remaining.protein_g / remainingMeals : remaining.protein_g,
                    carbs_g: remainingMeals ? remaining.carbs_g / remainingMeals : remaining.carbs_g,
                    fat_g: remainingMeals ? remaining.fat_g / remainingMeals : remaining.fat_g
                };

                const proteinFood = (mealIdx % 2 === 0) ? pPair[0] : pPair[1];
                const carbFood = (mealIdx % 2 === 0) ? cPair[0] : cPair[1];

                const mealFoods = [];

                // Protein first (fixed first).
                const pPer = Number(proteinFood.macros.protein_g) || 0;
                const pServRaw = pPer > 0 ? (desired.protein_g / pPer) : (desired.calories / (Number(proteinFood.macros.calories) || 1));
                const pMax = maxServingsByRemaining(proteinFood, remaining);
                const pServ = clamp(pServRaw, 0, pMax);
                addFoodToMeal(mealFoods, proteinFood, pServ, pMax);

                // Update remaining after protein allocation.
                const afterProteinTotals = totalsForMeal(mealFoods);
                const remainingAfterProtein = {
                    calories: Math.max(0, remaining.calories - afterProteinTotals.calories),
                    protein_g: Math.max(0, remaining.protein_g - afterProteinTotals.protein_g),
                    carbs_g: Math.max(0, remaining.carbs_g - afterProteinTotals.carbs_g),
                    fat_g: Math.max(0, remaining.fat_g - afterProteinTotals.fat_g)
                };

                // Carbs (primary adjustment lever).
                const cPer = Number(carbFood.macros.carbs_g) || 0;
                const cServRaw = cPer > 0 ? (desired.carbs_g / cPer) : (desired.calories / (Number(carbFood.macros.calories) || 1));
                const cMax = maxServingsByRemaining(carbFood, remainingAfterProtein);
                const cServ = clamp(cServRaw, 0, cMax);
                addFoodToMeal(mealFoods, carbFood, cServ, cMax);

                // Optional fat (least priority).
                if (topFats.length && remainingAfterProtein.fat_g > 0) {
                    const fatFood = topFats[mealIdx % topFats.length];
                    const fPer = Number(fatFood.macros.fat_g) || 0;
                    const desiredFat = desired.fat_g;
                    const fServRaw = fPer > 0 ? (desiredFat / fPer) : 0;
                    const afterPC = totalsForMeal(mealFoods);
                    const remainingAfterPC = {
                        calories: Math.max(0, remaining.calories - afterPC.calories),
                        protein_g: Math.max(0, remaining.protein_g - afterPC.protein_g),
                        carbs_g: Math.max(0, remaining.carbs_g - afterPC.carbs_g),
                        fat_g: Math.max(0, remaining.fat_g - afterPC.fat_g)
                    };
                    const fMax = maxServingsByRemaining(fatFood, remainingAfterPC);
                    const fServ = clamp(fServRaw, 0, fMax);
                    addFoodToMeal(mealFoods, fatFood, fServ, fMax);
                }

                const totals = totalsForMeal(mealFoods);
                running.calories += totals.calories;
                running.protein_g += totals.protein_g;
                running.carbs_g += totals.carbs_g;
                running.fat_g += totals.fat_g;

                mealFoods.forEach(f => {
                    if (f.type === 'protein') usedProteins.add(f.id);
                    if (f.type === 'carb') usedCarbs.add(f.id);
                });

                const mealItems = mealFoods.map(f => {
                    const grams = Number.isFinite(f.servingGrams)
                        ? Math.round(f.servingGrams * f.servings * 10) / 10
                        : Math.round((Number(f.macros.serving_size) || 100) * f.servings * 10) / 10;

                    const measurementText = (() => {
                        const formatOz = (oz) => {
                            const v = Number(oz);
                            if (!Number.isFinite(v) || v <= 0) return null;
                            const abs = Math.abs(v);
                            const decimals = abs >= 16 ? 0 : abs >= 4 ? 1 : 2;
                            let s = v.toFixed(decimals);
                            s = s.replace(/\.0+$/, '');
                            s = s.replace(/(\.\d)0$/, '$1');
                            return s;
                        };

                        const servingsText = `${Math.round(f.servings * 100) / 100} servings`;
                        const unit = String(f?.serving?.unit || '').toLowerCase();
                        const amount = Number(f?.serving?.amount);
                        if ((unit === 'egg' || unit === 'eggs') && Number.isFinite(amount) && amount > 0) {
                            const eggs = Math.round(f.servings * amount);
                            return `${eggs} egg${eggs === 1 ? '' : 's'}`;
                        }

                        // US-first display: prefer ounces when we can derive them.
                        if ((unit === 'oz' || unit === 'ounce' || unit === 'ounces') && Number.isFinite(amount) && amount > 0) {
                            const ozText = formatOz(f.servings * amount);
                            if (ozText) return `${servingsText} / ${ozText} oz`;
                        }

                        if (Number.isFinite(grams) && grams > 0) {
                            const ozText = formatOz(grams / 28.349523125);
                            if (ozText) return `${servingsText} / ${ozText} oz`;
                        }

                        return servingsText;
                    })();

                    return {
                        foodId: f.id,
                        foodName: f.query || f.name,
                        servings: Math.round(f.servings * 100) / 100,
                        grams,
                        measurementText,
                        calories: Math.floor((f.macros.calories || 0) * f.servings),
                        protein_g: Math.floor((f.macros.protein_g || 0) * f.servings),
                        carbs_g: Math.floor((f.macros.carbs_g || 0) * f.servings),
                        fat_g: Math.floor((f.macros.fat_g || 0) * f.servings)
                    };
                });

                const mealCandidateScore = scoreMeal(perMealTargets, totals, profile);
                meals.push({ foods: mealItems, totals, score: mealCandidateScore });
            }

            const dailyTotals = {
                calories: meals.reduce((sum, m) => sum + m.totals.calories, 0),
                protein_g: meals.reduce((sum, m) => sum + m.totals.protein_g, 0),
                carbs_g: meals.reduce((sum, m) => sum + m.totals.carbs_g, 0),
                fat_g: meals.reduce((sum, m) => sum + m.totals.fat_g, 0)
            };

            const uniqueFoodCount = (() => {
                const ids = new Set();
                meals.forEach(meal => (meal.foods || []).forEach(item => ids.add(item.foodId)));
                return ids.size;
            })();

            const totalGrams = (() => {
                let g = 0;
                meals.forEach(meal => (meal.foods || []).forEach(item => {
                    const grams = Number(item.grams);
                    if (Number.isFinite(grams) && grams > 0) g += grams;
                }));
                return g;
            })();

            // Enforce per-day variety (not per-meal).
            const varietyOk = usedProteins.size >= Math.min(2, proteins.length) && usedCarbs.size >= Math.min(2, carbs.length);

            const qualityScore = (() => {
                let qSum = 0;
                let weight = 0;
                meals.forEach(meal => {
                    meal.foods.forEach(item => {
                        const src = foodsToUse.find(f => f.id === item.foodId);
                        const q = Number(src?.qualityScore) || 2;
                        const w = Number(item.servings) || 0;
                        qSum += q * w;
                        weight += w;
                    });
                });
                return weight > 0 ? (qSum / weight) : 2;
            })();

            const cost = (() => {
                let total = 0;
                meals.forEach(meal => {
                    meal.foods.forEach(item => {
                        const src = foodsToUse.find(f => f.id === item.foodId);
                        if (!src) return;
                        const pps = Number(src.pricePerServing);
                        if (!Number.isFinite(pps)) return;
                        total += pps * (Number(item.servings) || 0);
                    });
                });
                return total;
            })();

            return {
                meals,
                dailyTotals,
                score: scoreTotals(targets, dailyTotals, profile),
                qualityScore,
                cost,
                meetsMin: meetsMin(dailyTotals),
                noOvershoot: isNoOvershoot(dailyTotals),
                varietyOk,
                uniqueFoodCount,
                totalGrams
            };
        };

        pairsToTry.forEach(pPair => {
            carbsToTry.forEach(cPair => {
                if (!pPair || !cPair) return;
                planCandidates.push(buildPlanWithPairs(pPair, cPair));
            });
        });

        const usable = planCandidates.filter(c => c.noOvershoot);
        const strict = usable.filter(c => c.meetsMin);
        const pool = strict.length ? strict : usable;
        const varietyPool = pool.filter(c => c.varietyOk);
        const finalPool = reconfigureMinModeEnabled ? pool : (varietyPool.length ? varietyPool : pool);

        if (!finalPool.length) {
            return { meals: [], dailyTotals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };
        }

        if (reconfigureMinModeEnabled) {
            // Reconfigure mode: keep protein priority via score, then minimize cost/volume/items.
            finalPool.sort((a, b) => {
                if (a.score !== b.score) return a.score - b.score;
                if (a.cost !== b.cost) return a.cost - b.cost;
                if ((a.uniqueFoodCount || 0) !== (b.uniqueFoodCount || 0)) return (a.uniqueFoodCount || 0) - (b.uniqueFoodCount || 0);
                if ((a.totalGrams || 0) !== (b.totalGrams || 0)) return (a.totalGrams || 0) - (b.totalGrams || 0);
                return (b.qualityScore || 0) - (a.qualityScore || 0);
            });
        } else {
            // Candidate order: score -> quality -> cost (never pre-sort by cost).
            finalPool.sort((a, b) => {
                if (a.score !== b.score) return a.score - b.score;
                if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
                return a.cost - b.cost;
            });
        }

        const best = finalPool[0];
        const dailyCost = Math.round(best.cost * 100) / 100;
        return { meals: best.meals, dailyTotals: best.dailyTotals, dailyCost, varietyOk: best.varietyOk };
    }

    /**
     * Renders meal grid using optimization engine.
     */
    let lastMealPlan = null;
    function renderMealGrid(scale = 1) {
        if (!mealGrid || !macros) return;
        
        if (!itemsByType.protein.length && !itemsByType.carb.length && !itemsByType.fat.length) {
            mealGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No foods available. Please select foods from the initial setup.</div>';
            return;
        }

        const discipline = inferDiscipline(nutritionState.selections || {});
        const validProtein = itemsByType.protein.filter(validateFoodDensity);
        const validCarb = itemsByType.carb.filter(validateFoodDensity);
        const validFat = itemsByType.fat.filter(validateFoodDensity);

        if (!validProtein.length || !validCarb.length || !validFat.length) {
            mealGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Some selected foods have conflicting macro data. Please reselect.</div>';
            return;
        }

        const allValidFoods = [...validProtein, ...validCarb, ...validFat];
        const macroTargets = {
            calories: Math.round(macros.calories || 2000),
            protein_g: Math.round(macros.proteinG || 150),
            carbs_g: Math.round(macros.carbG || 200),
            fat_g: Math.round(macros.fatG || 65)
        };
        const plannerTargets = scaledTargetsForPlanner(macroTargets, scale);

        // Build all meals using scale-first approach
        const mealResult = buildAllMeals(
            allValidFoods,
            plannerTargets,
            mealsPerDay,
            nutritionState.selections?.goal || 'RECOMP',
            nutritionState.selections?.weightLbs || 170,
            discipline
        );
        const { meals: builtMeals, dailyTotals: initialTotals } = mealResult;

        // New system rules: no macro overshoot, <=15% undershoot allowed, quality before cost.
        // `buildAllMeals` already enforces these constraints; do not rescale meals after this point.
        const dailyTotalsFast = initialTotals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
        lastMealPlan = { meals: builtMeals || [], dailyTotals: dailyTotalsFast, macroTargets, plannerTargets, portionScale: scale };
        saveMealPlanSnapshotForLogging({ meals: builtMeals || [], mealsPerDay, macroTargets });

        const neededSupplementsForNote = recommendedSupplementsForTotals({ macroTargets, dailyTotals: dailyTotalsFast });
        updateMacroNoteText({ macroTargets, dailyTotals: dailyTotalsFast, neededSupplements: neededSupplementsForNote });

        const mealsHTMLFast = (builtMeals || []).map((meal, idx) => {
            const itemList = (meal.foods || []).map(item => `
                <div class="meal-item">
                    <span class="meal-item-name">&#8226; ${item.foodName}</span>
                    <span class="meal-item-macros">${item.protein_g}g P | ${item.carbs_g}g C | ${item.fat_g}g F</span>
                    <span class="meal-item-measurement">${item.measurementText || `${item.servings} servings`}</span>
                </div>
            `).join('');

            return `
                <div class="meal-block">
                    <div class="meal-title">Meal ${idx + 1}</div>
                    <div class="meal-items">
                        ${itemList}
                    </div>
                    <div class="meal-summary">
                        ${meal.totals.calories} kcal | ${meal.totals.protein_g}g P | ${meal.totals.carbs_g}g C | ${meal.totals.fat_g}g F
                    </div>
                </div>
            `;
        }).join('');

        mealGrid.innerHTML = `
            <div class="meal-blocks">
                ${mealsHTMLFast}
                <div class="meal-daily-total">
                    <div class="daily-total-label">Daily Total</div>
                    <div class="daily-total-value">${dailyTotalsFast.calories} kcal | ${dailyTotalsFast.protein_g}g P | ${dailyTotalsFast.carbs_g}g C | ${dailyTotalsFast.fat_g}g F</div>
                </div>
            </div>
        `;

        const macroWarningsEl = document.getElementById('macro-warnings');
        if (macroWarningsEl) {
            const entries = [`<div class="macro-warning info">${LONG_TERM_NOTE}</div>`];
            [
                { key: 'protein_g', label: 'Protein', supplement: 'protein' },
                { key: 'carbs_g', label: 'Carbs', supplement: 'carbs' },
                { key: 'fat_g', label: 'Fat', supplement: 'fat' }
            ].forEach(({ key, label, supplement }) => {
                const target = macroTargets[key];
                const actual = dailyTotalsFast[key];
                if (!target) return;
                const pctShort = Math.max(0, (target - actual) / target);
                if (pctShort >= MAX_MACRO_UNDERSHOOT) {
                    const suggestion = SUPPLEMENT_MAP[supplement] ? ` Supplement suggestion: ${SUPPLEMENT_MAP[supplement]}.` : '';
                    entries.push(`<div class="macro-warning warning">${label} is ${(pctShort * 100).toFixed(0)}% under the target.${suggestion} This is good enough given your constraints.</div>`);
                }
            });
            macroWarningsEl.innerHTML = entries.join('');
            macroWarningsEl.classList.toggle('hidden', entries.length === 0);
        }

        return;

    }

    // Lockdown pass: do not compute grocery quantities by "splitting macros across foods".
    // Grocery quantities are derived from the one optimizer (buildAllMeals) via lastMealPlan.

    const allItems = [...itemsByType.protein, ...itemsByType.carb, ...itemsByType.fat];

    const choiceStoreKey = 'groceryItemChoice';
    let choiceMap = {};
    try {
        choiceMap = JSON.parse(sessionStorage.getItem(choiceStoreKey) || '{}');
    } catch (err) {
        choiceMap = {};
    }
    const initialChoiceMapSnapshot = { ...choiceMap };
    let portionScale = 1;

    const getChoice = (queryKey) => (choiceMap[queryKey] === 1 ? 1 : 0);
    const setChoice = (queryKey, idx) => {
        choiceMap[queryKey] = idx;
        sessionStorage.setItem(choiceStoreKey, JSON.stringify(choiceMap));
    };

    const applyChoice = (item) => {
        const idx = getChoice(item.queryKey);
        const choices = Array.isArray(item.entry?.top_two_by_oz)
            ? item.entry.top_two_by_oz.slice(0, 2)
            : (item.cheapest ? [item.cheapest] : []);
        item.choices = choices;
        item.chosen = choices[idx] || choices[0] || null;
        item.pricePerGram = pricePerGramFromItem(item.chosen, item.servingGrams);
    };

    const renderBudgetAndList = () => {
        // Keep the grocery list tied to the meal plan (not an equal split across foods).
        if (lastMealPlan && Array.isArray(lastMealPlan.meals) && lastMealPlan.meals.length) {
            const dailyServingsById = {};
            lastMealPlan.meals.forEach(meal => {
                (meal.foods || []).forEach(item => {
                    const id = item.foodId;
                    const servings = Number(item.servings) || 0;
                    if (!id || servings <= 0) return;
                    dailyServingsById[id] = (dailyServingsById[id] || 0) + servings;
                });
            });
            allItems.forEach(item => {
                const daily = Number(dailyServingsById[item.id]) || 0;
                item.weeklyServings = daily * 7;
            });
        }

        let weeklyTotal = 0;
        allItems.forEach(item => {
            applyChoice(item);
            const servings = Number(item.weeklyServings);
            if (!Number.isFinite(servings) || !Number.isFinite(item.pricePerGram) || !Number.isFinite(item.servingGrams)) {
                item.weeklyCost = null;
                return;
            }
            item.weeklyCost = servings * item.pricePerGram * item.servingGrams;
            weeklyTotal += item.weeklyCost;
        });

        // Keep weekly/monthly internally consistent: monthly is a 30-day normalized estimate.
        const monthlyTotal = weeklyTotal * (30 / 7);
        const taxRate = 0.08;
        const estimatedTax = monthlyTotal * taxRate;
        const monthlyTotalWithTax = monthlyTotal + estimatedTax;
        const budget = Number(prefs?.budgetTotal || 0);
        const budgetDelta = budget ? budget - monthlyTotalWithTax : null;

        const saveItems = [];
        if (listEl) {
            listEl.innerHTML = allItems.filter(item => {
                // Hide items with 0.0 servings
                const servings = Number(item.weeklyServings);
                return !Number.isFinite(servings) || servings > 0;
            }).map(item => {
                const servings = Number(item.weeklyServings);
                const weeklyCost = Number(item.weeklyCost);
                const servingGrams = Number(item.servingGrams);
                const costText = Number.isFinite(weeklyCost) ? formatCurrency(weeklyCost) : EM_DASH;
                const chosenName = item.chosen?.name || item.query || item.name;
                const chosenUrl = item.chosen?.url || '#';
                const chosenImage = item.chosen?.image || item.cheapest?.image || '';
                const safeItemName = String(item.query || item.name || 'Item').replace(/[^\x20-\x7E]/g, '');
                const canSwap = item.choices && item.choices.length > 1;
                
                // Calculate container-based info
                const containerInfo = getContainerInfo(item.chosen);
                const containerOz = containerInfo?.containerOz || 0;
                const pricePerContainer = containerInfo?.pricePerContainer || 0;
                const displaySize = containerInfo?.displaySize || EM_DASH;
                
                // Calculate consumption in ounces
                // weeklyServings x servingGrams = total grams per week
                // total grams per week / 28.3495 = total oz per week
                const weeklyGrams = Number.isFinite(servings) && Number.isFinite(servingGrams) ? servings * servingGrams : 0;
                const weeklyConsumptionOz = weeklyGrams / 28.3495;
                const dailyConsumptionOz = weeklyConsumptionOz / 7;
                const containersNeeded = containerOz > 0 && Number.isFinite(weeklyConsumptionOz) ? Math.ceil(weeklyConsumptionOz / containerOz) : 0;
                
                const dailyText = Number.isFinite(dailyConsumptionOz) && dailyConsumptionOz > 0 ? `~${dailyConsumptionOz.toFixed(1)} oz` : EM_DASH;
                const weeklyText = Number.isFinite(weeklyConsumptionOz) && weeklyConsumptionOz > 0 ? `~${weeklyConsumptionOz.toFixed(1)} oz` : EM_DASH;
                const containersText = `${containersNeeded} container${containersNeeded !== 1 ? 's' : ''}`;
                const pricePerContainerText = Number.isFinite(pricePerContainer) && pricePerContainer > 0 ? formatCurrency(pricePerContainer) : EM_DASH;

                const type = String(item.type || '').toLowerCase();
                const category = type === 'protein' ? 'Protein' : type === 'carb' ? 'Carb' : type === 'fat' ? 'Fat' : 'Misc';
                saveItems.push({
                    name: item.query || item.name,
                    quantity: containersText,
                    category,
                    estimatedWeeklyCost: Number.isFinite(weeklyCost) ? weeklyCost : null,
                    image: chosenImage || null,
                    url: chosenUrl || null,
                    daily: Number.isFinite(dailyConsumptionOz) ? dailyConsumptionOz : null,
                    daysPerContainer: Number.isFinite(daysPerContainer) ? daysPerContainer : null,
                    containerPrice: Number.isFinite(pricePerContainer) ? pricePerContainer : null,
                    unit: 'oz'
                });
                
                return `
            <div class="grocery-item-row" data-query="${item.queryKey}" data-url="${chosenUrl}">
                <div class="grocery-item-top">
                    <div class="grocery-thumb-box${chosenImage ? '' : ' empty'}">
                        ${chosenImage ? `<img src="${chosenImage}" alt="${safeItemName}">` : ''}
                    </div>
                    <div class="grocery-price-stack">
                        <span class="grocery-price">${costText}</span>
                        ${canSwap ? '<button class="item-switch" data-query="' + item.queryKey + '">Swap</button>' : ''}
                    </div>
                    <label class="grocery-check">
                        <input type="checkbox" class="grocery-check-input" data-query="${item.queryKey}">
                        <span class="grocery-check-box"></span>
                    </label>
                </div>
                <div class="grocery-item-info">
                    <button class="grocery-link grocery-popup" type="button" data-url="${chosenUrl}">${item.query || item.name}</button>
                    <div class="grocery-item-container-size">${displaySize} container</div>
                    <div class="grocery-item-consumption">
                        <span class="consumption-daily">Daily: ${dailyText}</span>
                        <span class="consumption-weekly">Weekly: ${weeklyText}</span>
                    </div>
                    <div class="grocery-item-purchase">
                        <span class="purchase-qty">Buy: ${containersText}</span>
                        <span class="purchase-price">${pricePerContainerText} per container</span>
                    </div>
                    <div class="grocery-cart-status">Not In Walmart Cart</div>
                </div>
            </div>
            `;
            }).join('');
        }

        stageLatestGroceryListDraft({
            source: 'grocery_generator',
            items: saveItems,
            totals: {
                totalEstimatedWeeklyCost: Number.isFinite(weeklyTotal) ? weeklyTotal : null,
                currency: 'USD'
            },
            meta: {
                generatedAt: new Date().toISOString(),
                store: prefs?.store || null,
                notes: 'meal_plan',
                macroTargets: {
                    calories: Number(macros?.calories) || 0,
                    proteinG: Number(macros?.proteinG) || 0,
                    carbG: Number(macros?.carbG) || 0,
                    fatG: Number(macros?.fatG) || 0
                }
            }
        });
        enableGroceryAccountSaveButton();

        const listNote = document.getElementById('grocery-list-note');
        if (listNote && Number.isFinite(weeklyTotal)) {
            listNote.textContent = `Estimated weekly: ${formatCurrency(weeklyTotal)} Ã‚Â· monthly: ${formatCurrency(monthlyTotal)}.`;
        }

        // Update budget breakdown fields
        const budgetAllocEl = document.getElementById('budget-allocated');
        const budgetEstEl = document.getElementById('budget-estimated');
        const budgetTaxesEl = document.getElementById('budget-taxes');
        const budgetTotalEl = document.getElementById('budget-total');
        const budgetStatusEl = document.getElementById('budget-status');

        if (budgetAllocEl) budgetAllocEl.textContent = budget ? formatCurrency(budget) : EM_DASH;
        if (budgetEstEl) budgetEstEl.textContent = Number.isFinite(monthlyTotal) ? formatCurrency(monthlyTotal) : EM_DASH;
        if (budgetTaxesEl) budgetTaxesEl.textContent = Number.isFinite(estimatedTax) ? formatCurrency(estimatedTax) : EM_DASH;
        if (budgetTotalEl) budgetTotalEl.textContent = Number.isFinite(monthlyTotalWithTax) ? formatCurrency(monthlyTotalWithTax) : EM_DASH;
        
        if (budgetStatusEl) {
            const statusBadge = budgetStatusEl.querySelector('.status-badge');
            if (statusBadge) {
                if (budgetDelta === null || !Number.isFinite(budgetDelta)) {
                    statusBadge.textContent = 'Set a budget to compare';
                } else if (budgetDelta >= 0) {
                    statusBadge.textContent = `Under budget by ${formatCurrency(budgetDelta)}`;
                } else {
                    statusBadge.textContent = `Over budget by ${formatCurrency(Math.abs(budgetDelta))}`;
                }
            }
        }

        const budgetEl = document.getElementById('budget-summary-body');
        if (budgetEl) {
            const deltaText = budgetDelta == null ? 'Set a monthly budget to compare.' : (budgetDelta >= 0
                ? `Under budget by ${formatCurrency(budgetDelta)}`
                : `Over budget by ${formatCurrency(Math.abs(budgetDelta))}`);
            budgetEl.innerHTML = `
            <div class="grocery-item"><span>Budget</span><span>${budget ? formatCurrency(budget) : '-'}</span></div>
            <div class="grocery-item"><span>Estimated monthly spend</span><span>${Number.isFinite(monthlyTotal) ? formatCurrency(monthlyTotal) : '-'}</span></div>
            <div class="grocery-item"><span>Estimated taxes (8%)</span><span>${Number.isFinite(estimatedTax) ? formatCurrency(estimatedTax) : '-'}</span></div>
            <div class="grocery-item"><span>Estimated monthly total</span><span>${Number.isFinite(monthlyTotalWithTax) ? formatCurrency(monthlyTotalWithTax) : '-'}</span></div>
            <div class="grocery-item"><span>Status</span><span>${deltaText}</span></div>
        `;
        }

        document.querySelectorAll('.item-switch').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.query || '';
                const next = getChoice(key) === 1 ? 0 : 1;
                setChoice(key, next);
                renderBudgetAndList();
            });
        });

        const updateCartStatus = (checkbox) => {
            const row = checkbox.closest('.grocery-item-row');
            const statusEl = row?.querySelector('.grocery-cart-status');
            if (!statusEl) return;
            const isChecked = checkbox.checked;
            statusEl.textContent = isChecked ? 'In Walmart Cart' : 'Not In Walmart Cart';
            statusEl.classList.toggle('in-cart', isChecked);
        };

        document.querySelectorAll('.grocery-check-input').forEach(checkbox => {
            updateCartStatus(checkbox);
            checkbox.addEventListener('change', () => updateCartStatus(checkbox));
        });

        const popupRow = document.getElementById('popup-row');
        const popupError = document.getElementById('popup-error');
        const popupRetry = document.getElementById('popup-retry');
        let lastPopupAttempt = null;

        const showPopupError = (message) => {
            if (!popupRow || !popupError) return;
            popupError.textContent = message;
            popupRow.classList.remove('hidden');
        };
        const clearPopupError = () => {
            if (!popupRow || !popupError) return;
            popupError.textContent = '';
            popupRow.classList.add('hidden');
        };

        const openWalmartPopup = (url, queryKey) => {
            clearPopupError();
            if (!url || url === '#') {
                showPopupError('Missing Walmart link for this item.');
                return;
            }
            lastPopupAttempt = { url, queryKey };
            const popup = window.open(
                url,
                'walmartPopup',
                'popup=yes,width=1050,height=900,scrollbars=yes,resizable=yes'
            );
            if (!popup) {
                showPopupError('Popups are blocked. Enable popups in your browser, then retry.');
                return;
            }
            const checkbox = document.querySelector(`.grocery-check-input[data-query="${queryKey}"]`);
            if (checkbox) {
                checkbox.checked = true;
                const event = new Event('change', { bubbles: true });
                checkbox.dispatchEvent(event);
            }
        };

        popupRetry?.addEventListener('click', () => {
            if (!lastPopupAttempt) return;
            openWalmartPopup(lastPopupAttempt.url, lastPopupAttempt.queryKey);
        });

        document.querySelectorAll('.grocery-popup').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                const url = btn.dataset.url;
                const queryKey = btn.closest('.grocery-item')?.dataset.query || '';
                openWalmartPopup(url, queryKey);
            });
        });

        // Populate weekly and monthly cost summary
        const weeklyCostEl = document.getElementById('p-weekly-cost');
        const monthlyCostEl = document.getElementById('p-monthly-cost');
        if (weeklyCostEl) weeklyCostEl.textContent = Number.isFinite(weeklyTotal) ? formatCurrency(weeklyTotal) : EM_DASH;
        if (monthlyCostEl) monthlyCostEl.textContent = Number.isFinite(monthlyTotal) ? formatCurrency(monthlyTotal) : EM_DASH;

        return {
            weeklyTotal,
            monthlyTotal,
            estimatedTax,
            monthlyTotalWithTax,
            budgetDelta
        };
    };

    // Lockdown pass: UI does not alter nutrition math (no macro scaling).
    renderMealGrid(1);
    let lastTotals = renderBudgetAndList();

    const cheaperModal = document.getElementById('cheaper-modal');
    const cheaperClose = document.getElementById('cheaper-close');
    const cheaperOptions = document.getElementById('cheaper-options');
    const cheaperBtn = document.getElementById('make-cheaper-btn');
    const customFoodsBtn = document.getElementById('custom-foods-btn');
    const undoBtn = document.getElementById('undo-btn');
    const reconfigureBtn = document.getElementById('reconfigure-btn');
    const planCta = document.getElementById('plan-cta');
    
    // Define missing modal elements with safe fallbacks
    const cheaperMacrosBtn = document.getElementById('cheaper-macros');
    const cheaperFoodsBtn = document.getElementById('cheaper-foods');
    const cheaperCustomBtn = document.getElementById('cheaper-custom');
    const cheaperCustomPanel = document.getElementById('cheaper-custom-panel');
    const cheaperConfirm = document.getElementById('cheaper-confirm');
    const cheaperCustomList = document.getElementById('cheaper-custom-list');
    const cheaperSavings = document.getElementById('cheaper-savings');
    const cheaperChanges = document.getElementById('cheaper-changes');

    const openCheaperModal = () => {
        cheaperOptions?.classList.remove('hidden');
        cheaperCustomPanel?.classList.add('hidden');
        cheaperModal?.classList.remove('hidden');
    };

    const closeCheaperModal = () => {
        cheaperModal?.classList.add('hidden');
    };

    cheaperBtn?.addEventListener('click', openCheaperModal);
    customFoodsBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await openCustomFoodsModal();
    });
    // (wired near top of setupGroceryPlanPage)
    cheaperClose?.addEventListener('click', closeCheaperModal);
    cheaperModal?.addEventListener('click', (event) => {
        if (event.target === cheaperModal) closeCheaperModal();
    });

    // "Reduce portions 10%" button - reduce portion sizes to lower cost
    const cheaperPortionsBtn = document.getElementById('cheaper-portions');
    cheaperPortionsBtn?.addEventListener('click', () => {
        const ok = window.confirm('Reduce portions by 10% to lower cost?\n\nThis will rebuild your meals and grocery list with smaller servings. Your macro totals will decrease proportionally.\n\nPress OK to confirm.');
        if (!ok) return;
        portionScale = 0.9;
        updateMacroDisplay(portionScale);
        renderMealGrid(portionScale);
        lastTotals = renderBudgetAndList();
        closeCheaperModal();
    });

    // "Find cheaper foods" button - swap to cheapest alternatives
    const cheaperSwapBtn = document.getElementById('cheaper-swap');
    cheaperSwapBtn?.addEventListener('click', () => {
        // Automatically set all items to their cheapest alternatives
        setAllChoicesToCheapest();
        lastTotals = renderBudgetAndList();
        renderMealGrid(1);
        closeCheaperModal();
    });

    // Undo button - restore original scale
    undoBtn?.addEventListener('click', () => {
        reconfigureMinModeEnabled = false;
        reconfigureBaselineSnapshot = null;
        reconfigurePrefsJsonSnapshot = null;
        reconfigureChoiceMapSnapshot = null;
        macros.calories = initialMacrosSnapshot.calories;
        macros.proteinG = initialMacrosSnapshot.proteinG;
        macros.carbG = initialMacrosSnapshot.carbG;
        macros.fatG = initialMacrosSnapshot.fatG;
        try {
            if (initialPrefsJson === null) sessionStorage.removeItem('groceryPrefs');
            else sessionStorage.setItem('groceryPrefs', initialPrefsJson);
        } catch {
            // ignore
        }
        if (prefs && typeof prefs === 'object') {
            prefs.macros = { ...initialMacrosSnapshot };
        }
        choiceMap = { ...initialChoiceMapSnapshot };
        sessionStorage.setItem(choiceStoreKey, JSON.stringify(choiceMap));
        portionScale = 1;
        updateMacroDisplay(1);
        renderMealGrid(portionScale);
        lastTotals = renderBudgetAndList();
    });

    if (reconfigureBtn && reconfigureBtn.dataset.wiredReconfig !== '1') {
        reconfigureBtn.dataset.wiredReconfig = '1';
        reconfigureBtn.addEventListener('click', () => {
            // Toggle: pressing again restores the original plan behavior.
            if (reconfigureMinModeEnabled) {
                reconfigureMinModeEnabled = false;
                const snap = reconfigureBaselineSnapshot || { ...initialMacrosSnapshot };
                macros.calories = snap.calories;
                macros.proteinG = snap.proteinG;
                macros.carbG = snap.carbG;
                macros.fatG = snap.fatG;

                try {
                    if (reconfigurePrefsJsonSnapshot === null) sessionStorage.removeItem('groceryPrefs');
                    else if (typeof reconfigurePrefsJsonSnapshot === 'string') sessionStorage.setItem('groceryPrefs', reconfigurePrefsJsonSnapshot);
                } catch {
                    // ignore
                }
                reconfigurePrefsJsonSnapshot = null;
                reconfigureBaselineSnapshot = null;

                // Restore prior grocery choices.
                choiceMap = { ...(reconfigureChoiceMapSnapshot || initialChoiceMapSnapshot) };
                reconfigureChoiceMapSnapshot = null;
                sessionStorage.setItem(choiceStoreKey, JSON.stringify(choiceMap));

                portionScale = 1;
                updateMacroDisplay(1);
                renderMealGrid(portionScale);
                lastTotals = renderBudgetAndList();
                return;
            }

            reconfigureMinModeEnabled = true;
            // Don't reuse prior grocery state; default to cheapest choices for the rebuilt plan.
            reconfigureBaselineSnapshot = { calories: macros.calories, proteinG: macros.proteinG, carbG: macros.carbG, fatG: macros.fatG };
            try {
                reconfigurePrefsJsonSnapshot = sessionStorage.getItem('groceryPrefs');
            } catch {
                reconfigurePrefsJsonSnapshot = null;
            }
            reconfigureChoiceMapSnapshot = { ...choiceMap };
            choiceMap = {};
            try {
                sessionStorage.removeItem(choiceStoreKey);
            } catch {
                // ignore
            }

            const next = deriveMinimumViableMacrosForReconfigureMode({
                baselineMacros: { calories: macros.calories, proteinG: macros.proteinG, carbG: macros.carbG, fatG: macros.fatG },
                goalRaw: nutritionState.selections?.goal || prefs?.mode || 'RECOMP',
                weightLbs: prefs?.weightLbs || nutritionState.selections?.weightLbs || 170,
                sex: nutritionState.selections?.sex || prefs?.sex || null,
                intensityRaw: nutritionState.selections?.intensity || prefs?.intensity || null,
                frequencyRaw: nutritionState.selections?.frequency || prefs?.frequency || null
            });

            macros.calories = next.calories;
            macros.proteinG = next.proteinG;
            macros.carbG = next.carbG;
            macros.fatG = next.fatG;

            portionScale = 1;
            updateMacroDisplay(1);
            renderMealGrid(portionScale);
            lastTotals = renderBudgetAndList();
            console.log('[RECONFIGURE]', { calories: next.calories, protein: next.proteinG, carbs: next.carbG, fat: next.fatG });
        });
    }

    const getMonthlyCostForChoice = (item, choice) => {
        const servings = Number(item.weeklyServings);
        if (!Number.isFinite(servings) || !choice || !Number.isFinite(item.servingGrams)) return null;
        const pricePerGram = pricePerGramFromItem(choice, item.servingGrams);
        if (!Number.isFinite(pricePerGram)) return null;
        const weeklyCost = servings * pricePerGram * item.servingGrams;
        // Keep weekly/monthly internally consistent: monthly is a 30-day normalized estimate.
        return weeklyCost * (30 / 7);
    };

    const setAllChoicesToCheapest = () => {
        allItems.forEach(item => {
            setChoice(item.queryKey, 0);
        });
        lastTotals = renderBudgetAndList();
        renderMealGrid(1);
    };

    cheaperMacrosBtn?.addEventListener('click', () => {
        alert('Lockdown pass: budget actions do not rescale macros. Use Swap (cheaper items) instead.');
        closeCheaperModal();
    });

    cheaperFoodsBtn?.addEventListener('click', () => {
        setAllChoicesToCheapest();
        closeCheaperModal();
    });

    const buildCustomPanel = () => {
        if (!cheaperCustomList) return;
        const tempChoiceMap = {};
        allItems.forEach(item => {
            tempChoiceMap[item.queryKey] = getChoice(item.queryKey);
        });

        const renderCustomRows = () => {
            cheaperCustomList.innerHTML = allItems.map(item => {
                const choices = Array.isArray(item.entry?.top_two_by_oz)
                    ? item.entry.top_two_by_oz.slice(0, 2)
                    : (item.cheapest ? [item.cheapest] : []);
                item.choices = choices;
                const currentIdx = tempChoiceMap[item.queryKey] ?? 0;
                const optionsHtml = choices.map((choice, idx) => {
                    const monthlyCost = getMonthlyCostForChoice(item, choice);
                    const priceText = Number.isFinite(monthlyCost) ? `${formatCurrency(monthlyCost)}/mo` : '-';
                    const name = choice?.name || item.query || item.name;
                    return `<option value="${idx}" ${idx === currentIdx ? 'selected' : ''}>${name} Ã‚Â· ${priceText}</option>`;
                }).join('');
                const currentChoice = choices[currentIdx] || choices[0] || null;
                const currentCost = getMonthlyCostForChoice(item, currentChoice);
                const currentCostText = Number.isFinite(currentCost) ? `${formatCurrency(currentCost)}/mo` : '-';
                return `
                    <div class="cheaper-row">
                        <div>
                            <strong>${item.query || item.name}</strong>
                            <small>Current: ${currentCostText}</small>
                        </div>
                        <select data-key="${item.queryKey}">
                            ${optionsHtml}
                        </select>
                    </div>
                `;
            }).join('');

            cheaperCustomList.querySelectorAll('select').forEach(select => {
                select.addEventListener('change', () => {
                    const key = select.getAttribute('data-key');
                    const idx = Number(select.value || 0);
                    tempChoiceMap[key] = idx;
                    updateCustomSummary();
                });
            });
        };

        const updateCustomSummary = () => {
            let currentTotal = 0;
            let newTotal = 0;
            const changes = [];
            allItems.forEach(item => {
                const choices = item.choices || [];
                const currentIdx = getChoice(item.queryKey);
                const newIdx = tempChoiceMap[item.queryKey] ?? currentIdx;
                const currentCost = getMonthlyCostForChoice(item, choices[currentIdx]);
                const newCost = getMonthlyCostForChoice(item, choices[newIdx]);
                if (Number.isFinite(currentCost)) currentTotal += currentCost;
                if (Number.isFinite(newCost)) newTotal += newCost;
                if (newIdx !== currentIdx) {
                    const fromName = choices[currentIdx]?.name || item.query || item.name;
                    const toName = choices[newIdx]?.name || item.query || item.name;
                    changes.push(`Replace ${fromName} with ${toName}`);
                }
            });
            const savings = Math.max(0, currentTotal - newTotal);
            if (cheaperSavings) cheaperSavings.textContent = `Saves ${formatCurrency(savings)} with these changes`;
            if (cheaperChanges) {
                cheaperChanges.innerHTML = changes.length
                    ? changes.map(change => `<div>${change}</div>`).join('')
                    : '<div>No changes selected.</div>';
            }
        };

        renderCustomRows();
        updateCustomSummary();

        cheaperConfirm?.addEventListener('click', () => {
            Object.entries(tempChoiceMap).forEach(([key, idx]) => {
                setChoice(key, idx);
            });
            lastTotals = renderBudgetAndList();
            renderMealGrid(1);
            closeCheaperModal();
        }, { once: true });
    };

    cheaperCustomBtn?.addEventListener('click', () => {
        cheaperOptions?.classList.add('hidden');
        cheaperCustomPanel?.classList.remove('hidden');
        buildCustomPanel();
    });

    const calendarEl = document.getElementById('food-calendar');
    const month1El = document.getElementById('calendar-month-1');
    const calendarRange = document.getElementById('calendar-range');
    const calendarPrev = document.getElementById('calendar-prev');
    const calendarNext = document.getElementById('calendar-next');

    const parseStartDate = () => {
        const stored = prefs?.startDate || sessionStorage.getItem('groceryStartDate');
        const parsed = stored ? new Date(stored) : new Date();
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    const formatMonthTitle = (date) => date.toLocaleString('default', { month: 'long', year: 'numeric' });
    const formatDateKey = (date) => date.toISOString().slice(0, 10);

    const buildCalendarEvents = (startDate, endDate, overrides, expiredOverrides, skipOverrides, autoRestock) => {
        const events = {};
        const lowDaysThreshold = 2;
        const defaultBuyDate = new Date(startDate);
        defaultBuyDate.setDate(defaultBuyDate.getDate() + 1);
        const defaultBuyKey = formatDateKey(defaultBuyDate);
        allItems.forEach(item => {
            const servings = Number(item.weeklyServings);
            const weeklyCost = Number(item.weeklyCost);
            if (!Number.isFinite(servings) || servings <= 0) return;
            const dailyServings = servings / 7;
            let remaining = 0;
            const dayCursor = new Date(startDate);
            while (dayCursor <= endDate) {
                const key = formatDateKey(dayCursor);
                if (!events[key]) events[key] = [];
                let status = 'ok';
                let buyToday = false;

                const manualBuy = overrides?.[key]?.includes(item.queryKey);
                const manualExpired = expiredOverrides?.[key]?.includes(item.queryKey);
                const manualSkip = skipOverrides?.[key]?.includes(item.queryKey);
                if (manualExpired) {
                    buyToday = true;
                    status = 'expired';
                    remaining = servings;
                } else if (manualBuy || key === defaultBuyKey) {
                    buyToday = true;
                    status = 'buy';
                    remaining = servings;
                } else if (autoRestock && remaining <= dailyServings * lowDaysThreshold && remaining > 0) {
                    buyToday = true;
                    status = 'buy';
                    remaining = servings;
                }

                if (!buyToday && !manualSkip) {
                    remaining = Math.max(0, remaining - dailyServings);
                }
                const displayRemaining = remaining;
                if (!buyToday && remaining === 0) {
                    status = 'buy';
                } else if (!buyToday && remaining > 0 && remaining <= dailyServings * lowDaysThreshold) {
                    status = 'low';
                }

                events[key].push({
                    name: item.query || item.name,
                    queryKey: item.queryKey,
                    dailyServings,
                    remaining,
                    displayRemaining,
                    status,
                    buyToday,
                    unitLabel: item.macros?.household_serving || 'serving',
                    price: Number.isFinite(weeklyCost) ? formatCurrency(weeklyCost) : '-'
                });

                dayCursor.setDate(dayCursor.getDate() + 1);
            }
        });
        return events;
    };

    const renderMonth = (targetEl, year, monthIndex, startDate, events) => {
        if (!targetEl) return;
        const monthStart = new Date(year, monthIndex, 1);
        const monthEnd = new Date(year, monthIndex + 1, 0);
        const startWeekday = monthStart.getDay();
        const daysInMonth = monthEnd.getDate();
        const monthTitle = formatMonthTitle(monthStart);

        const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            .map(label => `<div class="calendar-weekday">${label}</div>`)
            .join('');

        const cells = [];
        for (let i = 0; i < startWeekday; i += 1) {
            cells.push('<div class="calendar-cell is-empty"></div>');
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            const current = new Date(year, monthIndex, day);
            const key = formatDateKey(current);
            const dayEvents = events[key] || [];
            const isStart = formatDateKey(current) === formatDateKey(startDate);
            const hasBuy = dayEvents.some(event => event.status === 'buy');
            const hasLow = dayEvents.some(event => event.status === 'low');
            const cellClasses = [
                'calendar-cell',
                hasBuy ? 'has-buy' : '',
                !hasBuy && hasLow ? 'has-low' : '',
                isStart ? 'is-start' : ''
            ].filter(Boolean).join(' ');

            const sortedEvents = dayEvents
                .slice()
                .sort((a, b) => a.remaining - b.remaining);
            const items = sortedEvents.slice(0, 1).map(event => {
                const statusLabel = event.status === 'buy' || event.status === 'expired'
                    ? 'Buy'
                    : (event.status === 'low' ? 'Low' : 'Ok');
                return `<div class="calendar-item">${event.name}: ${statusLabel}</div>`;
            }).join('');
            const moreCount = dayEvents.length ? `<div class="calendar-item calendar-more">Click to Expand</div>` : '';
            const titleText = sortedEvents.map(event => {
                const statusText = event.status === 'buy' ? `BUY (${event.price})` : (event.status === 'low' ? 'LOW' : 'OK');
                const remainingValue = Number.isFinite(event.displayRemaining) ? event.displayRemaining : event.remaining;
                return `${event.name} ${EM_DASH} ${remainingValue.toFixed(2)} servings left Ã‚Â· ${statusText}`;
            }).join('\n');

            cells.push(`
                <div class="${cellClasses}" data-key="${key}"${titleText ? ` title="${titleText.replace(/"/g, '')}"` : ''}>
                    <div class="calendar-day">${day}</div>
                    <div class="calendar-items">
                        ${items}
                        ${moreCount}
                    </div>
                </div>
            `);
        }

        targetEl.innerHTML = `
            <div class="calendar-month-head">
                <div class="calendar-month-title">${monthTitle}</div>
                <div class="calendar-month-tools">
                    <span class="calendar-pill" id="calendar-pill-buy" draggable="true">Bought today</span>
                    <span class="calendar-pill expired" id="calendar-pill-expired" draggable="true">Expired</span>
                    <span class="calendar-pill skip" id="calendar-pill-skip" draggable="true">Didn't eat</span>
                    <button class="calendar-pill redo" id="redo-plan-btn" type="button">Redo plan</button>
                    <label class="calendar-toggle" for="auto-restock-toggle">
                        <input type="checkbox" id="auto-restock-toggle">
                        <span>Auto restock</span>
                    </label>
                </div>
            </div>
            <div class="calendar-grid">
                ${weekdayLabels}
                ${cells.join('')}
            </div>
        `;
    };

    if (calendarEl && month1El) {
        const startDate = parseStartDate();
        const monthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 2, 0);
        let purchaseOverrides = {};
        let expiredOverrides = {};
        let skipOverrides = {};
        try {
            purchaseOverrides = JSON.parse(sessionStorage.getItem('groceryPurchaseOverrides') || '{}');
        } catch (err) {
            purchaseOverrides = {};
        }
        try {
            expiredOverrides = JSON.parse(sessionStorage.getItem('groceryExpiredOverrides') || '{}');
        } catch (err) {
            expiredOverrides = {};
        }
        try {
            skipOverrides = JSON.parse(sessionStorage.getItem('grocerySkipOverrides') || '{}');
        } catch (err) {
            skipOverrides = {};
        }
        const storedAuto = sessionStorage.getItem('groceryAutoRestock');
        let autoRestock = storedAuto === 'true';
        let events = buildCalendarEvents(startDate, endDate, purchaseOverrides, expiredOverrides, skipOverrides, autoRestock);
        let monthOffset = 0;
        const minOffset = 0;
        const maxOffset = 1;

        const renderCurrent = () => {
            const currentMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + monthOffset, 1);
            renderMonth(month1El, currentMonth.getFullYear(), currentMonth.getMonth(), startDate, events);
            if (calendarRange) {
                calendarRange.textContent = formatMonthTitle(currentMonth);
            }
            if (calendarPrev) {
                calendarPrev.disabled = monthOffset <= minOffset;
                calendarPrev.setAttribute('aria-disabled', String(monthOffset <= minOffset));
            }
            if (calendarNext) {
                calendarNext.disabled = monthOffset >= maxOffset;
                calendarNext.setAttribute('aria-disabled', String(monthOffset >= maxOffset));
            }

            const detailDate = document.getElementById('calendar-detail-date');
            const detailBody = document.getElementById('calendar-detail-body');
            const picker = document.getElementById('calendar-picker');
            const pickerDate = document.getElementById('calendar-picker-date');
            const pickerTitle = document.getElementById('calendar-picker-title');
            const pickerBody = document.getElementById('calendar-picker-body');
            const pickerClose = document.getElementById('calendar-picker-close');
            const pickerCancel = document.getElementById('calendar-picker-cancel');
            const pickerSave = document.getElementById('calendar-picker-save');
            const pillBuy = month1El.querySelector('#calendar-pill-buy');
            const pillExpired = month1El.querySelector('#calendar-pill-expired');
            const pillSkip = month1El.querySelector('#calendar-pill-skip');
            const redoBtn = month1El.querySelector('#redo-plan-btn');
            const autoToggle = month1El.querySelector('#auto-restock-toggle');
            let selectedKey = null;
            let pickerMode = 'buy';

            const openPicker = (dateKey, mode) => {
                selectedKey = dateKey;
                pickerMode = mode || 'buy';
                if (pickerTitle) {
                    pickerTitle.textContent = pickerMode === 'expired'
                        ? 'Log expired items'
                        : (pickerMode === 'skip' ? 'Log skipped items' : 'Log purchase');
                }
                if (pickerDate) {
                    const dateObj = new Date(dateKey);
                    pickerDate.textContent = dateObj.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
                }
                if (pickerBody) {
                    const selected = new Set(
                        (pickerMode === 'expired'
                            ? expiredOverrides?.[dateKey]
                            : (pickerMode === 'skip' ? skipOverrides?.[dateKey] : purchaseOverrides?.[dateKey])) || []
                    );
                    pickerBody.innerHTML = allItems.map(item => {
                        const checked = selected.has(item.queryKey) ? 'checked' : '';
                        return `
                            <label class="calendar-picker-item">
                                <input type="checkbox" data-key="${item.queryKey}" ${checked}>
                                <span>${item.query || item.name}</span>
                            </label>
                        `;
                    }).join('');
                }
                picker?.classList.remove('hidden');
            };

            const closePicker = () => {
                picker?.classList.add('hidden');
                selectedKey = null;
            };

            pickerClose?.addEventListener('click', closePicker);
            pickerCancel?.addEventListener('click', closePicker);
            picker?.addEventListener('click', (event) => {
                if (event.target === picker) closePicker();
            });

            pickerSave?.addEventListener('click', () => {
                if (!selectedKey || !pickerBody) return;
                const checkedKeys = Array.from(pickerBody.querySelectorAll('input[type="checkbox"]'))
                    .filter(input => input.checked)
                    .map(input => input.getAttribute('data-key'));
                if (pickerMode === 'expired') {
                    expiredOverrides[selectedKey] = checkedKeys;
                    sessionStorage.setItem('groceryExpiredOverrides', JSON.stringify(expiredOverrides));
                } else if (pickerMode === 'skip') {
                    skipOverrides[selectedKey] = checkedKeys;
                    sessionStorage.setItem('grocerySkipOverrides', JSON.stringify(skipOverrides));
                } else {
                    purchaseOverrides[selectedKey] = checkedKeys;
                    sessionStorage.setItem('groceryPurchaseOverrides', JSON.stringify(purchaseOverrides));
                }
                events = buildCalendarEvents(startDate, endDate, purchaseOverrides, expiredOverrides, skipOverrides, autoRestock);
                closePicker();
                renderCurrent();
            });

            if (pillBuy) {
                pillBuy.addEventListener('dragstart', (event) => {
                    event.dataTransfer?.setData('text/plain', 'calendar-buy-pill');
                });
            }
            if (pillExpired) {
                pillExpired.addEventListener('dragstart', (event) => {
                    event.dataTransfer?.setData('text/plain', 'calendar-expired-pill');
                });
            }
            if (pillSkip) {
                pillSkip.addEventListener('dragstart', (event) => {
                    event.dataTransfer?.setData('text/plain', 'calendar-skip-pill');
                });
            }

            if (autoToggle) {
                autoToggle.checked = autoRestock;
                autoToggle.addEventListener('change', () => {
                    autoRestock = autoToggle.checked;
                    sessionStorage.setItem('groceryAutoRestock', String(autoRestock));
                    events = buildCalendarEvents(startDate, endDate, purchaseOverrides, expiredOverrides, skipOverrides, autoRestock);
                    renderCurrent();
                });
            }

            redoBtn?.addEventListener('click', () => {
                const ok = window.confirm('Redo meal plan? Current plan data will be lost.');
                if (!ok) return;
                sessionStorage.removeItem('grocerySession');
                sessionStorage.removeItem('groceryPrefs');
                sessionStorage.removeItem('groceryPurchaseOverrides');
                sessionStorage.removeItem('groceryExpiredOverrides');
                sessionStorage.removeItem('groceryStartDate');
                window.location.href = 'overview.html';
            });

            const cells = month1El.querySelectorAll('.calendar-cell[data-key]');
            cells.forEach(cell => {
                cell.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    cell.classList.add('is-drop');
                });
                cell.addEventListener('dragleave', () => cell.classList.remove('is-drop'));
                cell.addEventListener('drop', (event) => {
                    event.preventDefault();
                    cell.classList.remove('is-drop');
                    const key = cell.getAttribute('data-key');
                    const type = event.dataTransfer?.getData('text/plain');
                    if (type === 'calendar-expired-pill') {
                        openPicker(key, 'expired');
                    } else if (type === 'calendar-skip-pill') {
                        openPicker(key, 'skip');
                    } else {
                        openPicker(key, 'buy');
                    }
                });
                cell.addEventListener('click', () => {
                    cells.forEach(el => el.classList.remove('is-selected'));
                    cell.classList.add('is-selected');
                    const key = cell.getAttribute('data-key');
                    const dayEvents = events[key] || [];
                    if (detailDate) {
                        const dateObj = new Date(key);
                        detailDate.textContent = dateObj.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
                    }
                    if (detailBody) {
                        if (!dayEvents.length) {
                            detailBody.innerHTML = '<div class="calendar-detail-empty">No items tracked for this day.</div>';
                            return;
                        }
                        const detailRows = dayEvents
                            .slice()
                            .sort((a, b) => a.remaining - b.remaining)
                            .map(event => {
                                const unitLabel = String(event.unitLabel || 'serving');
                                const remainingValue = Number.isFinite(event.displayRemaining) ? event.displayRemaining : event.remaining;
                                let remainingText = `${remainingValue.toFixed(1)} ${unitLabel} left`;
                                const unitMatch = unitLabel.match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
                                if (unitMatch) {
                                    const unitValue = Number(unitMatch[1]);
                                    const unitName = unitMatch[2];
                                    if (Number.isFinite(unitValue) && unitValue > 0) {
                                        const qtyLeft = remainingValue * unitValue;
                                        remainingText = `${qtyLeft.toFixed(1)} ${unitName} left`;
                                    }
                                }
                                const badgeClass = event.status === 'buy' || event.status === 'expired' ? 'buy' : (event.status === 'low' ? 'low' : '');
                                const badgeLabel = event.status === 'expired' ? 'Expired' : (event.status === 'buy' ? 'Buy today' : (event.status === 'low' ? 'Low' : 'OK'));
                                const priceText = event.status === 'buy' || event.status === 'expired' ? ` Ã‚Â· ${event.price}` : '';
                                return `
                                    <div class="calendar-detail-item">
                                        <div class="calendar-detail-name">${event.name}</div>
                                        <div class="calendar-detail-meta">
                                            ${remainingText}${priceText}
                                            <div class="calendar-detail-badge ${badgeClass}">${badgeLabel}</div>
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        detailBody.innerHTML = detailRows;
                    }
                });
            });
        };

        renderCurrent();

        calendarPrev?.addEventListener('click', () => {
            monthOffset = Math.max(minOffset, monthOffset - 1);
            renderCurrent();
        });
        calendarNext?.addEventListener('click', () => {
            monthOffset = Math.min(maxOffset, monthOffset + 1);
            renderCurrent();
        });
    }

    const addToCartBtn = document.getElementById('add-to-cart-btn');
    const addToCartNote = document.getElementById('add-to-cart-note');
    const walmartOverlay = document.getElementById('walmart-overlay');
    const walmartOverlayClose = document.getElementById('walmart-overlay-close');
    const walmartOverlayStatus = document.getElementById('walmart-overlay-status');
    const walmartOverlayPopup = document.getElementById('walmart-overlay-popup');
    const CART_URL = 'https://www.walmart.com/cart';

    const setOverlayStatus = (message, isError = false) => {
        if (!walmartOverlayStatus) return;
        walmartOverlayStatus.textContent = message;
        walmartOverlayStatus.classList.toggle('error', isError);
    };

    const openWalmartCartPopup = () => {
        const popup = window.open(
            CART_URL,
            'walmartCartPopup',
            'popup=yes,width=1100,height=900,scrollbars=yes,resizable=yes'
        );
        if (!popup) return false;
        try {
            popup.focus();
        } catch (err) {
            // ignore focus errors in strict browsers
        }
        return true;
    };

    const updateCartUi = (state) => {
        if (!addToCartBtn) return;
        if (state === 'loading') {
            addToCartBtn.disabled = true;
            addToCartBtn.textContent = 'Opening Walmart cart...';
            return;
        }
        addToCartBtn.disabled = false;
        addToCartBtn.textContent = 'Open Walmart cart';
    };

    if (addToCartBtn) {
        addToCartBtn.addEventListener('click', async () => {
            updateCartUi('loading');
            try {
                if (walmartOverlay) {
                    walmartOverlay.classList.add('active');
                    walmartOverlay.setAttribute('aria-hidden', 'false');
                }
                setOverlayStatus('Opening your Walmart cart popup...', false);
                const opened = openWalmartCartPopup();
                if (opened) {
                    setOverlayStatus('Walmart cart opened in a popup window. Keep this plan open here.', false);
                    if (addToCartNote) addToCartNote.textContent = 'Cart opened in a popup window.';
                } else {
                    setOverlayStatus('Popup blocked. Allow popups for this site, then click "Open cart popup" to retry.', true);
                    if (addToCartNote) addToCartNote.textContent = 'Popup blocked. Allow popups, then retry.';
                }
            } catch (err) {
                console.warn('Walmart cart open error:', err.message);
            } finally {
                updateCartUi('idle');
            }
        });
    }

    const closeWalmartOverlay = () => {
        if (!walmartOverlay) return;
        walmartOverlay.classList.remove('active');
        walmartOverlay.setAttribute('aria-hidden', 'true');
        setOverlayStatus('We will open your Walmart cart in a popup so you can keep this plan open.', false);
    };

    walmartOverlayClose?.addEventListener('click', closeWalmartOverlay);
    walmartOverlayPopup?.addEventListener('click', () => {
        setOverlayStatus('Opening your Walmart cart popup...', false);
        const opened = openWalmartCartPopup();
        if (opened) {
            setOverlayStatus('Walmart cart opened in a popup window. Keep this plan open here.', false);
            if (addToCartNote) addToCartNote.textContent = 'Cart opened in a popup window.';
        } else {
            setOverlayStatus('Popup blocked. Allow popups for this site, then click "Open cart popup" to retry.', true);
            if (addToCartNote) addToCartNote.textContent = 'Popup blocked. Allow popups, then retry.';
        }
    });
    walmartOverlay?.addEventListener('click', (event) => {
        if (event.target === walmartOverlay) {
            closeWalmartOverlay();
        }
    });
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && walmartOverlay?.classList.contains('active')) {
            closeWalmartOverlay();
        }
    });

    /**
     * ============================================================
     * CALORIE-FIRST MEAL PLANNING ENGINE
     * 
     * Philosophy: Calories are primary constraint, macros are soft.
     * This ensures meals sum to daily target reliably.
     * ============================================================
     */

    /**
     * Validates if a food's macros match its stated calories.
     * Rejects foods with bad macro-calorie alignment.
     * 
     * @param {Object} food - { macros: { protein_g, carbs_g, fat_g, calories } }
     * @returns {boolean} true if valid, false if density error > 15%
     */
    /**
     * ============================================================
     * PRIORITY-DRIVEN MEAL OPTIMIZATION ENGINE
     * 
     * Philosophy: Calories decide. Protein builds. Carbs support. Fat is capped.
     * 
     * This engine dynamically selects food combinations to minimize error
     * across multiple competing constraints with strict priority ordering.
     * ============================================================
     */



    // Workout plan intentionally excluded from grocery plan page.
}
function populateTimeSelects() {
    const wakeSelect = document.getElementById('g-wake-time');
    const workoutSelect = document.getElementById('g-workout-time');
    if (!wakeSelect || !workoutSelect) return;

    const makeOptions = () => {
        const options = [];
        for (let h = 0; h < 24; h += 1) {
            for (let m = 0; m < 60; m += 30) {
                const hour12 = h % 12 === 0 ? 12 : h % 12;
                const ampm = h < 12 ? 'AM' : 'PM';
                const mm = m.toString().padStart(2, '0');
                const label = `${hour12}:${mm} ${ampm}`;
                const value = `${h.toString().padStart(2, '0')}:${mm}`;
                options.push({ label, value });
            }
        }
        return options;
    };

    const options = makeOptions();
    const build = (selectEl) => {
        selectEl.innerHTML = '<option value="">Select time</option>' + options
            .map(o => `<option value="${o.value}">${o.label}</option>`)
            .join('');
    };

    build(wakeSelect);
    build(workoutSelect);
}

function toggleControlPanel() {
    if (controlPanel.classList.contains('collapsed')) {
        openControlPanel();
    } else {
        collapseControlPanel();
    }
}

function openControlPanel() {
    controlPanel.classList.add('open');
    controlPanel.classList.remove('collapsed');
    document.body.classList.add('control-open');
    document.body.classList.remove('control-collapsed');
    setTimeout(() => {
        const first = controlPanel.querySelector('a,button,input');
        first?.focus();
    }, 10);
}

function collapseControlPanel() {
    controlPanel?.classList.remove('open');
    controlPanel?.classList.add('collapsed');
    document.body.classList.add('control-collapsed');
    document.body.classList.remove('control-open');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        collapseControlPanel();
    }
});














