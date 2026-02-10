// Placeholder USDA FoodData Central client.
// NOTE: Do not call from UI yet. Wire this up once the grocery list flow is ready.

const USDA_API_BASE = 'https://api.nal.usda.gov/fdc/v1';

/**
 * Fetch foods from USDA FoodData Central.
 * @param {string} query - search term (e.g., "chicken breast")
 * @param {object} opts
 * @param {number} [opts.pageSize=10] - number of results to return
 * @param {string} [opts.apiKey] - override key; otherwise pulled from env/window
 */
export async function fetchUSDAFood(query, { pageSize = 10, apiKey } = {}) {
    const key =
        apiKey ||
        (typeof process !== 'undefined' && process.env && process.env.USDA_API_KEY) ||
        (typeof window !== 'undefined' && window.USDA_API_KEY);

    if (!key) {
        throw new Error('USDA API key is not set. Add USDA_API_KEY to your environment or window.USDA_API_KEY.');
    }

    const url = `${USDA_API_BASE}/foods/search?query=${encodeURIComponent(query)}&pageSize=${pageSize}&api_key=${encodeURIComponent(key)}`;
    const res = await fetch(url);

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`USDA request failed (${res.status}): ${body}`);
    }

    return res.json();
}

// Optional global attach for non-module consumers.
if (typeof window !== 'undefined') {
    window.fetchUSDAFood = fetchUSDAFood;
}

export default {
    fetchUSDAFood,
};
