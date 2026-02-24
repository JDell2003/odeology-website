/**
 * Minimal proxy + static file server so YouTube API keys stay server-side.
 * Run with: node --env-file .env server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const SERPAPI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SERPAPI_CACHE_PATH = path.join(__dirname, 'data', 'serpapi-cache.json');
const SERPAPI_PRODUCT_CACHE_PATH = path.join(__dirname, 'data', 'serpapi-walmart-product-cache.json');
const STORE_MARKUP = Number(process.env.STORE_MARKUP || '1.2');
const STORE_SERPAPI_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STORE_SERPAPI_CACHE_PATH = path.join(__dirname, 'data', 'store-serpapi-cache.json');
const WALMART_ITEMS_PATH = path.join(__dirname, 'data', 'walmart-items.json');
const WALMART_ITEMS_CORE_PATH = path.join(__dirname, 'data', 'walmart-items-core.json');
const WALMART_FOOD_LIST_PATH = path.join(__dirname, 'grocery-price-engine', 'config', 'items.json');
const WALMART_LATEST_PATH = path.join(__dirname, 'data', 'walmart-latest.json');
const WALMART_REFRESH_STATE_PATH = path.join(__dirname, 'data', 'walmart-refresh.json');
const USDA_CACHE_PATH = path.join(__dirname, 'data', 'usda-cache.json');
const USDA_API_BASE = 'https://api.nal.usda.gov/fdc/v1';
const USDA_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const USDA_API_KEY = process.env.USDA_API_KEY;
const { addWalmartItemsToCart } = require('./core/walmartCart');
const db = require('./core/db');
const authRoutes = require('./core/authRoutes');
const adminRoutes = require('./core/adminRoutes');
const trackRoutes = require('./core/trackRoutes');
const trainingRoutes = require('./core/trainingRoutes');
const groceriesRoutes = require('./core/groceriesRoutes');
const leaderboardRoutes = require('./core/leaderboardRoutes');
const profileRoutes = require('./core/profileRoutes');
const MAX_RESULTS_DEFAULT = 6;
const PUBLIC_DIR = path.resolve(__dirname);
const TRAINING_QUOTE_BANK_PATH = path.join(__dirname, 'core', 'quoteBank.json');
const IS_DEV = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

const mime = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

const sendJson = (res, status, payload) => {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(payload));
};

let walmartCartInFlight = false;

const readSerpCache = () => {
    try {
        return JSON.parse(fs.readFileSync(SERPAPI_CACHE_PATH, 'utf8'));
    } catch {
        return {};
    }
};

const writeSerpCache = (cache) => {
    fs.mkdirSync(path.dirname(SERPAPI_CACHE_PATH), { recursive: true });
    fs.writeFileSync(SERPAPI_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
};

const readSerpProductCache = () => {
    try {
        return JSON.parse(fs.readFileSync(SERPAPI_PRODUCT_CACHE_PATH, 'utf8'));
    } catch {
        return {};
    }
};

const writeSerpProductCache = (cache) => {
    fs.mkdirSync(path.dirname(SERPAPI_PRODUCT_CACHE_PATH), { recursive: true });
    fs.writeFileSync(SERPAPI_PRODUCT_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
};

const readStoreSerpCache = () => {
    try {
        return JSON.parse(fs.readFileSync(STORE_SERPAPI_CACHE_PATH, 'utf8'));
    } catch {
        return {};
    }
};

const writeStoreSerpCache = (cache) => {
    fs.mkdirSync(path.dirname(STORE_SERPAPI_CACHE_PATH), { recursive: true });
    fs.writeFileSync(STORE_SERPAPI_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
};

const readLatestWalmart = () => {
    try {
        return JSON.parse(fs.readFileSync(WALMART_LATEST_PATH, 'utf8'));
    } catch {
        return null;
    }
};

const writeLatestWalmart = (payload) => {
    fs.mkdirSync(path.dirname(WALMART_LATEST_PATH), { recursive: true });
    fs.writeFileSync(WALMART_LATEST_PATH, JSON.stringify(payload, null, 2), 'utf8');
};

const readJsonFile = (filePath, fallback) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
};

const writeJsonFile = (filePath, payload) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
};

const readUsdaCache = () => {
    try {
        return JSON.parse(fs.readFileSync(USDA_CACHE_PATH, 'utf8'));
    } catch {
        return {};
    }
};

const writeUsdaCache = (cache) => {
    fs.mkdirSync(path.dirname(USDA_CACHE_PATH), { recursive: true });
    fs.writeFileSync(USDA_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
};

const readRefreshState = () => {
    try {
        return JSON.parse(fs.readFileSync(WALMART_REFRESH_STATE_PATH, 'utf8'));
    } catch {
        return {};
    }
};

let latestEnrichInFlight = false;

const enrichLatestWalmartInBackground = async (latest) => {
    if (!USDA_API_KEY) return;
    if (!latest || !Array.isArray(latest.items)) return;
    if (latestEnrichInFlight) return;
    latestEnrichInFlight = true;
    try {
        let updated = false;
        for (const entry of latest.items) {
            if (!Array.isArray(entry?.top_two_by_oz) || entry.top_two_by_oz.length === 0) continue;
            const hasManual = Boolean(buildManualMacros(entry.query));
            const needsMacros = entry.top_two_by_oz.some((item) => !item.macros || item.macros_source === 'usda_query' || (hasManual && item.macros_source !== 'manual_override'));
            if (!needsMacros) continue;
            const enriched = await enrichWalmartItemsWithMacros(entry.top_two_by_oz, entry.query);
            entry.top_two_by_oz = enriched;
            if (hasManual) {
                entry.macros = buildManualMacros(entry.query);
            } else if (!entry.macros) {
                entry.macros = await pickEntryMacros(enriched, entry.query);
            }
            updated = true;
        }
        if (updated) {
            latest.generatedAt = new Date().toISOString();
            writeLatestWalmart(latest);
        }
    } catch (err) {
        console.error('[walmart-latest-enrich]', err.message);
    } finally {
        latestEnrichInFlight = false;
    }
};

const writeRefreshState = (state) => {
    fs.mkdirSync(path.dirname(WALMART_REFRESH_STATE_PATH), { recursive: true });
    fs.writeFileSync(WALMART_REFRESH_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
};

const MANUAL_MACROS_BY_QUERY = {
    'chicken breasts': {
        calories: 140,
        protein_g: 25,
        carbs_g: 0,
        fat_g: 4,
        serving_size: 113,
        serving_unit: 'g',
        household_serving: '4 oz raw'
    },
    'ground turkey': {
        calories: 200,
        protein_g: 15,
        carbs_g: 0,
        fat_g: 15,
        serving_size: 113,
        serving_unit: 'g',
        household_serving: '4 oz (85/15)'
    },
    'eggs': {
        calories: 70,
        protein_g: 6,
        carbs_g: 0,
        fat_g: 5,
        serving_size: 50,
        serving_unit: 'g',
        household_serving: '1 large egg'
    },
    'salmon': {
        calories: 130,
        protein_g: 22,
        carbs_g: 0,
        fat_g: 5,
        serving_size: 113,
        serving_unit: 'g',
        household_serving: '4 oz'
    },
    'shrimp': {
        calories: 110,
        protein_g: 26,
        carbs_g: 0,
        fat_g: 1,
        serving_size: 113,
        serving_unit: 'g',
        household_serving: '4 oz'
    },
    'ground beef': {
        calories: 350,
        protein_g: 19,
        carbs_g: 0,
        fat_g: 30,
        serving_size: 113,
        serving_unit: 'g',
        household_serving: '4 oz (73/27)'
    },
    'cottage cheese': {
        calories: 110,
        protein_g: 12,
        carbs_g: 5,
        fat_g: 5,
        serving_size: 113,
        serving_unit: 'g',
        household_serving: '1/2 cup'
    },
    'greek yogurt': {
        calories: 100,
        protein_g: 17,
        carbs_g: 7,
        fat_g: 0,
        serving_size: 170,
        serving_unit: 'g',
        household_serving: '2/3 cup'
    },
    'milk': {
        calories: 150,
        protein_g: 8,
        carbs_g: 12,
        fat_g: 8,
        serving_size: 240,
        serving_unit: 'ml',
        household_serving: '1 cup'
    },
    'cheddar cheese': {
        calories: 80,
        protein_g: 5,
        carbs_g: 0,
        fat_g: 6,
        serving_size: 19,
        serving_unit: 'g',
        household_serving: '1 slice'
    },
    'butter': {
        calories: 100,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 11,
        serving_size: 14,
        serving_unit: 'g',
        household_serving: '1 Tbsp'
    },
    'oat milk': {
        calories: 90,
        protein_g: 2,
        carbs_g: 19,
        fat_g: 1.5,
        serving_size: 240,
        serving_unit: 'ml',
        household_serving: '1 cup'
    },
    'apples': {
        calories: 95,
        protein_g: 0,
        carbs_g: 25,
        fat_g: 0,
        fiber_g: 4,
        serving_size: null,
        serving_unit: '',
        household_serving: '1 medium'
    },
    'bananas': {
        calories: 105,
        protein_g: 1,
        carbs_g: 27,
        fat_g: 0,
        fiber_g: 3,
        serving_size: null,
        serving_unit: '',
        household_serving: '1 medium'
    },
    'mixed berries': {
        calories: 70,
        protein_g: 1,
        carbs_g: 17,
        fat_g: 0,
        fiber_g: 4,
        serving_size: 140,
        serving_unit: 'g',
        household_serving: '1 cup'
    },
    'spinach': {
        calories: 20,
        protein_g: 2,
        carbs_g: 4,
        fat_g: 0,
        fiber_g: 2,
        serving_size: 85,
        serving_unit: 'g',
        household_serving: '3 cups raw'
    },
    'quinoa': {
        calories: 170,
        protein_g: 6,
        carbs_g: 29,
        fat_g: 2.5,
        fiber_g: 3,
        serving_size: 45,
        serving_unit: 'g',
        household_serving: '1/4 cup dry'
    },
    'lettuce': {
        calories: 10,
        protein_g: 1,
        carbs_g: 2,
        fat_g: 0,
        fiber_g: 1,
        serving_size: 85,
        serving_unit: 'g',
        household_serving: '1.5 cups'
    },
    'whole wheat pasta': {
        calories: 200,
        protein_g: 7,
        carbs_g: 42,
        fat_g: 1,
        fiber_g: 2,
        serving_size: 56,
        serving_unit: 'g',
        household_serving: '2/3 cup dry'
    },
    'jasmine rice': {
        calories: 160,
        protein_g: 3,
        carbs_g: 36,
        fat_g: 0,
        fiber_g: 1,
        serving_size: 45,
        serving_unit: 'g',
        household_serving: '1/4 cup dry'
    },
    'oats': {
        calories: 150,
        protein_g: 5,
        carbs_g: 27,
        fat_g: 3,
        fiber_g: 4,
        serving_size: 40,
        serving_unit: 'g',
        household_serving: '1/2 cup dry'
    },
    'potatoes': {
        calories: 160,
        protein_g: 4,
        carbs_g: 37,
        fat_g: 0,
        fiber_g: 4,
        serving_size: 170,
        serving_unit: 'g',
        household_serving: '1 medium'
    },
    'onions': {
        calories: 30,
        protein_g: 1,
        carbs_g: 7,
        fat_g: 0,
        fiber_g: 1,
        serving_size: 80,
        serving_unit: 'g',
        household_serving: '1/2 cup'
    },
    'avocados': {
        calories: 120,
        protein_g: 1.5,
        carbs_g: 6,
        fat_g: 10,
        fiber_g: 5,
        serving_size: 75,
        serving_unit: 'g',
        household_serving: '1/2 medium'
    },
    'olive oil': {
        calories: 120,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 14,
        serving_size: 14,
        serving_unit: 'g',
        household_serving: '1 Tbsp'
    },
    'peanut butter': {
        calories: 180,
        protein_g: 7,
        carbs_g: 8,
        fat_g: 15,
        serving_size: 32,
        serving_unit: 'g',
        household_serving: '2 Tbsp'
    },
    'black beans': {
        calories: 120,
        protein_g: 7,
        carbs_g: 22,
        fat_g: 0,
        serving_size: null,
        serving_unit: '',
        household_serving: '1/2 cup'
    },
    'chickpeas': {
        calories: 130,
        protein_g: 7,
        carbs_g: 22,
        fat_g: 2,
        serving_size: null,
        serving_unit: '',
        household_serving: '1/2 cup'
    },
    'tomatoes': {
        calories: 20,
        protein_g: 1,
        carbs_g: 4,
        fat_g: 0,
        serving_size: null,
        serving_unit: '',
        household_serving: '1/2 cup'
    },
    'chicken broth': {
        calories: 10,
        protein_g: 1,
        carbs_g: 0,
        fat_g: 0,
        serving_size: 240,
        serving_unit: 'ml',
        household_serving: '1 cup'
    },
    'almonds': {
        calories: 180,
        protein_g: 5,
        carbs_g: 18,
        fat_g: 11,
        serving_size: 38,
        serving_unit: 'g',
        household_serving: '1/4 cup'
    },
    'mixed nuts': {
        calories: 160,
        protein_g: 5,
        carbs_g: 6,
        fat_g: 14,
        serving_size: null,
        serving_unit: '',
        household_serving: '1/4 cup'
    },
    'popcorn': {
        calories: 90,
        protein_g: 3,
        carbs_g: 18,
        fat_g: 1,
        serving_size: null,
        serving_unit: '',
        household_serving: '3 cups popped'
    },
    'dark chocolate': {
        calories: 170,
        protein_g: 2,
        carbs_g: 13,
        fat_g: 12,
        serving_size: 28,
        serving_unit: 'g',
        household_serving: '1 oz'
    }
};

const buildManualMacros = (query) => {
    const key = String(query || '').toLowerCase().trim();
    const override = MANUAL_MACROS_BY_QUERY[key];
    if (!override) return null;
    return {
        fdc_id: null,
        gtin_upc: null,
        description: String(query || ''),
        data_type: 'Manual',
        calories: override.calories ?? null,
        protein_g: override.protein_g ?? null,
        carbs_g: override.carbs_g ?? null,
        fat_g: override.fat_g ?? null,
        fiber_g: override.fiber_g ?? null,
        serving_size: Number.isFinite(Number(override.serving_size)) ? Number(override.serving_size) : null,
        serving_unit: override.serving_unit || '',
        household_serving: override.household_serving || ''
    };
};

const shouldRunMonthlyRefresh = () => {
    const now = new Date();
    if (now.getDate() !== 1) return false;
    const state = readRefreshState();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return state.lastMonth !== key;
};

const markMonthlyRefresh = () => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    writeRefreshState({ lastMonth: key, refreshedAt: now.toISOString() });
};

const normalizeServingUnit = (unit) => {
    if (!unit) return '';
    const u = String(unit).toLowerCase().trim();
    if (u === 'g' || u === 'gram' || u === 'grams' || u === 'grm') return 'g';
    if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return 'ml';
    return u;
};

const normalizeUsdaMacros = (food) => {
    const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : [];
    const getVal = (names) => {
        const hit = nutrients.find((n) => names.includes(String(n.nutrientName || n.name || '').toLowerCase()));
        return hit ? Number(hit.value) : null;
    };
    const calories = getVal(['energy', 'energy (kj)', 'calories']);
    const protein = getVal(['protein']);
    const carbs = getVal(['carbohydrate, by difference', 'carbohydrate']);
    const fat = getVal(['total lipid (fat)', 'total lipid', 'fat']);

    const servingSize = Number(food?.servingSize);
    const servingUnitRaw = food?.servingSizeUnit || '';
    const servingUnit = normalizeServingUnit(servingUnitRaw);
    let scale = 1;
    if (
        Number.isFinite(servingSize) &&
        servingSize > 0 &&
        servingUnit === 'g' &&
        String(food?.dataType || '').toLowerCase() !== 'branded'
    ) {
        scale = servingSize / 100;
    }

    return {
        fdc_id: food?.fdcId ?? null,
        gtin_upc: food?.gtinUpc || food?.gtinUPC || food?.gtin || null,
        description: food?.description || '',
        data_type: food?.dataType || '',
        calories: Number.isFinite(calories) ? calories * scale : null,
        protein_g: Number.isFinite(protein) ? protein * scale : null,
        carbs_g: Number.isFinite(carbs) ? carbs * scale : null,
        fat_g: Number.isFinite(fat) ? fat * scale : null,
        serving_size: Number.isFinite(servingSize) ? servingSize : null,
        serving_unit: servingUnit,
        household_serving: food?.householdServingFullText || ''
    };
};

const pickUsdaFood = (foods, query) => {
    if (!Array.isArray(foods) || foods.length === 0) return null;
    const category = getCategoryForQuery(query);
    const avoid = /(dehydrated|powder|dried|freeze-dried)/i;
    const cookedAvoid = /(cooked|breaded|fried|smoked|seasoned|cured)/i;
    const preferredTypes = ['foundation', 'sr legacy', 'survey (fndds)'];
    const nonBranded = foods.filter((f) => preferredTypes.includes(String(f?.dataType || '').toLowerCase()));
    const candidates = nonBranded.length ? nonBranded : foods;
    const nonDehydrated = candidates.filter((f) => !avoid.test(f?.description || ''));
    const base = nonDehydrated.length ? nonDehydrated : candidates;

    if (category === 'produce' || category === 'meat_seafood') {
        const rawPreferred = base.find((f) => /raw|fresh|uncooked/i.test(f?.description || '') && !cookedAvoid.test(f?.description || ''));
        if (rawPreferred) return rawPreferred;
        const uncooked = base.find((f) => !cookedAvoid.test(f?.description || ''));
        if (uncooked) return uncooked;
    }

    return base[0] || foods[0];
};

const fetchUsdaMacros = async (query) => {
    if (!USDA_API_KEY) return null;
    const cacheKey = `usda:v2:${query.toLowerCase()}`;
    const cache = readUsdaCache();
    const cached = cache[cacheKey];
    if (cached && Date.now() - cached.cachedAt < USDA_CACHE_TTL_MS) {
        return cached.data;
    }
    const fetchFoods = async (dataType) => {
        const params = new URLSearchParams({
            query,
            pageSize: '10',
            api_key: USDA_API_KEY
        });
        if (dataType) params.set('dataType', dataType);
        const url = `${USDA_API_BASE}/foods/search?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        return Array.isArray(data?.foods) ? data.foods : [];
    };

    const preferredTypes = 'Foundation,SR Legacy,Survey (FNDDS)';
    let foods = await fetchFoods(preferredTypes);
    if (!foods || foods.length === 0) {
        foods = await fetchFoods(null);
    }
    if (!foods || foods.length === 0) return null;
    const picked = pickUsdaFood(foods, query);
    if (!picked) return null;
    const normalized = normalizeUsdaMacros(picked);
    cache[cacheKey] = { cachedAt: Date.now(), data: normalized };
    writeUsdaCache(cache);
    return normalized;
};

const normalizeUpc = (value) => {
    if (!value) return '';
    return String(value).replace(/\D/g, '');
};

const fetchUsdaMacrosByUpc = async (upc) => {
    if (!USDA_API_KEY) return null;
    const normalizedUpc = normalizeUpc(upc);
    if (!normalizedUpc) return null;
    const cacheKey = `usda:upc:${normalizedUpc}`;
    const cache = readUsdaCache();
    const cached = cache[cacheKey];
    if (cached && Date.now() - cached.cachedAt < USDA_CACHE_TTL_MS) {
        return cached.data;
    }
    const params = new URLSearchParams({
        query: normalizedUpc,
        pageSize: '10',
        dataType: 'Branded',
        api_key: USDA_API_KEY
    });
    const url = `${USDA_API_BASE}/foods/search?${params.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        return null;
    }
    const data = await resp.json();
    const foods = Array.isArray(data?.foods) ? data.foods : [];
    if (foods.length === 0) return null;
    const exact = foods.find((food) => normalizeUpc(food?.gtinUpc || food?.gtinUPC || food?.gtin) === normalizedUpc);
    const picked = exact || foods[0];
    if (!picked) return null;
    const normalized = normalizeUsdaMacros(picked);
    cache[cacheKey] = { cachedAt: Date.now(), data: normalized };
    writeUsdaCache(cache);
    return normalized;
};

const normalizeUnitToOz = (unit) => {
    if (!unit) return null;
    const u = String(unit).toLowerCase();
    if (u === 'oz' || u === 'ounce' || u === 'ounces') return 'oz';
    if (u === 'fl oz' || u === 'floz' || u === 'fluid ounce' || u === 'fluid ounces') return 'fl_oz';
    if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return 'lb';
    if (u === 'g' || u === 'gram' || u === 'grams' || u === 'grm') return 'g';
    if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return 'kg';
    if (u === 'ct' || u === 'count' || u === 'ea' || u === 'each') return 'ct';
    return null;
};

const normalizeUnitToMl = (unit) => {
    if (!unit) return null;
    const u = String(unit).toLowerCase();
    if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return 'ml';
    if (u === 'l' || u === 'liter' || u === 'liters') return 'l';
    if (u === 'fl oz' || u === 'floz' || u === 'fluid ounce' || u === 'fluid ounces') return 'fl_oz';
    return null;
};

const estimateWeightGrams = (name, category) => {
    const n = String(name || '').toLowerCase();
    if (n.includes('egg')) return 50;
    if (n.includes('apple')) return 182;
    if (n.includes('avocado')) return 150;
    if (n.includes('banana')) return 118;
    if (n.includes('bell pepper') || n.includes('pepper')) return 120;
    if (n.includes('tomato')) return 123;
    if (n.includes('onion')) return 110;
    if (n.includes('potato')) return 213;
    if (category === 'produce') return 120;
    return null;
};

const extractCountFromText = (text) => {
    const t = String(text || '').toLowerCase();
    const dozenMatch = t.match(/(\d+(?:\.\d+)?)\s*dozen/);
    if (dozenMatch) {
        const dozens = Number(dozenMatch[1]);
        if (Number.isFinite(dozens)) return dozens * 12;
    }
    const countMatch = t.match(/(\d+)\s*(count|ct|pk|pack)\b/);
    if (countMatch) {
        const count = Number(countMatch[1]);
        if (Number.isFinite(count)) return count;
    }
    return null;
};

const getUnitPriceForItem = (item) => {
    const unitRaw = item.price_per_unit_unit || '';
    const unit = normalizeUnitToOz(unitRaw);
    const basePrice = Number.isFinite(item.price) ? item.price : null;
    const directUnitPrice = Number.isFinite(item.price_per_unit) && item.price_per_unit > 0
        ? item.price_per_unit
        : null;
    if (directUnitPrice != null) return directUnitPrice;

    if (basePrice != null && unit === 'ct') {
        const count = extractCountFromText(item.name) || 1;
        return count > 0 ? basePrice / count : null;
    }
    return basePrice;
};

const computePricePerGram = ({ pricePerUnit, unit, name, category }) => {
    if (!Number.isFinite(pricePerUnit)) return null;
    const normOz = normalizeUnitToOz(unit);
    if (normOz === 'oz') return pricePerUnit / 28.3495;
    if (normOz === 'lb') return pricePerUnit / 453.592;
    if (normOz === 'g') return pricePerUnit / 1;
    if (normOz === 'kg') return pricePerUnit / 1000;
    if (normOz === 'ct' || normOz === 'count' || normOz === 'each') {
        const grams = estimateWeightGrams(name, category);
        return grams ? pricePerUnit / grams : null;
    }

    const normMl = normalizeUnitToMl(unit);
    if (normMl) {
        let ml = null;
        if (normMl === 'ml') ml = 1;
        if (normMl === 'l') ml = 1000;
        if (normMl === 'fl_oz') ml = 29.5735;
        if (!ml) return null;
        const density = /oil|olive/.test(String(name || '').toLowerCase()) ? 0.91 : /milk/.test(String(name || '').toLowerCase()) ? 1.03 : 1;
        return pricePerUnit / (ml * density);
    }

    return null;
};

const extractWeightGramsFromText = (text) => {
    const t = String(text || '').toLowerCase();
    const multMatch = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|g|gram|grams|kg|kilogram|kilograms)\b/);
    if (multMatch) {
        const count = Number(multMatch[1]);
        const qty = Number(multMatch[2]);
        const unit = multMatch[3];
        if (Number.isFinite(count) && Number.isFinite(qty)) {
            return count * weightToGrams(qty, unit);
        }
    }

    const match = t.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|g|gram|grams|kg|kilogram|kilograms)\b/);
    if (match) {
        return weightToGrams(Number(match[1]), match[2]);
    }
    return null;
};

const weightToGrams = (value, unit) => {
    if (!Number.isFinite(value)) return null;
    const u = String(unit || '').toLowerCase();
    if (u.startsWith('lb') || u.includes('pound')) return value * 453.592;
    if (u.startsWith('oz') || u.includes('ounce')) return value * 28.3495;
    if (u.startsWith('kg') || u.includes('kilogram')) return value * 1000;
    if (u === 'g' || u.includes('gram')) return value;
    return null;
};

const extractWeightGramsFromProduct = (product) => {
    if (!product || typeof product !== 'object') return null;
    const chunks = [];
    const pushText = (val) => {
        if (!val) return;
        if (typeof val === 'string') chunks.push(val);
        else chunks.push(JSON.stringify(val));
    };
    pushText(product.title || product.name);
    pushText(product.description);
    pushText(product.short_description || product.shortDescription);
    pushText(product.specifications || product.specs);
    pushText(product.features);
    pushText(product.size || product.package_size || product.packageSize);
    const text = chunks.join(' ');
    return extractWeightGramsFromText(text);
};

const keywordMatch = (text, keywords) => {
    const t = String(text || '').toLowerCase();
    return keywords.some((k) => t.includes(k));
};

const getCategoryForQuery = (query) => {
    const q = String(query || '').toLowerCase();
    if (/(egg|eggs)/.test(q)) return 'produce';
    if (/(chicken|turkey|beef|pork|shrimp|salmon|tilapia|tuna|seafood)/.test(q)) return 'meat_seafood';
    if (/(milk|yogurt|cheese|butter|cottage)/.test(q)) return 'dairy';
    if (/(rice|oats|pasta|bread|tortilla|quinoa)/.test(q)) return 'grains';
    if (/(beans|chickpea|lentil)/.test(q)) return 'legumes';
    if (/(apple|banana|berries|spinach|broccoli|pepper|avocado|onion|potato|lettuce|tomato)/.test(q)) return 'produce';
    return 'other';
};

const isValidFormForCategory = (category, name) => {
    const n = String(name || '').toLowerCase();
    const blockedForms = ['freeze-dried', 'dehydrated', 'dried'];
    if (blockedForms.some((k) => n.includes(k))) return false;
    if (/(roasted|flavored|sweetened|honey roasted|candied)/.test(n)) return false;

    if (category === 'produce') {
        if (/canned/.test(n)) return false;
        if (/(ready-to-eat|cooked|smoked|breaded|candied|chips)/.test(n)) return false;
        return true;
    }
    if (category === 'meat_seafood') {
        if (/(cooked|smoked|breaded|ready-to-eat|seasoned)/.test(n)) return false;
        return true;
    }
    if (category === 'dairy') {
        if (/(shelf stable|powder|powdered|dry milk|uht|long life|canned)/.test(n)) return false;
        return true;
    }
    if (category === 'grains') {
        if (/(seasoned|sweetened|flavored)/.test(n)) return false;
        return /(dry|uncooked|rolled|flour|grain|rice|pasta|oats|quinoa|bread|tortilla)/.test(n);
    }
    if (category === 'legumes') {
        if (/(seasoned|sweetened|flavored)/.test(n)) return false;
        return /(canned|dry)/.test(n);
    }
    return true;
};

const applyFoodRoleTags = (item, category) => {
    const n = String(item.name || '').toLowerCase();
    const isProtein = category === 'meat_seafood' || /(tofu|yogurt|cottage|cheese|eggs|tuna|shrimp|salmon)/.test(n);
    const isCarb = category === 'grains' || /(bread|rice|oats|pasta|potato|tortilla|beans|quinoa)/.test(n);
    const isFat = /(oil|butter|avocado|nuts|peanut butter)/.test(n);

    const dietTags = [];
    const hasMeat = /(chicken|turkey|beef|pork|shrimp|salmon|tilapia|tuna|fish|seafood)/.test(n);
    const isDairy = /(milk|yogurt|cheese|butter|cottage)/.test(n);
    if (!hasMeat) dietTags.push('vegetarian');
    if (!hasMeat && !isDairy) dietTags.push('vegan');
    if (isDairy) dietTags.push('dairy');
    // Only tag gluten-free when explicitly stated to avoid false positives.
    if (/(gluten[-\\s]?free)/.test(n)) dietTags.push('gluten-free');

    let qualityScore = 1;
    if (/(fresh)/.test(n)) qualityScore = 3;
    else if (/(frozen)/.test(n)) qualityScore = 2;

    return {
        ...item,
        is_protein_source: isProtein,
        is_carb_source: isCarb,
        is_fat_source: isFat,
        diet_tags: dietTags,
        quality_score: qualityScore
    };
};

const computePricePerOz = (amount, unit) => {
    if (!Number.isFinite(amount)) return null;
    const normalized = normalizeUnitToOz(unit);
    if (normalized === 'oz') return amount;
    if (normalized === 'fl_oz') return amount;
    if (normalized === 'lb') return amount / 16;
    if (normalized === 'g') return amount * 28.3495;
    if (normalized === 'kg') return amount / 35.274;
    return null;
};

const normalizeSerpProduct = (product) => {
    const price = Number(
        product?.price ??
        product?.primary_offer?.offer_price ??
        product?.primary_offer?.min_price
    );
    const parsedUnit = (() => {
        const raw = product?.price_per_unit?.amount;
        if (raw == null) return { amount: null, unit: product?.price_per_unit?.unit || null };
        if (typeof raw === 'number') return { amount: raw, unit: product?.price_per_unit?.unit || null };
        const text = String(raw).toLowerCase();
        const numberMatch = text.match(/([0-9]+(?:\.[0-9]+)?)/);
        if (!numberMatch) return { amount: null, unit: product?.price_per_unit?.unit || null };
        const num = Number(numberMatch[1]);
        const isCents = text.includes('¢');
        const amount = isCents ? num / 100 : num;
        const unitMatch = text.match(/\/\s*([a-z]+(?:\s*oz)?)\b/);
        const unit = unitMatch ? unitMatch[1].replace(/\s+/g, ' ').trim() : (product?.price_per_unit?.unit || null);
        return { amount, unit };
    })();

    const unitAmount = Number(parsedUnit.amount);
    const unitLabel = parsedUnit.unit || product?.price_per_unit?.unit || null;
    const pricePerOz = computePricePerOz(unitAmount, unitLabel);
    const outOfStock = product?.out_of_stock === true;

    return {
        store: 'walmart',
        item_id: product?.us_item_id != null ? String(product.us_item_id) : '',
        name: product?.title || '',
        price: Number.isFinite(price) ? price : null,
        price_per_lb: Number.isFinite(unitAmount) ? unitAmount : null,
        price_per_unit: Number.isFinite(unitAmount) ? unitAmount : null,
        price_per_unit_unit: unitLabel ? String(unitLabel) : null,
        price_per_oz: Number.isFinite(pricePerOz) ? pricePerOz : null,
        url: product?.product_page_url || '',
        image: product?.thumbnail || '',
        rating: Number.isFinite(Number(product?.rating)) ? Number(product.rating) : null,
        reviews: Number.isFinite(Number(product?.reviews)) ? Number(product.reviews) : null,
        in_stock: !outOfStock
    };
};

const HARD_EXCLUDE_KEYWORDS = [
    'emergency',
    'survival',
    'foodservice',
    'restaurant',
    'ration',
    '25 year',
    'long shelf life'
];

const PRICE_EXCLUDE_KEYWORDS = [
    'emergency',
    'survival',
    'foodservice',
    'restaurant',
    'ration',
    'long shelf life',
    'per case',
    'case of'
];

const isSponsored = (product) => {
    const flag = product?.sponsored;
    return flag === true || flag === 'true' || flag === 1 || flag === '1';
};

const applyFilteringAndNormalization = (items, { category, query }) => {
    const filtered = [];
    const q = String(query || '').toLowerCase();
    for (const item of items) {
        const title = item?.name || '';
        const titleLower = title.toLowerCase();
        if (q.includes('apple')) {
            if (/(chips|wedges|slices|sliced|snack|caramel|dried|juice|peeled|pack|box|case|snitz)/.test(titleLower)) continue;
        }
        if (keywordMatch(title, HARD_EXCLUDE_KEYWORDS)) continue;

        if (Number.isFinite(item.price) && item.price > 60 && keywordMatch(title, PRICE_EXCLUDE_KEYWORDS)) {
            continue;
        }

        if (!isValidFormForCategory(category, title)) continue;

        const unitPrice = getUnitPriceForItem(item);
        const normalizedPricePerGram = computePricePerGram({
            pricePerUnit: unitPrice,
            unit: item.price_per_unit_unit,
            name: item.name,
            category
        });

        if (!Number.isFinite(normalizedPricePerGram)) continue;

        const withTags = applyFoodRoleTags({
            ...item,
            normalized_price_per_gram: normalizedPricePerGram
        }, category);

        filtered.push(withTags);
    }
    return filtered;
};

const buildBulkEntry = async (query, data, existing = {}) => {
    const resList = Array.isArray(data?.results) ? data.results : [];
    const category = data?.category || getCategoryForQuery(query);
    let topTwo = pickTopTwoByPerOz(resList);
    topTwo = await enrichWalmartItemsWithMacros(topTwo, query);
    const macros = await pickEntryMacros(topTwo, query);

    if (topTwo.length === 0) {
        return {
            status: 'not_found',
            reason: 'No valid consumer-priced items after filtering',
            query,
            category,
            group: existing.group || '',
            groupName: existing.groupName || '',
            top_two_by_oz: [],
            macros
        };
    }

    return {
        query,
        category,
        group: existing.group || '',
        groupName: existing.groupName || '',
        top_two_by_oz: topTwo.slice(0, 2),
        macros
    };
};

const pickCheapestWalmart = (items) => {
    return items
        .filter((item) => item.in_stock && item.normalized_price_per_gram != null)
        .sort((a, b) => {
            const aKey = a.normalized_price_per_gram ?? Number.POSITIVE_INFINITY;
            const bKey = b.normalized_price_per_gram ?? Number.POSITIVE_INFINITY;
            return aKey - bKey;
        })[0] || null;
};

const pickTopTwoByPerOz = (items) => {
    const ranked = items
        .filter((item) => item.in_stock && item.normalized_price_per_gram != null)
        .sort((a, b) => {
            const aKey = a.normalized_price_per_gram ?? Number.POSITIVE_INFINITY;
            const bKey = b.normalized_price_per_gram ?? Number.POSITIVE_INFINITY;
            return aKey - bKey;
        });
    return ranked.slice(0, 2);
};

const normalizeWalmartItems = (list) => {
    return Array.isArray(list)
        ? list
            .map((item) => {
                if (typeof item === 'string') return { query: item };
                return {
                    query: item?.query || item?.name || item?.title || '',
                    preferredIds: Array.isArray(item?.preferredIds) ? item.preferredIds.map(String) : [],
                    fallbackIds: Array.isArray(item?.fallbackIds) ? item.fallbackIds.map(String) : []
                };
            })
            .filter((row) => row.query)
        : [];
};

const loadWalmartItemsFrom = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    const list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normalizeWalmartItems(list);
};

const loadWalmartItems = () => {
    const primary = loadWalmartItemsFrom(WALMART_ITEMS_PATH);
    if (primary) return primary;

    if (fs.existsSync(WALMART_FOOD_LIST_PATH)) {
        const list = JSON.parse(fs.readFileSync(WALMART_FOOD_LIST_PATH, 'utf8'));
        const seen = new Set();
        return (Array.isArray(list) ? list : [])
            .filter((item) => String(item?.sku || '').toLowerCase().startsWith('walmart:'))
            .map((item) => {
                const query = item?.groupName || item?.group || item?.name || item?.sku || '';
                return {
                    query,
                    group: item?.group || '',
                    groupName: item?.groupName || ''
                };
            })
            .filter((row) => row.query && !seen.has(row.query.toLowerCase()) && seen.add(row.query.toLowerCase()));
    }

    return [];
};

const pickPreferredIds = (results, preferredIds) => {
    if (!Array.isArray(preferredIds) || preferredIds.length === 0) return [];
    const byId = new Map(results.map((item) => [String(item.item_id), item]));
    const picked = [];
    preferredIds.forEach((id) => {
        const item = byId.get(String(id));
        if (item && item.in_stock) picked.push(item);
    });
    return picked;
};

const fetchWalmartProducts = async (query, { forceRefresh = false } = {}) => {
    const cacheKey = `walmart:${query.toLowerCase()}`;
    const cache = readSerpCache();
    const cached = cache[cacheKey];
    const cachedFresh = cached && Date.now() - cached.cachedAt < SERPAPI_CACHE_TTL_MS;
    const cachedHasResults = Array.isArray(cached?.data?.results) && cached.data.results.length > 0;
    if (!forceRefresh && cachedFresh && cachedHasResults) {
        return { cache, data: cached.data, cached: true };
    }

    const params = new URLSearchParams({
        engine: 'walmart',
        query,
        api_key: SERPAPI_KEY,
        num: '10'
    });
    const resp = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`);
    if (!resp.ok) {
        const error = { error: `SerpAPI error: ${resp.status}` };
        return { cache, data: error, cached: false, failed: true };
    }
    const data = await resp.json();
    const products = Array.isArray(data.products)
        ? data.products
        : (Array.isArray(data.organic_results) ? data.organic_results : []);
    const normalized = products
        .filter((product) => !isSponsored(product))
        .map(normalizeSerpProduct)
        .filter((item) => item.in_stock);

    const category = getCategoryForQuery(query);
    const prefiltered = normalized.filter((item) => {
        const title = item?.name || '';
        const titleLower = title.toLowerCase();
        if (query.toLowerCase().includes('apple')) {
            if (/(chips|wedges|slices|sliced|snack|caramel|dried|juice|peeled|pack|box|case|snitz)/.test(titleLower)) return false;
        }
        if (keywordMatch(title, HARD_EXCLUDE_KEYWORDS)) return false;
        if (Number.isFinite(item.price) && item.price > 60 && keywordMatch(title, PRICE_EXCLUDE_KEYWORDS)) return false;
        if (!isValidFormForCategory(category, title)) return false;
        return true;
    });

    const withNormalized = prefiltered.map((item) => {
        const unitPrice = getUnitPriceForItem(item);
        const normalizedPricePerGram = computePricePerGram({
            pricePerUnit: unitPrice,
            unit: item.price_per_unit_unit,
            name: item.name,
            category
        });
        return {
            ...item,
            normalized_price_per_gram: Number.isFinite(normalizedPricePerGram) ? normalizedPricePerGram : null
        };
    });

    const needsDetails = withNormalized
        .filter((item) => item.normalized_price_per_gram == null && item.item_id)
        .sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY))
        .slice(0, 4);

    for (const item of needsDetails) {
        const product = await fetchWalmartProductDetails(item.item_id);
        const upc = extractUpcFromProduct(product);
        if (upc) {
            item.upc = upc;
        }
        const weightGrams = extractWeightGramsFromProduct(product);
        if (weightGrams && Number.isFinite(item.price)) {
            item.price_per_unit_unit = 'g';
            item.price_per_unit = item.price / weightGrams;
            const normalizedPricePerGram = computePricePerGram({
                pricePerUnit: item.price_per_unit,
                unit: item.price_per_unit_unit,
                name: item.name,
                category
            });
            item.normalized_price_per_gram = Number.isFinite(normalizedPricePerGram) ? normalizedPricePerGram : null;
        }
    }

    const filtered = withNormalized
        .filter((item) => item.normalized_price_per_gram != null)
        .map((item) => applyFoodRoleTags(item, category));

    const cheapest = pickCheapestWalmart(filtered);

    const payload = filtered.length === 0
        ? {
            status: 'not_found',
            reason: 'No valid consumer-priced items after filtering',
            query,
            category,
            results: [],
            cheapest: null
        }
        : {
            query,
            category,
            results: filtered,
            cheapest
        };

    cache[cacheKey] = { cachedAt: Date.now(), data: payload };
    writeSerpCache(cache);
    return { cache, data: payload, cached: false };
};

const fetchWalmartProductDetails = async (productId) => {
    if (!SERPAPI_KEY || !productId) return null;
    const cache = readSerpProductCache();
    if (cache[productId]) return cache[productId];
    const params = new URLSearchParams({
        engine: 'walmart_product',
        product_id: String(productId),
        api_key: SERPAPI_KEY
    });
    const resp = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const product = data?.product_result || null;
    if (product) {
        cache[productId] = product;
        writeSerpProductCache(cache);
    }
    return product;
};

const STORE_CATEGORIES = [
    { key: 'protein', label: 'Protein' },
    { key: 'creatine', label: 'Creatine' },
    { key: 'supplements', label: 'Supplements' },
    { key: 'equipment', label: 'Workout Equipment' },
    { key: 'deals', label: 'Deals' }
];

const STORE_SEED_QUERIES = {
    protein: ['whey protein powder', 'protein isolate powder', 'plant protein powder'],
    creatine: ['creatine monohydrate', 'micronized creatine monohydrate', 'creatine gummies'],
    supplements: ['pre workout powder', 'electrolyte powder', 'fish oil omega 3', 'multivitamin', 'magnesium glycinate'],
    equipment: ['adjustable dumbbells', 'kettlebell', 'resistance bands', 'pull up bar', 'foam roller'],
    deals: ['whey protein under $30', 'creatine monohydrate under $20', 'resistance bands set under $20', 'pre workout under $25']
};

const clampInt = (value, min, max, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const roundMoney = (value) => {
    if (!Number.isFinite(value)) return null;
    return Math.round((value + Number.EPSILON) * 100) / 100;
};

const storeCategoryLabel = (key) => {
    const hit = STORE_CATEGORIES.find((c) => c.key === key);
    return hit ? hit.label : 'Supplements';
};

const inferStoreCategoryKey = (title, requestedKey) => {
    const t = String(title || '').toLowerCase();
    if (requestedKey && requestedKey !== 'deals') return requestedKey;
    if (/(creatine)/.test(t)) return 'creatine';
    if (/(whey|casein|protein|isolate|mass gainer)/.test(t)) return 'protein';
    if (/(dumbbell|kettlebell|barbell|bench|rack|resistance band|bands|pull[-\\s]?up|foam roller|yoga mat|jump rope)/.test(t)) return 'equipment';
    if (/(vitamin|omega|fish oil|electrolyte|magnesium|zinc|ashwagandha|pre[-\\s]?workout|post[-\\s]?workout)/.test(t)) return 'supplements';
    return requestedKey || 'supplements';
};

const buildStoreBlurb = ({ categoryKey, title, rating, reviews }) => {
    const t = String(title || '').toLowerCase();
    const cat = categoryKey;

    const short = (() => {
        if (cat === 'protein') {
            if (/(isolate)/.test(t)) return 'Lean, fast-digesting protein to help you hit daily targets.';
            if (/(plant|vegan)/.test(t)) return 'Plant-based protein for a simple, convenient daily option.';
            return 'Convenient protein to support muscle-building and recovery.';
        }
        if (cat === 'creatine') {
            if (/(gummies)/.test(t)) return 'Creatine support in an easy daily format.';
            return 'Creatine monohydrate support for strength and performance.';
        }
        if (cat === 'equipment') {
            if (/(adjustable)/.test(t)) return 'Space-saving home gym essential with flexible loading.';
            if (/(bands|resistance band)/.test(t)) return 'Portable resistance for training anywhere, any time.';
            return 'Reliable gear for progressive overload and consistency.';
        }
        if (cat === 'deals') {
            return 'Best-value pick that earns its spot with simplicity and usefulness.';
        }
        if (/(electrolyte)/.test(t)) return 'Electrolyte support for training performance and hydration.';
        if (/(fish oil|omega)/.test(t)) return 'Omega support for a simple daily supplement baseline.';
        if (/(multivitamin)/.test(t)) return 'A basic daily multi to cover common gaps.';
        if (/(magnesium)/.test(t)) return 'Magnesium support for recovery-focused routines.';
        if (/(pre[-\\s]?workout)/.test(t)) return 'Pre-workout support for focus and training intensity.';
        return 'A simple supplement pick focused on value and consistency.';
    })();

    const why = (() => {
        const pieces = [];
        if (Number.isFinite(rating) && rating >= 4.4) pieces.push('strong customer ratings');
        if (Number.isFinite(reviews) && reviews >= 200) pieces.push('lots of real reviews');
        pieces.push('good value for the category');
        return `Why we recommend it: ${pieces.join(', ')}.`;
    })();

    return { short_description: short, why_recommend: why };
};

const fetchWalmartStoreSearch = async (query, { page = 1, limit = 24, forceRefresh = false } = {}) => {
    if (!SERPAPI_KEY) return { error: 'Missing SERPAPI_KEY' };
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return { error: 'Missing query' };

    const safePage = clampInt(page, 1, 25, 1);
    const safeLimit = clampInt(limit, 1, 40, 24);
    const cacheKey = `store:walmart:${normalizedQuery.toLowerCase()}:p${safePage}:n${safeLimit}`;
    const cache = readStoreSerpCache();
    const cached = cache[cacheKey];
    const cachedFresh = cached && Date.now() - cached.cachedAt < STORE_SERPAPI_CACHE_TTL_MS;
    const cachedHasResults = Array.isArray(cached?.data?.results) && cached.data.results.length > 0;
    if (!forceRefresh && cachedHasResults) {
        return { ...cached.data, cached: true, stale: !cachedFresh };
    }

    const params = new URLSearchParams({
        engine: 'walmart',
        query: normalizedQuery,
        api_key: SERPAPI_KEY,
        num: String(safeLimit),
        page: String(safePage)
    });

    const resp = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`);
    if (!resp.ok) {
        let detail = null;
        try {
            detail = await resp.json();
        } catch {
            detail = null;
        }
        const msg = String(detail?.error || detail?.message || '').toLowerCase();
        if (resp.status === 429 && (msg.includes('run out of searches') || msg.includes('out of searches'))) {
            return { error: 'Store provider quota exceeded', code: 'quota_exceeded', status: 429 };
        }
        return { error: `SerpAPI error: ${resp.status}`, status: resp.status };
    }

    const data = await resp.json();
    const products = Array.isArray(data.products)
        ? data.products
        : (Array.isArray(data.organic_results) ? data.organic_results : []);

    const normalized = products
        .filter((product) => !isSponsored(product))
        .map(normalizeSerpProduct)
        .filter((item) => item.in_stock && item.item_id && item.image && Number.isFinite(item.price));

    const seen = new Set();
    const deduped = [];
    for (const item of normalized) {
        const id = String(item.item_id);
        if (seen.has(id)) continue;
        seen.add(id);
        deduped.push(item);
    }

    const payload = {
        query: normalizedQuery,
        page: safePage,
        limit: safeLimit,
        results: deduped
    };

    cache[cacheKey] = { cachedAt: Date.now(), data: payload };
    writeStoreSerpCache(cache);
    return payload;
};

const buildStoreProduct = (item, requestedCategoryKey) => {
    const original = Number(item?.price);
    const originalPrice = Number.isFinite(original) ? original : null;
    const ourPrice = originalPrice != null ? roundMoney(originalPrice * STORE_MARKUP) : null;
    const categoryKey = inferStoreCategoryKey(item?.name, requestedCategoryKey);
    const blurb = buildStoreBlurb({
        categoryKey,
        title: item?.name,
        rating: item?.rating,
        reviews: item?.reviews
    });

    let tag = null;
    if (Number.isFinite(item?.rating) && item.rating >= 4.6 && Number.isFinite(item?.reviews) && item.reviews >= 300) {
        tag = 'Recommended';
    } else if (requestedCategoryKey === 'deals') {
        tag = 'Best Value';
    }

    return {
        id: String(item?.item_id || ''),
        source: 'walmart',
        name: String(item?.name || ''),
        category: storeCategoryLabel(categoryKey),
        category_key: categoryKey,
        image: String(item?.image || ''),
        original_price: originalPrice,
        our_price: ourPrice,
        rating: Number.isFinite(item?.rating) ? item.rating : null,
        reviews: Number.isFinite(item?.reviews) ? item.reviews : null,
        short_description: blurb.short_description,
        why_recommend: blurb.why_recommend,
        tag
    };
};

const extractUpcFromProduct = (product) => {
    if (!product || typeof product !== 'object') return null;
    if (product.upc) return String(product.upc);
    const candidate = product?.specifications || product?.specs || product?.specification_highlights;
    if (Array.isArray(candidate)) {
        const hit = candidate.find((entry) => String(entry?.key || '').toLowerCase() === 'upc');
        if (hit?.value) return String(hit.value);
    }
    return null;
};

const enrichWalmartItemWithMacros = async (item, query) => {
    const out = { ...item };
    const manual = buildManualMacros(query);
    if (manual) {
        out.macros = manual;
        out.macros_source = 'manual_override';
        return out;
    }
    if (!out.upc && out.item_id) {
        const product = await fetchWalmartProductDetails(out.item_id);
        const upc = extractUpcFromProduct(product);
        if (upc) out.upc = upc;
    }
    const upcMacros = out.upc ? await fetchUsdaMacrosByUpc(out.upc) : null;
    if (upcMacros) {
        out.macros = upcMacros;
        out.macros_source = 'usda_upc';
        return out;
    }
    if (!out.macros || out.macros_source !== 'usda_query') {
        const fallback = await fetchUsdaMacros(query);
        if (fallback) {
            out.macros = fallback;
            out.macros_source = 'usda_query';
        }
    }
    return out;
};

const enrichWalmartItemsWithMacros = async (items, query) => {
    const out = [];
    for (const item of items) {
        out.push(await enrichWalmartItemWithMacros(item, query));
    }
    return out;
};

const pickEntryMacros = async (items, query) => {
    const manual = buildManualMacros(query);
    if (manual) return manual;
    const firstWithMacros = items.find((item) => item?.macros?.calories != null);
    if (firstWithMacros) return firstWithMacros.macros;
    return await fetchUsdaMacros(query);
};

const fetchShortsFromFeed = async (maxResults) => {
    if (!CHANNEL_ID) throw new Error('Missing YOUTUBE_CHANNEL_ID for feed fallback');

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
    const resp = await fetch(feedUrl);
    if (!resp.ok) throw new Error(`YouTube feed error: ${resp.status}`);

    const xml = await resp.text();
    const entryRegex = new RegExp('<entry>([\\s\\S]*?)<\\/entry>', 'g');
    const entries = [...xml.matchAll(entryRegex)];

    return entries.slice(0, maxResults || MAX_RESULTS_DEFAULT).map(entry => {
        const block = entry[1] || '';
        const videoIdMatch = block.match(new RegExp('<yt:videoId>([^<]+)<\\/yt:videoId>'));
        const titleMatch = block.match(new RegExp('<title>([^<]*)<\\/title>'));
        const thumbMatch = block.match(new RegExp('<media:thumbnail url=\"([^\"]+)\"'));

        const videoId = (videoIdMatch || [])[1] || '';
        const title = (titleMatch || [])[1] || 'Short';
        const thumb = (thumbMatch || [])[1] || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

        return {
            title,
            description: '',
            url: videoId ? `https://www.youtube.com/shorts/${videoId}` : '',
            thumbnail: thumb,
            videoId
        };
    }).filter(short => short.url && short.thumbnail);
};

const fetchShorts = async (maxResults) => {
    const tryFeedFallback = async (reason) => {
        console.warn(`[shorts] ${reason}. Falling back to public feed.`);
        return fetchShortsFromFeed(maxResults);
    };

    if (!CHANNEL_ID) {
        throw new Error('Missing YOUTUBE_CHANNEL_ID');
    }

    if (!API_KEY) {
        return tryFeedFallback('Missing API key');
    }

    try {
        const params = new URLSearchParams({
            part: 'snippet',
            channelId: CHANNEL_ID,
            maxResults: String(maxResults || MAX_RESULTS_DEFAULT),
            order: 'date',
            type: 'video',
            videoDuration: 'short',
            key: API_KEY
        });

        const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
        if (!resp.ok) throw new Error(`YouTube API error: ${resp.status}`);
        const data = await resp.json();

        return (data.items || []).map(item => {
            const videoId = item.id?.videoId || item.id;
            const snippet = item.snippet || {};
            const thumbs = snippet.thumbnails || {};
            const fallback = videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : '';
            const fallbackHq = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';

            return {
                title: snippet.title || 'Short',
                description: snippet.description || '',
                url: videoId ? `https://www.youtube.com/shorts/${videoId}` : '',
                thumbnail: thumbs.maxres?.url || thumbs.high?.url || thumbs.standard?.url || thumbs.medium?.url || fallback || fallbackHq,
                videoId
            };
        }).filter(short => short.url && short.thumbnail);
    } catch (err) {
        return tryFeedFallback(err.message);
    }
};

const isHashedAssetName = (name) => /\.[a-f0-9]{8,}\./i.test(String(name || ''));

const cacheControlForStatic = (filePath, ext) => {
    if (IS_DEV) {
        if (ext === '.js') return 'no-store';
        return 'no-store';
    }

    const base = path.basename(filePath);
    if (ext === '.html') return 'no-store';
    if (ext === '.js') {
        if (isHashedAssetName(base)) return 'public, max-age=31536000, immutable';
        return 'no-store';
    }
    if (ext === '.css') {
        if (isHashedAssetName(base)) return 'public, max-age=31536000, immutable';
        return 'public, max-age=3600';
    }
    return 'public, max-age=86400';
};

const serveStatic = (req, res, pathname) => {
    let filePath = path.join(PUBLIC_DIR, pathname);
    if (pathname === '/' || pathname === '') {
        filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mime[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (res.headersSent || res.writableEnded) {
            return;
        }
        if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            return res.end('Not found');
        }
        const responseHeaders = {
            'Content-Type': contentType,
            'Cache-Control': cacheControlForStatic(filePath, ext)
        };
        res.writeHead(200, responseHeaders);
        if (pathname === '/js/main.js') {
            console.log('[asset] /js/main.js', {
                filePath,
                headers: responseHeaders
            });
        }
        res.end(content);
    });
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Avoid auth/session “randomly signed out” issues caused by switching between
    // `localhost` and `127.0.0.1` (cookies are host-scoped).
    // Default canonical host is `localhost` for local development; override with CANONICAL_HOST.
    try {
        const hostHeader = String(req.headers.host || '');
        const hostUrl = new URL(`http://${hostHeader}`);
        const hostname = String(hostUrl.hostname || '').toLowerCase();
        const port = hostUrl.port ? `:${hostUrl.port}` : '';
        const canonicalHost = String(process.env.CANONICAL_HOST || 'localhost').trim().toLowerCase();
        const isLoopbackIp = hostname === '127.0.0.1' || hostname === '::1';
        if (canonicalHost && isLoopbackIp && hostname !== canonicalHost) {
            const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim();
            const proto = xfProto || 'http';
            const dest = `${proto}://${canonicalHost}${port}${req.url || '/'}`;
            res.writeHead(307, { Location: dest, 'Cache-Control': 'no-store' });
            res.end();
            return;
        }
    } catch {
        // ignore
    }

    if (await trackRoutes(req, res, url)) {
      return;
    }

    if (await profileRoutes(req, res, url)) {
      return;
    }

    if (await adminRoutes(req, res, url)) {
      return;
    }

    if (await authRoutes(req, res, url)) {
        return;
    }

    if (await groceriesRoutes(req, res, url)) {
        return;
    }

    if (url.pathname === '/api/training/quote-bank' && req.method === 'GET') {
        try {
            const raw = fs.readFileSync(TRAINING_QUOTE_BANK_PATH, 'utf8');
            const json = JSON.parse(raw);
            return sendJson(res, 200, { ok: true, quotes: Array.isArray(json) ? json : [] });
        } catch {
            return sendJson(res, 200, { ok: true, quotes: [] });
        }
    }

    if (await trainingRoutes(req, res, url)) {
        return;
    }

    if (await leaderboardRoutes(req, res, url)) {
        return;
    }


    if (url.pathname === '/admin' && req.method === 'GET') {
        return serveStatic(req, res, '/admin.html');
    }

    if (url.pathname === '/api/db/health' && req.method === 'GET') {
        if (!db.isConfigured()) {
            return sendJson(res, 501, {
                error: 'Database not configured',
                hint: 'Set DATABASE_URL (recommended) or PGHOST/PGDATABASE/PGUSER/PGPASSWORD in .env'
            });
        }
        try {
            await db.query('SELECT 1');
            return sendJson(res, 200, { ok: true });
        } catch (err) {
            console.error('[db-health]', err?.message || err);
            return sendJson(res, 500, { ok: false, error: 'Database query failed' });
        }
    }

    if (url.pathname === '/api/db/version' && req.method === 'GET') {
        if (!db.isConfigured()) {
            return sendJson(res, 501, {
                error: 'Database not configured',
                hint: 'Set DATABASE_URL (recommended) or PGHOST/PGDATABASE/PGUSER/PGPASSWORD in .env'
            });
        }
        try {
            const result = await db.query('SELECT version() AS version');
            return sendJson(res, 200, { version: result.rows?.[0]?.version || null });
        } catch (err) {
            console.error('[db-version]', err?.message || err);
            return sendJson(res, 500, { error: 'Failed to query Postgres version' });
        }
    }

    if (url.pathname === '/api/shorts' && req.method === 'GET') {
        const maxResults = Number(url.searchParams.get('maxResults')) || MAX_RESULTS_DEFAULT;
        try {
            const shorts = await fetchShorts(maxResults);
            return sendJson(res, 200, shorts);
        } catch (err) {
            console.error('[shorts]', err.message);
            return sendJson(res, 500, { error: 'Failed to load shorts' });
        }
    }

    if (url.pathname === '/api/prices/walmart' && req.method === 'GET') {
        const query = (url.searchParams.get('query') || '').trim();
        if (!query) {
            return sendJson(res, 400, { error: 'Missing query' });
        }
        if (!SERPAPI_KEY) {
            return sendJson(res, 500, { error: 'Missing SERPAPI_KEY' });
        }
        try {
        const result = await fetchWalmartProducts(query);
        if (result?.failed) {
            return sendJson(res, 502, result.data);
        }
        return sendJson(res, 200, result.data);
        } catch (err) {
            console.error('[walmart]', err.message);
            return sendJson(res, 500, { error: 'Failed to load Walmart prices' });
        }
    }

    if (url.pathname === '/api/prices/walmart/refresh' && req.method === 'GET') {
        const query = (url.searchParams.get('query') || '').trim();
        if (!query) {
            return sendJson(res, 400, { error: 'Missing query' });
        }
        if (!SERPAPI_KEY) {
            return sendJson(res, 500, { error: 'Missing SERPAPI_KEY' });
        }
        try {
            const result = await fetchWalmartProducts(query, { forceRefresh: true });
            if (result?.failed) {
                return sendJson(res, 502, result.data);
            }
            const latest = readLatestWalmart() || { generatedAt: new Date().toISOString(), count: 0, items: [] };
            const items = Array.isArray(latest.items) ? latest.items : [];
            const matchIndex = items.findIndex((item) => String(item?.query || '').toLowerCase() === query.toLowerCase());
            const existing = matchIndex >= 0 ? items[matchIndex] : {};
            const refreshedEntry = await buildBulkEntry(query, result.data, existing);
            if (matchIndex >= 0) {
                items[matchIndex] = refreshedEntry;
            } else {
                items.push(refreshedEntry);
            }
            latest.items = items;
            latest.count = items.length;
            latest.generatedAt = new Date().toISOString();
            writeLatestWalmart(latest);
            return sendJson(res, 200, result.data);
        } catch (err) {
            console.error('[walmart-refresh]', err.message);
            return sendJson(res, 500, { error: 'Failed to refresh Walmart prices' });
        }
    }

    if (url.pathname === '/api/prices/walmart/bulk' && req.method === 'GET') {
        if (!SERPAPI_KEY) {
            return sendJson(res, 500, { error: 'Missing SERPAPI_KEY' });
        }

        const refresh = url.searchParams.get('refresh') === '1';
        if (!refresh) {
            const latest = readLatestWalmart();
            if (latest) {
                return sendJson(res, 200, latest);
            }
        }

        const limit = Number(url.searchParams.get('limit')) || null;
        const listParam = (url.searchParams.get('list') || '').toLowerCase();
        const items = listParam === 'core'
            ? (loadWalmartItemsFrom(WALMART_ITEMS_CORE_PATH) || [])
            : loadWalmartItems();
        const selected = limit ? items.slice(0, limit) : items;
        const results = [];

        try {
            for (const item of selected) {
                const query = String(item.query || '').trim();
                if (!query) continue;
                const forceRefresh = Array.isArray(item.preferredIds) && item.preferredIds.length > 0;
                const result = await fetchWalmartProducts(query, { forceRefresh });
                const data = result?.data;
                const resList = Array.isArray(data?.results) ? data.results : [];
                const category = data?.category || getCategoryForQuery(query);
                let topTwo = [];
                if (Array.isArray(item.preferredIds) && item.preferredIds.length > 0) {
                    topTwo = pickPreferredIds(resList, item.preferredIds);
                    if (topTwo.length < 2 && Array.isArray(item.fallbackIds) && item.fallbackIds.length > 0) {
                        const fallback = pickPreferredIds(resList, item.fallbackIds);
                        topTwo = [...topTwo, ...fallback].slice(0, 2);
                    }
                }
                if (topTwo.length < 2) {
                    const ranked = pickTopTwoByPerOz(resList);
                    topTwo = [...topTwo, ...ranked].slice(0, 2);
                }
                topTwo = await enrichWalmartItemsWithMacros(topTwo, query);
                const macros = await pickEntryMacros(topTwo, query);
                results.push(topTwo.length === 0 ? {
                    status: 'not_found',
                    reason: 'No valid consumer-priced items after filtering',
                    query,
                    category,
                    group: item.group || '',
                    groupName: item.groupName || '',
                    top_two_by_oz: [],
                    macros
                } : {
                    query,
                    category,
                    group: item.group || '',
                    groupName: item.groupName || '',
                    top_two_by_oz: topTwo,
                    macros
                });
            }
            const payload = {
                generatedAt: new Date().toISOString(),
                count: results.length,
                items: results
            };
            writeLatestWalmart(payload);
            return sendJson(res, 200, payload);
        } catch (err) {
            console.error('[walmart-bulk]', err.message);
            return sendJson(res, 500, { error: 'Failed to load Walmart bulk prices' });
        }
    }

    if (url.pathname === '/api/prices/walmart/latest' && req.method === 'GET') {
        const latest = readLatestWalmart();
        if (!latest) {
            return sendJson(res, 404, { error: 'No stored Walmart data yet' });
        }
        let updated = false;
        if (Array.isArray(latest.items)) {
            for (const entry of latest.items) {
                const manual = buildManualMacros(entry?.query);
                if (manual && (!entry.macros || entry.macros.data_type !== 'Manual')) {
                    entry.macros = manual;
                    updated = true;
                }
            }
        }
        if (updated) {
            latest.generatedAt = new Date().toISOString();
            writeLatestWalmart(latest);
        }
        if (USDA_API_KEY) {
            setImmediate(() => enrichLatestWalmartInBackground(latest));
        }
        return sendJson(res, 200, latest);
    }

    if (url.pathname === '/api/cart/walmart' && req.method === 'POST') {
        if (walmartCartInFlight) {
            return sendJson(res, 409, { error: 'Walmart cart automation already running' });
        }

        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            let payload = null;
            try {
                payload = JSON.parse(body || '{}');
            } catch {
                return sendJson(res, 400, { error: 'Invalid JSON' });
            }

            const items = Array.isArray(payload?.items) ? payload.items : null;
            if (!items || items.length === 0) {
                return sendJson(res, 400, { error: 'Expected items[] with at least one Walmart item' });
            }

            walmartCartInFlight = true;
            try {
                const headless = payload?.headless === true || process.env.WALMART_CART_HEADLESS === '1';
                const result = await addWalmartItemsToCart({
                    items,
                    headless,
                    slowMo: Number(payload?.slowMo || 0),
                    timeoutMs: Number(payload?.timeoutMs || 45000)
                });
                return sendJson(res, 200, result);
            } catch (err) {
                console.error('[walmart-cart]', err.message);
                return sendJson(res, 500, {
                    error: 'Failed to run Walmart cart automation',
                    detail: err.message
                });
            } finally {
                walmartCartInFlight = false;
            }
        });
        return;
    }

    if (url.pathname === '/api/store/categories' && req.method === 'GET') {
        return sendJson(res, 200, {
            categories: STORE_CATEGORIES,
            markup: STORE_MARKUP
        });
    }

    if (url.pathname === '/api/store/home' && req.method === 'GET') {
        const limit = clampInt(url.searchParams.get('limit'), 4, 24, 16);
        if (!SERPAPI_KEY) {
            return sendJson(res, 200, {
                unavailable: true,
                reason: 'missing_key',
                markup: STORE_MARKUP,
                results: []
            });
        }

        const queries = [
            'whey protein powder',
            'creatine monohydrate',
            'adjustable dumbbells'
        ];

        try {
            const all = [];
            const seen = new Set();
            for (const q of queries) {
                const data = await fetchWalmartStoreSearch(q, { page: 1, limit: 24, forceRefresh: false });
                if (data?.error) {
                    return sendJson(res, 200, {
                        unavailable: true,
                        reason: data?.code || 'provider_error',
                        provider_status: data?.status || null,
                        markup: STORE_MARKUP,
                        results: []
                    });
                }
                const results = Array.isArray(data?.results) ? data.results : [];
                for (const item of results) {
                    const id = String(item?.item_id || '');
                    if (!id || seen.has(id)) continue;
                    seen.add(id);
                    all.push(item);
                }
            }

            const products = all.map((item) => buildStoreProduct(item, null));
            const picked = products
                .filter((p) => p.image && Number.isFinite(p.our_price))
                .slice(0, limit);

            return sendJson(res, 200, {
                markup: STORE_MARKUP,
                results: picked
            });
        } catch (err) {
            console.error('[store-home]', err?.message || err);
            return sendJson(res, 200, {
                unavailable: true,
                reason: 'server_error',
                markup: STORE_MARKUP,
                results: []
            });
        }
    }

    if (url.pathname === '/api/store/products' && req.method === 'GET') {
        const requestedCategory = String(url.searchParams.get('category') || 'protein').toLowerCase();
        const categoryKey = STORE_CATEGORIES.some((c) => c.key === requestedCategory) ? requestedCategory : 'protein';
        const q = String(url.searchParams.get('q') || '').trim();
        const page = clampInt(url.searchParams.get('page'), 1, 25, 1);
        const limit = clampInt(url.searchParams.get('limit'), 1, 40, 24);
        const seed = url.searchParams.get('seed') === '1';
        const refresh = url.searchParams.get('refresh') === '1';

        const queries = (() => {
            if (q) return [q];
            const seeds = STORE_SEED_QUERIES[categoryKey] || [];
            return seed ? seeds : seeds.slice(0, 1);
        })();

        const all = [];
        const seen = new Set();
        try {
            if (!SERPAPI_KEY) {
                return sendJson(res, 200, {
                    unavailable: true,
                    reason: 'missing_key',
                    category: storeCategoryLabel(categoryKey),
                    category_key: categoryKey,
                    page,
                    limit,
                    query: queries.join(' | '),
                    markup: STORE_MARKUP,
                    results: []
                });
            }

            for (const query of queries) {
                const data = await fetchWalmartStoreSearch(query, { page, limit, forceRefresh: refresh });
                if (data?.error) {
                    return sendJson(res, 200, {
                        unavailable: true,
                        reason: data?.code || 'provider_error',
                        provider_status: data?.status || null,
                        category: storeCategoryLabel(categoryKey),
                        category_key: categoryKey,
                        page,
                        limit,
                        query: queries.join(' | '),
                        markup: STORE_MARKUP,
                        results: []
                    });
                }
                const results = Array.isArray(data?.results) ? data.results : [];
                for (const item of results) {
                    const id = String(item?.item_id || '');
                    if (!id || seen.has(id)) continue;
                    seen.add(id);
                    all.push(item);
                    if (all.length >= limit) break;
                }
                if (all.length >= limit) break;
            }

            const products = all.map((item) => buildStoreProduct(item, categoryKey));
            return sendJson(res, 200, {
                category: storeCategoryLabel(categoryKey),
                category_key: categoryKey,
                page,
                limit,
                query: queries.join(' | '),
                markup: STORE_MARKUP,
                results: products
            });
        } catch (err) {
            console.error('[store-products]', err?.message || err);
            return sendJson(res, 200, {
                unavailable: true,
                reason: 'server_error',
                category: storeCategoryLabel(categoryKey),
                category_key: categoryKey,
                page,
                limit,
                query: queries.join(' | '),
                markup: STORE_MARKUP,
                results: []
            });
        }
    }

    if (url.pathname === '/api/store/product' && req.method === 'GET') {
        if (!SERPAPI_KEY) {
            return sendJson(res, 500, { error: 'Missing SERPAPI_KEY' });
        }
        const id = String(url.searchParams.get('id') || '').trim();
        if (!id) {
            return sendJson(res, 400, { error: 'Missing id' });
        }

        try {
            const product = await fetchWalmartProductDetails(id);
            if (!product) {
                return sendJson(res, 404, { error: 'Product not found' });
            }

            const title = String(product?.title || '');
            const categoryKey = inferStoreCategoryKey(title, null);
            const original = Number(product?.price_map?.price);
            const originalPrice = Number.isFinite(original) ? original : null;
            const ourPrice = originalPrice != null ? roundMoney(originalPrice * STORE_MARKUP) : null;
            const rating = Number.isFinite(Number(product?.rating)) ? Number(product.rating) : null;
            const reviews = Number.isFinite(Number(product?.reviews)) ? Number(product.reviews) : null;
            const images = Array.isArray(product?.images) ? product.images.map((img) => String(img || '')).filter(Boolean) : [];
            const image = images[0] || String(product?.thumbnail || '') || '';
            const blurb = buildStoreBlurb({ categoryKey, title, rating, reviews });

            return sendJson(res, 200, {
                id: String(product?.us_item_id || id),
                source: 'walmart',
                name: title,
                category: storeCategoryLabel(categoryKey),
                category_key: categoryKey,
                image,
                images,
                original_price: originalPrice,
                our_price: ourPrice,
                rating,
                reviews,
                in_stock: product?.in_stock !== false,
                short_description: blurb.short_description,
                why_recommend: blurb.why_recommend,
                max_quantity: Number.isFinite(Number(product?.max_quantity)) ? Number(product.max_quantity) : null,
                min_quantity: Number.isFinite(Number(product?.min_quantity)) ? Number(product.min_quantity) : 1
            });
        } catch (err) {
            console.error('[store-product]', err?.message || err);
            return sendJson(res, 500, { error: 'Failed to load product' });
        }
    }

    if (url.pathname === '/api/store/redirect' && req.method === 'GET') {
        if (!SERPAPI_KEY) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            return res.end('Missing SERPAPI_KEY');
        }
        const id = String(url.searchParams.get('id') || '').trim();
        if (!id) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Missing id');
        }
        try {
            const product = await fetchWalmartProductDetails(id);
            const target = product?.product_page_url || '';
            if (!target) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('Not found');
            }
            res.writeHead(302, { Location: target });
            return res.end();
        } catch {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            return res.end('Redirect failed');
        }
    }

    if (url.pathname === '/api/food/admin-data' && req.method === 'GET') {
        const items = readJsonFile(WALMART_ITEMS_PATH, []);
        const groceryList = readJsonFile(WALMART_FOOD_LIST_PATH, []);
        const latest = readLatestWalmart();

        const byStore = { walmart: [], sams: [], other: [] };
        (Array.isArray(groceryList) ? groceryList : []).forEach((item) => {
            const sku = String(item?.sku || '').toLowerCase();
            if (sku.startsWith('walmart:')) byStore.walmart.push(item);
            else if (sku.startsWith('sams:')) byStore.sams.push(item);
            else byStore.other.push(item);
        });

        return sendJson(res, 200, {
            walmart_items: items,
            grocery_items_by_store: byStore,
            walmart_latest: latest
        });
    }

    if (url.pathname === '/api/food/walmart-items' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (!Array.isArray(payload)) {
                    return sendJson(res, 400, { error: 'Expected an array' });
                }
                writeJsonFile(WALMART_ITEMS_PATH, payload);
                return sendJson(res, 200, { ok: true, count: payload.length });
            } catch (err) {
                return sendJson(res, 400, { error: 'Invalid JSON' });
            }
        });
        return;
    }

    if (url.pathname === '/walmart-latest' && req.method === 'GET') {
        return serveStatic(req, res, '/walmart-latest.html');
    }

    if (url.pathname === '/food-admin' && req.method === 'GET') {
        return serveStatic(req, res, '/food-admin.html');
    }

    return serveStatic(req, res, url.pathname);
});

const REQUESTED_PORT = process.env.PORT;
let listenPort = Number(PORT);
if (!Number.isFinite(listenPort) || listenPort <= 0) listenPort = 3000;
let autoPortAttempts = 0;

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        if (!REQUESTED_PORT && autoPortAttempts < 12) {
            autoPortAttempts += 1;
            listenPort += 1;
            console.warn(`[server] Port in use. Retrying on ${listenPort}...`);
            setTimeout(() => server.listen(listenPort), 200);
            return;
        }

        console.error(`[server] Port ${listenPort} is already in use.`);
        console.error('[server] Close the other dev server or set PORT in your .env (e.g. PORT=3001).');
        process.exit(1);
        return;
    }

    console.error('[server] Failed to start server:', err?.message || err);
    process.exit(1);
});

server.listen(listenPort, () => {
    console.log(`Server running on http://localhost:${listenPort}`);
    console.log('[asset] main.js resolved path:', path.resolve(PUBLIC_DIR, 'js', 'main.js'));
});

const shutdown = async () => {
    try {
        await db.close();
    } catch (err) {
        console.error('[db] Failed to close pool', err?.message || err);
    }
    process.exit(0);
};

process.on('unhandledRejection', (reason) => {
    console.error('[process] unhandledRejection', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[process] uncaughtException', err?.message || err);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const runMonthlyRefresh = async () => {
    if (!SERPAPI_KEY) return;
    if (!shouldRunMonthlyRefresh()) return;
    try {
        const items = loadWalmartItems();
        const results = [];
        for (const item of items) {
            const query = String(item.query || '').trim();
            if (!query) continue;
            const forceRefresh = Array.isArray(item.preferredIds) && item.preferredIds.length > 0;
            const result = await fetchWalmartProducts(query, { forceRefresh });
            const data = result?.data;
            const resList = Array.isArray(data?.results) ? data.results : [];
            const category = data?.category || getCategoryForQuery(query);
            let topTwo = [];
            if (Array.isArray(item.preferredIds) && item.preferredIds.length > 0) {
                topTwo = pickPreferredIds(resList, item.preferredIds);
                if (topTwo.length < 2 && Array.isArray(item.fallbackIds) && item.fallbackIds.length > 0) {
                    const fallback = pickPreferredIds(resList, item.fallbackIds);
                    topTwo = [...topTwo, ...fallback].slice(0, 2);
                }
            }
            if (topTwo.length < 2) {
                const ranked = pickTopTwoByPerOz(resList);
                topTwo = [...topTwo, ...ranked].slice(0, 2);
            }
            topTwo = await enrichWalmartItemsWithMacros(topTwo, query);
            const macros = await pickEntryMacros(topTwo, query);
            results.push(topTwo.length === 0 ? {
                status: 'not_found',
                reason: 'No valid consumer-priced items after filtering',
                query,
                category,
                group: item.group || '',
                groupName: item.groupName || '',
                top_two_by_oz: [],
                macros
            } : {
                query,
                category,
                group: item.group || '',
                groupName: item.groupName || '',
                top_two_by_oz: topTwo,
                macros
            });
        }
        const payload = {
            generatedAt: new Date().toISOString(),
            count: results.length,
            items: results
        };
        writeLatestWalmart(payload);
        markMonthlyRefresh();
        console.log('[walmart] Monthly refresh complete');
    } catch (err) {
        console.error('[walmart] Monthly refresh failed', err.message);
    }
};

setInterval(runMonthlyRefresh, 6 * 60 * 60 * 1000);
runMonthlyRefresh();
