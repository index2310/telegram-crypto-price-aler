import { cfg } from "../lib/config.js";
import { createTtlCache } from "../lib/ttlCache.js";
import { logInfo, safeErr } from "../lib/log.js";
import { httpGetJson } from "./http.js";

const ttlMs = Math.max(5, Number(cfg.CACHE_TTL_SECONDS || 60)) * 1000;
const resolveCache = createTtlCache({ ttlMs, max: 4000 });
const priceCache = createTtlCache({ ttlMs: Math.min(ttlMs, 30_000), max: 8000 });

function isSolanaMint(s) {
  const t = String(s || "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t);
}

function normalizeSymbol(s) {
  return String(s || "").trim().toUpperCase();
}

export async function resolveToken(input) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "EMPTY" };

  if (isSolanaMint(raw)) {
    return { ok: true, token: { mint: raw, symbol: "", name: "", resolvedBy: "mint" } };
  }

  const sym = normalizeSymbol(raw);
  const cached = resolveCache.get("sym:" + sym);
  if (cached) return { ok: true, token: cached };

  try {
    const url = "https://token.jup.ag/all";
    logInfo("api call start", { label: "jupiter_token_list" });
    const list = await httpGetJson(url, { timeoutMs: 20_000, retries: 1, label: "jupiter_token_list" });
    const matches = Array.isArray(list) ? list.filter((t) => String(t?.symbol || "").toUpperCase() === sym) : [];

    if (matches.length === 0) {
      return { ok: false, error: "NOT_FOUND" };
    }

    if (matches.length === 1) {
      const t = matches[0];
      const token = { mint: String(t.address), symbol: String(t.symbol || sym), name: String(t.name || sym), resolvedBy: "symbol" };
      resolveCache.set("sym:" + sym, token);
      return { ok: true, token };
    }

    const options = matches.slice(0, 8).map((t) => ({
      mint: String(t.address),
      symbol: String(t.symbol || sym),
      name: String(t.name || sym),
    }));

    return { ok: false, error: "AMBIGUOUS", options };
  } catch (e) {
    return { ok: false, error: "API_DOWN", detail: safeErr(e) };
  }
}

export async function getTokenPriceUsd(mint, { bypassCache = false } = {}) {
  const m = String(mint || "").trim();
  if (!m) return { ok: false, error: "EMPTY_MINT" };

  const key = "p:" + m;
  if (!bypassCache) {
    const cached = priceCache.get(key);
    if (cached) return { ok: true, ...cached, cached: true };
  }

  const base = String(cfg.PRICE_API_BASE_URL || "").trim();
  if (!base) return { ok: false, error: "API_NOT_CONFIGURED" };

  try {
    const url = base.replace(/\/+$/, "") + "/price?ids=" + encodeURIComponent(m);
    const json = await httpGetJson(url, { timeoutMs: 12_000, retries: 1, label: "jupiter_price" });

    const p = json?.data?.[m]?.price;
    const price = Number(p);
    const ts = new Date();

    if (!Number.isFinite(price)) {
      return { ok: false, error: "NO_PRICE" };
    }

    const out = { priceUsd: price, ts, source: "Jupiter" };
    priceCache.set(key, out);
    return { ok: true, ...out, cached: false };
  } catch (e) {
    const cached = priceCache.get(key);
    if (cached) {
      return { ok: true, ...cached, cached: true, stale: true, warn: "API_DOWN" };
    }
    return { ok: false, error: "API_DOWN", detail: safeErr(e) };
  }
}

export async function getTokenChange24h(mint) {
  // Jupiter /price endpoint does not provide 24h change. Keep optional.
  // If you later add a provider with 24h change, wire it here.
  return { ok: true, change24hPct: null, source: "N/A" };
}
