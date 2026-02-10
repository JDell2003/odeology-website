import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import fs from "fs";

function normalizeTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function tokenVariants(token) {
  const variants = new Set([token]);
  if (token.endsWith("ies") && token.length > 3) variants.add(`${token.slice(0, -3)}y`);
  if (token.endsWith("es") && token.length > 3) variants.add(token.slice(0, -2));
  if (token.endsWith("s") && token.length > 3) variants.add(token.slice(0, -1));
  return variants;
}

function tokenMatches(nameTokens, queryToken) {
  for (const variant of tokenVariants(queryToken)) {
    if (nameTokens.has(variant)) return true;
  }
  for (const n of nameTokens) {
    if (n.startsWith(queryToken) || queryToken.startsWith(n)) return true;
  }
  return false;
}

function nameMatchesQuery(name, query) {
  const nameTokens = new Set(normalizeTokens(name));
  const queryTokens = normalizeTokens(query);
  if (queryTokens.length === 0) return false;
  const minMatches = Math.min(2, queryTokens.length);
  let matches = 0;
  for (const t of queryTokens) {
    if (tokenMatches(nameTokens, t)) matches += 1;
  }
  return matches >= minMatches;
}

function isBlockedHtml(html) {
  return /not a robot|px-captcha|captcha|access denied|blocked/i.test(html);
}

function isLikelyFood(name) {
  const blacklist = [
    "dog",
    "cat",
    "pet",
    "toy",
    "shirt",
    "bowl",
    "collar",
    "litter",
    "treat",
    "supplement",
    "powder",
    "vitamin",
    "shampoo",
    "soap",
    "detergent",
    "cleaner"
  ];
  const lower = name.toLowerCase();
  return !blacklist.some(b => lower.includes(b));
}

function extractUnitInfoFromText(text) {
  const normalized = text.replace(/\s+/g, " ");

  const sizeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(oz|lb|ct)\b/i);
  const unitPriceMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s*(\u00A2|\$)\s*\/\s*(oz|lb|ct)/i
  );

  return {
    size: sizeMatch
      ? { value: Number(sizeMatch[1]), unit: sizeMatch[2].toLowerCase() }
      : null,
    unitPrice: unitPriceMatch
      ? {
          value:
            unitPriceMatch[2] === "\u00A2"
              ? Number(unitPriceMatch[1]) / 100
              : Number(unitPriceMatch[1]),
          unit: unitPriceMatch[3].toLowerCase()
        }
      : null
  };
}

function extractPriceFromHtml(html) {
  const $ = cheerio.load(html);

  const itempropPrice = $("span[itemprop=\"price\"]").attr("content") || $("span[itemprop=\"price\"]").text();
  const itempropNum = itempropPrice ? Number(String(itempropPrice).replace(/[^0-9.]/g, "")) : null;
  if (itempropNum) return itempropNum;

  const priceText = $("[data-testid='price'], [data-test='price'], [class*='Price']").text();
  const priceMatch = priceText.match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/);
  if (priceMatch) return Number(priceMatch[1]);

  const bodyText = $("body").text();
  const bodyMatch = bodyText.match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/);
  if (bodyMatch) return Number(bodyMatch[1]);

  return null;
}

