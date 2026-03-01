export function buildBotProfile() {
  return [
    "Purpose: Solana price lookup, personal watchlists, one-shot price alerts (above/below), and Raydium new pair scanning.",
    "Public commands: /start, /help, /price, /watchlist, /alerts, /alert, /reset.",
    "Key rules: New pair notifications are opt-in per user; alerts trigger once then become triggered; symbol ambiguity may require using a mint address.",
  ].join("\n");
}
