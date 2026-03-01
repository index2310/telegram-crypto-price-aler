Solana Alert Watcher

This is a Telegram bot (grammY, Node.js ES modules) that provides Solana token price lookup, per-user watchlists, per-user price alerts (above/below), and background scanning of newly listed Raydium pairs.

Features
1) /price lookup by symbol or mint
2) Watchlist add/remove/list (per user)
3) Alerts above/below (per user, trigger once)
4) Raydium new pair scanning (background) with opt-in notifications
5) Caching, timeouts, and friendly “API temporarily unavailable” messaging
6) MongoDB persistence (watchlists, alerts, users, Raydium state)

Architecture overview
1) src/index.js
   Starts the bot with long polling via @grammyjs/runner, clears webhook, and starts background pollers.
2) src/bot.js
   Creates the grammY bot, registers commands first, then callback handlers.
3) src/commands/*
   /start, /help, /price, /watchlist, /alerts, /alert, /reset
4) src/services/*
   priceService (token resolution + price), raydiumService (new pairs scan)
5) src/pollers/*
   alertPoller, raydiumScanner (single-process loops)
6) src/lib/*
   config, db, caches, logging, helpers

Setup
1) Install
   npm run install:root

2) Configure env
   Copy .env.sample to .env and set:
   - TELEGRAM_BOT_TOKEN (required)
   - MONGODB_URI (optional but strongly recommended; required for persistence)

3) Run locally
   npm run dev

4) Run production
   npm start

Commands (quick)
1) /start
2) /help
3) /price SOL
4) /price <mint>
5) /watchlist
6) /watchlist add SOL
7) /watchlist remove <mint>
8) /watchlist list
9) /alerts
10) /alert SOL above 250
11) /alert SOL below 100
12) /reset (clears your stored conversation memory collection if you had it; this bot uses /reset to clear watchlist+alerts state for safety)

Integrations
1) Price API
   - Configurable via PRICE_API_BASE_URL (optional)
   - Default fallback uses Jupiter public APIs
2) Raydium API
   - Configurable via RAYDIUM_API_BASE_URL (optional)
   - Default fallback uses Raydium public APIs

Database
Collections used
1) users
2) watchlists
3) alerts
4) raydium_state
5) raydium_pairs

Indexes are created on boot when MongoDB is configured.

Deployment notes (Render)
1) Use a Background Worker or Web Service. Long polling does not require an inbound port.
2) Ensure TELEGRAM_BOT_TOKEN is set.
3) Set MONGODB_URI to enable persistence.

Troubleshooting
1) Bot not starting
   - Ensure TELEGRAM_BOT_TOKEN is set
   - Check logs for "TELEGRAM_BOT_TOKEN set: true"
2) Price data unavailable
   - Upstream APIs can be down or rate-limited. The bot will return a friendly message and keep running.
3) Duplicate instance conflict (409)
   - Render deploy overlaps can cause 409 conflicts. This bot retries polling with backoff.

Extensibility
Add new commands under src/commands and they will be auto-registered via src/commands/loader.js. Keep /help output in sync.
