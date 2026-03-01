import { InlineKeyboard } from "grammy";
import { resolveToken, getTokenPriceUsd, getTokenChange24h } from "../services/priceService.js";
import { shortMint, fmtUsd, fmtPct } from "../lib/format.js";
import { addToWatchlist, getWatchlist } from "../services/stateStore.js";

function priceKb({ mint, inWatchlist }) {
  const kb = new InlineKeyboard();
  if (!inWatchlist) kb.text("Add to Watchlist", "add_watchlist:" + mint).row();
  kb.text("Set Alert Above", "set_alert_above:" + mint).text("Set Alert Below", "set_alert_below:" + mint).row();
  kb.text("Refresh", "refresh_price:" + mint);
  return kb;
}

async function renderPrice(ctx, token, { bypassCache = false } = {}) {
  const wl = await getWatchlist(ctx.from?.id);
  const inWatchlist = (wl.items || []).some((i) => i.mint === token.mint);

  const pr = await getTokenPriceUsd(token.mint, { bypassCache });
  if (!pr.ok) {
    await ctx.reply("Price data temporarily unavailable (API down). Please try again in a minute.");
    return;
  }

  const ch = await getTokenChange24h(token.mint);
  const changeLine = ch?.ok && ch.change24hPct !== null ? ("24h: " + fmtPct(ch.change24hPct)) : "24h: N/A";

  const ts = pr.ts instanceof Date ? pr.ts.toISOString() : new Date().toISOString();

  const name = token.name || "Token";
  const symbol = token.symbol || "";

  await ctx.reply(
    [
      name + (symbol ? " (" + symbol + ")" : ""),
      "Mint: " + shortMint(token.mint),
      "Price: " + fmtUsd(pr.priceUsd),
      changeLine,
      "Source: " + String(pr.source || "API") + " at " + ts,
      pr.stale ? "Note: showing cached value due to API issues." : "",
    ].filter(Boolean).join("\n"),
    { reply_markup: priceKb({ mint: token.mint, inWatchlist }) }
  );
}

export default function register(bot) {
  bot.command("price", async (ctx) => {
    const text = String(ctx.message?.text || "");
    const arg = text.split(/\s+/).slice(1).join(" ").trim();

    if (!arg) {
      const kb = new InlineKeyboard().text("Open Watchlist", "menu:watchlist");
      await ctx.reply("Usage: /price <symbol|mint>", { reply_markup: kb });
      return;
    }

    const r = await resolveToken(arg);
    if (!r.ok) {
      if (r.error === "AMBIGUOUS") {
        const kb = new InlineKeyboard();
        for (const o of r.options || []) {
          kb.text((o.symbol || "") + " " + shortMint(o.mint), "price_pick:" + o.mint).row();
        }
        await ctx.reply("That symbol matches multiple tokens. Pick one:", { reply_markup: kb });
        return;
      }
      if (r.error === "API_DOWN") {
        await ctx.reply("Price data temporarily unavailable (API down). Please try again in a minute.");
        return;
      }
      await ctx.reply("Token not found. Try a mint address if the symbol is ambiguous.");
      return;
    }

    await renderPrice(ctx, r.token, { bypassCache: false });
  });

  bot.callbackQuery(/^price_pick:(.+)$/, async (ctx) => {
    const mint = String(ctx.match?.[1] || "").trim();
    await ctx.answerCallbackQuery();
    if (!mint) return;
    await renderPrice(ctx, { mint, symbol: "", name: "" }, { bypassCache: false });
  });

  bot.callbackQuery(/^refresh_price:(.+)$/, async (ctx) => {
    const mint = String(ctx.match?.[1] || "").trim();
    await ctx.answerCallbackQuery({ text: "Refreshing…" });
    if (!mint) return;
    await renderPrice(ctx, { mint, symbol: "", name: "" }, { bypassCache: true });
  });

  bot.callbackQuery(/^add_watchlist:(.+)$/, async (ctx) => {
    const mint = String(ctx.match?.[1] || "").trim();
    await ctx.answerCallbackQuery();
    if (!mint) return;

    const res = await addToWatchlist(ctx.from?.id, { mint, symbol: "", name: "" });
    if (!res.ok) {
      await ctx.reply("Could not add to watchlist right now.");
      return;
    }
    await ctx.reply(res.already ? "Already in your watchlist." : "Added to your watchlist.");
  });
}
