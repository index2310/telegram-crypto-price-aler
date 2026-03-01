import { safeErr, logInfo, logWarn } from "../lib/log.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function httpGetJson(url, { timeoutMs = 15_000, retries = 1, label = "http_get" } = {}) {
  const started = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      logInfo("api call start", { label, attempt });
      const r = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "SolanaAlertWatcher/1.0" },
        signal: ctrl.signal,
      });

      const text = await r.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!r.ok) {
        const errMsg = json?.error?.message || json?.message || text || "HTTP_ERROR";
        logWarn("api call fail", { label, status: r.status, ms: Date.now() - started, err: String(errMsg).slice(0, 200) });

        if (attempt <= retries && (r.status === 408 || r.status === 429 || (r.status >= 500 && r.status < 600))) {
          await sleep(400 * attempt);
          continue;
        }
        const e = new Error(String(errMsg));
        e.status = r.status;
        throw e;
      }

      logInfo("api call success", { label, status: r.status, ms: Date.now() - started });
      return json;
    } catch (e) {
      const msg = e?.name === "AbortError" ? "TIMEOUT" : safeErr(e);
      logWarn("api call exception", { label, attempt, ms: Date.now() - started, err: String(msg).slice(0, 200) });
      if (attempt <= retries) {
        await sleep(400 * attempt);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}
