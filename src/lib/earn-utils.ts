// 理财 / Launchpool 纯函数：收益试算、APY 格式化、项目状态推导。
/** 预估每日收益：amount × apy / 365（保留 8 位小数精度，展示层再格式化） */
export function dailyIncome(amount: number, apy: number): number {
  if (!(amount > 0) || !(apy > 0)) return 0;
  return (amount * apy) / 365;
}

/** 区间预估收益（天） */
export function estIncome(amount: number, apy: number, days: number): number {
  if (!(days > 0)) return 0;
  return dailyIncome(amount, apy) * days;
}

/** APY 展示：0.065 -> "6.50%" */
export function fmtAPY(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

export type LaunchStatus = "upcoming" | "ongoing" | "ended";

/** 项目状态推导：时间窗 [starts_at, ends_at] 与当前时刻比较 */
export function projectStatus(startsAt: string, endsAt: string, now = Date.now()): LaunchStatus {
  if (now < Date.parse(startsAt)) return "upcoming";
  if (now > Date.parse(endsAt)) return "ended";
  return "ongoing";
}

/** 距开始/结束的剩余毫秒（负值表示已过点） */
export function msUntil(iso: string, now = Date.now()): number {
  return Date.parse(iso) - now;
}

/** 倒计时 "2d 05:03:01" / "05:03:01" */
export function fmtDuration(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return d > 0 ? `${d}d ${h}:${m}:${sec}` : `${h}:${m}:${sec}`;
}
