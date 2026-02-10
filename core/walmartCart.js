const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const CART_PROFILE_DIR = path.join(process.cwd(), 'sessions', 'profiles', 'walmart-cart');
const tempProfileDir = () =>
  path.join(process.cwd(), 'sessions', 'profiles', `walmart-cart-temp-${Date.now()}`);
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const normalizeQuantity = (qty) => {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(Math.max(Math.round(n), 1), 10);
};

const extractItemIdFromSku = (sku) => {
  if (!sku) return null;
  const raw = String(sku).trim();
  if (raw.includes(':')) {
    const [, id] = raw.split(':');
    return id ? id.replace(/\D/g, '') : null;
  }
  return raw.replace(/\D/g, '') || null;
};

const extractItemIdFromUrl = (url) => {
  if (!url) return null;
  const match = String(url).match(/\/ip\/[^/]*\/(\d+)/i) || String(url).match(/\/ip\/(\d+)/i);
  return match ? match[1] : null;
};

const buildProductUrl = ({ url, itemId, sku }) => {
  const id = itemId || extractItemIdFromSku(sku) || extractItemIdFromUrl(url);
  if (url) return url;
  if (id) return `https://www.walmart.com/ip/${id}`;
  return null;
};

const clickAddToCart = async (page) => {
  const selectors = [
    'button[data-automation-id="add-to-cart"]',
    'button[data-automation-id="add-to-cart-button"]',
    'button[aria-label*="Add to cart"]',
    'button[aria-label*="Add to Cart"]',
    'button[data-testid*="add-to-cart"]',
    'button[id*="add-to-cart"]',
    'button[class*="add-to-cart"]'
  ];

  for (const selector of selectors) {
    const btn = await page.$(selector);
    if (btn) {
      await btn.click({ delay: 40 });
      return true;
    }
  }

  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((btn) => /add to cart/i.test(btn.textContent || ''));
    if (!target) return false;
    target.click();
    return true;
  });
};

const addViaProductPage = async (page, baseUrl, quantity) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const clicked = await clickAddToCart(page);
  if (!clicked) return false;
  if (quantity > 1) {
    for (let i = 1; i < quantity; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      await clickAddToCart(page);
    }
  }
  return true;
};

const addViaAddToCartParam = async (page, baseUrl, quantity) => {
  const sep = baseUrl.includes('?') ? '&' : '?';
  const addUrl = `${baseUrl}${sep}add_to_cart=1&quantity=${quantity}`;
  await page.goto(addUrl, { waitUntil: 'networkidle2' });
  return true;
};

const addWalmartItemsToCart = async ({
  items,
  headless = false,
  slowMo = 0,
  timeoutMs = 45000
} = {}) => {
  let browser = null;
  const launchWithProfile = async (userDataDir) =>
    puppeteer.launch({
      headless: headless ? 'new' : false,
      userDataDir,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      slowMo
    });

  try {
    browser = await launchWithProfile(CART_PROFILE_DIR);
  } catch (err) {
    const msg = err?.message || 'Failed to launch Puppeteer';
    if (msg.toLowerCase().includes('already running')) {
      browser = await launchWithProfile(tempProfileDir());
    } else {
      throw new Error(`Puppeteer launch failed: ${msg}`);
    }
  }

  let results = [];
  try {
    for (const entry of items) {
      const quantity = normalizeQuantity(entry?.quantity);
      const baseUrl = buildProductUrl(entry || {});
      if (!baseUrl) {
        results.push({
          ok: false,
          name: entry?.name || entry?.sku || 'Unknown item',
          quantity,
          reason: 'Missing Walmart URL or item id'
        });
        continue;
      }

      const page = await browser.newPage();
      page.setDefaultTimeout(timeoutMs);
      await page.setUserAgent(DEFAULT_USER_AGENT);
      await page.setViewport({ width: 1280, height: 800 });

      let ok = false;
      let reason = null;
      try {
        await addViaAddToCartParam(page, baseUrl, quantity);
        ok = true;
      } catch (err) {
        reason = err?.message || 'add_to_cart failed';
      }

      if (!ok) {
        try {
          ok = await addViaProductPage(page, baseUrl, quantity);
        } catch (err) {
          reason = err?.message || reason || 'product page add failed';
        }
      }

      results.push({
        ok,
        name: entry?.name || entry?.sku || baseUrl,
        quantity,
        url: baseUrl,
        reason: ok ? null : reason
      });

      await new Promise((resolve) => setTimeout(resolve, 800));
      await page.close().catch(() => {});
    }

    const cartUrl = 'https://www.walmart.com/cart';
    const cartPage = await browser.newPage();
    await cartPage.goto(cartUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await cartPage.close().catch(() => {});

    return {
      ok: results.every((r) => r.ok),
      results,
      cartUrl
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

module.exports = { addWalmartItemsToCart };
