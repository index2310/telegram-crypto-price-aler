import { MongoClient } from "mongodb";
import { logInfo, logError, safeErr } from "./log.js";

let _client = null;
let _db = null;
let _ensured = false;

export async function getDb(mongoUri) {
  if (!mongoUri) return null;
  if (_db) return _db;

  try {
    _client = new MongoClient(mongoUri, { maxPoolSize: 5, ignoreUndefined: true });
    await _client.connect();
    _db = _client.db();
    logInfo("db connected", { mongo: true });
    return _db;
  } catch (e) {
    logError("db connect failed", { err: safeErr(e) });
    throw e;
  }
}

export async function ensureIndexes(db) {
  if (!db || _ensured) return;
  _ensured = true;

  try {
    await db.collection("users").createIndex({ telegramUserId: 1 }, { unique: true });
    await db.collection("watchlists").createIndex({ telegramUserId: 1 }, { unique: true });
    await db.collection("alerts").createIndex({ telegramUserId: 1, status: 1 });
    await db.collection("alerts").createIndex({ status: 1, mint: 1 });
    await db.collection("raydium_state").createIndex({ key: 1 }, { unique: true });
    await db.collection("raydium_pairs").createIndex({ pairId: 1 }, { unique: true });
    await db.collection("raydium_pairs").createIndex({ discoveredAt: -1 });
    logInfo("db indexes ensured");
  } catch (e) {
    logError("db ensureIndexes failed", { err: safeErr(e) });
  }
}
