const crypto = require('crypto');
const db = require('./db');

const MAX_BODY_BYTES = Math.max(10_000, Number(process.env.GROCERIES_MAX_BODY_BYTES || 400_000));

let schemaEnsured = false;
let schemaEnsurePromise = null;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function parseCookies(header) {
  const src = String(header || '');
  const out = {};
  src.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
  return true;
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

async function ensureSchema() {
  if (schemaEnsured) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;
  if (!db.isConfigured()) return;

  const safeQuery = async (sql) => {
    try {
      await db.query(sql);
    } catch (err) {
      const code = String(err?.code || '');
      if (code === '23505' || code === '42P07') return;
      throw err;
    }
  };

  schemaEnsurePromise = (async () => {
    await safeQuery('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_grocery_lists (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        user_id uuid NOT NULL,
        source text NOT NULL DEFAULT 'grocery_plan',
        totals jsonb NOT NULL DEFAULT '{}'::jsonb,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        meta jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_grocery_lists_user_created ON app_grocery_lists(user_id, created_at DESC);');

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS app_custom_foods (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        user_id uuid NOT NULL,
        food jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await safeQuery('CREATE INDEX IF NOT EXISTS idx_app_custom_foods_user_updated ON app_custom_foods(user_id, updated_at DESC);');

    schemaEnsured = true;
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

async function resolveUserIdFromSession(req) {
  if (!db.isConfigured()) return null;
  await ensureSchema();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[process.env.SESSION_COOKIE_NAME || 'sid'];
  if (!token) return null;
  const tokenHash = sha256Hex(token);

  try {
    const result = await db.query(
      `
        SELECT user_id
        FROM app_sessions
        WHERE session_token_hash = $1
          AND expires_at > now()
        LIMIT 1;
      `,
      [tokenHash]
    );
    return result.rows?.[0]?.user_id || null;
  } catch {
    return null;
  }
}

function cleanText(value, maxLen = 160) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeCategory(raw) {
  const c = String(raw || '').trim().toLowerCase();
  if (!c) return 'Misc';
  if (c === 'protein') return 'Protein';
  if (c === 'carb' || c === 'carbs') return 'Carb';
  if (c === 'fat' || c === 'fats') return 'Fat';
  if (c === 'produce' || c === 'veg' || c === 'vegetable' || c === 'vegetables' || c === 'fruit') return 'Produce';
  if (c === 'misc' || c === 'other') return 'Misc';
  return c.charAt(0).toUpperCase() + c.slice(1, 32);
}

function normalizeSource(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'macro_calculator' || s === 'macro') return 'macro_calculator';
  if (s === 'grocery_generator' || s === 'generator') return 'grocery_generator';
  if (s === 'grocery_plan' || s === 'plan') return 'grocery_plan';
  return 'grocery_plan';
}

function cleanUrl(value, maxLen = 800) {
  const s = String(value || '').trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function cleanImage(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (s.startsWith('data:image/')) return s.length > 1_000_000 ? null : s;
  if (/^https?:\/\//i.test(s)) return s.slice(0, 900);
  if (s.startsWith('assets/')) return s.slice(0, 900);
  return null;
}

function normalizeFoodCategory(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'misc';
  if (s === 'protein') return 'protein';
  if (s === 'lean_protein') return 'lean_protein';
  if (s === 'protein_fat') return 'protein_fat';
  if (s === 'carb' || s === 'carbs') return 'carb';
  if (s === 'fat' || s === 'fats') return 'fat';
  if (s === 'carb_protein') return 'carb_protein';
  return s.slice(0, 32);
}

function normalizeCustomFood(rawFood, { rowId }) {
  const f = rawFood && typeof rawFood === 'object' ? rawFood : {};

  const name = cleanText(f?.name, 180);
  const store = cleanText(f?.store, 64);
  const category = normalizeFoodCategory(f?.category);
  const url = cleanUrl(f?.url);
  const image = cleanImage(f?.image);

  const servingAmount = Number(f?.serving?.amount);
  const servingUnit = cleanText(f?.serving?.unit, 16);

  const cal = Number(f?.macros?.calories);
  const p = Number(f?.macros?.protein);
  const c = Number(f?.macros?.carbs);
  const fat = Number(f?.macros?.fat);

  const containerSize = Number(f?.container?.size);
  const containerUnit = cleanText(f?.container?.unit, 16);
  const containerPrice = Number(f?.container?.price);

  const hasMacros = [cal, p, c, fat].every((n) => Number.isFinite(n) && n >= 0);
  const hasServing = Number.isFinite(servingAmount) && servingAmount > 0 && !!servingUnit;
  const hasContainer =
    Number.isFinite(containerSize) &&
    containerSize > 0 &&
    !!containerUnit &&
    Number.isFinite(containerPrice) &&
    containerPrice >= 0;

  if (!name || !store || !image || !hasMacros || !hasServing || !hasContainer) return null;

  return {
    id: `custom_${rowId}`,
    name,
    store,
    category,
    url: url || '',
    image,
    serving: { amount: servingAmount, unit: servingUnit },
    macros: { calories: cal, protein: p, carbs: c, fat },
    container: { size: containerSize, unit: containerUnit, price: containerPrice }
  };
}

function sanitizeItems(raw) {
  const items = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const entry of items.slice(0, 500)) {
    const name = cleanText(entry?.name || entry?.item || entry?.title, 180);
    if (!name) continue;
    const quantity = cleanText(entry?.quantity || entry?.qty || '', 80);
    const category = normalizeCategory(entry?.category);
    const estimatedWeeklyCost = Number(entry?.estimatedWeeklyCost);
    const estimatedCost = Number(entry?.estimatedCost);
    const image = cleanImage(entry?.image);
    const url = cleanUrl(entry?.url);
    const daily = Number(entry?.daily);
    const daysPerContainer = Number(entry?.daysPerContainer);
    const containerPrice = Number(entry?.containerPrice);
    const unit = cleanText(entry?.unit, 16);
    out.push({
      name,
      quantity: quantity || '',
      category,
      estimatedWeeklyCost: Number.isFinite(estimatedWeeklyCost) ? estimatedWeeklyCost : null,
      estimatedCost: Number.isFinite(estimatedCost) ? estimatedCost : null,
      image,
      url,
      daily: Number.isFinite(daily) && daily >= 0 ? daily : null,
      daysPerContainer: Number.isFinite(daysPerContainer) && daysPerContainer >= 0 ? daysPerContainer : null,
      containerPrice: Number.isFinite(containerPrice) && containerPrice >= 0 ? containerPrice : null,
      unit: unit || null
    });
  }
  return out;
}

function sanitizeTotals(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const weekly = Number(t.totalEstimatedWeeklyCost ?? t.weeklyTotal ?? t.weekly);
  const total = Number(t.totalEstimatedCost ?? t.total);
  const currency = cleanText(t.currency || 'USD', 8) || 'USD';
  return {
    totalEstimatedWeeklyCost: Number.isFinite(weekly) ? weekly : null,
    totalEstimatedCost: Number.isFinite(total) ? total : null,
    currency
  };
}

function scaleNumber(value, factor) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * factor * 100) / 100;
}

module.exports = async function groceriesRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/groceries/')) return false;

  if (!db.isConfigured()) {
    return sendJson(res, 501, { error: 'Database not configured' });
  }

  await ensureSchema();

  if (url.pathname === '/api/groceries/custom-foods' && req.method === 'GET') {
    const userId = await resolveUserIdFromSession(req);
    if (!userId) return sendJson(res, 401, { error: 'Not signed in' });
    try {
      const result = await db.query(
        `
          SELECT id, created_at, updated_at, food
          FROM app_custom_foods
          WHERE user_id = $1
          ORDER BY updated_at DESC, created_at DESC;
        `,
        [userId]
      );
      const foods = (result.rows || []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        food: row.food
      }));
      return sendJson(res, 200, { foods });
    } catch (err) {
      console.error('[custom-foods-get]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to load custom foods' });
    }
  }

  if (url.pathname === '/api/groceries/custom-foods' && req.method === 'POST') {
    const userId = await resolveUserIdFromSession(req);
    if (!userId) return sendJson(res, 401, { error: 'Not signed in' });

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const incoming = payload?.food && typeof payload.food === 'object' ? payload.food : null;
    if (!incoming) return sendJson(res, 400, { error: 'Missing food' });

    try {
      const inserted = await db.query(
        `
          INSERT INTO app_custom_foods (user_id, food)
          VALUES ($1, '{}'::jsonb)
          RETURNING id, created_at, updated_at;
        `,
        [userId]
      );

      const rowId = inserted.rows?.[0]?.id || null;
      if (!rowId) return sendJson(res, 500, { error: 'Failed to create record' });

      const normalized = normalizeCustomFood(incoming, { rowId });
      if (!normalized) {
        await db.query('DELETE FROM app_custom_foods WHERE id = $1 AND user_id = $2;', [rowId, userId]);
        return sendJson(res, 400, { error: 'Missing required fields (image, store, price, serving, macros, container size)' });
      }

      await db.query(
        `
          UPDATE app_custom_foods
          SET updated_at = now(), food = $3::jsonb
          WHERE id = $1 AND user_id = $2;
        `,
        [rowId, userId, JSON.stringify(normalized)]
      );

      return sendJson(res, 200, {
        ok: true,
        item: {
          id: rowId,
          createdAt: inserted.rows?.[0]?.created_at || null,
          updatedAt: inserted.rows?.[0]?.updated_at || null,
          food: normalized
        }
      });
    } catch (err) {
      console.error('[custom-foods-post]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to save custom food' });
    }
  }

  if (url.pathname.startsWith('/api/groceries/custom-foods/') && req.method === 'DELETE') {
    const userId = await resolveUserIdFromSession(req);
    if (!userId) return sendJson(res, 401, { error: 'Not signed in' });
    const id = String(url.pathname.split('/').pop() || '').trim();
    if (!id) return sendJson(res, 400, { error: 'Missing id' });
    try {
      await db.query('DELETE FROM app_custom_foods WHERE id = $1 AND user_id = $2;', [id, userId]);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[custom-foods-del]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to delete custom food' });
    }
  }

  if (url.pathname === '/api/groceries/latest' && req.method === 'GET') {
    const userId = await resolveUserIdFromSession(req);
    if (!userId) return sendJson(res, 401, { error: 'Not signed in' });
    try {
      const result = await db.query(
        `
          SELECT id, created_at, source, totals, items, meta
          FROM app_grocery_lists
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 1;
        `,
        [userId]
      );
      const row = result.rows?.[0] || null;
      return sendJson(res, 200, { list: row });
    } catch (err) {
      console.error('[groceries-latest]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to load grocery list' });
    }
  }

  if (url.pathname === '/api/groceries/save' && req.method === 'POST') {
    const userId = await resolveUserIdFromSession(req);
    if (!userId) return sendJson(res, 401, { error: 'Not signed in' });

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const source = normalizeSource(payload?.source);
    const items = sanitizeItems(payload?.items);
    const totals = sanitizeTotals(payload?.totals);
    const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : {};

    const macroTargetsRaw =
      (meta?.macroTargets && typeof meta.macroTargets === 'object' ? meta.macroTargets : null) ||
      (meta?.macro_targets && typeof meta.macro_targets === 'object' ? meta.macro_targets : null) ||
      (meta?.macros && typeof meta.macros === 'object' ? meta.macros : null);

    const macroTargets = (() => {
      if (!macroTargetsRaw) return null;
      const calories = Number(macroTargetsRaw?.calories);
      const proteinG = Number(macroTargetsRaw?.proteinG ?? macroTargetsRaw?.protein_g ?? macroTargetsRaw?.protein);
      const carbG = Number(macroTargetsRaw?.carbG ?? macroTargetsRaw?.carbsG ?? macroTargetsRaw?.carbs_g ?? macroTargetsRaw?.carbs);
      const fatG = Number(macroTargetsRaw?.fatG ?? macroTargetsRaw?.fat_g ?? macroTargetsRaw?.fat);
      const ok = [calories, proteinG, carbG, fatG].every((n) => Number.isFinite(n) && n >= 0);
      if (!ok) return null;
      return { calories, proteinG, carbG, fatG };
    })();

    const metaSafe = {
      generatedAt: cleanText(meta?.generatedAt || meta?.generated_at || '', 64) || null,
      store: cleanText(meta?.store || '', 64) || null,
      notes: cleanText(meta?.notes || '', 240) || null,
      macroTargets
    };

    if (items.length === 0) return sendJson(res, 400, { error: 'Missing items' });

    try {
      const result = await db.query(
        `
          INSERT INTO app_grocery_lists (user_id, source, totals, items, meta)
          VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)
          RETURNING id, created_at;
        `,
        [userId, source, JSON.stringify(totals), JSON.stringify(items), JSON.stringify(metaSafe)]
      );
      return sendJson(res, 200, { ok: true, id: result.rows?.[0]?.id || null, createdAt: result.rows?.[0]?.created_at || null });
    } catch (err) {
      console.error('[groceries-save]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to save grocery list' });
    }
  }

  if (url.pathname === '/api/groceries/adjust' && req.method === 'POST') {
    const userId = await resolveUserIdFromSession(req);
    if (!userId) return sendJson(res, 401, { error: 'Not signed in' });

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const listId = cleanText(payload?.listId, 120);
    const newCalories = Number(payload?.newCalories);
    if (!Number.isFinite(newCalories) || newCalories <= 0) {
      return sendJson(res, 400, { error: 'Missing newCalories' });
    }

    try {
      const listRes = listId
        ? await db.query(
          `
            SELECT id, created_at, source, totals, items, meta
            FROM app_grocery_lists
            WHERE user_id = $1 AND id = $2
            LIMIT 1;
          `,
          [userId, listId]
        )
        : await db.query(
          `
            SELECT id, created_at, source, totals, items, meta
            FROM app_grocery_lists
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1;
          `,
          [userId]
        );

      const row = listRes.rows?.[0];
      if (!row) return sendJson(res, 404, { error: 'No grocery list found' });

      const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
      const macroTargets = meta.macroTargets && typeof meta.macroTargets === 'object' ? meta.macroTargets : null;
      const currentCalories = Number(macroTargets?.calories);
      if (!Number.isFinite(currentCalories) || currentCalories <= 0) {
        return sendJson(res, 400, { error: 'Missing macro targets on grocery list' });
      }

      const factor = newCalories / currentCalories;
      const items = Array.isArray(row.items) ? row.items : [];
      const adjustedItems = items.map((item) => {
        const next = { ...item };
        const weekly = Number(item?.estimatedWeeklyCost);
        const total = Number(item?.estimatedCost);
        const daily = Number(item?.daily);
        const daysPerContainer = Number(item?.daysPerContainer);
        const containerPrice = Number(item?.containerPrice);

        next.estimatedWeeklyCost = scaleNumber(weekly, factor) ?? item?.estimatedWeeklyCost ?? null;
        next.estimatedCost = scaleNumber(total, factor) ?? item?.estimatedCost ?? null;
        if (Number.isFinite(daily)) next.daily = Math.round(daily * factor * 1000) / 1000;
        if (Number.isFinite(daysPerContainer)) next.daysPerContainer = Math.round(daysPerContainer / Math.max(0.2, factor) * 100) / 100;
        if (Number.isFinite(containerPrice)) next.containerPrice = containerPrice;
        return next;
      });

      const currentTotals = sanitizeTotals(row.totals);
      const currentWeekly = Number(currentTotals?.totalEstimatedWeeklyCost);
      const updatedWeekly = Number.isFinite(currentWeekly)
        ? scaleNumber(currentWeekly, factor)
        : null;

      const updatedTotals = {
        totalEstimatedWeeklyCost: updatedWeekly,
        totalEstimatedCost: currentTotals?.totalEstimatedCost
          ? scaleNumber(Number(currentTotals.totalEstimatedCost), factor)
          : null,
        currency: currentTotals?.currency || 'USD'
      };

      const updatedMeta = {
        ...meta,
        macroTargets: {
          ...(macroTargets || {}),
          calories: newCalories
        },
        adjustment: {
          appliedAt: new Date().toISOString(),
          previousCalories: currentCalories,
          newCalories,
          factor: Math.round(factor * 1000) / 1000,
          previousWeeklyCost: Number.isFinite(currentWeekly) ? currentWeekly : null,
          newWeeklyCost: updatedWeekly
        }
      };

      const inserted = await db.query(
        `
          INSERT INTO app_grocery_lists (user_id, source, totals, items, meta)
          VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)
          RETURNING id, created_at;
        `,
        [userId, 'training_adjustment', JSON.stringify(updatedTotals), JSON.stringify(adjustedItems), JSON.stringify(updatedMeta)]
      );

      const deltaWeekly = (Number.isFinite(updatedWeekly) && Number.isFinite(currentWeekly))
        ? Math.round((updatedWeekly - currentWeekly) * 100) / 100
        : null;

      return sendJson(res, 200, {
        ok: true,
        id: inserted.rows?.[0]?.id || null,
        createdAt: inserted.rows?.[0]?.created_at || null,
        deltaWeeklyCost: deltaWeekly,
        totals: updatedTotals,
        meta: updatedMeta
      });
    } catch (err) {
      console.error('[groceries-adjust]', err?.message || err);
      return sendJson(res, 500, { error: 'Failed to adjust grocery list' });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
};
