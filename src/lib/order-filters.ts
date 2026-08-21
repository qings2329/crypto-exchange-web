// 历史订单时间筛选纯函数（便于单测）。
export type TimeRange =
  | { kind: "7d" }
  | { kind: "30d" }
  | { kind: "all" }
  | { kind: "custom"; from: number; to: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** ts 是否落在筛选区间内（自定义区间为闭区间）。 */
export function withinRange(ts: number, range: TimeRange, now: number = Date.now()): boolean {
  switch (range.kind) {
    case "all":
      return true;
    case "7d":
      return ts >= now - 7 * DAY_MS;
    case "30d":
      return ts >= now - 30 * DAY_MS;
    case "custom":
      return ts >= range.from && ts <= range.to;
  }
}
