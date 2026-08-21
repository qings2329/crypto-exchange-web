// API 密钥后端：内存存储与查询逻辑（被 http 版与 express 版共用）。
// 仅内存存储；生产环境请将 apikeyStore + 下列函数替换为 DB 实现。
//
// 记录字段：
//   id, user_id, label, key(公钥), secretHash(secret 的 sha256), permissions[],
//   ip_whitelist[], status('active'|'disabled'), created_at, last_used_at
// 对外视图（publicView）永远不含 secret / secretHash。

import { hashSecret, ipAllowed } from "./apikey-auth.mjs";

let seq = 1;
export const apikeyStore = {
  // userId -> Map(id -> record)
  byUser: new Map(),
};

function userMap(userId) {
  let m = apikeyStore.byUser.get(userId);
  if (!m) {
    m = new Map();
    apikeyStore.byUser.set(userId, m);
  }
  return m;
}

// 去掉敏感字段，返回可安全返回给前端的视图。
export function publicView(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    label: r.label,
    key: r.key,
    permissions: r.permissions,
    ip_whitelist: r.ip_whitelist,
    status: r.status,
    created_at: r.created_at,
    last_used_at: r.last_used_at,
  };
}

// 列表（分页 + 筛选）。返回 { api_keys, total }；total 为筛选后的总数（不受分页影响）。
// q: 关键字（匹配 label / key，不区分大小写）；status: "active"|"disabled"；permission: 需包含该权限。
export function listKeys(userId, { limit = 20, offset = 0, q = "", status = "", permission = "" } = {}) {
  let all = [...userMap(userId).values()].map(publicView);
  const needle = (q || "").trim().toLowerCase();
  if (needle) {
    all = all.filter(
      (k) => k.label.toLowerCase().includes(needle) || k.key.toLowerCase().includes(needle)
    );
  }
  if (status) all = all.filter((k) => k.status === status);
  if (permission) all = all.filter((k) => k.permissions.includes(permission));
  const total = all.length;
  const start = Math.max(0, offset);
  const end = start + Math.max(1, limit);
  return { api_keys: all.slice(start, end), total };
}

export function getKey(userId, id) {
  const r = userMap(userId).get(Number(id));
  return r ? publicView(r) : null;
}

export function createKey(userId, { label, permissions, ip_whitelist, key, secretHash }) {
  const id = seq++;
  const now = new Date().toISOString();
  const rec = {
    id,
    user_id: userId,
    label,
    key,
    secretHash,
    permissions,
    ip_whitelist,
    status: "active",
    created_at: now,
    last_used_at: null,
  };
  userMap(userId).set(id, rec);
  return publicView(rec);
}

export function updateStatus(userId, id, status) {
  const r = userMap(userId).get(Number(id));
  if (!r) return null;
  r.status = status;
  return publicView(r);
}

export function deleteKey(userId, id) {
  return userMap(userId).delete(Number(id));
}

// 网关闭源校验：给定公钥 + 私钥 + 调用方 IP，返回公钥视图或 null。
// 用于真实交易/行情接口校验客户端出示的 API Key（secret 以哈希比对，IP 受白名单约束）。
export function verifyApiKey(key, secret, remoteIp) {
  for (const m of apikeyStore.byUser.values()) {
    for (const r of m.values()) {
      if (r.key !== key) continue;
      if (r.status !== "active") return null;
      if (r.secretHash !== hashSecret(secret)) return null;
      if (!ipAllowed(r.ip_whitelist, remoteIp)) return null;
      r.last_used_at = new Date().toISOString();
      return publicView(r);
    }
  }
  return null;
}
