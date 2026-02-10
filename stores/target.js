const fs = require('fs');
const path = require('path');
const { httpRequest, buildCookieHeader } = require('../core/httpClient');
const { getSession, invalidateSession } = require('../core/sessionManager');
const { getCachedProduct, setCachedProduct, getDailyCounter, incrementDailyCounter, todayStamp } = require('../core/cache');
const { replaceSearchTermInUrl, replaceSearchTermInBody, findFirstProductLike } = require('../core/storeUtils');

const storeConfig = {
  name: 'Target',
  homepageUrl: 'https://www.target.com/',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  headers: {
    'accept-language': 'en-US,en;q=0.9',
    'upgrade-insecure-requests': '1'
  },
  maxPerDay: 30
};

const debugApiPath = (storeName) => {
  const dir = path.join(process.cwd(), 'data', 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${storeName.toLowerCase()}-api.txt`);
};

const buildRequest = (product, session, candidate) => {
  const url = replaceSearchTermInUrl(candidate.url, product);
  const body = replaceSearchTermInBody(candidate.postData, product);
  return {
    storeName: storeConfig.name,
    url,
    method: candidate.method || 'POST',
    headers: {
      'user-agent': session.userAgent,
      'accept-language': 'en-US,en;q=0.9',
      'cookie': buildCookieHeader(session.cookies),
      'accept': 'application/json',
      ...candidate.requestHeaders
    },
    body
  };
};

const parseResult = (product, payloadText) => {
  try {
    const payload = JSON.parse(payloadText);
    const match = findFirstProductLike(payload);
    if (!match) return null;
    return {
      store: storeConfig.name,
      product,
      price: Number(match.price) || null,
      unit: null,
      date: todayStamp(),
      source: 'api',
      url: match.url || null
    };
  } catch {
    return null;
  }
};

const getDailyPrices = async (productList) => {
  const results = [];
  let retried = false;

  for (const product of productList) {
    const key = product.toLowerCase();
    const cached = getCachedProduct(storeConfig.name, key);
    if (cached) {
      results.push(cached);
      continue;
    }

    if (getDailyCounter(storeConfig.name) >= storeConfig.maxPerDay) break;

    let session = await getSession(storeConfig);
    const candidate = session.bestCandidate;
    if (!candidate) {
      results.push({
        store: storeConfig.name,
        product,
        price: null,
        unit: null,
        date: todayStamp(),
        source: 'api'
      });
      continue;
    }

    let response = await httpRequest(buildRequest(product, session, candidate));

    if (response.status === 401 || response.status === 403) {
      if (retried) break;
      fs.writeFileSync(debugApiPath(storeConfig.name), response.text || '', 'utf8');
      invalidateSession(storeConfig.name);
      retried = true;
      session = await getSession(storeConfig);
      response = await httpRequest(buildRequest(product, session, candidate));
      if (response.status === 401 || response.status === 403) break;
    }

    incrementDailyCounter(storeConfig.name);
    if (response.status === 401 || response.status === 403) {
      fs.writeFileSync(debugApiPath(storeConfig.name), response.text || '', 'utf8');
    }
    const data = parseResult(product, response.text);
    const entry = data || {
      store: storeConfig.name,
      product,
      price: null,
      unit: null,
      date: todayStamp(),
      source: 'api'
    };

    setCachedProduct(storeConfig.name, key, entry);
    results.push(entry);
  }

  return results;
};

module.exports = { getDailyPrices };
