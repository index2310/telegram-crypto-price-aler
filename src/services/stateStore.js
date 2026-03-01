import { cfg } from "../lib/config.js";
import { getDb } from "../lib/db.js";
import { logWarn, logError, safeErr } from "../lib/log.js";

const mem = {
  users: new Map(),
  watchlists: new Map(),
  alerts: new Map(),
  raydiumState: { lastSeenPairIds: [] },
  raydiumPairs: [],
};

function keyUser(userId) {
  return String(userId || "");
}

export async function upsertUser({ telegramUserId, chatId, settings = {} }) {
  const uid = keyUser(telegramUserId);
  const db = await getDb(cfg.MONGODB_URI);
  const doc = {
    telegramUserId: uid,
    chatId: String(chatId || ""),
    settings: {
      newPairNotifications: !!settings.newPairNotifications,
      scanPreset: String(settings.scanPreset || "default"),
    },
  };

  if (!db) {
    mem.users.set(uid, { ...doc, createdAt: new Date(), updatedAt: new Date() });
    return;
  }

  try {
    await db.collection("users").updateOne(
      { telegramUserId: uid },
      {
        $setOnInsert: { createdAt: new Date() },
        $set: { ...doc, updatedAt: new Date() },
      },
      { upsert: true }
    );
  } catch (e) {
    logError("db op failed", { col: "users", op: "updateOne", err: safeErr(e) });
  }
}

export async function setNewPairsNotifications(telegramUserId, enabled) {
  const uid = keyUser(telegramUserId);
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) {
    const u = mem.users.get(uid) || { telegramUserId: uid, chatId: uid, settings: {} };
    u.settings = u.settings || {};
    u.settings.newPairNotifications = !!enabled;
    mem.users.set(uid, u);
    return;
  }

  try {
    await db.collection("users").updateOne(
      { telegramUserId: uid },
      {
        $setOnInsert: { },
        $set: { "settings.newPairNotifications": !!enabled, updatedAt: new Date() },
      },
      { upsert: true }
    );
  } catch (e) {
    logError("db op failed", { col: "users", op: "updateOne", err: safeErr(e) });
  }
}

export async function getUsersWithNewPairsEnabled() {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) {
    const out = [];
    for (const u of mem.users.values()) {
      if (u?.settings?.newPairNotifications) out.push(u);
    }
    return out;
  }

  try {
    return await db
      .collection("users")
      .find({ "settings.newPairNotifications": true })
      .project({ telegramUserId: 1, chatId: 1, settings: 1 })
      .toArray();
  } catch (e) {
    logError("db op failed", { col: "users", op: "find", err: safeErr(e) });
    return [];
  }
}

export async function getWatchlist(telegramUserId) {
  const uid = keyUser(telegramUserId);
  const db = await getDb(cfg.MONGODB_URI);

  if (!db) {
    return mem.watchlists.get(uid) || { telegramUserId: uid, items: [] };
  }

  try {
    const wl = await db.collection("watchlists").findOne({ telegramUserId: uid });
    return wl || { telegramUserId: uid, items: [] };
  } catch (e) {
    logError("db op failed", { col: "watchlists", op: "findOne", err: safeErr(e) });
    return { telegramUserId: uid, items: [] };
  }
}

export async function addToWatchlist(telegramUserId, token) {
  const uid = keyUser(telegramUserId);
  const db = await getDb(cfg.MONGODB_URI);
  const item = {
    mint: String(token?.mint || ""),
    symbol: String(token?.symbol || ""),
    name: String(token?.name || ""),
    addedAt: new Date(),
  };

  if (!item.mint) return { ok: false, error: "EMPTY_MINT" };

  if (!db) {
    const wl = mem.watchlists.get(uid) || { telegramUserId: uid, items: [] };
    wl.items = Array.isArray(wl.items) ? wl.items : [];
    if (!wl.items.some((x) => x.mint === item.mint)) wl.items.push(item);
    mem.watchlists.set(uid, wl);
    return { ok: true };
  }

  try {
    const wl = await db.collection("watchlists").findOne({ telegramUserId: uid });
    const items = Array.isArray(wl?.items) ? wl.items : [];
    if (items.some((x) => x.mint === item.mint)) return { ok: true, already: true };

    await db.collection("watchlists").updateOne(
      { telegramUserId: uid },
      {
        $setOnInsert: { },
        $set: { telegramUserId: uid, updatedAt: new Date() },
        $push: { items: item },
      },
      { upsert: true }
    );
    return { ok: true };
  } catch (e) {
    logError("db op failed", { col: "watchlists", op: "updateOne", err: safeErr(e) });
    return { ok: false, error: "DB" };
  }
}

