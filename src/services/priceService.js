export async function getTokenPriceUsd(mint, { bypassCache = false } = {}) {
  const m = String(mint || "").trim();
  if (!m) return { ok: false, error: "EMPTY_MINT" };

  const key = "p:" + m;

  if (!bypassCache) {
    const cached = priceCache.get(key);
    if (cached) return { ok: true, ...cached, cached: true };
  }

  const base = String(cfg.PRICE_API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return { ok: false, error: "API_NOT_CONFIGURED" };

  try {
    const url = `${base}/price?ids=${encodeURIComponent(m)}`;

    const json = await httpGetJson(url, {
      timeoutMs: 12_000,
      retries: 1,
      label: "jupiter_price",
      headers: cfg.JUPITER_API_KEY
        ? { Authorization: `Bearer ${cfg.JUPITER_API_KEY}` }
        : undefined
    });

    console.log("PRICE RESPONSE:", json);

    const price = Number(json?.data?.[m]?.price);

    if (!Number.isFinite(price)) {
      return { ok: false, error: "NO_PRICE" };
    }

    const out = { priceUsd: price, ts: new Date(), source: "Jupiter" };
    priceCache.set(key, out);

    return { ok: true, ...out, cached: false };
  } catch (e) {
    console.error("PRICE ERROR:", e);

    const cached = priceCache.get(key);
    if (cached) {
      return { ok: true, ...cached, cached: true, stale: true };
    }

    return { ok: false, error: "API_DOWN", detail: safeErr(e) };
  }
}