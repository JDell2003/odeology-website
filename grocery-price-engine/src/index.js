console.log("RUNNING index.js");
import "dotenv/config";
import fs from "fs";
import { fetchWalmartPrice } from "./adapters/walmart.js";
import { fetchSamsPrice } from "./adapters/sams.js";
import { readCache, writeCache } from "./lib/cache.js";
import { readState, writeState, getStoreState, nextBackoffMs } from "./lib/state.js";
import { pickCheapest } from "./lib/pricing.js";
import { writeLatestCsv, writeLatestJson } from "./lib/output.js";
import { log } from "./lib/log.js";

const STORES = JSON.parse(fs.readFileSync(new URL("../config/stores.json", import.meta.url), "utf8"));
const ITEMS = JSON.parse(fs.readFileSync(new URL("../config/items.json", import.meta.url), "utf8"));
const BUDGET = JSON.parse(fs.readFileSync(new URL("../config/budget.json", import.meta.url), "utf8"));

function parseSku(sku) {
  if (!sku.includes(":")) return { store: "item", id: sku };
  const [store, ...rest] = sku.split(":");
  return { store, id: rest.join(":") };
}

function pickCheapestVariant(variants) {
  const byPrice = variants
    .filter(v => typeof v.price === "number" && v.price > 0)
    .sort((a, b) => a.price - b.price);
  if (byPrice.length > 0) return byPrice[0];

  const byUnit = variants
    .filter(v => typeof v.pricePerBaseUnit === "number" && v.pricePerBaseUnit > 0)
    .sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit);
  if (byUnit.length > 0) return byUnit[0];

  return variants[0] || null;
}

