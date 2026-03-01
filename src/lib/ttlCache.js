export function createTtlCache({ ttlMs = 60_000, max = 5000 } = {}) {
  const map = new Map();

  function prune() {
    const now = Date.now();
    for (const [k, v] of map) {
      if (!v || v.expiresAt <= now) map.delete(k);
    }
    while (map.size > max) {
      const first = map.keys().next().value;
      map.delete(first);
    }
  }

  return {
    get(key) {
      const v = map.get(key);
      if (!v) return undefined;
      if (v.expiresAt <= Date.now()) {
        map.delete(key);
        return undefined;
      }
      return v.value;
    },
    set(key, value, overrideTtlMs) {
      const ms = Number.isFinite(overrideTtlMs) ? overrideTtlMs : ttlMs;
      map.set(key, { value, expiresAt: Date.now() + ms });
      if (map.size > max) prune();
    },
    delete(key) {
      map.delete(key);
    },
    prune
  };
}
