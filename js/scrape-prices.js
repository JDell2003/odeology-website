const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const CONFIG_PATH = path.join(__dirname, 'scrape-config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const FOODS = CONFIG.foods;
const STORE_NAMES = CONFIG.stores.map((s) => s.name);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

const pickUserAgent = (index) => USER_AGENTS[index % USER_AGENTS.length];

const parsePrice = (text) => {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
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

const parseUnitPrice = (text) => {
  if (!text) return null;
  const cleaned = text.toLowerCase().replace(/,/g, '');
  const match = cleaned.match(/(\d+(\.\d+)?)\s*(\/|per)\s*([a-z]+|fl oz|oz|lb|g|kg|ct|count|each|ea)/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unitRaw = match[4];
  const unit = normalizeUnit(unitRaw);
  return Number.isFinite(value) ? { value, unit } : null;
};

const normalizeUnitPriceToBase = (unitPrice) => {
  if (!unitPrice) return null;
  const { value, unit } = unitPrice;
  if (!Number.isFinite(value) || !unit) return null;
  if (unit === 'oz') return { value, unit: 'oz' };
  if (unit === 'lb') return { value: value / 16, unit: 'oz' };
  if (unit === 'g') return { value: value / 28.3495, unit: 'oz' };
  if (unit === 'kg') return { value: value / 35.274, unit: 'oz' };
  if (unit === 'ct') return { value, unit: 'ct' };
  return null;
};

const pickBestItem = (items) => {
  const withUnit = items.filter((i) => i.unitPriceNormalized);
  if (withUnit.length) {
    return withUnit.reduce((best, cur) =>
      cur.unitPriceNormalized.value < best.unitPriceNormalized.value ? cur : best
    );
  }
  const withPrice = items.filter((i) => Number.isFinite(i.price));
  if (withPrice.length) {
    return withPrice.reduce((best, cur) => (cur.price < best.price ? cur : best));
  }
  return items[0] || null;
};
const todayStamp = () => new Date().toISOString().slice(0, 10);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const loadCache = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return {};
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const shouldSkip = (cache, foodKey, storeName) => {
  const entry = cache?.[foodKey]?.[storeName];
  return !!(entry && entry.name && entry.url);
};

const isBlockedHtml = (html) => {
  if (!html) return false;
  const text = html.toLowerCase();
  return text.includes('captcha') || text.includes('robot check') || text.includes('access denied') || text.includes('verify you are human');
};

const saveDebugArtifacts = async (page, storeName, foodKey) => {
  const dataDir = path.join(process.cwd(), 'data', 'debug');
  ensureDir(dataDir);
  const safeFood = foodKey.replace(/[^a-z0-9]+/gi, '-');
  const htmlPath = path.join(dataDir, `${storeName}-${safeFood}.html`);
  const shotPath = path.join(dataDir, `${storeName}-${safeFood}.png`);
  const html = await page.content();
  fs.writeFileSync(htmlPath, html, 'utf8');
  try {
    await page.screenshot({ path: shotPath, fullPage: true });
  } catch (err) {
    // ignore screenshot failure
  }
  return { htmlPath, shotPath };
};
const getStoreFilter = () => {
  const arg = process.argv.slice(2).find((a) => STORE_NAMES.map((n) => n.toLowerCase()).includes(a.toLowerCase()));
  if (!arg) return null;
  return STORE_NAMES.find((n) => n.toLowerCase() === arg.toLowerCase());
};

const getProxyList = () => {
  const raw = process.env.PROXY_LIST || '';
  if (raw) {
    return raw.split(',').map((p) => p.trim()).filter(Boolean);
  }
  const hosts = (process.env.PROXY_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);
  const user = process.env.PROXY_USER || '';
  const pass = process.env.PROXY_PASS || '';
  if (!hosts.length || !user || !pass) return [];
  return hosts.map((host) => `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}`);
};

const pickProxy = (proxies, index) => {
  if (!proxies.length) return null;
  return proxies[index % proxies.length];
};

const addSessionToProxy = (proxy, sessionParam, sessionId) => {
  if (!proxy || !sessionParam) return proxy;
  const joiner = proxy.includes('?') ? '&' : '?';
  return `${proxy}${joiner}${encodeURIComponent(sessionParam)}=${encodeURIComponent(sessionId)}`;
};

const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const humanDelay = async (minMs = 400, maxMs = 900) => {
  await sleep(randomBetween(minMs, maxMs));
};

const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
};

const launchBrowser = async (proxy) => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--lang=en-US,en',
    '--window-size=1280,800'
  ];
  if (proxy) args.push(`--proxy-server=${proxy}`);
  return puppeteer.launch({
    headless: 'new',
    args
  });
};

