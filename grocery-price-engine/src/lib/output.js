import fs from "fs";

const DATA_DIR = new URL("../../data/", import.meta.url);

export function writeLatestJson(payload) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(new URL("latest.json", DATA_DIR), JSON.stringify(payload, null, 2), "utf8");
}

export function writeLatestCsv(rows) {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const header = [
    "group","groupName","sku","name","qty","unit","chosen_store","price","baseUnit","pricePerBaseUnit","subtotal"
  ].join(",");

  const lines = rows.map(r =>
    [
      r.group ?? "", csv(r.groupName), r.sku, csv(r.name), r.qty, r.unit, r.chosenStore,
      r.price ?? "", r.baseUnit ?? "", r.pricePerBaseUnit ?? "",
      r.subtotal ?? ""
    ].join(",")
  );

  fs.writeFileSync(new URL("latest.csv", DATA_DIR), [header, ...lines].join("\n"), "utf8");
}

function csv(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
