const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache');

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

const cacheFile = (storeName) => {
  ensureDir(CACHE_DIR);
  return path.join(CACHE_DIR, `${storeName.toLowerCase()}-${todayStamp()}.json`);
};

const getStoreCache = (storeName) => readJson(cacheFile(storeName), {});

const setStoreCache = (storeName, cache) => writeJson(cacheFile(storeName), cache);

const getDailyCounter = (storeName) => {
  const cache = getStoreCache(storeName);
  return cache.__meta__?.requests || 0;
};

const incrementDailyCounter = (storeName) => {
  const cache = getStoreCache(storeName);
  cache.__meta__ = cache.__meta__ || {};
  cache.__meta__.requests = (cache.__meta__.requests || 0) + 1;
  setStoreCache(storeName, cache);
};

const getCachedProduct = (storeName, productKey) => {
  const cache = getStoreCache(storeName);
  return cache[productKey] || null;
};

const setCachedProduct = (storeName, productKey, data) => {
  const cache = getStoreCache(storeName);
  cache[productKey] = data;
  setStoreCache(storeName, cache);
};

module.exports = {
  todayStamp,
  getDailyCounter,
  incrementDailyCounter,
  getCachedProduct,
  setCachedProduct
};
