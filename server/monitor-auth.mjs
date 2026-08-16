// 鉴权纯逻辑（供 http 版与 express 版共用，便于单元测试）。
// expectedKey：服务端配置的 MONITOR_API_KEY；providedKey：请求头 X-Api-Key。
// - expectedKey 未设置（null / undefined / 空串）：演示模式，一律放行
// - 否则要求 providedKey 与其严格相等
export function isAuthorized(expectedKey, providedKey) {
  if (!expectedKey) return true; // 演示模式：关闭校验
  return providedKey === expectedKey;
}