async function fetchSamsByQuery({ query, cookie }) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  try {
    if (cookie) {
      await page.setExtraHTTPHeaders({ cookie });
    }

    const url = `https://www.samsclub.com/s/${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("div[data-testid='productTile']", { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise((r) => setTimeout(r, 800));

    const html = await page.content();
    if (isBlockedHtml(html)) {
      const safe = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      fs.mkdirSync(new URL("../../data/debug/", import.meta.url), { recursive: true });
      const path = new URL(`../../data/debug/sams-search-${safe}.html`, import.meta.url);
      fs.writeFileSync(path, html, "utf8");
      return { ok: false, store: "sams", itemId: null, blocked: true, reason: "BLOCKED", updatedAt: new Date().toISOString() };
    }

    const candidates = [];
    const debugNames = [];
    const cardData = await page.$$eval("div[data-testid='productTile'], a[href*='/p/']", (els) =>
      els.slice(0, 12).map((el) => {
        const name =
          el.querySelector("[data-testid='productTileName']")?.textContent?.trim() ||
          el.querySelector("h3")?.textContent?.trim() ||
          el.querySelector("a[href*='/p/']")?.textContent?.trim() ||
          "";
        const text = el.textContent || "";
        return { name, text };
      })
    ).catch(() => []);

    cardData.forEach((row) => {
      const text = row.text || "";
      const name = row.name || "";
      if (name && debugNames.length < 5) debugNames.push(name);
      if (!name) return;
      if (!nameMatchesQuery(name, query)) return;
      if (!isLikelyFood(name)) return;

      const price = extractPriceFromHtml(text);
      const unitInfo = extractUnitInfoFromText(`${name} ${text}`);

      let unitPrice = unitInfo?.unitPrice?.value ?? null;
      let unitPriceUnit = unitInfo?.unitPrice?.unit ?? null;
      const sizeValue = unitInfo?.size?.value ?? null;
      const sizeUnit = unitInfo?.size?.unit ?? null;

      if (unitPrice == null && price != null && sizeValue != null && sizeUnit) {
        unitPrice = Number((price / sizeValue).toFixed(4));
        unitPriceUnit = sizeUnit;
      }

      let baseUnit = null;
      let pricePerBaseUnit = null;
      if (unitPrice != null && unitPriceUnit) {
        if (unitPriceUnit === "lb") {
          baseUnit = "oz";
          pricePerBaseUnit = unitPrice / 16;
        } else if (unitPriceUnit === "oz") {
          baseUnit = "oz";
          pricePerBaseUnit = unitPrice;
        } else if (unitPriceUnit === "ct") {
          baseUnit = "ct";
          pricePerBaseUnit = unitPrice;
        }
      }

      candidates.push({
        name,
        price,
        sizeValue,
        sizeUnit,
        unitPrice,
        unitPriceUnit,
        baseUnit,
        pricePerBaseUnit
      });
    });

    if (candidates.length === 0) {
      console.log("Sams search debug names:", debugNames);
      fs.mkdirSync(new URL("../../data/debug/", import.meta.url), { recursive: true });
      const safe = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      const path = new URL(`../../data/debug/sams-search-${safe}.html`, import.meta.url);
      fs.writeFileSync(path, html, "utf8");
      return { ok: false, store: "sams", itemId: null, blocked: false, reason: "SEARCH_NO_MATCH", updatedAt: new Date().toISOString() };
    }

    const best =
      candidates
        .filter(c => typeof c.pricePerBaseUnit === "number")
        .sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit)[0] ||
      candidates
        .filter(c => typeof c.price === "number")
        .sort((a, b) => a.price - b.price)[0];

    return {
      ok: true,
      store: "sams",
      itemId: null,
      price: best.price,
      unit: "each",
      sizeValue: best.sizeValue,
      sizeUnit: best.sizeUnit,
      unitPrice: best.unitPrice,
      unitPriceUnit: best.unitPriceUnit,
      baseUnit: best.baseUnit,
      pricePerBaseUnit: best.pricePerBaseUnit,
      source: "search",
      updatedAt: new Date().toISOString()
    };
  } finally {
    await page.close();
    await browser.close();
  }
}

export async function fetchSamsPrice({ itemId, query, cookie }) {
  if (!itemId && query) {
    return fetchSamsByQuery({ query, cookie });
  }
  const url = `https://www.samsclub.com/p/${itemId}`;
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  try {
    if (cookie) {
      await page.setExtraHTTPHeaders({ cookie });
    }

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    const html = await page.content();

    const blocked = /captcha|access denied|robot/i.test(html);
    if (blocked) {
      return {
        ok: false,
        store: "sams",
        itemId,
        url,
        blocked: true,
        reason: "BLOCKED",
        updatedAt: new Date().toISOString()
      };
    }

    const price = extractPriceFromHtml(html);
    const text = cheerio.load(html)("body").text();
    const unitInfo = extractUnitInfoFromText(text);

    let unitPrice = unitInfo?.unitPrice?.value ?? null;
    let unitPriceUnit = unitInfo?.unitPrice?.unit ?? null;
    const sizeValue = unitInfo?.size?.value ?? null;
    const sizeUnit = unitInfo?.size?.unit ?? null;

    if (unitPrice == null && price != null && sizeValue != null && sizeUnit) {
      unitPrice = Number((price / sizeValue).toFixed(4));
      unitPriceUnit = sizeUnit;
    }

    let baseUnit = null;
    let pricePerBaseUnit = null;
    if (unitPrice != null && unitPriceUnit) {
      if (unitPriceUnit === "lb") {
        baseUnit = "oz";
        pricePerBaseUnit = unitPrice / 16;
      } else if (unitPriceUnit === "oz") {
        baseUnit = "oz";
        pricePerBaseUnit = unitPrice;
      } else if (unitPriceUnit === "ct") {
        baseUnit = "ct";
        pricePerBaseUnit = unitPrice;
      }
    }

    if (price != null) {
      return {
        ok: true,
        store: "sams",
        itemId,
        url,
        price,
        unit: "each",
        sizeValue,
        sizeUnit,
        unitPrice,
        unitPriceUnit,
        baseUnit,
        pricePerBaseUnit,
        source: "html",
        updatedAt: new Date().toISOString()
      };
    }

    return {
      ok: false,
      store: "sams",
      itemId,
      url,
      blocked: false,
      reason: "HTML_NO_PRICE",
      updatedAt: new Date().toISOString()
    };
  } finally {
    await page.close();
    await browser.close();
  }
}
