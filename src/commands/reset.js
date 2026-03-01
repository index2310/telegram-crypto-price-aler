import { resetUserData } from "../services/stateStore.js";

export default function register(bot) {
  bot.command("reset", async (ctx) => {
    await resetUserData(ctx.from?.id);
    await ctx.reply("Cleared your watchlist and alerts.");
  });
}