export async function removeFromWatchlist(telegramUserId, mint) {
  const uid = keyUser(telegramUserId);
  const m = String(mint || "").trim();
  if (!m) return { ok: false, error: "EMPTY" };

  const db = await getDb(cfg.MONGODB_URI);
  if (!db) {
    const wl = mem.watchlists.get(uid) || { telegramUserId: uid, items: [] };
    wl.items = (wl.items || []).filter((x) => x.mint !== m);
    mem.watchlists.set(uid, wl);
    return { ok: true };
  }

  try {
    await db.collection("watchlists").updateOne(
      { telegramUserId: uid },
      {
        $setOnInsert: { },
        $set: { updatedAt: new Date() },
        $pull: { items: { mint: m } },
      },
      { upsert: true }
    );
    return { ok: true };
  } catch (e) {
    logError("db op failed", { col: "watchlists", op: "updateOne", err: safeErr(e) });
    return { ok: false, error: "DB" };
  }
}

export async function createAlert({ telegramUserId, chatId, token, direction, targetPriceUsd }) {
  const uid = keyUser(telegramUserId);
  const db = await getDb(cfg.MONGODB_URI);

  const doc = {
    telegramUserId: uid,
    chatId: String(chatId || ""),
    mint: String(token?.mint || ""),
    symbol: String(token?.symbol || ""),
    name: String(token?.name || ""),
    direction: direction === "below" ? "below" : "above",
    targetPriceUsd: Number(targetPriceUsd),
    status: "active",
    lastTriggeredAt: null,
  };

  if (!doc.mint || !Number.isFinite(doc.targetPriceUsd)) {
    return { ok: false, error: "BAD_INPUT" };
  }

  if (!db) {
    const a = mem.alerts.get(uid) || [];
    a.push({ ...doc, _id: String(Date.now()), updatedAt: new Date() });
    mem.alerts.set(uid, a);
    return { ok: true, id: a[a.length - 1]._id };
  }

  try {
    const res = await db.collection("alerts").insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
    return { ok: true, id: String(res.insertedId) };
  } catch (e) {
    logError("db op failed", { col: "alerts", op: "insertOne", err: safeErr(e) });
    return { ok: false, error: "DB" };
  }
}

export async function listAlerts(telegramUserId) {
  const uid = keyUser(telegramUserId);
  const db = await getDb(cfg.MONGODB_URI);

  if (!db) {
    return (mem.alerts.get(uid) || []).filter((a) => a.status === "active");
  }

  try {
    return await db
      .collection("alerts")
      .find({ telegramUserId: uid, status: "active" })
      .sort({ createdAt: -1 })
      .toArray();
  } catch (e) {
    logError("db op failed", { col: "alerts", op: "find", err: safeErr(e) });
    return [];
  }
}

export async function fetchActiveAlertsAll() {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) {
    const out = [];
    for (const arr of mem.alerts.values()) {
      for (const a of arr) if (a.status === "active") out.push(a);
    }
    return out;
  }

  try {
    return await db.collection("alerts").find({ status: "active" }).toArray();
  } catch (e) {
    logError("db op failed", { col: "alerts", op: "find", err: safeErr(e) });
    return [];
  }
}

export async function markAlertTriggered(alertId) {
  const id = String(alertId || "");
  const db = await getDb(cfg.MONGODB_URI);

  if (!db) {
    for (const [uid, arr] of mem.alerts) {
      const a = arr.find((x) => String(x._id) === id);
      if (a) {
        a.status = "triggered";
        a.lastTriggeredAt = new Date();
      }
      mem.alerts.set(uid, arr);
    }
    return;
  }

  try {
    await db.collection("alerts").updateOne(
      { _id: db.bson?.ObjectId ? new db.bson.ObjectId(id) : undefined },
      { $set: { status: "triggered", lastTriggeredAt: new Date(), updatedAt: new Date() } }
    );
  } catch (e) {
    // Fallback for ObjectId parsing without importing bson.
    try {
      await db.collection("alerts").updateOne(
        { _id: id },
        { $set: { status: "triggered", lastTriggeredAt: new Date(), updatedAt: new Date() } }
      );
    } catch (e2) {
      logWarn("db op failed", { col: "alerts", op: "updateOne", err: safeErr(e2) });
    }
  }
}

