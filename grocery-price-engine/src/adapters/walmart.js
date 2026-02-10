console.log("RUNNING Walmart adapter");
import puppeteer from "puppeteer";
import fs from "fs";
import { load } from "cheerio";
import { httpGetJson } from "../lib/http.js";
import { normalizeUnitPrice, parseUnitFromName } from "../lib/normalize.js";

function buildHeaders({ cookie }) {
  return {
    "accept": "application/json",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    ...(cookie ? { "cookie": cookie } : {})
  };
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
  const bodyText = load(html)("body").text();
  const unitInfo = extractUnitInfoFromText(bodyText);
  console.log("Walmart unit info:", unitInfo);
  const $ = load(html);

  const itempropPrice = $("span[itemprop=\"price\"]").attr("content") || $("span[itemprop=\"price\"]").text();
  const itempropNum = itempropPrice ? Number(String(itempropPrice).replace(/[^0-9.]/g, "")) : null;
  if (itempropNum) return { price: itempropNum, unitInfo };

  const priceWrapText = $("[data-testid='price-wrap']").text();
  const priceWrapMatch = priceWrapText.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
  if (priceWrapMatch) return { price: Number(priceWrapMatch[1]), unitInfo };

  const reduxMatch = html.match(/__WML_REDUX_INITIAL_STATE__\s*=\s*(\{.*?\});/s);
  if (reduxMatch) {
    const blob = reduxMatch[1];
    const currentPriceMatch = blob.match(/"currentPrice"\s*:\s*\{"price"\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
    if (currentPriceMatch) return { price: Number(currentPriceMatch[1]), unitInfo };
  }

  return { price: null, unitInfo };
}

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
  return /robot or human|px-captcha|captcha|access denied|blocked/i.test(html);
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

function parsePrice(text) {
  const match = text.match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/);
  if (match) return Number(match[1]);
  return null;
}

async function fetchWalmartByQuery({ query, cookie }) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  try {
    if (cookie) {
      await page.setExtraHTTPHeaders({ cookie });
    }
    const url = `https://www.walmart.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("div[role='group'][data-item-id]", { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise((r) => setTimeout(r, 800));

    const html = await page.content();
    if (isBlockedHtml(html)) {
      const safe = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      fs.mkdirSync(new URL("../../data/debug/", import.meta.url), { recursive: true });
      const path = new URL(`../../data/debug/walmart-search-${safe}.html`, import.meta.url);
      fs.writeFileSync(path, html, "utf8");
      return {
        ok: false,
        store: "walmart",
        itemId: null,
        blocked: true,
        reason: "BLOCKED",
        updatedAt: new Date().toISOString()
      };
    }

    const candidates = [];
    const debugNames = [];
    const cardData = await page.$$eval("div[role='group'][data-item-id], div[data-item-id]", (els) =>
      els.slice(0, 12).map((el) => {
        const name =
          el.querySelector("h3[data-automation-id='product-title']")?.textContent?.trim() ||
          el.querySelector("h3")?.textContent?.trim() ||
          el.querySelector("a[link-identifier='product-name']")?.textContent?.trim() ||
          el.querySelector("a[href*='/ip/']")?.textContent?.trim() ||
          el.querySelector("img[alt]")?.getAttribute("alt")?.trim() ||
          "";
        const text = el.textContent || "";
        return { name, text };
      })
    ).catch(() => []);

    cardData.forEach((row) => {
      const name = row.name || "";
      if (name && debugNames.length < 5) debugNames.push(name);
      if (!name) return;
      if (!nameMatchesQuery(name, query)) return;
      if (!isLikelyFood(name)) return;

      const price = parsePrice(row.text);

      const unitInfo = extractUnitInfoFromText(`${name} ${row.text}`);
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
      console.log("Walmart search debug names:", debugNames);
      fs.mkdirSync(new URL("../../data/debug/", import.meta.url), { recursive: true });
      const safe = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      const path = new URL(`../../data/debug/walmart-search-${safe}.html`, import.meta.url);
      fs.writeFileSync(path, html, "utf8");
      return { ok: false, blocked: false, reason: "SEARCH_NO_MATCH" };
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
      store: "walmart",
      itemId: null,
      name: best.name,
      price: best.price,
      unit: "each",
      sizeValue: best.sizeValue,
      sizeUnit: best.sizeUnit,
      unitPrice: best.unitPrice,
      unitPriceUnit: best.unitPriceUnit,
      pricePerBaseUnit: best.pricePerBaseUnit,
      baseUnit: best.baseUnit,
      source: "search",
      updatedAt: new Date().toISOString()
    };
  } finally {
    await page.close();
    await browser.close();
  }
}

export async function fetchWalmartPrice({ itemId, query, cookie }) {
  if (!itemId && query) {
    return fetchWalmartByQuery({ query, cookie });
  }

  const url = `https://www.walmart.com/ip/${itemId}?athcpid=${itemId}&athpgid=AthenaItempage&athcgid=null&athznid=null&athieid=v0`;

  const res = await httpGetJson(url, { headers: buildHeaders({ cookie }) });

  if (!res.ok) {
    if (res.status === 200 && res.blocked) {
      try {
        const htmlRes = await fetch(url, { headers: buildHeaders({ cookie }) });
        const html = await htmlRes.text();
        const htmlResult = extractPriceFromHtml(html);
        const htmlPrice = htmlResult?.price ?? null;
        const htmlUnitInfo = htmlResult?.unitInfo ?? null;
        const sizeValue = htmlUnitInfo?.size?.value ?? null;
        const sizeUnit = htmlUnitInfo?.size?.unit ?? null;
        const unitPrice = htmlUnitInfo?.unitPrice?.value ?? null;
        const unitPriceUnit = htmlUnitInfo?.unitPrice?.unit ?? null;

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

        if (htmlPrice != null) {
          const result = {
            ok: true,
            store: "walmart",
            itemId,
            url,
            price: htmlPrice,
            unit: "each",
            sizeValue,
            sizeUnit,
            unitPrice,
            unitPriceUnit,
            pricePerBaseUnit,
            baseUnit,
            source: "html",
            updatedAt: new Date().toISOString()
          };
          console.log("Walmart adapter EXIT: html-success");
          return result;
        }
      } catch (error) {
        console.log("Walmart adapter EXIT: catch", error);
      }
      console.log("Walmart adapter EXIT: html-no-price");
      return {
        ok: false,
        blocked: true,
        reason: "HTML_NO_PRICE"
      };
    }
    console.log("Walmart adapter EXIT: failure");
    return {
      ok: false,
      blocked: !!res.blocked,
      status: res.status,
      reason: res.blocked ? "BLOCKED_OR_HTML" : "REQUEST_FAILED"
    };
  }

  const data = res.data;

  const product =
    data?.props?.pageProps?.initialData?.data?.product ||
    data?.data?.product ||
    data?.product ||
    null;

  const name = product?.name || product?.basic?.name || null;

  const price =
    product?.priceInfo?.currentPrice?.price ??
    product?.priceInfo?.currentPrice?.priceString?.replace?.("$","") ??
    product?.price?.currentPrice ??
    null;

  const numericPrice = price == null ? null : Number(price);

  const sizeQty =
    product?.selectedVariant?.quantity ??
    product?.productOptions?.selectedVariant?.quantity ??
    null;

  const sizeUnit =
    product?.selectedVariant?.unit ??
    product?.productOptions?.selectedVariant?.unit ??
    null;

  let qty = (typeof sizeQty === "number" ? sizeQty : null);
  let unit = (typeof sizeUnit === "string" ? sizeUnit.toLowerCase() : null);

  if (!qty || !unit) {
    const parsed = name ? parseUnitFromName(name) : null;
    qty = qty || parsed?.qty || null;
    unit = unit || parsed?.unit || null;
  }

  const unitPrice = (numericPrice && qty && unit)
    ? normalizeUnitPrice({ price: numericPrice, qty, unit })
    : null;

  let baseUnit = null;
  let pricePerBaseUnit = null;
  if (unitPrice != null && unit) {
    if (unit === "lb") {
      baseUnit = "oz";
      pricePerBaseUnit = unitPrice / 16;
    } else if (unit === "oz") {
      baseUnit = "oz";
      pricePerBaseUnit = unitPrice;
    } else if (unit === "ct") {
      baseUnit = "ct";
      pricePerBaseUnit = unitPrice;
    }
  }

  const result = {
    ok: true,
    store: "walmart",
    itemId,
    url,
    name,
    price: numericPrice,
    sizeValue: qty || null,
    sizeUnit: unit || null,
    unitPrice,
    unitPriceUnit: unit || null,
    baseUnit,
    pricePerBaseUnit,
    updatedAt: new Date().toISOString()
  };
  console.log("Walmart adapter output:", result);
  console.log("Walmart adapter EXIT: success");
  return result;
}
