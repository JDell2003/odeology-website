const { request } = require('undici');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rateLimiter = {};

const enforceRate = async (storeName, minIntervalMs) => {
  const now = Date.now();
  const last = rateLimiter[storeName] || 0;
  const wait = Math.max(0, minIntervalMs - (now - last));
  if (wait) await sleep(wait);
  rateLimiter[storeName] = Date.now();
};

const buildCookieHeader = (cookies) =>
  (cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');

const httpRequest = async ({ storeName, url, method = 'GET', headers = {}, body, minIntervalMs = 1000 }) => {
  await enforceRate(storeName, minIntervalMs);

  const res = await request(url, {
    method,
    headers,
    body
  });

  const text = await res.body.text();
  return {
    status: res.statusCode,
    headers: res.headers,
    text
  };
};

module.exports = {
  httpRequest,
  buildCookieHeader
};
