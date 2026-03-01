import { InlineKeyboard } from "grammy";
import { setNewPairsNotifications, getLatestRaydiumPairs } from "../services/stateStore.js";
import { shortMint } from "../lib/format.js";
import { cfg } from "../lib/config.js";

export function registerMenus(bot) {
  bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
    const which = String(ctx.match?.[1] || "");
    await ctx.answerCallbackQuery();

    if (which === "help") {
      await ctx.reply("Type /help to see commands and examples.");
      return;
    }

    if (which === "price") {
      await ctx.reply("Use /price <symbol|mint>. Example: /price SOL");
      return;
    }

    if (which === "watchlist") {
      await ctx.reply("Opening watchlist…\nUse /watchlist to manage it.");
      return;
    }

    if (which === "alerts") {
      await ctx.reply("Opening alerts…\nUse /alerts to manage alerts.");
      return;
    }

    if (which === "settings") {
      await ctx.reply("Settings are minimal right now. New pairs notifications are configured in the New Pairs menu.");
      return;
    }

    if (which === "newpairs") {
      const kb = new InlineKeyboard()
        .text("Show Latest", "newpairs:latest")
        .row()
        .text("Enable Notifications", "newpairs_enable")
        .text("Disable Notifications", "newpairs_disable");

      await ctx.reply("New Pairs menu:", { reply_markup: kb });
      return;
    }

    await ctx.reply("Menu not available.");
  });

  bot.callbackQuery("newpairs_enable", async (ctx) => {
    await ctx.answerCallbackQuery();
    await setNewPairsNotifications(ctx.from?.id, true);
    await ctx.reply("New pair notifications enabled.");
  });

  bot.callbackQuery("newpairs_disable", async (ctx) => {
    await ctx.answerCallbackQuery();
    await setNewPairsNotifications(ctx.from?.id, false);
    await ctx.reply("New pair notifications disabled.");
  });

  bot.callbackQuery("newpairs:latest", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Loading…" });
    const limit = Number(cfg.NEW_PAIRS_LATEST_LIMIT || 15);
    const pairs = await getLatestRaydiumPairs(limit);
    if (!pairs.length) {
      await ctx.reply("No new pairs discovered yet. Check back soon.");
      return;
    }

    let msg = "Latest discovered pairs:\n";
    for (const p of pairs.slice(0, 20)) {
      msg += "\nPair: " + shortMint(p.pairId) + "\nBase: " + shortMint(p.baseMint) + "\nQuote: " + shortMint(p.quoteMint);
      msg += "\nTime: " + (p.discoveredAt ? new Date(p.discoveredAt).toISOString() : "N/A") + "\n";
    }

    await ctx.reply(msg);
  });
}
