export function pickCheapest(pricesByStore) {
  // pricesByStore: [{store, price, pricePerBaseUnit, ...}]
  const byUnit = pricesByStore
    .filter(p => typeof p.pricePerBaseUnit === "number" && p.pricePerBaseUnit > 0)
    .sort((a, b) => a.pricePerBaseUnit - b.pricePerBaseUnit);
  if (byUnit.length > 0) return byUnit[0];

  const byPrice = pricesByStore
    .filter(p => typeof p.price === "number" && p.price > 0)
    .sort((a, b) => a.price - b.price);
  if (byPrice.length > 0) return byPrice[0];

  return null;
}