async function run() {
  const proxies = getProxyList();
  let proxyIndex = 0;
  let sharedBrowser = null;
  let sharedPage = null;
  if (!proxies.length) {
    sharedBrowser = await launchBrowser(null);
    sharedPage = await sharedBrowser.newPage();
    await sharedPage.setViewport({ width: 1280, height: 800 });
    await sharedPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
  }

  const results = {};
  const dataDir = path.join(process.cwd(), 'data');
  ensureDir(dataDir);
  const todayFile = path.join(dataDir, `${todayStamp()}-foods.json`);
  const latestFile = path.join(dataDir, 'latest.json');
  const cache = loadCache(todayFile);

  const storeFilter = getStoreFilter();
  const stores = CONFIG.stores.filter((s) => !storeFilter || s.name === storeFilter);
  console.log(`Stores: ${stores.map((s) => s.name).join(', ') || 'none'}`);
  const maxAttempts = Number(CONFIG.scrape?.maxAttempts || 3);
  const baseBackoffMs = Number(CONFIG.scrape?.baseBackoffMs || 1200);
  const sessionParam = CONFIG.scrape?.sessionParam || '';

  for (const food of FOODS) {
    const key = food.toLowerCase();
    results[key] = {};

    for (const store of stores) {
      const storeName = store.name;
      if (shouldSkip(cache, key, storeName)) {
        console.log(`[cache] ${food} @ ${storeName}`);
        results[key][storeName] = cache[key][storeName];
        continue;
      }

      console.log(`Searching ${storeName} for "${food}"...`);
      const attempts = proxies.length ? Math.min(maxAttempts, proxies.length) : 1;
      let success = false;
      let lastError = null;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const rawProxy = pickProxy(proxies, proxyIndex++);
        const sessionId = Math.floor(Math.random() * 1e9);
        const proxy = addSessionToProxy(rawProxy, sessionParam, sessionId);
        const browser = sharedBrowser || await launchBrowser(proxy);
        const page = sharedPage || await browser.newPage();
        const ua = pickUserAgent(proxyIndex);
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent(ua);
        await page.setExtraHTTPHeaders({
          'accept-language': 'en-US,en;q=0.9',
          'upgrade-insecure-requests': '1',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-user': '?1',
          'sec-fetch-dest': 'document'
        });
        try {
          await page.emulateTimezone('America/New_York');
        } catch (err) {
          // ignore timezone errors on some platforms
        }

        try {
          if (storeName === 'Walmart') {
            await sleep(2000 + randomBetween(0, 1500));
          }
          const url = store.searchUrl.replace('{query}', encodeURIComponent(food));
          await humanDelay(500, 900);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
          await page.waitForSelector('body', { timeout: 15000 });
          await humanDelay(600, 1200);
          await autoScroll(page);
          await humanDelay(600, 1200);

          const html = await page.content();
          if (isBlockedHtml(html)) {
            const debug = await saveDebugArtifacts(page, storeName, key);
            throw new Error(`Blocked or captcha detected. Saved ${debug.htmlPath}`);
          }

          await page.waitForSelector(store.selectors.card, { timeout: 15000 });
          const data = await page.evaluate((selectors) => {
            const pickText = (el, sel) => {
              if (!sel) return '';
              const target = el.querySelector(sel);
              return target ? target.textContent.trim() : '';
            };
            const cards = Array.from(document.querySelectorAll(selectors.card)).slice(0, 12);
            if (!cards.length) return null;
            return cards.map((card) => {
              const linkEl = card.querySelector(selectors.link);
              const name = pickText(card, selectors.name);
              const priceText = pickText(card, selectors.price);
              const unit = pickText(card, selectors.unit);
              const unitPriceText = pickText(card, selectors.unitPrice);
              const url = linkEl ? new URL(linkEl.getAttribute('href'), location.origin).href : '';
              return { name, priceText, unit, unitPriceText, url };
            });
          }, store.selectors);

          if (!data || !data.length) {
            const debug = await saveDebugArtifacts(page, storeName, key);
            throw new Error(`No result cards returned by selectors. Saved ${debug.htmlPath}`);
          }

          const parsed = data
            .filter((item) => item && item.name)
            .map((item) => {
              const unitPrice = parseUnitPrice(item.unitPriceText);
              const unitPriceNormalized = normalizeUnitPriceToBase(unitPrice);
              return {
                ...item,
                price: parsePrice(item.priceText),
                unitPrice,
                unitPriceNormalized
              };
            });

          const best = pickBestItem(parsed);
          if (!best) {
            throw new Error('No valid parsed items');
          }

          results[key][storeName] = {
            name: best.name,
            price: best.price,
            unit: best.unit || null,
            unitPrice: best.unitPrice ? best.unitPrice.value : null,
            unitType: best.unitPrice ? best.unitPrice.unit : null,
            url: best.url
          };
          if (best.unitPriceNormalized) {
            console.log(`Best ${storeName} match for ${food}: ${best.name} @ ${best.unitPriceNormalized.value.toFixed(2)}/${best.unitPriceNormalized.unit}`);
          } else {
            console.log(`Best ${storeName} match for ${food}: ${best.name} @ ${best.price} (Fallback using lowest total price)`);
          }
          success = true;
          break;
        } catch (err) {
          lastError = err;
          console.log(`Attempt ${attempt + 1}/${attempts} failed for ${storeName} ${food} (proxy: ${proxy || 'none'}): ${err.message}`);
          await sleep(baseBackoffMs * Math.pow(2, attempt));
        } finally {
          if (!sharedBrowser) await browser.close();
        }
      }

      if (!success && lastError) {
        console.log(`Failed ${storeName} for ${food}: ${lastError.message}`);
      }
      await sleep(5000);
    }

    if (Object.keys(results[key]).length === 0) {
      results[key] = null;
      console.log(`No stores returned results for ${food}`);
    }
  }

  writeJson(todayFile, results);
  writeJson(latestFile, results);
  console.log(`Saved: ${todayFile}`);
  console.log(`Updated: ${latestFile}`);
  if (sharedBrowser) await sharedBrowser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
