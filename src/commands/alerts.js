import { InlineKeyboard } from "grammy";
import { listAlerts, removeAlertById, createAlert } from "../services/stateStore.js";
import { resolveToken } from "../services/priceService.js";
import { fmtUsd, shortMint } from "../lib/format.js";
import { setConvoState, getConvoState, clearConvoState } from "../lib/convoState.js";

async function showAlerts(ctx) {
  const alerts = await listAlerts(ctx.from?.id);
  if (!alerts.length) {
    const kb = new InlineKeyboard().text("Add Alert", "alerts:add");
    await ctx.reply("You have no active alerts.", { reply_markup: kb });
    return;
  }

  const kb = new InlineKeyboard().text("Add Alert", "alerts:add").row();
  let msg = "Active alerts:\n";

  for (const a of alerts.slice(0, 30)) {
    const tokenLabel = (a.symbol || a.name || shortMint(a.mint)) + " (" + shortMint(a.mint) + ")";
    msg += "\n" + tokenLabel + "\n" + a.direction.toUpperCase() + " " + fmtUsd(a.targetPriceUsd);
    kb.text("Remove", "remove_alert:" + String(a._id)).row();
  }

  await ctx.reply(msg, { reply_markup: kb });
}

export default function register(bot) {
  bot.command("alerts", async (ctx) => {
    await showAlerts(ctx);
  });

  bot.callbackQuery("alerts:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    setConvoState(ctx.from?.id, { mode: "alert_token" });
    await ctx.reply("Send the token symbol or mint for the alert.");
  });

  bot.callbackQuery(/^remove_alert:(.+)$/, async (ctx) => {
    const id = String(ctx.match?.[1] || "").trim();
    await ctx.answerCallbackQuery();
    if (!id) return;
    const res = await removeAlertById(ctx.from?.id, id);
    await ctx.reply(res.ok ? "Alert removed (if it existed)." : "Could not remove alert right now.");
  });

  bot.on("message:text", async (ctx, next) => {
    const raw = String(ctx.message?.text || "");
    if (raw.startsWith("/")) return next();

    const s = getConvoState(ctx.from?.id);
    if (!s) return next();

    if (s.mode === "alert_token") {
      const input = raw.trim();
      const r = await resolveToken(input);
      if (!r.ok) {
        clearConvoState(ctx.from?.id);
        await ctx.reply("Could not resolve token. Try a mint address.");
        return;
      }

      setConvoState(ctx.from?.id, { mode: "alert_direction", token: r.token });
      const kb = new InlineKeyboard()
        .text("ABOVE", "alert_dir:above")
        .text("BELOW", "alert_dir:below");
      await ctx.reply("Choose direction:", { reply_markup: kb });
      return;
    }

    if (s.mode === "alert_price") {
      const price = Number(raw.trim());
      const token = s.token;
      const direction = s.direction;
      clearConvoState(ctx.from?.id);

      if (!Number.isFinite(price) || price <= 0) {
        await ctx.reply("Please send a valid USD price like 1.23");
        return;
      }

      const res = await createAlert({
        telegramUserId: ctx.from?.id,
        chatId: ctx.chat?.id,
        token,
        direction,
        targetPriceUsd: price,
      });

      if (!res.ok) {
        await ctx.reply("Could not create alert right now.");
        return;
      }

      await ctx.reply(
        "Alert created: " + (token.symbol || token.name || shortMint(token.mint)) + " " + direction.toUpperCase() + " " + fmtUsd(price)
      );
      return;
    }

    return next();
  });

  bot.callbackQuery(/^alert_dir:(above|below)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const dir = String(ctx.match?.[1] || "");
    const s = getConvoState(ctx.from?.id);
    if (!s || s.mode !== "alert_direction" || !s.token) {
      await ctx.reply("That alert setup expired. Try /alerts again.");
      return;
    }
    setConvoState(ctx.from?.id, { mode: "alert_price", token: s.token, direction: dir });
    await ctx.reply("Send the target price in USD (number)." );
  });

  bot.command("alert", async (ctx) => {
    const text = String(ctx.message?.text || "");
    const parts = text.split(/\s+/).slice(1);
    const tokenIn = parts[0];
    const direction = String(parts[1] || "").toLowerCase();
    const priceStr = parts[2];

    if (!tokenIn || !direction || !priceStr || !["above", "below"].includes(direction)) {
      await ctx.reply("Usage: /alert <symbol|mint> above <price> OR /alert <symbol|mint> below <price>");
      return;
    }

    const price = Number(priceStr);
    if (!Number.isFinite(price) || price <= 0) {
      await ctx.reply("Please provide a valid price like 1.23");
      return;
    }

    const r = await resolveToken(tokenIn);
    if (!r.ok) {
      await ctx.reply("Could not resolve token. Try a mint address.");
      return;
    }

    const res = await createAlert({
      telegramUserId: ctx.from?.id,
      chatId: ctx.chat?.id,
      token: r.token,
      direction,
      targetPriceUsd: price,
    });

    if (!res.ok) {
      await ctx.reply("Could not create alert right now.");
      return;
    }

    await ctx.reply(
      "Alert created: " + (r.token.symbol || r.token.name || shortMint(r.token.mint)) + " " + direction.toUpperCase() + " " + fmtUsd(price)
    );
  });
}
