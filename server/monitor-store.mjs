// 共享存储与聚合逻辑（被 http 骨架与 express 骨架共用）。
// 仅内存存储；生产环境请将 store + pushEvents/summary/recentEvents 替换为 DB / 消息队列实现。

export const store = {
  events: [],
  maxEvents: 100000,
};

export function normalize(e) {
  return {
    ts: e.ts ?? Date.now(),
    type: e.type ?? "custom",
    name: e.name ?? null,
    message: e.message ?? null,
    code: e.code ?? null,
    status: e.status ?? null,
    value: e.value ?? null,
    meta: e.meta ?? null,
  };
}

export function pushEvents(list) {
  for (const e of list) store.events.push(normalize(e));
  if (store.events.length > store.maxEvents) {
    store.events.splice(0, store.events.length - store.maxEvents);
  }
}

export function summary(range = "24h") {
  const now = Date.now();
  const from = range === "24h" ? now - 24 * 3600 * 1000 : 0;
  const recent = store.events.filter((e) => e.ts >= from);
  const vitals = {};
  let errors = 0;
  let apiErrors = 0;
  let wsDrops = 0;
  for (const e of recent) {
    if (e.type === "error") errors++;
    else if (e.type === "api_error") apiErrors++;
    else if (e.type === "ws_drop") wsDrops++;
    else if (e.type === "vital" && e.name) vitals[e.name] = e.value ?? 0;
  }
  return { errors, apiErrors, wsDrops, vitals, total: recent.length, range };
}

export function recentEvents(limit = 50) {
  return store.events.slice(-limit).reverse();
}
