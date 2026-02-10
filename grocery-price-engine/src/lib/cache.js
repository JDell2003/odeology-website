import fs from "fs";

const CACHE_PATH = new URL("../../data/cache.json", import.meta.url);

export function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return {};
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeCache(obj) {
  fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(obj, null, 2), "utf8");
}