import { InlineKeyboard } from "grammy";
import { resolveToken, getTokenPriceUsd } from "../services/priceService.js";
import { getWatchlist, addToWatchlist, removeFromWatchlist } from "../services/stateStore.js";
import { shortMint, fmtUsd } from "../lib/format.js";
import { setConvoState, getConvoState, clearConvoState } from "../lib/convoState.js";

async function showWatchlist(ctx) {
  const wl = await getWatchlist(ctx.from?.id);
  const items = Array.isArray(wl.items) ? wl.items : [];

  if (items.length === 0) {
    const kb = new InlineKeyboard().text("Add Token", "watchlist:add");
    await ctx.reply("Your watchlist is empty.", { reply_markup: kb });
    return;
  }

  const kb = new InlineKeyboard()
    .text("Add Token", "watchlist:add")
    .text("Remove Token", "watchlist:remove")
    .row();

  let msg = "Your watchlist:\n";
  for (const it of items.slice(0, 30)) {
    const pr = await getTokenPriceUsd(it.mint, { bypassCache: false });
    const line = (it.symbol || it.name || shortMint(it.mint)) + ": " + (pr.ok ? fmtUsd(pr.priceUsd) : "N/A");
    msg += "\n" + line + " (" + shortMint(it.mint) + ")";

    kb
      .text("Price", "refresh_price:" + it.mint)
      .text("Remove", "remove_watchlist:" + it.mint)
      .row()
      .text("Set Alert", "set_alert_above:" + it.mint)
      .row();
  }

  await ctx.reply(msg, { reply_markup: kb });
}

export default function register(bot) {
  bot.command("watchlist", async (ctx) => {
    const text = String(ctx.message?.text || "");
    const parts = text.split(/\s+/).slice(1);
    const sub = String(parts[0] || "").toLowerCase();
    const arg = parts.slice(1).join(" ").trim();

    if (!sub) {
      await showWatchlist(ctx);
      return;
    }

    if (sub === "list") {
      await showWatchlist(ctx);
      return;
    }

    if (sub === "add") {
      if (!arg) {
        await ctx.reply("Usage: /watchlist add <symbol|mint>");
        return;
      }
      const r = await resolveToken(arg);
      if (!r.ok) {
        await ctx.reply("Could not resolve token. Try a mint address.");
        return;
      }
      const res = await addToWatchlist(ctx.from?.id, r.token);
      await ctx.reply(res.already ? "Already in your watchlist." : "Added to your watchlist.");
      return;
    }

    if (sub === "remove") {
      if (!arg) {
        await ctx.reply("Usage: /watchlist remove <symbol|mint>");
        return;
      }
      const r = await resolveToken(arg);
      if (!r.ok) {
        await ctx.reply("Could not resolve token. Try a mint address.");
        return;
      }
      await removeFromWatchlist(ctx.from?.id, r.token.mint);
      await ctx.reply("Removed from your watchlist (if it was present).");
      return;
    }

    await ctx.reply("Usage: /watchlist [list|add|remove]");
  });

  bot.callbackQuery("watchlist:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    setConvoState(ctx.from?.id, { mode: "watchlist_add" });
    await ctx.reply("Send the token symbol or mint to add to your watchlist.");
  });

  bot.callbackQuery("watchlist:remove", async (ctx) => {
    await ctx.answerCallbackQuery();
    setConvoState(ctx.from?.id, { mode: "watchlist_remove" });
    await ctx.reply("Send the token symbol or mint to remove from your watchlist.");
  });

  bot.callbackQuery(/^remove_watchlist:(.+)$/, async (ctx) => {
    const mint = String(ctx.match?.[1] || "").trim();
    await ctx.answerCallbackQuery();
    if (!mint) return;
    await removeFromWatchlist(ctx.from?.id, mint);
    await ctx.reply("Removed from your watchlist (if it was present)." );
  });

  bot.on("message:text", async (ctx, next) => {
    const raw = String(ctx.message?.text || "");
    if (raw.startsWith("/")) return next();

    const s = getConvoState(ctx.from?.id);
    if (!s) return next();

    const input = raw.trim();

    if (s.mode === "watchlist_add") {
      clearConvoState(ctx.from?.id);
      const r = await resolveToken(input);
      if (!r.ok) {
        await ctx.reply("Could not resolve token. Try a mint address.");
        return;
      }
      const res = await addToWatchlist(ctx.from?.id, r.token);
      await ctx.reply(res.already ? "Already in your watchlist." : "Added to your watchlist.");
      return;
    }

    if (s.mode === "watchlist_remove") {
      clearConvoState(ctx.from?.id);
      const r = await resolveToken(input);
      if (!r.ok) {
        await ctx.reply("Could not resolve token. Try a mint address.");
        return;
      }
      await removeFromWatchlist(ctx.from?.id, r.token.mint);
      await ctx.reply("Removed from your watchlist (if it was present)." );
      return;
    }

    return next();
  });
}
