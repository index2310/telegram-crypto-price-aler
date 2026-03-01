import "dotenv/config";

import { run } from "@grammyjs/runner";
import { cfg } from "./lib/config.js";
import { logInfo, logWarn, logError, safeErr } from "./lib/log.js";
import { createBot } from "./bot.js";
import { registerCommands } from "./commands/loader.js";
import { getDb, ensureIndexes } from "./lib/db.js";
import { buildBotProfile } from "./lib/botProfile.js";
import { startAlertPoller } from "./pollers/alertPoller.js";
import { startRaydiumScanner } from "./pollers/raydiumScanner.js";

process.on("unhandledRejection", (r) => {
  console.error("UnhandledRejection:", r);
  process.exit(1);
});
process.on("uncaughtException", (e) => {
  console.error("UncaughtException:", e);
  process.exit(1);
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function boot() {
  logInfo("boot start", {
    nodeEnv: process.env.NODE_ENV || "",
    TELEGRAM_BOT_TOKEN_set: !!cfg.TELEGRAM_BOT_TOKEN,
    MONGODB_URI_set: !!cfg.MONGODB_URI,
    PRICE_API_BASE_URL_set: !!cfg.PRICE_API_BASE_URL,
    RAYDIUM_API_BASE_URL_set: !!cfg.RAYDIUM_API_BASE_URL,
  });

  if (!cfg.TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is required. Add it to your env and redeploy.");
    process.exit(1);
  }

  const profile = buildBotProfile();
  logInfo("bot profile", { profile });

  if (cfg.MONGODB_URI) {
    try {
      const db = await getDb(cfg.MONGODB_URI);
      await ensureIndexes(db);
    } catch (e) {
      logWarn("mongo unavailable, continuing without persistence", { err: safeErr(e) });
    }
  } else {
    logWarn("MONGODB_URI missing, running with in-memory state", {});
  }

  const bot = createBot(cfg.TELEGRAM_BOT_TOKEN);

  await registerCommands(bot);

  try {
    await bot.api.setMyCommands([
      { command: "start", description: "Welcome & main menu" },
      { command: "help", description: "How to use the bot" },
      { command: "price", description: "Price lookup" },
      { command: "watchlist", description: "Manage watchlist" },
      { command: "alerts", description: "Manage alerts" },
      { command: "alert", description: "Create an alert" },
      { command: "reset", description: "Clear your watchlist and alerts" },
    ]);
  } catch (e) {
    logWarn("setMyCommands failed", { err: safeErr(e) });
  }

  bot.catch((err) => {
    logError("bot error", { err: safeErr(err?.error || err) });
  });

  let stopAlert = null;
  let stopRaydium = null;

  try {
    stopAlert = startAlertPoller(bot);
    stopRaydium = startRaydiumScanner(bot);
  } catch (e) {
    logWarn("pollers failed to start", { err: safeErr(e) });
  }

  // Memory log (once per minute)
  setInterval(() => {
    const m = process.memoryUsage();
    console.log("[mem]", {
      rssMB: Math.round(m.rss / 1e6),
      heapUsedMB: Math.round(m.heapUsed / 1e6),
    });
  }, 60_000).unref();

  // Polling reliability: delete webhook and retry on 409.
  let backoff = 2000;
  const maxBackoff = 20_000;

  while (true) {
    try {
      logInfo("polling start", { concurrency: 1 });
      await bot.api.deleteWebhook({ drop_pending_updates: true });

      const runner = run(bot, { concurrency: 1 });
      await runner.task();

      // If runner.task resolves, treat it as unexpected stop.
      logWarn("polling stopped unexpectedly", {});
      backoff = Math.min(maxBackoff, backoff * 2);
      await sleep(backoff);
      continue;
    } catch (e) {
      const msg = safeErr(e);
      if (String(msg).includes("409") || String(msg).toLowerCase().includes("conflict")) {
        logWarn("polling conflict (409), retrying", { backoffMs: backoff, err: msg });
        await sleep(backoff);
        backoff = Math.min(maxBackoff, backoff * 2);
        continue;
      }

      logError("polling fatal error", { err: msg });
      if (typeof stopAlert === "function") stopAlert();
      if (typeof stopRaydium === "function") stopRaydium();
      process.exit(1);
    }
  }
}

boot().catch((e) => {
  console.error("Boot error:", safeErr(e));
  process.exit(1);
});
