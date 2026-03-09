const crypto = require('crypto');

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_REVISION = String(process.env.KLAVIYO_API_REVISION || '2024-06-15').trim();
const KLAVIYO_TIMEOUT_MS = Math.max(3000, Number(process.env.KLAVIYO_TIMEOUT_MS || 8000));

function getKlaviyoPrivateApiKey() {
  return String(
    process.env.KLAVIYO_PRIVATE_API_KEY
    || process.env.KLAVIYOPRIVATEAPIKEY
    || ''
  ).trim();
}

function isKlaviyoConfigured() {
  return Boolean(getKlaviyoPrivateApiKey());
}

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function normalizePhone(raw) {
  const src = String(raw || '').trim();
  if (!src) return '';
  const hasPlus = src.startsWith('+');
  const digits = src.replace(/[^\d]/g, '');
  if (digits.length < 10) return '';
  return hasPlus ? `+${digits}` : digits;
}

async function klaviyoRequest(path, { method = 'GET', body = null, timeoutMs = KLAVIYO_TIMEOUT_MS } = {}) {
  const apiKey = getKlaviyoPrivateApiKey();
  if (!apiKey) {
    const err = new Error('Klaviyo API key is not configured');
    err.code = 'KLAVIYO_NOT_CONFIGURED';
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || KLAVIYO_TIMEOUT_MS));
  try {
    const resp = await fetch(`${KLAVIYO_API_BASE}${path}`, {
      method: String(method || 'GET').toUpperCase(),
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_API_REVISION,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await resp.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!resp.ok) {
      const err = new Error(`Klaviyo API request failed (${resp.status})`);
      err.code = 'KLAVIYO_API_ERROR';
      err.status = resp.status;
      err.details = json || text || null;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function createOrUpdateKlaviyoProfile({
  email,
  phone,
  firstName = '',
  lastName = '',
  properties = {}
} = {}) {
  const safeEmail = normalizeEmail(email);
  const safePhone = normalizePhone(phone);
  if (!safeEmail && !safePhone) return null;
  const attrs = {};
  if (safeEmail) attrs.email = safeEmail;
  if (safePhone) attrs.phone_number = safePhone;
  if (firstName) attrs.first_name = String(firstName).trim().slice(0, 120);
  if (lastName) attrs.last_name = String(lastName).trim().slice(0, 120);
  const payload = {
    data: {
      type: 'profile',
      attributes: attrs
    }
  };
  if (properties && typeof properties === 'object' && !Array.isArray(properties) && Object.keys(properties).length) {
    payload.data.properties = properties;
  }
  return await klaviyoRequest('/profiles/', { method: 'POST', body: payload });
}

async function createKlaviyoEvent({
  eventName,
  email,
  phone,
  properties = {},
  value = null,
  time = null,
  uniqueId = null
} = {}) {
  const metricName = String(eventName || '').trim();
  const safeEmail = normalizeEmail(email);
  const safePhone = normalizePhone(phone);
  if (!metricName || (!safeEmail && !safePhone)) return null;
  const profileAttrs = {};
  if (safeEmail) profileAttrs.email = safeEmail;
  if (safePhone) profileAttrs.phone_number = safePhone;
  const attrs = {
    properties: properties && typeof properties === 'object' && !Array.isArray(properties) ? properties : {},
    metric: {
      data: {
        type: 'metric',
        attributes: {
          name: metricName
        }
      }
    },
    profile: {
      data: {
        type: 'profile',
        attributes: profileAttrs
      }
    },
    unique_id: String(uniqueId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`))
  };
  if (time) attrs.time = time;
  if (Number.isFinite(Number(value))) attrs.value = Number(value);
  const payload = {
    data: {
      type: 'event',
      attributes: attrs
    }
  };
  return await klaviyoRequest('/events/', { method: 'POST', body: payload });
}

module.exports = {
  KLAVIYO_API_REVISION,
  getKlaviyoPrivateApiKey,
  isKlaviyoConfigured,
  klaviyoRequest,
  createOrUpdateKlaviyoProfile,
  createKlaviyoEvent
};
