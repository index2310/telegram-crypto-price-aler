import { cfg } from "../lib/config.js";
import { logInfo, logWarn, logError, safeErr } from "../lib/log.js";
import { fetchLatestPairs } from "../services/raydiumService.js";
import {
  getRaydiumState,
  updateRaydiumStateLastSeen,
  insertRaydiumPairs,
  getUsersWithNewPairsEnabled,
} from "../services/stateStore.js";
import { shortMint } from "../lib/format.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startRaydiumScanner(bot) {
  let running = true;
  let backoffMs = 0;

  const intervalMs = Math.max(10, Number(cfg.RAYDIUM_SCAN_INTERVAL_SECONDS || 120)) * 1000;
  logInfo("raydiumScanner start", { intervalMs });

  (async () => {
    while (running) {
      const cycleStarted = Date.now();

      try {
        logInfo("raydiumScanner cycle", {});

        const st = await getRaydiumState();
        const seen = new Set(Array.isArray(st.lastSeenPairIds) ? st.lastSeenPairIds : []);

        const latest = await fetchLatestPairs({ bypassCache: false });
        if (!latest.ok) {
          logWarn("raydiumScanner fetch failed", { error: latest.error });
          throw new Error(latest.error || "RAYDIUM_API_DOWN");
        }

        const pairs = latest.pairs || [];
        const newOnes = [];
        for (const p of pairs) {
          if (!p.pairId) continue;
          if (!seen.has(p.pairId)) newOnes.push(p);
        }

        // Sync strategy: on first boot, don't spam backlog.
        if (!Array.isArray(st.lastSeenPairIds) || st.lastSeenPairIds.length === 0) {
          const ids = pairs.slice(0, 200).map((p) => p.pairId);
          await updateRaydiumStateLastSeen(ids);
          logInfo("raydiumScanner synced to now", { count: ids.length });
          backoffMs = 0;
        } else {
          const ids = pairs.slice(0, 200).map((p) => p.pairId);
          await updateRaydiumStateLastSeen(ids);

          if (newOnes.length) {
            await insertRaydiumPairs(newOnes);
          }

          const users = await getUsersWithNewPairsEnabled();
          let sent = 0;

          for (const p of newOnes.slice(0, 25)) {
            const msg = [
              "New Raydium pair discovered:",
              "Pair: " + shortMint(p.pairId),
              "Base: " + shortMint(p.baseMint),
              "Quote: " + shortMint(p.quoteMint),
            ].join("\n");

            const kb = {
              inline_keyboard: [
                [{ text: "Price", callback_data: "refresh_price:" + p.baseMint }],
                [{ text: "Add to Watchlist", callback_data: "add_watchlist:" + p.baseMint }],
              ],
            };

            for (const u of users) {
              const chatId = u.chatId || u.telegramUserId;
              try {
                await bot.api.sendMessage(chatId, msg, { reply_markup: kb });
                sent++;
              } catch (e) {
                logWarn("raydiumScanner send failed", { err: safeErr(e) });
              }
            }
          }

          logInfo("raydiumScanner cycle done", { newPairs: newOnes.length, notified: sent, ms: Date.now() - cycleStarted });
          backoffMs = 0;
        }
      } catch (e) {
        logError("raydiumScanner cycle failed", { err: safeErr(e) });
        backoffMs = Math.min(60_000, Math.max(3000, backoffMs ? backoffMs * 2 : 3000));
      }

      const waitMs = Math.max(500, intervalMs + backoffMs - (Date.now() - cycleStarted));
      await sleep(waitMs);
    }
  })();

  return () => {
    running = false;
  };
}
