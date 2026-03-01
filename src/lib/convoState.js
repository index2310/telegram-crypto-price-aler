const state = new Map();

export function getStateKey(ctx) {
  const uid = ctx?.from?.id ? String(ctx.from.id) : "";
  return uid;
}

export function setConvoState(userId, s) {
  const uid = String(userId || "");
  if (!uid) return;
  state.set(uid, { ...s, ts: Date.now() });
}

export function getConvoState(userId) {
  const uid = String(userId || "");
  if (!uid) return null;
  const s = state.get(uid);
  if (!s) return null;
  if (Date.now() - (s.ts || 0) > 10 * 60_000) {
    state.delete(uid);
    return null;
  }
  return s;
}

export function clearConvoState(userId) {
  const uid = String(userId || "");
  state.delete(uid);
}