export async function removeAlertById(telegramUserId, alertId) {
  const uid = keyUser(telegramUserId);
  const id = String(alertId || "");
  const db = await getDb(cfg.MONGODB_URI);

  if (!db) {
    const arr = mem.alerts.get(uid) || [];
    mem.alerts.set(uid, arr.filter((a) => String(a._id) !== id));
    return { ok: true };
  }

  try {
    const res = await db.collection("alerts").deleteOne({ telegramUserId: uid, _id: id });
    return { ok: true, deleted: res.deletedCount };
  } catch (e) {
    logError("db op failed", { col: "alerts", op: "deleteOne", err: safeErr(e) });
    return { ok: false, error: "DB" };
  }
}

export async function getRaydiumState() {
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return mem.raydiumState;

  try {
    const doc = await db.collection("raydium_state").findOne({ key: "lastSeen" });
    return doc || { key: "lastSeen", lastSeenPairIds: [] };
  } catch (e) {
    logError("db op failed", { col: "raydium_state", op: "findOne", err: safeErr(e) });
    return { key: "lastSeen", lastSeenPairIds: [] };
  }
}

export async function updateRaydiumStateLastSeen(lastSeenPairIds) {
  const db = await getDb(cfg.MONGODB_URI);
  const ids = Array.isArray(lastSeenPairIds) ? lastSeenPairIds.slice(0, 2000) : [];

  if (!db) {
    mem.raydiumState = { key: "lastSeen", lastSeenPairIds: ids };
    return;
  }

  try {
    await db.collection("raydium_state").updateOne(
      { key: "lastSeen" },
      {
        $setOnInsert: { },
        $set: { key: "lastSeen", lastSeenPairIds: ids, updatedAt: new Date() },
      },
      { upsert: true }
    );
  } catch (e) {
    logError("db op failed", { col: "raydium_state", op: "updateOne", err: safeErr(e) });
  }
}

export async function insertRaydiumPairs(pairs) {
  const db = await getDb(cfg.MONGODB_URI);
  if (!Array.isArray(pairs) || pairs.length === 0) return;

  if (!db) {
    mem.raydiumPairs = [...pairs, ...mem.raydiumPairs].slice(0, 200);
    return;
  }

  for (const p of pairs) {
    const doc = {
      pairId: String(p.pairId),
      baseMint: String(p.baseMint),
      quoteMint: String(p.quoteMint),
      discoveredAt: p.discoveredAt || new Date(),
      metadata: p.metadata || {},
    };

    try {
      await db.collection("raydium_pairs").updateOne(
        { pairId: doc.pairId },
        {
          $setOnInsert: { },
          $set: { ...doc, updatedAt: new Date() },
        },
        { upsert: true }
      );
    } catch (e) {
      logWarn("db op failed", { col: "raydium_pairs", op: "updateOne", err: safeErr(e) });
    }
  }
}

export async function getLatestRaydiumPairs(limit = 15) {
  const lim = Math.max(1, Math.min(Number(limit || 15), 20));
  const db = await getDb(cfg.MONGODB_URI);
  if (!db) return mem.raydiumPairs.slice(0, lim);

  try {
    return await db.collection("raydium_pairs").find({}).sort({ discoveredAt: -1 }).limit(lim).toArray();
  } catch (e) {
    logError("db op failed", { col: "raydium_pairs", op: "find", err: safeErr(e) });
    return [];
  }
}

export async function resetUserData(telegramUserId) {
  const uid = keyUser(telegramUserId);
  const db = await getDb(cfg.MONGODB_URI);

  if (!db) {
    mem.watchlists.delete(uid);
    mem.alerts.delete(uid);
    return;
  }

  try {
    await db.collection("watchlists").deleteOne({ telegramUserId: uid });
  } catch (e) {
    logWarn("db op failed", { col: "watchlists", op: "deleteOne", err: safeErr(e) });
  }

  try {
    await db.collection("alerts").deleteMany({ telegramUserId: uid });
  } catch (e) {
    logWarn("db op failed", { col: "alerts", op: "deleteMany", err: safeErr(e) });
  }
}
