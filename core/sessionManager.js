const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const SESSIONS_DIR = path.join(process.cwd(), 'sessions');

const todayStamp = () => new Date().toISOString().slice(0, 10);

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const readJson = (filePath, fallback = null) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const sessionPath = (storeName) => path.join(SESSIONS_DIR, `${storeName.toLowerCase()}.json`);
const profilePath = (storeName) => path.join(SESSIONS_DIR, 'profiles', storeName.toLowerCase());

const isSessionFresh = (session) => session && session.date === todayStamp();

const bootstrapSession = async (storeConfig) => {
  ensureDir(SESSIONS_DIR);
  ensureDir(profilePath(storeConfig.name));
  const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  if (storeConfig.proxy) {
    const proxyUrl = new URL(storeConfig.proxy);
    args.push(`--proxy-server=${proxyUrl.host}`);
  }
  const browser = await puppeteer.launch({
    headless: storeConfig.headless ?? 'new',
    userDataDir: profilePath(storeConfig.name),
    args
  });
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(storeConfig.userAgent);
  await page.setExtraHTTPHeaders(storeConfig.headers || {});

  if (storeConfig.proxy) {
    const proxyUrl = new URL(storeConfig.proxy);
    if (proxyUrl.username || proxyUrl.password) {
      await page.authenticate({
        username: decodeURIComponent(proxyUrl.username),
        password: decodeURIComponent(proxyUrl.password)
      });
    }
  }

  const capturedRequests = [];
  let bestCandidate = null;

  const denylist = [
    'px-cloud.net',
    'perimeterx',
    'akamai',
    'datadome',
    'cloudflare',
    '/api/v2/collector',
    'collector',
    'botd',
    'fingerprint',
    'telemetry'
  ];

  const denyContentTypes = [
    'text/javascript',
    'application/javascript',
    'text/html',
    'text/css',
    'image/',
    'font/',
    'audio/',
    'video/'
  ];

  const allowContentTypes = [
    'application/json',
    'application/graphql+json',
    'application/x-graphql'
  ];

  const searchKeywords = [
    'search',
    'browse',
    'gql',
    'graphql',
    'product',
    'items',
    'plp',
    'redsky',
    'catalog'
  ];

  const postDataKeys = ['q', 'query', 'keyword', 'searchterm', 'term', 'text'];

  const hasSearchIntent = (urlLower, postData) => {
    if (searchKeywords.some((k) => urlLower.includes(k))) return true;
    if (postData) {
      const lowered = postData.toLowerCase();
      if (postDataKeys.some((k) => lowered.includes(`\"${k}\"`) || lowered.includes(`${k}=`))) return true;
    }
    return false;
  };

  const scoreCandidate = ({ urlLower, method, status, contentType, postData }) => {
    let score = 0;
    if (status === 200) score += 8;
    const isJson = allowContentTypes.some((t) => contentType.includes(t));
    if (isJson) score += 6;
    if (method === 'POST') score += 4;
    if (urlLower.includes('graphql') || urlLower.includes('gql')) score += 4;
    if (urlLower.includes('search') || urlLower.includes('browse')) score += 3;
    if (urlLower.includes('redsky') || urlLower.includes('orchestra')) score += 3;
    if (postData && postData.length > 0) score += 2;
    if (urlLower.endsWith('.js') || urlLower.endsWith('.css') || urlLower.endsWith('.png') || urlLower.endsWith('.jpg') || urlLower.endsWith('.svg')) score -= 10;
    if (urlLower.includes('analytics') || urlLower.includes('metrics') || urlLower.includes('beacon') || urlLower.includes('ads') || urlLower.includes('doubleclick')) score -= 10;
    return score;
  };

  page.on('response', async (response) => {
    try {
      const req = response.request();
      const url = req.url();
      const urlLower = url.toLowerCase();
      const method = req.method();
      const status = response.status();
      const resHeaders = response.headers();
      const contentType = (resHeaders['content-type'] || '').toLowerCase();
      const postData = req.postData() || null;

      const isDeniedDomain = denylist.some((term) => urlLower.includes(term));
      const isOptions = method === 'OPTIONS';
      const isDeniedStatus = [204, 301, 302, 304].includes(status);
      const isDeniedContentType = denyContentTypes.some((t) => contentType.includes(t));
      const hasAllowedContentType = allowContentTypes.some((t) => contentType.includes(t));
      const intent = hasSearchIntent(urlLower, postData);

      const isDenied =
        isDeniedDomain ||
        isOptions ||
        isDeniedStatus ||
        isDeniedContentType ||
        (!hasAllowedContentType && !intent);

      let score = scoreCandidate({ urlLower, method, status, contentType, postData });
      if (isDenied) score -= 50;

      const entry = {
        url,
        method,
        requestHeaders: req.headers(),
        postData,
        status,
        responseContentType: contentType,
        score,
        isDenied
      };

      capturedRequests.push(entry);

      if (!entry.isDenied) {
        if (!bestCandidate || entry.score > bestCandidate.score) {
          bestCandidate = entry;
        }
      }
    } catch {
      // ignore response parsing errors
    }
  });

  await page.goto(storeConfig.homepageUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  const term = storeConfig.bootstrapSearchTerm || 'chicken';
  const template =
    storeConfig.searchUrlTemplate ||
    (storeConfig.name === 'Walmart' ? 'https://www.walmart.com/search?q={{TERM}}' : null) ||
    (storeConfig.name === 'Target' ? 'https://www.target.com/s?searchTerm={{TERM}}' : null) ||
    (storeConfig.name === 'Sams' ? 'https://www.samsclub.com/s/{{TERM}}' : null);

  if (template) {
    const searchUrl = template.replace('{{TERM}}', encodeURIComponent(term));
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  } else if (storeConfig.searchSelector) {
    await page.waitForSelector(storeConfig.searchSelector, { timeout: 15000 });
    await page.click(storeConfig.searchSelector, { clickCount: 3 });
    await page.type(storeConfig.searchSelector, term, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
  }

  // Force client-side execution to trigger product/search APIs
  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight);
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.scrollBy(0, window.innerHeight);
  });

  await page.waitForResponse(
    (res) => {
      const url = res.url().toLowerCase();
      return (
        url.includes('search') ||
        url.includes('browse') ||
        url.includes('graphql') ||
        url.includes('gql') ||
        url.includes('redsky') ||
        url.includes('catalog')
      );
    },
    { timeout: 15000 }
  ).catch(() => {});
  const cookies = await page.cookies();
  const localStorageData = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      out[key] = localStorage.getItem(key);
    }
    return out;
  });

  await browser.close();

  if (bestCandidate && bestCandidate.isDenied) {
    bestCandidate = null;
  }

  const session = {
    date: todayStamp(),
    userAgent: storeConfig.userAgent,
    headers: storeConfig.headers || {},
    cookies,
    localStorage: localStorageData,
    capturedRequests,
    bestCandidate
  };

  writeJson(sessionPath(storeConfig.name), session);
  if (storeConfig.logSummary) {
    const deniedCount = capturedRequests.filter((r) => r.isDenied).length;
    const eligible = capturedRequests.filter((r) => !r.isDenied);
    const top3 = [...eligible]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((r) => ({
        score: r.score,
        method: r.method,
        url: r.url,
        responseContentType: r.responseContentType
      }));
    const best = bestCandidate
      ? {
          score: bestCandidate.score,
          method: bestCandidate.method,
          url: bestCandidate.url,
          responseContentType: bestCandidate.responseContentType
        }
      : null;
    console.log(`${storeConfig.name} bootstrap summary:`);
    console.log(`Captured: ${capturedRequests.length} | Denied: ${deniedCount} | Eligible: ${eligible.length}`);
    console.log('Top 3 eligible candidates:', top3);
    if (!bestCandidate && eligible.length === 0) {
      console.log('No eligible candidates found (search APIs did not fire)');
    }
    console.log('bestCandidate:', best);
  }
  return session;
};

const getSession = async (storeConfig) => {
  const existing = readJson(sessionPath(storeConfig.name), null);
  if (isSessionFresh(existing)) return existing;
  return bootstrapSession(storeConfig);
};

const invalidateSession = (storeName) => {
  const file = sessionPath(storeName);
  if (fs.existsSync(file)) fs.unlinkSync(file);
};

module.exports = {
  getSession,
  invalidateSession
};
