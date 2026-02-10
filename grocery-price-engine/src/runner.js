import cron from "node-cron";
import { runOnce } from "./index.js";
import { log } from "./lib/log.js";

// Runs every day at 7:00 AM local machine time
cron.schedule("0 7 * * *", async () => {
  log("Cron triggered: running daily price pull...");
  await runOnce();
});

log("Cron running. Next run at 7:00 AM daily.");