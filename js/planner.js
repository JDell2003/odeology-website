const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const RESULTS_DIR = path.join(process.cwd(), 'results');

const todayStamp = () => new Date().toISOString().slice(0, 10);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const writeCsv = (filePath, rows) => {
  const header = Object.keys(rows[0] || {}).join(',');
  const body = rows.map((row) =>
    Object.values(row).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  );
  fs.writeFileSync(filePath, [header, ...body].join('\n'), 'utf8');
};

const normalizeUnit = (unit) => {
  if (!unit) return null;
  const u = unit.toLowerCase().trim();
  if (u === 'oz' || u === 'fl oz' || u === 'floz') return 'oz';
  if (u === 'lb' || u === 'lbs') return 'lb';
  if (u === 'g' || u === 'gram' || u === 'grams') return 'g';
  if (u === 'kg') return 'kg';
  if (u === 'ct' || u === 'count' || u === 'each' || u === 'ea') return 'ct';
  return u;
};

const toBaseQuantity = (qty, unit, baseUnit) => {
  const u = normalizeUnit(unit);
  if (!u || !Number.isFinite(qty)) return null;
  if (baseUnit === 'ct') {
    return u === 'ct' ? qty : null;
  }
  if (baseUnit === 'oz') {
    if (u === 'oz') return qty;
    if (u === 'lb') return qty * 16;
    if (u === 'g') return qty / 28.3495;
    if (u === 'kg') return qty * 35.274;
  }
  return null;
};

const unitPriceToBase = (unitPrice, unitType) => {
  if (!Number.isFinite(unitPrice)) return null;
  const u = normalizeUnit(unitType);
  if (!u) return null;
  if (u === 'ct') return { value: unitPrice, unit: 'ct' };
  if (u === 'oz') return { value: unitPrice, unit: 'oz' };
  if (u === 'lb') return { value: unitPrice / 16, unit: 'oz' };
  if (u === 'g') return { value: unitPrice / 28.3495, unit: 'oz' };
  if (u === 'kg') return { value: unitPrice / 35.274, unit: 'oz' };
  return null;
};

const findCheapest = (storePrices, allowedStores) => {
  const candidates = [];
  Object.entries(storePrices || {}).forEach(([store, data]) => {
    if (allowedStores && allowedStores.length && !allowedStores.includes(store)) return;
    if (!data) return;
    const normalized = unitPriceToBase(data.unitPrice, data.unitType);
    if (normalized) {
      candidates.push({ store, data, normalized });
    } else if (Number.isFinite(data.price)) {
      candidates.push({ store, data, normalized: null });
    }
  });

  const withUnit = candidates.filter((c) => c.normalized);
  if (withUnit.length) {
    return withUnit.reduce((best, cur) =>
      cur.normalized.value < best.normalized.value ? cur : best
    );
  }
  if (candidates.length) {
    return candidates.reduce((best, cur) =>
      (cur.data.price ?? Infinity) < (best.data.price ?? Infinity) ? cur : best
    );
  }
  return null;
};

function plan() {
  ensureDir(RESULTS_DIR);
  const priceData = readJson(path.join(DATA_DIR, 'latest.json'));
  const listData = readJson(path.join(DATA_DIR, 'grocery-list.json'));

  if (!priceData) {
    console.error('Missing data/latest.json. Run the scraper first.');
    process.exit(1);
  }
  if (!listData) {
    console.error('Missing data/grocery-list.json. Create it based on grocery-list.example.json.');
    process.exit(1);
  }

  const budget = Number(listData.budgetMonthly || 0);
  const allowedStores = (listData.stores || []).length ? listData.stores : null;

  const rows = [];
  let total = 0;
  const unmatched = [];

  for (const item of listData.items || []) {
    const key = item.name.toLowerCase();
    const storePrices = priceData[key];
    const best = findCheapest(storePrices, allowedStores);
    if (!best) {
      unmatched.push(item.name);
      continue;
    }

    const qtyBase = toBaseQuantity(item.quantity, item.unit, best.normalized?.unit || normalizeUnit(best.data.unitType));
    if (!qtyBase || !best.normalized) {
      unmatched.push(item.name);
      continue;
    }

    const subtotal = qtyBase * best.normalized.value;
    total += subtotal;

    rows.push({
      item: item.name,
      quantity: `${item.quantity} ${item.unit}`,
      store: best.store,
      unitPrice: best.normalized ? `$${best.normalized.value.toFixed(2)}/${best.normalized.unit}` : 'N/A',
      subtotal: `$${subtotal.toFixed(2)}`,
      url: best.data.url || ''
    });
  }

  const overBudget = budget > 0 && total > budget;

  const result = {
    budgetMonthly: budget,
    totalMonthlyEstimate: Number(total.toFixed(2)),
    overBudget,
    stores: allowedStores || 'all',
    items: rows,
    unmatched
  };

  const outJson = path.join(RESULTS_DIR, `${todayStamp()}-plan.json`);
  const outLatest = path.join(RESULTS_DIR, 'latest-plan.json');
  writeJson(outJson, result);
  writeJson(outLatest, result);

  if (rows.length) {
    writeCsv(path.join(RESULTS_DIR, `${todayStamp()}-plan.csv`), rows);
    writeCsv(path.join(RESULTS_DIR, 'latest-plan.csv'), rows);
  }

  console.table(rows.map((r) => ({
    item: r.item,
    store: r.store,
    unitPrice: r.unitPrice,
    subtotal: r.subtotal
  })));

  console.log(`Total estimate: $${total.toFixed(2)}`);
  if (budget > 0) {
    console.log(`Budget: $${budget.toFixed(2)} ${overBudget ? '(OVER)' : '(OK)'}`);
  }
  if (unmatched.length) {
    console.log(`Unmatched: ${unmatched.join(', ')}`);
  }
}

plan();
