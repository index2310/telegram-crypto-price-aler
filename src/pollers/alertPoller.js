import { cfg } from "../lib/config.js";
import { logInfo, logWarn, logError, safeErr } from "../lib/log.js";
import { fetchActiveAlertsAll, markAlertTriggered } from "../services/stateStore.js";
import { getTokenPriceUsd } from "../services/priceService.js";
import { fmtUsd, shortMint } from "../lib/format.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startAlertPoller(bot) {
  let running = true;
  let backoffMs = 0;

  const intervalMs = Math.max(5, Number(cfg.ALERT_POLL_INTERVAL_SECONDS || 30)) * 1000;

  logInfo("alertPoller start", { intervalMs });

  (async () => {
    while (running) {
      const cycleStarted = Date.now();

      try {
        logInfo("alertPoller cycle", {});

        const alerts = await fetchActiveAlertsAll();
        logInfo("alertPoller fetched alerts", { active: alerts.length });

        const byMint = new Map();
        for (const a of alerts) {
          const mint = String(a.mint || "");
          if (!mint) continue;
          const arr = byMint.get(mint) || [];
          arr.push(a);
          byMint.set(mint, arr);
        }

        let triggered = 0;
        for (const [mint, arr] of byMint) {
          const pr = await getTokenPriceUsd(mint, { bypassCache: false });
          if (!pr.ok) {
            logWarn("alertPoller price unavailable", { mint: shortMint(mint) });
            continue;
          }
          const price = pr.priceUsd;

          for (const a of arr) {
            const dir = String(a.direction || "");
            const target = Number(a.targetPriceUsd);
            if (!Number.isFinite(target)) continue;

            const hit = (dir === "above") ? (price >= target) : (price <= target);
            if (!hit) continue;

            triggered++;

            const chatId = a.chatId || a.telegramUserId;
            const tokenLabel = (a.symbol || a.name || shortMint(mint));

            try {
              await bot.api.sendMessage(
                chatId,
                [
                  "Alert triggered:",
                  tokenLabel + " (" + shortMint(mint) + ")",
                  "Direction: " + dir.toUpperCase(),
                  "Target: " + fmtUsd(target),
                  "Current: " + fmtUsd(price),
                ].join("\n"),
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "Remove Alert", callback_data: "remove_alert:" + String(a._id) }],
                      [{ text: "Add Another Alert", callback_data: "alerts:add" }],
                      [{ text: "View Price", callback_data: "refresh_price:" + mint }],
                    ],
                  },
                }
              );
            } catch (e) {
              logWarn("alertPoller sendMessage failed", { err: safeErr(e) });
            }

            try {
              await markAlertTriggered(String(a._id));
            } catch (e) {
              logError("alertPoller mark triggered failed", { err: safeErr(e) });
            }
          }
        }

        logInfo("alertPoller cycle done", { triggered, ms: Date.now() - cycleStarted });
        backoffMs = 0;
      } catch (e) {
        logError("alertPoller cycle failed", { err: safeErr(e) });
        backoffMs = Math.min(20_000, Math.max(2000, backoffMs ? backoffMs * 2 : 2000));
      }

      const waitMs = Math.max(500, intervalMs + backoffMs - (Date.now() - cycleStarted));
      await sleep(waitMs);
    }
  })();

  return () => {
    running = false;
  };
}
