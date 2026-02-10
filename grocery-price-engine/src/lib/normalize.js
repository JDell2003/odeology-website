export function normalizeUnitPrice({ price, qty, unit }) {
  // qty = numeric size, unit = 'oz' | 'lb' | 'ct'
  // returns $ per unit
  if (!price || !qty || qty <= 0) return null;
  return Number((price / qty).toFixed(4));
}

export function parseUnitFromName(name) {
  // VERY light helper. Prefer explicit data from API when available.
  // Example: "5 lb" or "12 ct"
  const s = name.toLowerCase();
  const m = s.match(/(\d+(\.\d+)?)\s*(lb|oz|ct)\b/);
  if (!m) return null;
  return { qty: Number(m[1]), unit: m[3] };
}