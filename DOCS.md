Solana Alert Watcher

What this bot does
It helps you look up Solana token prices, keep a personal watchlist, set one-time price alerts (above or below), and optionally get notified when new Raydium pairs are discovered.

Public commands
1) /start
Shows a welcome message and a menu.

2) /help
Shows usage examples and explains behavior when external APIs are unavailable.

3) /price <symbol|mint>
Looks up a token and shows its price in USD.
Examples:
/price SOL
/price So11111111111111111111111111111111111111112
Notes:
If you use a symbol and it matches multiple tokens, the bot may ask you to pick one by mint.

4) /watchlist
Opens the watchlist menu.
Subcommands:
/watchlist list
/watchlist add <symbol|mint>
/watchlist remove <symbol|mint>

5) /alerts
Opens the alerts menu and lists current alerts.

6) /alert <symbol|mint> above <price>
Creates an above alert.
Example:
/alert SOL above 250

7) /alert <symbol|mint> below <price>
Creates a below alert.
Example:
/alert SOL below 100

8) /reset
Clears your watchlist and alerts for this bot.

Inline buttons
After a /price lookup, you will see buttons like:
- Add to Watchlist
- Set Alert Above
- Set Alert Below
- Refresh

New pairs notifications
New Raydium pair notifications are opt-in.
Use the New Pairs menu from /start to enable or disable.

Environment variables
Required
1) TELEGRAM_BOT_TOKEN
Your Telegram bot token.

Optional (recommended)
2) MONGODB_URI
MongoDB connection string. When set, your watchlist, alerts, and settings are persisted.
If missing, the bot still runs but data is stored in memory and is lost on restart.

Optional
3) PRICE_API_BASE_URL
Override the price API base URL. If not set, the bot uses a safe default.

4) RAYDIUM_API_BASE_URL
Override the Raydium API base URL. If not set, the bot uses a safe default.

5) CACHE_TTL_SECONDS
TTL for in-memory caches. Default is used if missing.

6) ALERT_POLL_INTERVAL_SECONDS
Alert scanner interval. Default is used if missing.

7) RAYDIUM_SCAN_INTERVAL_SECONDS
Raydium new pairs scanner interval. Default is used if missing.

Troubleshooting
If a price or Raydium call fails, the bot will say:
“Price data temporarily unavailable (API down). Please try again in a minute.”
It will keep running and retry later.
