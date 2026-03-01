export default function register(bot) {
  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "Commands:",
        "/start",
        "/help",
        "/price SOL",
        "/price <mint>",
        "/watchlist (menu)",
        "/watchlist add <symbol|mint>",
        "/watchlist remove <symbol|mint>",
        "/watchlist list",
        "/alerts (menu)",
        "/alert <symbol|mint> above <price>",
        "/alert <symbol|mint> below <price>",
        "/reset (clears your watchlist + alerts)",
        "",
        "Notes:",
        "Price APIs and Raydium APIs can be rate-limited or temporarily unavailable.",
        "If that happens, you will see a short message and you can try again in a minute.",
      ].join("\n")
    );
  });
}
