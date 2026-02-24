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

function getActiveBudgetModeFromSession() {
    try {
        const raw = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
        const mode = String(raw?.budgetMode || '').trim().toLowerCase();
        if (mode === 'budget' || mode === 'balanced' || mode === 'best') return mode;
    } catch {
        // ignore
    }
    return 'best';
}

function getPlannerOvershootConfig({ isCutPhase, budgetMode, relaxed = false }) {
    const mode = String(budgetMode || 'best').toLowerCase();
    const strictCalOver = isCutPhase ? (mode === 'budget' ? 120 : (mode === 'balanced' ? 80 : 60)) : 0;
    const strictCarbOver = isCutPhase ? (mode === 'budget' ? 60 : (mode === 'balanced' ? 30 : 15)) : 0;
    const strictProteinOverPct = isCutPhase ? (mode === 'budget' ? 1.20 : (mode === 'balanced' ? 1.10 : 1.05)) : 1.00;
    const strictFatOver = isCutPhase ? (mode === 'budget' ? 2 : 0) : 0;
    if (!relaxed) {
        return {
            caloriesOver: strictCalOver,
            carbsOver: strictCarbOver,
            proteinOverPct: strictProteinOverPct,
            fatOver: strictFatOver
        };
    }
    return {
        caloriesOver: isCutPhase ? (mode === 'budget' ? 180 : 140) : 220,
        carbsOver: isCutPhase ? (mode === 'budget' ? 90 : 60) : 80,
        proteinOverPct: isCutPhase ? (strictProteinOverPct + 0.05) : 1.08,
        fatOver: isCutPhase ? Math.max(strictFatOver, 4) : 6
    };
}

function passesPlannerOvershootGate({ totals, targets, overshootConfig }) {
    const cfg = overshootConfig || {};
    const t = targets || {};
    const a = totals || {};
    return (
        (Number(a.calories) || 0) <= ((Number(t.calories) || 0) + (Number(cfg.caloriesOver) || 0)) &&
        (Number(a.protein_g) || 0) <= Math.ceil((Number(t.protein_g) || 0) * (Number(cfg.proteinOverPct) || 1)) &&
        (Number(a.carbs_g) || 0) <= ((Number(t.carbs_g) || 0) + (Number(cfg.carbsOver) || 0)) &&
        (Number(a.fat_g) || 0) <= ((Number(t.fat_g) || 0) + (Number(cfg.fatOver) || 0))
    );
}

function buildPlannerOvershootBreakdown({ totals, targets, overshootConfig }) {
    const cfg = overshootConfig || {};
    const t = targets || {};
    const a = totals || {};
    const caps = {
        caloriesCap: (Number(t.calories) || 0) + (Number(cfg.caloriesOver) || 0),
        proteinCap: Math.ceil((Number(t.protein_g) || 0) * (Number(cfg.proteinOverPct) || 1)),
        carbsCap: (Number(t.carbs_g) || 0) + (Number(cfg.carbsOver) || 0),
        fatCap: (Number(t.fat_g) || 0) + (Number(cfg.fatOver) || 0)
    };
    const checks = {
        calories: (Number(a.calories) || 0) <= caps.caloriesCap,
        protein_g: (Number(a.protein_g) || 0) <= caps.proteinCap,
        carbs_g: (Number(a.carbs_g) || 0) <= caps.carbsCap,
        fat_g: (Number(a.fat_g) || 0) <= caps.fatCap
    };
    return {
        totals: a,
        targets: t,
        config: cfg,
        caps,
        checks,
        equations: {
            calories: `${Number(a.calories) || 0} <= ${caps.caloriesCap}`,
            protein_g: `${Number(a.protein_g) || 0} <= ${caps.proteinCap}`,
            carbs_g: `${Number(a.carbs_g) || 0} <= ${caps.carbsCap}`,
            fat_g: `${Number(a.fat_g) || 0} <= ${caps.fatCap}`
        },
        pass: checks.calories && checks.protein_g && checks.carbs_g && checks.fat_g
    };
}

function scalePlanToOvershootCaps(plan, caps) {
    if (!plan || !Array.isArray(plan.meals) || !plan.meals.length) return null;
    const baseTotals = computeTotalsFromBuiltMeals(plan.meals);
    const factors = [];
    if ((Number(baseTotals.calories) || 0) > (Number(caps.caloriesCap) || 0) && (Number(baseTotals.calories) || 0) > 0) {
        factors.push((Number(caps.caloriesCap) || 0) / (Number(baseTotals.calories) || 1));
    }
    if ((Number(baseTotals.protein_g) || 0) > (Number(caps.proteinCap) || 0) && (Number(baseTotals.protein_g) || 0) > 0) {
        factors.push((Number(caps.proteinCap) || 0) / (Number(baseTotals.protein_g) || 1));
    }
    if ((Number(baseTotals.carbs_g) || 0) > (Number(caps.carbsCap) || 0) && (Number(baseTotals.carbs_g) || 0) > 0) {
        factors.push((Number(caps.carbsCap) || 0) / (Number(baseTotals.carbs_g) || 1));
    }
    if ((Number(baseTotals.fat_g) || 0) > (Number(caps.fatCap) || 0) && (Number(baseTotals.fat_g) || 0) > 0) {
        factors.push((Number(caps.fatCap) || 0) / (Number(baseTotals.fat_g) || 1));
    }
    const scale = factors.length ? Math.min(...factors) : 1;
    if (!Number.isFinite(scale) || scale <= 0 || scale >= 0.999) return null;

    const scaledMeals = plan.meals.map((meal, idx) => {
        const foods = Array.isArray(meal?.foods) ? meal.foods : [];
        const scaledFoods = foods
            .map((item) => {
                const servings = (Number(item?.servings) || 0) * scale;
                const calories = Math.floor((Number(item?.calories) || 0) * scale);
                const protein_g = Math.floor((Number(item?.protein_g) || 0) * scale);
                const carbs_g = Math.floor((Number(item?.carbs_g) || 0) * scale);
                const fat_g = Math.floor((Number(item?.fat_g) || 0) * scale);
                const grams = Number.isFinite(Number(item?.grams)) ? Math.round(Number(item.grams) * scale * 10) / 10 : null;
                if (servings <= 0.01 && calories <= 0 && protein_g <= 0 && carbs_g <= 0 && fat_g <= 0) return null;
                return {
                    ...item,
                    servings: Math.round(servings * 100) / 100,
                    grams,
                    calories,
                    protein_g,
                    carbs_g,
                    fat_g,
                    measurementText: `${Math.round(servings * 100) / 100} servings`
                };
            })
            .filter(Boolean);
        return {
            ...(meal || {}),
            id: meal?.id || `meal_${idx + 1}`,
            foods: scaledFoods,
            totals: {
                calories: scaledFoods.reduce((sum, item) => sum + (Number(item?.calories) || 0), 0),
                protein_g: scaledFoods.reduce((sum, item) => sum + (Number(item?.protein_g) || 0), 0),
                carbs_g: scaledFoods.reduce((sum, item) => sum + (Number(item?.carbs_g) || 0), 0),
                fat_g: scaledFoods.reduce((sum, item) => sum + (Number(item?.fat_g) || 0), 0)
            }
        };
    });
    const scaledTotals = computeTotalsFromBuiltMeals(scaledMeals);
    return {
        meals: scaledMeals,
        dailyTotals: scaledTotals,
        scaleApplied: scale
    };
}

function passesPlannerMinimumGate({ totals, targets, relaxed = false }) {
    const minUndershoot = relaxed ? (MAX_MACRO_UNDERSHOOT + 0.05) : MAX_MACRO_UNDERSHOOT;
    const minFactor = Math.max(0, 1 - minUndershoot);
    const t = targets || {};
    const a = totals || {};
    return (
        (Number(a.calories) || 0) >= ((Number(t.calories) || 0) * minFactor) &&
        (Number(a.protein_g) || 0) >= ((Number(t.protein_g) || 0) * minFactor) &&
        (Number(a.carbs_g) || 0) >= ((Number(t.carbs_g) || 0) * minFactor) &&
        (Number(a.fat_g) || 0) >= ((Number(t.fat_g) || 0) * minFactor)
    );
}

function isCutGoalLike(goalRaw, normalizedGoal) {
    if (String(normalizedGoal || '').toUpperCase() === 'CUT') return true;
    const raw = String(goalRaw || '').trim().toUpperCase();
    return raw.includes('CUT') || raw.includes('FAT LOSS') || raw.includes('FAT-LOSS') || raw.includes('LOSE');
}

function computeTotalsFromBuiltMeals(meals) {
    const src = Array.isArray(meals) ? meals : [];
    const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    src.forEach((meal) => {
        (meal?.foods || []).forEach((item) => {
            totals.calories += Number(item?.calories) || 0;
            totals.protein_g += Number(item?.protein_g) || 0;
            totals.carbs_g += Number(item?.carbs_g) || 0;
            totals.fat_g += Number(item?.fat_g) || 0;
        });
    });
    return totals;
}

function enforceMacroClosureWithStaples(plan, selectedFoods, macroTargets, options = {}) {
    const srcMeals = Array.isArray(plan?.meals) ? plan.meals : [];
    if (!srcMeals.length) return plan;
    const foods = Array.isArray(selectedFoods) ? selectedFoods : [];
    const byId = new Map(foods.map((f) => [String(f?.id || ''), f]));
    const targets = {
        calories: Math.max(0, Number(macroTargets?.calories) || 0),
        protein_g: Math.max(0, Number(macroTargets?.protein_g) || 0),
        carbs_g: Math.max(0, Number(macroTargets?.carbs_g) || 0),
        fat_g: Math.max(0, Number(macroTargets?.fat_g) || 0)
    };
    const activeBudgetMode = String((typeof getActiveBudgetModeFromSession === 'function' ? getActiveBudgetModeFromSession() : 'best') || 'best').toLowerCase();
    const isBestMode = activeBudgetMode === 'best';
    const proteinCeiling = targets.protein_g + 5;
    const proteinCarbHeadroomCeiling = Math.min(proteinCeiling, targets.protein_g + 1);
    const meals = srcMeals.map((meal) => ({
        ...meal,
        foods: Array.isArray(meal?.foods) ? meal.foods.map((item) => ({ ...item })) : []
    }));

    const safePer = (food, key) => Math.max(0, Number(food?.macros?.[key]) || 0);
    const classifyType = (food) => {
        const explicit = String(food?.type || '').toLowerCase();
        if (explicit) return explicit;
        const category = String(food?.category || '').toLowerCase();
        if (category.includes('protein')) return 'protein';
        if (category.includes('carb')) return 'carb';
        if (category.includes('fat')) return 'fat';
        return 'other';
    };
    const proteinPer100Kcal = (food) => {
        const calories = Math.max(0, Number(food?.macros?.calories) || 0);
        const protein = Math.max(0, Number(food?.macros?.protein_g) || 0);
        if (calories <= 0) return Number.POSITIVE_INFINITY;
        return (protein * 100) / calories;
    };
    const carbsByLowProtein = foods
        .filter((f) => classifyType(f) === 'carb' && safePer(f, 'carbs_g') > 0)
        .sort((a, b) => {
            const aId = String(a?.id || '');
            const bId = String(b?.id || '');
            const aPref = (aId === 'white_rice_dry' || aId === 'russet_potatoes' || aId === 'banana_fresh_each') ? 1 : 0;
            const bPref = (bId === 'white_rice_dry' || bId === 'russet_potatoes' || bId === 'banana_fresh_each') ? 1 : 0;
            if (aPref !== bPref) return bPref - aPref;
            const aDensity = proteinPer100Kcal(a);
            const bDensity = proteinPer100Kcal(b);
            if (aDensity !== bDensity) return aDensity - bDensity;
            return aId.localeCompare(bId);
        });
    const fatsByLowProtein = foods
        .filter((f) => classifyType(f) === 'fat' && safePer(f, 'fat_g') > 0)
        .sort((a, b) => {
            const aId = String(a?.id || '');
            const bId = String(b?.id || '');
            const aPref = aId === 'olive_oil' ? 1 : 0;
            const bPref = bId === 'olive_oil' ? 1 : 0;
            if (aPref !== bPref) return bPref - aPref;
            const aDensity = proteinPer100Kcal(a);
            const bDensity = proteinPer100Kcal(b);
            if (aDensity !== bDensity) return aDensity - bDensity;
            const aFat = safePer(a, 'fat_g');
            const bFat = safePer(b, 'fat_g');
            if (aFat !== bFat) return bFat - aFat;
            return aId.localeCompare(bId);
        });
    const riceFood = byId.get('white_rice_dry') || byId.get('russet_potatoes') || carbsByLowProtein[0] || null;
    const oilFood = byId.get('olive_oil') || fatsByLowProtein[0] || null;
    const trimPriority = ['tilapia_fillet', 'chicken_breast', 'ground_turkey_93_7', 'eggs_large', 'ground_beef_80_20'];
    const buildItem = (food, servings) => {
        const s = Math.max(0, Number(servings) || 0);
        if (!food || s <= 0) return null;
        const grams = Number.isFinite(food?.servingGrams)
            ? Math.round(Number(food.servingGrams) * s * 10) / 10
            : Math.round((Number(food?.macros?.serving_size) || 100) * s * 10) / 10;
        return {
            foodId: String(food?.id || ''),
            foodName: String(food?.query || food?.name || 'Food'),
            servings: Math.round(s * 100) / 100,
            grams,
            measurementText: `${Math.round(s * 100) / 100} servings`,
            calories: Math.floor(safePer(food, 'calories') * s),
            protein_g: Math.floor(safePer(food, 'protein_g') * s),
            carbs_g: Math.floor(safePer(food, 'carbs_g') * s),
            fat_g: Math.floor(safePer(food, 'fat_g') * s)
        };
    };
    const recomputeMealTotals = (meal) => {
        const items = Array.isArray(meal?.foods) ? meal.foods : [];
        meal.totals = {
            calories: items.reduce((sum, item) => sum + (Number(item?.calories) || 0), 0),
            protein_g: items.reduce((sum, item) => sum + (Number(item?.protein_g) || 0), 0),
            carbs_g: items.reduce((sum, item) => sum + (Number(item?.carbs_g) || 0), 0),
            fat_g: items.reduce((sum, item) => sum + (Number(item?.fat_g) || 0), 0)
        };
    };
    const recomputeAll = () => {
        meals.forEach(recomputeMealTotals);
        return computeTotalsFromBuiltMeals(meals);
    };
    const setServingDelta = (mealIdx, food, delta, step = 0.25) => {
        if (!food || !Number.isFinite(mealIdx) || mealIdx < 0 || mealIdx >= meals.length) return false;
        const meal = meals[mealIdx];
        const items = Array.isArray(meal?.foods) ? meal.foods : [];
        const idx = items.findIndex((it) => String(it?.foodId || '') === String(food?.id || ''));
        const current = idx >= 0 ? (Number(items[idx]?.servings) || 0) : 0;
        const nextRaw = current + Number(delta || 0);
        const next = Math.round((nextRaw / step)) * step;
        if (next <= 0.01) {
            if (idx >= 0) items.splice(idx, 1);
            else return false;
        } else {
            const rebuilt = buildItem(food, next);
            if (!rebuilt) return false;
            if (idx >= 0) items[idx] = rebuilt;
            else items.push(rebuilt);
        }
        meal.foods = items;
        recomputeMealTotals(meal);
        return true;
    };
    const mealHasProtein = (meal) => {
        return (meal?.foods || []).some((item) => {
            const food = byId.get(String(item?.foodId || ''));
            return classifyType(food) === 'protein';
        });
    };
    const mealHasCarb = (meal) => {
        return (meal?.foods || []).some((item) => {
            const food = byId.get(String(item?.foodId || ''));
            return classifyType(food) === 'carb';
        });
    };
    const snapshotMeals = () => meals.map((meal) => ({
        ...meal,
        totals: { ...(meal?.totals || {}) },
        foods: Array.isArray(meal?.foods) ? meal.foods.map((item) => ({ ...item })) : []
    }));
    const restoreMeals = (snapshot) => {
        if (!Array.isArray(snapshot)) return;
        meals.splice(0, meals.length, ...snapshot.map((meal) => ({
            ...meal,
            totals: { ...(meal?.totals || {}) },
            foods: Array.isArray(meal?.foods) ? meal.foods.map((item) => ({ ...item })) : []
        })));
    };

    let totals = recomputeAll();
    const oilMaxServings = 2.0;

    const tryTrimProtein = (targetCeiling = proteinCeiling) => {
        if ((Number(totals?.protein_g) || 0) <= targetCeiling) return false;
        const candidates = [];
        meals.forEach((meal, mealIdx) => {
            (meal?.foods || []).forEach((item) => {
                const id = String(item?.foodId || '');
                const food = byId.get(id);
                if (!food) return;
                if (classifyType(food) !== 'protein') return;
                const servings = Number(item?.servings) || 0;
                if (servings <= 0.25) return;
                const priorityIdx = trimPriority.indexOf(id);
                const priority = priorityIdx >= 0 ? (100 - priorityIdx) : 0;
                candidates.push({ mealIdx, food, priority, protein: Number(item?.protein_g) || 0 });
            });
        });
        candidates.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            return b.protein - a.protein;
        });
        for (const c of candidates) {
            const meal = meals[c.mealIdx];
            const beforeFoods = meal.foods.map((i) => ({ ...i }));
            const beforeTotals = { ...totals };
            if (!setServingDelta(c.mealIdx, c.food, -0.25, 0.25)) continue;
            if (!mealHasProtein(meal)) {
                meal.foods = beforeFoods;
                recomputeMealTotals(meal);
                totals = beforeTotals;
                continue;
            }
            totals = recomputeAll();
            if ((Number(totals?.protein_g) || 0) < (Number(beforeTotals?.protein_g) || 0)) return true;
            meal.foods = beforeFoods;
            recomputeMealTotals(meal);
            totals = beforeTotals;
        }
        return false;
    };

    const ensureProteinHeadroomForCarbFill = () => {
        let changed = false;
        let guard = 0;
        while ((Number(totals?.protein_g) || 0) > proteinCarbHeadroomCeiling && guard < 40) {
            const didTrim = tryTrimProtein(proteinCarbHeadroomCeiling);
            if (!didTrim) break;
            changed = true;
            guard += 1;
        }
        return changed;
    };

    const tryAddOil = () => {
        if (!oilFood) return false;
        const fatDef = (Number(targets?.fat_g) || 0) - (Number(totals?.fat_g) || 0);
        const calDef = (Number(targets?.calories) || 0) - (Number(totals?.calories) || 0);
        if (fatDef <= 1 && calDef <= 60) return false;
        const usedServings = meals.reduce((sum, meal) => {
            const it = (meal?.foods || []).find((x) => String(x?.foodId || '') === String(oilFood?.id || ''));
            return sum + (Number(it?.servings) || 0);
        }, 0);
        if (usedServings >= oilMaxServings) return false;
        const mealOrder = meals
            .map((meal, idx) => ({ idx, calories: Number(meal?.totals?.calories) || 0 }))
            .sort((a, b) => a.calories - b.calories)
            .map((x) => x.idx);
        for (const mealIdx of mealOrder) {
            const meal = meals[mealIdx];
            const beforeFoods = meal.foods.map((i) => ({ ...i }));
            const beforeTotals = { ...totals };
            if (!setServingDelta(mealIdx, oilFood, +0.5, 0.5)) continue;
            totals = recomputeAll();
            const proteinBefore = Number(beforeTotals?.protein_g) || 0;
            const proteinAfter = Number(totals?.protein_g) || 0;
            const proteinOk = proteinAfter <= Math.max(proteinCeiling, proteinBefore);
            const noMacroOvershoot = (
                (Number(totals?.fat_g) || 0) <= ((Number(targets?.fat_g) || 0) + 10) &&
                (Number(totals?.calories) || 0) <= ((Number(targets?.calories) || 0) + 180)
            );
            if (proteinOk && noMacroOvershoot) return true;
            meal.foods = beforeFoods;
            recomputeMealTotals(meal);
            totals = beforeTotals;
        }
        return false;
    };

    const tryAddRice = () => {
        if (!riceFood) return false;
        const carbDef = (Number(targets?.carbs_g) || 0) - (Number(totals?.carbs_g) || 0);
        const calDef = (Number(targets?.calories) || 0) - (Number(totals?.calories) || 0);
        if (carbDef <= 4 && calDef <= 50) return false;
        const mealOrder = meals
            .map((meal, idx) => ({ idx, calories: Number(meal?.totals?.calories) || 0 }))
            .sort((a, b) => a.calories - b.calories)
            .map((x) => x.idx);
        for (const mealIdx of mealOrder) {
            const meal = meals[mealIdx];
            const beforeFoods = meal.foods.map((i) => ({ ...i }));
            const beforeTotals = { ...totals };
            if (!setServingDelta(mealIdx, riceFood, +0.25, 0.25)) continue;
            totals = recomputeAll();
            const proteinOk = (Number(totals?.protein_g) || 0) <= proteinCeiling;
            const carbsOk = (Number(totals?.carbs_g) || 0) <= ((Number(targets?.carbs_g) || 0) + 20);
            const caloriesOk = (Number(totals?.calories) || 0) <= ((Number(targets?.calories) || 0) + 180);
            if (proteinOk && carbsOk && caloriesOk) return true;
            meal.foods = beforeFoods;
            recomputeMealTotals(meal);
            totals = beforeTotals;
        }
        return false;
    };

    const trySwapCarbToFat = () => {
        if (!oilFood) return false;
        const carbOverNow = (Number(totals?.carbs_g) || 0) - (Number(targets?.carbs_g) || 0);
        const fatUnderNow = (Number(targets?.fat_g) || 0) - (Number(totals?.fat_g) || 0);
        if (carbOverNow < 6 || fatUnderNow < 4) return false;

        const preferredCarbIds = ['white_rice_dry', 'russet_potatoes', 'banana_fresh_each', 'instant_oats'];
        const carbCandidates = [];
        meals.forEach((meal, mealIdx) => {
            (meal?.foods || []).forEach((item) => {
                const id = String(item?.foodId || '');
                const food = byId.get(id);
                if (!food || classifyType(food) !== 'carb') return;
                const servings = Number(item?.servings) || 0;
                if (servings <= 0.25) return;
                const idx = preferredCarbIds.indexOf(id);
                const priority = idx >= 0 ? (100 - idx) : 0;
                carbCandidates.push({
                    mealIdx,
                    food,
                    priority,
                    carbs: Number(item?.carbs_g) || 0
                });
            });
        });
        carbCandidates.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            return b.carbs - a.carbs;
        });

        for (const candidate of carbCandidates) {
            const beforeTotals = { ...totals };
            const beforeMeals = snapshotMeals();
            const meal = meals[candidate.mealIdx];
            if (!setServingDelta(candidate.mealIdx, candidate.food, -0.25, 0.25)) continue;
            if (!mealHasCarb(meal)) {
                restoreMeals(beforeMeals);
                totals = beforeTotals;
                continue;
            }
            totals = recomputeAll();

            const didAddOil = tryAddOil();
            if (didAddOil) totals = recomputeAll();

            const carbOverAfter = (Number(totals?.carbs_g) || 0) - (Number(targets?.carbs_g) || 0);
            const fatUnderAfter = (Number(targets?.fat_g) || 0) - (Number(totals?.fat_g) || 0);
            const calAbsBefore = Math.abs((Number(beforeTotals?.calories) || 0) - (Number(targets?.calories) || 0));
            const calAbsAfter = Math.abs((Number(totals?.calories) || 0) - (Number(targets?.calories) || 0));

            const progress = (
                carbOverAfter < carbOverNow &&
                fatUnderAfter <= fatUnderNow &&
                calAbsAfter <= (calAbsBefore + 40) &&
                (Number(totals?.protein_g) || 0) <= proteinCeiling
            );
            if (progress) {
                try {
                    console.info('[PLAN_GENERATION][CARB_TO_FAT_SWAP]', {
                        trimmedCarbFood: candidate?.food?.id || null,
                        addedOil: Boolean(didAddOil),
                        before: beforeTotals,
                        after: totals
                    });
                } catch {
                    // ignore
                }
                return true;
            }

            restoreMeals(beforeMeals);
            totals = beforeTotals;
        }
        return false;
    };

    for (let i = 0; i < 220; i += 1) {
        totals = recomputeAll();
        const dCal = (Number(targets?.calories) || 0) - (Number(totals?.calories) || 0);
        const dP = (Number(targets?.protein_g) || 0) - (Number(totals?.protein_g) || 0);
        const dC = (Number(targets?.carbs_g) || 0) - (Number(totals?.carbs_g) || 0);
        const dF = (Number(targets?.fat_g) || 0) - (Number(totals?.fat_g) || 0);
        const done = (
            dP >= -5 &&
            Math.abs(dC) <= (isBestMode ? 8 : 15) &&
            Math.abs(dF) <= (isBestMode ? 5 : 8) &&
            Math.abs(dCal) <= (isBestMode ? 70 : 120)
        );
        if (done) break;
        let changed = false;
        if (!changed && (dC > 12 || dCal > 100) && (Number(totals?.protein_g) || 0) > proteinCarbHeadroomCeiling) changed = ensureProteinHeadroomForCarbFill();
        if (!changed && (Number(totals?.protein_g) || 0) > proteinCeiling) changed = tryTrimProtein(proteinCeiling);
        if (!changed && dC < -6 && dF > 3) changed = trySwapCarbToFat();
        if (!changed && (dC > 8 || dCal > 80)) changed = tryAddRice();
        if (!changed && dF > 2) changed = tryAddOil();
        if (!changed && dCal > 80) changed = tryAddRice();
        if (!changed && dCal > 80) changed = tryAddOil();
        if (!changed) break;
    }

    totals = recomputeAll();
    try {
        console.info('[PLAN_GENERATION][MACRO_CLOSURE_RULES]', {
            mode: activeBudgetMode,
            isBestMode,
            proteinCeiling,
            proteinCarbHeadroomCeiling,
            riceFood: riceFood?.id || null,
            oilFood: oilFood?.id || null,
            final: totals
        });
    } catch {
        // ignore
    }
    return {
        ...plan,
        meals,
        dailyTotals: totals,
        meta: {
            ...(plan?.meta || {}),
            macroClosureApplied: true,
            macroClosureLabel: String(options?.label || 'closure_default')
        }
    };
}

function computeDailyFiberEstimateFromMeals(meals, foodsToUse, estimatedFiberFn) {
    const srcMeals = Array.isArray(meals) ? meals : [];
    const srcFoods = Array.isArray(foodsToUse) ? foodsToUse : [];
    const fiberFor = typeof estimatedFiberFn === 'function'
        ? estimatedFiberFn
        : (() => 0);

    let totalFiber = 0;
    const missingFoodIds = [];

    srcMeals.forEach((meal) => {
        (meal?.foods || []).forEach((item) => {
            const id = String(item?.foodId || '').trim();
            if (!id) return;
            const mapped = srcFoods.find((f) => String(f?.id || '') === id);
            if (!mapped) {
                missingFoodIds.push(id);
                return;
            }
            totalFiber += fiberFor(mapped, Number(item?.servings) || 0);
        });
    });

    return { totalFiber, missingFoodIds };
}

function computeCutVegCapsSnapshot(meals, foodsToUse) {
    const srcMeals = Array.isArray(meals) ? meals : [];
    const srcFoods = Array.isArray(foodsToUse) ? foodsToUse : [];

    const normalizeText = (value) => String(value || '').trim().toLowerCase();
    const canonicalByText = (text) => {
        const t = normalizeText(text);
        if (!t) return '';
        if (t.includes('spinach')) return 'spinach_chopped_frozen';
        if (t.includes('mixed_vegetables_birds_eye') || t.includes('mixed vegetables')) return 'mixed_vegetables_birds_eye';
        if (t.includes('banana')) return 'banana_fresh_each';
        return '';
    };

    const resolveCanonicalId = (item) => {
        const rawId = normalizeText(item?.foodId || item?.id || '');
        const byIdText = canonicalByText(rawId);
        if (byIdText) return byIdText;
        if (rawId && srcFoods.some((f) => normalizeText(f?.id) === rawId)) return rawId;

        const rawName = normalizeText(item?.foodName || item?.name || '');
        const byNameText = canonicalByText(rawName);
        if (byNameText) return byNameText;

        const mappedByName = srcFoods.find((f) => {
            const name = normalizeText(f?.name || f?.query || f?.foodName || '');
            return rawName && name && name === rawName;
        });
        if (mappedByName) return normalizeText(mappedByName.id);
        return rawId || '';
    };

    const toOunces = (item, mappedFood, servings) => {
        const gramsFromItem = Number(item?.grams);
        if (Number.isFinite(gramsFromItem) && gramsFromItem > 0) return gramsFromItem / 28.349523125;
        const servingAmount = Number(mappedFood?.serving?.amount);
        const servingUnit = String(mappedFood?.serving?.unit || '').toLowerCase();
        if (Number.isFinite(servingAmount) && servingAmount > 0 && (servingUnit === 'oz' || servingUnit === 'ounce' || servingUnit === 'ounces')) {
            return servings * servingAmount;
        }
        if (Number.isFinite(servingAmount) && servingAmount > 0 && (servingUnit === 'g' || servingUnit === 'gram' || servingUnit === 'grams')) {
            return (servings * servingAmount) / 28.349523125;
        }
        const servingGrams = Number(mappedFood?.servingGrams);
        if (Number.isFinite(servingGrams) && servingGrams > 0) return (servings * servingGrams) / 28.349523125;
        return 0;
    };

    const perMealSpinachServings = [];
    const perMealSpinachOunces = [];
    const perMealVegFoodIds = [];
    const perMealVegPresence = [];
    const perMealSingleVegOverCap = [];
    const missingFoodIds = [];
    let spinachServingsDay = 0;
    let spinachOuncesDay = 0;
    let mixedVegMealsCount = 0;
    let bananaServingsDay = 0;

    srcMeals.forEach((meal) => {
        const mealFoods = Array.isArray(meal?.foods) ? meal.foods : [];
        let mealSpinachServings = 0;
        let mealSpinachOunces = 0;
        let mealHasMixedVeg = false;
        let mealHasVeg = false;
        let mealSingleVegOverCap = false;
        const mealVegIds = [];

        mealFoods.forEach((item) => {
            const servings = Math.max(0, Number(item?.servings) || 0);
            const canonicalId = resolveCanonicalId(item);
            const mappedFood = srcFoods.find((f) => normalizeText(f?.id) === canonicalId) || null;
            if (!mappedFood && !canonicalByText(canonicalId)) {
                const missingKey = String(item?.foodId || item?.id || item?.foodName || item?.name || '').trim();
                if (missingKey) missingFoodIds.push(missingKey);
            }

            const isSpinach = canonicalId === 'spinach_chopped_frozen';
            const isMixedVeg = canonicalId === 'mixed_vegetables_birds_eye';
            const isBanana = canonicalId === 'banana_fresh_each';
            const isVeg = isSpinach || isMixedVeg;

            if (isVeg) {
                mealHasVeg = true;
                mealVegIds.push(canonicalId);
                if (servings > 2.0) mealSingleVegOverCap = true;
            }
            if (isSpinach) {
                mealSpinachServings += servings;
                mealSpinachOunces += toOunces(item, mappedFood, servings);
            }
            if (isMixedVeg) mealHasMixedVeg = true;
            if (isBanana) bananaServingsDay += servings;
        });

        perMealSpinachServings.push(mealSpinachServings);
        perMealSpinachOunces.push(mealSpinachOunces);
        perMealVegFoodIds.push(mealVegIds);
        perMealVegPresence.push(mealHasVeg);
        perMealSingleVegOverCap.push(mealSingleVegOverCap);
        if (mealHasMixedVeg) mixedVegMealsCount += 1;
        spinachServingsDay += mealSpinachServings;
        spinachOuncesDay += mealSpinachOunces;
    });

    const vegMealsCount = perMealVegPresence.reduce((count, hasVeg) => count + (hasVeg ? 1 : 0), 0);
    const spinachMealsCount = perMealSpinachServings.reduce((count, v) => count + ((Number(v) || 0) > 0 ? 1 : 0), 0);
    const secondHalfStart = Math.ceil(srcMeals.length / 2);
    const vegMealsInSecondHalf = perMealVegPresence.some((hasVeg, idx) => idx >= secondHalfStart && hasVeg);

    return {
        spinachServingsDay,
        spinachOuncesDay,
        perMealSpinachServings,
        perMealSpinachOunces,
        perMealVegFoodIds,
        perMealVegPresence,
        perMealSingleVegOverCap,
        mixedVegMealsCount,
        bananaServingsDay,
        spinachUsed: spinachServingsDay > 0,
        spinachMealsCount,
        vegMealsCount,
        vegMealsInSecondHalf,
        missingFoodIds
    };
}

function validateCutCandidateHardRules(meals, foodsToUse, options) {
    const cfg = options && typeof options === 'object' ? options : {};
    const srcMeals = Array.isArray(meals) ? meals : [];
    const srcFoods = Array.isArray(foodsToUse) ? foodsToUse : [];
    const estimatedFiberForFood = typeof cfg.estimatedFiberForFood === 'function' ? cfg.estimatedFiberForFood : (() => 0);
    const isProteinFood = typeof cfg.isProteinFood === 'function' ? cfg.isProteinFood : (() => false);
    const spinachPerMealCap = Number.isFinite(cfg.spinachPerMealCap) ? Number(cfg.spinachPerMealCap) : 1.0;
    const spinachPerDayCap = Number.isFinite(cfg.spinachPerDayCap) ? Number(cfg.spinachPerDayCap) : 2.0;
    const availableProteinCount = Number.isFinite(cfg.availableProteinCount) ? Number(cfg.availableProteinCount) : 0;
    const availableCarbCount = Number.isFinite(cfg.availableCarbCount) ? Number(cfg.availableCarbCount) : 0;

    const vegCaps = computeCutVegCapsSnapshot(srcMeals, srcFoods);
    if (vegCaps.missingFoodIds.length > 0) {
        return { ok: false, reason: 'missing_food_mapping', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    }

    for (let i = 0; i < srcMeals.length; i += 1) {
        const meal = srcMeals[i] || {};
        const mealFoods = Array.isArray(meal.foods) ? meal.foods : [];
        const mealTotals = meal.totals || { calories: 0, protein_g: 0, carbs_g: 0 };
        if (mealFoods.length < 2) return { ok: false, reason: 'cut_single_food_meal', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
        const minMealCalories = i === (srcMeals.length - 1) ? 300 : 350;
        if (Number(mealTotals.calories) < minMealCalories) return { ok: false, reason: 'cut_meal_calorie_floor', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
        if (Number(mealTotals.protein_g) < 30) return { ok: false, reason: 'cut_meal_protein_floor', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
        if (Number(mealTotals.carbs_g) > 25 && Number(mealTotals.protein_g) < 30) return { ok: false, reason: 'cut_carb_without_protein', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
        if ((Number(vegCaps.perMealSpinachServings[i]) || 0) > spinachPerMealCap) return { ok: false, reason: 'cut_spinach_per_meal_cap', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
        if ((Number(vegCaps.perMealSpinachOunces[i]) || 0) > 8) return { ok: false, reason: 'cut_spinach_per_meal_cap', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
        if (vegCaps.perMealSingleVegOverCap[i]) return { ok: false, reason: 'cut_single_veg_overcap', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };

        const mappedFoods = mealFoods.map((item) => srcFoods.find((f) => String(f?.id || '') === String(item?.foodId || ''))).filter(Boolean);
        if (!mappedFoods.some((f) => isProteinFood(f))) return { ok: false, reason: 'cut_meal_missing_protein_food', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    }

    if ((Number(vegCaps.vegMealsCount) || 0) < 2) return { ok: false, reason: 'veg_floor_lt_2', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    if (!vegCaps.vegMealsInSecondHalf) return { ok: false, reason: 'veg_not_in_second_half', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    if ((Number(vegCaps.spinachServingsDay) || 0) > spinachPerDayCap) return { ok: false, reason: 'cut_spinach_daily_cap', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    if ((Number(vegCaps.spinachOuncesDay) || 0) > 16) return { ok: false, reason: 'cut_spinach_daily_cap', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    if ((Number(vegCaps.spinachOuncesDay) || 0) > 12) return { ok: false, reason: 'cut_spinach_absolute_12oz_cap', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    const hasMixedVegAvailable = srcFoods.some((f) => String(f?.id || '').toLowerCase() === 'mixed_vegetables_birds_eye');
    if (hasMixedVegAvailable && (Number(vegCaps.mixedVegMealsCount) || 0) < 1) {
        return { ok: false, reason: 'cut_mixed_veg_required', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    }
    if ((Number(vegCaps.spinachMealsCount) || 0) > 1) return { ok: false, reason: 'cut_spinach_once_per_day', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };

    const hasBananaAvailable = srcFoods.some((f) => {
        const id = String(f?.id || '').toLowerCase();
        const name = String(f?.name || f?.query || '').toLowerCase();
        return id === 'banana_fresh_each' || name.includes('banana');
    });
    if (hasBananaAvailable && (Number(vegCaps.bananaServingsDay) || 0) < 1) return { ok: false, reason: 'cut_fruit_required', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };

    const uniqueProteinIds = new Set();
    const uniqueCarbIds = new Set();
    srcMeals.forEach((meal) => {
        (meal?.foods || []).forEach((item) => {
            const mapped = srcFoods.find((f) => String(f?.id || '') === String(item?.foodId || ''));
            if (!mapped) return;
            if (String(mapped?.type || '').toLowerCase() === 'protein') uniqueProteinIds.add(String(mapped.id));
            if (String(mapped?.type || '').toLowerCase() === 'carb') uniqueCarbIds.add(String(mapped.id));
        });
    });
    if (availableProteinCount >= 2 && uniqueProteinIds.size < 2) {
        return { ok: false, reason: 'cut_unique_protein_floor', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    }
    if (availableCarbCount >= 2 && uniqueCarbIds.size < 2) {
        return { ok: false, reason: 'cut_unique_carb_floor', snapshot: { vegCaps, fiber: null, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    }

    const fiber = computeDailyFiberEstimateFromMeals(srcMeals, srcFoods, estimatedFiberForFood);
    if (fiber.missingFoodIds.length > 0) return { ok: false, reason: 'missing_food_mapping', snapshot: { vegCaps, fiber, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
    if ((Number(fiber.totalFiber) || 0) < 20) return { ok: false, reason: 'daily_fiber_floor', snapshot: { vegCaps, fiber, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };

    return { ok: true, reason: null, snapshot: { vegCaps, fiber, perMealProtein: srcMeals.map((m) => Number(m?.totals?.protein_g) || 0) } };
}

function maxCutVegServingsByRemaining(food, remaining, strictMaxServings) {
    const strict = Math.max(0, Number(strictMaxServings) || 0);
    const perCal = Number(food?.macros?.calories) || 0;
    const perCarb = Number(food?.macros?.carbs_g) || 0;
    const remCal = Math.max(0, Number(remaining?.calories) || 0);
    const remCarb = Math.max(0, Number(remaining?.carbs_g) || 0);
    const capCal = perCal > 0 ? ((remCal + 60) / perCal) : Number.POSITIVE_INFINITY;
    const capCarb = perCarb > 0 ? ((remCarb + 15) / perCarb) : Number.POSITIVE_INFINITY;
    const buffered = Math.max(0, Math.min(capCal, capCarb));
    // Hard cap: never exceed strict macro-constrained maximum.
    return Math.min(strict, buffered);
}

function buildCutReservedAssignments(foodsToUse, mealsPerDay) {
    const srcFoods = Array.isArray(foodsToUse) ? foodsToUse : [];
    const totalMeals = Math.max(1, Number(mealsPerDay) || 1);
    const secondHalfStart = Math.ceil(totalMeals / 2);
    const byId = (id) => srcFoods.find((f) => String(f?.id || '') === String(id)) || null;
    const mixedVeg = byId('mixed_vegetables_birds_eye');
    const spinach = byId('spinach_chopped_frozen');
    const banana = byId('banana_fresh_each') || srcFoods.find((f) => String(f?.name || f?.query || '').toLowerCase().includes('banana')) || null;

    const perMeal = Array.from({ length: totalMeals }, () => ({ forceVegId: null, allowSpinach: false, forceBanana: false }));

    if (mixedVeg) {
        let mixedIdx = 0;
        if (totalMeals === 2) mixedIdx = 1;
        else if (totalMeals === 3) mixedIdx = 2;
        else if (totalMeals === 4) mixedIdx = 3;
        else mixedIdx = Math.min(totalMeals - 1, Math.max(1, secondHalfStart));
        if (mixedIdx >= 0 && mixedIdx < totalMeals) perMeal[mixedIdx].forceVegId = 'mixed_vegetables_birds_eye';
    }

    if (spinach) {
        const firstHalfIdx = 0;
        const secondHalfIdx = secondHalfStart < totalMeals ? secondHalfStart : totalMeals - 1;
        if (firstHalfIdx >= 0 && firstHalfIdx < totalMeals) perMeal[firstHalfIdx].allowSpinach = true;
        if (secondHalfIdx >= 0 && secondHalfIdx < totalMeals && secondHalfIdx !== firstHalfIdx) {
            if (perMeal[secondHalfIdx].forceVegId !== 'mixed_vegetables_birds_eye') perMeal[secondHalfIdx].allowSpinach = true;
        }
    }

    if (banana) {
        const preferred = totalMeals >= 3 ? 2 : 0; // meal 3 (index 2) else meal 1
        const bananaIdx = preferred < totalMeals ? preferred : 0;
        perMeal[bananaIdx].forceBanana = true;
    }

    return { perMeal };
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

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂºÃƒÂ¢Ã¢â€šÂ¬Ã‚Â FOOD WIZARD KILL SWITCH - PERMANENTLY DISABLED
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
            prep: 'batch',
            selections: {
                sex: nutritionState.selections?.sex || null,
                ageYears: Number(nutritionState.selections?.ageYears) || null,
                pregnant: nutritionState.selections?.pregnant || null,
                trimester: nutritionState.selections?.trimester || null,
                lactating: nutritionState.selections?.lactating || null,
                intensity: nutritionState.selections?.intensity || null,
                frequency: nutritionState.selections?.frequency || null,
                goal: nutritionState.selections?.goal || null,
                style: nutritionState.selections?.style || null,
                heightIn: Number(nutritionState.selections?.heightIn) || null,
                weightLbs: Number(nutritionState.selections?.weightLbs) || null,
                goalWeightLbs: Number(nutritionState.selections?.goalWeightLbs) || null,
                lossRateLbsPerWeek: Number(nutritionState.selections?.lossRateLbsPerWeek || 1.5) || 1.5
            }
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
    const body = document.body;

    if (!hamburger || !navMenu) return;

    // Hard-normalize top navbar items so desktop/mobile always show Training in nav.
    const path = String(location.pathname || '').toLowerCase();
    const isIndex = path.endsWith('/index.html') || path.endsWith('index.html') || path === '/' || path === '';
    const homeHref = isIndex ? '#' : 'index.html';
    const macroHref = isIndex ? '#resources' : 'index.html#resources';
    const faqHref = isIndex ? '#contact' : 'index.html#contact';
    const trainingHref = 'training-coming-soon.html';
    navMenu.innerHTML = `
        <li><a href="${homeHref}">Home</a></li>
        <li><a href="${macroHref}">Macro Calculator</a></li>
        <li><a href="${trainingHref}">Training</a></li>
        <li><a href="${faqHref}">FAQ</a></li>
    `;

    let backdrop = document.querySelector('.nav-drawer-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'nav-drawer-backdrop';
        document.body.appendChild(backdrop);
    }

    const closeDrawer = () => {
        navMenu.classList.remove('active');
        body.classList.remove('nav-drawer-open');
        hamburger.setAttribute('aria-expanded', 'false');
    };

    const openDrawer = () => {
        navMenu.classList.add('active');
        body.classList.add('nav-drawer-open');
        hamburger.setAttribute('aria-expanded', 'true');
    };

    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.addEventListener('click', () => {
        if (navMenu.classList.contains('active')) closeDrawer();
        else openDrawer();
    });

    navMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => closeDrawer());
    });

    backdrop.addEventListener('click', closeDrawer);
    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) closeDrawer();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDrawer();
    });

    // Guard against duplicate "Macro Calculator" items injected by legacy code.
    const macroLinks = Array.from(navMenu.querySelectorAll('a')).filter((a) => {
        const label = String(a.textContent || '').trim().toLowerCase();
        return label === 'macro calculator';
    });
    if (macroLinks.length > 1) {
        macroLinks.slice(1).forEach((a) => a.closest('li')?.remove());
    }

    // Normalize top-level nav labels across pages:
    // remove legacy tabs and ensure a single "Training" tab exists.
    const legacyLabels = new Set(['how it works', 'how it works?', 'why odeology', 'why odeology?', 'pricing']);
    let trainingLi = null;
    Array.from(navMenu.querySelectorAll('li')).forEach((li) => {
        const link = li.querySelector('a');
        if (!link) return;
        const label = String(link.textContent || '').trim().toLowerCase();
        if (legacyLabels.has(label)) {
            li.remove();
            return;
        }
        if (label === 'training') {
            if (!trainingLi) trainingLi = li;
            else {
                li.remove();
                return;
            }
            link.setAttribute('href', 'training-coming-soon.html');
        }
    });

    if (!trainingLi) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'training-coming-soon.html';
        a.textContent = 'Training';
        li.appendChild(a);
        const faqLi = Array.from(navMenu.querySelectorAll('li')).find((item) => {
            const link = item.querySelector('a');
            const label = String(link?.textContent || '').trim().toLowerCase();
            return label === 'faq';
        });
        if (faqLi && faqLi.parentElement === navMenu) {
            navMenu.insertBefore(li, faqLi);
        } else {
            navMenu.appendChild(li);
        }
    }
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
            if (copyEl) copyEl.textContent = 'Thanks â€” youÃ¢â‚¬â„¢re all set. Stand by for a call within 24 hours.';
            if (cta) {
                cta.textContent = 'YouÃ¢â‚¬â„¢re signed in';
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
                    <h3>ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Budget vs Protein Mismatch</h3>
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
                            ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Lower protein to ${maxProtein}g
                        </button>
                        <button class="btn btn-secondary" id="budget-increase">
                            ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚Â° I'll increase my budget
                        </button>
                        <button class="btn btn-warning" id="budget-continue-anyway">
                            ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Continue anyway (survival mode)
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
        pregnant: null,
        trimester: null,
        lactating: null,
        ageYears: null,
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
    servingLabel: "3 oz (85g)",
    servingGrams: 85,
    macros: { calories: 290, protein: 19, carbs: 0, fat: 23 },
    micros: {
      fiber_g: 0,
      potassium_mg: 323,
      sodium_mg: 76,
      magnesium_mg: 20,
      calcium_mg: 24,
      iron_mg: 2.4,
      zinc_mg: 5.1,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 3,
      folate_mcg: 7,
      b12_mcg: 2.4,
      omega3_epa_dha_mg: 30,
      choline_mg: 56
    },
    sources: ["MyFoodData (USDA)", "FoodStruct / label-style cross-check"],
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
    servingLabel: "1 egg (~50g)",
    servingGrams: 50,
    macros: { calories: 70, protein: 6, carbs: 0, fat: 5 },
    micros: {
      fiber_g: 0,
      potassium_mg: 70,
      sodium_mg: 70,
      magnesium_mg: 6,
      calcium_mg: 26,
      iron_mg: 0.6,
      zinc_mg: 0.65,
      vitamin_d_mcg: 1,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 80,
      folate_mcg: 24,
      b12_mcg: 0.45,
      omega3_epa_dha_mg: 35,
      choline_mg: 147
    },
    sources: ["EWG / label-style", "MyFoodData (USDA)"],
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
    servingLabel: "4 oz (112g)",
    servingGrams: 112,
    macros: { calories: 90, protein: 20, carbs: 0, fat: 2 },
    micros: {
      fiber_g: 0,
      potassium_mg: 345,
      sodium_mg: 60,
      magnesium_mg: 31,
      calcium_mg: 12,
      iron_mg: 0.6,
      zinc_mg: 0.4,
      vitamin_d_mcg: 3.5,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 0,
      folate_mcg: 28,
      b12_mcg: 1.8,
      omega3_epa_dha_mg: 105,
      choline_mg: 49
    },
    sources: ["Instacart/Walmart listing + label-style", "MyFoodData (USDA)"],
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
    servingLabel: "1/4 cup dry (~45g)",
    servingGrams: 45,
    macros: { calories: 160, protein: 3, carbs: 36, fat: 0 },
    micros: {
      fiber_g: 0.3,
      potassium_mg: 12,
      sodium_mg: 0,
      magnesium_mg: 6,
      calcium_mg: 10,
      iron_mg: 2.8,
      zinc_mg: 0.65,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 0,
      folate_mcg: 125,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 3
    },
    sources: ["Walmart ingredients (enriched) + label-style entries", "MyFoodData (USDA)"],
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
    servingLabel: "1 cup (240mL)",
    servingGrams: 240,
    macros: { calories: 150, protein: 8, carbs: 24, fat: 2.5 },
    micros: {
      fiber_g: 0,
      potassium_mg: 403,
      sodium_mg: 240,
      magnesium_mg: 27,
      calcium_mg: 280,
      iron_mg: 0.2,
      zinc_mg: 1,
      vitamin_d_mcg: 3,
      vitamin_c_mg: 1.2,
      vitamin_a_mcg_rae: 150,
      folate_mcg: 12,
      b12_mcg: 1.2,
      omega3_epa_dha_mg: 0,
      choline_mg: 22
    },
    sources: ["EatThisMuch label-style", "NutritionValue entry"],
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
    servingLabel: "1 Tbsp (14g)",
    servingGrams: 14,
    macros: { calories: 120, protein: 0, carbs: 0, fat: 14 },
    micros: {
      fiber_g: 0,
      potassium_mg: 0,
      sodium_mg: 0,
      magnesium_mg: 0,
      calcium_mg: 0,
      iron_mg: 0.1,
      zinc_mg: 0,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 0,
      folate_mcg: 0,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 0
    },
    sources: ["EatThisMuch label-style", "NutritionValue entry"],
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
    servingLabel: "4 oz (112g)",
    servingGrams: 112,
    macros: { calories: 140, protein: 25, carbs: 0, fat: 4 },
    micros: {
      fiber_g: 0,
      potassium_mg: 360,
      sodium_mg: 135,
      magnesium_mg: 27,
      calcium_mg: 5,
      iron_mg: 0.4,
      zinc_mg: 0.7,
      vitamin_d_mcg: 0.1,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 9,
      folate_mcg: 9,
      b12_mcg: 0.2,
      omega3_epa_dha_mg: 25,
      choline_mg: 70
    },
    sources: ["NutritionValue (raw chicken breast)", "MyNetDiary / USDA-based cross-check"],
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
    servingLabel: "1/2 cup dry (~40g)",
    servingGrams: 40,
    macros: { calories: 150, protein: 5, carbs: 27, fat: 2.5 },
    micros: {
      fiber_g: 4.5,
      potassium_mg: 150,
      sodium_mg: 0,
      magnesium_mg: 55,
      calcium_mg: 22,
      iron_mg: 2,
      zinc_mg: 1.1,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 0,
      folate_mcg: 14,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 16
    },
    sources: ["Walmart Business oats label family", "MyFoodData (rolled/quick oats USDA)"],
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
    servingLabel: "1 large potato (~299g)",
    servingGrams: 299,
    macros: { calories: 110, protein: 3, carbs: 26, fat: 0 },
    micros: {
      fiber_g: 4.8,
      potassium_mg: 1540,
      sodium_mg: 18,
      magnesium_mg: 85,
      calcium_mg: 48,
      iron_mg: 3.2,
      zinc_mg: 1.1,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 20,
      vitamin_a_mcg_rae: 2,
      folate_mcg: 44,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 36
    },
    sources: ["UR Medicine (USDA table)", "MyFoodData (USDA)"],
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
    servingLabel: "4 oz (112g)",
    servingGrams: 112,
    macros: { calories: 170, protein: 22, carbs: 0, fat: 8 },
    micros: {
      fiber_g: 0,
      potassium_mg: 190,
      sodium_mg: 80,
      magnesium_mg: 24,
      calcium_mg: 100,
      iron_mg: 1.8,
      zinc_mg: 2.6,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 0,
      folate_mcg: 7,
      b12_mcg: 1.1,
      omega3_epa_dha_mg: 30,
      choline_mg: 55
    },
    sources: ["SmartLabel (Hormel)", "MyFoodData (USDA ground turkey avg)"],
    container: { size: 16, unit: "oz", price: 1.98 }
  },
  {
    id: "mixed_vegetables_birds_eye",
    name: "Birds Eye Frozen Mixed Vegetables (Corn, Carrots, Green Beans, Peas)",
    store: "Walmart",
    category: "carb",
    url: "https://www.walmart.com/ip/Birds-Eye-Frozen-Mixed-Vegetables-Corn-Carrots-Green-Beans-Peas-80-oz-Frozen/16654198",
    image: "https://i5.walmartimages.com/seo/Birds-Eye-Frozen-Mixed-Vegetables-Corn-Carrots-Green-Beans-Peas-80-oz-Frozen_2dd622c6-3ed8-46b5-9ff8-6ba1733fa35e.f795e39025b5febfabf66ef52a161fae.jpeg?odnBg=FFFFFF&odnHeight=573&odnWidth=573",
    serving: { amount: 0.67, unit: "cup" },
    servingLabel: "2/3 cup (label serving)",
    servingGrams: null,
    macros: { calories: 60, protein: 2, carbs: 11, fat: 1 },
    micros: {
      fiber_g: 2,
      potassium_mg: 220,
      sodium_mg: 25,
      magnesium_mg: 18,
      calcium_mg: 15,
      iron_mg: 0.4,
      zinc_mg: 0.4,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 3,
      vitamin_a_mcg_rae: 110,
      folate_mcg: 20,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 20
    },
    sources: ["Giant / retailer label capture", "MyFoodData (USDA mixed veg)"],
    container: { size: 10, unit: "servings", price: 6.92 }
  },
  {
    id: "spinach_chopped_frozen",
    name: "Great Value Chopped Spinach (Frozen)",
    store: "Walmart",
    category: "carb",
    url: "https://www.walmart.com/ip/Great-Value-Chopped-Spinach-12-oz-Frozen/431513547",
    image: "https://i5.walmartimages.com/seo/Great-Value-Chopped-Spinach-12-oz-Frozen_483d73bd-e9b9-4ce7-a8ec-b79323292c33.ff8eb0e689e682aae896c4d94411a144.jpeg?odnBg=FFFFFF&odnHeight=573&odnWidth=573",
    serving: { amount: 85, unit: "g" },
    servingLabel: "1 cup (81g)",
    servingGrams: 81,
    macros: { calories: 35, protein: 3, carbs: 6, fat: 0 },
    micros: {
      fiber_g: 3,
      potassium_mg: 266,
      sodium_mg: 73,
      magnesium_mg: 61,
      calcium_mg: 161,
      iron_mg: 2.25,
      zinc_mg: 0.7,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 8,
      vitamin_a_mcg_rae: 420,
      folate_mcg: 160,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 25
    },
    sources: ["NutritionValue label-style", "MyFoodData (USDA spinach)"],
    container: { size: 12, unit: "oz", price: 1.26 }
  },
  {
    id: "black_beans_dry_gv_4lb",
    name: "Great Value Black Beans (Dry) 4 lb",
    store: "Walmart",
    category: "carb_protein",
    url: "https://www.walmart.com/ip/Great-Value-Black-Beans-4-lb/45595285",
    image: "https://i5.walmartimages.com/seo/Great-Value-Black-Beans-4-lb_2b4297cf-769b-4b0b-988d-987c7a434caa.18d547706c62df253197cd404e2b73c9.jpeg?odnBg=FFFFFF&odnHeight=573&odnWidth=573",
    serving: { amount: 0.25, unit: "cup" },
    servingLabel: "1/4 cup dry (35g)",
    servingGrams: 35,
    macros: { calories: 120, protein: 8, carbs: 22, fat: 0 },
    micros: {
      fiber_g: 5,
      potassium_mg: 520,
      sodium_mg: 0,
      magnesium_mg: 60,
      calcium_mg: 42,
      iron_mg: 1.8,
      zinc_mg: 1,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 0,
      folate_mcg: 140,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 20
    },
    sources: ["FatSecret / label-style (Great Value)", "MyFoodData (dry black beans)"],
    container: { size: 64, unit: "oz", price: 4.98 }
  },
  {
    id: "iodized_salt_gv_26oz",
    name: "Great Value Iodized Salt (26 oz)",
    store: "Walmart",
    category: "misc",
    url: "https://www.walmart.com/ip/Great-Value-Iodized-Salt-26-oz/10448316",
    image: "https://i5.walmartimages.com/seo/Great-Value-Iodized-Salt-26-oz_6a60179a-029f-428b-9584-b8cd17feaf86.e2ebfdb4e3fefba3927a38d74507aee6.jpeg?odnBg=FFFFFF&odnHeight=573&odnWidth=573",
    serving: { amount: 0.25, unit: "tsp" },
    servingLabel: "1/4 tsp (~1.5-2g)",
    servingGrams: 1.5,
    macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    micros: {
      fiber_g: 0,
      potassium_mg: 0,
      sodium_mg: 590,
      magnesium_mg: 0,
      calcium_mg: 0,
      iron_mg: 0,
      zinc_mg: 0,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 0,
      vitamin_a_mcg_rae: 0,
      folate_mcg: 0,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 0
    },
    sources: ["Walmart label text", "MyFoodDiary label-style"],
    container: { size: 26, unit: "oz", price: 0.76 }
  },
  {
    id: "banana_fresh_each",
    name: "Fresh Banana, Each",
    store: "Walmart",
    category: "carb",
    url: "https://www.walmart.com/ip/Fresh-Banana-Each/44390948",
    image: "https://i5.walmartimages.com/seo/Fresh-Banana-Each_5939a6fa-a0d6-431c-88c6-b4f21608e4be.f7cd0cc487761d74c69b7731493c1581.jpeg?odnBg=FFFFFF&odnHeight=573&odnWidth=573",
    serving: { amount: 1, unit: "each" },
    servingLabel: "1 medium (118g)",
    servingGrams: 118,
    // assumed 1 medium banana Ã¢â€°Ë† 118g (4.16 oz) for conversions
    macros: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
    micros: {
      fiber_g: 3.1,
      potassium_mg: 430,
      sodium_mg: 1,
      magnesium_mg: 32,
      calcium_mg: 7,
      iron_mg: 0.4,
      zinc_mg: 0.2,
      vitamin_d_mcg: 0,
      vitamin_c_mg: 10,
      vitamin_a_mcg_rae: 4,
      folate_mcg: 24,
      b12_mcg: 0,
      omega3_epa_dha_mg: 0,
      choline_mg: 14
    },
    sources: ["USDA/MyFoodData", "NutritionValue (banana raw)"],
    container: { size: 1, unit: "each", price: 0.20 }
  }
];

const WALMART_MICRO_PROFILE_UPDATES = [
  {
    id: "ground_beef_80_20",
    name: "80/20 Ground Beef",
    walmart_url: "https://www.walmart.com/ip/80-Lean-20-Fat-Ground-Beef-Chuck-5-lb-Roll-Fresh-All-Natural/15136796",
    serving: { label_serving_text: "3 oz (85g)", label_serving_grams: 85, edible_state_note: "fresh meat label varies; use USDA cooked match for full micros" },
    label: { fiber_g: null, sodium_mg: null, potassium_mg: null, calcium_mg: null, iron_mg: null },
    label_flags: { source: "none", label_micros_partial: true, dv_only_fields_present: false },
    usda_fill: { fiber_g: 0, potassium_mg: 323, sodium_mg: 77.4, magnesium_mg: 19.6, calcium_mg: 23.8, iron_mg: 2.4, zinc_mg: 5.4, vitamin_d_mcg: 0, vitamin_c_mg: 0, vitamin_a_mcg_rae: 2.6, folate_mcg: 9.4, b12_mcg: 2.4, omega3_epa_dha_mg: 0, choline_mg: 72.1, source: "USDA FDC: ground beef 80% lean, cooked pan-browned, 85g" }
  },
  {
    id: "eggs_large_60ct",
    name: "Large Eggs (60ct)",
    walmart_url: "https://www.walmart.com/ip/Great-Value-Large-White-Eggs-60-Count/193637719",
    serving: { label_serving_text: "1 large egg (50g)", label_serving_grams: 50, edible_state_note: "raw/whole" },
    label: { fiber_g: null, sodium_mg: null, potassium_mg: null, calcium_mg: null, iron_mg: null, vitamin_d_mcg: null },
    label_flags: { source: "none", label_micros_partial: true, dv_only_fields_present: false },
    usda_fill: { fiber_g: 0, potassium_mg: 69, sodium_mg: 71, magnesium_mg: 6, calcium_mg: 28, iron_mg: 0.88, zinc_mg: 0.65, vitamin_d_mcg: 1.0, vitamin_c_mg: 0, vitamin_a_mcg_rae: 80, folate_mcg: 23.5, b12_mcg: 0.45, omega3_epa_dha_mg: 29, choline_mg: 146.9, source: "USDA FDC: egg, whole, raw, 50g" }
  },
  {
    id: "tilapia_gv_frozen_4lb",
    name: "Tilapia Fillets (4lb) - Great Value Frozen",
    walmart_url: "https://www.walmart.com/ip/Great-Value-Frozen-Tilapia-Skinless-Boneless-Fillets-4-lb/123210797",
    serving: { label_serving_text: "4 oz (112g)", label_serving_grams: 112, edible_state_note: "eaten cooked; label values reflect product panel" },
    label: { potassium_mg: 513, calcium_mg: 10.0, iron_mg: 0.95, vitamin_d_mcg: 5.0, vitamin_a_percent_dv: 0, vitamin_c_percent_dv: 2 },
    label_flags: { source: "walmart_business", label_micros_partial: true, dv_only_fields_present: true },
    usda_fill: { fiber_g: 0, sodium_mg: 40.3, magnesium_mg: 31, zinc_mg: 0.4, folate_mcg: 28, b12_mcg: 1.8, omega3_epa_dha_mg: 106, choline_mg: 49, source: "USDA FDC: tilapia cooked (closest match), scaled to 112g" }
  },
  {
    id: "white_rice_enriched_20lb",
    name: "White Rice (Enriched) - Great Value (20lb)",
    walmart_url: "https://www.walmart.com/ip/Great-Value-Long-Grain-Enriched-Rice-20-lb/10315883",
    serving: { label_serving_text: "1/4 cup dry (45g)", label_serving_grams: 45, edible_state_note: "label is dry; users eat cooked; convert with yield layer" },
    label: { fiber_g: null, sodium_mg: null, potassium_mg: null, iron_mg: null, folic_acid_percent_dv: null },
    label_flags: { source: "none", label_micros_partial: true, dv_only_fields_present: false, dry_serving_label: true },
    usda_fill: { fiber_g: 0, potassium_mg: 40.1, sodium_mg: 0, magnesium_mg: 11, calcium_mg: 0, iron_mg: 1.3, zinc_mg: 0.6, vitamin_d_mcg: 0, vitamin_c_mg: 0, vitamin_a_mcg_rae: 0, folate_mcg: 72, b12_mcg: 0, omega3_epa_dha_mg: 0, choline_mg: 2, source: "USDA FDC: rice, white, long-grain, enriched, dry, 45g" },
    yield: { cooked_from_dry_ratio: 3.0, note: "45g dry ~= 135g cooked (approx)" }
  },
  {
    id: "chocolate_milk_1pct_gv",
    name: "Chocolate Milk (1gal) - Great Value 1% Lowfat",
    walmart_url: "https://www.walmart.com/ip/Great-Value-1-Low-fat-Chocolate-Milk-Gallon-Plastic-Jug-128-Fl-Oz/17248403",
    serving: { label_serving_text: "1 cup (240mL)", label_serving_grams: 240, edible_state_note: "liquid" },
    label: { sodium_mg: 250, potassium_mg: 430, fiber_g: null, fiber_g_max: 1, calcium_percent_dv: 20, iron_percent_dv: 6, vitamin_d_percent_dv: 15, vitamin_a_percent_dv: 20, vitamin_c_percent_dv: 2, folic_acid_percent_dv: 2 },
    label_flags: { source: "walmart_business", label_micros_partial: true, dv_only_fields_present: true, fiber_is_less_than: true },
    usda_fill: { magnesium_mg: 34, zinc_mg: 1.0, folate_mcg: 5, b12_mcg: 1.2, choline_mg: 41, omega3_epa_dha_mg: 0, source: "USDA FDC: milk, chocolate, lowfat (closest match)" }
  },
  {
    id: "olive_oil_gem_evoo",
    name: "Extra Virgin Olive Oil (8.5oz) - GEM",
    walmart_url: "https://www.walmart.com/ip/GEM-Extra-Virgin-Olive-Oil-for-Seasoning-and-Finishing-8-5-fl-oz/16627927",
    serving: { label_serving_text: "1 Tbsp (14g)", label_serving_grams: 14, edible_state_note: "oil" },
    label: { sodium_mg: 0, potassium_mg: 0, fiber_g: 0 },
    label_flags: { source: "walmart_business", label_micros_partial: true, dv_only_fields_present: false },
    usda_fill: { magnesium_mg: 0, calcium_mg: 0.14, iron_mg: 0.08, zinc_mg: 0, vitamin_d_mcg: 0, vitamin_c_mg: 0, vitamin_a_mcg_rae: 0, folate_mcg: 0, b12_mcg: 0, omega3_epa_dha_mg: 0, choline_mg: 0.04, source: "USDA FDC: olive oil, 14g (trace micros)" }
  },
  {
    id: "chicken_breast_tray",
    name: "Boneless Skinless Chicken Breast (tray) - edible cooked state",
    walmart_url: "https://www.walmart.com/ip/Boneless-Skinless-Chicken-Breasts-4-7-6-1-lb-Tray/27935840",
    serving: { label_serving_text: "1 cup chopped (140g)", label_serving_grams: 140, edible_state_note: "tray products can be enhanced (higher sodium); label often not accessible in HTML" },
    label: { sodium_mg: null, potassium_mg: null },
    label_flags: { source: "none", label_micros_partial: true, sodium_depends_on_enhanced: true },
    usda_fill: { fiber_g: 0, potassium_mg: 358.4, sodium_mg: 103.6, magnesium_mg: 40.6, calcium_mg: 21, iron_mg: 1.5, zinc_mg: 1.4, vitamin_d_mcg: 0.14, vitamin_c_mg: 0, vitamin_a_mcg_rae: 8.4, folate_mcg: 5.6, b12_mcg: 0.48, omega3_epa_dha_mg: 42, choline_mg: 119.4, source: "USDA FDC: chicken breast, roasted/cooked, 140g" }
  },
  {
    id: "oats_gv_instant_18oz",
    name: "Instant Oats (18oz) - Great Value",
    walmart_url: "https://www.walmart.com/ip/Great-Value-Instant-Oats-Tube-18-oz/10315248",
    serving: { label_serving_text: "1/2 cup (40g)", label_serving_grams: 40, edible_state_note: "dry label; eaten cooked" },
    label: { sodium_mg: 0, fiber_g: 4, potassium_mg: 150, iron_mg: 1.6, calcium_mg: 0, vitamin_d_mcg: 0 },
    label_flags: { source: "walmart_business", label_micros_partial: true, dv_only_fields_present: false },
    usda_fill: { magnesium_mg: 108, zinc_mg: 1.3, folate_mcg: 12.8, b12_mcg: 0, choline_mg: 16, omega3_epa_dha_mg: 0, vitamin_a_mcg_rae: 0, vitamin_c_mg: 0, source: "USDA FDC: oats, dry (closest match), 40g" }
  },
  {
    id: "russet_potatoes_5lb",
    name: "Russet Potatoes (5lb) - baked edible state",
    walmart_url: "https://www.walmart.com/ip/Fresh-Idaho-Russet-Potatoes-5-lb-Bag/10447839",
    serving: { label_serving_text: "1 baked potato (173g)", label_serving_grams: 173, edible_state_note: "produce (no Walmart label panel)" },
    label: { fiber_g: null, potassium_mg: null, sodium_mg: null },
    label_flags: { source: "none", label_micros_partial: true, no_walmart_label_for_produce: true },
    usda_fill: { fiber_g: 4, potassium_mg: 951.5, sodium_mg: 24.2, magnesium_mg: 51.9, calcium_mg: 31.1, iron_mg: 1.9, zinc_mg: 0.61, vitamin_d_mcg: 0, vitamin_c_mg: 14.4, vitamin_a_mcg_rae: 1.7, folate_mcg: 45, b12_mcg: 0, omega3_epa_dha_mg: 0, choline_mg: 26, source: "USDA FDC: potato, russet, baked, 173g" }
  },
  {
    id: "ground_turkey_festive_87_13",
    name: "Ground Turkey (1lb) - FESTIVE (SmartLabel verified)",
    walmart_url: "https://www.walmart.com/ip/FESTIVE-Ground-Turkey-Frozen-1-lb-Roll/22210558",
    serving: { label_serving_text: "4 oz (112g)", label_serving_grams: 112, edible_state_note: "label via SmartLabel" },
    label: { sodium_mg: 80, potassium_mg: 190, calcium_mg: 100, iron_mg: 1.8, vitamin_a_mcg: 0, vitamin_d_mcg: 0, fiber_g: 0 },
    label_flags: { source: "smartlabel", label_micros_partial: true, dv_only_fields_present: false },
    usda_fill: { magnesium_mg: 31.4, zinc_mg: 3.95, folate_mcg: 7.9, b12_mcg: 1.85, choline_mg: 85.9, omega3_epa_dha_mg: 34.3, vitamin_c_mg: 0, vitamin_a_mcg_rae: 39.3, source: "USDA FDC: ground turkey cooked (closest match), 112g" }
  },
  {
    id: "mixed_veg_birdseye_80oz",
    name: "Birds Eye Frozen Mixed Vegetables (80 oz)",
    walmart_url: "https://www.walmart.com/ip/Birds-Eye-Frozen-Mixed-Vegetables-Corn-Carrots-Green-Beans-Peas-80-oz-Frozen/16654198",
    serving: { label_serving_text: "2/3 cup (~91g)", label_serving_grams: 91, edible_state_note: "label panel often not accessible; use USDA fill unless SmartLabel captured" },
    label: { fiber_g: null, sodium_mg: null, potassium_mg: null, iron_mg: null },
    label_flags: { source: "none", label_micros_partial: true, not_walmart_panel_accessible: true },
    usda_fill: { fiber_g: 2, potassium_mg: 220, sodium_mg: 25, magnesium_mg: 18, calcium_mg: 15, iron_mg: 0.4, zinc_mg: 0.4, vitamin_d_mcg: 0, vitamin_c_mg: 3, vitamin_a_mcg_rae: 110, folate_mcg: 20, b12_mcg: 0, omega3_epa_dha_mg: 0, choline_mg: 20, source: "USDA FDC: mixed vegetables (corn/carrots/beans/peas), cooked/no salt, ~91g" }
  },
  {
    id: "spinach_gv_frozen_chopped",
    name: "Great Value Chopped Spinach (Frozen)",
    walmart_url: "https://www.walmart.com/ip/Great-Value-Chopped-Spinach-12-oz-Frozen/431513547",
    serving: { label_serving_text: "1 cup (81g)", label_serving_grams: 81, edible_state_note: "label captured via third-party panel" },
    label: { fiber_g: 3, potassium_mg: 250, sodium_mg: 80, calcium_mg: 120, iron_mg: 1.6 },
    label_flags: { source: "label_capture", label_micros_partial: true, label_verified_via_third_party_capture: true },
    usda_fill: { magnesium_mg: 60.8, zinc_mg: 0.45, vitamin_d_mcg: 0, vitamin_c_mg: 4.47, vitamin_a_mcg_rae: 474.7, folate_mcg: 117.5, b12_mcg: 0, omega3_epa_dha_mg: 0, choline_mg: 17.9, source: "USDA FDC: spinach frozen/cooked (closest match), 81g" }
  },
  {
    id: "black_beans_gv_dry_4lb_45595285",
    name: "Great Value Black Beans (Dry) 4 lb - SKU/URL locked",
    walmart_url: "https://www.walmart.com/ip/Great-Value-Black-Beans-4-lb/45595285",
    serving: { label_serving_text: "label serving (dry) - grams not visible on panel", label_serving_grams: null, edible_state_note: "dry label; users eat cooked; conversion handled separately" },
    label: { sodium_mg: 0, fiber_g: 5, potassium_mg: 520, calcium_mg: 43, iron_mg: 1.8, vitamin_d_mcg: 0 },
    label_flags: { source: "walmart_business", label_micros_partial: true, dry_serving_label: true, serving_grams_not_visible: true, note_alt_business_listing_exists: true },
    usda_fill: { magnesium_mg: 91, zinc_mg: 1.44, folate_mcg: 194, b12_mcg: 0, choline_mg: 42.4, omega3_epa_dha_mg: 0, vitamin_a_mcg_rae: 0, vitamin_c_mg: 0, source: "USDA FDC: black beans, boiled without salt (use cooked conversion layer)" }
  },
  {
    id: "iodized_salt_gv_26oz",
    name: "Great Value Iodized Salt (26 oz)",
    walmart_url: "https://www.walmart.com/ip/Great-Value-Iodized-Salt-26-oz/10448316",
    serving: { label_serving_text: "1/4 tsp (2g)", label_serving_grams: 2, edible_state_note: "seasoning" },
    label: { sodium_mg: 590, potassium_mg: 0, fiber_g: 0, calcium_mg: 0, iron_mg: 0 },
    label_flags: { source: "label_site_or_panel", label_micros_partial: true, dv_only_fields_present: false },
    usda_fill: { magnesium_mg: 0, zinc_mg: 0, vitamin_d_mcg: 0, vitamin_c_mg: 0, vitamin_a_mcg_rae: 0, folate_mcg: 0, b12_mcg: 0, omega3_epa_dha_mg: 0, choline_mg: 0, source: "Label-confirmed; USDA not needed" }
  },
  {
    id: "banana_each",
    name: "Fresh Banana, Each",
    walmart_url: "https://www.walmart.com/ip/Fresh-Banana-Each/44390948",
    serving: { label_serving_text: "1 medium (118g)", label_serving_grams: 118, edible_state_note: "produce (no Walmart label panel)" },
    label: { fiber_g: null, potassium_mg: null },
    label_flags: { source: "none", label_micros_partial: true, no_walmart_label_for_produce: true },
    usda_fill: { fiber_g: 3.07, potassium_mg: 422.44, sodium_mg: 1.18, magnesium_mg: 31.86, calcium_mg: 5.9, iron_mg: 0.31, zinc_mg: 0.18, vitamin_d_mcg: 0, vitamin_c_mg: 10.27, vitamin_a_mcg_rae: 4.5, folate_mcg: 23.6, b12_mcg: 0, omega3_epa_dha_mg: 0, choline_mg: 14.7, source: "USDA FDC: banana, raw, 118g" }
  }
];

const WALMART_MICRO_PROFILE_ID_ALIASES = {
    eggs_large_60ct: "eggs_large",
    tilapia_gv_frozen_4lb: "tilapia_fillet",
    white_rice_enriched_20lb: "white_rice_dry",
    chocolate_milk_1pct_gv: "chocolate_milk_lowfat",
    olive_oil_gem_evoo: "olive_oil",
    chicken_breast_tray: "chicken_breast",
    oats_gv_instant_18oz: "instant_oats",
    russet_potatoes_5lb: "russet_potatoes",
    ground_turkey_festive_87_13: "ground_turkey_93_7",
    mixed_veg_birdseye_80oz: "mixed_vegetables_birds_eye",
    spinach_gv_frozen_chopped: "spinach_chopped_frozen",
    black_beans_gv_dry_4lb_45595285: "black_beans_dry_gv_4lb",
    banana_each: "banana_fresh_each"
};

function applyWalmartMicroProfiles(foods, profiles) {
    if (!Array.isArray(foods) || !Array.isArray(profiles)) return foods;
    const microValueSources = {
        LABEL_AMOUNT: 'LABEL_AMOUNT',
        DV_CONVERTED: 'DV_CONVERTED',
        USDA_FILL: 'USDA_FILL',
        EXISTING: 'EXISTING',
        DV_ONLY: 'DV_ONLY',
        LABEL_LT: 'LABEL_LT',
        MISSING: 'MISSING',
        UNKNOWN_SOURCE: 'UNKNOWN_SOURCE'
    };
    const microFoodKeyByNutrient = {
        fiber: 'fiber_g',
        potassium: 'potassium_mg',
        sodium: 'sodium_mg',
        magnesium: 'magnesium_mg',
        calcium: 'calcium_mg',
        iron: 'iron_mg',
        zinc: 'zinc_mg',
        vitamin_d: 'vitamin_d_mcg',
        vitamin_c: 'vitamin_c_mg',
        vitamin_a: 'vitamin_a_mcg_rae',
        folate: 'folate_mcg',
        b12: 'b12_mcg',
        omega_3: 'omega3_epa_dha_mg',
        choline: 'choline_mg'
    };
    const microDvReferenceByAmountKey = {
        calcium_mg: 1300,
        iron_mg: 18,
        vitamin_d_mcg: 20,
        vitamin_c_mg: 90,
        vitamin_a_mcg_rae: 900,
        folate_mcg: 400
    };
    const toNum = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const pickNum = (...vals) => {
        for (const v of vals) {
            const n = toNum(v);
            if (n !== null) return n;
        }
        return null;
    };
    const upsertMicros = (food, profile) => {
        const label = profile?.label || {};
        const usda = profile?.usda_fill || {};
        const existing = (food?.micros && typeof food.micros === 'object') ? food.micros : {};
        const existingValueSource = (food?.micro_value_source && typeof food.micro_value_source === 'object') ? food.micro_value_source : {};
        const merged = { ...existing };
        const valueSource = { ...existingValueSource };
        const pairs = [
            ['fiber', 'fiber_g'],
            ['potassium', 'potassium_mg'],
            ['sodium', 'sodium_mg'],
            ['magnesium', 'magnesium_mg'],
            ['calcium', 'calcium_mg'],
            ['iron', 'iron_mg'],
            ['zinc', 'zinc_mg'],
            ['vitamin_d', 'vitamin_d_mcg'],
            ['vitamin_c', 'vitamin_c_mg'],
            ['vitamin_a', 'vitamin_a_mcg_rae'],
            ['folate', 'folate_mcg'],
            ['b12', 'b12_mcg'],
            ['omega_3', 'omega3_epa_dha_mg'],
            ['choline', 'choline_mg']
        ];
        const setValueSource = (nutrientKey, amountKey, source) => {
            if (!nutrientKey || !amountKey || !source) return;
            valueSource[nutrientKey] = source;
            valueSource[amountKey] = source;
        };
        const setAmount = (nutrientKey, amountKey) => {
            const labelVal = toNum(label?.[amountKey]);
            if (labelVal !== null) {
                merged[amountKey] = labelVal;
                setValueSource(nutrientKey, amountKey, microValueSources.LABEL_AMOUNT);
                return;
            }
            const usdaVal = toNum(usda?.[amountKey]);
            if (usdaVal !== null) {
                merged[amountKey] = usdaVal;
                setValueSource(nutrientKey, amountKey, microValueSources.USDA_FILL);
                return;
            }
            const existingVal = toNum(existing?.[amountKey]);
            if (existingVal !== null) {
                merged[amountKey] = existingVal;
                setValueSource(nutrientKey, amountKey, microValueSources.EXISTING);
                return;
            }
            setValueSource(nutrientKey, amountKey, valueSource[nutrientKey] || microValueSources.MISSING);
        };
        pairs.forEach(([nutrientKey, amountKey]) => setAmount(nutrientKey, amountKey));
        if (!Number.isFinite(merged.vitamin_a_mcg_rae)) {
            const altALabel = toNum(label?.vitamin_a_mcg);
            const altAUsda = toNum(usda?.vitamin_a_mcg);
            if (altALabel !== null) {
                merged.vitamin_a_mcg_rae = altALabel;
                setValueSource('vitamin_a', 'vitamin_a_mcg_rae', microValueSources.LABEL_AMOUNT);
            } else if (altAUsda !== null) {
                merged.vitamin_a_mcg_rae = altAUsda;
                setValueSource('vitamin_a', 'vitamin_a_mcg_rae', microValueSources.USDA_FILL);
            }
        }
        const dvOnlyPairs = [
            ["calcium_mg", "calcium_percent_dv"],
            ["iron_mg", "iron_percent_dv"],
            ["vitamin_d_mcg", "vitamin_d_percent_dv"],
            ["vitamin_c_mg", "vitamin_c_percent_dv"],
            ["vitamin_a_mcg_rae", "vitamin_a_percent_dv"],
            ["folate_mcg", "folic_acid_percent_dv"]
        ];
        dvOnlyPairs.forEach(([amountKey, dvKey]) => {
            const dvPct = toNum(label?.[dvKey]);
            const hasDvOnly = Number.isFinite(dvPct);
            const hasAmountOnLabel = Number.isFinite(toNum(label?.[amountKey]));
            if (hasDvOnly && !hasAmountOnLabel) {
                const nutrientKey = Object.keys(microFoodKeyByNutrient).find((k) => microFoodKeyByNutrient[k] === amountKey) || amountKey;
                const dvRefAmount = Number(microDvReferenceByAmountKey?.[amountKey]);
                if (Number.isFinite(dvRefAmount) && dvRefAmount > 0) {
                    const converted = (Number(dvPct) / 100) * dvRefAmount;
                    if (Number.isFinite(converted)) {
                        // Prefer label-converted amount over USDA fallback when label only provides %DV.
                        merged[amountKey] = Number(converted.toFixed(3));
                        setValueSource(nutrientKey, amountKey, microValueSources.DV_CONVERTED);
                        return;
                    }
                }
                merged[amountKey] = null;
                setValueSource(nutrientKey, amountKey, microValueSources.DV_ONLY);
            }
        });
        const fiberIsLessThan = Boolean(profile?.label_flags?.fiber_is_less_than) || Number.isFinite(toNum(label?.fiber_g_max));
        if (fiberIsLessThan && !Number.isFinite(toNum(label?.fiber_g))) {
            merged.fiber_g = null;
            setValueSource('fiber', 'fiber_g', microValueSources.LABEL_LT);
            const fiberMax = toNum(label?.fiber_g_max);
            if (fiberMax !== null) merged.fiber_g_max = fiberMax;
        }
        pairs.forEach(([nutrientKey, amountKey]) => {
            const current = toNum(merged?.[amountKey]);
            if (current === null && !valueSource[nutrientKey]) {
                setValueSource(nutrientKey, amountKey, microValueSources.MISSING);
            }
        });
        return { merged, valueSource };
    };

    const byId = new Map(foods.map((f) => [String(f?.id || ''), f]));
    profiles.forEach((profile) => {
        const rawId = String(profile?.id || '');
        const targetId = WALMART_MICRO_PROFILE_ID_ALIASES[rawId] || rawId;
        const food = byId.get(targetId);
        if (!food) return;
        const labelServingText = String(profile?.serving?.label_serving_text || '').trim();
        const labelServingGrams = toNum(profile?.serving?.label_serving_grams);
        food.walmart_url = profile?.walmart_url || food.walmart_url || food.url;
        if (profile?.walmart_url) food.url = profile.walmart_url;
        food.label = profile?.label ? { ...profile.label } : (food.label || {});
        food.label_flags = profile?.label_flags ? { ...profile.label_flags } : (food.label_flags || {});
        food.usda_fill = profile?.usda_fill ? { ...profile.usda_fill } : (food.usda_fill || {});
        if (profile?.yield) food.yield = { ...profile.yield };
        if (profile?.serving) {
            food.serving_meta = { ...profile.serving };
            if (labelServingText) food.servingLabel = labelServingText;
            if (labelServingGrams !== null) food.servingGrams = labelServingGrams;
        }
        const microMerge = upsertMicros(food, profile);
        food.micros = microMerge.merged;
        food.micro_value_source = microMerge.valueSource;
        const nextSources = [];
        if (profile?.label_flags?.source) nextSources.push(String(profile.label_flags.source));
        if (profile?.usda_fill?.source) nextSources.push(String(profile.usda_fill.source));
        if (nextSources.length) food.sources = Array.from(new Set(nextSources));
    });
    return foods;
}

applyWalmartMicroProfiles(WALMART_BASELINE_FOODS, WALMART_MICRO_PROFILE_UPDATES);

// Additional groceries can be injected without mutating the baseline array.
// Keep entries on this schema:
// { id, name, category, macros, servingGrams, pricePerServing, container }
const NEW_GROCERY_ITEMS = Array.isArray(globalThis.__ODE_NEW_GROCERY_ITEMS)
    ? globalThis.__ODE_NEW_GROCERY_ITEMS
    : [];

const LEGUME_CATEGORY_IDS = new Set([
    'black_beans',
    'great_value_black_beans',
    'pinto_beans',
    'kidney_beans',
    'lentils',
    'chickpeas',
    'black_beans_dry_gv_4lb'
]);

function coerceLegumeCategory(food) {
    const raw = food && typeof food === 'object' ? food : {};
    const id = String(raw.id || '').trim().toLowerCase();
    const name = String(raw.name || '').toLowerCase();
    const isKnownLegumeId = LEGUME_CATEGORY_IDS.has(id);
    const isDryLegumeByName = /\b(black bean|pinto bean|kidney bean|lentil|chickpea|garbanzo|dry bean|dry lentil)\b/.test(name);
    if (!isKnownLegumeId && !isDryLegumeByName) return raw;
    return {
        ...raw,
        category: 'carb'
    };
}

const COST_WINDOW_MODES = {
    AVG_28: 'avg_28',
    REST_MONTH: 'rest_month'
};
const COST_WINDOW_LABELS = {
    [COST_WINDOW_MODES.AVG_28]: 'Avg month (28d)',
    [COST_WINDOW_MODES.REST_MONTH]: 'Rest of month'
};
let lastCostWindowSnapshot = null;

function restOfMonthLabel(daysRemaining) {
    const d = Number(daysRemaining);
    if (!Number.isFinite(d) || d <= 0) return COST_WINDOW_LABELS[COST_WINDOW_MODES.REST_MONTH];
    return `Rest of month (${Math.round(d)}d)`;
}

function getCostWindowMode() {
    try {
        const stored = localStorage.getItem('ode_cost_window_mode');
        if (stored === COST_WINDOW_MODES.REST_MONTH) return COST_WINDOW_MODES.REST_MONTH;
    } catch {
        // ignore
    }
    return COST_WINDOW_MODES.AVG_28;
}

function setCostWindowMode(mode) {
    const next = mode === COST_WINDOW_MODES.REST_MONTH ? COST_WINDOW_MODES.REST_MONTH : COST_WINDOW_MODES.AVG_28;
    try {
        localStorage.setItem('ode_cost_window_mode', next);
    } catch {
        // ignore
    }
    return next;
}

function daysRemainingInCurrentMonth(refDate = new Date()) {
    const d = refDate instanceof Date ? refDate : new Date();
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = d.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const today = d.getDate();
    return Math.max(1, lastDay - today + 1);
}

function applyPenalty(baseScore, penaltyPoints, scoreDirection) {
    const base = Number(baseScore);
    const points = Math.max(0, Number(penaltyPoints) || 0);
    if (!Number.isFinite(base) || points <= 0) return baseScore;
    if (scoreDirection === 'higher_is_better') return base - points;
    return base + points;
}

function evaluateCutFrontLoad(frontLoadPct) {
    const pct = Number(frontLoadPct);
    if (!Number.isFinite(pct)) return { hardReject: true, penaltyPoints: 0 };
    const preferredMin = 0.55;
    const preferredMax = 0.65;
    const hardRejectMin = 0.45;
    const hardRejectMax = 0.75;
    if (pct < hardRejectMin || pct > hardRejectMax) return { hardReject: true, penaltyPoints: 0 };
    const clamped = Math.max(preferredMin, Math.min(preferredMax, pct));
    const distancePercentPoints = Math.ceil(Math.abs(pct - clamped) * 100 / 5);
    return { hardReject: false, penaltyPoints: Math.max(0, distancePercentPoints * 8) };
}

function getCutOliveOilMaxMeals(fatTargetG) {
    const fatTarget = Number(fatTargetG) || 0;
    return fatTarget <= 70 ? 1 : 2;
}

function buildSaltWaterHydrationNote({ goal, targets, profile, selections }) {
    if (String(goal || '').toUpperCase() !== 'CUT') return null;

    const activityLevel = String(selections?.activityLevel || '').toLowerCase();
    const stress = String(selections?.stress || '').toLowerCase();
    const closeToFailure = String(selections?.closeToFailure || '').toLowerCase() === 'yes';
    const disciplineKey = String(profile?.key || profile?.discipline || '').toLowerCase();
    const isBodyOrPower = disciplineKey.includes('bodybuilding') || disciplineKey.includes('powerbuilding');
    const dayCalories = Number(targets?.calories) || 0;
    const reportsHeadacheOrCramp = Boolean(selections?.headachesOrCramps);

    const include = (
        (stress === 'high' || activityLevel === 'very active') ||
        (isBodyOrPower && closeToFailure) ||
        (dayCalories > 0 && dayCalories <= 2300) ||
        reportsHeadacheOrCramp
    );
    if (!include) return null;

    const heavySweat = stress === 'high' || activityLevel === 'very active';
    const recipe = heavySweat
        ? '24 oz water + 1/2 tsp iodized salt'
        : '16 oz water + 1/4 tsp iodized salt';

    return {
        type: 'hydration',
        title: 'Salt Water',
        recipe,
        timing: '30Ã¢â‚¬â€œ60 minutes pre-workout OR with first meal',
        why: 'Cutting + sweating lowers sodium. Low sodium can make workouts feel weak, cause headaches, and increase cravings. This helps training performance and keeps pumps/energy more stable.',
        warning: 'If you have high blood pressure, kidney disease, or are on sodium-restricting meds, skip this unless your doctor says ok. This is for hydration/performance on a cut, not for fat loss.'
    };
}

function syncCostWindowToggleUi() {
    const mode = getCostWindowMode();
    const checked = mode === COST_WINDOW_MODES.REST_MONTH;
    document.querySelectorAll('[data-cost-window-switch]').forEach((input) => {
        input.checked = checked;
        const row = input.closest('.cost-window-toggle-row');
        if (!row) return;
        const avgLabel = row.querySelector('[data-mode-label="avg_28"]');
        const restLabel = row.querySelector('[data-mode-label="rest_month"]');
        avgLabel?.classList.toggle('active', !checked);
        restLabel?.classList.toggle('active', checked);
    });
}

function renderCostWindowSummary(snapshot) {
    const data = snapshot && typeof snapshot === 'object' ? snapshot : lastCostWindowSnapshot;
    if (!data) return;
    lastCostWindowSnapshot = data;

    const mode = getCostWindowMode();
    const avgMonthly28 = Number(data.avgMonthly28);
    const restOfMonth = Number(data.restOfMonth);
    const weeklyCost = Number(data.weeklyCost);
    const daysRemaining = Number(data.daysRemaining);
    const value = mode === COST_WINDOW_MODES.REST_MONTH ? restOfMonth : avgMonthly28;
    const restLabel = restOfMonthLabel(daysRemaining);

    const monthlyLabelEl = document.getElementById('p-monthly-cost-label');
    if (monthlyLabelEl) monthlyLabelEl.textContent = mode === COST_WINDOW_MODES.REST_MONTH ? restLabel : COST_WINDOW_LABELS[mode];
    const monthlyValueEl = document.getElementById('p-monthly-cost');
    if (monthlyValueEl) monthlyValueEl.textContent = Number.isFinite(value) ? formatCurrency(value) : EM_DASH;

    const weeklyValueEl = document.getElementById('p-weekly-cost');
    if (weeklyValueEl && Number.isFinite(weeklyCost)) weeklyValueEl.textContent = formatCurrency(weeklyCost);

    const overviewLabelEl = document.getElementById('overview-month-cost-label');
    if (overviewLabelEl) overviewLabelEl.textContent = mode === COST_WINDOW_MODES.REST_MONTH ? restLabel : COST_WINDOW_LABELS[mode];
    const overviewValueEl = document.getElementById('overview-month-projected');
    if (overviewValueEl) overviewValueEl.textContent = Number.isFinite(value) ? formatCurrency(value) : EM_DASH;
    const overviewDaysEl = document.getElementById('overview-month-days');
    if (overviewDaysEl) {
        if (mode === COST_WINDOW_MODES.REST_MONTH && Number.isFinite(daysRemaining)) {
            overviewDaysEl.textContent = `${daysRemaining} days remaining`;
        } else if (mode === COST_WINDOW_MODES.AVG_28) {
            overviewDaysEl.textContent = '28-day average';
        }
    }

    document.querySelectorAll('[data-mode-label="rest_month"]').forEach((el) => {
        el.textContent = restLabel;
    });

    syncCostWindowToggleUi();
}

if (!window.__odeCostToggleBound) {
    window.__odeCostToggleBound = true;
    document.addEventListener('change', (event) => {
        const input = event.target?.closest?.('[data-cost-window-switch]');
        if (!input) return;
        setCostWindowMode(input.checked ? COST_WINDOW_MODES.REST_MONTH : COST_WINDOW_MODES.AVG_28);
        renderCostWindowSummary();
    });
}

function normalizeFoodItem(food) {
    const raw = food || {};
    const id = String(raw.id || '').trim();
    const name = String(raw.name || '').trim();
    const category = String(raw.category || '').trim().toLowerCase();

    if (!id || !name) {
        throw { error: 'INVALID_GROCERY_INTEGRATION', reason: 'Missing required id or name in new grocery item.' };
    }
    if (!['protein', 'carb', 'fat'].includes(category)) {
        throw { error: 'INVALID_GROCERY_INTEGRATION', reason: `Invalid category "${category}" for ${id}. Expected protein|carb|fat.` };
    }

    const rawMacros = raw.macros || {};
    const calories = Math.max(0, Number(rawMacros.calories ?? rawMacros.kcal ?? 0) || 0);
    const protein = Math.max(0, Number(rawMacros.protein ?? rawMacros.protein_g ?? 0) || 0);
    const carbs = Math.max(0, Number(rawMacros.carbs ?? rawMacros.carbs_g ?? 0) || 0);
    const fat = Math.max(0, Number(rawMacros.fat ?? rawMacros.fat_g ?? 0) || 0);

    const container = raw.container && typeof raw.container === 'object' ? { ...raw.container } : {};
    const containerSize = Math.max(0, Number(container.size) || 0);
    const containerPrice = Math.max(0, Number(container.price) || 0);
    const containerUnit = String(container.unit || '').trim() || 'servings';

    const servingGrams = Math.max(0, Number(raw.servingGrams ?? rawMacros.serving_size ?? 0) || 0);
    if (!servingGrams) {
        throw { error: 'INVALID_GROCERY_INTEGRATION', reason: `Missing servingGrams for ${id}.` };
    }

    const servingsPerContainer = (() => {
        const existing = Number(raw.servingsPerContainer);
        if (Number.isFinite(existing) && existing > 0) return existing;
        if (containerSize > 0) {
            if (containerUnit.toLowerCase() === 'servings') return containerSize;
            if (servingGrams > 0 && /(g|gram|grams)/i.test(containerUnit)) return containerSize / servingGrams;
        }
        return null;
    })();

    const pricePerServing = Number.isFinite(raw.pricePerServing) && Number(raw.pricePerServing) >= 0
        ? Number(raw.pricePerServing)
        : (Number.isFinite(containerPrice) && containerPrice >= 0 && Number.isFinite(servingsPerContainer) && servingsPerContainer > 0
            ? containerPrice / servingsPerContainer
            : null);

    if (!Number.isFinite(pricePerServing) || pricePerServing < 0) {
        throw { error: 'INVALID_GROCERY_INTEGRATION', reason: `Missing pricePerServing for ${id}.` };
    }

    // Use the same default quality behavior used by buildAllMeals() normalization.
    const qualityScore = Number.isFinite(raw.qualityScore) ? Number(raw.qualityScore) : 2;
    const caloriesBase = calories > 0 ? calories : 1;
    const macroRatios = {
        proteinPerCalorie: protein / caloriesBase,
        carbsPerCalorie: carbs / caloriesBase,
        fatPerCalorie: fat / caloriesBase
    };

    const pricePerGramProtein = protein > 0 ? pricePerServing / protein : null;
    const pricePerGramCarb = carbs > 0 ? pricePerServing / carbs : null;
    const pricePerGramFat = fat > 0 ? pricePerServing / fat : null;

    // Keep density aligned with existing ranking formulas in buildAllMeals().
    const macroDensityScore = category === 'protein'
        ? (protein / caloriesBase) * 100 + qualityScore * 10
        : category === 'carb'
            ? (carbs / caloriesBase) * 40 + qualityScore * 10
            : fat + qualityScore * 10;

    return {
        ...raw,
        id,
        name,
        category,
        macros: { calories, protein, carbs, fat },
        servingGrams,
        pricePerServing,
        container: {
            ...container,
            size: containerSize,
            unit: containerUnit,
            price: containerPrice
        },
        macroRatios,
        pricePerGramProtein,
        pricePerGramCarb,
        pricePerGramFat,
        macroDensityScore,
        qualityScore
    };
}

const GROCERY_INTEGRATION = (() => {
    try {
        const normalizedNewFoods = NEW_GROCERY_ITEMS.map((food) => normalizeFoodItem(coerceLegumeCategory(food)));
        const classifiedBaselineFoods = WALMART_BASELINE_FOODS.map((food) => coerceLegumeCategory(food));
        return { foods: [...classifiedBaselineFoods, ...normalizedNewFoods], error: null };
    } catch (err) {
        const reason = typeof err?.reason === 'string' ? err.reason : (err?.message || 'Normalization failure while merging new groceries.');
        return {
            foods: [...WALMART_BASELINE_FOODS],
            error: { error: 'INVALID_GROCERY_INTEGRATION', reason }
        };
    }
})();

const ALL_FOODS = GROCERY_INTEGRATION.foods;
const GROCERY_INTEGRATION_ERROR = GROCERY_INTEGRATION.error;

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
    'Calculating caloriesÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦',
    'Adjusting for your training styleÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦',
    'Finalizing baseline protocolÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦'
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
    const heightUnitBtns = Array.from(document.querySelectorAll('[data-height-unit]'));
    const heightLabel = document.getElementById('ns-height-label');
    const heightInchesWrap = document.getElementById('ns-height-inches-wrap');
    const heightFeetWrap = document.getElementById('ns-height-feet-wrap');
    const heightInchesInput = document.getElementById('ns-height');
    const heightFeetInput = document.getElementById('ns-height-ft');
    const heightInInput = document.getElementById('ns-height-in');
    const ageInput = document.getElementById('ns-age');
    const femaleSexPill = document.getElementById('ns-sex-female');
    const pregnantToggleWrap = document.getElementById('ns-pregnant-toggle-wrap');
    const pregnantToggleOptions = Array.from(document.querySelectorAll('[data-pregnant-value]'));
    const trimesterWrap = document.getElementById('ns-trimester-wrap');
    const lactatingWrap = document.getElementById('ns-lactating-wrap');
    const lactatingInput = document.getElementById('ns-lactating');
    let heightUnit = 'inches';

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
        allergies: document.getElementById('g-allergies'),
        tasteCost: document.getElementById('g-taste-cost')
    };

    // FOOD WIZARD DISABLED - All references permanently removed

    const startFlow = () => {
        entry.classList.add('hidden');
        flow.classList.remove('hidden');
        nutritionState.step = 1;
        showStep(1);
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
            if (reason !== 'signed_in_auto') {
                startGroceryPrimary.focus();
                setTimeout(() => handoff?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
            }
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
                prep: 'batch',
                selections: {
                    sex: nutritionState.selections?.sex || null,
                    ageYears: Number(nutritionState.selections?.ageYears) || null,
                    pregnant: nutritionState.selections?.pregnant || null,
                    trimester: nutritionState.selections?.trimester || null,
                    lactating: nutritionState.selections?.lactating || null,
                    intensity: nutritionState.selections?.intensity || null,
                    frequency: nutritionState.selections?.frequency || null,
                    goal: nutritionState.selections?.goal || null,
                    style: nutritionState.selections?.style || null,
                    heightIn: Number(nutritionState.selections?.heightIn) || null,
                    weightLbs: Number(nutritionState.selections?.weightLbs) || null,
                    goalWeightLbs: Number(nutritionState.selections?.goalWeightLbs) || null,
                    lossRateLbsPerWeek: Number(nutritionState.selections?.lossRateLbsPerWeek || 1.5) || 1.5
                }
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
            if (groupName === 'sex') syncPregnancyToggleVisibility();
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
        window.scrollTo({ top: 0, behavior: 'auto' });
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
        groupEl.querySelectorAll('button[data-value]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    const syncPregnancyOptionUi = () => {
        const selected = String(nutritionState.selections.pregnant || '').toUpperCase();
        pregnantToggleOptions.forEach((opt) => {
            const isActive = String(opt.dataset.pregnantValue || '').toUpperCase() === selected;
            opt.classList.toggle('active', isActive);
            opt.setAttribute('aria-checked', isActive ? 'true' : 'false');
        });
    };

    const syncPregnancyToggleVisibility = () => {
        const femaleSelected = nutritionState.selections.sex === 'FEMALE';
        femaleSexPill?.classList.toggle('pregnancy-visible', femaleSelected);
        lactatingWrap?.classList.toggle('hidden', !femaleSelected);
        if (!femaleSelected) {
            nutritionState.selections.pregnant = null;
            nutritionState.selections.trimester = null;
            nutritionState.selections.lactating = null;
        } else if (!nutritionState.selections.pregnant) {
            nutritionState.selections.pregnant = 'NO';
            if (!nutritionState.selections.lactating) nutritionState.selections.lactating = String(lactatingInput?.value || 'NO').toUpperCase();
        }
        const pregnantYes = femaleSelected && String(nutritionState.selections.pregnant || '').toUpperCase() === 'YES';
        trimesterWrap?.classList.toggle('hidden', !pregnantYes);
        if (!pregnantYes) {
            nutritionState.selections.trimester = null;
            document.querySelectorAll('[data-group="trimester"] button[data-value]').forEach((btn) => btn.classList.remove('active'));
        }
        syncPregnancyOptionUi();
    };

    const setPregnancySelection = (valueRaw) => {
        if (nutritionState.selections.sex !== 'FEMALE') return;
        const value = String(valueRaw || '').toUpperCase() === 'YES' ? 'YES' : 'NO';
        nutritionState.selections.pregnant = value;
        if (value === 'YES') nutritionState.selections.lactating = 'NO';
        if (lactatingInput) lactatingInput.value = String(nutritionState.selections.lactating || 'NO');
        syncPregnancyOptionUi();
        syncPregnancyToggleVisibility();
    };

    lactatingInput?.addEventListener('change', () => {
        nutritionState.selections.lactating = String(lactatingInput.value || 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO';
    });

    pregnantToggleOptions.forEach((opt) => {
        opt.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setPregnancySelection(opt.dataset.pregnantValue);
        });
        opt.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            setPregnancySelection(opt.dataset.pregnantValue);
        });
    });
    syncPregnancyToggleVisibility();

    function readHeightInches() {
        if (heightUnit === 'feet') {
            const feet = Number(heightFeetInput?.value);
            const inches = Number(heightInInput?.value);
            if (!Number.isFinite(feet) || !Number.isFinite(inches)) return NaN;
            return feet * 12 + inches;
        }
        return Number(heightInchesInput?.value);
    }

    function setHeightUnit(unit) {
        heightUnit = unit === 'feet' ? 'feet' : 'inches';
        const isFeet = heightUnit === 'feet';

        if (heightInchesWrap) heightInchesWrap.classList.toggle('hidden', isFeet);
        if (heightFeetWrap) heightFeetWrap.classList.toggle('hidden', !isFeet);
        if (heightLabel) heightLabel.textContent = isFeet ? 'Height (inches)' : 'Height (inches)';

        if (heightInchesInput) heightInchesInput.required = !isFeet;
        if (heightFeetInput) heightFeetInput.required = isFeet;
        if (heightInInput) heightInInput.required = isFeet;

        heightUnitBtns.forEach((btn) => {
            const active = btn.dataset.heightUnit === heightUnit;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        if (isFeet) {
            const totalInches = Number(heightInchesInput?.value);
            if (Number.isFinite(totalInches) && totalInches > 0) {
                const feet = Math.floor(totalInches / 12);
                const inches = Math.round(totalInches % 12);
                if (heightFeetInput) heightFeetInput.value = String(feet);
                if (heightInInput) heightInInput.value = String(inches);
            }
        } else {
            const feet = Number(heightFeetInput?.value);
            const inches = Number(heightInInput?.value);
            if (Number.isFinite(feet) && Number.isFinite(inches)) {
                const total = feet * 12 + inches;
                if (heightInchesInput) heightInchesInput.value = String(total);
            }
        }
    }

    heightUnitBtns.forEach((btn) => {
        btn.addEventListener('click', () => setHeightUnit(btn.dataset.heightUnit || 'inches'));
    });
    setHeightUnit('inches');

    function collectStep2() {
        const sex = nutritionState.selections.sex;
        const intensity = nutritionState.selections.intensity;
        const heightIn = readHeightInches();
        const weightLbs = Number(document.getElementById('ns-weight').value);
        const goalWeightLbs = Number(document.getElementById('ns-goal-weight')?.value);
        const ageYears = Number(ageInput?.value);
        const pregnant = String(nutritionState.selections.pregnant || '').toUpperCase();
        const lactating = String(lactatingInput?.value || nutritionState.selections.lactating || 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO';

        const heightOk = Number.isFinite(heightIn) && heightIn >= 48 && heightIn <= 84;
        const ageOk = Number.isFinite(ageYears) && ageYears >= 14 && ageYears <= 80;
        if (!sex || !intensity || !heightOk || !weightLbs || !goalWeightLbs || !ageOk) {
            alert('Fill in age, sex, valid height, current bodyweight, goal bodyweight, and training intensity.');
            return false;
        }
        if (sex === 'FEMALE' && pregnant === 'YES' && !nutritionState.selections.trimester) {
            alert('Select trimester for pregnancy-specific micronutrient targets.');
            return false;
        }

        nutritionState.selections.ageYears = Math.round(ageYears);
        nutritionState.selections.ageRange = ageYears <= 18 ? '14-18' : ageYears <= 30 ? '19-30' : ageYears <= 50 ? '31-50' : '51+';
        nutritionState.selections.heightIn = heightIn;
        nutritionState.selections.weightLbs = weightLbs;
        nutritionState.selections.goalWeightLbs = goalWeightLbs;
        nutritionState.selections.lactating = sex === 'FEMALE' ? lactating : null;
        if (sex !== 'FEMALE') nutritionState.selections.trimester = null;

        try {
            postTrackEvent('nutrition_body_stats', {
                ageYears: nutritionState.selections.ageYears,
                heightIn,
                weightLbs,
                goalWeightLbs,
                goal: nutritionState.selections.goal || null,
                sex: nutritionState.selections.sex || null,
                pregnant: nutritionState.selections.pregnant || null,
                trimester: nutritionState.selections.trimester || null,
                lactating: nutritionState.selections.lactating || null,
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

function getNutritionAgeProfile(sel) {
    const rawAge = Number(sel?.ageYears);
    if (Number.isFinite(rawAge) && rawAge >= 14 && rawAge <= 100) {
        const age = Math.round(rawAge);
        const ageGroup = age <= 18 ? '14-18' : age <= 30 ? '19-30' : age <= 50 ? '31-50' : age <= 70 ? '51-70' : '71+';
        return { ageYears: age, ageGroup, assumed: false };
    }
    return { ageYears: 25, ageGroup: '19-30', assumed: true };
}

const NUTRITION_ENGINE_DEFAULTS = {
    cutLossRateLbsPerWeek: 1.5,
    kcalPerLb: 3500,
    maleCalorieFloor: 1600,
    femaleCalorieFloor: 1400
};

function normalizeGoalInput(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (value === 'CUT' || value === 'LOSE' || value === 'FAT-LOSS' || value === 'FAT LOSS') return 'CUT';
    if (value === 'BULK' || value === 'BUILD' || value === 'BUILD MUSCLE' || value === 'MUSCLE') return 'BUILD';
    if (value === 'STRENGTH' || value === 'PRIORITIZE STRENGTH') return 'STRENGTH';
    return '';
}

function normalizeStyleInput(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (value === 'STRENGTH' || value.includes('STRENGTH')) return 'STRENGTH';
    if (value === 'MIXED' || value.includes('MIXED')) return 'MIXED';
    if (value === 'CALISTHENICS' || value.includes('BODYWEIGHT')) return 'CALISTHENICS';
    return '';
}

function normalizeFrequencyInput(raw) {
    const value = String(raw || '').trim();
    if (value === '1-2') return '1-2';
    if (value === '3-4') return '3-4';
    if (value === '5-6') return '5-6';
    return '';
}

function normalizeIntensityInput(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (value === 'LIGHT') return 'LIGHT';
    if (value === 'INTENSE' || value === 'VERY_INTENSE' || value === 'VERY INTENSE') return 'INTENSE';
    if (value === 'AVERAGE') return 'AVERAGE';
    return '';
}

function resolveAgeBand(ageYears) {
    const age = Number(ageYears);
    if (!Number.isFinite(age)) return '19-30';
    if (age <= 18) return '14-18';
    if (age <= 30) return '19-30';
    if (age <= 50) return '31-50';
    if (age <= 70) return '51-70';
    return '71+';
}

function normalizeInputs(formState, options = {}) {
    const strictMode = options.strictMode !== false;
    const throwOnError = options.throwOnError !== false;
    const src = formState && typeof formState === 'object' ? formState : {};
    const warnings = [];
    const errors = [];

    const goal = normalizeGoalInput(src.goal);
    const style = normalizeStyleInput(src.style);
    const frequency = normalizeFrequencyInput(src.frequency);
    const intensity = normalizeIntensityInput(src.intensity);
    const sex = String(src.sex || '').toUpperCase() === 'FEMALE' ? 'FEMALE' : (String(src.sex || '').toUpperCase() === 'MALE' ? 'MALE' : '');

    const ageYears = Math.round(Number(src.ageYears));
    let heightIn = Number(src.heightIn);
    if (!Number.isFinite(heightIn)) {
        const ft = Number(src.heightFt ?? src.heightFeet);
        const inch = Number(src.heightInPart ?? src.heightInchesPart);
        if (Number.isFinite(ft) && Number.isFinite(inch)) heightIn = ft * 12 + inch;
    }
    const weightLbs = Number(src.weightLbs);
    const goalWeightLbs = Number(src.goalWeightLbs);
    const lossRateRaw = Number(src.lossRateLbsPerWeek ?? src.lbsPerWeek);
    let pregnant = String(src.pregnant || 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO';
    let lactating = String(src.lactating || 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO';
    const trimester = String(src.trimester || '').trim();

    if (!goal) errors.push('ERROR_MISSING_FIELD: goal');
    if (!style) errors.push('ERROR_MISSING_FIELD: style');
    if (!frequency) errors.push('ERROR_MISSING_FIELD: frequency');
    if (!sex) errors.push('ERROR_MISSING_FIELD: sex');
    if (!intensity) errors.push('ERROR_MISSING_FIELD: intensity');
    if (!Number.isFinite(ageYears)) errors.push('ERROR_MISSING_FIELD: ageYears');
    if (!Number.isFinite(heightIn)) errors.push('ERROR_MISSING_FIELD: heightIn');
    if (!Number.isFinite(weightLbs)) errors.push('ERROR_MISSING_FIELD: weightLbs');
    if (!Number.isFinite(goalWeightLbs)) errors.push('ERROR_MISSING_FIELD: goalWeightLbs');

    if (Number.isFinite(ageYears) && (ageYears < 14 || ageYears > 80)) errors.push('ERROR_OUT_OF_RANGE: ageYears (must be 14-80)');
    if (Number.isFinite(heightIn) && (heightIn < 48 || heightIn > 84)) errors.push('ERROR_OUT_OF_RANGE: heightIn (must be 48-84)');
    if (Number.isFinite(weightLbs) && (weightLbs < 80 || weightLbs > 500)) errors.push('ERROR_OUT_OF_RANGE: weightLbs (must be 80-500)');
    if (Number.isFinite(goalWeightLbs) && (goalWeightLbs < 80 || goalWeightLbs > 500)) errors.push('ERROR_OUT_OF_RANGE: goalWeightLbs (must be 80-500)');

    if (sex === 'FEMALE') {
        if (pregnant === 'YES' && lactating === 'YES') {
            errors.push('ERROR_CONFLICT: pregnant=true and lactating=true');
        }
        if (pregnant === 'YES' && strictMode && !trimester) errors.push('ERROR_MISSING_FIELD: trimester');
    } else {
        pregnant = 'NO';
        lactating = 'NO';
    }

    if (goal === 'CUT' && Number.isFinite(weightLbs) && Number.isFinite(goalWeightLbs) && goalWeightLbs >= weightLbs) {
        warnings.push('Goal weight >= current weight; cut math still uses cut rate, but goal weight conflicts.');
    }

    const profile = {
        goal,
        style,
        frequency,
        sex,
        pregnant,
        lactating,
        trimester: pregnant === 'YES' ? trimester : '',
        ageYears,
        ageGroup: Number.isFinite(ageYears) ? resolveAgeBand(ageYears) : null,
        heightIn,
        heightCm: Number.isFinite(heightIn) ? (heightIn * 2.54) : null,
        weightLbs,
        weightKg: Number.isFinite(weightLbs) ? (weightLbs * 0.45359237) : null,
        goalWeightLbs,
        intensity,
        lossRateLbsPerWeek: Number.isFinite(lossRateRaw) ? lossRateRaw : 1.5
    };

    if (errors.length && throwOnError) {
        const err = new Error(errors.join(' | '));
        err.code = 'NUTRITION_INPUT_INVALID';
        err.errors = errors;
        err.profile = profile;
        err.warnings = warnings;
        throw err;
    }

    return { ...profile, warnings, errors };
}

function calcCalories(profile, options = {}) {
    const cfg = { ...NUTRITION_ENGINE_DEFAULTS, ...(options || {}) };
    const warnings = [];
    const sexConst = profile.sex === 'FEMALE' ? -161 : 5;
    const bmr = Math.round((10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.ageYears) + sexConst);
    const factorTable = {
        '1-2': { LIGHT: 1.35, AVERAGE: 1.40, INTENSE: 1.45 },
        '3-4': { LIGHT: 1.45, AVERAGE: 1.55, INTENSE: 1.60 },
        '5-6': { LIGHT: 1.55, AVERAGE: 1.65, INTENSE: 1.75 }
    };
    const baseFactor = factorTable[profile.frequency]?.[profile.intensity] || 1.40;
    let styleBoost = 0;
    if (profile.style === 'MIXED') styleBoost = 0.03;
    else if (profile.style === 'CALISTHENICS' && profile.intensity === 'INTENSE') styleBoost = 0.02;
    const activityFactor = clamp(baseFactor + styleBoost, 1.30, 1.85);
    const maintenance = Math.round(bmr * activityFactor);

    let target = maintenance;
    let deficitPerDay = 0;
    let lossRateLbsPerWeek = 0;
    let selectedRate = null;
    let selectedDeficit = 0;
    let cutFloorApplied = false;
    let cutFloorValue = null;
    let generalFloorApplied = false;
    let generalFloorValue = null;
    if (profile.goal === 'CUT') {
        const requestedRate = Number(profile.lossRateLbsPerWeek);
        selectedRate = [1.0, 1.5, 2.0].includes(requestedRate) ? requestedRate : cfg.cutLossRateLbsPerWeek;
        const deficitMap = { 1: 500, 1.5: 750, 2: 1000 };
        const requestedDeficit = deficitMap[selectedRate] || 750;
        selectedDeficit = requestedDeficit;
        lossRateLbsPerWeek = selectedRate;
        if (profile.pregnant === 'YES') {
            warnings.push('Pregnancy detected; weight-loss target disabled. Using maintenance calories.');
            target = maintenance;
            deficitPerDay = 0;
            lossRateLbsPerWeek = 0;
        } else if (profile.lactating === 'YES') {
            const capped = Math.min(requestedDeficit, 300);
            warnings.push('Lactating; deficit capped to 300 kcal/day (conservative).');
            target = maintenance - capped;
            deficitPerDay = capped;
            warnings.push(`Cut set to ${selectedRate} lb/week, but lactation cap applied (max 300 kcal/day).`);
        } else {
            target = maintenance - requestedDeficit;
            deficitPerDay = requestedDeficit;
            warnings.push(`Cut set to ${selectedRate} lb/week: aggressive deficit (${requestedDeficit} kcal/day). Monitor performance, sleep, hunger.`);
        }
    } else if (profile.goal === 'BUILD') {
        const delta = clamp(Math.round(maintenance * 0.08), 200, 400);
        target = maintenance + delta;
    } else if (profile.goal === 'STRENGTH') {
        const delta = clamp(Math.round(maintenance * 0.04), 100, 300);
        target = maintenance + delta;
    }

    if (profile.goal === 'CUT' && profile.pregnant !== 'YES') {
        const cutFloor = profile.sex === 'FEMALE'
            ? Math.max(1400, Math.round(bmr * 1.15))
            : Math.max(2000, Math.round(bmr * 1.15));
        cutFloorValue = cutFloor;
        if (target < cutFloor) {
            warnings.push(`Calorie floor applied at ${cutFloor} kcal.`);
            target = cutFloor;
            cutFloorApplied = true;
        }
    } else {
        const generalFloor = profile.sex === 'FEMALE' ? cfg.femaleCalorieFloor : cfg.maleCalorieFloor;
        generalFloorValue = generalFloor;
        if (target < generalFloor) {
            warnings.push(`Calorie floor applied at ${generalFloor} kcal.`);
            target = generalFloor;
            generalFloorApplied = true;
        }
    }

    return {
        bmr,
        maintenance,
        target: Math.round(target),
        deficitPerDay: Math.round(deficitPerDay),
        lossRateLbsPerWeek,
        method: 'mifflin_st_jeor',
        activityFactor: Number(activityFactor.toFixed(2)),
        selectedRate,
        requestedDeficit: selectedDeficit,
        cutFloorApplied,
        cutFloorValue,
        generalFloorApplied,
        generalFloorValue,
        warnings
    };
}

function calcMacros(profile, caloriesBlock) {
    const warnings = [];
    const weightLbs = Number(profile.weightLbs) || 0;
    let caloriesTarget = Math.round(Number(caloriesBlock?.target) || 0);

    const isFemale = profile.sex === 'FEMALE';
    const isCut = profile.goal === 'CUT';
    const isBuild = profile.goal === 'BUILD';
    const isStrength = profile.goal === 'STRENGTH';

    // Protein first with explicit clamps by goal + sex.
    const proteinMin = isCut
        ? (isFemale ? 120 : 170)
        : (isFemale ? 110 : 150);
    const proteinMax = isCut
        ? (isFemale ? 200 : 240)
        : (isFemale ? 190 : 220);
    const proteinBase = isCut
        ? Math.round(weightLbs * 0.9)
        : Math.round(weightLbs * 0.8);
    let protein_g = clamp(proteinBase, proteinMin, proteinMax);

    // Non-negotiable fat floor.
    let fatMin_g = isFemale
        ? Math.max(50, Math.round(weightLbs * 0.30))
        : Math.max(60, Math.round(weightLbs * 0.25));
    fatMin_g = isFemale ? Math.min(fatMin_g, 95) : Math.min(fatMin_g, 90);
    if (profile.pregnant === 'YES') fatMin_g = Math.max(fatMin_g, 70);
    if (profile.lactating === 'YES') fatMin_g = Math.max(fatMin_g, 75);

    // If calories cannot fit protein + fat floor + minimal buffer, raise calories.
    let minCalories = (protein_g * 4) + (fatMin_g * 9) + 50;
    if (caloriesTarget < minCalories) {
        caloriesTarget = minCalories;
        warnings.push('Calories increased to satisfy protein + fat floor constraints.');
    }

    // Goal/style/frequency-based fat percent above floor.
    let fat_pct = 0.25;
    if (isCut) {
        fat_pct = 0.25;
        if (profile.frequency === '1-2') fat_pct = 0.28;
        else if (profile.style === 'CALISTHENICS' || profile.frequency === '5-6') fat_pct = 0.22;
    } else if (isBuild) {
        fat_pct = (profile.frequency === '1-2' || profile.intensity === 'LIGHT') ? 0.30 : (profile.frequency === '5-6' || profile.intensity === 'INTENSE' ? 0.27 : 0.28);
    } else if (isStrength) {
        fat_pct = (profile.frequency === '1-2' || profile.intensity === 'LIGHT') ? 0.28 : (profile.frequency === '5-6' || profile.intensity === 'INTENSE' ? 0.25 : 0.26);
    }

    const fat_g_target = Math.round((caloriesTarget * fat_pct) / 9);
    let fat_g = Math.max(fat_g_target, fatMin_g);

    // Carbs are remainder.
    let protein_kcal = protein_g * 4;
    let fat_kcal = fat_g * 9;
    let carb_kcal = caloriesTarget - (protein_kcal + fat_kcal);
    let carb_g = Math.round(carb_kcal / 4);

    // Ensure carbs are not too low: reduce protein within clamp if possible, otherwise raise calories.
    while (carb_g < 50 && protein_g > proteinMin) {
        protein_g -= 1;
        protein_kcal = protein_g * 4;
        carb_kcal = caloriesTarget - (protein_kcal + fat_kcal);
        carb_g = Math.round(carb_kcal / 4);
    }
    if (carb_g < 50) {
        caloriesTarget = (protein_g * 4) + (fat_g * 9) + (50 * 4);
        carb_kcal = caloriesTarget - (protein_g * 4 + fat_kcal);
        carb_g = Math.round(carb_kcal / 4);
        warnings.push('Calories increased to preserve minimum 50g carbs/day.');
    }

    if (carb_g < 0) {
        caloriesTarget = (protein_g * 4) + (fat_g * 9);
        carb_g = 0;
        carb_kcal = 0;
        warnings.push('Calories adjusted to avoid negative carbs.');
    }

    const total_kcal = (protein_g * 4) + (fat_g * 9) + (carb_g * 4);
    const deviationPct = caloriesTarget > 0 ? (Math.abs(total_kcal - caloriesTarget) / caloriesTarget) * 100 : 0;

    return {
        protein_g,
        fat_g,
        carb_g,
        protein_kcal,
        fat_kcal,
        carb_kcal,
        protein_pct: total_kcal > 0 ? Math.round(((protein_g * 4) / total_kcal) * 100) : 0,
        fat_pct: total_kcal > 0 ? Math.round(((fat_g * 9) / total_kcal) * 100) : 0,
        carb_pct: total_kcal > 0 ? Math.max(0, 100 - (Math.round(((protein_g * 4) / total_kcal) * 100) + Math.round(((fat_g * 9) / total_kcal) * 100))) : 0,
        calories_target: caloriesTarget,
        fat_min_g: fatMin_g,
        total_kcal,
        deviationPct,
        warnings
    };
}

function buildConfidence(profile, options = {}) {
    const warnings = Array.isArray(options.warnings) ? options.warnings : [];
    let score = 70;
    if (profile.goal) score += 8;
    if (profile.style) score += 6;
    if (profile.frequency) score += 6;
    if (profile.sex && profile.ageYears && profile.heightIn && profile.weightLbs) score += 8;
    if (profile.intensity) score += 6;
    if (profile.sex === 'FEMALE') score += 4;
    if (Number(options.macroDeviationPct) > 2) score -= 6;
    if (warnings.some((w) => String(w || '').toLowerCase().includes('missing'))) score -= 4;
    return `${Math.min(98, Math.max(72, Math.round(score)))}%`;
}

function computePlan(formState, actualMicros = null, options = {}) {
    const normalized = normalizeInputs(formState, {
        strictMode: options.strictMode !== false,
        throwOnError: false
    });
    const profile = {
        goal: normalized.goal || null,
        style: normalized.style || null,
        frequency: normalized.frequency || null,
        sex: normalized.sex || null,
        pregnant: normalized.pregnant || 'NO',
        lactating: normalized.lactating || 'NO',
        trimester: normalized.trimester || null,
        ageYears: Number.isFinite(normalized.ageYears) ? normalized.ageYears : null,
        ageGroup: normalized.ageGroup || null,
        heightIn: Number.isFinite(normalized.heightIn) ? normalized.heightIn : null,
        heightCm: Number.isFinite(normalized.heightCm) ? Number(normalized.heightCm.toFixed(1)) : null,
        weightLbs: Number.isFinite(normalized.weightLbs) ? normalized.weightLbs : null,
        weightKg: Number.isFinite(normalized.weightKg) ? Number(normalized.weightKg.toFixed(2)) : null,
        goalWeightLbs: Number.isFinite(normalized.goalWeightLbs) ? normalized.goalWeightLbs : null,
        intensity: normalized.intensity || null
    };

    const warnings = [].concat(normalized.warnings || []);
    const errors = [].concat(normalized.errors || []);

    let calories = null;
    let macros = null;

    if (!errors.length) {
        try {
            const c = calcCalories(normalized);
            calories = {
                bmr: c.bmr,
                maintenance: c.maintenance,
                target: c.target,
                deficitPerDay: c.deficitPerDay,
                lossRateLbsPerWeek: c.lossRateLbsPerWeek,
                method: 'mifflin_st_jeor',
                activityFactor: c.activityFactor
            };
            warnings.push(...(c.warnings || []));
        } catch {
            errors.push('ERROR_CALCULATION: calories');
            calories = null;
        }
    }

    if (calories && !errors.length) {
        try {
            const m = calcMacros(normalized, calories);
            if (Number.isFinite(m.calories_target) && m.calories_target > 0 && m.calories_target !== calories.target) {
                calories.target = Math.round(m.calories_target);
                calories.deficitPerDay = Math.round((Number(calories.maintenance) || 0) - calories.target);
            }
            macros = {
                protein_g: m.protein_g,
                fat_g: m.fat_g,
                carb_g: m.carb_g,
                protein_kcal: m.protein_kcal,
                fat_kcal: m.fat_kcal,
                carb_kcal: m.carb_kcal,
                protein_pct: m.protein_pct,
                fat_pct: m.fat_pct,
                carb_pct: m.carb_pct
            };
            warnings.push(...(m.warnings || []));
        } catch {
            errors.push('ERROR_CALCULATION: macros');
            calories = null;
            macros = null;
        }
    }

    let micros = [];
    const hasMicroProfile = Boolean(profile.sex) && Number.isFinite(profile.ageYears);
    if (hasMicroProfile) {
        try {
            const microTargets = getMicronutrientTargets({
                sex: profile.sex,
                ageYears: profile.ageYears,
                pregnant: profile.pregnant,
                lactating: profile.lactating,
                trimester: profile.trimester
            }, { assumeAdult1930IfMissing: false });
            warnings.push(...(microTargets.warnings || []));
            micros = computeMicroStatuses(microTargets.rows || microTargets.refs, actualMicros, { pending: options.pendingMicros || {} });
        } catch {
            micros = [];
        }
    }

    const confidence = buildConfidence(profile, {
        warnings,
        macroDeviationPct: macros && calories
            ? Math.abs(((macros.protein_kcal + macros.fat_kcal + macros.carb_kcal) - calories.target) / Math.max(1, calories.target)) * 100
            : 0
    });

    return {
        profile,
        calories: errors.length ? null : calories,
        macros: (!errors.length && calories) ? macros : null,
        micros,
        warnings,
        errors,
        confidence
    };
}

function runDeterministicNutritionEngine(formState, actualMicros = null, options = {}) {
    return computePlan(formState, actualMicros, options);
}

function calculateNutritionPlan(sel) {
    const engine = computePlan(sel, null, { strictMode: true });
    if (!engine.calories || !engine.macros) {
        return {
            calories: 0, actualCalories: 0, calorieDelta: 0, maintenanceCalories: 0, maintenanceFactor: 0,
            proteinG: 0, carbG: 0, fatG: 0, proteinPct: 0, carbPct: 0, fatPct: 0,
            goalReasoning: 'Validation failed',
            note: LONG_TERM_NOTE,
            warnings: [].concat(engine.warnings || []).concat(engine.errors || []),
            supplements: [],
            confidence: engine.confidence || '72%'
        };
    }
    return {
        profile: engine.profile,
        caloriesBlock: engine.calories,
        macrosBlock: {
            protein_g: engine.macros.protein_g,
            fat_g: engine.macros.fat_g,
            carb_g: engine.macros.carb_g,
            protein_kcal: engine.macros.protein_kcal,
            fat_kcal: engine.macros.fat_kcal,
            carb_kcal: engine.macros.carb_kcal,
            protein_pct: engine.macros.protein_pct,
            fat_pct: engine.macros.fat_pct,
            carb_pct: engine.macros.carb_pct,
            total_kcal: engine.macros.protein_kcal + engine.macros.fat_kcal + engine.macros.carb_kcal,
            deviationPct: engine.calories.target > 0 ? (Math.abs((engine.macros.protein_kcal + engine.macros.fat_kcal + engine.macros.carb_kcal) - engine.calories.target) / engine.calories.target) * 100 : 0
        },
        micros: engine.micros,
        calories: engine.calories.target,
        actualCalories: engine.macros.protein_kcal + engine.macros.fat_kcal + engine.macros.carb_kcal,
        calorieDelta: (engine.macros.protein_kcal + engine.macros.fat_kcal + engine.macros.carb_kcal) - engine.calories.target,
        maintenanceCalories: engine.calories.maintenance,
        maintenanceFactor: engine.calories.activityFactor,
        proteinG: engine.macros.protein_g,
        carbG: engine.macros.carb_g,
        fatG: engine.macros.fat_g,
        proteinPct: engine.macros.protein_pct,
        carbPct: engine.macros.carb_pct,
        fatPct: engine.macros.fat_pct,
        goalReasoning: engine.profile.goal === 'CUT' ? 'Cut target set to ~1.5 lb/week (750 kcal/day deficit).' : (engine.profile.goal === 'BUILD' ? 'Build target set to +8% maintenance.' : 'Strength target set to +4% maintenance.'),
        note: LONG_TERM_NOTE,
        warnings: engine.warnings,
        supplements: [],
        confidence: engine.confidence
    };
}

const DRI_NUTRIENT_ORDER = [
    'fiber', 'potassium', 'sodium', 'magnesium', 'calcium', 'iron',
    'zinc', 'vitamin_d', 'vitamin_c', 'vitamin_a', 'folate', 'b12', 'omega_3', 'choline'
];
const MICRO_OMEGA_BASIS = 'EPA+DHA';
const MICRO_VALUE_SOURCES = Object.freeze({
    LABEL_AMOUNT: 'LABEL_AMOUNT',
    DV_CONVERTED: 'DV_CONVERTED',
    USDA_FILL: 'USDA_FILL',
    EXISTING: 'EXISTING',
    DV_ONLY: 'DV_ONLY',
    LABEL_LT: 'LABEL_LT',
    MISSING: 'MISSING',
    UNKNOWN_SOURCE: 'UNKNOWN_SOURCE'
});
const MICRO_FOOD_KEY_BY_NUTRIENT = Object.freeze({
    fiber: 'fiber_g',
    potassium: 'potassium_mg',
    sodium: 'sodium_mg',
    magnesium: 'magnesium_mg',
    calcium: 'calcium_mg',
    iron: 'iron_mg',
    zinc: 'zinc_mg',
    vitamin_d: 'vitamin_d_mcg',
    vitamin_c: 'vitamin_c_mg',
    vitamin_a: 'vitamin_a_mcg_rae',
    folate: 'folate_mcg',
    b12: 'b12_mcg',
    omega_3: 'omega3_epa_dha_mg',
    choline: 'choline_mg'
});
const MICRO_DV_REFERENCE_BY_AMOUNT_KEY = Object.freeze({
    calcium_mg: 1300,          // FDA DV (adults/children >=4)
    iron_mg: 18,               // FDA DV
    vitamin_d_mcg: 20,         // FDA DV
    vitamin_c_mg: 90,          // FDA DV
    vitamin_a_mcg_rae: 900,    // FDA DV (mcg RAE)
    folate_mcg: 400            // FDA DV (mcg DFE)
});

function validateMicronutrientReferenceRows(rows) {
    const out = [];
    const srcRows = Array.isArray(rows) ? rows : [];
    const seen = new Set();
    srcRows.forEach((row) => {
        const nutrientId = String(row?.nutrient_id || '');
        if (!nutrientId) return;
        seen.add(nutrientId);
        const trackedOnly = Boolean(row?.tracked_only) || String(row?.goal_type || '').toUpperCase() === 'TRACKED';
        const goal = Number(row?.goal_value);
        if (!trackedOnly && (!Number.isFinite(goal) || goal <= 0)) out.push(`${nutrientId} is missing a valid goal.`);
        if (!String(row?.unit || '').trim()) out.push(`${nutrientId} is missing a unit.`);
    });
    DRI_NUTRIENT_ORDER.forEach((id) => {
        if (!seen.has(id)) out.push(`Missing target row for ${id}.`);
    });
    const omegaRow = srcRows.find((row) => String(row?.nutrient_id || '') === 'omega_3');
    if (omegaRow && !String(omegaRow.unit || '').includes(MICRO_OMEGA_BASIS)) {
        out.push(`omega_3 unit must include ${MICRO_OMEGA_BASIS}.`);
    }
    return out;
}

function getExternalDriTargets() {
    const external = (typeof globalThis === 'object' && globalThis)
        ? globalThis.__ODE_DRI_TARGETS
        : null;
    if (!external || typeof external !== 'object') return null;
    if (!external.male || !external.female) return null;
    return external;
}

function getMicronutrientTargets(selectionLike, options = {}) {
    const sel = selectionLike && typeof selectionLike === 'object' ? selectionLike : {};
    const ageProfile = getNutritionAgeProfile(sel);
    const ageBand = resolveAgeBand(ageProfile.ageYears);
    const sex = String(sel.sex || '').toUpperCase() === 'FEMALE' ? 'FEMALE' : 'MALE';
    const pregnant = sex === 'FEMALE' && String(sel.pregnant || '').toUpperCase() === 'YES';
    const lactating = sex === 'FEMALE' && String(sel.lactating || '').toUpperCase() === 'YES';
    const trimester = pregnant ? String(sel.trimester || '').trim() : '';
    const assumptionMode = ageProfile.assumed || Boolean(options.assumeAdult1930IfMissing);

    let MALE = {
        '14-18': { fiber: { goal: 38, type: 'AI' }, potassium: { goal: 3000, type: 'AI' }, sodium: { goal: 1500, type: 'AI', ul: 2300 }, magnesium: { goal: 410, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1300, type: 'RDA', ul: 3000 }, iron: { goal: 11, type: 'RDA', ul: 45 }, zinc: { goal: 11, type: 'RDA', ul: 34 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: 75, type: 'RDA', ul: 1800 }, vitamin_a: { goal: 900, type: 'RDA', ul: 2800 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1600, type: 'AI' }, choline: { goal: 550, type: 'AI', ul: 3000 } },
        '19-30': { fiber: { goal: 38, type: 'AI' }, potassium: { goal: 3400, type: 'AI' }, sodium: { goal: 1500, type: 'AI', ul: 2300 }, magnesium: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1000, type: 'RDA', ul: 2500 }, iron: { goal: 8, type: 'RDA', ul: 45 }, zinc: { goal: 11, type: 'RDA', ul: 40 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: 90, type: 'RDA', ul: 2000 }, vitamin_a: { goal: 900, type: 'RDA', ul: 3000 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1600, type: 'AI' }, choline: { goal: 550, type: 'AI', ul: 3500 } },
        '31-50': { fiber: { goal: 38, type: 'AI' }, potassium: { goal: 3400, type: 'AI' }, sodium: { goal: 1500, type: 'AI', ul: 2300 }, magnesium: { goal: 420, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1000, type: 'RDA', ul: 2500 }, iron: { goal: 8, type: 'RDA', ul: 45 }, zinc: { goal: 11, type: 'RDA', ul: 40 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: 90, type: 'RDA', ul: 2000 }, vitamin_a: { goal: 900, type: 'RDA', ul: 3000 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1600, type: 'AI' }, choline: { goal: 550, type: 'AI', ul: 3500 } },
        '51-70': { fiber: { goal: 30, type: 'AI' }, potassium: { goal: 3400, type: 'AI' }, sodium: { goal: 1300, type: 'AI', ul: 2300 }, magnesium: { goal: 420, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1000, type: 'RDA', ul: 2000 }, iron: { goal: 8, type: 'RDA', ul: 45 }, zinc: { goal: 11, type: 'RDA', ul: 40 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: 90, type: 'RDA', ul: 2000 }, vitamin_a: { goal: 900, type: 'RDA', ul: 3000 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1600, type: 'AI' }, choline: { goal: 550, type: 'AI', ul: 3500 } },
        '71+': { fiber: { goal: 30, type: 'AI' }, potassium: { goal: 3400, type: 'AI' }, sodium: { goal: 1200, type: 'AI', ul: 2300 }, magnesium: { goal: 420, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1200, type: 'RDA', ul: 2000 }, iron: { goal: 8, type: 'RDA', ul: 45 }, zinc: { goal: 11, type: 'RDA', ul: 40 }, vitamin_d: { goal: 20, type: 'RDA', ul: 100 }, vitamin_c: { goal: 90, type: 'RDA', ul: 2000 }, vitamin_a: { goal: 900, type: 'RDA', ul: 3000 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1600, type: 'AI' }, choline: { goal: 550, type: 'AI', ul: 3500 } }
    };
    let FEMALE = {
        '14-18': { fiber: { goal: 25, type: 'AI' }, potassium: { goal: 2300, type: 'AI' }, sodium: { goal: 1500, type: 'AI', ul: 2300 }, magnesium: { goal: 360, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1300, type: 'RDA', ul: 3000 }, iron: { goal: 15, type: 'RDA', ul: 45 }, zinc: { goal: 9, type: 'RDA', ul: 34 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: 65, type: 'RDA', ul: 1800 }, vitamin_a: { goal: 700, type: 'RDA', ul: 2800 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1100, type: 'AI' }, choline: { goal: 400, type: 'AI', ul: 3000 } },
        '19-30': { fiber: { goal: 25, type: 'AI' }, potassium: { goal: 2600, type: 'AI' }, sodium: { goal: 1500, type: 'AI', ul: 2300 }, magnesium: { goal: 310, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1000, type: 'RDA', ul: 2500 }, iron: { goal: 18, type: 'RDA', ul: 45 }, zinc: { goal: 8, type: 'RDA', ul: 40 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: 75, type: 'RDA', ul: 2000 }, vitamin_a: { goal: 700, type: 'RDA', ul: 3000 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1100, type: 'AI' }, choline: { goal: 425, type: 'AI', ul: 3500 } },
        '31-50': { fiber: { goal: 25, type: 'AI' }, potassium: { goal: 2600, type: 'AI' }, sodium: { goal: 1500, type: 'AI', ul: 2300 }, magnesium: { goal: 320, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1000, type: 'RDA', ul: 2500 }, iron: { goal: 18, type: 'RDA', ul: 45 }, zinc: { goal: 8, type: 'RDA', ul: 40 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: 75, type: 'RDA', ul: 2000 }, vitamin_a: { goal: 700, type: 'RDA', ul: 3000 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1100, type: 'AI' }, choline: { goal: 425, type: 'AI', ul: 3500 } },
        '51-70': { fiber: { goal: 21, type: 'AI' }, potassium: { goal: 2600, type: 'AI' }, sodium: { goal: 1300, type: 'AI', ul: 2300 }, magnesium: { goal: 320, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1200, type: 'RDA', ul: 2000 }, iron: { goal: 8, type: 'RDA', ul: 45 }, zinc: { goal: 8, type: 'RDA', ul: 40 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: 75, type: 'RDA', ul: 2000 }, vitamin_a: { goal: 700, type: 'RDA', ul: 3000 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1100, type: 'AI' }, choline: { goal: 425, type: 'AI', ul: 3500 } },
        '71+': { fiber: { goal: 21, type: 'AI' }, potassium: { goal: 2600, type: 'AI' }, sodium: { goal: 1200, type: 'AI', ul: 2300 }, magnesium: { goal: 320, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: 1200, type: 'RDA', ul: 2000 }, iron: { goal: 8, type: 'RDA', ul: 45 }, zinc: { goal: 8, type: 'RDA', ul: 40 }, vitamin_d: { goal: 20, type: 'RDA', ul: 100 }, vitamin_c: { goal: 75, type: 'RDA', ul: 2000 }, vitamin_a: { goal: 700, type: 'RDA', ul: 3000 }, folate: { goal: 400, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.4, type: 'RDA' }, omega_3: { goal: 1100, type: 'AI' }, choline: { goal: 425, type: 'AI', ul: 3500 } }
    };
    let PREG = { fiber: { goal: 28, type: 'AI' }, potassium: { goal: 2900, type: 'AI' }, sodium: { goal: 1500, type: 'AI', ul: 2300 }, magnesium: { goal: ageBand === '14-18' ? 400 : 350, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: ageBand === '14-18' ? 1300 : 1000, type: 'RDA', ul: ageBand === '14-18' ? 3000 : 2500 }, iron: { goal: 27, type: 'RDA', ul: 45 }, zinc: { goal: ageBand === '14-18' ? 12 : 11, type: 'RDA', ul: ageBand === '14-18' ? 34 : 40 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: ageBand === '14-18' ? 80 : 85, type: 'RDA', ul: ageBand === '14-18' ? 1800 : 2000 }, vitamin_a: { goal: ageBand === '14-18' ? 750 : 770, type: 'RDA', ul: ageBand === '14-18' ? 2800 : 3000 }, folate: { goal: 600, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.6, type: 'RDA' }, omega_3: { goal: 1400, type: 'AI' }, choline: { goal: ageBand === '14-18' ? 400 : 450, type: 'AI', ul: ageBand === '14-18' ? 3000 : 3500 } };
    let LACT = { fiber: { goal: 29, type: 'AI' }, potassium: { goal: 2800, type: 'AI' }, sodium: { goal: 1500, type: 'AI', ul: 2300 }, magnesium: { goal: ageBand === '14-18' ? 360 : 310, type: 'RDA', ul: null, ul_note: 'UL applies only to supplemental magnesium.' }, calcium: { goal: ageBand === '14-18' ? 1300 : 1000, type: 'RDA', ul: ageBand === '14-18' ? 3000 : 2500 }, iron: { goal: ageBand === '14-18' ? 10 : 9, type: 'RDA', ul: 45 }, zinc: { goal: ageBand === '14-18' ? 13 : 12, type: 'RDA', ul: ageBand === '14-18' ? 34 : 40 }, vitamin_d: { goal: 15, type: 'RDA', ul: 100 }, vitamin_c: { goal: ageBand === '14-18' ? 115 : 120, type: 'RDA', ul: ageBand === '14-18' ? 1800 : 2000 }, vitamin_a: { goal: ageBand === '14-18' ? 1200 : 1300, type: 'RDA', ul: ageBand === '14-18' ? 2800 : 3000 }, folate: { goal: 500, type: 'RDA', ul: null, ul_note: 'UL applies to synthetic folic acid only.' }, b12: { goal: 2.8, type: 'RDA' }, omega_3: { goal: 1300, type: 'AI' }, choline: { goal: 550, type: 'AI', ul: ageBand === '14-18' ? 3000 : 3500 } };

    const externalDri = getExternalDriTargets();
    if (externalDri) {
        if (externalDri.male && typeof externalDri.male === 'object') MALE = externalDri.male;
        if (externalDri.female && typeof externalDri.female === 'object') FEMALE = externalDri.female;
        const pregByAge = (externalDri.pregnant_by_age_band && typeof externalDri.pregnant_by_age_band === 'object') ? externalDri.pregnant_by_age_band : null;
        const lactByAge = (externalDri.lactating_by_age_band && typeof externalDri.lactating_by_age_band === 'object') ? externalDri.lactating_by_age_band : null;
        if (pregByAge && pregByAge[ageBand]) PREG = pregByAge[ageBand];
        if (lactByAge && lactByAge[ageBand]) LACT = lactByAge[ageBand];
    }

    let table = sex === 'FEMALE' ? FEMALE[ageBand] : MALE[ageBand];
    if (sex === 'FEMALE' && pregnant) table = PREG;
    if (sex === 'FEMALE' && lactating) table = LACT;

    const externalUnitByKey = (externalDri && externalDri.unit_map && typeof externalDri.unit_map === 'object') ? externalDri.unit_map : null;
    const unitByKey = {
        fiber: 'g',
        potassium: 'mg',
        sodium: 'mg',
        magnesium: 'mg',
        calcium: 'mg',
        iron: 'mg',
        zinc: 'mg',
        vitamin_d: 'mcg',
        vitamin_c: 'mg',
        vitamin_a: 'mcg RAE',
        folate: 'mcg DFE',
        b12: 'mcg',
        omega_3: 'mg',
        choline: 'mg'
    };
    if (externalUnitByKey) {
        Object.keys(externalUnitByKey).forEach((key) => {
            unitByKey[key] = String(externalUnitByKey[key] || unitByKey[key] || '').trim() || unitByKey[key];
        });
    }
    unitByKey.omega_3 = `mg ${MICRO_OMEGA_BASIS}`;
    const refs = {};
    const rows = [];
    DRI_NUTRIENT_ORDER.forEach((key) => {
        const row = table?.[key] || {};
        const entry = {
            nutrient_id: key,
            unit: unitByKey[key] || 'mg',
            goal_type: row.type || 'AI',
            goal_value: Number(row.goal) || 0,
            ul_value: Number.isFinite(Number(row.ul)) ? Number(row.ul) : null,
            ul_note: row.ul_note || null,
            source_ref: 'National Academies DRIs / NIH ODS'
        };
        if (key === 'omega_3') {
            entry.goal_type = 'TRACKED';
            entry.goal_value = null;
            entry.ul_value = null;
            entry.ul_note = 'No official DRI target exists for EPA+DHA specifically.';
            entry.source_ref = 'Tracked intake only (EPA + DHA basis)';
            entry.tracked_only = true;
            entry.target_basis = MICRO_OMEGA_BASIS;
        }
        refs[key] = entry;
        rows.push(entry);
    });

    const warnings = [];
    if (assumptionMode) warnings.push('Targets assume age 19-30; enter age for accurate RDIs.');
    if (pregnant && !trimester) warnings.push('Pregnancy targets need trimester; using general pregnancy category.');
    const configIssues = validateMicronutrientReferenceRows(rows);
    if (configIssues.length) warnings.push(...configIssues.map((issue) => `Micronutrient config warning: ${issue}`));

    return {
        refs,
        rows,
        profile: {
            sex,
            ageBand,
            ageYears: ageProfile.ageYears,
            pregnant,
            trimester: trimester || null,
            lactating,
            assumedAge1930: assumptionMode
        },
        warnings
    };
}

function computeMicroStatuses(microRefs, actuals, options = {}) {
    const refsArray = Array.isArray(microRefs)
        ? microRefs
        : Object.values(microRefs && typeof microRefs === 'object' ? microRefs : {});
    const actualMap = actuals && typeof actuals === 'object' ? actuals : {};
    const pendingMap = options.pending && typeof options.pending === 'object' ? options.pending : {};
    const qualityMap = options.quality && typeof options.quality === 'object' ? options.quality : {};
    const coverageThreshold = Number.isFinite(Number(options.coverageThreshold))
        ? Number(options.coverageThreshold)
        : 85;
    const sourceContext = String(options.sourceContext || 'food_only').toLowerCase();
    const veryLowSodiumFloorMg = Number.isFinite(Number(options.veryLowSodiumFloorMg))
        ? Number(options.veryLowSodiumFloorMg)
        : 800;
    return refsArray.map((ref) => {
        const key = String(ref?.nutrient_id || '');
        const unit = String(ref?.unit || 'mg');
        const trackedOnly = Boolean(ref?.tracked_only) || String(ref?.goal_type || '').toUpperCase() === 'TRACKED';
        const goal = Number(ref?.goal_value);
        const ulRaw = Number.isFinite(Number(ref?.ul_value)) ? Number(ref.ul_value) : null;
        const ulNote = String(ref?.ul_note || '').toLowerCase();
        const ulRequiresSupplementContext = /supplement|synthetic/.test(ulNote);
        const ulApplies = Number.isFinite(ulRaw) && ulRaw > 0
            && !(ulRequiresSupplementContext && sourceContext !== 'supplement' && sourceContext !== 'mixed');
        const ul = ulApplies ? ulRaw : null;
        const coveragePct = Number(qualityMap?.[key]?.coverage_pct);
        const hasCoverageMetric = Number.isFinite(coveragePct);
        const lowCoverage = hasCoverageMetric && coveragePct < coverageThreshold;
        const pending = Boolean(pendingMap[key]) || lowCoverage;
        const actualRaw = actualMap[key];
        const actual = Number.isFinite(Number(actualRaw)) && !pending ? Number(actualRaw) : null;
        if (trackedOnly) {
            if (!Number.isFinite(actual)) {
                return {
                    nutrient_id: key,
                    unit,
                    actual: null,
                    goal_type: 'TRACKED',
                    goal: null,
                    ul: null,
                    pct_goal: null,
                    pct_ul: null,
                    status: lowCoverage ? 'INCOMPLETE_DATA' : 'PENDING',
                    source_ref: ref?.source_ref || 'Tracked intake only',
                    ul_note: ref?.ul_note || null,
                    tracked_only: true,
                    coverage_pct: hasCoverageMetric ? coveragePct : null
                };
            }
            return {
                nutrient_id: key,
                unit,
                actual,
                goal_type: 'TRACKED',
                goal: null,
                ul: null,
                pct_goal: null,
                pct_ul: null,
                status: 'TRACKED',
                source_ref: ref?.source_ref || 'Tracked intake only',
                ul_note: ref?.ul_note || null,
                tracked_only: true,
                coverage_pct: hasCoverageMetric ? coveragePct : null
            };
        }
        if (lowCoverage) {
            return {
                nutrient_id: key,
                unit,
                actual: Number.isFinite(Number(actualRaw)) ? Number(actualRaw) : null,
                goal_type: ref?.goal_type || 'AI',
                goal: Number.isFinite(goal) && goal > 0 ? goal : null,
                ul,
                pct_goal: null,
                pct_ul: null,
                status: 'INCOMPLETE_DATA',
                source_ref: ref?.source_ref || 'NASEM DRI / NIH ODS',
                ul_note: ref?.ul_note || null,
                coverage_pct: coveragePct
            };
        }
        if (!Number.isFinite(actual) || !Number.isFinite(goal) || goal <= 0) {
            return { nutrient_id: key, unit, actual: null, goal_type: ref?.goal_type || 'AI', goal, ul, pct_goal: null, pct_ul: null, status: 'PENDING', source_ref: ref?.source_ref || 'NASEM DRI / NIH ODS', ul_note: ref?.ul_note || null, coverage_pct: hasCoverageMetric ? coveragePct : null };
        }
        const pctGoal = (actual / goal) * 100;
        const pctUl = ulApplies && Number.isFinite(ul) && ul > 0 ? (actual / ul) * 100 : null;
        let status = 'OK';
        if (Number.isFinite(pctUl) && pctUl > 100) {
            status = 'OVER_UL';
        } else if (Number.isFinite(pctUl) && pctUl >= 80) {
            status = 'HIGH';
        } else if (pctGoal < 80) {
            if (key === 'sodium') {
                status = actual < veryLowSodiumFloorMg ? 'LOW' : 'OK';
            } else {
                status = 'LOW';
            }
        } else if (!Number.isFinite(pctUl) && pctGoal > 120) {
            // Informational only: above target where no applicable UL exists.
            status = 'ABOVE_TARGET_NO_UL';
        }
        return { nutrient_id: key, unit, actual, goal_type: ref?.goal_type || 'AI', goal, ul, pct_goal: pctGoal, pct_ul: pctUl, status, source_ref: ref?.source_ref || 'NASEM DRI / NIH ODS', ul_note: ref?.ul_note || null, coverage_pct: hasCoverageMetric ? coveragePct : null };
    });
}

function runNutritionEngineSelfTests() {
    try {
        // Test 1: Male 220 cut, calisthenics, 1-2, average -> calories ~2200-2500
        const t1 = runDeterministicNutritionEngine({
            goal: 'CUT',
            style: 'CALISTHENICS',
            frequency: '1-2',
            sex: 'MALE',
            ageYears: 30,
            heightIn: 70,
            weightLbs: 220,
            goalWeightLbs: 180,
            intensity: 'AVERAGE',
            lossRateLbsPerWeek: 1.5
        });
        console.assert((t1.calories?.target || 0) >= 2200 && (t1.calories?.target || 0) <= 2500, 'Test 1 failed: calories should land ~2200-2500');
        console.assert(t1.macros?.fat_g >= 60, 'Test 1 failed: fat floor should be >= 60g');
        console.assert(t1.macros?.carb_g >= 0, 'Test 1 failed: carbs should not be negative');

        // Test 2: Male 220 cut, strength, 5-6, average -> calories ~2400-2700
        const t2 = runDeterministicNutritionEngine({
            goal: 'CUT',
            style: 'STRENGTH',
            frequency: '5-6',
            sex: 'MALE',
            ageYears: 30,
            heightIn: 70,
            weightLbs: 220,
            goalWeightLbs: 180,
            intensity: 'AVERAGE',
            lossRateLbsPerWeek: 1.5
        });
        console.assert((t2.calories?.target || 0) >= 2400 && (t2.calories?.target || 0) <= 2700, 'Test 2 failed: calories should land ~2400-2700');
        console.assert(t2.macros?.fat_g >= 60 && t2.macros?.fat_g <= 75, 'Test 2 failed: fat should land around 60-75g');
        console.assert((t2.macros?.carb_g || 0) >= (t1.macros?.carb_g || 0), 'Test 2 failed: high-frequency carbs should be >= low-frequency');

        // Test 3: Female 150 cut, 3-4, average, 1.0/week -> calories ~1500-1900
        const t3 = runDeterministicNutritionEngine({
            goal: 'CUT',
            style: 'MIXED',
            frequency: '3-4',
            sex: 'FEMALE',
            ageYears: 28,
            heightIn: 64,
            weightLbs: 150,
            goalWeightLbs: 130,
            intensity: 'AVERAGE',
            lossRateLbsPerWeek: 1.0,
            pregnant: 'NO',
            lactating: 'NO'
        });
        console.assert((t3.calories?.target || 0) >= 1500 && (t3.calories?.target || 0) <= 1900, 'Test 3 failed: calories should land ~1500-1900');
        console.assert(t3.macros?.fat_g >= 50, 'Test 3 failed: female fat floor should be >= 50g');
        console.assert(t3.macros?.carb_g >= 0, 'Test 3 failed: carbs should not be negative');
    } catch (err) {
        console.warn('Nutrition engine self-tests warning:', err?.message || err);
    }
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

    // Add a per-person explainer under the calorie card.
    const primaryCard = document.querySelector('.ns-result-card.primary');
    if (primaryCard) {
        if (!document.getElementById('ns-why-calories-style')) {
            const st = document.createElement('style');
            st.id = 'ns-why-calories-style';
            st.textContent = `
                .ns-why-chip {
                    display: inline;
                    padding: 0 3px;
                    border-radius: 2px;
                    background-image: linear-gradient(180deg, transparent 0 56%, rgba(214, 133, 38, 0.26) 56% 100%);
                    font-weight: 700;
                    letter-spacing: 0.01em;
                    -webkit-box-decoration-break: clone;
                    box-decoration-break: clone;
                }
                .ns-why-chip-strong {
                    background-image: linear-gradient(180deg, transparent 0 48%, rgba(203, 118, 24, 0.38) 48% 100%);
                }
                .ns-why-accent {
                    background-size: 220% 100%;
                    animation: nsWhySweep 2.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
                }
                .ns-why-list {
                    margin: 6px 0 8px 16px;
                    padding: 0;
                }
                .ns-why-list li {
                    margin: 4px 0;
                }
                .ns-why-foot {
                    margin-top: 8px;
                    padding-top: 6px;
                    border-top: 1px solid rgba(0,0,0,0.08);
                    color: rgba(0,0,0,0.78);
                    font-size: 0.74rem;
                    line-height: 1.2;
                }
                .ns-why-head {
                    font-weight: 800;
                    font-size: 0.84rem;
                    letter-spacing: 0.02em;
                    color: rgba(68, 50, 29, 0.92);
                    margin-bottom: 3px;
                    text-transform: uppercase;
                }
                @media (min-width: 981px) {
                    #ns-why-calories-body {
                        line-height: 1.58 !important;
                    }
                    .ns-why-list li {
                        margin: 7px 0;
                    }
                }
                @keyframes nsWhySweep {
                    0%, 100% { background-position: 0% 0; }
                    50% { background-position: 100% 0; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .ns-why-accent { animation: none !important; }
                }
            `;
            document.head.appendChild(st);
        }

        let wrap = document.getElementById('ns-why-calories');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'ns-why-calories';
            wrap.className = 'ns-why-calories';
            wrap.style.marginTop = '10px';
            wrap.innerHTML = `
                <button id="ns-why-calories-toggle" type="button" aria-expanded="false" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.55);border-radius:10px;padding:10px 12px;cursor:pointer;font-weight:700;font-size:0.9rem;">
                    <span>Why these calories?</span>
                    <span id="ns-why-calories-chevron" aria-hidden="true" style="transition:transform 280ms ease;display:inline-block;">â–¾</span>
                </button>
                <div id="ns-why-calories-panel" style="max-height:0;overflow:hidden;opacity:0;transform:translateY(-4px);transition:max-height 360ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease, transform 280ms ease;">
                    <div id="ns-why-calories-body" style="margin-top:8px;padding:10px 12px;border:1px solid rgba(0,0,0,0.08);border-radius:10px;background:rgba(255,255,255,0.4);font-size:0.86rem;line-height:1.48;"></div>
                </div>
            `;
            primaryCard.appendChild(wrap);

            const toggle = document.getElementById('ns-why-calories-toggle');
            const panel = document.getElementById('ns-why-calories-panel');
            const chevron = document.getElementById('ns-why-calories-chevron');
            if (toggle && panel && chevron) {
                toggle.addEventListener('click', () => {
                    const expanded = toggle.getAttribute('aria-expanded') === 'true';
                    if (expanded) {
                        panel.style.maxHeight = '0px';
                        panel.style.opacity = '0';
                        panel.style.transform = 'translateY(-4px)';
                        chevron.style.transform = 'rotate(0deg)';
                        toggle.setAttribute('aria-expanded', 'false');
                    } else {
                        panel.style.maxHeight = `${Math.max(panel.scrollHeight + 8, 40)}px`;
                        panel.style.opacity = '1';
                        panel.style.transform = 'translateY(0)';
                        chevron.style.transform = 'rotate(180deg)';
                        toggle.setAttribute('aria-expanded', 'true');
                    }
                });
            }
        }

        const panel = document.getElementById('ns-why-calories-panel');
        const toggle = document.getElementById('ns-why-calories-toggle');
        const body = document.getElementById('ns-why-calories-body');
        const targetCard = document.getElementById('ns-target-card');

        // Desktop-only layout swap:
        // - Move "Your Target" content under Daily Calories.
        // - Move "Why these calories?" dropdown into the old target card.
        if (targetCard) {
            let targetContent = document.getElementById('ns-target-content');
            if (!targetContent) {
                targetContent = document.createElement('div');
                targetContent.id = 'ns-target-content';
                targetContent.style.marginTop = '10px';
                targetContent.style.paddingTop = '10px';
                targetContent.style.borderTop = '1px solid rgba(0,0,0,0.08)';

                const eyebrow = targetCard.querySelector('.eyebrow');
                const intro = targetCard.querySelector('#ns-target-intro');
                const list = targetCard.querySelector('.ns-list');
                const outro = targetCard.querySelector('#ns-target-outro');
                [eyebrow, intro, list, outro].forEach((node) => {
                    if (node) targetContent.appendChild(node);
                });
                targetCard.appendChild(targetContent);
            }

            let desktopTargetHost = document.getElementById('ns-target-desktop-host');
            if (!desktopTargetHost) {
                desktopTargetHost = document.createElement('div');
                desktopTargetHost.id = 'ns-target-desktop-host';
                desktopTargetHost.style.marginTop = '10px';
                primaryCard.appendChild(desktopTargetHost);
            }

            const isDesktop = window.matchMedia('(min-width: 981px)').matches;
            if (isDesktop) {
                if (targetContent.parentElement !== desktopTargetHost) desktopTargetHost.appendChild(targetContent);
                if (wrap.parentElement !== targetCard) targetCard.appendChild(wrap);
                if (toggle && panel) {
                    toggle.style.display = 'none';
                    panel.style.maxHeight = 'none';
                    panel.style.overflow = 'visible';
                    panel.style.opacity = '1';
                    panel.style.transform = 'none';
                }
            } else {
                if (targetContent.parentElement !== targetCard) targetCard.appendChild(targetContent);
                if (wrap.parentElement !== primaryCard) primaryCard.appendChild(wrap);
                if (toggle && panel) {
                    toggle.style.display = '';
                    panel.style.overflow = 'hidden';
                    const expanded = toggle.getAttribute('aria-expanded') === 'true';
                    if (expanded) {
                        panel.style.maxHeight = `${Math.max(panel.scrollHeight + 8, 40)}px`;
                        panel.style.opacity = '1';
                        panel.style.transform = 'translateY(0)';
                    } else {
                        panel.style.maxHeight = '0px';
                        panel.style.opacity = '0';
                        panel.style.transform = 'translateY(-4px)';
                    }
                }
            }

            // Keep layout synced on viewport resize without touching mobile behavior.
            if (!window.__nsResultsLayoutBound) {
                window.__nsResultsLayoutBound = true;
                window.addEventListener('resize', () => {
                    const card = document.querySelector('.ns-result-card.primary');
                    const tCard = document.getElementById('ns-target-card');
                    const why = document.getElementById('ns-why-calories');
                    const tContent = document.getElementById('ns-target-content');
                    const tHost = document.getElementById('ns-target-desktop-host');
                    if (!card || !tCard || !why || !tContent || !tHost) return;
                    const desktop = window.matchMedia('(min-width: 981px)').matches;
                    if (desktop) {
                        if (tContent.parentElement !== tHost) tHost.appendChild(tContent);
                        if (why.parentElement !== tCard) tCard.appendChild(why);
                        const tgl = document.getElementById('ns-why-calories-toggle');
                        const pnl = document.getElementById('ns-why-calories-panel');
                        if (tgl && pnl) {
                            tgl.style.display = 'none';
                            pnl.style.maxHeight = 'none';
                            pnl.style.overflow = 'visible';
                            pnl.style.opacity = '1';
                            pnl.style.transform = 'none';
                        }
                    } else {
                        if (tContent.parentElement !== tCard) tCard.appendChild(tContent);
                        if (why.parentElement !== card) card.appendChild(why);
                        const tgl = document.getElementById('ns-why-calories-toggle');
                        const pnl = document.getElementById('ns-why-calories-panel');
                        if (tgl && pnl) {
                            tgl.style.display = '';
                            pnl.style.overflow = 'hidden';
                            const expanded = tgl.getAttribute('aria-expanded') === 'true';
                            if (expanded) {
                                pnl.style.maxHeight = `${Math.max(pnl.scrollHeight + 8, 40)}px`;
                                pnl.style.opacity = '1';
                                pnl.style.transform = 'translateY(0)';
                            } else {
                                pnl.style.maxHeight = '0px';
                                pnl.style.opacity = '0';
                                pnl.style.transform = 'translateY(-4px)';
                            }
                        }
                    }
                });
            }
        }

        const sel = nutritionState?.selections || {};
        const c = res.caloriesBlock || {};
        const m = res.macrosBlock || {};
        const sexTxt = String(sel.sex || '').toUpperCase() === 'FEMALE' ? '-161' : '+5';
        const wtKg = Number(sel.weightLbs || 0) * 0.45359237;
        const htCm = Number(sel.heightIn || 0) * 2.54;
        const age = Number(sel.ageYears || 0);
        const bmrEq = Number.isFinite(wtKg) && Number.isFinite(htCm) && Number.isFinite(age)
            ? `BMR = (10 x ${wtKg.toFixed(1)}) + (6.25 x ${htCm.toFixed(1)}) - (5 x ${Math.round(age)}) ${sexTxt} = <strong>${Number(c.bmr || 0).toLocaleString()}</strong>`
            : `BMR (Mifflin-St Jeor) = <strong>${Number(c.bmr || 0).toLocaleString()}</strong>`;
        const activity = Number(c.activityFactor || 0).toFixed(2);
        const maintenance = Number(c.maintenance || 0);
        const target = Number(c.target || res.calories || 0);
        const deficit = Number(c.deficitPerDay || 0);
        const floorApplied = Boolean(c.cutFloorApplied || c.generalFloorApplied);
        const floorValue = Number(c.cutFloorValue || c.generalFloorValue || 0);
        const floorLine = floorApplied && floorValue > 0
            ? `<li>Minimum calories used for sustainability: <span class="ns-why-chip">${floorValue.toLocaleString()} kcal</span>.</li>`
            : '';
        const proteinRule = Number(m.protein_g || res.proteinG || 0);
        const fatRule = Number(m.fat_g || res.fatG || 0);
        const carbsRule = Number(m.carb_g || res.carbG || 0);
        const fatMin = Number(m.fat_min_g || 0);
        const goalRaw = String(sel.goal || '').toUpperCase();
        const goalLabel = goalRaw === 'CUT' ? 'fat-loss cut' : goalRaw === 'BUILD' ? 'muscle-building phase' : goalRaw === 'STRENGTH' ? 'strength-priority phase' : 'custom phase';
        const sexLabel = String(sel.sex || '').toUpperCase() === 'FEMALE' ? 'female' : 'male';
        const proteinMin = goalRaw === 'CUT'
            ? (sexLabel === 'female' ? 120 : 170)
            : (sexLabel === 'female' ? 110 : 150);
        const proteinMax = goalRaw === 'CUT'
            ? (sexLabel === 'female' ? 200 : 240)
            : (sexLabel === 'female' ? 190 : 220);
        const proteinBaseFormula = goalRaw === 'CUT'
            ? `round(bodyweight x 0.9)`
            : `round(bodyweight x 0.8)`;
        const proteinBaseValue = goalRaw === 'CUT'
            ? Math.round(Number(sel.weightLbs || 0) * 0.9)
            : Math.round(Number(sel.weightLbs || 0) * 0.8);
        let fatPctText = 'goal-specific percentage';
        if (goalRaw === 'CUT') {
            if (String(sel.frequency || '') === '1-2') fatPctText = '28% (lower training frequency -> more satiety)';
            else if (String(sel.style || '').toUpperCase() === 'CALISTHENICS' || String(sel.frequency || '') === '5-6') fatPctText = '22% (higher output -> prioritize carbs)';
            else fatPctText = '25% (standard cut baseline)';
        } else if (goalRaw === 'BUILD') {
            fatPctText = '27-30% range (muscle-gain support)';
        } else if (goalRaw === 'STRENGTH') {
            fatPctText = '25-28% range (performance + recovery)';
        }
        const minCaloriesForFeasibility = (proteinRule * 4) + (fatMin * 9) + 50;
        const requestedDeficit = Number(c.requestedDeficit || 0);
        const actualDeficit = Number(c.deficitPerDay || 0);
        const selectedRate = Number(c.selectedRate || 0);
        const deltaPerDay = Math.round(target - maintenance);
        const estRate = Math.abs(deltaPerDay) > 0 ? ((Math.abs(deltaPerDay) * 7) / 3500) : 0;
        let deficitExplainer = '';
        if (goalRaw === 'CUT') {
            if (requestedDeficit > 0 && requestedDeficit !== actualDeficit) {
                deficitExplainer = `For ${goalLabel}, we aimed to subtract <span class="ns-why-chip">${requestedDeficit} kcal/day</span>, and applied <span class="ns-why-chip">${actualDeficit} kcal/day</span> after profile adjustments${selectedRate > 0 ? ` (targeting ~${selectedRate.toFixed(1)} lb/week)` : ''}.`;
            } else if (actualDeficit > 0) {
                deficitExplainer = `For ${goalLabel}, we subtract <span class="ns-why-chip">${actualDeficit} kcal/day</span> to target about <span class="ns-why-chip">${selectedRate > 0 ? selectedRate.toFixed(1) : estRate.toFixed(1)} lb/week</span>.`;
            }
        } else if (deltaPerDay > 0) {
            deficitExplainer = `For ${goalLabel}, we add <span class="ns-why-chip">${deltaPerDay} kcal/day</span> above maintenance to support performance and recovery.`;
        } else if (deltaPerDay < 0) {
            deficitExplainer = `For ${goalLabel}, we subtract <span class="ns-why-chip">${Math.abs(deltaPerDay)} kcal/day</span> from maintenance.`;
        }

        if (body) {
            body.innerHTML = `
                <div class="ns-why-head">Calorie Math</div>
                <ul class="ns-why-list">
                    <li>BMR (Mifflin-St Jeor): <span class="ns-why-chip">${Number(c.bmr || 0).toLocaleString()} kcal</span></li>
                    <li>Maintenance (${activity} activity factor): <span class="ns-why-chip">${maintenance.toLocaleString()} kcal</span></li>
                    <li>Goal phase: <strong>${goalLabel}</strong></li>
                    ${deficitExplainer ? `<li>${deficitExplainer}</li>` : ''}
                    ${floorLine || ''}
                    <li>Final target: <span class="ns-why-chip ns-why-chip-strong ns-why-accent">${target.toLocaleString()} kcal/day</span></li>
                </ul>
                <div style="height:1px;background:rgba(120,92,57,0.18);margin:8px 0 6px 0;"></div>
                <div class="ns-why-head">Macro Logic</div>
                <ul class="ns-why-list" style="margin-bottom:0;">
                    <li><strong>Protein:</strong> bodyweight rule (${proteinBaseValue}g base), then range ${proteinMin}-${proteinMax}g. Final: <span class="ns-why-chip">${proteinRule}g</span></li>
                    <li><strong>Fats:</strong> goal profile + minimum healthy amount. Final: <span class="ns-why-chip">${fatRule}g</span></li>
                    <li><strong>Carbs:</strong> calories left after protein and fats. Final: <span class="ns-why-chip">${carbsRule}g</span></li>
                </ul>
                <div class="ns-why-foot">
                    <span>Protein 1g = 4 kcal | Carbs 1g = 4 kcal</span>
                    <span> | Fats 1g = 9 kcal</span>
                </div>
            `;
            if (panel && toggle && toggle.getAttribute('aria-expanded') === 'true') {
                panel.style.maxHeight = `${Math.max(panel.scrollHeight + 8, 40)}px`;
            }
        }
    }

    const sel = nutritionState?.selections || {};
    const currentWeight = Number(sel.weightLbs || 0);
    const goalWeight = Number(sel.goalWeightLbs || 0);
    const goal = String(sel.goal || '').toUpperCase();
    const introEl = document.getElementById('ns-target-intro');
    const outroEl = document.getElementById('ns-target-outro');

    if (Number.isFinite(currentWeight) && currentWeight > 0) setText('ns-current-weight', String(Math.round(currentWeight)));
    if (Number.isFinite(goalWeight) && goalWeight > 0) setText('ns-goal-weight-display', String(Math.round(goalWeight)));

    if (Number.isFinite(currentWeight) && currentWeight > 0 && Number.isFinite(goalWeight) && goalWeight > 0) {
        const gap = Math.abs(currentWeight - goalWeight);
        const wantsScaleGain = goalWeight > currentWeight;
        const wantsScaleLoss = goalWeight < currentWeight;
        const timeRow = document.getElementById('ns-time-to-goal-row');
        if (timeRow) timeRow.classList.toggle('hidden', gap === 0);
        setText('ns-weight-gap', String(Math.round(gap)));

        let introText = 'Good starting point. Run it for 7 days.';
        let outroText = "Make an account to track your weight. If the scale doesn't move after 7 days, macros auto-adjust to better match your goal.";

        if (goal === 'CUT') {
            setText('ns-time-to-goal-prefix', 'If you lose');
            setText('ns-target-rate', '1.5');
            const weeks = gap > 0 ? Math.max(1, Math.ceil(gap / 1.5)) : 0;
            setText('ns-weeks-to-goal', String(weeks));
            introText = `You are ${Math.round(currentWeight)} lb and want ${Math.round(goalWeight)} lb, so this plan is built for scale loss while keeping training performance stable.`;
            outroText = `At ~1.5 lb/week, your estimated timeline is about ${weeks} weeks. High protein supports muscle retention while carbs/fats support training and recovery.`;
        } else if (goal === 'BULK') {
            setText('ns-time-to-goal-prefix', 'If you gain');
            setText('ns-target-rate', '0.5-1');
            const weeksAtOne = gap > 0 ? Math.max(1, Math.ceil(gap / 1)) : 0;
            const weeksAtHalf = gap > 0 ? Math.max(1, Math.ceil(gap / 0.5)) : 0;
            const weeks = gap === 0 ? '0' : weeksAtOne === weeksAtHalf ? String(weeksAtOne) : `${weeksAtOne}-${weeksAtHalf}`;
            setText('ns-weeks-to-goal', weeks);
            introText = `You are ${Math.round(currentWeight)} lb and want ${Math.round(goalWeight)} lb, so this plan targets controlled weight gain with enough protein to drive muscle growth.`;
            outroText = `Most of your scale increase should be quality tissue over time. A realistic muscle gain pace is roughly 0.25-0.5 lb/week with consistent training and sleep.`;
        } else if (goal === 'STRENGTH') {
            if (wantsScaleLoss) {
                setText('ns-time-to-goal-prefix', 'If you lose');
                setText('ns-target-rate', '1.0');
                const weeks = gap > 0 ? Math.max(1, Math.ceil(gap / 1.0)) : 0;
                setText('ns-weeks-to-goal', String(weeks));
                introText = `You said you are ${Math.round(currentWeight)} lb and want ${Math.round(goalWeight)} lb, so this is a strength-first cut setup.`;
                outroText = `Macros are set to help you lose scale weight while preserving bar performance. Expect slower scale loss than aggressive cuts, but better strength retention.`;
            } else if (wantsScaleGain) {
                setText('ns-time-to-goal-prefix', 'If you gain');
                setText('ns-target-rate', '0.5');
                const weeks = gap > 0 ? Math.max(1, Math.ceil(gap / 0.5)) : 0;
                setText('ns-weeks-to-goal', String(weeks));
                introText = `You said you are ${Math.round(currentWeight)} lb and want ${Math.round(goalWeight)} lb, so this is a strength-first gain setup.`;
                outroText = `Expect steady scale gain to support strength progress. A realistic muscle gain pace here is often around 0.2-0.4 lb/week.`;
            } else {
                setText('ns-time-to-goal-prefix', 'If you maintain');
                setText('ns-target-rate', '0');
                setText('ns-weeks-to-goal', '0');
                introText = `You are aiming to stay near ${Math.round(currentWeight)} lb while prioritizing strength.`;
                outroText = 'This macro split supports performance, recovery, and progressive overload while keeping bodyweight stable.';
            }
        } else {
            if (wantsScaleGain) {
                setText('ns-time-to-goal-prefix', 'If you gain');
                setText('ns-target-rate', '0.5');
                const weeks = gap > 0 ? Math.max(1, Math.ceil(gap / 0.5)) : 0;
                setText('ns-weeks-to-goal', String(weeks));
            } else {
                setText('ns-time-to-goal-prefix', 'If you lose');
                setText('ns-target-rate', '1.0');
                const weeks = gap > 0 ? Math.max(1, Math.ceil(gap / 1.0)) : 0;
                setText('ns-weeks-to-goal', String(weeks));
            }
            introText = `You are ${Math.round(currentWeight)} lb and want ${Math.round(goalWeight)} lb, and this plan balances body-composition progress with training quality.`;
            outroText = "Track weekly scale trend and gym performance, then adjust calories by small steps if progress stalls.";
        }

        if (introEl) introEl.textContent = introText;
        if (outroEl) outroEl.textContent = outroText;
    } else {
        const timeRow = document.getElementById('ns-time-to-goal-row');
        if (timeRow) timeRow.classList.add('hidden');
        if (introEl) introEl.textContent = 'Good starting point. Run it for 7 days.';
        if (outroEl) outroEl.textContent = "Make an account to track your weight. If the scale doesn't move after 7 days, macros auto-adjust to better match your goal.";
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
        frequency: { '1-2': '1ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ2 days/week', '3-4': '3ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ4 days/week', '5-6': '5ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ6 days/week' },
        sex: { MALE: 'Male', FEMALE: 'Female' },
        intensity: { AVERAGE: 'Average', INTENSE: 'Intense', VERY_INTENSE: 'Very intense' }
    };

    const sel = selections || {};
    const heightIn = sel.heightIn || 0;
    const heightCm = heightIn ? Math.round(heightIn * 2.54) : '';
    const weightLbs = sel.weightLbs || 0;
    const weightKg = weightLbs ? Math.round(weightLbs * 0.453592) : '';
    const ageRange = sel.ageYears ? `${sel.ageYears}` : (sel.ageRange || '25-34');

    const meta = [
        { label: 'Goal', value: nice.goal[sel.goal] || EM_DASH },
        { label: 'Training Style', value: nice.style[sel.style] || EM_DASH },
        { label: 'Frequency', value: nice.frequency[sel.frequency] || EM_DASH },
        { label: 'Sex', value: nice.sex[sel.sex] || EM_DASH },
        { label: 'Age', value: ageRange || EM_DASH },
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
          <div class="card"><div class="muted">Real-World Check</div><div class="muted">Good starting point. Use for 14 days.</div><div class="muted" style="margin-top:8px; font-size:0.9em;">&#8226; Weight not dropping? Cut 100 calories<br>&#8226; Weight not rising? Add 100 calories</div><div class="muted" style="margin-top:8px; font-size:0.85em;">We build it in 60 seconds. Check portions if you do it yourself.</div><div class="muted" style="margin-top:8px; opacity:0.7; font-size:0.85em;">Used by 150+ lifters</div></div>
        </div>
      </div>

      <div class="section">
        <div class="badge">Math trail</div>
        <div class="row">
          <div class="stat">BMR: Mifflin-St Jeor with sex + age + height + weight</div>
          <div class="stat">TDEE = BMR &times; intensity (${sel.intensity || EM_DASH})</div>
          <div class="stat">Protein: goal-adjusted (${sel.goal || EM_DASH})</div>
          <div class="stat">Fat set to sustainable floor, carbs fill remainder</div>
          <div class="stat">Default cut target is ~1.5 lb/week (about 750 kcal/day deficit)</div>
        </div>
      </div>

      <div class="section">
        <div class="badge">Coach notes</div>
        <div class="macro-note">
          <p>${res.note || 'This is a starting estimate; track the scale for confirmation.'}</p>
          <p>Maintenance estimate: ${res.maintenanceCalories?.toLocaleString() || 'â€”'} kcal (factor ${res.maintenanceFactor?.toFixed(2) || 'â€”'})</p>
          <p>Adjustment reasoning: ${res.goalReasoning || 'â€”'}</p>
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

    // Placeholder: calculate quantities (keep within ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±10% of targets)
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
        meta: { macroTargets, tolerance: 'ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±10%' }
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
    // Minimal stub: return foods with a default quantity; real math will balance to macros ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±10%
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
    const sizeMatch = name.match(/(\d+[\.\d]*)\s*[-ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ]\s*(\d+[\.\d]*)\s*(lbs?|oz|g|kg)/i);
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
            ? 'Push volume and keep rest 90ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ150s on compounds.'
            : goal === 'STRENGTH'
                ? 'Prioritize heavy sets and long rest.'
                : 'Balance load and density.';

    return {
        summary: `${days} days/week ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${style.replace('_', ' ').toLowerCase()} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${goal.toLowerCase()}`,
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
        goal: null, style: null, frequency: null, sex: null, pregnant: null, trimester: null, lactating: null, ageYears: null,
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
    document.getElementById('ns-sex-female')?.classList.remove('pregnancy-visible');
    document.getElementById('ns-trimester-wrap')?.classList.add('hidden');
    document.getElementById('ns-lactating-wrap')?.classList.add('hidden');
    document.querySelectorAll('[data-pregnant-value]').forEach((opt) => {
        opt.classList.remove('active');
        opt.setAttribute('aria-checked', 'false');
    });

    ['ns-height','ns-height-ft','ns-height-in','ns-weight','ns-goal-weight','ns-age','ns-email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const lactatingInput = document.getElementById('ns-lactating');
    if (lactatingInput) lactatingInput.value = 'NO';
    document.querySelectorAll('[data-height-unit]').forEach((btn) => {
        const isInches = btn.dataset.heightUnit === 'inches';
        btn.classList.toggle('active', isInches);
        btn.setAttribute('aria-selected', isInches ? 'true' : 'false');
    });
    document.getElementById('ns-height-inches-wrap')?.classList.remove('hidden');
    document.getElementById('ns-height-feet-wrap')?.classList.add('hidden');
    const inchesInput = document.getElementById('ns-height');
    const feetInput = document.getElementById('ns-height-ft');
    const inchInput = document.getElementById('ns-height-in');
    if (inchesInput) inchesInput.required = true;
    if (feetInput) feetInput.required = false;
    if (inchInput) inchInput.required = false;
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
        return t && t !== 'â€”' ? t : null;
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

	        if (trust) trust.textContent = 'This just controls what we show you â€” nothing is locked.';

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

    const storeControl = document.querySelector('.control-panel a.control-link[href="store.html"]');
    const progressControl = document.querySelector('.control-panel a.control-link[href="training-status.html"]');
    const dashControl = document.querySelector('.control-panel .control-link#control-checkin');
    const leaderboardControl = document.querySelector('.control-panel a.control-link[href="leaderboard.html"]');
    lockLink(storeControl, { addSub: true });
    lockLink(progressControl, { addSub: true });
    lockLink(dashControl, { addSub: true });
    // Leaderboard is now live in control panel.
    if (leaderboardControl) {
        leaderboardControl.classList.remove('coming-soon-item', 'is-locked', 'coming-soon-link');
        leaderboardControl.removeAttribute('aria-disabled');
        const textEl = leaderboardControl.querySelector('.text') || leaderboardControl;
        const sub = textEl.querySelector('.control-sub');
        if (sub) sub.remove();
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
    initTracking();
    setupPreloader();
    setupNav();
    setupMacroNavLink();
    initAuthUi();
    initAuthGate();
    setupTrialBadge();
    setupComingSoonLinks();
    setupSmoothScroll();
    initTrainingHandoffOneOnOne();
    initNutritionFunnel();
    runNutritionEngineSelfTests();
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
                    <p class="checkin-step-sub">If you donÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢t measure today, leave these blank.</p>
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
                            <span>TodayÃ¢â‚¬â„¢s photos (recommended)</span>
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
                            <div class="ns-muted tiny">If you didnÃ¢â‚¬â„¢t eat the planned meal, use Ã¢â‚¬Å“DidnÃ¢â‚¬â„¢t eatÃ¢â‚¬Â / Ã¢â‚¬Å“Clear allÃ¢â‚¬Â inside the popup.</div>
                            <div class="checkin-meals-head">
                                <div class="ns-muted tiny" id="checkin-meals-summary">â€”</div>
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
                                <option value="">â€”</option>
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                            </select>
                            <div class="ns-muted tiny">If Ã¢â‚¬Å“NoÃ¢â‚¬Â, add a quick note â€” it becomes your playbook.</div>
                        </label>
                        <div class="ns-field hidden" id="checkin-mealprep-note-wrap">
                            <span>What got in the way?</span>
                            <textarea id="checkin-mealprep-note" rows="3" placeholder="e.g. ran out of groceries, travel, time, stress..."></textarea>
                        </div>
                        <label class="ns-field">
                            <span>Mood (1Ã¢â‚¬â€œ5)</span>
                            <select id="checkin-mood">
                                <option value="">â€”</option>
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
                            <div class="ns-muted tiny">This is private â€” itÃ¢â‚¬â„¢s just for your trend awareness.</div>
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
                    <p class="checkin-sub" id="cmm-sub">Planned vs. actual. Clear it if you didnÃ¢â‚¬â„¢t eat it.</p>
                </div>
                <div class="meal-log-head-actions">
                    <button class="btn btn-ghost" type="button" id="cmm-skip">DidnÃ¢â‚¬â„¢t eat</button>
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
                    <p class="checkin-sub">Front + side + back photos help you see changes that the scale canÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢t.</p>
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
                    <div class="pc-label" id="pc-a-label">â€”</div>
                    <img id="pc-a-img" alt="Photo A">
                </div>
                <div class="pc-slot">
                    <div class="pc-label" id="pc-b-label">â€”</div>
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
                <input class="meal-log-input meal-log-num" data-cmm-field="kcal" data-cmm-i="${i}" inputmode="numeric" placeholder="â€”" value="${escapeHtml(r.kcal ?? '')}">
                <input class="meal-log-input meal-log-num" data-cmm-field="p" data-cmm-i="${i}" inputmode="numeric" placeholder="â€”" value="${escapeHtml(r.p ?? '')}">
                <input class="meal-log-input meal-log-num" data-cmm-field="c" data-cmm-i="${i}" inputmode="numeric" placeholder="â€”" value="${escapeHtml(r.c ?? '')}">
                <input class="meal-log-input meal-log-num" data-cmm-field="f" data-cmm-i="${i}" inputmode="numeric" placeholder="â€”" value="${escapeHtml(r.f ?? '')}">
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
            ? `Logged: ${logged}/${mealsPerDay} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ On plan: ${onPlan} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Off plan: ${offPlan}`
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
                ? `${escapeHtml(plannedPreview)}${plannedMore ? 'Ã¢â‚¬Â¦' : ''}`
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
                ? 'Premade plan loaded. Edit if needed, or tap Ã¢â‚¬Å“DidnÃ¢â‚¬â„¢t eatÃ¢â‚¬Â.'
                : 'No plan found yet â€” add what you ate.';
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
        const actualText = rows.map((r) => `ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ${r.name}${r.qty ? ` â€” ${r.qty}` : ''}`).join('\n');

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
        if (mealStatusEl) mealStatusEl.textContent = 'Override â€” type what you ate (servings optional).';
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

    // "Program week" = fixed 7-day blocks within the month (1ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“7, 8ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“14, 15ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“21, 22ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“28, 29ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“31).
    // This matches the "if I'm on the 2nd, show 1stÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“7th" requirement.
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
        if (Number.isNaN(d.getTime())) return 'â€”';
        return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    };

    const fmtRange = (startIso, endIso) => {
        const s = isoToDateLocal(startIso);
        const e = isoToDateLocal(endIso);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 'â€”';
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
            ? 'Locked: you canÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢t log future days.'
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
            showAlert('You canÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢t log future days.');
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
            const endsTxt = endsInDays == null ? '' : ` Ãƒâ€šÃ‚Â· ends in ${endsInDays} day${endsInDays === 1 ? '' : 's'}`;
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
        showAlert('SavingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦');
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
                        showAlert('ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Profile flagged: 4+ auto-adjusts without progress.');
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
            if (Number.isNaN(d.getTime())) return String(iso || 'â€”');
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
            if (previewMeta) previewMeta.textContent = `${fmt(selected.day)} ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ${selected.pose}`;
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
                if (aLabel) aLabel.textContent = a ? fmt(a.day) : 'â€”';
                if (bLabel) bLabel.textContent = b ? fmt(b.day) : 'â€”';
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
        const historyListEl = document.getElementById('overview-photo-history-list');
        const frontImg = document.getElementById('overview-photo-front');
        const sideImg = document.getElementById('overview-photo-side');
        const backImg = document.getElementById('overview-photo-back');
        const frontMeta = document.getElementById('overview-photo-front-meta');
        const sideMeta = document.getElementById('overview-photo-side-meta');
        const backMeta = document.getElementById('overview-photo-back-meta');
        if (!openBtn || !frontImg || !sideImg) return;

        const fmt = (iso) => {
            const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
            if (Number.isNaN(d.getTime())) return String(iso || 'â€”');
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

            if (historyListEl) {
                const byDay = new Map();
                photos.forEach((p) => {
                    const day = String(p?.day || '').slice(0, 10);
                    if (!day) return;
                    const pose = (p?.pose === 'side' || p?.pose === 'back') ? p.pose : 'front';
                    const row = byDay.get(day) || { day, front: null, side: null, back: null };
                    row[pose] = p;
                    byDay.set(day, row);
                });

                const days = Array.from(byDay.keys()).sort((a, b) => String(b).localeCompare(String(a)));
                const previousDays = days.filter((d) => !latestDay || d !== latestDay);

                if (!previousDays.length) {
                    const day = todayIso();
                    historyListEl.innerHTML = `
                        <article class="overview-photo-history-row">
                            <button type="button" class="overview-photo-history-date" data-photo-day="${escapeHtml(day)}">${escapeHtml(fmtLong(day))}</button>
                            <div class="overview-photo-history-placeholders" aria-label="No previous photos yet">
                                <div class="overview-photo-history-placeholder-slot">
                                    <div class="overview-photo-history-placeholder-label">Front</div>
                                    <div class="overview-photo-history-placeholder" aria-hidden="true">+</div>
                                </div>
                                <div class="overview-photo-history-placeholder-slot">
                                    <div class="overview-photo-history-placeholder-label">Side</div>
                                    <div class="overview-photo-history-placeholder" aria-hidden="true">+</div>
                                </div>
                                <div class="overview-photo-history-placeholder-slot">
                                    <div class="overview-photo-history-placeholder-label">Back</div>
                                    <div class="overview-photo-history-placeholder" aria-hidden="true">+</div>
                                </div>
                            </div>
                        </article>
                    `;

                    historyListEl.querySelectorAll('[data-photo-day]').forEach((btn) => {
                        btn.addEventListener('click', () => {
                            const picked = String(btn.getAttribute('data-photo-day') || '').slice(0, 10);
                            if (!picked) return;
                            open({ day: picked, pose: 'front' });
                        });
                    });
                } else {
                    const thumbHtml = (p, label) => {
                        if (!p?.imageDataUrl) {
                            return `<div class="overview-photo-history-thumb" title="${escapeHtml(label)}"></div>`;
                        }
                        return `
                            <div class="overview-photo-history-thumb" title="${escapeHtml(label)}">
                                <img src="${escapeHtml(p.imageDataUrl)}" alt="${escapeHtml(label)} progress photo">
                            </div>
                        `;
                    };

                    historyListEl.innerHTML = previousDays.slice(0, 6).map((day) => {
                        const row = byDay.get(day);
                        return `
                            <article class="overview-photo-history-row">
                                <button type="button" class="overview-photo-history-date" data-photo-day="${escapeHtml(day)}">${escapeHtml(fmtLong(day))}</button>
                                <div class="overview-photo-history-strip">
                                    ${thumbHtml(row?.front, 'Front')}
                                    ${thumbHtml(row?.side, 'Side')}
                                    ${thumbHtml(row?.back, 'Back')}
                                </div>
                            </article>
                        `;
                    }).join('');

                    historyListEl.querySelectorAll('[data-photo-day]').forEach((btn) => {
                        btn.addEventListener('click', () => {
                            const day = String(btn.getAttribute('data-photo-day') || '').slice(0, 10);
                            if (!day) return;
                            open({ day, pose: 'front' });
                        });
                    });
                }
            }
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

    const daysRemaining = daysRemainingInCurrentMonth(new Date());
    const avgMonthly28Num = Number.isFinite(monthlyNum) ? (monthlyNum * 28) / 30 : null;
    const restOfMonthNum = Number.isFinite(monthlyNum) && Number.isFinite(daysRemaining)
        ? (monthlyNum * daysRemaining) / 30
        : null;

    // Update shared UI bits when present (plan + overview share some ids).
    try {
        const store = String(meta?.store || '').trim();
        const storePill = document.getElementById('store-pill');
        if (storePill) storePill.textContent = store || 'Saved';
        const storeEl = document.getElementById('p-store');
        if (storeEl) storeEl.textContent = store || EM_DASH;

        renderCostWindowSummary({
            weeklyCost: weeklyNum,
            avgMonthly28: avgMonthly28Num,
            restOfMonth: restOfMonthNum,
            daysRemaining
        });

        const monthDaysEl = document.getElementById('overview-month-days');
        if (monthDaysEl && !Number.isFinite(daysRemaining)) monthDaysEl.textContent = 'Saved to your account';

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

function odeConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false, size = 'default' } = {}) {
    const modal = ensureOdeConfirmModal();
    const titleEl = modal.querySelector('#ode-confirm-title');
    const bodyEl = modal.querySelector('#ode-confirm-body');
    const cardEl = modal.querySelector('.ode-confirm-card');
    const okBtn = modal.querySelector('#ode-confirm-ok');
    const cancelBtn = modal.querySelector('#ode-confirm-cancel');
    const closeBtn = modal.querySelector('#ode-confirm-close');

    const safeTitle = String(title || 'Confirm');
    const safeMsg = String(message || '');
    const renderConfirmLine = (rawLine) => {
        let html = escapeHtml(String(rawLine || ''));
        // **text** => bold emphasis
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="ode-confirm-strong">$1</strong>');
        // [[text]] => highlighted value chip
        html = html.replace(/\[\[(.+?)\]\]/g, '<span class="ode-confirm-chip">$1</span>');
        return html;
    };

    if (titleEl) titleEl.textContent = safeTitle;
    if (cardEl) {
        cardEl.classList.toggle('ode-confirm-card-wide', String(size || '').toLowerCase() === 'wide');
    }
    if (bodyEl) {
        const lines = safeMsg.split('\n').map((l) => l.trim()).filter(Boolean);
        bodyEl.innerHTML = lines.length ? lines.map((l) => {
            if (l === '---') {
                return '<div class="ode-confirm-separator" role="separator" aria-hidden="true"></div>';
            }
            if (/^[-*]\s+/.test(l)) {
                const bulletText = l.replace(/^[-*]\s+/, '');
                return `<div class="ode-confirm-line ode-confirm-bullet"><span class="ode-confirm-bullet-dot" aria-hidden="true">&#8226;</span><span class="ode-confirm-bullet-text">${renderConfirmLine(bulletText)}</span></div>`;
            }
            return `<div class="ode-confirm-line">${renderConfirmLine(l)}</div>`;
        }).join('') : '';
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
    const root = document.documentElement;
    const toggle = document.getElementById('theme-toggle');

    // Theme switching is intentionally disabled; site is locked to light mode.
    root.setAttribute('data-theme', 'light');
    root.classList.remove('theme-transition');
    document.body.classList.remove('theme-wipe-dark', 'theme-wipe-light');
    try {
        localStorage.removeItem('ode_theme');
    } catch {
        // ignore
    }

    if (toggle) toggle.remove();
}

/* ============================================
   AUTH (NEON-BACKED SESSIONS)
   ============================================ */

function initAuthUi() {
    const navbarContainer = document.querySelector('.navbar-container');
    if (!navbarContainer) return;

    const navMenu = document.getElementById('nav-menu');
    const { wrapper, signInBtn, signUpBtn, userBtn, menu, sep } = ensureAuthNavbarUi(navbarContainer);
    const mobileAuth = ensureMobileAuthUi(navMenu);
    const controlAuth = ensureControlPanelAuthUi();
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
        if (sep) sep.classList.remove('hidden');
        userBtn.classList.add('hidden');
        menu.classList.add('hidden');
        menu.innerHTML = '';
        if (mobileAuth?.loginBtn) mobileAuth.loginBtn.classList.remove('hidden');
        if (mobileAuth?.signupBtn) mobileAuth.signupBtn.classList.remove('hidden');
        if (mobileAuth?.userRow) mobileAuth.userRow.classList.add('hidden');
        if (controlAuth?.signInBtn) controlAuth.signInBtn.classList.remove('hidden');
        if (controlAuth?.signUpBtn) controlAuth.signUpBtn.classList.remove('hidden');
        syncControlPanelLabel(null);
        emitAuthChanged(null);
    };

    const setSignedInUi = (user) => {
        currentUser = user;
        const label = user?.displayName || user?.username || 'Account';
        signInBtn.classList.add('hidden');
        signUpBtn.classList.add('hidden');
        if (sep) sep.classList.add('hidden');
        userBtn.classList.remove('hidden');
        userBtn.textContent = label;
        userBtn.setAttribute('aria-label', 'Account menu');
        if (mobileAuth?.loginBtn) mobileAuth.loginBtn.classList.add('hidden');
        if (mobileAuth?.signupBtn) mobileAuth.signupBtn.classList.add('hidden');
        if (mobileAuth?.userRow) {
            mobileAuth.userRow.classList.remove('hidden');
            if (mobileAuth.userName) mobileAuth.userName.textContent = label;
        }
        if (controlAuth?.signInBtn) controlAuth.signInBtn.classList.remove('hidden');
        if (controlAuth?.signUpBtn) controlAuth.signUpBtn.classList.add('hidden');
        syncControlPanelLabel(user);

        menu.innerHTML = `
            <button type="button" class="auth-menu-item" id="auth-menu-logout">Sign out</button>
            <a class="auth-menu-item auth-menu-item-dashboard" id="auth-menu-dashboard" href="overview.html#control-panel">Dashboard</a>
        `;
        const dashboardLink = menu.querySelector('#auth-menu-dashboard');
        dashboardLink?.addEventListener('click', () => {
            menu.classList.add('hidden');
        });
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
    mobileAuth?.loginBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal('login');
    });
    mobileAuth?.signupBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal('signup');
    });
    mobileAuth?.logoutBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await authLogout();
        setSignedOutUi();
    });
    mobileAuth?.dashboardLink?.addEventListener('click', () => {
        navMenu?.classList.remove('active');
        document.body?.classList.remove('nav-drawer-open');
        document.getElementById('hamburger')?.setAttribute('aria-expanded', 'false');
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
    const controlSignUpBtn = document.getElementById('control-signup');
    controlSignUpBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const panel = document.getElementById('control-panel');
        panel?.classList.remove('open');
        openModal('signup');
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

function ensureAuthNavbarUi(navbarContainer) {
    let wrapper = document.getElementById('auth-wrap');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'auth-wrap';
        wrapper.className = 'auth-wrap';

        const signInBtn = document.createElement('button');
        signInBtn.type = 'button';
        signInBtn.id = 'auth-signin-btn';
        signInBtn.className = 'auth-nav-btn auth-nav-link';
        signInBtn.textContent = 'Sign in';

        const sep = document.createElement('span');
        sep.id = 'auth-sep';
        sep.className = 'auth-nav-sep';
        sep.textContent = '|';

        const signUpBtn = document.createElement('button');
        signUpBtn.type = 'button';
        signUpBtn.id = 'auth-signup-btn';
        signUpBtn.className = 'auth-nav-btn auth-nav-link';
        signUpBtn.textContent = 'Sign up';

        const userBtn = document.createElement('button');
        userBtn.type = 'button';
        userBtn.id = 'auth-user-btn';
        userBtn.className = 'auth-nav-btn auth-nav-user hidden';
        userBtn.textContent = 'Account';

        const menu = document.createElement('div');
        menu.id = 'auth-menu';
        menu.className = 'auth-menu hidden';

        wrapper.appendChild(signInBtn);
        wrapper.appendChild(sep);
        wrapper.appendChild(signUpBtn);
        wrapper.appendChild(userBtn);
        wrapper.appendChild(menu);

        navbarContainer.appendChild(wrapper);
    }

    return {
        wrapper,
        signInBtn: wrapper.querySelector('#auth-signin-btn'),
        signUpBtn: wrapper.querySelector('#auth-signup-btn'),
        userBtn: wrapper.querySelector('#auth-user-btn'),
        menu: wrapper.querySelector('#auth-menu'),
        sep: wrapper.querySelector('#auth-sep')
    };
}

function ensureMobileAuthUi(navMenu) {
    if (!navMenu) return null;
    let wrap = navMenu.querySelector('#auth-mobile-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'auth-mobile-wrap';
        wrap.className = 'auth-mobile-wrap';
        wrap.innerHTML = `
            <button type="button" class="auth-mobile-btn auth-mobile-btn-primary" id="auth-mobile-signup">Sign up</button>
            <button type="button" class="auth-mobile-btn auth-mobile-btn-ghost" id="auth-mobile-login">Log in</button>
            <div class="auth-mobile-user-row hidden" id="auth-mobile-user-row">
                <p class="auth-mobile-username" id="auth-mobile-username">Account</p>
                <button type="button" class="auth-mobile-btn auth-mobile-btn-primary" id="auth-mobile-logout">Sign out</button>
                <a class="auth-mobile-btn auth-mobile-btn-primary" id="auth-mobile-dashboard" href="overview.html#control-panel">Dashboard</a>
            </div>
        `.trim();
        navMenu.appendChild(wrap);
    }

    return {
        wrap,
        signupBtn: wrap.querySelector('#auth-mobile-signup'),
        loginBtn: wrap.querySelector('#auth-mobile-login'),
        userRow: wrap.querySelector('#auth-mobile-user-row'),
        userName: wrap.querySelector('#auth-mobile-username'),
        logoutBtn: wrap.querySelector('#auth-mobile-logout'),
        dashboardLink: wrap.querySelector('#auth-mobile-dashboard')
    };
}

function ensureControlPanelAuthUi() {
    const panel = document.getElementById('control-panel');
    if (!panel) return null;

    let signInBtn = panel.querySelector('#control-signin');
    let signUpBtn = panel.querySelector('#control-signup');
    if (!signInBtn || !signUpBtn) {
        const section = document.createElement('div');
        section.className = 'control-section';
        section.dataset.authSection = '1';
        section.innerHTML = `
            <p class="section-label">ACCOUNT</p>
            <button class="control-link" id="control-signin" type="button">
                <span class="icon"><svg><use href="#icon-account"></use></svg></span>
                <span class="text">Sign in</span>
            </button>
            <button class="control-link" id="control-signup" type="button">
                <span class="icon"><svg><use href="#icon-account"></use></svg></span>
                <span class="text">Sign up</span>
            </button>
        `.trim();

        const firstSection = panel.querySelector('.control-section');
        if (firstSection) panel.insertBefore(section, firstSection);
        else panel.appendChild(section);
    }

    signInBtn = panel.querySelector('#control-signin');
    signUpBtn = panel.querySelector('#control-signup');
    return { signInBtn, signUpBtn };
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
    if (!controlPanel) return;
    const path = String(location.pathname || '').toLowerCase();
    const isHomePage = path.endsWith('/index.html') || path.endsWith('index.html') || path === '/' || path === '';
    const isOverviewPage = document.body?.classList?.contains('overview-page');
    const isMobileControl = (() => {
        try { return window.matchMedia('(max-width: 640px)').matches; } catch { return false; }
    })();

    if (isHomePage) {
        document.body.classList.remove('has-control-panel', 'control-pinned', 'control-open', 'control-collapsed');
        controlPanel.classList.remove('open', 'collapsed');
        document.getElementById('control-mobile-fab')?.remove();
        return;
    }

    // Any page that includes the control panel should show it.
    document.body.classList.add('has-control-panel');
    if (isMobileControl) {
        // Phone: keep control panel collapsible.
        document.body.classList.remove('control-pinned');
        collapseControlPanel();

        let closeBtn = document.getElementById('control-close');
        if (!closeBtn) {
            const header = controlPanel.querySelector('.control-panel-header') || (() => {
                const h = document.createElement('div');
                h.className = 'control-panel-header';
                controlPanel.insertBefore(h, controlPanel.firstChild);
                return h;
            })();
            closeBtn = document.createElement('button');
            closeBtn.className = 'control-close';
            closeBtn.id = 'control-close';
            closeBtn.setAttribute('aria-label', 'Collapse panel');
            closeBtn.textContent = 'Ãƒâ€”';
            header.appendChild(closeBtn);
        }
        closeBtn.setAttribute('aria-label', 'Close control panel');
        closeBtn.textContent = 'Ãƒâ€”';
        closeBtn.addEventListener('click', toggleControlPanel);

        let fab = document.getElementById('control-mobile-fab');
        if (!fab) {
            fab = document.createElement('button');
            fab.type = 'button';
            fab.id = 'control-mobile-fab';
            fab.className = 'control-mobile-fab';
            fab.textContent = 'Control Panel';
            fab.setAttribute('aria-label', 'Open control panel');
            document.body.appendChild(fab);
        }
        const syncFab = () => {
            const isOpen = controlPanel.classList.contains('open') && !controlPanel.classList.contains('collapsed');
            fab.classList.toggle('hidden', isOpen);
            fab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        };
        fab.addEventListener('click', () => {
            openControlPanel();
            syncFab();
        });
        closeBtn.addEventListener('click', () => {
            window.setTimeout(syncFab, 0);
        });
        syncFab();
    } else {
        // Desktop: keep pinned/open.
        document.body.classList.add('control-pinned');
        openControlPanel();
        if (controlCloseBtn) controlCloseBtn.remove();
        document.getElementById('control-mobile-fab')?.remove();
    }

    controlPanel.querySelectorAll('.control-link').forEach((controlLink) => {
        controlLink.addEventListener('click', (e) => {
            const isMobile = window.matchMedia('(max-width: 640px)').matches;
            const href = controlLink.getAttribute('href');
            if (!href) {
                if (isMobile) window.setTimeout(() => collapseControlPanel(), 0);
                return;
            }

            let targetUrl;
            try {
                targetUrl = new URL(href, window.location.href);
            } catch {
                if (isMobile) window.setTimeout(() => collapseControlPanel(), 0);
                return;
            }
            const samePath = targetUrl.pathname === window.location.pathname;
            const sameSearch = targetUrl.search === window.location.search;
            const sameHash = targetUrl.hash === window.location.hash;
            const noHash = !targetUrl.hash;

            // Prevent hard reload when the control link targets the page we're already on.
            if (samePath && sameSearch && (noHash || sameHash)) {
                e.preventDefault();
            }
            if (isMobile) window.setTimeout(() => collapseControlPanel(), 0);
        });
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
                ? items.map((i) => `ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ${i.foodName} â€” ${i.measurementText}`).join('\n')
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
                        <button class="food-source-trash" type="button" data-custom-food-del="${row.id}" aria-label="Delete">ÃƒÂ°Ã…Â¸â€”Ã¢â‚¬Ëœ</button>
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
                    <p class="checkin-sub">Set your targets and weÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ll rebuild your meals + groceries.</p>
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
                    <p class="checkin-sub">Make an account and youÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ll get free custom access.</p>
                </div>
                <button type="button" class="checkin-close" data-cm-auth-close aria-label="Close">&times;</button>
            </div>
            <div class="ns-muted" style="margin-top:10px;">
                Custom foods lets you pick the groceries you actually eat ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â then weÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ll re-generate your plan.
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
        // Default allergy state (editable): none checked unless saved prefs say otherwise.
        const allergyChecks = Array.from(document.querySelectorAll('.allergy-checkbox input[type="checkbox"]'));
        allergyChecks.forEach((input) => {
            input.disabled = false;
            input.checked = String(input.value || '').toLowerCase() === 'none';
        });
        const allergyHiddenInput = document.getElementById('g-allergies');
        const syncAllergyHidden = () => {
            if (!allergyHiddenInput) return;
            const selected = allergyChecks
                .filter((input) => Boolean(input.checked))
                .map((input) => String(input.value || '').trim().toLowerCase())
                .filter(Boolean);
            allergyHiddenInput.value = selected.join(',');
        };
        const noneAllergyInput = allergyChecks.find((input) => String(input.value || '').toLowerCase() === 'none');
        allergyChecks.forEach((input) => {
            input.addEventListener('change', () => {
                const isNone = String(input.value || '').toLowerCase() === 'none';
                if (isNone && input.checked) {
                    allergyChecks.forEach((other) => {
                        if (other !== input) other.checked = false;
                    });
                } else if (!isNone && input.checked && noneAllergyInput) {
                    noneAllergyInput.checked = false;
                }
                const hasNonNoneChecked = allergyChecks.some((other) => String(other.value || '').toLowerCase() !== 'none' && other.checked);
                if (!hasNonNoneChecked && noneAllergyInput) noneAllergyInput.checked = true;
                syncAllergyHidden();
            });
        });
        syncAllergyHidden();
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

    let savedPrefs = null;
    try {
        savedPrefs = JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null');
    } catch (err) {
        savedPrefs = null;
    }

    let profileMacros = sessionData?.macros || savedPrefs?.macros || null;
    const proteinTarget = sessionData?.proteinTarget || Number(profileMacros?.proteinG) || 0;
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
    const budgetButtons = Array.from(document.querySelectorAll('.budget-btn'));
    const budgetForecastMainEl = document.getElementById('budget-forecast-main');
    const budgetForecastSubEl = document.getElementById('budget-forecast-sub');
    const budgetForecastSaveEl = document.getElementById('budget-forecast-save');
    const budgetForecastActionsEl = document.getElementById('budget-forecast-actions');
    const budgetForecastWrapEl = document.querySelector('.budget-forecast');
    const budgetForecastToggleEl = document.getElementById('budget-forecast-toggle');

    // Mode display removed (requested).
    
    const roundTo10 = (n) => Math.round((Number(n) || 0) / 10) * 10;
    const clampNum = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
    const formatBudgetRange = (lo, hi) => `$${Math.round(lo)}-$${Math.round(hi)}`;
    const formatMoney = (n) => {
        const v = Number(n) || 0;
        try {
            if (typeof formatCurrency === 'function') return formatCurrency(v);
        } catch {
            // ignore and fallback
        }
        return `$${Math.round(v).toLocaleString()}`;
    };
    const formatGoalLabel = (rawGoal) => {
        const g = String(rawGoal || '').trim().toUpperCase();
        if (g === 'CUT' || g === 'LOSE' || g === 'FAT-LOSS' || g === 'FAT LOSS') return 'fat-loss goal';
        if (g === 'BUILD' || g === 'BULK') return 'muscle-building goal';
        if (g === 'STRENGTH') return 'strength-priority goal';
        return 'goal settings';
    };
    const formatFrequencyLabel = (rawFreq) => {
        const f = String(rawFreq || '').trim();
        if (f === '1-2') return '1-2 training days/week';
        if (f === '3-4') return '3-4 training days/week';
        if (f === '5-6') return '5-6 training days/week';
        return 'training frequency not set';
    };
    const formatIntensityLabel = (rawIntensity) => {
        const i = String(rawIntensity || '').trim().toUpperCase();
        if (i === 'LIGHT') return 'light intensity';
        if (i === 'AVERAGE' || i === 'MODERATE') return 'average intensity';
        if (i === 'INTENSE' || i === 'HIGH') return 'intense sessions';
        return 'intensity not set';
    };
    const calcCarbRemainder = (cal, pro, fat) => Math.max(0, Math.round((Number(cal || 0) - ((Number(pro || 0) * 4) + (Number(fat || 0) * 9))) / 4));
    const resolveGoalWeightForBudgetMath = ({ goalWeightLbs, currentWeightLbs }) => {
        const gw = Number(goalWeightLbs);
        if (Number.isFinite(gw) && gw > 0) {
            return { value: gw, source: 'goal' };
        }
        const cw = Number(currentWeightLbs);
        if (Number.isFinite(cw) && cw > 0) {
            return { value: cw, source: 'current' };
        }
        return { value: 180, source: 'fallback' };
    };
    let budgetTierExplainers = {};
    const formatFreqDownLabel = (freq) => {
        if (freq === '5-6') return 'Decrease workouts per week (5-6 -> 3-4)';
        if (freq === '3-4') return 'Decrease workouts per week (3-4 -> 1-2)';
        return 'Decrease workouts per week';
    };
    const estimateMonthlyFromMacros = (m) => {
        const mc = m || {};
        const cals = Number(mc.calories) || 2200;
        const protein = Number(mc.proteinG) || 160;
        const fat = Number(mc.fatG) || 65;
        const daily = 2.4 + (cals * 0.0022) + (protein * 0.014) + (fat * 0.01);
        const tasteInputEl = document.getElementById('g-taste-cost');
        const tastePref = String(tasteInputEl?.value || savedPrefs?.tasteCost || 'balance').trim().toLowerCase();
        const tasteMult = tastePref === 'cheapest' ? 0.94 : (tastePref === 'premium' ? 1.08 : 1.0);
        const priceAdjRaw = Number(priceAdjustmentInput?.value ?? savedPrefs?.priceAdjustment ?? 0);
        const priceAdjMult = Number.isFinite(priceAdjRaw) ? (1 + (priceAdjRaw / 100)) : 1.0;
        const adjustedMonthly = daily * 30 * tasteMult * priceAdjMult;
        return clampNum(roundTo10(adjustedMonthly), 170, 650);
    };
    const normalizeBudgetTierKey = (raw) => {
        const v = String(raw || '').trim().toLowerCase();
        if (v === 'budget' || v === 'balanced' || v === 'best') return v;
        if (v === 'under-200') return 'budget';
        if (v === '200-400') return 'balanced';
        if (v === '400-plus') return 'best';
        return '';
    };
    const normalizeTierOption = (opt, idx = 0) => {
        const fallbackKey = idx === 0 ? 'budget' : (idx === 1 ? 'balanced' : 'best');
        const key = normalizeBudgetTierKey(opt?.key || fallbackKey) || fallbackKey;
        const low = Math.max(0, Number(opt?.low) || 0);
        const high = Math.max(low, Number(opt?.high) || 0);
        const value = Number.isFinite(Number(opt?.value))
            ? Number(opt.value)
            : roundTo10((low + high) / 2);
        const title = String(
            opt?.title
            || (key === 'budget' ? 'Minimum Effective Plan' : (key === 'balanced' ? 'Balanced Results' : 'Best Performance'))
        ).trim();
        return { key, title, low, high, value };
    };
    const buildTierOptionsFromBestCost = (bestCostRaw) => {
        const bestCost = clampNum(roundTo10(bestCostRaw), 120, 900);
        const budgetLow = Math.max(90, roundTo10(bestCost * 0.62));
        const budgetHigh = Math.max(budgetLow + 20, roundTo10(bestCost * 0.78));
        const balancedLow = Math.max(budgetHigh, roundTo10(bestCost * 0.78));
        const balancedHigh = Math.max(balancedLow + 20, roundTo10(bestCost * 0.92));
        const bestLow = Math.max(balancedHigh, roundTo10(bestCost * 0.92));
        const bestHigh = Math.max(bestLow + 20, roundTo10(bestCost * 1.08));
        return [
            { key: 'budget', title: 'Minimum Effective Plan', low: budgetLow, high: budgetHigh, value: roundTo10((budgetLow + budgetHigh) / 2) },
            { key: 'balanced', title: 'Balanced Results', low: balancedLow, high: balancedHigh, value: roundTo10((balancedLow + balancedHigh) / 2) },
            { key: 'best', title: 'Best Performance', low: bestLow, high: bestHigh, value: roundTo10(bestCost) }
        ];
    };
    const getSavedTierOptions = () => {
        const raw = Array.isArray(savedPrefs?.budgetTierOptions) ? savedPrefs.budgetTierOptions : [];
        const normalized = raw
            .map((opt, idx) => normalizeTierOption(opt, idx))
            .filter((opt) => opt.low > 0 && opt.high >= opt.low);
        const hasAllKeys = ['budget', 'balanced', 'best'].every((k) => normalized.some((opt) => opt.key === k));
        if (!hasAllKeys) return null;
        return ['budget', 'balanced', 'best'].map((k) => normalized.find((opt) => opt.key === k));
    };
    const syncPriceAdjustmentValueLabel = () => {
        if (!priceAdjustmentInput || !priceAdjustmentValue) return;
        const val = Number(priceAdjustmentInput.value);
        if (val === 0) {
            priceAdjustmentValue.textContent = 'Accurate';
        } else if (val > 0) {
            priceAdjustmentValue.textContent = `+${val}%`;
        } else {
            priceAdjustmentValue.textContent = `${val}%`;
        }
    };

    // ========================================
    // PHASE 5.6: Price adjustment slider
    // ========================================
    if (priceAdjustmentInput && priceAdjustmentValue) {
        priceAdjustmentInput.addEventListener('input', () => {
            syncPriceAdjustmentValueLabel();
            configureDynamicBudgetOptions();
        });
    }
    const getCurrentLossRate = () => {
        const fromSession = Number(sessionData?.selections?.lossRateLbsPerWeek ?? sessionData?.selections?.lbsPerWeek);
        const fromPrefs = Number(savedPrefs?.lossRateLbsPerWeek ?? savedPrefs?.lbsPerWeek);
        const fromState = Number(nutritionState?.selections?.lossRateLbsPerWeek ?? nutritionState?.selections?.lbsPerWeek);
        if (Number.isFinite(fromSession) && fromSession > 0) return fromSession;
        if (Number.isFinite(fromPrefs) && fromPrefs > 0) return fromPrefs;
        if (Number.isFinite(fromState) && fromState > 0) return fromState;
        return 1.5;
    };
    const buildCurrentFormState = (overrides = {}) => ({
        goal: sessionData?.selections?.goal || savedPrefs?.mode || nutritionState?.selections?.goal || null,
        style: sessionData?.selections?.style || savedPrefs?.style || nutritionState?.selections?.style || null,
        frequency: sessionData?.selections?.frequency || savedPrefs?.frequency || nutritionState?.selections?.frequency || null,
        sex: sessionData?.selections?.sex || savedPrefs?.sex || nutritionState?.selections?.sex || null,
        pregnant: sessionData?.selections?.pregnant || savedPrefs?.pregnant || nutritionState?.selections?.pregnant || 'NO',
        lactating: sessionData?.selections?.lactating || savedPrefs?.lactating || nutritionState?.selections?.lactating || 'NO',
        trimester: sessionData?.selections?.trimester || savedPrefs?.trimester || nutritionState?.selections?.trimester || null,
        ageYears: sessionData?.selections?.ageYears || savedPrefs?.ageYears || nutritionState?.selections?.ageYears || null,
        heightIn: sessionData?.selections?.heightIn || savedPrefs?.heightIn || nutritionState?.selections?.heightIn || null,
        weightLbs: sessionData?.selections?.weightLbs || savedPrefs?.weightLbs || nutritionState?.selections?.weightLbs || null,
        goalWeightLbs: sessionData?.selections?.goalWeightLbs || savedPrefs?.goalWeightLbs || nutritionState?.selections?.goalWeightLbs || null,
        intensity: sessionData?.selections?.intensity || savedPrefs?.intensity || nutritionState?.selections?.intensity || null,
        lossRateLbsPerWeek: getCurrentLossRate(),
        ...overrides
    });
    const projectCaloriesAndMacros = (formState) => {
        try {
            const normalized = normalizeInputs(formState, { strictMode: false, throwOnError: false });
            const nErrors = Array.isArray(normalized?.errors) ? normalized.errors : [];
            if (nErrors.length) return { errors: nErrors };
            const c = calcCalories(normalized);
            const m = calcMacros(normalized, { target: c.target });
            const caloriesTarget = Number.isFinite(m?.calories_target) ? Number(m.calories_target) : Number(c?.target || 0);
            return {
                errors: [],
                calories: { target: caloriesTarget },
                macros: {
                    protein_g: Number(m?.protein_g || 0),
                    carb_g: Number(m?.carb_g || 0),
                    fat_g: Number(m?.fat_g || 0)
                }
            };
        } catch (err) {
            return { errors: ['PROJECTION_FAILED'], detail: String(err?.message || err || 'unknown') };
        }
    };
    const applyProjectedState = ({ nextMacros, nextOverrides }) => {
        profileMacros = { ...nextMacros };
        applyTopbarMacros(profileMacros);

        if (sessionData && typeof sessionData === 'object') {
            sessionData.macros = { ...profileMacros };
            sessionData.proteinTarget = profileMacros.proteinG;
            sessionData.selections = { ...(sessionData.selections || {}), ...(nextOverrides || {}) };
            try { sessionStorage.setItem('grocerySession', JSON.stringify(sessionData)); } catch {}
        }

        const currentPrefs = (() => {
            try { return JSON.parse(sessionStorage.getItem('groceryPrefs') || 'null') || {}; } catch { return {}; }
        })();
        Object.assign(currentPrefs, nextOverrides || {});
        currentPrefs.macros = { ...profileMacros };
        try {
            sessionStorage.setItem('groceryPrefs', JSON.stringify(currentPrefs));
            savedPrefs = currentPrefs;
        } catch {}

        if (nutritionState?.selections && typeof nutritionState.selections === 'object') {
            Object.assign(nutritionState.selections, nextOverrides || {});
        }
    };
    const applyTopbarMacros = (macrosBlock) => {
        const calEl = document.getElementById('g-final-cal');
        const proEl = document.getElementById('g-final-pro');
        const carEl = document.getElementById('g-final-car');
        const fatEl = document.getElementById('g-final-fat');
        if (!macrosBlock || !calEl || !proEl || !carEl || !fatEl) return;
        calEl.textContent = `${Number(macrosBlock.calories || 0).toLocaleString()} kcal`;
        proEl.textContent = `${Number(macrosBlock.proteinG || 0)} g`;
        carEl.textContent = `${Number(macrosBlock.carbG || 0)} g`;
        fatEl.textContent = `${Number(macrosBlock.fatG || 0)} g`;
    };
    const configureDynamicBudgetOptions = ({ preferSavedTiers = false } = {}) => {
        if (!budgetButtons.length || !budgetInput) return;

        const cals = Number(profileMacros?.calories) || 2200;
        const protein = Number(profileMacros?.proteinG) || 160;
        const fat = Number(profileMacros?.fatG) || 65;

        // Lightweight estimate anchored to macro demand + user pricing prefs.
        const estimatedBestMonthly = estimateMonthlyFromMacros({ calories: cals, proteinG: protein, fatG: fat });
        const computedTiers = buildTierOptionsFromBestCost(estimatedBestMonthly);
        const savedTierOptions = preferSavedTiers ? getSavedTierOptions() : null;
        const tiers = Array.isArray(savedTierOptions) && savedTierOptions.length === 3 ? savedTierOptions : computedTiers;
        const bestTier = tiers.find((t) => t.key === 'best');
        const optimalMonthly = Number(bestTier?.value || estimatedBestMonthly);
        const tooltipByKey = {
            budget: 'Calories protected. Minimum protein protected. Lower variety and tighter flexibility. Results are still achievable with consistency.',
            balanced: 'Calories protected. Protein slightly below optimal. Moderate variety. Designed for steady, sustainable progress.',
            best: 'Highest protein target support. Best food variety. Strong recovery support. Supports stronger training consistency.'
        };

        const goalRaw = sessionData?.selections?.goal || savedPrefs?.mode || nutritionState?.selections?.goal || null;
        const normalizedGoal = normalizeGoalInput(goalRaw);
        const freqRaw = sessionData?.selections?.frequency || savedPrefs?.frequency || nutritionState?.selections?.frequency || null;
        const intensityRaw = sessionData?.selections?.intensity || savedPrefs?.intensity || nutritionState?.selections?.intensity || null;
        const currentRate = getCurrentLossRate();
        const goalWeight = Number(
            nutritionState?.selections?.goalWeightLbs
            || sessionData?.selections?.goalWeightLbs
            || savedPrefs?.goalWeightLbs
            || 0
        );
        const goalPhrase = formatGoalLabel(goalRaw);
        const frequencyPhrase = formatFrequencyLabel(freqRaw);
        const intensityPhrase = formatIntensityLabel(intensityRaw);
        const goalWeightText = goalWeight > 0 ? ` Goal weight: ${Math.round(goalWeight)} lb.` : '';
        const sexRaw = String(
            sessionData?.selections?.sex
            || savedPrefs?.sex
            || nutritionState?.selections?.sex
            || ''
        ).trim().toUpperCase();
        const currentWeight = Number(
            nutritionState?.selections?.currentWeightLbs
            || sessionData?.selections?.currentWeightLbs
            || savedPrefs?.currentWeightLbs
            || nutritionState?.selections?.weightLbs
            || sessionData?.selections?.weightLbs
            || savedPrefs?.weightLbs
            || 0
        );
        const goalWeightResolved = resolveGoalWeightForBudgetMath({ goalWeightLbs: goalWeight, currentWeightLbs: currentWeight });
        const goalWeightUsed = goalWeightResolved.value;
        const fatSexMin = sexRaw === 'FEMALE' ? 40 : 50;
        const fatFloor = Math.max(Math.round((0.22 * cals) / 9), fatSexMin);
        const proteinFloor = Math.round(0.75 * goalWeightUsed);
        const balancedProtein = Math.max(proteinFloor, Math.round(protein * 0.92));
        const balancedFat = Math.max(Math.round(fat), fatFloor);
        const minimumProtein = Math.max(0, proteinFloor);
        const minimumFat = Math.max(Math.round(fatFloor), 0);
        const fatFromCalories = Math.round((0.22 * cals) / 9);
        const bestCarbs = calcCarbRemainder(cals, protein, fat);
        const balancedCarbs = calcCarbRemainder(cals, balancedProtein, balancedFat);
        const minimumCarbs = calcCarbRemainder(cals, minimumProtein, minimumFat);
        const goalWeightExplain = goalWeightResolved.source === 'goal'
            ? `${Math.round(goalWeightUsed)} lb`
            : `${Math.round(goalWeightUsed)} lb (${goalWeightResolved.source} weight fallback)`;

        budgetTierExplainers = {
            best: {
                title: 'Best Performance',
                lines: [
                    `**Calories target:** [[${Math.round(cals)} kcal/day]] (kept fixed for this tier).`,
                    `**Macros:** Protein [[${Math.round(protein)}g]] Â· Fat [[${Math.round(fat)}g]] Â· Carbs [[${Math.round(bestCarbs)}g]].`,
                    `**Cost equation used:** daily estimate = [[2.4 + (calories x 0.0022) + (protein x 0.014) + (fat x 0.01)]].`,
                    `**Projected monthly groceries:** [[${formatMoney(optimalMonthly)}]].`,
                    `**What this usually feels like:** best recovery, strongest training consistency, best performance.`
                ]
            },
            balanced: {
                title: 'Balanced Results',
                lines: [
                    `**Calories target:** [[${Math.round(cals)} kcal/day]] (same as full target).`,
                    `**Protein rule:** keep at least [[${Math.round(proteinFloor)}g]] (0.75 x ${goalWeightExplain}), then use about [[92% of Best protein]] when that is higher.`,
                    `**Balanced macros:** Protein [[${Math.round(balancedProtein)}g]] Â· Fat [[${Math.round(balancedFat)}g]] Â· Carbs [[${Math.round(balancedCarbs)}g]].`,
                    `**Fat rule:** keep enough fat for recovery. We use the higher of [[${fatFromCalories}g from calories]] or [[${fatSexMin}g sex baseline]] = [[${Math.round(fatFloor)}g]].`,
                    `**What this may feel like:** solid progress, slightly less recovery margin than Best.`,
                    `**If you feel flat for 3-4 days:** move to Best Performance or add [[25-40g carbs]].`
                ]
            },
            budget: {
                title: 'Minimum Effective Plan',
                lines: [
                    `**Calories target:** [[${Math.round(cals)} kcal/day]] (kept fixed).`,
                    `**Protein rule:** use minimum protein = [[${Math.round(proteinFloor)}g]] (0.75 x ${goalWeightExplain}).`,
                    `**Minimum Effective macros:** Protein [[${Math.round(minimumProtein)}g]] Â· Fat [[${Math.round(minimumFat)}g]] Â· Carbs [[${Math.round(minimumCarbs)}g]].`,
                    `**Fat rule:** keep enough fat for recovery. We use the higher of [[${fatFromCalories}g from calories]] or [[${fatSexMin}g sex baseline]] = [[${Math.round(fatFloor)}g]].`,
                    `**What this may feel like:** simpler meals and lower cost, but more hunger and lower training comfort.`,
                    `**If hunger, mood, or recovery drops hard:** move up to Balanced or add [[1 protein serving + 1 carb serving]].`
                ]
            }
        };

        if (budgetForecastMainEl) {
            budgetForecastMainEl.textContent = `Based on your ${goalPhrase}, ${frequencyPhrase}, and ${intensityPhrase}, your full-target groceries project to about ${formatMoney(optimalMonthly)}/month.${goalWeightText}`;
        }
        if (budgetForecastSubEl) budgetForecastSubEl.textContent = 'Make the cost cheaper:';
        if (budgetForecastSaveEl) {
            budgetForecastSaveEl.textContent = '';
        }
        if (budgetForecastActionsEl) {
            const actions = [];
            const freqNow = String(freqRaw || '').trim();
            const canLowerFreq = freqNow !== '1-2';
            actions.push({
                key: 'lower-frequency',
                label: formatFreqDownLabel(freqNow),
                disabled: !canLowerFreq
            });
            if (normalizedGoal === 'CUT') {
                const nextRate = currentRate < 1.5 ? 1.5 : (currentRate < 2 ? 2 : 2);
                const canIncreaseCutSpeed = currentRate < 2;
                actions.push({
                    key: 'faster-cut',
                    label: currentRate >= 2 ? 'Cut speed already maxed (2.0 lb/week)' : `Increase cut speed (${Number(currentRate).toFixed(1)} -> ${Number(nextRate).toFixed(1)} lb/week)`,
                    disabled: !canIncreaseCutSpeed
                });
                actions.push({
                    key: 'apply-both',
                    label: 'Apply both',
                    disabled: !(canLowerFreq || canIncreaseCutSpeed)
                });
            } else if (normalizedGoal === 'BUILD') {
                actions.push({
                    key: 'slower-bulk',
                    label: 'Bulk slower (smaller surplus)',
                    disabled: false
                });
                actions.push({
                    key: 'apply-both',
                    label: 'Apply both',
                    disabled: !canLowerFreq
                });
            }
            budgetForecastActionsEl.innerHTML = actions
                .map((a) => `<button type="button" class="budget-forecast-action-btn" data-budget-action="${escapeHtml(a.key)}" ${a.disabled ? 'disabled' : ''}>${escapeHtml(a.label)}</button>`)
                .join('');
        }

        budgetButtons.forEach((btn, idx) => {
            const tier = tiers[idx];
            if (!tier) return;
            btn.dataset.budget = String(tier.value);
            btn.dataset.budgetTier = tier.key;
            btn.dataset.budgetLow = String(tier.low);
            btn.dataset.budgetHigh = String(tier.high);
            btn.dataset.budgetTitle = tier.title;
            btn.title = tooltipByKey[tier.key] || '';
            btn.innerHTML = `<span class="budget-btn-title">${tier.title}</span><span class="budget-btn-sub">${formatBudgetRange(tier.low, tier.high)}</span><span class="budget-btn-help" aria-hidden="true"></span>`;
        });

        const savedMode = normalizeBudgetTierKey(savedPrefs?.budgetMode || '');
        if (preferSavedTiers && savedMode) {
            budgetButtons.forEach((btn) => btn.classList.toggle('active', String(btn.dataset.budgetTier || '') === savedMode));
        }
        const activeBtn = budgetButtons.find((btn) => btn.classList.contains('active')) || budgetButtons[1] || budgetButtons[0];
        if (activeBtn) budgetInput.value = activeBtn.dataset.budget || String(roundTo10(optimalMonthly));
    };
    configureDynamicBudgetOptions({ preferSavedTiers: true });

    const finalBudgetModeRank = (modeKeyRaw) => {
        const modeKey = normalizeBudgetTierKey(modeKeyRaw);
        if (modeKey === 'budget') return 0;
        if (modeKey === 'balanced') return 1;
        return 2; // best
    };
    const finalBudgetModeTitle = (modeKeyRaw) => {
        const modeKey = normalizeBudgetTierKey(modeKeyRaw);
        const fromExplainer = budgetTierExplainers?.[modeKey]?.title;
        if (fromExplainer) return fromExplainer;
        if (modeKey === 'budget') return 'Minimum Effective Plan';
        if (modeKey === 'balanced') return 'Balanced Results';
        return 'Best Performance';
    };
    const buildFinalBudgetDowngradeMessage = (fromModeRaw, toModeRaw) => {
        const fromMode = normalizeBudgetTierKey(fromModeRaw);
        const toMode = normalizeBudgetTierKey(toModeRaw);
        const fromTitle = finalBudgetModeTitle(fromMode);
        const toTitle = finalBudgetModeTitle(toMode);
        const payload = budgetTierExplainers?.[toMode] || null;
        const goalRaw = String(
            sessionData?.selections?.goal
            || savedPrefs?.mode
            || nutritionState?.selections?.goal
            || ''
        ).trim();
        const goalMode = normalizeGoalInput(goalRaw);
        const pairKey = `${fromMode}->${toMode}`;
        const isCutGoal = goalMode === 'CUT';
        const downsideBullets = (() => {
            if (isCutGoal) {
                if (pairKey === 'best->balanced') {
                    return [
                        'Scale loss usually still happens, but training performance can feel [[~5-8% flatter]].',
                        'Recovery quality may feel lower on hard sessions vs Best.',
                        'If strength drops across 2 workouts in a row, move back to Best.'
                    ];
                }
                if (pairKey === 'balanced->budget') {
                    return [
                        'Hunger and cravings usually increase compared with Balanced.',
                        'Recovery margin and training comfort usually drop more than Balanced.',
                        'If mood, sleep, or performance drop for 3-4 days, move back to Balanced.'
                    ];
                }
                return [
                    'This is the largest downgrade for a cut: gym output can feel [[~8-15% flatter]] than Best.',
                    'Muscle-retention margin is lower than higher tiers.',
                    'If recovery or performance slides for 3-4 days, move up one tier.'
                ];
            }
            if (pairKey === 'best->balanced') {
                return [
                    'Size/strength progress can still happen, but usually [[~5-10% slower]] than Best.',
                    'Top-end workout performance may stall sooner.',
                    'If progress stalls for 1-2 weeks, move back to Best.'
                ];
            }
            if (pairKey === 'balanced->budget') {
                return [
                    'Gain pace usually slows further compared with Balanced.',
                    'Recovery quality is usually lower on repeated hard sessions.',
                    'If lifts stall for 2 weeks, move back to Balanced.'
                ];
            }
            return [
                'This is the largest downgrade: size/strength progress can be [[~10-20% slower]] vs Best.',
                'Recovery buffer is lower for heavy training weeks.',
                'If progress stalls for 2 weeks, move up one tier.'
            ];
        })();

        const lines = [
            `Switch from ${fromTitle} to ${toTitle}.`,
            '**Official calculations for the new plan**'
        ];
        if (payload && Array.isArray(payload.lines) && payload.lines.length) {
            lines.push(...payload.lines);
        } else {
            lines.push('The new plan keeps calorie targets protected and adjusts macro precision for lower cost.');
        }
        lines.push('---');
        lines.push('**Potential downsides if you apply this downgrade**');
        lines.push(...downsideBullets.map((line) => `- ${line}`));
        return lines.join('\n');
    };
    const confirmFinalBudgetDowngradeIfNeeded = async (fromModeRaw, toModeRaw) => {
        const fromMode = normalizeBudgetTierKey(fromModeRaw);
        const toMode = normalizeBudgetTierKey(toModeRaw);
        if (!fromMode || !toMode || fromMode === toMode) return true;
        if (finalBudgetModeRank(toMode) >= finalBudgetModeRank(fromMode)) return true;

        const msg = buildFinalBudgetDowngradeMessage(fromMode, toMode);
        const nextTitle = finalBudgetModeTitle(toMode);
        if (typeof odeConfirm === 'function') {
            try {
                return await odeConfirm({
                    title: `Switch to ${nextTitle}?`,
                    message: msg,
                    confirmText: 'Apply downgrade',
                    cancelText: 'Keep current plan',
                    size: 'wide'
                });
            } catch {
                return false;
            }
        }
        return window.confirm(msg);
    };

    if (budgetForecastActionsEl) {
        budgetForecastActionsEl.addEventListener('click', async (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('[data-budget-action]') : null;
            if (!btn || btn.disabled) return;
            e.preventDefault();

            const action = String(btn.getAttribute('data-budget-action') || '').trim();
            const currentState = buildCurrentFormState();
            const currentMonthly = estimateMonthlyFromMacros(profileMacros);
            const currentFreq = String(currentState.frequency || '').trim();
            const currentRate = Number(currentState.lossRateLbsPerWeek || 1.5);

            let nextOverrides = null;
            let actionTitle = '';
            if (action === 'lower-frequency') {
                const nextFreq = currentFreq === '5-6' ? '3-4' : (currentFreq === '3-4' ? '1-2' : '');
                if (!nextFreq) {
                    alert('Workouts per week is already at the lowest option.');
                    return;
                }
                nextOverrides = { frequency: nextFreq };
                actionTitle = 'Train fewer days';
            } else if (action === 'faster-cut') {
                const goalNorm = normalizeGoalInput(currentState.goal);
                if (goalNorm !== 'CUT') return;
                const nextRate = currentRate < 1.5 ? 1.5 : (currentRate < 2 ? 2 : 2);
                if (nextRate <= currentRate) {
                    alert('Cut speed is already at the max allowed (2.0 lb/week).');
                    return;
                }
                nextOverrides = { lossRateLbsPerWeek: nextRate };
                actionTitle = 'Increase cut speed';
            } else if (action === 'slower-bulk') {
                const goalNorm = normalizeGoalInput(currentState.goal);
                if (goalNorm !== 'BUILD') return;
                // Use strength-priority phase as the slower-surplus step (+4% vs +8%).
                nextOverrides = { goal: 'STRENGTH' };
                actionTitle = 'Bulk slower';
            } else if (action === 'apply-both') {
                const goalNorm = normalizeGoalInput(currentState.goal);
                const batchOverrides = {};
                const nextFreq = currentFreq === '5-6' ? '3-4' : (currentFreq === '3-4' ? '1-2' : '');
                if (nextFreq) batchOverrides.frequency = nextFreq;
                if (goalNorm === 'CUT') {
                    const nextRate = currentRate < 1.5 ? 1.5 : (currentRate < 2 ? 2 : 2);
                    if (nextRate > currentRate) batchOverrides.lossRateLbsPerWeek = nextRate;
                    actionTitle = 'Apply both (cut cost levers)';
                } else if (goalNorm === 'BUILD') {
                    batchOverrides.goal = 'STRENGTH';
                    actionTitle = 'Apply both (bulk cost levers)';
                } else {
                    return;
                }
                if (!Object.keys(batchOverrides).length) {
                    alert('No further cost reductions are available for this plan.');
                    return;
                }
                nextOverrides = batchOverrides;
            } else {
                return;
            }

            const projectedState = buildCurrentFormState(nextOverrides);
            const next = projectCaloriesAndMacros(projectedState);
            if (!next || !next.calories || !next.macros || (Array.isArray(next.errors) && next.errors.length)) {
                alert('Could not project this change yet. Please use redo calculation for now.');
                return;
            }

            const nextMacros = {
                calories: Number(next.calories.target || 0),
                proteinG: Number(next.macros.protein_g || 0),
                carbG: Number(next.macros.carb_g || 0),
                fatG: Number(next.macros.fat_g || 0)
            };
            const nextMonthly = estimateMonthlyFromMacros(nextMacros);
            const deltaMonthly = nextMonthly - currentMonthly;
            const deltaCal = Number(nextMacros.calories || 0) - Number(profileMacros?.calories || 0);
            const projectedStateGoal = normalizeGoalInput(projectedState.goal || currentState.goal);
            const projectedFreq = String(projectedState.frequency || currentFreq || '').trim();
            const currentFreqText = formatFrequencyLabel(currentFreq);
            const projectedFreqText = formatFrequencyLabel(projectedFreq);
            const currentRateText = `${Number(currentRate || 0).toFixed(1)} lb/week`;
            const projectedRateText = `${Number(projectedState.lossRateLbsPerWeek || currentRate || 0).toFixed(1)} lb/week`;
            const monthlyDeltaLabel = `${deltaMonthly >= 0 ? '+' : '-'}${formatMoney(Math.abs(deltaMonthly))}`;
            const summaryLines = [
                '**What changes if you apply this**',
                `- Training days/week: [[${currentFreqText} -> ${projectedFreqText}]]`
            ];
            if (projectedStateGoal === 'CUT') {
                summaryLines.push(`- Fat-loss pace: [[${currentRateText} -> ${projectedRateText}]]`);
            } else if (projectedStateGoal === 'BUILD' || projectedStateGoal === 'STRENGTH') {
                const beforeMode = normalizeGoalInput(currentState.goal) === 'STRENGTH' ? 'Strength-priority' : 'Build';
                const afterMode = projectedStateGoal === 'STRENGTH' ? 'Strength-priority' : 'Build';
                summaryLines.push(`- Gain mode: [[${beforeMode} -> ${afterMode}]]`);
            }
            summaryLines.push(`- Calories target: [[${Math.round(Number(profileMacros?.calories || 0)).toLocaleString()} -> ${Math.round(Number(nextMacros.calories || 0)).toLocaleString()} kcal/day]] (${deltaCal >= 0 ? '+' : ''}${Math.round(deltaCal)} kcal)`);
            summaryLines.push(`- Monthly groceries: [[${formatMoney(currentMonthly)} -> ${formatMoney(nextMonthly)}]] (${monthlyDeltaLabel})`);
            summaryLines.push('---');
            summaryLines.push('**Pros**');
            if (action === 'lower-frequency') {
                summaryLines.push('- [[Lower monthly cost pressure]] from reduced energy demand.');
                summaryLines.push('- [[More recovery time]] between sessions.');
                summaryLines.push('- Easier to stay consistent if schedule is tight.');
            } else if (action === 'faster-cut') {
                summaryLines.push('- [[Faster fat-loss timeline]] toward goal weight.');
                summaryLines.push('- [[Lower grocery spend]] from lower calorie targets.');
                summaryLines.push('- Useful as a short budget-saving phase.');
            } else if (action === 'slower-bulk') {
                summaryLines.push('- [[Lower monthly cost]] from a smaller surplus.');
                summaryLines.push('- [[Lower unnecessary fat-gain risk]] while still building.');
                summaryLines.push('- Easier appetite control across the week.');
            } else if (action === 'apply-both') {
                if (projectedStateGoal === 'CUT') {
                    summaryLines.push('- [[Largest immediate cost drop]] for your cut.');
                    summaryLines.push('- Combines lower activity demand with faster fat-loss settings.');
                    summaryLines.push('- Can keep progress moving when budget is tight.');
                } else {
                    summaryLines.push('- [[Largest cost reduction]] available for your build phase.');
                    summaryLines.push('- Lower weekly food demand plus a smaller surplus.');
                    summaryLines.push('- Better control of monthly spend without restarting setup.');
                }
            }
            summaryLines.push('**Cons / Tradeoffs**');
            if (action === 'lower-frequency') {
                summaryLines.push('- [[Slower gym adaptation]] from reduced training volume.');
                summaryLines.push('- You may see slower improvements in conditioning or work capacity.');
            } else if (action === 'faster-cut') {
                summaryLines.push('- [[Higher hunger and cravings]] as the deficit increases.');
                summaryLines.push('- Training performance and recovery can feel flatter on hard days.');
            } else if (action === 'slower-bulk') {
                summaryLines.push('- [[Slower size and strength gain pace]].');
                summaryLines.push('- You may need a longer timeline to hit the same scale target.');
            } else if (action === 'apply-both') {
                if (projectedStateGoal === 'CUT') {
                    summaryLines.push('- [[Highest adherence pressure]] among cut cost options.');
                    summaryLines.push('- Recovery and gym output can drop if sleep/stress are not managed.');
                } else {
                    summaryLines.push('- [[Slowest gain pace]] among build options.');
                    summaryLines.push('- Lower weekly training frequency can reduce total growth stimulus.');
                }
            }

            let confirmed = false;
            if (typeof odeConfirm === 'function') {
                confirmed = await odeConfirm({
                    title: `${actionTitle} - Preview`,
                    message: summaryLines.join('\n'),
                    confirmText: 'Apply change',
                    cancelText: 'Keep current plan',
                    size: 'wide'
                });
            } else {
                confirmed = window.confirm(summaryLines.join('\n'));
            }
            if (!confirmed) return;

            applyProjectedState({ nextMacros, nextOverrides });
            configureDynamicBudgetOptions();
        });
    }

    if (budgetForecastWrapEl && budgetForecastToggleEl) {
        budgetForecastToggleEl.addEventListener('click', (e) => {
            e.preventDefault();
            const nextOpen = !budgetForecastWrapEl.classList.contains('is-open');
            budgetForecastWrapEl.classList.toggle('is-open', nextOpen);
            budgetForecastToggleEl.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        });
    }

    // Budget button handlers
    budgetButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const toMode = normalizeBudgetTierKey(btn.dataset.budgetTier || '');
            const currentActive = budgetButtons.find((b) => b.classList.contains('active'));
            const fromMode = normalizeBudgetTierKey(currentActive?.dataset?.budgetTier || savedPrefs?.budgetMode || '');
            const shouldProceed = await confirmFinalBudgetDowngradeIfNeeded(fromMode, toMode);
            if (!shouldProceed) return;
            budgetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (budgetInput) budgetInput.value = btn.dataset.budget;
        });
        const helpEl = btn.querySelector('.budget-btn-help');
        if (helpEl) {
            helpEl.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const key = String(btn.dataset.budgetTier || '').trim();
                const payload = budgetTierExplainers[key];
                if (!payload) return;
                const msg = payload.lines.join('\n');
                if (typeof odeConfirm === 'function') {
                    try {
                        await odeConfirm({
                            title: `${payload.title} - Why this option`,
                            message: msg,
                            confirmText: 'Close',
                            cancelText: 'Close'
                        });
                    } catch {
                        alert(msg);
                    }
                } else {
                    alert(msg);
                }
            });
        }
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
            configureDynamicBudgetOptions();
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

        ALL_FOODS.forEach((f) => {
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
                        <button class="food-source-trash" type="button" data-food-custom-del="${escapeHtml(row.id)}" aria-label="Delete">ÃƒÂ°Ã…Â¸â€”Ã¢â‚¬Ëœ</button>
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
                setFoodNote('Checking your accountÃ¢â‚¬Â¦');
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
    if (calEl && profileMacros) {
        calEl.textContent = `${Number(profileMacros.calories || 0).toLocaleString()} kcal`;
        proEl.textContent = `${Number(profileMacros.proteinG || 0)} g`;
        carEl.textContent = `${Number(profileMacros.carbG || 0)} g`;
        fatEl.textContent = `${Number(profileMacros.fatG || 0)} g`;
    }

    // Restore editable answers when user returns from grocery-plan via top-right close.
    if (savedPrefs && typeof savedPrefs === 'object') {
        if (storeInput && savedPrefs.store) storeInput.value = String(savedPrefs.store);
        if (budgetInput && Number.isFinite(Number(savedPrefs.budgetTotal))) budgetInput.value = String(savedPrefs.budgetTotal);
        if (mealsInput && Number.isFinite(Number(savedPrefs.mealsPerDay))) {
            mealsInput.value = String(savedPrefs.mealsPerDay);
            mealsInput.dataset.userSet = '1';
        }
        if (wakeInput && savedPrefs.wakeTime) wakeInput.value = String(savedPrefs.wakeTime);
        if (workoutInput && savedPrefs.workoutTime) workoutInput.value = String(savedPrefs.workoutTime);
        if (zipInput && savedPrefs.zipCode) zipInput.value = String(savedPrefs.zipCode);
        if (prepInput && savedPrefs.prep) prepInput.value = String(savedPrefs.prep);
        if (priceAdjustmentInput && Number.isFinite(Number(savedPrefs.priceAdjustment))) {
            priceAdjustmentInput.value = String(savedPrefs.priceAdjustment);
            syncPriceAdjustmentValueLabel();
        }

        const dietaryPrefInput = document.getElementById('g-dietary-pref');
        if (dietaryPrefInput && savedPrefs.dietaryPref) dietaryPrefInput.value = String(savedPrefs.dietaryPref);
        const tasteCostInput = document.getElementById('g-taste-cost');
        if (tasteCostInput && savedPrefs.tasteCost) tasteCostInput.value = String(savedPrefs.tasteCost);

        const savedAllergies = Array.isArray(savedPrefs.allergies)
            ? savedPrefs.allergies.map((a) => String(a || '').trim().toLowerCase()).filter(Boolean)
            : [];
        if (savedAllergies.length) {
            allergyChecks.forEach((input) => {
                const val = String(input.value || '').trim().toLowerCase();
                input.checked = savedAllergies.includes(val);
            });
            const noneInput = allergyChecks.find((input) => String(input.value || '').toLowerCase() === 'none');
            if (noneInput) noneInput.checked = savedAllergies.length === 0 || savedAllergies.includes('none');
        }
        if (typeof syncAllergyHidden === 'function') syncAllergyHidden();

        const syncChoiceButtonGroup = (selector, valueAttr, value) => {
            document.querySelectorAll(selector).forEach((btn) => {
                const isActive = String(btn.getAttribute(valueAttr) || '').toLowerCase() === String(value || '').toLowerCase();
                btn.classList.toggle('active', isActive);
            });
        };
        if (budgetButtons.length) {
            const savedMode = normalizeBudgetTierKey(savedPrefs.budgetMode);
            let selectedBtn = savedMode
                ? budgetButtons.find((btn) => String(btn.dataset.budgetTier || '') === savedMode)
                : null;
            if (!selectedBtn && Number.isFinite(Number(savedPrefs.budgetTotal))) {
                const target = Number(savedPrefs.budgetTotal);
                let nearest = budgetButtons[0];
                let nearestDist = Number.POSITIVE_INFINITY;
                budgetButtons.forEach((btn) => {
                    const val = Number(btn.dataset.budget || 0);
                    const dist = Math.abs(val - target);
                    if (dist < nearestDist) {
                        nearest = btn;
                        nearestDist = dist;
                    }
                });
                selectedBtn = nearest;
            }
            budgetButtons.forEach((btn) => btn.classList.remove('active'));
            if (selectedBtn) {
                selectedBtn.classList.add('active');
                budgetInput.value = selectedBtn.dataset.budget || String(savedPrefs.budgetTotal || '');
            }
        }
        syncChoiceButtonGroup('.meal-btn', 'data-meals', savedPrefs.mealsPerDay);
        syncChoiceButtonGroup('.prep-btn', 'data-prep', savedPrefs.prep);
        syncChoiceButtonGroup('.taste-cost-btn', 'data-preference', savedPrefs.tasteCost);
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
        const traceId = `integrate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const traceLog = (step, payload) => {
            try {
                if (payload === undefined) {
                    console.log(`[INTEGRATE_PLAN][${traceId}] ${step}`);
                } else {
                    console.log(`[INTEGRATE_PLAN][${traceId}] ${step}`, payload);
                }
            } catch {
                // ignore logging failures
            }
        };
        const traceError = (step, err, payload) => {
            try {
                console.error(`[INTEGRATE_PLAN][${traceId}] ${step}`, {
                    error: String(err?.message || err || 'unknown'),
                    ...(payload || {})
                });
            } catch {
                // ignore logging failures
            }
        };
        console.groupCollapsed(`[INTEGRATE_PLAN][${traceId}] Build grocery plan click`);
        traceLog('START');
        try {
        const existingStart = sessionStorage.getItem('groceryStartDate');
        const startDate = existingStart || new Date().toISOString();
        if (!existingStart) sessionStorage.setItem('groceryStartDate', startDate);
        traceLog('START_DATE_RESOLVED', { startDate, hadExistingStart: Boolean(existingStart) });
        
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
        traceLog('MACROS_LOADED', { macros });

        // If the user has training auto-adjust enabled (signed-in), apply it here so the grocery plan adapts.
        // We keep protein stable and shift calories mostly via carbs (Ãƒâ€šÃ‚Â±50g per Ãƒâ€šÃ‚Â±200 kcal).
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
        traceLog('TRAINING_OFFSET_APPLIED', { trainingCalorieOffset, macros });

        // Apply selected budget mode transform (stage 1): keep calories fixed,
        // raise protein floor to 0.75 x goal weight, keep fat floor protected,
        // and recompute carbs as remainder.
        const normalizeBudgetModeForPrefs = (raw) => {
            const v = String(raw || '').trim().toLowerCase();
            if (v === 'budget' || v === 'balanced' || v === 'best') return v;
            if (v === 'under-200') return 'budget';
            if (v === '200-400') return 'balanced';
            if (v === '400-plus') return 'best';
            return 'balanced';
        };
        const activeBudgetBtn = budgetButtons.find((b) => b.classList.contains('active')) || budgetButtons[1] || budgetButtons[0];
        const selectedBudgetMode = normalizeBudgetModeForPrefs(activeBudgetBtn?.dataset?.budgetTier || 'balanced');
        const macroBaselineBeforeBudgetMode = {
            calories: Math.max(1200, Math.round(Number(macros.calories) || 0)),
            proteinG: Math.max(0, Math.round(Number(macros.proteinG) || 0)),
            carbG: Math.max(0, Math.round(Number(macros.carbG) || 0)),
            fatG: Math.max(0, Math.round(Number(macros.fatG) || 0))
        };
        const budgetTierOptionsForPrefs = budgetButtons.map((btn, idx) => {
            const rawTier = String(btn?.dataset?.budgetTier || '').trim().toLowerCase();
            let key = '';
            if (rawTier === 'budget' || rawTier === 'under-200') key = 'budget';
            else if (rawTier === 'balanced' || rawTier === '200-400') key = 'balanced';
            else if (rawTier === 'best' || rawTier === '400-plus') key = 'best';
            else key = idx === 0 ? 'budget' : (idx === 1 ? 'balanced' : 'best');
            const title = String(
                btn?.dataset?.budgetTitle
                || btn?.querySelector?.('.budget-btn-title')?.textContent
                || btn?.textContent
                || ''
            ).trim();
            const sub = String(btn?.querySelector?.('.budget-btn-sub')?.textContent || '').trim();
            const value = Number(btn?.dataset?.budget || 0);
            const lowFromData = Number(btn?.dataset?.budgetLow);
            const highFromData = Number(btn?.dataset?.budgetHigh);
            const rangeMatch = sub.match(/\$?\s*([\d,]+)\s*[-â€“â€”]\s*\$?\s*([\d,]+)/);
            const lowParsed = rangeMatch ? Number(String(rangeMatch[1]).replace(/,/g, '')) : 0;
            const highParsed = rangeMatch ? Number(String(rangeMatch[2]).replace(/,/g, '')) : 0;
            const low = Number.isFinite(lowFromData) && lowFromData > 0 ? lowFromData : lowParsed;
            const high = Number.isFinite(highFromData) && highFromData > 0 ? highFromData : highParsed;
            return {
                key,
                title,
                low: Number.isFinite(low) ? low : 0,
                high: Number.isFinite(high) ? high : 0,
                value: Number.isFinite(value) ? value : 0
            };
        }).filter((opt) => Boolean(opt.key));
        const sexRawForBudget = String(
            nutritionState.selections?.sex
            || sessionData?.selections?.sex
            || ''
        ).trim().toUpperCase();
        const currentWeightForBudget = Number(
            nutritionState.selections?.weightLbs
            || sessionData?.selections?.weightLbs
            || 0
        );
        const goalWeightForBudget = Number(
            nutritionState.selections?.goalWeightLbs
            || sessionData?.selections?.goalWeightLbs
            || 0
        );
        const resolvedWeightForBudget = resolveGoalWeightForBudgetMath({
            goalWeightLbs: goalWeightForBudget,
            currentWeightLbs: currentWeightForBudget
        }).value;
        const proteinFloorBudgetMode = Math.round(0.75 * resolvedWeightForBudget);
        const fatSexMinBudgetMode = sexRawForBudget === 'FEMALE' ? 40 : 50;
        const caloriesFixed = Math.max(1200, Math.round(Number(macros.calories) || 0));
        const fatFloorBudgetMode = Math.max(Math.round((0.22 * caloriesFixed) / 9), fatSexMinBudgetMode);
        const bestProteinBase = Math.max(0, Math.round(Number(macros.proteinG) || 0));
        const bestFatBase = Math.max(0, Math.round(Number(macros.fatG) || 0));
        const balancedProteinBudgetMode = Math.max(proteinFloorBudgetMode, Math.round(bestProteinBase * 0.92));

        if (selectedBudgetMode === 'budget') {
            const nextProtein = Math.max(0, proteinFloorBudgetMode);
            const nextFat = Math.max(bestFatBase, fatFloorBudgetMode);
            macros.proteinG = nextProtein;
            macros.fatG = nextFat;
            macros.carbG = calcCarbRemainder(caloriesFixed, nextProtein, nextFat);
            macros.calories = caloriesFixed;
        } else if (selectedBudgetMode === 'balanced') {
            const nextProtein = Math.max(0, balancedProteinBudgetMode);
            const nextFat = Math.max(bestFatBase, fatFloorBudgetMode);
            macros.proteinG = nextProtein;
            macros.fatG = nextFat;
            macros.carbG = calcCarbRemainder(caloriesFixed, nextProtein, nextFat);
            macros.calories = caloriesFixed;
        } else {
            // Best mode: preserve base macros (calories unchanged).
            macros.calories = caloriesFixed;
            macros.proteinG = bestProteinBase;
            macros.fatG = bestFatBase;
            macros.carbG = calcCarbRemainder(caloriesFixed, bestProteinBase, bestFatBase);
        }
        traceLog('BUDGET_MODE_TRANSFORM_APPLIED', {
            selectedBudgetMode,
            proteinFloorBudgetMode,
            fatFloorBudgetMode,
            macros
        });

        const currentWeightForGoalResolve = Number(
            nutritionState.selections?.weightLbs
            || sessionData?.selections?.weightLbs
            || savedPrefs?.weightLbs
            || 0
        );
        const goalWeightForGoalResolve = Number(
            nutritionState.selections?.goalWeightLbs
            || sessionData?.selections?.goalWeightLbs
            || savedPrefs?.goalWeightLbs
            || 0
        );
        const inferredGoalFromWeights = (
            Number.isFinite(currentWeightForGoalResolve) &&
            Number.isFinite(goalWeightForGoalResolve) &&
            currentWeightForGoalResolve > 0 &&
            goalWeightForGoalResolve > 0
        )
            ? (goalWeightForGoalResolve < currentWeightForGoalResolve ? 'cut' : (goalWeightForGoalResolve > currentWeightForGoalResolve ? 'bulk' : 'maintain'))
            : '';

        const goalRaw = String(
            nutritionState.selections?.goal
            || sessionData?.selections?.goal
            || savedPrefs?.mode
            || inferredGoalFromWeights
            || ''
        ).trim().toLowerCase();
        const goalMode = goalRaw === 'cut'
            ? 'cut'
            : goalRaw === 'bulk'
                ? 'bulk'
                : goalRaw === 'strength'
                    ? 'strength'
                    : 'maintain';
        
        // Get bodyweight from nutritionState
        const weightLbs = Number(
            nutritionState.selections?.weightLbs
            || sessionData?.selections?.weightLbs
            || savedPrefs?.weightLbs
            || 170
        );
        
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
            goalWeightLbs: Number(
                nutritionState.selections?.goalWeightLbs
                || sessionData?.selections?.goalWeightLbs
                || savedPrefs?.goalWeightLbs
                || 0
            ) || null,
            mode: goalMode,
            goal: goalMode,
            sex: nutritionState.selections?.sex || sessionData?.selections?.sex || null,
            ageYears: Number(nutritionState.selections?.ageYears || sessionData?.selections?.ageYears) || null,
            pregnant: nutritionState.selections?.pregnant || sessionData?.selections?.pregnant || null,
            trimester: nutritionState.selections?.trimester || sessionData?.selections?.trimester || null,
            lactating: nutritionState.selections?.lactating || sessionData?.selections?.lactating || null,
            intensity: nutritionState.selections?.intensity || sessionData?.selections?.intensity || null,
            frequency: nutritionState.selections?.frequency || sessionData?.selections?.frequency || null,
            priceAdjustment: Number(priceAdjustmentInput?.value || 0), // Store price adjustment percentage
            // Store macros in prefs so they persist to grocery-plan.html
            macros: {
                calories: macros.calories,
                proteinG: macros.proteinG,
                carbG: macros.carbG,
                fatG: macros.fatG
            },
            budgetMode: selectedBudgetMode,
            budgetTierOptions: budgetTierOptionsForPrefs,
            macroBaseline: macroBaselineBeforeBudgetMode
        };
        traceLog('GOAL_MODE_RESOLVED', {
            goalRaw,
            goalMode,
            selectedBudgetMode
        });
        traceLog('PREFS_BUILT', {
            mode: prefs.mode,
            frequency: prefs.frequency,
            intensity: prefs.intensity,
            mealsPerDay: prefs.mealsPerDay,
            budgetTotal: prefs.budgetTotal,
            budgetMode: prefs.budgetMode,
            macros: prefs.macros
        });

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
        traceLog('BUDGET_VALIDATION_COMPUTED', {
            weeklyBudget,
            budgetTier,
            maxAchievableProtein,
            userProteinTarget
        });
        
        console.group('%cÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚Â° BUDGET VALIDATION', 'font-size: 14px; font-weight: bold; color: #f59e0b');
        console.log(`Weekly budget: $${weeklyBudget}`);
        console.log(`Budget tier: ${budgetTier.toUpperCase()}`);
        console.log(`Max achievable protein: ${maxAchievableProtein}g/day`);
        console.log(`User protein target: ${userProteinTarget}g/day`);
        console.log(`Protein multiplier for tier: ${BUDGET_TIERS[budgetTier].proteinMultiplier}g/lb`);
        console.groupEnd();
        
        // Check if user's protein target exceeds what's achievable with budget
        if (userProteinTarget > maxAchievableProtein) {
            console.warn(`ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â BUDGET MISMATCH: Protein target ${userProteinTarget}g exceeds max achievable ${maxAchievableProtein}g`);
            
            // Show budget warning modal and wait for user decision
            const decision = await showBudgetWarningModal(userProteinTarget, maxAchievableProtein, weeklyBudget, budgetTier);
            
            if (decision.action === 'lower-protein') {
                // Update macros with lowered protein
                macros.proteinG = decision.newProtein;
                prefs.macros.proteinG = decision.newProtein;
                console.log(`ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Protein target lowered to ${decision.newProtein}g`);
            } else if (decision.action === 'increase-budget') {
                // User wants to go back and increase budget - don't proceed
                console.log('User chose to increase budget - staying on form');
                return; // Exit without navigating
            } else if (decision.action === 'continue-survival') {
                // Force survival tier rules
                prefs.budgetTier = 'survival';
                console.log('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Continuing with survival tier rules');
            }
        }
        
        // Store budget tier in prefs
        prefs.budgetTier = prefs.budgetTier || budgetTier;
        sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs));
        traceLog('GROCERY_PREFS_SAVED', { budgetTier: prefs.budgetTier });
        
        const selectedDefaults = ALL_FOODS.filter((f) => isDefaultSelected(f.id));
        const selectedCustom = customFoodRows
            .filter((row) => isCustomSelected(row.id))
            .map((row) => row.food)
            .filter(Boolean);

        const baselineFoods = [...selectedDefaults, ...selectedCustom].length
            ? [...selectedDefaults, ...selectedCustom]
            : ALL_FOODS;
        traceLog('FOOD_POOL_RESOLVED', {
            selectedDefaults: selectedDefaults.length,
            selectedCustom: selectedCustom.length,
            baselineFoods: baselineFoods.length
        });

        const adjustedFoods = calculateAdjustedBaselineFoods(
            baselineFoods,
            macros,
            Math.max(2, Number(prefs.mealsPerDay) || 3),
            prefs.dietaryPref,
            prefs.allergies,
            prefs.mode || 'maintain',
            weightLbs
        );
        traceLog('ADJUSTED_BASELINE_FOODS_CALCULATED', {
            adjustedFoods: Array.isArray(adjustedFoods) ? adjustedFoods.length : 0
        });
        
        // Keep grocerySession so planner can read original goal/style context.
        sessionStorage.removeItem('groceryPurchaseOverrides');
        sessionStorage.removeItem('groceryExpiredOverrides');
        
        sessionStorage.setItem('adjustedBaselineFoods', JSON.stringify(adjustedFoods));
        traceLog('ADJUSTED_BASELINE_FOODS_SAVED', {
            adjustedFoods: Array.isArray(adjustedFoods) ? adjustedFoods.length : 0
        });
        sessionStorage.setItem('odeIntegrateLastTrace', JSON.stringify({
            traceId,
            at: new Date().toISOString(),
            status: 'success',
            summary: {
                budgetMode: selectedBudgetMode,
                budgetTier: prefs.budgetTier,
                mealsPerDay: prefs.mealsPerDay,
                adjustedFoods: Array.isArray(adjustedFoods) ? adjustedFoods.length : 0,
                macros: prefs.macros
            }
        }));
        traceLog('SUCCESS_REDIRECT', { to: 'grocery-plan.html' });
        
        window.location.href = 'grocery-plan.html';
        } catch (err) {
            traceError('FAILED_BEFORE_REDIRECT', err, {
                selections: nutritionState?.selections || null
            });
            try {
                sessionStorage.setItem('odeIntegrateLastTrace', JSON.stringify({
                    traceId,
                    at: new Date().toISOString(),
                    status: 'error',
                    error: String(err?.message || err || 'unknown')
                }));
            } catch {
                // ignore
            }
            alert(`Could not continue building plan.\n\nTrace: ${traceId}\nError: ${String(err?.message || err || 'unknown')}`);
        } finally {
            console.groupEnd();
        }
    });
}

async function setupGroceryPlanPage() {
    const planPage = document.getElementById('plan-page');
    if (!planPage) return;

    // Wire CTA / close button even if we early-return (e.g. hydrating saved list).
    wireSignedOutPlanCta();

    const setupMicronutrientNotesPopup = () => {
        const rows = Array.from(document.querySelectorAll('.plan-micro-row'));
        if (!rows.length) return;

        const NOTES = {
            fiber: {
                title: 'Fiber (g/day)',
                points: [
                    ['Too low', 'Constipation, worse fullness, cravings spike, harder cut adherence, worse blood sugar control.'],
                    ['Too high', 'Bloating, gas, cramps; extreme intake can reduce mineral absorption.'],
                    ['Higher dose positives', 'Better appetite control, better digestion, more stable energy (especially on a cut).'],
                    ['Bodybuilder vs regular', 'Bodybuilders cutting usually need more for hunger control (often 25-40g/day). Regular people often sit 10-20g/day without trying.']
                ]
            },
            potassium: {
                title: 'Potassium (mg/day)',
                points: [
                    ['Too low', 'Cramps, flat pumps, fatigue, headaches, weaker muscle contraction and hydration balance.'],
                    ['Too high', 'Usually only risky with kidney issues or high-dose supplements; can cause dangerous heart rhythm problems if extreme.'],
                    ['Higher dose positives', 'Better pumps, less cramping, better hydration balance - especially if sodium is higher.'],
                    ['Bodybuilder vs regular', 'Lifters sweating hard benefit from higher food potassium (often 3,000-4,700mg/day). Regular people can perform fine lower but most are still under.']
                ]
            },
            sodium: {
                title: 'Sodium (mg/day)',
                points: [
                    ['Too low', 'Dizziness, weak workouts, headaches, poor pumps - especially if you sweat a lot.'],
                    ['Too high', 'Bloating/water retention; may elevate blood pressure in sensitive people.'],
                    ['Higher dose positives', 'Better training performance and pumps when sweating heavily; better hydration retention.'],
                    ['Bodybuilder vs regular', 'Regular guidelines often push lower, but bodybuilders who sweat can need more consistency and sometimes higher intake. The big issue is huge day-to-day swings, not a single number.']
                ]
            },
            magnesium: {
                title: 'Magnesium (mg/day)',
                points: [
                    ['Too low', 'Cramps, poor sleep quality, worse recovery, irritability, constipation, low energy metabolism support.'],
                    ['Too high', 'Diarrhea (most common), low blood pressure if extreme.'],
                    ['Higher dose positives', 'Improved sleep/recovery and less cramping if you were low.'],
                    ['Bodybuilder vs regular', 'Training stress + sweat can increase needs slightly; many lifters run low. Adequate magnesium supports recovery baseline.']
                ]
            },
            calcium: {
                title: 'Calcium (mg/day)',
                points: [
                    ['Too low', 'Weaker bone density over time, muscle cramping, weaker contraction quality, higher injury risk long term.'],
                    ['Too high', 'Constipation; kidney stone risk in some people especially with high supplemental calcium.'],
                    ['Higher dose positives', 'Helps muscle contraction and bone strength if you were low (common when dairy is low).'],
                    ['Bodybuilder vs regular', 'Similar base needs, but bodybuilders cutting often reduce dairy and accidentally under-eat calcium.']
                ]
            },
            iron: {
                title: 'Iron (mg/day)',
                points: [
                    ['Too low', 'Fatigue, weak training output, poor recovery, low endurance (oxygen delivery drops).'],
                    ['Too high', 'Constipation/stomach pain; chronic high iron is harmful (oxidative stress, organ strain) - especially risky for men supplementing without labs.'],
                    ['Higher dose positives', 'Only beneficial if deficient; otherwise no performance advantage.'],
                    ['Bodybuilder vs regular', 'No bodybuilder iron dose. Track it to avoid deficiency, but do not megadose unless bloodwork says low.']
                ]
            },
            zinc: {
                title: 'Zinc (mg/day)',
                points: [
                    ['Too low', 'Weaker immune system, slower recovery, appetite issues, skin issues; severe deficiency can hurt hormones.'],
                    ['Too high', 'Nausea; long-term high intake can cause copper deficiency (anemia/nerve issues).'],
                    ['Higher dose positives', 'Helps recovery/immunity if you were low; otherwise diminishing returns.'],
                    ['Bodybuilder vs regular', 'Sweat and repetitive dieting can lower intake; keep it moderate - do not live on high-dose zinc.']
                ]
            },
            vitamin_d: {
                title: 'Vitamin D (IU or mcg/day)',
                points: [
                    ['Too low', 'Poorer recovery, low mood, weaker bone health, higher injury risk; many indoor lifters are low.'],
                    ['Too high', 'Toxicity risk if megadosed long term (calcium imbalance, kidney issues).'],
                    ['Higher dose positives', 'Strong upside if deficient - better health baseline and recovery support.'],
                    ['Bodybuilder vs regular', 'Bodybuilders are more often deficient (indoors, early mornings, limited sun) so consistent moderate intake matters.']
                ]
            },
            vitamin_c: {
                title: 'Vitamin C (mg/day)',
                points: [
                    ['Too low', 'Weaker collagen/tendon support, slower recovery, weaker immune function.'],
                    ['Too high', 'GI upset; mega doses may slightly blunt training adaptation in some cases (do not chase extremes).'],
                    ['Higher dose positives', 'Supports tendon health and immunity when intake is low; helps when cutting reduces fruit/veg variety.'],
                    ['Bodybuilder vs regular', 'Lifters benefit from consistent adequate intake, not huge doses.']
                ]
            },
            vitamin_a: {
                title: 'Vitamin A (mcg RAE/day)',
                points: [
                    ['Too low', 'Weaker immunity, poorer tissue repair, vision issues, slower recovery.'],
                    ['Too high', 'Real toxicity risk (especially from retinol supplements): headaches, liver strain, bone issues.'],
                    ['Higher dose positives', 'Only helps if you are low; otherwise higher is not better.'],
                    ['Bodybuilder vs regular', 'Do not chase high Vitamin A - track to avoid deficiency and avoid excess.']
                ]
            },
            folate: {
                title: 'Folate (mcg/day)',
                points: [
                    ['Too low', 'Fatigue, reduced red blood cell support, poorer recovery capacity.'],
                    ['Too high', 'Extremely high supplemental folate can mask B12 deficiency.'],
                    ['Higher dose positives', 'Helps if diet lacks greens/beans; supports recovery baseline.'],
                    ['Bodybuilder vs regular', 'Same core needs; cutting lowers variety so tracking prevents silent low.']
                ]
            },
            b12: {
                title: 'Vitamin B12 (mcg/day)',
                points: [
                    ['Too low', 'Fatigue, nerve issues, poor performance, low energy metabolism (especially if low animal foods).'],
                    ['Too high', 'Generally low toxicity; some people report acne-like issues at high supplemental doses.'],
                    ['Higher dose positives', 'Only helps if low; otherwise little benefit.'],
                    ['Bodybuilder vs regular', 'More important if the diet restricts animal foods or absorption is poor.']
                ]
            },
            omega_3: {
                title: 'Omega-3 (EPA + DHA, mg/day)',
                points: [
                    ['Too low', 'More inflammation/joint pain, worse recovery feel, dryness/achiness for some.'],
                    ['Too high', 'Very high supplemental intake can increase bleeding risk; GI upset.'],
                    ['Higher dose positives', 'Better joint comfort, recovery, and inflammation control; can help training consistency.'],
                    ['Bodybuilder vs regular', 'Bodybuilders often aim higher because joints take a beating and recovery matters more day-to-day.']
                ]
            },
            choline: {
                title: 'Choline (mg/day)',
                points: [
                    ['Too low', 'Poorer brain signaling/focus for some; liver fat metabolism can suffer over time.'],
                    ['Too high', 'Fishy body odor, excessive sweating, GI upset.'],
                    ['Higher dose positives', 'Better focus/neuromuscular signaling if intake was low; eggs make it easy.'],
                    ['Bodybuilder vs regular', 'Dieting low-fat/low-egg can drop choline - tracking helps prevent that.']
                ]
            }
        };

        const keyFromName = (raw) => {
            const txt = String(raw || '').toLowerCase().replace(/:/g, '').trim();
            if (txt.startsWith('fiber')) return 'fiber';
            if (txt.startsWith('potassium')) return 'potassium';
            if (txt.startsWith('sodium')) return 'sodium';
            if (txt.startsWith('magnesium')) return 'magnesium';
            if (txt.startsWith('calcium')) return 'calcium';
            if (txt.startsWith('iron')) return 'iron';
            if (txt.startsWith('zinc')) return 'zinc';
            if (txt.startsWith('vitamin d')) return 'vitamin_d';
            if (txt.startsWith('vitamin c')) return 'vitamin_c';
            if (txt.startsWith('vitamin a')) return 'vitamin_a';
            if (txt.startsWith('folate')) return 'folate';
            if (txt.includes('b12')) return 'b12';
            if (txt.startsWith('omega-3')) return 'omega_3';
            if (txt.startsWith('choline')) return 'choline';
            return '';
        };

        let modal = document.getElementById('micro-note-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'micro-note-modal';
            modal.className = 'micro-note-modal hidden';
            modal.innerHTML = `
                <div class="micro-note-backdrop" data-micro-note-close></div>
                <div class="micro-note-card" role="dialog" aria-modal="true" aria-labelledby="micro-note-title">
                    <button type="button" class="micro-note-close" data-micro-note-close aria-label="Close">&times;</button>
                    <h3 id="micro-note-title">Micronutrient Notes</h3>
                    <div class="micro-note-body" id="micro-note-body"></div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        const titleEl = modal.querySelector('#micro-note-title');
        const bodyEl = modal.querySelector('#micro-note-body');

        const closeModal = () => {
            modal.classList.add('hidden');
            document.body.classList.remove('micro-note-open');
        };
        const openModal = (note) => {
            if (!note || !titleEl || !bodyEl) return;
            titleEl.textContent = note.title || 'Micronutrient Notes';
            bodyEl.innerHTML = (note.points || []).map(([label, text]) => `
                <div class="micro-note-row">
                    <div class="micro-note-label">${escapeHtml(label)}:</div>
                    <div class="micro-note-text">${escapeHtml(text)}</div>
                </div>
            `).join('');
            modal.classList.remove('hidden');
            document.body.classList.add('micro-note-open');
        };

        modal.querySelectorAll('[data-micro-note-close]').forEach((el) => {
            el.addEventListener('click', closeModal);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
        });

        rows.forEach((row) => {
            if (row.querySelector('.micro-note-trigger')) return;
            const nameEl = row.querySelector('.plan-micro-name');
            const key = keyFromName(nameEl?.textContent || '');
            const note = key ? NOTES[key] : null;
            if (!note) return;
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'micro-note-trigger';
            trigger.setAttribute('aria-label', `Show notes for ${note.title}`);
            trigger.textContent = '!';
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openModal(note);
            });
            nameEl?.appendChild(trigger);
        });
    };
    setupMicronutrientNotesPopup();

    const setupMicronutrientsToggle = () => {
        const toggleBtn = document.getElementById('plan-micros-toggle');
        const content = document.getElementById('plan-micros-content');
        if (!toggleBtn || !content) return;
        if (toggleBtn.dataset.bound === '1') return;
        toggleBtn.dataset.bound = '1';
        const prefersReduced = (() => {
            try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
        })();
        const OPEN_MS = 430;
        const CLOSE_MS = 360;
        const OPEN_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
        const CLOSE_EASE = 'cubic-bezier(0.32, 0, 0.67, 0)';
        let activeTransitionEnd = null;

        const clearTransitionListener = () => {
            if (!activeTransitionEnd) return;
            content.removeEventListener('transitionend', activeTransitionEnd);
            activeTransitionEnd = null;
        };

        const unlockAnimationState = (expanded) => {
            content.dataset.animating = '0';
            content.style.transition = '';
            content.style.overflow = '';
            if (expanded) {
                content.style.height = 'auto';
                content.style.opacity = '1';
            } else {
                content.style.height = '0px';
                content.style.opacity = '0';
            }
        };

        const setCollapsedInstant = () => {
            content.classList.remove('hidden');
            content.classList.add('is-collapsed');
            content.style.height = '0px';
            content.style.opacity = '0';
            content.dataset.animating = '0';
            toggleBtn.setAttribute('aria-expanded', 'false');
        };

        const expandAnimated = () => {
            if (content.dataset.animating === '1') return;
            content.dataset.animating = '1';
            clearTransitionListener();
            toggleBtn.setAttribute('aria-expanded', 'true');
            content.classList.remove('hidden');
            if (prefersReduced) {
                content.classList.remove('is-collapsed');
                content.style.height = 'auto';
                content.style.opacity = '1';
                unlockAnimationState(true);
                return;
            }

            content.classList.remove('is-collapsed');
            content.style.overflow = 'hidden';
            content.style.height = '0px';
            content.style.opacity = '0';
            // Force layout before reading height.
            content.getBoundingClientRect();
            const targetHeight = content.scrollHeight;
            content.style.transition = `height ${OPEN_MS}ms ${OPEN_EASE}, opacity 260ms ease, margin-top 240ms ease, border-color 240ms ease`;
            activeTransitionEnd = (event) => {
                if (event.propertyName !== 'height') return;
                clearTransitionListener();
                unlockAnimationState(true);
            };
            content.addEventListener('transitionend', activeTransitionEnd);
            requestAnimationFrame(() => {
                content.style.height = `${targetHeight}px`;
                content.style.opacity = '1';
            });
        };

        const collapseAnimated = () => {
            if (content.dataset.animating === '1') return;
            content.dataset.animating = '1';
            clearTransitionListener();
            toggleBtn.setAttribute('aria-expanded', 'false');
            if (prefersReduced) {
                content.classList.add('is-collapsed');
                content.style.height = '0px';
                content.style.opacity = '0';
                unlockAnimationState(false);
                return;
            }

            const fromHeight = content.scrollHeight || content.getBoundingClientRect().height || 0;
            content.style.overflow = 'hidden';
            content.style.height = `${fromHeight}px`;
            content.style.opacity = '1';
            content.style.transition = `height ${CLOSE_MS}ms ${CLOSE_EASE}, opacity 210ms ease, margin-top 220ms ease, border-color 220ms ease`;
            content.getBoundingClientRect();
            content.classList.add('is-collapsed');
            activeTransitionEnd = (event) => {
                if (event.propertyName !== 'height') return;
                clearTransitionListener();
                unlockAnimationState(false);
            };
            content.addEventListener('transitionend', activeTransitionEnd);
            requestAnimationFrame(() => {
                content.style.height = '0px';
                content.style.opacity = '0';
            });
        };

        setCollapsedInstant();
        toggleBtn.addEventListener('click', () => {
            const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            if (expanded) collapseAnimated();
            else expandAnimated();
        });
    };
    setupMicronutrientsToggle();

    const setupMealMicroSummaryToggle = () => {
        const toggleBtn = document.getElementById('micro-summary-toggle');
        const content = document.getElementById('micro-summary-content');
        if (!toggleBtn || !content) return;
        if (toggleBtn.dataset.bound === '1') return;
        toggleBtn.dataset.bound = '1';
        const syncState = (expanded) => {
            toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            content.classList.toggle('hidden', !expanded);
        };
        syncState(false);
        toggleBtn.addEventListener('click', () => {
            const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            syncState(!expanded);
        });
    };
    setupMealMicroSummaryToggle();

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
            window.location.href = 'grocery-final.html';
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
        const tabGroceryButtons = Array.from(document.querySelectorAll('[data-mobile-tab="grocery"]'));
        const tabMealsButtons = Array.from(document.querySelectorAll('[data-mobile-tab="meals"]'));
        const mealPlan = document.getElementById('meal-plan');
        if (!drawer || !closeBtn || !backdrop) return;

        const mql = window.matchMedia('(max-width: 900px)');
        const isMobile = () => !!mql.matches;

        const setActiveTab = (tab) => {
            tabGroceryButtons.forEach((btn) => btn.classList.toggle('active', tab === 'grocery'));
            tabMealsButtons.forEach((btn) => btn.classList.toggle('active', tab === 'meals'));
        };

        const open = () => {
            if (!isMobile()) return;
            drawer.classList.add('is-open');
            backdrop.classList.remove('hidden');
            backdrop.setAttribute('aria-hidden', 'false');
            setActiveTab('grocery');
        };
        const close = () => {
            drawer.classList.remove('is-open');
            backdrop.classList.add('hidden');
            backdrop.setAttribute('aria-hidden', 'true');
            setActiveTab('meals');
        };

        // Default: show meals content first on mobile.
        if (isMobile()) close();
        else close();

        if (toggle) {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                if (!isMobile()) return;
                if (drawer.classList.contains('is-open')) close();
                else open();
            });
        }

        tabGroceryButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!isMobile()) return;
                open();
            });
        });

        tabMealsButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                close();
            });
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

    // Mobile-only: draggable layout-size control between grocery and meals cards.
    (() => {
        const control = document.getElementById('mobile-size-control');
        const slider = document.getElementById('mobile-size-slider');
        const status = document.getElementById('mobile-size-status');
        if (!control || !slider || !status) return;

        const mql = window.matchMedia('(max-width: 900px)');
        const STORAGE_KEY = 'ode_mobile_plan_size';

        const toMode = (value) => {
            if (value <= 20) return 'compact';
            if (value >= 80) return 'comfy';
            return 'balanced';
        };

        const apply = (rawValue, persist = false) => {
            const n = Math.max(0, Math.min(100, Number(rawValue) || 56));
            slider.value = String(n);

            const smoothScale = 0.9 + ((n / 100) * 0.18);
            planPage.style.setProperty('--mobile-ui-scale', smoothScale.toFixed(3));

            const mode = toMode(n);
            planPage.classList.toggle('mobile-density-compact', mode === 'compact');
            planPage.classList.toggle('mobile-density-comfy', mode === 'comfy');

            if (mode === 'compact') status.textContent = 'Image-first preview mode';
            else if (mode === 'comfy') status.textContent = 'Comfort mode';
            else status.textContent = 'Balanced view';

            if (persist) {
                try { localStorage.setItem(STORAGE_KEY, String(n)); } catch (_) {}
            }
        };

        const stored = (() => {
            try { return Number(localStorage.getItem(STORAGE_KEY)); } catch (_) { return NaN; }
        })();

        const initial = Number.isFinite(stored) ? stored : Number(slider.value || 56);
        apply(initial, false);

        slider.addEventListener('input', () => {
            if (!mql.matches) return;
            apply(slider.value, false);
        });

        slider.addEventListener('change', () => {
            if (!mql.matches) return;
            apply(slider.value, true);
        });

        mql.addEventListener('change', () => {
            if (!mql.matches) {
                planPage.classList.remove('mobile-density-compact', 'mobile-density-comfy');
                status.textContent = 'Balanced view';
                return;
            }
            apply(slider.value, false);
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
        let bodyHtml = `We aim for tight targets: <strong>Protein Ã‚Â±5%</strong> (most important for muscle), <strong>Calories Ã‚Â±10Ã¢â‚¬â€œ15%</strong>, and <strong>Carbs/Fat Ã‚Â±10%</strong>.`;

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
            note.textContent = 'Tip: After adding your own foods, click ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œUpdate macros manuallyÃƒÂ¢Ã¢â€šÂ¬Ã‚Â to rebuild your plan.';
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
    
    console.group('%cÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â½Ãƒâ€šÃ‚Â¯ GROCERY PLAN - Macro Targets', 'font-size: 12px; font-weight: bold; color: #22c55e');
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
    const mealBudgetInlineEl = document.getElementById('meal-budget-inline');
    const mealBudgetOptionEls = Array.from(document.querySelectorAll('.meal-budget-option'));
    const mealBudgetOptionsWrap = document.getElementById('meal-budget-options');
    const planBudgetForecastWrapEl = document.getElementById('plan-budget-forecast');
    const planBudgetForecastToggleEl = document.getElementById('plan-budget-forecast-toggle');
    const planBudgetForecastMainEl = document.getElementById('plan-budget-forecast-main');
    const planBudgetForecastActionsEl = document.getElementById('plan-budget-forecast-actions');
    let onPlanBudgetModeSwitch = null;
    let activeBudgetMacroBaselineRef = null;
    const normalizeBudgetModeKey = (raw) => {
        const v = String(raw || '').trim().toLowerCase();
        if (v === 'budget' || v === 'balanced' || v === 'best') return v;
        if (v === 'under-200') return 'budget';
        if (v === '200-400') return 'balanced';
        if (v === '400-plus') return 'best';
        return 'balanced';
    };
    const modeMidpointFactor = (modeKeyRaw) => {
        const modeKey = normalizeBudgetModeKey(modeKeyRaw);
        if (modeKey === 'budget') return 0.70;
        if (modeKey === 'balanced') return 0.85;
        return 1.0; // best
    };
    const roundTo10 = (n) => Math.round((Number(n) || 0) / 10) * 10;
    const clampNum = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
    const formatBudgetRange = (lo, hi) => `$${Math.round(lo)}-$${Math.round(hi)}`;
    const estimateMonthlyFromMacrosForPlan = (m) => {
        const mc = m || {};
        const cals = Number(mc.calories) || 2200;
        const protein = Number(mc.proteinG) || 160;
        const fat = Number(mc.fatG) || 65;
        const daily = 2.4 + (cals * 0.0022) + (protein * 0.014) + (fat * 0.01);
        const tastePref = String(prefs?.tasteCost || 'balance').trim().toLowerCase();
        const tasteMult = tastePref === 'cheapest' ? 0.94 : (tastePref === 'premium' ? 1.08 : 1.0);
        const priceAdjRaw = Number(prefs?.priceAdjustment ?? 0);
        const priceAdjMult = Number.isFinite(priceAdjRaw) ? (1 + (priceAdjRaw / 100)) : 1.0;
        const adjustedMonthly = daily * 30 * tasteMult * priceAdjMult;
        return clampNum(roundTo10(adjustedMonthly), 170, 650);
    };
    const normalizeTierOption = (opt) => {
        const key = normalizeBudgetModeKey(opt?.key);
        const low = Math.max(0, Number(opt?.low) || 0);
        const high = Math.max(low, Number(opt?.high) || 0);
        const value = Number.isFinite(Number(opt?.value))
            ? Number(opt.value)
            : roundTo10((low + high) / 2);
        return {
            key,
            title: String(opt?.title || (key === 'budget' ? 'Minimum Effective Plan' : (key === 'balanced' ? 'Balanced Results' : 'Best Performance'))),
            low,
            high,
            value
        };
    };
    const buildPlanTierOptionsFromBestCost = (bestCostRaw) => {
        const bestCost = clampNum(roundTo10(bestCostRaw), 120, 900);
        const budgetLow = Math.max(90, roundTo10(bestCost * 0.62));
        const budgetHigh = Math.max(budgetLow + 20, roundTo10(bestCost * 0.78));
        const balancedLow = Math.max(budgetHigh, roundTo10(bestCost * 0.78));
        const balancedHigh = Math.max(balancedLow + 20, roundTo10(bestCost * 0.92));
        const bestLow = Math.max(balancedHigh, roundTo10(bestCost * 0.92));
        const bestHigh = Math.max(bestLow + 20, roundTo10(bestCost * 1.08));
        return [
            { key: 'budget', title: 'Minimum Effective Plan', low: budgetLow, high: budgetHigh, value: roundTo10((budgetLow + budgetHigh) / 2) },
            { key: 'balanced', title: 'Balanced Results', low: balancedLow, high: balancedHigh, value: roundTo10((balancedLow + balancedHigh) / 2) },
            { key: 'best', title: 'Best Performance', low: bestLow, high: bestHigh, value: roundTo10(bestCost) }
        ];
    };
    const derivePlanBudgetTierOptions = () => {
        const fromPrefs = Array.isArray(prefs?.budgetTierOptions) ? prefs.budgetTierOptions : [];
        const normalizedPrefs = fromPrefs
            .map(normalizeTierOption)
            .filter((opt) => opt.low > 0 && opt.high >= opt.low);
        const hasAllKeys = ['budget', 'balanced', 'best'].every((key) => normalizedPrefs.some((opt) => opt.key === key));
        if (hasAllKeys) {
            return ['budget', 'balanced', 'best'].map((key) => normalizedPrefs.find((opt) => opt.key === key));
        }
        const baselineMacros = prefs?.macroBaseline || prefs?.macros || macros || {};
        const optimalMonthly = estimateMonthlyFromMacrosForPlan(baselineMacros);
        return buildPlanTierOptionsFromBestCost(optimalMonthly);
    };
    let planBudgetTierOptions = derivePlanBudgetTierOptions();
    let planBudgetTierByKey = new Map(planBudgetTierOptions.map((opt) => [opt.key, opt]));
    let latestPlanMonthlyTotalWithTax = null;
    const syncPlanBudgetTierMap = () => {
        planBudgetTierByKey = new Map(planBudgetTierOptions.map((opt) => [opt.key, opt]));
    };
    const parseCurrencyNumber = (rawText) => {
        const cleaned = String(rawText || '').replace(/[^0-9.-]/g, '');
        const value = Number(cleaned);
        return Number.isFinite(value) ? value : null;
    };
    const updatePlanBudgetStatusBadge = ({ budgetOverride = null, monthlyTotalOverride = null } = {}) => {
        const budgetAllocEl = document.getElementById('budget-allocated');
        const budgetTotalEl = document.getElementById('budget-total');
        const budgetStatusEl = document.getElementById('budget-status');
        const statusBadge = budgetStatusEl?.querySelector('.status-badge');
        if (!statusBadge) return;

        const budgetFromOverride = Number(budgetOverride);
        const budgetFromPrefs = Number(prefs?.budgetTotal || 0);
        const budgetFromDom = parseCurrencyNumber(budgetAllocEl?.textContent);
        const budgetValue = Number.isFinite(budgetFromOverride)
            ? budgetFromOverride
            : (Number.isFinite(budgetFromPrefs) && budgetFromPrefs > 0 ? budgetFromPrefs : (budgetFromDom || 0));

        const monthlyFromOverride = Number(monthlyTotalOverride);
        const monthlyFromCache = Number(latestPlanMonthlyTotalWithTax);
        const monthlyFromDom = parseCurrencyNumber(budgetTotalEl?.textContent);
        const monthlyValue = Number.isFinite(monthlyFromOverride)
            ? monthlyFromOverride
            : (Number.isFinite(monthlyFromCache) && monthlyFromCache > 0 ? monthlyFromCache : (monthlyFromDom || 0));

        if (budgetAllocEl && budgetValue > 0) {
            budgetAllocEl.textContent = formatCurrency(budgetValue);
        }

        if (!(budgetValue > 0)) {
            statusBadge.textContent = 'Select a budget to compare';
            budgetStatusEl.setAttribute('data-budget-status', 'unset');
            return;
        }
        if (!(monthlyValue > 0)) {
            statusBadge.textContent = 'Building estimate...';
            budgetStatusEl.setAttribute('data-budget-status', 'pending');
            return;
        }

        const delta = budgetValue - monthlyValue;
        if (Math.abs(delta) < 0.5) {
            statusBadge.textContent = 'On budget';
            budgetStatusEl.setAttribute('data-budget-status', 'on');
            return;
        }
        if (delta >= 0) {
            statusBadge.textContent = `Under budget by ${formatCurrency(delta)}`;
            budgetStatusEl.setAttribute('data-budget-status', 'under');
            return;
        }
        statusBadge.textContent = `Over budget by ${formatCurrency(Math.abs(delta))}`;
        budgetStatusEl.setAttribute('data-budget-status', 'over');
    };
    const applyPlanBudgetBanner = (modeKeyRaw) => {
        const modeKey = normalizeBudgetModeKey(modeKeyRaw);
        const selected = planBudgetTierByKey.get(modeKey) || planBudgetTierByKey.get('balanced') || planBudgetTierOptions[0] || null;
        if (mealBudgetOptionEls.length) {
            mealBudgetOptionEls.forEach((el, idx) => {
                const opt = planBudgetTierOptions[idx] || null;
                if (!opt) return;
                el.disabled = false;
                el.dataset.budgetTier = opt.key;
                el.innerHTML = `<span class="meal-budget-option-title">${escapeHtml(opt.title)}</span><span class="meal-budget-option-range">${escapeHtml(formatBudgetRange(opt.low, opt.high))}</span>`;
                el.classList.toggle('active', opt.key === modeKey);
            });
        }
        if (budgetEl) {
            budgetEl.textContent = selected ? formatCurrency(Number(selected.value || 0)) : 'â€”';
        }
        updatePlanBudgetStatusBadge({
            budgetOverride: selected ? Number(selected.value || 0) : null
        });
    };
    const rebasePlanBudgetTiersFromActual = (actualMonthlyWithTax, modeKeyRaw) => {
        const actual = Number(actualMonthlyWithTax);
        if (!Number.isFinite(actual) || actual <= 0) return;
        const modeKey = normalizeBudgetModeKey(modeKeyRaw || prefs?.budgetMode || 'balanced');
        const inferredBestCost = actual / modeMidpointFactor(modeKey);
        planBudgetTierOptions = buildPlanTierOptionsFromBestCost(inferredBestCost);
        syncPlanBudgetTierMap();
        prefs = prefs && typeof prefs === 'object' ? prefs : {};
        prefs.budgetTierOptions = planBudgetTierOptions;
        const selected = planBudgetTierByKey.get(modeKey) || null;
        if (selected) {
            prefs.budgetMode = modeKey;
            prefs.budgetTotal = Number(selected.value || 0);
        }
        try { sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs)); } catch {}
        applyPlanBudgetBanner(modeKey);
    };
    // Keep tier ranges stable while user switches budget modes.
    // If we already have saved tier options, do not auto-rebase from actual totals.
    const hasSavedPlanTierOptions = Array.isArray(prefs?.budgetTierOptions)
        && prefs.budgetTierOptions.length >= 3;
    let hasAutoRebasedPlanBudgetTiers = false;
    const maybeRebasePlanBudgetTiersFromActual = (actualMonthlyWithTax) => {
        if (hasSavedPlanTierOptions) return;
        if (hasAutoRebasedPlanBudgetTiers) return;
        rebasePlanBudgetTiersFromActual(actualMonthlyWithTax, 'best');
        hasAutoRebasedPlanBudgetTiers = true;
    };
    const persistPlanBudgetSelection = (modeKeyRaw) => {
        const modeKey = normalizeBudgetModeKey(modeKeyRaw);
        const selected = planBudgetTierByKey.get(modeKey) || planBudgetTierByKey.get('balanced') || null;
        prefs = prefs && typeof prefs === 'object' ? prefs : {};
        prefs.budgetMode = modeKey;
        if (selected) prefs.budgetTotal = Number(selected.value || 0);
        prefs.budgetTierOptions = planBudgetTierOptions;
        try { sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs)); } catch {}
        return selected;
    };
    const budgetModeRank = (modeKeyRaw) => {
        const modeKey = normalizeBudgetModeKey(modeKeyRaw);
        if (modeKey === 'budget') return 0;
        if (modeKey === 'balanced') return 1;
        return 2; // best
    };
    const budgetModeTitle = (modeKeyRaw) => {
        const modeKey = normalizeBudgetModeKey(modeKeyRaw);
        if (modeKey === 'budget') return 'Minimum Effective Plan';
        if (modeKey === 'balanced') return 'Balanced Results';
        return 'Best Performance';
    };
    const resolveGoalWeightForBudgetSwitchPreview = () => {
        const goalWeight = Number(
            prefs?.goalWeightLbs
            || nutritionState?.selections?.goalWeightLbs
            || sessionData?.selections?.goalWeightLbs
            || 0
        );
        if (Number.isFinite(goalWeight) && goalWeight > 0) return goalWeight;
        const currentWeight = Number(
            prefs?.weightLbs
            || nutritionState?.selections?.weightLbs
            || sessionData?.selections?.weightLbs
            || 0
        );
        return (Number.isFinite(currentWeight) && currentWeight > 0) ? currentWeight : 170;
    };
    const buildBudgetModePreviewMacros = (modeKeyRaw) => {
        const modeKey = normalizeBudgetModeKey(modeKeyRaw || prefs?.budgetMode || 'balanced');
        const calcCarbRemainder = (cal, pro, fat) => Math.max(0, Math.round((Number(cal || 0) - ((Number(pro || 0) * 4) + (Number(fat || 0) * 9))) / 4));
        const src = prefs?.macroBaseline || initialMacrosSnapshot || macros || {};
        const caloriesFixed = Math.max(1200, Math.round(Number(src?.calories) || Number(macros?.calories) || 2000));
        const bestProtein = Math.max(0, Math.round(Number(src?.proteinG) || Number(macros?.proteinG) || 150));
        const bestFat = Math.max(0, Math.round(Number(src?.fatG) || Number(macros?.fatG) || 65));
        const sexRaw = String(
            prefs?.sex
            || nutritionState?.selections?.sex
            || sessionData?.selections?.sex
            || ''
        ).trim().toUpperCase();
        const fatSexMin = sexRaw === 'FEMALE' ? 40 : 50;
        const fatFloor = Math.max(Math.round((0.22 * caloriesFixed) / 9), fatSexMin);
        const goalWeightUsed = resolveGoalWeightForBudgetSwitchPreview();
        const proteinFloor = Math.round(0.75 * goalWeightUsed);
        const balancedProtein = Math.max(proteinFloor, Math.round(bestProtein * 0.92));
        if (modeKey === 'budget') {
            const proteinG = Math.max(0, proteinFloor);
            const fatG = Math.max(bestFat, fatFloor);
            return { calories: caloriesFixed, proteinG, fatG, carbG: calcCarbRemainder(caloriesFixed, proteinG, fatG), fatFloor, fatSexMin, proteinFloor };
        }
        if (modeKey === 'balanced') {
            const proteinG = Math.max(0, balancedProtein);
            const fatG = Math.max(bestFat, fatFloor);
            return { calories: caloriesFixed, proteinG, fatG, carbG: calcCarbRemainder(caloriesFixed, proteinG, fatG), fatFloor, fatSexMin, proteinFloor };
        }
        const proteinG = Math.max(0, Math.round(bestProtein));
        const fatG = Math.max(0, Math.round(bestFat));
        return { calories: caloriesFixed, proteinG, fatG, carbG: calcCarbRemainder(caloriesFixed, proteinG, fatG), fatFloor, fatSexMin, proteinFloor };
    };
    const buildBudgetDowngradeMessage = (fromModeRaw, toModeRaw) => {
        const fromMode = normalizeBudgetModeKey(fromModeRaw);
        const toMode = normalizeBudgetModeKey(toModeRaw);
        const fromMacros = buildBudgetModePreviewMacros(fromMode);
        const toMacros = buildBudgetModePreviewMacros(toMode);
        const proteinDelta = Math.round((toMacros?.proteinG || 0) - (fromMacros?.proteinG || 0));
        const carbDelta = Math.round((toMacros?.carbG || 0) - (fromMacros?.carbG || 0));
        const fromTitle = budgetModeTitle(fromMode);
        const toTitle = budgetModeTitle(toMode);
        const lineProteinDelta = `${proteinDelta >= 0 ? '+' : ''}${proteinDelta}g`;
        const lineCarbDelta = `${carbDelta >= 0 ? '+' : ''}${carbDelta}g`;
        const goalRaw = String(
            prefs?.goal
            || prefs?.mode
            || nutritionState?.selections?.goal
            || sessionData?.selections?.goal
            || ''
        ).trim();
        const goalMode = normalizeGoal(goalRaw);
        const pairKey = `${fromMode}->${toMode}`;
        const isCutGoal = goalMode === 'CUT';
        const buildDownsideBullets = () => {
            if (isCutGoal) {
                if (pairKey === 'best->balanced') {
                    return [
                        'Scale weight loss is usually similar, but gym output can feel [[~5-8% flatter]].',
                        'You may lose 1-2 hard reps on late working sets compared with Best.',
                        'Physique trend: fat loss continues, but muscle fullness/\"hard\" look can be less consistent week to week.',
                        'If pumps and performance stay flat for 3-4 days, move back to Best.'
                    ];
                }
                if (pairKey === 'balanced->budget') {
                    return [
                        'Scale loss can still happen, but hunger and cravings usually increase.',
                        'Training comfort and recovery usually drop more than with Balanced.',
                        'Physique trend: fat loss can continue, but muscle-retention margin gets tighter and \"flat\" days increase.',
                        'If strength drops across 2 workouts in a row, move back to Balanced.'
                    ];
                }
                return [
                    'This is the largest cut in recovery support; gym output can feel [[~8-15% flatter]].',
                    'Strength maintenance risk is higher versus Best, especially on hard training days.',
                    'Physique trend: fat loss can continue, but fullness and strength retention are less reliable.',
                    'If recovery, mood, or performance dip for 3-4 days, move up one tier.'
                ];
            }

            if (pairKey === 'best->balanced') {
                return [
                    'You should still progress, but size/strength gains are usually [[~5-10% slower]] than Best.',
                    'Hard training days may feel less explosive and top-set performance can stall sooner.',
                    'Physique trend: still improving, but changes usually look less dramatic week to week.',
                    'If progression stalls for 1-2 weeks, move back to Best.'
                ];
            }
            if (pairKey === 'balanced->budget') {
                return [
                    'Gain pace usually slows further and recovery quality drops.',
                    'You may need extra weeks to hit the same size/strength milestones.',
                    'Physique trend: progress remains possible, but \"filled out\" look usually comes slower.',
                    'If lifts stall for 2 weeks, move back to Balanced.'
                ];
            }
            return [
                'This is the largest downgrade: size/strength progress can be [[~10-20% slower]] versus Best.',
                'Recovery buffer is lower, so hard sessions may feel noticeably tougher.',
                'Physique trend: progress is still possible, but visual changes usually come slower and less consistently.',
                'If lifts or body changes stall for 2 weeks, move up one tier.'
            ];
        };
        const equationLine = toMode === 'balanced'
            ? 'Protein rule in Balanced: keep at least [[0.75 x goal weight]], and usually run around [[8% lower than Best]].'
            : 'Protein rule in Minimum Effective: set protein to [[0.75 x goal weight]] (minimum for this tier).';
        const downsideBullets = buildDownsideBullets();

        return [
            `Switch from ${fromTitle} to ${toTitle}.`,
            `**Official calculations**`,
            `Calories stay fixed: [[${Math.round(toMacros.calories)} kcal/day]].`,
            equationLine,
            `Protein: [[${Math.round(fromMacros.proteinG)}g -> ${Math.round(toMacros.proteinG)}g]] (${lineProteinDelta}).`,
            `Carbs: [[${Math.round(fromMacros.carbG)}g -> ${Math.round(toMacros.carbG)}g]] (${lineCarbDelta}).`,
            `Fat rule: use the higher of [[22% of calories]] or [[${Math.round(toMacros.fatSexMin || 50)}g baseline]] = [[${Math.round(toMacros.fatFloor || 0)}g/day]].`,
            '---',
            `**Potential downsides if you apply this downgrade**`,
            ...downsideBullets.map((line) => `- ${line}`)
        ].join('\n');
    };
    const confirmBudgetDowngradeIfNeeded = async (fromModeRaw, toModeRaw) => {
        const fromMode = normalizeBudgetModeKey(fromModeRaw);
        const toMode = normalizeBudgetModeKey(toModeRaw);
        if (fromMode === toMode) return true;
        if (budgetModeRank(toMode) >= budgetModeRank(fromMode)) return true;

        const msg = buildBudgetDowngradeMessage(fromMode, toMode);
        const nextTitle = budgetModeTitle(toMode);
        if (typeof odeConfirm === 'function') {
            try {
                return await odeConfirm({
                    title: `Switch to ${nextTitle}?`,
                    message: msg,
                    confirmText: 'Apply downgrade',
                    cancelText: 'Keep current plan',
                    size: 'wide'
                });
            } catch {
                return false;
            }
        }
        return window.confirm(msg);
    };
    const updatePlanBudgetForecastSummary = (monthlyTotalWithTax) => {
        if (!planBudgetForecastMainEl) return;
        const total = Number(monthlyTotalWithTax);
        planBudgetForecastMainEl.textContent = Number.isFinite(total) && total > 0
            ? `Current post-tax price: ${formatCurrency(total)}/month.`
            : 'Current post-tax price: â€”/month.';
    };
    const formatPlanFreqDownLabel = (freq) => {
        if (freq === '5-6') return 'Decrease workouts per week (5-6 -> 3-4)';
        if (freq === '3-4') return 'Decrease workouts per week (3-4 -> 1-2)';
        return 'Decrease workouts per week';
    };
    const formatPlanFrequencyLabel = (rawFreq) => {
        const f = String(rawFreq || '').trim();
        if (f === '1-2') return '1-2 training days/week';
        if (f === '3-4') return '3-4 training days/week';
        if (f === '5-6') return '5-6 training days/week';
        return 'training frequency not set';
    };
    const getPlanCurrentLossRate = () => {
        const fromPrefs = Number(prefs?.lossRateLbsPerWeek ?? prefs?.lbsPerWeek);
        const fromSession = Number(sessionData?.selections?.lossRateLbsPerWeek ?? sessionData?.selections?.lbsPerWeek);
        const fromState = Number(nutritionState?.selections?.lossRateLbsPerWeek ?? nutritionState?.selections?.lbsPerWeek);
        if (Number.isFinite(fromPrefs) && fromPrefs > 0) return fromPrefs;
        if (Number.isFinite(fromSession) && fromSession > 0) return fromSession;
        if (Number.isFinite(fromState) && fromState > 0) return fromState;
        return 1.5;
    };
    const buildPlanCurrentFormState = (overrides = {}) => ({
        goal: prefs?.goal || prefs?.mode || sessionData?.selections?.goal || nutritionState?.selections?.goal || null,
        style: prefs?.style || sessionData?.selections?.style || nutritionState?.selections?.style || null,
        frequency: prefs?.frequency || sessionData?.selections?.frequency || nutritionState?.selections?.frequency || null,
        sex: prefs?.sex || sessionData?.selections?.sex || nutritionState?.selections?.sex || null,
        pregnant: prefs?.pregnant || sessionData?.selections?.pregnant || nutritionState?.selections?.pregnant || 'NO',
        lactating: prefs?.lactating || sessionData?.selections?.lactating || nutritionState?.selections?.lactating || 'NO',
        trimester: prefs?.trimester || sessionData?.selections?.trimester || nutritionState?.selections?.trimester || null,
        ageYears: prefs?.ageYears || sessionData?.selections?.ageYears || nutritionState?.selections?.ageYears || null,
        heightIn: prefs?.heightIn || sessionData?.selections?.heightIn || nutritionState?.selections?.heightIn || null,
        weightLbs: prefs?.weightLbs || sessionData?.selections?.weightLbs || nutritionState?.selections?.weightLbs || null,
        goalWeightLbs: prefs?.goalWeightLbs || sessionData?.selections?.goalWeightLbs || nutritionState?.selections?.goalWeightLbs || null,
        intensity: prefs?.intensity || sessionData?.selections?.intensity || nutritionState?.selections?.intensity || null,
        lossRateLbsPerWeek: getPlanCurrentLossRate(),
        ...overrides
    });
    const projectPlanCaloriesAndMacros = (formState) => {
        try {
            const normalized = normalizeInputs(formState, { strictMode: false, throwOnError: false });
            const errs = Array.isArray(normalized?.errors) ? normalized.errors : [];
            if (errs.length) return { errors: errs };
            const c = calcCalories(normalized);
            const m = calcMacros(normalized, { target: c.target });
            const caloriesTarget = Number.isFinite(m?.calories_target) ? Number(m.calories_target) : Number(c?.target || 0);
            return {
                errors: [],
                calories: { target: caloriesTarget },
                macros: {
                    protein_g: Number(m?.protein_g || 0),
                    carb_g: Number(m?.carb_g || 0),
                    fat_g: Number(m?.fat_g || 0)
                }
            };
        } catch (err) {
            return { errors: ['PROJECTION_FAILED'], detail: String(err?.message || err || 'unknown') };
        }
    };
    const getCurrentPlanBudgetMode = () => {
        const activeBtn = mealBudgetOptionEls.find((el) => el.classList.contains('active'));
        return normalizeBudgetModeKey(activeBtn?.dataset?.budgetTier || prefs?.budgetMode || 'balanced');
    };
    const applyPlanProjectedState = ({ nextMacros, nextOverrides }) => {
        if (!nextMacros) return;
        macros.calories = Number(nextMacros.calories || 0);
        macros.proteinG = Number(nextMacros.proteinG || 0);
        macros.carbG = Number(nextMacros.carbG || 0);
        macros.fatG = Number(nextMacros.fatG || 0);

        prefs = prefs && typeof prefs === 'object' ? prefs : {};
        Object.assign(prefs, nextOverrides || {});
        if (prefs.goal) prefs.mode = prefs.goal;
        if (prefs.mode) prefs.goal = prefs.mode;
        prefs.macros = {
            calories: macros.calories,
            proteinG: macros.proteinG,
            carbG: macros.carbG,
            fatG: macros.fatG
        };
        try { sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs)); } catch {}

        if (sessionData && typeof sessionData === 'object') {
            sessionData.macros = { ...prefs.macros };
            sessionData.proteinTarget = prefs.macros.proteinG;
            sessionData.selections = { ...(sessionData.selections || {}), ...(nextOverrides || {}) };
            try { sessionStorage.setItem('grocerySession', JSON.stringify(sessionData)); } catch {}
        }
        if (nutritionState?.selections && typeof nutritionState.selections === 'object') {
            Object.assign(nutritionState.selections, nextOverrides || {});
        }
        if (activeBudgetMacroBaselineRef && typeof activeBudgetMacroBaselineRef === 'object') {
            activeBudgetMacroBaselineRef.calories = Number(macros.calories || 0);
            activeBudgetMacroBaselineRef.proteinG = Number(macros.proteinG || 0);
            activeBudgetMacroBaselineRef.carbG = Number(macros.carbG || 0);
            activeBudgetMacroBaselineRef.fatG = Number(macros.fatG || 0);
        }
    };
    const renderPlanBudgetForecastActions = () => {
        if (!planBudgetForecastActionsEl) return;
        const goalRaw = String(prefs?.goal || prefs?.mode || sessionData?.selections?.goal || nutritionState?.selections?.goal || '').trim();
        const goalMode = normalizeGoal(goalRaw);
        const freqNow = String(prefs?.frequency || sessionData?.selections?.frequency || nutritionState?.selections?.frequency || '').trim();
        const currentRate = getPlanCurrentLossRate();
        const actions = [];
        const canLowerFreq = freqNow && freqNow !== '1-2';
        actions.push({
            key: 'lower-frequency',
            label: formatPlanFreqDownLabel(freqNow),
            disabled: !canLowerFreq
        });
        if (goalMode === 'CUT') {
            const nextRate = currentRate < 1.5 ? 1.5 : (currentRate < 2 ? 2 : 2);
            const canIncreaseCutSpeed = currentRate < 2;
            actions.push({
                key: 'faster-cut',
                label: canIncreaseCutSpeed
                    ? `Increase cut speed (${Number(currentRate).toFixed(1)} -> ${Number(nextRate).toFixed(1)} lb/week)`
                    : 'Cut speed already maxed (2.0 lb/week)',
                disabled: !canIncreaseCutSpeed
            });
            actions.push({
                key: 'apply-both',
                label: 'Apply both',
                disabled: !(canLowerFreq || canIncreaseCutSpeed)
            });
        } else if (goalMode === 'BULK' || goalMode === 'STRENGTH') {
            const canSlowerBulk = goalMode !== 'STRENGTH';
            actions.push({
                key: 'slower-bulk',
                label: canSlowerBulk ? 'Bulk slower (smaller surplus)' : 'Bulk speed already reduced',
                disabled: !canSlowerBulk
            });
            actions.push({
                key: 'apply-both',
                label: 'Apply both',
                disabled: !(canLowerFreq || canSlowerBulk)
            });
        }
        planBudgetForecastActionsEl.innerHTML = actions
            .map((a) => `<button type="button" class="budget-forecast-action-btn" data-plan-budget-action="${escapeHtml(a.key)}" ${a.disabled ? 'disabled' : ''}>${escapeHtml(a.label)}</button>`)
            .join('');
    };
    if (planBudgetForecastToggleEl && planBudgetForecastWrapEl && planBudgetForecastToggleEl.dataset.bound !== '1') {
        planBudgetForecastToggleEl.dataset.bound = '1';
        planBudgetForecastToggleEl.addEventListener('click', (e) => {
            e.preventDefault();
            const nextOpen = !planBudgetForecastWrapEl.classList.contains('is-open');
            planBudgetForecastWrapEl.classList.toggle('is-open', nextOpen);
            planBudgetForecastToggleEl.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        });
    }
    if (planBudgetForecastActionsEl && planBudgetForecastActionsEl.dataset.bound !== '1') {
        planBudgetForecastActionsEl.dataset.bound = '1';
        planBudgetForecastActionsEl.addEventListener('click', async (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('[data-plan-budget-action]') : null;
            if (!btn || btn.disabled) return;
            e.preventDefault();
            const action = String(btn.getAttribute('data-plan-budget-action') || '').trim();

            const currentState = buildPlanCurrentFormState();
            const currentMonthly = estimateMonthlyFromMacrosForPlan(macros);
            const currentFreq = String(currentState.frequency || '').trim();
            const currentRate = Number(currentState.lossRateLbsPerWeek || 1.5);
            const goalNorm = normalizeGoal(currentState.goal);

            let nextOverrides = null;
            let actionTitle = '';
            if (action === 'lower-frequency') {
                const nextFreq = currentFreq === '5-6' ? '3-4' : (currentFreq === '3-4' ? '1-2' : '');
                if (!nextFreq) {
                    alert('Workouts per week is already at the lowest option.');
                    return;
                }
                nextOverrides = { frequency: nextFreq };
                actionTitle = 'Train fewer days';
            } else if (action === 'faster-cut') {
                if (goalNorm !== 'CUT') return;
                const nextRate = currentRate < 1.5 ? 1.5 : (currentRate < 2 ? 2 : 2);
                if (nextRate <= currentRate) {
                    alert('Cut speed is already at the max allowed (2.0 lb/week).');
                    return;
                }
                nextOverrides = { lossRateLbsPerWeek: nextRate };
                actionTitle = 'Increase cut speed';
            } else if (action === 'slower-bulk') {
                if (goalNorm !== 'BULK' && goalNorm !== 'STRENGTH') return;
                if (goalNorm === 'STRENGTH') {
                    alert('Bulk speed is already reduced.');
                    return;
                }
                nextOverrides = { goal: 'STRENGTH', mode: 'STRENGTH' };
                actionTitle = 'Bulk slower';
            } else if (action === 'apply-both') {
                const batchOverrides = {};
                const nextFreq = currentFreq === '5-6' ? '3-4' : (currentFreq === '3-4' ? '1-2' : '');
                if (nextFreq) batchOverrides.frequency = nextFreq;
                if (goalNorm === 'CUT') {
                    const nextRate = currentRate < 1.5 ? 1.5 : (currentRate < 2 ? 2 : 2);
                    if (nextRate > currentRate) batchOverrides.lossRateLbsPerWeek = nextRate;
                    actionTitle = 'Apply both (cut cost levers)';
                } else if (goalNorm === 'BULK' || goalNorm === 'STRENGTH') {
                    if (goalNorm !== 'STRENGTH') {
                        batchOverrides.goal = 'STRENGTH';
                        batchOverrides.mode = 'STRENGTH';
                    }
                    actionTitle = 'Apply both (bulk cost levers)';
                } else {
                    return;
                }
                if (!Object.keys(batchOverrides).length) {
                    alert('No further cost reductions are available for this plan.');
                    return;
                }
                nextOverrides = batchOverrides;
            } else {
                return;
            }

            const projectedState = buildPlanCurrentFormState(nextOverrides);
            const next = projectPlanCaloriesAndMacros(projectedState);
            if (!next || !next.calories || !next.macros || (Array.isArray(next.errors) && next.errors.length)) {
                alert('Could not project this change yet. Please use redo calculation for now.');
                return;
            }

            const nextMacros = {
                calories: Number(next.calories.target || 0),
                proteinG: Number(next.macros.protein_g || 0),
                carbG: Number(next.macros.carb_g || 0),
                fatG: Number(next.macros.fat_g || 0)
            };
            const nextMonthly = estimateMonthlyFromMacrosForPlan(nextMacros);
            const deltaMonthly = nextMonthly - currentMonthly;
            const deltaCal = Number(nextMacros.calories || 0) - Number(macros?.calories || 0);
            const projectedGoalNorm = normalizeGoal(projectedState.goal || currentState.goal);
            const projectedFreq = String(projectedState.frequency || currentFreq || '').trim();
            const currentFreqText = formatPlanFrequencyLabel(currentFreq);
            const projectedFreqText = formatPlanFrequencyLabel(projectedFreq);
            const currentRateText = `${Number(currentRate || 0).toFixed(1)} lb/week`;
            const projectedRateText = `${Number(projectedState.lossRateLbsPerWeek || currentRate || 0).toFixed(1)} lb/week`;
            const monthlyDeltaLabel = `${deltaMonthly >= 0 ? '+' : '-'}${formatCurrency(Math.abs(deltaMonthly))}`;
            const summaryLines = [
                '**What changes if you apply this**',
                `- Training days/week: [[${currentFreqText} -> ${projectedFreqText}]]`
            ];
            if (projectedGoalNorm === 'CUT') {
                summaryLines.push(`- Fat-loss pace: [[${currentRateText} -> ${projectedRateText}]]`);
            } else if (projectedGoalNorm === 'BULK' || projectedGoalNorm === 'STRENGTH') {
                const beforeMode = goalNorm === 'STRENGTH' ? 'Strength-priority' : 'Build';
                const afterMode = projectedGoalNorm === 'STRENGTH' ? 'Strength-priority' : 'Build';
                summaryLines.push(`- Gain mode: [[${beforeMode} -> ${afterMode}]]`);
            }
            summaryLines.push(`- Calories target: [[${Math.round(Number(macros?.calories || 0)).toLocaleString()} -> ${Math.round(Number(nextMacros.calories || 0)).toLocaleString()} kcal/day]] (${deltaCal >= 0 ? '+' : ''}${Math.round(deltaCal)} kcal)`);
            summaryLines.push(`- Monthly groceries: [[${formatCurrency(currentMonthly)} -> ${formatCurrency(nextMonthly)}]] (${monthlyDeltaLabel})`);
            summaryLines.push('---');
            summaryLines.push('**Pros**');
            if (action === 'lower-frequency') {
                summaryLines.push('- [[Lower monthly cost pressure]] from reduced energy demand.');
                summaryLines.push('- [[More recovery time]] between sessions.');
                summaryLines.push('- Easier to stay consistent if schedule is tight.');
            } else if (action === 'faster-cut') {
                summaryLines.push('- [[Faster fat-loss timeline]] toward goal weight.');
                summaryLines.push('- [[Lower grocery spend]] from lower calorie targets.');
                summaryLines.push('- Useful as a short budget-saving phase.');
            } else if (action === 'slower-bulk') {
                summaryLines.push('- [[Lower monthly cost]] from a smaller surplus.');
                summaryLines.push('- [[Lower unnecessary fat-gain risk]] while still building.');
                summaryLines.push('- Easier appetite control across the week.');
            } else if (action === 'apply-both') {
                if (projectedGoalNorm === 'CUT') {
                    summaryLines.push('- [[Largest immediate cost drop]] for your cut.');
                    summaryLines.push('- Combines lower activity demand with faster fat-loss settings.');
                    summaryLines.push('- Can keep progress moving when budget is tight.');
                } else {
                    summaryLines.push('- [[Largest cost reduction]] available for your build phase.');
                    summaryLines.push('- Lower weekly food demand plus a smaller surplus.');
                    summaryLines.push('- Better control of monthly spend without restarting setup.');
                }
            }
            summaryLines.push('**Cons / Tradeoffs**');
            if (action === 'lower-frequency') {
                summaryLines.push('- [[Slower gym adaptation]] from reduced training volume.');
                summaryLines.push('- You may see slower improvements in conditioning or work capacity.');
            } else if (action === 'faster-cut') {
                summaryLines.push('- [[Higher hunger and cravings]] as the deficit increases.');
                summaryLines.push('- Training performance and recovery can feel flatter on hard days.');
            } else if (action === 'slower-bulk') {
                summaryLines.push('- [[Slower size and strength gain pace]].');
                summaryLines.push('- You may need a longer timeline to hit the same scale target.');
            } else if (action === 'apply-both') {
                if (projectedGoalNorm === 'CUT') {
                    summaryLines.push('- [[Highest adherence pressure]] among cut cost options.');
                    summaryLines.push('- Recovery and gym output can drop if sleep/stress are not managed.');
                } else {
                    summaryLines.push('- [[Slowest gain pace]] among build options.');
                    summaryLines.push('- Lower weekly training frequency can reduce total growth stimulus.');
                }
            }

            let confirmed = false;
            if (typeof odeConfirm === 'function') {
                confirmed = await odeConfirm({
                    title: `${actionTitle} - Preview`,
                    message: summaryLines.join('\n'),
                    confirmText: 'Apply change',
                    cancelText: 'Keep current plan',
                    size: 'wide'
                });
            } else {
                confirmed = window.confirm(summaryLines.join('\n'));
            }
            if (!confirmed) return;

            applyPlanProjectedState({ nextMacros, nextOverrides });
            renderPlanBudgetForecastActions();

            const modeKey = getCurrentPlanBudgetMode();
            const selected = planBudgetTierByKey.get(modeKey) || planBudgetTierByKey.get('balanced') || null;
            if (typeof onPlanBudgetModeSwitch === 'function') {
                onPlanBudgetModeSwitch(modeKey, selected);
            }
        });
        renderPlanBudgetForecastActions();
    }
    renderPlanBudgetForecastActions();
    
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
    const initialPlanBudgetMode = normalizeBudgetModeKey(prefs?.budgetMode || 'balanced');
    applyPlanBudgetBanner(initialPlanBudgetMode);
    updatePlanBudgetForecastSummary(Number(prefs?.budgetTotal || 0));
    if (mealBudgetOptionsWrap && mealBudgetOptionsWrap.dataset.bound !== '1') {
        mealBudgetOptionsWrap.dataset.bound = '1';
        mealBudgetOptionsWrap.addEventListener('click', async (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('.meal-budget-option') : null;
            if (!btn) return;
            const modeKey = normalizeBudgetModeKey(btn.dataset.budgetTier || 'balanced');
            const activeBtn = mealBudgetOptionEls.find((el) => el.classList.contains('active'));
            const currentMode = normalizeBudgetModeKey(
                activeBtn?.dataset?.budgetTier
                || prefs?.budgetMode
                || 'balanced'
            );
            const shouldProceed = await confirmBudgetDowngradeIfNeeded(currentMode, modeKey);
            if (!shouldProceed) return;
            const selected = persistPlanBudgetSelection(modeKey);
            applyPlanBudgetBanner(modeKey);
            if (typeof onPlanBudgetModeSwitch === 'function') {
                onPlanBudgetModeSwitch(modeKey, selected);
            }
        });
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
                const fresh = ALL_FOODS.find(f => f.id === food.id);
                return {
                    ...food,
                    image: fresh?.image || food.image || '',
                    url: fresh?.url || food.url || '',
                    container: fresh?.container || food.container,
                    serving: fresh?.serving || food.serving,
                    servingGrams: Number(fresh?.servingGrams) || Number(food?.servingGrams) || null,
                    servingLabel: fresh?.servingLabel || food.servingLabel || '',
                    micros: (fresh?.micros && typeof fresh.micros === 'object') ? fresh.micros : (food?.micros || {}),
                    sources: Array.isArray(fresh?.sources) ? fresh.sources : (Array.isArray(food?.sources) ? food.sources : [])
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
            // Keep protein_fat foods (beef/eggs) in protein bucket so meal generation
            // always has enough anchor proteins.
            if (cat.includes('carb') && cat.includes('protein')) return 'carb';
            if (cat.includes('protein')) return 'protein';
            if (cat.includes('carb')) return 'carb';
            if (cat.includes('fat')) return 'fat';
            const idName = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            if (idName.includes('oil')) return 'fat';
            if (idName.includes('rice') || idName.includes('oat') || idName.includes('potato') || idName.includes('banana') || idName.includes('bean')) return 'carb';
            if (idName.includes('chicken') || idName.includes('turkey') || idName.includes('beef') || idName.includes('tilapia') || idName.includes('egg')) return 'protein';
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
            const servingGrams = Number(food?.servingGrams) || Number(baselineServingGramsById[food.id]) || null;
            const servingsPerContainer = servingsPerContainerFromFood(food);
            const pricePerServing = Number.isFinite(food?.pricePerServing)
                ? Number(food.pricePerServing)
                : (Number.isFinite(food?.container?.price) && Number.isFinite(servingsPerContainer) && servingsPerContainer > 0)
                ? food.container.price / servingsPerContainer
                : null;

            return {
                ...food,
                type,
                qualityScore: Number.isFinite(food?.qualityScore) ? Number(food.qualityScore) : baselineQualityScore(food),
                servingGrams,
                pricePerServing,
                macros: {
                    calories: Number(food?.macros?.calories) || 0,
                    protein_g: Number(food?.macros?.protein) || Number(food?.macros?.protein_g) || 0,
                    carbs_g: Number(food?.macros?.carbs) || Number(food?.macros?.carbs_g) || 0,
                    fat_g: Number(food?.macros?.fat) || Number(food?.macros?.fat_g) || 0
                }
            };
        });

        const baselineCheaperBtn = document.getElementById('make-cheaper-btn');
        const baselineCustomFoodsBtn = document.getElementById('custom-foods-btn');
        const baselineUndoBtn = document.getElementById('undo-btn');
        const baselinePlanCtaClose = document.getElementById('plan-cta-close');
        const accountLink = document.getElementById('account-link');

        const discipline = inferDiscipline(nutritionState.selections || {});
        const resolvedGoalRaw = (() => {
            const explicit = String(nutritionState.selections?.goal || prefs?.goal || prefs?.mode || '').trim();
            if (explicit) return explicit;
            const cw = Number(prefs?.weightLbs || nutritionState.selections?.weightLbs || 0);
            const gw = Number(prefs?.goalWeightLbs || nutritionState.selections?.goalWeightLbs || 0);
            if (Number.isFinite(cw) && Number.isFinite(gw) && cw > 0 && gw > 0) {
                if (gw < cw) return 'cut';
                if (gw > cw) return 'bulk';
            }
            return 'RECOMP';
        })();
        const goal = normalizeGoal(resolvedGoalRaw);
        try {
            const lastTrace = JSON.parse(sessionStorage.getItem('odeIntegrateLastTrace') || 'null');
            console.log('[PLAN_GENERATION][GOAL_RESOLVE]', {
                traceId: lastTrace?.traceId || null,
                resolvedGoalRaw,
                goal,
                prefsMode: prefs?.mode || null,
                prefsGoal: prefs?.goal || null,
                weightLbs: Number(prefs?.weightLbs || 0),
                goalWeightLbs: Number(prefs?.goalWeightLbs || 0)
            });
        } catch {
            // ignore
        }

        const macroTargetsBase = {
            calories: macros.calories || 2000,
            protein_g: macros.proteinG || 150,
            carbs_g: macros.carbG || 200,
            fat_g: macros.fatG || 65
        };
        const budgetModeMacroBaseline = (() => {
            const src = prefs?.macroBaseline || prefs?.macros || {
                calories: macroTargetsBase.calories,
                proteinG: macroTargetsBase.protein_g,
                carbG: macroTargetsBase.carbs_g,
                fatG: macroTargetsBase.fat_g
            };
            return {
                calories: Math.max(1200, Math.round(Number(src?.calories) || Number(macroTargetsBase.calories) || 2000)),
                proteinG: Math.max(0, Math.round(Number(src?.proteinG) || Number(macroTargetsBase.protein_g) || 150)),
                carbG: Math.max(0, Math.round(Number(src?.carbG) || Number(macroTargetsBase.carbs_g) || 200)),
                fatG: Math.max(0, Math.round(Number(src?.fatG) || Number(macroTargetsBase.fat_g) || 65))
            };
        })();
        activeBudgetMacroBaselineRef = budgetModeMacroBaseline;
        const calcCarbRemainderForPlan = (cal, pro, fat) => Math.max(0, Math.round((Number(cal || 0) - ((Number(pro || 0) * 4) + (Number(fat || 0) * 9))) / 4));
        const resolveGoalWeightForPlanBudget = () => {
            const gw = Number(
                prefs?.goalWeightLbs
                || nutritionState.selections?.goalWeightLbs
                || sessionData?.selections?.goalWeightLbs
                || 0
            );
            if (Number.isFinite(gw) && gw > 0) return gw;
            const cw = Number(
                prefs?.weightLbs
                || nutritionState.selections?.weightLbs
                || sessionData?.selections?.weightLbs
                || 0
            );
            return (Number.isFinite(cw) && cw > 0) ? cw : 170;
        };
        const buildBudgetModeMacrosForPlan = (modeKeyRaw) => {
            const modeKey = normalizeBudgetModeKey(modeKeyRaw || prefs?.budgetMode || 'balanced');
            const caloriesFixed = Math.max(1200, Number(budgetModeMacroBaseline.calories) || 2000);
            const bestProtein = Math.max(0, Number(budgetModeMacroBaseline.proteinG) || 0);
            const bestFat = Math.max(0, Number(budgetModeMacroBaseline.fatG) || 0);
            const sexRaw = String(prefs?.sex || nutritionState.selections?.sex || sessionData?.selections?.sex || '').trim().toUpperCase();
            const fatSexMin = sexRaw === 'FEMALE' ? 40 : 50;
            const fatFloor = Math.max(Math.round((0.22 * caloriesFixed) / 9), fatSexMin);
            const goalWeightUsed = resolveGoalWeightForPlanBudget();
            const proteinFloor = Math.round(0.75 * goalWeightUsed);
            const balancedProtein = Math.max(proteinFloor, Math.round(bestProtein * 0.92));

            if (modeKey === 'budget') {
                const proteinG = Math.max(0, proteinFloor);
                const fatG = Math.max(bestFat, fatFloor);
                return { calories: Math.round(caloriesFixed), proteinG, fatG, carbG: calcCarbRemainderForPlan(caloriesFixed, proteinG, fatG) };
            }
            if (modeKey === 'balanced') {
                const proteinG = Math.max(0, balancedProtein);
                const fatG = Math.max(bestFat, fatFloor);
                return { calories: Math.round(caloriesFixed), proteinG, fatG, carbG: calcCarbRemainderForPlan(caloriesFixed, proteinG, fatG) };
            }
            const proteinG = Math.max(0, Math.round(bestProtein));
            const fatG = Math.max(0, Math.round(bestFat));
            return { calories: Math.round(caloriesFixed), proteinG, fatG, carbG: calcCarbRemainderForPlan(caloriesFixed, proteinG, fatG) };
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
            prefs.macroBaseline = { ...budgetModeMacroBaseline };
            try {
                sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs));
            } catch {
                // ignore
            }
        };

        const customMacroBtn = document.getElementById('custom-macro-btn');
        const reconfigureBtn = document.getElementById('reconfigure-btn');
        const spotlightReconfigureNote = () => {
            let tries = 0;
            const maxTries = 12;
            const trySpotlight = () => {
                const note = document.getElementById('macro-reconfigure-note');
                if (!note) return false;
                if (note.classList.contains('hidden')) return false;
                if (!String(note.textContent || '').trim()) return false;
                note.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                note.classList.remove('reconfigure-note-spotlight');
                // Restart animation on repeated clicks.
                void note.offsetWidth;
                note.classList.add('reconfigure-note-spotlight');
                window.setTimeout(() => note.classList.remove('reconfigure-note-spotlight'), 1600);
                return true;
            };
            if (trySpotlight()) return;
            const timer = window.setInterval(() => {
                tries += 1;
                if (trySpotlight() || tries >= maxTries) window.clearInterval(timer);
            }, 80);
        };
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
                spotlightReconfigureNote();
                console.log('[RECONFIGURE]', { calories: next.calories, protein: next.proteinG, carbs: next.carbG, fat: next.fatG });
            });
        }

        const renderBaselinePlan = () => {
            const macroTargets = { ...macroTargetsBase };
            const plannerTargets = scaledTargetsForPlanner(macroTargets, portionScale);

            const plannerFoods = buildBaselinePlannerFoods();
            const plan = buildAllMealsGuarded(plannerFoods, plannerTargets, mealsPerDay, goal, bodyweightLbs, discipline);
            let resolvedPlan = plan;
            if (plan?.error && /No valid meal candidates after grocery integration/i.test(String(plan?.reason || ''))) {
                const emergencyFallback = buildLegacyFallbackMeals(plannerFoods, plannerTargets, mealsPerDay, goal);
                if (emergencyFallback && Array.isArray(emergencyFallback.meals) && emergencyFallback.meals.length) {
                    emergencyFallback.meta = {
                        ...(emergencyFallback.meta || {}),
                        branch: 'baseline_emergency_fallback',
                        notes: [
                            ...((Array.isArray(emergencyFallback?.meta?.notes) ? emergencyFallback.meta.notes : [])),
                            'Baseline emergency fallback was rendered to avoid blank output.'
                        ]
                    };
                    try {
                        const lastTrace = JSON.parse(sessionStorage.getItem('odeIntegrateLastTrace') || 'null');
                        console.warn('[PLAN_GENERATION][BASELINE] Emergency fallback forced render', {
                            traceId: lastTrace?.traceId || null,
                            reason: plan.reason || plan.error,
                            plannerTargets,
                            fallbackTotals: emergencyFallback.dailyTotals || null,
                            branch: emergencyFallback?.meta?.branch || 'baseline_emergency_fallback'
                        });
                    } catch {
                        // ignore
                    }
                    resolvedPlan = emergencyFallback;
                }
            }

            if (resolvedPlan?.error) {
                try {
                    const lastTrace = JSON.parse(sessionStorage.getItem('odeIntegrateLastTrace') || 'null');
                    console.error('[PLAN_GENERATION][BASELINE] Build failed', {
                        traceId: lastTrace?.traceId || null,
                        reason: resolvedPlan.reason || resolvedPlan.error,
                        plannerTargets,
                        plannerDebug: resolvedPlan?.debug || null,
                        mealsPerDay,
                        goal,
                        bodyweightLbs,
                        plannerFoodsCount: Array.isArray(plannerFoods) ? plannerFoods.length : 0
                    });
                } catch {
                    // ignore
                }
                if (mealGrid) {
                    mealGrid.innerHTML = `
                        <div class="upgrade-message">
                            <h4>Could Not Build Plan</h4>
                            <p>${escapeHtml(resolvedPlan.reason || 'Invalid grocery integration.')}</p>
                        </div>
                    `;
                }
                if (listEl) listEl.innerHTML = '';
                return;
            }
            const builtMeals = resolvedPlan?.meals || [];
            const dailyTotalsFromMeals = computeTotalsFromBuiltMeals(builtMeals);
            const dailyTotals = dailyTotalsFromMeals;
            if (resolvedPlan?.dailyTotals) {
                const drift = {
                    calories: Math.abs((Number(resolvedPlan.dailyTotals.calories) || 0) - (Number(dailyTotals.calories) || 0)),
                    protein_g: Math.abs((Number(resolvedPlan.dailyTotals.protein_g) || 0) - (Number(dailyTotals.protein_g) || 0)),
                    carbs_g: Math.abs((Number(resolvedPlan.dailyTotals.carbs_g) || 0) - (Number(dailyTotals.carbs_g) || 0)),
                    fat_g: Math.abs((Number(resolvedPlan.dailyTotals.fat_g) || 0) - (Number(dailyTotals.fat_g) || 0))
                };
                if (drift.calories > 1 || drift.protein_g > 1 || drift.carbs_g > 1 || drift.fat_g > 1) {
                    console.warn('[Meal Totals Sync] Using finalized meal totals due to drift:', drift);
                }
            }

            if (!builtMeals.length) {
                if (mealGrid) {
                    mealGrid.innerHTML = `
                        <div class="upgrade-message">
                            <h4>ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Cannot Generate Plan</h4>
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

            // Micronutrient summary row (Goal/UL vs actuals, all tiers)
            const unitByMicroKey = {
                fiber: 'g',
                potassium: 'mg',
                sodium: 'mg',
                magnesium: 'mg',
                calcium: 'mg',
                iron: 'mg',
                zinc: 'mg',
                vitamin_d: 'mcg',
                vitamin_c: 'mg',
                vitamin_a: 'mcg',
                folate: 'mcg',
                b12: 'mcg',
                omega_3: 'mg',
                choline: 'mg'
            };
            const microProfile = getMicronutrientTargets({
                sex: nutritionState?.selections?.sex || prefs?.sex || null,
                ageYears: nutritionState?.selections?.ageYears || prefs?.ageYears || null,
                pregnant: nutritionState?.selections?.pregnant || prefs?.pregnant || null,
                trimester: nutritionState?.selections?.trimester || prefs?.trimester || null,
                lactating: nutritionState?.selections?.lactating || prefs?.lactating || null
            }, { assumeAdult1930IfMissing: true });
            const microConfigs = {};
            Object.keys(microProfile.refs || {}).forEach((k) => {
                microConfigs[k] = {
                    unit: microProfile.refs[k]?.unit || unitByMicroKey[k] || 'mg',
                    goalType: microProfile.refs[k]?.goal_type || 'AI',
                    goal: Number.isFinite(Number(microProfile.refs[k]?.goal_value)) ? Number(microProfile.refs[k]?.goal_value) : null,
                    ul: Number.isFinite(Number(microProfile.refs[k]?.ul_value)) ? Number(microProfile.refs[k].ul_value) : null,
                    ulNote: microProfile.refs[k]?.ul_note || '',
                    trackedOnly: Boolean(microProfile.refs[k]?.tracked_only)
                };
            });
            const microIdMap = {
                fiber: 'micro-fiber',
                potassium: 'micro-potassium',
                sodium: 'micro-sodium',
                magnesium: 'micro-magnesium',
                calcium: 'micro-calcium',
                iron: 'micro-iron',
                zinc: 'micro-zinc',
                vitamin_d: 'micro-vitamin-d',
                vitamin_c: 'micro-vitamin-c',
                vitamin_a: 'micro-vitamin-a',
                folate: 'micro-folate',
                b12: 'micro-b12',
                omega_3: 'micro-omega-3',
                choline: 'micro-choline'
            };
            const microTargetEls = {};
            const microActualEls = {};
            Object.keys(microIdMap).forEach((key) => {
                microTargetEls[key] = document.getElementById(`target-${microIdMap[key]}`);
                microActualEls[key] = document.getElementById(`actual-${microIdMap[key]}`);
            });
            const formatMicroProjected = (cfg) => {
                if (!cfg) return 'â€”';
                if (cfg.trackedOnly || String(cfg.goalType || '').toUpperCase() === 'TRACKED') {
                    return `Tracked intake (${cfg.unit}) | No DRI goal`;
                }
                const goalText = `${cfg.goal}${cfg.unit} (${cfg.goalType})`;
                const ulText = Number.isFinite(cfg.ul) ? `UL ${cfg.ul}${cfg.unit}` : 'No UL set';
                return `${goalText} | ${ulText}`;
            };
            const normalizeMicroKey = (raw) => {
                const txt = String(raw || '').toLowerCase().replace(/:/g, '').trim();
                if (txt.startsWith('fiber')) return 'fiber';
                if (txt.startsWith('potassium')) return 'potassium';
                if (txt.startsWith('sodium')) return 'sodium';
                if (txt.startsWith('magnesium')) return 'magnesium';
                if (txt.startsWith('calcium')) return 'calcium';
                if (txt.startsWith('iron')) return 'iron';
                if (txt.startsWith('zinc')) return 'zinc';
                if (txt.startsWith('vitamin d')) return 'vitamin_d';
                if (txt.startsWith('vitamin c')) return 'vitamin_c';
                if (txt.startsWith('vitamin a')) return 'vitamin_a';
                if (txt.startsWith('folate')) return 'folate';
                if (txt.includes('b12')) return 'b12';
                if (txt.startsWith('omega-3')) return 'omega_3';
                if (txt.startsWith('choline')) return 'choline';
                return '';
            };
            const parseNumberFromText = (raw) => {
                if (raw === null || raw === undefined) return NaN;
                const cleaned = String(raw).replace(/,/g, '');
                const m = cleaned.match(/-?\d+(?:\.\d+)?/);
                return m ? Number(m[0]) : NaN;
            };
            const resolveMicrosPerServing = (food, key) => {
                const micros = (food && typeof food === 'object' && food.micros && typeof food.micros === 'object') ? food.micros : {};
                const toFinite = (raw) => {
                    if (raw === null || raw === undefined || raw === '') return null;
                    const n = Number(raw);
                    return Number.isFinite(n) ? n : null;
                };
                const pick = (...names) => {
                    for (const n of names) {
                        const v = toFinite(micros?.[n]);
                        if (v !== null) return v;
                    }
                    return null;
                };
                switch (key) {
                    case 'fiber': return pick('fiber_g', 'fiber');
                    case 'potassium': return pick('potassium_mg', 'potassium');
                    case 'sodium': return pick('sodium_mg', 'sodium');
                    case 'magnesium': return pick('magnesium_mg', 'magnesium');
                    case 'calcium': return pick('calcium_mg', 'calcium');
                    case 'iron': return pick('iron_mg', 'iron');
                    case 'zinc': return pick('zinc_mg', 'zinc');
                    case 'vitamin_d': return pick('vitamin_d_mcg', 'vitamin_d');
                    case 'vitamin_c': return pick('vitamin_c_mg', 'vitamin_c');
                    case 'vitamin_a': return pick('vitamin_a_mcg_rae', 'vitamin_a');
                    case 'folate': return pick('folate_mcg', 'folate');
                    case 'b12': return pick('b12_mcg', 'b12');
                    case 'omega_3': return pick('omega3_epa_dha_mg', 'omega_3_mg', 'omega_3');
                    case 'choline': return pick('choline_mg', 'choline');
                    default: return null;
                }
            };
            const computeMicroActualsFromMeals = (meals, foods) => {
                const totals = {};
                const missing = {};
                const quality = {};
                const microKeys = Object.keys(microConfigs);
                Object.keys(microConfigs).forEach((k) => {
                    totals[k] = 0;
                    missing[k] = false;
                    quality[k] = {
                        known_food_count: 0,
                        unknown_food_count: 0,
                        contributing_food_count: 0,
                        coverage_pct: 0,
                        state: 'UNKNOWN',
                        value_source_counts: {}
                    };
                });
                const srcMeals = Array.isArray(meals) ? meals : [];
                const byId = new Map((Array.isArray(foods) ? foods : []).map((f) => [String(f?.id || ''), f]));
                srcMeals.forEach((meal) => {
                    (meal?.foods || []).forEach((item) => {
                        const servings = Math.max(0, Number(item?.servings) || 0);
                        if (servings <= 0) return;
                        const mapped = byId.get(String(item?.foodId || ''));
                        if (!mapped) return;
                        const sourceMap = (mapped?.micro_value_source && typeof mapped.micro_value_source === 'object') ? mapped.micro_value_source : {};
                        microKeys.forEach((key) => {
                            const qualityRow = quality[key];
                            qualityRow.contributing_food_count += 1;
                            const perServing = resolveMicrosPerServing(mapped, key);
                            if (Number.isFinite(perServing)) {
                                totals[key] += perServing * servings;
                                qualityRow.known_food_count += 1;
                                const sourceKey = String(sourceMap?.[key] || MICRO_VALUE_SOURCES.UNKNOWN_SOURCE);
                                qualityRow.value_source_counts[sourceKey] = (qualityRow.value_source_counts[sourceKey] || 0) + 1;
                            } else {
                                missing[key] = true;
                                qualityRow.unknown_food_count += 1;
                                const sourceKey = String(sourceMap?.[key] || MICRO_VALUE_SOURCES.MISSING);
                                qualityRow.value_source_counts[sourceKey] = (qualityRow.value_source_counts[sourceKey] || 0) + 1;
                            }
                        });
                    });
                });
                microKeys.forEach((key) => {
                    const qualityRow = quality[key];
                    const contributing = Number(qualityRow.contributing_food_count) || 0;
                    const known = Number(qualityRow.known_food_count) || 0;
                    const unknown = Number(qualityRow.unknown_food_count) || 0;
                    qualityRow.coverage_pct = contributing > 0 ? (known / contributing) * 100 : 0;
                    if (contributing <= 0 || known <= 0) qualityRow.state = 'UNKNOWN';
                    else if (unknown > 0) qualityRow.state = 'PARTIAL';
                    else qualityRow.state = 'KNOWN';
                    missing[key] = qualityRow.state === 'UNKNOWN';
                });
                return { totals, missing, quality };
            };
            const formatMicroActual = (value, unit, isPartial = false) => {
                const num = Number(value);
                if (!Number.isFinite(num)) return 'â€”';
                const abs = Math.abs(num);
                let digits = 0;
                if (unit === 'g') digits = abs < 10 ? 1 : 0;
                else digits = abs < 10 ? 1 : 0;
                const rounded = Number(num.toFixed(digits));
                return `${rounded.toLocaleString()}${unit}${isPartial ? '*' : ''}`;
            };
            const writeMicroPanelActuals = (actualTotals, partialByKey, pendingByKey) => {
                document.querySelectorAll('.plan-micro-row').forEach((row) => {
                    const name = row.querySelector('.plan-micro-name')?.textContent || '';
                    const key = normalizeMicroKey(name);
                    if (!key || !microConfigs[key]) return;
                    const valueEl = row.querySelector('.plan-micro-value');
                    if (!valueEl) return;
                    if (Boolean(pendingByKey?.[key])) {
                        valueEl.textContent = '—';
                        return;
                    }
                    valueEl.textContent = formatMicroActual(actualTotals[key], microConfigs[key].unit, Boolean(partialByKey?.[key]));
                });
            };
            const applyMicroStatus = (actualEl, status) => {
                if (!actualEl) return;
                actualEl.classList.remove('on-target', 'caution', 'off-target', 'pending');
                if (status === 'OK') actualEl.classList.add('on-target');
                else if (status === 'OVER UL' || status === 'OVER_UL') actualEl.classList.add('off-target');
                else if (status === 'LOW' || status === 'HIGH') actualEl.classList.add('caution');
                else if (status === 'ABOVE_TARGET_NO_UL') actualEl.classList.add('on-target');
                else if (status === 'INCOMPLETE_DATA') actualEl.classList.add('pending');
                else if (status === 'TRACKED') actualEl.classList.add('pending');
                else actualEl.classList.add('pending');
            };
            const microActualComputation = computeMicroActualsFromMeals(builtMeals, plannerFoods);
            const microActualTotals = microActualComputation.totals;
            const microActualQuality = microActualComputation.quality || {};
            const microActualPending = {};
            const microActualPartial = {};
            Object.keys(microConfigs).forEach((key) => {
                const qualityState = String(microActualQuality?.[key]?.state || '').toUpperCase();
                microActualPending[key] = qualityState === 'UNKNOWN';
                microActualPartial[key] = qualityState === 'PARTIAL';
            });
            const microStatusRows = computeMicroStatuses(microProfile.rows || microProfile.refs, microActualTotals, {
                pending: microActualPending,
                quality: microActualQuality,
                // Only treat true unknown coverage as incomplete.
                // Partial coverage should still score as low/ok/high.
                coverageThreshold: 1,
                sourceContext: 'food_only',
                veryLowSodiumFloorMg: 800
            });
            const microStatusByKey = {};
            (microStatusRows || []).forEach((row) => { microStatusByKey[row.nutrient_id] = row; });
            const microActuals = {};
            Object.keys(microConfigs).forEach((key) => {
                if (microActualPending[key]) {
                    microActuals[key] = '—';
                } else {
                    microActuals[key] = formatMicroActual(microActualTotals[key], microConfigs[key].unit, Boolean(microActualPartial?.[key]));
                }
            });
            writeMicroPanelActuals(microActualTotals, microActualPartial, microActualPending);
            if (window && typeof window === 'object') window.currentPlanMicros = microActuals;
            if (window && typeof window === 'object') window.currentPlanMicrosDataQuality = microActualQuality;
            Object.keys(microConfigs).forEach((key) => {
                if (microTargetEls[key]) {
                    microTargetEls[key].textContent = formatMicroProjected(microConfigs[key]);
                    microTargetEls[key].title = `Goal type: ${microConfigs[key]?.goalType || 'AI'}`;
                }
                if (microActualEls[key]) {
                    const raw = microActuals[key];
                    const hasValue = raw && raw !== '-' && raw !== 'â€”';
                    if (!hasValue) {
                        microActualEls[key].textContent = 'â€”';
                        applyMicroStatus(microActualEls[key], 'PENDING');
                        return;
                    }
                    const statusRow = microStatusByKey[key] || {};
                    const pctGoalText = Number.isFinite(statusRow.pct_goal) ? `${Math.round(statusRow.pct_goal)}% Goal` : 'Goal n/a';
                    const pctUlText = Number.isFinite(statusRow.pct_ul) ? `${Math.round(statusRow.pct_ul)}% UL` : 'No UL';
                    const statusTag = String(statusRow.status || 'PENDING');
                    const statusLabel = statusTag === 'ABOVE_TARGET_NO_UL'
                        ? 'Above target (no UL)'
                        : (statusTag === 'INCOMPLETE_DATA' ? 'Incomplete data' : statusTag);
                    const qualityRow = microActualQuality?.[key] || null;
                    const qualityState = String(qualityRow?.state || 'UNKNOWN');
                    const coverageText = Number.isFinite(Number(qualityRow?.coverage_pct))
                        ? `${Math.round(Number(qualityRow.coverage_pct))}% data coverage`
                        : 'coverage n/a';
                    const sourceCounts = (qualityRow && qualityRow.value_source_counts && typeof qualityRow.value_source_counts === 'object')
                        ? Object.entries(qualityRow.value_source_counts).filter(([, count]) => Number(count) > 0).map(([source, count]) => `${source}:${count}`).join(', ')
                        : '';
                    if (statusTag === 'TRACKED') {
                        microActualEls[key].textContent = `${raw} | Tracked only | No DRI goal`;
                    } else {
                        microActualEls[key].textContent = `${raw} | ${pctGoalText} | ${pctUlText} | ${statusLabel}`;
                    }
                    microActualEls[key].title = `Status: ${statusLabel} | Data: ${qualityState} (${coverageText})${sourceCounts ? ` | Sources: ${sourceCounts}` : ''}`;
                    applyMicroStatus(microActualEls[key], statusTag);
                }
            });
            const microMetaEl = document.querySelector('.micro-summary-toggle-meta');
            if (microMetaEl) {
                if (Array.isArray(microProfile.warnings) && microProfile.warnings.length) {
                    microMetaEl.textContent = microProfile.warnings.join(' ');
                    microMetaEl.title = microProfile.warnings.join(' ');
                } else {
                    const qualityRows = Object.values(microActualQuality || {});
                    const partialCount = qualityRows.filter((row) => String(row?.state || '').toUpperCase() === 'PARTIAL').length;
                    const unknownCount = qualityRows.filter((row) => String(row?.state || '').toUpperCase() === 'UNKNOWN').length;
                    if (partialCount > 0 || unknownCount > 0) {
                        microMetaEl.textContent = `Goal + UL vs Actual | Data quality: ${partialCount} partial, ${unknownCount} unknown`;
                    } else {
                        microMetaEl.textContent = 'Goal + UL vs Actual | Data quality: complete';
                    }
                    microMetaEl.title = '';
                }
            }

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

            // Overview + plan page monthly cost toggle:
            // left = average 28-day month, right = rest of this month.
            const avgWeeklyCost = (inventoryCosts.avgMonthlyCost * 7) / 30;
            const avgMonthly28Cost = Number.isFinite(inventoryCosts.avgMonthlyCost)
                ? (inventoryCosts.avgMonthlyCost * 28) / 30
                : null;
            renderCostWindowSummary({
                weeklyCost: avgWeeklyCost,
                avgMonthly28: avgMonthly28Cost,
                restOfMonth: Number(inventoryCosts.thisMonthCost),
                daysRemaining: Number(inventoryCosts.daysRemainingInMonth)
            });

            // Budget breakdown
            const taxRate = 0.08;
            const estimatedTax = inventoryCosts.avgMonthlyCost * taxRate;
            const monthlyTotalWithTax = inventoryCosts.avgMonthlyCost + estimatedTax;
            latestPlanMonthlyTotalWithTax = monthlyTotalWithTax;
            maybeRebasePlanBudgetTiersFromActual(monthlyTotalWithTax);
            const budget = Number(prefs?.budgetTotal || 0);
            const budgetDelta = budget ? budget - monthlyTotalWithTax : null;

            const budgetAllocEl = document.getElementById('budget-allocated');
            const budgetEstEl = document.getElementById('budget-estimated');
            const budgetTaxesEl = document.getElementById('budget-taxes');
            const budgetTotalEl = document.getElementById('budget-total');

            if (budgetAllocEl) budgetAllocEl.textContent = budget ? formatCurrency(budget) : EM_DASH;
            if (budgetEstEl) budgetEstEl.textContent = formatCurrency(inventoryCosts.avgMonthlyCost);
            if (budgetTaxesEl) budgetTaxesEl.textContent = formatCurrency(estimatedTax);
            if (budgetTotalEl) budgetTotalEl.textContent = formatCurrency(monthlyTotalWithTax);
            if (budgetEl) budgetEl.textContent = formatCurrency(monthlyTotalWithTax);
            if (mealBudgetInlineEl) mealBudgetInlineEl.textContent = formatCurrency(monthlyTotalWithTax);
            updatePlanBudgetForecastSummary(monthlyTotalWithTax);
            updatePlanBudgetStatusBadge({
                budgetOverride: budget,
                monthlyTotalOverride: monthlyTotalWithTax
            });

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

        onPlanBudgetModeSwitch = (modeKeyRaw, selectedTier) => {
            const modeKey = normalizeBudgetModeKey(modeKeyRaw || 'balanced');
            const nextMacros = buildBudgetModeMacrosForPlan(modeKey);
            macroTargetsBase.calories = nextMacros.calories;
            macroTargetsBase.protein_g = nextMacros.proteinG;
            macroTargetsBase.carbs_g = nextMacros.carbG;
            macroTargetsBase.fat_g = nextMacros.fatG;
            portionScale = 1;
            syncMacrosFromMacroTargetsBase();
            prefs = prefs && typeof prefs === 'object' ? prefs : {};
            prefs.budgetMode = modeKey;
            if (selectedTier && Number.isFinite(Number(selectedTier.value))) {
                prefs.budgetTotal = Number(selectedTier.value);
            }
            prefs.budgetTierOptions = planBudgetTierOptions;
            prefs.macroBaseline = { ...budgetModeMacroBaseline };
            try { sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs)); } catch {}
            updateMacroDisplay(1);
            renderBaselinePlan();
        };

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
        const scoreDirection = 'lower_is_better';
        const goal = normalizeGoal(goalRaw);
        const targets = normalizeMacroTargets(macroTargets);
        const budgetModeForPlanner = getActiveBudgetModeFromSession();
        const isBudgetModePlanner = budgetModeForPlanner === 'budget';
        const isBalancedModePlanner = budgetModeForPlanner === 'balanced';
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
            let protein_g = Number(macros.protein_g ?? macros.protein ?? 0) || 0;
            let carbs_g = Number(macros.carbs_g ?? macros.carbs ?? 0) || 0;
            let fat_g = Number(macros.fat_g ?? macros.fat ?? 0) || 0;

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
            const idLower = String(raw.id || '').toLowerCase();
            const nameLower = String(raw.name || raw.query || '').toLowerCase();
            const isSpinach = idLower === 'spinach_chopped_frozen' || nameLower.includes('spinach');
            if (isSpinach && calories > 0) {
                const macroCalories = protein_g * 4 + carbs_g * 4 + fat_g * 9;
                const errorPct = Math.abs(macroCalories - calories) / calories;
                if (errorPct > 0.15) {
                    const correctedCarbs = Math.max(0, ((calories - (protein_g * 4 + fat_g * 9)) / 4));
                    carbs_g = Math.round(correctedCarbs * 10) / 10;
                }
            }

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
        const foodById = new Map(foodsToUse.map((f) => [String(f?.id || ''), f]));

        const servingToOunces = (food, servings) => {
            const s = Math.max(0, Number(servings) || 0);
            if (s <= 0) return 0;
            const unit = String(food?.serving?.unit || '').toLowerCase();
            const amount = Number(food?.serving?.amount);
            if (Number.isFinite(amount) && amount > 0 && (unit === 'oz' || unit === 'ounce' || unit === 'ounces')) {
                return s * amount;
            }
            if (Number.isFinite(amount) && amount > 0 && (unit === 'g' || unit === 'gram' || unit === 'grams')) {
                return (s * amount) / 28.349523125;
            }
            const grams = Number(food?.servingGrams);
            if (Number.isFinite(grams) && grams > 0) return (s * grams) / 28.349523125;
            return 0;
        };

        const servingToTbsp = (food, servings) => {
            const s = Math.max(0, Number(servings) || 0);
            if (s <= 0) return 0;
            const unit = String(food?.serving?.unit || '').toLowerCase();
            const amount = Number(food?.serving?.amount);
            if (Number.isFinite(amount) && amount > 0 && (unit === 'tbsp' || unit === 'tablespoon' || unit === 'tablespoons')) {
                return s * amount;
            }
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            if (text.includes('olive') || text.includes('oil')) return s;
            return 0;
        };

        const itemOunces = (item) => {
            const grams = Number(item?.grams);
            if (Number.isFinite(grams) && grams > 0) return grams / 28.349523125;
            const src = foodById.get(String(item?.foodId || ''));
            return servingToOunces(src, Number(item?.servings) || 0);
        };

        const cutMacroToleranceOk = (totals) => {
            if (!isCutPhase) return true;
            const t = targets;
            const calUnder = isBudgetModePlanner ? 180 : (isBalancedModePlanner ? 100 : 50);
            const calOver = isBudgetModePlanner ? 120 : (isBalancedModePlanner ? 80 : 60);
            const proUnderPct = isBudgetModePlanner ? 0.90 : (isBalancedModePlanner ? 0.95 : 1.00);
            const proOverPct = isBudgetModePlanner ? 1.20 : (isBalancedModePlanner ? 1.10 : 1.05);
            const carbUnder = isBudgetModePlanner ? 120 : (isBalancedModePlanner ? 45 : 15);
            const carbOver = isBudgetModePlanner ? 60 : (isBalancedModePlanner ? 30 : 15);
            const fatUnder = isBudgetModePlanner ? 10 : (isBalancedModePlanner ? 7 : 5);
            const fatOver = isBudgetModePlanner ? 2 : 0;
            const caloriesOk = totals.calories >= (t.calories - calUnder) && totals.calories <= (t.calories + calOver);
            const proteinOk = totals.protein_g >= Math.floor(t.protein_g * proUnderPct) && totals.protein_g <= Math.ceil(t.protein_g * proOverPct);
            const carbsOk = totals.carbs_g >= (t.carbs_g - carbUnder) && totals.carbs_g <= (t.carbs_g + carbOver);
            const fatOk = totals.fat_g >= (t.fat_g - fatUnder) && totals.fat_g <= (t.fat_g + fatOver);
            return caloriesOk && proteinOk && carbsOk && fatOk;
        };

        const cutServingMinimumsOk = (meals) => {
            if (!isCutPhase) return true;
            const srcMeals = Array.isArray(meals) ? meals : [];
            for (const meal of srcMeals) {
                for (const item of (meal?.foods || [])) {
                    const src = foodById.get(String(item?.foodId || ''));
                    if (!src) continue;
                    const type = String(src?.type || src?.category || '').toLowerCase();
                    const servings = Number(item?.servings) || 0;
                    if (type === 'protein') {
                        if (servings < 0.5) return false;
                        const oz = itemOunces(item);
                        if (servings < 1.0 && oz < 4.0) return false;
                    } else if (type === 'carb') {
                        if (servings < 1.0) return false;
                    } else if (type === 'fat') {
                        const tbsp = servingToTbsp(src, servings);
                        if (tbsp > 0 && tbsp < 0.5) return false;
                    }
                }
            }
            return true;
        };
        const proteins = foodsToUse.filter(f => f.type === 'protein');
        const carbs = foodsToUse.filter(f => f.type === 'carb');
        const fats = foodsToUse.filter(f => f.type === 'fat');
        const isCutPhase = isCutGoalLike(goalRaw, goal);
        const isBestModePlanner = budgetModeForPlanner === 'best';
        const enforceStrictCutHardRejects = isCutPhase && isBestModePlanner;
        const cutDebug = Boolean(globalThis.__ODE_DEBUG_CUT);
        const CUT_SPINACH_MAX_SERV_PER_MEAL = 1.0;
        const CUT_SPINACH_MAX_SERV_PER_DAY = 2.0;
        const cutRejectStats = cutDebug ? {} : null;
        const noteCutReject = (reason) => {
            if (!cutRejectStats || !reason) return;
            cutRejectStats[reason] = (cutRejectStats[reason] || 0) + 1;
        };

        if (!proteins.length || !carbs.length) {
            return { meals: [], dailyTotals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };
        }

        // Macro hierarchy enforcement (non-negotiable):
        // Protein (fixed first) -> Calories -> Carbs -> Fats.

        const strictOvershootConfig = getPlannerOvershootConfig({
            isCutPhase,
            budgetMode: budgetModeForPlanner,
            relaxed: false
        });
        const cutFatOvershootG = Number(strictOvershootConfig.fatOver) || 0;
        const isNoOvershoot = (totals) => passesPlannerOvershootGate({
            totals,
            targets,
            overshootConfig: strictOvershootConfig
        });

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
            const type = String(food?.type || food?.category || '').toLowerCase();
            const step = type === 'fat' ? 0.5 : 0.25;
            const maxS = Number.isFinite(maxServings) ? Math.max(0, Number(maxServings)) : sQuant;
            const snapped = Math.min(maxS, Math.max(step, Math.round(sQuant / step) * step));
            const cleanServings = Math.round(snapped * 100) / 100;
            if (!Number.isFinite(cleanServings) || cleanServings <= 0) return;
            mealFoods.push({ ...food, servings: cleanServings });
        };

        const buildInvalidCandidate = (cutRejected = false, debug = {}) => ({
            meals: [],
            dailyTotals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
            score: Number.POSITIVE_INFINITY,
            qualityScore: 0,
            cost: Number.POSITIVE_INFINITY,
            meetsMin: false,
            noOvershoot: false,
            varietyOk: false,
            uniqueFoodCount: 0,
            totalGrams: 0,
            cutRejected,
            debug: {
                reason: String(debug?.reason || 'INVALID_CANDIDATE_NO_REASON'),
                details: debug?.details || null
            }
        });

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

        const isPenaltyFoodInCut = (food) => {
            const id = String(food?.id || '').toLowerCase();
            return id === 'ground_beef_80_20' || id === 'chocolate_milk_lowfat';
        };

        const isVegetableFood = (food) => {
            const id = String(food?.id || '').toLowerCase();
            return id === 'spinach_chopped_frozen' || id === 'mixed_vegetables_birds_eye';
        };

        const isProteinFood = (food) => {
            const type = String(food?.type || food?.category || '').toLowerCase();
            if (type === 'protein') return true;
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            return /\b(chicken|turkey|tilapia|egg|eggs|beef|fish|protein)\b/.test(text);
        };

        const isBeanFood = (food) => {
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            return /\b(bean|beans|lentil|lentils|chickpea|chickpeas|garbanzo)\b/.test(text);
        };

        const isOatFood = (food) => {
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            return /\boat|oats\b/.test(text);
        };

        const isBananaFood = (food) => {
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            return /\bbanana\b/.test(text);
        };
        const proteinFatRatio = (food) => {
            const protein = Number(food?.macros?.protein_g) || 0;
            const fat = Number(food?.macros?.fat_g) || 0;
            if (protein <= 0) return Number.POSITIVE_INFINITY;
            return fat / protein;
        };
        const isWholeEggFood = (food) => {
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            return text.includes('eggs_large') || /\begg\b|\beggs\b/.test(text);
        };
        const isHighFatProteinFood = (food) => {
            if (String(food?.type || '').toLowerCase() !== 'protein') return false;
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            if (text.includes('ground_beef_80_20') || text.includes('80/20')) return true;
            return proteinFatRatio(food) >= 0.6;
        };
        const isLeanProteinFood = (food) => {
            if (String(food?.type || '').toLowerCase() !== 'protein') return false;
            return proteinFatRatio(food) <= 0.35;
        };
        const isProduceFood = (food) => isVegetableFood(food) || isBananaFood(food);

        const estimatedFiberForFood = (food, servings) => {
            const s = Math.max(0, Number(servings) || 0);
            if (s <= 0) return 0;
            if (isBeanFood(food)) return 15 * s;
            if (isOatFood(food)) return 4 * s;
            if (isVegetableFood(food)) return 3 * s;
            if (isBananaFood(food)) return 3 * s;
            return 0;
        };

        const estimatedFiberForMeal = (mealFoods) => mealFoods.reduce((sum, f) => sum + estimatedFiberForFood(f, f.servings), 0);

        const hasHighFatProtein = (mealFoods) => mealFoods.some((f) => {
            if (f.type !== 'protein') return false;
            const fat = Number(f?.macros?.fat_g) || 0;
            return fat >= 10;
        });

        const isOliveOilFood = (food) => {
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            return text.includes('olive_oil') || text.includes('olive oil');
        };
        const isFatOnlyFood = (food) => {
            const fat = Number(food?.macros?.fat_g) || 0;
            const protein = Number(food?.macros?.protein_g) || 0;
            const carbsVal = Number(food?.macros?.carbs_g) || 0;
            return fat >= 6 && protein < 5 && carbsVal < 5;
        };

        const PLANNER_OIL_MAX_SERVINGS_PER_DAY = 1.5;
        const PLANNER_OIL_MAX_MEALS_PER_DAY = 1;
        const FAT_ONLY_MIN_REMAINING_FAT_G = isCutPhase ? 12 : 15;
        const FAT_ONLY_MIN_REMAINING_CALORIES = isCutPhase ? 220 : 260;
        const CUT_TIGHT_FAT_TARGET_G = 75;
        const CUT_FAT_PER_MEAL_BUFFER_G = 12;
        const CUT_HIGH_FAT_PROTEIN_MAX_MEALS = 1;
        const CUT_WHOLE_EGG_MAX_MEALS = 1;
        const CUT_STRICT_LEAN_MIN_OPTIONS = 1;

        const carbWeightMultiplierForMeal = (mealIdx) => {
            if (!isCutPhase) return 1;
            return mealIdx === 0 || mealIdx === 1 ? 1.2 : 0.8;
        };

        const proteinRank = (f) => {
            const p = Number(f.macros.protein_g) || 0;
            const cals = Number(f.macros.calories) || 1;
            let score = (p / cals) * 100 + (Number(f.qualityScore) || 0) * 10;
            if (isCutPhase) {
                const fat = Number(f.macros.fat_g) || 0;
                if (fat > 0) score += (p / fat) * 5;
                else score += 15;
                if (isPenaltyFoodInCut(f)) score *= 0.8;
            }
            return score;
        };
        const carbRank = (f, mealIdx = 0) => {
            const c = Number(f.macros.carbs_g) || 0;
            const cals = Number(f.macros.calories) || 1;
            let score = (c / cals) * 40 + (Number(f.qualityScore) || 0) * 10;
            if (isCutPhase) {
                score *= carbWeightMultiplierForMeal(mealIdx);
                if (mealIdx >= 2) {
                    if (isVegetableFood(f)) score += 10;
                    if (isBeanFood(f)) score += 4;
                    if (isBananaFood(f)) score -= 6;
                }
                if (isPenaltyFoodInCut(f)) score *= 0.8;
            }
            return score;
        };
        const fatRank = (f) => {
            const fat = Number(f.macros.fat_g) || 0;
            const protein = Number(f.macros.protein_g) || 0;
            const carbsVal = Number(f.macros.carbs_g) || 0;
            const quality = Number(f.qualityScore) || 0;
            let score = fat + quality * 10;
            if (protein >= 10) score += 12;
            if (protein > 0 && fat > 0) score += (protein / fat) * 4;
            if (isFatOnlyFood(f)) score -= 35;
            if (isOliveOilFood(f)) score -= 15;
            if (carbsVal > 0 && protein < 5) score -= 6;
            return score;
        };

        const topProteins = chooseTop(proteins, 6, proteinRank);
        const topCarbs = chooseTop(carbs, 6, carbRank);
        const topFats = fats.length ? chooseTop(fats, 4, fatRank) : [];
        const leanProteinCountAvailable = proteins.filter(isLeanProteinFood).length;
        const plannerDebugEnabled = globalThis.__ODE_VERBOSE_PLAN_LOGS !== false;
        const plannerTraceId = `planner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const plannerTrace = {
            traceId: plannerTraceId,
            inputs: {
                goal,
                goalRaw: String(goalRaw || ''),
                budgetMode: budgetModeForPlanner,
                isCutPhase,
                mealsPerDay,
                targets,
                mins,
                foodsCount: foodsToUse.length,
                proteinsCount: proteins.length,
                carbsCount: carbs.length,
                fatsCount: fats.length
            },
            gates: [],
            candidates: []
        };
        const addPlannerGate = (name, passed, details = {}) => {
            plannerTrace.gates.push({ name, passed: Boolean(passed), details });
        };
        const emitPlannerTraceLog = (decision = {}) => {
            if (!plannerDebugEnabled) return;
            try {
                console.groupCollapsed(`[MEAL_PLANNER][${plannerTraceId}] Gate walkthrough`);
                console.log('Inputs', plannerTrace.inputs);
                plannerTrace.gates.forEach((gate, idx) => {
                    const prefix = gate.passed ? 'PASS' : 'FAIL';
                    console.log(`Gate ${idx + 1}: ${prefix} ${gate.name}`, gate.details);
                });
                plannerTrace.candidates.forEach((candidate, idx) => {
                    console.groupCollapsed(`Candidate ${idx + 1}: ${candidate.label}`);
                    console.log(candidate);
                    console.groupEnd();
                });
                console.log('Final decision', decision);
                console.groupEnd();
            } catch {
                // ignore
            }
        };

        const SOFT_RELAX_PROFILES = [
            {
                key: 'strict',
                repeatProteinCap: 2,
                repeatCarbCap: 3,
                enforceFiberSourceRotation: true,
                enforceCarbFrontload: true,
                enforceFrontloadHardReject: true
            },
            {
                key: 'relaxed_soft',
                repeatProteinCap: 3,
                repeatCarbCap: 4,
                enforceFiberSourceRotation: false,
                enforceCarbFrontload: false,
                enforceFrontloadHardReject: false
            },
            {
                key: 'wide_soft',
                repeatProteinCap: 4,
                repeatCarbCap: 5,
                enforceFiberSourceRotation: false,
                enforceCarbFrontload: false,
                enforceFrontloadHardReject: false
            }
        ];
        let planCandidates = [];
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

        const buildPlanWithPairs = (pPair, cPair, softProfile = SOFT_RELAX_PROFILES[0]) => {
            const activeSoft = softProfile && typeof softProfile === 'object' ? softProfile : SOFT_RELAX_PROFILES[0];
            const meals = [];
            const running = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
            const usedProteins = new Set();
            const usedCarbs = new Set();
            const proteinMealUsage = {};
            const carbMealUsage = {};
            const cutReserved = isCutPhase ? buildCutReservedAssignments(foodsToUse, mealsPerDay) : null;
            let invalidCandidate = false;
            let invalidCutCandidate = false;
            const cutVegMeals = new Set();
            const cutBeanMeals = new Set();
            const cutOatMeals = new Set();
            const cutBeefMeals = new Set();
            const cutOliveOilMeals = new Set();
            let highFatProteinMealsUsed = 0;
            let wholeEggMealsUsed = 0;
            const oilMealsUsed = new Set();
            let oilServingsUsed = 0;
            let proteinCapPenaltyPoints = 0;
            let cutFiberSnapshot = null;
            const dailyFatCap = (Number(targets.fat_g) || 0) + cutFatOvershootG;
            const logCutCandidateRejection = (reason, details = {}) => {
                noteCutReject(reason);
                if (!cutDebug) return;
                console.debug('[CUT DEBUG] Rejected candidate', {
                    reason,
                    vegMealsCount: details?.snapshot?.vegCaps?.vegMealsCount,
                    vegMealsInSecondHalf: details?.snapshot?.vegCaps?.vegMealsInSecondHalf,
                    perMealProtein: details?.snapshot?.perMealProtein || [],
                    vegCaps: details?.snapshot?.vegCaps || null,
                    fiber: details?.snapshot?.fiber || null
                });
            };

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

                const proteinFood = (() => {
                    if (!isCutPhase) return (mealIdx % 2 === 0) ? pPair[0] : pPair[1];
                    const secondHalfStart = Math.ceil(mealsPerDay / 2);
                    const preferredProteinId = proteins.length >= 2
                        ? (mealIdx < secondHalfStart ? String(pPair[0]?.id || '') : String(pPair[1]?.id || ''))
                        : String(pPair[0]?.id || '');
                    const fatTargetTight = (Number(targets?.fat_g) || 0) <= CUT_TIGHT_FAT_TARGET_G;
                    const remainingFatTight = (Number(remaining?.fat_g) || 0) < (Math.max(1, remainingMeals) * CUT_FAT_PER_MEAL_BUFFER_G);
                    const enforceLeanBias = fatTargetTight || remainingFatTight;
                    const strictLeanMode = fatTargetTight && leanProteinCountAvailable >= CUT_STRICT_LEAN_MIN_OPTIONS;
                    const highFatProteinMaxMeals = strictLeanMode ? 0 : CUT_HIGH_FAT_PROTEIN_MAX_MEALS;
                    const canUseHighFatProtein = !fatTargetTight || highFatProteinMealsUsed < highFatProteinMaxMeals;
                    const canUseWholeEgg = !fatTargetTight || wholeEggMealsUsed < CUT_WHOLE_EGG_MAX_MEALS;
                    const rankedBase = topProteins.slice().sort((a, b) => {
                        let scoreA = proteinRank(a) - ((proteinMealUsage[a.id] || 0) * 12) + (String(a.id) === preferredProteinId ? 20 : 0);
                        let scoreB = proteinRank(b) - ((proteinMealUsage[b.id] || 0) * 12) + (String(b.id) === preferredProteinId ? 20 : 0);
                        if (enforceLeanBias) {
                            if (isLeanProteinFood(a)) scoreA += 30;
                            if (isLeanProteinFood(b)) scoreB += 30;
                            if (isHighFatProteinFood(a)) scoreA -= 70;
                            if (isHighFatProteinFood(b)) scoreB -= 70;
                            if (fatTargetTight && isWholeEggFood(a)) scoreA -= 45;
                            if (fatTargetTight && isWholeEggFood(b)) scoreB -= 45;
                            if (fatTargetTight && isHighFatProteinFood(a) && !canUseHighFatProtein) scoreA -= 700;
                            if (fatTargetTight && isHighFatProteinFood(b) && !canUseHighFatProtein) scoreB -= 700;
                            if (fatTargetTight && isWholeEggFood(a) && !canUseWholeEgg) scoreA -= 650;
                            if (fatTargetTight && isWholeEggFood(b) && !canUseWholeEgg) scoreB -= 650;
                        }
                        if (scoreB !== scoreA) return scoreB - scoreA;
                        return String(a.id).localeCompare(String(b.id));
                    });
                    const leanEligible = rankedBase.filter((p) => {
                        if (!enforceLeanBias) return true;
                        if (fatTargetTight && isHighFatProteinFood(p) && !canUseHighFatProtein) return false;
                        if (fatTargetTight && isWholeEggFood(p) && !canUseWholeEgg) return false;
                        return isLeanProteinFood(p);
                    });
                    const balancedEligible = rankedBase.filter((p) => {
                        if (fatTargetTight && isHighFatProteinFood(p) && !canUseHighFatProtein) return false;
                        if (fatTargetTight && isWholeEggFood(p) && !canUseWholeEgg) return false;
                        return true;
                    });
                    const ranked = leanEligible.length ? leanEligible : (balancedEligible.length ? balancedEligible : rankedBase);
                    return ranked[0] || ((mealIdx % 2 === 0) ? pPair[0] : pPair[1]);
                })();
                const carbFood = (() => {
                    if (!isCutPhase) return (mealIdx % 2 === 0) ? cPair[0] : cPair[1];
                    const reserved = cutReserved?.perMeal?.[mealIdx] || {};
                    if (reserved.forceBanana) {
                        const banana = foodsToUse.find((f) => String(f.id || '').toLowerCase() === 'banana_fresh_each')
                            || foodsToUse.find((f) => String(f.name || f.query || '').toLowerCase().includes('banana'));
                        if (banana) return banana;
                    }
                    const preferredCarbId = String((mealIdx % 2 === 0 ? cPair[0]?.id : cPair[1]?.id) || '');
                    const ranked = carbs.slice().sort((a, b) => {
                        const scoreA = carbRank(a, mealIdx) - ((carbMealUsage[a.id] || 0) * 10) + (String(a.id) === preferredCarbId ? 10 : 0);
                        const scoreB = carbRank(b, mealIdx) - ((carbMealUsage[b.id] || 0) * 10) + (String(b.id) === preferredCarbId ? 10 : 0);
                        if (scoreB !== scoreA) return scoreB - scoreA;
                        return String(a.id).localeCompare(String(b.id));
                    });
                    return ranked[0] || ((mealIdx % 2 === 0) ? cPair[0] : cPair[1]);
                })();

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

                if (isCutPhase) {
                    const reserved = cutReserved?.perMeal?.[mealIdx] || {};
                    const forceVegId = String(reserved.forceVegId || '').trim();
                    if (forceVegId) {
                        const vegFood = foodsToUse.find((f) => String(f.id || '') === forceVegId);
                        if (vegFood) {
                            const current = totalsForMeal(mealFoods);
                            const rem = {
                                calories: Math.max(0, remaining.calories - current.calories),
                                protein_g: Math.max(0, remaining.protein_g - current.protein_g),
                                carbs_g: Math.max(0, remaining.carbs_g - current.carbs_g),
                                fat_g: Math.max(0, remaining.fat_g - current.fat_g)
                            };
                            const maxVegStrict = maxServingsByRemaining(vegFood, rem);
                            const maxVeg = maxCutVegServingsByRemaining(vegFood, rem, maxVegStrict);
                            const targetVeg = forceVegId === 'spinach_chopped_frozen' ? 0.75 : 1.0;
                            const vegServ = clamp(targetVeg, 0, maxVeg);
                            addFoodToMeal(mealFoods, vegFood, vegServ, maxVeg);
                        }
                    }
                    if (reserved.allowSpinach && !mealFoods.some((f) => String(f.id || '') === 'spinach_chopped_frozen')) {
                        const spinach = foodsToUse.find((f) => String(f.id || '') === 'spinach_chopped_frozen');
                        if (spinach) {
                            const current = totalsForMeal(mealFoods);
                            const rem = {
                                calories: Math.max(0, remaining.calories - current.calories),
                                protein_g: Math.max(0, remaining.protein_g - current.protein_g),
                                carbs_g: Math.max(0, remaining.carbs_g - current.carbs_g),
                                fat_g: Math.max(0, remaining.fat_g - current.fat_g)
                            };
                            const maxSpinachStrict = maxServingsByRemaining(spinach, rem);
                            const maxSpinach = maxCutVegServingsByRemaining(spinach, rem, maxSpinachStrict);
                            const spinachServ = clamp(0.75, 0, Math.min(1.0, maxSpinach));
                            addFoodToMeal(mealFoods, spinach, spinachServ, maxSpinach);
                        }
                    }
                }

                // Optional fat (least priority): add only when we are materially behind on fat.
                if (topFats.length && remainingAfterProtein.fat_g > 0) {
                    const fatGapMeaningful = remaining.fat_g > (Math.max(8, remainingMeals * 5));
                    const explicitFatAllowedNow = remainingMeals <= 2 || fatGapMeaningful;
                    if (explicitFatAllowedNow) {
                        const afterPC = totalsForMeal(mealFoods);
                        const remainingAfterPC = {
                            calories: Math.max(0, remaining.calories - afterPC.calories),
                            protein_g: Math.max(0, remaining.protein_g - afterPC.protein_g),
                            carbs_g: Math.max(0, remaining.carbs_g - afterPC.carbs_g),
                            fat_g: Math.max(0, remaining.fat_g - afterPC.fat_g)
                        };

                        const fatCandidates = topFats.slice().sort((a, b) => {
                            const scoreA = fatRank(a) - ((cutOliveOilMeals.has(mealIdx) && isOliveOilFood(a)) ? 100 : 0);
                            const scoreB = fatRank(b) - ((cutOliveOilMeals.has(mealIdx) && isOliveOilFood(b)) ? 100 : 0);
                            if (scoreB !== scoreA) return scoreB - scoreA;
                            return String(a?.id || '').localeCompare(String(b?.id || ''));
                        });

                        for (const fatFood of fatCandidates) {
                            const isOilLike = isOliveOilFood(fatFood) || isFatOnlyFood(fatFood);
                            const isPureFat = isFatOnlyFood(fatFood);

                            if (isCutPhase && isOliveOilFood(fatFood) && hasHighFatProtein(mealFoods) && remaining.fat_g <= (targets.fat_g * 0.4)) {
                                continue;
                            }

                            if (isOilLike) {
                                if (!oilMealsUsed.has(mealIdx) && oilMealsUsed.size >= PLANNER_OIL_MAX_MEALS_PER_DAY) continue;
                                if (oilServingsUsed >= PLANNER_OIL_MAX_SERVINGS_PER_DAY) continue;
                            }

                            if (isPureFat) {
                                const fatDeficitMeaningful = remainingAfterPC.fat_g >= FAT_ONLY_MIN_REMAINING_FAT_G;
                                const calorieDeficitMeaningful = remainingAfterPC.calories >= FAT_ONLY_MIN_REMAINING_CALORIES;
                                const nearEndOfDay = remainingMeals <= 2;
                                if (!(nearEndOfDay && fatDeficitMeaningful && calorieDeficitMeaningful)) continue;
                            }

                            const fPer = Number(fatFood.macros.fat_g) || 0;
                            if (fPer <= 0) continue;
                            const desiredFat = Math.min(
                                remainingAfterPC.fat_g,
                                isPureFat ? 10 : 14
                            );
                            const fServRaw = desiredFat / fPer;
                            let fMax = maxServingsByRemaining(fatFood, remainingAfterPC);
                            const dayFatRemainingCap = Math.max(0, dailyFatCap - (running.fat_g + afterPC.fat_g));
                            fMax = Math.min(fMax, fPer > 0 ? (dayFatRemainingCap / fPer) : 0);

                            if (isOilLike) {
                                const oilServingsRemaining = Math.max(0, PLANNER_OIL_MAX_SERVINGS_PER_DAY - oilServingsUsed);
                                fMax = Math.min(fMax, oilServingsRemaining);
                            }

                            const fServ = clamp(fServRaw, 0, fMax);
                            if (!Number.isFinite(fServ) || fServ <= 0) continue;

                            const countBefore = mealFoods.length;
                            addFoodToMeal(mealFoods, fatFood, fServ, fMax);
                            const addedFat = mealFoods.length > countBefore ? mealFoods[mealFoods.length - 1] : null;
                            if (!addedFat) continue;

                            if (isCutPhase) {
                                const tbsp = servingToTbsp(addedFat, Number(addedFat.servings) || 0);
                                if (tbsp > 0 && tbsp < 0.5) {
                                    mealFoods.pop();
                                    continue;
                                }
                            }

                            if (isOilLike) {
                                oilServingsUsed += Number(addedFat.servings) || 0;
                                oilMealsUsed.add(mealIdx);
                            }
                            break;
                        }
                    }
                }

                let totals = totalsForMeal(mealFoods);
                if (isCutPhase) {
                    const minProteinThisMeal = 30;
                    if (totals.protein_g < minProteinThisMeal) {
                        // Deterministic rescue pass: attempt to patch low-protein meals with lean protein
                        // before rejecting the whole candidate.
                        const patchSteps = [0.25, 0.5, 0.75, 1.0];
                        const patchFood = topProteins.find((pf) => {
                            const p = Number(pf?.macros?.protein_g) || 0;
                            return p > 0;
                        }) || null;
                        if (patchFood) {
                            const currentTotals = totalsForMeal(mealFoods);
                            const remainingAfterMeal = {
                                calories: Math.max(0, remaining.calories - currentTotals.calories),
                                protein_g: Math.max(0, remaining.protein_g - currentTotals.protein_g),
                                carbs_g: Math.max(0, remaining.carbs_g - currentTotals.carbs_g),
                                fat_g: Math.max(0, remaining.fat_g - currentTotals.fat_g)
                            };
                            const patchMax = maxServingsByRemaining(patchFood, remainingAfterMeal);
                            for (const step of patchSteps) {
                                if (step > patchMax) continue;
                                addFoodToMeal(mealFoods, patchFood, step, patchMax);
                                totals = totalsForMeal(mealFoods);
                                if (totals.protein_g >= minProteinThisMeal) break;
                            }
                        }
                    }
                    if (totals.protein_g < minProteinThisMeal) {
                        invalidCutCandidate = true;
                        break;
                    }
                    if (totals.carbs_g > 25 && totals.protein_g < 30) {
                        invalidCutCandidate = true;
                        break;
                    }
                    const mealFiber = estimatedFiberForMeal(mealFoods);
                    if (mealFiber > 15) {
                        invalidCutCandidate = true;
                        break;
                    }

                    if (totals.protein_g > 55) {
                        proteinCapPenaltyPoints += 10;
                    }

                    if (mealFoods.some(isVegetableFood)) cutVegMeals.add(mealIdx);
                    if (mealFoods.some(isBeanFood)) cutBeanMeals.add(mealIdx);
                    if (mealFoods.some(isOatFood)) cutOatMeals.add(mealIdx);
                    if (mealFoods.some((f) => String(f?.id || '').toLowerCase() === 'ground_beef_80_20')) cutBeefMeals.add(mealIdx);
                    if (mealFoods.some(isOliveOilFood)) cutOliveOilMeals.add(mealIdx);
                }

                running.calories += totals.calories;
                running.protein_g += totals.protein_g;
                running.carbs_g += totals.carbs_g;
                running.fat_g += totals.fat_g;
                if (running.fat_g > dailyFatCap) {
                    invalidCandidate = true;
                    break;
                }

                mealFoods.forEach(f => {
                    if (f.type === 'protein') usedProteins.add(f.id);
                    if (f.type === 'carb') usedCarbs.add(f.id);
                });
                const proteinIdsThisMeal = new Set(mealFoods.filter((f) => String(f?.type || '').toLowerCase() === 'protein').map((f) => String(f.id)));
                const carbIdsThisMeal = new Set(mealFoods.filter((f) => String(f?.type || '').toLowerCase() === 'carb').map((f) => String(f.id)));
                proteinIdsThisMeal.forEach((id) => { proteinMealUsage[id] = (proteinMealUsage[id] || 0) + 1; });
                carbIdsThisMeal.forEach((id) => { carbMealUsage[id] = (carbMealUsage[id] || 0) + 1; });
                if (isCutPhase) {
                    const proteinFoodsInMeal = mealFoods.filter((f) => String(f?.type || '').toLowerCase() === 'protein');
                    if (proteinFoodsInMeal.some((f) => isHighFatProteinFood(f))) highFatProteinMealsUsed += 1;
                    if (proteinFoodsInMeal.some((f) => isWholeEggFood(f))) wholeEggMealsUsed += 1;
                }

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

            if (invalidCandidate) {
                return buildInvalidCandidate(isCutPhase, {
                    reason: 'DAILY_FAT_CAP_EXCEEDED_DURING_BUILD',
                    details: { dailyFatCap, runningFat: running.fat_g }
                });
            }

            const proteinMealCountsHard = {};
            const carbMealCountsHard = {};
            let produceServingsDay = 0;
            for (let idx = 0; idx < meals.length; idx++) {
                const meal = meals[idx];
                const totals = meal?.totals || {};
                const foods = Array.isArray(meal?.foods) ? meal.foods : [];
                const proteinIds = new Set();
                const carbIds = new Set();
                let hasProtein = false;
                let hasCarb = false;

                foods.forEach((item) => {
                    const src = foodsToUse.find((f) => String(f?.id || '') === String(item?.foodId || ''));
                    if (!src) return;
                    const type = String(src?.type || '').toLowerCase();
                    if (type === 'protein') {
                        hasProtein = true;
                        proteinIds.add(String(src.id || ''));
                    }
                    if (type === 'carb') {
                        hasCarb = true;
                        carbIds.add(String(src.id || ''));
                    }
                    if (isProduceFood(src)) {
                        produceServingsDay += Math.max(0, Number(item?.servings) || 0);
                    }
                });

                const isSnackMeal = (Number(totals.calories) || 0) <= 350 && (Number(totals.protein_g) || 0) >= 20;
                if (!isSnackMeal) {
                    if ((Number(totals.protein_g) || 0) < 25) return buildInvalidCandidate(isCutPhase, { reason: 'MEAL_PROTEIN_BELOW_25' });
                    if (!hasProtein || !hasCarb) return buildInvalidCandidate(isCutPhase, { reason: 'MEAL_MISSING_PROTEIN_OR_CARB' });
                } else if (!hasProtein) {
                    return buildInvalidCandidate(isCutPhase, { reason: 'SNACK_MISSING_PROTEIN' });
                }

                if (idx === meals.length - 1 && hasCarb && !hasProtein) {
                    return buildInvalidCandidate(isCutPhase, { reason: 'LAST_MEAL_CARB_ONLY' });
                }

                proteinIds.forEach((id) => { proteinMealCountsHard[id] = (proteinMealCountsHard[id] || 0) + 1; });
                carbIds.forEach((id) => { carbMealCountsHard[id] = (carbMealCountsHard[id] || 0) + 1; });
            }

            const repeatProteinCapHard = Math.max(2, Number(activeSoft?.repeatProteinCap) || 2);
            const repeatCarbCapHard = Math.max(3, Number(activeSoft?.repeatCarbCap) || 3);
            if (proteins.length >= 2 && Object.values(proteinMealCountsHard).some((count) => Number(count) > repeatProteinCapHard)) {
                return buildInvalidCandidate(isCutPhase, { reason: 'PROTEIN_REPEAT_CAP_EXCEEDED' });
            }
            if (carbs.length >= 2 && Object.values(carbMealCountsHard).some((count) => Number(count) > repeatCarbCapHard)) {
                return buildInvalidCandidate(isCutPhase, { reason: 'CARB_REPEAT_CAP_EXCEEDED' });
            }

            const dailyFiberEstimate = computeDailyFiberEstimateFromMeals(meals, foodsToUse, estimatedFiberForFood).totalFiber;
            if (produceServingsDay < 2 && dailyFiberEstimate < 25) {
                return buildInvalidCandidate(isCutPhase, {
                    reason: 'PRODUCE_OR_FIBER_MIN_NOT_MET',
                    details: { produceServingsDay, dailyFiberEstimate }
                });
            }

            if (isCutPhase) {
                const invalidCutResult = buildInvalidCandidate(true, { reason: 'CUT_PHASE_HARD_RULE_REJECT' });
                if (invalidCutCandidate) {
                    logCutCandidateRejection('per_meal_cut_rules', {
                        snapshot: {
                            vegCaps: computeCutVegCapsSnapshot(meals, foodsToUse),
                            fiber: null,
                            perMealProtein: meals.map((m) => Number(m?.totals?.protein_g) || 0)
                        }
                    });
                    return invalidCutResult;
                }

                if (cutBeanMeals.size > 2 || cutOatMeals.size > 2) {
                    if (activeSoft.enforceFiberSourceRotation) {
                        logCutCandidateRejection('fiber_source_rotation', {
                            snapshot: {
                                vegCaps: computeCutVegCapsSnapshot(meals, foodsToUse),
                                fiber: null,
                                perMealProtein: meals.map((m) => Number(m?.totals?.protein_g) || 0)
                            }
                        });
                        return invalidCutResult;
                    }
                    proteinCapPenaltyPoints += 12;
                }

                const oliveOilMaxMeals = getCutOliveOilMaxMeals(targets.fat_g);
                if (cutBeefMeals.size > 1 || cutOliveOilMeals.size > oliveOilMaxMeals) {
                    logCutCandidateRejection('fat_source_frequency', {
                        snapshot: {
                            vegCaps: computeCutVegCapsSnapshot(meals, foodsToUse),
                            fiber: null,
                            perMealProtein: meals.map((m) => Number(m?.totals?.protein_g) || 0)
                        }
                    });
                    return invalidCutResult;
                }
                const cutValidation = validateCutCandidateHardRules(meals, foodsToUse, {
                    estimatedFiberForFood,
                    isProteinFood,
                    spinachPerMealCap: CUT_SPINACH_MAX_SERV_PER_MEAL,
                    spinachPerDayCap: CUT_SPINACH_MAX_SERV_PER_DAY,
                    availableProteinCount: proteins.length,
                    availableCarbCount: carbs.length
                });
                if (!cutValidation.ok) {
                    logCutCandidateRejection(cutValidation.reason, cutValidation);
                    return invalidCutResult;
                }
                if ((Number(targets?.fat_g) || 0) <= CUT_TIGHT_FAT_TARGET_G && leanProteinCountAvailable >= CUT_STRICT_LEAN_MIN_OPTIONS && highFatProteinMealsUsed > 0) {
                    logCutCandidateRejection('tight_fat_mode_high_fat_protein_blocked', cutValidation);
                    return invalidCutResult;
                }
                cutFiberSnapshot = cutValidation.snapshot?.fiber || null;

                const cutDailyTotals = computeTotalsFromBuiltMeals(meals);
                if (meals.length >= 2 && cutDailyTotals.carbs_g > 0) {
                    const earlyCarbs = (Number(meals[0]?.totals?.carbs_g) || 0) + (Number(meals[1]?.totals?.carbs_g) || 0);
                        const earlyShare = earlyCarbs / Math.max(1, cutDailyTotals.carbs_g);
                        if (earlyShare < 0.5 || earlyShare > 0.6) {
                            if (activeSoft.enforceCarbFrontload) {
                                logCutCandidateRejection('carb_frontload_band', cutValidation);
                                return invalidCutResult;
                            }
                            proteinCapPenaltyPoints += 16;
                        }
                    }

                if (meals.length >= 2 && running.calories > 0) {
                    const earlyCalories = (Number(meals[0]?.totals?.calories) || 0) + (Number(meals[1]?.totals?.calories) || 0);
                    const earlyCalShare = earlyCalories / running.calories;
                    const frontLoadCheck = evaluateCutFrontLoad(earlyCalShare);
                    if (frontLoadCheck.hardReject) {
                        if (activeSoft.enforceFrontloadHardReject) {
                            logCutCandidateRejection('calorie_frontload_extreme', cutValidation);
                            return invalidCutResult;
                        }
                        proteinCapPenaltyPoints += 26;
                    } else {
                        proteinCapPenaltyPoints += frontLoadCheck.penaltyPoints;
                    }
                }

                const disciplineKey = String(profile?.key || profile?.discipline || profile || '').toLowerCase();
                const requiresPerformanceGuard = disciplineKey.includes('bodybuilding') || disciplineKey.includes('powerbuilding');
                if (requiresPerformanceGuard) {
                    const firstMeal = meals[0]?.totals || {};
                    if ((Number(firstMeal.protein_g) || 0) < 30 || (Number(firstMeal.carbs_g) || 0) < 30) {
                        logCutCandidateRejection('training_performance_guard', cutValidation);
                        return invalidCutResult;
                    }
                }

                const lastMealFoods = meals[meals.length - 1]?.foods || [];
                const oliveInLastMeal = lastMealFoods.some((item) => {
                    const src = foodsToUse.find(f => f.id === item.foodId);
                    return isOliveOilFood(src);
                });
                if (oliveInLastMeal) proteinCapPenaltyPoints += 10;
            }

            const dailyTotals = computeTotalsFromBuiltMeals(meals);

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

            const baseScore = scoreTotals(targets, dailyTotals, profile);
            let proteinSpreadPenaltyPoints = 0;
            let fiberPenaltyPoints = 0;
            let lateFatPenaltyPoints = 0;
            let lateMealCaloriePenaltyPoints = 0;
            let repeatCarbPenaltyPoints = 0;
            let repeatProteinPenaltyPoints = 0;
            let repeatVegPenaltyPoints = 0;
            let palatabilityPenaltyPoints = 0;
            let backToBackProteinPenaltyPoints = 0;
            let twoItemMealPenaltyPoints = 0;
            let oddServingPenaltyPoints = 0;

            if (isCutPhase && meals.length) {
                const proteinsByMeal = meals.map((m) => Number(m?.totals?.protein_g) || 0);
                const maxProtein = Math.max(...proteinsByMeal);
                const minProtein = Math.min(...proteinsByMeal);
                const proteinSpread = maxProtein - minProtein;
                if (dailyTotals.protein_g >= (targets.protein_g * 0.90) && proteinSpread > 35) {
                    proteinSpreadPenaltyPoints += 12 + (Math.ceil((proteinSpread - 35) / 10) * 6);
                }

                const dailyFiber = Number(cutFiberSnapshot?.totalFiber);
                const fallbackDailyFiber = computeDailyFiberEstimateFromMeals(meals, foodsToUse, estimatedFiberForFood).totalFiber;
                const finalDailyFiber = Number.isFinite(dailyFiber) ? dailyFiber : fallbackDailyFiber;
                if (finalDailyFiber > 45) fiberPenaltyPoints += 12;

                const finalMeal = meals[meals.length - 1]?.totals || {};
                const finalMealCalories = Number(finalMeal.calories) || 0;
                const finalMealFat = Number(finalMeal.fat_g) || 0;
                if (finalMealCalories < 300) lateMealCaloriePenaltyPoints += 18;
                if (finalMealCalories > 0) {
                    const fatCalShare = (finalMealFat * 9) / finalMealCalories;
                    if (fatCalShare > 0.40) lateFatPenaltyPoints += 18;
                }

                const proteinMealCounts = {};
                const carbMealCounts = {};
                meals.forEach((meal) => {
                    const mealProteinIds = new Set();
                    const mealCarbIds = new Set();
                    (meal?.foods || []).forEach((item) => {
                        const src = foodsToUse.find((f) => String(f?.id || '') === String(item?.foodId || ''));
                        if (!src) return;
                        const type = String(src?.type || '').toLowerCase();
                        if (type === 'protein') mealProteinIds.add(String(src.id));
                        if (type === 'carb') mealCarbIds.add(String(src.id));
                    });
                    mealProteinIds.forEach((id) => { proteinMealCounts[id] = (proteinMealCounts[id] || 0) + 1; });
                    mealCarbIds.forEach((id) => { carbMealCounts[id] = (carbMealCounts[id] || 0) + 1; });
                });
                Object.values(proteinMealCounts).forEach((count) => {
                    if (Number(count) >= 3) repeatProteinPenaltyPoints += 10;
                });
                Object.values(carbMealCounts).forEach((count) => {
                    if (Number(count) >= 3) repeatCarbPenaltyPoints += 10;
                });

                const vegMealCounts = {};
                meals.forEach((meal) => {
                    const mealVegIds = new Set();
                    const tinyProteinIds = new Set();
                    let mealVegOz = 0;
                    (meal?.foods || []).forEach((item) => {
                        const src = foodsToUse.find((f) => String(f?.id || '') === String(item?.foodId || ''));
                        if (!src) return;
                        if (isVegetableFood(src)) {
                            const vegId = String(src.id || '');
                            if (vegId) mealVegIds.add(vegId);
                            mealVegOz += itemOunces(item);
                        }
                        if (String(src?.type || '').toLowerCase() === 'protein') {
                            const servings = Number(item?.servings) || 0;
                            if (servings > 0 && servings < 0.75) tinyProteinIds.add(String(src.id || ''));
                        }
                    });
                    mealVegIds.forEach((id) => { vegMealCounts[id] = (vegMealCounts[id] || 0) + 1; });
                    if (mealVegOz > 12) palatabilityPenaltyPoints += 25;
                    if (tinyProteinIds.size > 2) palatabilityPenaltyPoints += 25;
                });
                Object.values(vegMealCounts).forEach((count) => {
                    if (Number(count) > 1) repeatVegPenaltyPoints += 12 * (Number(count) - 1);
                });
            }

            if (meals.length) {
                const mealMainProteinId = [];
                meals.forEach((meal) => {
                    const mealProteinTotals = {};
                    const foods = Array.isArray(meal?.foods) ? meal.foods : [];
                    foods.forEach((item) => {
                        const src = foodsToUse.find((f) => String(f?.id || '') === String(item?.foodId || ''));
                        if (String(src?.type || '').toLowerCase() !== 'protein') return;
                        const id = String(src?.id || '');
                        mealProteinTotals[id] = (mealProteinTotals[id] || 0) + (Number(item?.protein_g) || 0);
                    });
                    const sortedIds = Object.entries(mealProteinTotals).sort((a, b) => Number(b[1]) - Number(a[1]));
                    mealMainProteinId.push(sortedIds[0]?.[0] || '');

                    if (foods.length <= 2) twoItemMealPenaltyPoints += 6;
                    foods.forEach((item) => {
                        const s = Number(item?.servings) || 0;
                        if (s > 0) {
                            const quarters = s * 4;
                            if (Math.abs(quarters - Math.round(quarters)) > 1e-6) oddServingPenaltyPoints += 4;
                        }
                    });
                });

                for (let i = 1; i < mealMainProteinId.length; i++) {
                    const curr = String(mealMainProteinId[i] || '');
                    const prev = String(mealMainProteinId[i - 1] || '');
                    if (curr && prev && curr === prev) backToBackProteinPenaltyPoints += 10;
                }
            }

            let finalScore = baseScore;
            finalScore = applyPenalty(finalScore, proteinSpreadPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, fiberPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, proteinCapPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, lateFatPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, lateMealCaloriePenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, repeatCarbPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, repeatProteinPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, repeatVegPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, palatabilityPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, backToBackProteinPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, twoItemMealPenaltyPoints, scoreDirection);
            finalScore = applyPenalty(finalScore, oddServingPenaltyPoints, scoreDirection);

            if (enforceStrictCutHardRejects) {
                if (!cutServingMinimumsOk(meals)) {
                    return invalidCutResult;
                }
                if (!cutMacroToleranceOk(dailyTotals)) {
                    return invalidCutResult;
                }
            }

            return {
                meals,
                dailyTotals,
                score: finalScore,
                qualityScore,
                cost,
                meetsMin: meetsMin(dailyTotals),
                noOvershoot: isNoOvershoot(dailyTotals),
                varietyOk,
                uniqueFoodCount,
                totalGrams
            };
        };

        function hasCandidateShape(candidate) {
            return (
                Array.isArray(candidate?.meals) &&
                candidate.meals.length > 0 &&
                Number.isFinite(Number(candidate?.score)) &&
                Number.isFinite(Number(candidate?.dailyTotals?.calories)) &&
                Number.isFinite(Number(candidate?.dailyTotals?.protein_g)) &&
                Number.isFinite(Number(candidate?.dailyTotals?.carbs_g)) &&
                Number.isFinite(Number(candidate?.dailyTotals?.fat_g))
            );
        }

        function candidatePassesOvershootGate(candidate, options = {}) {
            if (!hasCandidateShape(candidate)) return false;
            const relaxed = Boolean(options?.relaxed);
            const overshootConfig = getPlannerOvershootConfig({
                isCutPhase,
                budgetMode: budgetModeForPlanner,
                relaxed
            });
            return passesPlannerOvershootGate({
                totals: candidate.dailyTotals || {},
                targets,
                overshootConfig
            });
        }

        function candidatePassesMinGate(candidate, options = {}) {
            if (!hasCandidateShape(candidate)) return false;
            const relaxed = Boolean(options?.relaxed);
            return passesPlannerMinimumGate({
                totals: candidate.dailyTotals || {},
                targets,
                relaxed
            });
        }

        function buildOvershootGateDiagnostic(candidate, overshootConfig, relaxed = false) {
            const totals = candidate?.dailyTotals || {};
            const caps = {
                caloriesCap: (Number(targets.calories) || 0) + (Number(overshootConfig?.caloriesOver) || 0),
                proteinCap: Math.ceil((Number(targets.protein_g) || 0) * (Number(overshootConfig?.proteinOverPct) || 1)),
                carbsCap: (Number(targets.carbs_g) || 0) + (Number(overshootConfig?.carbsOver) || 0),
                fatCap: (Number(targets.fat_g) || 0) + (Number(overshootConfig?.fatOver) || 0)
            };
            const checks = {
                calories: (Number(totals.calories) || 0) <= caps.caloriesCap,
                protein_g: (Number(totals.protein_g) || 0) <= caps.proteinCap,
                carbs_g: (Number(totals.carbs_g) || 0) <= caps.carbsCap,
                fat_g: (Number(totals.fat_g) || 0) <= caps.fatCap
            };
            return {
                relaxed,
                config: overshootConfig,
                equations: {
                    calories: `${Number(totals.calories) || 0} <= ${caps.caloriesCap}`,
                    protein_g: `${Number(totals.protein_g) || 0} <= ${caps.proteinCap}`,
                    carbs_g: `${Number(totals.carbs_g) || 0} <= ${caps.carbsCap}`,
                    fat_g: `${Number(totals.fat_g) || 0} <= ${caps.fatCap}`
                },
                checks,
                pass: checks.calories && checks.protein_g && checks.carbs_g && checks.fat_g
            };
        }

        const generateCandidatesForSoftProfile = (softProfile) => {
            const generated = [];
            pairsToTry.forEach((pPair) => {
                carbsToTry.forEach((cPair) => {
                    if (!pPair || !cPair) return;
                    const candidate = buildPlanWithPairs(pPair, cPair, softProfile);
                    if (isCutPhase && candidate?.cutRejected) return;
                    const pairLabel = {
                        proteinPair: [String(pPair?.[0]?.id || ''), String(pPair?.[1]?.id || '')],
                        carbPair: [String(cPair?.[0]?.id || ''), String(cPair?.[1]?.id || '')]
                    };
                    const strictCfg = getPlannerOvershootConfig({
                        isCutPhase,
                        budgetMode: budgetModeForPlanner,
                        relaxed: false
                    });
                    const relaxedCfg = getPlannerOvershootConfig({
                        isCutPhase,
                        budgetMode: budgetModeForPlanner,
                        relaxed: true
                    });
                    const hasShape = hasCandidateShape(candidate);
                    const strictOvershoot = hasShape ? buildOvershootGateDiagnostic(candidate, strictCfg, false) : { pass: false };
                    const strictMinsPass = hasShape ? passesPlannerMinimumGate({
                        totals: candidate.dailyTotals || {},
                        targets,
                        relaxed: false
                    }) : false;
                    const relaxedOvershoot = hasShape ? buildOvershootGateDiagnostic(candidate, relaxedCfg, true) : { pass: false };
                    const relaxedMinsPass = hasShape ? passesPlannerMinimumGate({
                        totals: candidate.dailyTotals || {},
                        targets,
                        relaxed: true
                    }) : false;
                    plannerTrace.candidates.push({
                        attempt: String(softProfile?.key || 'strict'),
                        label: `${pairLabel.proteinPair.join(' + ')} | ${pairLabel.carbPair.join(' + ')}`,
                        pairLabel,
                        hasShape,
                        cutRejected: Boolean(candidate?.cutRejected),
                        candidateReason: candidate?.debug?.reason || null,
                        totals: candidate?.dailyTotals || null,
                        score: Number(candidate?.score),
                        varietyOk: Boolean(candidate?.varietyOk),
                        strict: { overshoot: strictOvershoot, minsPass: strictMinsPass, pass: strictOvershoot.pass && strictMinsPass },
                        relaxed: { overshoot: relaxedOvershoot, minsPass: relaxedMinsPass, pass: relaxedOvershoot.pass && relaxedMinsPass }
                    });
                    generated.push(candidate);
                });
            });
            return generated;
        };

        const evaluatePoolWithGates = (candidates, attemptKey) => {
            const mode = String(budgetModeForPlanner || 'best').toLowerCase();
            const strictNoMinBand = {
                caloriesPct: mode === 'budget' ? 0.88 : 0.90,
                carbsPct: mode === 'budget' ? 0.85 : (mode === 'balanced' ? 0.88 : 0.90),
                fatSlackG: mode === 'budget' ? 12 : 10,
                proteinOverPct: mode === 'budget' ? 1.08 : 1.06,
                proteinOverG: mode === 'budget' ? 14 : 10
            };
            const relaxedNoMinBand = {
                caloriesPct: mode === 'budget' ? 0.84 : 0.87,
                carbsPct: mode === 'budget' ? 0.80 : 0.84,
                fatSlackG: mode === 'budget' ? 14 : 12,
                proteinOverPct: mode === 'budget' ? 1.10 : 1.08,
                proteinOverG: mode === 'budget' ? 18 : 14
            };
            const candidateInCloseBand = (candidate, band) => {
                if (!hasCandidateShape(candidate)) return false;
                const a = candidate.dailyTotals || {};
                const calFloor = (Number(targets?.calories) || 0) * (Number(band?.caloriesPct) || 0.9);
                const carbFloor = (Number(targets?.carbs_g) || 0) * (Number(band?.carbsPct) || 0.85);
                const proteinFloor = Number(mins?.protein_g) || 0;
                const fatFloor = Math.max(Number(mins?.fat_g) || 0, Math.max(0, (Number(targets?.fat_g) || 0) - (Number(band?.fatSlackG) || 10)));
                const proteinCap = Math.min(
                    Math.ceil((Number(targets?.protein_g) || 0) * (Number(band?.proteinOverPct) || 1.06)),
                    (Number(targets?.protein_g) || 0) + (Number(band?.proteinOverG) || 10)
                );
                return (
                    (Number(a?.calories) || 0) >= calFloor &&
                    (Number(a?.carbs_g) || 0) >= carbFloor &&
                    (Number(a?.protein_g) || 0) >= proteinFloor &&
                    (Number(a?.protein_g) || 0) <= proteinCap &&
                    (Number(a?.fat_g) || 0) >= fatFloor
                );
            };
            const strictUsable = candidates.filter((c) => candidatePassesOvershootGate(c, { relaxed: false }));
            const strictWithMins = strictUsable.filter((c) => candidatePassesMinGate(c, { relaxed: false }));
            const strictNoMinClose = strictUsable.filter((c) => !candidatePassesMinGate(c, { relaxed: false }) && candidateInCloseBand(c, strictNoMinBand));
            addPlannerGate(`Strict overshoot gate (${attemptKey})`, strictUsable.length > 0, {
                equation: 'totals <= target + strict overshoot caps',
                passed: strictUsable.length,
                failed: Math.max(0, candidates.length - strictUsable.length)
            });
            addPlannerGate(`Strict minimum gate (${attemptKey})`, strictWithMins.length > 0, {
                equation: 'totals >= target * (1 - MAX_MACRO_UNDERSHOOT)',
                passed: strictWithMins.length,
                failed: Math.max(0, strictUsable.length - strictWithMins.length)
            });
            addPlannerGate(`Strict no-min close-band (${attemptKey})`, strictNoMinClose.length > 0, {
                equation: 'strict no-min allowed only if close to target bands',
                passed: strictNoMinClose.length,
                failed: Math.max(0, strictUsable.length - strictWithMins.length - strictNoMinClose.length)
            });
            let branch = strictWithMins.length ? 'strict' : (strictNoMinClose.length ? 'strict_no_min_close' : 'strict_none');
            let pool = strictWithMins.length ? strictWithMins : strictNoMinClose;

            if (!pool.length && !isBestModePlanner) {
                const relaxedUsable = candidates.filter((c) => candidatePassesOvershootGate(c, { relaxed: true }));
                const relaxedWithMins = relaxedUsable.filter((c) => candidatePassesMinGate(c, { relaxed: true }));
                const relaxedNoMinClose = relaxedUsable.filter((c) => !candidatePassesMinGate(c, { relaxed: true }) && candidateInCloseBand(c, relaxedNoMinBand));
                addPlannerGate(`Relaxed overshoot gate (${attemptKey})`, relaxedUsable.length > 0, {
                    equation: 'totals <= target + relaxed overshoot caps',
                    passed: relaxedUsable.length,
                    failed: Math.max(0, candidates.length - relaxedUsable.length)
                });
                addPlannerGate(`Relaxed minimum gate (${attemptKey})`, relaxedWithMins.length > 0, {
                    equation: 'totals >= target * (1 - (MAX_MACRO_UNDERSHOOT + 0.05))',
                    passed: relaxedWithMins.length,
                    failed: Math.max(0, relaxedUsable.length - relaxedWithMins.length)
                });
                addPlannerGate(`Relaxed no-min close-band (${attemptKey})`, relaxedNoMinClose.length > 0, {
                    equation: 'relaxed no-min allowed only if close to target bands',
                    passed: relaxedNoMinClose.length,
                    failed: Math.max(0, relaxedUsable.length - relaxedWithMins.length - relaxedNoMinClose.length)
                });
                if (relaxedWithMins.length || relaxedNoMinClose.length) {
                    branch = relaxedWithMins.length ? 'relaxed' : 'relaxed_no_min_close';
                    pool = relaxedWithMins.length ? relaxedWithMins : relaxedNoMinClose;
                }
            }

            const varietyPool = pool.filter((c) => c.varietyOk);
            let final = reconfigureMinModeEnabled ? pool : (varietyPool.length ? varietyPool : pool);
            const finalBeforeAntiDeadlock = final;
            addPlannerGate(`Variety gate (${attemptKey})`, final.length > 0, {
                equation: reconfigureMinModeEnabled ? 'skip variety gate in reconfigure mode' : 'prefer varietyOk=true when available',
                selectionPool: pool.length,
                varietyPool: varietyPool.length,
                finalPool: final.length
            });

            const antiDeadlockPool = final.filter((candidate) => {
                const totals = candidate?.dailyTotals || {};
                const calUnder = (Number(targets?.calories) || 0) - (Number(totals?.calories) || 0);
                const carbUnder = (Number(targets?.carbs_g) || 0) - (Number(totals?.carbs_g) || 0);
                const proteinOver = (Number(totals?.protein_g) || 0) - (Number(targets?.protein_g) || 0);
                return !(proteinOver > 8 && calUnder > 120 && carbUnder > 20);
            });
            if (antiDeadlockPool.length) {
                final = antiDeadlockPool;
            }
            addPlannerGate(`Anti-deadlock preference (${attemptKey})`, antiDeadlockPool.length > 0, {
                equation: 'avoid protein-over + calorie-under + carb-under candidates when alternatives exist',
                candidatePool: finalBeforeAntiDeadlock.length,
                antiDeadlockPool: antiDeadlockPool.length
            });

            return { selectedBranch: branch, selectionPool: pool, varietyPool, finalPool: final };
        };

        const softProfilesToTry = isBestModePlanner ? [SOFT_RELAX_PROFILES[0]] : SOFT_RELAX_PROFILES;
        let selectedBranch = 'none';
        let selectionPool = [];
        let finalPool = [];
        let usedSoftProfile = softProfilesToTry[0] || SOFT_RELAX_PROFILES[0];

        for (const softProfile of softProfilesToTry) {
            const generated = generateCandidatesForSoftProfile(softProfile);
            addPlannerGate(`Candidate generation (${softProfile.key})`, generated.length > 0, {
                generatedCandidates: generated.length,
                pairsTried: pairsToTry.length * carbsToTry.length
            });
            const evaluated = evaluatePoolWithGates(generated, softProfile.key);
            planCandidates = generated;
            selectedBranch = evaluated.selectedBranch;
            selectionPool = evaluated.selectionPool;
            finalPool = evaluated.finalPool;
            usedSoftProfile = softProfile;
            if (finalPool.length) break;
        }

        if (!finalPool.length) {
            const recommendations = [];
            if (proteins.length < 2) recommendations.push('Add 1 lean protein source to increase feasible combinations.');
            if (carbs.length < 2) recommendations.push('Add 1 carb source (rice, oats, potatoes, or beans).');
            if (Number(mealsPerDay) > 3) recommendations.push('Try one fewer meal per day to increase serving flexibility.');
            if (!recommendations.length) recommendations.push('Use Best Performance tier or slightly widen soft constraints.');
            addPlannerGate('Final candidate available', false, {
                reason: 'No candidate passed strict/relaxed gates with current constraints.',
                softAttempt: String(usedSoftProfile?.key || 'strict')
            });
            emitPlannerTraceLog({
                selectedBranch: 'none',
                reason: 'No valid candidate after all gates',
                finalPoolSize: 0,
                softAttempt: String(usedSoftProfile?.key || 'strict'),
                recommendations
            });
            if (isCutPhase && cutDebug) {
                console.debug('[CUT DEBUG] No valid candidate. Reject reasons:', cutRejectStats || {});
            }
            const note = buildSaltWaterHydrationNote({
                goal,
                targets,
                profile,
                selections: nutritionState?.selections || {}
            });
            return {
                meals: [],
                dailyTotals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
                meta: {
                    notes: note ? [note] : [],
                    branch: 'none',
                    traceId: plannerTraceId,
                    softAttempt: String(usedSoftProfile?.key || 'strict'),
                    recommendations
                }
            };
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

        const buildMealItemFromFood = (food, servings) => {
            const s = Math.max(0, Number(servings) || 0);
            if (s <= 0) return null;
            const grams = Number.isFinite(food?.servingGrams)
                ? Math.round(food.servingGrams * s * 10) / 10
                : Math.round((Number(food?.macros?.serving_size) || 100) * s * 10) / 10;
            return {
                foodId: food.id,
                foodName: food.query || food.name,
                servings: Math.round(s * 100) / 100,
                grams,
                measurementText: `${Math.round(s * 100) / 100} servings`,
                calories: Math.floor((Number(food?.macros?.calories) || 0) * s),
                protein_g: Math.floor((Number(food?.macros?.protein_g) || 0) * s),
                carbs_g: Math.floor((Number(food?.macros?.carbs_g) || 0) * s),
                fat_g: Math.floor((Number(food?.macros?.fat_g) || 0) * s)
            };
        };

        const recomputeMealTotals = (meal) => {
            const foods = Array.isArray(meal?.foods) ? meal.foods : [];
            return {
                calories: foods.reduce((sum, item) => sum + (Number(item?.calories) || 0), 0),
                protein_g: foods.reduce((sum, item) => sum + (Number(item?.protein_g) || 0), 0),
                carbs_g: foods.reduce((sum, item) => sum + (Number(item?.carbs_g) || 0), 0),
                fat_g: foods.reduce((sum, item) => sum + (Number(item?.fat_g) || 0), 0)
            };
        };

        const applyPostPlanMacroRebalance = (bestCandidate) => {
            const srcMeals = Array.isArray(bestCandidate?.meals) ? bestCandidate.meals : [];
            if (!srcMeals.length) return { meals: srcMeals, dailyTotals: bestCandidate?.dailyTotals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, applied: false };

            const meals = srcMeals.map((meal) => ({
                ...meal,
                foods: Array.isArray(meal?.foods) ? meal.foods.map((item) => ({ ...item })) : []
            }));
            let totals = computeTotalsFromBuiltMeals(meals);
            const branchRelaxed = String(selectedBranch || '').startsWith('relaxed');
            const rebalanceOvershootConfig = getPlannerOvershootConfig({
                isCutPhase,
                budgetMode: budgetModeForPlanner,
                relaxed: branchRelaxed
            });
            const maxCalories = (targets.calories || 0) + (Number(rebalanceOvershootConfig?.caloriesOver) || 0);
            const maxCarbs = (targets.carbs_g || 0) + (Number(rebalanceOvershootConfig?.carbsOver) || 0);
            const maxFat = (targets.fat_g || 0) + (Number(rebalanceOvershootConfig?.fatOver) || 0);
            const targetProtein = Number(targets.protein_g) || 0;
            const proteinRebalanceBufferG = 5;
            const proteinRebalanceCeiling = targetProtein + proteinRebalanceBufferG;
            const softProteinCap = Math.ceil((targets.protein_g || 0) * (Number(rebalanceOvershootConfig?.proteinOverPct) || 1));
            const hardProteinCap = Math.max(
                softProteinCap + 20,
                Math.ceil((targets.protein_g || 0) * 1.30)
            );

            const withinHardCaps = (nextTotals) => (
                (Number(nextTotals?.calories) || 0) <= maxCalories &&
                (Number(nextTotals?.protein_g) || 0) <= hardProteinCap &&
                (Number(nextTotals?.carbs_g) || 0) <= maxCarbs &&
                (Number(nextTotals?.fat_g) || 0) <= maxFat
            );
            const capOverages = (srcTotals) => ({
                calories: Math.max(0, (Number(srcTotals?.calories) || 0) - maxCalories),
                protein_g: Math.max(0, (Number(srcTotals?.protein_g) || 0) - hardProteinCap),
                carbs_g: Math.max(0, (Number(srcTotals?.carbs_g) || 0) - maxCarbs),
                fat_g: Math.max(0, (Number(srcTotals?.fat_g) || 0) - maxFat)
            });
            const improvesOverages = (beforeTotals, afterTotals) => {
                const before = capOverages(beforeTotals);
                const after = capOverages(afterTotals);
                const nonWorse = (
                    after.calories <= before.calories &&
                    after.protein_g <= before.protein_g &&
                    after.carbs_g <= before.carbs_g &&
                    after.fat_g <= before.fat_g
                );
                const strictlyBetter = (
                    after.calories < before.calories ||
                    after.protein_g < before.protein_g ||
                    after.carbs_g < before.carbs_g ||
                    after.fat_g < before.fat_g
                );
                return nonWorse && strictlyBetter;
            };

            const mealStructureValid = () => {
                if (!Array.isArray(meals) || !meals.length) return false;
                for (let i = 0; i < meals.length; i += 1) {
                    const meal = meals[i];
                    const items = Array.isArray(meal?.foods) ? meal.foods : [];
                    if (!items.length) return false;
                    const mt = meal?.totals || recomputeMealTotals(meal);
                    const hasProtein = items.some((it) => String(foodById.get(String(it?.foodId || ''))?.type || '').toLowerCase() === 'protein');
                    const hasCarb = items.some((it) => String(foodById.get(String(it?.foodId || ''))?.type || '').toLowerCase() === 'carb');
                    const isSnackMeal = (Number(mt.calories) || 0) <= 350 && (Number(mt.protein_g) || 0) >= 20;
                    if (!isSnackMeal) {
                        if ((Number(mt.protein_g) || 0) < 25) return false;
                        if (!hasProtein || !hasCarb) return false;
                    } else if (!hasProtein) {
                        return false;
                    }
                    if (i === (meals.length - 1) && hasCarb && !hasProtein) return false;
                }
                return true;
            };

            const countFoodServingsDay = (foodId) => meals.reduce((sum, meal) => {
                const item = (meal?.foods || []).find((f) => String(f?.foodId || '') === String(foodId || ''));
                return sum + (Number(item?.servings) || 0);
            }, 0);
            const countFoodMealsDay = (foodId) => meals.reduce((sum, meal) => {
                const has = (meal?.foods || []).some((f) => String(f?.foodId || '') === String(foodId || ''));
                return sum + (has ? 1 : 0);
            }, 0);

            const tryApplyServingDelta = ({ mealIdx, food, deltaServings }) => {
                if (!Number.isFinite(mealIdx) || mealIdx < 0 || mealIdx >= meals.length) return false;
                if (!food || !Number.isFinite(deltaServings) || deltaServings === 0) return false;
                const meal = meals[mealIdx];
                const prevFoods = Array.isArray(meal?.foods) ? meal.foods.map((item) => ({ ...item })) : [];
                const prevTotals = { ...(meal?.totals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }) };

                const idx = (meal?.foods || []).findIndex((item) => String(item?.foodId || '') === String(food.id || ''));
                const currentServings = idx >= 0 ? (Number(meal.foods[idx]?.servings) || 0) : 0;
                const nextServingsRaw = currentServings + deltaServings;
                const isFatType = String(food?.type || '').toLowerCase() === 'fat';
                const step = isFatType ? 0.5 : 0.25;
                const nextServings = Math.round((nextServingsRaw / step)) * step;

                if (nextServings <= 0.05) {
                    if (idx >= 0) meal.foods.splice(idx, 1);
                    else return false;
                } else {
                    const rebuilt = buildMealItemFromFood(food, nextServings);
                    if (!rebuilt) return false;
                    if (idx >= 0) meal.foods[idx] = rebuilt;
                    else meal.foods.push(rebuilt);
                }

                meal.totals = recomputeMealTotals(meal);
                const nextTotals = computeTotalsFromBuiltMeals(meals);
                const isAdd = Number(deltaServings) > 0;
                if (isAdd && (Number(nextTotals?.protein_g) || 0) > proteinRebalanceCeiling) {
                    meal.foods = prevFoods;
                    meal.totals = prevTotals;
                    return false;
                }
                const hardCapsPass = withinHardCaps(nextTotals);
                const allowProgressiveTrim = Number(deltaServings) < 0 && !hardCapsPass && improvesOverages(totals, nextTotals);
                if ((!hardCapsPass && !allowProgressiveTrim) || !mealStructureValid()) {
                    meal.foods = prevFoods;
                    meal.totals = prevTotals;
                    return false;
                }
                totals = nextTotals;
                return true;
            };

            const carbRecoveryFoods = carbs
                .filter((f) => (Number(f?.macros?.carbs_g) || 0) >= 15 && (Number(f?.macros?.fat_g) || 0) <= 2.5)
                .sort((a, b) => {
                    const aTxt = `${String(a?.id || '').toLowerCase()} ${String(a?.name || '').toLowerCase()}`;
                    const bTxt = `${String(b?.id || '').toLowerCase()} ${String(b?.name || '').toLowerCase()}`;
                    const aRice = /rice/.test(aTxt) ? 1 : 0;
                    const bRice = /rice/.test(bTxt) ? 1 : 0;
                    if (aRice !== bRice) return bRice - aRice;
                    const aScore = (Number(a?.macros?.carbs_g) || 0) - ((Number(a?.macros?.fat_g) || 0) * 6) - ((Number(a?.macros?.protein_g) || 0) * 1.5);
                    const bScore = (Number(b?.macros?.carbs_g) || 0) - ((Number(b?.macros?.fat_g) || 0) * 6) - ((Number(b?.macros?.protein_g) || 0) * 1.5);
                    if (aScore !== bScore) return bScore - aScore;
                    return String(a?.id || '').localeCompare(String(b?.id || ''));
                });
            const preferredLowProteinCarbIds = new Set(['white_rice_dry', 'russet_potatoes', 'banana_fresh_each']);
            const proteinPer100Kcal = (food) => {
                const calories = Number(food?.macros?.calories) || 0;
                const protein = Number(food?.macros?.protein_g) || 0;
                if (calories <= 0) return Number.POSITIVE_INFINITY;
                return (protein * 100) / calories;
            };
            const lowProteinCarbRecoveryFoods = carbRecoveryFoods
                .filter((f) => proteinPer100Kcal(f) <= 5.0 || preferredLowProteinCarbIds.has(String(f?.id || '')))
                .sort((a, b) => {
                    const aId = String(a?.id || '');
                    const bId = String(b?.id || '');
                    const aPreferred = preferredLowProteinCarbIds.has(aId) ? 1 : 0;
                    const bPreferred = preferredLowProteinCarbIds.has(bId) ? 1 : 0;
                    if (aPreferred !== bPreferred) return bPreferred - aPreferred;
                    const aDensity = proteinPer100Kcal(a);
                    const bDensity = proteinPer100Kcal(b);
                    if (aDensity !== bDensity) return aDensity - bDensity;
                    const aCarbs = Number(a?.macros?.carbs_g) || 0;
                    const bCarbs = Number(b?.macros?.carbs_g) || 0;
                    if (aCarbs !== bCarbs) return bCarbs - aCarbs;
                    return aId.localeCompare(bId);
                });
            const fatRecoveryFoods = (topFats.length ? topFats : fats)
                .filter((f) => (Number(f?.macros?.fat_g) || 0) >= 4)
                .sort((a, b) => {
                    const af = Number(a?.macros?.fat_g) || 0;
                    const bf = Number(b?.macros?.fat_g) || 0;
                    const ap = Number(a?.macros?.protein_g) || 0;
                    const bp = Number(b?.macros?.protein_g) || 0;
                    if (bf !== af) return bf - af;
                    if (ap !== bp) return ap - bp;
                    return String(a?.id || '').localeCompare(String(b?.id || ''));
                });
            if (cutDebug) {
                console.debug('[MEAL_REBALANCE] Recovery pools', {
                    carbRecoveryCount: carbRecoveryFoods.length,
                    lowProteinCarbRecoveryCount: lowProteinCarbRecoveryFoods.length,
                    fatRecoveryCount: fatRecoveryFoods.length,
                    softProteinCap,
                    hardProteinCap
                });
            }

            const tryAddFat = () => {
                const lateStart = Math.floor(meals.length / 2);
                const candidates = meals
                    .map((meal, idx) => ({ idx, calories: Number(meal?.totals?.calories) || 0 }))
                    .filter((entry) => entry.idx >= lateStart)
                    .sort((a, b) => a.calories - b.calories);
                const fallback = meals
                    .map((meal, idx) => ({ idx, calories: Number(meal?.totals?.calories) || 0 }))
                    .sort((a, b) => a.calories - b.calories);
                const mealOrder = (candidates.length ? candidates : fallback).map((entry) => entry.idx);
                for (const mealIdx of mealOrder) {
                    for (const fatFood of fatRecoveryFoods) {
                        if (isOliveOilFood(fatFood)) {
                            const servingsUsed = countFoodServingsDay(fatFood.id);
                            const mealsUsed = countFoodMealsDay(fatFood.id);
                            const alreadyInMeal = (meals[mealIdx]?.foods || []).some((it) => String(it?.foodId || '') === String(fatFood.id || ''));
                            if (servingsUsed >= PLANNER_OIL_MAX_SERVINGS_PER_DAY) continue;
                            if (!alreadyInMeal && mealsUsed >= PLANNER_OIL_MAX_MEALS_PER_DAY) continue;
                        }
                        if (tryApplyServingDelta({ mealIdx, food: fatFood, deltaServings: 0.5 })) return true;
                    }
                }
                return false;
            };

            const tryAddCarb = () => {
                const proteinAtOrAboveTarget = (Number(totals?.protein_g) || 0) >= ((Number(targets?.protein_g) || 0) - 2);
                const proteinNearSoftCap = (Number(totals?.protein_g) || 0) >= (softProteinCap - 2);
                const useLowProteinOnly = (proteinAtOrAboveTarget || proteinNearSoftCap) && lowProteinCarbRecoveryFoods.length;
                const carbPool = useLowProteinOnly ? lowProteinCarbRecoveryFoods : carbRecoveryFoods;
                const mealOrder = meals
                    .map((meal, idx) => ({ idx, calories: Number(meal?.totals?.calories) || 0 }))
                    .sort((a, b) => a.calories - b.calories)
                    .map((entry) => entry.idx);
                for (const mealIdx of mealOrder) {
                    for (const carbFood of carbPool) {
                        if (tryApplyServingDelta({ mealIdx, food: carbFood, deltaServings: 0.5 })) return true;
                    }
                }
                return false;
            };

            const tryDeadlockRescueSwap = () => {
                const proteinOver = (Number(totals?.protein_g) || 0) - (Number(targets?.protein_g) || 0);
                const caloriesUnder = (Number(targets?.calories) || 0) - (Number(totals?.calories) || 0);
                if (proteinOver <= 8 || caloriesUnder <= 120) return false;
                if (!lowProteinCarbRecoveryFoods.length) return false;

                const mealOrder = meals
                    .map((meal, idx) => ({ idx, protein: Number(meal?.totals?.protein_g) || 0 }))
                    .sort((a, b) => b.protein - a.protein)
                    .map((entry) => entry.idx);

                for (const mealIdx of mealOrder) {
                    const items = Array.isArray(meals[mealIdx]?.foods) ? meals[mealIdx].foods : [];
                    const carbItems = items
                        .map((item) => ({ item, src: foodById.get(String(item?.foodId || '')) }))
                        .filter((entry) => String(entry?.src?.type || '').toLowerCase() === 'carb');
                    for (const entry of carbItems) {
                        const currentFood = entry.src;
                        if (!currentFood) continue;
                        const currentServings = Number(entry.item?.servings) || 0;
                        const currentCarbPerServ = Number(currentFood?.macros?.carbs_g) || 0;
                        const currentCarbDensity = proteinPer100Kcal(currentFood);
                        if (currentCarbPerServ <= 0 || currentServings <= 0) continue;

                        for (const replacement of lowProteinCarbRecoveryFoods) {
                            if (String(replacement?.id || '') === String(currentFood?.id || '')) continue;
                            const replacementDensity = proteinPer100Kcal(replacement);
                            if (replacementDensity >= currentCarbDensity) continue;
                            const replCarbPerServ = Number(replacement?.macros?.carbs_g) || 0;
                            if (replCarbPerServ <= 0) continue;
                            const targetCarbFromItem = currentCarbPerServ * currentServings;
                            const replacementServingsRaw = targetCarbFromItem / replCarbPerServ;
                            const replacementServings = Math.max(0.25, Math.round(replacementServingsRaw / 0.25) * 0.25);
                            if (!Number.isFinite(replacementServings) || replacementServings <= 0) continue;

                            const meal = meals[mealIdx];
                            const prevFoods = Array.isArray(meal?.foods) ? meal.foods.map((it) => ({ ...it })) : [];
                            const prevTotals = { ...(meal?.totals || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }) };
                            const replaceIdx = (meal?.foods || []).findIndex((it) => String(it?.foodId || '') === String(currentFood?.id || ''));
                            if (replaceIdx < 0) continue;

                            const rebuilt = buildMealItemFromFood(replacement, replacementServings);
                            if (!rebuilt) continue;
                            meal.foods[replaceIdx] = rebuilt;
                            meal.totals = recomputeMealTotals(meal);
                            const nextTotals = computeTotalsFromBuiltMeals(meals);
                            const progress = (
                                (Number(nextTotals?.protein_g) || 0) < (Number(totals?.protein_g) || 0) &&
                                (Number(nextTotals?.calories) || 0) >= ((Number(totals?.calories) || 0) - 90)
                            );
                            const capOk = withinHardCaps(nextTotals) || improvesOverages(totals, nextTotals);
                            if (progress && capOk && mealStructureValid()) {
                                totals = nextTotals;
                                return true;
                            }
                            meal.foods = prevFoods;
                            meal.totals = prevTotals;
                        }
                    }
                }
                return false;
            };

            const tryTrimProtein = (preferLean = true) => {
                const candidates = [];
                meals.forEach((meal, mealIdx) => {
                    (meal?.foods || []).forEach((item) => {
                        const src = foodById.get(String(item?.foodId || ''));
                        if (!src) return;
                        if (String(src?.type || '').toLowerCase() !== 'protein') return;
                        const fatRatio = proteinFatRatio(src);
                        const idText = String(src?.id || '').toLowerCase();
                        const isPreferredTrim = idText.includes('tilapia') || idText.includes('chicken_breast');
                        // When fat is low, trim lean proteins first. If fat is high, trim fattier proteins first.
                        const leanBias = preferLean ? (fatRatio <= 0.35 ? 2 : 0) : (fatRatio >= 0.6 ? 2 : 0);
                        const trimPriority = isPreferredTrim ? 8 : 0;
                        const rank = trimPriority + leanBias + ((Number(item?.protein_g) || 0) / 10);
                        candidates.push({ mealIdx, src, rank });
                    });
                });
                candidates.sort((a, b) => b.rank - a.rank);
                for (const candidate of candidates) {
                    if (tryApplyServingDelta({ mealIdx: candidate.mealIdx, food: candidate.src, deltaServings: -0.25 })) return true;
                }
                return false;
            };

            const tryTrimProteinToCeiling = () => {
                let changed = false;
                let guard = 0;
                while ((Number(totals?.protein_g) || 0) > proteinRebalanceCeiling && guard < 40) {
                    const dFNow = (Number(targets.fat_g) || 0) - (Number(totals?.fat_g) || 0);
                    const trimmed = tryTrimProtein(dFNow > 0);
                    if (!trimmed) break;
                    changed = true;
                    guard += 1;
                }
                return changed;
            };

            let applied = false;
            for (let i = 0; i < 120; i += 1) {
                const dCal = (Number(targets.calories) || 0) - (Number(totals.calories) || 0);
                const dP = (Number(targets.protein_g) || 0) - (Number(totals.protein_g) || 0);
                const dC = (Number(targets.carbs_g) || 0) - (Number(totals.carbs_g) || 0);
                const dF = (Number(targets.fat_g) || 0) - (Number(totals.fat_g) || 0);
                const done = (
                    Math.abs(dCal) <= 40 &&
                    dP >= -proteinRebalanceBufferG &&
                    dP <= 12 &&
                    Math.abs(dC) <= 15 &&
                    Math.abs(dF) <= 6
                );
                if (done) break;

                let changed = false;

                // Rescue order: trim protein overshoot first, then restore fat, then fill carbs/calories.
                if (!changed && (Number(totals?.protein_g) || 0) > proteinRebalanceCeiling) changed = tryTrimProteinToCeiling();
                if (!changed && dP < -8) changed = tryTrimProtein(dF > 0);
                if (!changed && dP < -16) changed = tryTrimProtein(dF > 0);
                if (!changed && dP < -8 && dCal > 120) changed = tryDeadlockRescueSwap();
                if (!changed && dF > 3) changed = tryAddFat();
                if (!changed && (dC > 10 || dCal > 90)) changed = tryAddCarb();
                if (!changed && dCal > 60 && dF > 1) changed = tryAddFat();
                if (!changed && dCal > 60) changed = tryAddCarb();

                if (!changed) break;
                applied = true;
            }

            return { meals, dailyTotals: totals, applied };
        };

        const best = finalPool[0];
        addPlannerGate('Winner selected', true, {
            selectedBranch,
            softAttempt: String(usedSoftProfile?.key || 'strict'),
            finalPoolSize: finalPool.length,
            bestScore: Number(best?.score),
            bestTotals: best?.dailyTotals || null
        });
        const topUpResult = applyPostPlanMacroRebalance(best);
        const finalMeals = topUpResult.meals;
        const finalDailyTotals = topUpResult.dailyTotals;
        const dailyCost = Math.round(best.cost * 100) / 100;
        if (isCutPhase && cutDebug) {
            const bestMeals = Array.isArray(best?.meals) ? best.meals : [];
            const perMealProtein = bestMeals.map((m) => Number(m?.totals?.protein_g) || 0);
            const vegCapsSnapshot = computeCutVegCapsSnapshot(bestMeals, foodsToUse);
            const perMealVegFoodIds = vegCapsSnapshot.perMealVegFoodIds;
            const vegMealsCount = vegCapsSnapshot.vegMealsCount;
            const vegMealsInSecondHalf = vegCapsSnapshot.vegMealsInSecondHalf;
            const fiberSnapshot = computeDailyFiberEstimateFromMeals(bestMeals, foodsToUse, estimatedFiberForFood);
            console.debug('[CUT DEBUG] Selected candidate summary:', {
                vegMealsCount,
                vegMealsInSecondHalf,
                perMealVegFoodIds,
                missingFoods: fiberSnapshot.missingFoodIds,
                fiberEstimate: fiberSnapshot.totalFiber,
                spinachServingsDay: vegCapsSnapshot.spinachServingsDay,
                perMealSpinachServings: vegCapsSnapshot.perMealSpinachServings,
                mixedVegMealsCount: vegCapsSnapshot.mixedVegMealsCount,
                spinachUsed: vegCapsSnapshot.spinachUsed,
                bananaServingsDay: vegCapsSnapshot.bananaServingsDay,
                perMealProtein,
                rejects: cutRejectStats
            });
        }
        const note = buildSaltWaterHydrationNote({
            goal,
            targets,
            profile,
            selections: nutritionState?.selections || {}
        });
        emitPlannerTraceLog({
            selectedBranch,
            softAttempt: String(usedSoftProfile?.key || 'strict'),
            finalPoolSize: finalPool.length,
            selectedTotals: finalDailyTotals,
            carbTopUpApplied: Boolean(topUpResult?.applied)
        });
        return {
            meals: finalMeals,
            dailyTotals: finalDailyTotals,
            dailyCost,
            varietyOk: best.varietyOk,
            meta: {
                notes: note ? [note] : [],
                carbTopUpApplied: topUpResult.applied,
                branch: selectedBranch,
                traceId: plannerTraceId,
                softAttempt: String(usedSoftProfile?.key || 'strict')
            }
        };
    }

    function buildLegacyFallbackMeals(selectedFoods, macroTargets, mealsPerDay, goalRaw) {
        const foods = Array.isArray(selectedFoods) ? selectedFoods : [];
        if (!foods.length) return null;

        const classifyType = (f) => {
            const explicit = String(f?.type || '').toLowerCase();
            if (explicit === 'protein' || explicit === 'carb' || explicit === 'fat') return explicit;
            const cat = String(f?.category || '').toLowerCase();
            if (cat.includes('carb') && cat.includes('protein')) return 'carb';
            if (cat.includes('protein')) return 'protein';
            if (cat.includes('carb')) return 'carb';
            if (cat.includes('fat')) return 'fat';
            return 'other';
        };

        const proteins = foods.filter((f) => classifyType(f) === 'protein');
        const carbs = foods.filter((f) => classifyType(f) === 'carb');
        const fats = foods.filter((f) => classifyType(f) === 'fat');
        if (!proteins.length || !carbs.length) return null;

        const daysMeals = Math.max(2, Math.min(6, Number(mealsPerDay) || 4));
        const targets = {
            calories: Math.max(0, Number(macroTargets?.calories) || 0),
            protein_g: Math.max(0, Number(macroTargets?.protein_g) || 0),
            carbs_g: Math.max(0, Number(macroTargets?.carbs_g) || 0),
            fat_g: Math.max(0, Number(macroTargets?.fat_g) || 0)
        };
        const perMeal = {
            calories: targets.calories / daysMeals,
            protein_g: targets.protein_g / daysMeals,
            carbs_g: targets.carbs_g / daysMeals,
            fat_g: targets.fat_g / daysMeals
        };
        const fallbackIsCutPhase = isCutGoalLike(goalRaw, normalizeGoal(goalRaw));
        const fallbackFatCap = targets.fat_g + (fallbackIsCutPhase ? 2 : 0);
        const fallbackOilMaxServingsPerDay = 1.5;
        const fallbackOilMaxMealsPerDay = 1;
        const fallbackFatOnlyMinRemainingFat = fallbackIsCutPhase ? 12 : 15;
        const fallbackFatOnlyMinRemainingCalories = fallbackIsCutPhase ? 220 : 260;
        const fallbackProteinFatRatio = (food) => {
            const p = Math.max(0, Number(food?.macros?.protein_g) || 0);
            const fat = Math.max(0, Number(food?.macros?.fat_g) || 0);
            if (p <= 0) return Number.POSITIVE_INFINITY;
            return fat / p;
        };
        const fallbackLeanProteins = proteins.filter((food) => fallbackProteinFatRatio(food) <= 0.35);
        const fallbackStrictLeanMode = fallbackIsCutPhase && (Number(targets?.fat_g) || 0) <= 75 && fallbackLeanProteins.length >= 1;
        const proteinPool = fallbackStrictLeanMode ? fallbackLeanProteins : proteins;

        const stepForType = (type) => type === 'fat' ? 0.5 : 0.25;
        const roundServ = (s, type) => {
            const step = stepForType(type);
            return Math.max(step, Math.round((Number(s) || 0) / step) * step);
        };
        const safePer = (f, key) => Math.max(0, Number(f?.macros?.[key]) || 0);
        const computeServings = (targetG, perServingG, fallback) => {
            if (!Number.isFinite(perServingG) || perServingG <= 0) return fallback;
            return targetG / perServingG;
        };
        const buildItem = (food, servings) => {
            const s = Math.max(0, Number(servings) || 0);
            if (s <= 0) return null;
            const calories = Math.floor(safePer(food, 'calories') * s);
            const protein_g = Math.floor(safePer(food, 'protein_g') * s);
            const carbs_g = Math.floor(safePer(food, 'carbs_g') * s);
            const fat_g = Math.floor(safePer(food, 'fat_g') * s);
            const grams = Number.isFinite(Number(food?.servingGrams)) ? Math.round(Number(food.servingGrams) * s * 10) / 10 : null;
            return {
                foodId: String(food?.id || ''),
                foodName: String(food?.query || food?.name || 'Food'),
                servings: Math.round(s * 100) / 100,
                grams,
                measurementText: `${Math.round(s * 100) / 100} servings`,
                calories,
                protein_g,
                carbs_g,
                fat_g
            };
        };
        const mealTotals = (items) => ({
            calories: items.reduce((sum, i) => sum + (Number(i?.calories) || 0), 0),
            protein_g: items.reduce((sum, i) => sum + (Number(i?.protein_g) || 0), 0),
            carbs_g: items.reduce((sum, i) => sum + (Number(i?.carbs_g) || 0), 0),
            fat_g: items.reduce((sum, i) => sum + (Number(i?.fat_g) || 0), 0)
        });
        const isFallbackOilFood = (food) => {
            const text = `${String(food?.id || '').toLowerCase()} ${String(food?.name || '').toLowerCase()}`;
            return text.includes('olive_oil') || text.includes('olive oil') || text.includes(' oil');
        };
        const isFallbackFatOnlyFood = (food) => {
            const fat = safePer(food, 'fat_g');
            const protein = safePer(food, 'protein_g');
            const carbsVal = safePer(food, 'carbs_g');
            return fat >= 6 && protein < 5 && carbsVal < 5;
        };

        const meals = [];
        let totalCost = 0;
        let fallbackRunningCalories = 0;
        let fallbackRunningFat = 0;
        let fallbackOilServingsUsed = 0;
        const fallbackOilMealsUsed = new Set();
        for (let i = 0; i < daysMeals; i++) {
            const proteinFood = proteinPool[i % proteinPool.length];
            const carbFood = carbs[i % carbs.length];
            const fatFood = fats.length ? fats[i % fats.length] : null;

            const proteinType = classifyType(proteinFood);
            const carbType = classifyType(carbFood);

            const pServRaw = computeServings(perMeal.protein_g, safePer(proteinFood, 'protein_g'), 1.0);
            const cServRaw = computeServings(perMeal.carbs_g, safePer(carbFood, 'carbs_g'), 1.0);
            const fServRawBase = fatFood
                ? computeServings(perMeal.fat_g, safePer(fatFood, 'fat_g'), 0.5)
                : 0;

            const pServ = Math.min(4, roundServ(clamp(pServRaw, 0.5, 4), proteinType));
            const cServ = Math.min(5, roundServ(clamp(cServRaw, 0.5, 5), carbType));
            let fServ = 0;

            const foodsInMeal = [];
            const pItem = buildItem(proteinFood, pServ);
            if (pItem) foodsInMeal.push(pItem);
            const cItem = buildItem(carbFood, cServ);
            if (cItem) foodsInMeal.push(cItem);
            if (fatFood) {
                const mealBaseTotals = mealTotals(foodsInMeal);
                const perFatServing = safePer(fatFood, 'fat_g');
                const dayFatRemaining = Math.max(0, fallbackFatCap - (fallbackRunningFat + mealBaseTotals.fat_g));
                const dayCaloriesRemaining = Math.max(0, targets.calories - (fallbackRunningCalories + mealBaseTotals.calories));
                const mealsRemaining = daysMeals - i;
                const explicitFatAllowed = mealsRemaining <= 2 || dayFatRemaining > Math.max(8, mealsRemaining * 5);
                const isOilLike = isFallbackOilFood(fatFood) || isFallbackFatOnlyFood(fatFood);
                const isPureFat = isFallbackFatOnlyFood(fatFood);

                if (explicitFatAllowed && perFatServing > 0 && dayFatRemaining > 0) {
                    let fServMax = Math.min(3, dayFatRemaining / perFatServing);
                    if (isOilLike) {
                        if (!fallbackOilMealsUsed.has(i) && fallbackOilMealsUsed.size >= fallbackOilMaxMealsPerDay) {
                            fServMax = 0;
                        } else {
                            fServMax = Math.min(fServMax, Math.max(0, fallbackOilMaxServingsPerDay - fallbackOilServingsUsed));
                        }
                    }

                    if (isPureFat) {
                        const fatDeficitMeaningful = dayFatRemaining >= fallbackFatOnlyMinRemainingFat;
                        const calorieDeficitMeaningful = dayCaloriesRemaining >= fallbackFatOnlyMinRemainingCalories;
                        if (!(mealsRemaining <= 2 && fatDeficitMeaningful && calorieDeficitMeaningful)) {
                            fServMax = 0;
                        }
                    }

                    const raw = clamp(fServRawBase, 0, fServMax);
                    if (raw > 0) fServ = Math.min(3, roundServ(raw, 'fat'));
                    if (fServ > fServMax) fServ = Math.max(0, fServMax);
                    if (fServ > 0) {
                        const fItem = buildItem(fatFood, fServ);
                        if (fItem) {
                            foodsInMeal.push(fItem);
                            if (isOilLike) {
                                fallbackOilMealsUsed.add(i);
                                fallbackOilServingsUsed += Number(fItem.servings) || 0;
                            }
                        }
                    }
                }
            }

            const totals = mealTotals(foodsInMeal);
            fallbackRunningCalories += totals.calories;
            fallbackRunningFat += totals.fat_g;
            meals.push({
                id: `meal_${i + 1}`,
                title: `Meal ${i + 1}`,
                foods: foodsInMeal,
                totals
            });

            foodsInMeal.forEach((item) => {
                const src = foods.find((f) => String(f?.id || '') === String(item?.foodId || ''));
                const pps = Number(src?.pricePerServing);
                if (Number.isFinite(pps) && pps >= 0) {
                    totalCost += pps * (Number(item?.servings) || 0);
                }
            });
        }

        const dailyTotals = computeTotalsFromBuiltMeals(meals);
        if (!Array.isArray(meals) || !meals.length) return null;
        if (!Number.isFinite(Number(dailyTotals?.calories))) return null;

        return {
            meals,
            dailyTotals,
            dailyCost: Math.round(totalCost * 100) / 100,
            varietyOk: true,
            meta: {
                notes: ['Fallback planner used to keep plan generation available.'],
                fallbackPlanner: true,
                fallbackForGoal: String(goalRaw || '').toUpperCase()
            }
        };
    }

    function buildAllMealsGuarded(selectedFoods, macroTargets, mealsPerDay, goalRaw, weightLbs, discipline) {
        if (GROCERY_INTEGRATION_ERROR) return GROCERY_INTEGRATION_ERROR;
        const guardBudgetMode = getActiveBudgetModeFromSession();
        const guardIsCutPhase = isCutGoalLike(goalRaw, normalizeGoal(goalRaw));
        const guardTraceId = `guard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const guardLogEnabled = globalThis.__ODE_VERBOSE_PLAN_LOGS !== false;
        const guardSteps = [];
        const addGuardStep = (gate, passed, details = {}) => {
            guardSteps.push({ gate, passed: Boolean(passed), details });
        };
        const emitGuardTrace = (decision = {}) => {
            if (!guardLogEnabled) return;
            try {
                console.groupCollapsed(`[MEAL_PLANNER_GUARD][${guardTraceId}] Gate-by-gate`);
                console.log('Inputs', {
                    guardBudgetMode,
                    guardIsCutPhase,
                    macroTargets,
                    mealsPerDay,
                    goalRaw,
                    weightLbs
                });
                guardSteps.forEach((step, idx) => {
                    const prefix = step.passed ? 'PASS' : 'FAIL';
                    console.log(`Guard ${idx + 1}: ${prefix} ${step.gate}`, step.details);
                });
                console.log('Decision', decision);
                console.groupEnd();
            } catch {
                // ignore
            }
        };
        const applyGuardMacroClosure = (plan, label) => {
            if (!plan || plan?.error) return plan;
            if (!Array.isArray(plan?.meals) || !plan.meals.length) return plan;
            const before = {
                calories: Number(plan?.dailyTotals?.calories) || 0,
                protein_g: Number(plan?.dailyTotals?.protein_g) || 0,
                carbs_g: Number(plan?.dailyTotals?.carbs_g) || 0,
                fat_g: Number(plan?.dailyTotals?.fat_g) || 0
            };
            const closed = enforceMacroClosureWithStaples(plan, selectedFoods, macroTargets, { label });
            const after = {
                calories: Number(closed?.dailyTotals?.calories) || 0,
                protein_g: Number(closed?.dailyTotals?.protein_g) || 0,
                carbs_g: Number(closed?.dailyTotals?.carbs_g) || 0,
                fat_g: Number(closed?.dailyTotals?.fat_g) || 0
            };
            addGuardStep('Macro closure pass', true, {
                label,
                equation: 'trim protein to target+5g first, then fill fats/carbs/calories with oil/rice',
                before,
                after
            });
            try {
                console.info('[PLAN_GENERATION][MACRO_CLOSURE]', { label, before, after });
            } catch {
                // ignore
            }
            return closed;
        };

        let result;
        try {
            addGuardStep('Invoke buildAllMeals()', true, {
                equation: 'planner(selectedFoods, macroTargets, mealsPerDay, goal, bodyweight, discipline)'
            });
            result = buildAllMeals(selectedFoods, macroTargets, mealsPerDay, goalRaw, weightLbs, discipline);
        } catch (err) {
            addGuardStep('Invoke buildAllMeals()', false, { error: err?.message || String(err) });
            emitGuardTrace({
                final: 'error',
                reason: err?.message || 'Meal build threw while integrating groceries.'
            });
            return {
                error: 'INVALID_GROCERY_INTEGRATION',
                reason: err?.message || 'Meal build threw while integrating groceries.',
                debug: { guardTraceId, guardSteps }
            };
        }
        const plannerRecommendations = Array.isArray(result?.meta?.recommendations)
            ? result.meta.recommendations.filter((line) => typeof line === 'string' && line.trim())
            : [];

        const meals = Array.isArray(result?.meals) ? result.meals : null;
        const dailyTotals = result?.dailyTotals || {};
        const validTotals = ['calories', 'protein_g', 'carbs_g', 'fat_g'].every((key) => Number.isFinite(Number(dailyTotals[key])));
        addGuardStep('Result shape check', Boolean(meals), {
            hasMealsArray: Array.isArray(meals),
            mealsLength: Array.isArray(meals) ? meals.length : null
        });

        if (!meals) {
            emitGuardTrace({
                final: 'error',
                reason: 'Meal result shape invalid.'
            });
            return {
                error: 'INVALID_GROCERY_INTEGRATION',
                reason: 'Meal result shape invalid.',
                debug: { guardTraceId, guardSteps }
            };
        }
        if (selectedFoods?.length && meals.length === 0) {
            addGuardStep('Primary planner produced meals', false, {
                equation: 'selectedFoods.length > 0 AND result.meals.length > 0',
                selectedFoodsCount: Array.isArray(selectedFoods) ? selectedFoods.length : 0
            });
            const fallback = buildLegacyFallbackMeals(selectedFoods, macroTargets, mealsPerDay, goalRaw);
            if (fallback && Array.isArray(fallback.meals) && fallback.meals.length) {
                addGuardStep('Legacy fallback generated meals', true, {
                    fallbackMealsLength: fallback.meals.length
                });
                const fallbackTotals = fallback.dailyTotals || {};
                // Fallback is an emergency path: always evaluate against relaxed caps.
                const fallbackRelaxed = true;
                const fallbackOvershootConfig = getPlannerOvershootConfig({
                    isCutPhase: guardIsCutPhase,
                    budgetMode: guardBudgetMode,
                    relaxed: fallbackRelaxed
                });
                const fallbackOvershootOk = passesPlannerOvershootGate({
                    totals: fallbackTotals,
                    targets: macroTargets,
                    overshootConfig: fallbackOvershootConfig
                });
                const fallbackMinsOk = passesPlannerMinimumGate({
                    totals: fallbackTotals,
                    targets: macroTargets,
                    relaxed: fallbackRelaxed
                });
                const fallbackBreakdown = buildPlannerOvershootBreakdown({
                    totals: fallbackTotals,
                    targets: macroTargets,
                    overshootConfig: fallbackOvershootConfig
                });
                addGuardStep('Fallback overshoot gate', fallbackOvershootOk, {
                    equation: 'totals <= target + relaxed overshoot caps',
                    fallbackTotals,
                    macroTargets,
                    overshootConfig: fallbackOvershootConfig,
                    breakdown: fallbackBreakdown
                });
                addGuardStep('Fallback mins gate', fallbackMinsOk, {
                    equation: 'totals >= target * (1 - (MAX_MACRO_UNDERSHOOT + 0.05))',
                    fallbackTotals,
                    macroTargets
                });
                if (fallbackOvershootOk && fallbackMinsOk) {
                    fallback.meta = {
                        ...(fallback.meta || {}),
                        branch: 'legacy_fallback'
                    };
                    emitGuardTrace({
                        final: 'fallback_pass',
                        branch: 'legacy_fallback',
                        fallbackTotals
                    });
                    return applyGuardMacroClosure(fallback, 'legacy_fallback');
                }
                if (fallbackOvershootOk) {
                    fallback.meta = {
                        ...(fallback.meta || {}),
                        branch: 'legacy_fallback_relaxed_mins',
                        notes: [
                            ...((Array.isArray(fallback?.meta?.notes) ? fallback.meta.notes : [])),
                            'Fallback plan used with relaxed minimums to avoid empty output.'
                        ]
                    };
                    emitGuardTrace({
                        final: 'fallback_pass_relaxed_mins',
                        branch: 'legacy_fallback_relaxed_mins',
                        fallbackTotals
                    });
                    return applyGuardMacroClosure(fallback, 'legacy_fallback_relaxed_mins');
                }
                const scaledFallback = scalePlanToOvershootCaps(fallback, fallbackBreakdown.caps);
                if (scaledFallback && Array.isArray(scaledFallback.meals) && scaledFallback.meals.length) {
                    const scaledBreakdown = buildPlannerOvershootBreakdown({
                        totals: scaledFallback.dailyTotals,
                        targets: macroTargets,
                        overshootConfig: fallbackOvershootConfig
                    });
                    addGuardStep('Fallback scale-to-cap rescue', scaledBreakdown.pass, {
                        equation: 'scale fallback servings so totals fit overshoot caps',
                        scaleApplied: scaledFallback.scaleApplied,
                        before: fallbackTotals,
                        after: scaledFallback.dailyTotals,
                        caps: fallbackBreakdown.caps,
                        scaledBreakdown
                    });
                    if (scaledBreakdown.pass) {
                        fallback.meals = scaledFallback.meals;
                        fallback.dailyTotals = scaledFallback.dailyTotals;
                        fallback.meta = {
                            ...(fallback.meta || {}),
                            branch: 'legacy_fallback_scaled_to_caps',
                            notes: [
                                ...((Array.isArray(fallback?.meta?.notes) ? fallback.meta.notes : [])),
                                `Fallback auto-scaled (${Math.round((scaledFallback.scaleApplied || 1) * 100)}%) to satisfy overshoot caps.`
                            ]
                        };
                        emitGuardTrace({
                            final: 'fallback_scaled_pass',
                            branch: 'legacy_fallback_scaled_to_caps',
                            fallbackTotals: fallback.dailyTotals
                        });
                        return applyGuardMacroClosure(fallback, 'legacy_fallback_scaled_to_caps');
                    }
                } else {
                    addGuardStep('Fallback scale-to-cap rescue', false, {
                        reason: 'Scaling rescue did not produce a usable plan'
                    });
                }
                try {
                    console.warn('[PLAN_GENERATION][FALLBACK_REJECTED]', {
                        guardBudgetMode,
                        fallbackTotals,
                        fallbackOvershootOk,
                        fallbackMinsOk,
                        fallbackBreakdown
                    });
                } catch {
                    // ignore
                }
                fallback.meta = {
                    ...(fallback.meta || {}),
                    branch: 'legacy_fallback_forced_render',
                    notes: [
                        ...((Array.isArray(fallback?.meta?.notes) ? fallback.meta.notes : [])),
                        'Forced fallback render used because all gated paths were rejected.'
                    ]
                };
                emitGuardTrace({
                    final: 'fallback_forced_render',
                    branch: 'legacy_fallback_forced_render',
                    fallbackTotals
                });
                return applyGuardMacroClosure(fallback, 'legacy_fallback_forced_render');
            }
            addGuardStep('Fallback available and passes gates', false, {
                reason: 'No fallback candidate satisfied overshoot/min gates.'
            });
            const recommendationTail = plannerRecommendations.length
                ? ` Recommendations: ${plannerRecommendations.slice(0, 2).join(' ')}`
                : '';
            emitGuardTrace({
                final: 'error',
                reason: `No valid meal candidates after grocery integration.${recommendationTail}`
            });
            return {
                error: 'INVALID_GROCERY_INTEGRATION',
                reason: `No valid meal candidates after grocery integration.${recommendationTail}`,
                recommendations: plannerRecommendations,
                debug: { guardTraceId, guardSteps }
            };
        }
        addGuardStep('Primary planner produced meals', true, {
            mealsLength: meals.length
        });
        if (!validTotals) {
            addGuardStep('Finite totals gate', false, {
                dailyTotals,
                equation: 'isFinite(calories, protein, carbs, fat)'
            });
            emitGuardTrace({
                final: 'error',
                reason: 'Macro resolution deadlock produced non-finite totals.'
            });
            return {
                error: 'INVALID_GROCERY_INTEGRATION',
                reason: 'Macro resolution deadlock produced non-finite totals.',
                debug: { guardTraceId, guardSteps }
            };
        }
        addGuardStep('Finite totals gate', true, {
            dailyTotals
        });
        if (Number.isFinite(result?.dailyCost) && result.dailyCost < 0) {
            addGuardStep('Cost non-negative gate', false, {
                dailyCost: result?.dailyCost,
                equation: 'dailyCost >= 0'
            });
            emitGuardTrace({
                final: 'error',
                reason: 'Budget miscalculation detected (negative daily cost).'
            });
            return {
                error: 'INVALID_GROCERY_INTEGRATION',
                reason: 'Budget miscalculation detected (negative daily cost).',
                debug: { guardTraceId, guardSteps }
            };
        }
        addGuardStep('Cost non-negative gate', true, {
            dailyCost: result?.dailyCost
        });
        emitGuardTrace({
            final: 'pass',
            branch: result?.meta?.branch || 'unknown',
            dailyTotals: result?.dailyTotals || null
        });

        return applyGuardMacroClosure(result, 'primary_guarded_result');
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

        if (!validProtein.length || !validCarb.length) {
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
        const mealResult = buildAllMealsGuarded(
            allValidFoods,
            plannerTargets,
            mealsPerDay,
            nutritionState.selections?.goal || 'RECOMP',
            nutritionState.selections?.weightLbs || 170,
            discipline
        );
        if (mealResult?.error) {
            try {
                const lastTrace = JSON.parse(sessionStorage.getItem('odeIntegrateLastTrace') || 'null');
                console.error('[PLAN_GENERATION] Build failed', {
                    traceId: lastTrace?.traceId || null,
                    reason: mealResult.reason || mealResult.error,
                    plannerTargets,
                    plannerDebug: mealResult?.debug || null,
                    mealsPerDay,
                    goal: nutritionState.selections?.goal || 'RECOMP',
                    weightLbs: nutritionState.selections?.weightLbs || 170,
                    allValidFoodsCount: Array.isArray(allValidFoods) ? allValidFoods.length : 0,
                    byType: {
                        protein: Array.isArray(validProtein) ? validProtein.length : 0,
                        carb: Array.isArray(validCarb) ? validCarb.length : 0,
                        fat: Array.isArray(validFat) ? validFat.length : 0
                    }
                });
            } catch {
                // ignore
            }
            mealGrid.innerHTML = `<div style="padding: 20px; text-align: center; color: #999;">${escapeHtml(mealResult.reason || 'Invalid grocery integration.')}</div>`;
            return;
        }
        const { meals: builtMeals, dailyTotals: initialTotals } = mealResult;

        // New system rules: no macro overshoot, <=15% undershoot allowed, quality before cost.
        // `buildAllMeals` already enforces these constraints; do not rescale meals after this point.
        const dailyTotalsFast = computeTotalsFromBuiltMeals(builtMeals || []);
        if (initialTotals) {
            const drift = {
                calories: Math.abs((Number(initialTotals.calories) || 0) - (Number(dailyTotalsFast.calories) || 0)),
                protein_g: Math.abs((Number(initialTotals.protein_g) || 0) - (Number(dailyTotalsFast.protein_g) || 0)),
                carbs_g: Math.abs((Number(initialTotals.carbs_g) || 0) - (Number(dailyTotalsFast.carbs_g) || 0)),
                fat_g: Math.abs((Number(initialTotals.fat_g) || 0) - (Number(dailyTotalsFast.fat_g) || 0))
            };
            if (drift.calories > 1 || drift.protein_g > 1 || drift.carbs_g > 1 || drift.fat_g > 1) {
                console.warn('[Meal Totals Sync] Using finalized meal totals due to drift:', drift);
            }
        }
        try {
            const lastTrace = JSON.parse(sessionStorage.getItem('odeIntegrateLastTrace') || 'null');
            const selectedBranch = String(mealResult?.meta?.branch || 'unknown');
            const budgetMode = getActiveBudgetModeFromSession();
            const cutPhase = isCutGoalLike(nutritionState.selections?.goal || 'RECOMP', normalizeGoal(nutritionState.selections?.goal || 'RECOMP'));
            const relaxedBranch = selectedBranch === 'legacy_fallback' || selectedBranch.startsWith('relaxed');
            const overshootConfig = getPlannerOvershootConfig({
                isCutPhase: cutPhase,
                budgetMode,
                relaxed: relaxedBranch
            });
            const fatCap = (Number(plannerTargets?.fat_g) || 0) + (Number(overshootConfig?.fatOver) || 0);
            console.info('[PLAN_GENERATION] Build success', {
                traceId: lastTrace?.traceId || null,
                branch: selectedBranch,
                plannerTargets,
                uiTargets: macroTargets,
                finalTotals: dailyTotalsFast || null,
                overshootConfig,
                mealsPerDay
            });
            if ((Number(dailyTotalsFast?.fat_g) || 0) > fatCap) {
                const fatByFood = new Map();
                (builtMeals || []).forEach((meal) => {
                    (meal?.foods || []).forEach((item) => {
                        const name = String(item?.foodName || item?.foodId || 'unknown');
                        fatByFood.set(name, (fatByFood.get(name) || 0) + (Number(item?.fat_g) || 0));
                    });
                });
                const topFatContributors = Array.from(fatByFood.entries())
                    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
                    .slice(0, 3)
                    .map(([name, fatG]) => ({ name, fat_g: Math.round((Number(fatG) || 0) * 10) / 10 }));
                console.warn('[PLAN_GENERATION][FAT_OVERSHOOT]', {
                    traceId: lastTrace?.traceId || null,
                    branch: selectedBranch,
                    fatActual: Number(dailyTotalsFast?.fat_g) || 0,
                    fatTarget: Number(plannerTargets?.fat_g) || 0,
                    fatCap,
                    topFatContributors
                });
            }
        } catch {
            // ignore
        }
        lastMealPlan = { meals: builtMeals || [], dailyTotals: dailyTotalsFast, macroTargets, plannerTargets, portionScale: scale };
        saveMealPlanSnapshotForLogging({ meals: builtMeals || [], mealsPerDay, macroTargets });

        const neededSupplementsForNote = recommendedSupplementsForTotals({ macroTargets, dailyTotals: dailyTotalsFast });
        updateMacroNoteText({ macroTargets, dailyTotals: dailyTotalsFast, neededSupplements: neededSupplementsForNote });

        const suggestedMealTimes = (() => {
            const preset = {
                3: ['8:00 AM', '1:00 PM', '7:00 PM'],
                4: ['8:00 AM', '12:00 PM', '4:00 PM', '8:00 PM'],
                5: ['7:00 AM', '11:00 AM', '3:00 PM', '7:00 PM', '10:00 PM']
            };
            if (preset[mealsPerDay]) return preset[mealsPerDay];
            const baseHour = 8;
            const gap = 4;
            return Array.from({ length: Math.max(1, mealsPerDay) }, (_, idx) => {
                const h24 = (baseHour + (idx * gap)) % 24;
                const suffix = h24 >= 12 ? 'PM' : 'AM';
                const h12 = h24 % 12 || 12;
                return `${h12}:00 ${suffix}`;
            });
        })();

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
                    <div class="meal-title">Meal ${idx + 1}${suggestedMealTimes[idx] ? ` <span style="font-size:12px;color:#7a756c;font-weight:600;">@ ${suggestedMealTimes[idx]}</span>` : ''}</div>
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
                <div style="margin-top:8px;font-size:12px;color:#4f4a42;text-align:center;">Space meals about 3-5 hours apart to support protein distribution.</div>
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
        latestPlanMonthlyTotalWithTax = monthlyTotalWithTax;
        maybeRebasePlanBudgetTiersFromActual(monthlyTotalWithTax);
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
            listNote.textContent = `Estimated weekly: ${formatCurrency(weeklyTotal)} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· monthly: ${formatCurrency(monthlyTotal)}.`;
        }

        // Update budget breakdown fields
        const budgetAllocEl = document.getElementById('budget-allocated');
        const budgetEstEl = document.getElementById('budget-estimated');
        const budgetTaxesEl = document.getElementById('budget-taxes');
        const budgetTotalEl = document.getElementById('budget-total');

        if (budgetAllocEl) budgetAllocEl.textContent = budget ? formatCurrency(budget) : EM_DASH;
        if (budgetEstEl) budgetEstEl.textContent = Number.isFinite(monthlyTotal) ? formatCurrency(monthlyTotal) : EM_DASH;
        if (budgetTaxesEl) budgetTaxesEl.textContent = Number.isFinite(estimatedTax) ? formatCurrency(estimatedTax) : EM_DASH;
        if (budgetTotalEl) budgetTotalEl.textContent = Number.isFinite(monthlyTotalWithTax) ? formatCurrency(monthlyTotalWithTax) : EM_DASH;
        if (budgetEl) budgetEl.textContent = Number.isFinite(monthlyTotalWithTax) ? formatCurrency(monthlyTotalWithTax) : EM_DASH;
        if (mealBudgetInlineEl) mealBudgetInlineEl.textContent = Number.isFinite(monthlyTotalWithTax) ? formatCurrency(monthlyTotalWithTax) : EM_DASH;
        updatePlanBudgetForecastSummary(monthlyTotalWithTax);
        updatePlanBudgetStatusBadge({
            budgetOverride: budget,
            monthlyTotalOverride: monthlyTotalWithTax
        });

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

        // Populate monthly cost summary using the shared 28-day/rest-of-month toggle.
        const daysRemaining = daysRemainingInCurrentMonth(new Date());
        const avgMonthly28 = Number.isFinite(monthlyTotal) ? (monthlyTotal * 28) / 30 : null;
        const restOfMonth = Number.isFinite(monthlyTotal) && Number.isFinite(daysRemaining)
            ? (monthlyTotal * daysRemaining) / 30
            : null;
        renderCostWindowSummary({
            weeklyCost: weeklyTotal,
            avgMonthly28,
            restOfMonth,
            daysRemaining
        });

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
    const budgetModeMacroBaselineForPlan = (() => {
        const src = prefs?.macroBaseline || initialMacrosSnapshot || macros || {};
        return {
            calories: Math.max(1200, Math.round(Number(src?.calories) || Number(initialMacrosSnapshot?.calories) || Number(macros?.calories) || 2000)),
            proteinG: Math.max(0, Math.round(Number(src?.proteinG) || Number(initialMacrosSnapshot?.proteinG) || Number(macros?.proteinG) || 150)),
            carbG: Math.max(0, Math.round(Number(src?.carbG) || Number(initialMacrosSnapshot?.carbG) || Number(macros?.carbG) || 200)),
            fatG: Math.max(0, Math.round(Number(src?.fatG) || Number(initialMacrosSnapshot?.fatG) || Number(macros?.fatG) || 65))
        };
    })();
    activeBudgetMacroBaselineRef = budgetModeMacroBaselineForPlan;
    const calcCarbRemainderForBudgetSwitch = (cal, pro, fat) => Math.max(0, Math.round((Number(cal || 0) - ((Number(pro || 0) * 4) + (Number(fat || 0) * 9))) / 4));
    const resolveGoalWeightForBudgetSwitch = () => {
        const goalWeight = Number(
            prefs?.goalWeightLbs
            || nutritionState.selections?.goalWeightLbs
            || sessionData?.selections?.goalWeightLbs
            || 0
        );
        if (Number.isFinite(goalWeight) && goalWeight > 0) return goalWeight;
        const currentWeight = Number(
            prefs?.weightLbs
            || nutritionState.selections?.weightLbs
            || sessionData?.selections?.weightLbs
            || 0
        );
        return (Number.isFinite(currentWeight) && currentWeight > 0) ? currentWeight : 170;
    };
    const buildBudgetModeMacrosForNormalPlan = (modeKeyRaw) => {
        const modeKey = normalizeBudgetModeKey(modeKeyRaw || prefs?.budgetMode || 'balanced');
        const caloriesFixed = Math.max(1200, Number(budgetModeMacroBaselineForPlan.calories) || 2000);
        const bestProtein = Math.max(0, Number(budgetModeMacroBaselineForPlan.proteinG) || 0);
        const bestFat = Math.max(0, Number(budgetModeMacroBaselineForPlan.fatG) || 0);
        const sexRaw = String(prefs?.sex || nutritionState.selections?.sex || sessionData?.selections?.sex || '').trim().toUpperCase();
        const fatSexMin = sexRaw === 'FEMALE' ? 40 : 50;
        const fatFloor = Math.max(Math.round((0.22 * caloriesFixed) / 9), fatSexMin);
        const proteinFloor = Math.round(0.75 * resolveGoalWeightForBudgetSwitch());
        const balancedProtein = Math.max(proteinFloor, Math.round(bestProtein * 0.92));

        if (modeKey === 'budget') {
            const proteinG = Math.max(0, proteinFloor);
            const fatG = Math.max(bestFat, fatFloor);
            return { calories: Math.round(caloriesFixed), proteinG, fatG, carbG: calcCarbRemainderForBudgetSwitch(caloriesFixed, proteinG, fatG) };
        }
        if (modeKey === 'balanced') {
            const proteinG = Math.max(0, balancedProtein);
            const fatG = Math.max(bestFat, fatFloor);
            return { calories: Math.round(caloriesFixed), proteinG, fatG, carbG: calcCarbRemainderForBudgetSwitch(caloriesFixed, proteinG, fatG) };
        }
        const proteinG = Math.max(0, Math.round(bestProtein));
        const fatG = Math.max(0, Math.round(bestFat));
        return { calories: Math.round(caloriesFixed), proteinG, fatG, carbG: calcCarbRemainderForBudgetSwitch(caloriesFixed, proteinG, fatG) };
    };
    onPlanBudgetModeSwitch = (modeKeyRaw, selectedTier) => {
        const modeKey = normalizeBudgetModeKey(modeKeyRaw || 'balanced');
        const nextMacros = buildBudgetModeMacrosForNormalPlan(modeKey);
        macros.calories = nextMacros.calories;
        macros.proteinG = nextMacros.proteinG;
        macros.carbG = nextMacros.carbG;
        macros.fatG = nextMacros.fatG;
        prefs = prefs && typeof prefs === 'object' ? prefs : {};
        prefs.budgetMode = modeKey;
        if (selectedTier && Number.isFinite(Number(selectedTier.value))) {
            prefs.budgetTotal = Number(selectedTier.value);
        }
        prefs.budgetTierOptions = planBudgetTierOptions;
        prefs.macroBaseline = { ...budgetModeMacroBaselineForPlan };
        prefs.macros = {
            calories: macros.calories,
            proteinG: macros.proteinG,
            carbG: macros.carbG,
            fatG: macros.fatG
        };
        try { sessionStorage.setItem('groceryPrefs', JSON.stringify(prefs)); } catch {}
        portionScale = 1;
        updateMacroDisplay(1);
        renderMealGrid(1);
        lastTotals = renderBudgetAndList();
    };

    const cheaperModal = document.getElementById('cheaper-modal');
    const cheaperClose = document.getElementById('cheaper-close');
    const cheaperOptions = document.getElementById('cheaper-options');
    const cheaperBtn = document.getElementById('make-cheaper-btn');
    const customFoodsBtn = document.getElementById('custom-foods-btn');
    const undoBtn = document.getElementById('undo-btn');
    const reconfigureBtn = document.getElementById('reconfigure-btn');
    const planCta = document.getElementById('plan-cta');
    const spotlightReconfigureNote = () => {
        let tries = 0;
        const maxTries = 12;
        const trySpotlight = () => {
            const note = document.getElementById('macro-reconfigure-note');
            if (!note) return false;
            if (note.classList.contains('hidden')) return false;
            if (!String(note.textContent || '').trim()) return false;
            note.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            note.classList.remove('reconfigure-note-spotlight');
            // Restart animation on repeated clicks.
            void note.offsetWidth;
            note.classList.add('reconfigure-note-spotlight');
            window.setTimeout(() => note.classList.remove('reconfigure-note-spotlight'), 1600);
            return true;
        };
        if (trySpotlight()) return;
        const timer = window.setInterval(() => {
            tries += 1;
            if (trySpotlight() || tries >= maxTries) window.clearInterval(timer);
        }, 80);
    };
    
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
            spotlightReconfigureNote();
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
                    return `<option value="${idx}" ${idx === currentIdx ? 'selected' : ''}>${name} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${priceText}</option>`;
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

    const isGroceryCalendarPage = document.body?.classList?.contains('grocery-calendar-page');
    const calendarEl = isGroceryCalendarPage ? null : document.getElementById('food-calendar');
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
                return `${event.name} ${EM_DASH} ${remainingValue.toFixed(2)} servings left ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${statusText}`;
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
                                const priceText = event.status === 'buy' || event.status === 'expired' ? ` ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${event.price}` : '';
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
    if (document.body.classList.contains('control-pinned')) return;
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



















