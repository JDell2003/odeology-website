import fs from "fs";

const STATE_PATH = new URL("../../data/state.json", import.meta.url);

export function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeState(obj) {
  fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(obj, null, 2), "utf8");
}

export function getStoreState(state, sku, store) {
  if (!state[sku]) state[sku] = {};
  if (!state[sku][store]) {
    state[sku][store] = {
      failCount: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      lastSuccessAt: null,
      lastError: null
    };
  }
  return state[sku][store];
}

export function nextBackoffMs(failCount) {
  const schedule = [
    30 * 60 * 1000, // 30m
    60 * 60 * 1000, // 1h
    4 * 60 * 60 * 1000, // 4h
    24 * 60 * 60 * 1000 // 24h
  ];
  if (failCount <= 0) return 0;
  const idx = Math.min(failCount - 1, schedule.length - 1);
  return schedule[idx];
}