export async function runOnce() {
  console.log("ENTERED runOnce()");
  const cache = readCache();
  const state = readState();
  const variants = [];

  for (const item of ITEMS) {
    const { store, id } = parseSku(item.sku);
    const query = item.name || id;
    const perStore = [];
    const group = item.group || item.sku;
    const groupName = item.groupName || item.group || item.name || item.sku;

    // Walmart
    if ((store === "walmart" || store === "item") && STORES.walmart?.enabled) {
      const storeState = getStoreState(state, item.sku, "walmart");
      const now = Date.now();
      const nextAttemptAt = storeState.nextAttemptAt ? Date.parse(storeState.nextAttemptAt) : 0;
      if (!nextAttemptAt || now >= nextAttemptAt) {
        const cookie = process.env.WALMART_COOKIE || "";
        storeState.lastAttemptAt = new Date().toISOString();
        console.log("ABOUT TO CALL Walmart adapter");
        const r = await fetchWalmartPrice({ itemId: store === "walmart" ? id : null, query, cookie });
        console.log("RETURNED FROM Walmart adapter", r);

        if (r.ok) {
          r.price_status = "fresh";
          perStore.push(r);
          cache[item.sku] = cache[item.sku] || {};
          cache[item.sku].walmart = r;
          storeState.failCount = 0;
          storeState.lastSuccessAt = new Date().toISOString();
          storeState.nextAttemptAt = null;
          storeState.lastError = null;
        } else {
          storeState.failCount += 1;
          storeState.lastError = r.reason || "FAILED";
          storeState.nextAttemptAt = new Date(now + nextBackoffMs(storeState.failCount)).toISOString();
          log("Walmart blocked/failed for", item.sku, "status:", r.status, "reason:", r.reason);
          if (cache[item.sku]?.walmart) {
            const cached = { ...cache[item.sku].walmart, price_status: "cached" };
            perStore.push(cached);
          }
        }
      } else if (cache[item.sku]?.walmart) {
        const cached = { ...cache[item.sku].walmart, price_status: "cached" };
        perStore.push(cached);
      }
    }

    // Sam's Club
    if ((store === "sams" || store === "item") && STORES.sams?.enabled) {
      const storeState = getStoreState(state, item.sku, "sams");
      const now = Date.now();
      const nextAttemptAt = storeState.nextAttemptAt ? Date.parse(storeState.nextAttemptAt) : 0;
      if (!nextAttemptAt || now >= nextAttemptAt) {
        const cookie = process.env.SAMS_COOKIE || "";
        storeState.lastAttemptAt = new Date().toISOString();
        console.log("ABOUT TO CALL Sams adapter");
        const s = await fetchSamsPrice({ itemId: store === "sams" ? id : null, query, cookie });
        console.log("RETURNED FROM Sams adapter", s);

        if (s.ok) {
          s.price_status = "fresh";
          perStore.push(s);
          cache[item.sku] = cache[item.sku] || {};
          cache[item.sku].sams = s;
          storeState.failCount = 0;
          storeState.lastSuccessAt = new Date().toISOString();
          storeState.nextAttemptAt = null;
          storeState.lastError = null;
        } else {
          storeState.failCount += 1;
          storeState.lastError = s.reason || "FAILED";
          storeState.nextAttemptAt = new Date(now + nextBackoffMs(storeState.failCount)).toISOString();
          log("Sams blocked/failed for", item.sku, "status:", s.status, "reason:", s.reason);
          if (cache[item.sku]?.sams) {
            const cached = { ...cache[item.sku].sams, price_status: "cached" };
            perStore.push(cached);
          }
        }
      } else if (cache[item.sku]?.sams) {
        const cached = { ...cache[item.sku].sams, price_status: "cached" };
        perStore.push(cached);
      }
    }

    const cheapest = pickCheapest(perStore);
    const price = cheapest?.price ?? null;
    const baseUnit = cheapest?.baseUnit ?? null;
    const pricePerBaseUnit = cheapest?.pricePerBaseUnit ?? null;

    const subtotal = (price != null && item.qty != null)
      ? Number((price * item.qty).toFixed(2))
      : null;

    const out = {
      group,
      groupName,
      sku: item.sku,
      name: cheapest?.name || item.name,
      url: cheapest?.url || item.url || "",
      qty: item.qty,
      unit: item.unit,
      offers: perStore,
      chosen: cheapest,
      price,
      baseUnit,
      pricePerBaseUnit,
      subtotal,
      price_status: cheapest?.price_status || (cheapest ? "fresh" : "updating")
    };

    variants.push(out);
  }

  const grouped = new Map();
  variants.forEach(v => {
    if (!grouped.has(v.group)) {
      grouped.set(v.group, { group: v.group, groupName: v.groupName, items: [] });
    }
    grouped.get(v.group).items.push(v);
  });

  const results = [];
  const groupedRows = [];

  for (const group of grouped.values()) {
    const best = pickCheapestVariant(group.items);
    if (!best) continue;
    const alternatives = group.items
      .filter(i => i.sku !== best.sku)
      .map(i => ({
        sku: i.sku,
        name: i.name,
        url: i.url,
        price: i.price,
        baseUnit: i.baseUnit,
        pricePerBaseUnit: i.pricePerBaseUnit,
        chosenStore: i.chosen?.store || ""
      }));

    results.push({
      group: group.group,
      groupName: group.groupName,
      sku: best.sku,
      name: best.name,
      url: best.url,
      qty: best.qty,
      unit: best.unit,
      offers: best.offers,
      chosen: best.chosen,
      price: best.price,
      baseUnit: best.baseUnit,
      pricePerBaseUnit: best.pricePerBaseUnit,
      subtotal: best.subtotal,
      price_status: best.price_status,
      alternatives
    });

    groupedRows.push({
      group: group.group,
      groupName: group.groupName,
      sku: best.sku,
      name: best.name,
      url: best.url,
      qty: best.qty,
      unit: best.unit,
      chosenStore: best.chosen?.store || "",
      price: best.price,
      baseUnit: best.baseUnit,
      pricePerBaseUnit: best.pricePerBaseUnit,
      subtotal: best.subtotal,
      updatedAt: best.chosen?.updatedAt || ""
    });
  }

  writeCache(cache);
  writeState(state);

  const total = results
    .map(r => r.subtotal)
    .filter(v => typeof v === "number")
    .reduce((a, b) => a + b, 0);
  const monthlyBudget = BUDGET?.monthlyBudget ?? null;
  const overBudget = typeof monthlyBudget === "number" ? total > monthlyBudget : false;

  const payload = {
    generatedAt: new Date().toISOString(),
    totals: {
      totalEstimate: Number(total.toFixed(2)),
      monthlyBudget,
      overBudget
    },
    items: results,
    variants
  };

  writeLatestJson(payload);
  writeLatestCsv(groupedRows);

  log("Done. Wrote data/latest.json and data/latest.csv");
}

if (process.argv[1].includes("index.js")) {
  runOnce().catch(console.error);
}
console.log("END OF FILE index.js reached");
