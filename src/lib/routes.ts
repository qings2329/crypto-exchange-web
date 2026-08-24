// 路由元数据：公开页面白名单（无需登录即可浏览）。
// App 路由器与 api/client（401 处理）共用，避免双向依赖。

export const PUBLIC_PAGES = new Set(["/", "/home", "/markets", "/futures", "/otc", "/announcements", "/lending", "/launchpad"]);

/** 当前 hash 路由路径（如 /home、/trade/BTCUSDT）。 */
export function currentPath(): string {
  if (typeof location === "undefined") return "/home";
  return (location.hash.replace(/^#/, "") || "/home").split("?")[0];
}

/** 当前路由是否为公开页（公开页上的 API 401 不应强制跳登录）。 */
export function isPublicRoute(): boolean {
  return PUBLIC_PAGES.has(currentPath());
}

/** 交易大厅路由：模式对应的 hash（spot → #/trade/:SYMBOL，perp → #/futures/:SYMBOL）。 */
export function hallRoute(mode: "spot" | "perp", symbol: string): string {
  return `#/${mode === "perp" ? "futures" : "trade"}/${symbol.toUpperCase()}`;
}
