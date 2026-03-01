import { InlineKeyboard } from "grammy";
import { upsertUser } from "../services/stateStore.js";

export default function register(bot) {
  bot.command("start", async (ctx) => {
    const telegramUserId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    await upsertUser({ telegramUserId, chatId, settings: {} });

    const kb = new InlineKeyboard()
      .text("Price", "menu:price")
      .text("Watchlist", "menu:watchlist")
      .row()
      .text("Alerts", "menu:alerts")
      .text("New Pairs", "menu:newpairs")
      .row()
      .text("Settings", "menu:settings")
      .text("Help", "menu:help");

    await ctx.reply(
      "Welcome to Solana Alert Watcher.\n\nYou can look up prices by token symbol or mint address.\nIf a symbol matches multiple tokens, you may need to use the mint.",
      { reply_markup: kb }
    );
  });
}
