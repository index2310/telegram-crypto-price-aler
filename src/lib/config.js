export const cfg = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI || "",

  PRICE_API_BASE_URL: process.env.PRICE_API_BASE_URL || "https://price.jup.ag/v4",
  RAYDIUM_API_BASE_URL: process.env.RAYDIUM_API_BASE_URL || "https://api.raydium.io/v2",

  CACHE_TTL_SECONDS: Number(process.env.CACHE_TTL_SECONDS || 60),
  ALERT_POLL_INTERVAL_SECONDS: Number(process.env.ALERT_POLL_INTERVAL_SECONDS || 30),
  RAYDIUM_SCAN_INTERVAL_SECONDS: Number(process.env.RAYDIUM_SCAN_INTERVAL_SECONDS || 120),
  NEW_PAIRS_LATEST_LIMIT: Number(process.env.NEW_PAIRS_LATEST_LIMIT || 15)
};
