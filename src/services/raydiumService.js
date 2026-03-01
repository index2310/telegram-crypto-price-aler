import { cfg } from "../lib/config.js";
import { createTtlCache } from "../lib/ttlCache.js";
import { safeErr } from "../lib/log.js";
import { httpGetJson } from "./http.js";

const ttlMs = Math.max(10, Number(cfg.CACHE_TTL_SECONDS || 60)) * 1000;
const pairsCache = createTtlCache({ ttlMs: Math.min(ttlMs, 60_000), max: 100 });

function normalizePair(p) {
  const pairId = String(p?.ammId || p?.id || p?.pairId || p?.lpMint || "");
  const baseMint = String(p?.baseMint || p?.baseMintAddress || p?.baseMint?.address || "");
  const quoteMint = String(p?.quoteMint || p?.quoteMintAddress || p?.quoteMint?.address || "");
  const discoveredAt = new Date();

  return {
    pairId,
    baseMint,
    quoteMint,
    discoveredAt,
    metadata: p,
  };
}

export async function fetchLatestPairs({ bypassCache = false } = {}) {
  const key = "latest";
  if (!bypassCache) {
    const cached = pairsCache.get(key);
    if (cached) return { ok: true, pairs: cached, cached: true };
  }

  const base = String(cfg.RAYDIUM_API_BASE_URL || "").trim();
  if (!base) return { ok: false, error: "API_NOT_CONFIGURED" };

  try {
    // Raydium endpoints are not fully stable; this is a best-effort public endpoint.
    // If it changes, override RAYDIUM_API_BASE_URL or update this path.
    const url = base.replace(/\/+$/, "") + "/main/pairs";
    const json = await httpGetJson(url, { timeoutMs: 15_000, retries: 1, label: "raydium_pairs" });

    const arr = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
    const pairs = arr
      .map(normalizePair)
      .filter((p) => p.pairId && p.baseMint && p.quoteMint)
      .slice(0, 200);

    pairsCache.set(key, pairs);
    return { ok: true, pairs, cached: false };
  } catch (e) {
    const cached = pairsCache.get(key);
    if (cached) return { ok: true, pairs: cached, cached: true, stale: true, warn: "API_DOWN" };
    return { ok: false, error: "API_DOWN", detail: safeErr(e) };
  }
}
